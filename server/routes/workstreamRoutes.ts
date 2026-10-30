import { Router, Request, Response } from 'express';
import express from 'express';
import fs from 'fs';
import path from 'path';
import crypto, { randomUUID } from 'crypto';
import {
  store,
  mapOfferRow,
  type Order,
  type WorkstreamOffer,
  type WorkstreamOfferKind,
  type Message
} from '../store.js';
import { postgresStore } from '../db/postgresStore.js';
import { calculateOrderFees, quoteOrderWithLiveSettings } from '../domains/finance/fees.js';
import { financialRepository } from '../services/financialService.js';
import { siteSettings } from '../../src/server/siteSettings.js';
import { workspaceService } from '../../src/server/workspaceService.js';
import {
  requireAuth,
  requireActiveStatus,
  rateLimit,
  isStaffUser,
  canAccessOrderWorkstream,
  resolveAuthenticatedUserId,
  formatApiError,
  escapeHtml
} from '../middleware/auth.js';
import {
  tryAcquireOrderLock,
  releaseOrderLock,
  recordOrder,
  enrichOrderWithServiceInfo,
  releaseOrderFunds,
  fundOrderEscrowWithEvent,
  topUpOrderEscrowWithEvent,
  syncUserBalances,
  ensureWallet,
  validateOrderReleasePreconditions,
  getActiveEscrowRemaining,
  getReviewWindowDays
} from '../services/orderService.js';
import { broadcastMessage } from '../websocket.js';
import { createNotification } from '../services/notificationService.js';
import {
  recordMessage,
  sanitizeAndCreateMessage,
  emitSystemEvent
} from '../services/messagingService.js';
import { uploadFileToCloudStorage, openCloudFileStream, deleteFileFromCloudStorage } from '../cloudStorage.js';
import {
  WORKSTREAM_UPLOADS_DIR,
  WORKSTREAM_FILE_URL_PREFIX,
  workstreamFileExists,
  WORKSTREAM_MAX_UPLOAD_BYTES,
  WORKSTREAM_INLINE_EXTENSIONS,
  WORKSTREAM_ALLOWED_EXTENSIONS,
  WORKSTREAM_EXTENSION_MIME_MAP,
  normalizeMimeType,
  getCanonicalMimeForExtension,
  resolveAndValidateWorkstreamUploadMime,
  OFFER_LABEL,
  OFFER_PREFIX,
  orderHasEscrow,
  hasPaidInvoiceOrReleasedEscrow,
  findLinkedProposalForOffer,
  viewOffer,
  postOfferMessage,
  offerCaller,
  canAccessWorkstreamFile,
  validateMessageFileInfo,
  validateStoredWorkstreamFiles,
  workstreamFilenameFromUrl,
  generateCollisionSafeOfferNumber
} from '../services/workstreamService.js';

async function saveOfferToDb(offer: WorkstreamOffer, client?: any): Promise<void> {
  await store.saveOffer(offer, client);
}

const router = Router();

// ==========================================
// WORKSPACES API
// ==========================================

router.get('/workspaces', requireAuth, async (req: Request, res: Response) => {
  try {
    const authUserId = (req as any).authenticatedUserId || resolveAuthenticatedUserId(req);
    if (!authUserId) return res.status(401).json({ error: 'Authentication required' });
    const caller = await store.getUser(authUserId);
    const isAdmin = isStaffUser(caller);

    const [workspaces, allOrders] = await Promise.all([
      isAdmin ? workspaceService.listAllAsync() : workspaceService.getWorkspacesForUserAsync(authUserId),
      isAdmin ? store.listOrders() : store.listOrdersForUser(authUserId)
    ]);

    const ordersByWorkspace = new Map<string, Order[]>();
    const ordersById = new Map<string, Order>();
    for (const o of allOrders) {
      const enriched = enrichOrderWithServiceInfo(o, isAdmin);
      ordersById.set(enriched.id, enriched);
      const wsId = enriched.workspaceId;
      if (wsId) {
        const list = ordersByWorkspace.get(wsId) || [];
        list.push(enriched);
        ordersByWorkspace.set(wsId, list);
      }
    }

    const enrichedWorkspaces = workspaces.map(ws => {
      const candidateMap = new Map<string, Order>();
      for (const o of ordersByWorkspace.get(ws.workspaceId) || []) {
        if (o.buyerId === ws.buyerId && o.sellerId === ws.sellerId) {
          candidateMap.set(o.id, o);
        }
      }
      for (const oid of ws.orderIds || []) {
        const o = ordersById.get(oid);
        if (o && (!o.workspaceId || o.workspaceId === ws.workspaceId) && o.buyerId === ws.buyerId && o.sellerId === ws.sellerId) {
          candidateMap.set(o.id, o);
        }
      }

      const orderIdx = new Map<string, number>();
      (ws.orderIds || []).forEach((oid, idx) => orderIdx.set(oid, idx));
      const wsOrders = Array.from(candidateMap.values()).sort((a, b) => {
        const idxA = orderIdx.has(a.id) ? orderIdx.get(a.id)! : Number.MAX_SAFE_INTEGER;
        const idxB = orderIdx.has(b.id) ? orderIdx.get(b.id)! : Number.MAX_SAFE_INTEGER;
        if (idxA !== idxB) return idxA - idxB;
        const tA = new Date((a as any).updatedAt || a.createdAt || 0).getTime();
        const tB = new Date((b as any).updatedAt || b.createdAt || 0).getTime();
        if (tA !== tB) return tA - tB;
        return a.id.localeCompare(b.id);
      });

      const activeOrder = wsOrders.find(o => o.id === ws.activeOrderId) || wsOrders[wsOrders.length - 1] || null;
      return {
        ...ws,
        orders: wsOrders,
        orderIds: wsOrders.map(o => o.id),
        activeOrderId: activeOrder?.id || ws.activeOrderId,
        activeOrder
      };
    });

    res.json(enrichedWorkspaces);
  } catch (err: any) {
    res.status(500).json(formatApiError(err, 'Failed to fetch workspaces'));
  }
});

router.get('/workspaces/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const authUserId = (req as any).authenticatedUserId || resolveAuthenticatedUserId(req);
    if (!authUserId) return res.status(401).json({ error: 'Authentication required' });
    const caller = await store.getUser(authUserId);
    const isAdmin = isStaffUser(caller);

    const ws = await workspaceService.getWorkspaceAsync(req.params.id);
    if (!ws) return res.status(404).json({ error: 'Workspace not found' });
    if (!isAdmin && ws.buyerId !== authUserId && ws.sellerId !== authUserId) {
      return res.status(403).json({ error: 'Forbidden: Only workspace participants may view this workspace.' });
    }

    const rawWsOrders = await store.listOrdersByWorkspaceId(ws.workspaceId);
    const wsOrders = rawWsOrders.map(o => enrichOrderWithServiceInfo(o, isAdmin));
    const activeOrder = wsOrders.find(o => o.id === ws.activeOrderId) || wsOrders[wsOrders.length - 1] || null;

    res.json({
      ...ws,
      orders: wsOrders,
      orderIds: wsOrders.map(o => o.id),
      activeOrderId: activeOrder?.id || ws.activeOrderId,
      activeOrder
    });
  } catch (err: any) {
    res.status(500).json(formatApiError(err, 'Failed to fetch workspace details'));
  }
});

// ==========================================
// FILE UPLOAD AND SERVING
// ==========================================

router.post(
  ['/workstream/upload', '/workstream/uploads'],
  requireAuth,
  rateLimit(10, 60_000),
  express.raw({ type: '*/*', limit: WORKSTREAM_MAX_UPLOAD_BYTES }),
  async (req: Request, res: Response) => {
    try {
      const caller = (req as any).authenticatedUser;

      let bodyObj: Record<string, any> | null = null;
      let isJsonEnvelope = false;
      const headerContentType = typeof req.headers['content-type'] === 'string' ? req.headers['content-type'] : undefined;

      if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
        if (typeof req.body.dataUrl === 'string' || typeof req.body.content === 'string') {
          bodyObj = req.body;
          isJsonEnvelope = true;
        }
      } else if (
        (Buffer.isBuffer(req.body) || typeof req.body === 'string') &&
        normalizeMimeType(headerContentType) === 'application/json'
      ) {
        try {
          const parsed = JSON.parse(Buffer.isBuffer(req.body) ? req.body.toString('utf8') : req.body);
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && (typeof parsed.dataUrl === 'string' || typeof parsed.content === 'string')) {
            bodyObj = parsed;
            isJsonEnvelope = true;
          }
        } catch {
          // Raw body is not a JSON upload envelope; treat as raw file bytes
        }
      }

      const rawName = (req.query.name as string) || (bodyObj?.name as string) || (req.body?.name as string) || 'attachment';
      let decodedName: string;
      try { decodedName = decodeURIComponent(rawName); } catch { decodedName = rawName; }
      const safeBase = path.basename(decodedName).replace(/[^a-zA-Z0-9._-]/g, '_') || 'file';
      const ext = path.extname(safeBase).toLowerCase();
      if (!WORKSTREAM_ALLOWED_EXTENSIONS.has(ext)) {
        return res.status(400).json({ error: `File extension "${ext}" is not permitted.` });
      }

      const nameWithoutExt = path.basename(safeBase, path.extname(safeBase));
      const storedFilename = `${Date.now()}_${randomUUID().slice(0, 8)}_${nameWithoutExt}${ext}`;

      let buffer: Buffer;
      let dataUrlMime: string | undefined;

      if (isJsonEnvelope && bodyObj) {
        const rawData = typeof bodyObj.dataUrl === 'string'
          ? bodyObj.dataUrl
          : (typeof bodyObj.content === 'string' ? bodyObj.content : '');
        if (typeof bodyObj.dataUrl === 'string' && rawData.startsWith('data:')) {
          const dataHeaderMatch = rawData.match(/^data:([^;,]+)(?:;[^,]*)?,/i);
          if (dataHeaderMatch && dataHeaderMatch[1]) {
            dataUrlMime = dataHeaderMatch[1].trim().toLowerCase();
          }
        }
        const b64Idx = rawData.indexOf(';base64,');
        if (b64Idx !== -1) {
          buffer = Buffer.from(rawData.slice(b64Idx + 8), 'base64');
        } else if (rawData.startsWith('data:') && rawData.includes(',')) {
          const commaIdx = rawData.indexOf(',');
          const rawPayload = rawData.slice(commaIdx + 1);
          try {
            buffer = Buffer.from(decodeURIComponent(rawPayload), 'utf8');
          } catch {
            buffer = Buffer.from(rawPayload, 'utf8');
          }
        } else {
          buffer = Buffer.from(rawData);
        }
      } else if (Buffer.isBuffer(req.body)) {
        buffer = req.body;
      } else if (typeof req.body === 'string') {
        buffer = Buffer.from(req.body);
      } else if (req.body && typeof req.body === 'object' && ext === '.json') {
        buffer = Buffer.from(JSON.stringify(req.body, null, 2), 'utf8');
      } else {
        buffer = Buffer.alloc(0);
      }

      if (!buffer || buffer.length === 0) {
        return res.status(400).json({ error: 'No file data received' });
      }
      if (buffer.length > WORKSTREAM_MAX_UPLOAD_BYTES) {
        return res.status(413).json({ error: 'File is too large (25 MB maximum).' });
      }

      const declaredMime =
        (typeof bodyObj?.mimeType === 'string' ? bodyObj.mimeType : undefined) ||
        (typeof bodyObj?.type === 'string' ? bodyObj.type : undefined) ||
        (typeof bodyObj?.contentType === 'string' ? bodyObj.contentType : undefined) ||
        (typeof req.query.mimeType === 'string' ? req.query.mimeType : undefined) ||
        (typeof req.query.type === 'string' ? req.query.type : undefined) ||
        (typeof req.headers['x-file-type'] === 'string' ? req.headers['x-file-type'] : undefined) ||
        (typeof req.headers['x-mime-type'] === 'string' ? req.headers['x-mime-type'] : undefined);

      const mimeValidation = resolveAndValidateWorkstreamUploadMime({
        ext,
        buffer,
        isJsonEnvelope,
        dataUrlMime,
        declaredMime,
        headerContentType
      });
      if (!mimeValidation.ok) {
        return res.status(400).json({ error: (mimeValidation as { ok: false; error: string }).error });
      }
      const mimeType = mimeValidation.mimeType;

      const orderId = typeof req.query.orderId === 'string' ? req.query.orderId : (typeof bodyObj?.orderId === 'string' ? bodyObj.orderId : (typeof req.body?.orderId === 'string' ? req.body.orderId : (req.headers['x-order-id'] as string || undefined)));
      const workspaceId = typeof req.query.workspaceId === 'string' ? req.query.workspaceId : (typeof bodyObj?.workspaceId === 'string' ? bodyObj.workspaceId : (typeof req.body?.workspaceId === 'string' ? req.body.workspaceId : (req.headers['x-workspace-id'] as string || undefined)));

      if (!orderId && !workspaceId) {
        return res.status(400).json({ error: 'Context required: must provide orderId or workspaceId' });
      }

      let targetOrder: Order | null = null;
      if (orderId) {
        targetOrder = (await store.getOrderById(orderId)) || null;
        if (!targetOrder && !workspaceId) {
          targetOrder = (await store.resolveWorkspaceActiveOrder(orderId)) || null;
        }
        if (!targetOrder) {
          return res.status(404).json({ error: 'Associated order not found' });
        }
        const isParticipant = targetOrder.buyerId === caller.id || targetOrder.sellerId === caller.id || (targetOrder as any).clientId === caller.id || (targetOrder as any).freelancerId === caller.id;
        if (!isStaffUser(caller) && !isParticipant) {
          return res.status(403).json({ error: 'Forbidden: You are not a participant of the specified order' });
        }
      }

      let resolvedWorkspaceId: string | undefined = workspaceId || targetOrder?.workspaceId || undefined;

      if (workspaceId) {
        const wsRes = await postgresStore.getPool().query('SELECT workspace_id, buyer_id, seller_id, order_ids FROM workspaces WHERE workspace_id = $1', [workspaceId]);
        if (wsRes.rows.length === 0) {
          if (targetOrder && (workspaceId === `ws-${targetOrder.id}` || workspaceId === targetOrder.workspaceId)) {
            resolvedWorkspaceId = workspaceId;
          } else if (targetOrder) {
            return res.status(403).json({ error: 'Forbidden: Mismatched orderId and workspaceId context.' });
          } else if (workspaceId.startsWith('ws-')) {
            const maybeOrder = await store.getOrderById(workspaceId.slice(3));
            if (maybeOrder) {
              const isParticipant = maybeOrder.buyerId === caller.id || maybeOrder.sellerId === caller.id || (maybeOrder as any).clientId === caller.id || (maybeOrder as any).freelancerId === caller.id;
              if (!isStaffUser(caller) && !isParticipant) {
                return res.status(403).json({ error: 'Forbidden: You are not a participant of the specified workspace' });
              }
              resolvedWorkspaceId = maybeOrder.workspaceId || workspaceId;
            } else {
              return res.status(404).json({ error: 'Associated workspace not found' });
            }
          } else {
            return res.status(404).json({ error: 'Associated workspace not found' });
          }
        } else {
          const wsRow = wsRes.rows[0];
          if (!isStaffUser(caller) && wsRow.buyer_id !== caller.id && wsRow.seller_id !== caller.id) {
            return res.status(403).json({ error: 'Forbidden: You are not a participant of the specified workspace' });
          }
          if (targetOrder) {
            const wsOrderIds = Array.isArray(wsRow.order_ids) ? wsRow.order_ids.map(String) : [];
            const orderBelongsToWorkspace =
              (targetOrder.workspaceId === workspaceId || (!targetOrder.workspaceId && wsOrderIds.includes(targetOrder.id))) &&
              targetOrder.buyerId === wsRow.buyer_id &&
              targetOrder.sellerId === wsRow.seller_id;
            if (!orderBelongsToWorkspace) {
              return res.status(403).json({ error: 'Forbidden: Mismatched orderId and workspaceId context.' });
            }
          }
          resolvedWorkspaceId = wsRow.workspace_id;
        }
      }

      const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
      await uploadFileToCloudStorage(storedFilename, buffer, mimeType);
      const fileUrl = `${WORKSTREAM_FILE_URL_PREFIX}${storedFilename}`;

      try {
        await store.saveUploadRecord(storedFilename, {
          ownerId: caller.id,
          originalName: safeBase,
          mime: mimeType,
          size: buffer.length,
          sha256,
          createdAt: new Date().toISOString(),
          orderId: targetOrder?.id || orderId || undefined,
          workspaceId: resolvedWorkspaceId || undefined
        });
      } catch (recErr) {
        try { await deleteFileFromCloudStorage(storedFilename); } catch {}
        throw recErr;
      }

      const bytes = buffer.length;
      const sizeStr = bytes > 1024 * 1024
        ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
        : `${Math.max(1, Math.round(bytes / 1024))} KB`;

      const filePayload = {
        name: safeBase,
        size: sizeStr,
        url: fileUrl,
        type: mimeType,
        orderId: targetOrder?.id || orderId || undefined,
        workspaceId: resolvedWorkspaceId || undefined
      };
      res.json({
        ...filePayload,
        file: filePayload
      });
    } catch (err: any) {
      console.error('Workstream file upload error:', err);
      res.status(500).json(formatApiError(err, 'Failed to save uploaded file'));
    }
  }
);

router.get(['/workstream/files/:filename', '/uploads/workstream/:filename'], requireAuth, async (req: Request, res: Response) => {
  const filename = path.basename(req.params.filename);
  const filePath = path.join(WORKSTREAM_UPLOADS_DIR, filename);
  const localExists = fs.existsSync(filePath);
  const dbRec = await store.getUploadRecord(filename);
  if (!localExists && !dbRec) {
    return res.status(404).json({ error: 'File not found' });
  }
  const context = {
    workspaceId: typeof req.query.workspaceId === 'string' ? req.query.workspaceId : undefined,
    orderId: typeof req.query.orderId === 'string' ? req.query.orderId : undefined
  };
  if (!(await canAccessWorkstreamFile((req as any).authenticatedUser, filename, context))) {
    return res.status(403).json({ error: 'Forbidden: You do not have access to this file.' });
  }

  const parts = filename.split('_');
  const originalName = parts.length > 2 ? parts.slice(2).join('_') : filename;
  const ext = path.extname(filename).toLowerCase();
  const storedMime = normalizeMimeType(dbRec?.mime);
  const extSpec = WORKSTREAM_EXTENSION_MIME_MAP[ext];
  const resolvedMime = storedMime && extSpec?.allowed.includes(storedMime) ? extSpec.canonical : getCanonicalMimeForExtension(ext);

  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Type', resolvedMime);

  const isPotentiallyActive = ['.html', '.htm', '.xhtml', '.svg', '.xml', '.js', '.mjs'].includes(ext);
  if (isPotentiallyActive) {
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox");
  }

  const forceDownload = req.query.download === '1' || !WORKSTREAM_INLINE_EXTENSIONS.has(ext) || ext === '.html' || ext === '.htm' || ext === '.svg';
  if (!localExists) {
    if (forceDownload) res.attachment(originalName);
    const stream = openCloudFileStream(filename);
    stream.on('error', () => { if (!res.headersSent) res.status(404).json({ error: 'File not found' }); else res.end(); });
    return void stream.pipe(res);
  }

  if (forceDownload) {
    return res.download(filePath, originalName);
  }

  res.sendFile(filePath, { headers: { 'Content-Type': resolvedMime } });
});

router.delete(
  ['/workstream/files/:filename', '/workstream/uploads/:filename', '/uploads/workstream/:filename', '/workstream/uploads'],
  requireAuth,
  (_req: Request, res: Response) => {
    return res.status(403).json({ error: 'Workstream uploads are permanent and cannot be deleted.' });
  }
);

// ==========================================
// MESSAGES
// ==========================================

router.delete(
  ['/messages/:id', '/workstream/messages/:id', '/messages'],
  requireAuth,
  (_req: Request, res: Response) => {
    return res.status(403).json({ error: 'Workstream messages are permanent and cannot be deleted.' });
  }
);

router.get(['/messages/:id', '/workspaces/:id/messages', '/workstream/:id/messages'], requireAuth, async (req: Request, res: Response) => {
  try {
    const paramId = req.params.id;
    const authUser = (req as any).authenticatedUser;
    const isAdmin = isStaffUser(authUser);

    let workspace = await workspaceService.getWorkspaceAsync(paramId);
    let order: Order | null = null;
    if (!workspace) {
      order = (await store.getOrder(paramId)) || null;
      if (order?.workspaceId) {
        workspace = await workspaceService.getWorkspaceAsync(order.workspaceId);
      }
    }

    if (!workspace && !order) return res.status(404).json({ error: 'Workspace or Order not found' });

    const buyerId = workspace?.buyerId || order?.buyerId;
    const sellerId = workspace?.sellerId || order?.sellerId;
    if (!isAdmin && authUser.id !== buyerId && authUser.id !== sellerId) {
      return res.status(403).json({ error: 'Forbidden: You are not a participant of this Workstream.' });
    }

    const orderOnly = req.query.orderOnly === 'true' || req.query.scope === 'order';
    let msgs: Message[] = [];
    if (!orderOnly && workspace) {
      msgs = await store.listMessagesForWorkspace(workspace.workspaceId);
    } else if (order) {
      msgs = await store.listMessages(order.id);
    } else if (workspace) {
      msgs = await store.listMessagesForWorkspace(workspace.workspaceId);
    }

    const before = typeof req.query.before === 'string' ? req.query.before : undefined;
    const limit = req.query.limit ? Math.min(200, Math.max(1, Number(req.query.limit))) : undefined;
    const offset = req.query.offset ? Math.max(0, Number(req.query.offset)) : undefined;

    if (before) {
      const beforeTime = new Date(before).getTime();
      if (!isNaN(beforeTime)) {
        msgs = msgs.filter(m => new Date(m.timestamp).getTime() < beforeTime);
      }
    }
    if (offset !== undefined) {
      msgs = msgs.slice(offset);
    }
    if (limit !== undefined) {
      msgs = msgs.slice(-limit);
    }

    res.json(msgs);
  } catch (err: any) {
    res.status(500).json(formatApiError(err));
  }
});

router.post('/messages', requireAuth, rateLimit(120, 60_000), async (req: Request, res: Response) => {
  try {
    const authUserId = (req as any).authenticatedUserId;
    const caller = await store.getUser(authUserId);
    if (!caller) return res.status(401).json({ error: 'User not found' });

    const orderId = req.body.orderId;
    const workspaceId = req.body.workspaceId;
    if (!orderId && !workspaceId) return res.status(400).json({ error: 'Order ID or Workspace ID is required' });

    let order = orderId ? await store.getOrder(orderId) : null;
    let workspace = workspaceId ? await workspaceService.getWorkspaceAsync(workspaceId) : (order?.workspaceId ? await workspaceService.getWorkspaceAsync(order.workspaceId) : null);
    if (orderId && !order) return res.status(404).json({ error: 'Order not found' });
    if (workspaceId && !workspace) return res.status(404).json({ error: 'Workspace not found' });
    if (!order && !workspace) return res.status(404).json({ error: 'Order or Workspace not found' });

    if (order && workspace) {
      const orderBelongsToWs = order.workspaceId
        ? order.workspaceId === workspace.workspaceId
        : (Array.isArray(workspace.orderIds) && workspace.orderIds.includes(order.id));
      const partiesMatch = order.buyerId === workspace.buyerId && order.sellerId === workspace.sellerId;
      if (!orderBelongsToWs || !partiesMatch) {
        return res.status(400).json({ error: 'Order does not belong to the specified Workspace' });
      }
    }

    const buyerId = order?.buyerId || workspace?.buyerId;
    const sellerId = order?.sellerId || workspace?.sellerId;

    if (caller.status === 'suspended' && !(orderId && orderId.startsWith('support_admin_'))) {
      return res.status(403).json({ error: 'Action forbidden: Your account is suspended. You can only message Support.' });
    }

    if (!isStaffUser(caller) && caller.id !== buyerId && caller.id !== sellerId) {
      return res.status(403).json({ error: 'Forbidden: You are not a participant of this Workstream.' });
    }

    if (order && order.isMuted && !isStaffUser(caller)) {
      return res.status(403).json({ error: 'Chat is currently paused.' });
    }

    const fileCheck = await validateMessageFileInfo(req.body.fileInfo, caller, order || undefined);
    if (!fileCheck.ok) return res.status(400).json({ error: (fileCheck as any).error });

    const clientMessageId = typeof req.body.clientMessageId === 'string' ? req.body.clientMessageId : undefined;
    const queryTargetId = order?.id || workspace?.workspaceId;
    if (clientMessageId && (order?.id || workspace?.workspaceId)) {
      const existingRes = await postgresStore.getPool().query(
        "SELECT * FROM messages WHERE (order_id = $1 OR workspace_id = $2) AND sender_id = $3 AND metadata->>'clientMessageId' = $4 LIMIT 1",
        [order?.id || null, workspace?.workspaceId || null, caller.id, clientMessageId]
      );
      if (existingRes.rows.length > 0) {
        const r = existingRes.rows[0];
        return res.json({
          success: true,
          message: {
            id: r.id,
            orderId: r.order_id,
            workspaceId: r.workspace_id,
            senderId: r.sender_id,
            senderName: r.sender_name,
            text: r.text,
            timestamp: r.timestamp,
            type: r.type,
            fileInfo: typeof r.file_info === 'string' ? JSON.parse(r.file_info) : r.file_info,
            metadata: typeof r.metadata === 'string' ? JSON.parse(r.metadata) : r.metadata
          },
          deduplicated: true
        });
      }
    }

    let newMsg: Message;
    if (order) {
      newMsg = sanitizeAndCreateMessage(caller, order, req.body, fileCheck);
      if (workspace?.workspaceId) {
        newMsg.workspaceId = workspace.workspaceId;
      }
    } else {
      newMsg = {
        id: 'msg_' + randomUUID().slice(0, 12),
        workspaceId: workspace!.workspaceId,
        senderId: caller.id,
        senderName: caller.name,
        text: escapeHtml(String(req.body.text || '')).slice(0, 10000),
        timestamp: new Date().toISOString(),
        type: (req.body.type as any) || 'message',
        fileInfo: fileCheck.fileInfo || undefined,
        metadata: {
          ...(req.body.metadata || {}),
          ...(clientMessageId ? { clientMessageId } : {}),
          workspaceId: workspace!.workspaceId
        }
      };
    }

    if (newMsg.fileInfo?.url) {
      const fn = workstreamFilenameFromUrl(newMsg.fileInfo.url);
      if (fn) {
        await postgresStore.getPool().query(
          "UPDATE uploads SET order_id = COALESCE(order_id, $1), workspace_id = COALESCE(workspace_id, $3) WHERE filename = $2",
          [order?.id || null, fn, workspace?.workspaceId || order?.workspaceId || null]
        );
      }
    }

    try {
      await recordMessage(newMsg);
    } catch (msgErr: any) {
      if (clientMessageId && queryTargetId) {
        const existingMsg = await store.getMessageByClientMsgId(queryTargetId, caller.id, clientMessageId);
        if (existingMsg) {
          return res.json({ success: true, message: existingMsg, deduplicated: true });
        }
      }
      throw msgErr;
    }

    const otherUserId = buyerId === caller.id ? sellerId : buyerId;
    if (otherUserId) {
      createNotification({
        userId: otherUserId,
        type: 'message',
        title: 'New Message',
        message: `${caller.name} sent a message regarding "${order?.title || (workspace as any)?.title || 'WorkStream'}".`,
        link: order ? `/workstream/${order.id}` : `/workspace/${workspace?.workspaceId}`,
        dedupKey: `msg_${newMsg.id}`,
        actorId: caller.id
      });
    }

    res.json(newMsg);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to send message' });
  }
});

router.post('/orders/:id/message', requireAuth, rateLimit(120, 60_000), async (req: Request, res: Response) => {
  try {
    const order = await store.getOrder(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const userId = (req as any).authenticatedUserId;
    const user = await store.getUser(userId);
    if (!user) return res.status(401).json({ error: 'User not found' });

    if (user.status === 'suspended' && !order.id.startsWith('support_admin_')) {
      return res.status(403).json({ error: 'Action forbidden: Your account is suspended. You can only message Support.' });
    }

    if (!canAccessOrderWorkstream(user, order)) {
      return res.status(403).json({ error: 'Forbidden: You are not a participant of this Workstream.' });
    }
    if (order.isMuted && !isStaffUser(user)) {
      return res.status(403).json({ error: 'Chat is currently paused.' });
    }
    if (req.body.workspaceId) {
      if (order.workspaceId && req.body.workspaceId !== order.workspaceId) {
        return res.status(400).json({ error: 'Order does not belong to the specified Workspace' });
      }
      const ws = await workspaceService.getWorkspaceAsync(req.body.workspaceId);
      if (!ws) {
        return res.status(400).json({ error: 'Order does not belong to the specified Workspace' });
      }
      const orderBelongsToWs = order.workspaceId
        ? order.workspaceId === ws.workspaceId
        : (Array.isArray(ws.orderIds) && ws.orderIds.includes(order.id));
      const partiesMatch = order.buyerId === ws.buyerId && order.sellerId === ws.sellerId;
      if (!orderBelongsToWs || !partiesMatch) {
        return res.status(400).json({ error: 'Order does not belong to the specified Workspace' });
      }
    }

    const fileCheck = await validateMessageFileInfo(req.body.fileInfo, user, order);
    if (!fileCheck.ok) return res.status(400).json({ error: (fileCheck as any).error });

    const clientMessageId = typeof req.body.clientMessageId === 'string' ? req.body.clientMessageId : undefined;
    if (clientMessageId) {
      const pool = postgresStore.getPool();
      const existingRes = await pool.query(
        "SELECT * FROM messages WHERE order_id = $1 AND sender_id = $2 AND metadata->>'clientMessageId' = $3 LIMIT 1",
        [order.id, user.id, clientMessageId]
      );
      if (existingRes.rows.length > 0) {
        const r = existingRes.rows[0];
        return res.json({
          success: true,
          message: {
            id: r.id,
            orderId: r.order_id,
            senderId: r.sender_id,
            senderName: r.sender_name,
            text: r.text,
            timestamp: r.timestamp,
            type: r.type,
            fileInfo: typeof r.file_info === 'string' ? JSON.parse(r.file_info) : r.file_info,
            metadata: typeof r.metadata === 'string' ? JSON.parse(r.metadata) : r.metadata
          },
          deduplicated: true
        });
      }
    }

    const newMsg = sanitizeAndCreateMessage(user, order, req.body, fileCheck);
    if (order.workspaceId) {
      newMsg.workspaceId = order.workspaceId;
    }
    if (newMsg.fileInfo?.url) {
      const fn = workstreamFilenameFromUrl(newMsg.fileInfo.url);
      if (fn) {
        await postgresStore.getPool().query(
          "UPDATE uploads SET order_id = COALESCE(order_id, $1), workspace_id = COALESCE(workspace_id, $3) WHERE filename = $2",
          [order.id, fn, order.workspaceId || null]
        );
      }
    }
    try {
      await recordMessage(newMsg);
    } catch (msgErr: any) {
      if (clientMessageId) {
        const existingMsg = await store.getMessageByClientMsgId(order.id, user.id, clientMessageId);
        if (existingMsg) {
          return res.json({ success: true, message: existingMsg, deduplicated: true });
        }
      }
      throw msgErr;
    }

    res.json({ success: true, message: newMsg });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to send message' });
  }
});

// ==========================================
// WORKSTREAM OFFERS (PROPOSALS, INVOICES, DEPOSITS)
// ==========================================

router.get('/offers', requireAuth, async (req: Request, res: Response) => {
  try {
    const authUserId = (req as any).authenticatedUserId;
    const pool = postgresStore.getPool();
    const result = await pool.query(
      `SELECT DISTINCT wo.* FROM workstream_offers wo
       JOIN orders o ON (wo.order_id = o.id OR wo.metadata->>'originOrderId' = o.id OR wo.metadata->>'resultingOrderId' = o.id)
       WHERE o.buyer_id = $1 OR o.seller_id = $1
       ORDER BY wo.created_at DESC`,
      [authUserId]
    );
    const offers = result.rows.map(mapOfferRow);
    const viewed = await Promise.all(offers.map(viewOffer));
    res.json(viewed);
  } catch (err: any) {
    res.status(500).json(formatApiError(err));
  }
});

router.get('/orders/:id/offers', requireAuth, async (req: Request, res: Response) => {
  try {
    const caller = await offerCaller(req);
    let order = await store.getOrder(req.params.id);
    let workspace: any = null;
    let isWorkspaceOnly = false;

    if (!order) {
      workspace = await workspaceService.getWorkspaceAsync(req.params.id);
      if (!workspace || !(workspace.metadata as any)?.isInquiry) {
        return res.status(404).json({ error: 'Order or Inquiry not found' });
      }
      isWorkspaceOnly = true;
    }

    if (isWorkspaceOnly) {
      if (caller.id !== workspace.buyerId && caller.id !== workspace.sellerId) {
        return res.status(403).json({ error: 'Forbidden' });
      }
    } else if (!canAccessOrderWorkstream(caller, order!)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const orderOnly = req.query.orderOnly === 'true' || req.query.scope === 'order';
    let orderOffers: WorkstreamOffer[] = [];
    if (isWorkspaceOnly) {
      orderOffers = await store.listOffersForWorkspace(workspace.workspaceId);
    } else {
      orderOffers = (!orderOnly && order!.workspaceId)
        ? await store.listOffersForWorkspace(order!.workspaceId, order!.id)
        : await store.listOffersForOrder(order!.id);
    }

    const offers = await Promise.all(orderOffers.map(viewOffer));
    
    let esc: any = null;
    let escrowFunded = false;
    let escrowRemaining = 0;
    let totalReleased = 0;
    let hasPaidInvoice = false;

    if (!isWorkspaceOnly) {
      esc = await financialRepository.getEscrow(order!.id);
      escrowFunded = await orderHasEscrow(order!.id);
      escrowRemaining = await getActiveEscrowRemaining(order!);
      totalReleased = esc ? esc.releasedGross : (order!.status === 'completed' ? Number(order!.amount || 0) : 0);
      hasPaidInvoice = await hasPaidInvoiceOrReleasedEscrow(order!);
    }

    res.json({
      offers,
      currencySymbol: siteSettings.getFlattenedSettings().currencySymbol || '$',
      escrowFunded,
      escrowRemaining,
      totalReleased,
      hasPaidInvoice
    });
  } catch (err: any) {
    res.status(500).json(formatApiError(err));
  }
});

router.post('/orders/:id/offers', requireAuth, requireActiveStatus, rateLimit(20, 60_000), async (req: Request, res: Response) => {
  try {
    const caller = await offerCaller(req);
    if (!caller || (caller.status !== 'active' && caller.status !== 'restricted')) return res.status(403).json({ error: 'Account is not active' });
    
    let order = await store.getOrder(req.params.id);
    let workspace: any = null;
    let isWorkspaceOnly = false;

    if (!order) {
      workspace = await workspaceService.getWorkspaceAsync(req.params.id);
      if (!workspace || !(workspace.metadata as any)?.isInquiry) {
        return res.status(404).json({ error: 'Order or Inquiry not found' });
      }
      isWorkspaceOnly = true;
    }

    if (isWorkspaceOnly) {
        if (caller.id !== workspace.buyerId && caller.id !== workspace.sellerId) {
            return res.status(403).json({ error: 'Forbidden' });
        }
    } else if (order) {
        if (caller.id !== order.sellerId) return res.status(403).json({ error: 'Only the seller of this workstream can send this.' });
    } else {
        return res.status(404).json({ error: 'Order not found' });
    }

    const kind = req.body?.kind as WorkstreamOfferKind;
    if (!['proposal', 'invoice', 'deposit'].includes(kind)) return res.status(400).json({ error: 'Invalid type.' });
    if (!isWorkspaceOnly) {
        if ((order!.status === 'cancelled' || (order!.status as string) === 'refunded') && kind === 'invoice') {
          return res.status(409).json({ error: 'Cannot send a final invoice on a cancelled or refunded order. Send a proposal or deposit to start a follow-on order.' });
        }
    }

    const amount = Math.round(Number(req.body?.amount) * 100) / 100;
    const minAmount = Number(siteSettings.getFlattenedSettings().minOrderAmount) || 0;
    if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: 'Enter a valid amount.' });
    if (amount > 100000) return res.status(400).json({ error: 'Amount is too large.' });
    if (amount < minAmount) return res.status(400).json({ error: `Minimum amount is ${siteSettings.getFlattenedSettings().currencySymbol || '$'}${minAmount}.` });

    const rawTitle = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
    const title = kind === 'deposit' ? (rawTitle || 'Escrow deposit') : rawTitle;
    if (title.length < 3 || title.length > 120) return res.status(400).json({ error: 'Title must be 3-120 characters.' });
    const note = typeof req.body?.note === 'string' ? req.body.note.trim().slice(0, 1000) : '';
    const rawRef = typeof req.body?.reference === 'string' ? req.body.reference.trim().slice(0, 2000) : '';
    let deliveryDays: number | undefined;
    if (kind === 'proposal') {
      deliveryDays = Math.round(Number(req.body?.deliveryDays));
      if (!Number.isFinite(deliveryDays) || deliveryDays < 1 || deliveryDays > 365) return res.status(400).json({ error: 'Delivery time must be 1-365 days.' });
    }

    let funded = false;
    let activeEscrow = 0;
    let hasPaidFirstInvoice = false;
    let existingOffers: WorkstreamOffer[] = [];

    if (!isWorkspaceOnly) {
      funded = await orderHasEscrow(order!.id);
      activeEscrow = await getActiveEscrowRemaining(order!);
      hasPaidFirstInvoice = await hasPaidInvoiceOrReleasedEscrow(order!);
      existingOffers = (await store.listOffersForOrder(order!.id)).filter(o => o.orderId === order!.id);
    } else {
      if (kind !== 'proposal') {
        return res.status(400).json({ error: 'Inquiries only support proposal offers.' });
      }
      existingOffers = await store.listOffersForWorkspace(workspace.workspaceId);
    }

    if (kind === 'invoice') {
      if (!funded || activeEscrow <= 0) return res.status(400).json({ error: 'Final invoices are for completed work on a funded workstream.' });
      if (activeEscrow > 0 && amount < activeEscrow) {
        return res.status(400).json({ error: `Final invoice amount cannot be less than the funded escrow price ($${activeEscrow}).` });
      }
      if (existingOffers.filter(o => o.kind === 'invoice' && o.status === 'pending').length >= 1) {
        return res.status(409).json({ error: 'A final invoice is already pending for this workstream.' });
      }
    } else if (kind === 'proposal' || kind === 'deposit') {
      if (existingOffers.some(o => o.kind === 'invoice' && o.status === 'pending')) {
        return res.status(409).json({ error: 'A seller must not raise a new proposal when a previous proposal/order has a pending invoice.' });
      }
      if (!isWorkspaceOnly && (order?.orderType === 'gig' || (order?.gigId && !order?.projectId)) && activeEscrow > 0 && !hasPaidFirstInvoice) {
        return res.status(409).json({ error: 'This Gig is already funded in escrow. Please raise and get your first invoice paid before sending a follow-on proposal.' });
      }
    }

    let uploadedFiles: Array<{ id: string; name: string; size: string; url: string; uploadedAt: string; type: string }> = [];
    if (kind === 'invoice' && Array.isArray(req.body?.files) && req.body.files.length > 0) {
      const validation = await validateStoredWorkstreamFiles(req.body.files, caller, isWorkspaceOnly ? workspace.workspaceId : order!.id);
      if (!validation.ok) {
        return res.status((validation as any).status || 400).json({ error: (validation as any).error });
      }
      uploadedFiles = validation.files.map((f: any, idx: number) => ({
        id: 'deliv_' + Date.now() + '_' + idx + '_' + randomUUID().slice(0, 6),
        name: f.name,
        size: f.size,
        url: f.url,
        uploadedAt: new Date().toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }),
        type: 'deliverable'
      }));
    }

    const responseDeadline = (!isWorkspaceOnly && order!.orderType === 'project' && kind === 'invoice')
      ? new Date(Date.now() + 7 * 86400000).toISOString()
      : undefined;

    const offer: WorkstreamOffer = {
      id: 'off_' + randomUUID().slice(0, 12),
      number: generateCollisionSafeOfferNumber(kind),
      orderId: isWorkspaceOnly ? undefined : order!.id,
      workspaceId: isWorkspaceOnly ? workspace.workspaceId : order!.workspaceId,
      kind,
      title,
      amount,
      deliveryDays,
      note: note || undefined,
      files: uploadedFiles.length > 0 ? uploadedFiles : undefined,
      reference: rawRef || undefined,
      responseDeadline,
      status: 'pending',
      createdBy: caller.id,
      createdAt: new Date().toISOString(),
      metadata: {
        ...(isWorkspaceOnly ? {} : { originOrderId: order!.id }),
        ...(isWorkspaceOnly ? { workspaceId: workspace.workspaceId } : (order!.workspaceId ? { workspaceId: order!.workspaceId } : {}))
      }
    };

    if (isWorkspaceOnly) {
      await saveOfferToDb(offer);
    } else {
      const lockedOrderId = order!.id;
      if (!tryAcquireOrderLock(lockedOrderId, res)) return;
      try {
        await postgresStore.executeInTransaction(async (client) => {
          const lockedOrderRes = await client.query('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [lockedOrderId]);
          if (lockedOrderRes.rows.length === 0) {
            const err: any = new Error('Order not found');
            err.status = 404;
            throw err;
          }
          const lockedOrder = (store as any).mapOrderRow
            ? (store as any).mapOrderRow(lockedOrderRes.rows[0])
            : await store.getOrder(lockedOrderId, client);
          if (!lockedOrder) {
            const err: any = new Error('Order not found');
            err.status = 404;
            throw err;
          }
          order = lockedOrder;
          const activeOrder: Order = lockedOrder;

          if (caller.id !== activeOrder.sellerId) {
            const err: any = new Error('Only the seller of this workstream can send this.');
            err.status = 403;
            throw err;
          }
          if ((activeOrder.status === 'cancelled' || (activeOrder.status as string) === 'refunded') && kind === 'invoice') {
            const err: any = new Error('Cannot send a final invoice on a cancelled or refunded order. Send a proposal or deposit to start a follow-on order.');
            err.status = 409;
            throw err;
          }

          const escRow = await financialRepository.getEscrow(activeOrder.id, client);
          const txFunded = Boolean(escRow && (Number((escRow as any).funded || 0) > 0 || Number(escRow.remaining || 0) > 0 || (escRow as any).status === 'funded' || escRow.status === 'released'));
          const txActiveEscrow = escRow ? Number(escRow.remaining || 0) : 0;

          const lockedOffersRes = await client.query(
            'SELECT * FROM workstream_offers WHERE order_id = $1 FOR UPDATE',
            [activeOrder.id]
          );
          const txExistingOffers = lockedOffersRes.rows.map(mapOfferRow).filter(o => o.orderId === activeOrder.id);
          const txHasPaidFirstInvoice = Boolean(
            (escRow && (Number((escRow as any).released || 0) > 0 || escRow.status === 'released')) ||
            txExistingOffers.some(o => o.kind === 'invoice' && (o.status === 'paid' || o.status === 'accepted'))
          );

          if (kind === 'invoice') {
            if (!txFunded || txActiveEscrow <= 0) {
              const err: any = new Error('Final invoices are for completed work on a funded workstream.');
              err.status = 400;
              throw err;
            }
            if (txActiveEscrow > 0 && amount < txActiveEscrow) {
              const err: any = new Error(`Final invoice amount cannot be less than the funded escrow price ($${txActiveEscrow}).`);
              err.status = 400;
              throw err;
            }
            if (txExistingOffers.some(o => o.kind === 'invoice' && o.status === 'pending')) {
              const err: any = new Error('A final invoice is already pending for this workstream.');
              err.status = 409;
              throw err;
            }
          } else if (kind === 'proposal' || kind === 'deposit') {
            if (txExistingOffers.some(o => o.kind === 'invoice' && o.status === 'pending')) {
              const err: any = new Error('A seller must not raise a new proposal when a previous proposal/order has a pending invoice.');
              err.status = 409;
              throw err;
            }
            if ((activeOrder.orderType === 'gig' || (activeOrder.gigId && !activeOrder.projectId)) && txActiveEscrow > 0 && !txHasPaidFirstInvoice) {
              const err: any = new Error('This Gig is already funded in escrow. Please raise and get your first invoice paid before sending a follow-on proposal.');
              err.status = 409;
              throw err;
            }
          }

          const isGigOrder =
            activeOrder.orderType !== 'project' &&
            !activeOrder.projectId &&
            (activeOrder.orderType === 'gig' || Boolean(activeOrder.gigId) || Boolean(activeOrder.gigOrderId));
          const deliverWorkRequested = req.body?.deliverWork !== false;
          const isWorkableStatus = [
            'funded_in_escrow',
            'in_progress',
            'accepted',
            'revision',
            'draft_review',
            'work_in_progress',
            'late',
            'delivered'
          ].includes(activeOrder.status);

          if (kind === 'invoice' && !isWorkableStatus) {
            const err: any = new Error(`Cannot submit a final invoice for an order in "${activeOrder.status}" status.`);
            err.status = 409;
            throw err;
          }

          const shouldTransitionOrderToDelivered = kind === 'invoice' && deliverWorkRequested && isWorkableStatus;

          if (shouldTransitionOrderToDelivered) {
            if (!Array.isArray(activeOrder.deliverableFiles)) activeOrder.deliverableFiles = [];
            if (!Array.isArray(activeOrder.deliveryHistory)) activeOrder.deliveryHistory = [];
            if (uploadedFiles.length > 0) activeOrder.deliverableFiles.push(...uploadedFiles);
            const maxExistingVersion = activeOrder.deliveryHistory.reduce(
              (max: number, entry: any) => Math.max(max, Number(entry?.version) || 0),
              0
            );
            const version = Math.max(activeOrder.deliveryHistory.length, maxExistingVersion) + 1;
            const sanitizedNotes = note ? escapeHtml(note) : escapeHtml(title);
            activeOrder.deliveryNotes = sanitizedNotes;
            if (rawRef) activeOrder.deliveryReference = rawRef;
            const deliveredAt = new Date().toISOString();
            const deliveryEntry: any = {
              version,
              notes: sanitizedNotes,
              reference: rawRef || undefined,
              files: uploadedFiles,
              deliveredAt,
              offerId: offer.id,
              ...(responseDeadline ? { responseDeadline } : {})
            };
            activeOrder.deliveryHistory.push(deliveryEntry);
            offer.metadata = {
              ...(offer.metadata || {}),
              deliveryVersion: version
            };
            activeOrder.status = 'delivered';
            if (isGigOrder) {
              const gigReviewDays = getReviewWindowDays();
              activeOrder.reviewWindowDays = gigReviewDays;
              activeOrder.reviewWindowExpiresAt = new Date(new Date(deliveredAt).getTime() + gigReviewDays * 24 * 60 * 60 * 1000).toISOString();
            } else if (responseDeadline) {
              activeOrder.responseDeadline = responseDeadline;
            }
            if (Array.isArray(activeOrder.revisions)) {
              for (const rev of activeOrder.revisions) {
                if (rev.status === 'requested') rev.status = 'resolved';
              }
            }
            await saveOfferToDb(offer, client);
            await store.saveOrder(activeOrder, client);
          } else {
            await saveOfferToDb(offer, client);
          }
        });
      } finally {
        releaseOrderLock(lockedOrderId);
      }
    }

    const targetUserId = isWorkspaceOnly ? workspace.buyerId : order!.buyerId;
    const workspaceId = isWorkspaceOnly ? workspace.workspaceId : order!.workspaceId;

    const isCustomOrderStream = isWorkspaceOnly || Boolean(order?.metadata?.isInquiry) || Boolean((order as any)?.metadata?.isCustomOrder);

    if (kind === 'invoice') {
      const reviewDays = !isWorkspaceOnly && order!.orderType === 'project'
        ? 7
        : (typeof order?.reviewWindowDays === 'number' && order.reviewWindowDays > 0 ? order.reviewWindowDays : getReviewWindowDays());
      createNotification({
        userId: targetUserId,
        type: 'invoice_received',
        title: isCustomOrderStream ? 'Custom Order Invoice received' : 'Invoice received',
        message: isCustomOrderStream
          ? `You received a Custom Order Invoice of $${offer.amount} for "${isWorkspaceOnly ? workspace.title : order!.title}". Please review within ${reviewDays} days.`
          : `You received an invoice of $${offer.amount} for "${isWorkspaceOnly ? workspace.title : order!.title}". Please review within ${reviewDays} days.`,
        link: `/workstream/${isWorkspaceOnly ? workspaceId : order!.id}`,
        metadata: { ...(!isWorkspaceOnly ? { orderId: order!.id } : {}), offerId: offer.id, isCustomOrder: isCustomOrderStream }
      });
    } else if (kind === 'proposal') {
      createNotification({
        userId: targetUserId,
        type: 'proposal_received',
        title: isCustomOrderStream ? 'Custom Order Proposal received' : 'Proposal received',
        message: isCustomOrderStream
          ? `You received a Custom Order Proposal of $${offer.amount} for "${isWorkspaceOnly ? workspace.title : order!.title}".`
          : `You received a proposal of $${offer.amount} for "${isWorkspaceOnly ? workspace.title : order!.title}".`,
        link: `/workstream/${isWorkspaceOnly ? workspaceId : order!.id}`,
        metadata: { ...(!isWorkspaceOnly ? { orderId: order!.id } : {}), offerId: offer.id, isCustomOrder: isCustomOrderStream }
      });
    }

    const offerPrefix = isCustomOrderStream 
      ? (kind === 'invoice' ? 'Custom Order Invoice' : 'Custom Order Proposal')
      : OFFER_LABEL[kind];
    await postOfferMessage(isWorkspaceOnly ? (workspace as any) : order!, offer, { id: caller.id, name: caller.name }, `New ${offerPrefix} ${offer.number}: ${title}`, 'offer_created');
    res.status(201).json({ offer: await viewOffer(offer), order: order ? enrichOrderWithServiceInfo(order) : null });
  } catch (err: any) {
    const status = err?.status || err?.statusCode || 400;
    res.status(status).json({ error: err.message });
  }
});

async function executeUnifiedOfferAccept(
  offer: WorkstreamOffer,
  order: Order,
  caller: any,
  idempotencyKey: string
): Promise<{ status: number; body: any }> {
  const isTerminal = ['completed', 'cancelled', 'refunded'].includes(order.status);
  const isDisputed = order.status === 'disputed';
  if ((isTerminal || isDisputed) && offer.kind !== 'proposal') {
    return { status: 400, body: { error: `Cannot accept ${OFFER_LABEL[offer.kind]} on an order that is ${order.status}.` } };
  }
  if (order.orderType === 'project' && (order.status === 'completed' || order.status === 'cancelled') && offer.kind !== 'proposal') {
    return { status: 400, body: { error: `Cannot accept ${offer.kind} on a ${order.status} project order.` } };
  }
  if (order.status === 'cancelled' && order.orderType !== 'gig' && !order.gigOrderId && offer.kind !== 'proposal') {
    return { status: 400, body: { error: 'Cannot accept offers on a cancelled order (escrow has already been refunded).' } };
  }
  if (order.status === 'completed' && offer.kind === 'invoice') {
    return { status: 400, body: { error: 'Cannot accept an invoice on a completed order (escrow has already been released).' } };
  }

  const now = new Date().toISOString();
  await ensureWallet(order.buyerId);
  await ensureWallet(order.sellerId);
  const today = now.split('T')[0];
  const protectionEnd = new Date(Date.now() + siteSettings.getSettings().commission.escrowProtectionDays * 86400000).toISOString().split('T')[0];
  const hasExistingEscrow = await orderHasEscrow(order.id);
  const isInitialFunding = !hasExistingEscrow && order.status !== 'cancelled' && (order.status as string) !== 'refunded' && order.status !== 'completed';
  const isFollowOnAfterCompletion = hasExistingEscrow && (order.status === 'completed' || (await getActiveEscrowRemaining(order)) === 0);
  const isCancelledOrRefundedFollowOn = order.status === 'cancelled' || (order.status as string) === 'refunded';

  if (offer.kind === 'invoice') {
    const workableInvoiceStatuses = [
      'funded_in_escrow',
      'in_progress',
      'accepted',
      'revision',
      'draft_review',
      'work_in_progress',
      'late',
      'delivered'
    ];
    if (
      offer.status === 'pending' &&
      offer.createdBy === order.sellerId &&
      workableInvoiceStatuses.includes(order.status)
    ) {
      if (!Array.isArray(order.deliverableFiles)) order.deliverableFiles = [];
      if (!Array.isArray(order.deliveryHistory)) order.deliveryHistory = [];
      const hasOfferDeliveryEntry = order.deliveryHistory.some((d: any) => d?.offerId === offer.id);
      if (!hasOfferDeliveryEntry) {
        const offerFiles = Array.isArray(offer.files) ? offer.files : [];
        if (offerFiles.length > 0) {
          const existingFileIds = new Set(order.deliverableFiles.map((f: any) => f?.id || f?.url));
          for (const f of offerFiles) {
            if (!existingFileIds.has(f?.id || f?.url)) {
              order.deliverableFiles.push(f as any);
            }
          }
        }
        const maxExistingVersion = order.deliveryHistory.reduce(
          (max: number, entry: any) => Math.max(max, Number(entry?.version) || 0),
          0
        );
        const version = Math.max(order.deliveryHistory.length, maxExistingVersion) + 1;
        const sanitizedNotes = offer.note ? escapeHtml(offer.note) : escapeHtml(offer.title || 'Invoice delivery');
        order.deliveryNotes = sanitizedNotes;
        if (offer.reference) order.deliveryReference = offer.reference;
        const deliveredAt = offer.createdAt || now;
        order.deliveryHistory.push({
          version,
          notes: sanitizedNotes,
          reference: offer.reference || undefined,
          files: offerFiles,
          deliveredAt,
          offerId: offer.id,
          ...(offer.responseDeadline ? { responseDeadline: offer.responseDeadline } : {})
        } as any);
      }
      order.status = 'delivered';
    }

    const validationError = validateOrderReleasePreconditions(order, false, true);
    if (validationError) {
      return { status: validationError.status, body: { error: validationError.error } };
    }

    const esc = await financialRepository.getEscrow(order.id);
    const currentEscrow = esc ? esc.remaining : Number(order.amount || 0);
    const invoiceAmount = Number(offer.amount);
    const additionalAmount = Math.round((invoiceAmount - currentEscrow) * 100) / 100;

    if (additionalAmount < 0) {
      return { status: 400, body: { error: `Final invoice amount ($${invoiceAmount}) cannot be less than the current order escrow ($${currentEscrow}).` } };
    }

    await postgresStore.executeInTransaction(async (client) => {
      const offerLockRes = await client.query('SELECT status FROM workstream_offers WHERE id = $1 FOR UPDATE', [offer.id]);
      if (offerLockRes.rows.length > 0 && offerLockRes.rows[0].status !== 'pending') {
        throw new Error(`This ${OFFER_LABEL[offer.kind]} is already ${offerLockRes.rows[0].status}.`);
      }

      if (additionalAmount > 0) {
        const topUpRes = await topUpOrderEscrowWithEvent({
          orderId: order.id,
          orderTitle: `Invoice Top-up: ${offer.title}`,
          amount: additionalAmount,
          buyerId: order.buyerId,
          sellerId: order.sellerId,
          actor: `user:${order.buyerId}`,
          idempotencyKey: `${idempotencyKey}-topup`
        }, client);
        order.amount = invoiceAmount;
        if (topUpRes?.diff?.next) {
          order.feeBreakdown = topUpRes.diff.next;
          (order as any).serviceFee = topUpRes.diff.next.serviceFee ?? 0;
          (order as any).smallOrderFee = topUpRes.diff.next.smallOrderFee ?? 0;
        }
      }

      let invoiceRevisionsResolved = false;
      if (Array.isArray(order.revisions)) {
        for (const rev of order.revisions) {
          if (rev.status === 'requested') {
            rev.status = 'resolved';
            invoiceRevisionsResolved = true;
          }
        }
      }
      if (invoiceRevisionsResolved) {
        await emitSystemEvent(order.id, 'revision_resolved', `📝 Revision resolved via accepted invoice ${offer.number}.`, {}, client);
      }

      await releaseOrderFunds(order, caller.name, `Final invoice ${offer.number} accepted by buyer and escrow released`, false, `${idempotencyKey}-release`, false, client);

      offer.status = 'paid';
      offer.resolvedAt = now;
      offer.resolvedBy = caller.id;
      offer.originOrderId = offer.originOrderId || order.id;
      offer.workspaceId = offer.workspaceId || order.workspaceId;

      const isCustomOrder = Boolean(order.metadata?.isInquiry || order.metadata?.isCustomOrder);
      if (order.orderType === 'project' || isCustomOrder) {
        await createNotification({
          userId: order.sellerId,
          type: 'invoice_paid',
          title: isCustomOrder ? 'Custom Order Invoice paid' : 'Invoice paid',
          message: isCustomOrder
            ? `Custom Order Invoice ${offer.number} for "${order.title}" ($${invoiceAmount}) was approved and paid. Custom Order Completed.`
            : `Invoice ${offer.number} for "${order.title}" ($${invoiceAmount}) was approved and paid.`,
          link: `/workstream/${order.id}`,
          metadata: { orderId: order.id, offerId: offer.id, amount: invoiceAmount, isCustomOrder },
          client
        }, client);
      }

      await syncUserBalances([order.buyerId, order.sellerId].filter(Boolean), client);
      await saveOfferToDb(offer, client);
      await store.saveOrder(order, client);
      const completionSuffix = isCustomOrder ? 'Custom Order Completed!' : 'Order completed!';
      const completionNote = additionalAmount > 0
        ? `${offer.number} ($${invoiceAmount.toLocaleString()}) was paid (+$${additionalAmount.toLocaleString()} funded from wallet) and full escrow ($${invoiceAmount.toLocaleString()}) was released to the seller. ${completionSuffix}`
        : `${offer.number} was accepted and escrow funds ($${invoiceAmount.toLocaleString()}) were released to the seller. ${completionSuffix}`;
      await postOfferMessage(order, offer, null, completionNote, 'offer_paid', client);
    });

    return {
      status: 200,
      body: {
        success: true,
        offer: await viewOffer(offer),
        order: enrichOrderWithServiceInfo(order)
      }
    };
  } else if (isInitialFunding) {
    if (order.status === 'funded_in_escrow' || (await orderHasEscrow(order.id))) {
      return { status: 409, body: { error: 'Order escrow is already funded.' } };
    }
    if (order.status !== 'in_progress' && order.status !== 'payment_pending') {
      return { status: 409, body: { error: 'Cannot fund escrow for order in current status.' } };
    }
    const newTitle = offer.kind === 'proposal' && (/^inquiry:/i.test(order.title) || !order.amount) ? offer.title : order.title;
    const prevStatus = order.status;
    const prevAmount = order.amount;
    const prevTitle = order.title;

    try {
      await postgresStore.executeInTransaction(async (client) => {
        const offerLockRes = await client.query('SELECT status FROM workstream_offers WHERE id = $1 FOR UPDATE', [offer.id]);
        if (offerLockRes.rows.length > 0 && offerLockRes.rows[0].status !== 'pending') {
          throw new Error(`This ${OFFER_LABEL[offer.kind]} is already ${offerLockRes.rows[0].status}.`);
        }

        order.previousStatus = prevStatus;
        order.status = 'payment_pending';
        order.title = newTitle;
        order.amount = offer.amount;
        await store.saveOrder(order, client);

        await fundOrderEscrowWithEvent({
          orderId: order.id,
          orderTitle: newTitle,
          amount: offer.amount,
          buyerId: order.buyerId,
          sellerId: order.sellerId,
          actor: `user:${order.buyerId}`,
          idempotencyKey
        }, client);

        const fundedOrderRow = await store.getOrder(order.id, client);
        if (fundedOrderRow?.feeBreakdown) {
          order.feeBreakdown = fundedOrderRow.feeBreakdown;
          (order as any).serviceFee = (fundedOrderRow as any).serviceFee;
          (order as any).smallOrderFee = (fundedOrderRow as any).smallOrderFee;
        }

        order.title = newTitle;
        order.amount = offer.amount;
        order.status = 'funded_in_escrow';
        order.escrowProtectionStartDate = today;
        order.escrowProtectionEndDate = protectionEnd;
        if (offer.kind === 'proposal' && offer.deliveryDays) {
          order.dueDate = new Date(Date.now() + offer.deliveryDays * 86400000).toISOString();
        }
        offer.orderId = order.id;
        offer.originOrderId = offer.originOrderId || order.id;
        offer.resultingOrderId = order.id;
        offer.workspaceId = offer.workspaceId || order.workspaceId;
        offer.status = 'accepted';
        offer.resolvedAt = now;
        offer.resolvedBy = caller.id;
        if (offer.kind === 'proposal') {
          const linkedProp = await findLinkedProposalForOffer(offer, order, client);
          if (linkedProp) {
            linkedProp.status = 'accepted';
            linkedProp.workstreamOrderId = order.id;
            linkedProp.offerId = offer.id;
            order.proposalId = linkedProp.id;
            await store.saveProposal(linkedProp, client);
          }
        }
        await store.saveOrder(order, client);
        await saveOfferToDb(offer, client);
        await syncUserBalances([order.buyerId, order.sellerId].filter(Boolean), client);
        await postOfferMessage(order, offer, null, `${offer.number} was accepted and escrow was funded ($${offer.amount}).`, 'offer_accepted', client);
      });
    } catch (fundingErr: any) {
      order.status = prevStatus;
      order.amount = prevAmount;
      order.title = prevTitle;
      return { status: 400, body: { error: fundingErr.message || 'Failed to fund escrow for offer.' } };
    }
    return {
      status: 200,
      body: {
        success: true,
        offer: await viewOffer(offer),
        order: enrichOrderWithServiceInfo(order)
      }
    };
  } else if (isFollowOnAfterCompletion || isCancelledOrRefundedFollowOn || ((order.status === 'completed' || order.status === 'cancelled' || (order.status as string) === 'refunded') && offer.kind === 'proposal')) {
    const newOrderId = 'ord_' + randomUUID().slice(0, 12);
    const isGigFollowOn = order.orderType === 'gig' || (Boolean(order.gigId) && !order.projectId);
    const orderType: 'gig' | 'project' = isGigFollowOn ? 'gig' : 'project';
    const gigOrderId = orderType === 'gig' ? newOrderId : undefined;
    const projectOrderId = orderType === 'project' ? newOrderId : undefined;

    const newOrder: Order = {
      id: newOrderId,
      workspaceId: order.workspaceId,
      orderType,
      ...(gigOrderId ? { gigOrderId } : {}),
      ...(projectOrderId ? { projectOrderId } : {}),
      title: offer.title,
      buyerId: order.buyerId,
      sellerId: order.sellerId,
      amount: offer.amount,
      status: 'payment_pending',
      createdAt: today,
      dueDate: offer.kind === 'proposal' && offer.deliveryDays
        ? new Date(Date.now() + offer.deliveryDays * 86400000).toISOString()
        : new Date(Date.now() + 7 * 86400000).toISOString(),
      escrowProtectionStartDate: today,
      escrowProtectionEndDate: protectionEnd,
      feeBreakdown: await quoteOrderWithLiveSettings(offer.amount),
      projectId: order.projectId,
      gigId: order.gigId
    };

    const enrichedOrder = enrichOrderWithServiceInfo(newOrder);
    const originOrderId = offer.originOrderId || order.id;

    try {
      await postgresStore.executeInTransaction(async (client) => {
        const offerLockRes = await client.query('SELECT status FROM workstream_offers WHERE id = $1 FOR UPDATE', [offer.id]);
        if (offerLockRes.rows.length > 0 && offerLockRes.rows[0].status !== 'pending') {
          throw new Error(`This ${OFFER_LABEL[offer.kind]} is already ${offerLockRes.rows[0].status}.`);
        }

        await recordOrder(enrichedOrder, client);
        await store.saveOrder(enrichedOrder, client);

        await fundOrderEscrowWithEvent({
          orderId: newOrder.id,
          orderTitle: newOrder.title,
          amount: newOrder.amount,
          buyerId: newOrder.buyerId,
          sellerId: newOrder.sellerId,
          actor: `user:${newOrder.buyerId}`,
          idempotencyKey
        }, client);

        const fundedRow = await store.getOrder(newOrder.id, client);
        if (fundedRow?.feeBreakdown) {
          enrichedOrder.feeBreakdown = fundedRow.feeBreakdown;
          (enrichedOrder as any).serviceFee = (fundedRow as any).serviceFee;
          (enrichedOrder as any).smallOrderFee = (fundedRow as any).smallOrderFee;
        }

        enrichedOrder.status = 'funded_in_escrow';
        await store.saveOrder(enrichedOrder, client);
        await syncUserBalances([newOrder.buyerId, newOrder.sellerId].filter(Boolean), client);

        await emitSystemEvent(newOrder.id, 'order_created', `Order placed: ${newOrder.title}. Payment is held in escrow until the work is approved.`, { originOrderId }, client);

        offer.originOrderId = originOrderId;
        offer.resultingOrderId = newOrder.id;
        offer.workspaceId = order.workspaceId;
        offer.orderId = newOrder.id;
        offer.status = 'accepted';
        offer.resolvedAt = now;
        offer.resolvedBy = caller.id;
        offer.metadata = {
          ...(offer.metadata || {}),
          originOrderId,
          resultingOrderId: newOrder.id,
          ...(order.workspaceId ? { workspaceId: order.workspaceId } : {})
        };

        if (orderType === 'project') {
          await createNotification({
            userId: newOrder.sellerId,
            type: 'proposal_accepted',
            title: 'Follow-on proposal accepted',
            message: `Your follow-on proposal "${offer.title}" was accepted and escrow has been funded.`,
            link: `/workstream/${newOrderId}`,
            metadata: { orderId: newOrderId, originOrderId, offerId: offer.id },
            client
          }, client);
        }

        await saveOfferToDb(offer, client);
        await postOfferMessage(enrichedOrder, offer, null, `Follow-on ${OFFER_LABEL[offer.kind]} ${offer.number} ("${offer.title}") was accepted and $${offer.amount.toLocaleString()} was funded into escrow in a new Order (#${newOrderId}).`, 'offer_accepted', client);
      });
    } catch (fundingErr: any) {
      return { status: 400, body: { error: fundingErr.message || 'Failed to fund escrow for follow-on order.' } };
    }

    const enrichedFollowOnResult = enrichOrderWithServiceInfo(enrichedOrder);
    return {
      status: 200,
      body: {
        success: true,
        offer: await viewOffer(offer),
        order: enrichedFollowOnResult,
        newOrder: enrichedFollowOnResult,
        originOrder: enrichOrderWithServiceInfo(order)
      }
    };
  } else {
    await postgresStore.executeInTransaction(async (client) => {
      const offerLockRes = await client.query('SELECT status FROM workstream_offers WHERE id = $1 FOR UPDATE', [offer.id]);
      if (offerLockRes.rows.length > 0 && offerLockRes.rows[0].status !== 'pending') {
        throw new Error(`This ${OFFER_LABEL[offer.kind]} is already ${offerLockRes.rows[0].status}.`);
      }

      const topUpRes = await topUpOrderEscrowWithEvent({
        orderId: order.id,
        orderTitle: offer.title,
        amount: offer.amount,
        buyerId: order.buyerId,
        sellerId: order.sellerId,
        actor: `user:${order.buyerId}`,
        idempotencyKey
      }, client);

      order.amount = Math.round((Number(order.amount || 0) + offer.amount) * 100) / 100;
      if (topUpRes?.diff?.next) {
        order.feeBreakdown = topUpRes.diff.next;
        (order as any).serviceFee = topUpRes.diff.next.serviceFee ?? 0;
        (order as any).smallOrderFee = topUpRes.diff.next.smallOrderFee ?? 0;
      }
      if (offer.kind === 'proposal' && offer.deliveryDays) {
        order.dueDate = new Date(Date.now() + offer.deliveryDays * 86400000).toISOString();
      }
      offer.orderId = order.id;
      offer.originOrderId = offer.originOrderId || order.id;
      offer.resultingOrderId = order.id;
      offer.workspaceId = offer.workspaceId || order.workspaceId;
      offer.status = 'accepted';
      offer.resolvedAt = now;
      offer.resolvedBy = caller.id;
      if (offer.kind === 'proposal') {
        const linkedProp = await findLinkedProposalForOffer(offer, order, client);
        if (linkedProp) {
          linkedProp.status = 'accepted';
          linkedProp.workstreamOrderId = order.id;
          linkedProp.offerId = offer.id;
          await store.saveProposal(linkedProp, client);
        }
      }
      await syncUserBalances([order.buyerId, order.sellerId].filter(Boolean), client);
      await store.saveOrder(order, client);
      await saveOfferToDb(offer, client);
      await postOfferMessage(order, offer, null, `${offer.number} was accepted and escrow was topped up with $${offer.amount}. All funds and milestones remain unified under Order #${order.id}.`, 'offer_accepted', client);
    });

    return {
      status: 200,
      body: {
        success: true,
        offer: await viewOffer(offer),
        order: enrichOrderWithServiceInfo(order)
      }
    };
  }
}

async function executeWorkspaceInquiryOfferAccept(
  offer: WorkstreamOffer,
  workspace: any,
  caller: any,
  idempotencyKey: string
): Promise<{ status: number; body: any }> {
  if (!workspace || !workspace.workspaceId) {
    return { status: 404, body: { error: 'Inquiry workspace not found.' } };
  }
  if (!workspace.buyerId || !workspace.sellerId) {
    return { status: 400, body: { error: 'Invalid inquiry workspace participants.' } };
  }
  if (caller.id !== workspace.buyerId) {
    return { status: 403, body: { error: 'Only the buyer can accept this offer.' } };
  }
  if (offer.createdBy !== workspace.sellerId) {
    return { status: 403, body: { error: 'Offer was not created by the seller of this workspace.' } };
  }
  const offerWsId = offer.workspaceId || offer.metadata?.workspaceId;
  if (!offerWsId || offerWsId !== workspace.workspaceId) {
    return { status: 403, body: { error: 'Offer does not belong to this workspace.' } };
  }
  if (offer.kind !== 'proposal') {
    return { status: 400, body: { error: 'Only proposals can create an order from an inquiry.' } };
  }

  const offerAmount = Math.round(Number(offer.amount) * 100) / 100;
  if (!Number.isFinite(offerAmount) || offerAmount <= 0) {
    return { status: 400, body: { error: 'Invalid proposal amount.' } };
  }

  await ensureWallet(workspace.buyerId);
  await ensureWallet(workspace.sellerId);

  const newOrderId = 'ord_' + randomUUID().slice(0, 12);
  const now = new Date().toISOString();
  const today = now.split('T')[0];
  const protectionDays = siteSettings.getSettings().commission.escrowProtectionDays || 14;
  const protectionEnd = new Date(Date.now() + protectionDays * 86400000).toISOString().split('T')[0];

  const wsMeta = (workspace as any).metadata || {};
  const originType = workspace.originType || wsMeta.originType || 'gig';
  const originId = workspace.originId || wsMeta.originId;
  const isGigOrigin = originType === 'gig';
  const orderType: 'gig' | 'project' = isGigOrigin ? 'gig' : 'project';
  const gigOrderId = orderType === 'gig' ? newOrderId : undefined;
  const projectOrderId = orderType === 'project' ? newOrderId : undefined;
  const gigId = isGigOrigin && originId && originId !== workspace.workspaceId ? originId : undefined;
  const projectId = originType === 'project' && originId && originId !== workspace.workspaceId ? originId : undefined;

  const newOrder: Order = {
    id: newOrderId,
    workspaceId: workspace.workspaceId,
    orderType,
    ...(gigOrderId ? { gigOrderId } : {}),
    ...(projectOrderId ? { projectOrderId } : {}),
    ...(gigId ? { gigId } : {}),
    ...(projectId ? { projectId } : {}),
    title: offer.title || (workspace as any).title || 'Custom Order',
    metadata: {
      isInquiry: true,
      isCustomOrder: true,
      customOrderFromInquiry: true,
      inquiryWorkspaceId: workspace.workspaceId,
      ...((workspace as any).metadata || {})
    },
    buyerId: workspace.buyerId,
    sellerId: workspace.sellerId,
    amount: offerAmount,
    status: 'payment_pending',
    createdAt: today,
    dueDate: offer.deliveryDays
      ? new Date(Date.now() + offer.deliveryDays * 86400000).toISOString()
      : new Date(Date.now() + 7 * 86400000).toISOString(),
    escrowProtectionStartDate: today,
    escrowProtectionEndDate: protectionEnd,
    feeBreakdown: await quoteOrderWithLiveSettings(offerAmount)
  };

  const enrichedOrder = enrichOrderWithServiceInfo(newOrder);

  try {
    await postgresStore.executeInTransaction(async (client) => {
      const offerLockRes = await client.query(
        'SELECT status, order_id, workspace_id, created_by, metadata FROM workstream_offers WHERE id = $1 FOR UPDATE',
        [offer.id]
      );
      if (offerLockRes.rows.length === 0) {
        throw new Error('Offer not found.');
      }
      const lockedOffer = offerLockRes.rows[0];
      if (lockedOffer.status !== 'pending') {
        throw new Error(`This ${OFFER_LABEL[offer.kind]} is already ${lockedOffer.status}.`);
      }
      const lockedOfferMeta = typeof lockedOffer.metadata === 'string' ? JSON.parse(lockedOffer.metadata) : (lockedOffer.metadata || {});
      const lockedWsId = lockedOffer.workspace_id || lockedOfferMeta.workspaceId;
      if (lockedWsId !== workspace.workspaceId || lockedOffer.created_by !== workspace.sellerId) {
        throw new Error('Offer does not match this inquiry workspace.');
      }

      const wsLockRes = await client.query(
        'SELECT workspace_id, buyer_id, seller_id FROM workspaces WHERE workspace_id = $1 FOR UPDATE',
        [workspace.workspaceId]
      );
      if (wsLockRes.rows.length === 0) {
        throw new Error('Inquiry workspace not found.');
      }
      const lockedWs = wsLockRes.rows[0];
      if (lockedWs.buyer_id !== workspace.buyerId || lockedWs.seller_id !== workspace.sellerId) {
        throw new Error('Workspace participant mismatch.');
      }

      await recordOrder(enrichedOrder, client);
      await store.saveOrder(enrichedOrder, client);

      await fundOrderEscrowWithEvent({
        orderId: enrichedOrder.id,
        orderTitle: enrichedOrder.title,
        amount: enrichedOrder.amount,
        buyerId: enrichedOrder.buyerId,
        sellerId: enrichedOrder.sellerId,
        actor: `user:${caller.id}`,
        idempotencyKey
      }, client);

      const fundedRow = await store.getOrder(enrichedOrder.id, client);
      if (fundedRow?.feeBreakdown) {
        enrichedOrder.feeBreakdown = fundedRow.feeBreakdown;
        (enrichedOrder as any).serviceFee = (fundedRow as any).serviceFee;
        (enrichedOrder as any).smallOrderFee = (fundedRow as any).smallOrderFee;
      }

      enrichedOrder.status = 'funded_in_escrow';
      await store.saveOrder(enrichedOrder, client);
      await syncUserBalances([enrichedOrder.buyerId, enrichedOrder.sellerId].filter(Boolean), client);
      await emitSystemEvent(
        enrichedOrder.id,
        'order_created',
        `Custom Order placed: ${enrichedOrder.title}. Payment is held in escrow until the work is approved.`,
        { workspaceId: workspace.workspaceId, isCustomOrder: true },
        client
      );

      offer.status = 'accepted';
      offer.originOrderId = enrichedOrder.id;
      offer.resultingOrderId = enrichedOrder.id;
      offer.workspaceId = workspace.workspaceId;
      offer.orderId = enrichedOrder.id;
      offer.resolvedAt = now;
      offer.resolvedBy = caller.id;
      offer.metadata = {
        ...(offer.metadata || {}),
        originOrderId: enrichedOrder.id,
        resultingOrderId: enrichedOrder.id,
        workspaceId: workspace.workspaceId,
        isCustomOrder: true
      };
      await saveOfferToDb(offer, client);

      await createNotification({
        userId: enrichedOrder.sellerId,
        type: 'proposal_accepted',
        title: 'Custom Order Proposal accepted',
        message: `Your Custom Order Proposal "${offer.title}" was accepted and escrow has been funded. Custom Order #${enrichedOrder.id} created.`,
        link: `/workstream/${enrichedOrder.id}`,
        metadata: { orderId: enrichedOrder.id, workspaceId: workspace.workspaceId, offerId: offer.id, isCustomOrder: true },
        client
      }, client);

      await postOfferMessage(
        enrichedOrder,
        offer,
        null,
        `Custom Order Proposal ${offer.number || 'Proposal'} was accepted and escrow was funded ($${offerAmount}). Custom Order #${enrichedOrder.id} created.`,
        'offer_accepted',
        client
      );
    });
  } catch (fundingErr: any) {
    const latestOffer = await store.getOfferById(offer.id);
    if (latestOffer && (latestOffer.status === 'accepted' || latestOffer.status === 'paid')) {
      const createdOrdId = latestOffer.resultingOrderId || latestOffer.orderId;
      const createdOrd = createdOrdId ? await store.getOrder(createdOrdId) : null;
      if (createdOrd) {
        const enrichedCreated = enrichOrderWithServiceInfo(createdOrd);
        return {
          status: 200,
          body: {
            success: true,
            offer: await viewOffer(latestOffer),
            order: enrichedCreated,
            newOrder: enrichedCreated
          }
        };
      }
    }
    return { status: 400, body: { error: fundingErr.message || 'Failed to fund escrow for inquiry proposal.' } };
  }

  const finalOrder = enrichOrderWithServiceInfo(enrichedOrder);
  return {
    status: 200,
    body: {
      success: true,
      offer: await viewOffer(offer),
      order: finalOrder,
      newOrder: finalOrder
    }
  };
}

router.post('/offers/:id/:action(accept|decline|cancel)', requireAuth, rateLimit(20, 60_000), async (req: Request, res: Response) => {
  const initialOffer = await store.getOfferById(req.params.id);
  if (!initialOffer) return res.status(404).json({ error: 'Not found' });
  const targetOrderId = initialOffer.originOrderId || initialOffer.orderId;

  if (!targetOrderId) {
    const initialWorkspaceId = initialOffer.workspaceId || initialOffer.metadata?.workspaceId;
    if (!initialWorkspaceId) return res.status(404).json({ error: 'Order not found' });

    const lockKey = initialOffer.id;
    if (!tryAcquireOrderLock(lockKey, res)) return;
    try {
      const offer = await store.getOfferById(req.params.id);
      if (!offer) return res.status(404).json({ error: 'Not found' });

      const caller = await offerCaller(req);
      if (!caller || (caller.status !== 'active' && caller.status !== 'restricted')) {
        return res.status(403).json({ error: 'Account is not active' });
      }

      const wsId = offer.workspaceId || offer.metadata?.workspaceId;
      if (!wsId) return res.status(404).json({ error: 'Order not found' });
      const workspace = await workspaceService.getWorkspaceAsync(wsId);
      if (!workspace) return res.status(404).json({ error: 'Inquiry workspace not found' });

      if (caller.id !== workspace.buyerId && caller.id !== workspace.sellerId) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      if (offer.createdBy !== workspace.sellerId) {
        return res.status(403).json({ error: 'Offer does not belong to the seller of this workspace.' });
      }
      const requestedWsId = typeof req.body?.workspaceId === 'string'
        ? req.body.workspaceId
        : (typeof req.body?.workstreamId === 'string' ? req.body.workstreamId : undefined);
      if (
        requestedWsId &&
        requestedWsId !== workspace.workspaceId &&
        !(Array.isArray(workspace.orderIds) && workspace.orderIds.includes(requestedWsId))
      ) {
        return res.status(403).json({ error: 'Offer does not belong to the specified WorkStream.' });
      }

      if (offer.status !== 'pending') {
        if (offer.status === 'accepted' || offer.status === 'paid') {
          const associatedOrderId = offer.resultingOrderId || offer.orderId;
          const associatedOrder = associatedOrderId ? await store.getOrder(associatedOrderId) : null;
          const enrichedAssoc = associatedOrder ? enrichOrderWithServiceInfo(associatedOrder) : null;
          return res.json({
            success: true,
            offer: await viewOffer(offer),
            order: enrichedAssoc,
            ...(enrichedAssoc ? { newOrder: enrichedAssoc } : {})
          });
        }
        return res.status(409).json({ error: `This ${OFFER_LABEL[offer.kind]} is already ${offer.status}.` });
      }

      const action = req.params.action;
      const now = new Date().toISOString();
      const idempotencyKey = req.body?.idempotencyKey || (req.headers['x-idempotency-key'] as string) || `offer-accept-${offer.id}`;
      const isProjectInquiry = workspace.originType === 'project' || (workspace.metadata as any)?.originType === 'project';

      if (action === 'cancel') {
        if (caller.id !== workspace.sellerId) return res.status(403).json({ error: 'Only the seller can cancel this.' });
        offer.status = 'cancelled';
        offer.resolvedAt = now;
        offer.resolvedBy = caller.id;
        await saveOfferToDb(offer);
        await postOfferMessage(workspace as any, offer, null, `Custom Order Proposal ${offer.number} was cancelled by the seller.`, 'offer_cancelled');
        createNotification({
          userId: workspace.buyerId,
          type: 'proposal_cancelled',
          title: 'Custom Order Proposal cancelled',
          message: `The Custom Order Proposal for "${(workspace as any).title || offer.title}" was cancelled by the seller.`,
          link: `/workstream/${workspace.workspaceId}`,
          metadata: { workspaceId: workspace.workspaceId, offerId: offer.id, isCustomOrder: true }
        });
        return res.json({ offer: await viewOffer(offer), order: null });
      }

      if (caller.id !== workspace.buyerId) {
        return res.status(403).json({ error: 'Only the buyer can respond to this.' });
      }

      if (action === 'decline') {
        const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 1000) : '';
        if (reason) {
          offer.rejectionReason = reason;
          offer.rejectedBy = caller.id;
          offer.rejectedAt = now;
        }
        offer.status = 'declined';
        offer.resolvedAt = now;
        offer.resolvedBy = caller.id;
        await saveOfferToDb(offer);
        await postOfferMessage(
          workspace as any,
          offer,
          null,
          `Custom Order Proposal ${offer.number} was declined by the buyer.${offer.rejectionReason ? ` Reason: ${offer.rejectionReason}` : ''}`,
          'offer_declined'
        );
        createNotification({
          userId: workspace.sellerId,
          type: 'proposal_declined',
          title: 'Custom Order Proposal declined',
          message: `Your Custom Order Proposal for "${(workspace as any).title || offer.title}" was declined by the buyer.`,
          link: `/workstream/${workspace.workspaceId}`,
          metadata: { workspaceId: workspace.workspaceId, offerId: offer.id, isCustomOrder: true }
        });
        return res.json({ offer: await viewOffer(offer), order: null });
      }

      const acceptResult = await executeWorkspaceInquiryOfferAccept(offer, workspace, caller, idempotencyKey);
      return res.status(acceptResult.status).json(acceptResult.body);
    } catch (err: any) {
      return res.status(400).json({ error: err.message });
    } finally {
      releaseOrderLock(lockKey);
    }
  }

  const initialOrder = await store.getOrder(targetOrderId);
  if (!initialOrder) return res.status(404).json({ error: 'Not found' });

  const lockedOrderId = initialOrder.id;
  if (!tryAcquireOrderLock(lockedOrderId, res)) return;
  try {
    const offer = await store.getOfferById(req.params.id);
    if (!offer) return res.status(404).json({ error: 'Not found' });
    const targetId = offer.originOrderId || offer.orderId;
    if (!targetId) return res.status(404).json({ error: 'Order not found' });
    const order = await store.getOrder(targetId);
    if (!order) return res.status(404).json({ error: 'Not found' });

    const caller = await offerCaller(req);
    if (!caller || (caller.status !== 'active' && caller.status !== 'restricted')) return res.status(403).json({ error: 'Account is not active' });
    if (!canAccessOrderWorkstream(caller, order)) return res.status(403).json({ error: 'Forbidden' });
    if (offer.status !== 'pending') {
      if (offer.status === 'accepted' || offer.status === 'paid') {
        const targetId = offer.resultingOrderId || offer.orderId;
        const associatedOrder = (targetId ? await store.getOrder(targetId) : null) || order;
        return res.json({
          success: true,
          offer: await viewOffer(offer),
          order: enrichOrderWithServiceInfo(associatedOrder)
        });
      }
      return res.status(409).json({ error: `This ${OFFER_LABEL[offer.kind]} is already ${offer.status}.` });
    }

    const action = req.params.action;
    const now = new Date().toISOString();
    const idempotencyKey = req.body?.idempotencyKey || (req.headers['x-idempotency-key'] as string) || `offer-accept-${offer.id}`;

    if (action === 'cancel') {
      if (caller.id !== order.sellerId) return res.status(403).json({ error: 'Only the seller can cancel this.' });
      offer.status = 'cancelled';
      offer.resolvedAt = now;
      offer.resolvedBy = caller.id;

      if (offer.kind === 'proposal') {
        const linkedProp = await findLinkedProposalForOffer(offer, order);
        if (linkedProp && linkedProp.status === 'pending') {
          linkedProp.status = 'rejected';
          await store.saveProposal(linkedProp);
        }
      }
      if (offer.kind === 'invoice' && (order.status === 'delivered' || order.status === 'draft_review')) {
        const otherOffers = (await store.listOffersForOrder(order.id)).filter(o => o.orderId === order.id);
        const hasOtherPending = otherOffers.some(o => o.id !== offer.id && o.kind === 'invoice' && o.status === 'pending');
        if (!hasOtherPending && (await orderHasEscrow(order.id))) {
          order.status = 'in_progress';
          await store.saveOrder(order);
        }
      }
      await saveOfferToDb(offer);
      await postOfferMessage(order, offer, null, `${offer.number} was cancelled by the seller.`, 'offer_cancelled');
      if (order.orderType === 'project') {
        createNotification({
          userId: order.buyerId,
          type: offer.kind === 'invoice' ? 'invoice_cancelled' : 'proposal_cancelled',
          title: `${OFFER_LABEL[offer.kind]} cancelled`,
          message: `The ${offer.kind} for "${order.title}" was cancelled by the seller.`,
          link: `/workstream/${order.id}`,
          metadata: { orderId: order.id, offerId: offer.id }
        });
      }
      return res.json({ offer: await viewOffer(offer), order: enrichOrderWithServiceInfo(order) });
    }

    if (caller.id !== order.buyerId) return res.status(403).json({ error: 'Only the buyer can respond to this.' });

    if (action === 'decline') {
      if (order.orderType === 'project' && offer.kind === 'invoice') {
        const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 1000) : '';
        if (!reason) {
          return res.status(400).json({ error: 'A reason is required when rejecting a project invoice.' });
        }
        offer.rejectionReason = reason;
        offer.rejectedBy = caller.id;
        offer.rejectedAt = now;
        order.status = 'in_progress';
        await store.saveOrder(order);
        createNotification({
          userId: order.sellerId,
          type: 'invoice_rejected',
          title: 'Invoice rejected',
          message: `Your invoice for "${order.title}" was rejected. Reason: ${reason}`,
          link: `/workstream/${order.id}`,
          metadata: { orderId: order.id, offerId: offer.id, reason }
        });
      }

      offer.status = 'declined';
      offer.resolvedAt = now;
      offer.resolvedBy = caller.id;

      if (offer.kind === 'proposal') {
        const linkedProp = await findLinkedProposalForOffer(offer, order);
        if (linkedProp) {
          linkedProp.status = 'rejected';
          await store.saveProposal(linkedProp);
        }
        if (order.orderType === 'project') {
          createNotification({
            userId: order.sellerId,
            type: 'proposal_declined',
            title: 'Proposal declined',
            message: `Your proposal "${offer.title}" was declined by the buyer.`,
            link: `/workstream/${order.id}`,
            metadata: { orderId: order.id, offerId: offer.id }
          });
        }
      } else if (offer.kind === 'invoice' && order.orderType !== 'project' && (order.status === 'delivered' || order.status === 'draft_review')) {
        const otherOffers = (await store.listOffersForOrder(order.id)).filter(o => o.orderId === order.id);
        const hasOtherPending = otherOffers.some(o => o.id !== offer.id && o.kind === 'invoice' && o.status === 'pending');
        if (!hasOtherPending && (await orderHasEscrow(order.id))) {
          order.status = 'revision';
          await store.saveOrder(order);
        }
      }
      await saveOfferToDb(offer);
      await postOfferMessage(order, offer, null, `${offer.number} was declined by the buyer.${offer.rejectionReason ? ` Reason: ${offer.rejectionReason}` : ''}`, 'offer_declined');
      return res.json({ offer: await viewOffer(offer), order: enrichOrderWithServiceInfo(order) });
    }

    const acceptResult = await executeUnifiedOfferAccept(offer, order, caller, idempotencyKey);
    return res.status(acceptResult.status).json(acceptResult.body);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  } finally {
    releaseOrderLock(lockedOrderId);
  }
});

router.post(
  ['/workstream/messages/:id/accept-offer', '/messages/:id/accept-offer'],
  requireAuth,
  requireActiveStatus,
  rateLimit(20, 60_000),
  async (req: Request, res: Response) => {
    try {
      const msgId = req.params.id;
      const caller = (req as any).authenticatedUser;
      if (!caller || (caller.status !== 'active' && caller.status !== 'restricted')) {
        return res.status(403).json({ error: 'Account is not active' });
      }
      const pool = postgresStore.getPool();

      let offer = await store.getOfferById(msgId);
      let msg: any = null;
      if (!offer) {
        const msgRes = await pool.query("SELECT * FROM messages WHERE id = $1", [msgId]);
        if (msgRes.rows.length > 0) {
          msg = msgRes.rows[0];
          const offerId = msg.metadata?.offerId || msg.metadata?.offer?.id || msg.metadata?.id;
          if (offerId) {
            offer = await store.getOfferById(offerId);
          }
        }
      }

      if (!offer) {
        return res.status(404).json({ error: 'Offer not found' });
      }
      if (caller.id === offer.createdBy) {
        return res.status(403).json({ error: 'You cannot accept your own offer.' });
      }
      if (offer.status !== 'pending') {
        if (offer.status === 'accepted' || offer.status === 'paid') {
          const targetId = offer.resultingOrderId || offer.orderId;
          const existingOrder = targetId ? await store.getOrder(targetId as string) : null;
          const enrichedExisting = existingOrder ? enrichOrderWithServiceInfo(existingOrder) : null;
          return res.json({
            success: true,
            order: enrichedExisting,
            ...(enrichedExisting ? { newOrder: enrichedExisting } : {}),
            offer: await viewOffer(offer)
          });
        }
        return res.status(409).json({ error: `This offer is already ${offer.status}.` });
      }

      const idempotencyKey = req.body?.idempotencyKey || (req.headers['x-idempotency-key'] as string) || `offer-accept-${offer.id}`;

      const targetOrderLookupId = offer.originOrderId || offer.orderId;
      let order = targetOrderLookupId ? await store.getOrder(targetOrderLookupId) : null;
      if (!order && msg?.order_id) {
        order = await store.getOrder(msg.order_id);
      }

      if (!order) {
        const wsId = offer.workspaceId || offer.metadata?.workspaceId || msg?.workspace_id;
        if (!wsId) {
          return res.status(404).json({ error: 'Inquiry workspace not found' });
        }
        const workspace = await workspaceService.getWorkspaceAsync(wsId);
        if (!workspace) {
          return res.status(404).json({ error: 'Inquiry workspace not found' });
        }
        if (!tryAcquireOrderLock(offer.id, res)) return;
        try {
          const acceptResult = await executeWorkspaceInquiryOfferAccept(offer, workspace, caller, idempotencyKey);
          return res.status(acceptResult.status).json(acceptResult.body);
        } finally {
          releaseOrderLock(offer.id);
        }
      }

      if (caller.id !== order.buyerId) {
        return res.status(403).json({ error: 'Only the buyer can accept this offer.' });
      }

      const lockedExistingOrderId = order.id;
      if (!tryAcquireOrderLock(lockedExistingOrderId, res)) return;
      try {
        const freshOrder = await store.getOrder(lockedExistingOrderId);
        if (!freshOrder) return res.status(404).json({ error: 'Order not found' });
        const targetOffer = await store.getOfferById(offer.id);
        if (!targetOffer) return res.status(404).json({ error: 'Offer not found' });

        if (targetOffer.status !== 'pending') {
          if (targetOffer.status === 'accepted' || targetOffer.status === 'paid') {
            const resultingOrd = (targetOffer.resultingOrderId || targetOffer.orderId)
              ? await store.getOrder((targetOffer.resultingOrderId || targetOffer.orderId) as string)
              : freshOrder;
            return res.json({
              success: true,
              order: enrichOrderWithServiceInfo(resultingOrd || freshOrder),
              offer: await viewOffer(targetOffer)
            });
          }
          return res.status(409).json({ error: `This offer is already ${targetOffer.status}.` });
        }

        const acceptResult = await executeUnifiedOfferAccept(targetOffer, freshOrder, caller, idempotencyKey);
        return res.status(acceptResult.status).json(acceptResult.body);
      } finally {
        releaseOrderLock(lockedExistingOrderId);
      }
    } catch (err: any) {
      return res.status(400).json({ error: err.message || 'Failed to accept offer' });
    }
  }
);

export default router;


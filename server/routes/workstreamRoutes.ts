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
  getActiveEscrowRemaining
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
    const order = await store.getOrder(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (!canAccessOrderWorkstream(caller, order)) return res.status(403).json({ error: 'Forbidden' });

    const orderOnly = req.query.orderOnly === 'true' || req.query.scope === 'order';
    const orderOffers = (!orderOnly && order.workspaceId)
      ? await store.listOffersForWorkspace(order.workspaceId, order.id)
      : await store.listOffersForOrder(order.id);
    const offers = await Promise.all(orderOffers.map(viewOffer));
    const esc = await financialRepository.getEscrow(order.id);
    res.json({
      offers,
      currencySymbol: siteSettings.getFlattenedSettings().currencySymbol || '$',
      escrowFunded: await orderHasEscrow(order.id),
      escrowRemaining: await getActiveEscrowRemaining(order),
      totalReleased: esc ? esc.releasedGross : (order.status === 'completed' ? Number(order.amount || 0) : 0),
      hasPaidInvoice: await hasPaidInvoiceOrReleasedEscrow(order)
    });
  } catch (err: any) {
    res.status(500).json(formatApiError(err));
  }
});

router.post('/orders/:id/offers', requireAuth, requireActiveStatus, rateLimit(20, 60_000), async (req: Request, res: Response) => {
  try {
    const caller = await offerCaller(req);
    if (!caller || (caller.status !== 'active' && caller.status !== 'restricted')) return res.status(403).json({ error: 'Account is not active' });
    const order = await store.getOrder(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (caller.id !== order.sellerId) return res.status(403).json({ error: 'Only the seller of this workstream can send this.' });
    const kind = req.body?.kind as WorkstreamOfferKind;
    if (!['proposal', 'invoice', 'deposit'].includes(kind)) return res.status(400).json({ error: 'Invalid type.' });
    if ((order.status === 'cancelled' || (order.status as string) === 'refunded') && kind === 'invoice') {
      return res.status(409).json({ error: 'Cannot send a final invoice on a cancelled or refunded order. Send a proposal or deposit to start a follow-on order.' });
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

    const funded = await orderHasEscrow(order.id);
    const activeEscrow = await getActiveEscrowRemaining(order);
    const hasPaidFirstInvoice = await hasPaidInvoiceOrReleasedEscrow(order);

    const existingOffers = (await store.listOffersForOrder(order.id)).filter(o => o.orderId === order.id);

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
      if ((order.orderType === 'gig' || (order.gigId && !order.projectId)) && activeEscrow > 0 && !hasPaidFirstInvoice) {
        return res.status(409).json({ error: 'This Gig is already funded in escrow. Please raise and get your first invoice paid before sending a follow-on proposal.' });
      }
    }

    let uploadedFiles: Array<{ id: string; name: string; size: string; url: string; uploadedAt: string; type: string }> = [];
    if (kind === 'invoice' && Array.isArray(req.body?.files) && req.body.files.length > 0) {
      const validation = await validateStoredWorkstreamFiles(req.body.files, caller, order.id);
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

    const responseDeadline = (order.orderType === 'project' && kind === 'invoice')
      ? new Date(Date.now() + 7 * 86400000).toISOString()
      : undefined;

    const offer: WorkstreamOffer = {
      id: 'off_' + randomUUID().slice(0, 12),
      number: generateCollisionSafeOfferNumber(kind),
      orderId: order.id,
      originOrderId: order.id,
      workspaceId: order.workspaceId,
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
        originOrderId: order.id,
        ...(order.workspaceId ? { workspaceId: order.workspaceId } : {})
      }
    };
    await saveOfferToDb(offer);

    if (order.orderType === 'project' && kind === 'invoice') {
      createNotification({
        userId: order.buyerId,
        type: 'invoice_received',
        title: 'Invoice received',
        message: `You received an invoice of $${offer.amount} for "${order.title}". Please review within 7 days.`,
        link: `/workstream/${order.id}`,
        metadata: { orderId: order.id, offerId: offer.id }
      });
    } else if (order.orderType === 'project' && kind === 'proposal') {
      createNotification({
        userId: order.buyerId,
        type: 'proposal_received',
        title: 'Proposal received',
        message: `You received a proposal of $${offer.amount} for "${order.title}".`,
        link: `/workstream/${order.id}`,
        metadata: { orderId: order.id, offerId: offer.id }
      });
    }

    const deliverWorkRequested = Boolean(req.body?.deliverWork);
    const hasDeliveryEvidence = uploadedFiles.length > 0 || Boolean(rawRef) || (Array.isArray(order.deliverableFiles) && order.deliverableFiles.length > 0) || (Array.isArray(order.deliveryHistory) && order.deliveryHistory.length > 0);
    const isWorkableStatus = ['funded_in_escrow', 'in_progress', 'accepted'].includes(order.status);

    if (kind === 'invoice' && deliverWorkRequested && hasDeliveryEvidence && isWorkableStatus) {
      if (!order.deliverableFiles) order.deliverableFiles = [];
      if (!order.deliveryHistory) order.deliveryHistory = [];
      if (uploadedFiles.length > 0) order.deliverableFiles.push(...uploadedFiles);
      const version = order.deliveryHistory.length + 1;
      const sanitizedNotes = note ? escapeHtml(note) : escapeHtml(title);
      order.deliveryNotes = sanitizedNotes;
      if (rawRef) order.deliveryReference = rawRef;
      order.deliveryHistory.push({
        version,
        notes: sanitizedNotes,
        reference: rawRef || undefined,
        files: uploadedFiles,
        deliveredAt: new Date().toISOString()
      });
      order.status = 'delivered';
      if (Array.isArray(order.revisions)) {
        for (const rev of order.revisions) {
          if (rev.status === 'requested') rev.status = 'resolved';
        }
      }
      await store.saveOrder(order);
    }

    await postOfferMessage(order, offer, { id: caller.id, name: caller.name }, `New ${OFFER_LABEL[kind]} ${offer.number}: ${title}`, 'offer_created');
    res.status(201).json({ offer: await viewOffer(offer), order: enrichOrderWithServiceInfo(order) });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
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

      if (order.orderType === 'project') {
        await createNotification({
          userId: order.sellerId,
          type: 'invoice_paid',
          title: 'Invoice paid',
          message: `Invoice ${offer.number} for "${order.title}" ($${invoiceAmount}) was approved and paid.`,
          link: `/workstream/${order.id}`,
          metadata: { orderId: order.id, offerId: offer.id, amount: invoiceAmount },
          client
        }, client);
      }

      await syncUserBalances([order.buyerId, order.sellerId].filter(Boolean), client);
      await saveOfferToDb(offer, client);
      await store.saveOrder(order, client);
      const completionNote = additionalAmount > 0
        ? `${offer.number} ($${invoiceAmount.toLocaleString()}) was paid (+$${additionalAmount.toLocaleString()} funded from wallet) and full escrow ($${invoiceAmount.toLocaleString()}) was released to the seller. Order completed!`
        : `${offer.number} was accepted and escrow funds ($${invoiceAmount.toLocaleString()}) were released to the seller. Order completed!`;
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

router.post('/offers/:id/:action(accept|decline|cancel)', requireAuth, rateLimit(20, 60_000), async (req: Request, res: Response) => {
  const initialOffer = await store.getOfferById(req.params.id);
  if (!initialOffer) return res.status(404).json({ error: 'Not found' });
  const initialOrder = await store.getOrder(initialOffer.originOrderId || initialOffer.orderId);
  if (!initialOrder) return res.status(404).json({ error: 'Not found' });

  const lockedOrderId = initialOrder.id;
  if (!tryAcquireOrderLock(lockedOrderId, res)) return;
  try {
    const offer = await store.getOfferById(req.params.id);
    if (!offer) return res.status(404).json({ error: 'Not found' });
    const order = await store.getOrder(offer.originOrderId || offer.orderId);
    if (!order) return res.status(404).json({ error: 'Not found' });

    const caller = await offerCaller(req);
    if (!caller || (caller.status !== 'active' && caller.status !== 'restricted')) return res.status(403).json({ error: 'Account is not active' });
    if (!canAccessOrderWorkstream(caller, order)) return res.status(403).json({ error: 'Forbidden' });
    if (offer.status !== 'pending') {
      if (offer.status === 'accepted' || offer.status === 'paid') {
        const associatedOrder = await store.getOrder(offer.resultingOrderId || offer.orderId) || order;
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
          const existingOrder = (offer.resultingOrderId || offer.orderId) ? await store.getOrder(offer.resultingOrderId || offer.orderId) : null;
          return res.json({
            success: true,
            order: existingOrder ? enrichOrderWithServiceInfo(existingOrder) : null,
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
        if (!tryAcquireOrderLock(offer.id, res)) return;
        try {
          const clientId = caller.id;
          const sellerId = offer.createdBy;
          const offerAmount = Number(offer.amount);
          const offerTitle = offer.title || 'Custom Offer';

          if (!sellerId || !Number.isFinite(offerAmount) || offerAmount <= 0) {
            return res.status(400).json({ error: 'Invalid custom offer details.' });
          }

          await ensureWallet(clientId);
          await ensureWallet(sellerId);

          const newOrderId = 'ord_' + randomUUID().slice(0, 12);
          const today = new Date().toISOString().split('T')[0];
          const protectionDays = siteSettings.getSettings().commission.escrowProtectionDays || 14;

          const newOrder: Order = {
            id: newOrderId,
            workspaceId: offer.workspaceId || newOrderId,
            title: offerTitle,
            buyerId: clientId,
            sellerId: sellerId,
            amount: offerAmount,
            status: 'payment_pending',
            createdAt: today,
            dueDate: new Date(Date.now() + 7 * 86400000).toISOString(),
            escrowProtectionStartDate: today,
            escrowProtectionEndDate: new Date(Date.now() + protectionDays * 86400000).toISOString().split('T')[0],
            feeBreakdown: await quoteOrderWithLiveSettings(offerAmount)
          };

          await postgresStore.executeInTransaction(async (client) => {
            const offerLockRes = await client.query('SELECT status, order_id FROM workstream_offers WHERE id = $1 FOR UPDATE', [offer.id]);
            if (offerLockRes.rows.length > 0 && offerLockRes.rows[0].status !== 'pending') {
              throw new Error(`This offer is already ${offerLockRes.rows[0].status}.`);
            }

            await recordOrder(newOrder, client);
            await store.saveOrder(newOrder, client);

            await fundOrderEscrowWithEvent({
              orderId: newOrder.id,
              orderTitle: newOrder.title,
              amount: newOrder.amount,
              buyerId: newOrder.buyerId,
              sellerId: newOrder.sellerId,
              actor: `user:${caller.id}`,
              idempotencyKey
            }, client);

            const fundedRow = await store.getOrder(newOrder.id, client);
            if (fundedRow?.feeBreakdown) {
              newOrder.feeBreakdown = fundedRow.feeBreakdown;
              (newOrder as any).serviceFee = (fundedRow as any).serviceFee;
              (newOrder as any).smallOrderFee = (fundedRow as any).smallOrderFee;
            }

            newOrder.status = 'funded_in_escrow';
            await store.saveOrder(newOrder, client);
            await syncUserBalances([newOrder.buyerId, newOrder.sellerId].filter(Boolean), client);
            await emitSystemEvent(newOrder.id, 'order_created', `Order placed: ${newOrder.title}. Payment is held in escrow until the work is approved.`, {}, client);

            offer.status = 'accepted';
            offer.originOrderId = offer.originOrderId || newOrder.id;
            offer.resultingOrderId = newOrder.id;
            offer.workspaceId = newOrder.workspaceId;
            offer.orderId = newOrder.id;
            offer.resolvedAt = new Date().toISOString();
            offer.resolvedBy = caller.id;
            await saveOfferToDb(offer, client);
            await postOfferMessage(newOrder, offer, null, `${offer.number || 'Offer'} was accepted and escrow was funded ($${offer.amount}).`, 'offer_accepted', client);
          });

          return res.json({ success: true, order: enrichOrderWithServiceInfo(newOrder), offer: await viewOffer(offer) });
        } catch (err: any) {
          return res.status(400).json({ error: err.message || 'Failed to fund escrow for custom offer' });
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
              ? await store.getOrder(targetOffer.resultingOrderId || targetOffer.orderId)
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


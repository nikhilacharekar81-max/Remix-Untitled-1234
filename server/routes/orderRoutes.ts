import { Router, Request, Response } from 'express';
import { createHash, randomUUID } from 'crypto';
import {
  DEFAULT_SITE_SETTINGS,
  siteSettings,
  store,
  type ExtensionRequest,
  type Message,
  type Dispute,
  type Order,
  type User,
  type WorkstreamOffer
} from '../store.js';
import { calculateOrderFees, quoteOrderWithLiveSettings } from '../domains/finance/fees.js';
import { checkOrRecordIdempotency, recordIdempotencyResult } from '../domains/finance/index.js';
import { postgresStore } from '../db/postgresStore.js';
import { financialRepository, financialTransactionService } from '../domains/finance/financial.service.js';
import { recordOutboxEvent } from '../services/outboxService.js';
import {
  requireAuth,
  requireActiveStatus,
  requireRole,
  requireAdmin,
  adminActor,
  rateLimit,
  resolveAuthenticatedUserId,
  safeUser,
  orderParticipantSafeUser,
  isStaffUser,
  formatApiError,
  escapeHtml
} from '../middleware/auth.js';
import {
  tryAcquireOrderLock,
  releaseOrderLock,
  recordOrder,
  resolveGigOrderPrice,
  enrichOrderWithServiceInfo,
  releaseOrderFunds,
  refundOrderFunds,
  splitOrderFunds,
  fundOrderEscrowWithEvent,
  syncUserBalances,
  ensureWallet,
  registerAuditLog,
  getActiveEscrowRemaining,
  LATE_ORDER_PROTECTION_HOURS,
  parseDeadlineInstant,
  calculateExtendedDeadline
} from '../services/orderService.js';
import { broadcastMessage } from '../websocket.js';
import {
  createNotification,
  sendOrderEmail,
  notifyOrderParties
} from '../services/notificationService.js';
import {
  recordMessage,
  emitSystemEvent,
  pushSystemMessage
} from '../services/messagingService.js';
import { closeActiveDispute } from '../services/disputeService.js';
import {
  orderHasEscrow,
  viewOffer,
  postOfferMessage,
  validateStoredWorkstreamFiles,
  cancelPendingOffersForOrder,
  generateCollisionSafeOfferNumber
} from '../services/workstreamService.js';
import { workspaceService } from '../../src/server/workspaceService.js';
import { handleSubmitReview } from './reviewRoutes.js';

const router = Router();

// Orders List - Directly querying PostgreSQL
router.get('/orders', requireAuth, requireActiveStatus, async (req: Request, res: Response) => {
  try {
    const authUserId = resolveAuthenticatedUserId(req)!;
    const caller = await store.getUser(authUserId);
    const isAdmin = caller?.role === 'admin' || caller?.role === 'super_admin' || caller?.role === 'support';

    const pool = postgresStore.getPool();
    const inqRes = await pool.query(
      isAdmin
        ? `SELECT * FROM workspaces WHERE (metadata->>'isInquiry') = 'true'`
        : `SELECT * FROM workspaces WHERE (buyer_id = $1 OR seller_id = $1) AND (metadata->>'isInquiry') = 'true'`,
      isAdmin ? [] : [authUserId]
    );

    const dbOrders = isAdmin ? await store.listOrders() : await store.listOrdersForUser(authUserId);
    const wsIdsWithRealOrders = new Set(dbOrders.map(o => o.workspaceId).filter(Boolean));

    const inqOrders: Order[] = inqRes.rows
      .filter(ws => !wsIdsWithRealOrders.has(ws.workspace_id))
      .map(ws => {
        const meta = typeof ws.metadata === 'string' ? JSON.parse(ws.metadata) : (ws.metadata || {});
        return {
          id: ws.workspace_id,
          workspaceId: ws.workspace_id,
          title: ws.title || 'Inquiry',
          buyerId: ws.buyer_id,
          sellerId: ws.seller_id,
          amount: 0,
          status: 'in_progress' as const,
          createdAt: ws.created_at,
          dueDate: new Date(Date.now() + 7 * 86400000).toISOString(),
          isInquiry: true,
          gigId: meta.originType === 'gig' ? meta.originId : undefined,
          projectId: meta.originType === 'project' ? meta.originId : undefined,
          originType: meta.originType
        } as any;
      });

    const ordersList = [...dbOrders, ...inqOrders];
    const orderIds = ordersList.map(o => o.id);
    const wsIds = Array.from(new Set(ordersList.map(o => o.workspaceId).filter(Boolean))) as string[];
    const userIds = Array.from(new Set(ordersList.flatMap(o => [o.buyerId, o.sellerId]).filter(Boolean)));

    if (ordersList.length === 0) {
      return res.json([]);
    }

    const [usersList, msgsRes] = await Promise.all([
      userIds.length > 0
        ? Promise.all(userIds.map(id => store.getUser(id)))
        : Promise.resolve([]),
      (orderIds.length > 0 || wsIds.length > 0)
        ? pool.query(`
            SELECT id, order_id, workspace_id, metadata->>'workspaceId' AS meta_ws_id, text, timestamp
            FROM messages
            WHERE (order_id IS NOT NULL AND order_id = ANY($1::text[]))
               OR (order_id IS NULL AND (workspace_id = ANY($2::text[]) OR (metadata->>'workspaceId') = ANY($2::text[])))
            ORDER BY timestamp DESC
          `, [
            orderIds.length > 0 ? orderIds : ['__none__'],
            wsIds.length > 0 ? wsIds : ['__none__']
          ])
        : Promise.resolve({ rows: [] as any[] })
    ]);

    const latestMsgMap = new Map<string, { text: string; timestamp: string }>();
    const orderIdSet = new Set(orderIds);

    const ordersByWs = new Map<string, Order[]>();
    for (const ord of ordersList) {
      if (ord.workspaceId) {
        const list = ordersByWs.get(ord.workspaceId) || [];
        list.push(ord);
        ordersByWs.set(ord.workspaceId, list);
      }
    }

    for (const msgRow of msgsRes.rows) {
      const msgTime = new Date(msgRow.timestamp || 0).getTime();
      if (msgRow.order_id && orderIdSet.has(msgRow.order_id)) {
        const current = latestMsgMap.get(msgRow.order_id);
        const currTime = current ? new Date(current.timestamp || 0).getTime() : -1;
        if (!current || msgTime > currTime) {
          latestMsgMap.set(msgRow.order_id, { text: msgRow.text, timestamp: msgRow.timestamp });
        }
      } else if (!msgRow.order_id) {
        const targetWsId = msgRow.workspace_id || msgRow.meta_ws_id;
        if (targetWsId) {
          if (orderIdSet.has(targetWsId)) {
            const current = latestMsgMap.get(targetWsId);
            const currTime = current ? new Date(current.timestamp || 0).getTime() : -1;
            if (!current || msgTime > currTime) {
              latestMsgMap.set(targetWsId, { text: msgRow.text, timestamp: msgRow.timestamp });
            }
          }
          const matchingOrders = ordersByWs.get(targetWsId) || [];
          for (const ord of matchingOrders) {
            const current = latestMsgMap.get(ord.id);
            const currTime = current ? new Date(current.timestamp || 0).getTime() : -1;
            if (!current || msgTime > currTime) {
              latestMsgMap.set(ord.id, { text: msgRow.text, timestamp: msgRow.timestamp });
            }
          }
        }
      }
    }

    const userMap = new Map((usersList.filter(Boolean) as User[]).map(u => [u.id, u]));

    const userOrders: Order[] = ordersList.map(order => {
      const buyerUser = userMap.get(order.buyerId);
      const sellerUser = userMap.get(order.sellerId);
      const lastMsg = latestMsgMap.get(order.id);
      return {
        ...order,
        sellerUsername: order.sellerUsername || sellerUser?.username || undefined,
        buyerUsername: order.buyerUsername || buyerUser?.username || undefined,
        sellerName: sellerUser?.name || order.sellerUsername || 'Seller',
        sellerAvatar: sellerUser?.avatar || '',
        buyerName: buyerUser?.name || order.buyerUsername || 'Buyer',
        buyerAvatar: buyerUser?.avatar || '',
        buyer: buyerUser ? (isAdmin ? safeUser(buyerUser) : orderParticipantSafeUser(buyerUser)) : undefined,
        seller: sellerUser ? (isAdmin ? safeUser(sellerUser) : orderParticipantSafeUser(sellerUser)) : undefined,
        lastMessage: lastMsg?.text || undefined,
        lastMessageTime: lastMsg?.timestamp ? new Date(lastMsg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : undefined,
      };
    });

    res.json(userOrders.map(o => enrichOrderWithServiceInfo(o, isAdmin)));
  } catch (err: any) {
    res.status(500).json(formatApiError(err, 'Failed to list orders'));
  }
});

// Single Order Workspace Detail - Directly querying PostgreSQL
router.get('/orders/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    let order = await store.getOrder(req.params.id);
    if (!order) {
      const ws = await workspaceService.getWorkspaceAsync(req.params.id);
      if (ws?.activeOrderId) {
        order = (await store.getOrder(ws.activeOrderId)) || undefined;
      }
      if (!order && ws && ((ws as any).metadata?.isInquiry || (ws as any).metadata?.isInquiry === 'true')) {
        const meta = typeof (ws as any).metadata === 'string' ? JSON.parse((ws as any).metadata) : ((ws as any).metadata || {});
        order = {
          id: ws.workspaceId,
          workspaceId: ws.workspaceId,
          title: (ws as any).title || 'Inquiry',
          buyerId: ws.buyerId,
          sellerId: ws.sellerId,
          amount: 0,
          status: 'in_progress',
          createdAt: ws.createdAt,
          dueDate: new Date(Date.now() + 7 * 86400000).toISOString(),
          isInquiry: true,
          gigId: meta.originType === 'gig' ? meta.originId : undefined,
          projectId: meta.originType === 'project' ? meta.originId : undefined,
          originType: meta.originType
        } as any;
      } else if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }
    }
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const authUserId = resolveAuthenticatedUserId(req)!;
    const caller = await store.getUser(authUserId);
    const isAdmin = isStaffUser(caller);
    if (!isAdmin && order.buyerId !== authUserId && order.sellerId !== authUserId) {
      return res.status(403).json({ error: 'Forbidden: Access to this order is restricted to participants.' });
    }

    const enriched = enrichOrderWithServiceInfo(order, isAdmin);
    const [buyer, seller, wsMessages, directMessages, dispute] = await Promise.all([
      store.getUser(order.buyerId),
      store.getUser(order.sellerId),
      order.workspaceId ? store.listMessagesForWorkspace(order.workspaceId) : Promise.resolve([]),
      store.listMessages(order.id),
      store.getDisputeByOrderId(order.id)
    ]);
    const orderMessages = wsMessages.length > 0 ? wsMessages : directMessages;

    res.json({
      ...enriched,
      buyer: buyer ? (isAdmin ? safeUser(buyer) : orderParticipantSafeUser(buyer)) : null,
      seller: seller ? (isAdmin ? safeUser(seller) : orderParticipantSafeUser(seller)) : null,
      messages: orderMessages,
      dispute
    });
  } catch (err: any) {
    res.status(500).json(formatApiError(err, 'Failed to get order details'));
  }
});

// Single Order Immutable Invoice / Receipt
router.get('/orders/:id/invoice', requireAuth, async (req: Request, res: Response) => {
  try {
    const order = await store.getOrder(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const authUserId = resolveAuthenticatedUserId(req)!;
    const caller = await store.getUser(authUserId);
    const isAdmin = isStaffUser(caller);
    if (!isAdmin && order.buyerId !== authUserId && order.sellerId !== authUserId) {
      return res.status(403).json({ error: 'Forbidden: Access to this invoice is restricted to order participants.' });
    }

    const [buyer, seller] = await Promise.all([
      store.getUser(order.buyerId),
      store.getUser(order.sellerId)
    ]);

    const createdClean = (order.createdAt || '').slice(0, 10).replace(/-/g, '') || new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const shortOrdId = (order.id || '').replace(/^ord_/, '').toUpperCase().slice(0, 8);
    const invoiceNumber = `INV-${createdClean}-${shortOrdId}`;

    const rawAmount = Number(order.amount || 0);
    const serviceFee = Number((order as any).serviceFee ?? order.feeBreakdown?.buyerFee ?? order.feeBreakdown?.serviceFee ?? 0);
    const smallOrderFee = Number((order as any).smallOrderFee ?? order.feeBreakdown?.smallOrderFee ?? 0);
    const platformCommission = Number(order.feeBreakdown?.platformCommission ?? 0);
    const buyerTotal = Math.round((rawAmount + serviceFee + smallOrderFee) * 100) / 100;
    const sellerNet = Math.max(0, Math.round((rawAmount - platformCommission) * 100) / 100);

    const invoice = {
      id: `inv_${order.id}`,
      invoiceNumber,
      orderId: order.id,
      workspaceId: order.workspaceId || `ws-${order.id}`,
      title: order.title,
      status: order.status === 'completed' ? 'paid' : order.status === 'cancelled' ? 'refunded' : 'in_escrow',
      issueDate: (order.createdAt || new Date().toISOString()).slice(0, 10),
      dueDate: (order.dueDate || order.createdAt || new Date().toISOString()).slice(0, 10),
      completedAt: order.completedAt || null,
      buyer: {
        id: order.buyerId,
        name: buyer?.name || (order as any).buyerUsername || 'Buyer',
        email: buyer?.email || 'buyer@fivepa.com',
        country: (buyer as any)?.country || 'Global'
      },
      seller: {
        id: order.sellerId,
        name: seller?.name || (order as any).sellerUsername || 'Seller',
        email: seller?.email || 'seller@fivepa.com',
        country: (seller as any)?.country || 'Global'
      },
      items: [
        {
          description: order.title,
          quantity: 1,
          unitPrice: rawAmount,
          amount: rawAmount
        },
        ...(Array.isArray((order as any).selectedExtras) && (order as any).selectedExtras.length > 0
          ? (order as any).selectedExtras.map((ex: any) => ({
              description: `Extra: ${ex.title || 'Add-on service'}`,
              quantity: 1,
              unitPrice: Number(ex.price || 0),
              amount: Number(ex.price || 0)
            }))
          : [])
      ],
      subtotal: rawAmount,
      serviceFee,
      smallOrderFee,
      tax: 0,
      buyerTotal,
      platformCommission,
      sellerNet,
      currency: 'USD',
      notes: 'FivePA 100% Protected Escrow Transaction. Funds held safely in escrow until client approval.'
    };

    res.json(invoice);
  } catch (err: any) {
    res.status(500).json(formatApiError(err, 'Failed to generate order invoice'));
  }
});

// Create Order / Inquiry
router.post('/orders', requireAuth, requireActiveStatus, rateLimit(30, 60_000), async (req: Request, res: Response) => {
  const caller = (req as any).authenticatedUser;
  if (caller.status === 'restricted') {
    return res.status(403).json({ error: 'Restricted: You cannot purchase new services while your account is restricted.' });
  }

  try {
    const authUserId = (req as any).authenticatedUserId;
    const userCaller = (req as any).authenticatedUser || (await store.getUser(authUserId));
    if (!userCaller || (userCaller.status !== 'active' && userCaller.status !== 'restricted')) {
      return res.status(403).json({ error: 'Account is not active' });
    }

    const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
    if (title.length < 3) return res.status(400).json({ error: 'A valid order title is required.' });
    const isAdminCaller = userCaller.role === 'admin' || userCaller.role === 'super_admin';
    const requestedBuyerId = isAdminCaller && typeof req.body?.buyerId === 'string' && req.body.buyerId.trim()
      ? req.body.buyerId.trim()
      : userCaller.id;
    const buyer = requestedBuyerId === userCaller.id ? userCaller : await store.getUser(requestedBuyerId);
    if (!buyer) return res.status(404).json({ error: 'Buyer account not found.' });
    const buyerId = buyer.id;
    const sellerId = String(req.body?.sellerId || '');

    const seller = await store.getUser(sellerId);
    if (!seller) return res.status(404).json({ error: 'Seller not found.' });
    if (buyerId === sellerId) return res.status(400).json({ error: 'You cannot order from yourself.' });

    await ensureWallet(buyerId);
    await ensureWallet(sellerId);
    if (buyer.status !== 'active' || seller.status !== 'active') {
      return res.status(403).json({ error: 'Both accounts must be active to place an order.' });
    }

    if (req.body?.gigId && req.body?.projectId) {
      return res.status(400).json({ error: 'Order cannot specify both gigId and projectId.' });
    }

    let rawAmount = Number(req.body?.amount);
    const isInquiry = Boolean(req.body?.isInquiry === true || req.body?.type === 'inquiry' || req.body?.metadata?.isInquiry === true);
    if (isInquiry) rawAmount = 0;

    const resolvedOriginType: 'gig' | 'project' | 'profile' = req.body?.projectId
      ? 'project'
      : (req.body?.gigId ? 'gig' : 'profile');
    const resolvedOriginId = req.body?.projectId || req.body?.gigId || sellerId;

    if (isInquiry && !req.body?.workspaceId && !req.body?.forceNew) {
      const existingInqRes = await postgresStore.getPool().query(
        `SELECT * FROM workspaces
         WHERE buyer_id = $1
           AND seller_id = $2
           AND (metadata->>'originType') = $3
           AND (metadata->>'originId') = $4
           AND (metadata->>'isInquiry') = 'true'
         ORDER BY updated_at DESC, created_at DESC
         LIMIT 1`,
        [buyerId, sellerId, resolvedOriginType, resolvedOriginId]
      );
      if (existingInqRes.rows.length > 0) {
        const matchedWs = existingInqRes.rows[0];
        const inqItem: any = {
          id: matchedWs.workspace_id,
          workspaceId: matchedWs.workspace_id,
          title: matchedWs.title,
          buyerId: matchedWs.buyer_id,
          sellerId: matchedWs.seller_id,
          amount: 0,
          status: 'in_progress',
          createdAt: matchedWs.created_at,
          dueDate: new Date(Date.now() + 7 * 86400000).toISOString(),
          isInquiry: true,
          originType: resolvedOriginType,
          originId: resolvedOriginId,
          gigId: req.body?.gigId,
          projectId: req.body?.projectId
        };
        return res.status(200).json(enrichOrderWithServiceInfo(inqItem));
      }
    }

    const rawIdempKey = String(
      req.headers['idempotency-key'] ||
      req.headers['x-idempotency-key'] ||
      req.body?.idempotencyKey ||
      req.body?.requestKey ||
      req.body?.clientRequestId ||
      ''
    ).trim();

    const isPaidGig = Boolean(req.body?.gigId) && !isInquiry;
    if (isPaidGig && !rawIdempKey) {
      return res.status(400).json({ error: 'Idempotency-Key header is required for paid Gig purchase requests.' });
    }

    const scopedIdempKey = rawIdempKey ? `ORD-CREATE:${buyerId}:${rawIdempKey}` : '';

    const id = scopedIdempKey
      ? 'ord_' + createHash('sha256').update(scopedIdempKey).digest('hex').slice(0, 12)
      : 'ord_' + randomUUID().slice(0, 12);
    const today = new Date().toISOString().split('T')[0];

    const normalizedExtraIds = Array.isArray(req.body?.extraIds)
      ? Array.from(new Set(req.body.extraIds.map(String).filter(Boolean))).sort()
      : [];

    let resolvedGigRow: any = null;
    let selectedExtrasDetails: any[] = [];
    let totalDeliveryDaysFromGig: number | null = null;
    if (req.body?.gigId) {
      if (!isInquiry) {
        const { gig: gigRow, gigPrice, selectedExtrasDetails: resolvedExtras, totalDeliveryDays } = await resolveGigOrderPrice(req.body.gigId, normalizedExtraIds);
        resolvedGigRow = gigRow;
        selectedExtrasDetails = resolvedExtras || [];
        totalDeliveryDaysFromGig = totalDeliveryDays;
        if (gigRow.freelancer_id !== sellerId) {
          return res.status(400).json({ error: 'This gig does not belong to the selected seller.' });
        }
        rawAmount = gigPrice;
      } else {
        const gig = await store.getGig(req.body.gigId);
        if (!gig) return res.status(404).json({ error: 'Gig not found.' });
        if (gig.freelancerId !== sellerId && (gig as any).sellerId !== sellerId) {
          return res.status(400).json({ error: 'This gig does not belong to the selected seller.' });
        }
      }
    } else if (req.body?.projectId) {
      const proj = await store.getProject(req.body.projectId);
      if (!proj) return res.status(404).json({ error: 'Project not found.' });
      const projOwner = (proj as any).clientId || proj.buyerId;
      if (projOwner !== buyerId) {
        return res.status(403).json({ error: 'Only the project owner can create an order for this project.' });
      }

      if (!isInquiry) {
        let proposalQuery = `SELECT * FROM proposals WHERE project_id = $1 AND freelancer_id = $2 AND status = 'accepted'`;
        const proposalParams: any[] = [req.body.projectId, sellerId];
        if (req.body?.proposalId) {
          proposalQuery += ` AND id = $3`;
          proposalParams.push(req.body.proposalId);
        }
        proposalQuery += ` ORDER BY created_at DESC LIMIT 1`;
        const propRes = await postgresStore.getPool().query(proposalQuery, proposalParams);
        if (propRes.rows.length === 0) {
          return res.status(400).json({ error: 'No valid proposal found for this freelancer on the specified project.' });
        }
        const proposal = propRes.rows[0];
        rawAmount = Number(proposal.bid_amount);
      } else {
        const sellerUser = await store.getUser(sellerId);
        if (!sellerUser) {
          return res.status(400).json({ error: 'Selected seller not found.' });
        }
      }
    }

    if (!isInquiry) {
      if (!Number.isFinite(rawAmount) || rawAmount < 10.00) {
        return res.status(400).json({ error: 'Minimum order amount is $10.00.' });
      }
    }

    const orderPayloadFingerprint = {
      buyerId,
      sellerId,
      title,
      gigId: req.body?.gigId || null,
      projectId: req.body?.projectId || null,
      proposalId: req.body?.proposalId || null,
      extraIds: normalizedExtraIds,
      amount: isInquiry ? 0 : rawAmount,
      isInquiry
    };

    const requirements = typeof req.body?.requirements === 'string' ? escapeHtml(req.body.requirements.trim()).slice(0, 2000) : '';

    let deliveryDays = 10;
    if (req.body?.gigId) {
      if (totalDeliveryDaysFromGig !== null) {
        deliveryDays = Math.max(1, Math.min(365, totalDeliveryDaysFromGig));
      } else {
        const gig = await store.getGig(req.body.gigId);
        if (gig && Number(gig.deliveryDays) > 0) {
          deliveryDays = Math.max(1, Math.min(365, Number(gig.deliveryDays)));
        }
      }
    } else if (req.body?.projectId) {
      const proj = await store.getProject(req.body.projectId);
      if (proj && Number(proj.deadlineDays) > 0) {
        deliveryDays = Math.max(1, Math.min(365, Number(proj.deadlineDays)));
      }
    }
    const serverDerivedDueDate = new Date(Date.now() + deliveryDays * 86400000).toISOString();

    const isGig = Boolean(req.body?.gigId);
    const isProject = Boolean(req.body?.projectId);
    const orderType: 'gig' | 'project' | undefined = isGig ? 'gig' : (isProject ? 'project' : undefined);
    const gigOrderId = isGig ? id : undefined;
    const projectOrderId = isProject ? id : undefined;

    const txResult = await postgresStore.executeInTransaction(async (client) => {
      if (scopedIdempKey) {
        const idempCheck = await checkOrRecordIdempotency(client, scopedIdempKey, 'createOrder', orderPayloadFingerprint);
        if (idempCheck.replayed) {
          return { replayed: true, result: idempCheck.result };
        }
      }

      if (isInquiry) {
        const lockKey = `inquiry:${buyerId}:${sellerId}:${resolvedOriginType}:${resolvedOriginId}`;
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [lockKey]);

        if (!req.body?.workspaceId && !req.body?.forceNew) {
          const inqLockRes = await client.query(
            `SELECT * FROM workspaces
             WHERE buyer_id = $1
               AND seller_id = $2
               AND (metadata->>'originType') = $3
               AND (metadata->>'originId') = $4
               AND (metadata->>'isInquiry') = 'true'
             ORDER BY updated_at DESC, created_at DESC
             LIMIT 1
             FOR UPDATE`,
            [buyerId, sellerId, resolvedOriginType, resolvedOriginId]
          );
          if (inqLockRes.rows.length > 0) {
            const matchedWs = inqLockRes.rows[0];
            const inqItem: any = {
              id: matchedWs.workspace_id,
              workspaceId: matchedWs.workspace_id,
              title: matchedWs.title,
              buyerId: matchedWs.buyer_id,
              sellerId: matchedWs.seller_id,
              amount: 0,
              status: 'in_progress',
              createdAt: matchedWs.created_at,
              dueDate: new Date(Date.now() + 7 * 86400000).toISOString(),
              isInquiry: true,
              originType: resolvedOriginType,
              originId: resolvedOriginId,
              gigId: req.body?.gigId,
              projectId: req.body?.projectId
            };
            return { replayed: true, result: enrichOrderWithServiceInfo(inqItem) };
          }
        }

        const workspaceId = req.body?.workspaceId || ('ws_' + randomUUID().slice(0, 12));
        const metadata = {
          originType: resolvedOriginType,
          originId: resolvedOriginId,
          isInquiry: true,
          status: 'active'
        };

        const insertWsRes = await client.query(
          `INSERT INTO workspaces (workspace_id, buyer_id, seller_id, order_ids, title, created_at, updated_at, metadata)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (buyer_id, seller_id, (metadata->>'originType'), (metadata->>'originId')) WHERE (metadata->>'isInquiry') = 'true'
           DO UPDATE SET updated_at = EXCLUDED.updated_at
           RETURNING *`,
          [
            workspaceId,
            buyerId,
            sellerId,
            JSON.stringify([]),
            title,
            today,
            new Date().toISOString(),
            JSON.stringify(metadata)
          ]
        );
        const createdWs = insertWsRes.rows[0];
        const inqItem: any = {
          id: createdWs.workspace_id,
          workspaceId: createdWs.workspace_id,
          title: createdWs.title,
          buyerId: createdWs.buyer_id,
          sellerId: createdWs.seller_id,
          amount: 0,
          status: 'in_progress',
          createdAt: createdWs.created_at,
          dueDate: new Date(Date.now() + 7 * 86400000).toISOString(),
          isInquiry: true,
          originType: resolvedOriginType,
          originId: resolvedOriginId,
          gigId: req.body?.gigId,
          projectId: req.body?.projectId
        };

        if (scopedIdempKey) {
          await recordIdempotencyResult(client, scopedIdempKey, 'createOrder', inqItem, orderPayloadFingerprint);
        }

        return { replayed: false, result: enrichOrderWithServiceInfo(inqItem) };
      }

      let workspaceId: string;
      if (isGig) {
        workspaceId = 'ws_' + randomUUID().slice(0, 12);
        await client.query(
          `INSERT INTO workspaces (workspace_id, buyer_id, seller_id, order_ids, title, created_at, updated_at, metadata)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (workspace_id) DO UPDATE SET
             order_ids = (
               SELECT COALESCE(jsonb_agg(elem ORDER BY min_ord), '[]'::jsonb)
               FROM (
                 SELECT elem, MIN(ord) AS min_ord
                 FROM (
                   SELECT elem, ord FROM jsonb_array_elements_text(COALESCE(workspaces.order_ids, '[]'::jsonb)) WITH ORDINALITY AS t1(elem, ord)
                   UNION ALL
                   SELECT elem, ord + 1000000 FROM jsonb_array_elements_text(EXCLUDED.order_ids) WITH ORDINALITY AS t2(elem, ord)
                 ) combined
                 GROUP BY elem
               ) deduped
             )`,
           [workspaceId, buyerId, sellerId, JSON.stringify([id]), title, today, new Date().toISOString(), JSON.stringify({ originType: 'gig', originId: req.body?.gigId || id, status: 'active', activeOrderId: id, isInquiry: false })]
        );
      } else if (req.body?.workspaceId) {
        const wsRes = await client.query('SELECT * FROM workspaces WHERE workspace_id = $1 FOR UPDATE', [req.body.workspaceId]);
        if (wsRes.rows.length === 0) throw new Error('Workspace not found.');
        const ws = wsRes.rows[0];
        if (ws.buyer_id !== buyerId || ws.seller_id !== sellerId) {
          throw new Error('The provided workspace does not match the buyer and seller of this order.');
        }
        workspaceId = ws.workspace_id;
        const currentMeta = typeof ws.metadata === 'string' ? JSON.parse(ws.metadata) : (ws.metadata || {});
        const updatedMeta = { ...currentMeta, activeOrderId: id, status: 'active' };
        await client.query(
          `UPDATE workspaces SET
             order_ids = (
               SELECT COALESCE(jsonb_agg(elem ORDER BY min_ord), '[]'::jsonb)
               FROM (
                 SELECT elem, MIN(ord) AS min_ord
                 FROM (
                   SELECT elem, ord FROM jsonb_array_elements_text(COALESCE(workspaces.order_ids, '[]'::jsonb)) WITH ORDINALITY AS t1(elem, ord)
                   UNION ALL
                   SELECT elem, ord + 1000000 FROM jsonb_array_elements_text($1::jsonb) WITH ORDINALITY AS t2(elem, ord)
                 ) combined
                 GROUP BY elem
               ) deduped
             ),
             updated_at = $2,
             last_activity_at = $2,
             metadata = $3
           WHERE workspace_id = $4`,
          [JSON.stringify([id]), new Date().toISOString(), JSON.stringify(updatedMeta), workspaceId]
        );
      } else {
        workspaceId = 'ws_' + randomUUID().slice(0, 12);
        const resolvedOriginType: 'gig' | 'project' | 'profile' = isProject
          ? 'project'
          : (req.body?.originType === 'profile' || (!isGig && !isProject) ? 'profile' : 'gig');
        const resolvedOriginId = isProject
          ? (req.body?.projectId || id)
          : (resolvedOriginType === 'profile' ? sellerId : (req.body?.gigId || id));

        await client.query(
          `INSERT INTO workspaces (workspace_id, buyer_id, seller_id, order_ids, title, created_at, updated_at, metadata)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (workspace_id) DO UPDATE SET
             order_ids = (
               SELECT COALESCE(jsonb_agg(elem ORDER BY min_ord), '[]'::jsonb)
               FROM (
                 SELECT elem, MIN(ord) AS min_ord
                 FROM (
                   SELECT elem, ord FROM jsonb_array_elements_text(COALESCE(workspaces.order_ids, '[]'::jsonb)) WITH ORDINALITY AS t1(elem, ord)
                   UNION ALL
                   SELECT elem, ord + 1000000 FROM jsonb_array_elements_text(EXCLUDED.order_ids) WITH ORDINALITY AS t2(elem, ord)
                 ) combined
                 GROUP BY elem
               ) deduped
             )`,
          [workspaceId, buyerId, sellerId, JSON.stringify([id]), title, today, new Date().toISOString(), JSON.stringify({ originType: resolvedOriginType, originId: resolvedOriginId, status: 'active', activeOrderId: id, isInquiry: false })]
        );
      }

      const newOrd: Order = {
        id,
        workspaceId,
        ...(orderType ? { orderType } : {}),
        ...(gigOrderId ? { gigOrderId } : {}),
        ...(projectOrderId ? { projectOrderId } : {}),
        title,
        buyerId,
        sellerId,
        amount: rawAmount,
        status: 'payment_pending',
        createdAt: today,
        dueDate: serverDerivedDueDate,
        escrowProtectionStartDate: today,
        escrowProtectionEndDate: new Date(Date.now() + (siteSettings.getSettings().commission.escrowProtectionDays || DEFAULT_SITE_SETTINGS.commission.escrowProtectionDays) * 86400000).toISOString().split('T')[0],
        gigId: req.body.gigId,
        projectId: req.body.projectId,
        feeBreakdown: await quoteOrderWithLiveSettings(rawAmount).catch(() => calculateOrderFees(rawAmount)),
        ...(requirements ? { requirements } : {}),
        selectedExtras: selectedExtrasDetails
      };

      const serviceFee = newOrd.serviceFee ?? (newOrd.feeBreakdown as any)?.buyerFee ?? 0;
      const smallOrderFee = newOrd.smallOrderFee ?? (newOrd.feeBreakdown as any)?.smallOrderFee ?? 0;

      await client.query(
        `INSERT INTO orders (
          id, title, buyer_id, seller_id, client_id, freelancer_id, amount, status, created_at, due_date, completed_at, 
          requirements, deliverables, deliverable_files, revisions, admin_notes, is_muted, 
          escrow_protection_start_date, escrow_protection_end_date, gig_id, project_id, 
          service_url, gig_slug, seller_username, buyer_username, service_title, service_thumbnail, 
          is_timer_paused, fee_breakdown, delivery_history, delivery_notes, delivery_reference, 
          accepted_version, review_window_days, review_window_expires_at, review,
          workspace_id, seller_review, previous_status,
          order_type, gig_order_id, project_order_id, proposal_id,
          extension_requests, free_extension_used, cancellation_request, cancellation_history,
          cancellation_type, review_window_restarted_at, response_deadline,
          service_fee, small_order_fee, selected_extras, updated_at
        ) VALUES (
          $1, $2, $3, $4, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19,
          $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37,
          $38, $39, $40, $41, $42, $43, $44, $45, $46, $47, $48,
          $49, $50, $51, NOW()
        ) ON CONFLICT (id) DO UPDATE SET
          title = EXCLUDED.title,
          client_id = COALESCE(EXCLUDED.client_id, orders.client_id, EXCLUDED.buyer_id),
          freelancer_id = COALESCE(EXCLUDED.freelancer_id, orders.freelancer_id, EXCLUDED.seller_id),
          amount = EXCLUDED.amount,
          service_fee = EXCLUDED.service_fee,
          small_order_fee = EXCLUDED.small_order_fee,
          selected_extras = EXCLUDED.selected_extras,
          status = CASE WHEN orders.status IN ('completed', 'cancelled', 'refunded') THEN orders.status ELSE EXCLUDED.status END,
          updated_at = NOW()`,
        [
          newOrd.id, newOrd.title, newOrd.buyerId, newOrd.sellerId, newOrd.amount, newOrd.status,
          newOrd.createdAt, newOrd.dueDate, newOrd.completedAt || null, newOrd.requirements || null,
          newOrd.deliverables || null, JSON.stringify(newOrd.deliverableFiles || []),
          JSON.stringify(newOrd.revisions || []), newOrd.adminNotes || null, newOrd.isMuted || false,
          newOrd.escrowProtectionStartDate || null, newOrd.escrowProtectionEndDate || null,
          newOrd.gigId || null, newOrd.projectId || null, newOrd.serviceUrl || null,
          newOrd.gigSlug || null, newOrd.sellerUsername || null, newOrd.buyerUsername || null,
          newOrd.serviceTitle || null, newOrd.serviceThumbnail || null, newOrd.isTimerPaused || false,
          JSON.stringify(newOrd.feeBreakdown || null), JSON.stringify(newOrd.deliveryHistory || []),
          newOrd.deliveryNotes || null, newOrd.deliveryReference || null, newOrd.acceptedVersion ?? null,
          newOrd.reviewWindowDays ?? null, newOrd.reviewWindowExpiresAt || null, JSON.stringify(newOrd.review || null),
          workspaceId, JSON.stringify((newOrd as any).sellerReview || null), (newOrd as any).previousStatus || null,
          orderType || 'gig', newOrd.gigOrderId || null, newOrd.projectOrderId || null, newOrd.proposalId || null,
          JSON.stringify(newOrd.extensionRequests || []), Boolean(newOrd.freeExtensionUsed),
          JSON.stringify(newOrd.cancellationRequest || null), JSON.stringify(newOrd.cancellationHistory || []),
          newOrd.cancellationType || null, newOrd.reviewWindowRestartedAt || null, newOrd.responseDeadline || null,
          serviceFee, smallOrderFee, JSON.stringify(selectedExtrasDetails)
        ]
      );

      const enriched = enrichOrderWithServiceInfo(newOrd);

      if (!isInquiry) {
        try {
          await financialTransactionService.fundEscrow({
            orderId: id,
            orderTitle: title,
            amount: rawAmount,
            buyerId,
            sellerId,
            actor: `user:${buyerId}`,
            idempotencyKey: scopedIdempKey ? `${scopedIdempKey}:fund` : undefined
          }, client);

          enriched.status = 'funded_in_escrow';
          await client.query('UPDATE orders SET status = $1 WHERE id = $2', ['funded_in_escrow', id]);
          await syncUserBalances([buyerId, sellerId].filter(Boolean), client);
          await recordOutboxEvent(client, 'ORDER_ESCROW_FUNDED', 'order', id, {
            title,
            amount: rawAmount,
            buyerId,
            sellerId
          });
        } catch (fundingErr: any) {
          throw new Error(fundingErr.message || 'Failed to fund escrow.');
        }
      }

      if (scopedIdempKey) {
        await recordIdempotencyResult(client, scopedIdempKey, 'createOrder', enriched, orderPayloadFingerprint);
      }

      return { replayed: false, result: enriched };
    });

    if (txResult.replayed) {
      return res.status(201).json(txResult.result);
    }

    const enriched = txResult.result;

    if (!isInquiry) {
      try {
        await syncUserBalances([buyerId, sellerId].filter(Boolean));
      } catch (syncErr) {
        console.error('[OrderCreate] Non-fatal syncUserBalances error after commit:', syncErr);
      }
    }

    if (isInquiry) {
      try {
        await emitSystemEvent(enriched.id, 'order_created', `Inquiry thread opened: ${title}.`);
      } catch {}
      createNotification({
        userId: sellerId,
        type: 'message',
        title: 'New Inquiry',
        message: `${buyer.name} opened an inquiry: "${title}".`,
        link: `/workstream/${enriched.id}`,
        dedupKey: `inq_${enriched.id}_${sellerId}`,
        actorId: buyerId
      });
    } else {
      await emitSystemEvent(enriched.id, 'order_created', `Order placed: ${title}. Payment is held in escrow until the work is approved.`);
      if (requirements) {
        const reqMsg: Message = {
          id: 'msg_' + Date.now() + '_req_' + Math.random().toString(36).slice(2, 6),
          orderId: id,
          senderId: buyer.id,
          senderName: buyer.name,
          type: 'message',
          text: `Project requirements: ${requirements}`,
          timestamp: new Date(Date.now() + 1).toISOString(),
          metadata: { action: 'requirements_logged' }
        };
        await recordMessage(reqMsg);
      }
    }

    res.status(201).json(enriched);
  } catch (err: any) {
    const msg = String(err?.message || 'Failed to create order');
    const status = err?.status || (/conflict|idempotency/i.test(msg) ? 409 : 400);
    res.status(status).json({ error: msg });
  }
});

// Extend Order Deadline (Admin)
const handleOrderExtendTime = async (req: Request, res: Response) => {
  const orderId = req.params.id;
  if (!tryAcquireOrderLock(orderId, res)) return;
  try {
    const order = await store.getOrder(orderId);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    if (['completed', 'cancelled', 'refunded'].includes(order.status)) {
      return res.status(400).json({ error: `Cannot extend deadline: Order is already ${order.status}.` });
    }

    const { days, newDueDate, reason } = req.body;
    const oldDate = order.dueDate;
    let targetDate: string;

    if (days !== undefined && Number(days) > 0) {
      const numDays = Number(days);
      const extended = calculateExtendedDeadline(order.dueDate, numDays, order.createdAt);
      if (extended) {
        targetDate = extended;
      } else {
        // Safe explicit fallback consistent with admin workflow if existing deadline was missing/invalid
        targetDate = new Date(Date.now() + numDays * 86400000).toISOString();
      }
    } else if (newDueDate !== undefined) {
      if (typeof newDueDate !== 'string' || !newDueDate.trim()) {
        return res.status(400).json({ error: 'A valid newDueDate string must be provided.' });
      }
      const trimmed = newDueDate.trim();
      let candidateIso: string;

      if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
        // Administrator supplied a date-only replacement: preserve existing time-of-day if available, or end of day
        let timePart: string | null = null;
        if (order.dueDate && typeof order.dueDate === 'string' && order.dueDate.includes('T')) {
          timePart = order.dueDate.split('T')[1] || null;
        } else if (order.createdAt && typeof order.createdAt === 'string' && order.createdAt.includes('T')) {
          timePart = order.createdAt.split('T')[1] || null;
        }

        if (timePart) {
          candidateIso = `${trimmed}T${timePart}`;
        } else {
          candidateIso = `${trimmed}T23:59:59.999Z`;
        }
      } else {
        candidateIso = trimmed;
      }

      const parsed = new Date(candidateIso);
      if (isNaN(parsed.getTime())) {
        return res.status(400).json({ error: `Invalid deadline date format: "${newDueDate}".` });
      }
      targetDate = parsed.toISOString();
    } else {
      // Default fallback extension if neither days nor newDueDate provided
      targetDate = new Date(Date.now() + 2 * 86400000).toISOString();
    }

    order.dueDate = targetDate;
    await postgresStore.getPool().query('UPDATE orders SET due_date = $1 WHERE id = $2', [targetDate, order.id]);

    const sysMsg: Message = {
      id: 'msg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      orderId: order.id,
      senderId: 'system',
      senderName: 'System / Admin Notice',
      text: `⏱️ Deadline extended from ${oldDate} to ${order.dueDate}. ${reason ? 'Reason: ' + reason : 'Admin approved time extension.'}`,
      timestamp: new Date().toISOString(),
      type: 'system',
      metadata: { action: 'order_deadline_extended', oldDate, newDueDate: order.dueDate, reason } as any
    };

    await recordMessage(sysMsg);

    await registerAuditLog({
      id: 'log_' + Date.now() + '_' + randomUUID().slice(0, 8),
      actor: adminActor(req),
      role: (req as any).authenticatedUser?.role || 'admin',
      action: 'ORDER_DEADLINE_EXTENDED',
      target: `Order #${order.id}`,
      details: `Extended deadline to ${order.dueDate} (${days || 'custom'} days). ${reason || ''}`,
      timestamp: new Date().toLocaleString()
    });

    res.json({ success: true, order: enrichOrderWithServiceInfo(order), message: sysMsg });
  } finally {
    releaseOrderLock(orderId);
  }
};
router.patch('/orders/:id/extend-time', requireAdmin, handleOrderExtendTime);
router.patch('/admin/orders/:id/extend-time', requireAdmin, handleOrderExtendTime);

// Request Delivery Extension (Seller)
router.post('/orders/:id/extension-request', requireAuth, requireActiveStatus, rateLimit(20, 60_000), async (req: Request, res: Response) => {
  const orderId = req.params.id;
  if (!tryAcquireOrderLock(orderId, res)) return;

  try {
    const order = await store.getOrder(orderId);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    const userId = (req as any).authenticatedUserId;
    if (userId !== order.sellerId) return res.status(403).json({ error: 'Only the seller can request more time.' });
    if (['completed', 'cancelled', 'disputed', 'payment_pending'].includes(order.status)) {
      return res.status(409).json({ error: 'Cannot request an extension for this order.' });
    }

    if (order.extensionRequests) {
      for (const r of order.extensionRequests) {
        if (r.status === 'pending' && r.responseDeadline && new Date().getTime() >= new Date(r.responseDeadline).getTime()) {
          r.status = 'expired';
        }
      }
    }

    const pending = order.extensionRequests?.find(r => r.status === 'pending');
    if (pending) return res.json({ request: pending });
    if (order.freeExtensionUsed) return res.status(409).json({ error: 'Free extension already used.' });

    const { days, reason } = req.body;
    const numDays = Number(days);
    if (!Number.isInteger(numDays) || numDays < 1 || numDays > 14) return res.status(400).json({ error: 'Days must be 1-14.' });
    if (!reason || !reason.trim()) return res.status(400).json({ error: 'Reason required.' });

    const requestedDueDate = calculateExtendedDeadline(order.dueDate, numDays, order.createdAt);
    if (!requestedDueDate) {
      return res.status(400).json({ error: 'Order does not have a valid deadline to extend.' });
    }

    const newRequest: ExtensionRequest = {
      id: 'ext_' + randomUUID().slice(0, 12),
      requestedBy: 'seller',
      days: numDays,
      reason: reason.trim(),
      originalDueDate: order.dueDate,
      requestedDueDate,
      requestedAt: new Date().toISOString(),
      responseDeadline: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
      status: 'pending'
    };

    if (!order.extensionRequests) order.extensionRequests = [];
    order.extensionRequests.push(newRequest);
    const extUpdated = await store.updateOrderStatus(
      order.id,
      { extension_requests: JSON.stringify(order.extensionRequests) },
      ['funded_in_escrow', 'in_progress', 'delivered', 'revision', 'draft_review', 'work_in_progress']
    );
    if (!extUpdated) {
      return res.status(409).json({ error: 'Order status changed concurrently; cannot request an extension.' });
    }

    const sysMsg: Message = {
      id: `msg_${randomUUID()}`,
      orderId: order.id,
      senderId: 'system',
      senderName: 'System',
      text: 'System: The seller requested additional delivery time. Please review the extension request.',
      timestamp: new Date().toISOString(),
      type: 'system',
      metadata: { action: 'time_extension_requested' } as any
    };

    await recordMessage(sysMsg);

    createNotification({
      userId: order.buyerId,
      type: 'order',
      title: 'Time Extension Requested',
      message: `The seller requested ${numDays} more days.`,
      link: `/workstream/${order.id}`
    });

    res.json({ request: newRequest });
  } finally {
    releaseOrderLock(orderId);
  }
});

// Respond to Extension Request (Buyer)
router.post('/orders/:id/extension-request/respond', requireAuth, requireActiveStatus, rateLimit(20, 60_000), async (req: Request, res: Response) => {
  const orderId = req.params.id;
  if (!tryAcquireOrderLock(orderId, res)) return;

  try {
    const order = await store.getOrder(orderId);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    const userId = (req as any).authenticatedUserId;
    if (userId !== order.buyerId) return res.status(403).json({ error: 'Only the buyer can respond.' });
    const request = order.extensionRequests?.find(r => r.status === 'pending');
    if (!request) return res.status(404).json({ error: 'No pending request.' });

    if (request.responseDeadline && new Date() > new Date(request.responseDeadline)) {
      request.status = 'expired';
      await postgresStore.getPool().query(
        'UPDATE orders SET extension_requests = $1 WHERE id = $2',
        [JSON.stringify(order.extensionRequests), order.id]
      );

      const expireMsg: Message = {
        id: `msg_${randomUUID()}`,
        orderId: order.id,
        senderId: 'system',
        senderName: 'System',
        text: 'System: The delivery extension request has expired without a response.',
        timestamp: new Date().toISOString(),
        type: 'system',
        metadata: { action: 'time_extension_expired' } as any
      };
      await recordMessage(expireMsg);

      return res.status(410).json({ error: 'This extension request has expired.' });
    }

    const { action, reason } = req.body;
    const allowedExtRespondStatuses = ['funded_in_escrow', 'in_progress', 'delivered', 'revision', 'draft_review', 'work_in_progress'];
    if (action === 'approve') {
      request.status = 'approved';
      request.respondedBy = userId;
      request.respondedAt = new Date().toISOString();
      request.resultingDueDate = request.requestedDueDate;
      order.dueDate = request.requestedDueDate;
      order.freeExtensionUsed = true;
      const updated = await store.updateOrderStatus(
        order.id,
        {
          extension_requests: JSON.stringify(order.extensionRequests),
          due_date: order.dueDate,
          free_extension_used: true
        },
        allowedExtRespondStatuses
      );
      if (!updated) {
        return res.status(409).json({ error: 'Order status changed concurrently; cannot approve extension.' });
      }

      const sysMsg: Message = {
        id: `msg_${randomUUID()}`,
        orderId: order.id,
        senderId: 'system',
        senderName: 'System',
        text: 'System: The delivery extension was approved. The deadline has been updated.',
        timestamp: new Date().toISOString(),
        type: 'system',
        metadata: { action: 'time_extension_approved' } as any
      };
      await recordMessage(sysMsg);
      createNotification({ userId: order.sellerId, type: 'order', title: 'Extension Approved', message: 'The buyer approved the extension.', link: `/workstream/${order.id}` });
    } else if (action === 'reject') {
      if (!reason || !reason.trim()) return res.status(400).json({ error: 'Reason required.' });
      request.status = 'rejected';
      request.rejectionReason = reason.trim();
      request.respondedBy = userId;
      request.respondedAt = new Date().toISOString();
      const updated = await store.updateOrderStatus(
        order.id,
        { extension_requests: JSON.stringify(order.extensionRequests) },
        allowedExtRespondStatuses
      );
      if (!updated) {
        return res.status(409).json({ error: 'Order status changed concurrently; cannot reject extension.' });
      }

      const sysMsg: Message = {
        id: 'msg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        orderId: order.id,
        senderId: 'system',
        senderName: 'System',
        text: 'System: The delivery extension was rejected. The original deadline remains unchanged.',
        timestamp: new Date().toISOString(),
        type: 'system',
        metadata: { action: 'time_extension_rejected' } as any
      };
      await recordMessage(sysMsg);
      createNotification({ userId: order.sellerId, type: 'order', title: 'Extension Rejected', message: 'The buyer rejected the extension.', link: `/workstream/${order.id}` });
    } else {
      return res.status(400).json({ error: 'Invalid action.' });
    }

    res.json({ success: true, order: enrichOrderWithServiceInfo(order) });
  } finally {
    releaseOrderLock(orderId);
  }
});

// Admin Private Notes
const handleOrderAdminNotes = async (req: Request, res: Response) => {
  const order = await store.getOrder(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  order.adminNotes = req.body.notes || '';
  await postgresStore.getPool().query('UPDATE orders SET admin_notes = $1 WHERE id = $2', [order.adminNotes, order.id]);
  res.json({ success: true, adminNotes: order.adminNotes });
};
router.post('/orders/:id/admin-notes', requireAdmin, handleOrderAdminNotes);
router.post('/admin/orders/:id/admin-notes', requireAdmin, handleOrderAdminNotes);

// Upload Deliverable
router.post('/orders/:id/deliverable', requireAuth, requireActiveStatus, async (req: Request, res: Response) => {
  const orderId = req.params.id;
  if (!tryAcquireOrderLock(orderId, res)) return;

  try {
    const authUserId = (req as any).authenticatedUserId;
    const caller = await store.getUser(authUserId);

    const rawFiles = Array.isArray(req.body.files) && req.body.files.length > 0 
      ? req.body.files 
      : (req.body.name ? [{ name: req.body.name, size: req.body.size, url: req.body.url }] : []);

    const rawNotes = typeof req.body.notes === 'string' ? req.body.notes
      : (typeof req.body.message === 'string' ? req.body.message : '');
    const rawReference = typeof req.body.reference === 'string' ? req.body.reference
      : (typeof req.body.referenceUrl === 'string' ? req.body.referenceUrl
      : (!req.body.name && typeof req.body.url === 'string' ? req.body.url : ''));
    const trimmedNotes = rawNotes.trim();
    const trimmedReference = rawReference.trim();

    if (rawFiles.length === 0 && !trimmedNotes && !trimmedReference) {
      return res.status(400).json({ error: 'Add a file, a URL/reference, or a written completion message to submit a delivery.' });
    }

    if (rawFiles.length > 0) {
      const validation = await validateStoredWorkstreamFiles(rawFiles, caller, orderId);
      if (!validation.ok) {
        return res.status((validation as any).status || 400).json({ error: (validation as any).error });
      }
    }

    const txResult = await postgresStore.executeInTransaction(async (client) => {
      const orderRes = await client.query('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [orderId]);
      if (orderRes.rows.length === 0) {
        const err: any = new Error('Order not found');
        err.status = 404;
        throw err;
      }

      const orderRow = orderRes.rows[0];
      const order = (store as any).mapOrderRow ? (store as any).mapOrderRow(orderRow) : await store.getOrder(orderId, client);
      if (!order) {
        const err: any = new Error('Order not found');
        err.status = 404;
        throw err;
      }

      const isAdmin = caller?.role === 'admin' || caller?.role === 'super_admin';
      if (!isAdmin && order.sellerId !== authUserId) {
        const err: any = new Error('Forbidden: Only the seller or an administrator can submit deliverables.');
        err.status = 403;
        throw err;
      }

      const allowedStatuses = ['funded_in_escrow', 'in_progress', 'revision', 'draft_review', 'delivered', 'work_in_progress', 'late'];
      if (!allowedStatuses.includes(order.status)) {
        const err: any = new Error(`Cannot submit a deliverable for an order in "${order.status}" status.`);
        err.status = 409;
        throw err;
      }
      if (order.status === 'completed') {
        const err: any = new Error('Cannot submit a deliverable for a completed order.');
        err.status = 400;
        throw err;
      }

      if (!order.deliverableFiles) order.deliverableFiles = [];
      if (!order.deliveryHistory) order.deliveryHistory = [];

      let validatedFiles: Array<{ name: string; size: string; url: string }> = [];
      if (rawFiles.length > 0) {
        const validation = await validateStoredWorkstreamFiles(rawFiles, caller, order.id);
        if (!validation.ok) {
          const err: any = new Error((validation as any).error);
          err.status = (validation as any).status || 400;
          throw err;
        }
        validatedFiles = validation.files;
      }

      const isDraft = Boolean(req.body.isDraft);
      const uploadedFiles = validatedFiles.map((f: any, idx: number) => ({
        id: 'deliv_' + Date.now() + '_' + idx + '_' + randomUUID().slice(0, 6),
        name: f.name,
        size: f.size,
        url: f.url,
        uploadedAt: new Date().toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }),
        type: isDraft ? 'draft' : 'deliverable'
      }));

      if (!isDraft) {
        order.deliverableFiles = [...(order.deliverableFiles || []), ...uploadedFiles];
      }

      const version = order.deliveryHistory.length + 1;
      const deliveredAt = new Date().toISOString();
      const projectResponseDeadline = order.orderType === 'project'
        ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
        : undefined;

      order.deliveryHistory.push({
        version,
        notes: trimmedNotes,
        reference: trimmedReference || undefined,
        files: uploadedFiles,
        deliveredAt,
        ...(projectResponseDeadline ? { responseDeadline: projectResponseDeadline } : {})
      });
      if (projectResponseDeadline) {
        order.responseDeadline = projectResponseDeadline;
      }

      let resolvedRevisionCount = 0;
      if (order.revisions && order.revisions.length > 0) {
        for (const rev of order.revisions) {
          if (rev.status === 'requested') {
            rev.status = 'resolved';
            resolvedRevisionCount++;
          }
        }
      }

      const updateRes = await client.query(
        `UPDATE orders 
         SET status = $1, 
             deliverable_files = $2, 
             delivery_history = $3, 
             delivery_notes = $4, 
             delivery_reference = $5, 
             revisions = $6, 
             response_deadline = $7 
         WHERE id = $8 AND status = ANY($9)`,
        [
          isDraft ? 'draft_review' : 'delivered',
          JSON.stringify(order.deliverableFiles),
          JSON.stringify(order.deliveryHistory),
          trimmedNotes,
          trimmedReference,
          JSON.stringify(order.revisions),
          order.responseDeadline || null,
          orderId,
          allowedStatuses
        ]
      );

      if (updateRes.rowCount === 0) {
        const err: any = new Error('Order state changed concurrently. Please retry.');
        err.status = 409;
        throw err;
      }

      order.status = isDraft ? 'draft_review' : 'delivered';

      return {
        order,
        version,
        isDraft,
        uploadedFiles,
        trimmedNotes,
        trimmedReference,
        resolvedRevisionCount
      };
    });

    const { order, version, isDraft, uploadedFiles, resolvedRevisionCount } = txResult;

    if (resolvedRevisionCount > 0) {
      await emitSystemEvent(order.id, 'revision_resolved', `📝 Revision resolved via Delivery #v${version}.`, {
        deliveryVersion: version
      });
    }

    const summaryParts: string[] = [];
    if (uploadedFiles.length > 0) summaryParts.push(uploadedFiles.map((f: any) => `"${f.name}" (${f.size})`).join(', '));
    if (trimmedReference) summaryParts.push(`Reference: ${trimmedReference}`);
    const fileSummary = summaryParts.length > 0 ? summaryParts.join(' | ') : 'written completion update';

    await emitSystemEvent(
      order.id,
      'deliverable_submitted',
      isDraft
        ? `📦 Draft Delivery #v${version} submitted (${fileSummary}).`
        : `📦 Delivery / Final Invoice #v${version} submitted (${fileSummary}).`,
      {
        version,
        isDraft,
        notes: trimmedNotes,
        reference: trimmedReference || undefined,
        files: uploadedFiles
      }
    );

    let createdInvoiceOffer: any = undefined;
    if (!isDraft && req.body.createInvoiceOffer && (await orderHasEscrow(order.id))) {
      const activeEsc = await getActiveEscrowRemaining(order);
      const requestedAmt = Math.round(Number(req.body.invoiceAmount || activeEsc || order.amount || 0) * 100) / 100;
      const invAmt = requestedAmt >= activeEsc && requestedAmt > 0 ? requestedAmt : (activeEsc || Number(order.amount || 0));
      const invTitle = (typeof req.body.invoiceTitle === 'string' && req.body.invoiceTitle.trim().length >= 3)
        ? req.body.invoiceTitle.trim().slice(0, 120)
        : `Final Invoice: ${order.title}`.slice(0, 120);

      const existingRes = await postgresStore.getPool().query(
        "SELECT * FROM workstream_offers WHERE order_id = $1 AND kind = 'invoice' AND status = 'pending'",
        [order.id]
      );
      if (existingRes.rows.length > 0) {
        const row = existingRes.rows[0];
        const prevMeta = row.metadata || {};
        const updatedMeta = {
          ...prevMeta,
          note: trimmedNotes || prevMeta.note,
          files: uploadedFiles.length > 0 ? uploadedFiles : prevMeta.files,
          reference: trimmedReference || prevMeta.reference,
          originOrderId: prevMeta.originOrderId || order.id,
          ...(order.workspaceId ? { workspaceId: order.workspaceId } : {})
        };
        await postgresStore.getPool().query(
          `UPDATE workstream_offers 
           SET title = $1, amount = $2, metadata = $3 
           WHERE id = $4`,
          [invTitle, invAmt, JSON.stringify(updatedMeta), row.id]
        );
        createdInvoiceOffer = await viewOffer({
          id: row.id,
          number: row.number,
          orderId: row.order_id,
          originOrderId: updatedMeta.originOrderId,
          workspaceId: order.workspaceId,
          kind: row.kind,
          title: invTitle,
          amount: invAmt,
          note: updatedMeta.note,
          files: updatedMeta.files,
          reference: updatedMeta.reference,
          status: row.status,
          createdBy: row.created_by,
          createdAt: row.created_at
        });
      } else if (invAmt > 0) {
        const invNum = generateCollisionSafeOfferNumber('invoice');
        const newInvId = 'off_' + randomUUID().slice(0, 12);
        const meta = {
          note: trimmedNotes || undefined,
          files: uploadedFiles.length > 0 ? uploadedFiles : undefined,
          reference: trimmedReference || undefined,
          originOrderId: order.id,
          ...(order.workspaceId ? { workspaceId: order.workspaceId } : {})
        };
        await postgresStore.getPool().query(
          `INSERT INTO workstream_offers (id, order_id, kind, number, title, amount, status, created_by, created_at, metadata)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [newInvId, order.id, 'invoice', invNum, invTitle, invAmt, 'pending', caller?.id || order.sellerId, new Date().toISOString(), JSON.stringify(meta)]
        );
        const newInv: WorkstreamOffer = {
          id: newInvId,
          number: invNum,
          orderId: order.id,
          originOrderId: order.id,
          workspaceId: order.workspaceId,
          kind: 'invoice',
          title: invTitle,
          amount: invAmt,
          note: meta.note,
          files: meta.files,
          reference: meta.reference,
          status: 'pending',
          createdBy: caller?.id || order.sellerId,
          createdAt: new Date().toISOString()
        };
        await postOfferMessage(order, newInv, { id: caller?.id || order.sellerId, name: caller?.name || 'Seller' }, `New invoice ${newInv.number}: ${invTitle}`, 'offer_created');
        createdInvoiceOffer = await viewOffer(newInv);
      }
    }

    res.json({ success: true, files: uploadedFiles, file: uploadedFiles[0], offer: createdInvoiceOffer, order: enrichOrderWithServiceInfo(order) });
  } catch (err: any) {
    const status = err?.status || 400;
    res.status(status).json({ error: err.message || 'Failed to submit deliverable' });
  } finally {
    releaseOrderLock(orderId);
  }
});

// Request Revision on Deliverable
router.post('/orders/:id/revision', requireAuth, requireActiveStatus, async (req: Request, res: Response) => {
  const orderId = req.params.id;
  if (!tryAcquireOrderLock(orderId, res)) return;

  try {
    const order = await store.getOrder(orderId);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    const authUserId = (req as any).authenticatedUserId;
    const caller = await store.getUser(authUserId);
    const isAdmin = caller?.role === 'admin' || caller?.role === 'super_admin';
    if (!isAdmin && order.buyerId !== authUserId) {
      return res.status(403).json({ error: 'Forbidden: Only the order buyer or an administrator can request revisions.' });
    }

    const allowedRevisionStatuses = ['delivered', 'in_progress', 'funded_in_escrow', 'revision', 'draft_review', 'work_in_progress'];
    if (!allowedRevisionStatuses.includes(order.status)) {
      return res.status(409).json({ error: `Cannot request revisions for an order in "${order.status}" status.` });
    }

    const hasDelivery = (Array.isArray(order.deliverableFiles) && order.deliverableFiles.length > 0) || (Array.isArray(order.deliveryHistory) && order.deliveryHistory.length > 0) || ['delivered', 'revision', 'draft_review', 'work_in_progress'].includes(order.status);
    if (!hasDelivery) {
      return res.status(409).json({ error: 'Cannot request revisions before work or a draft has been delivered by the freelancer.' });
    }

    const rawReason = (req.body.reason || '').trim();
    if (!rawReason) {
      return res.status(400).json({ error: 'A revision reason is required.' });
    }
    const reason = escapeHtml(rawReason);
    if (!order.revisions) order.revisions = [];
    const revisionEntry = {
      id: 'rev_' + Date.now() + '_' + randomUUID().slice(0, 8),
      requestedAt: new Date().toISOString(),
      reason,
      status: 'requested',
      deliveryVersion: order.deliveryHistory?.length || 1
    };
    order.revisions.push(revisionEntry);
    order.status = 'revision';

    const revUpdated = await store.updateOrderStatus(
      order.id,
      { status: 'revision', revisions: JSON.stringify(order.revisions) },
      allowedRevisionStatuses
    );
    if (!revUpdated) {
      return res.status(409).json({ error: 'Order status changed concurrently; cannot request revisions.' });
    }

    await emitSystemEvent(order.id, 'revision_requested', `Revision requested: "${reason}"`, {
      revisionId: revisionEntry.id,
      deliveryVersion: revisionEntry.deliveryVersion
    });

    res.json({ success: true, revision: revisionEntry, order: enrichOrderWithServiceInfo(order) });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  } finally {
    releaseOrderLock(orderId);
  }
});

// Participant (Buyer or Seller) Dispute Creation Flow
const handleOpenDispute = async (req: Request, res: Response) => {
  const orderId = String(req.params.id || req.body?.orderId || '').trim();
  if (!orderId) return res.status(400).json({ error: 'orderId is required' });
  if (!tryAcquireOrderLock(orderId, res)) return;

  try {
    const order = await store.getOrder(orderId);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    const authUserId = (req as any).authenticatedUserId;
    if (order.buyerId !== authUserId && order.sellerId !== authUserId) {
      return res.status(403).json({ error: 'Forbidden: Only order participants can open a dispute.' });
    }
    if (order.status === 'completed' || order.status === 'cancelled') {
      return res.status(409).json({ error: `Cannot open a dispute: this order is already ${order.status}.` });
    }
    if (order.status === 'disputed') {
      return res.status(409).json({ error: 'This order is already under dispute.' });
    }
    const disputeEscrow = await financialRepository.getEscrow(order.id);
    if (!disputeEscrow || disputeEscrow.status !== 'held' || disputeEscrow.remaining <= 0) {
      return res.status(409).json({ error: 'Cannot open a dispute: there is no active escrow held for this order.' });
    }
    const rawReason = (req.body.reason || '').trim().slice(0, 2000);
    if (!rawReason) {
      return res.status(400).json({ error: 'A dispute reason is required.' });
    }
    const reason = escapeHtml(rawReason);

    const existingDispute = await store.getDisputeByOrderId(order.id);
    if (existingDispute && (existingDispute.status === 'open' || existingDispute.status === 'under_investigation' || (existingDispute.status as string) === 'under_review')) {
      return res.status(400).json({ error: 'An active dispute already exists for this order.' });
    }

    const newDisputeId = 'disp_' + Date.now() + '_' + randomUUID().slice(0, 8);
    const raisedBy = authUserId === order.buyerId ? 'buyer' : 'seller';
    const evidence = escapeHtml((req.body.evidence || '').slice(0, 5000));
    const createdAt = new Date().toISOString();

    const newDispute: Dispute = {
      id: newDisputeId,
      orderId: order.id,
      buyerId: order.buyerId,
      sellerId: order.sellerId,
      raisedBy,
      reason,
      evidence,
      status: 'open',
      createdAt
    };

    const allowedDisputeStatuses = ['funded_in_escrow', 'in_progress', 'delivered', 'revision', 'draft_review', 'work_in_progress'];

    // ATOMIC TRANSACTION: Both order status update and dispute insertion commit together or rollback together
    await postgresStore.executeInTransaction(async (client) => {
      // Re-verify order status under FOR UPDATE lock
      const orderRes = await client.query('SELECT status FROM orders WHERE id = $1 FOR UPDATE', [order.id]);
      if (orderRes.rows.length === 0) {
        const err: any = new Error('Order not found');
        err.statusCode = 404;
        throw err;
      }
      const currentStatus = orderRes.rows[0].status;
      if (currentStatus === 'completed' || currentStatus === 'cancelled') {
        const err: any = new Error(`Cannot open a dispute: this order is already ${currentStatus}.`);
        err.statusCode = 409;
        throw err;
      }
      if (currentStatus === 'disputed') {
        const err: any = new Error('This order is already under dispute.');
        err.statusCode = 409;
        throw err;
      }
      if (!allowedDisputeStatuses.includes(currentStatus)) {
        const err: any = new Error(`Cannot open a dispute for order in status "${currentStatus}".`);
        err.statusCode = 409;
        throw err;
      }

      // Re-verify active held escrow under FOR UPDATE lock
      const escRes = await client.query('SELECT status, remaining FROM escrows WHERE order_id = $1 FOR UPDATE', [order.id]);
      if (escRes.rows.length === 0 || escRes.rows[0].status !== 'held' || Number(escRes.rows[0].remaining) <= 0) {
        const err: any = new Error('Cannot open a dispute: there is no active escrow held for this order.');
        err.statusCode = 409;
        throw err;
      }

      // Re-verify existing active dispute under FOR UPDATE lock
      const dispCheck = await client.query(
        "SELECT id FROM disputes WHERE order_id = $1 AND status IN ('open', 'under_investigation', 'under_review') FOR UPDATE",
        [order.id]
      );
      if (dispCheck.rows.length > 0) {
        const err: any = new Error('An active dispute already exists for this order.');
        err.statusCode = 400;
        throw err;
      }

      // Atomically update order status
      const updateRes = await client.query(
        `UPDATE orders SET status = 'disputed' WHERE id = $1 AND status NOT IN ('completed', 'cancelled', 'disputed')`,
        [order.id]
      );
      if (updateRes.rowCount === 0) {
        const err: any = new Error('Cannot open a dispute: order status changed concurrently.');
        err.statusCode = 409;
        throw err;
      }

      // Atomically insert dispute record
      await client.query(
        `INSERT INTO disputes (id, order_id, buyer_id, seller_id, raised_by, reason, evidence, status, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          newDispute.id,
          newDispute.orderId,
          newDispute.buyerId || null,
          newDispute.sellerId || null,
          newDispute.raisedBy,
          newDispute.reason,
          newDispute.evidence || null,
          newDispute.status,
          newDispute.createdAt
        ]
      );
    });

    order.status = 'disputed';

    const sysMsg: Message = {
      id: 'msg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      orderId: order.id,
      senderId: 'system',
      senderName: 'WorkSphere Dispute Resolution Desk',
      text: `🚨 Dispute opened by ${newDispute.raisedBy}: "${reason}". Order placed under review.`,
      timestamp: new Date().toISOString(),
      type: 'system',
      metadata: {
        action: 'dispute_opened',
        disputeId: newDispute.id,
        raisedBy: newDispute.raisedBy
      }
    };

    await recordMessage(sysMsg);
    notifyOrderParties(order.id, 'dispute_opened', sysMsg.text, sysMsg.id);

    res.json({ success: true, dispute: newDispute, order: enrichOrderWithServiceInfo(order) });
  } catch (err: any) {
    const statusCode = err?.statusCode || 400;
    res.status(statusCode).json({ error: err.message });
  } finally {
    releaseOrderLock(orderId);
  }
};

router.post('/orders/:id/dispute', requireAuth, requireActiveStatus, handleOpenDispute);
router.post('/disputes/open', requireAuth, requireActiveStatus, handleOpenDispute);
router.post('/disputes', requireAuth, requireActiveStatus, handleOpenDispute);

// Toggle Chat Mute (Admin / Support)
const handleOrderMute = async (req: Request, res: Response) => {
  const order = await store.getOrder(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  order.isMuted = req.body?.isMuted !== undefined ? Boolean(req.body.isMuted) : !order.isMuted;
  await postgresStore.getPool().query('UPDATE orders SET is_muted = $1 WHERE id = $2', [order.isMuted, order.id]);

  const sysMsg: Message = {
    id: 'msg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    orderId: order.id,
    senderId: 'system',
    senderName: 'Administration Alert',
    text: order.isMuted 
      ? `🔒 Chat paused by Administrator during case review. Neither party may send messages.`
      : `🔓 Chat unlocked by Administrator. Standard messaging resumed.`,
    timestamp: new Date().toISOString(),
    type: 'system',
    metadata: { action: order.isMuted ? 'chat_muted' : 'chat_unmuted' }
  };

  await recordMessage(sysMsg);

  res.json({ success: true, isMuted: order.isMuted });
};

router.patch('/orders/:id/mute', requireRole(['admin', 'super_admin', 'support']), handleOrderMute);
router.patch('/admin/orders/:id/mute', requireRole(['admin', 'super_admin', 'support']), handleOrderMute);

// Toggle Pause Order Timer (Admin / Support)
const handleOrderPauseTimer = async (req: Request, res: Response) => {
  const order = await store.getOrder(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  order.isTimerPaused = !order.isTimerPaused;
  await postgresStore.getPool().query('UPDATE orders SET is_timer_paused = $1 WHERE id = $2', [order.isTimerPaused, order.id]);

  const sysMsg: Message = {
    id: 'msg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    orderId: order.id,
    senderId: 'system',
    senderName: 'Administration Alert',
    text: order.isTimerPaused 
      ? `⏸️ Delivery countdown paused by Administrator pending dispute/clarification.`
      : `▶️ Delivery countdown resumed by Administrator. Normal timer active.`,
    timestamp: new Date().toISOString(),
    type: 'system',
    metadata: { action: order.isTimerPaused ? 'timer_paused' : 'timer_resumed' }
  };

  await recordMessage(sysMsg);

  await registerAuditLog({
    id: 'log_' + Date.now() + '_' + randomUUID().slice(0, 8),
    actor: adminActor(req),
    role: (req as any).authenticatedUser?.role || 'admin',
    action: order.isTimerPaused ? 'ORDER_TIMER_PAUSED' : 'ORDER_TIMER_RESUMED',
    target: `Order #${order.id}`,
    details: order.isTimerPaused ? 'Timer paused by Admin' : 'Timer resumed by Admin',
    timestamp: new Date().toLocaleString()
  });

  res.json({ success: true, isTimerPaused: order.isTimerPaused, order: enrichOrderWithServiceInfo(order) });
};
router.patch('/orders/:id/pause-timer', requireRole(['admin', 'super_admin', 'support']), handleOrderPauseTimer);
router.patch('/admin/orders/:id/pause-timer', requireRole(['admin', 'super_admin', 'support']), handleOrderPauseTimer);

// Force Complete & Release Funds (admin only)
const handleOrderForceComplete = async (req: Request, res: Response) => {
  const orderId = req.params.id;
  if (!tryAcquireOrderLock(orderId, res)) return;

  try {
    const reason = String(req.body.reason || 'Admin administrative force-release in seller favor.');
    const actor = adminActor(req);

    const txResult = await postgresStore.executeInTransaction(async (client) => {
      const orderLockRes = await client.query('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [orderId]);
      if (orderLockRes.rows.length === 0) {
        const err: any = new Error('Order not found');
        err.statusCode = 404;
        throw err;
      }
      const order = (store as any).mapOrderRow ? (store as any).mapOrderRow(orderLockRes.rows[0]) : await store.getOrder(orderId, client);
      if (!order) {
        const err: any = new Error('Order not found');
        err.statusCode = 404;
        throw err;
      }
      if (order.status === 'completed') {
        throw new Error('Order is already completed; funds were already released.');
      }
      if (order.status === 'cancelled') {
        throw new Error('Cannot force-complete a cancelled/refunded order.');
      }

      const result = await releaseOrderFunds(order, actor, reason, false, req.body.requestKey, true, client);
      await closeActiveDispute(order.id, 'resolved_release', reason, client);
      return { order, result };
    });

    res.json({ success: true, order: enrichOrderWithServiceInfo(txResult.order), result: txResult.result });
  } catch (err: any) {
    res.status(err?.statusCode || 400).json({ error: err.message });
  } finally {
    releaseOrderLock(orderId);
  }
};
router.post('/orders/:id/force-complete', requireAdmin, handleOrderForceComplete);
router.post('/admin/orders/:id/force-complete', requireAdmin, handleOrderForceComplete);

// Force Cancel & Refund Buyer (admin only)
const handleOrderForceCancel = async (req: Request, res: Response) => {
  const orderId = req.params.id;
  if (!tryAcquireOrderLock(orderId, res)) return;

  try {
    const reason = String(req.body.reason || 'Admin cancelled order and refunded buyer wallet');
    const isPartial = req.body.refundType === 'partial';
    const actor = adminActor(req);

    const txResult = await postgresStore.executeInTransaction(async (client) => {
      const orderLockRes = await client.query('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [orderId]);
      if (orderLockRes.rows.length === 0) {
        const err: any = new Error('Order not found');
        err.statusCode = 404;
        throw err;
      }
      const order = (store as any).mapOrderRow ? (store as any).mapOrderRow(orderLockRes.rows[0]) : await store.getOrder(orderId, client);
      if (!order) {
        const err: any = new Error('Order not found');
        err.statusCode = 404;
        throw err;
      }
      if (order.status === 'completed') {
        throw new Error('Cannot force-cancel an already completed order.');
      }
      if (order.status === 'cancelled') {
        throw new Error('Order is already cancelled/refunded.');
      }

      let result: any;
      if (isPartial) {
        const refundAmount = Number(req.body.customAmount);
        result = await splitOrderFunds(order, refundAmount, actor, reason, req.body.requestKey, client);
        await closeActiveDispute(order.id, 'resolved_partial', reason, client);
        await pushSystemMessage(order.id, `⚖️ Order resolved by Administration. $${refundAmount} refunded to buyer; the remainder was released to the freelancer. Reason: ${reason}`, 'dispute_resolved', client);
      } else {
        result = await refundOrderFunds(order, undefined, actor, reason, req.body.requestKey, undefined, true, client);
        await closeActiveDispute(order.id, 'resolved_refund', reason, client);
      }
      return { order, result };
    });

    res.json({ success: true, order: enrichOrderWithServiceInfo(txResult.order), result: txResult.result });
  } catch (err: any) {
    res.status(err?.statusCode || 400).json({ error: err.message });
  } finally {
    releaseOrderLock(orderId);
  }
};
router.post('/orders/:id/force-cancel', requireAdmin, handleOrderForceCancel);
router.post('/admin/orders/:id/force-cancel', requireAdmin, handleOrderForceCancel);

// Gig Cancellation Request
router.post('/orders/:id/cancel-request', requireAuth, requireActiveStatus, rateLimit(20, 60_000), async (req: Request, res: Response) => {
  const orderId = req.params.id;
  if (!tryAcquireOrderLock(orderId, res)) return;

  try {
    const userId = (req as any).authenticatedUserId;
    const caller = await store.getUser(userId);
    const order = await store.getOrder(orderId);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.orderType !== 'gig' && !order.gigOrderId) {
      return res.status(400).json({ error: 'Cancellation request flow is for gigs only.' });
    }
    if (order.status === 'completed' || order.status === 'cancelled' || order.status === 'disputed') {
      return res.status(400).json({ error: `Cannot request cancellation for order in status "${order.status}".` });
    }

    const isBuyer = userId === order.buyerId;
    const isSeller = userId === order.sellerId;
    if (!isBuyer && !isSeller) {
      return res.status(403).json({ error: 'Forbidden: Only buyer or seller can request cancellation.' });
    }
    if (order.cancellationRequest && order.cancellationRequest.status === 'pending') {
      return res.status(409).json({ error: 'A cancellation request is already pending for this order.' });
    }

    const { reason, details } = req.body;
    if (!reason || typeof reason !== 'string' || !reason.trim()) {
      return res.status(400).json({ error: 'Cancellation reason is required.' });
    }

    const now = new Date().toISOString();
    const respondBy = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
    const requestedBy = isBuyer ? 'buyer' : 'seller';

    order.cancellationRequest = {
      requestedBy,
      requesterId: userId,
      reason: reason.trim(),
      details: details ? String(details).trim() : undefined,
      requestedAt: now,
      respondBy,
      status: 'pending'
    };
    if (!order.cancellationHistory) order.cancellationHistory = [];
    order.cancellationHistory.push(order.cancellationRequest);

    const cancelReqUpdated = await store.updateOrderStatus(
      order.id,
      {
        cancellation_request: JSON.stringify(order.cancellationRequest),
        cancellation_history: JSON.stringify(order.cancellationHistory)
      },
      ['payment_pending', 'funded_in_escrow', 'in_progress', 'delivered', 'revision', 'draft_review', 'work_in_progress']
    );
    if (!cancelReqUpdated) {
      return res.status(409).json({ error: 'Order status changed concurrently; cannot submit cancellation request.' });
    }

    const recipientId = isBuyer ? order.sellerId : order.buyerId;
    createNotification({
      userId: recipientId,
      title: 'Cancellation Requested',
      message: `${requestedBy === 'buyer' ? 'Buyer' : 'Seller'} requested cancellation of order #${order.id}. Reason: ${reason}. You have 48 hours to respond.`,
      type: 'order',
      link: `/workstream/${order.id}`
    });

    const requestsLast24h = (order.cancellationHistory || []).filter(h => Date.now() - new Date(h.requestedAt).getTime() < 24 * 3600 * 1000).length;
    if (requestsLast24h <= 2) {
      sendOrderEmail(
        recipientId,
        'Action needed: cancellation requested on your order',
        `${requestedBy === 'buyer' ? 'The buyer' : 'The seller'} asked to cancel order #${order.id}.\n\nReason: ${String(reason).trim().slice(0, 300)}\n\nYou have 48 hours to accept or decline. If you do not respond, the order is cancelled automatically and the payment is refunded.`,
        `/workstream/${order.id}`
      );
    }

    await registerAuditLog({
      id: 'log_' + Date.now() + '_' + randomUUID().slice(0, 8),
      actor: caller?.name || requestedBy,
      role: caller?.role || requestedBy,
      action: 'GIG_CANCELLATION_REQUESTED',
      target: `Order #${order.id}`,
      details: `${requestedBy} requested cancellation. Reason: ${reason}`,
      timestamp: new Date().toLocaleString()
    });

    res.json({ success: true, order: enrichOrderWithServiceInfo(order) });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  } finally {
    releaseOrderLock(orderId);
  }
});

// Respond to Gig Cancellation Request
router.post('/orders/:id/cancel-request/respond', requireAuth, requireActiveStatus, rateLimit(20, 60_000), async (req: Request, res: Response) => {
  const orderId = req.params.id;
  if (!tryAcquireOrderLock(orderId, res)) return;

  try {
    const userId = (req as any).authenticatedUserId;
    const caller = await store.getUser(userId);

    const { action, reason } = req.body;
    if (!['accept', 'reject'].includes(action)) {
      return res.status(400).json({ error: 'Invalid action. Must be "accept" or "reject".' });
    }
    if (action === 'reject' && (!reason || !String(reason).trim())) {
      return res.status(400).json({ error: 'Rejection reason is required when rejecting a cancellation request.' });
    }

    const txResult = await postgresStore.executeInTransaction(async (client) => {
      const orderRes = await client.query('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [orderId]);
      if (orderRes.rows.length === 0) {
        const err: any = new Error('Order not found');
        err.statusCode = 404;
        throw err;
      }
      const orderRow = orderRes.rows[0];
      const order = (store as any).mapOrderRow ? (store as any).mapOrderRow(orderRow) : await store.getOrder(orderId, client);
      if (!order) {
        const err: any = new Error('Order not found');
        err.statusCode = 404;
        throw err;
      }

      let cancelReq = order.cancellationRequest;
      if (typeof cancelReq === 'string') {
        try { cancelReq = JSON.parse(cancelReq); } catch {}
      }
      if (!cancelReq || cancelReq.status !== 'pending') {
        const err: any = new Error('No pending cancellation request found for this order.');
        err.statusCode = 400;
        throw err;
      }

      if (order.status === 'disputed') {
        const err: any = new Error('Cannot process cancellation: This order is currently under active dispute.');
        err.statusCode = 409;
        throw err;
      }

      const activeDisputeRes = await client.query(
        "SELECT id FROM disputes WHERE order_id = $1 AND status IN ('open', 'under_investigation', 'under_review') LIMIT 1",
        [order.id]
      );
      if (activeDisputeRes.rows.length > 0) {
        const err: any = new Error('Cannot process cancellation: This order has an active unresolved dispute.');
        err.statusCode = 409;
        throw err;
      }

      const isBuyer = userId === order.buyerId;
      const isSeller = userId === order.sellerId;
      if (!isBuyer && !isSeller) {
        const err: any = new Error('Forbidden');
        err.statusCode = 403;
        throw err;
      }
      if (userId === cancelReq.requesterId) {
        const err: any = new Error('You cannot respond to your own cancellation request.');
        err.statusCode = 403;
        throw err;
      }

      const isExpired = Boolean(
        cancelReq.respondBy &&
        new Date() > new Date(cancelReq.respondBy)
      );
      if (isExpired && action === 'reject') {
        const err: any = new Error('The 48-hour response window for this cancellation request has expired and it can no longer be rejected.');
        err.statusCode = 400;
        throw err;
      }

      const now = new Date().toISOString();
      cancelReq.respondedBy = userId;
      cancelReq.respondedAt = now;

      if (action === 'accept') {
        const actorName = caller?.name || (isBuyer ? 'Buyer' : 'Seller');
        cancelReq.status = 'accepted';
        if (Array.isArray(order.cancellationHistory)) {
          for (const ch of order.cancellationHistory) {
            if (ch.requestedAt === cancelReq.requestedAt) {
              ch.status = 'accepted';
              ch.respondedBy = userId;
              ch.respondedAt = now;
            }
          }
        }

        let refundedAmt = 0;
        const orderMeta = typeof (order as any).metadata === 'string'
          ? (() => { try { return JSON.parse((order as any).metadata); } catch { return {}; } })()
          : ((order as any).metadata || {});
        const isCustomOrder = Boolean((order as any).isCustomOrder || orderMeta.isCustomOrder || orderMeta.customOrderFromInquiry);
        const escRow = await financialRepository.getEscrow(order.id, client);
        const hasEscrowRecord = Boolean(escRow && (Number(escRow.remaining || 0) > 0 || escRow.status === 'held' || Number(escRow.amount || 0) > 0));

        const isAuthoritativeInquiryOnly = Boolean(
          ((order as any).isInquiry === true || orderMeta.isInquiry === true) &&
          !isCustomOrder &&
          !hasEscrowRecord
        );

        if (isAuthoritativeInquiryOnly) {
          order.status = 'cancelled';
          await client.query(
            "UPDATE orders SET status = 'cancelled', cancellation_type = 'inquiry_cancelled', cancellation_request = $1, cancellation_history = $2 WHERE id = $3",
            [JSON.stringify(cancelReq), JSON.stringify(order.cancellationHistory || []), order.id]
          );
        } else {
          const requestKey = `cancel_accept_${order.id}_${cancelReq.requestedAt}`;
          const refundRes = await refundOrderFunds(
            order, 
            undefined, 
            actorName, 
            `Mutual cancellation accepted: ${cancelReq.reason}`, 
            requestKey,
            { cancellationRequest: cancelReq, cancellationHistory: order.cancellationHistory },
            false,
            client
          );
          refundedAmt = refundRes.refunded;
        }

        return { order, action: 'accept', refundedAmt, cancelReq, isBuyer, isSeller, caller };
      } else {
        const rejectedReq = { ...cancelReq, status: 'rejected' as const, rejectionReason: String(reason).trim() };
        if (Array.isArray(order.cancellationHistory)) {
          for (const ch of order.cancellationHistory) {
            if (ch.requestedAt === cancelReq.requestedAt) {
              ch.status = 'rejected';
              ch.rejectionReason = String(reason).trim();
              ch.respondedBy = userId;
              ch.respondedAt = now;
            }
          }
        }
        if (order.status === 'delivered') {
          order.reviewWindowRestartedAt = now;
        }

        const updateRes = await client.query(
          `UPDATE orders 
           SET cancellation_request = NULL, 
               cancellation_history = $1, 
               review_window_restarted_at = COALESCE($2, review_window_restarted_at) 
           WHERE id = $3 AND cancellation_request IS NOT NULL`,
          [
            JSON.stringify(order.cancellationHistory || []),
            order.reviewWindowRestartedAt || null,
            order.id
          ]
        );
        if (updateRes.rowCount === 0) {
          const err: any = new Error('Order status changed concurrently; cannot reject cancellation request.');
          err.statusCode = 409;
          throw err;
        }

        order.cancellationRequest = undefined as any;
        return { order, action: 'reject', rejectedReq, isBuyer, isSeller, caller };
      }
    });

    if (txResult.action === 'accept') {
      const { order, cancelReq } = txResult;
      const refundedAmt = txResult.refundedAmt || 0;
      createNotification({
        userId: cancelReq.requesterId,
        title: 'Cancellation Accepted',
        message: `Your cancellation request for order #${order.id} was accepted.${refundedAmt > 0 ? ` Full refund issued ($${refundedAmt}).` : ' Order closed.'}`,
        type: 'order',
        link: `/workstream/${order.id}`
      });

      await registerAuditLog({
        id: 'log_' + Date.now() + '_' + randomUUID().slice(0, 8),
        actor: txResult.caller?.name || (txResult.isBuyer ? 'Buyer' : 'Seller'),
        role: txResult.caller?.role || 'user',
        action: 'GIG_CANCELLATION_ACCEPTED',
        target: `Order #${order.id}`,
        details: `Cancellation accepted. ${refundedAmt > 0 ? `Full refund of $${refundedAmt} issued.` : 'Inquiry closed.'}`,
        timestamp: new Date().toLocaleString()
      });

      return res.json({ success: true, order: enrichOrderWithServiceInfo(order), refunded: refundedAmt });
    } else {
      const { order, rejectedReq } = txResult;
      createNotification({
        userId: rejectedReq.requesterId,
        title: 'Cancellation Rejected',
        message: `Your cancellation request for order #${order.id} was rejected. Reason: ${reason}. Order continues normally.`,
        type: 'order',
        link: `/workstream/${order.id}`
      });

      await registerAuditLog({
        id: 'log_' + Date.now() + '_' + randomUUID().slice(0, 8),
        actor: txResult.caller?.name || (txResult.isBuyer ? 'Buyer' : 'Seller'),
        role: txResult.caller?.role || 'user',
        action: 'GIG_CANCELLATION_REJECTED',
        target: `Order #${order.id}`,
        details: `Cancellation rejected. Reason: ${reason}`,
        timestamp: new Date().toLocaleString()
      });

      return res.json({ success: true, order: enrichOrderWithServiceInfo(order) });
    }
  } catch (err: any) {
    const statusCode = err?.statusCode || 400;
    res.status(statusCode).json({ error: err.message });
  } finally {
    releaseOrderLock(orderId);
  }
});

const handleOrderCancel = async (req: Request, res: Response) => {
  const orderId = req.params.id;
  if (!tryAcquireOrderLock(orderId, res)) return;

  try {
    const authUserId = (req as any).authenticatedUserId;
    const caller = (req as any).authenticatedUser || (authUserId ? await store.getUser(authUserId) : null);
    const reason = (req.body?.reason || 'Order cancelled').trim();

    const txResult = await postgresStore.executeInTransaction(async (client) => {
      const orderRes = await client.query('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [orderId]);
      if (orderRes.rows.length === 0) {
        const err: any = new Error('Order not found');
        err.statusCode = 404;
        throw err;
      }

      const orderRow = orderRes.rows[0];
      const order = (store as any).mapOrderRow ? (store as any).mapOrderRow(orderRow) : await store.getOrder(orderId, client);
      if (!order) {
        const err: any = new Error('Order not found');
        err.statusCode = 404;
        throw err;
      }

      const isStaff = isStaffUser(caller);
      const isBuyer = authUserId === order.buyerId;
      const isSeller = authUserId === order.sellerId;

      if (!isStaff && !isBuyer && !isSeller) {
        const err: any = new Error('Forbidden: You are not a participant of this order.');
        err.statusCode = 403;
        throw err;
      }

      if (order.status === 'completed' || order.status === 'cancelled' || (order.status as string) === 'refunded') {
        const err: any = new Error(`Cannot cancel order with status "${order.status}". Cancellation is not allowed for completed, cancelled, or refunded orders.`);
        err.statusCode = 400;
        throw err;
      }

      const dispRes = await client.query(
        "SELECT 1 FROM disputes WHERE order_id = $1 AND status IN ('open', 'under_investigation', 'under_review') LIMIT 1",
        [order.id]
      );
      if (!isStaff && dispRes.rows.length > 0) {
        const err: any = new Error('Direct cancellation is blocked because an active dispute is open. Please resolve the dispute or contact support.');
        err.statusCode = 400;
        throw err;
      }

      const hasFundedEscrow = await orderHasEscrow(order.id, client);
      const isGigOrder = order.orderType === 'gig' || Boolean(order.gigOrderId) || Boolean(order.gigId);

      if (!isStaff && order.status !== 'payment_pending') {
        if (isSeller) {
          if (isGigOrder && (hasFundedEscrow || ['funded_in_escrow', 'in_progress', 'delivered', 'revision', 'revision_requested'].includes(order.status))) {
            const err: any = new Error('Direct cancellation is not allowed for funded gig orders. Please submit a cancellation request (POST /api/orders/:id/cancel-request).');
            err.statusCode = 400;
            throw err;
          }
          if (!isGigOrder && !['funded_in_escrow', 'in_progress'].includes(order.status)) {
            const err: any = new Error(`Seller cannot directly cancel a project order in "${order.status}" status.`);
            err.statusCode = 400;
            throw err;
          }
        } else if (isBuyer) {
          if (['delivered', 'revision', 'revision_requested', 'draft_review', 'disputed'].includes(order.status)) {
            const err: any = new Error('Cannot directly cancel an active or delivered order. Please request a revision, submit a cancellation request, or open a dispute.');
            err.statusCode = 403;
            throw err;
          }
          if (['funded_in_escrow', 'in_progress'].includes(order.status) || hasFundedEscrow) {
            const hasZeroDeliveries = (!order.deliveryHistory || order.deliveryHistory.length === 0) && (!order.deliverableFiles || order.deliverableFiles.length === 0);
            const deadlineMs = parseDeadlineInstant(order.dueDate, order.createdAt);
            const isVeryLateGig = isGigOrder && deadlineMs !== null && (Date.now() > deadlineMs + LATE_ORDER_PROTECTION_HOURS * 3600 * 1000) && hasZeroDeliveries;
            if (!isVeryLateGig) {
              const err: any = new Error('Cannot directly cancel an active or delivered order. Please submit a cancellation request (POST /api/orders/:id/cancel-request) or open a dispute (POST /api/orders/:id/dispute).');
              err.statusCode = 403;
              throw err;
            }
            order.cancellationType = 'very_late';
          }
        }
      }

      const actor = caller?.name || `user:${authUserId}`;
      const effectiveCancelType = order.cancellationType || 'direct';
      order.cancellationType = effectiveCancelType;
      if (hasFundedEscrow) {
        await refundOrderFunds(order, undefined, actor, reason, undefined, undefined, false, client);
        await client.query(
          `UPDATE orders SET cancellation_type = COALESCE(cancellation_type, $1), updated_at = NOW() WHERE id = $2`,
          [effectiveCancelType, order.id]
        );
        order.status = 'cancelled';
      } else {
        const updateRes = await client.query(
          `UPDATE orders SET status = 'cancelled', cancellation_type = $1, updated_at = NOW() WHERE id = $2 AND status NOT IN ('completed', 'cancelled')`,
          [effectiveCancelType, order.id]
        );
        if (updateRes.rowCount === 0) {
          const err: any = new Error('Order status changed concurrently; cannot cancel order.');
          err.statusCode = 409;
          throw err;
        }
        order.status = 'cancelled';
      }
      (order as any).cancellationReason = reason;
      (order as any).cancelledBy = caller?.id || 'system';
      (order as any).cancelledAt = new Date().toISOString();
      await cancelPendingOffersForOrder(order.id, caller?.id, client);

      return { order };
    });

    const { order } = txResult;
    await emitSystemEvent(order.id, 'order_cancelled', `Order was cancelled. Reason: ${reason}`);
    res.json({ success: true, order: enrichOrderWithServiceInfo(order) });
  } catch (err: any) {
    const statusCode = err?.statusCode || 400;
    res.status(statusCode).json({ error: err.message || 'Failed to cancel order' });
  } finally {
    releaseOrderLock(orderId);
  }
};

router.post('/orders/:id/cancel', requireAuth, rateLimit(20, 60_000), handleOrderCancel);
router.post('/orders/:id/review', requireAuth, handleSubmitReview);

router.put('/orders/:id', requireAuth, rateLimit(20, 60_000), async (req: Request, res: Response) => {
  if (req.body?.status === 'cancelled') {
    return handleOrderCancel(req, res);
  }
  if (req.body?.status === 'completed' || req.body?.status === 'refunded') {
    return res.status(400).json({
      error: `Cannot set order status to "${req.body.status}" directly without settling escrow. Use the escrow release or refund endpoint instead.`
    });
  }
  const orderId = req.params.id;
  const order = await store.getOrder(orderId);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  const authUserId = (req as any).authenticatedUserId || resolveAuthenticatedUserId(req);
  const caller = authUserId ? await store.getUser(authUserId) : null;
  if (!caller) return res.status(401).json({ error: 'Authentication required' });
  if (caller.id !== order.buyerId && caller.id !== order.sellerId && !isStaffUser(caller)) {
    return res.status(403).json({ error: 'Forbidden: You are not a participant in this order.' });
  }
  res.json(enrichOrderWithServiceInfo(order));
});

export default router;

import { randomUUID } from 'crypto';
import {
  store,
  users,
  messages,
  disputes,
  auditLogs,
  saveOrdersToDisk,
  type Order,
  type Gig,
  type User,
  type Dispute,
  type AuditLog,
  type Message
} from '../store.js';
import {
  LATE_ORDER_PROTECTION_HOURS,
  parseDeadlineInstant,
  isOrderVeryLate
} from '../../src/utils/deadlineUtils.js';
import { postgresStore } from '../db/postgresStore.js';
import {
  financialTransactionService,
  financialRepository,
  recordRecentClearingSync,
  getRecentClearingTotalSync
} from '../domains/finance/financial.service.js';
import { siteSettings } from '../../src/server/siteSettings.js';
import { workspaceService } from '../../src/server/workspaceService.js';
import { emitSystemEvent, recordMessage, registerMessage } from './messagingService.js';
import { createNotification, sendOrderEmail } from './notificationService.js';
import { recalculateUserRating } from './reviewService.js';
import { broadcastMessage } from '../websocket.js';
import { diagnosticService } from './diagnosticService.js';
import { cancelPendingOffersForOrder } from './workstreamService.js';

export interface ClearingEarning {
  orderId: string;
  sellerId: string;
  amount: number;
  clearsAt: string;
}
export const clearingEarnings: ClearingEarning[] = Object.freeze([]) as any;

export function getUnclearedEarnings(userId: string): number {
  return getRecentClearingTotalSync(userId);
}

export async function getUnclearedEarningsFromDb(userId: string, client?: any): Promise<number> {
  return await store.getUnclearedEarningsAmount(userId, client);
}

export async function getActiveEscrowRemaining(order: Order, client?: any): Promise<number> {
  const esc = await financialRepository.getEscrow(order.id, client);
  return esc ? Number(esc.remaining || 0) : 0;
}

export const orderIndex = new Map<string, Order>();

export const orderStateLocks = new Set<string>();

export function acquireOrderLock(orderId: string) {
  if (orderStateLocks.has(orderId)) {
    throw new Error('Action rejected: This order is currently being processed by another operation. Please retry in a moment.');
  }
  orderStateLocks.add(orderId);
}

export function tryAcquireOrderLock(orderId: string, res: any): boolean {
  try {
    acquireOrderLock(orderId);
    return true;
  } catch (err: any) {
    diagnosticService.log('security', 'orderService', 'tryAcquireOrderLock', 'server/services/orderService.ts', 'concurrency_lock', 'INTERCEPTED', { orderId }, err.message);
    res.status(409).json({ error: err.message });
    return false;
  }
}

export function releaseOrderLock(orderId: string) {
  orderStateLocks.delete(orderId);
}

export function registerOrder(o: Order) {
  // Authoritative persistence is handled directly via store.saveOrder
  return;
}

export async function recordOrder(o: Order, client?: any): Promise<void> {
  await workspaceService.ensureWorkspaceForOrderAsync(o, client);
  registerOrder(o);
}

export async function registerAuditLog(log: AuditLog, client?: any): Promise<void> {
  try {
    await store.addAuditLog(log, client);
  } catch (err) {
    console.error('[PostgresStore] Failed to save audit log:', err);
  }
}

export { saveOrdersToDisk };
export function saveUsersToPostgres() { return Promise.resolve(); }
export function saveGigsToPostgres() { return Promise.resolve(); }

export async function syncUserBalances(userIds?: string[], externalClient?: any) {
  const runSync = async (client: any, isSavepoint: boolean) => {
    const spName = 'sp_sync_user_balances';
    try {
      if (isSavepoint) {
        await client.query(`SAVEPOINT ${spName}`);
      }
      const hasSpecificUsers = Array.isArray(userIds) && userIds.length > 0;

      if (hasSpecificUsers) {
        const distinctIds = Array.from(new Set(userIds.filter(Boolean))).sort();
        if (distinctIds.length > 0) {
          // Unified Lock Order: 1. Lock Active Escrows sorted by order_id ASC
          await client.query(`SELECT order_id FROM escrows WHERE buyer_id = ANY($1::text[]) AND status IN ('held', 'split') ORDER BY order_id ASC FOR UPDATE`, [distinctIds]);
          // 2. Lock Wallets sorted by user_id ASC
          await client.query(`SELECT user_id FROM wallets WHERE user_id = ANY($1::text[]) ORDER BY user_id ASC FOR UPDATE`, [distinctIds]);

          await client.query(`
            UPDATE users u
            SET wallet_balance = w.available_balance
            FROM wallets w
            WHERE u.id = w.user_id
              AND u.id = ANY($1::text[])
              AND u.wallet_balance IS DISTINCT FROM w.available_balance
          `, [distinctIds]);

          await client.query(`
            UPDATE users u
            SET earned = COALESCE(ec.total_earned, 0)
            FROM (
              SELECT u2.id AS user_id, COALESCE(SUM(c.amount), 0) AS total_earned
              FROM users u2
              LEFT JOIN earnings_clearing c ON c.seller_id = u2.id
              WHERE u2.id = ANY($1::text[])
              GROUP BY u2.id
            ) ec
            WHERE u.id = ec.user_id
              AND u.earned IS DISTINCT FROM ec.total_earned
          `, [distinctIds]);

          await client.query(`
            UPDATE wallets w
            SET funds_on_hold = COALESCE(e.escrow_hold, 0.00)
            FROM (
              SELECT w2.user_id, COALESCE(SUM(esc.remaining), 0.00) AS escrow_hold
              FROM wallets w2
              LEFT JOIN escrows esc ON esc.buyer_id = w2.user_id AND esc.status IN ('held', 'split')
              WHERE w2.user_id = ANY($1::text[])
              GROUP BY w2.user_id
            ) e
            WHERE w.user_id = e.user_id
              AND w.funds_on_hold IS DISTINCT FROM COALESCE(e.escrow_hold, 0.00)
          `, [distinctIds]);
        }
      } else {
        // Unified Lock Order: 1. Lock all Active Escrows sorted by order_id ASC
        await client.query(`SELECT order_id FROM escrows WHERE status IN ('held', 'split') ORDER BY order_id ASC FOR UPDATE`);
        // 2. Lock all Wallets sorted by user_id ASC
        await client.query(`SELECT user_id FROM wallets ORDER BY user_id ASC FOR UPDATE`);

        await client.query(`
          UPDATE users u
          SET wallet_balance = w.available_balance
          FROM wallets w
          WHERE u.id = w.user_id
            AND u.wallet_balance IS DISTINCT FROM w.available_balance
        `);

        await client.query(`
          UPDATE users u
          SET earned = COALESCE(ec.total_earned, 0)
          FROM (
            SELECT u2.id AS user_id, COALESCE(SUM(c.amount), 0) AS total_earned
            FROM users u2
            LEFT JOIN earnings_clearing c ON c.seller_id = u2.id
            GROUP BY u2.id
          ) ec
          WHERE u.id = ec.user_id
            AND u.earned IS DISTINCT FROM ec.total_earned
        `);

        await client.query(`
          UPDATE wallets w
          SET funds_on_hold = COALESCE(e.escrow_hold, 0.00)
          FROM (
            SELECT w2.user_id, COALESCE(SUM(esc.remaining), 0.00) AS escrow_hold
            FROM wallets w2
            LEFT JOIN escrows esc ON esc.buyer_id = w2.user_id AND esc.status IN ('held', 'split')
            GROUP BY w2.user_id
          ) e
          WHERE w.user_id = e.user_id
            AND w.funds_on_hold IS DISTINCT FROM COALESCE(e.escrow_hold, 0.00)
        `);
      }
      if (isSavepoint) {
        await client.query(`RELEASE SAVEPOINT ${spName}`);
      }
    } catch (err) {
      if (isSavepoint) {
        try { await client.query(`ROLLBACK TO SAVEPOINT ${spName}`); } catch {}
      }
      console.error('[syncUserBalances] Error syncing balances:', err);
      throw err;
    }
  };

  if (externalClient) {
    return runSync(externalClient, true);
  } else {
    return postgresStore.executeInTransaction((client) => runSync(client, false));
  }
}

export async function ensureWallet(userId: string, client?: any) {
  try {
    await financialTransactionService.ensureWallet(userId, client);
  } catch (err) {
    console.error(`[ensureWallet] Failed for user ${userId}:`, err);
  }
}

export function syncIndexes() {
  // Clearing records are managed directly in PostgreSQL earnings_clearing
}

export async function resolveGigOrderPrice(gigId: string, extraIds: unknown): Promise<{ gig: any; gigPrice: number; extrasTitles: string[]; selectedExtrasDetails: any[]; totalDeliveryDays: number }> {
  const res = await postgresStore.getPool().query('SELECT * FROM gigs WHERE id = $1', [gigId]);
  if (res.rows.length === 0) {
    const err: any = new Error('Gig not found.');
    err.status = 404;
    throw err;
  }
  const r = res.rows[0];
  if (r.status && r.status !== 'active') {
    const err: any = new Error('This gig is not active for purchase.');
    err.status = 400;
    throw err;
  }
  const basePrice = Number(r.price || 0);
  const baseDeliveryDays = Math.max(1, Math.round(Number(r.delivery_days || r.deliveryDays || 7)));
  const parsedExtras = typeof r.extras === 'string' ? (() => { try { return JSON.parse(r.extras); } catch { return []; } })() : r.extras;
  const extras = Array.isArray(parsedExtras) ? parsedExtras : [];
  const requestedIds = Array.isArray(extraIds) 
    ? Array.from(new Set(extraIds.map(String).filter(Boolean)))
    : [];
  let extrasTotal = 0;
  let extrasDaysTotal = 0;
  const extrasTitles: string[] = [];
  const selectedExtrasDetails: any[] = [];

  for (const reqId of requestedIds) {
    const matched = extras.find((ex: any) => String(ex?.id) === String(reqId));
    if (!matched) {
      const err: any = new Error(`Invalid extra selected: ID "${reqId}" is not available for this Gig.`);
      err.status = 400;
      throw err;
    }
    const price = Math.round(Number(matched.price || 0) * 100) / 100;
    const deliveryDays = Math.max(0, Math.round(Number(matched.deliveryDays ?? matched.delivery_days)) || 0);
    extrasTotal += price;
    extrasDaysTotal += deliveryDays;
    extrasTitles.push(String(matched.title || 'Extra'));
    selectedExtrasDetails.push({
      id: String(matched.id),
      title: String(matched.title || 'Extra'),
      price,
      deliveryDays
    });
  }

  const gigPrice = Math.round((basePrice + extrasTotal) * 100) / 100;
  const totalDeliveryDays = baseDeliveryDays + extrasDaysTotal;
  return {
    gig: {
      id: r.id,
      title: r.title,
      price: basePrice,
      freelancerId: r.freelancer_id,
      freelancer_id: r.freelancer_id,
      deliveryDays: baseDeliveryDays,
      extras
    },
    gigPrice,
    extrasTitles,
    selectedExtrasDetails,
    totalDeliveryDays
  };
}

export function getReviewWindowStart(order: any, delivery: any): number {
  const deliveredAt = new Date(delivery?.deliveredAt).getTime();
  const restartedAt = order?.reviewWindowRestartedAt ? new Date(order.reviewWindowRestartedAt).getTime() : NaN;
  if (!isNaN(restartedAt) && (isNaN(deliveredAt) || restartedAt > deliveredAt)) return restartedAt;
  return deliveredAt;
}

export function getReviewWindowDays(): number {
  if (process.env.REVIEW_WINDOW_DAYS !== undefined) {
    const parsed = Number(process.env.REVIEW_WINDOW_DAYS);
    if (!isNaN(parsed) && parsed >= 0) return parsed;
  }
  const settings = siteSettings.getSettings();
  if (typeof settings.marketplace?.autoCompleteDeliveredDays === 'number') {
    return settings.marketplace.autoCompleteDeliveredDays;
  }
  return 3;
}

export function isAutoAcceptEnabled(): boolean {
  if (process.env.AUTO_ACCEPT_ENABLED !== undefined) {
    const v = process.env.AUTO_ACCEPT_ENABLED.trim().toLowerCase();
    if (v === 'false' || v === '0' || v === 'off' || v === 'no') return false;
  }
  const settings = siteSettings.getSettings();
  if (settings.marketplace?.autoCompleteDeliveredEnabled === false) return false;
  return getReviewWindowDays() > 0;
}

export { LATE_ORDER_PROTECTION_HOURS, parseDeadlineInstant, isOrderVeryLate };

/**
 * Calculates a new extended deadline instant from an existing deadline.
 * Preserves the exact time-of-day and UTC offset, returning a full ISO 8601 string.
 * Returns null if the existing deadline is invalid or missing.
 */
export function calculateExtendedDeadline(
  existingDueDate: unknown,
  daysToAdd: number,
  referenceCreatedAt?: unknown
): string | null {
  if (!Number.isFinite(daysToAdd) || daysToAdd <= 0) return null;
  const baseInstant = parseDeadlineInstant(existingDueDate, referenceCreatedAt);
  if (baseInstant === null) return null;
  const newDate = new Date(baseInstant + daysToAdd * 86400000);
  return newDate.toISOString();
}

export function assertOrderOpen(order: Order) {
  if (order.status === 'completed') throw new Error('Order is already completed; funds were already released.');
  if (order.status === 'cancelled') throw new Error('Order is already cancelled; funds were already handled.');
}

export async function fundOrderEscrowWithEvent(params: { orderId: string; orderTitle: string; amount: number; buyerId: string; sellerId: string; actor: string; skipMinimum?: boolean; idempotencyKey?: string }, externalClient?: any) {
  return await financialTransactionService.fundEscrow(params, externalClient);
}

export async function topUpOrderEscrowWithEvent(params: { orderId: string; orderTitle: string; amount: number; buyerId: string; sellerId: string; actor: string; skipMinimum?: boolean; idempotencyKey?: string }, externalClient?: any) {
  const res = await financialTransactionService.topUpEscrow(params, externalClient);
  await emitSystemEvent(params.orderId, 'escrow_funded', `🔒 Additional $${params.amount.toLocaleString()} funded into escrow for "${params.orderTitle}".`, { amount: params.amount, isTopUp: true }, externalClient);
  return res;
}

export async function releaseOrderFunds(
  order: Order, 
  actor: string, 
  reason: string, 
  approvedByBuyer: boolean, 
  requestKey?: string,
  allowDisputeResolution?: boolean,
  externalClient?: any
) {
  if (order.status === 'completed' && !requestKey) {
    throw new Error('Order is already completed; funds were already released.');
  }
  if (!allowDisputeResolution && order.cancellationRequest && order.cancellationRequest.status === 'pending') {
    throw new Error('Cannot release payment while a cancellation request is pending. The cancellation request must be resolved or rejected first.');
  }

  const result = await financialTransactionService.releaseOrderFunds({
    orderId: order.id,
    actor,
    reason,
    idempotencyKey: requestKey,
    allowDisputeResolution
  }, externalClient);

  order.status = 'completed';
  if (!order.completedAt) {
    order.completedAt = new Date().toISOString();
  }
  if (Array.isArray(order.deliveryHistory) && order.deliveryHistory.length > 0) {
    order.acceptedVersion = order.deliveryHistory[order.deliveryHistory.length - 1].version;
  }

  const dbRunner = externalClient || postgresStore.getPool();
  await dbRunner.query(
    'UPDATE orders SET completed_at = COALESCE(completed_at, $1), accepted_version = COALESCE($2, accepted_version) WHERE id = $3',
    [order.completedAt, order.acceptedVersion ?? null, order.id]
  );

  await syncUserBalances([order.buyerId, order.sellerId].filter(Boolean), externalClient);

  if (approvedByBuyer) {
    await emitSystemEvent(order.id, 'deliverable_approved', `✅ Deliverables approved by buyer.`, {
      freelancerNet: result.freelancerNet,
      acceptedVersion: order.acceptedVersion
    }, externalClient);
  }

  await emitSystemEvent(order.id, 'escrow_released', `🎉 Escrow funds ($${order.amount.toLocaleString()}) released to seller! Workstream marked as completed.`, {
    amount: order.amount,
    freelancerNet: result.freelancerNet,
    platformFee: result.platformFee,
    orderCompleted: true
  }, externalClient);

  await emitSystemEvent(order.id, 'order_completed', `✅ Order completed.`, {}, externalClient);
  return result;
}

export async function refundOrderFunds(
  order: Order, 
  amount: number | undefined, 
  actor: string, 
  reason: string, 
  requestKey?: string,
  cancellationData?: { cancellationRequest?: any; cancellationHistory?: any },
  allowDisputeResolution?: boolean,
  externalClient?: any
) {
  const result = await financialTransactionService.refundOrderFunds({
    orderId: order.id,
    amount,
    reason,
    actor,
    idempotencyKey: requestKey,
    allowDisputeResolution
  }, externalClient);

  if (result.remaining === 0) {
    order.status = 'cancelled';
  }

  await syncUserBalances([order.buyerId, order.sellerId].filter(Boolean), externalClient);
  const dbRunner = externalClient || postgresStore.getPool();
  const cancelReqJson = cancellationData?.cancellationRequest !== undefined
    ? JSON.stringify(cancellationData.cancellationRequest)
    : (order.cancellationRequest ? JSON.stringify(order.cancellationRequest) : null);
  const cancelHistJson = cancellationData?.cancellationHistory !== undefined
    ? JSON.stringify(cancellationData.cancellationHistory)
    : (order.cancellationHistory ? JSON.stringify(order.cancellationHistory) : null);

  await dbRunner.query(
    `UPDATE orders 
     SET status = $1, 
         cancellation_type = COALESCE($2, cancellation_type),
         cancellation_request = COALESCE($3, cancellation_request),
         cancellation_history = COALESCE($4, cancellation_history)
     WHERE id = $5 AND status != 'completed'`,
    [
      order.status,
      order.cancellationType || null,
      cancelReqJson,
      cancelHistJson,
      order.id
    ]
  );

  await emitSystemEvent(order.id, 'escrow_refunded', `💸 Escrow refunded ($${result.refunded.toLocaleString()}) to buyer wallet. Reason: ${reason}`, {
    refunded: result.refunded,
    orderCancelled: order.status === 'cancelled'
  }, externalClient);

  return result;
}

export async function splitOrderFunds(order: Order, refundAmount: number, actor: string, reason: string, requestKey?: string, externalClient?: any) {
  assertOrderOpen(order);
  const result = await financialTransactionService.resolveEscrowSplit({ orderId: order.id, refundAmount, reason, actor, idempotencyKey: requestKey, allowDisputeResolution: true }, externalClient);
  order.status = 'completed';
  if (!order.completedAt) {
    order.completedAt = new Date().toISOString();
  }

  await syncUserBalances([order.buyerId, order.sellerId].filter(Boolean), externalClient);
  const dbRunner = externalClient || postgresStore.getPool();
  await dbRunner.query(
    'UPDATE orders SET status = $1, completed_at = COALESCE(completed_at, $2) WHERE id = $3 AND status NOT IN (\'completed\', \'cancelled\')',
    ['completed', order.completedAt, order.id]
  );

  await emitSystemEvent(order.id, 'escrow_refunded', `💸 Partial refund of $${refundAmount.toLocaleString()} returned to buyer wallet. Reason: ${reason}`, {
    refunded: refundAmount,
    splitResolution: true
  }, externalClient);
  await emitSystemEvent(order.id, 'escrow_released', `🎉 Remaining escrow funds ($${result.release.freelancerNet.toLocaleString()}) released to seller. Workstream marked as completed.`, {
    freelancerNet: result.release.freelancerNet,
    platformFee: result.release.platformFee,
    orderCompleted: true,
    splitResolution: true
  }, externalClient);
  await emitSystemEvent(order.id, 'order_completed', `✅ Order completed via dispute resolution.`, {}, externalClient);

  return result;
}

export function validateOrderReleasePreconditions(order: Order, isAdmin = false, isInvoiceApproval = false): { status: number; error: string } | null {
  if (order.status === 'completed') {
    diagnosticService.log('security', 'orderService', 'validateOrderReleasePreconditions', 'server/services/orderService.ts', 'release_preconditions', 'INTERCEPTED', { orderId: order.id, status: order.status }, 'Order is already completed');
    return { status: 400, error: 'Order is already completed and payment has already been released.' };
  }
  if (order.status === 'cancelled') {
    diagnosticService.log('security', 'orderService', 'validateOrderReleasePreconditions', 'server/services/orderService.ts', 'release_preconditions', 'INTERCEPTED', { orderId: order.id, status: order.status }, 'Order is cancelled; funds already refunded');
    return { status: 400, error: 'Order is cancelled; funds have been returned to the buyer.' };
  }
  if (order.cancellationRequest && order.cancellationRequest.status === 'pending') {
    diagnosticService.log('security', 'orderService', 'validateOrderReleasePreconditions', 'server/services/orderService.ts', 'release_preconditions', 'INTERCEPTED', { orderId: order.id, cancellationRequest: order.cancellationRequest }, 'Cannot release payment while cancellation request is pending');
    return { status: 400, error: 'Cannot release payment while a cancellation request is pending. The cancellation request must be resolved or rejected first.' };
  }
  if (!isAdmin && (order.status as string) === 'disputed') {
    diagnosticService.log('security', 'orderService', 'validateOrderReleasePreconditions', 'server/services/orderService.ts', 'release_preconditions', 'INTERCEPTED', { orderId: order.id, status: order.status }, 'Cannot release payment while dispute is open');
    return { status: 400, error: 'Cannot release payment while an active dispute is open. The dispute must be resolved first.' };
  }
  const hasDeliverables = (Array.isArray(order.deliverableFiles) && order.deliverableFiles.length > 0) ||
                          (Array.isArray(order.deliveryHistory) && order.deliveryHistory.length > 0) ||
                          Boolean(order.deliveryReference) ||
                          order.status === 'delivered';
  if (!isAdmin && !hasDeliverables) {
    diagnosticService.log('security', 'orderService', 'validateOrderReleasePreconditions', 'server/services/orderService.ts', 'release_preconditions', 'INTERCEPTED', { orderId: order.id, status: order.status }, 'Payment release attempted without deliverable evidence');
    return { status: 400, error: 'Payment can only be released after deliverables have been submitted.' };
  }
  if (!isAdmin && !isInvoiceApproval && order.status !== 'delivered') {
    diagnosticService.log('security', 'orderService', 'validateOrderReleasePreconditions', 'server/services/orderService.ts', 'release_preconditions', 'INTERCEPTED', { orderId: order.id, status: order.status }, 'Payment release attempted before work was delivered');
    return { status: 400, error: 'Payment can only be released after the freelancer has submitted deliverables.' };
  }
  if (!isAdmin && !isInvoiceApproval && Array.isArray(order.revisions)) {
    const activeRev = order.revisions.some(r => r.status === 'requested');
    if (activeRev) {
      diagnosticService.log('security', 'orderService', 'validateOrderReleasePreconditions', 'server/services/orderService.ts', 'release_preconditions', 'INTERCEPTED', { orderId: order.id, revisions: order.revisions }, 'Payment release attempted while revision is pending');
      return { status: 400, error: 'Cannot release payment while a revision is in progress. The freelancer must deliver the revised work first.' };
    }
  }
  return null;
}

export function enrichOrderWithServiceInfo(o: Order, isAdmin: boolean = false) {
  const resolvedType = o.orderType || (o as any).type || (o.projectId ? 'project' : 'gig');
  let reviewWindowDays = o.reviewWindowDays;
  let reviewWindowExpiresAt = o.reviewWindowExpiresAt;
  if (
    resolvedType === 'gig' &&
    o.status === 'delivered' &&
    Array.isArray(o.deliveryHistory) &&
    o.deliveryHistory.length > 0
  ) {
    const latestDelivery = o.deliveryHistory[o.deliveryHistory.length - 1];
    const startMs = getReviewWindowStart(o, latestDelivery);
    if (!isNaN(startMs)) {
      const days = typeof reviewWindowDays === 'number' && reviewWindowDays > 0 ? reviewWindowDays : getReviewWindowDays();
      reviewWindowDays = days;
      if (!reviewWindowExpiresAt) {
        reviewWindowExpiresAt = new Date(startMs + days * 24 * 60 * 60 * 1000).toISOString();
      }
    }
  }
  const isCustomOrder = Boolean(o.metadata?.isInquiry || (o as any).metadata?.isCustomOrder || (o as any).metadata?.customOrderFromInquiry);
  const base = {
    ...o,
    orderType: resolvedType,
    type: resolvedType,
    ...(isCustomOrder ? { isCustomOrder: true, isInquiry: true } : {}),
    gigOrderId: o.gigOrderId || (resolvedType === 'gig' ? o.id : undefined),
    projectOrderId: o.projectOrderId || (resolvedType === 'project' ? o.id : undefined),
    ...(reviewWindowDays !== undefined ? { reviewWindowDays } : {}),
    ...(reviewWindowExpiresAt ? { reviewWindowExpiresAt } : {}),
    sellerName: (o as any).sellerName || o.sellerUsername || 'Seller',
    sellerAvatar: (o as any).sellerAvatar || '',
    buyerName: (o as any).buyerName || o.buyerUsername || 'Buyer',
    buyerAvatar: (o as any).buyerAvatar || ''
  };
  if (!isAdmin) {
    const { adminInternalNotes, adminHistory, ...sanitized } = base as any;
    return sanitized;
  }
  return base;
}

export async function processCancellationTimeouts() {
  const now = Date.now();
  const pool = postgresStore.getPool();
  try {
    const res = await pool.query(
      "SELECT id FROM orders WHERE status NOT IN ('completed', 'cancelled', 'disputed') AND cancellation_request IS NOT NULL"
    );
    for (const r of res.rows) {
      const order = await store.getOrder(r.id);
      if (!order || order.status === 'completed' || order.status === 'cancelled' || order.status === 'disputed' || !order.cancellationRequest || order.cancellationRequest.status !== 'pending') continue;
      const respondByTime = new Date(order.cancellationRequest.respondBy).getTime();

      if (now > respondByTime) {
        if (orderStateLocks.has(order.id)) continue;
        try {
          acquireOrderLock(order.id);
        } catch {
          continue;
        }
        try {
          const pendingNotifications = await postgresStore.executeInTransaction(async (client) => {
            const lockRes = await client.query(
              "SELECT * FROM orders WHERE id = $1 FOR UPDATE",
              [order.id]
            );
            if (lockRes.rows.length === 0) return null;
            const freshRow = lockRes.rows[0];

            if (freshRow.status === 'completed' || freshRow.status === 'cancelled' || freshRow.status === 'disputed') {
              return null;
            }

            let cancelReq = freshRow.cancellation_request;
            if (typeof cancelReq === 'string') {
              try { cancelReq = JSON.parse(cancelReq); } catch {}
            }
            if (!cancelReq || cancelReq.status !== 'pending') {
              return null;
            }

            const respondByTimeMs = new Date(cancelReq.respondBy).getTime();
            if (now <= respondByTimeMs) {
              return null;
            }

            const activeDisputeRes = await client.query(
              "SELECT 1 FROM disputes WHERE order_id = $1 AND status IN ('open', 'under_investigation', 'under_review') LIMIT 1",
              [order.id]
            );
            if (activeDisputeRes.rows.length > 0) {
              return null;
            }

            const freshOrder = (store as any).mapOrderRow ? (store as any).mapOrderRow(freshRow) : await store.getOrder(order.id, client);
            if (!freshOrder) return null;

            const requesterId = cancelReq.requesterId;
            const otherId = requesterId === freshOrder.buyerId ? freshOrder.sellerId : freshOrder.buyerId;

            const orderMeta = typeof (freshRow as any).metadata === 'string'
              ? (() => { try { return JSON.parse((freshRow as any).metadata); } catch { return {}; } })()
              : ((freshRow as any).metadata || (freshOrder as any).metadata || {});
            const isCustomOrder = Boolean((freshOrder as any).isCustomOrder || orderMeta.isCustomOrder || orderMeta.customOrderFromInquiry);
            const escRow = await financialRepository.getEscrow(freshOrder.id, client);
            const hasEscrowRecord = Boolean(escRow && (Number(escRow.remaining || 0) > 0 || escRow.status === 'held' || Number(escRow.amount || 0) > 0));

            const isAuthoritativeInquiryOnly = Boolean(
              ((freshOrder as any).isInquiry === true || orderMeta.isInquiry === true) &&
              !isCustomOrder &&
              !hasEscrowRecord
            );

            if (isAuthoritativeInquiryOnly) {
              freshOrder.status = 'cancelled';
              cancelReq.status = 'auto_cancelled';
              freshOrder.cancellationRequest = cancelReq;
              if (Array.isArray(freshOrder.cancellationHistory)) {
                for (const ch of freshOrder.cancellationHistory) {
                  if (ch.requestedAt === cancelReq.requestedAt) {
                    ch.status = 'auto_cancelled';
                  }
                }
              }
              await client.query(
                "UPDATE orders SET status = 'cancelled', cancellation_type = 'inquiry_cancelled', cancellation_request = $1, cancellation_history = $2, updated_at = NOW() WHERE id = $3",
                [JSON.stringify(cancelReq), JSON.stringify(freshOrder.cancellationHistory || []), freshOrder.id]
              );
              await cancelPendingOffersForOrder(freshOrder.id, 'system', client);
              return [
                {
                  userId: requesterId,
                  title: 'Inquiry Cancelled',
                  message: `Inquiry thread #${freshOrder.id} request timed out and was closed.`,
                  type: 'order',
                  link: `/workstream/${freshOrder.id}`
                },
                {
                  userId: otherId,
                  title: 'Inquiry Cancelled',
                  message: `Inquiry thread #${freshOrder.id} request timed out and was closed.`,
                  type: 'order',
                  link: `/workstream/${freshOrder.id}`
                }
              ];
            }

            const requestKey = `cancel_timeout_${freshOrder.id}_${cancelReq.requestedAt}`;
            freshOrder.cancellationRequest = cancelReq;
            const refundRes = await refundOrderFunds(
              freshOrder, 
              undefined, 
              'System Auto-Cancel', 
              'Cancellation request auto-cancelled after 48h timeout', 
              requestKey,
              undefined,
              false,
              client
            );

            cancelReq.status = 'auto_cancelled';
            if (Array.isArray(freshOrder.cancellationHistory)) {
              for (const ch of freshOrder.cancellationHistory) {
                if (ch.requestedAt === cancelReq.requestedAt) {
                  ch.status = 'auto_cancelled';
                }
              }
            }
            await client.query(
              "UPDATE orders SET cancellation_request = $1, cancellation_history = $2, cancellation_type = COALESCE(cancellation_type, 'auto_timeout'), updated_at = NOW() WHERE id = $3",
              [JSON.stringify(cancelReq), JSON.stringify(freshOrder.cancellationHistory || []), freshOrder.id]
            );
            await cancelPendingOffersForOrder(freshOrder.id, 'system', client);

            return [
              {
                userId: requesterId,
                title: 'Cancellation Auto-Cancelled',
                message: `Order #${freshOrder.id} cancellation request timed out after 48h. Order cancelled & full refund issued ($${refundRes.refunded}).`,
                type: 'order',
                link: `/workstream/${freshOrder.id}`
              },
              {
                userId: otherId,
                title: 'Cancellation Auto-Cancelled',
                message: `Order #${freshOrder.id} cancellation request timed out after 48h. Order cancelled & full refund issued ($${refundRes.refunded}).`,
                type: 'order',
                link: `/workstream/${freshOrder.id}`
              }
            ];
          });

          if (pendingNotifications) {
            for (const notif of pendingNotifications) {
              await createNotification(notif);
            }
          }
        } catch (err) {
          console.error(`[CancellationTimeout] Failed to auto-cancel order ${order.id}:`, err);
        } finally {
          releaseOrderLock(order.id);
        }
      }
    }
  } catch (err) {
    console.error('[processCancellationTimeouts] Query error:', err);
  }
}

export async function processAutoAcceptOrders(customNow?: number): Promise<Array<{
  orderId: string;
  acceptedVersion: number;
  amount: number;
  freelancerNet: number;
}>> {
  if (!isAutoAcceptEnabled()) {
    return [];
  }

  const now = typeof customNow === 'number' ? customNow : Date.now();
  const processed: Array<{ orderId: string; acceptedVersion: number; amount: number; freelancerNet: number }> = [];
  const pool = postgresStore.getPool();

  try {
    const ordersRes = await pool.query("SELECT id FROM orders WHERE status = 'delivered'");
    const targetOrders: Order[] = [];
    for (const r of ordersRes.rows) {
      const order = await store.getOrder(r.id);
      if (order) targetOrders.push(order);
    }

    for (const order of targetOrders) {
      const isProject = order.orderType === 'project';
      const persistedDays = !isProject && typeof order.reviewWindowDays === 'number' && order.reviewWindowDays > 0
        ? order.reviewWindowDays
        : null;
      const days = isProject ? 7 : (persistedDays ?? getReviewWindowDays());
      const windowMs = days * 24 * 60 * 60 * 1000;

      if (!Array.isArray(order.deliveryHistory) || order.deliveryHistory.length === 0) continue;
      const latestDelivery = order.deliveryHistory[order.deliveryHistory.length - 1];
      if (!latestDelivery || !latestDelivery.deliveredAt) continue;

      const deliveredAt = getReviewWindowStart(order, latestDelivery);
      const persistedExpiryMs = !isProject && order.reviewWindowExpiresAt ? Date.parse(order.reviewWindowExpiresAt) : NaN;
      let reviewDeadlineMs: number;
      if (!isNaN(persistedExpiryMs)) {
        const restartedAtMs = order.reviewWindowRestartedAt ? Date.parse(order.reviewWindowRestartedAt) : NaN;
        reviewDeadlineMs = (!isNaN(restartedAtMs) && restartedAtMs + windowMs > persistedExpiryMs)
          ? restartedAtMs + windowMs
          : persistedExpiryMs;
      } else {
        if (isNaN(deliveredAt)) continue;
        reviewDeadlineMs = deliveredAt + windowMs;
      }
      if (now < reviewDeadlineMs) continue;

      if (Array.isArray(order.revisions)) {
        const hasActiveRequestedRevision = order.revisions.some(rev => rev.status === 'requested');
        if (hasActiveRequestedRevision) continue;
      }

      if (order.cancellationRequest && order.cancellationRequest.status === 'pending') continue;

      const dispute = await store.getDisputeByOrderId(order.id);
      if (dispute && (dispute.status === 'open' || dispute.status === 'under_investigation' || (dispute.status as string) === 'under_review')) continue;

      const esc = await financialRepository.getEscrow(order.id);
      const hasEscrow = (esc && esc.remaining > 0 && esc.status !== 'released' && esc.status !== 'refunded');
      if (!hasEscrow) {
        continue;
      }

      if (orderStateLocks.has(order.id)) continue;
      try {
        acquireOrderLock(order.id);
      } catch {
        continue;
      }

      const requestKey = `auto_accept_${order.id}_v${latestDelivery.version}`;
      try {
        const autoResult = await postgresStore.executeInTransaction(async (client) => {
          const lockRes = await client.query(
            "SELECT * FROM orders WHERE id = $1 AND status = 'delivered' FOR UPDATE",
            [order.id]
          );
          if (lockRes.rows.length === 0) return null;
          const freshRow = lockRes.rows[0];

          let cancelReq = freshRow.cancellation_request;
          if (typeof cancelReq === 'string') {
            try { cancelReq = JSON.parse(cancelReq); } catch {}
          }
          if (cancelReq && cancelReq.status === 'pending') return null;

          let revs = freshRow.revisions;
          if (typeof revs === 'string') {
            try { revs = JSON.parse(revs); } catch {}
          }
          if (Array.isArray(revs) && revs.some((rev: any) => rev.status === 'requested')) return null;

          const activeDisputeRes = await client.query(
            "SELECT id FROM disputes WHERE order_id = $1 AND status IN ('open', 'under_investigation', 'under_review') LIMIT 1",
            [order.id]
          );
          if (activeDisputeRes.rows.length > 0) return null;

          const freshOrder = (store as any).mapOrderRow ? (store as any).mapOrderRow(freshRow) : await store.getOrder(order.id, client);
          if (!freshOrder || freshOrder.status !== 'delivered') return null;

          if (!Array.isArray(freshOrder.deliveryHistory) || freshOrder.deliveryHistory.length === 0) return null;
          const freshLatestDelivery = freshOrder.deliveryHistory[freshOrder.deliveryHistory.length - 1];
          if (!freshLatestDelivery || !freshLatestDelivery.deliveredAt || freshLatestDelivery.version !== latestDelivery.version) return null;

          const freshIsProject = freshOrder.orderType === 'project';
          const freshPersistedDays = !freshIsProject && typeof freshOrder.reviewWindowDays === 'number' && freshOrder.reviewWindowDays > 0
            ? freshOrder.reviewWindowDays
            : null;
          const freshDays = freshIsProject ? 7 : (freshPersistedDays ?? days);
          const freshWindowMs = freshDays * 24 * 60 * 60 * 1000;
          const freshDeliveredAt = getReviewWindowStart(freshOrder, freshLatestDelivery);
          const freshPersistedExpiryMs = !freshIsProject && freshOrder.reviewWindowExpiresAt ? Date.parse(freshOrder.reviewWindowExpiresAt) : NaN;
          let freshReviewDeadlineMs: number;
          if (!isNaN(freshPersistedExpiryMs)) {
            const freshRestartedAtMs = freshOrder.reviewWindowRestartedAt ? Date.parse(freshOrder.reviewWindowRestartedAt) : NaN;
            freshReviewDeadlineMs = (!isNaN(freshRestartedAtMs) && freshRestartedAtMs + freshWindowMs > freshPersistedExpiryMs)
              ? freshRestartedAtMs + freshWindowMs
              : freshPersistedExpiryMs;
          } else {
            if (isNaN(freshDeliveredAt)) return null;
            freshReviewDeadlineMs = freshDeliveredAt + freshWindowMs;
          }
          if (now < freshReviewDeadlineMs) return null;

          freshOrder.acceptedVersion = freshLatestDelivery.version;
          const relResult = await releaseOrderFunds(
            freshOrder, 
            'System Auto-Accept', 
            `Auto-accept after buyer review window (${freshDays} days) elapsed`, 
            false, 
            requestKey, 
            false, 
            client
          );
          freshOrder.acceptedVersion = freshLatestDelivery.version;
          await store.saveOrder(freshOrder, client);

          const resolvedAtIso = new Date(now).toISOString();
          const associatedOfferId = typeof (freshLatestDelivery as any).offerId === 'string' && (freshLatestDelivery as any).offerId
            ? (freshLatestDelivery as any).offerId
            : null;
          if (associatedOfferId) {
            await client.query(
              "UPDATE workstream_offers SET status = 'paid', resolved_at = $1, resolved_by = 'system' WHERE id = $2 AND order_id = $3 AND kind = 'invoice' AND status = 'pending' AND amount <= $4",
              [resolvedAtIso, associatedOfferId, freshOrder.id, freshOrder.amount]
            );
          } else {
            const targetInvoiceRes = await client.query(
              `SELECT id FROM workstream_offers
               WHERE order_id = $1 AND kind = 'invoice' AND status = 'pending' AND amount <= $2
               ORDER BY
                 CASE WHEN (metadata->>'deliveryVersion') = $3 THEN 0 ELSE 1 END,
                 created_at DESC
               LIMIT 1
               FOR UPDATE`,
              [freshOrder.id, freshOrder.amount, String(freshLatestDelivery.version)]
            );
            if (targetInvoiceRes.rows.length > 0) {
              await client.query(
                "UPDATE workstream_offers SET status = 'paid', resolved_at = $1, resolved_by = 'system' WHERE id = $2 AND order_id = $3 AND kind = 'invoice' AND status = 'pending'",
                [resolvedAtIso, targetInvoiceRes.rows[0].id, freshOrder.id]
              );
            }
          }

          return { freshOrder, relResult, freshDays };
        });

        if (!autoResult) continue;
        const { freshOrder, relResult, freshDays } = autoResult;

        const sysMsg: Message = {
          id: `msg_${randomUUID()}`,
          orderId: freshOrder.id,
          senderId: 'system',
          senderName: 'WorkPerHour System',
          text: `🎉 Deliverables automatically accepted: Buyer review window (${freshDays} days) closed without revisions or dispute. Escrow funds released to seller.`,
          timestamp: new Date(now).toISOString(),
          type: 'system',
          metadata: {
            action: 'order_auto_accepted',
            acceptedVersion: latestDelivery.version,
            reviewWindowDays: freshDays
          }
        };
        await recordMessage(sysMsg);

        const autoLog: AuditLog = {
          id: 'log_' + randomUUID(),
          actor: 'System Auto-Accept',
          role: 'system',
          action: 'ORDER_AUTO_ACCEPTED',
          target: `Order #${freshOrder.id}`,
          details: `Auto-accepted deliverables (version ${latestDelivery.version}) after ${freshDays}-day buyer review window expired`,
          timestamp: new Date(now).toISOString()
        };
        await registerAuditLog(autoLog);

        processed.push({
          orderId: freshOrder.id,
          acceptedVersion: latestDelivery.version,
          amount: freshOrder.amount,
          freelancerNet: relResult.freelancerNet
        });
      } catch (err: any) {
        console.error(`[ReviewWindow] Failed to auto-accept order ${order.id}:`, err);
      } finally {
        releaseOrderLock(order.id);
      }
    }
  } catch (err) {
    console.error('[processAutoAcceptOrders] Query error:', err);
  }

  return processed;
}

export async function atomicUpdateOrder(orderId: string, updates: Record<string, any>, allowedStatuses: string[], client?: any): Promise<boolean> {
  const dbRunner = client || postgresStore.getPool();
  const keys = Object.keys(updates);
  const setClause = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
  const values = keys.map(k => updates[k]);
  
  const query = `
    UPDATE orders 
    SET ${setClause}
    WHERE id = $1 AND status = ANY($${keys.length + 2})
  `;
  const res = await dbRunner.query(query, [orderId, ...values, allowedStatuses]);
  return res.rowCount !== null && res.rowCount > 0;
}

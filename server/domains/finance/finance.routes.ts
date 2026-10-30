import { Router, Request, Response } from 'express';
import express from 'express';
import { randomUUID, createHmac, timingSafeEqual } from 'crypto';
import {
  store,
  cleanAllStoreData,
  mapDisputeRow,
  mapPayoutRow,
  mapPaymentMethodRow,
  type Message,
  type Payout,
  type Dispute,
  type Refund,
  type Order,
  type CustomInvoice,
  type PaymentMethodRecord
} from '../../store.js';
import { postgresStore, isPostgresEnabled } from '../../db/postgresStore.js';
import { financialTransactionService, financialRepository, checkOrRecordIdempotency, recordIdempotencyResult } from './financial.service.js';
import { diagnosticService } from '../../services/diagnosticService.js';
import { financeLedger, FinanceLedgerEngine } from './financeLedger.js';
import { paymentGatewayManager } from './paymentGateways.js';

import {
  requireAuth,
  requireActiveStatus,
  requireFinancialActiveStatus,
  requireRole,
  requireAdmin,
  adminActor,
  rateLimit,
  resolveAuthenticatedUserId,
  IS_PRODUCTION,
  formatApiError,
  areSimulatedDepositsAllowed
} from '../../middleware/auth.js';
import {
  orderStateLocks,
  tryAcquireOrderLock,
  releaseOrderLock,
  resolveGigOrderPrice,
  enrichOrderWithServiceInfo,
  releaseOrderFunds,
  refundOrderFunds,
  fundOrderEscrowWithEvent,
  topUpOrderEscrowWithEvent,
  recordOrder,
  syncUserBalances,
  ensureWallet,
  LATE_ORDER_PROTECTION_HOURS,
  registerAuditLog,
  validateOrderReleasePreconditions,
  parseDeadlineInstant
} from '../../services/orderService.js';
import { siteSettings } from '../../../src/server/siteSettings.js';
import { broadcastMessage } from '../../websocket.js';
import { recordMessage, emitSystemEvent } from '../../services/messagingService.js';
import { closeActiveDispute } from '../../services/disputeService.js';
import {
  handlePayoutRequest,
  approvePayout,
  processPayout,
  rejectPayout,
  failPayout,
  retryPayout,
  formatPayoutRow
} from './payout.service.js';
import { DEFAULT_FEE_CONFIG, calculateOrderFees, quoteOrderWithLiveSettings } from './fees.js';

function formatRefundRow(r: any): Refund {
  return {
    id: r.id,
    orderId: r.order_id,
    buyerId: r.buyer_id,
    amount: Number(r.amount),
    reason: r.reason || '',
    status: r.status,
    createdAt: r.created_at
  };
}

function formatPaymentMethodRow(r: any): PaymentMethodRecord {
  return mapPaymentMethodRow(r);
}

const router = Router();

// ==========================================
// PUBLIC FEES & INQUIRIES
// ==========================================

router.get('/fees/quote', async (req: Request, res: Response) => {
  try {
    let gigPrice: number;
    if (typeof req.query.gigId === 'string' && req.query.gigId) {
      const extraIds = typeof req.query.extraIds === 'string' && req.query.extraIds ? req.query.extraIds.split(',') : [];
      const resolved = await resolveGigOrderPrice(req.query.gigId, extraIds);
      gigPrice = resolved.gigPrice;
    } else {
      gigPrice = Number(req.query.amount);
    }
    if (!Number.isFinite(gigPrice) || gigPrice < 0) return res.status(400).json({ error: 'A valid gigId or amount is required.' });
    
    // Authoritative fee calculation using live admin settings
    const q = await quoteOrderWithLiveSettings(gigPrice);
    res.json({ ...q });
  } catch (err: any) {
    res.status(err.status || 400).json({ error: err.message });
  }
});

router.get('/disputes', requireAuth, async (req: Request, res: Response) => {
  try {
    const authUserId = (req as any).authenticatedUserId;
    const pool = postgresStore.getPool();
    const callerRes = await pool.query('SELECT role FROM users WHERE id = $1', [authUserId]);
    const caller = callerRes.rows[0];
    const isAdmin = caller?.role === 'admin' || caller?.role === 'super_admin' || caller?.role === 'support';

    let result;
    if (isAdmin) {
      result = await pool.query('SELECT * FROM disputes ORDER BY created_at DESC');
    } else {
      result = await pool.query(
        `SELECT d.* FROM disputes d
         LEFT JOIN orders o ON d.order_id = o.id
         WHERE d.raised_by = $1 OR d.buyer_id = $1 OR d.seller_id = $1 OR o.buyer_id = $1 OR o.seller_id = $1
         ORDER BY d.created_at DESC`,
        [authUserId]
      );
    }
    res.json(result.rows.map(mapDisputeRow));
  } catch (err: any) {
    res.status(500).json(formatApiError(err));
  }
});

router.get('/refunds', requireAuth, async (req: Request, res: Response) => {
  try {
    const authUserId = (req as any).authenticatedUserId;
    const pool = postgresStore.getPool();
    const callerRes = await pool.query('SELECT role FROM users WHERE id = $1', [authUserId]);
    const caller = callerRes.rows[0];
    const isAdmin = caller?.role === 'admin' || caller?.role === 'super_admin' || caller?.role === 'support';

    let result;
    if (isAdmin) {
      result = await pool.query('SELECT * FROM refunds ORDER BY created_at DESC');
    } else {
      result = await pool.query(
        `SELECT r.* FROM refunds r
         LEFT JOIN orders o ON r.order_id = o.id
         WHERE r.buyer_id = $1 OR o.buyer_id = $1 OR o.seller_id = $1
         ORDER BY r.created_at DESC`,
        [authUserId]
      );
    }
    res.json(result.rows.map(formatRefundRow));
  } catch (err: any) {
    res.status(500).json(formatApiError(err));
  }
});

router.get('/payouts', requireAuth, async (req: Request, res: Response) => {
  try {
    const authUserId = (req as any).authenticatedUserId;
    const pool = postgresStore.getPool();
    const callerRes = await pool.query('SELECT role FROM users WHERE id = $1', [authUserId]);
    const caller = callerRes.rows[0];
    const isAdmin = caller?.role === 'admin' || caller?.role === 'super_admin' || caller?.role === 'support';

    const payoutsList = isAdmin
      ? await store.listPayouts()
      : await store.listPayoutsForUser(authUserId);
    res.json(payoutsList);
  } catch (err: any) {
    res.status(500).json(formatApiError(err));
  }
});

router.post('/payouts', requireAuth, requireFinancialActiveStatus, rateLimit(10, 60_000), handlePayoutRequest);

// ==========================================
// USER PAYMENTS SNAPSHOT & ESCROW APIS
// ==========================================

router.get('/payments/user/:userId', requireAuth, async (req: Request, res: Response) => {
  try {
    const authUserId = (req as any).authenticatedUserId;
    const targetUserId = req.params.userId;
    const caller = await store.getUser(authUserId);
    const isAdmin = caller?.role === 'admin' || caller?.role === 'super_admin';
    if (!isAdmin && authUserId !== targetUserId) {
      return res.status(403).json({ error: 'Forbidden: Access to another user financial snapshot is not allowed.' });
    }

    const userId = targetUserId;
    const u = await store.getUser(userId);
    
    if (u) {
      await financialTransactionService.ensureWallet(u.id);
    }

    const wallet = await financialRepository.getWallet(userId);
    const availableBalance = wallet?.availableBalance ?? Number(u?.walletBalance || 0);
    
    const activeEscrowStatuses = ['funded_in_escrow', 'in_progress', 'delivered', 'revision', 'disputed', 'draft_review', 'work_in_progress'];
    const userOrders = await store.listOrdersForUser(userId);
    const allUsers = await store.listUsers();
    const userMap = new Map(allUsers.map(usr => [usr.id, usr]));

    const buyerEscrowOrders = userOrders.filter(o => o.buyerId === userId && activeEscrowStatuses.includes(o.status));
    const buyerEscrowAmount = await financialRepository.getBuyerHeldEscrowTotal(userId);

    const freelancerEscrowOrders = userOrders.filter(o => o.sellerId === userId && activeEscrowStatuses.includes(o.status));
    const freelancerEscrowAmount = await financialRepository.getFreelancerHeldEscrowTotal(userId);

    const enrichOrderFinancialRow = async (o: Order) => {
      const esc = await financialRepository.getEscrow(o.id);
      const offers = await store.listOffersForOrder(o.id);
      const inEscrow = esc
        ? Number(esc.remaining || 0)
        : (activeEscrowStatuses.includes(o.status) ? Number(o.amount || 0) : 0);
      const escrowFunded = esc ? Number(esc.amount || 0) : ((o.status as string) !== 'payment_pending' && (o.status as string) !== 'pending' ? Number(o.amount || 0) : 0);
      const depositRequests = offers.filter(off => (off.kind === 'deposit' || off.kind === 'proposal') && off.status === 'pending');
      const pendingInvoices = offers.filter(off => off.kind === 'invoice' && off.status === 'pending');
      const paidInvoiceOffers = offers.filter(off => off.kind === 'invoice' && (off.status === 'paid' || off.status === 'accepted'));
      const paidOffersSum = paidInvoiceOffers.reduce((s, off) => s + Number(off.amount || 0), 0);
      const releasedAmount = esc ? Number(esc.releasedGross || 0) : (o.status === 'completed' ? Number(o.amount || 0) : 0);
      const paidInvoiceAmount = Math.max(paidOffersSum, releasedAmount, o.status === 'completed' ? Number(o.amount || 0) : 0);
      const hasPaidInvoice = o.status === 'completed' || paidInvoiceOffers.length > 0 || releasedAmount > 0;
      const buyerUser = userMap.get(o.buyerId);
      const sellerUser = userMap.get(o.sellerId);

      return {
        ...enrichOrderWithServiceInfo(o),
        buyerName: buyerUser?.name || (o as any).buyerName || o.buyerUsername || 'Buyer',
        sellerName: sellerUser?.name || (o as any).sellerName || o.sellerUsername || 'Freelancer',
        inEscrow,
        escrowFunded,
        depositRequests,
        pendingInvoices,
        paidInvoiceAmount,
        hasPaidInvoice
      };
    };

    const buyerAllOrders = userOrders.filter(o => o.buyerId === userId && o.status !== 'cancelled');
    const freelancerAllOrders = userOrders.filter(o => o.sellerId === userId && o.status !== 'cancelled');

    const [buyerOrdersSummary, freelancerOrdersSummary] = await Promise.all([
      Promise.all(buyerAllOrders.map(enrichOrderFinancialRow)),
      Promise.all(freelancerAllOrders.map(enrichOrderFinancialRow))
    ]);

    const currentYearMonth = new Date().toISOString().slice(0, 7);
    const twoMonthsAgoDate = new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10);

    const userPaidOrders = userOrders.filter(o => o.buyerId === userId && ['funded_in_escrow', 'in_progress', 'delivered', 'revision', 'disputed', 'completed'].includes(o.status));
    const paidToDate = userPaidOrders.reduce((sum, o) => sum + (o.amount || 0), 0);
    const paidThisMonth = userPaidOrders.filter(o => (o.createdAt || '').startsWith(currentYearMonth)).reduce((sum, o) => sum + (o.amount || 0), 0);

    const resolveOrderNet = (o: Order) =>
      Number((o.feeBreakdown as any)?.freelancerNet ?? calculateOrderFees(o.amount).freelancerNet);
    const userEarnedOrders = userOrders.filter(o => o.sellerId === userId && o.status === 'completed');
    const earnedToDate = Number(u?.earned || 0) || userEarnedOrders.reduce((sum, o) => sum + resolveOrderNet(o), 0);
    const earnedThisMonth = userEarnedOrders.filter(o => (o.createdAt || '').startsWith(currentYearMonth)).reduce((sum, o) => sum + resolveOrderNet(o), 0);
    const earnedPastTwoMonths = userEarnedOrders
      .filter(o => (o.completedAt || o.createdAt || '') >= twoMonthsAgoDate)
      .reduce((sum, o) => sum + resolveOrderNet(o), 0);

    let userMethods: PaymentMethodRecord[] = [];
    try {
      userMethods = await store.listPaymentMethodsForUser(userId);
    } catch {}

    const commSettings = siteSettings.getSettings()?.commission;
    const clearingPeriodDays = Number(commSettings?.escrowProtectionDays) || 14;

    res.json({
      userId,
      availableBalance,
      buyerEscrowAmount,
      freelancerEscrowAmount,
      buyerEscrowOrders,
      freelancerEscrowOrders,
      buyerOrdersSummary,
      freelancerOrdersSummary,
      paidToDate,
      paidThisMonth,
      earnedToDate,
      earnedThisMonth,
      earnedPastTwoMonths,
      clearingPeriodDays,
      paymentMethods: userMethods,
      walletStatus: wallet?.status || 'active'
    });
  } catch (err: any) {
    res.status(500).json(formatApiError(err));
  }
});

router.post('/payments/escrow/deposit', requireAuth, requireFinancialActiveStatus, rateLimit(15, 60_000), async (req: Request, res: Response) => {
  const { orderId, amount: rawAmount, title: rawTitle, fundSource = 'wallet', idempotencyKey: rawKey } = req.body || {};
  if (!orderId || typeof orderId !== 'string') {
    return res.status(400).json({ error: 'Order ID is required to fund escrow.' });
  }
  if (!tryAcquireOrderLock(orderId, res)) return;
  try {
    const authUserId = (req as any).authenticatedUserId;
    const caller = await store.getUser(authUserId);
    if (!caller) return res.status(401).json({ error: 'Unauthorized' });

    const order = await store.getOrder(orderId);
    if (!order) return res.status(404).json({ error: 'Order not found.' });

    const isAdmin = caller.role === 'admin' || caller.role === 'super_admin';
    if (!isAdmin && order.buyerId !== authUserId) {
      return res.status(403).json({ error: 'Forbidden: Only the buyer of this order can deposit into its escrow.' });
    }

    const amount = Math.round(Number(rawAmount) * 100) / 100;
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: 'Please enter a valid escrow deposit amount greater than $0.00.' });
    }
    if (amount > 100000) {
      return res.status(400).json({ error: 'Amount exceeds maximum limit ($100,000.00).' });
    }

    await ensureWallet(order.buyerId);
    await ensureWallet(order.sellerId);

    const idempotencyKey = String(rawKey || `escrow-dep-${order.id}-${Date.now()}`);
    const walletBal = await financialRepository.getWalletBalance(order.buyerId);

    // If buyer selected instant card/gateway deposit or needs wallet top-up when simulated deposits are enabled
    if (fundSource === 'instant_deposit' || (walletBal < amount && req.body?.autoDeposit === true)) {
      if (!areSimulatedDepositsAllowed()) {
        return res.status(400).json({ error: 'Insufficient wallet balance. Please deposit funds first.' });
      }
      const shortfall = fundSource === 'instant_deposit' ? amount : Math.max(0, Number((amount - walletBal).toFixed(2)));
      if (shortfall > 0) {
        if (shortfall > 5000) {
          return res.status(400).json({ error: 'Simulated instant deposits are limited to $5,000.00 per transaction.' });
        }
        await financialTransactionService.creditDeposit({
          userId: order.buyerId,
          amount: shortfall,
          actor: `${caller.name} (Escrow Instant Deposit)`,
          idempotencyKey: `SIM-ESC-${order.buyerId}-${idempotencyKey}`
        });
      }
    }

    const existingEscrow = await financialRepository.getEscrow(order.id);
    const today = new Date().toISOString().split('T')[0];
    const protectionDays = siteSettings.getSettings()?.commission?.escrowProtectionDays || 14;
    const protectionEnd = new Date(Date.now() + protectionDays * 86400000).toISOString().split('T')[0];
    const depositTitle = (typeof rawTitle === 'string' && rawTitle.trim()) ? rawTitle.trim() : `Escrow deposit for ${order.title}`;

    let targetOrder = order;

    if (!existingEscrow && ['payment_pending', 'pending', 'in_progress'].includes(order.status)) {
      await fundOrderEscrowWithEvent({
        orderId: order.id,
        orderTitle: order.title,
        amount,
        buyerId: order.buyerId,
        sellerId: order.sellerId,
        actor: `user:${order.buyerId}`,
        idempotencyKey
      });
      order.amount = amount;
      order.status = 'funded_in_escrow';
      order.escrowProtectionStartDate = today;
      order.escrowProtectionEndDate = protectionEnd;
      await store.saveOrder(order);
      await emitSystemEvent(order.id, 'escrow_funded', `🔒 $${amount.toFixed(2)} USD funded into escrow by ${caller.name}.`, { amount });
    } else if ((order.status as string) === 'completed' || (order.status as string) === 'cancelled' || (existingEscrow && existingEscrow.remaining === 0 && (order.status as string) === 'completed')) {
      const newOrderId = 'ord_' + randomUUID().slice(0, 12);
      const isGigOrder = order.orderType === 'gig' || (Boolean(order.gigId) && !order.projectId);
      const orderType: 'gig' | 'project' = isGigOrder ? 'gig' : 'project';
      const newOrder: Order = {
        id: newOrderId,
        workspaceId: order.workspaceId,
        orderType,
        ...(orderType === 'gig' ? { gigOrderId: newOrderId } : { projectOrderId: newOrderId }),
        title: depositTitle,
        buyerId: order.buyerId,
        sellerId: order.sellerId,
        amount,
        status: 'payment_pending',
        createdAt: today,
        dueDate: new Date(Date.now() + 7 * 86400000).toISOString(),
        escrowProtectionStartDate: today,
        escrowProtectionEndDate: protectionEnd,
        feeBreakdown: calculateOrderFees(amount),
        projectId: order.projectId,
        gigId: order.gigId
      };
      const enrichedNew = enrichOrderWithServiceInfo(newOrder);
      await recordOrder(enrichedNew);
      await store.saveOrder(enrichedNew);

      await fundOrderEscrowWithEvent({
        orderId: newOrder.id,
        orderTitle: newOrder.title,
        amount,
        buyerId: newOrder.buyerId,
        sellerId: newOrder.sellerId,
        actor: `user:${newOrder.buyerId}`,
        idempotencyKey
      });
      enrichedNew.status = 'funded_in_escrow';
      await store.saveOrder(enrichedNew);
      await emitSystemEvent(newOrder.id, 'order_created', `Follow-on Escrow Deposit placed: ${newOrder.title} ($${amount.toFixed(2)} USD held in escrow).`);
      targetOrder = enrichedNew;
    } else {
      await topUpOrderEscrowWithEvent({
        orderId: order.id,
        orderTitle: depositTitle,
        amount,
        buyerId: order.buyerId,
        sellerId: order.sellerId,
        actor: `user:${order.buyerId}`,
        idempotencyKey
      });
      order.amount = Math.round((Number(order.amount || 0) + amount) * 100) / 100;
      await store.saveOrder(order);
    }

    // Mark any matching pending deposit offer as accepted
    const orderOffers = await store.listOffersForOrder(order.id);
    const pendingDep = orderOffers.find(o => o.kind === 'deposit' && o.status === 'pending');
    if (pendingDep) {
      await postgresStore.getPool().query(
        "UPDATE workstream_offers SET status = 'accepted', resolved_at = $1, resolved_by = $2 WHERE id = $3",
        [new Date().toISOString(), caller.id, pendingDep.id]
      );
    }

    await syncUserBalances([order.buyerId, order.sellerId]);
    res.json({ success: true, order: enrichOrderWithServiceInfo(targetOrder), amount });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to deposit into escrow.' });
  } finally {
    releaseOrderLock(orderId);
  }
});

router.post('/payments/withdraw', requireAuth, requireFinancialActiveStatus, rateLimit(10, 60_000), handlePayoutRequest);

router.post('/payments/deposit', requireAuth, requireFinancialActiveStatus, rateLimit(10, 60_000), async (req: Request, res: Response) => {
  try {
    if (!areSimulatedDepositsAllowed()) {
      return res.status(501).json({ error: 'Deposits require a connected payment gateway in production.' });
    }

    const authUserId = (req as any).authenticatedUserId;
    if (!authUserId) {
      return res.status(401).json({ error: 'Unauthorized: Authentication required' });
    }

    const pool = postgresStore.getPool();
    const callerRes = await pool.query('SELECT * FROM users WHERE id = $1', [authUserId]);
    const caller = callerRes.rows[0];
    if (!caller) {
      return res.status(401).json({ error: 'Authenticated user not found' });
    }

    const requestedUserId = req.body?.userId;
    const isAdmin = caller.role === 'admin' || caller.role === 'super_admin';
    if (requestedUserId && requestedUserId !== authUserId) {
      if (!isAdmin) {
        return res.status(403).json({ error: 'Forbidden: You cannot deposit funds into another user wallet.' });
      }
    }
    const targetUserId = (isAdmin && requestedUserId) ? requestedUserId : authUserId;
    const amount = Number(req.body?.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: 'Please enter a valid deposit amount greater than $0.00' });
    }
    if (amount > 5000) {
      return res.status(400).json({ error: 'Simulated deposits are limited to $5,000.' });
    }

    await ensureWallet(targetUserId);
    const key = String(req.body?.idempotencyKey || req.body?.providerReference || randomUUID());
    await financialTransactionService.creditDeposit({
      userId: targetUserId,
      amount,
      actor: `${caller.name} (Simulated)`,
      idempotencyKey: `SIM-${targetUserId}-${key}`
    });
    await syncUserBalances();
    const newBalance = await financialRepository.getWalletBalance(targetUserId);
    const transaction = { id: `SIM-TXN-${key}` };

    await registerAuditLog({
      id: 'log_' + Date.now() + '_' + randomUUID().slice(0, 8),
      actor: caller.name,
      role: caller.role,
      action: 'FUNDS_DEPOSITED',
      target: `User ${caller.name}`,
      details: `Deposited $${amount.toFixed(2)} (simulated). New Balance: $${newBalance.toFixed(2)}`,
      timestamp: new Date().toLocaleString()
    });

    res.json({ success: true, newBalance, transaction });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/payments/gateway/checkout', requireAuth, rateLimit(10, 60_000), async (req: Request, res: Response) => {
  try {
    const { amount, currency = 'USD', gateway = 'stripe', orderId, purpose = 'deposit' } = req.body || {};
    const authUserId = (req as any).authenticatedUserId;
    const pool = postgresStore.getPool();
    const callerRes = await pool.query('SELECT id, name FROM users WHERE id = $1', [authUserId]);
    const caller = callerRes.rows[0];
    if (!caller) return res.status(401).json({ error: 'Unauthorized' });

    if (currency !== 'USD') {
      return res.status(400).json({ error: 'Only USD currency is supported.' });
    }

    const normalizedGateway = String(gateway || 'stripe').trim().toLowerCase();
    if (!['stripe', 'paypal', 'razorpay'].includes(normalizedGateway)) {
      return res.status(400).json({ error: `Unsupported payment gateway "${gateway}".` });
    }

    const requestedPurpose = String(purpose || 'deposit').trim().toLowerCase();
    if (!['deposit', 'order_payment', 'order', 'order_escrow'].includes(requestedPurpose)) {
      return res.status(400).json({ error: `Invalid checkout purpose "${purpose}".` });
    }

    const normalizedOrderId = orderId !== undefined && orderId !== null && String(orderId).trim() !== ''
      ? String(orderId).trim()
      : null;

    if ((requestedPurpose === 'order_payment' || requestedPurpose === 'order' || requestedPurpose === 'order_escrow') && !normalizedOrderId) {
      return res.status(400).json({ error: 'orderId is required when checkout purpose is order payment.' });
    }

    let authoritativeAmount: number;
    let resolvedPurpose = requestedPurpose;

    if (normalizedOrderId) {
      resolvedPurpose = 'order_payment';
      const ordRes = await pool.query('SELECT * FROM orders WHERE id = $1', [normalizedOrderId]);
      if (ordRes.rows.length === 0) {
        return res.status(404).json({ error: 'Order not found.' });
      }
      const orderRow = ordRes.rows[0];
      if (orderRow.buyer_id !== authUserId) {
        return res.status(403).json({ error: 'Forbidden: You can only create a payment checkout session for your own order.' });
      }
      if (!['payment_pending', 'pending'].includes(orderRow.status)) {
        return res.status(400).json({ error: `Order is in status "${orderRow.status}" and is not awaiting payment.` });
      }
      const existingEscRes = await pool.query('SELECT status FROM escrows WHERE order_id = $1', [normalizedOrderId]);
      if (existingEscRes.rows.length > 0) {
        return res.status(400).json({ error: 'Order escrow is already funded.' });
      }

      const parsedBreakdown = typeof orderRow.fee_breakdown === 'string'
        ? JSON.parse(orderRow.fee_breakdown)
        : orderRow.fee_breakdown;
      const liveQuote = await quoteOrderWithLiveSettings(Number(orderRow.amount));
      authoritativeAmount = Number(
        (parsedBreakdown?.clientTotal ?? liveQuote.clientTotal).toFixed(2)
      );

      if (amount !== undefined && amount !== null && amount !== '') {
        const callerAmount = Number(amount);
        if (!Number.isFinite(callerAmount) || Math.round(callerAmount * 100) !== Math.round(authoritativeAmount * 100)) {
          return res.status(400).json({
            error: `Checkout amount ($${Number.isFinite(callerAmount) ? callerAmount.toFixed(2) : 'invalid'}) does not match the authoritative order total ($${authoritativeAmount.toFixed(2)}).`
          });
        }
      }
    } else {
      const callerAmount = Number(amount);
      if (!Number.isFinite(callerAmount) || callerAmount < 1.00 || Math.abs(Math.round(callerAmount * 100) - callerAmount * 100) > 1e-6) {
        return res.status(400).json({ error: 'Valid amount of at least $1.00 USD (up to 2 decimal places) is required.' });
      }
      authoritativeAmount = Number(callerAmount.toFixed(2));
    }

    await ensureWallet(authUserId);
    const checkoutId = 'chk_' + randomUUID();

    const providerSession = await paymentGatewayManager.createCheckoutSession({
      gateway: normalizedGateway as any,
      amount: authoritativeAmount,
      currency: 'USD',
      userId: authUserId,
      orderId: normalizedOrderId || undefined,
      purpose: resolvedPurpose,
      checkoutId
    });

    await pool.query(
      `INSERT INTO payment_checkout_sessions (id, user_id, order_id, gateway, expected_amount, currency, purpose, status, provider_tx_id, created_at)
       VALUES ($1, $2, $3, $4, $5, 'USD', $6, 'pending', $7, NOW())`,
      [checkoutId, authUserId, normalizedOrderId, normalizedGateway, authoritativeAmount, resolvedPurpose, providerSession.providerSessionId]
    );

    res.json({
      success: true,
      checkoutId,
      gateway: normalizedGateway,
      orderId: normalizedOrderId || undefined,
      purpose: resolvedPurpose,
      amount: authoritativeAmount,
      currency: 'USD',
      redirectUrl: providerSession.checkoutUrl || `/checkout/success?session_id=${checkoutId}&amount=${authoritativeAmount}`
    });
  } catch (err: any) {
    res.status(500).json(formatApiError(err));
  }
});

const handlePaymentWebhook = async (req: Request, res: Response) => {
  const rawBody = req.body;
  const gateway = String(req.headers['x-gateway-provider'] || req.query.gateway || 'stripe').trim().toLowerCase();
  const isVerified = await paymentGatewayManager.verifyWebhookSignature({
    gateway,
    headers: req.headers,
    rawBody
  });

  if (!isVerified) {
    return res.status(403).json({ error: 'Unauthorized: Invalid or missing provider webhook signature' });
  }

  let payload: any;
  try {
    payload = JSON.parse(req.body.toString());
  } catch {
    return res.status(400).json({ error: 'Malformed JSON payload' });
  }

  const { event, userId, amount, reference, transactionId, eventId, currency, checkoutId, sessionId } = payload || {};
  const txId = transactionId || eventId;
  if (!txId || typeof txId !== 'string' || !txId.trim()) {
    return res.status(400).json({ error: 'Missing required transactionId or eventId' });
  }
  if (!currency || currency !== 'USD') {
    return res.status(400).json({ error: 'Invalid or missing currency: provider webhook currency must be explicitly USD.' });
  }

  const validEvents = ['payment.succeeded', 'checkout.session.completed', 'payment_intent.succeeded', 'payment.captured', 'order.approved'];
  if (!validEvents.includes(event)) {
    return res.json({ received: true });
  }

  const lookupSessionKey = (checkoutId || sessionId) ? String(checkoutId || sessionId).trim() : null;
  const lookupOrderKey = payload?.orderId ? String(payload.orderId).trim() : null;

  try {
    // Pre-fetch and verify candidate checkout session strictly OUTSIDE the database transaction
    // so external provider HTTP verification never holds database locks.
    const pool = postgresStore.getPool();
    const existingCompletedTx = await pool.query(
      "SELECT id FROM payment_checkout_sessions WHERE provider_tx_id = $1 AND status = 'completed' LIMIT 1",
      [txId]
    );
    if (existingCompletedTx.rows.length > 0) {
      return res.json({ received: true, replayed: true });
    }

    let preSess: any = null;
    if (lookupSessionKey) {
      const preRes = await pool.query(
        'SELECT * FROM payment_checkout_sessions WHERE id = $1 OR provider_tx_id = $1 LIMIT 1',
        [lookupSessionKey]
      );
      if (preRes.rows.length > 0) preSess = preRes.rows[0];
    }
    if (!preSess) {
      const preByTx = await pool.query(
        'SELECT * FROM payment_checkout_sessions WHERE provider_tx_id = $1 LIMIT 1',
        [txId]
      );
      if (preByTx.rows.length > 0) preSess = preByTx.rows[0];
    }
    if (!preSess && !lookupSessionKey && lookupOrderKey) {
      const preByOrd = await pool.query(
        "SELECT * FROM payment_checkout_sessions WHERE order_id = $1 AND status = 'pending' ORDER BY created_at DESC LIMIT 1",
        [lookupOrderKey]
      );
      if (preByOrd.rows.length > 0) preSess = preByOrd.rows[0];
    }

    if (!preSess) {
      return res.status(400).json({ error: 'Cannot process payment webhook: no matching stored checkout session found.' });
    }

    const preExpectedAmount = Number(preSess.expected_amount);
    if (!preSess.user_id || !Number.isFinite(preExpectedAmount) || preExpectedAmount <= 0) {
      return res.status(400).json({ error: 'Stored checkout session has invalid user or expected amount.' });
    }
    if (!preSess.currency || preSess.currency !== 'USD') {
      return res.status(400).json({ error: 'Checkout session currency mismatch: must be USD.' });
    }
    if (preSess.gateway && String(preSess.gateway).toLowerCase() !== gateway) {
      return res.status(400).json({ error: 'Checkout session gateway mismatch.' });
    }

    let preVerifiedSessionId: string | null = null;
    if (preSess.status === 'pending') {
      const preVerify = await paymentGatewayManager.verifyPaymentEvent({
        gateway: preSess.gateway || gateway,
        sessionId: preSess.provider_tx_id || preSess.id,
        transactionId: txId,
        expectedAmount: preExpectedAmount,
        expectedCurrency: 'USD'
      });
      if (!preVerify.verified) {
        return res.status(400).json({ error: `Provider payment verification failed: ${preVerify.error}` });
      }
      preVerifiedSessionId = String(preSess.id);
    }

    const result = await postgresStore.executeInTransaction(async (client) => {
      // 1. Durably check if provider transaction ID was already processed in completed checkout sessions
      const existingTx = await client.query(
        "SELECT * FROM payment_checkout_sessions WHERE provider_tx_id = $1 AND status = 'completed'",
        [txId]
      );
      if (existingTx.rows.length > 0) {
        return { received: true, replayed: true };
      }

      // 2. Lock the exact verified checkout session row
      const lockedSessRes = await client.query(
        'SELECT * FROM payment_checkout_sessions WHERE id = $1 FOR UPDATE',
        [preSess.id]
      );
      const sess: any = lockedSessRes.rows[0] || null;

      if (!sess) {
        throw { status: 400, message: 'Cannot process payment webhook: no matching stored checkout session found.' };
      }

      const authoritativeUserId = String(sess.user_id);
      const authoritativeAmount = Number(sess.expected_amount);
      const authoritativeOrderId = sess.order_id ? String(sess.order_id) : null;
      const authoritativePurpose = String(sess.purpose || (authoritativeOrderId ? 'order_payment' : 'deposit'));

      if (!authoritativeUserId || !Number.isFinite(authoritativeAmount) || authoritativeAmount <= 0) {
        throw { status: 400, message: 'Stored checkout session has invalid user or expected amount.' };
      }
      if (!sess.currency || sess.currency !== 'USD') {
        throw { status: 400, message: 'Checkout session currency mismatch: must be USD.' };
      }
      if (sess.gateway && String(sess.gateway).toLowerCase() !== gateway) {
        throw { status: 400, message: 'Checkout session gateway mismatch.' };
      }

      // Cross-validate any caller/payload-supplied fields against the stored checkout session
      if (userId !== undefined && userId !== null && String(userId) !== '' && String(userId) !== authoritativeUserId) {
        throw { status: 400, message: 'Checkout session user mismatch.' };
      }
      if (amount !== undefined && amount !== null && amount !== '') {
        const payloadAmount = Number(amount);
        if (!Number.isFinite(payloadAmount) || Math.round(payloadAmount * 100) !== Math.round(authoritativeAmount * 100)) {
          throw { status: 400, message: 'Checkout session amount mismatch.' };
        }
      }
      if (lookupOrderKey && authoritativeOrderId && lookupOrderKey !== authoritativeOrderId) {
        throw { status: 400, message: 'Checkout session order mismatch.' };
      }
      if (lookupOrderKey && !authoritativeOrderId) {
        throw { status: 400, message: 'Checkout session is not linked to an order.' };
      }
      if (payload?.purpose && ['order_payment', 'order', 'order_escrow'].includes(String(payload.purpose)) && !authoritativeOrderId) {
        throw { status: 400, message: 'Checkout session is not an order payment session.' };
      }

      // 3. PostgreSQL-level durable idempotency lock via financial_idempotency table
      const providerTxKey = `WH-PROVIDER-TX-${gateway}-${txId}`;
      const payloadFingerprint = {
        gateway,
        txId,
        userId: authoritativeUserId,
        amount: authoritativeAmount,
        checkoutId: sess.id,
        orderId: authoritativeOrderId
      };
      const idempCheck = await checkOrRecordIdempotency(
        client,
        providerTxKey,
        'paymentWebhook',
        payloadFingerprint
      );
      if (idempCheck.replayed) {
        return { received: true, replayed: true };
      }

      if (sess.status === 'completed') {
        await recordIdempotencyResult(client, providerTxKey, 'paymentWebhook', { received: true, replayed: true }, payloadFingerprint);
        return { received: true, replayed: true };
      }
      if (sess.status !== 'pending') {
        throw { status: 400, message: `Checkout session already in status ${sess.status}` };
      }

      // 4. Confirm session was verified outside the transaction and its amount/currency did not mutate
      if (preVerifiedSessionId !== String(sess.id) || Math.round(authoritativeAmount * 100) !== Math.round(preExpectedAmount * 100)) {
        throw { status: 409, message: 'Checkout session state changed concurrently during verification.' };
      }

      // 5. If linked to an Order, validate Order ownership, status, and authoritative total BEFORE crediting/settling
      let lockedOrder: any = null;
      const isOrderPayment = Boolean(authoritativeOrderId) || ['order_payment', 'order', 'order_escrow'].includes(authoritativePurpose);
      if (isOrderPayment) {
        if (!authoritativeOrderId) {
          throw { status: 400, message: 'Order payment checkout session is missing order_id.' };
        }
        const ordRes = await client.query('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [authoritativeOrderId]);
        if (ordRes.rows.length === 0) {
          throw { status: 404, message: `Order ${authoritativeOrderId} not found.` };
        }
        lockedOrder = ordRes.rows[0];
        if (lockedOrder.buyer_id !== authoritativeUserId) {
          throw { status: 403, message: 'Order buyer mismatch with checkout session owner.' };
        }
        if (!['payment_pending', 'pending'].includes(lockedOrder.status)) {
          throw { status: 400, message: `Order ${lockedOrder.id} is in status "${lockedOrder.status}" and cannot be settled.` };
        }
        const parsedBreakdown = typeof lockedOrder.fee_breakdown === 'string'
          ? JSON.parse(lockedOrder.fee_breakdown)
          : lockedOrder.fee_breakdown;
        const liveQuote = await quoteOrderWithLiveSettings(Number(lockedOrder.amount));
        const expectedOrderTotal = Number(
          (parsedBreakdown?.clientTotal ?? liveQuote.clientTotal).toFixed(2)
        );
        if (Math.round(authoritativeAmount * 100) !== Math.round(expectedOrderTotal * 100)) {
          throw {
            status: 400,
            message: `Checkout session amount ($${authoritativeAmount.toFixed(2)}) does not match authoritative order total ($${expectedOrderTotal.toFixed(2)}).`
          };
        }
      }

      await financialTransactionService.ensureWallet({ userId: authoritativeUserId, role: 'buyer' }, client);

      const depositIdempotencyKey = `${providerTxKey}:creditDeposit`;
      await financialTransactionService.creditDeposit({
        userId: authoritativeUserId,
        amount: authoritativeAmount,
        reference: reference || txId || 'WH-DEPOSIT',
        idempotencyKey: depositIdempotencyKey,
        actor: 'Gateway Webhook',
        source: 'webhook'
      }, client);

      // 6. Atomically fund Order escrow if this session is an order payment (fail closed on any escrow error)
      if (isOrderPayment && lockedOrder) {
        const fundIdempKey = `${providerTxKey}:fundEscrow`;
        await financialTransactionService.fundEscrow({
          orderId: lockedOrder.id,
          orderTitle: lockedOrder.title,
          amount: Number(lockedOrder.amount),
          buyerId: lockedOrder.buyer_id,
          sellerId: lockedOrder.seller_id,
          actor: `user:${authoritativeUserId}`,
          idempotencyKey: fundIdempKey
        }, client);
        await client.query("UPDATE orders SET status = 'funded_in_escrow' WHERE id = $1", [lockedOrder.id]);
      }

      await client.query(
        'UPDATE payment_checkout_sessions SET status = $1, provider_tx_id = $2, completed_at = NOW() WHERE id = $3',
        ['completed', txId, sess.id]
      );

      const resObj = { received: true };
      await recordIdempotencyResult(client, providerTxKey, 'paymentWebhook', resObj, payloadFingerprint);

      return resObj;
    });

    await syncUserBalances();
    return res.json(result);
  } catch (e: any) {
    const statusCode = typeof e?.status === 'number' ? e.status : 400;
    return res.status(statusCode).json({ error: e?.message || e?.error || 'Webhook transaction failed' });
  }
};

router.post('/payments/webhook', express.raw({ type: 'application/json' }), handlePaymentWebhook);
router.post('/webhooks/payment', express.raw({ type: 'application/json' }), handlePaymentWebhook);

router.post('/payments/escrow/release', requireAuth, requireFinancialActiveStatus, async (req: Request, res: Response) => {
  const { orderId } = req.body;
  if (!orderId) return res.status(400).json({ error: 'Order ID is required' });
  if (!tryAcquireOrderLock(orderId, res)) return;
  try {
    const userId = (req as any).authenticatedUserId;
    const pool = postgresStore.getPool();
    const callerRes = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
    const caller = callerRes.rows[0];
    const initialOrder = await store.getOrder(orderId);
    if (!initialOrder) return res.status(404).json({ error: 'Order not found' });

    const isAdmin = caller?.role === 'admin' || caller?.role === 'super_admin';
    const isBuyer = userId === initialOrder.buyerId;
    if (!isAdmin && !isBuyer) {
      return res.status(403).json({ error: 'Forbidden: Only the order buyer or administrator can release escrow.' });
    }

    const validationError = validateOrderReleasePreconditions(initialOrder, isAdmin);
    if (validationError) {
      return res.status(validationError.status).json({ error: validationError.error });
    }

    const seller = await store.getUser(initialOrder.sellerId);
    const buyer = await store.getUser(initialOrder.buyerId);

    if (seller) await ensureWallet(seller.id);
    if (buyer) await ensureWallet(buyer.id);

    const actorName = isAdmin ? adminActor(req) : (buyer?.name || 'Authorized Buyer');
    const requestKey = req.body?.requestKey || req.body?.idempotencyKey;

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

      const txValidationError = validateOrderReleasePreconditions(order, isAdmin);
      if (txValidationError) {
        const err: any = new Error(txValidationError.error);
        err.statusCode = txValidationError.status;
        throw err;
      }

      const activeDispRes = await client.query(
        "SELECT 1 FROM disputes WHERE order_id = $1 AND status IN ('open', 'under_investigation', 'under_review') LIMIT 1",
        [order.id]
      );
      if (!isAdmin && activeDispRes.rows.length > 0) {
        const err: any = new Error('Cannot release escrow: Order has an active unresolved dispute.');
        err.statusCode = 400;
        throw err;
      }

      let revisionsResolved = false;
      if (Array.isArray(order.revisions)) {
        for (const rev of order.revisions) {
          if (rev.status === 'requested') {
            rev.status = 'resolved';
            revisionsResolved = true;
          }
        }
      }
      if (revisionsResolved) {
        const sysMsg: Message = {
          id: 'msg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
          orderId: order.id,
          senderId: 'system',
          senderName: 'WorkSphere Review Desk',
          text: `📝 Revision resolved by buyer.`,
          timestamp: new Date().toISOString(),
          type: 'system',
          metadata: { action: 'revision_resolved' }
        };
        await recordMessage(sysMsg, client);
      }

      const escRes = await client.query('SELECT * FROM escrows WHERE order_id = $1 FOR UPDATE', [order.id]);
      const esc = escRes.rows[0];
      if (!esc || Number(esc.remaining) <= 0 || esc.status === 'released' || esc.status === 'refunded') {
        const err: any = new Error('No refundable or releasable escrow funds remain for this order.');
        err.statusCode = 400;
        throw err;
      }

      const pendingOffersRes = await client.query(
        "SELECT * FROM workstream_offers WHERE order_id = $1 AND kind = 'invoice' AND status = 'pending' FOR UPDATE",
        [order.id]
      );
      const pendingInvoices = pendingOffersRes.rows;

      const pendingHigherInvoice = pendingInvoices.find(o => Number(o.amount) > Number(esc.remaining));
      if (pendingHigherInvoice) {
        const err: any = new Error(
          `Cannot release escrow directly: A final invoice (${pendingHigherInvoice.number} for $${pendingHigherInvoice.amount}) is awaiting payment. Please pay or decline the invoice in the workstream.`
        );
        err.statusCode = 400;
        throw err;
      }

      const pendingMatchingInvoice = pendingInvoices[0];
      const result = await releaseOrderFunds(order, actorName, 'Buyer approved work', true, requestKey, isAdmin, client);

      if (pendingMatchingInvoice) {
        await client.query(
          "UPDATE workstream_offers SET status = 'paid', resolved_at = $1, resolved_by = $2 WHERE id = $3",
          [new Date().toISOString(), caller?.id || userId, pendingMatchingInvoice.id]
        );
      }

      await registerAuditLog({
        id: 'log_' + Date.now() + '_' + randomUUID().slice(0, 8),
        actor: actorName,
        role: caller?.role || 'buyer',
        action: 'ESCROW_RELEASED_BY_BUYER',
        target: `Order #${order.id}`,
        details: `Escrow release authorized of $${order.amount}. $${result.freelancerNet} credited to ${seller?.name || 'freelancer'}, $${result.platformFee} platform fee.`,
        timestamp: new Date().toLocaleString()
      }, client);

      return { order, result };
    });

    res.json({ success: true, order: enrichOrderWithServiceInfo(txResult.order), freelancerNet: txResult.result.freelancerNet, platformFee: txResult.result.platformFee });
  } catch (err: any) {
    res.status(err?.statusCode || 400).json({ error: err.message });
  } finally {
    releaseOrderLock(orderId);
  }
});

router.post('/payments/escrow/refund', requireAuth, async (req: Request, res: Response) => {
  const { orderId } = req.body;
  if (!orderId) return res.status(400).json({ error: 'Order ID is required' });
  if (!tryAcquireOrderLock(orderId, res)) return;
  try {
    const userId = (req as any).authenticatedUserId;
    const pool = postgresStore.getPool();
    const callerRes = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
    const caller = callerRes.rows[0];
    const { reason } = req.body;
    const initialOrder = await store.getOrder(orderId);
    if (!initialOrder) return res.status(404).json({ error: 'Order not found' });

    const buyer = await store.getUser(initialOrder.buyerId);
    if (buyer) await ensureWallet(buyer.id);

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

      const activeDispute = await store.getDisputeByOrderId(order.id, client);
      if ((activeDispute && (activeDispute.status === 'open' || activeDispute.status === 'under_investigation' || (activeDispute.status as string) === 'under_review')) || order.status === 'disputed') {
        const err: any = new Error('Cannot refund escrow: Order is under active dispute.');
        err.statusCode = 400;
        throw err;
      }
      if (order.status === 'completed') {
        const err: any = new Error('Cannot refund: Order has already been completed.');
        err.statusCode = 400;
        throw err;
      }
      if (order.status === 'cancelled') {
        const err: any = new Error('Cannot refund: Order has already been cancelled/refunded.');
        err.statusCode = 400;
        throw err;
      }

      const isAdmin = caller?.role === 'admin' || caller?.role === 'super_admin';
      const isSeller = userId === order.sellerId;
      const isBuyer = userId === order.buyerId;

      if (isBuyer && !isAdmin && ['delivered', 'draft_review'].includes(order.status)) {
        const err: any = new Error('Work has been delivered. Accept it, request a revision, or open a dispute.');
        err.statusCode = 403;
        throw err;
      }

      const isGigOrder = order.orderType === 'gig' || Boolean(order.gigOrderId);
      if (isGigOrder && isSeller && !isAdmin) {
        const err: any = new Error('Sellers must use the cancellation request.');
        err.statusCode = 403;
        throw err;
      }
      const overdueThresholdHours = LATE_ORDER_PROTECTION_HOURS;
      const deadlineMs = parseDeadlineInstant(order.dueDate, order.createdAt);
      const isOverdueByThreshold = deadlineMs !== null ? (Date.now() > deadlineMs + overdueThresholdHours * 60 * 60 * 1000) : false;

      if (!isAdmin && !isSeller) {
        if (isBuyer && isOverdueByThreshold) {
          if (isGigOrder && (!reason || !String(reason).trim())) {
            const err: any = new Error('Cancellation reason is required for very-late cancellation.');
            err.statusCode = 400;
            throw err;
          }
          order.cancellationType = 'very_late';
        } else if (isBuyer) {
          const err: any = new Error(`Forbidden: Buyer cannot cancel this order until ${overdueThresholdHours} hours have passed past the agreed due date.`);
          err.statusCode = 403;
          throw err;
        } else {
          const err: any = new Error('Forbidden: Not authorized to refund this escrow.');
          err.statusCode = 403;
          throw err;
        }
      }

      const actorName = isAdmin ? adminActor(req) : (caller?.name || (isSeller ? 'Seller' : 'Buyer'));
      const requestKey = req.body?.requestKey || req.body?.idempotencyKey || `REFUND-FULL-${order.id}-${order.amount}`;
      const result = await refundOrderFunds(order, undefined, actorName, reason || (isSeller ? 'Seller cancelled order' : 'Escrow cancellation'), requestKey, undefined, false, client);

      await registerAuditLog({
        id: 'log_' + Date.now() + '_' + randomUUID().slice(0, 8),
        actor: actorName,
        role: caller?.role || (isSeller ? 'seller' : 'buyer'),
        action: isSeller ? 'ESCROW_REFUNDED_BY_SELLER' : (isAdmin ? 'ESCROW_REFUNDED_BY_ADMIN' : 'ESCROW_REFUNDED_BY_BUYER'),
        target: `Order #${order.id}`,
        details: `Escrow refund executed of $${result.refunded} to buyer wallet. Reason: ${reason || 'Escrow cancellation'}`,
        timestamp: new Date().toLocaleString()
      }, client);

      return { order, result };
    });

    res.json({ success: true, order: txResult.order, refunded: txResult.result.refunded });
  } catch (err: any) {
    res.status(err?.statusCode || 400).json({ error: err.message });
  } finally {
    releaseOrderLock(orderId);
  }
});

router.get('/payments/transactions/:userId', requireAuth, async (req: Request, res: Response) => {
  try {
    const authUserId = (req as any).authenticatedUserId;
    const targetUserId = req.params.userId;
    const pool = postgresStore.getPool();
    const callerRes = await pool.query('SELECT role FROM users WHERE id = $1', [authUserId]);
    const caller = callerRes.rows[0];
    const isAdmin = caller?.role === 'admin' || caller?.role === 'super_admin';
    if (!isAdmin && authUserId !== targetUserId) {
      return res.status(403).json({ error: 'Forbidden: Access to another user transactions is not allowed.' });
    }
    const userId = targetUserId;
    const userTxns = await financialRepository.getTransactions(userId);
    
    if (userTxns.length === 0) {
      const userOrders = await store.listOrdersForUser(userId);
      const syn: any[] = [];
      for (const ord of userOrders) {
        if (ord.buyerId === userId) {
          syn.push({
            id: `txn_ord_${ord.id}`,
            type: 'escrow_fund',
            amount: ord.amount,
            currency: 'USD',
            timestamp: `${ord.createdAt} 12:00:00`,
            status: 'completed',
            userId: userId,
            userName: ord.buyerUsername || 'Buyer',
            userRole: 'buyer',
            description: `Escrow hold for Order: ${ord.title}`,
            relatedOrderId: ord.id
          });
        }
        if (ord.sellerId === userId && ord.status === 'completed') {
          const ordQuote = (ord.feeBreakdown as any)?.freelancerNet !== undefined
            ? (ord.feeBreakdown as any)
            : await quoteOrderWithLiveSettings(ord.amount).catch(() => calculateOrderFees(ord.amount));
          syn.push({
            id: `txn_rel_${ord.id}`,
            type: 'escrow_release',
            amount: ordQuote.freelancerNet,
            currency: 'USD',
            timestamp: `${ord.dueDate} 15:30:00`,
            status: 'completed',
            userId: userId,
            userName: ord.sellerUsername || 'Freelancer',
            userRole: 'freelancer',
            description: `Escrow earnings (${ordQuote.freelancerPercent}% net) from: ${ord.title}`,
            relatedOrderId: ord.id
          });
        }
      }
      return res.json(syn);
    }

    res.json(userTxns);
  } catch (err: any) {
    res.status(500).json(formatApiError(err));
  }
});

router.get('/payments/invoices/:userId', requireAuth, async (req: Request, res: Response) => {
  try {
    const authUserId = (req as any).authenticatedUserId;
    const targetUserId = req.params.userId;
    const pool = postgresStore.getPool();
    const callerRes = await pool.query('SELECT role FROM users WHERE id = $1', [authUserId]);
    const caller = callerRes.rows[0];
    const isAdmin = caller?.role === 'admin' || caller?.role === 'super_admin';
    if (!isAdmin && authUserId !== targetUserId) {
      return res.status(403).json({ error: 'Forbidden: Access to another user invoices is not allowed.' });
    }
    const userId = targetUserId;
    const userOrders = await store.listOrdersForUser(userId);

    const currentUser = await store.getUser(userId);
    const orderInvoices = await Promise.all(userOrders.map(async o => {
      const isBuyer = o.buyerId === userId;
      const otherUser = await store.getUser(isBuyer ? o.sellerId : o.buyerId);
      const quote = (o.feeBreakdown as any)?.clientTotal !== undefined
        ? (o.feeBreakdown as any)
        : await quoteOrderWithLiveSettings(o.amount).catch(() => calculateOrderFees(o.amount));
      return {
        id: `inv_ord_${o.id}`,
        invoiceNumber: `INV-${o.id.replace('ord_', '').toUpperCase()}`,
        userId: userId,
        type: isBuyer ? 'received' : 'sent',
        recipientName: isBuyer ? (currentUser?.name || 'Buyer') : (otherUser?.name || 'Client'),
        recipientEmail: isBuyer ? (currentUser?.email || 'buyer@example.com') : (otherUser?.email || 'client@example.com'),
        issuerName: isBuyer ? (otherUser?.name || 'Freelancer') : (currentUser?.name || 'Freelancer'),
        issuerEmail: isBuyer ? (otherUser?.email || 'seller@example.com') : (currentUser?.email || 'seller@example.com'),
        title: o.title,
        issueDate: o.createdAt,
        dueDate: o.dueDate,
        status: o.status === 'completed' ? 'paid' : o.status === 'cancelled' ? 'refunded' : 'in_escrow',
        items: [
          { description: o.title, quantity: 1, unitPrice: o.amount, amount: o.amount }
        ],
        subtotal: o.amount,
        serviceFee: o.feeBreakdown?.serviceFee ?? quote.serviceFee,
        smallOrderFee: o.feeBreakdown?.smallOrderFee ?? quote.smallOrderFee,
        platformFee: o.feeBreakdown?.platformCommission ?? quote.platformCommission,
        tax: 0,
        total: o.feeBreakdown?.clientTotal ?? quote.clientTotal,
        notes: `WorkPerHour 14-Day Escrow Protection Order #${o.id}. 100% Protected.`,
        relatedOrderId: o.id
      };
    }));

    let userCustom: any[] = [];
    try {
      const customInvoices = await store.listCustomInvoicesForUser(userId);
      userCustom = customInvoices.map((r: any) => ({
        id: r.id,
        invoiceNumber: r.invoiceNumber,
        userId: userId,
        buyerId: r.buyerId,
        sellerId: r.sellerId,
        type: r.buyerId === userId ? 'received' : 'sent',
        recipientName: r.recipientName || 'Client',
        recipientEmail: r.recipientEmail || 'client@example.com',
        title: r.description || `Invoice ${r.invoiceNumber}`,
        issueDate: r.createdAt ? r.createdAt.slice(0, 10) : new Date().toISOString().slice(0, 10),
        dueDate: r.dueDate || r.paidAt || new Date().toISOString().slice(0, 10),
        status: r.status,
        items: Array.isArray(r.items) && r.items.length > 0
          ? r.items
          : [{ description: r.description || 'Service', quantity: 1, unitPrice: Number(r.amount), amount: Number(r.amount) }],
        subtotal: Number(r.amount),
        platformFee: 0,
        tax: 0,
        total: Number(r.amount),
        notes: r.notes || 'Standard WorkPerHour Invoice',
        relatedOrderId: r.relatedOrderId || undefined
      }));
    } catch {}

    res.json([...orderInvoices, ...userCustom]);
  } catch (err: any) {
    res.status(500).json(formatApiError(err));
  }
});

router.post('/payments/invoices', requireAuth, async (req: Request, res: Response) => {
  try {
    const authenticatedUserId = (req as any).authenticatedUserId;
    const {
      recipientName,
      recipientEmail,
      title,
      dueDate,
      items,
      notes,
      orderId,
      relatedOrderId,
      buyerId: reqBuyerId,
      sellerId: reqSellerId,
      recipientId
    } = req.body || {};

    const pool = postgresStore.getPool();
    const callerRes = await pool.query('SELECT * FROM users WHERE id = $1', [authenticatedUserId]);
    const caller = callerRes.rows[0];
    if (!caller) {
      return res.status(401).json({ error: 'Unauthorized: Authenticated user not found.' });
    }
    const isAdmin = caller.role === 'admin' || caller.role === 'super_admin';

    const linkedOrderId = (orderId || relatedOrderId) ? String(orderId || relatedOrderId).trim() : null;
    let resolvedBuyerId: string | null = null;
    let resolvedSellerId: string | null = null;
    let resolvedOrderId: string | null = null;
    let resolvedRecipientName = recipientName ? String(recipientName).trim() : '';
    let resolvedRecipientEmail = recipientEmail ? String(recipientEmail).trim() : '';

    if (linkedOrderId) {
      const ordRes = await pool.query('SELECT * FROM orders WHERE id = $1', [linkedOrderId]);
      if (ordRes.rows.length === 0) {
        return res.status(404).json({ error: 'Related order not found.' });
      }
      const ord = ordRes.rows[0];
      if (!isAdmin && ord.seller_id !== authenticatedUserId && ord.buyer_id !== authenticatedUserId) {
        return res.status(403).json({ error: 'Forbidden: You are not an authorized participant on this order.' });
      }
      if (reqBuyerId && String(reqBuyerId).trim() !== ord.buyer_id) {
        return res.status(400).json({ error: 'Specified buyerId does not match the linked order buyer.' });
      }
      if (reqSellerId && String(reqSellerId).trim() !== ord.seller_id) {
        return res.status(400).json({ error: 'Specified sellerId does not match the linked order seller.' });
      }
      resolvedBuyerId = ord.buyer_id;
      resolvedSellerId = ord.seller_id;
      resolvedOrderId = ord.id;
    } else {
      // Resolve distinct buyer and seller from explicit party IDs, recipientEmail, or authorized order context
      const candidateBuyerId = (reqBuyerId || recipientId) ? String(reqBuyerId || recipientId).trim() : null;
      const candidateSellerId = reqSellerId ? String(reqSellerId).trim() : null;

      if (isAdmin && candidateBuyerId && candidateSellerId) {
        resolvedBuyerId = candidateBuyerId;
        resolvedSellerId = candidateSellerId;
      } else if (candidateBuyerId && candidateBuyerId !== authenticatedUserId) {
        resolvedSellerId = candidateSellerId || authenticatedUserId;
        resolvedBuyerId = candidateBuyerId;
      } else if (candidateSellerId && candidateSellerId !== authenticatedUserId) {
        resolvedBuyerId = candidateBuyerId || authenticatedUserId;
        resolvedSellerId = candidateSellerId;
      } else if (resolvedRecipientEmail) {
        const byEmailRes = await pool.query('SELECT id, name, email FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1', [resolvedRecipientEmail]);
        if (byEmailRes.rows.length > 0 && byEmailRes.rows[0].id !== authenticatedUserId) {
          resolvedSellerId = authenticatedUserId;
          resolvedBuyerId = byEmailRes.rows[0].id;
        }
      }

      // If still unresolved, check if the authenticated seller has an order with a buyer matching recipientName
      if (!resolvedBuyerId && resolvedRecipientName) {
        const ordMatchRes = await pool.query(
          `SELECT o.id, o.buyer_id, o.seller_id, u.name, u.email
           FROM orders o
           JOIN users u ON u.id = o.buyer_id
           WHERE o.seller_id = $1 AND (LOWER(u.name) = LOWER($2) OR LOWER(o.buyer_username) = LOWER($2))
           ORDER BY o.created_at DESC LIMIT 1`,
          [authenticatedUserId, resolvedRecipientName]
        );
        if (ordMatchRes.rows.length > 0) {
          resolvedBuyerId = ordMatchRes.rows[0].buyer_id;
          resolvedSellerId = ordMatchRes.rows[0].seller_id;
          resolvedOrderId = ordMatchRes.rows[0].id;
        }
      }

      if (!resolvedBuyerId || !resolvedSellerId) {
        return res.status(400).json({
          error: 'A valid related order (orderId/relatedOrderId) or distinct counterparty (buyerId or registered recipientEmail) is required to create an invoice.'
        });
      }

      if (!isAdmin && resolvedSellerId !== authenticatedUserId && resolvedBuyerId !== authenticatedUserId) {
        return res.status(403).json({ error: 'Forbidden: You must be an authorized participant on the invoice.' });
      }
    }

    if (resolvedBuyerId === resolvedSellerId) {
      return res.status(400).json({ error: 'Invalid invoice participants: buyerId and sellerId must be distinct users.' });
    }

    const partiesRes = await pool.query('SELECT id, name, email FROM users WHERE id IN ($1, $2)', [resolvedBuyerId, resolvedSellerId]);
    const buyerUser = partiesRes.rows.find((u: any) => u.id === resolvedBuyerId);
    const sellerUser = partiesRes.rows.find((u: any) => u.id === resolvedSellerId);
    if (!buyerUser || !sellerUser) {
      return res.status(404).json({ error: 'Invoice buyer or seller user account not found.' });
    }

    if (!resolvedOrderId) {
      const relOrderRes = await pool.query(
        'SELECT id FROM orders WHERE buyer_id = $1 AND seller_id = $2 ORDER BY created_at DESC LIMIT 1',
        [resolvedBuyerId, resolvedSellerId]
      );
      if (relOrderRes.rows.length > 0) {
        resolvedOrderId = relOrderRes.rows[0].id;
      } else if (!isAdmin) {
        const relWsRes = await pool.query(
          'SELECT workspace_id FROM workspaces WHERE buyer_id = $1 AND seller_id = $2 LIMIT 1',
          [resolvedBuyerId, resolvedSellerId]
        );
        if (relWsRes.rows.length === 0) {
          return res.status(403).json({
            error: 'Forbidden: Custom invoices require an existing order or workspace relationship between buyer and seller.'
          });
        }
      }
    }

    if (!resolvedRecipientName) {
      resolvedRecipientName = buyerUser.name;
    }
    if (!resolvedRecipientEmail) {
      resolvedRecipientEmail = buyerUser.email;
    }

    if (!title || !resolvedRecipientName) {
      return res.status(400).json({ error: 'Title and recipient name are required' });
    }

    const rawItems = (items && Array.isArray(items) && items.length > 0)
      ? items
      : [{ description: title, quantity: 1, unitPrice: 100 }];

    let subtotalCents = 0;
    const cleanItems = [];
    for (const it of rawItems) {
      const qty = Number(it.quantity);
      const unitPrice = Number(it.unitPrice ?? it.price ?? it.amount);
      if (!Number.isFinite(qty) || qty <= 0) {
        return res.status(400).json({ error: 'Each invoice line item quantity must be a positive number.' });
      }
      if (!Number.isFinite(unitPrice) || unitPrice < 0) {
        return res.status(400).json({ error: 'Each invoice line item price must be a non-negative number.' });
      }
      const itemAmount = Number((qty * unitPrice).toFixed(2));
      subtotalCents += Math.round(itemAmount * 100);
      cleanItems.push({
        description: String(it.description || title).slice(0, 255),
        quantity: qty,
        unitPrice,
        amount: itemAmount
      });
    }
    const subtotal = Number((subtotalCents / 100).toFixed(2));
    if (subtotal <= 0) {
      return res.status(400).json({ error: 'Invoice total must be greater than $0.00.' });
    }
    const platformFee = 0;
    const total = subtotal;

    const newInvoice: CustomInvoice = {
      id: 'inv_' + Date.now() + '_' + randomUUID().slice(0, 8),
      invoiceNumber: `INV-${Date.now().toString().slice(-6)}-${randomUUID().slice(0, 4).toUpperCase()}`,
      userId: authenticatedUserId,
      buyerId: resolvedBuyerId || undefined,
      sellerId: resolvedSellerId || undefined,
      recipientName: resolvedRecipientName,
      recipientEmail: resolvedRecipientEmail,
      title,
      issueDate: new Date().toISOString().substring(0, 10),
      dueDate: dueDate || new Date(Date.now() + 14 * 86400000).toISOString().substring(0, 10),
      status: 'unpaid',
      items: cleanItems,
      subtotal,
      platformFee,
      tax: 0,
      total,
      notes: notes || 'Standard WorkPerHour Invoice',
      relatedOrderId: resolvedOrderId || undefined
    };

    const invToSave = {
      id: newInvoice.id,
      invoiceNumber: newInvoice.invoiceNumber,
      buyerId: resolvedBuyerId,
      sellerId: resolvedSellerId,
      recipientName: newInvoice.recipientName,
      recipientEmail: newInvoice.recipientEmail,
      dueDate: newInvoice.dueDate,
      notes: newInvoice.notes,
      items: newInvoice.items,
      amount: newInvoice.total,
      total: newInvoice.total,
      status: newInvoice.status,
      description: newInvoice.title,
      createdAt: newInvoice.issueDate,
      relatedOrderId: resolvedOrderId || undefined
    };
    await store.saveCustomInvoice(invToSave as any);

    res.status(201).json(newInvoice);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/payments/methods/:userId', requireAuth, async (req: Request, res: Response) => {
  try {
    const authUserId = (req as any).authenticatedUserId;
    const pool = postgresStore.getPool();
    const callerRes = await pool.query('SELECT role FROM users WHERE id = $1', [authUserId]);
    const caller = callerRes.rows[0];
    const isAdmin = caller?.role === 'admin' || caller?.role === 'super_admin' || caller?.role === 'support';
    
    if (!isAdmin && authUserId !== req.params.userId) {
      return res.status(403).json({ error: 'Unauthorized: Cannot view another user payment methods.' });
    }

    const methods = await store.listPaymentMethodsForUser(req.params.userId);
    const sanitized = methods.map(m => ({
      ...m,
      details: {
        ...m.details,
        routingNumber: undefined
      }
    }));
    res.json(sanitized);
  } catch (err: any) {
    res.status(500).json(formatApiError(err));
  }
});

router.post('/payments/methods', requireAuth, async (req: Request, res: Response) => {
  try {
    const authUserId = (req as any).authenticatedUserId;
    const { type, name, details, isDefault } = req.body;
    const userId = authUserId;
    
    if (!userId || !type || !name) {
      return res.status(400).json({ error: 'Method type and name are required' });
    }

    // Tight payment method details validation by method type
    const lowerType = String(type).trim().toLowerCase();
    if (lowerType.includes('bank')) {
      if (!details?.accountNumber && !details?.iban && !details?.routingNumber) {
        return res.status(400).json({ error: 'Bank account number, IBAN, or routing number is required for Bank Transfer.' });
      }
    } else if (lowerType.includes('paypal')) {
      if (!details?.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(details.email))) {
        return res.status(400).json({ error: 'A valid email address is required for PayPal payment method.' });
      }
    } else if (lowerType.includes('upi')) {
      if (!details?.vpa && !details?.upiId) {
        return res.status(400).json({ error: 'A valid UPI VPA/ID (e.g., user@upi) is required for UPI payment method.' });
      }
    } else if (lowerType.includes('stripe')) {
      if (!details?.stripeAccountId && !details?.email) {
        return res.status(400).json({ error: 'Stripe account ID or email is required for Stripe payment method.' });
      }
    } else if (lowerType.includes('razorpay')) {
      if (!details?.accountId && !details?.vpa) {
        return res.status(400).json({ error: 'Razorpay account ID or UPI VPA is required.' });
      }
    }

    const existingMethods = await store.listPaymentMethodsForUser(userId);
    const newMethod: PaymentMethodRecord = {
      id: 'pm_' + Date.now() + '_' + randomUUID().slice(0, 8),
      userId,
      type,
      name,
      details: details || {},
      isDefault: Boolean(isDefault) || existingMethods.length === 0,
      createdAt: new Date().toISOString().substring(0, 10)
    };

    await store.savePaymentMethod(newMethod);
    res.json(newMethod);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/payments/methods/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const authUserId = (req as any).authenticatedUserId;
    const pool = postgresStore.getPool();
    const callerRes = await pool.query('SELECT role FROM users WHERE id = $1', [authUserId]);
    const caller = callerRes.rows[0];
    const isAdmin = caller?.role === 'admin' || caller?.role === 'super_admin';

    const method = await store.getPaymentMethodById(req.params.id);
    if (!method) return res.status(404).json({ error: 'Payment method not found' });

    if (!isAdmin && method.userId !== authUserId) {
      return res.status(403).json({ error: 'Forbidden: Cannot delete another user payment method.' });
    }

    await store.deletePaymentMethod(req.params.id);
    res.json({ success: true, id: req.params.id });
  } catch (err: any) {
    res.status(500).json(formatApiError(err));
  }
});

router.patch('/payments/methods/:id/default', requireAuth, async (req: Request, res: Response) => {
  try {
    const authUserId = (req as any).authenticatedUserId;
    const pool = postgresStore.getPool();
    const callerRes = await pool.query('SELECT role FROM users WHERE id = $1', [authUserId]);
    const caller = callerRes.rows[0];
    const isAdmin = caller?.role === 'admin' || caller?.role === 'super_admin';

    const method = await store.getPaymentMethodById(req.params.id);
    if (!method) return res.status(404).json({ error: 'Payment method not found' });

    if (!isAdmin && method.userId !== authUserId) {
      return res.status(403).json({ error: 'Forbidden: Cannot modify another user payment method.' });
    }

    await store.setDefaultPaymentMethod(method.userId, method.id);
    method.isDefault = true;
    res.json(method);
  } catch (err: any) {
    res.status(500).json(formatApiError(err));
  }
});

router.post('/wallet/deposit', requireAuth, requireFinancialActiveStatus, rateLimit(10, 60_000), async (req: Request, res: Response) => {
  try {
    if (!areSimulatedDepositsAllowed()) {
      return res.status(501).json({ error: 'Deposits require a connected payment gateway in production.' });
    }

    const authUserId = (req as any).authenticatedUserId;
    if (!authUserId) {
      return res.status(401).json({ error: 'Unauthorized: Authentication required' });
    }

    const pool = postgresStore.getPool();
    const callerRes = await pool.query('SELECT * FROM users WHERE id = $1', [authUserId]);
    const caller = callerRes.rows[0];
    if (!caller) {
      return res.status(401).json({ error: 'Authenticated user not found' });
    }

    const requestedUserId = req.body?.userId;
    let targetUserId = authUserId;
    if (requestedUserId && requestedUserId !== authUserId) {
      const isAdmin = caller.role === 'admin' || caller.role === 'super_admin';
      if (!isAdmin) {
        return res.status(403).json({ error: 'Forbidden: You cannot deposit funds into another user wallet.' });
      }
      const targetUser = await store.getUser(requestedUserId);
      if (!targetUser) {
        return res.status(404).json({ error: 'Target user not found' });
      }
      targetUserId = requestedUserId;
    }
    const amount = Number(req.body?.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: 'Please enter a valid deposit amount greater than $0.00' });
    }
    if (amount > 5000) {
      return res.status(400).json({ error: 'Simulated deposits are limited to $5,000.' });
    }

    await financialTransactionService.ensureWallet(targetUserId);
    const key = String(req.body?.idempotencyKey || randomUUID());
    const { replayed } = await financialTransactionService.creditDeposit({
      userId: targetUserId,
      amount,
      reference: `SIM-${key}`,
      idempotencyKey: `SIM-${targetUserId}-${key}`,
      actor: `${caller.name} (Simulated)`,
      source: 'simulated'
    });
    await syncUserBalances();
    const newBal = await financialRepository.getWalletBalance(targetUserId);
    res.json({ success: true, replayed, balance: newBal });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ==========================================
// ADMIN FINANCE REST APIS
// ==========================================

router.post('/admin/finance/reset-clean', requireRole(['super_admin']), async (req: Request, res: Response) => {
  if (IS_PRODUCTION && process.env.ALLOW_DATA_RESET !== 'true') {
    return res.status(403).json({ error: 'Data reset is disabled in production.' });
  }
  try {
    await cleanAllStoreData();
    orderStateLocks.clear();
    res.json({ success: true, message: 'All demo and runtime data reset to pristine clean state.' });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/admin/finance/overview', requireRole(['admin', 'super_admin']), async (req: Request, res: Response) => {
  try {
    const overview = await financialRepository.getFinancialOverview();
    res.json(overview);
  } catch (err: any) {
    res.status(500).json(formatApiError(err));
  }
});

router.get('/admin/finance/wallets', requireAdmin, async (req: Request, res: Response) => {
  try {
    const wallets = await financialRepository.getWallets();
    res.json(wallets);
  } catch (err: any) {
    res.status(500).json(formatApiError(err));
  }
});

router.get('/admin/finance/wallets/:id', requireAdmin, async (req: Request, res: Response) => {
  try {
    const data = await financialRepository.getWalletById(req.params.id);
    if (!data) return res.status(404).json({ error: 'Wallet not found' });
    res.json(data);
  } catch (err: any) {
    res.status(500).json(formatApiError(err));
  }
});

router.post('/admin/finance/wallets/:id/freeze', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { reason } = req.body;
    if (!reason) return res.status(400).json({ error: 'Mandatory reason required to freeze a wallet' });
    const wallet = await financialTransactionService.freezeWallet(req.params.id, reason, adminActor(req));
    res.json(wallet);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/admin/finance/wallets/:id/unfreeze', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { reason } = req.body;
    const wallet = await financialTransactionService.unfreezeWallet(req.params.id, reason || 'Administrative review completed', adminActor(req));
    res.json(wallet);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/admin/finance/wallets/:id/restrict', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { reason } = req.body;
    if (!reason) return res.status(400).json({ error: 'Mandatory reason required to restrict a wallet' });
    const wallet = await financialTransactionService.restrictWallet(req.params.id, reason, adminActor(req));
    res.json(wallet);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/admin/finance/transactions', requireAdmin, async (req: Request, res: Response) => {
  try {
    const txns = await financialRepository.getTransactions();
    res.json(txns);
  } catch (err: any) {
    res.status(500).json(formatApiError(err));
  }
});

router.get('/admin/finance/transactions/:id', requireAdmin, async (req: Request, res: Response) => {
  try {
    const txn = await financialRepository.getTransactionById(req.params.id);
    if (!txn) return res.status(404).json({ error: 'Transaction not found' });
    const journal = txn.journalId ? await financialRepository.getJournalById(txn.journalId) : null;
    res.json({ transaction: txn, journal });
  } catch (err: any) {
    res.status(500).json(formatApiError(err));
  }
});

router.get('/admin/finance/ledger', requireAdmin, async (req: Request, res: Response) => {
  try {
    const journals = await financialRepository.getJournals();
    res.json(journals);
  } catch (err: any) {
    res.status(500).json(formatApiError(err));
  }
});

router.get('/admin/finance/ledger/:id', requireAdmin, async (req: Request, res: Response) => {
  try {
    const journal = await financialRepository.getJournalById(req.params.id);
    if (!journal) return res.status(404).json({ error: 'Journal not found' });
    res.json(journal);
  } catch (err: any) {
    res.status(500).json(formatApiError(err));
  }
});

router.post('/admin/finance/ledger/:id/reverse', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { reason } = req.body;
    if (!reason) return res.status(400).json({ error: 'Mandatory accounting reversal reason required' });
    const reversal = await financialTransactionService.reverseJournal(req.params.id, reason, adminActor(req));
    res.json(reversal);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/admin/finance/escrow', requireAdmin, async (req: Request, res: Response) => {
  try {
    const allOrders = await store.listOrders();

    const disputesRes = await postgresStore.getPool().query("SELECT * FROM disputes WHERE status IN ('open', 'under_investigation')");
    const activeDisputes = new Set(disputesRes.rows.map((r: any) => r.order_id));

    const refundsRes = await postgresStore.getPool().query("SELECT * FROM refunds WHERE status = 'approved'");
    const activeRefunds = new Set(refundsRes.rows.map((r: any) => r.order_id));

    const [allUsers, escrowsRes] = await Promise.all([
      store.listUsers(),
      postgresStore.getPool().query('SELECT * FROM escrows')
    ]);
    const userMap = new Map(allUsers.map(u => [u.id, u]));
    const escrowMap = new Map(escrowsRes.rows.map((r: any) => [r.order_id, financialRepository.formatEscrowRow(r)]));

    const escrowOrders = allOrders.map(o => {
      const enriched = enrichOrderWithServiceInfo(o);
      const isDisputed = activeDisputes.has(o.id);
      const isRefunded = activeRefunds.has(o.id);
      const buyer = userMap.get(o.buyerId);
      const seller = userMap.get(o.sellerId);

      let escrowState = 'in_progress';
      if (isDisputed) escrowState = 'disputed';
      else if (isRefunded) escrowState = 'refunded';
      else if (o.status === 'completed') escrowState = 'released';
      else if (o.status === 'delivered') escrowState = 'release_pending';
      else if (o.status === 'funded_in_escrow') escrowState = 'funded';

      const esc = escrowMap.get(o.id);
      const fbComm = (o.feeBreakdown as any)?.commissionPercent;
      const liveCommRate = siteSettings.getSettings()?.commission?.commissionPercent ?? DEFAULT_FEE_CONFIG.commissionPercent;
      const effectiveCommRate = (esc?.commissionPercent !== undefined && esc?.commissionPercent !== null)
        ? Number(esc.commissionPercent)
        : (fbComm !== undefined && fbComm !== null ? Number(fbComm) : liveCommRate);

      return {
        ...enriched,
        buyerName: buyer?.name || 'Buyer #' + o.buyerId,
        buyerEmail: buyer?.email || '',
        sellerName: seller?.name || 'Freelancer #' + o.sellerId,
        sellerEmail: seller?.email || '',
        platformFeeRate: `${effectiveCommRate}%`,
        platformFeeAmount: FinanceLedgerEngine.round(o.amount * effectiveCommRate / 100),
        freelancerNetAmount: FinanceLedgerEngine.round(o.amount - o.amount * effectiveCommRate / 100),
        ledgerEscrowStatus: esc?.status || 'not_funded',
        ledgerEscrowHeld: esc?.remaining ?? 0,
        escrowState,
        isDisputed
      };
    });
    res.json(escrowOrders);
  } catch (err: any) {
    res.status(500).json(formatApiError(err));
  }
});

router.post('/admin/finance/escrow/:orderId/release', requireAdmin, async (req: Request, res: Response) => {
  const orderId = req.params.orderId;
  if (!tryAcquireOrderLock(orderId, res)) return;
  try {
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
        throw new Error('Order escrow has already been released and completed.');
      }
      if (order.status === 'cancelled') {
        throw new Error('Cannot release escrow: Order has already been cancelled/refunded.');
      }
      const activeDispute = await store.getDisputeByOrderId(order.id, client);
      if ((activeDispute && (activeDispute.status === 'open' || activeDispute.status === 'under_investigation' || (activeDispute.status as string) === 'under_review')) || order.status === 'disputed') {
        throw new Error(`Cannot release escrow: Order #${order.id} is under active dispute. Resolve the dispute first.`);
      }
      const escRes = await client.query('SELECT * FROM escrows WHERE order_id = $1 FOR UPDATE', [order.id]);
      const esc = escRes.rows[0];
      if (!esc || Number(esc.remaining) <= 0 || esc.status === 'released' || esc.status === 'refunded') {
        throw new Error('No refundable or releasable escrow funds remain for this order.');
      }
      const result = await releaseOrderFunds(order, adminActor(req), String(req.body.reason || 'Administrative escrow release'), false, req.body.requestKey, false, client);
      return { order, result };
    });
    res.json({ success: true, order: txResult.order, journal: txResult.result.journal, freelancerNet: txResult.result.freelancerNet, platformFee: txResult.result.platformFee });
  } catch (err: any) {
    res.status(err?.statusCode || 400).json({ error: err.message });
  } finally {
    releaseOrderLock(orderId);
  }
});

router.post('/admin/finance/escrow/:orderId/refund', requireAdmin, async (req: Request, res: Response) => {
  const orderId = req.params.orderId;
  if (!tryAcquireOrderLock(orderId, res)) return;
  try {
    const amount = req.body.amount === undefined || req.body.amount === '' ? undefined : Number(req.body.amount);
    const reason = String(req.body.reason || 'Administrative escrow refund approval');
    const actor = adminActor(req);
    const requestKey = req.body.requestKey || req.body.idempotencyKey;

    const result = await postgresStore.executeInTransaction(async (client) => {
      // 1. Lock order row
      const orderRes = await client.query('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [orderId]);
      if (orderRes.rows.length === 0) throw new Error('Order not found');
      const orderRow = orderRes.rows[0];

      if (orderRow.status === 'completed') {
        throw new Error('Cannot refund order: Escrow funds have already been released to seller.');
      }
      if (orderRow.status === 'cancelled') {
        throw new Error('Order is already cancelled/refunded.');
      }

      // 2. Lock escrow row
      const escRes = await client.query('SELECT * FROM escrows WHERE order_id = $1 FOR UPDATE', [orderId]);
      if (escRes.rows.length === 0) throw new Error('Escrow record not found for this order.');
      const escrow = escRes.rows[0];
      if (Number(escrow.remaining) <= 0 || escrow.status === 'released' || escrow.status === 'refunded') {
        throw new Error('No refundable escrow funds remaining for this order.');
      }

      // 3. Perform atomic refund financial operation
      const refundResult = await financialTransactionService.refundOrderFunds({
        orderId,
        amount,
        reason,
        actor,
        idempotencyKey: requestKey
      }, client);

      // 4. Lock & resolve active dispute in the same transaction
      const dispRes = await client.query(
        "SELECT * FROM disputes WHERE order_id = $1 AND status IN ('open', 'under_investigation') FOR UPDATE",
        [orderId]
      );
      if (dispRes.rows.length > 0) {
        await client.query(
          "UPDATE disputes SET status = 'resolved_refund', resolution_notes = $1, notes = $1 WHERE order_id = $2 AND status IN ('open', 'under_investigation')",
          [reason, orderId]
        );
      }

      return refundResult;
    });

    await syncUserBalances();
    const updatedOrder = await store.getOrder(orderId);
    res.json({ success: true, order: updatedOrder, result });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  } finally {
    releaseOrderLock(orderId);
  }
});

router.get('/admin/finance/payouts', requireAdmin, async (req: Request, res: Response) => {
  try {
    const [payoutsList, allUsers, allWallets] = await Promise.all([
      store.listPayouts(),
      store.listUsers(),
      financialRepository.getWallets()
    ]);
    const userMap = new Map(allUsers.map(u => [u.id, u]));
    const walletMap = new Map(allWallets.map(w => [w.userId, w]));

    const enrichedPayouts = payoutsList.map(p => {
      const freelancer = userMap.get(p.freelancerId);
      const wallet = walletMap.get(p.freelancerId);
      return {
        ...p,
        freelancerName: freelancer?.name || 'Freelancer #' + p.freelancerId,
        freelancerEmail: freelancer?.email || '',
        walletAvailableBalance: wallet?.availableBalance || 0,
        currency: 'USD'
      };
    });
    res.json(enrichedPayouts);
  } catch (err: any) {
    res.status(500).json(formatApiError(err));
  }
});

router.post('/admin/finance/payouts/:id/approve', requireAdmin, approvePayout);
router.post('/admin/finance/payouts/:id/process', requireAdmin, processPayout);
router.post('/admin/finance/payouts/:id/reject', requireAdmin, rejectPayout);
router.post('/admin/finance/payouts/:id/fail', requireAdmin, failPayout);
router.post('/admin/finance/payouts/:id/retry', requireAdmin, retryPayout);

router.patch('/admin/payouts/:id/approve', requireAdmin, approvePayout);
router.patch('/admin/payouts/:id/process', requireAdmin, processPayout);
router.patch('/admin/payouts/:id/fail', requireAdmin, failPayout);

router.get('/admin/finance/reconciliation', requireAdmin, async (req: Request, res: Response) => {
  try {
    const recon = await financialRepository.getReconciliationSummary();
    res.json(recon);
  } catch (err: any) {
    res.status(500).json(formatApiError(err));
  }
});

router.post('/admin/finance/reconciliation/resolve/:id', requireAdmin, async (req: Request, res: Response) => {
  try {
    const notes = typeof req.body?.notes === 'string' ? req.body.notes.trim() : '';
    if (!notes) {
      return res.status(400).json({ error: 'Investigation notes required to mark exception resolved' });
    }
    const actor = adminActor(req);
    const role = (req as any).authenticatedUser?.role || 'super_admin';
    const resolved = await financialTransactionService.resolveReconciliationException({
      exceptionId: req.params.id,
      notes,
      actor,
      role
    });
    res.json(resolved);
  } catch (err: any) {
    const statusCode = typeof err?.statusCode === 'number' ? err.statusCode : (typeof err?.status === 'number' ? err.status : 400);
    res.status(statusCode).json({ error: err.message });
  }
});

router.get('/admin/finance/audit', requireAdmin, async (req: Request, res: Response) => {
  try {
    if (!isPostgresEnabled()) {
      return res.status(503).json({ error: 'PostgreSQL persistence is required for financial audit logs.' });
    }
    const logs = await postgresStore.listAuditLogs();
    res.json(logs);
  } catch (err: any) {
    res.status(500).json(formatApiError(err));
  }
});

router.post('/admin/finance/adjustments/preview', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { userId, amount, direction, category, reason } = req.body;
    const preview = await financialRepository.previewAdjustment({ userId, amount: Number(amount), direction, category, reason });
    res.json(preview);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/admin/finance/adjustments', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { userId, amount, direction, category, reason, evidenceReference, requestKey } = req.body;
    const result = await financialTransactionService.executeAdjustment({
      userId,
      amount: Number(amount),
      direction,
      category,
      reason,
      evidenceReference,
      actor: adminActor(req),
      requestKey
    });
    await syncUserBalances();
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/admin/finance/diagnostics', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { severity, service, operation, requestId, legacyOnly } = req.query;
    if (!isPostgresEnabled()) {
      return res.json(diagnosticService.getInMemoryLogs(req.query));
    }
    let sql = 'SELECT * FROM runtime_diagnostic_logs WHERE 1=1';
    const params: any[] = [];
    if (severity) { params.push(severity); sql += ` AND severity = $${params.length}`; }
    if (service) { params.push(service); sql += ` AND service = $${params.length}`; }
    if (operation) { params.push(operation); sql += ` AND operation = $${params.length}`; }
    if (requestId) { params.push(requestId); sql += ` AND request_id = $${params.length}`; }
    if (legacyOnly === 'true') { params.push('financeLedger'); sql += ` AND implementation = $${params.length}`; }
    sql += ' ORDER BY timestamp DESC LIMIT 100';
    
    const logs = await postgresStore.getPool().query(sql, params);
    res.json(logs.rows);
  } catch (err: any) {
    res.status(500).json(formatApiError(err));
  }
});

router.get('/admin/finance/export/:type', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { type } = req.params;
    const { filename, content } = await financialRepository.generateCsvExport(type, req.query as any);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.status(200).send(content);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;

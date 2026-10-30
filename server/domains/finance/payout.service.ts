import { Request, Response } from 'express';
import { randomUUID, createHash } from 'crypto';
import { store, mapPayoutRow, type Payout } from '../../store.js';
import { postgresStore } from '../../db/postgresStore.js';
import { DEFAULT_SITE_SETTINGS, siteSettings } from '../../domains/admin/siteSettings.js';
import { financialTransactionService, financialRepository } from './financial.service.js';
import { EMAIL_DELIVERY_ENABLED } from '../../services/notificationService.js';
import {
  resolveAuthenticatedUserId,
  adminActor,
  IS_PRODUCTION
} from '../../middleware/auth.js';
import { verifyAndConsumeWithdrawalCode } from '../../services/authService.js';
import { syncUserBalances, registerAuditLog } from '../../services/orderService.js';
import { paymentGatewayManager } from './paymentGateways.js';

export const ALLOWED_METHODS: Record<string, keyof typeof DEFAULT_SITE_SETTINGS.wallets.allowedPayoutMethods> = {
  'UPI': 'upi',
  'Bank Transfer': 'bankTransfer',
  'Stripe': 'stripeConnect',
  'Razorpay': 'razorpayX',
  'PayPal': 'paypal'
};

export function resolvePayoutUserId(req: Request): string | null {
  return resolveAuthenticatedUserId(req);
}

export function formatPayoutRow(r: any): Payout {
  return mapPayoutRow(r);
}

export async function payoutAudit(req: Request, action: string, p: Payout, details: string): Promise<void> {
  await registerAuditLog({
    id: 'FAUD-' + randomUUID().slice(0, 12),
    actor: adminActor(req),
    role: 'super_admin',
    action,
    target: `Payout #${p.id}`,
    details,
    timestamp: new Date().toLocaleString()
  });
}

export async function executeEscrowReleaseTransaction(params: {
  orderId: string;
  actor: string;
  reason?: string;
  idempotencyKey?: string;
  allowDisputeResolution?: boolean;
}, externalClient?: any) {
  const run = async (client: any) => {
    const ordRes = await client.query('SELECT * FROM orders WHERE id = $1', [params.orderId]);
    if (ordRes.rows.length > 0) {
      const ordStatus = ordRes.rows[0].status;
      if (ordStatus === 'completed' || ordStatus === 'cancelled') {
        throw new Error(`Cannot release escrow: Order is already ${ordStatus}.`);
      }
    }
    const escRes = await client.query('SELECT * FROM escrows WHERE order_id = $1', [params.orderId]);
    if (escRes.rows.length === 0) {
      throw new Error(`Escrow record not found in PostgreSQL for order ${params.orderId}`);
    }
    const escrow = escRes.rows[0];
    if ((escrow.status !== 'held' && escrow.status !== 'split') || Number(escrow.remaining) <= 0) {
      throw new Error(`Escrow for order ${params.orderId} is already ${escrow.status}; nothing left to release.`);
    }
    return financialTransactionService.releaseOrderFunds(params, client);
  };
  if (externalClient) return run(externalClient);
  return postgresStore.executeInTransaction(run);
}

export async function executeEscrowRefundTransaction(params: {
  orderId: string;
  amount?: number;
  reason: string;
  actor: string;
  idempotencyKey?: string;
}, externalClient?: any) {
  const run = async (client: any) => {
    const ordRes = await client.query('SELECT * FROM orders WHERE id = $1', [params.orderId]);
    if (ordRes.rows.length > 0) {
      const ordStatus = ordRes.rows[0].status;
      if (ordStatus === 'completed' || ordStatus === 'cancelled') {
        throw new Error(`Cannot refund escrow: Order is already ${ordStatus}.`);
      }
    }
    const escRes = await client.query('SELECT * FROM escrows WHERE order_id = $1', [params.orderId]);
    if (escRes.rows.length === 0) {
      throw new Error(`Escrow record not found in PostgreSQL for order ${params.orderId}`);
    }
    const escrow = escRes.rows[0];
    if ((escrow.status !== 'held' && escrow.status !== 'split') || Number(escrow.remaining) <= 0) {
      throw new Error(`Escrow for order ${params.orderId} is already ${escrow.status}; nothing left to refund.`);
    }
    return financialTransactionService.refundOrderFunds(params, client);
  };
  if (externalClient) return run(externalClient);
  return postgresStore.executeInTransaction(run);
}

export async function handlePayoutRequest(req: Request, res: Response) {
  try {
    const freelancerId = resolvePayoutUserId(req);
    if (!freelancerId) {
      return res.status(401).json({ error: 'Authentication required to request a payout.' });
    }
    const user = await store.getUser(freelancerId);
    if (!user) {
      return res.status(404).json({ error: 'User account not found.' });
    }
    if (user.status === 'frozen') {
      return res.status(403).json({ error: 'User account is frozen. Financial transactions are restricted.' });
    }
    await financialTransactionService.ensureWallet({
      userId: freelancerId,
      name: user.name,
      email: user.email,
      role: user.role || 'freelancer'
    });

    const idempotencyKey = String(req.body?.idempotencyKey || req.body?.requestKey || req.headers['x-idempotency-key'] || '').trim();
    if (idempotencyKey) {
      const pool = postgresStore.getPool();
      const checkRes = await pool.query(
        "SELECT result FROM financial_idempotency WHERE key = $1 AND operation = 'requestPayout' AND status = 'completed' AND request_fingerprint->>'freelancerId' = $2",
        [idempotencyKey, freelancerId]
      );
      if (checkRes.rows.length > 0) {
        const resVal = typeof checkRes.rows[0].result === 'string' ? JSON.parse(checkRes.rows[0].result) : checkRes.rows[0].result;
        const activePayoutId = resVal?.payoutId || resVal?.payout?.id;
        const record = activePayoutId ? await store.getPayoutById(activePayoutId) : null;
        const newBalance = (await financialRepository.getWalletBalance(freelancerId)) ?? Number(user.walletBalance || 0);
        return res.status(200).json({
          success: true,
          replayed: true,
          newBalance,
          payout: record,
          ...(record || {})
        });
      }
    }

    const rawCode = req.body?.code;
    if (!rawCode || typeof rawCode !== 'string' || !rawCode.trim()) {
      return res.status(400).json({ error: 'Email verification code is required for withdrawal. Please request a code first via /api/auth/withdrawal/request-code.' });
    }

    const rawMethod = String(req.body?.method || 'Bank Transfer');
    const settingKey = ALLOWED_METHODS[rawMethod];
    const liveSettings = siteSettings.getSettings();
    const allowedMethods = liveSettings?.wallets?.allowedPayoutMethods || DEFAULT_SITE_SETTINGS.wallets.allowedPayoutMethods;
    if (!settingKey || !allowedMethods[settingKey]) {
      return res.status(400).json({ error: `Unsupported payout method "${rawMethod}".` });
    }

    const numAmount = Number(req.body?.amount);
    if (!Number.isFinite(numAmount) || numAmount <= 0 || Math.abs(Math.round(numAmount * 100) - numAmount * 100) > 1e-6) {
      return res.status(400).json({ error: 'Please enter a valid withdrawal amount greater than $0.00' });
    }

    const walletConfig = liveSettings?.wallets || DEFAULT_SITE_SETTINGS.wallets;
    const minPayout = walletConfig?.minimumWithdrawalAmount ?? 10.00;
    if (numAmount < minPayout) {
      return res.status(400).json({ error: `Minimum payout withdrawal amount is $${minPayout.toFixed(2)}.` });
    }

    const dailyLimit = walletConfig?.dailyWithdrawalLimit ?? 10000;

    // Deterministic payoutId if idempotencyKey provided, else random
    const id = idempotencyKey
      ? ('pay_' + createHash('sha256').update(`${freelancerId}:${idempotencyKey}`).digest('hex').slice(0, 12))
      : ('pay_' + randomUUID().slice(0, 8));

    const accountDetails = String(req.body?.accountDetails || 'Primary Bank Account').slice(0, 500);

    // Atomic wallet row lock + eligibility check + OTP consumption + Payout creation inside a single database transaction:
    const txOutcome = await postgresStore.executeInTransaction(async (client) => {
      const walletRes = await client.query('SELECT available_balance, status, user_role FROM wallets WHERE user_id = $1 FOR UPDATE', [freelancerId]);
      if (walletRes.rows.length > 0) {
        const wallet = walletRes.rows[0];
        if (wallet.status === 'frozen' || wallet.status === 'suspended' || wallet.status === 'restricted') {
          throw new Error(`Cannot request payout from a ${wallet.status} wallet.`);
        }
        if (wallet.user_role && wallet.user_role !== 'freelancer') {
          throw new Error('Only freelancers can request payouts.');
        }
        if (Number(wallet.available_balance || 0) < numAmount) {
          throw new Error('Insufficient available balance.');
        }
      }

      if (idempotencyKey) {
        const checkRes = await client.query(
          "SELECT result FROM financial_idempotency WHERE key = $1 AND operation = 'requestPayout' AND status = 'completed' AND request_fingerprint->>'freelancerId' = $2",
          [idempotencyKey, freelancerId]
        );
        if (checkRes.rows.length > 0) {
          const resVal = typeof checkRes.rows[0].result === 'string' ? JSON.parse(checkRes.rows[0].result) : checkRes.rows[0].result;
          return { verified: true as const, replayed: true as const, payoutResult: resVal };
        }
      }

      const dailyRes = await client.query(
        `SELECT COALESCE(SUM(amount), 0) as total_today FROM payouts
         WHERE freelancer_id = $1 AND status IN ('pending', 'approved', 'processed') AND NULLIF(created_at::text, '')::timestamptz >= NOW() - INTERVAL '24 hours'`,
        [freelancerId]
      );
      const totalToday = Number(dailyRes.rows[0]?.total_today || 0);
      if (totalToday + numAmount > dailyLimit) {
        throw new Error(
          `Daily withdrawal limit of $${dailyLimit.toFixed(2)} exceeded. Requested: $${numAmount.toFixed(2)}, Already requested today: $${totalToday.toFixed(2)}.`
        );
      }

      const verification = await verifyAndConsumeWithdrawalCode(freelancerId, rawCode, client);
      if (!verification.ok) {
        return { verified: false as const, verification };
      }

      const result = await financialTransactionService.requestPayout({
        payoutId: id,
        freelancerId,
        amount: numAmount,
        method: rawMethod,
        accountDetails,
        actor: `user:${freelancerId}`,
        idempotencyKey: idempotencyKey || undefined
      }, client);

      return { verified: true as const, replayed: false as const, payoutResult: result };
    });

    if (!txOutcome.verified) {
      return res.status(txOutcome.verification.status).json({ error: txOutcome.verification.error });
    }

    const payoutResult = txOutcome.payoutResult;
    const activePayoutId = payoutResult.payoutId || payoutResult.payout?.id || id;

    if (txOutcome.replayed) {
      const record = activePayoutId ? await store.getPayoutById(activePayoutId) : null;
      const newBalance = (await financialRepository.getWalletBalance(freelancerId)) ?? Number(user.walletBalance || 0);
      return res.status(200).json({
        success: true,
        replayed: true,
        newBalance,
        payout: record,
        ...(record || {})
      });
    }

    const record: Payout = (await store.getPayoutById(activePayoutId)) || {
      id: activePayoutId,
      freelancerId,
      amount: payoutResult.amount ?? numAmount,
      method: rawMethod as Payout['method'],
      status: 'pending',
      createdAt: new Date().toISOString(),
      accountDetails: payoutResult.accountDetails || accountDetails
    };

    await syncUserBalances([freelancerId]);

    await registerAuditLog({
      id: 'log_' + Date.now() + '_' + randomUUID().slice(0, 8),
      actor: user.name,
      role: user.role,
      action: 'PAYOUT_REQUESTED',
      target: `Payout #${record.id}`,
      details: `User requested withdrawal of $${numAmount.toFixed(2)} via ${record.method}`,
      timestamp: new Date().toLocaleString()
    });

    const newBalance = (await financialRepository.getWalletBalance(freelancerId)) ?? Number(user.walletBalance || 0);
    const txs = await financialRepository.getTransactions(freelancerId);
    const transaction = txs.find(t => (t as any).relatedPayoutId === activePayoutId);

    res.status(201).json({
      success: true,
      newBalance,
      payout: record,
      transaction,
      ...record
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
}

export const approvePayout = async (req: Request, res: Response) => {
  try {
    const payoutId = req.params.id;
    const updatedPayout = await postgresStore.executeInTransaction(async (client) => {
      const pRes = await client.query('SELECT * FROM payouts WHERE id = $1', [payoutId]);
      if (pRes.rows.length === 0) throw { status: 404, message: 'Payout not found' };
      const payout = pRes.rows[0];
      if (payout.status === 'approved') {
        return mapPayoutRow(payout);
      }
      if (payout.status !== 'pending') {
        throw { status: 400, message: `Cannot approve payout in status "${payout.status}"` };
      }
      const updated = await client.query(
        "UPDATE payouts SET status = 'approved', updated_at = NOW() WHERE id = $1 RETURNING *",
        [payoutId]
      );
      return mapPayoutRow(updated.rows[0]);
    });

    await payoutAudit(req, 'PAYOUT_APPROVED', updatedPayout, `Approved payout of $${updatedPayout.amount} via ${updatedPayout.method} for freelancer ${updatedPayout.freelancerId}`);
    res.json(updatedPayout);
  } catch (err: any) {
    const status = typeof err?.status === 'number' ? err.status : 400;
    res.status(status).json({ error: err.message || err.error });
  }
};

export const processPayout = async (req: Request, res: Response) => {
  try {
    const payoutId = req.params.id;
    const providerReference = req.body?.providerReference ? String(req.body.providerReference).trim() : '';
    if (IS_PRODUCTION && !providerReference) {
      return res.status(400).json({ error: 'Explicit providerReference is required in production to process a payout.' });
    }

    const preLookup = await postgresStore.getPool().query('SELECT * FROM payouts WHERE id = $1', [payoutId]);
    if (preLookup.rows.length === 0) {
      return res.status(404).json({ error: 'Payout not found' });
    }
    const candidatePayout = preLookup.rows[0];
    if (candidatePayout.status !== 'pending' && candidatePayout.status !== 'approved') {
      return res.status(400).json({ error: `Cannot process payout in status "${candidatePayout.status}"` });
    }
    if (Number(candidatePayout.amount) >= 500 && candidatePayout.status !== 'approved') {
      return res.status(400).json({ error: 'Payouts of $500.00 or more require explicit administrative approval before processing.' });
    }

    const effectiveProviderRef = providerReference || `GW-SETTLE-${payoutId}`;
    const preVerification = await paymentGatewayManager.verifyPayoutSettlement({
      method: candidatePayout.method,
      providerReference: effectiveProviderRef,
      amount: Number(candidatePayout.amount),
      payoutId
    });
    if (!preVerification || !preVerification.verified) {
      return res.status(400).json({ error: `Payout settlement could not be verified with payment provider for payout ${payoutId}` });
    }

    const { journal, freelancerId } = await postgresStore.executeInTransaction(async (client) => {
      const pCheck = await client.query('SELECT * FROM payouts WHERE id = $1', [payoutId]);
      if (pCheck.rows.length === 0) throw { status: 404, message: 'Payout not found' };
      const preRow = pCheck.rows[0];
      if (preRow.status !== 'pending' && preRow.status !== 'approved') {
        throw { status: 400, message: `Cannot process payout in status "${preRow.status}"` };
      }
      if (Number(preRow.amount) >= 500 && preRow.status !== 'approved') {
        throw { status: 400, message: 'Payouts of $500.00 or more require explicit administrative approval before processing.' };
      }
      if (Number(preRow.amount) !== Number(candidatePayout.amount) || preRow.method !== candidatePayout.method) {
        throw { status: 409, message: 'Payout details changed concurrently during verification.' };
      }
      const settled = await financialTransactionService.settlePayout({
        payoutId,
        actor: adminActor(req),
        providerReference: effectiveProviderRef,
        preVerified: true
      }, client);
      return { journal: settled.journal, freelancerId: preRow.freelancer_id };
    });

    const p = await store.getPayoutById(payoutId);
    if (p) {
      await payoutAudit(req, 'PAYOUT_PROCESSED', p, `Processed payout of $${p.amount} via ${p.method}`);
    }
    await syncUserBalances([freelancerId]);
    res.json({ success: true, payout: p, journal, ...(p || {}) });
  } catch (err: any) {
    const status = typeof err?.status === 'number' ? err.status : 400;
    res.status(status).json({ error: err.message || err.error });
  }
};

export const rejectPayout = async (req: Request, res: Response) => {
  try {
    const payoutId = req.params.id;
    const reason = String(req.body?.reason || 'Administrative rejection');
    const actor = adminActor(req);

    const { freelancerId } = await postgresStore.executeInTransaction(async (client) => {
      const pRes = await client.query('SELECT * FROM payouts WHERE id = $1', [payoutId]);
      if (pRes.rows.length === 0) throw { status: 404, message: 'Payout not found' };
      const payoutRow = pRes.rows[0];
      if (payoutRow.status !== 'pending' && payoutRow.status !== 'approved') {
        throw { status: 400, message: `Cannot reject payout in status "${payoutRow.status}"` };
      }
      await financialTransactionService.cancelPayout({
        payoutId,
        reason,
        actor
      }, client);
      return { freelancerId: payoutRow.freelancer_id };
    });

    const updated = await store.getPayoutById(payoutId);
    if (updated) {
      await payoutAudit(req, 'PAYOUT_REJECTED', updated, `Rejected payout of $${updated.amount}; funds returned to wallet`);
    }
    await syncUserBalances([freelancerId]);
    res.json({ success: true, payout: updated, ...(updated || {}) });
  } catch (err: any) {
    const status = typeof err?.status === 'number' ? err.status : 400;
    res.status(status).json({ error: err.message || err.error });
  }
};

export const failPayout = async (req: Request, res: Response) => {
  try {
    const payoutId = req.params.id;
    const reason = String(req.body?.reason || 'Gateway reported a transfer failure');
    const actor = adminActor(req);

    const txResult = await postgresStore.executeInTransaction(async (client) => {
      const pCheck = await client.query('SELECT * FROM payouts WHERE id = $1', [payoutId]);
      if (pCheck.rows.length === 0) throw { status: 404, message: 'Payout not found' };
      const currentPayout = pCheck.rows[0];

      if (currentPayout.status === 'failed') {
        return { alreadyFailed: true as const, row: currentPayout };
      }
      if (currentPayout.status === 'processed') {
        throw { status: 400, message: 'Cannot fail payout: Payout has already been processed.' };
      }
      if (currentPayout.status !== 'pending' && currentPayout.status !== 'approved') {
        throw { status: 400, message: `Cannot fail payout in status "${currentPayout.status}"` };
      }

      await financialTransactionService.failPayout({
        payoutId,
        reason,
        actor
      }, client);
      return { alreadyFailed: false as const, row: currentPayout };
    });

    if (txResult.alreadyFailed) {
      const p = await store.getPayoutById(payoutId);
      return res.json(p || mapPayoutRow(txResult.row));
    }

    const p = await store.getPayoutById(payoutId);
    if (p) {
      await payoutAudit(req, 'PAYOUT_FAILED', p, `Payout of $${p.amount} failed; funds returned to wallet`);
    }
    await syncUserBalances([txResult.row.freelancer_id]);
    res.json(p || mapPayoutRow(txResult.row));
  } catch (err: any) {
    const status = typeof err?.status === 'number' ? err.status : 400;
    res.status(status).json({ error: err.message || err.error });
  }
};

export const retryPayout = async (req: Request, res: Response) => {
  try {
    const payoutId = req.params.id;
    const actor = adminActor(req);

    const pRow = await postgresStore.executeInTransaction(async (client) => {
      const pCheck = await client.query('SELECT * FROM payouts WHERE id = $1', [payoutId]);
      if (pCheck.rows.length === 0) throw { status: 404, message: 'Payout not found' };
      const p = pCheck.rows[0];
      if (p.status !== 'failed') {
        throw { status: 400, message: 'Only failed payouts can be retried.' };
      }
      await financialTransactionService.retryPayout({ payoutId, actor }, client);
      return p;
    });

    const updated = await store.getPayoutById(payoutId);
    if (updated) {
      await payoutAudit(req, 'PAYOUT_RETRIED', updated, `Re-queued failed payout of $${updated.amount}`);
    }
    await syncUserBalances([pRow.freelancer_id]);
    res.json(updated || mapPayoutRow(pRow));
  } catch (err: any) {
    const status = typeof err?.status === 'number' ? err.status : 400;
    res.status(status).json({ error: err.message || err.error });
  }
};

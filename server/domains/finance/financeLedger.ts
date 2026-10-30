import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_FEE_CONFIG, calculateOrderFees, percentOfCents, validateFeeConfig, type FeeConfig } from '../../../src/shared/fees.js';
import { postgresStore } from '../../db/postgresStore.js';
import { financialTransactionService } from './financial.service.js';

// Authoritative Double-Entry Ledger & Financial Engine for WorkPerHour

export interface ChartOfAccount {
  code: string;
  name: string;
  type: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
  normalBalance: 'debit' | 'credit';
  description: string;
}

export const CHART_OF_ACCOUNTS: ChartOfAccount[] = [
  { code: '1010', name: 'Operating Cash & Bank', type: 'asset', normalBalance: 'debit', description: 'Settled operational funds in platform bank accounts' },
  { code: '1020', name: 'Payment Processor Clearing', type: 'asset', normalBalance: 'debit', description: 'Stripe & Razorpay clearing accounts awaiting platform settlement' },
  { code: '1030', name: 'Payout Gateway Transit', type: 'asset', normalBalance: 'debit', description: 'Funds in transit through payout gateways (UPI/Bank Wire/Stripe)' },
  { code: '2010', name: 'Buyer Wallets Payable', type: 'liability', normalBalance: 'credit', description: 'Available pre-funded wallet balances owed to buyers' },
  { code: '2020', name: 'Freelancer Wallets Payable', type: 'liability', normalBalance: 'credit', description: 'Withdrawable earnings owed to freelance talent' },
  { code: '2030', name: 'Marketplace Escrow Funds in Trust', type: 'liability', normalBalance: 'credit', description: 'Order funds held in escrow under 14-day protection' },
  { code: '2040', name: 'Pending Payout Liabilities', type: 'liability', normalBalance: 'credit', description: 'Requested withdrawals queued for bank or UPI transfer' },
  { code: '3010', name: 'Opening Balance Equity', type: 'equity', normalBalance: 'credit', description: 'Opening balances carried over when the ledger was introduced' },
  { code: '2050', name: 'Seller Pending Clearance Liability', type: 'liability', normalBalance: 'credit', description: 'Released freelancer earnings held during 14-day clearance period' },
  { code: '4010', name: 'Marketplace Platform Commission Fee', type: 'revenue', normalBalance: 'credit', description: 'Platform commission (default 20%) taken from the gig price when escrow is released' },
  { code: '4020', name: 'Client Service Fee Revenue', type: 'revenue', normalBalance: 'credit', description: 'Client service fee (default 1% of gig price) collected at checkout' },
  { code: '4030', name: 'Small-Order Fee Revenue', type: 'revenue', normalBalance: 'credit', description: 'Flat small-order fee (default $1.00 under $200) collected at checkout' },
  { code: '4040', name: 'Promotional & Featured Listing Revenue', type: 'revenue', normalBalance: 'credit', description: 'Featured gig badge and promotional placement revenue' },
  { code: '5010', name: 'Payment Processing Gateway Fees', type: 'expense', normalBalance: 'debit', description: 'Merchant fees charged by Stripe, Razorpay, or banks' },
  { code: '5020', name: 'Administrative & Goodwill Adjustments', type: 'expense', normalBalance: 'debit', description: 'Compensatory credits and goodwill dispute write-offs' },
];

export interface LedgerEntry {
  id: string;
  journalId: string;
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
  currency: string;
  description: string;
  userId?: string;
  orderId?: string;
  payoutId?: string;
}

export interface LedgerJournal {
  id: string;
  reference: string;
  postingDate: string;
  timestamp: string;
  description: string;
  eventType: 
    | 'DEPOSIT_SETTLED'
    | 'ORDER_ESCROW_FUNDED'
    | 'ORDER_ESCROW_TOPUP'
    | 'ESCROW_RELEASED_TO_FREELANCER'
    | 'ESCROW_REFUNDED_TO_BUYER'
    | 'ESCROW_REFUNDED_WITH_FEES'
    | 'PAYOUT_REQUESTED'
    | 'PAYOUT_SETTLED'
    | 'PAYOUT_CANCELLED'
    | 'PAYOUT_FAILED'
    | 'OPENING_BALANCE'
    | 'ADMIN_ADJUSTMENT_CREDIT'
    | 'ADMIN_ADJUSTMENT_DEBIT'
    | 'REVERSAL';
  idempotencyKey: string;
  entries: LedgerEntry[];
  totalDebit: number;
  totalCredit: number;
  status: 'posted' | 'reversed';
  actor: string;
  reversedByJournalId?: string;
  reversalOfJournalId?: string;
  notes?: string;
}

export interface UserWallet {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  userRole: 'buyer' | 'freelancer' | 'admin';
  currency: string;
  availableBalance: number;
  pendingIncoming: number;
  fundsOnHold: number;
  pendingWithdrawals: number;
  status: 'active' | 'frozen' | 'restricted';
  restrictionReason?: string;
  lastActivityAt: string;
  createdAt: string;
}

export interface FinancialTransaction {
  id: string;
  type: 
    | 'deposit'
    | 'order_payment'
    | 'escrow_fund'
    | 'escrow_release'
    | 'platform_fee'
    | 'freelancer_earning'
    | 'refund'
    | 'payout_requested'
    | 'payout_processed'
    | 'payout_failed'
    | 'payout_cancelled'
    | 'adjustment_credit'
    | 'adjustment_debit';
  amount: number;
  currency: string;
  timestamp: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'reversed' | 'needs_review';
  userId: string;
  userName: string;
  userRole: 'buyer' | 'freelancer' | 'admin';
  relatedOrderId?: string;
  relatedPayoutId?: string;
  relatedRefundId?: string;
  providerReference?: string;
  journalId?: string;
  description: string;
  direction?: 'debit' | 'credit';
  metadata?: Record<string, any>;
}

export interface FinancialAuditLog {
  id: string;
  actor: string;
  role: string;
  action: string;
  target: string;
  reason: string;
  requestedState?: string;
  resultingState?: string;
  journalId?: string;
  timestamp: string;
}

export interface ReconciliationException {
  id: string;
  type: 'gateway_mismatch' | 'unbalanced_journal' | 'wallet_ledger_drift' | 'orphan_payout' | 'duplicate_provider_ref' | string;
  entityId: string;
  amount: number;
  currency: string;
  description: string;
  status: 'open' | 'unresolved' | 'investigating' | 'resolved';
  assignedTo?: string;
  investigationNotes?: string;
  resolvedBy?: string;
  resolvedAt?: string;
  detectedAt: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const MAX_AMOUNT = 1_000_000;
const DEFAULT_CURRENCY = 'USD';
const nowStr = () => new Date().toISOString().replace('T', ' ').substring(0, 19);

export interface EscrowRecord {
  orderId: string;
  orderTitle: string;
  buyerId: string;
  sellerId: string;
  amount: number;          // original funded amount
  remaining: number;       // still held in 2030
  refundedTotal: number;
  releasedGross: number;
  refundSeq: number;
  releaseSeq?: number;
  status: 'held' | 'released' | 'refunded' | 'split';
  fundedAt: string;
  commissionPercent: number; // commission rate locked in when the escrow was funded
  serviceFee: number;        // client service fee collected at funding (not held in escrow)
  smallOrderFee: number;     // small-order fee collected at funding (not held in escrow)
  feesRefunded: boolean;     // true once the client fees were returned on a full refund
}

export interface PayoutRecord {
  id: string;
  freelancerId: string;
  amount: number;
  method: string;
  accountDetails: string;
  status: 'requested' | 'settled' | 'cancelled' | 'failed';
  attempt: number;
}

// CSV cell helper: quotes text and neutralises spreadsheet formula injection (=, +, -, @, tab, CR)
function csvText(v: unknown): string {
  let t = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(t)) t = "'" + t;
  return `"${t.replace(/"/g, '""')}"`;
}
const csvNum = (n: number) => (Number.isFinite(n) ? n.toFixed(2) : '0.00');

// In-Memory Double-Entry Ledger Store.
// NOTE: state lives in process memory. Move it to a real database (with transactions) before production.
export class FinanceLedgerEngine {
  private journals: LedgerJournal[] = [];
  private transactions: FinancialTransaction[] = [];
  private wallets: Map<string, UserWallet> = new Map();
  private auditLogs: FinancialAuditLog[] = [];
  private exceptions: ReconciliationException[] = [];
  private idempotencyKeys: Set<string> = new Set();
  private escrows: Map<string, EscrowRecord> = new Map();
  private escrowLocks: Set<string> = new Set();
  private payouts: Map<string, PayoutRecord> = new Map();
  private opResults: Map<string, any> = new Map();
  private platformCommissionRate: number = DEFAULT_FEE_CONFIG.commissionPercent;
  private buyerFeePercent: number = DEFAULT_FEE_CONFIG.buyerFeePercent;
  private smallOrderFee: number = DEFAULT_FEE_CONFIG.smallOrderFee;
  private smallOrderThreshold: number = DEFAULT_FEE_CONFIG.smallOrderThreshold;
  private refundClientFeesOnFullRefund: boolean = true;
  private minimumOrderAmount: number = -1;
  private minimumWithdrawalAmount: number = 3;
  private maximumWithdrawalAmount: number = 5000;

  constructor() {
    this.loadFromDisk();
  }

  // ----- configuration -----------------------------------------------------
  public configure(cfg: { commissionPercent?: number; buyerFeePercent?: number; smallOrderFee?: number; smallOrderThreshold?: number; refundClientFeesOnFullRefund?: boolean; minimumOrderAmount?: number; minimumWithdrawalAmount?: number; maximumWithdrawalAmount?: number }) {
    if (cfg.commissionPercent !== undefined) this.setPlatformCommissionRate(cfg.commissionPercent);
    const next: FeeConfig = {
      commissionPercent: this.platformCommissionRate,
      buyerFeePercent: cfg.buyerFeePercent ?? this.buyerFeePercent,
      smallOrderFee: cfg.smallOrderFee ?? this.smallOrderFee,
      smallOrderThreshold: cfg.smallOrderThreshold ?? this.smallOrderThreshold
    };
    validateFeeConfig(next); // throws before anything is applied
    this.buyerFeePercent = next.buyerFeePercent;
    this.smallOrderFee = next.smallOrderFee;
    this.smallOrderThreshold = next.smallOrderThreshold;
    if (typeof cfg.refundClientFeesOnFullRefund === 'boolean') this.refundClientFeesOnFullRefund = cfg.refundClientFeesOnFullRefund;
    if (typeof cfg.minimumOrderAmount === 'number' && cfg.minimumOrderAmount >= 0) this.minimumOrderAmount = cfg.minimumOrderAmount;
    if (typeof cfg.minimumWithdrawalAmount === 'number' && cfg.minimumWithdrawalAmount >= 0) this.minimumWithdrawalAmount = cfg.minimumWithdrawalAmount;
    if (typeof cfg.maximumWithdrawalAmount === 'number' && cfg.maximumWithdrawalAmount > 0) this.maximumWithdrawalAmount = cfg.maximumWithdrawalAmount;
    this.saveToDisk();
  }

  /** The fee rules the ledger is currently enforcing. */
  public getFeeConfig(): FeeConfig {
    return {
      commissionPercent: this.platformCommissionRate,
      buyerFeePercent: this.buyerFeePercent,
      smallOrderFee: this.smallOrderFee,
      smallOrderThreshold: this.smallOrderThreshold
    };
  }

  /** What a client would be charged / a freelancer would receive for a given gig price, under current rules. */
  public quoteOrder(gigPrice: number) {
    return calculateOrderFees(gigPrice, this.getFeeConfig());
  }

  public setPlatformCommissionRate(rate: number) {
    if (typeof rate === 'number' && Number.isFinite(rate) && rate >= 0 && rate <= 100) {
      this.platformCommissionRate = rate;
      this.saveToDisk();
    }
  }

  public getPlatformCommissionRate(): number {
    return this.platformCommissionRate;
  }

  // ----- money safety ------------------------------------------------------
  public static round(val: number): number {
    return Math.round((val + Number.EPSILON) * 100) / 100;
  }

  // Validates a user-supplied amount: finite number, > 0, max 2 decimals, below a sane ceiling.
  public static assertMoney(v: unknown, label = 'Amount'): number {
    if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${label} must be a valid number.`);
    if (v <= 0) throw new Error(`${label} must be greater than 0.`);
    if (Math.abs(v * 100 - Math.round(v * 100)) > 1e-6) throw new Error(`${label} can have at most 2 decimal places.`);
    if (v > MAX_AMOUNT) throw new Error(`${label} exceeds the maximum allowed (${MAX_AMOUNT}).`);
    return Math.round(v * 100) / 100;
  }

  private static assertReason(reason: unknown, label = 'A reason'): string {
    if (typeof reason !== 'string' || reason.trim().length < 5) throw new Error(`${label} (min 5 characters) is required.`);
    return reason.trim();
  }

  private walletAccount(w: UserWallet, roleContext?: 'buyer' | 'freelancer'): '2010' | '2020' {
    if (roleContext === 'buyer') return '2010';
    if (roleContext === 'freelancer') return '2020';
    return w.userRole === 'buyer' ? '2010' : '2020';
  }

  private requireWallet(userId: string): UserWallet {
    const w = this.wallets.get(userId);
    if (!w) throw new Error(`Wallet not found for user ${userId}`);
    return w;
  }

  private audit(a: { actor: string; role?: string; action: string; target: string; reason: string; journalId?: string }) {
    this.auditLogs.unshift({
      id: `FAUD-${randomUUID().slice(0, 12)}`,
      actor: a.actor,
      role: a.role || 'super_admin',
      action: a.action,
      target: a.target,
      reason: a.reason,
      journalId: a.journalId,
      timestamp: nowStr()
    });
  }

  // Replay protection for caller-supplied request keys (double-clicks, client retries).
  public replay<T>(requestKey: string | undefined): T | undefined {
    if (!requestKey) return undefined;
    return this.opResults.get(requestKey) as T | undefined;
  }
  private remember<T>(requestKey: string | undefined, result: T): T {
    if (requestKey) this.opResults.set(requestKey, result);
    return result;
  }



  // ----- core posting ------------------------------------------------------
  // Posts a balanced journal and applies the resulting wallet-balance effects atomically.
  // Wallet availableBalance is ONLY ever changed here, so the ledger is the single source of truth.
  // A repeated idempotencyKey returns the original journal and applies nothing.
  public postJournal(params: {
    reference: string;
    description: string;
    eventType: LedgerJournal['eventType'];
    idempotencyKey: string;
    actor: string;
    entries: Array<{ accountCode: string; accountName?: string; debit: number; credit: number; currency: string; description: string; userId?: string; orderId?: string; payoutId?: string }>;
    timestamp?: string;
    notes?: string;
  }): LedgerJournal {
    if (!params.idempotencyKey) throw new Error('An idempotency key is required for every journal.');
    if (this.idempotencyKeys.has(params.idempotencyKey)) {
      const existing = this.journals.find(j => j.idempotencyKey === params.idempotencyKey);
      if (existing) return existing;
      throw new Error(`Duplicate financial operation detected with key "${params.idempotencyKey}"`);
    }
    if (!params.entries || params.entries.length < 2) {
      throw new Error('A double-entry journal requires at least two line items (debits and credits).');
    }

    let totalDebit = 0;
    let totalCredit = 0;
    const currencies = new Set<string>();
    for (const e of params.entries) {
      if (!Number.isFinite(e.debit) || !Number.isFinite(e.credit)) throw new Error('Debits and credits must be finite numbers.');
      if (e.debit < 0 || e.credit < 0) throw new Error('Debits and credits must be non-negative values.');
      if (e.debit > 0 && e.credit > 0) throw new Error('An individual ledger entry cannot have both a debit and credit simultaneously.');
      if (!CHART_OF_ACCOUNTS.some(c => c.code === e.accountCode)) throw new Error(`Unknown account code ${e.accountCode}`);
      currencies.add(e.currency);
      totalDebit = FinanceLedgerEngine.round(totalDebit + e.debit);
      totalCredit = FinanceLedgerEngine.round(totalCredit + e.credit);
    }
    if (currencies.size > 1) {
      throw new Error('Cannot balance journal across mixed currencies. Multi-currency transactions must be posted with currency isolation.');
    }
    const difference = FinanceLedgerEngine.round(Math.abs(totalDebit - totalCredit));
    if (difference !== 0) {
      throw new Error(`Journal is out of balance! Total Debits ($${totalDebit.toFixed(2)}) must equal Total Credits ($${totalCredit.toFixed(2)}). Discrepancy: $${difference.toFixed(2)}`);
    }

    // Pre-compute wallet effects and reject anything that would overdraw a wallet (before anything is committed).
    const deltas = new Map<string, number>();
    for (const e of params.entries) {
      if (e.userId && (e.accountCode === '2010' || e.accountCode === '2020')) {
        deltas.set(e.userId, FinanceLedgerEngine.round((deltas.get(e.userId) || 0) + e.credit - e.debit));
      }
    }
    for (const [uid, delta] of deltas) {
      let w = this.wallets.get(uid);
      if (!w) {
        throw new Error(`Wallet not found for user ${uid}`);
      }
      if (FinanceLedgerEngine.round(w.availableBalance + delta) < 0) {
        throw new Error(`Insufficient available balance for ${w.userName}: this posting would overdraw the wallet ($${w.availableBalance.toFixed(2)} available).`);
      }
    }

    const journalId = `JRN-${randomUUID()}`;
    const nowIso = params.timestamp || nowStr();
    const ledgerEntries: LedgerEntry[] = params.entries.map((e, idx) => {
      const coa = CHART_OF_ACCOUNTS.find(c => c.code === e.accountCode);
      return {
        id: `ENT-${journalId.replace('JRN-', '')}-${idx + 1}`,
        journalId,
        accountCode: e.accountCode,
        accountName: e.accountName || coa?.name || 'General Ledger Account',
        debit: FinanceLedgerEngine.round(e.debit),
        credit: FinanceLedgerEngine.round(e.credit),
        currency: e.currency,
        description: e.description,
        userId: e.userId,
        orderId: e.orderId,
        payoutId: e.payoutId
      };
    });

    const journal: LedgerJournal = {
      id: journalId,
      reference: params.reference,
      postingDate: nowIso.split(' ')[0],
      timestamp: nowIso,
      description: params.description,
      eventType: params.eventType,
      idempotencyKey: params.idempotencyKey,
      entries: ledgerEntries,
      totalDebit,
      totalCredit,
      status: 'posted',
      actor: params.actor,
      notes: params.notes
    };

    // ---- commit (no throws below this line) ----
    this.journals.unshift(journal);
    this.idempotencyKeys.add(params.idempotencyKey);
    for (const [uid, delta] of deltas) {
      const w = this.wallets.get(uid)!;
      w.availableBalance = FinanceLedgerEngine.round(w.availableBalance + delta);
      w.lastActivityAt = nowIso;
    }

    const primaryEntry = ledgerEntries.find(e => e.userId) || ledgerEntries[0];
    const typeMap: Partial<Record<LedgerJournal['eventType'], FinancialTransaction['type']>> = {
      DEPOSIT_SETTLED: 'deposit',
      ORDER_ESCROW_FUNDED: 'escrow_fund',
      ESCROW_RELEASED_TO_FREELANCER: 'escrow_release',
      ESCROW_REFUNDED_TO_BUYER: 'refund',
      ESCROW_REFUNDED_WITH_FEES: 'refund',
      PAYOUT_REQUESTED: 'payout_requested',
      PAYOUT_SETTLED: 'payout_processed',
      PAYOUT_CANCELLED: 'payout_cancelled',
      PAYOUT_FAILED: 'payout_failed',
      ADMIN_ADJUSTMENT_CREDIT: 'adjustment_credit',
      OPENING_BALANCE: 'adjustment_credit',
      ADMIN_ADJUSTMENT_DEBIT: 'adjustment_debit'
    };
    const affectedUser = primaryEntry?.userId ? this.wallets.get(primaryEntry.userId) : undefined;
    this.transactions.unshift({
      id: `TXN-${journalId.replace('JRN-', '')}`,
      type: typeMap[params.eventType] || 'adjustment_debit',
      amount: totalDebit,
      currency: Array.from(currencies)[0] || DEFAULT_CURRENCY,
      timestamp: nowIso,
      status: 'completed',
      userId: affectedUser?.userId || 'system',
      userName: affectedUser?.userName || 'Platform System',
      userRole: affectedUser?.userRole || 'admin',
      relatedOrderId: primaryEntry?.orderId,
      relatedPayoutId: primaryEntry?.payoutId,
      journalId,
      description: params.description
    });

    this.saveToDisk();
    return journal;
  }

  // Reversal is limited to events that have no side state (deposits, adjustments).
  // Escrow and payout events must be unwound through their own refund / cancel flows.
  public reverseJournal(journalId: string, reason: string, actor: string): LedgerJournal {
    const why = FinanceLedgerEngine.assertReason(reason, 'A reversal reason');
    const original = this.journals.find(j => j.id === journalId);
    if (!original) throw new Error(`Journal ${journalId} not found`);
    if (original.status === 'reversed') throw new Error(`Journal ${journalId} has already been reversed by ${original.reversedByJournalId}`);
    if (original.eventType === 'REVERSAL') throw new Error('A reversal journal cannot itself be reversed; post a new correcting entry instead.');
    const reversible: LedgerJournal['eventType'][] = ['DEPOSIT_SETTLED', 'ADMIN_ADJUSTMENT_CREDIT', 'ADMIN_ADJUSTMENT_DEBIT'];
    if (!reversible.includes(original.eventType)) {
      throw new Error(`Journals of type ${original.eventType} cannot be reversed directly. Use the escrow refund or payout cancel workflow.`);
    }

    const reversalJournal = this.postJournal({
      reference: `REV-${original.id}`,
      description: `Reversal of Journal #${original.id}: ${why}`,
      eventType: 'REVERSAL',
      idempotencyKey: `IDEMP-REV-${original.id}`,
      actor,
      entries: original.entries.map(e => ({
        accountCode: e.accountCode,
        accountName: e.accountName,
        debit: e.credit,
        credit: e.debit,
        currency: e.currency,
        description: `Reversal of [${e.description}]: ${why}`,
        userId: e.userId,
        orderId: e.orderId,
        payoutId: e.payoutId
      })),
      notes: why
    });

    original.status = 'reversed';
    original.reversedByJournalId = reversalJournal.id;
    reversalJournal.reversalOfJournalId = original.id;
    this.audit({ actor, action: 'JOURNAL_REVERSED', target: `Journal #${original.id}`, reason: why, journalId: reversalJournal.id });
    return reversalJournal;
  }

  // ----- balances & wallets -------------------------------------------------
  public calculateLedgerDerivedBalance(userId: string): number {
    let balance = 0;
    for (const journal of this.journals) {
      for (const entry of journal.entries) {
        if (entry.userId === userId && (entry.accountCode === '2010' || entry.accountCode === '2020')) {
          balance = FinanceLedgerEngine.round(balance + entry.credit - entry.debit);
        }
      }
    }
    return balance;
  }

  public getWallets() {
    return Array.from(this.wallets.values()).map(w => {
      const ledgerDerived = this.calculateLedgerDerivedBalance(w.userId);
      const difference = FinanceLedgerEngine.round(Math.abs(w.availableBalance - ledgerDerived));
      return { ...w, ledgerDerivedBalance: ledgerDerived, isReconciled: difference === 0, discrepancy: difference };
    });
  }

  public getWalletBalance(userId: string): number | null {
    return this.wallets.get(userId)?.availableBalance ?? null;
  }

  // Opens a zero-balance wallet for a newly registered user or updates wallet role if user transitions to freelancer.
  public ensureWallet(params: { userId: string; name: string; email: string; role: 'buyer' | 'freelancer' }): void {
    const existing = this.wallets.get(params.userId);
    if (existing) {
      if (existing.userRole !== params.role || existing.userName !== params.name || existing.userEmail !== params.email) {
        existing.userRole = params.role;
        existing.userName = params.name;
        existing.userEmail = params.email;
        this.saveToDisk();
      }
      return;
    }
    const now = nowStr();
    this.wallets.set(params.userId, {
      id: `WAL-${params.userId.toUpperCase()}`,
      userId: params.userId,
      userName: params.name,
      userEmail: params.email,
      userRole: params.role,
      currency: DEFAULT_CURRENCY,
      availableBalance: 0,
      pendingIncoming: 0,
      fundsOnHold: 0,
      pendingWithdrawals: 0,
      status: 'active',
      lastActivityAt: now,
      createdAt: now
    });
    this.saveToDisk();
  }

  public hasWallet(userId: string): boolean {
    return this.wallets.has(userId);
  }

  public getWalletById(userId: string) {
    const wallet = this.wallets.get(userId);
    if (!wallet) return null;
    const ledgerDerived = this.calculateLedgerDerivedBalance(userId);
    const userTransactions = this.transactions.filter(t => t.userId === userId);
    const userEntries = this.journals.flatMap(j => j.entries.filter(e => e.userId === userId).map(e => ({ ...e, journalDate: j.postingDate, journalRef: j.reference })));
    const userAudits = this.auditLogs.filter(a => a.target.includes(wallet.id) || a.target.includes(userId));
    return {
      wallet: {
        ...wallet,
        ledgerDerivedBalance: ledgerDerived,
        isReconciled: FinanceLedgerEngine.round(Math.abs(wallet.availableBalance - ledgerDerived)) === 0,
        discrepancy: FinanceLedgerEngine.round(Math.abs(wallet.availableBalance - ledgerDerived))
      },
      transactions: userTransactions,
      ledgerEntries: userEntries,
      auditLogs: userAudits
    };
  }

  // True if the user has any money or open obligation tied to the platform (used to block account deletion)
  public hasOutstandingFunds(userId: string): boolean {
    const w = this.wallets.get(userId);
    if (!w) return false;
    if (w.availableBalance > 0 || w.fundsOnHold > 0 || w.pendingWithdrawals > 0) return true;
    for (const e of this.escrows.values()) {
      if (e.status === 'held' && (e.buyerId === userId || e.sellerId === userId)) return true;
    }
    return false;
  }

  public freezeWallet(userId: string, reason: string, actor: string) {
    const why = FinanceLedgerEngine.assertReason(reason, 'A reason');
    const wallet = this.requireWallet(userId);
    wallet.status = 'frozen';
    wallet.restrictionReason = why;
    this.audit({ actor, action: 'WALLET_FROZEN', target: `Wallet #${wallet.id} (${wallet.userName})`, reason: why });
    this.saveToDisk();
    return wallet;
  }

  public unfreezeWallet(userId: string, reason: string, actor: string) {
    const wallet = this.requireWallet(userId);
    wallet.status = 'active';
    wallet.restrictionReason = undefined;
    this.audit({ actor, action: 'WALLET_UNFROZEN', target: `Wallet #${wallet.id} (${wallet.userName})`, reason: reason || 'Administrative review completed' });
    this.saveToDisk();
    return wallet;
  }

  public restrictWallet(userId: string, reason: string, actor: string) {
    const why = FinanceLedgerEngine.assertReason(reason, 'A reason');
    const wallet = this.requireWallet(userId);
    wallet.status = 'restricted';
    wallet.restrictionReason = why;
    this.audit({ actor, action: 'WALLET_WITHDRAWALS_RESTRICTED', target: `Wallet #${wallet.id} (${wallet.userName})`, reason: why });
    this.saveToDisk();
    return wallet;
  }

  private ensureOperational() {
    // Authoritative persistence is managed in PostgreSQL
  }

  // ----- deposits ----------------------------------------------------------
  // Single entry point for money coming in. A payment-gateway webhook should call this with the
  // gateway's event/payment id as idempotencyKey; replays are harmless.
  public creditDeposit(params: { userId: string; amount: number; reference: string; idempotencyKey: string; actor: string; source?: string; roleContext?: 'buyer' | 'freelancer' }) {
    this.ensureOperational();
    const amount = FinanceLedgerEngine.assertMoney(params.amount, 'Deposit amount');
    const wallet = this.requireWallet(params.userId);
    if (wallet.userRole === 'admin') throw new Error('Deposits to admin wallets are not allowed.');
    if (wallet.status === 'frozen') throw new Error('This wallet is frozen; deposits are blocked.');
    const key = `DEP-${params.idempotencyKey}`;
    const replayed = this.idempotencyKeys.has(key);
    const journal = this.postJournal({
      reference: params.reference,
      description: `Deposit (${params.source || 'gateway'}) - ${wallet.userName}`,
      eventType: 'DEPOSIT_SETTLED',
      idempotencyKey: key,
      actor: params.actor,
      entries: [
        { accountCode: '1020', debit: amount, credit: 0, currency: DEFAULT_CURRENCY, description: 'Payment processor clearing - deposit received', userId: wallet.userId },
        { accountCode: this.walletAccount(wallet, params.roleContext || 'buyer'), debit: 0, credit: amount, currency: DEFAULT_CURRENCY, description: `Credited ${wallet.userName} available wallet`, userId: wallet.userId }
      ]
    });
    if (!replayed) this.audit({ actor: params.actor, role: 'system', action: 'DEPOSIT_CONFIRMED', target: `Wallet #${wallet.id}`, reason: `${params.source || 'gateway'} ref ${params.reference}`, journalId: journal.id });
    return { journal, replayed };
  }

  // ----- escrow ------------------------------------------------------------
  public getEscrow(orderId: string): EscrowRecord | undefined {
    return this.escrows.get(orderId);
  }
  public getEscrows(): EscrowRecord[] {
    return Array.from(this.escrows.values());
  }

  // Locks buyer wallet funds in escrow for an order. Fails if the buyer cannot afford it.
  public fundEscrow(params: { orderId: string; orderTitle: string; amount: number; buyerId: string; sellerId: string; actor: string; timestamp?: string; skipMinimum?: boolean }) {
    this.ensureOperational();
    if (!params.orderId) throw new Error('orderId is required.');
    if (params.buyerId === params.sellerId) throw new Error('Buyers cannot purchase services from themselves.');
    if (this.escrows.has(params.orderId)) throw new Error(`Order ${params.orderId} is already funded.`);
    const amount = FinanceLedgerEngine.assertMoney(params.amount, 'Order amount');
    const minOrder = this.minimumOrderAmount >= 0 ? this.minimumOrderAmount : 5;
    if (!params.skipMinimum && amount < minOrder) throw new Error(`Minimum order amount is $${minOrder.toFixed(2)}.`);
    const buyer = this.requireWallet(params.buyerId);
    const seller = this.requireWallet(params.sellerId);
    if (buyer.userRole === 'admin' || seller.userRole === 'admin') throw new Error('Admin wallets cannot take part in orders.');
    if (buyer.status === 'frozen') throw new Error('Buyer wallet is frozen.');
    if (seller.status === 'frozen') throw new Error('Seller wallet is frozen.');
    // `amount` is the gig price. The client pays gig price + service fee + small-order fee;
    // only the gig price is held in escrow, the two client fees are recognised as platform revenue immediately.
    const fees = calculateOrderFees(amount, this.getFeeConfig());
    if (buyer.availableBalance < fees.clientTotal) {
      throw new Error(`Insufficient wallet balance. Available $${buyer.availableBalance.toFixed(2)}, required $${fees.clientTotal.toFixed(2)} (order $${fees.gigPrice.toFixed(2)} + fees $${(fees.serviceFee + fees.smallOrderFee).toFixed(2)}). Please add funds.`);
    }

    const fundEntries: Array<{ accountCode: string; debit: number; credit: number; currency: string; description: string; userId?: string; orderId?: string }> = [
      { accountCode: this.walletAccount(buyer, 'buyer'), debit: fees.clientTotal, credit: 0, currency: DEFAULT_CURRENCY, description: 'Debited buyer wallet for order price and client fees', userId: buyer.userId, orderId: params.orderId },
      { accountCode: '2030', debit: 0, credit: fees.gigPrice, currency: DEFAULT_CURRENCY, description: 'Locked in escrow protection vault', orderId: params.orderId }
    ];
    if (fees.serviceFee > 0) {
      fundEntries.push({ accountCode: '4020', debit: 0, credit: fees.serviceFee, currency: DEFAULT_CURRENCY, description: `${this.buyerFeePercent}% client service fee on Order #${params.orderId}`, orderId: params.orderId });
    }
    if (fees.smallOrderFee > 0) {
      fundEntries.push({ accountCode: '4030', debit: 0, credit: fees.smallOrderFee, currency: DEFAULT_CURRENCY, description: `Small-order fee ($${fees.smallOrderFee.toFixed(2)}, order under $${this.smallOrderThreshold}) on Order #${params.orderId}`, orderId: params.orderId });
    }

    const journal = this.postJournal({
      reference: `ORD-${params.orderId}-ESCROW-LOCK`,
      description: `Escrow funding for Order #${params.orderId} (${params.orderTitle})`,
      eventType: 'ORDER_ESCROW_FUNDED',
      idempotencyKey: `IDEMP-ORD-FUND-${params.orderId}`,
      actor: params.actor,
      timestamp: params.timestamp,
      entries: fundEntries
    });
    buyer.fundsOnHold = FinanceLedgerEngine.round(buyer.fundsOnHold + amount);
    this.escrows.set(params.orderId, {
      orderId: params.orderId,
      orderTitle: params.orderTitle,
      buyerId: buyer.userId,
      sellerId: seller.userId,
      amount,
      remaining: amount,
      refundedTotal: 0,
      releasedGross: 0,
      refundSeq: 0,
      releaseSeq: 0,
      status: 'held',
      fundedAt: params.timestamp || nowStr(),
      commissionPercent: this.platformCommissionRate,
      serviceFee: fees.serviceFee,
      smallOrderFee: fees.smallOrderFee,
      feesRefunded: false
    });
    this.audit({ actor: params.actor, role: 'system', action: 'ESCROW_FUNDS_LOCKED', target: `Order #${params.orderId}`, reason: `Locked $${amount.toFixed(2)} in escrow; client charged $${fees.clientTotal.toFixed(2)} total (service fee $${fees.serviceFee.toFixed(2)}, small-order fee $${fees.smallOrderFee.toFixed(2)})`, journalId: journal.id });
    return { journal, escrow: this.escrows.get(params.orderId)!, fees };
  }

  // Tops up an already funded escrow for an order with additional funds under the same orderId (including follow-on proposals after prior release).
  public topUpEscrow(params: { orderId: string; orderTitle: string; amount: number; buyerId: string; sellerId: string; actor: string; timestamp?: string; skipMinimum?: boolean }) {
    this.ensureOperational();
    if (!params.orderId) throw new Error('orderId is required.');
    const esc = this.escrows.get(params.orderId);
    if (!esc) {
      return this.fundEscrow(params);
    }
    if (!['held', 'released', 'split'].includes(esc.status)) throw new Error(`Escrow for order ${params.orderId} cannot be topped up from status "${esc.status}".`);
    const amount = FinanceLedgerEngine.assertMoney(params.amount, 'Top-up amount');
    const buyer = this.requireWallet(params.buyerId);
    const seller = this.requireWallet(params.sellerId);
    if (buyer.status === 'frozen') throw new Error('Buyer wallet is frozen.');
    if (seller.status === 'frozen') throw new Error('Seller wallet is frozen.');

    const fees = calculateOrderFees(amount, this.getFeeConfig());
    if (buyer.availableBalance < fees.clientTotal) {
      throw new Error(`Insufficient wallet balance. Available $${buyer.availableBalance.toFixed(2)}, required $${fees.clientTotal.toFixed(2)} (top-up $${fees.gigPrice.toFixed(2)} + fees $${(fees.serviceFee + fees.smallOrderFee).toFixed(2)}). Please add funds.`);
    }

    const fundEntries: Array<{ accountCode: string; debit: number; credit: number; currency: string; description: string; userId?: string; orderId?: string }> = [
      { accountCode: this.walletAccount(buyer, 'buyer'), debit: fees.clientTotal, credit: 0, currency: DEFAULT_CURRENCY, description: 'Debited buyer wallet for escrow top-up price and client fees', userId: buyer.userId, orderId: params.orderId },
      { accountCode: '2030', debit: 0, credit: fees.gigPrice, currency: DEFAULT_CURRENCY, description: 'Added to escrow protection vault', orderId: params.orderId }
    ];
    if (fees.serviceFee > 0) {
      fundEntries.push({ accountCode: '4020', debit: 0, credit: fees.serviceFee, currency: DEFAULT_CURRENCY, description: `${this.buyerFeePercent}% client service fee on escrow top-up for Order #${params.orderId}`, orderId: params.orderId });
    }
    if (fees.smallOrderFee > 0) {
      fundEntries.push({ accountCode: '4030', debit: 0, credit: fees.smallOrderFee, currency: DEFAULT_CURRENCY, description: `Small-order fee on escrow top-up for Order #${params.orderId}`, orderId: params.orderId });
    }

    const journal = this.postJournal({
      reference: `ORD-${params.orderId}-ESCROW-TOPUP-${esc.amount}-${amount}`,
      description: `Escrow top-up for Order #${params.orderId} (${params.orderTitle})`,
      eventType: 'ORDER_ESCROW_TOPUP',
      idempotencyKey: (params as any).idempotencyKey || `IDEMP-ORD-TOPUP-${params.orderId}-${esc.amount}-${amount}`,
      actor: params.actor,
      timestamp: params.timestamp,
      entries: fundEntries
    });
    buyer.fundsOnHold = FinanceLedgerEngine.round(buyer.fundsOnHold + amount);
    esc.amount = FinanceLedgerEngine.round(esc.amount + amount);
    esc.remaining = FinanceLedgerEngine.round(esc.remaining + amount);
    esc.status = 'held';
    esc.serviceFee = FinanceLedgerEngine.round(esc.serviceFee + fees.serviceFee);
    esc.smallOrderFee = FinanceLedgerEngine.round(esc.smallOrderFee + fees.smallOrderFee);

    this.audit({ actor: params.actor, role: 'system', action: 'ESCROW_FUNDS_TOPPED_UP', target: `Order #${params.orderId}`, reason: `Added $${amount.toFixed(2)} to escrow; client charged $${fees.clientTotal.toFixed(2)} total`, journalId: journal.id });
    return { journal, escrow: esc, fees };
  }

  private acquireEscrowLock(orderId: string): void {
    if (this.escrowLocks.has(orderId)) {
      throw new Error(`Escrow operation already in progress for order ${orderId}.`);
    }
    this.escrowLocks.add(orderId);
  }

  private releaseEscrowLock(orderId: string): void {
    this.escrowLocks.delete(orderId);
  }

  // Authoritative PostgreSQL transactional escrow release, refund, and split operations
  public async releaseEscrowTransactional(params: { orderId: string; actor: string; reason?: string; requestKey?: string; allowDisputeResolution?: boolean }, externalClient?: any) {
    const run = async (client: any) => {
      const ordRes = await client.query('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [params.orderId]);
      if (ordRes.rows.length > 0) {
        const ordStatus = ordRes.rows[0].status;
        if (ordStatus === 'completed' || ordStatus === 'cancelled') {
          throw new Error(`Cannot release escrow: Order is already ${ordStatus}.`);
        }
      }
      const escRes = await client.query('SELECT * FROM escrows WHERE order_id = $1 FOR UPDATE', [params.orderId]);
      if (escRes.rows.length === 0) {
        throw new Error(`No funded escrow exists for order ${params.orderId}.`);
      }
      const escRow = escRes.rows[0];
      if ((escRow.status !== 'held' && escRow.status !== 'split') || Number(escRow.remaining) <= 0) {
        throw new Error(`Escrow for order ${params.orderId} is already ${escRow.status}; nothing left to release.`);
      }
      return financialTransactionService.releaseOrderFunds({
        orderId: params.orderId,
        actor: params.actor,
        reason: params.reason,
        idempotencyKey: params.requestKey,
        allowDisputeResolution: params.allowDisputeResolution
      }, client);
    };
    if (externalClient) return run(externalClient);
    return postgresStore.executeInTransaction(run);
  }

  public async refundEscrowTransactional(params: { orderId: string; amount?: number; reason: string; actor: string; requestKey?: string }, externalClient?: any) {
    const run = async (client: any) => {
      const ordRes = await client.query('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [params.orderId]);
      if (ordRes.rows.length > 0) {
        const ordStatus = ordRes.rows[0].status;
        if (ordStatus === 'completed' || ordStatus === 'cancelled') {
          throw new Error(`Cannot refund escrow: Order is already ${ordStatus}.`);
        }
      }
      const escRes = await client.query('SELECT * FROM escrows WHERE order_id = $1 FOR UPDATE', [params.orderId]);
      if (escRes.rows.length === 0) {
        throw new Error(`No funded escrow exists for order ${params.orderId}.`);
      }
      const escRow = escRes.rows[0];
      if ((escRow.status !== 'held' && escRow.status !== 'split') || Number(escRow.remaining) <= 0) {
        throw new Error(`Escrow for order ${params.orderId} is already ${escRow.status}; nothing left to refund.`);
      }
      return financialTransactionService.refundOrderFunds({
        orderId: params.orderId,
        amount: params.amount,
        reason: params.reason,
        actor: params.actor,
        idempotencyKey: params.requestKey
      }, client);
    };
    if (externalClient) return run(externalClient);
    return postgresStore.executeInTransaction(run);
  }

  public async resolveEscrowSplitTransactional(params: { orderId: string; refundAmount: number; reason: string; actor: string; requestKey?: string }, externalClient?: any) {
    return financialTransactionService.resolveEscrowSplit({
      orderId: params.orderId,
      refundAmount: params.refundAmount,
      reason: params.reason,
      actor: params.actor,
      idempotencyKey: params.requestKey
    }, externalClient);
  }

  // Releases everything still held for the order: net to seller, commission to the platform.
  // Can only succeed once per order; repeat calls throw and change nothing.
  public releaseEscrow(params: { orderId: string; actor: string; reason?: string; requestKey?: string }): { journal: LedgerJournal; freelancerNet: number; platformFee: number } {
    this.ensureOperational();
    const cached = this.replay<{ journal: LedgerJournal; freelancerNet: number; platformFee: number }>(params.requestKey);
    if (cached) return cached;

    this.acquireEscrowLock(params.orderId);
    try {
      const rechecked = this.replay<{ journal: LedgerJournal; freelancerNet: number; platformFee: number }>(params.requestKey);
      if (rechecked) return rechecked;

      const esc = this.escrows.get(params.orderId);
      if (!esc) throw new Error(`No funded escrow exists for order ${params.orderId}.`);
      if ((esc.status !== 'held' && esc.status !== 'split') || esc.remaining <= 0) {
        throw new Error(`Escrow for order ${params.orderId} is already ${esc.status}; nothing left to release.`);
      }
      const seller = this.requireWallet(esc.sellerId);
      if (seller.status === 'frozen') throw new Error('Seller wallet is frozen; release blocked until it is unfrozen.');
      const buyer = this.wallets.get(esc.buyerId);

      const prevRemaining = esc.remaining;
      const prevReleasedGross = esc.releasedGross;
      const prevReleaseSeq = esc.releaseSeq || 0;
      const prevStatus = esc.status;
      const prevBuyerHold = buyer ? buyer.fundsOnHold : 0;

      const grossCents = Math.round(prevRemaining * 100);
      const commissionRate = esc.commissionPercent ?? this.platformCommissionRate; // rate locked in at funding
      const feeCents = percentOfCents(grossCents, commissionRate);
      const gross = grossCents / 100;
      const platformFee = feeCents / 100;
      const freelancerNet = (grossCents - feeCents) / 100;

      const nextReleaseSeq = prevReleaseSeq + 1;
      const relIdempKey = nextReleaseSeq === 1 ? `IDEMP-REL-${params.orderId}` : `IDEMP-REL-${params.orderId}-${nextReleaseSeq}`;
      const relRef = nextReleaseSeq === 1 ? `ORD-${params.orderId}-RELEASE` : `ORD-${params.orderId}-RELEASE-${nextReleaseSeq}`;

      // Atomically consume eligible escrow balance before posting journal entries
      esc.remaining = 0;
      esc.releasedGross = FinanceLedgerEngine.round(prevReleasedGross + gross);
      esc.releaseSeq = nextReleaseSeq;
      esc.status = esc.refundedTotal > 0 ? 'split' : 'released';
      if (buyer) buyer.fundsOnHold = FinanceLedgerEngine.round(Math.max(0, prevBuyerHold - gross));

      const entries: Array<{ accountCode: string; debit: number; credit: number; currency: string; description: string; userId?: string; orderId?: string }> = [
        { accountCode: '2030', debit: gross, credit: 0, currency: DEFAULT_CURRENCY, description: `Released funds held in escrow for Order #${params.orderId}`, orderId: params.orderId },
        { accountCode: this.walletAccount(seller, 'freelancer'), debit: 0, credit: freelancerNet, currency: DEFAULT_CURRENCY, description: `Credited net earnings to ${seller.userName} (after ${commissionRate}% commission)`, userId: seller.userId, orderId: params.orderId }
      ];
      if (platformFee > 0) {
        entries.push({ accountCode: '4010', debit: 0, credit: platformFee, currency: DEFAULT_CURRENCY, description: `${commissionRate}% platform commission on Order #${params.orderId}`, orderId: params.orderId });
      }

      let journal: LedgerJournal;
      try {
        journal = this.postJournal({
          reference: relRef,
          description: `Escrow release for Order #${params.orderId} (${esc.orderTitle})`,
          eventType: 'ESCROW_RELEASED_TO_FREELANCER',
          idempotencyKey: relIdempKey,
          actor: params.actor,
          entries
        });
      } catch (err) {
        esc.remaining = prevRemaining;
        esc.releasedGross = prevReleasedGross;
        esc.releaseSeq = prevReleaseSeq;
        esc.status = prevStatus;
        if (buyer) buyer.fundsOnHold = prevBuyerHold;
        throw err;
      }

      this.audit({ actor: params.actor, action: 'ESCROW_RELEASED', target: `Order #${params.orderId}`, reason: params.reason || `Released $${freelancerNet.toFixed(2)} net to freelancer, $${platformFee.toFixed(2)} platform commission`, journalId: journal.id });
      return this.remember(params.requestKey, { journal, freelancerNet, platformFee });
    } finally {
      this.releaseEscrowLock(params.orderId);
    }
  }

  // Refunds all (default) or part of what is still held back to the buyer wallet.
  public refundEscrow(params: { orderId: string; amount?: number; reason: string; actor: string; requestKey?: string }): { journal: LedgerJournal; buyerWallet: UserWallet; refunded: number; feesRefunded: number; remaining: number } {
    this.ensureOperational();
    const cached = this.replay<{ journal: LedgerJournal; buyerWallet: UserWallet; refunded: number; feesRefunded: number; remaining: number }>(params.requestKey);
    if (cached) return cached;

    this.acquireEscrowLock(params.orderId);
    try {
      const rechecked = this.replay<{ journal: LedgerJournal; buyerWallet: UserWallet; refunded: number; feesRefunded: number; remaining: number }>(params.requestKey);
      if (rechecked) return rechecked;

      const why = FinanceLedgerEngine.assertReason(params.reason, 'A refund reason');
      const esc = this.escrows.get(params.orderId);
      if (!esc) throw new Error(`No funded escrow exists for order ${params.orderId}.`);
      if ((esc.status !== 'held' && esc.status !== 'split') || esc.remaining <= 0) {
        throw new Error(`Escrow for order ${params.orderId} is already ${esc.status}; nothing left to refund.`);
      }
      const amount = params.amount === undefined ? esc.remaining : FinanceLedgerEngine.assertMoney(params.amount, 'Refund amount');
      if (amount > esc.remaining) throw new Error(`Refund ($${amount.toFixed(2)}) exceeds the escrow still held ($${esc.remaining.toFixed(2)}).`);
      const buyer = this.requireWallet(esc.buyerId);
      if (buyer.status === 'frozen') throw new Error('Buyer wallet is frozen; refund blocked until it is unfrozen.');

      const prevRemaining = esc.remaining;
      const prevRefundedTotal = esc.refundedTotal;
      const prevRefundSeq = esc.refundSeq;
      const prevStatus = esc.status;
      const prevFeesRefunded = esc.feesRefunded;
      const prevBuyerHold = buyer.fundsOnHold;

      // When the refunds add up to the whole order (nothing was released), the client fees are returned too.
      // Partial refunds and dispute splits keep the fees, because the order is still partly delivered.
      const completesFullRefund = FinanceLedgerEngine.round(prevRefundedTotal + amount) === esc.amount && esc.releasedGross === 0;
      const refundFees = this.refundClientFeesOnFullRefund && completesFullRefund && !prevFeesRefunded;
      const serviceFeeBack = refundFees ? esc.serviceFee : 0;
      const smallFeeBack = refundFees ? esc.smallOrderFee : 0;
      const feesBack = FinanceLedgerEngine.round(serviceFeeBack + smallFeeBack);

      const nextSeq = prevRefundSeq + 1;
      const newRemaining = FinanceLedgerEngine.round(prevRemaining - amount);

      // Atomically consume refunded escrow balance before posting journal entries
      if (feesBack > 0) esc.feesRefunded = true;
      buyer.fundsOnHold = FinanceLedgerEngine.round(Math.max(0, prevBuyerHold - amount));
      esc.remaining = newRemaining;
      esc.refundedTotal = FinanceLedgerEngine.round(prevRefundedTotal + amount);
      esc.refundSeq = nextSeq;
      if (newRemaining === 0) {
        esc.status = esc.releasedGross > 0 ? 'split' : 'refunded';
      }

      const refundEntries: Array<{ accountCode: string; debit: number; credit: number; currency: string; description: string; userId?: string; orderId?: string }> = [
        { accountCode: '2030', debit: amount, credit: 0, currency: DEFAULT_CURRENCY, description: `Debited escrow liability for refunded Order #${params.orderId}`, orderId: params.orderId }
      ];
      if (serviceFeeBack > 0) refundEntries.push({ accountCode: '4020', debit: serviceFeeBack, credit: 0, currency: DEFAULT_CURRENCY, description: `Reversed client service fee on fully refunded Order #${params.orderId}`, orderId: params.orderId });
      if (smallFeeBack > 0) refundEntries.push({ accountCode: '4030', debit: smallFeeBack, credit: 0, currency: DEFAULT_CURRENCY, description: `Reversed small-order fee on fully refunded Order #${params.orderId}`, orderId: params.orderId });
      refundEntries.push({ accountCode: this.walletAccount(buyer, 'buyer'), debit: 0, credit: FinanceLedgerEngine.round(amount + feesBack), currency: DEFAULT_CURRENCY, description: `Restored available wallet balance for ${buyer.userName}${feesBack > 0 ? ' (including client fees)' : ''}`, userId: buyer.userId, orderId: params.orderId });

      let journal: LedgerJournal;
      try {
        journal = this.postJournal({
          reference: `ORD-${params.orderId}-REFUND-${nextSeq}`,
          description: `Escrow refund to Buyer for Order #${params.orderId} (${esc.orderTitle}): ${why}`,
          eventType: feesBack > 0 ? 'ESCROW_REFUNDED_WITH_FEES' : 'ESCROW_REFUNDED_TO_BUYER',
          idempotencyKey: `IDEMP-REF-${params.orderId}-${nextSeq}`,
          actor: params.actor,
          entries: refundEntries
        });
      } catch (err) {
        esc.feesRefunded = prevFeesRefunded;
        buyer.fundsOnHold = prevBuyerHold;
        esc.remaining = prevRemaining;
        esc.refundedTotal = prevRefundedTotal;
        esc.refundSeq = prevRefundSeq;
        esc.status = prevStatus;
        throw err;
      }

      this.audit({ actor: params.actor, action: 'ESCROW_REFUNDED', target: `Order #${params.orderId}`, reason: why, journalId: journal.id });
      return this.remember(params.requestKey, { journal, buyerWallet: buyer, refunded: amount, feesRefunded: feesBack, remaining: esc.remaining });
    } finally {
      this.releaseEscrowLock(params.orderId);
    }
  }

  // Dispute split: refund `refundAmount` to the buyer and release the rest to the seller.
  public resolveEscrowSplit(params: { orderId: string; refundAmount: number; reason: string; actor: string }) {
    const why = FinanceLedgerEngine.assertReason(params.reason, 'A resolution reason');
    const esc = this.escrows.get(params.orderId);
    if (!esc) throw new Error(`No funded escrow exists for order ${params.orderId}.`);
    if (esc.status !== 'held' && esc.status !== 'split') throw new Error(`Escrow for order ${params.orderId} is already ${esc.status}.`);
    const refund = FinanceLedgerEngine.assertMoney(params.refundAmount, 'Refund amount');
    if (refund >= esc.remaining) throw new Error('For a split, the refund must be less than the escrow held. Use a full refund instead.');
    if (this.requireWallet(esc.buyerId).status === 'frozen') throw new Error('Buyer wallet is frozen.');
    if (this.requireWallet(esc.sellerId).status === 'frozen') throw new Error('Seller wallet is frozen.');
    const refundResult = this.refundEscrow({ orderId: params.orderId, amount: refund, reason: why, actor: params.actor });
    const releaseResult = this.releaseEscrow({ orderId: params.orderId, actor: params.actor, reason: `Remainder released after $${refund.toFixed(2)} refund: ${why}` });
    return { refund: refundResult, release: releaseResult };
  }

  // ----- payouts -----------------------------------------------------------
  public getPayoutRecord(id: string): PayoutRecord | undefined {
    return this.payouts.get(id);
  }

  // Withdrawal request: moves money from the wallet into "pending payout" so it cannot be spent twice.
  public requestPayout(params: { payoutId: string; freelancerId: string; amount: number; method: string; accountDetails: string; actor: string }) {
    if (this.payouts.has(params.payoutId)) throw new Error(`Payout ${params.payoutId} already exists.`);
    const amount = FinanceLedgerEngine.assertMoney(params.amount, 'Withdrawal amount');
    const wallet = this.requireWallet(params.freelancerId);
    if (wallet.userRole === 'admin') throw new Error('Admin wallets cannot withdraw.');
    if (wallet.status !== 'active') throw new Error(`Withdrawals are blocked: wallet is ${wallet.status}.`);
    if (amount < this.minimumWithdrawalAmount) throw new Error(`Minimum withdrawal is $${this.minimumWithdrawalAmount.toFixed(2)}.`);
    if (amount > this.maximumWithdrawalAmount) throw new Error(`Maximum withdrawal per request is $${this.maximumWithdrawalAmount.toFixed(2)}.`);
    if (wallet.availableBalance < amount) throw new Error(`Insufficient available balance ($${wallet.availableBalance.toFixed(2)}).`);
    if (!params.accountDetails || String(params.accountDetails).trim().length < 3) throw new Error('Payout account details are required.');

    const journal = this.postJournal({
      reference: `PAY-${params.payoutId}-REQUESTED`,
      description: `Withdrawal requested #${params.payoutId} via ${params.method}`,
      eventType: 'PAYOUT_REQUESTED',
      idempotencyKey: `IDEMP-PAYREQ-${params.payoutId}-1`,
      actor: params.actor,
      entries: [
        { accountCode: this.walletAccount(wallet, 'freelancer'), debit: amount, credit: 0, currency: DEFAULT_CURRENCY, description: 'Debited wallet for withdrawal request', userId: wallet.userId, payoutId: params.payoutId },
        { accountCode: '2040', debit: 0, credit: amount, currency: DEFAULT_CURRENCY, description: 'Pending payout liability', payoutId: params.payoutId }
      ]
    });
    wallet.pendingWithdrawals = FinanceLedgerEngine.round(wallet.pendingWithdrawals + amount);
    const rec: PayoutRecord = { id: params.payoutId, freelancerId: wallet.userId, amount, method: params.method, accountDetails: String(params.accountDetails), status: 'requested', attempt: 1 };
    this.payouts.set(params.payoutId, rec);
    this.audit({ actor: params.actor, role: 'user', action: 'PAYOUT_REQUESTED', target: `Payout #${params.payoutId}`, reason: `$${amount.toFixed(2)} via ${params.method}`, journalId: journal.id });
    return { journal, payout: rec };
  }

  // Marks the money as sent. Call this after the gateway confirms the transfer.
  public settlePayout(params: { payoutId: string; actor: string; providerReference?: string }) {
    const rec = this.payouts.get(params.payoutId);
    if (!rec) throw new Error(`Payout ${params.payoutId} not found.`);
    if (rec.status !== 'requested') throw new Error(`Cannot settle payout in status "${rec.status}".`);
    const wallet = this.requireWallet(rec.freelancerId);
    if (wallet.status === 'frozen') throw new Error('Wallet is frozen; payout cannot be settled.');
    const journal = this.postJournal({
      reference: params.providerReference || `PAY-${rec.id}-DISBURSED`,
      description: `Disbursed Payout #${rec.id} via ${rec.method} to ${wallet.userName} (${rec.accountDetails})`,
      eventType: 'PAYOUT_SETTLED',
      idempotencyKey: `IDEMP-PAYSETTLE-${rec.id}-${rec.attempt}`,
      actor: params.actor,
      entries: [
        { accountCode: '2040', debit: rec.amount, credit: 0, currency: DEFAULT_CURRENCY, description: 'Cleared pending payout liability', payoutId: rec.id },
        { accountCode: '1030', debit: 0, credit: rec.amount, currency: DEFAULT_CURRENCY, description: `Disbursed through ${rec.method}`, payoutId: rec.id }
      ]
    });
    wallet.pendingWithdrawals = FinanceLedgerEngine.round(Math.max(0, wallet.pendingWithdrawals - rec.amount));
    rec.status = 'settled';
    this.audit({ actor: params.actor, action: 'PAYOUT_SETTLED', target: `Payout #${rec.id}`, reason: `Settled $${rec.amount.toFixed(2)} via ${rec.method}`, journalId: journal.id });
    return { journal, payout: rec };
  }

  private returnPayoutFunds(payoutId: string, reason: string, actor: string, finalStatus: 'cancelled' | 'failed') {
    const why = FinanceLedgerEngine.assertReason(reason, 'A reason');
    const rec = this.payouts.get(payoutId);
    if (!rec) throw new Error(`Payout ${payoutId} not found.`);
    if (rec.status !== 'requested') throw new Error(`Cannot ${finalStatus === 'failed' ? 'fail' : 'cancel'} payout in status "${rec.status}".`);
    const wallet = this.requireWallet(rec.freelancerId);
    const journal = this.postJournal({
      reference: `PAY-${rec.id}-${finalStatus.toUpperCase()}-${rec.attempt}`,
      description: `Payout #${rec.id} ${finalStatus}; funds returned to wallet: ${why}`,
      eventType: finalStatus === 'failed' ? 'PAYOUT_FAILED' : 'PAYOUT_CANCELLED',
      idempotencyKey: `IDEMP-PAYRETURN-${rec.id}-${rec.attempt}`,
      actor,
      entries: [
        { accountCode: '2040', debit: rec.amount, credit: 0, currency: DEFAULT_CURRENCY, description: 'Released pending payout liability', payoutId: rec.id },
        { accountCode: this.walletAccount(wallet, 'freelancer'), debit: 0, credit: rec.amount, currency: DEFAULT_CURRENCY, description: `Restored balance to ${wallet.userName}`, userId: wallet.userId, payoutId: rec.id }
      ]
    });
    wallet.pendingWithdrawals = FinanceLedgerEngine.round(Math.max(0, wallet.pendingWithdrawals - rec.amount));
    rec.status = finalStatus;
    this.audit({ actor, action: finalStatus === 'failed' ? 'PAYOUT_FAILED_REFUNDED' : 'PAYOUT_CANCELLED_REFUNDED', target: `Payout #${rec.id}`, reason: why, journalId: journal.id });
    return { journal, wallet, payout: rec };
  }

  public cancelPayout(params: { payoutId: string; reason: string; actor: string }) {
    return this.returnPayoutFunds(params.payoutId, params.reason, params.actor, 'cancelled');
  }

  public failPayout(params: { payoutId: string; reason: string; actor: string }) {
    return this.returnPayoutFunds(params.payoutId, params.reason, params.actor, 'failed');
  }

  // Re-queues a failed payout: the funds are debited again (and must still be available).
  public retryPayout(params: { payoutId: string; actor: string }) {
    const rec = this.payouts.get(params.payoutId);
    if (!rec) throw new Error(`Payout ${params.payoutId} not found.`);
    if (rec.status !== 'failed') throw new Error('Only failed payouts can be retried.');
    const wallet = this.requireWallet(rec.freelancerId);
    if (wallet.status !== 'active') throw new Error(`Withdrawals are blocked: wallet is ${wallet.status}.`);
    if (wallet.availableBalance < rec.amount) throw new Error(`Insufficient available balance ($${wallet.availableBalance.toFixed(2)}) to retry this payout.`);
    const nextAttempt = rec.attempt + 1;
    const journal = this.postJournal({
      reference: `PAY-${rec.id}-REQUESTED-${nextAttempt}`,
      description: `Withdrawal re-queued #${rec.id} (attempt ${nextAttempt})`,
      eventType: 'PAYOUT_REQUESTED',
      idempotencyKey: `IDEMP-PAYREQ-${rec.id}-${nextAttempt}`,
      actor: params.actor,
      entries: [
        { accountCode: this.walletAccount(wallet, 'freelancer'), debit: rec.amount, credit: 0, currency: DEFAULT_CURRENCY, description: 'Debited wallet for retried withdrawal', userId: wallet.userId, payoutId: rec.id },
        { accountCode: '2040', debit: 0, credit: rec.amount, currency: DEFAULT_CURRENCY, description: 'Pending payout liability', payoutId: rec.id }
      ]
    });
    wallet.pendingWithdrawals = FinanceLedgerEngine.round(wallet.pendingWithdrawals + rec.amount);
    rec.attempt = nextAttempt;
    rec.status = 'requested';
    this.audit({ actor: params.actor, action: 'PAYOUT_RETRIED', target: `Payout #${rec.id}`, reason: `Re-queued $${rec.amount.toFixed(2)} (attempt ${nextAttempt})`, journalId: journal.id });
    return { journal, payout: rec };
  }

  // ----- administrative adjustments ----------------------------------------
  private static ADJUSTMENT_CATEGORIES = ['goodwill', 'dispute_resolution', 'accounting_correction', 'chargeback_recovery'];

  public executeAdministrativeAdjustment(params: {
    userId: string;
    amount: number;
    direction: 'credit_user' | 'debit_user';
    category: 'goodwill' | 'dispute_resolution' | 'accounting_correction' | 'chargeback_recovery';
    reason: string;
    actor: string;
    evidenceReference?: string;
    requestKey?: string;
    roleContext?: 'buyer' | 'freelancer';
  }): { journal: LedgerJournal; wallet: UserWallet } {
    const cached = this.replay<{ journal: LedgerJournal; wallet: UserWallet }>(params.requestKey);
    if (cached) return cached;
    const wallet = this.requireWallet(params.userId);
    if (wallet.userRole === 'admin') throw new Error('Admin wallets cannot be adjusted.');
    if (params.direction !== 'credit_user' && params.direction !== 'debit_user') throw new Error('Invalid adjustment direction.');
    if (!FinanceLedgerEngine.ADJUSTMENT_CATEGORIES.includes(params.category)) throw new Error('Invalid adjustment category.');
    const amount = FinanceLedgerEngine.assertMoney(params.amount, 'Adjustment amount');
    const why = FinanceLedgerEngine.assertReason(params.reason, 'A mandatory explanation');
    const acct = this.walletAccount(wallet, params.roleContext);

    let entries;
    if (params.direction === 'credit_user') {
      entries = [
        { accountCode: '5020', debit: amount, credit: 0, currency: DEFAULT_CURRENCY, description: `Adjustment Expense: ${params.category.toUpperCase()} - ${why}` },
        { accountCode: acct, debit: 0, credit: amount, currency: DEFAULT_CURRENCY, description: `Credit Adjustment to ${wallet.userName} (${wallet.userRole}): ${why}`, userId: wallet.userId }
      ];
    } else {
      if (wallet.availableBalance < amount) {
        throw new Error(`Insufficient user available balance ($${wallet.availableBalance.toFixed(2)}) for a debit adjustment of $${amount.toFixed(2)}. Arbitrary negative balances are prohibited.`);
      }
      entries = [
        { accountCode: acct, debit: amount, credit: 0, currency: DEFAULT_CURRENCY, description: `Debit Adjustment from ${wallet.userName} (${wallet.userRole}): ${why}`, userId: wallet.userId },
        { accountCode: '5020', debit: 0, credit: amount, currency: DEFAULT_CURRENCY, description: `Expense Recovery: ${params.category.toUpperCase()} - ${why}` }
      ];
    }

    const journal = this.postJournal({
      reference: `ADJ-${wallet.id}-${randomUUID().slice(0, 8)}`,
      description: `Administrative ${params.direction.toUpperCase()}: ${why} (${params.category})`,
      eventType: params.direction === 'credit_user' ? 'ADMIN_ADJUSTMENT_CREDIT' : 'ADMIN_ADJUSTMENT_DEBIT',
      idempotencyKey: (params as any).idempotencyKey || params.requestKey || `IDEMP-ADJ-${params.userId}-${params.direction}-${amount.toFixed(2)}-${params.category}-${why.slice(0, 40)}`,
      actor: params.actor,
      entries,
      notes: `Category: ${params.category} | Reference: ${params.evidenceReference || 'N/A'} | Reason: ${why}`
    });
    this.audit({ actor: params.actor, action: `ADMIN_ADJUSTMENT_${params.direction.toUpperCase()}`, target: `Wallet #${wallet.id} (${wallet.userName})`, reason: `${why} [${params.category}] Amount: $${amount.toFixed(2)}`, journalId: journal.id });
    return this.remember(params.requestKey, { journal, wallet });
  }

  public previewAdjustment(params: { userId: string; amount: number; direction: 'credit_user' | 'debit_user'; category: string; reason: string; roleContext?: 'buyer' | 'freelancer' }) {
    const wallet = this.requireWallet(params.userId);
    const amount = FinanceLedgerEngine.assertMoney(params.amount, 'Adjustment amount');
    const userAccountCode = this.walletAccount(wallet, params.roleContext);
    const userAccountName = userAccountCode === '2010' ? 'Buyer Wallets Payable' : 'Freelancer Wallets Payable';
    if (params.direction === 'credit_user') {
      return {
        debits: [{ accountCode: '5020', accountName: 'Administrative & Goodwill Adjustments', amount, effect: 'Increases platform expense' }],
        credits: [{ accountCode: userAccountCode, accountName: userAccountName, amount, effect: `Increases ${wallet.userName} available balance` }],
        resultingBalance: FinanceLedgerEngine.round(wallet.availableBalance + amount),
        currentBalance: wallet.availableBalance,
        balanced: true
      };
    }
    return {
      debits: [{ accountCode: userAccountCode, accountName: userAccountName, amount, effect: `Decreases ${wallet.userName} available balance` }],
      credits: [{ accountCode: '5020', accountName: 'Administrative & Goodwill Adjustments', amount, effect: 'Decreases platform expense / recovery' }],
      resultingBalance: FinanceLedgerEngine.round(wallet.availableBalance - amount),
      currentBalance: wallet.availableBalance,
      balanced: true,
      insufficientFunds: wallet.availableBalance < amount
    };
  }

  // ----- reporting ---------------------------------------------------------
  private accountNet(code: string): number {
    const coa = CHART_OF_ACCOUNTS.find(c => c.code === code)!;
    let d = 0, c = 0;
    for (const j of this.journals) for (const e of j.entries) if (e.accountCode === code) { d = FinanceLedgerEngine.round(d + e.debit); c = FinanceLedgerEngine.round(c + e.credit); }
    return FinanceLedgerEngine.round(coa.normalBalance === 'debit' ? d - c : c - d);
  }

  public getFinancialOverview() {
    let totalBuyerLiabilities = 0;
    let totalFreelancerLiabilities = 0;
    for (const w of this.wallets.values()) {
      if (w.userRole === 'buyer') totalBuyerLiabilities += w.availableBalance;
      else if (w.userRole === 'freelancer') totalFreelancerLiabilities += w.availableBalance;
    }
    let totalDebits = 0;
    let totalCredits = 0;
    for (const j of this.journals) { totalDebits += j.totalDebit; totalCredits += j.totalCredit; }
    const trialBalanceDiff = FinanceLedgerEngine.round(Math.abs(totalDebits - totalCredits));
    const escrowHeld = FinanceLedgerEngine.round(this.getEscrows().filter(e => e.status === 'held').reduce((a, e) => a + e.remaining, 0));

    return {
      totalUserWalletLiabilities: FinanceLedgerEngine.round(totalBuyerLiabilities + totalFreelancerLiabilities),
      availableBuyerBalances: FinanceLedgerEngine.round(totalBuyerLiabilities),
      availableFreelancerBalances: FinanceLedgerEngine.round(totalFreelancerLiabilities),
      fundsHeldInEscrow: escrowHeld,
      pendingPayouts: Math.max(0, this.accountNet('2040')),
      platformRevenue: FinanceLedgerEngine.round(this.accountNet('4010') + this.accountNet('4020') + this.accountNet('4030')),
      revenueBreakdown: {
        commission: this.accountNet('4010'),
        clientServiceFees: this.accountNet('4020'),
        smallOrderFees: this.accountNet('4030')
      },
      failedTransactionsCount: this.transactions.filter(t => t.status === 'failed').length,
      unreconciledExceptionsCount: this.exceptions.filter(e => e.status === 'unresolved').length,
      trialBalanceInBalance: trialBalanceDiff === 0,
      trialBalanceDiscrepancy: trialBalanceDiff,
      trialBalanceSum: FinanceLedgerEngine.round(totalDebits),
      lastAuditSyncTimestamp: nowStr(),
      totalJournalsPosted: this.journals.length,
      totalWalletsCount: this.wallets.size,
      frozenWalletsCount: Array.from(this.wallets.values()).filter(w => w.status === 'frozen').length
    };
  }

  // Cross-checks that must always hold. Any `ok: false` row is a bug or tampering.
  public getInvariants() {
    const escrowHeld = FinanceLedgerEngine.round(this.getEscrows().filter(e => e.status === 'held').reduce((a, e) => a + e.remaining, 0));
    const holds = FinanceLedgerEngine.round(Array.from(this.wallets.values()).reduce((a, w) => a + w.fundsOnHold, 0));
    const pendingRecords = FinanceLedgerEngine.round(Array.from(this.payouts.values()).filter(p => p.status === 'requested').reduce((a, p) => a + p.amount, 0));
    const pendingWallets = FinanceLedgerEngine.round(Array.from(this.wallets.values()).reduce((a, w) => a + w.pendingWithdrawals, 0));
    const walletSum = FinanceLedgerEngine.round(Array.from(this.wallets.values()).reduce((a, w) => a + w.availableBalance, 0));
    const walletLedger = FinanceLedgerEngine.round(this.accountNet('2010') + this.accountNet('2020'));
    const rows = [
      { name: 'Escrow account (2030) equals sum of held escrows', expected: escrowHeld, actual: this.accountNet('2030') },
      { name: 'Buyer funds-on-hold equals held escrows', expected: escrowHeld, actual: holds },
      { name: 'Pending payout account (2040) equals requested payouts', expected: pendingRecords, actual: this.accountNet('2040') },
      { name: 'Wallet pending-withdrawals equals requested payouts', expected: pendingRecords, actual: pendingWallets },
      { name: 'Wallet balances equal wallet liability accounts (2010+2020)', expected: walletLedger, actual: walletSum }
    ];
    return rows.map(r => ({ ...r, ok: FinanceLedgerEngine.round(r.expected - r.actual) === 0 }));
  }

  public getReconciliationSummary() {
    const wallets = this.getWallets();
    const driftedWallets = wallets.filter(w => !w.isReconciled);
    const accountBalances = CHART_OF_ACCOUNTS.map(coa => {
      let totalDebits = 0;
      let totalCredits = 0;
      for (const j of this.journals) for (const e of j.entries) if (e.accountCode === coa.code) { totalDebits = FinanceLedgerEngine.round(totalDebits + e.debit); totalCredits = FinanceLedgerEngine.round(totalCredits + e.credit); }
      const net = coa.normalBalance === 'debit' ? totalDebits - totalCredits : totalCredits - totalDebits;
      return { ...coa, totalDebits, totalCredits, netBalance: FinanceLedgerEngine.round(net) };
    });
    const sumDebits = FinanceLedgerEngine.round(accountBalances.reduce((acc, a) => acc + a.totalDebits, 0));
    const sumCredits = FinanceLedgerEngine.round(accountBalances.reduce((acc, a) => acc + a.totalCredits, 0));
    return {
      trialBalance: { accounts: accountBalances, totalDebits: sumDebits, totalCredits: sumCredits, isBalanced: FinanceLedgerEngine.round(Math.abs(sumDebits - sumCredits)) === 0, difference: FinanceLedgerEngine.round(Math.abs(sumDebits - sumCredits)) },
      walletAudit: { totalWalletsChecked: wallets.length, reconciledCount: wallets.filter(w => w.isReconciled).length, driftedCount: driftedWallets.length, driftedWallets },
      invariants: this.getInvariants(),
      exceptions: this.exceptions
    };
  }

  public resolveException(_exceptionId: string, _notes: string, _actor: string): never {
    throw new Error('Legacy in-memory reconciliation exception resolution is disabled. Use financialTransactionService.resolveReconciliationException against PostgreSQL.');
  }

  public getJournals() { return this.journals; }
  public getJournalById(id: string) { return this.journals.find(j => j.id === id); }
  public getTransactions() { return this.transactions; }
  public getTransactionById(id: string) { return this.transactions.find(t => t.id === id); }
  public getAuditLogs() { return this.auditLogs; }
  public getExceptions() { return this.exceptions; }

  // CSV Report Generator (formula-injection safe)
  public generateCsvExport(reportType: string, _filters: { currency?: string; startDate?: string; endDate?: string } = {}): { filename: string; content: string } {
    const now = new Date().toISOString().replace('T', '_').substring(0, 19);
    const rows: string[] = [];
    const line = (...cells: Array<string | number>) => rows.push(cells.map(c => (typeof c === 'number' ? csvNum(c) : csvText(c))).join(','));

    switch (reportType) {
      case 'trial_balance': {
        line('Account Code', 'Account Name', 'Account Type', 'Normal Balance', 'Total Debits', 'Total Credits', 'Net Balance');
        const summary = this.getReconciliationSummary();
        for (const a of summary.trialBalance.accounts) line(a.code, a.name, a.type, a.normalBalance, a.totalDebits, a.totalCredits, a.netBalance);
        line('TOTAL', 'Trial Balance Sum', '', `Balanced: ${summary.trialBalance.isBalanced}`, summary.trialBalance.totalDebits, summary.trialBalance.totalCredits, summary.trialBalance.difference);
        return { filename: `workperhour_trial_balance_${now}.csv`, content: rows.join('\n') };
      }
      case 'ledger_journals': {
        line('Journal ID', 'Posting Date', 'Reference', 'Event Type', 'Status', 'Account Code', 'Account Name', 'Debit', 'Credit', 'Description', 'User ID', 'Order ID');
        for (const j of this.journals) for (const e of j.entries) line(j.id, j.postingDate, j.reference, j.eventType, j.status, e.accountCode, e.accountName, e.debit, e.credit, e.description, e.userId || '', e.orderId || '');
        return { filename: `workperhour_double_entry_ledger_${now}.csv`, content: rows.join('\n') };
      }
      case 'wallets': {
        line('Wallet ID', 'User ID', 'User Name', 'Email', 'Role', 'Currency', 'Available Balance', 'Escrow On Hold', 'Pending Incoming', 'Status', 'Ledger Reconciled');
        for (const w of this.getWallets()) line(w.id, w.userId, w.userName, w.userEmail, w.userRole, w.currency, w.availableBalance, w.fundsOnHold, w.pendingIncoming, w.status, String(w.isReconciled));
        return { filename: `workperhour_wallet_balances_${now}.csv`, content: rows.join('\n') };
      }
      case 'transactions': {
        line('Transaction ID', 'Type', 'Amount', 'Currency', 'Status', 'Timestamp', 'User Name', 'Role', 'Order ID', 'Journal ID', 'Description');
        for (const t of this.transactions) line(t.id, t.type, t.amount, t.currency, t.status, t.timestamp, t.userName, t.userRole, t.relatedOrderId || '', t.journalId || '', t.description);
        return { filename: `workperhour_financial_transactions_${now}.csv`, content: rows.join('\n') };
      }
      case 'audit_trail': {
        line('Log ID', 'Actor', 'Role', 'Action', 'Target', 'Reason', 'Journal ID', 'Timestamp');
        for (const a of this.auditLogs) line(a.id, a.actor, a.role, a.action, a.target, a.reason || '', a.journalId || '', a.timestamp);
        return { filename: `workperhour_financial_audit_${now}.csv`, content: rows.join('\n') };
      }
      default:
        throw new Error(`Unsupported export type: ${reportType}`);
    }
  }

  // ----- persistence (DEPRECATED: Normalized PostgreSQL tables are sole source of truth) -----
  public saveToDisk() {
    // No-op: Legacy snapshot persistence is disabled to prevent overwriting PostgreSQL financial records.
  }

  public getSerializableState() {
    return {
      journals: [],
      transactions: [],
      wallets: [],
      auditLogs: [],
      exceptions: [],
      idempotencyKeys: [],
      escrows: [],
      payouts: [],
      opResults: [],
      config: {
        platformCommissionRate: this.platformCommissionRate,
        buyerFeePercent: this.buyerFeePercent,
        smallOrderFee: this.smallOrderFee,
        smallOrderThreshold: this.smallOrderThreshold,
        refundClientFeesOnFullRefund: this.refundClientFeesOnFullRefund,
        minimumOrderAmount: this.minimumOrderAmount,
        minimumWithdrawalAmount: this.minimumWithdrawalAmount,
        maximumWithdrawalAmount: this.maximumWithdrawalAmount
      }
    };
  }

  public exportState(): any {
    return this.getSerializableState();
  }

  public async persistToPostgres(): Promise<void> {
    // No-op: Legacy snapshot persistence to financial_ledger_state is disabled.
    return Promise.resolve();
  }

  public loadFromState(data: any) {
    if (!data || typeof data !== 'object') return;
    // Only fee calculation parameters may be updated; financial records are never hydrated from snapshots.
    if (data.config) {
      this.platformCommissionRate = data.config.platformCommissionRate ?? this.platformCommissionRate;
      this.buyerFeePercent = data.config.buyerFeePercent ?? this.buyerFeePercent;
      this.smallOrderFee = data.config.smallOrderFee ?? this.smallOrderFee;
      this.smallOrderThreshold = data.config.smallOrderThreshold ?? this.smallOrderThreshold;
      this.refundClientFeesOnFullRefund = data.config.refundClientFeesOnFullRefund ?? this.refundClientFeesOnFullRefund;
      this.minimumOrderAmount = data.config.minimumOrderAmount ?? this.minimumOrderAmount;
      this.minimumWithdrawalAmount = data.config.minimumWithdrawalAmount ?? this.minimumWithdrawalAmount;
      this.maximumWithdrawalAmount = data.config.maximumWithdrawalAmount ?? this.maximumWithdrawalAmount;
    }
  }

  public loadFromDisk() {
    // No-op: PostgreSQL normalized financial tables are the sole authoritative source of truth.
  }

  public resetToCleanState() {
    this.journals = [];
    this.transactions = [];
    this.auditLogs = [];
    this.exceptions = [];
    this.idempotencyKeys.clear();
    this.escrows.clear();
    this.escrowLocks.clear();
    this.payouts.clear();
    this.opResults.clear();
    this.wallets.clear();
  }
}

// Global Singleton Instance for fee configuration and pure quote calculations
export const financeLedger = new FinanceLedgerEngine();


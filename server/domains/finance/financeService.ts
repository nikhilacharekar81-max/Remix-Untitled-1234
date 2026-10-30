import { financeLedger, FinanceLedgerEngine, EscrowRecord, UserWallet, LedgerJournal } from './financeLedger.js';
import { financialTransactionService, financialRepository } from './financial.service.js';

/**
 * Finance Service Layer for WorkPerHour.
 * Fee policy configuration and pure fee quotes remain synchronous;
 * all financial persistence and state mutations execute exclusively against PostgreSQL.
 */
class FinanceService {
  public async ensureWallet(params: { userId: string; name: string; email: string; role: 'buyer' | 'freelancer' }) {
    return financialTransactionService.ensureWallet(params);
  }

  public async getWalletBalance(userId: string): Promise<number | null> {
    return financialRepository.getWalletBalance(userId);
  }

  public async getWalletById(userId: string) {
    return financialRepository.getWallet(userId);
  }

  public async getWallets() {
    return financialRepository.getWallets();
  }

  public async hasWallet(userId: string): Promise<boolean> {
    return financialRepository.hasWallet(userId);
  }

  public async creditDeposit(params: { userId: string; amount: number; reference: string; idempotencyKey: string; actor: string; source?: string }) {
    return financialTransactionService.creditDeposit(params);
  }

  public async fundEscrow(params: { orderId: string; orderTitle: string; amount: number; buyerId: string; sellerId: string; actor: string; timestamp?: string; skipMinimum?: boolean }) {
    return financialTransactionService.fundEscrow(params);
  }

  public async topUpEscrow(params: { orderId: string; orderTitle: string; amount: number; buyerId: string; sellerId: string; actor: string; timestamp?: string; skipMinimum?: boolean }) {
    return financialTransactionService.topUpEscrow(params);
  }

  public async releaseEscrow(params: { orderId: string; actor: string; reason?: string; requestKey?: string }) {
    return financialTransactionService.releaseOrderFunds({
      orderId: params.orderId,
      actor: params.actor,
      reason: params.reason,
      idempotencyKey: params.requestKey
    });
  }

  public async refundEscrow(params: { orderId: string; amount?: number; reason: string; actor: string; requestKey?: string }) {
    return financialTransactionService.refundOrderFunds({
      orderId: params.orderId,
      amount: params.amount,
      reason: params.reason,
      actor: params.actor,
      idempotencyKey: params.requestKey
    });
  }

  public async resolveEscrowSplit(params: { orderId: string; refundAmount: number; reason: string; actor: string }) {
    return financialTransactionService.resolveEscrowSplit(params);
  }

  public async requestPayout(params: { payoutId: string; freelancerId: string; amount: number; method: string; accountDetails: string; actor: string }) {
    return financialTransactionService.requestPayout(params);
  }

  public async cancelPayout(params: { payoutId: string; reason: string; actor: string }) {
    return financialTransactionService.cancelPayout(params);
  }

  public async getEscrow(orderId: string) {
    return financialRepository.getEscrow(orderId);
  }

  public async getEscrows() {
    return financialRepository.getEscrows();
  }

  public async getTransactions() {
    return financialRepository.getTransactions();
  }

  public async getAuditLogs() {
    return financialRepository.getAuditLogs();
  }

  public getFeeConfig() {
    return financeLedger.getFeeConfig();
  }

  public quoteOrder(gigPrice: number) {
    return financeLedger.quoteOrder(gigPrice);
  }

  public configure(cfg: any) {
    return financeLedger.configure(cfg);
  }

  public setPlatformCommissionRate(rate: number): void {
    financeLedger.setPlatformCommissionRate(rate);
  }

  public replay<T>(_requestKey: string | undefined): T | undefined {
    return undefined;
  }

  public async persistState(): Promise<void> {
    // No-op: PostgreSQL normalized financial tables are the sole source of truth.
    return Promise.resolve();
  }
}

export const financeService = new FinanceService();


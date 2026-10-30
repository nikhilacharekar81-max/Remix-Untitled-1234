// Public Finance Domain Boundary
export {
  financeService
} from './financeService.js';

export {
  financialTransactionService,
  financialRepository,
  FinancialRepository,
  FinancialTransactionService,
  assertValidMoneyAmount,
  checkOrRecordIdempotency,
  recordIdempotencyResult
} from './financial.service.js';

export {
  FinanceRepo,
  type PaymentMethodRecord
} from './finance.repo.js';

export {
  paymentGatewayManager,
  PaymentGatewayManager,
  encryptSecret,
  decryptSecret,
  type GatewayConfig,
  type EnvironmentGateways,
  type PaymentGatewaysState
} from './paymentGateways.js';

export {
  DEFAULT_FEE_CONFIG,
  DEFAULT_FEE_POLICY,
  calculateOrderFees,
  calculateDifferentialFees,
  resolveEffectiveFeePolicy,
  quoteOrderWithLiveSettings,
  percentOfCents,
  toCents,
  validateFeeConfig,
  type FeeConfig,
  type OrderFeeBreakdown
} from './fees.js';

export {
  handlePayoutRequest,
  approvePayout,
  processPayout,
  rejectPayout,
  failPayout,
  retryPayout,
  ALLOWED_METHODS,
  resolvePayoutUserId,
  formatPayoutRow,
  payoutAudit
} from './payout.service.js';

export { default as financeRoutes, default as financialRouter } from './finance.routes.js';

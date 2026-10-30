// Authoritative Single Source of Truth for WorkPerHour / FivePA Fee Policy & Calculations.
// Canonical Defaults:
// - 20% Freelancer Commission
// - 1% Buyer Service Fee
// - $1.00 Small Order Fee for orders strictly below $200
// - $1.00 Minimum Order Amount

export interface FeeConfig {
  /** Platform commission taken from the gig price (freelancer keeps 100 - this). Default 20. */
  commissionPercent: number;
  /** Client service fee charged on top of the gig price. Default 1. */
  buyerFeePercent: number;
  /** Flat fee added when the gig price is strictly under the threshold. Default 1.00. */
  smallOrderFee: number;
  /** Orders with a gig price strictly below this get the small-order fee. Default 200. */
  smallOrderThreshold: number;
  /** Minimum order amount allowed. Default 1.00. */
  minimumOrderAmount?: number;
}

export const DEFAULT_FEE_CONFIG: FeeConfig = {
  commissionPercent: 20,
  buyerFeePercent: 1,
  smallOrderFee: 1.00,
  smallOrderThreshold: 200,
  minimumOrderAmount: 1.00
};

export const DEFAULT_FEE_POLICY: FeeConfig = DEFAULT_FEE_CONFIG;

export interface OrderFeeBreakdown {
  gigPrice: number;          // what the freelancer's gig/extras cost (escrowed amount)
  serviceFee: number;        // client service fee (buyerFeePercent of gigPrice)
  buyerFee?: number;         // alias for serviceFee
  smallOrderFee: number;     // flat fee, 0 when gigPrice >= threshold
  clientTotal: number;       // gigPrice + serviceFee + smallOrderFee: what the client pays
  platformCommission: number;// commissionPercent of gigPrice, taken at escrow release
  freelancerNet: number;     // gigPrice - platformCommission
  freelancerPercent: number; // 100 - commissionPercent
  platformRevenue: number;   // commission + serviceFee + smallOrderFee
  cents: {
    gigPrice: number;
    serviceFee: number;
    smallOrderFee: number;
    clientTotal: number;
    platformCommission: number;
    freelancerNet: number;
  };
}

export const MAX_ORDER_AMOUNT = 1_000_000;

/** Percent of an integer-cent amount, rounded half-up to a whole cent. */
export function percentOfCents(cents: number, percent: number): number {
  const bps = Math.round(percent * 100); // 1% -> 100 basis points
  return Math.floor((cents * bps + 5000) / 10000);
}

export function toCents(amount: number): number {
  if (typeof amount !== 'number' || !Number.isFinite(amount) || Number.isNaN(amount) || amount < 0) {
    throw new Error('Amount must be a non-negative finite number.');
  }
  if (amount > MAX_ORDER_AMOUNT) {
    throw new Error(`Amount exceeds maximum allowed limit ($${MAX_ORDER_AMOUNT.toLocaleString()}).`);
  }
  if (Math.abs(Math.round(amount * 100) - amount * 100) > 1e-6) {
    throw new Error('Amount can have at most 2 decimal places.');
  }
  return Math.round(amount * 100);
}

export function validateFeeConfig(cfg: FeeConfig): void {
  const pct = (v: number) => typeof v === 'number' && Number.isFinite(v) && !Number.isNaN(v) && v >= 0 && v <= 100;
  if (!pct(cfg.commissionPercent)) throw new Error('commissionPercent must be between 0 and 100.');
  if (!pct(cfg.buyerFeePercent)) throw new Error('buyerFeePercent must be between 0 and 100.');
  if (typeof cfg.smallOrderFee !== 'number' || !Number.isFinite(cfg.smallOrderFee) || cfg.smallOrderFee < 0 || cfg.smallOrderFee > MAX_ORDER_AMOUNT) {
    throw new Error('smallOrderFee must be a non-negative finite number.');
  }
  if (Math.abs(Math.round(cfg.smallOrderFee * 100) - cfg.smallOrderFee * 100) > 1e-6) {
    throw new Error('smallOrderFee can have at most 2 decimal places.');
  }
  if (typeof cfg.smallOrderThreshold !== 'number' || !Number.isFinite(cfg.smallOrderThreshold) || cfg.smallOrderThreshold < 0 || cfg.smallOrderThreshold > MAX_ORDER_AMOUNT) {
    throw new Error('smallOrderThreshold must be a non-negative finite number.');
  }
  if (Math.abs(Math.round(cfg.smallOrderThreshold * 100) - cfg.smallOrderThreshold * 100) > 1e-6) {
    throw new Error('smallOrderThreshold can have at most 2 decimal places.');
  }
  if (cfg.minimumOrderAmount !== undefined) {
    if (typeof cfg.minimumOrderAmount !== 'number' || !Number.isFinite(cfg.minimumOrderAmount) || cfg.minimumOrderAmount < 0 || cfg.minimumOrderAmount > MAX_ORDER_AMOUNT) {
      throw new Error('minimumOrderAmount must be a non-negative finite number.');
    }
  }
}

/**
 * FivePA Fee Rules:
 *  1. Freelancer commission: platform keeps commissionPercent (20%) of the gig price; freelancer gets the rest (80%).
 *  2. Client service fee: buyerFeePercent (1%) of the gig price, charged on top.
 *  3. Small-order fee: flat smallOrderFee ($1.00) on top when the gig price is strictly under smallOrderThreshold ($200).
 *     The threshold is tested against the gig price (gig + extras), before the service fee.
 */
export function calculateOrderFees(gigPrice: number, cfg: FeeConfig = DEFAULT_FEE_CONFIG): OrderFeeBreakdown {
  validateFeeConfig(cfg);
  const gig = toCents(gigPrice);
  const service = percentOfCents(gig, cfg.buyerFeePercent);
  const small = gig > 0 && gig < toCents(cfg.smallOrderThreshold) ? toCents(cfg.smallOrderFee) : 0;
  const commission = percentOfCents(gig, cfg.commissionPercent);
  const net = gig - commission;
  const total = gig + service + small;
  const d = (c: number) => c / 100;
  return {
    gigPrice: d(gig),
    serviceFee: d(service),
    smallOrderFee: d(small),
    clientTotal: d(total),
    platformCommission: d(commission),
    freelancerNet: d(net),
    freelancerPercent: Math.round((100 - cfg.commissionPercent) * 100) / 100,
    platformRevenue: d(commission + service + small),
    cents: {
      gigPrice: gig,
      serviceFee: service,
      smallOrderFee: small,
      clientTotal: total,
      platformCommission: commission,
      freelancerNet: net
    }
  };
}

/**
 * Resolves the effective fee policy for an order, checking order snapshot first, then site settings, then default FivePA config.
 */
export function resolveEffectiveFeePolicy(orderSnapshot?: any, fallbackConfig: FeeConfig = DEFAULT_FEE_CONFIG): FeeConfig {
  if (!orderSnapshot) return { ...fallbackConfig };

  const numOrUndef = (v: any): number | undefined => {
    if (v === null || v === undefined || v === '') return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };

  const freelancerPct = numOrUndef(orderSnapshot.feeBreakdown?.freelancerPercent);
  const commissionPercent = numOrUndef(orderSnapshot.commission_percent) ??
    (freelancerPct !== undefined ? (100 - freelancerPct) : undefined) ??
    numOrUndef(orderSnapshot.fee_breakdown?.commissionPercent) ??
    fallbackConfig.commissionPercent;

  const buyerFeePercent = numOrUndef(orderSnapshot.buyer_fee_percent) ??
    numOrUndef(orderSnapshot.feeBreakdown?.buyerFeePercent) ??
    numOrUndef(orderSnapshot.fee_breakdown?.buyerFeePercent) ??
    fallbackConfig.buyerFeePercent;

  const smallOrderFee = numOrUndef(orderSnapshot.small_order_fee_amount) ??
    numOrUndef(orderSnapshot.feeBreakdown?.smallOrderFeeAmount) ??
    numOrUndef(orderSnapshot.fee_breakdown?.smallOrderFee) ??
    fallbackConfig.smallOrderFee;

  const smallOrderThreshold = numOrUndef(orderSnapshot.small_order_threshold) ??
    numOrUndef(orderSnapshot.feeBreakdown?.smallOrderThreshold) ??
    numOrUndef(orderSnapshot.fee_breakdown?.smallOrderThreshold) ??
    fallbackConfig.smallOrderThreshold;

  const minimumOrderAmount = numOrUndef(orderSnapshot.minimum_order_amount) ??
    numOrUndef(orderSnapshot.feeBreakdown?.minimumOrderAmount) ??
    numOrUndef(orderSnapshot.fee_breakdown?.minimumOrderAmount) ??
    fallbackConfig.minimumOrderAmount;

  return {
    commissionPercent,
    buyerFeePercent,
    smallOrderFee,
    smallOrderThreshold,
    minimumOrderAmount
  };
}

/**
 * Computes differential fees when topping up an existing escrow order.
 * Preserves historical policy and computes additional amounts without double-charging base fees.
 */
export function calculateDifferentialFees(previousOrderAmount: number, newTotalOrderAmount: number, policy: FeeConfig = DEFAULT_FEE_CONFIG) {
  validateFeeConfig(policy);
  const prev = calculateOrderFees(previousOrderAmount, policy);
  const next = calculateOrderFees(newTotalOrderAmount, policy);

  if (next.cents.gigPrice < prev.cents.gigPrice) {
    throw new Error('New total order amount cannot be less than the previous order amount.');
  }

  const addGigCents = next.cents.gigPrice - prev.cents.gigPrice;
  const addServiceCents = Math.max(0, next.cents.serviceFee - prev.cents.serviceFee);
  const addSmallCents = Math.max(0, next.cents.smallOrderFee - prev.cents.smallOrderFee);
  const addTotalCents = addGigCents + addServiceCents + addSmallCents;
  const addCommCents = Math.max(0, next.cents.platformCommission - prev.cents.platformCommission);
  const addNetCents = addGigCents - addCommCents;

  return {
    additionalGigPrice: addGigCents / 100,
    additionalServiceFee: addServiceCents / 100,
    additionalSmallOrderFee: addSmallCents / 100,
    additionalClientTotal: addTotalCents / 100,
    additionalCommission: addCommCents / 100,
    additionalFreelancerNet: addNetCents / 100,
    next,
    prev
  };
}

/**
 * Server-side helper to quote an order amount against the live Admin settings stored in PostgreSQL.
 * Fails closed if siteSettings is corrupted or unavailable.
 */
export async function quoteOrderWithLiveSettings(amount: number, client?: any): Promise<OrderFeeBreakdown> {
  const settingsModulePath = '../admin/siteSettings.js';
  const { siteSettings } = await import(/* @vite-ignore */ settingsModulePath);
  const comm = siteSettings.getSettings().commission;
  if (!comm) {
    throw new Error('Commission settings are missing or uninitialized.');
  }
  const policy: FeeConfig = {
    commissionPercent: comm.commissionPercent ?? DEFAULT_FEE_CONFIG.commissionPercent,
    buyerFeePercent: comm.buyerProcessingFeePercent ?? DEFAULT_FEE_CONFIG.buyerFeePercent,
    smallOrderFee: comm.smallOrderFeeAmount ?? DEFAULT_FEE_CONFIG.smallOrderFee,
    smallOrderThreshold: comm.smallOrderFeeThreshold ?? DEFAULT_FEE_CONFIG.smallOrderThreshold,
    minimumOrderAmount: comm.minimumOrderAmount ?? DEFAULT_FEE_CONFIG.minimumOrderAmount
  };
  return calculateOrderFees(amount, policy);
}

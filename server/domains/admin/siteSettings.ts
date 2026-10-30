import fs from 'fs';
import path from 'path';
import { DEFAULT_FEE_CONFIG, calculateOrderFees, type FeeConfig } from '../../../src/shared/fees.js';

export interface WebsiteSettings {
  siteName: string;
  siteTagline: string;
  supportEmail: string;
  contactPhone: string;
  helpdeskUrl: string;
  maintenanceMode: boolean;
  copyrightText: string;
}

export interface PlatformCommissionSettings {
  commissionPercent: number; // platform cut of the gig price; freelancer keeps the rest (default 20)
  buyerProcessingFeePercent: number; // client service fee on top of the gig price (default 1)
  smallOrderFeeAmount: number; // flat fee added when the gig price is strictly under the threshold (default 1.00)
  smallOrderFeeThreshold: number; // gig price below this triggers the small-order fee (default 200)
  refundClientFeesOnFullRefund: boolean; // return service + small-order fee when an order is fully refunded
  minimumOrderAmount: number; // e.g. 1.00
  escrowProtectionDays: number; // default 14
  commissionDeductionTiming: 'on_escrow_release' | 'on_order_checkout';
}

export interface MembershipPlanTier {
  id: string;
  name: string;
  priceMonthly: number;
  bidsPerMonth: number;
  commissionDiscountPercent: number; // reduction from base commission
  featuredBadge: boolean;
  enabled: boolean;
}

export interface MembershipPlansSettings {
  membershipsEnabled: boolean;
  freelancerPlans: MembershipPlanTier[];
  buyerPlans: {
    id: string;
    name: string;
    priceMonthly: number;
    jobPostsPerMonth: number;
    zeroBuyerFee: boolean;
    enabled: boolean;
  }[];
}

export interface GigsProjectsOrdersSettings {
  gigModerationRequired: boolean; // Auto-publish vs Require Admin Approval
  projectModerationRequired: boolean;
  minimumGigPrice: number;
  maximumGigPrice: number;
  minimumProjectBudget: number;
  maximumProjectBudget: number;
  maxActiveOrdersPerFreelancer: number; // 0 for unlimited
  autoCompleteDeliveredDays: number; // default 3 days
  autoCompleteDeliveredEnabled: boolean; // default true (toggle auto-accept on/off with one setting)
  allowBuyerCancellationRequests: boolean;
  featuredGigFee: number; // Default 10
}

export interface WalletsWithdrawalsSettings {
  minimumWithdrawalAmount: number;
  maximumWithdrawalPerTransaction: number;
  dailyWithdrawalLimit: number;
  payoutProcessingSchedule: 'instant_auto' | 'daily_batch' | 'manual_review_all' | 'manual_review_over_threshold';
  manualReviewThresholdAmount: number; // e.g. 500
  platformCoversGatewayFees: boolean;
  allowedPayoutMethods: {
    upi: boolean;
    bankTransfer: boolean;
    stripeConnect: boolean;
    razorpayX: boolean;
    paypal: boolean;
  };
  depositHoldDaysBeforeWithdraw: number;
}

export interface LanguageCurrencySettings {
  defaultCurrency: 'USD' | 'EUR' | 'GBP' | 'INR' | 'CAD' | 'AUD';
  currencySymbolPlacement: 'before' | 'after';
  decimalPlaces: 0 | 2;
  primaryLanguage: 'en_US' | 'en_GB' | 'es' | 'fr' | 'de' | 'hi';
  dateFormat: 'YYYY-MM-DD' | 'DD/MM/YYYY' | 'MM/DD/YYYY';
  timezone: string;
}

export interface SecurityRegistrationSettings {
  allowNewRegistrations: boolean;
  requireEmailVerification: boolean;
  requireKycForPayouts: boolean;
  requireAdmin2FA: boolean;
  maxFailedLoginsLockout: number;
  sessionTimeoutMinutes: number;
  minPasswordLength: number;
}

export interface EmailsIntegrationsSettings {
  emailSenderName: string;
  emailSenderAddress: string;
  sendWelcomeEmail: boolean;
  sendOrderStatusEmails: boolean;
  sendPayoutStatusEmails: boolean;
  sendDisputeAdminAlerts: boolean;
  stripeEnabled: boolean;
  stripePublishableKeyMasked: string;
  razorpayEnabled: boolean;
}

export interface SettingsHistoryItem {
  id: string;
  timestamp: string;
  section: string;
  settingName: string;
  oldValue: string;
  newValue: string;
  actor: string;
  notes?: string;
}

export interface SiteSettingsState {
  website: WebsiteSettings;
  commission: PlatformCommissionSettings;
  memberships: MembershipPlansSettings;
  marketplace: GigsProjectsOrdersSettings;
  wallets: WalletsWithdrawalsSettings;
  localization: LanguageCurrencySettings;
  security: SecurityRegistrationSettings;
  integrations: EmailsIntegrationsSettings;
}

// Sensible Out-of-the-Box Defaults
export const DEFAULT_SITE_SETTINGS: SiteSettingsState = {
  website: {
    siteName: 'WorkPerHour',
    siteTagline: 'Hire Top Freelancers & Discover Quality Services',
    supportEmail: 'support@workperhour.com',
    contactPhone: '+1 (800) 555-WORK',
    helpdeskUrl: 'https://support.workperhour.com',
    maintenanceMode: false,
    copyrightText: '© 2026 WorkPerHour Inc. All rights reserved.'
  },
  commission: {
    commissionPercent: DEFAULT_FEE_CONFIG.commissionPercent, // 20% platform take rate
    buyerProcessingFeePercent: DEFAULT_FEE_CONFIG.buyerFeePercent, // 1% client service fee
    smallOrderFeeAmount: DEFAULT_FEE_CONFIG.smallOrderFee, // $1.00 flat fee...
    smallOrderFeeThreshold: DEFAULT_FEE_CONFIG.smallOrderThreshold, // ...on orders under $200
    refundClientFeesOnFullRefund: true,
    minimumOrderAmount: 1.0,
    escrowProtectionDays: 14, // 14-day mandatory vault
    commissionDeductionTiming: 'on_escrow_release'
  },
  memberships: {
    membershipsEnabled: true,
    freelancerPlans: [
      { id: 'plan_free', name: 'Standard Freelancer', priceMonthly: 0, bidsPerMonth: 0, commissionDiscountPercent: 0, featuredBadge: false, enabled: true },
      { id: 'plan_pro', name: 'WorkPerHour Pro Talent', priceMonthly: 29, bidsPerMonth: 0, commissionDiscountPercent: 2, featuredBadge: true, enabled: true }
    ],
    buyerPlans: [
      { id: 'buyer_free', name: 'Standard Client', priceMonthly: 0, jobPostsPerMonth: 0, zeroBuyerFee: false, enabled: true },
      { id: 'buyer_enterprise', name: 'Enterprise Client', priceMonthly: 99, jobPostsPerMonth: 0, zeroBuyerFee: true, enabled: true }
    ]
  },
  marketplace: {
    gigModerationRequired: false, // published directly by default
    projectModerationRequired: false,
    minimumGigPrice: 1,
    maximumGigPrice: 10000,
    minimumProjectBudget: 1,
    maximumProjectBudget: 50000,
    maxActiveOrdersPerFreelancer: 0, // 0 for unlimited (allows high-velocity sellers and buyers without artificial caps)
    autoCompleteDeliveredDays: 3,
    autoCompleteDeliveredEnabled: true,
    allowBuyerCancellationRequests: true,
    featuredGigFee: 10
  },
  wallets: {
    minimumWithdrawalAmount: 3,
    maximumWithdrawalPerTransaction: 5000,
    dailyWithdrawalLimit: 10000,
    payoutProcessingSchedule: 'manual_review_over_threshold',
    manualReviewThresholdAmount: 500,
    platformCoversGatewayFees: true,
    allowedPayoutMethods: {
      upi: true,
      bankTransfer: true,
      stripeConnect: true,
      razorpayX: true,
      paypal: true
    },
    depositHoldDaysBeforeWithdraw: 0
  },
  localization: {
    defaultCurrency: 'USD',
    currencySymbolPlacement: 'before',
    decimalPlaces: 2,
    primaryLanguage: 'en_US',
    dateFormat: 'YYYY-MM-DD',
    timezone: 'UTC'
  },
  security: {
    allowNewRegistrations: true,
    requireEmailVerification: false,
    requireKycForPayouts: true,
    requireAdmin2FA: true,
    maxFailedLoginsLockout: 5,
    sessionTimeoutMinutes: 60,
    minPasswordLength: 6
  },
  integrations: {
    emailSenderName: 'WorkPerHour Notifications',
    emailSenderAddress: 'notifications@workperhour.com',
    sendWelcomeEmail: true,
    sendOrderStatusEmails: true,
    sendPayoutStatusEmails: true,
    sendDisputeAdminAlerts: true,
    stripeEnabled: true,
    stripePublishableKeyMasked: 'pk_test_51Mz...••••',
    razorpayEnabled: true
  }
};

export class SiteSettingsService {
  private settings: SiteSettingsState;
  private history: SettingsHistoryItem[] = [];

  constructor() {
    this.settings = JSON.parse(JSON.stringify(DEFAULT_SITE_SETTINGS));
    this.loadFromDisk();
    this.syncFeesToLedger();
  }

  public loadFromState(parsed: any) {
    if (parsed && typeof parsed === 'object') {
      this.settings = {
        website: { ...DEFAULT_SITE_SETTINGS.website, ...(parsed.website || {}) },
        commission: { ...DEFAULT_SITE_SETTINGS.commission, ...(parsed.commission || {}) },
        memberships: { ...DEFAULT_SITE_SETTINGS.memberships, ...(parsed.memberships || {}) },
        marketplace: { ...DEFAULT_SITE_SETTINGS.marketplace, ...(parsed.marketplace || {}) },
        wallets: { ...DEFAULT_SITE_SETTINGS.wallets, ...(parsed.wallets || {}) },
        localization: { ...DEFAULT_SITE_SETTINGS.localization, ...(parsed.localization || {}) },
        security: { ...DEFAULT_SITE_SETTINGS.security, ...(parsed.security || {}) },
        integrations: { ...DEFAULT_SITE_SETTINGS.integrations, ...(parsed.integrations || {}) },
      };
      this.syncFeesToLedger();
    }
  }

  private loadFromDisk() {
    // Deprecated: Site settings are now loaded from PostgreSQL via hydrateStoreFromPostgres()
    this.syncFeesToLedger();
  }

  public async saveToDatabase(): Promise<void> {
    const { postgresStore } = await import('../../db/postgresStore.js');
    await postgresStore.saveSiteSettings(this.settings);
  }

  public saveToDisk() {
    this.saveToDatabase().catch(err => {
      console.error('[SiteSettingsService] Failed to save site settings in background:', err);
    });
  }

  public getSettings(): SiteSettingsState {
    return JSON.parse(JSON.stringify(this.settings));
  }

  public getSettingsHistory(): SettingsHistoryItem[] {
    return [...this.history];
  }

  // Shared Fee Calculation Service: Used across entire application.
  // Delegates to src/shared/fees.ts so the ledger, the API and the UI all use identical math.
  public getFeeConfig(customCommissionPercent?: number): FeeConfig {
    const c = this.settings.commission;
    return {
      commissionPercent: customCommissionPercent !== undefined ? customCommissionPercent : c.commissionPercent,
      buyerFeePercent: c.buyerProcessingFeePercent,
      smallOrderFee: c.smallOrderFeeAmount,
      smallOrderThreshold: c.smallOrderFeeThreshold
    };
  }

  public calculateFeeSplit(orderAmount: number, customCommissionPercent?: number) {
    const f = calculateOrderFees(Math.max(0, orderAmount), this.getFeeConfig(customCommissionPercent));
    return {
      orderAmount: f.gigPrice,
      commissionPercent: this.getFeeConfig(customCommissionPercent).commissionPercent,
      platformFee: f.platformCommission,
      freelancerPercent: f.freelancerPercent,
      freelancerAmount: f.freelancerNet,
      buyerProcessingFeePercent: this.settings.commission.buyerProcessingFeePercent,
      buyerFee: f.serviceFee,
      smallOrderFee: f.smallOrderFee,
      totalBuyerCharged: f.clientTotal
    };
  }

  // Pushes every fee rule to the finance ledger, which is what actually enforces them on money movement.
  private syncFeesToLedger() {
    const c = this.settings.commission;
    import('../finance/financeService.js').then(({ financeService }) => {
      financeService.configure({
        commissionPercent: c.commissionPercent,
        buyerFeePercent: c.buyerProcessingFeePercent,
        smallOrderFee: c.smallOrderFeeAmount,
        smallOrderThreshold: c.smallOrderFeeThreshold,
        refundClientFeesOnFullRefund: c.refundClientFeesOnFullRefund,
        minimumOrderAmount: c.minimumOrderAmount
      });
    }).catch(() => {});
  }

  // Update a specific section of settings
  public updateSection<K extends keyof SiteSettingsState>(
    section: K,
    updates: Partial<SiteSettingsState[K]>,
    actor: string = 'Super Admin'
  ): SiteSettingsState[K] {
    if (section === 'localization' && (updates as any).defaultCurrency && (updates as any).defaultCurrency !== 'USD') {
      throw new Error('Only USD is supported as the platform default currency.');
    }
    const currentSection = this.settings[section];
    const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);

    // Track changed keys in history
    for (const [key, val] of Object.entries(updates)) {
      const oldVal = (currentSection as any)[key];
      const oldStr = typeof oldVal === 'object' ? JSON.stringify(oldVal) : String(oldVal);
      const newStr = typeof val === 'object' ? JSON.stringify(val) : String(val);

      if (oldStr !== newStr) {
        this.history.unshift({
          id: `SET-HIST-${Date.now()}-${Math.floor(Math.random() * 900 + 100)}`,
          timestamp,
          section: section.charAt(0).toUpperCase() + section.slice(1),
          settingName: key,
          oldValue: oldStr,
          newValue: newStr,
          actor,
          notes: `Updated ${key} in ${section} section`
        });
      }
    }

    // Apply updates
    this.settings[section] = {
      ...currentSection,
      ...updates
    };

    // If any fee rule changed, sync immediately to the double-entry finance ledger
    if (section === 'commission') {
      try {
        this.syncFeesToLedger();
      } catch (err) {
        // Invalid fee values must never reach money movement: roll the section back and re-throw.
        this.settings[section] = currentSection;
        this.syncFeesToLedger();
        throw err;
      }
    }

    this.saveToDisk();
    return JSON.parse(JSON.stringify(this.settings[section]));
  }

  // Reset a section or all settings back to default
  public resetToDefaults(section?: keyof SiteSettingsState, actor: string = 'Super Admin'): SiteSettingsState {
    const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);

    if (section) {
      this.settings[section] = JSON.parse(JSON.stringify(DEFAULT_SITE_SETTINGS[section]));
      this.history.unshift({
        id: `SET-HIST-${Date.now()}`,
        timestamp,
        section: section.charAt(0).toUpperCase() + section.slice(1),
        settingName: 'Reset Section',
        oldValue: 'Custom Values',
        newValue: 'Factory Defaults',
        actor,
        notes: `Reset ${section} section to default configuration`
      });

      if (section === 'commission') {
        this.syncFeesToLedger();
      }
    } else {
      this.settings = JSON.parse(JSON.stringify(DEFAULT_SITE_SETTINGS));
      this.history.unshift({
        id: `SET-HIST-${Date.now()}`,
        timestamp,
        section: 'All Settings',
        settingName: 'Factory Reset',
        oldValue: 'Custom Values',
        newValue: 'Factory Defaults',
        actor,
        notes: 'Reset all 9 settings sections back to platform factory defaults'
      });
      import('../finance/financeService.js').then(({ financeService }) => {
        financeService.setPlatformCommissionRate(DEFAULT_SITE_SETTINGS.commission.commissionPercent);
      }).catch(() => {});
    }

    this.saveToDisk();
    return this.getSettings();
  }

  public getFlattenedSettings() {
    const s = this.settings;
    return {
      platformName: s.website.siteName,
      brandName: s.website.siteName,
      supportEmail: s.website.supportEmail,
      currency: s.localization.defaultCurrency,
      currencySymbol: '$',
      freelancerCommissionRate: s.commission.commissionPercent,
      buyerProcessingFeeRate: s.commission.buyerProcessingFeePercent,
      clientServiceFee: s.commission.buyerProcessingFeePercent,
      smallOrderFee: s.commission.smallOrderFeeAmount,
      smallOrderFeeAmount: s.commission.smallOrderFeeAmount,
      smallOrderFeeThreshold: s.commission.smallOrderFeeThreshold,
      minOrderAmount: s.commission.minimumOrderAmount,
      minimumOrder: s.commission.minimumOrderAmount,
      minimumOrderAmount: s.commission.minimumOrderAmount,
      featuredGigFee: (s.marketplace as any).featuredGigFee ?? 10,
      urgentProjectFee: (s.marketplace as any).urgentProjectFee ?? 25,
      escrowHoldDays: s.commission.escrowProtectionDays,
      autoCompleteDeliveredDays: s.marketplace.autoCompleteDeliveredDays,
      autoCompleteDays: s.marketplace.autoCompleteDeliveredDays,
      reviewWindowDays: s.marketplace.autoCompleteDeliveredDays,
      autoCompleteDeliveredEnabled: s.marketplace.autoCompleteDeliveredEnabled,
      autoCompleteEnabled: s.marketplace.autoCompleteDeliveredEnabled,
      disputeWindowDays: 14,
      minPayoutThreshold: s.wallets.minimumWithdrawalAmount,
      minimumWithdrawal: s.wallets.minimumWithdrawalAmount,
      instantPayoutFeeRate: 1.5,
      freelancerOnboardingMode: (s.marketplace as any).freelancerOnboardingMode ?? 'open',
      maintenanceMode: s.website.maintenanceMode,
      minimumGigPrice: s.marketplace.minimumGigPrice,
      maximumGigPrice: s.marketplace.maximumGigPrice,
      minimumProjectBudget: s.marketplace.minimumProjectBudget,
      maximumProjectBudget: s.marketplace.maximumProjectBudget,
      gigModerationRequired: s.marketplace.gigModerationRequired,
      projectModerationRequired: s.marketplace.projectModerationRequired
    };
  }

  public updateFromFlatObject(body: any, actor: string = 'Super Admin') {
    if (!body || typeof body !== 'object') return this.getFlattenedSettings();
    if (body.defaultCurrency && body.defaultCurrency !== 'USD') {
      throw new Error('Only USD is supported as the platform default currency.');
    }

    const commissionUpdates: Partial<PlatformCommissionSettings> = {};
    const marketplaceUpdates: Partial<GigsProjectsOrdersSettings> & Record<string, any> = {};
    const walletUpdates: Partial<WalletsWithdrawalsSettings> = {};
    const websiteUpdates: Partial<WebsiteSettings> = {};
    const localizationUpdates: Partial<LanguageCurrencySettings> = {};

    if (body.freelancerCommissionRate !== undefined) commissionUpdates.commissionPercent = Number(body.freelancerCommissionRate);
    if (body.clientServiceFee !== undefined || body.buyerProcessingFeeRate !== undefined) {
      commissionUpdates.buyerProcessingFeePercent = Number(body.clientServiceFee ?? body.buyerProcessingFeeRate);
    }
    if (body.smallOrderFeeAmount !== undefined || body.smallOrderFee !== undefined) {
      commissionUpdates.smallOrderFeeAmount = Number(body.smallOrderFeeAmount ?? body.smallOrderFee);
    }
    if (body.smallOrderFeeThreshold !== undefined) {
      commissionUpdates.smallOrderFeeThreshold = Number(body.smallOrderFeeThreshold);
    }
    if (body.escrowHoldDays !== undefined) {
      commissionUpdates.escrowProtectionDays = Number(body.escrowHoldDays);
    }
    if (body.minOrderAmount !== undefined || body.minimumOrder !== undefined || body.minimumOrderAmount !== undefined) {
      commissionUpdates.minimumOrderAmount = Number(body.minOrderAmount ?? body.minimumOrder ?? body.minimumOrderAmount);
    }

    if (body.autoCompleteDays !== undefined || body.autoCompleteDeliveredDays !== undefined || body.reviewWindowDays !== undefined) {
      marketplaceUpdates.autoCompleteDeliveredDays = Number(body.autoCompleteDays ?? body.autoCompleteDeliveredDays ?? body.reviewWindowDays);
    }
    if (body.autoCompleteEnabled !== undefined || body.autoCompleteDeliveredEnabled !== undefined) {
      marketplaceUpdates.autoCompleteDeliveredEnabled = Boolean(body.autoCompleteEnabled ?? body.autoCompleteDeliveredEnabled);
    }
    if (body.minimumGigPrice !== undefined || body.minGigPrice !== undefined) {
      marketplaceUpdates.minimumGigPrice = Number(body.minimumGigPrice ?? body.minGigPrice);
    }
    if (body.maximumGigPrice !== undefined || body.maxGigPrice !== undefined) {
      marketplaceUpdates.maximumGigPrice = Number(body.maximumGigPrice ?? body.maxGigPrice);
    }
    if (body.minimumProjectBudget !== undefined || body.minProjectBudget !== undefined) {
      marketplaceUpdates.minimumProjectBudget = Number(body.minimumProjectBudget ?? body.minProjectBudget);
    }
    if (body.maximumProjectBudget !== undefined || body.maxProjectBudget !== undefined) {
      marketplaceUpdates.maximumProjectBudget = Number(body.maximumProjectBudget ?? body.maxProjectBudget);
    }
    if (body.gigModerationRequired !== undefined) {
      marketplaceUpdates.gigModerationRequired = Boolean(body.gigModerationRequired);
    }
    if (body.projectModerationRequired !== undefined) {
      marketplaceUpdates.projectModerationRequired = Boolean(body.projectModerationRequired);
    }
    if (body.featuredGigFee !== undefined || body.featureGigFee !== undefined) {
      marketplaceUpdates.featuredGigFee = Number(body.featuredGigFee ?? body.featureGigFee);
    }
    if (body.urgentProjectFee !== undefined) {
      marketplaceUpdates.urgentProjectFee = Number(body.urgentProjectFee);
    }

    if (body.minPayoutThreshold !== undefined || body.minimumWithdrawal !== undefined) {
      walletUpdates.minimumWithdrawalAmount = Number(body.minPayoutThreshold ?? body.minimumWithdrawal);
    }

    if (body.brandName !== undefined || body.platformName !== undefined || body.siteName !== undefined) {
      websiteUpdates.siteName = String(body.brandName ?? body.platformName ?? body.siteName);
    }
    if (body.supportEmail !== undefined) {
      websiteUpdates.supportEmail = String(body.supportEmail);
    }
    if (body.maintenanceMode !== undefined) {
      websiteUpdates.maintenanceMode = Boolean(body.maintenanceMode);
    }

    if (body.currency !== undefined) {
      const curStr = String(body.currency);
      const matched = curStr.match(/^[A-Z]{3}/);
      if (matched) localizationUpdates.defaultCurrency = matched[0] as any;
    }

    if (Object.keys(commissionUpdates).length > 0) this.updateSection('commission', commissionUpdates, actor);
    if (Object.keys(marketplaceUpdates).length > 0) this.updateSection('marketplace', marketplaceUpdates, actor);
    if (Object.keys(walletUpdates).length > 0) this.updateSection('wallets', walletUpdates, actor);
    if (Object.keys(websiteUpdates).length > 0) this.updateSection('website', websiteUpdates, actor);
    if (Object.keys(localizationUpdates).length > 0) this.updateSection('localization', localizationUpdates, actor);

    this.saveToDisk();
    return this.getFlattenedSettings();
  }
}

// Global Singleton Instance
export const siteSettings = new SiteSettingsService();

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import { financeLedger, FinanceLedgerEngine } from '../src/server/financeLedger.js';
import { siteSettings, DEFAULT_SITE_SETTINGS } from '../src/server/siteSettings.js';
import { workspaceService } from '../src/server/workspaceService.js';
import { paymentGatewayManager } from '../src/server/paymentGateways.js';
import {
  postgresStore,
  isPostgresEnabled,
  isRemotePostgresConfigured,
  assertProductionPostgresConfigured,
  isProductionPostgresRequired
} from './db/postgresStore.js';
import { financialRepository, financialTransactionService } from './services/financialService.js';
import { calculateOrderFees } from './domains/finance/fees.js';

export { financeLedger, siteSettings, DEFAULT_SITE_SETTINGS, FinanceLedgerEngine, postgresStore, isPostgresEnabled };

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const ROOT_DIR = path.resolve(__dirname, '..');
export const DATA_DIR = path.join(ROOT_DIR, 'data');
export const WORKSTREAM_UPLOADS_DIR = path.join(DATA_DIR, 'uploads', 'workstream');

import type {
  User,
  GigExtra,
  Gig,
  Project,
  Proposal,
  Order,
  Dispute,
  WorkstreamOfferKind,
  WorkstreamOfferStatus,
  WorkstreamOffer,
  CustomInvoice,
  Refund,
  Payout,
  Category,
  Review,
  SupportTicket,
  AuditLog,
  Message,
  UserEmail,
  SiteFeeSettings,
  WorkstreamUploadRecord,
  Notification,
  ExtensionRequest,
  ProjectClarification,
  PaymentMethodRecord,
  ClearingEarning
} from '../src/types.js';

export type {
  User,
  GigExtra,
  Gig,
  Project,
  Proposal,
  Order,
  Dispute,
  WorkstreamOfferKind,
  WorkstreamOfferStatus,
  WorkstreamOffer,
  CustomInvoice,
  Refund,
  Payout,
  Category,
  Review,
  SupportTicket,
  AuditLog,
  Message,
  UserEmail,
  SiteFeeSettings,
  WorkstreamUploadRecord,
  Notification,
  ExtensionRequest,
  ProjectClarification,
  PaymentMethodRecord,
  ClearingEarning
};

export interface StoreInterface {
  // Orders
  mapOrderRow?(r: any): Order;
  getOrder(id: string, client?: any): Promise<Order | undefined>;
  getOrderById(id: string, client?: any): Promise<Order | undefined>;
  listOrdersByWorkspaceId(workspaceId: string, client?: any): Promise<Order[]>;
  resolveWorkspaceActiveOrder(workspaceId: string, client?: any): Promise<Order | undefined>;
  saveOrder(order: Order, client?: any): Promise<void>;
  listOrders(): Promise<Order[]>;
  listOrdersForUser(userId: string): Promise<Order[]>;
  listOrdersByProjectId(projectId: string): Promise<Order[]>;
  updateOrderStatus(orderId: string, updates: Record<string, any>, allowedStatuses: string[], client?: any): Promise<boolean>;

  // Users
  getUser(id: string, client?: any): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByMobile(mobile: string): Promise<User | undefined>;
  getUserByEmailOrMobile(identifier: string): Promise<User | undefined>;
  saveUser(user: User, client?: any): Promise<void>;
  listUsers(): Promise<User[]>;
  listPublicUsers(): Promise<User[]>;

  // Gigs
  getGig(idOrSlug: string, client?: any): Promise<Gig | undefined>;
  listGigs(status?: string): Promise<Gig[]>;
  listGigsForFreelancer(freelancerId: string): Promise<Gig[]>;
  saveGig(gig: Gig, client?: any): Promise<void>;
  updateGig(id: string, updates: Record<string, any>, expectedFreelancerId?: string): Promise<Gig | null>;
  deleteGig(id: string): Promise<boolean>;

  // Projects
  getProject(idOrSlug: string, client?: any): Promise<Project | undefined>;
  listProjects(status?: string): Promise<Project[]>;
  listProjectsForBuyer(buyerId: string): Promise<Project[]>;
  saveProject(project: Project, client?: any): Promise<void>;
  deleteProject(id: string): Promise<boolean>;

  // Proposals
  getProposal(id: string, client?: any): Promise<Proposal | undefined>;
  listProposals(): Promise<Proposal[]>;
  listProposalsByProject(projectId: string): Promise<Proposal[]>;
  listProposalsByFreelancer(freelancerId: string): Promise<Proposal[]>;
  listProposalsForUser(userId: string): Promise<Proposal[]>;
  saveProposal(proposal: Proposal, client?: any): Promise<void>;

  // Offers
  getOfferById(id: string, client?: any): Promise<WorkstreamOffer | undefined>;
  listOffersForOrder(orderId: string, client?: any): Promise<WorkstreamOffer[]>;
  listOffersForWorkspace(workspaceId: string, fallbackOrderId?: string, client?: any): Promise<WorkstreamOffer[]>;
  saveOffer(offer: WorkstreamOffer, client?: any): Promise<void>;

  // Custom Invoices
  getCustomInvoiceById(id: string): Promise<CustomInvoice | undefined>;
  listCustomInvoicesForUser(userId: string): Promise<CustomInvoice[]>;
  saveCustomInvoice(invoice: CustomInvoice): Promise<void>;

  // Disputes
  getDisputeById(id: string, client?: any): Promise<Dispute | undefined>;
  getDisputeByOrderId(orderId: string, client?: any): Promise<Dispute | undefined>;
  saveDispute(dispute: Dispute, client?: any): Promise<void>;

  // Support Tickets
  getSupportTicketById(id: string): Promise<SupportTicket | undefined>;
  listSupportTicketsForUser(userId: string): Promise<SupportTicket[]>;
  listSupportTickets(): Promise<SupportTicket[]>;
  saveSupportTicket(ticket: SupportTicket): Promise<void>;

  // Payouts
  getPayoutById(id: string): Promise<Payout | null>;
  listPayoutsForUser(freelancerId: string): Promise<Payout[]>;
  listPayouts(): Promise<Payout[]>;
  savePayout(payout: Payout): Promise<void>;

  // Payment Methods
  getPaymentMethodById(id: string): Promise<PaymentMethodRecord | null>;
  listPaymentMethodsForUser(userId: string): Promise<PaymentMethodRecord[]>;
  savePaymentMethod(pm: PaymentMethodRecord): Promise<void>;
  deletePaymentMethod(id: string): Promise<void>;
  setDefaultPaymentMethod(userId: string, id: string): Promise<void>;

  // Clearing Earnings
  saveClearingEarning(e: ClearingEarning, client?: any): Promise<void>;
  listUnclearedEarningsForUser(sellerId: string, client?: any): Promise<ClearingEarning[]>;
  getUnclearedEarningsAmount(sellerId: string, client?: any): Promise<number>;

  // Audit Logs
  addAuditLog(l: AuditLog, client?: any): Promise<void>;
  listAuditLogs(): Promise<AuditLog[]>;

  // User Emails
  addUserEmail(em: UserEmail): Promise<void>;
  listUserEmailsForUser(userId: string): Promise<UserEmail[]>;
  markUserEmailRead(id: string, userId?: string): Promise<void>;

  // Notifications
  saveNotification(n: Notification, client?: any): Promise<{ inserted: boolean; duplicate?: boolean }>;
  listNotificationsForUser(userId: string): Promise<Notification[]>;
  markNotificationRead(id: string, userId: string): Promise<void>;
  markAllNotificationsRead(userId: string): Promise<void>;

  // Messages, Reviews, Uploads
  listMessages(orderId: string, client?: any): Promise<Message[]>;
  listMessagesForWorkspace(workspaceId: string, client?: any): Promise<Message[]>;
  getMessageByClientMsgId(orderId: string, senderId: string, clientMsgId: string): Promise<Message | undefined>;
  addMessage(message: Message, client?: any): Promise<void>;
  addReview(review: Review): Promise<void>;
  saveReview(review: Review): Promise<void>;
  upsertReview(review: Review): Promise<void>;
  getReview(id: string): Promise<Review | null>;
  getReviewById(id: string): Promise<Review | null>;
  listReviews(): Promise<Review[]>;
  getUploadRecord(filename: string): Promise<WorkstreamUploadRecord | undefined>;
  saveUploadRecord(filename: string, record: WorkstreamUploadRecord): Promise<void>;
  listUploadRecords(): Promise<Record<string, WorkstreamUploadRecord>>;
  deleteUploadRecord(filename: string): Promise<void>;

  // Transactions
  withTransaction<T>(fn: (client?: any) => Promise<T>): Promise<T>;
}

// Canonical Row Mappers
export function mapOrderRow(r: any): Order {
  if (!r) return undefined as any;
  const resolvedType = r.order_type || (r.project_id ? 'project' : 'gig');
  const parsedFeeBreakdown = typeof r.fee_breakdown === 'string' ? JSON.parse(r.fee_breakdown) : (r.fee_breakdown || undefined);
  const serviceFee = r.service_fee !== null && r.service_fee !== undefined
    ? Number(r.service_fee)
    : (parsedFeeBreakdown?.buyerFee ?? parsedFeeBreakdown?.serviceFee ?? 0);
  const smallOrderFee = r.small_order_fee !== null && r.small_order_fee !== undefined
    ? Number(r.small_order_fee)
    : (parsedFeeBreakdown?.smallOrderFee ?? 0);
  return {
    id: r.id,
    title: r.title,
    orderTitle: r.title,
    buyerId: r.buyer_id,
    sellerId: r.seller_id,
    clientId: r.client_id || r.buyer_id,
    freelancerId: r.freelancer_id || r.seller_id,
    amount: Number(r.amount),
    status: r.status,
    createdAt: r.created_at,
    updatedAt: r.updated_at instanceof Date ? r.updated_at.toISOString() : (r.updated_at || undefined),
    dueDate: r.due_date || r.created_at,
    completedAt: r.completed_at || undefined,
    requirements: r.requirements || undefined,
    deliverables: r.deliverables || undefined,
    deliverableFiles: typeof r.deliverable_files === 'string' ? JSON.parse(r.deliverable_files) : (r.deliverable_files || []),
    revisions: typeof r.revisions === 'string' ? JSON.parse(r.revisions) : (r.revisions || []),
    adminNotes: r.admin_notes || undefined,
    isMuted: Boolean(r.is_muted),
    escrowProtectionStartDate: r.escrow_protection_start_date || undefined,
    escrowProtectionEndDate: r.escrow_protection_end_date || undefined,
    gigId: r.gig_id || undefined,
    projectId: r.project_id || undefined,
    serviceUrl: r.service_url || undefined,
    gigSlug: r.gig_slug || undefined,
    sellerUsername: r.seller_username || undefined,
    buyerUsername: r.buyer_username || undefined,
    serviceTitle: r.service_title || undefined,
    serviceThumbnail: r.service_thumbnail || undefined,
    isTimerPaused: Boolean(r.is_timer_paused),
    feeBreakdown: parsedFeeBreakdown,
    serviceFee,
    smallOrderFee,
    deliveryHistory: typeof r.delivery_history === 'string' ? JSON.parse(r.delivery_history) : (r.delivery_history || []),
    deliveryNotes: r.delivery_notes || undefined,
    deliveryReference: r.delivery_reference || undefined,
    acceptedVersion: r.accepted_version ?? undefined,
    reviewWindowDays: r.review_window_days ?? undefined,
    reviewWindowExpiresAt: r.review_window_expires_at || undefined,
    review: typeof r.review === 'string' ? JSON.parse(r.review) : (r.review || undefined),
    workspaceId: r.workspace_id || undefined,
    sellerReview: typeof r.seller_review === 'string' ? JSON.parse(r.seller_review) : (r.seller_review || undefined),
    previousStatus: r.previous_status || undefined,
    orderType: resolvedType,
    type: resolvedType,
    gigOrderId: r.gig_order_id || (resolvedType === 'gig' ? r.id : undefined),
    projectOrderId: r.project_order_id || (resolvedType === 'project' ? r.id : undefined),
    proposalId: r.proposal_id || undefined,
    extensionRequests: typeof r.extension_requests === 'string' ? JSON.parse(r.extension_requests) : (r.extension_requests || []),
    freeExtensionUsed: Boolean(r.free_extension_used),
    cancellationRequest: typeof r.cancellation_request === 'string' ? JSON.parse(r.cancellation_request) : (r.cancellation_request || undefined),
    cancellationHistory: typeof r.cancellation_history === 'string' ? JSON.parse(r.cancellation_history) : (r.cancellation_history || []),
    cancellationType: r.cancellation_type || undefined,
    reviewWindowRestartedAt: r.review_window_restarted_at || undefined,
    responseDeadline: r.response_deadline || undefined,
    selectedExtras: typeof r.selected_extras === 'string' ? JSON.parse(r.selected_extras) : (r.selected_extras || undefined)
  } as unknown as Order;
}

export function mapUserRow(r: any): User {
  if (!r) return undefined as any;
  return {
    id: r.id,
    name: r.name,
    username: r.username || undefined,
    email: r.email,
    mobile: r.mobile || undefined,
    role: r.role,
    avatar: r.avatar || '',
    title: r.title || '',
    rating: Number(r.rating || 5.0),
    reviewsCount: Number(r.reviews_count || 0),
    hourlyRate: Number(r.hourly_rate || 0),
    earned: Number(r.earned || 0),
    completedJobs: Number(r.completed_jobs || 0),
    bio: r.bio || '',
    skills: typeof r.skills === 'string' ? JSON.parse(r.skills) : (r.skills || []),
    status: r.status,
    verified: Boolean(r.verified),
    emailVerified: Boolean(r.email_verified),
    mobileVerified: Boolean(r.mobile_verified),
    walletBalance: Number(r.wallet_balance || 0),
    createdAt: r.created_at,
    isFlagged: Boolean(r.is_flagged),
    flagReason: r.flag_reason || undefined,
    password: r.password || undefined,
    sessionVersion: Number(r.session_version || 1),
    knownDevices: typeof r.known_devices === 'string' ? JSON.parse(r.known_devices) : (r.known_devices || []),
    isAvailableNow: Boolean(r.is_available_now),
    notificationPreferences: typeof r.notification_preferences === 'string' ? JSON.parse(r.notification_preferences) : (r.notification_preferences || undefined)
  };
}

function unescapeHtml(str: string): string {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

export function mapGigRow(r: any): Gig {
  if (!r) return undefined as any;
  return {
    id: r.id,
    freelancerId: r.freelancer_id,
    freelancerName: r.freelancer_name,
    freelancerUsername: r.freelancer_username || r.freelancer_name?.toLowerCase().replace(/\s+/g, '_') || undefined,
    freelancerAvatar: r.freelancer_avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80',
    freelancerLevel: r.freelancer_level || 'Level 1 ★',
    title: unescapeHtml(r.title),
    slug: r.slug || r.title?.toLowerCase().trim().replace(/[^\w\s-]/g, '').replace(/[\s_-]+/g, '-').replace(/^-+|-+$/g, '') || undefined,
    category: r.category,
    subcategory: r.subcategory || 'General',
    description: unescapeHtml(r.description || ''),
    price: Number(r.price),
    deliveryDays: Number(r.delivery_days || 7),
    rating: Number(r.rating || 0),
    reviewsCount: Number(r.reviews_count || 0),
    image: r.image || 'https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=800&h=500&fit=crop',
    coverImage: r.cover_image || undefined,
    gallery: typeof r.gallery === 'string' ? JSON.parse(r.gallery) : (r.gallery || []),
    tags: typeof r.tags === 'string' ? JSON.parse(r.tags) : (r.tags || []),
    status: (() => {
      if (!r.status) return 'moderation';
      const st = String(r.status).toLowerCase().trim();
      if (st === 'active' || st === 'published') return 'active';
      if (st === 'paused') return 'paused';
      if (st === 'deleted') return 'deleted';
      if (st === 'pending' || st === 'draft' || st === 'moderation') return 'moderation';
      return 'moderation';
    })(),
    featured: Boolean(r.featured || r.is_featured),
    isFeatured: Boolean(r.is_featured || r.featured),
    featuredUntil: r.featured_until || undefined,
    extras: typeof r.extras === 'string' ? JSON.parse(r.extras) : (r.extras || []),
    moderationStatus: r.moderation_status || 'approved',
    moderationNotes: r.moderation_notes || undefined
  } as any;
}

export function mapProjectRow(r: any): Project {
  if (!r) return undefined as any;
  return {
    id: r.id,
    buyerId: r.buyer_id,
    buyerName: r.buyer_name,
    buyerAvatar: r.buyer_avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80',
    title: r.title,
    slug: r.slug || undefined,
    category: r.category,
    subcategory: r.subcategory || undefined,
    description: r.description || '',
    budgetMin: Number(r.budget_min),
    budgetMax: Number(r.budget_max),
    budget: r.budget ? Number(r.budget) : undefined,
    budgetType: r.budget_type || undefined,
    duration: r.duration || undefined,
    skills: typeof r.skills === 'string' ? JSON.parse(r.skills) : (r.skills || []),
    deadlineDays: Number(r.deadline_days),
    proposalsCount: Number(r.proposals_count || 0),
    createdAt: r.created_at,
    status: r.status,
    featured: Boolean(r.featured),
    moderationStatus: r.moderation_status || undefined,
    moderationNotes: r.moderation_notes || undefined,
    maxHires: r.max_hires ? Number(r.max_hires) : (r.freelancers_needed ? Number(r.freelancers_needed) : undefined),
    freelancersNeeded: r.freelancers_needed ? Number(r.freelancers_needed) : undefined
  };
}

export function mapProposalRow(r: any): Proposal {
  if (!r) return undefined as any;
  return {
    id: r.id,
    projectId: r.project_id,
    freelancerId: r.freelancer_id,
    freelancerName: r.freelancer_name,
    freelancerAvatar: r.freelancer_avatar || '',
    freelancerTitle: r.freelancer_title || '',
    coverLetter: r.cover_letter || '',
    bidAmount: Number(r.bid_amount),
    deliveryDays: Number(r.delivery_days),
    createdAt: r.created_at,
    status: r.status,
    workstreamOrderId: r.workstream_order_id || undefined,
    offerId: r.offer_id || undefined
  };
}

export function mapOfferRow(r: any): WorkstreamOffer {
  if (!r) return undefined as any;
  const meta = typeof r.metadata === 'string' ? JSON.parse(r.metadata) : (r.metadata || {});
  const originOrderId = meta.originOrderId || r.order_id;
  const resultingOrderId = meta.resultingOrderId || undefined;
  return {
    id: r.id,
    number: r.number || '',
    orderId: r.order_id,
    originOrderId,
    resultingOrderId,
    workspaceId: r.workspace_id || meta.workspaceId || undefined,
    kind: r.kind,
    title: r.title,
    amount: Number(r.amount),
    deliveryDays: r.delivery_days !== null && r.delivery_days !== undefined ? Number(r.delivery_days) : undefined,
    status: r.status,
    createdBy: r.created_by,
    createdAt: r.created_at,
    resolvedAt: r.resolved_at || undefined,
    resolvedBy: r.resolved_by || undefined,
    note: meta.note || undefined,
    files: meta.files || undefined,
    reference: meta.reference || undefined,
    responseDeadline: meta.responseDeadline || undefined,
    rejectionReason: meta.rejectionReason || undefined,
    rejectedBy: meta.rejectedBy || undefined,
    rejectedAt: meta.rejectedAt || undefined,
    proposalId: meta.proposalId || undefined,
    metadata: meta
  };
}

export function mapCustomInvoiceRow(r: any): CustomInvoice {
  if (!r) return undefined as any;
  return {
    id: r.id,
    invoiceNumber: r.invoice_number,
    buyerId: r.buyer_id,
    sellerId: r.seller_id,
    amount: Number(r.amount),
    total: Number(r.amount),
    status: r.status,
    description: r.description || undefined,
    createdAt: r.created_at,
    paidAt: r.paid_at || undefined,
    relatedOrderId: r.related_order_id || undefined
  };
}

export function mapDisputeRow(r: any): Dispute {
  if (!r) return undefined as any;
  return {
    id: r.id,
    orderId: r.order_id,
    buyerId: r.buyer_id || undefined,
    sellerId: r.seller_id || undefined,
    raisedBy: r.raised_by,
    reason: r.reason,
    evidence: r.evidence || '',
    status: r.status,
    createdAt: r.created_at,
    resolutionNotes: r.resolution_notes || undefined,
    resolutionType: r.resolution_type || undefined,
    notes: r.notes || undefined,
    assignedTo: r.assigned_to || undefined
  };
}

export function mapSupportTicketRow(r: any): SupportTicket {
  if (!r) return undefined as any;
  const msgs = typeof r.messages === 'string' ? JSON.parse(r.messages) : (r.messages || []);
  const appealContext = typeof r.appeal_context === 'string' ? JSON.parse(r.appeal_context) : (r.appeal_context || undefined);
  return {
    id: r.id,
    userId: r.user_id,
    userName: r.user_name,
    subject: r.subject,
    priority: r.priority || 'medium',
    status: r.status || 'open',
    createdAt: r.created_at,
    messages: msgs,
    isAppeal: Boolean(r.is_appeal),
    category: r.category || undefined,
    appealContext
  };
}

export function mapPayoutRow(r: any): Payout {
  if (!r) return undefined as any;
  return {
    id: r.id,
    freelancerId: r.freelancer_id,
    amount: Number(r.amount),
    method: r.method,
    status: r.status,
    createdAt: r.created_at,
    accountDetails: r.account_details || ''
  };
}

export function mapReviewRow(r: any): Review {
  if (!r) return undefined as any;
  return {
    id: r.id,
    orderId: r.order_id || undefined,
    reviewerId: r.reviewer_id || undefined,
    reviewerName: r.reviewer_name || undefined,
    reviewerAvatar: r.reviewer_avatar || undefined,
    targetUserId: r.target_user_id || undefined,
    rating: Number(r.rating),
    comment: r.comment || undefined,
    orderTitle: r.order_title || undefined,
    gigId: r.gig_id || undefined,
    projectId: r.project_id || undefined,
    createdAt: r.created_at || undefined,
    updatedAt: r.updated_at || undefined,
    isCancelledOrder: Boolean(r.is_cancelled_order),
    reply: typeof r.reply === 'string' ? JSON.parse(r.reply) : (r.reply || undefined),
    ...(r.moderation_status ? { moderationStatus: r.moderation_status } : {})
  };
}

export function mapRefundRow(r: any): Refund {
  if (!r) return undefined as any;
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

export function mapPaymentMethodRow(r: any): PaymentMethodRecord {
  if (!r) return undefined as any;
  const details = typeof r.details === 'string' ? JSON.parse(r.details) : (r.details || {});
  return {
    id: r.id,
    userId: r.user_id,
    type: r.type,
    name: r.name,
    details,
    isDefault: Boolean(r.is_default),
    createdAt: r.created_at
  };
}

export function mapClearingEarningRow(r: any): ClearingEarning {
  if (!r) return undefined as any;
  const rawClearsAt = r.clearance_end || r.clears_at;
  return {
    orderId: r.order_id,
    sellerId: r.seller_id,
    amount: Number(r.amount),
    clearsAt: rawClearsAt instanceof Date ? rawClearsAt.toISOString() : String(rawClearsAt || '')
  };
}

export class PostgresAsyncStore implements StoreInterface {
  mapOrderRow(r: any): Order {
    return mapOrderRow(r);
  }

  async getOrderById(id: string, client?: any): Promise<Order | undefined> {
    return postgresStore.getOrderById(id, client);
  }

  async listOrdersByWorkspaceId(workspaceId: string, client?: any): Promise<Order[]> {
    return postgresStore.listOrdersByWorkspaceId(workspaceId, client);
  }

  async resolveWorkspaceActiveOrder(workspaceId: string, client?: any): Promise<Order | undefined> {
    return postgresStore.resolveWorkspaceActiveOrder(workspaceId, client);
  }

  async getOrder(id: string, client?: any): Promise<Order | undefined> {
    if (!id) return undefined;
    const direct = await this.getOrderById(id, client);
    if (direct) return direct;
    return this.resolveWorkspaceActiveOrder(id, client);
  }

  async listOrders(): Promise<Order[]> {
    const res = await postgresStore.getPool().query('SELECT * FROM orders ORDER BY updated_at DESC NULLS LAST, created_at DESC, id DESC');
    return res.rows.map(mapOrderRow);
  }

  async listOrdersForUser(userId: string): Promise<Order[]> {
    const res = await postgresStore.getPool().query(
      'SELECT * FROM orders WHERE buyer_id = $1 OR seller_id = $1 ORDER BY updated_at DESC NULLS LAST, created_at DESC, id DESC',
      [userId]
    );
    return res.rows.map(mapOrderRow);
  }

  async listOrdersByProjectId(projectId: string): Promise<Order[]> {
    const res = await postgresStore.getPool().query(
      'SELECT * FROM orders WHERE project_id = $1 ORDER BY created_at DESC',
      [projectId]
    );
    return res.rows.map(mapOrderRow);
  }

  async getUser(id: string, client?: any): Promise<User | undefined> {
    const dbRunner = client || postgresStore.getPool();
    const res = await dbRunner.query('SELECT * FROM users WHERE id = $1', [id]);
    if (res.rows.length > 0) return mapUserRow(res.rows[0]);
    return undefined;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    if (!email) return undefined;
    const res = await postgresStore.getPool().query(
      'SELECT * FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1',
      [email.trim()]
    );
    if (res.rows.length > 0) return mapUserRow(res.rows[0]);
    return undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    if (!username) return undefined;
    const res = await postgresStore.getPool().query(
      'SELECT * FROM users WHERE LOWER(username) = LOWER($1) LIMIT 1',
      [username.trim()]
    );
    if (res.rows.length > 0) return mapUserRow(res.rows[0]);
    return undefined;
  }

  async getUserByMobile(mobile: string): Promise<User | undefined> {
    if (!mobile) return undefined;
    const res = await postgresStore.getPool().query(
      'SELECT * FROM users WHERE mobile = $1 LIMIT 1',
      [mobile.trim()]
    );
    if (res.rows.length > 0) return mapUserRow(res.rows[0]);
    return undefined;
  }

  async getUserByEmailOrMobile(identifier: string): Promise<User | undefined> {
    if (!identifier) return undefined;
    const clean = identifier.trim();
    const res = await postgresStore.getPool().query(
      'SELECT * FROM users WHERE LOWER(email) = LOWER($1) OR mobile = $1 LIMIT 1',
      [clean]
    );
    if (res.rows.length > 0) return mapUserRow(res.rows[0]);
    return undefined;
  }

  async listUsers(): Promise<User[]> {
    const res = await postgresStore.getPool().query("SELECT * FROM users WHERE id != 'system' ORDER BY created_at DESC");
    return res.rows.map(mapUserRow);
  }

  async listPublicUsers(): Promise<User[]> {
    const res = await postgresStore.getPool().query("SELECT * FROM users WHERE status = 'active' AND id != 'system' ORDER BY rating DESC, earned DESC");
    return res.rows.map(mapUserRow);
  }

  async getGig(idOrSlug: string, client?: any): Promise<Gig | undefined> {
    const dbRunner = client || postgresStore.getPool();
    const res = await dbRunner.query(
      'SELECT * FROM gigs WHERE id = $1 OR slug = $1 ORDER BY (CASE WHEN id = $1 THEN 0 ELSE 1 END) ASC LIMIT 1',
      [idOrSlug]
    );
    if (res.rows.length > 0) return mapGigRow(res.rows[0]);
    return undefined;
  }

  async listGigs(status?: string): Promise<Gig[]> {
    let query = 'SELECT * FROM gigs ORDER BY created_at DESC';
    let params: any[] = [];
    if (status) {
      query = 'SELECT * FROM gigs WHERE status = $1 ORDER BY created_at DESC';
      params = [status];
    }
    const res = await postgresStore.getPool().query(query, params);
    return res.rows.map(mapGigRow);
  }

  async listGigsForFreelancer(freelancerId: string): Promise<Gig[]> {
    const res = await postgresStore.getPool().query(
      'SELECT * FROM gigs WHERE freelancer_id = $1 ORDER BY created_at DESC',
      [freelancerId]
    );
    return res.rows.map(mapGigRow);
  }

  async saveGig(g: Gig, client?: any): Promise<void> {
    const dbRunner = client || postgresStore.getPool();
    let slug = g.slug || g.title?.toLowerCase().trim().replace(/[^\w\s-]/g, '').replace(/[\s_-]+/g, '-').replace(/^-+|-+$/g, '') || 'gig-' + g.id;
    if (slug.length < 2) slug = 'gig-' + g.id;

    try {
      const collisionRes = await dbRunner.query(
        'SELECT id FROM gigs WHERE slug = $1 AND id != $2 LIMIT 1',
        [slug, g.id]
      );
      if (collisionRes.rows.length > 0) {
        slug = `${slug}-${g.id}`;
      }
    } catch {}

    const executeInsert = async (targetSlug: string) => {
      await dbRunner.query(
        `INSERT INTO gigs (
          id, freelancer_id, freelancer_name, freelancer_username, freelancer_avatar, freelancer_level,
          title, slug, category, subcategory, description, price, delivery_days, rating, reviews_count,
          image, cover_image, gallery, tags, status, featured, is_featured, featured_until, extras, moderation_status, moderation_notes
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26
        )
        ON CONFLICT (id) DO UPDATE SET
          freelancer_id = EXCLUDED.freelancer_id,
          freelancer_name = EXCLUDED.freelancer_name,
          freelancer_username = EXCLUDED.freelancer_username,
          freelancer_avatar = EXCLUDED.freelancer_avatar,
          freelancer_level = EXCLUDED.freelancer_level,
          title = EXCLUDED.title,
          slug = EXCLUDED.slug,
          category = EXCLUDED.category,
          subcategory = EXCLUDED.subcategory,
          description = EXCLUDED.description,
          price = EXCLUDED.price,
          delivery_days = EXCLUDED.delivery_days,
          rating = COALESCE(gigs.rating, EXCLUDED.rating),
          reviews_count = COALESCE(gigs.reviews_count, EXCLUDED.reviews_count),
          image = EXCLUDED.image,
          cover_image = EXCLUDED.cover_image,
          gallery = EXCLUDED.gallery,
          tags = EXCLUDED.tags,
          status = CASE 
            WHEN gigs.status = 'deleted' THEN 'deleted' 
            WHEN gigs.moderation_status IN ('rejected', 'flagged') AND EXCLUDED.status = 'active' THEN gigs.status 
            ELSE EXCLUDED.status 
          END,
          featured = (
            CASE 
              WHEN (EXCLUDED.featured_until IS NOT NULL AND EXCLUDED.featured_until::timestamptz > NOW()) THEN TRUE
              WHEN (gigs.featured_until IS NOT NULL AND gigs.featured_until::timestamptz > NOW()) THEN TRUE
              ELSE FALSE
            END
          ),
          is_featured = (
            CASE 
              WHEN (EXCLUDED.featured_until IS NOT NULL AND EXCLUDED.featured_until::timestamptz > NOW()) THEN TRUE
              WHEN (gigs.featured_until IS NOT NULL AND gigs.featured_until::timestamptz > NOW()) THEN TRUE
              ELSE FALSE
            END
          ),
          featured_until = (
            CASE
              WHEN EXCLUDED.featured_until IS NOT NULL AND gigs.featured_until IS NOT NULL THEN
                CASE WHEN EXCLUDED.featured_until::timestamptz > gigs.featured_until::timestamptz THEN EXCLUDED.featured_until ELSE gigs.featured_until END
              WHEN EXCLUDED.featured_until IS NOT NULL THEN EXCLUDED.featured_until
              ELSE gigs.featured_until
            END
          ),
          extras = EXCLUDED.extras,
          moderation_status = CASE 
            WHEN gigs.moderation_status IN ('rejected', 'flagged') AND EXCLUDED.moderation_status NOT IN ('rejected', 'flagged') THEN gigs.moderation_status 
            ELSE EXCLUDED.moderation_status 
          END,
          moderation_notes = COALESCE(EXCLUDED.moderation_notes, gigs.moderation_notes)`,
        [
          g.id, g.freelancerId, g.freelancerName, g.freelancerUsername || null, g.freelancerAvatar || null, g.freelancerLevel || null,
          g.title, targetSlug, g.category, g.subcategory || null, g.description || '', g.price, g.deliveryDays, g.rating ?? 5.0, g.reviewsCount ?? 0,
          g.image || null, g.coverImage || null, g.gallery || [], g.tags || [], g.status || 'active',
          Boolean(g.featured), Boolean(g.featured || (g as any).isFeatured), (g as any).featuredUntil || null,
          JSON.stringify(g.extras || []), g.moderationStatus || 'approved', g.moderationNotes || null
        ]
      );
    };

    const isSlugConflict = (err: any) =>
      err?.code === '23505' &&
      (err?.constraint === 'idx_gigs_unique_slug' || String(err?.message || '').includes('idx_gigs_unique_slug'));

    try {
      await executeInsert(slug);
    } catch (err: any) {
      if (isSlugConflict(err)) {
        const fallbackSlug = `${slug}-${g.id}`;
        try {
          await executeInsert(fallbackSlug);
        } catch (retryErr: any) {
          if (isSlugConflict(retryErr)) {
            await executeInsert(`${fallbackSlug}-${Date.now().toString(36)}`);
          } else {
            throw retryErr;
          }
        }
      } else {
        throw err;
      }
    }
  }

  async updateGig(id: string, updates: Record<string, any>, expectedFreelancerId?: string): Promise<Gig | null> {
    const fieldMap: Record<string, string> = {
      title: 'title',
      slug: 'slug',
      category: 'category',
      subcategory: 'subcategory',
      description: 'description',
      price: 'price',
      deliveryDays: 'delivery_days',
      image: 'image',
      coverImage: 'cover_image',
      gallery: 'gallery',
      tags: 'tags',
      extras: 'extras',
      status: 'status',
      moderationStatus: 'moderation_status',
      moderationNotes: 'moderation_notes',
      freelancerName: 'freelancer_name',
      freelancerUsername: 'freelancer_username',
      freelancerAvatar: 'freelancer_avatar',
      freelancerLevel: 'freelancer_level'
    };

    const setClauses: string[] = [];
    const values: any[] = [];
    let idx = 1;

    for (const [key, col] of Object.entries(fieldMap)) {
      if (updates[key] !== undefined) {
        let val = updates[key];
        if (key === 'extras') {
          val = JSON.stringify(val || []);
        }
        setClauses.push(`${col} = $${idx}`);
        values.push(val);
        idx++;
      }
    }

    if (setClauses.length === 0) {
      const existing = await this.getGig(id);
      return existing || null;
    }

    setClauses.push('updated_at = NOW()');

    let whereClause = `WHERE id = $${idx} AND status != 'deleted'`;
    values.push(id);
    idx++;

    if (expectedFreelancerId) {
      whereClause += ` AND freelancer_id = $${idx}`;
      values.push(expectedFreelancerId);
      idx++;
    }

    const runUpdate = async (overrideSlug?: string) => {
      const localClauses = [...setClauses];
      const localValues = [...values];
      if (overrideSlug !== undefined) {
        const slugIdx = localClauses.findIndex(c => c.startsWith('slug = '));
        if (slugIdx >= 0) {
          const match = localClauses[slugIdx].match(/\$(\d+)/);
          if (match) {
            const paramNum = parseInt(match[1], 10);
            localValues[paramNum - 1] = overrideSlug;
          }
        }
      }
      const query = `
        UPDATE gigs
        SET ${localClauses.join(', ')}
        ${whereClause}
        RETURNING *
      `;
      return await postgresStore.getPool().query(query, localValues);
    };

    try {
      const res = await runUpdate();
      if (res.rows.length === 0) return null;
      return mapGigRow(res.rows[0]);
    } catch (err: any) {
      const isSlugConflict = (e: any) =>
        e?.code === '23505' &&
        (e?.constraint === 'idx_gigs_unique_slug' || String(e?.message || '').includes('idx_gigs_unique_slug'));

      if (isSlugConflict(err) && updates.slug) {
        const fallbackSlug = `${updates.slug}-${id}`;
        try {
          const res = await runUpdate(fallbackSlug);
          if (res.rows.length === 0) return null;
          return mapGigRow(res.rows[0]);
        } catch (retryErr: any) {
          if (isSlugConflict(retryErr)) {
            const res = await runUpdate(`${fallbackSlug}-${Date.now().toString(36)}`);
            if (res.rows.length === 0) return null;
            return mapGigRow(res.rows[0]);
          }
          throw retryErr;
        }
      }
      throw err;
    }
  }

  async deleteGig(id: string): Promise<boolean> {
    const res = await postgresStore.getPool().query("UPDATE gigs SET status = 'deleted' WHERE id = $1", [id]);
    return res.rowCount !== null && res.rowCount > 0;
  }

  async getProject(idOrSlug: string, client?: any): Promise<Project | undefined> {
    const dbRunner = client || postgresStore.getPool();
    const res = await dbRunner.query(
      'SELECT * FROM projects WHERE id = $1 OR slug = $1 LIMIT 1',
      [idOrSlug]
    );
    if (res.rows.length > 0) return mapProjectRow(res.rows[0]);
    return undefined;
  }

  async listProjects(status?: string): Promise<Project[]> {
    let query = 'SELECT * FROM projects ORDER BY created_at DESC';
    let params: any[] = [];
    if (status) {
      query = 'SELECT * FROM projects WHERE status = $1 ORDER BY created_at DESC';
      params = [status];
    }
    const res = await postgresStore.getPool().query(query, params);
    return res.rows.map(mapProjectRow);
  }

  async listProjectsForBuyer(buyerId: string): Promise<Project[]> {
    const res = await postgresStore.getPool().query(
      'SELECT * FROM projects WHERE buyer_id = $1 ORDER BY created_at DESC',
      [buyerId]
    );
    return res.rows.map(mapProjectRow);
  }

  async saveProject(p: Project, client?: any): Promise<void> {
    const dbRunner = client || postgresStore.getPool();
    const slug = p.slug || p.title?.toLowerCase().trim().replace(/[^\w\s-]/g, '').replace(/[\s_-]+/g, '-').replace(/^-+|-+$/g, '') || 'project-' + p.id;
    await dbRunner.query(
      `INSERT INTO projects (
        id, buyer_id, buyer_name, buyer_avatar, title, slug, category, subcategory,
        description, budget_min, budget_max, deadline_days, proposals_count, created_at,
        status, featured, moderation_status, moderation_notes, budget_type, budget, duration, skills,
        max_hires, freelancers_needed
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24
      )
      ON CONFLICT (id) DO UPDATE SET
        buyer_id = EXCLUDED.buyer_id,
        buyer_name = EXCLUDED.buyer_name,
        buyer_avatar = EXCLUDED.buyer_avatar,
        title = EXCLUDED.title,
        slug = EXCLUDED.slug,
        category = EXCLUDED.category,
        subcategory = EXCLUDED.subcategory,
        description = EXCLUDED.description,
        budget_min = EXCLUDED.budget_min,
        budget_max = EXCLUDED.budget_max,
        deadline_days = EXCLUDED.deadline_days,
        proposals_count = EXCLUDED.proposals_count,
        created_at = EXCLUDED.created_at,
        status = EXCLUDED.status,
        featured = EXCLUDED.featured,
        moderation_status = EXCLUDED.moderation_status,
        moderation_notes = EXCLUDED.moderation_notes,
        budget_type = EXCLUDED.budget_type,
        budget = EXCLUDED.budget,
        duration = EXCLUDED.duration,
        skills = EXCLUDED.skills,
        max_hires = EXCLUDED.max_hires,
        freelancers_needed = EXCLUDED.freelancers_needed`,
      [
        p.id, p.buyerId, p.buyerName, p.buyerAvatar || null, p.title, slug, p.category, p.subcategory || null,
        p.description || '', p.budgetMin ?? 0, p.budgetMax ?? 0, p.deadlineDays ?? 7, p.proposalsCount ?? 0, p.createdAt || new Date().toISOString(),
        p.status || 'open', Boolean(p.featured), p.moderationStatus || 'approved', p.moderationNotes || null,
        p.budgetType || null, p.budget ?? null, p.duration || null, p.skills || [],
        Math.max(1, Number(p.maxHires || (p as any).freelancersNeeded || 1)),
        Math.max(1, Number((p as any).freelancersNeeded || p.maxHires || 1))
      ]
    );
  }

  async deleteProject(id: string): Promise<boolean> {
    const res = await postgresStore.getPool().query('DELETE FROM projects WHERE id = $1', [id]);
    return res.rowCount !== null && res.rowCount > 0;
  }

  async getProposal(id: string, client?: any): Promise<Proposal | undefined> {
    const dbRunner = client || postgresStore.getPool();
    const res = await dbRunner.query('SELECT * FROM proposals WHERE id = $1', [id]);
    if (res.rows.length > 0) return mapProposalRow(res.rows[0]);
    return undefined;
  }

  async listProposals(): Promise<Proposal[]> {
    const res = await postgresStore.getPool().query('SELECT * FROM proposals ORDER BY created_at DESC');
    return res.rows.map(mapProposalRow);
  }

  async listProposalsByProject(projectId: string): Promise<Proposal[]> {
    const res = await postgresStore.getPool().query(
      'SELECT * FROM proposals WHERE project_id = $1 ORDER BY created_at DESC',
      [projectId]
    );
    return res.rows.map(mapProposalRow);
  }

  async listProposalsByFreelancer(freelancerId: string): Promise<Proposal[]> {
    const res = await postgresStore.getPool().query(
      'SELECT * FROM proposals WHERE freelancer_id = $1 ORDER BY created_at DESC',
      [freelancerId]
    );
    return res.rows.map(mapProposalRow);
  }

  async listProposalsForUser(userId: string): Promise<Proposal[]> {
    const queryText = `
      SELECT p.* FROM proposals p
      LEFT JOIN projects pr ON p.project_id = pr.id
      WHERE p.freelancer_id = $1 OR pr.buyer_id = $1
      ORDER BY p.created_at DESC
    `;
    const res = await postgresStore.getPool().query(queryText, [userId]);
    return res.rows.map(mapProposalRow);
  }

  async saveProposal(p: Proposal, client?: any): Promise<void> {
    const dbRunner = client || postgresStore.getPool();
    await dbRunner.query(
      `INSERT INTO proposals (
        id, project_id, freelancer_id, freelancer_name, freelancer_avatar, freelancer_title,
        cover_letter, bid_amount, delivery_days, created_at, status, workstream_order_id, offer_id
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
      )
      ON CONFLICT (id) DO UPDATE SET
        project_id = EXCLUDED.project_id,
        freelancer_id = EXCLUDED.freelancer_id,
        freelancer_name = EXCLUDED.freelancer_name,
        freelancer_avatar = EXCLUDED.freelancer_avatar,
        freelancer_title = EXCLUDED.freelancer_title,
        cover_letter = EXCLUDED.cover_letter,
        bid_amount = EXCLUDED.bid_amount,
        delivery_days = EXCLUDED.delivery_days,
        created_at = EXCLUDED.created_at,
        status = EXCLUDED.status,
        workstream_order_id = EXCLUDED.workstream_order_id,
        offer_id = EXCLUDED.offer_id`,
      [
        p.id, p.projectId, p.freelancerId, p.freelancerName, p.freelancerAvatar || null, p.freelancerTitle || null,
        p.coverLetter || '', p.bidAmount, p.deliveryDays, p.createdAt || new Date().toISOString(), p.status || 'pending',
        p.workstreamOrderId || null, p.offerId || null
      ]
    );
  }

  async saveOrder(order: Order, client?: any): Promise<void> {
    const dbRunner = client || postgresStore.getPool();
    const resolvedOrderType = order.orderType || (order as any).type || (order.projectId ? 'project' : 'gig');
    const serviceFee = (order as any).serviceFee ?? (order.feeBreakdown as any)?.buyerFee ?? (order.feeBreakdown as any)?.serviceFee ?? 0;
    const smallOrderFee = (order as any).smallOrderFee ?? (order.feeBreakdown as any)?.smallOrderFee ?? 0;
    const selectedExtrasJson = (order as any).selectedExtras !== undefined
      ? JSON.stringify((order as any).selectedExtras)
      : null;
    await dbRunner.query(
      `INSERT INTO orders (
        id, title, buyer_id, seller_id, client_id, freelancer_id, amount, status, created_at, due_date, completed_at, 
        requirements, deliverables, deliverable_files, revisions, admin_notes, is_muted, 
        escrow_protection_start_date, escrow_protection_end_date, gig_id, project_id, 
        service_url, gig_slug, seller_username, buyer_username, service_title, service_thumbnail, 
        is_timer_paused, fee_breakdown, delivery_history, delivery_notes, delivery_reference, 
        accepted_version, review_window_days, review_window_expires_at, review,
        workspace_id, seller_review, previous_status,
        order_type, gig_order_id, project_order_id, proposal_id, extension_requests,
        free_extension_used, cancellation_request, cancellation_history, cancellation_type,
        review_window_restarted_at, response_deadline,
        service_fee, small_order_fee, selected_extras, updated_at
      ) VALUES (
        $1, $2, $3, $4, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19,
        $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37,
        $38, $39, $40, $41, $42, $43, $44, $45, $46, $47, $48,
        $49, $50, $51, NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        buyer_id = EXCLUDED.buyer_id,
        seller_id = EXCLUDED.seller_id,
        client_id = COALESCE(EXCLUDED.client_id, orders.client_id, EXCLUDED.buyer_id),
        freelancer_id = COALESCE(EXCLUDED.freelancer_id, orders.freelancer_id, EXCLUDED.seller_id),
        amount = EXCLUDED.amount,
        service_fee = EXCLUDED.service_fee,
        small_order_fee = EXCLUDED.small_order_fee,
        selected_extras = COALESCE(EXCLUDED.selected_extras, orders.selected_extras),
        status = CASE
          WHEN orders.status IN ('completed', 'cancelled', 'refunded') THEN orders.status
          ELSE EXCLUDED.status
        END,
        created_at = EXCLUDED.created_at,
        due_date = EXCLUDED.due_date,
        completed_at = CASE
          WHEN orders.status IN ('completed', 'cancelled', 'refunded') THEN orders.completed_at
          ELSE COALESCE(EXCLUDED.completed_at, orders.completed_at)
        END,
        requirements = EXCLUDED.requirements,
        deliverables = EXCLUDED.deliverables,
        deliverable_files = EXCLUDED.deliverable_files,
        revisions = EXCLUDED.revisions,
        admin_notes = EXCLUDED.admin_notes,
        is_muted = EXCLUDED.is_muted,
        escrow_protection_start_date = EXCLUDED.escrow_protection_start_date,
        escrow_protection_end_date = EXCLUDED.escrow_protection_end_date,
        gig_id = EXCLUDED.gig_id,
        project_id = EXCLUDED.project_id,
        service_url = EXCLUDED.service_url,
        gig_slug = EXCLUDED.gig_slug,
        seller_username = EXCLUDED.seller_username,
        buyer_username = EXCLUDED.buyer_username,
        service_title = EXCLUDED.service_title,
        service_thumbnail = EXCLUDED.service_thumbnail,
        is_timer_paused = EXCLUDED.is_timer_paused,
        fee_breakdown = EXCLUDED.fee_breakdown,
        delivery_history = EXCLUDED.delivery_history,
        delivery_notes = EXCLUDED.delivery_notes,
        delivery_reference = EXCLUDED.delivery_reference,
        accepted_version = COALESCE(EXCLUDED.accepted_version, orders.accepted_version),
        review_window_days = EXCLUDED.review_window_days,
        review_window_expires_at = EXCLUDED.review_window_expires_at,
        review = EXCLUDED.review,
        workspace_id = EXCLUDED.workspace_id,
        seller_review = EXCLUDED.seller_review,
        previous_status = EXCLUDED.previous_status,
        order_type = EXCLUDED.order_type,
        gig_order_id = EXCLUDED.gig_order_id,
        project_order_id = EXCLUDED.project_order_id,
        proposal_id = EXCLUDED.proposal_id,
        extension_requests = EXCLUDED.extension_requests,
        free_extension_used = EXCLUDED.free_extension_used,
        cancellation_request = EXCLUDED.cancellation_request,
        cancellation_history = EXCLUDED.cancellation_history,
        cancellation_type = CASE
          WHEN orders.status IN ('completed', 'cancelled', 'refunded') THEN orders.cancellation_type
          ELSE COALESCE(EXCLUDED.cancellation_type, orders.cancellation_type)
        END,
        review_window_restarted_at = EXCLUDED.review_window_restarted_at,
        response_deadline = EXCLUDED.response_deadline,
        updated_at = NOW()`,
      [
        order.id, order.title || (order as any).orderTitle || 'Untitled Order', order.buyerId, order.sellerId, order.amount, order.status,
        order.createdAt || new Date().toISOString(), order.dueDate || order.createdAt || new Date().toISOString(), order.completedAt || null, order.requirements || null,
        order.deliverables || null, JSON.stringify(order.deliverableFiles || []),
        JSON.stringify(order.revisions || []), order.adminNotes || null, Boolean(order.isMuted),
        order.escrowProtectionStartDate || null, order.escrowProtectionEndDate || null,
        order.gigId || null, order.projectId || null, order.serviceUrl || null,
        order.gigSlug || null, order.sellerUsername || null, order.buyerUsername || null,
        order.serviceTitle || null, order.serviceThumbnail || null, Boolean(order.isTimerPaused),
        JSON.stringify(order.feeBreakdown || null), JSON.stringify(order.deliveryHistory || []),
        order.deliveryNotes || null, order.deliveryReference || null, order.acceptedVersion ?? null,
        order.reviewWindowDays ?? null, order.reviewWindowExpiresAt || null, JSON.stringify(order.review || null),
        (order as any).workspaceId || null, JSON.stringify((order as any).sellerReview || null), (order as any).previousStatus || null,
        resolvedOrderType,
        order.gigOrderId || (resolvedOrderType === 'gig' ? order.id : null),
        order.projectOrderId || (resolvedOrderType === 'project' ? order.id : null),
        order.proposalId || null,
        JSON.stringify(order.extensionRequests || []),
        Boolean(order.freeExtensionUsed),
        JSON.stringify(order.cancellationRequest || null),
        JSON.stringify(order.cancellationHistory || []),
        order.cancellationType || null,
        order.reviewWindowRestartedAt || null,
        order.responseDeadline || null,
        serviceFee,
        smallOrderFee,
        selectedExtrasJson
      ]
    );
  }

  async updateOrderStatus(orderId: string, updates: Record<string, any>, allowedStatuses: string[], client?: any): Promise<boolean> {
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


  async listMessages(orderId: string, client?: any): Promise<Message[]> {
    const dbRunner = client || postgresStore.getPool();
    const res = await dbRunner.query(
      'SELECT * FROM messages WHERE order_id = $1 ORDER BY timestamp ASC, id ASC',
      [orderId]
    );
    return res.rows.map((r: any) => ({
      id: r.id,
      orderId: r.order_id,
      senderId: r.sender_id,
      senderName: r.sender_name,
      text: r.text,
      timestamp: r.timestamp,
      type: r.type || undefined,
      fileInfo: r.file_info || undefined,
      metadata: r.metadata || undefined
    }));
  }

  async listMessagesForWorkspace(workspaceId: string, client?: any): Promise<Message[]> {
    return postgresStore.listMessagesForWorkspace(workspaceId, client);
  }

  async getMessageByClientMsgId(orderIdOrWorkspaceId: string, senderId: string, clientMsgId: string): Promise<Message | undefined> {
    const res = await postgresStore.getPool().query(
      `SELECT * FROM messages 
       WHERE (order_id = $1 OR workspace_id = $1 OR metadata->>'workspaceId' = $1)
         AND sender_id = $2 
         AND metadata->>'clientMessageId' = $3 
       LIMIT 1`,
      [orderIdOrWorkspaceId, senderId, clientMsgId]
    );
    if (res.rows.length > 0) {
      const r = res.rows[0];
      return {
        id: r.id,
        orderId: r.order_id || undefined,
        workspaceId: r.workspace_id || r.metadata?.workspaceId || undefined,
        senderId: r.sender_id,
        senderName: r.sender_name,
        text: r.text,
        timestamp: r.timestamp,
        type: r.type || undefined,
        fileInfo: r.file_info || undefined,
        metadata: r.metadata || undefined
      };
    }
    return undefined;
  }

  async addMessage(message: Message, client?: any): Promise<void> {
    const dbRunner = client || postgresStore.getPool();
    if (message.senderId === 'system') {
      await dbRunner.query(
        `INSERT INTO users (id, name, username, email, role, status, verified, email_verified, mobile_verified, wallet_balance, created_at)
         VALUES ('system', 'WorkSphere System', 'system', 'system@worksphere.internal', 'internal', 'active', TRUE, TRUE, TRUE, 0, $1)
         ON CONFLICT (id) DO NOTHING`,
        [message.timestamp || new Date().toISOString()]
      );
    }
    const wsId = (message as any).workspaceId || message.metadata?.workspaceId || null;
    await dbRunner.query(
      `INSERT INTO messages (id, order_id, sender_id, sender_name, text, timestamp, type, file_info, metadata, workspace_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (id) DO UPDATE SET
         order_id = EXCLUDED.order_id,
         sender_id = EXCLUDED.sender_id,
         sender_name = EXCLUDED.sender_name,
         text = EXCLUDED.text,
         timestamp = EXCLUDED.timestamp,
         type = EXCLUDED.type,
         file_info = EXCLUDED.file_info,
         metadata = EXCLUDED.metadata,
         workspace_id = COALESCE(EXCLUDED.workspace_id, messages.workspace_id)`,
      [
        message.id, message.orderId || null, message.senderId, message.senderName, message.text, message.timestamp,
        message.type || 'message', JSON.stringify(message.fileInfo || null), JSON.stringify(message.metadata || null),
        wsId
      ]
    );
  }

  async addReview(review: Review): Promise<void> {
    await postgresStore.getPool().query(
      `INSERT INTO reviews (
        id, order_id, reviewer_id, reviewer_name, reviewer_avatar, target_user_id, 
        rating, comment, order_title, gig_id, project_id, created_at, updated_at, is_cancelled_order, reply, moderation_status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      ON CONFLICT (id) DO UPDATE SET
        order_id = EXCLUDED.order_id,
        reviewer_id = EXCLUDED.reviewer_id,
        reviewer_name = EXCLUDED.reviewer_name,
        reviewer_avatar = EXCLUDED.reviewer_avatar,
        target_user_id = EXCLUDED.target_user_id,
        rating = EXCLUDED.rating,
        comment = EXCLUDED.comment,
        order_title = EXCLUDED.order_title,
        gig_id = EXCLUDED.gig_id,
        project_id = EXCLUDED.project_id,
        created_at = EXCLUDED.created_at,
        updated_at = EXCLUDED.updated_at,
        is_cancelled_order = EXCLUDED.is_cancelled_order,
        reply = EXCLUDED.reply,
        moderation_status = EXCLUDED.moderation_status`,
      [
        review.id, review.orderId || null, review.reviewerId || null, review.reviewerName || null, review.reviewerAvatar || null,
        review.targetUserId || null, review.rating, review.comment || null, review.orderTitle || null, review.gigId || null,
        review.projectId || null, review.createdAt || null, review.updatedAt || null, Boolean(review.isCancelledOrder),
        JSON.stringify(review.reply || null), (review as any).moderationStatus || null
      ]
    );
  }

  async saveReview(review: Review): Promise<void> {
    await this.addReview(review);
  }

  async upsertReview(review: Review): Promise<void> {
    await this.addReview(review);
  }

  async getReview(id: string): Promise<Review | null> {
    const res = await postgresStore.getPool().query('SELECT * FROM reviews WHERE id = $1', [id]);
    return res.rows.length > 0 ? mapReviewRow(res.rows[0]) : null;
  }

  async getReviewById(id: string): Promise<Review | null> {
    return this.getReview(id);
  }

  async listReviews(): Promise<Review[]> {
    return await postgresStore.listReviews();
  }

  async saveUser(u: User, client?: any): Promise<void> {
    const dbRunner = client || postgresStore.getPool();
    if (u.email) {
      const conflictRes = await dbRunner.query(
        'SELECT id FROM users WHERE LOWER(email) = LOWER($1) AND id <> $2 LIMIT 1',
        [u.email, u.id]
      );
      if (conflictRes.rows.length > 0) {
        throw new Error('Email address is already registered to another user');
      }
    }
    await dbRunner.query(
      `INSERT INTO users (
        id, name, username, email, mobile, role, avatar, title, rating, reviews_count, 
        hourly_rate, earned, completed_jobs, bio, skills, status, verified, email_verified, 
        mobile_verified, wallet_balance, created_at, is_flagged, flag_reason, password, 
        session_version, known_devices, is_available_now, notification_preferences
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28)
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        username = EXCLUDED.username,
        email = EXCLUDED.email,
        mobile = EXCLUDED.mobile,
        role = EXCLUDED.role,
        avatar = EXCLUDED.avatar,
        title = EXCLUDED.title,
        rating = EXCLUDED.rating,
        reviews_count = EXCLUDED.reviews_count,
        hourly_rate = EXCLUDED.hourly_rate,
        earned = EXCLUDED.earned,
        completed_jobs = EXCLUDED.completed_jobs,
        bio = EXCLUDED.bio,
        skills = EXCLUDED.skills,
        status = EXCLUDED.status,
        verified = EXCLUDED.verified,
        email_verified = EXCLUDED.email_verified,
        mobile_verified = EXCLUDED.mobile_verified,
        wallet_balance = EXCLUDED.wallet_balance,
        created_at = EXCLUDED.created_at,
        is_flagged = EXCLUDED.is_flagged,
        flag_reason = EXCLUDED.flag_reason,
        password = EXCLUDED.password,
        session_version = EXCLUDED.session_version,
        known_devices = EXCLUDED.known_devices,
        is_available_now = EXCLUDED.is_available_now,
        notification_preferences = EXCLUDED.notification_preferences`,
      [
        u.id, u.name, u.username || null, u.email, u.mobile || null, u.role, u.avatar || null,
        u.title || null, u.rating ?? 5.0, u.reviewsCount ?? 0, u.hourlyRate ?? 0, u.earned ?? 0,
        u.completedJobs ?? 0, u.bio || null, u.skills || [], u.status || 'active',
        Boolean(u.verified), Boolean(u.emailVerified), Boolean(u.mobileVerified), u.walletBalance ?? 0,
        u.createdAt || new Date().toISOString(), Boolean(u.isFlagged), u.flagReason || null,
        u.password || null, u.sessionVersion ?? 1, u.knownDevices || ['dev_default_session'],
        Boolean(u.isAvailableNow), u.notificationPreferences ? JSON.stringify(u.notificationPreferences) : null
      ]
    );
  }

  async getUploadRecord(filename: string): Promise<WorkstreamUploadRecord | undefined> {
    return await postgresStore.getUploadRecord(filename);
  }

  async saveUploadRecord(filename: string, record: WorkstreamUploadRecord): Promise<void> {
    await postgresStore.saveUploadRecord(filename, record);
  }

  async listUploadRecords(): Promise<Record<string, WorkstreamUploadRecord>> {
    return await postgresStore.listUploadRecords();
  }

  async deleteUploadRecord(filename: string): Promise<void> {
    await postgresStore.deleteUploadRecord(filename);
  }

  // Offers
  async getOfferById(id: string, client?: any): Promise<WorkstreamOffer | undefined> {
    return await postgresStore.getOfferById(id, client);
  }

  async listOffersForOrder(orderId: string, client?: any): Promise<WorkstreamOffer[]> {
    return await postgresStore.listOffersForOrder(orderId, client);
  }

  async listOffersForWorkspace(workspaceId: string, fallbackOrderId?: string, client?: any): Promise<WorkstreamOffer[]> {
    return await postgresStore.listOffersForWorkspace(workspaceId, fallbackOrderId, client);
  }

  async saveOffer(offer: WorkstreamOffer, client?: any): Promise<void> {
    await postgresStore.saveOffer(offer, client);
  }

  // Custom Invoices
  async getCustomInvoiceById(id: string): Promise<CustomInvoice | undefined> {
    return await postgresStore.getCustomInvoiceById(id);
  }

  async listCustomInvoicesForUser(userId: string): Promise<CustomInvoice[]> {
    return await postgresStore.listCustomInvoicesForUser(userId);
  }

  async saveCustomInvoice(invoice: CustomInvoice): Promise<void> {
    await postgresStore.saveCustomInvoice(invoice);
  }

  // Disputes
  async getDisputeById(id: string, client?: any): Promise<Dispute | undefined> {
    return await postgresStore.getDisputeById(id, client);
  }

  async getDisputeByOrderId(orderId: string, client?: any): Promise<Dispute | undefined> {
    return await postgresStore.getDisputeByOrderId(orderId, client);
  }

  async saveDispute(dispute: Dispute, client?: any): Promise<void> {
    await postgresStore.saveDispute(dispute, client);
  }

  // Support Tickets
  async getSupportTicketById(id: string): Promise<SupportTicket | undefined> {
    return await postgresStore.getSupportTicketById(id);
  }

  async listSupportTicketsForUser(userId: string): Promise<SupportTicket[]> {
    return await postgresStore.listSupportTicketsForUser(userId);
  }

  async listSupportTickets(): Promise<SupportTicket[]> {
    return await postgresStore.listSupportTickets();
  }

  async saveSupportTicket(ticket: SupportTicket): Promise<void> {
    await postgresStore.saveSupportTicket(ticket);
  }

  // Payouts
  async getPayoutById(id: string): Promise<Payout | null> {
    return await postgresStore.getPayoutById(id);
  }

  async listPayoutsForUser(freelancerId: string): Promise<Payout[]> {
    return await postgresStore.listPayoutsForUser(freelancerId);
  }

  async listPayouts(): Promise<Payout[]> {
    return await postgresStore.listPayouts();
  }

  async savePayout(payout: Payout): Promise<void> {
    await postgresStore.savePayout(payout);
  }

  // Payment Methods
  async getPaymentMethodById(id: string): Promise<PaymentMethodRecord | null> {
    return await postgresStore.getPaymentMethodById(id);
  }

  async listPaymentMethodsForUser(userId: string): Promise<PaymentMethodRecord[]> {
    return await postgresStore.listPaymentMethodsForUser(userId);
  }

  async savePaymentMethod(pm: PaymentMethodRecord): Promise<void> {
    await postgresStore.savePaymentMethod(pm);
  }

  async deletePaymentMethod(id: string): Promise<void> {
    await postgresStore.deletePaymentMethod(id);
  }

  async setDefaultPaymentMethod(userId: string, id: string): Promise<void> {
    await postgresStore.setDefaultPaymentMethod(userId, id);
  }

  // Clearing Earnings
  async saveClearingEarning(e: ClearingEarning, client?: any): Promise<void> {
    await postgresStore.saveClearingEarning(e, client);
  }

  async listUnclearedEarningsForUser(sellerId: string, client?: any): Promise<ClearingEarning[]> {
    return await postgresStore.listUnclearedEarningsForUser(sellerId, client);
  }

  async getUnclearedEarningsAmount(sellerId: string, client?: any): Promise<number> {
    return await postgresStore.getUnclearedEarningsAmount(sellerId, client);
  }

  // Audit Logs
  async addAuditLog(l: AuditLog, client?: any): Promise<void> {
    await postgresStore.addAuditLog(l, client);
  }

  async listAuditLogs(): Promise<AuditLog[]> {
    return await postgresStore.listAuditLogs();
  }

  // User Emails
  async addUserEmail(em: UserEmail): Promise<void> {
    await postgresStore.addUserEmail(em);
  }

  async listUserEmailsForUser(userId: string): Promise<UserEmail[]> {
    const res = await postgresStore.getPool().query(
      'SELECT * FROM user_emails WHERE user_id = $1 ORDER BY date DESC',
      [userId]
    );
    return res.rows.map(e => ({
      id: e.id,
      userId: e.user_id,
      userEmail: e.user_email,
      subject: e.subject,
      snippet: e.snippet ? e.snippet.replace(/\b\d{6}\b/g, '******') : '',
      body: e.body ? e.body.replace(/\b\d{6}\b/g, '******') : '',
      date: e.date,
      read: Boolean(e.read),
      type: e.type || 'GENERAL'
    }));
  }

  async markUserEmailRead(id: string, userId?: string): Promise<void> {
    if (userId) {
      await postgresStore.getPool().query('UPDATE user_emails SET read = TRUE WHERE id = $1 AND user_id = $2', [id, userId]);
    } else {
      await postgresStore.getPool().query('UPDATE user_emails SET read = TRUE WHERE id = $1', [id]);
    }
  }

  // Notifications
  async saveNotification(n: Notification, client?: any): Promise<{ inserted: boolean; duplicate?: boolean }> {
    return await postgresStore.saveNotification(n, client);
  }

  async listNotificationsForUser(userId: string): Promise<Notification[]> {
    return await postgresStore.listNotificationsForUser(userId);
  }

  async markNotificationRead(id: string, userId: string): Promise<void> {
    await postgresStore.markNotificationRead(id, userId);
  }

  async markAllNotificationsRead(userId: string): Promise<void> {
    await postgresStore.markAllNotificationsRead(userId);
  }

  async withTransaction<T>(fn: (client?: any) => Promise<T>): Promise<T> {
    return await postgresStore.executeInTransaction(fn);
  }
}

export const orders: Order[] = Object.freeze([]) as unknown as Order[];
export const users: User[] = Object.freeze([]) as unknown as User[];
export const gigs: Gig[] = Object.freeze([]) as unknown as Gig[];
export const projects: Project[] = Object.freeze([]) as unknown as Project[];
export const proposals: Proposal[] = Object.freeze([]) as unknown as Proposal[];
export const reviews: Review[] = Object.freeze([]) as unknown as Review[];
export const messages: Message[] = Object.freeze([]) as unknown as Message[];
export const disputes: Dispute[] = Object.freeze([]) as unknown as Dispute[];
export const refunds: Refund[] = Object.freeze([]) as unknown as Refund[];
export const payouts: Payout[] = Object.freeze([]) as unknown as Payout[];
export const customInvoices: CustomInvoice[] = Object.freeze([]) as unknown as CustomInvoice[];
export const workstreamOffers: WorkstreamOffer[] = Object.freeze([]) as unknown as WorkstreamOffer[];
export const auditLogs: AuditLog[] = Object.freeze([]) as unknown as AuditLog[];

export const store: StoreInterface = new PostgresAsyncStore();

export function saveOrdersToDisk() { return Promise.resolve(); }
export function saveMessagesToDisk() { return Promise.resolve(); }
export function saveReviewsToDisk() { return Promise.resolve(); }
export function saveProjectClarificationsToDisk() { return Promise.resolve(); }
export function saveWorkstreamUploadIndex() { return Promise.resolve(); }

export async function hydrateStoreFromPostgres() {
  assertProductionPostgresConfigured();
  if (!isPostgresEnabled()) {
    if (isProductionPostgresRequired()) {
      throw new Error('FATAL: PostgreSQL cannot be disabled in production.');
    }
    postgresStore.isHydrated = true;
    console.log('DEV mode: Postgres disabled');
    return;
  }
  try {
    await postgresStore.runMigrations();
    postgresStore.isHydrated = true;

    try {
      const persistedSettings = await postgresStore.loadSiteSettings();
      if (persistedSettings) siteSettings.loadFromState(persistedSettings);

      const persistedGateways = await postgresStore.loadPaymentGateways();
      if (persistedGateways) paymentGatewayManager.loadFromState(persistedGateways);

      const persistedCategories = await postgresStore.loadCategories();
      const { setCategories, getCategories } = await import('./routes/adminRoutes.js');
      if (persistedCategories && Array.isArray(persistedCategories) && persistedCategories.length > 0) {
        setCategories(persistedCategories);
      } else {
        await postgresStore.saveCategories(getCategories());
      }
    } catch (settErr) {
      console.warn('[Store] Notice: Failed to hydrate site settings/gateways/categories:', settErr);
    }


    const skipDemoSeeding = process.env.NODE_ENV === 'production' && isRemotePostgresConfigured();
    if (skipDemoSeeding) {
      await workspaceService.hydrateFromPostgres();
      return;
    }

    const pool = postgresStore.getPool();
    const userCountRes = await pool.query("SELECT COUNT(*) as c FROM users WHERE id != 'system'");
    const userCount = Number(userCountRes.rows[0]?.c || 0);

    if (userCount === 0 && !(await postgresStore.isInitialized())) {
      const defaultPass = await bcrypt.hash('Password123!', 10);
      const nowIso = new Date().toISOString();
      const seedUsers: User[] = [
        {
          id: 'u1',
          name: 'Sarah Jenkins',
          username: 'sarah_j',
          email: 'sarah.j@example.com',
          role: 'freelancer',
          avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80',
          title: 'Principal Full-Stack & Cloud Architect',
          rating: 4.9,
          reviewsCount: 124,
          hourlyRate: 95,
          earned: 42500,
          completedJobs: 48,
          bio: '10+ years building distributed systems, high-scale Node.js backends, React SPAs, and PostgreSQL architectures.',
          skills: ['React', 'Node.js', 'TypeScript', 'PostgreSQL', 'Cloud Architecture'],
          status: 'active',
          verified: true,
          emailVerified: true,
          mobileVerified: true,
          walletBalance: 1420,
          createdAt: nowIso,
          password: defaultPass,
          sessionVersion: 1,
          knownDevices: ['dev_default_session'],
          isAvailableNow: true
        },
        {
          id: 'u2',
          name: 'Marcus Vance',
          username: 'marcus_v',
          email: 'marcus.v@example.com',
          role: 'buyer',
          avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
          title: 'VP of Engineering & Product Buyer',
          rating: 5.0,
          reviewsCount: 38,
          hourlyRate: 0,
          earned: 0,
          completedJobs: 19,
          bio: 'Hiring top engineering and design talent for enterprise software initiatives.',
          skills: ['Product Management', 'SaaS', 'FinTech'],
          status: 'active',
          verified: true,
          emailVerified: true,
          mobileVerified: true,
          walletBalance: 5000,
          createdAt: nowIso,
          password: defaultPass,
          sessionVersion: 1,
          knownDevices: ['dev_default_session'],
          isAvailableNow: true
        },
        {
          id: 'u3',
          name: 'Elena Rostova',
          username: 'elena_r',
          email: 'elena.r@example.com',
          role: 'freelancer',
          avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80',
          title: 'AI Systems Engineer & UI/UX Specialist',
          rating: 5.0,
          reviewsCount: 89,
          hourlyRate: 120,
          earned: 68400,
          completedJobs: 62,
          bio: 'Specializing in production AI agents, RAG pipelines, and high-converting SaaS interfaces.',
          skills: ['AI Agents', 'Python', 'TypeScript', 'UI/UX Design', 'Next.js'],
          status: 'active',
          verified: true,
          emailVerified: true,
          mobileVerified: true,
          walletBalance: 3250,
          createdAt: nowIso,
          password: defaultPass,
          sessionVersion: 1,
          knownDevices: ['dev_default_session'],
          isAvailableNow: true
        },
        {
          id: 'admin_1',
          name: 'Platform Admin',
          username: 'admin',
          email: 'admin@workperhour.com',
          role: 'super_admin',
          avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80',
          title: 'Trust & Safety Administrator',
          rating: 5.0,
          reviewsCount: 0,
          hourlyRate: 0,
          earned: 0,
          completedJobs: 0,
          bio: 'WorkPerHour Marketplace Administration & Escrow Oversight.',
          skills: ['Escrow Auditing', 'Dispute Resolution', 'Security'],
          status: 'active',
          verified: true,
          emailVerified: true,
          mobileVerified: true,
          walletBalance: 10000,
          createdAt: nowIso,
          password: defaultPass,
          sessionVersion: 1,
          knownDevices: ['dev_default_session'],
          isAvailableNow: true
        },
        {
          id: 'u_rishi',
          name: 'Rishi Arora',
          username: 'rishiarora1204',
          email: 'rishiarora1204@example.com',
          role: 'freelancer',
          avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
          title: 'SEO Specialist & High DA Link Building Expert',
          rating: 5.0,
          reviewsCount: 312,
          hourlyRate: 50,
          earned: 28400,
          completedJobs: 310,
          bio: 'Top Rated SEO Specialist with 8+ years experience in White Hat link building, high DA backlinks, and technical SEO.',
          skills: ['SEO', 'Backlinks', 'Link Building', 'Keyword Research', 'Google Ranking'],
          status: 'active',
          verified: true,
          emailVerified: true,
          mobileVerified: true,
          walletBalance: 2150,
          createdAt: nowIso,
          password: defaultPass,
          sessionVersion: 1,
          knownDevices: ['dev_default_session'],
          isAvailableNow: true
        }
      ];

      for (const u of seedUsers) {
        await store.saveUser(u);
        await financialTransactionService.ensureWallet({
          userId: u.id,
          name: u.name,
          email: u.email,
          role: u.role,
          initialBalance: u.walletBalance
        });
      }

      const seedGigs = [
        {
          id: 'g_seo_1',
          freelancerId: 'u_rishi',
          freelancerName: 'Rishi Arora',
          freelancerUsername: 'rishiarora1204',
          freelancerAvatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
          freelancerLevel: 'Top Rated ★★★',
          title: 'I will build SEO backlinks on high domain authority website',
          slug: 'build-seo-backlinks-on-high-domain-authority-website',
          category: 'Digital Marketing',
          subcategory: 'Search Engine Optimization (SEO)',
          description: 'I will build high quality White Hat SEO backlinks on high domain authority (DA 80+) websites to boost your Google search ranking and organic traffic. Guaranteed high DA/DR contextually relevant dofollow links.',
          price: 25,
          deliveryDays: 3,
          rating: 5.0,
          reviewsCount: 312,
          tags: ['SEO', 'Backlinks', 'Link Building', 'Digital Marketing', 'Domain Authority'],
          image: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=800&auto=format&fit=crop&q=80',
          coverImage: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=800&auto=format&fit=crop&q=80',
          status: 'active',
          featured: true,
          createdAt: nowIso
        },
        {
          id: 'g1',
          freelancerId: 'u1',
          freelancerName: 'Sarah Jenkins',
          freelancerUsername: 'sarah_j',
          freelancerAvatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80',
          freelancerLevel: 'Top Rated ★★★',
          title: 'I will architect and build a production full-stack React, Node.js and PostgreSQL web application',
          slug: 'architect-build-production-full-stack-react-nodejs-postgresql-web-app',
          category: 'Technology & Programming',
          subcategory: 'Web Development',
          description: 'Complete end-to-end full-stack engineering with TypeScript, React, Express, and transactional PostgreSQL persistence.',
          price: 450,
          deliveryDays: 7,
          rating: 4.9,
          reviewsCount: 124,
          tags: ['React', 'PostgreSQL', 'Node.js', 'TypeScript'],
          image: 'https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=800&auto=format&fit=crop&q=80',
          coverImage: 'https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=800&auto=format&fit=crop&q=80',
          status: 'active',
          createdAt: nowIso
        },
        {
          id: 'g2',
          freelancerId: 'u3',
          freelancerName: 'Elena Rostova',
          freelancerUsername: 'elena_r',
          freelancerAvatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80',
          freelancerLevel: 'Top Rated ★★★',
          title: 'I will build custom AI agents, RAG pipelines, and enterprise LLM integrations',
          slug: 'build-custom-ai-agents-rag-pipelines-enterprise-llm-integrations',
          category: 'AI Services',
          subcategory: 'AI Agents',
          description: 'Production-grade AI workflows, vector search, function calling, and automated reasoning pipelines.',
          price: 650,
          deliveryDays: 5,
          rating: 5.0,
          reviewsCount: 89,
          tags: ['AI Agents', 'LLM', 'TypeScript', 'Python'],
          image: 'https://images.unsplash.com/photo-1677442136019-21780ecad995?w=800&auto=format&fit=crop&q=80',
          coverImage: 'https://images.unsplash.com/photo-1677442136019-21780ecad995?w=800&auto=format&fit=crop&q=80',
          status: 'active',
          featured: true,
          createdAt: nowIso
        },
        {
          id: 'g3',
          freelancerId: 'u1',
          freelancerName: 'Sarah Jenkins',
          freelancerUsername: 'sarah_j',
          freelancerAvatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80',
          freelancerLevel: 'Top Rated ★★★',
          title: 'I will design modern SaaS brand identity, product UI UX design, and Figma design system',
          slug: 'design-modern-saas-brand-identity-product-ui-ux-design-figma-system',
          category: 'Design & Creative',
          subcategory: 'UI/UX Design',
          description: 'Complete brand identity system, responsive SaaS web app mockups, mobile UI design, design tokens, and developer handoff in Figma.',
          price: 350,
          deliveryDays: 4,
          rating: 4.95,
          reviewsCount: 67,
          tags: ['UI/UX Design', 'Figma', 'SaaS', 'Brand Identity'],
          image: 'https://images.unsplash.com/photo-1561070791-2526d30994b5?w=800&auto=format&fit=crop&q=80',
          coverImage: 'https://images.unsplash.com/photo-1561070791-2526d30994b5?w=800&auto=format&fit=crop&q=80',
          status: 'active',
          featured: true,
          createdAt: nowIso
        },
        {
          id: 'g4',
          freelancerId: 'u3',
          freelancerName: 'Elena Rostova',
          freelancerUsername: 'elena_r',
          freelancerAvatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80',
          freelancerLevel: 'Top Rated ★★★',
          title: 'I will build high performance iOS and Android mobile app with React Native and Expo',
          slug: 'build-high-performance-ios-android-mobile-app-react-native-expo',
          category: 'Mobile Apps',
          subcategory: 'Cross-Platform Development',
          description: 'Full-stack cross-platform mobile application development for iOS & Android with Expo, Tailwind CSS, offline sync, and push notifications.',
          price: 500,
          deliveryDays: 6,
          rating: 4.98,
          reviewsCount: 42,
          tags: ['Mobile Apps', 'React Native', 'Expo', 'iOS & Android'],
          image: 'https://images.unsplash.com/photo-1512941937669-90a1b58e7e9c?w=800&auto=format&fit=crop&q=80',
          coverImage: 'https://images.unsplash.com/photo-1512941937669-90a1b58e7e9c?w=800&auto=format&fit=crop&q=80',
          status: 'active',
          featured: false,
          createdAt: nowIso
        }
      ];

      for (const g of seedGigs) {
        await pool.query(
          `INSERT INTO gigs (
            id, freelancer_id, freelancer_name, freelancer_username, freelancer_avatar, freelancer_level,
            title, slug, category, subcategory, description, price, delivery_days, rating, reviews_count,
            tags, image, cover_image, gallery, status, featured, created_at, extras
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
          ON CONFLICT (id) DO NOTHING`,
          [
            g.id, g.freelancerId, g.freelancerName, g.freelancerUsername, g.freelancerAvatar, g.freelancerLevel,
            g.title, g.slug, g.category, g.subcategory, g.description, g.price, g.deliveryDays, g.rating, g.reviewsCount,
            g.tags, g.image, g.coverImage, [], g.status, Boolean(g.featured), g.createdAt, JSON.stringify([])
          ]
        );
      }

      await pool.query(
        `INSERT INTO projects (
          id, buyer_id, buyer_name, title, slug, description, category, budget_type, budget, duration, status, proposals_count, skills, created_at, budget_min, budget_max, deadline_days
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
        ON CONFLICT (id) DO NOTHING`,
        [
          'p1', 'u2', 'Marcus Vance',
          'Enterprise Escrow Payment & Real-Time Workstream Portal',
          'enterprise-escrow-payment-real-time-workstream-portal',
          'Looking for a senior full-stack architect to build a high-reliability escrow ledger and real-time WebSocket collaboration portal backed by PostgreSQL.',
          'Technology & Programming', 'fixed', 1500, '2 weeks', 'open', 0,
          ['PostgreSQL', 'React', 'Node.js', 'WebSockets'], nowIso, 1000, 2000, 14
        ]
      );

      await postgresStore.markInitialized();
    }

    // Ensure standard seed gigs (g_seo_1, g1, g2, g3, g4) exist in database
    const seedGigsCheck = [
      {
        id: 'g_seo_1',
        freelancerId: 'u_rishi',
        freelancerName: 'Rishi Arora',
        freelancerUsername: 'rishiarora1204',
        freelancerAvatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
        freelancerLevel: 'Top Rated ★★★',
        title: 'I will build SEO backlinks on high domain authority website',
        slug: 'build-seo-backlinks-on-high-domain-authority-website',
        category: 'Digital Marketing',
        subcategory: 'Search Engine Optimization (SEO)',
        description: 'I will build high quality White Hat SEO backlinks on high domain authority (DA 80+) websites to boost your Google search ranking and organic traffic. Guaranteed high DA/DR contextually relevant dofollow links.',
        price: 25,
        deliveryDays: 3,
        rating: 5.0,
        reviewsCount: 312,
        tags: ['SEO', 'Backlinks', 'Link Building', 'Digital Marketing', 'Domain Authority'],
        image: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=800&auto=format&fit=crop&q=80',
        coverImage: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=800&auto=format&fit=crop&q=80',
        status: 'active',
        featured: true,
        createdAt: new Date().toISOString()
      },
      {
        id: 'g1',
        freelancerId: 'u1',
        freelancerName: 'Sarah Jenkins',
        freelancerUsername: 'sarah_j',
        freelancerAvatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80',
        freelancerLevel: 'Top Rated ★★★',
        title: 'I will architect and build a production full-stack React, Node.js and PostgreSQL web application',
        slug: 'architect-build-production-full-stack-react-nodejs-postgresql-web-app',
        category: 'Technology & Programming',
        subcategory: 'Web Development',
        description: 'Complete end-to-end full-stack engineering with TypeScript, React, Express, and transactional PostgreSQL persistence.',
        price: 450,
        deliveryDays: 7,
        rating: 4.9,
        reviewsCount: 124,
        tags: ['React', 'PostgreSQL', 'Node.js', 'TypeScript'],
        image: 'https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=800&auto=format&fit=crop&q=80',
        coverImage: 'https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=800&auto=format&fit=crop&q=80',
        status: 'active',
        featured: false,
        createdAt: new Date().toISOString()
      },
      {
        id: 'g2',
        freelancerId: 'u3',
        freelancerName: 'Elena Rostova',
        freelancerUsername: 'elena_r',
        freelancerAvatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80',
        freelancerLevel: 'Top Rated ★★★',
        title: 'I will build custom AI agents, RAG pipelines, and enterprise LLM integrations',
        slug: 'build-custom-ai-agents-rag-pipelines-enterprise-llm-integrations',
        category: 'AI Services',
        subcategory: 'AI Agents',
        description: 'Production-grade AI workflows, vector search, function calling, and automated reasoning pipelines.',
        price: 650,
        deliveryDays: 5,
        rating: 5.0,
        reviewsCount: 89,
        tags: ['AI Agents', 'LLM', 'TypeScript', 'Python'],
        image: 'https://images.unsplash.com/photo-1677442136019-21780ecad995?w=800&auto=format&fit=crop&q=80',
        coverImage: 'https://images.unsplash.com/photo-1677442136019-21780ecad995?w=800&auto=format&fit=crop&q=80',
        status: 'active',
        featured: true,
        createdAt: new Date().toISOString()
      },
      {
        id: 'g3',
        freelancerId: 'u1',
        freelancerName: 'Sarah Jenkins',
        freelancerUsername: 'sarah_j',
        freelancerAvatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80',
        freelancerLevel: 'Top Rated ★★★',
        title: 'I will design modern SaaS brand identity, product UI UX design, and Figma design system',
        slug: 'design-modern-saas-brand-identity-product-ui-ux-design-figma-system',
        category: 'Design & Creative',
        subcategory: 'UI/UX Design',
        description: 'Complete brand identity system, responsive SaaS web app mockups, mobile UI design, design tokens, and developer handoff in Figma.',
        price: 350,
        deliveryDays: 4,
        rating: 4.95,
        reviewsCount: 67,
        tags: ['UI/UX Design', 'Figma', 'SaaS', 'Brand Identity'],
        image: 'https://images.unsplash.com/photo-1561070791-2526d30994b5?w=800&auto=format&fit=crop&q=80',
        coverImage: 'https://images.unsplash.com/photo-1561070791-2526d30994b5?w=800&auto=format&fit=crop&q=80',
        status: 'active',
        featured: true,
        createdAt: new Date().toISOString()
      },
      {
        id: 'g4',
        freelancerId: 'u3',
        freelancerName: 'Elena Rostova',
        freelancerUsername: 'elena_r',
        freelancerAvatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80',
        freelancerLevel: 'Top Rated ★★★',
        title: 'I will build high performance iOS and Android mobile app with React Native and Expo',
        slug: 'build-high-performance-ios-android-mobile-app-react-native-expo',
        category: 'Mobile Apps',
        subcategory: 'Cross-Platform Development',
        description: 'Full-stack cross-platform mobile application development for iOS & Android with Expo, Tailwind CSS, offline sync, and push notifications.',
        price: 500,
        deliveryDays: 6,
        rating: 4.98,
        reviewsCount: 42,
        tags: ['Mobile Apps', 'React Native', 'Expo', 'iOS & Android'],
        image: 'https://images.unsplash.com/photo-1512941937669-90a1b58e7e9c?w=800&auto=format&fit=crop&q=80',
        coverImage: 'https://images.unsplash.com/photo-1512941937669-90a1b58e7e9c?w=800&auto=format&fit=crop&q=80',
        status: 'active',
        featured: false,
        createdAt: new Date().toISOString()
      }
    ];

    for (const g of seedGigsCheck) {
      await pool.query(
        `INSERT INTO gigs (
          id, freelancer_id, freelancer_name, freelancer_username, freelancer_avatar, freelancer_level,
          title, slug, category, subcategory, description, price, delivery_days, rating, reviews_count,
          tags, image, cover_image, gallery, status, featured, created_at, extras
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
        ON CONFLICT (id) DO NOTHING`,
        [
          g.id, g.freelancerId, g.freelancerName, g.freelancerUsername, g.freelancerAvatar, g.freelancerLevel,
          g.title, g.slug, g.category, g.subcategory, g.description, g.price, g.deliveryDays, g.rating, g.reviewsCount,
          g.tags, g.image, g.coverImage, [], g.status, Boolean(g.featured), g.createdAt, JSON.stringify([])
        ]
      );
    }

    await workspaceService.hydrateFromPostgres();

    const orderCountRes = await pool.query('SELECT COUNT(*) as c FROM orders');
    const orderCount = Number(orderCountRes.rows[0]?.c || 0);
    const seedCheckUsers = await pool.query("SELECT id FROM users WHERE id IN ('u1', 'u2')");

    if (!skipDemoSeeding && orderCount === 0 && seedCheckUsers.rows.length === 2) {
      const todayDate = new Date().toISOString().split('T')[0];
      const dueDate = new Date(Date.now() + 7 * 86400000).toISOString();
      const protectionEnd = new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0];
      const nowIso = new Date().toISOString();
      const seedOrderId = 'ord_seed_1';
      const seedWs = await workspaceService.createWorkspaceAsync({
        buyerId: 'u2',
        sellerId: 'u1',
        originType: 'gig',
        originId: 'g1',
        activeOrderId: seedOrderId
      });

      const seedOrder: Order = {
        id: seedOrderId,
        workspaceId: seedWs.workspaceId,
        orderType: 'gig',
        type: 'gig',
        gigOrderId: seedOrderId,
        title: 'I will architect and build a production full-stack React, Node.js and PostgreSQL web application',
        orderTitle: 'I will architect and build a production full-stack React, Node.js and PostgreSQL web application',
        buyerId: 'u2',
        sellerId: 'u1',
        buyerUsername: 'marcus_v',
        sellerUsername: 'sarah_j',
        serviceTitle: 'I will architect and build a production full-stack React, Node.js and PostgreSQL web application',
        serviceThumbnail: 'https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=800&auto=format&fit=crop&q=80',
        gigId: 'g1',
        gigSlug: 'architect-build-production-full-stack-react-nodejs-postgresql-web-app',
        serviceUrl: '/gig/g1/architect-build-production-full-stack-react-nodejs-postgresql-web-app',
        amount: 450,
        status: 'funded_in_escrow',
        createdAt: todayDate,
        dueDate,
        escrowProtectionStartDate: todayDate,
        escrowProtectionEndDate: protectionEnd,
        requirements: 'Build an enterprise-grade Workstream & Escrow collaboration module with real-time WebSockets and 100% PostgreSQL persistence.',
        feeBreakdown: calculateOrderFees(450, siteSettings.getFeeConfig()),
        deliverableFiles: [],
        revisions: [],
        deliveryHistory: [],
        extensionRequests: [],
        freeExtensionUsed: false,
        cancellationHistory: []
      } as unknown as Order;

      await store.saveOrder(seedOrder);
      await workspaceService.ensureWorkspaceForOrderAsync(seedOrder);

      await postgresStore.seedEscrow(seedOrderId, seedOrder.title, 'u2', 'u1', 450, 450, nowIso);

      const seedMessages: Message[] = [
        {
          id: 'msg_seed_1',
          orderId: seedOrderId,
          senderId: 'system',
          senderName: 'System',
          text: `Order placed: ${seedOrder.title}. $450.00 is held safely in escrow until the work is approved.`,
          timestamp: new Date(Date.now() - 3600_000 * 4).toISOString(),
          type: 'system',
          metadata: { action: 'order_created', amount: 450 }
        },
        {
          id: 'msg_seed_2',
          orderId: seedOrderId,
          senderId: 'u2',
          senderName: 'Marcus Vance',
          text: 'Hi Sarah! Looking forward to collaborating on the PostgreSQL Workstream & Escrow architecture. I have shared the requirements above.',
          timestamp: new Date(Date.now() - 3600_000 * 3).toISOString(),
          type: 'message'
        },
        {
          id: 'msg_seed_3',
          orderId: seedOrderId,
          senderId: 'u1',
          senderName: 'Sarah Jenkins',
          text: 'Thanks Marcus! I have reviewed the technical specifications and started setting up the transactional PostgreSQL persistence layer. I will share a progress update shortly.',
          timestamp: new Date(Date.now() - 3600_000 * 2).toISOString(),
          type: 'message'
        }
      ];

      for (const m of seedMessages) {
        await store.addMessage(m);
      }
    }

    const allOrders = await store.listOrders();
    if (allOrders.length > 0) {
      for (const o of allOrders) {
        const existingWs = o.workspaceId ? await workspaceService.getWorkspaceAsync(o.workspaceId) : undefined;
        if (!o.workspaceId || !existingWs) {
          await workspaceService.ensureWorkspaceForOrderAsync(o);
          await store.saveOrder(o);
        }
      }
    }

    console.log('[PostgresStore] Zero split-brain Cloud Run architecture initialized. PostgreSQL is the 100% source of truth.');
  } catch (err: any) {
    if (isProductionPostgresRequired()) {
      console.error('FATAL: PostgreSQL failed to initialize in production mode:', err);
      throw err;
    }
    console.error('CRITICAL: Failed to initialize PostgreSQL at startup:', err);
    throw err;
  }
}

export async function cleanAllStoreData() {
  await postgresStore.cleanAllData();
  await financialRepository.hydrateFromPostgres();
  await workspaceService.hydrateFromPostgres();
  console.log('[Store] Cleaned all data from PostgreSQL.');
}

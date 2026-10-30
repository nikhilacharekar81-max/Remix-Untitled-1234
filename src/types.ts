import { OrderFeeBreakdown } from './shared/fees';

export interface GigExtra {
  id: string;
  title: string;
  price: number;
  deliveryDays?: number;
}

export interface Review {
  id: string;
  reviewerId?: string;
  targetUserId?: string;
  orderId?: string;
  reviewerName?: string;
  reviewerAvatar?: string;
  buyerName?: string;
  buyerAvatar?: string;
  userName?: string;
  avatar?: string;
  userAvatar?: string;
  rating: number;
  comment?: string;
  review?: string;
  timeAgo?: string;
  createdAt?: string;
  updatedAt?: string;
  isCancelledOrder?: boolean;
  gigTitle?: string;
  orderTitle?: string;
  gigId?: string;
  projectId?: string;
  reply?: {
    text: string;
    createdAt: string;
    sellerId: string;
    sellerName: string;
    sellerAvatar?: string;
  };
  buyerReply?: {
    text: string;
    createdAt: string;
    authorId?: string;
    authorName: string;
    authorAvatar?: string;
    role?: string;
  };
}

export interface Gig {
  id: string;
  freelancerId: string;
  freelancerName: string;
  freelancerUsername?: string;
  freelancerAvatar: string;
  freelancerLevel?: string;
  title: string;
  slug?: string;
  category: string;
  subcategory?: string;
  description: string;
  price: number;
  deliveryDays: number;
  rating: number;
  reviewsCount: number;
  image: string;
  coverImage?: string;
  gallery?: string[];
  tags?: string[];
  status: 'active' | 'paused' | 'moderation' | 'deleted';
  featured: boolean;
  featuredUntil?: string;
  extras?: GigExtra[];
  moderationStatus?: 'approved' | 'flagged' | 'rejected' | 'pending';
  moderationNotes?: string;
}

export interface Project {
  id: string;
  buyerId: string;
  buyerName: string;
  buyerAvatar: string;
  title: string;
  slug?: string;
  category: string;
  subcategory?: string;
  description: string;
  budgetMin: number;
  budgetMax: number;
  budget?: number;
  budgetType?: 'fixed' | 'hourly';
  duration?: string;
  deadlineDays: number;
  proposalsCount: number;
  createdAt: string;
  status: 'open' | 'published' | 'unpublished' | 'suspended' | 'in_progress' | 'in-progress' | 'completed';
  featured: boolean;
  maxHires?: number;
  freelancersNeeded?: number;
  moderationStatus?: 'approved' | 'flagged' | 'rejected' | 'pending';
  moderationNotes?: string;
  projectType?: 'fixed' | 'hourly';
  skills?: string[];
  experienceLevel?: 'entry' | 'intermediate' | 'expert';
  location?: string;
  countryFlag?: string;
  isUrgent?: boolean;
  verifiedBuyer?: boolean;
  buyerSpent?: number;
  buyerRating?: number;
  buyerReviewsCount?: number;
  buyerProjectsPosted?: number;
  buyerCompletedProjects?: number;
  buyerMemberSince?: string;
  hireRate?: number | null;
  attachments?: Array<{ name: string; size: string; url?: string }>;
  clarificationQuestions?: Array<any>;
}

export interface ProjectClarification {
  id: string;
  projectId: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  text: string;
  timestamp: string;
  replies?: Array<{
    id: string;
    userId: string;
    userName: string;
    userAvatar?: string;
    text: string;
    timestamp: string;
  }>;
}

export interface Proposal {
  id: string;
  projectId: string;
  freelancerId: string;
  freelancerName: string;
  freelancerAvatar: string;
  freelancerTitle: string;
  coverLetter: string;
  bidAmount: number;
  deliveryDays: number;
  createdAt: string;
  status: 'pending' | 'accepted' | 'rejected';
  workstreamOrderId?: string;
  offerId?: string;
}

export interface DeliveryRecord {
  version: number;
  notes?: string;
  message?: string;
  reference?: string;
  files: Array<{ id?: string; name: string; size: string; url: string; uploadedAt?: string }>;
  deliveredAt: string;
}

export interface Workspace {
  workspaceId: string;
  buyerId: string;
  sellerId: string;
  originType: 'gig' | 'project' | 'profile';
  originId: string;
  createdAt: string;
  status: 'active' | 'archived';
  activeOrderId?: string;
  orderIds?: string[];
  metadata?: Record<string, any>;
}

export interface GigOrder extends Order {
  gigOrderId: string;
  workspaceId: string;
  gigId: string;
}

export interface ProjectOrder extends Order {
  projectOrderId: string;
  workspaceId: string;
  projectId: string;
  proposalId?: string;
}

export interface ExtensionRequest {
  id: string;
  requestedBy: 'buyer' | 'seller';
  days: number;
  reason: string;
  originalDueDate: string;
  requestedDueDate: string;
  requestedAt: string;
  responseDeadline?: string;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  respondedBy?: string;
  respondedAt?: string;
  rejectionReason?: string;
  resultingDueDate?: string;
}

export interface Order {
  id: string;
  workspaceId?: string;
  orderType?: 'gig' | 'project';
  gigOrderId?: string;
  projectOrderId?: string;
  title: string;
  buyerId: string;
  sellerId: string;
  amount: number;
  status: 'payment_pending' | 'funded_in_escrow' | 'in_progress' | 'delivered' | 'completed' | 'disputed' | 'revision' | 'cancelled' | 'draft_review' | 'work_in_progress';
  previousStatus?: string;
  createdAt: string;
  completedAt?: string;
  dueDate: string;
  responseDeadline?: string;
  deadlineApproachingNotified?: boolean;
  requirements?: string;
  deliverables?: string;
  deliverableFiles?: Array<{ id?: string; name: string; url: string; size: string; uploadedAt?: string }>;
  revisions?: Array<{ id?: string; requestedAt: string; reason: string; status: string; version?: number; deliveryVersion?: number }>;
  extensionRequests?: Array<ExtensionRequest>;
  freeExtensionUsed?: boolean;
  adminNotes?: string;
  isMuted?: boolean;
  escrowProtectionStartDate?: string;
  escrowProtectionEndDate?: string;
  gigId?: string;
  projectId?: string;
  proposalId?: string;
  serviceUrl?: string;
  gigSlug?: string;
  sellerUsername?: string;
  buyerUsername?: string;
  serviceTitle?: string;
  serviceThumbnail?: string;
  isTimerPaused?: boolean;
  feeBreakdown?: OrderFeeBreakdown;
  deliveryHistory?: DeliveryRecord[];
  deliveryNotes?: string;
  deliveryReference?: string;
  acceptedVersion?: number;
  reviewWindowDays?: number;
  reviewWindowExpiresAt?: string;
  review?: Review;
  sellerReview?: Review;
  escrowRemaining?: number;
  totalReleased?: number;
  serviceFee?: number;
  smallOrderFee?: number;
  escrowBalance?: number;
  escrowReleased?: number | boolean;
  hasPaidInvoice?: boolean;
  type?: 'gig' | 'project';
  reviewWindowRestartedAt?: string;
  metadata?: Record<string, any>;
  isCustomOrder?: boolean;
  isInquiry?: boolean;
  cancellationRequest?: {
    requestedBy: 'buyer' | 'seller';
    requesterId: string;
    reason: string;
    details?: string;
    requestedAt: string;
    respondBy: string;
    status: 'pending' | 'accepted' | 'rejected' | 'auto_cancelled';
    respondedBy?: string;
    respondedAt?: string;
    rejectionReason?: string;
    reminderSentAt?: string;
  };
  cancellationHistory?: Array<{
    requestedBy: 'buyer' | 'seller';
    requesterId: string;
    reason: string;
    details?: string;
    requestedAt: string;
    status: string;
    respondedBy?: string;
    respondedAt?: string;
    rejectionReason?: string;
  }>;
  cancellationType?: 'very_late' | 'mutual' | 'auto';
  selectedExtras?: GigExtra[];
}

export interface UserAccount {
  id: string;
  name: string;
  username?: string;
  email: string;
  mobile?: string;
  role: string;
  avatar: string;
  title: string;
  rating: number;
  reviewsCount: number;
  hourlyRate: number;
  earned: number;
  completedJobs: number;
  bio: string;
  skills: string[];
  status: 'active' | 'suspended' | 'restricted' | 'deactivated' | 'frozen';
  verified: boolean;
  emailVerified?: boolean;
  mobileVerified?: boolean;
  sessionVersion?: number;
  activeSessionVersions?: number[];
  isFlagged?: boolean;
  flagReason?: string;
  walletBalance: number;
  createdAt: string;
  isAvailableNow?: boolean;
  location?: string;
  countryFlag?: string;
  responseTime?: string;
  category?: string;
  subcategory?: string;
  languages?: string[];
  certifications?: string[];
  knownDevices?: string[];
  password?: string;
  membershipTier?: string;
  buyerMembershipTier?: string;
  kycStatus?: string;
  ActiveRole?: string;
  notificationPreferences?: {
    emailNotifications?: string;
    smsNotifications?: string;
    marketingNotifs?: string;
  };
}

export type User = UserAccount;

export interface Dispute {
  id: string;
  orderId: string;
  buyerId?: string;
  sellerId?: string;
  raisedBy: string;
  reason: string;
  evidence?: string;
  status: 'open' | 'under_investigation' | 'resolved_refund' | 'resolved_release' | 'resolved_partial';
  createdAt: string;
  resolutionNotes?: string;
  resolutionType?: string;
  notes?: string;
  assignedTo?: string;
}

export interface Refund {
  id: string;
  orderId: string;
  buyerId: string;
  amount: number;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
}

export interface Payout {
  id: string;
  freelancerId: string;
  amount: number;
  method: string;
  status: 'pending' | 'approved' | 'processed' | 'failed' | 'cancelled' | 'reversed';
  createdAt: string;
  accountDetails: string;
  processedAt?: string;
}

export interface PaymentMethodItem {
  id: string;
  userId: string;
  type: 'card' | 'bank' | 'paypal' | 'upi';
  name: string;
  details: {
    last4?: string;
    brand?: string;
    expiry?: string;
    bankName?: string;
    accountNumberMasked?: string;
    routingNumber?: string;
    email?: string;
    upiId?: string;
  };
  isDefault: boolean;
  createdAt: string;
}
export type PaymentMethodRecord = PaymentMethodItem;

export interface ClearingEarning {
  orderId: string;
  sellerId: string;
  amount: number;
  clearsAt: string;
}

export interface InvoiceItem {
  id: string;
  invoiceNumber: string;
  userId: string;
  type?: 'sent' | 'received';
  recipientName: string;
  recipientEmail: string;
  issuerName?: string;
  issuerEmail?: string;
  title: string;
  issueDate: string;
  dueDate: string;
  status: 'paid' | 'in_escrow' | 'unpaid' | 'refunded';
  items: Array<{ description: string; quantity: number; unitPrice: number; amount: number }>;
  subtotal: number;
  serviceFee?: number;
  smallOrderFee?: number;
  platformFee: number;
  tax: number;
  total: number;
  notes?: string;
  relatedOrderId?: string;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  enabled: boolean;
  order: number;
  subcategories: { id: string; name: string; slug: string; enabled: boolean }[];
}

export interface SupportTicket {
  id: string;
  userId: string;
  userName: string;
  subject: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  createdAt: string;
  messages: { sender: string; text: string; timestamp: string; appealContext?: any }[];
  isAppeal?: boolean;
  category?: string;
  appealContext?: {
    accountStatus: string;
    flagReason?: string;
    appealedAt: string;
  };
}

export interface AuditLog {
  id: string;
  actor: string;
  role: string;
  action: string;
  target: string;
  details: string;
  timestamp: string;
}

export interface Message {
  id: string;
  orderId?: string;
  workspaceId?: string;
  senderId: string;
  senderName: string;
  text: string;
  timestamp: string;
  type?: 'message' | 'system' | 'file' | 'deliverable';
  fileInfo?: {
    name: string;
    size: string;
    url: string;
    type?: string;
    category?: string;
    orderId?: string;
    orderTitle?: string;
    workspaceId?: string;
    uploaderId?: string;
    source?: string;
  };
  metadata?: {
    amount?: number;
    action?: string;
    milestoneTitle?: string;
    version?: number;
    notes?: string;
    reference?: string;
    reason?: string;
    rating?: number;
    comment?: string;
    revisionId?: string;
    deliveryVersion?: number;
    requirementText?: string;
    clientMessageId?: string;
    acceptedVersion?: number;
    reviewWindowDays?: number;
    offerId?: string;
    offerKind?: string;
    oldDate?: string;
    newDueDate?: string;
    files?: any;
    reviewId?: string;
    reviewerId?: string;
    reviewerRole?: string;
    disputeId?: string;
    raisedBy?: string;
    isCancelledOrder?: boolean;
    reply?: any;
    status?: string;
    autoProcessed?: boolean;
    workspaceId?: string;
    originOrderId?: string;
    resultingOrderId?: string;
    newOrderId?: string;
  };
  status?: 'sending' | 'sent' | 'failed';
}

export interface UserEmail {
  id: string;
  userId: string;
  userEmail: string;
  subject: string;
  body: string;
  snippet?: string;
  date?: string;
  type: 'SUSPEND' | 'RESTRICT' | 'IMPERSONATE' | 'GENERAL' | string;
  sentAt?: string;
  read: boolean;
}



export type WorkstreamOfferKind = 'proposal' | 'invoice' | 'deposit';
export type WorkstreamOfferStatus = 'pending' | 'accepted' | 'paid' | 'declined' | 'cancelled';

export interface WorkstreamOffer {
  id: string;
  number: string;
  orderId?: string;
  originOrderId?: string;
  resultingOrderId?: string;
  workspaceId?: string;
  proposalId?: string;
  kind: WorkstreamOfferKind;
  title: string;
  amount: number;
  deliveryDays?: number;
  note?: string;
  files?: Array<{ id?: string; name: string; size: string; url: string; uploadedAt?: string }>;
  reference?: string;
  status: WorkstreamOfferStatus;
  createdBy: string;
  createdAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
  responseDeadline?: string;
  deadlineApproachingNotified?: boolean;
  rejectionReason?: string;
  rejectedBy?: string;
  rejectedAt?: string;
  autoProcessedAt?: string;
  metadata?: any;
}

export interface CustomInvoice {
  id: string;
  invoiceNumber: string;
  invoice_number?: string;
  userId?: string;
  buyerId?: string;
  sellerId?: string;
  recipientName?: string;
  recipientEmail?: string;
  title?: string;
  issueDate?: string;
  dueDate?: string;
  status: 'paid' | 'in_escrow' | 'unpaid' | 'refunded';
  items?: Array<{ description: string; quantity: number; unitPrice: number; amount: number }>;
  subtotal?: number;
  platformFee?: number;
  tax?: number;
  total?: number;
  amount?: number;
  description?: string;
  notes?: string;
  relatedOrderId?: string;
  createdAt?: string;
  paidAt?: string;
}
export interface WorkstreamUploadRecord {
  ownerId: string;
  originalName?: string;
  mime?: string;
  size?: number;
  createdAt: string;
  sha256?: string;
  orderId?: string;
  workspaceId?: string;
}

export interface AppNotification {
  id: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  targetWorkstreamId?: string;
  senderUsername?: string;
  projectTitle?: string;
  link?: string;
  read: boolean;
  createdAt: string;
  dedupKey?: string;
  actorId?: string;
  metadata?: any;
}

export type Notification = AppNotification;

export interface SiteFeeSettings {
  platformName: string;
  supportEmail: string;
  currency: string;
  currencySymbol: string;
  freelancerCommissionRate: number;
  buyerProcessingFeeRate: number;
  smallOrderFee: number;
  smallOrderFeeThreshold: number;
  minOrderAmount: number;
  featuredGigFee: number;
  urgentProjectFee: number;
  escrowHoldDays: number;
  autoCompleteDeliveredDays: number;
  autoCompleteDeliveredEnabled?: boolean;
  disputeWindowDays: number;
  minPayoutThreshold: number;
  instantPayoutFeeRate: number;
  freelancerOnboardingMode: 'open' | 'moderated';
  maintenanceMode: boolean;
  maintenanceMessage?: string;
  updatedAt?: string;
  updatedBy?: string;
}

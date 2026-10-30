import { Order, UserAccount, Gig, Project } from '../../types';

export type WorkstreamFilter = 
  | 'all' 
  | 'inbox' 
  | 'discussion' 
  | 'in_progress' 
  | 'delivered'
  | 'completed' 
  | 'starred' 
  | 'escrow' 
  | 'archived';

export type WorkstreamSubTab = 'activity' | 'files' | 'milestones' | 'invoices';

export interface WorkstreamMessage {
  id: string;
  orderId: string;
  senderId: string;
  senderName: string;
  senderAvatar?: string;
  text: string;
  timestamp: string;
  type?: 'message' | 'system' | 'file' | 'proposal' | 'deliverable' | 'milestone';
  fileInfo?: {
    name: string;
    size: string;
    url: string;
    type?: string;
  };
  metadata?: {
    amount?: number;
    milestoneTitle?: string;
    action?: string;
    offerId?: string;
    offerKind?: string;
    clientMessageId?: string;
    files?: any;
    reference?: string;
    reviewerRole?: string;
    rating?: number;
    comment?: string;
    version?: number;
    notes?: string;
    reason?: string;
    oldDate?: string;
    newDueDate?: string;
    status?: string;
    reply?: any;
    [key: string]: any;
  };
  status?: 'sending' | 'sent' | 'failed';
}

export type WorkstreamOfferKind = 'proposal' | 'invoice' | 'deposit';
export type WorkstreamOfferStatus = 'pending' | 'accepted' | 'paid' | 'declined' | 'cancelled';

/** A real proposal / invoice / deposit request stored on the server. */
export interface WorkstreamOffer {
  id: string;
  number: string;
  orderId: string;
  originOrderId?: string;
  resultingOrderId?: string;
  workspaceId?: string;
  kind: WorkstreamOfferKind;
  title: string;
  amount: number;
  deliveryDays?: number;
  note?: string;
  status: WorkstreamOfferStatus;
  createdBy: string;
  createdAt: string;
  resolvedAt?: string;
  resolvedBy?: string;

  /** What the buyer is charged in total (amount + client fees), from the server's fee quote. */
  clientTotal?: number;
  additionalAmount?: number;
  clientAdditionalTotal?: number;
  currencySymbol?: string;
  files?: Array<{ id?: string; name: string; size: string; url: string; uploadedAt?: string }>;
  reference?: string;
  rejectionReason?: string;
  metadata?: Record<string, any>;
}

export interface WorkstreamItem extends Order {
  seller?: UserAccount;
  buyer?: UserAccount;
  gig?: Gig;
  lastMessage?: string;
  lastMessageTime?: string;
  unreadCount?: number;
}

export interface SharedFileItem {
  id: string;
  name: string;
  size: string;
  url: string;
  uploadedAt: string;
  uploadedBy: string;
  uploaderId?: string;
  uploaderAvatar?: string;
  type?: string;
  orderId?: string;
  orderTitle?: string;
  workspaceId?: string;
  source?: 'deliverable' | 'delivery_history' | 'message' | 'offer';
}

export const WORKSTREAM_TAB_STATUSES = {
  inbox: ['funded_in_escrow', 'in_progress', 'work_in_progress', 'draft_review', 'delivered', 'revision'],
  in_progress: ['in_progress', 'work_in_progress', 'funded_in_escrow', 'draft_review', 'revision'],
  delivered: ['delivered'],
  completed: ['completed'],
  archived: ['cancelled', 'disputed']
} as const;

export function isInquiryWorkstream(order?: any, workspace?: any): boolean {
  if (!order && !workspace) return false;

  // 1. Authoritative Inquiry or Custom Order flags on the order
  if (order?.isInquiry === true || order?.isCustomOrder === true || order?.customOrderFromInquiry === true) {
    return true;
  }
  if (
    order?.metadata?.isInquiry === true ||
    order?.metadata?.isCustomOrder === true ||
    order?.metadata?.customOrderFromInquiry === true
  ) {
    return true;
  }
  if (Boolean(order?.inquiryWorkspaceId) || Boolean(order?.metadata?.inquiryWorkspaceId)) {
    return true;
  }

  // 2. Authoritative Inquiry or Custom Order flags on the workspace
  const targetWs = workspace || order?.workspace;
  if (targetWs) {
    if (targetWs?.isInquiry === true || targetWs?.isCustomOrder === true) return true;
    if (targetWs?.metadata?.isInquiry === true || targetWs?.metadata?.isCustomOrder === true) return true;
  }

  return false;
}


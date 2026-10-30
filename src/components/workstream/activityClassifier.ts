import { WorkstreamMessage } from './types';

export type EventCategory =
  | 'project'
  | 'proposal'
  | 'order'
  | 'escrow'
  | 'invoice'
  | 'delivery'
  | 'revision'
  | 'review'
  | 'dispute'
  | 'deadline'
  | 'timer'
  | 'meeting'
  | 'milestone'
  | 'tip_bonus'
  | 'cancellation'
  | 'requirements'
  | 'chat_moderation'
  | 'admin_action'
  | 'generic_activity';

export type ActivityFilter =
  | 'all'
  | 'deliveries'
  | 'financial'
  | 'proposals_orders'
  | 'system_audit'
  | 'chat_only';

export interface ClassifiedEvent {
  category: EventCategory;
  categoryLabel: string;
  badgeLabel?: string;
  title: string;
  description: string;
  iconName: string;
  headerCls: string;
  badgeCls: string;
  iconBgCls: string;
  accentColor: 'emerald' | 'blue' | 'purple' | 'amber' | 'rose' | 'indigo' | 'slate' | 'teal';
  metadata: Record<string, any>;
}

/** Formats a timestamp into a clean date string for grouping dividers (e.g. "Today", "Yesterday", "Mar 15, 2026") */
export function formatDividerDate(ts: string | undefined): string {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();
  if (isToday) return 'Today';
  if (isYesterday) return 'Yesterday';
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
  });
}

/** Formats timestamp into an informative string for activity card header */
export function formatEventTime(ts: string | undefined): string {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/** Formats timestamp into relative time string matching Fiverr design (e.g. "2 hours ago", "1 hour ago", "Just now") */
export function formatRelativeTime(ts: string | undefined): string {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  const now = new Date();
  const diffSec = Math.max(0, Math.floor((now.getTime() - d.getTime()) / 1000));
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour} hour${diffHour === 1 ? '' : 's'} ago`;
  const diffDays = Math.floor(diffHour / 24);
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Classifies any workstream message/event into its domain category and visual card specs */
export function classifyActivityEvent(msg: WorkstreamMessage): ClassifiedEvent {
  const action = msg.metadata?.action || '';
  const text = msg.text || '';
  const meta = msg.metadata || {};
  const offerKind = meta.offerKind;
  const cleanText = text.replace(/^[\p{Extended_Pictographic}\uFE0F\u200D\s]+/u, '').trim();

  // 1. INVOICE EVENTS (Resolution & creation)
  if (
    action === 'offer_paid' ||
    (offerKind === 'invoice' && action === 'offer_accepted') ||
    /invoice.*paid/i.test(text) ||
    /custom order completed/i.test(text) ||
    (offerKind === 'invoice' && /paid|accepted/i.test(text)) ||
    (/^INV-\d+/i.test(text) && /accepted|paid/i.test(text)) ||
    (/paid.*escrow was released/i.test(text))
  ) {
    const isCustom = /custom order/i.test(text) || meta.isCustomOrder;
    return {
      category: 'invoice',
      categoryLabel: isCustom ? 'Custom Order Completed' : 'Invoice Paid',
      badgeLabel: isCustom ? 'Custom Order Completed' : 'Paid & Released',
      title: isCustom ? 'Custom Order Completed & Escrow Paid' : 'Invoice Paid & Escrow Released to Seller',
      description: cleanText,
      iconName: 'Receipt',
      headerCls: 'bg-emerald-50/90 border-b border-emerald-100 text-emerald-950',
      badgeCls: 'bg-emerald-100 text-emerald-800 border-emerald-200',
      iconBgCls: 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200',
      accentColor: 'emerald',
      metadata: meta
    };
  }

  if (offerKind === 'invoice' && action === 'offer_declined') {
    const isCustom = /custom order/i.test(text) || meta.isCustomOrder;
    return {
      category: 'invoice',
      categoryLabel: isCustom ? 'Custom Order Invoice Declined' : 'Invoice Declined',
      badgeLabel: 'Declined',
      title: isCustom ? 'Custom Order Invoice Declined by Buyer' : 'Invoice Declined by Buyer',
      description: cleanText,
      iconName: 'AlertTriangle',
      headerCls: 'bg-rose-50/90 border-b border-rose-100 text-rose-950',
      badgeCls: 'bg-rose-100 text-rose-800 border-rose-200',
      iconBgCls: 'bg-rose-100 text-rose-700 ring-1 ring-rose-200',
      accentColor: 'rose',
      metadata: meta
    };
  }

  if (offerKind === 'invoice' && action === 'offer_cancelled') {
    const isCustom = /custom order/i.test(text) || meta.isCustomOrder;
    return {
      category: 'invoice',
      categoryLabel: isCustom ? 'Custom Order Invoice Cancelled' : 'Invoice Cancelled',
      badgeLabel: 'Cancelled',
      title: isCustom ? 'Custom Order Invoice Cancelled by Seller' : 'Invoice Cancelled by Seller',
      description: cleanText,
      iconName: 'RotateCcw',
      headerCls: 'bg-slate-100 border-b border-slate-200 text-slate-900',
      badgeCls: 'bg-slate-200 text-slate-700 border-slate-300',
      iconBgCls: 'bg-slate-200 text-slate-700 ring-1 ring-slate-300',
      accentColor: 'slate',
      metadata: meta
    };
  }

  // 2. PROPOSAL EVENTS
  if (
    (offerKind === 'proposal' && action === 'offer_accepted') ||
    action === 'proposal_accepted' ||
    /custom order proposal.*accepted/i.test(text) ||
    (/^PRP-\d+/i.test(text) && /accepted/i.test(text))
  ) {
    const isCustom = /custom order/i.test(text) || meta.isCustomOrder;
    return {
      category: 'proposal',
      categoryLabel: isCustom ? 'Custom Order Created' : 'Proposal Accepted',
      badgeLabel: isCustom ? 'Custom Order Active' : 'Escrow Funded',
      title: isCustom ? 'Custom Order Proposal Accepted & Escrow Funded' : 'Proposal Accepted & Escrow Funded',
      description: cleanText,
      iconName: 'FileSignature',
      headerCls: 'bg-emerald-50/90 border-b border-emerald-100 text-emerald-950',
      badgeCls: 'bg-emerald-100 text-emerald-800 border-emerald-200',
      iconBgCls: 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200',
      accentColor: 'emerald',
      metadata: meta
    };
  }

  if (
    action === 'proposal_submitted' ||
    action === 'proposal_received' ||
    /custom order proposal/i.test(text) ||
    /proposal submitted|custom proposal received/i.test(text) ||
    (/^PRP-\d+/i.test(text) && !/accepted|paid|declined/i.test(text))
  ) {
    const isCustom = /custom order proposal/i.test(text) || meta.isCustomOrder;
    return {
      category: 'proposal',
      categoryLabel: isCustom ? 'Custom Order Proposal' : 'Custom Proposal',
      badgeLabel: 'Under Review',
      title: isCustom ? 'Custom Order Proposal Submitted for Review' : 'Proposal Submitted for Review',
      description: cleanText,
      iconName: 'FileSignature',
      headerCls: 'bg-emerald-50/70 border-b border-emerald-100/90 text-emerald-950',
      badgeCls: 'bg-emerald-100 text-emerald-800 border-emerald-200',
      iconBgCls: 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200',
      accentColor: 'emerald',
      metadata: meta
    };
  }

  if (
    action === 'proposal_declined' ||
    (offerKind === 'proposal' && action === 'offer_declined') ||
    /proposal declined/i.test(text)
  ) {
    const isCustom = /custom order/i.test(text) || meta.isCustomOrder;
    return {
      category: 'proposal',
      categoryLabel: isCustom ? 'Custom Order Proposal Declined' : 'Proposal Declined',
      badgeLabel: 'Declined',
      title: isCustom ? 'Custom Order Proposal Declined by Buyer' : 'Proposal Declined by Buyer',
      description: cleanText,
      iconName: 'AlertTriangle',
      headerCls: 'bg-rose-50/90 border-b border-rose-100 text-rose-950',
      badgeCls: 'bg-rose-100 text-rose-800 border-rose-200',
      iconBgCls: 'bg-rose-100 text-rose-700 ring-1 ring-rose-200',
      accentColor: 'rose',
      metadata: meta
    };
  }

  if (
    action === 'proposal_withdrawn' ||
    (offerKind === 'proposal' && action === 'offer_cancelled') ||
    /proposal withdrawn/i.test(text) ||
    /custom order proposal.*cancelled/i.test(text)
  ) {
    const isCustom = /custom order/i.test(text) || meta.isCustomOrder;
    return {
      category: 'proposal',
      categoryLabel: isCustom ? 'Custom Order Proposal Cancelled' : 'Proposal Withdrawn',
      badgeLabel: isCustom ? 'Cancelled' : 'Withdrawn',
      title: isCustom ? 'Custom Order Proposal Cancelled by Seller' : 'Proposal Withdrawn by Freelancer',
      description: cleanText,
      iconName: 'RotateCcw',
      headerCls: 'bg-slate-100 border-b border-slate-200 text-slate-900',
      badgeCls: 'bg-slate-200 text-slate-700 border-slate-300',
      iconBgCls: 'bg-slate-200 text-slate-700 ring-1 ring-slate-300',
      accentColor: 'slate',
      metadata: meta
    };
  }

  if (action === 'proposal_updated' || /proposal updated|bid amount revised/i.test(text)) {
    return {
      category: 'proposal',
      categoryLabel: 'Proposal Revised',
      badgeLabel: 'Updated Scope',
      title: 'Proposal Scope or Bid Revised',
      description: cleanText,
      iconName: 'FileSignature',
      headerCls: 'bg-blue-50/90 border-b border-blue-100 text-blue-950',
      badgeCls: 'bg-blue-100 text-blue-800 border-blue-200',
      iconBgCls: 'bg-blue-100 text-blue-700 ring-1 ring-blue-200',
      accentColor: 'blue',
      metadata: meta
    };
  }

  // 3. PROJECT EVENTS
  if (
    action === 'project_created' ||
    action === 'project_published' ||
    /project (published|created|posted)/i.test(text)
  ) {
    return {
      category: 'project',
      categoryLabel: 'Project Published',
      badgeLabel: 'Open for Proposals',
      title: 'Project Published to Marketplace',
      description: cleanText,
      iconName: 'Briefcase',
      headerCls: 'bg-teal-50/90 border-b border-teal-100 text-teal-950',
      badgeCls: 'bg-teal-100 text-teal-800 border-teal-200',
      iconBgCls: 'bg-teal-100 text-teal-700 ring-1 ring-teal-200',
      accentColor: 'teal',
      metadata: meta
    };
  }

  if (action === 'project_updated' || /project (details|scope|budget) updated/i.test(text)) {
    return {
      category: 'project',
      categoryLabel: 'Project Scope Updated',
      badgeLabel: 'Updated',
      title: 'Project Brief or Scope Updated',
      description: cleanText,
      iconName: 'FileText',
      headerCls: 'bg-teal-50/90 border-b border-teal-100 text-teal-950',
      badgeCls: 'bg-teal-100 text-teal-800 border-teal-200',
      iconBgCls: 'bg-teal-100 text-teal-700 ring-1 ring-teal-200',
      accentColor: 'teal',
      metadata: meta
    };
  }

  if (action === 'project_reopened' || /project reopened/i.test(text)) {
    return {
      category: 'project',
      categoryLabel: 'Project Reopened',
      badgeLabel: 'Reopened',
      title: 'Project Reopened for Proposals',
      description: cleanText,
      iconName: 'RotateCcw',
      headerCls: 'bg-teal-50/90 border-b border-teal-100 text-teal-950',
      badgeCls: 'bg-teal-100 text-teal-800 border-teal-200',
      iconBgCls: 'bg-teal-100 text-teal-700 ring-1 ring-teal-200',
      accentColor: 'teal',
      metadata: meta
    };
  }

  if (action === 'project_closed' || /project closed/i.test(text)) {
    return {
      category: 'project',
      categoryLabel: 'Project Closed',
      badgeLabel: 'Closed',
      title: 'Project Closed to New Proposals',
      description: cleanText,
      iconName: 'Lock',
      headerCls: 'bg-slate-100 border-b border-slate-200 text-slate-900',
      badgeCls: 'bg-slate-200 text-slate-700 border-slate-300',
      iconBgCls: 'bg-slate-200 text-slate-700 ring-1 ring-slate-300',
      accentColor: 'slate',
      metadata: meta
    };
  }

  if (action === 'project_cancelled' || /project cancelled/i.test(text)) {
    return {
      category: 'project',
      categoryLabel: 'Project Cancelled',
      badgeLabel: 'Cancelled',
      title: 'Project Cancelled by Buyer',
      description: cleanText,
      iconName: 'AlertTriangle',
      headerCls: 'bg-rose-50/90 border-b border-rose-100 text-rose-950',
      badgeCls: 'bg-rose-100 text-rose-800 border-rose-200',
      iconBgCls: 'bg-rose-100 text-rose-700 ring-1 ring-rose-200',
      accentColor: 'rose',
      metadata: meta
    };
  }

  if (action === 'project_completed' || /project completed/i.test(text)) {
    return {
      category: 'project',
      categoryLabel: 'Project Completed',
      badgeLabel: 'Completed',
      title: 'Project Milestones Completed',
      description: cleanText,
      iconName: 'Sparkles',
      headerCls: 'bg-emerald-50/90 border-b border-emerald-100 text-emerald-950',
      badgeCls: 'bg-emerald-100 text-emerald-800 border-emerald-200',
      iconBgCls: 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200',
      accentColor: 'emerald',
      metadata: meta
    };
  }

  // 4. ORDER & HIRING EVENTS
  if (
    action === 'freelancer_hired' ||
    /freelancer hired|hired .* for project|contract started/i.test(text)
  ) {
    return {
      category: 'order',
      categoryLabel: 'Freelancer Hired',
      badgeLabel: 'Contract Active',
      title: 'Freelancer Hired & Project Contract Started',
      description: cleanText,
      iconName: 'CheckCircle2',
      headerCls: 'bg-emerald-50/90 border-b border-emerald-100 text-emerald-950',
      badgeCls: 'bg-emerald-100 text-emerald-800 border-emerald-200',
      iconBgCls: 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200',
      accentColor: 'emerald',
      metadata: meta
    };
  }

  if (
    action === 'order_auto_accepted' ||
    /automatically accepted/i.test(text)
  ) {
    return {
      category: 'order',
      categoryLabel: 'Order Auto-Accepted',
      badgeLabel: 'Completed',
      title: 'Order Automatically Completed & Accepted',
      description: cleanText,
      iconName: 'Award',
      headerCls: 'bg-emerald-50/90 border-b border-emerald-100 text-emerald-950',
      badgeCls: 'bg-emerald-100 text-emerald-800 border-emerald-200',
      iconBgCls: 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200',
      accentColor: 'emerald',
      metadata: meta
    };
  }

  if (
    action === 'order_completed' ||
    /order completed/i.test(text)
  ) {
    return {
      category: 'order',
      categoryLabel: 'Order Milestone',
      badgeLabel: 'Completed',
      title: 'Order Completed Successfully',
      description: cleanText,
      iconName: 'Sparkles',
      headerCls: 'bg-emerald-50/90 border-b border-emerald-100 text-emerald-950',
      badgeCls: 'bg-emerald-100 text-emerald-800 border-emerald-200',
      iconBgCls: 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200',
      accentColor: 'emerald',
      metadata: meta
    };
  }

  if (
    action === 'order_started' ||
    /work started|order in progress|started working/i.test(text)
  ) {
    return {
      category: 'order',
      categoryLabel: 'Work In Progress',
      badgeLabel: 'In Progress',
      title: 'Work In Progress: Freelancer Started Task',
      description: cleanText,
      iconName: 'Clock',
      headerCls: 'bg-blue-50/90 border-b border-blue-100 text-blue-950',
      badgeCls: 'bg-blue-100 text-blue-800 border-blue-200',
      iconBgCls: 'bg-blue-100 text-blue-700 ring-1 ring-blue-200',
      accentColor: 'blue',
      metadata: meta
    };
  }

  if (
    action === 'order_created' ||
    action === 'order_placed' ||
    /inquiry thread opened/i.test(text) ||
    /custom order placed/i.test(text) ||
    /^order placed/i.test(text)
  ) {
    const isInquiry = /inquiry thread/i.test(text);
    const isCustomOrder = /custom order placed/i.test(text) || meta.isCustomOrder;
    return {
      category: 'order',
      categoryLabel: isCustomOrder ? 'Custom Order Placed' : isInquiry ? 'Inquiry Opened' : 'Order Placed',
      badgeLabel: isCustomOrder ? 'Custom Order • Escrow Funded' : isInquiry ? 'New Inquiry' : 'Escrow Protected',
      title: isCustomOrder ? 'Custom Order Placed in Escrow' : isInquiry ? 'New Project Inquiry Initialized' : 'Order Placed in Escrow',
      description: cleanText,
      iconName: 'Briefcase',
      headerCls: 'bg-blue-50/90 border-b border-blue-100 text-blue-950',
      badgeCls: 'bg-blue-100 text-blue-800 border-blue-200',
      iconBgCls: 'bg-blue-100 text-blue-700 ring-1 ring-blue-200',
      accentColor: 'blue',
      metadata: meta
    };
  }

  if (action === 'order_paused' || /order paused/i.test(text)) {
    return {
      category: 'order',
      categoryLabel: 'Order Paused',
      badgeLabel: 'On Hold',
      title: 'Order Work Temporarily Paused',
      description: cleanText,
      iconName: 'Clock',
      headerCls: 'bg-amber-50/90 border-b border-amber-100 text-amber-950',
      badgeCls: 'bg-amber-100 text-amber-900 border-amber-200',
      iconBgCls: 'bg-amber-100 text-amber-700 ring-1 ring-amber-200',
      accentColor: 'amber',
      metadata: meta
    };
  }

  if (action === 'order_resumed' || /order resumed/i.test(text)) {
    return {
      category: 'order',
      categoryLabel: 'Order Resumed',
      badgeLabel: 'Active',
      title: 'Order Work Resumed',
      description: cleanText,
      iconName: 'Clock',
      headerCls: 'bg-emerald-50/90 border-b border-emerald-100 text-emerald-950',
      badgeCls: 'bg-emerald-100 text-emerald-800 border-emerald-200',
      iconBgCls: 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200',
      accentColor: 'emerald',
      metadata: meta
    };
  }

  if (action === 'order_cancelled' || /order cancelled/i.test(text)) {
    return {
      category: 'order',
      categoryLabel: 'Order Cancelled',
      badgeLabel: 'Cancelled',
      title: 'Order Cancelled',
      description: cleanText,
      iconName: 'AlertTriangle',
      headerCls: 'bg-rose-50/90 border-b border-rose-100 text-rose-950',
      badgeCls: 'bg-rose-100 text-rose-800 border-rose-200',
      iconBgCls: 'bg-rose-100 text-rose-700 ring-1 ring-rose-200',
      accentColor: 'rose',
      metadata: meta
    };
  }

  if (action === 'follow_on_work' || /follow-on work/i.test(text)) {
    return {
      category: 'order',
      categoryLabel: 'Follow-On Scope',
      badgeLabel: 'New Phase',
      title: 'Follow-On Workstream Phase Created',
      description: cleanText,
      iconName: 'Briefcase',
      headerCls: 'bg-blue-50/90 border-b border-blue-100 text-blue-950',
      badgeCls: 'bg-blue-100 text-blue-800 border-blue-200',
      iconBgCls: 'bg-blue-100 text-blue-700 ring-1 ring-blue-200',
      accentColor: 'blue',
      metadata: meta
    };
  }

  // 5. TIP & BONUS
  if (
    action === 'tip_added' ||
    action === 'bonus_paid' ||
    /bonus.*tip|tip.*added|rewarded with a tip/i.test(text)
  ) {
    return {
      category: 'tip_bonus',
      categoryLabel: 'Tip & Reward',
      badgeLabel: 'Bonus Rewarded',
      title: 'Client Added a Bonus Tip',
      description: cleanText,
      iconName: 'Award',
      headerCls: 'bg-amber-50/90 border-b border-amber-100 text-amber-950',
      badgeCls: 'bg-amber-100 text-amber-900 border-amber-200',
      iconBgCls: 'bg-amber-100 text-amber-600 ring-1 ring-amber-200',
      accentColor: 'amber',
      metadata: meta
    };
  }

  // 6. ESCROW EVENTS
  if (
    action === 'escrow_refunded' ||
    /escrow.*refunded/i.test(text)
  ) {
    return {
      category: 'escrow',
      categoryLabel: 'Escrow Refund',
      badgeLabel: 'Wallet Credited',
      title: 'Escrow Funds Refunded to Buyer Wallet',
      description: cleanText,
      iconName: 'RotateCcw',
      headerCls: 'bg-rose-50/90 border-b border-rose-100 text-rose-950',
      badgeCls: 'bg-rose-100 text-rose-800 border-rose-200',
      iconBgCls: 'bg-rose-100 text-rose-700 ring-1 ring-rose-200',
      accentColor: 'rose',
      metadata: meta
    };
  }

  if (
    action === 'escrow_released' ||
    /escrow.*released/i.test(text)
  ) {
    return {
      category: 'escrow',
      categoryLabel: 'Escrow Released',
      badgeLabel: 'Funds Transferred',
      title: 'Escrow Funds Released to Freelancer',
      description: cleanText,
      iconName: 'CheckCircle2',
      headerCls: 'bg-emerald-50/90 border-b border-emerald-100 text-emerald-950',
      badgeCls: 'bg-emerald-100 text-emerald-800 border-emerald-200',
      iconBgCls: 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200',
      accentColor: 'emerald',
      metadata: meta
    };
  }

  if (
    action === 'escrow_funded' ||
    /escrow.*(\bfunded\b|deposited|secured|protection active)/i.test(text)
  ) {
    const isTopUp = meta.isTopUp;
    return {
      category: 'escrow',
      categoryLabel: isTopUp ? 'Escrow Top-Up' : 'Escrow Vault',
      badgeLabel: 'Escrow Secured',
      title: isTopUp ? 'Additional Escrow Deposit Funded' : 'Escrow Deposit Secured in Vault',
      description: cleanText,
      iconName: 'ShieldCheck',
      headerCls: 'bg-emerald-50/90 border-b border-emerald-100 text-emerald-950',
      badgeCls: 'bg-emerald-100 text-emerald-800 border-emerald-200',
      iconBgCls: 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200',
      accentColor: 'emerald',
      metadata: meta
    };
  }

  // 7. DELIVERABLE EVENTS
  if (
    action === 'deliverable_submitted' ||
    action === 'work_delivered' ||
    /deliver(y|able).*submitted/i.test(text)
  ) {
    const ver = meta.version;
    const isDraft = meta.isDraft;
    return {
      category: 'delivery',
      categoryLabel: isDraft ? 'Draft Submission' : 'Work Delivered',
      badgeLabel: ver ? `Version #v${ver}` : 'Awaiting Review',
      title: isDraft
        ? `Draft Deliverable ${ver ? `#v${ver} ` : ''}Submitted for Review`
        : `Work Delivered ${ver ? `#v${ver}` : ''} — Awaiting Buyer Approval`,
      description: cleanText,
      iconName: 'Package',
      headerCls: 'bg-blue-50/90 border-b border-blue-100 text-blue-950',
      badgeCls: 'bg-blue-100 text-blue-800 border-blue-200',
      iconBgCls: 'bg-blue-100 text-blue-700 ring-1 ring-blue-200',
      accentColor: 'blue',
      metadata: meta
    };
  }

  if (
    action === 'deliverable_approved' ||
    /deliver(y|able).*approved/i.test(text)
  ) {
    return {
      category: 'delivery',
      categoryLabel: 'Delivery Approved',
      badgeLabel: 'Accepted',
      title: 'Deliverables Approved by Buyer',
      description: cleanText,
      iconName: 'CheckCircle2',
      headerCls: 'bg-emerald-50/90 border-b border-emerald-100 text-emerald-950',
      badgeCls: 'bg-emerald-100 text-emerald-800 border-emerald-200',
      iconBgCls: 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200',
      accentColor: 'emerald',
      metadata: meta
    };
  }

  // 8. REVISION EVENTS
  if (
    action === 'revision_requested' ||
    /revision requested/i.test(text)
  ) {
    const revVer = meta.deliveryVersion;
    return {
      category: 'revision',
      categoryLabel: 'Revision Request',
      badgeLabel: 'Action Required',
      title: revVer ? `Revision Requested on Delivery #v${revVer}` : 'Modification / Revision Requested',
      description: cleanText,
      iconName: 'RotateCcw',
      headerCls: 'bg-purple-50/90 border-b border-purple-100 text-purple-950',
      badgeCls: 'bg-purple-100 text-purple-800 border-purple-200',
      iconBgCls: 'bg-purple-100 text-purple-700 ring-1 ring-purple-200',
      accentColor: 'purple',
      metadata: meta
    };
  }

  if (
    action === 'revision_resolved' ||
    /revision resolved/i.test(text)
  ) {
    return {
      category: 'revision',
      categoryLabel: 'Revision Resolved',
      badgeLabel: 'Updated',
      title: 'Revision Resolved with New Submission',
      description: cleanText,
      iconName: 'CheckCircle2',
      headerCls: 'bg-purple-50/90 border-b border-purple-100 text-purple-950',
      badgeCls: 'bg-purple-100 text-purple-800 border-purple-200',
      iconBgCls: 'bg-purple-100 text-purple-700 ring-1 ring-purple-200',
      accentColor: 'purple',
      metadata: meta
    };
  }

  // 9. REVIEW & RATING EVENTS
  if (
    action === 'review_submitted' ||
    /review submitted/i.test(text) ||
    text.includes('⭐')
  ) {
    const stars = meta.rating || 5;
    return {
      category: 'review',
      categoryLabel: 'Feedback & Rating',
      badgeLabel: `${stars}.0 / 5.0 Stars`,
      title: `${stars}-Star Review Submitted`,
      description: cleanText,
      iconName: 'Star',
      headerCls: 'bg-amber-50/90 border-b border-amber-100 text-amber-950',
      badgeCls: 'bg-amber-100 text-amber-900 border-amber-200',
      iconBgCls: 'bg-amber-100 text-amber-600 ring-1 ring-amber-200',
      accentColor: 'amber',
      metadata: meta
    };
  }

  if (
    action === 'review_reply_submitted' ||
    /public response posted/i.test(text)
  ) {
    return {
      category: 'review',
      categoryLabel: 'Seller Public Response',
      badgeLabel: 'Public Response',
      title: 'Public Response Posted by Freelancer',
      description: cleanText,
      iconName: 'MessageSquare',
      headerCls: 'bg-amber-50/90 border-b border-amber-100 text-amber-950',
      badgeCls: 'bg-amber-100 text-amber-900 border-amber-200',
      iconBgCls: 'bg-amber-100 text-amber-600 ring-1 ring-amber-200',
      accentColor: 'amber',
      metadata: meta
    };
  }

  // 10. DISPUTES & CANCELLATIONS
  if (
    action === 'dispute_opened' ||
    /dispute (opened|under review|raised)/i.test(text)
  ) {
    return {
      category: 'dispute',
      categoryLabel: 'Arbitration Case',
      badgeLabel: 'Under Review',
      title: 'Dispute Case Opened: Order Under Review',
      description: cleanText,
      iconName: 'Scale',
      headerCls: 'bg-rose-50/90 border-b border-rose-100 text-rose-950',
      badgeCls: 'bg-rose-100 text-rose-800 border-rose-200',
      iconBgCls: 'bg-rose-100 text-rose-700 ring-1 ring-rose-200',
      accentColor: 'rose',
      metadata: meta
    };
  }

  if (
    action === 'dispute_resolved' ||
    /dispute resolved/i.test(text)
  ) {
    return {
      category: 'dispute',
      categoryLabel: 'Arbitration Resolved',
      badgeLabel: 'Case Closed',
      title: 'Dispute Resolved by Platform Administrator',
      description: cleanText,
      iconName: 'CheckCircle2',
      headerCls: 'bg-emerald-50/90 border-b border-emerald-100 text-emerald-950',
      badgeCls: 'bg-emerald-100 text-emerald-800 border-emerald-200',
      iconBgCls: 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200',
      accentColor: 'emerald',
      metadata: meta
    };
  }

  if (
    action === 'GIG_CANCELLATION_REQUESTED' ||
    action === 'mutual_cancellation_requested' ||
    /cancellation requested/i.test(text)
  ) {
    return {
      category: 'cancellation',
      categoryLabel: 'Cancellation Request',
      badgeLabel: 'Pending 48h Response',
      title: 'Order Cancellation Requested',
      description: cleanText,
      iconName: 'AlertTriangle',
      headerCls: 'bg-rose-50/90 border-b border-rose-100 text-rose-950',
      badgeCls: 'bg-rose-100 text-rose-800 border-rose-200',
      iconBgCls: 'bg-rose-100 text-rose-700 ring-1 ring-rose-200',
      accentColor: 'rose',
      metadata: meta
    };
  }

  if (
    action === 'GIG_CANCELLATION_ACCEPTED' ||
    action === 'GIG_CANCELLATION_AUTO_CANCELLED' ||
    action === 'gig_very_late_cancelled' ||
    /cancellation accepted|auto-cancelled|very-late cancellation/i.test(text)
  ) {
    return {
      category: 'cancellation',
      categoryLabel: 'Order Cancelled & Refunded',
      badgeLabel: 'Cancelled',
      title: 'Order Cancelled & Full Refund Issued',
      description: cleanText,
      iconName: 'RotateCcw',
      headerCls: 'bg-slate-100 border-b border-slate-200 text-slate-900',
      badgeCls: 'bg-slate-200 text-slate-700 border-slate-300',
      iconBgCls: 'bg-slate-200 text-slate-700 ring-1 ring-slate-300',
      accentColor: 'slate',
      metadata: meta
    };
  }

  if (
    action === 'GIG_CANCELLATION_REJECTED' ||
    /cancellation rejected/i.test(text)
  ) {
    return {
      category: 'cancellation',
      categoryLabel: 'Cancellation Rejected',
      badgeLabel: 'Rejected',
      title: 'Cancellation Request Rejected',
      description: cleanText,
      iconName: 'AlertTriangle',
      headerCls: 'bg-amber-50/90 border-b border-amber-100 text-amber-950',
      badgeCls: 'bg-amber-100 text-amber-900 border-amber-200',
      iconBgCls: 'bg-amber-100 text-amber-700 ring-1 ring-amber-200',
      accentColor: 'amber',
      metadata: meta
    };
  }

  // 11. SCHEDULE & DEADLINE EXTENSIONS
  if (
    action === 'order_deadline_extended' ||
    action === 'time_extension_approved' ||
    /deadline extended/i.test(text)
  ) {
    return {
      category: 'deadline',
      categoryLabel: 'Schedule Update',
      badgeLabel: 'Deadline Extended',
      title: 'Order Delivery Due Date Extended',
      description: cleanText,
      iconName: 'Clock',
      headerCls: 'bg-amber-50/90 border-b border-amber-100 text-amber-950',
      badgeCls: 'bg-amber-100 text-amber-900 border-amber-200',
      iconBgCls: 'bg-amber-100 text-amber-700 ring-1 ring-amber-200',
      accentColor: 'amber',
      metadata: meta
    };
  }

  if (
    action === 'time_extension_requested' ||
    /time extension requested/i.test(text)
  ) {
    return {
      category: 'deadline',
      categoryLabel: 'Extension Requested',
      badgeLabel: 'Awaiting Buyer Response',
      title: 'Seller Requested Delivery Time Extension',
      description: cleanText,
      iconName: 'Clock',
      headerCls: 'bg-amber-50/90 border-b border-amber-100 text-amber-950',
      badgeCls: 'bg-amber-100 text-amber-900 border-amber-200',
      iconBgCls: 'bg-amber-100 text-amber-700 ring-1 ring-amber-200',
      accentColor: 'amber',
      metadata: meta
    };
  }

  if (
    action === 'timer_paused' ||
    action === 'timer_resumed' ||
    /countdown (paused|resumed)/i.test(text)
  ) {
    const isPaused = action === 'timer_paused' || /paused/i.test(text);
    return {
      category: 'timer',
      categoryLabel: 'Timer Control',
      badgeLabel: isPaused ? 'Paused' : 'Active',
      title: isPaused ? 'Delivery Timer Paused by Administrator' : 'Delivery Timer Resumed',
      description: cleanText,
      iconName: 'Clock',
      headerCls: 'bg-slate-100 border-b border-slate-200 text-slate-900',
      badgeCls: 'bg-slate-200 text-slate-700 border-slate-300',
      iconBgCls: 'bg-slate-200 text-slate-700 ring-1 ring-slate-300',
      accentColor: 'slate',
      metadata: meta
    };
  }

  // 12. MEETINGS & VIDEO CALLS
  if (
    action === 'missed_call' ||
    /missed (video )?call/i.test(text)
  ) {
    return {
      category: 'meeting',
      categoryLabel: 'Missed Call',
      badgeLabel: 'Missed',
      title: 'Missed Video Meeting Call',
      description: cleanText || 'A video call invitation was missed in this workstream.',
      iconName: 'Video',
      headerCls: 'bg-indigo-50/90 border-b border-indigo-100 text-indigo-950',
      badgeCls: 'bg-indigo-100 text-indigo-800 border-indigo-200',
      iconBgCls: 'bg-indigo-100 text-indigo-700 ring-1 ring-indigo-200',
      accentColor: 'indigo',
      metadata: meta
    };
  }

  if (
    action === 'video_call_started' ||
    action === 'video_call_ended' ||
    action === 'meeting_scheduled' ||
    /video (meeting|call)|zoom call|call scheduled/i.test(text)
  ) {
    return {
      category: 'meeting',
      categoryLabel: 'Video Meeting',
      badgeLabel: 'Workstream Call',
      title: 'Workstream Video Meeting Session',
      description: cleanText,
      iconName: 'Video',
      headerCls: 'bg-indigo-50/90 border-b border-indigo-100 text-indigo-950',
      badgeCls: 'bg-indigo-100 text-indigo-800 border-indigo-200',
      iconBgCls: 'bg-indigo-100 text-indigo-700 ring-1 ring-indigo-200',
      accentColor: 'indigo',
      metadata: meta
    };
  }

  // 13. MILESTONE EVENTS
  if (
    action === 'milestone_created' ||
    action === 'milestone_funded' ||
    action === 'milestone_submitted' ||
    action === 'milestone_approved' ||
    /milestone update|milestone (created|funded|completed)/i.test(text)
  ) {
    return {
      category: 'milestone',
      categoryLabel: 'Project Milestone',
      badgeLabel: meta.milestoneTitle ? `Milestone: ${meta.milestoneTitle}` : 'Milestone',
      title: 'Project Milestone Progress Update',
      description: cleanText,
      iconName: 'CheckCircle2',
      headerCls: 'bg-blue-50/90 border-b border-blue-100 text-blue-950',
      badgeCls: 'bg-blue-100 text-blue-800 border-blue-200',
      iconBgCls: 'bg-blue-100 text-blue-700 ring-1 ring-blue-200',
      accentColor: 'blue',
      metadata: meta
    };
  }

  // 14. REQUIREMENTS & BRIEF
  if (
    action === 'requirements_logged' ||
    action === 'requirement_logged' ||
    action === 'brief_submitted' ||
    /project requirements:|brief provided/i.test(text)
  ) {
    return {
      category: 'requirements',
      categoryLabel: 'Project Brief',
      badgeLabel: 'Requirements',
      title: 'Project Requirements Logged',
      description: cleanText,
      iconName: 'FileText',
      headerCls: 'bg-indigo-50/90 border-b border-indigo-100 text-indigo-950',
      badgeCls: 'bg-indigo-100 text-indigo-800 border-indigo-200',
      iconBgCls: 'bg-indigo-100 text-indigo-700 ring-1 ring-indigo-200',
      accentColor: 'indigo',
      metadata: meta
    };
  }

  // 15. CHAT MODERATION
  if (
    action === 'chat_muted' ||
    action === 'chat_unmuted' ||
    /chat (locked|unlocked)/i.test(text)
  ) {
    const isMuted = action === 'chat_muted' || /locked/i.test(text);
    return {
      category: 'chat_moderation',
      categoryLabel: 'Moderation Policy',
      badgeLabel: isMuted ? 'Locked' : 'Unlocked',
      title: isMuted ? 'Workstream Messaging Temporarily Locked' : 'Workstream Messaging Restored',
      description: cleanText,
      iconName: 'Lock',
      headerCls: 'bg-slate-100 border-b border-slate-200 text-slate-900',
      badgeCls: 'bg-slate-200 text-slate-700 border-slate-300',
      iconBgCls: 'bg-slate-200 text-slate-700 ring-1 ring-slate-300',
      accentColor: 'slate',
      metadata: meta
    };
  }

  // 16. ADMINISTRATIVE ACTION
  if (
    action.startsWith('admin_') ||
    /admin (suspended|restricted|deactivated|impersonated)/i.test(text)
  ) {
    return {
      category: 'admin_action',
      categoryLabel: 'Trust & Safety',
      badgeLabel: 'Admin Action',
      title: 'Administrative Account Notice',
      description: cleanText,
      iconName: 'ShieldAlert',
      headerCls: 'bg-rose-50/90 border-b border-rose-100 text-rose-950',
      badgeCls: 'bg-rose-100 text-rose-800 border-rose-200',
      iconBgCls: 'bg-rose-100 text-rose-700 ring-1 ring-rose-200',
      accentColor: 'rose',
      metadata: meta
    };
  }

  // 17. GENERIC ACTIVITY CARD (ZERO PLAIN TEXT STRINGS!)
  return {
    category: 'generic_activity',
    categoryLabel: 'Workstream Activity',
    badgeLabel: 'Activity',
    title: cleanText.length > 60 ? `${cleanText.slice(0, 60)}...` : cleanText,
    description: cleanText,
    iconName: 'Activity',
    headerCls: 'bg-slate-50 border-b border-slate-200/80 text-slate-900',
    badgeCls: 'bg-slate-200 text-slate-700 border-slate-300',
    iconBgCls: 'bg-slate-100 text-slate-700 ring-1 ring-slate-200',
    accentColor: 'slate',
    metadata: meta
  };
}

/** Determines if a workstream message matches an active activity filter */
export function matchesActivityFilter(msg: WorkstreamMessage, filter: ActivityFilter): boolean {
  if (filter === 'all') return true;

  const isOffer = msg.metadata?.action === 'offer_created' && Boolean(msg.metadata?.offerId);
  const isSystemOrMeta = msg.type === 'system' || Boolean(msg.metadata?.action);
  const isChatMessage = !isOffer && !isSystemOrMeta;

  if (filter === 'chat_only') {
    return isChatMessage;
  }

  if (isChatMessage) {
    return false; // other filters target structured activity cards
  }

  if (filter === 'deliveries') {
    const cat = classifyActivityEvent(msg).category;
    return cat === 'delivery' || cat === 'revision';
  }

  if (filter === 'financial') {
    const cat = classifyActivityEvent(msg).category;
    return cat === 'escrow' || cat === 'invoice' || cat === 'tip_bonus' || (isOffer && msg.metadata?.offerKind === 'invoice');
  }

  if (filter === 'proposals_orders') {
    const cat = classifyActivityEvent(msg).category;
    return cat === 'proposal' || cat === 'order' || cat === 'project' || (isOffer && msg.metadata?.offerKind === 'proposal');
  }

  if (filter === 'system_audit') {
    const cat = classifyActivityEvent(msg).category;
    return cat === 'dispute' || cat === 'deadline' || cat === 'timer' || cat === 'meeting' || cat === 'milestone' || cat === 'chat_moderation' || cat === 'admin_action' || cat === 'requirements' || cat === 'cancellation';
  }

  return true;
}

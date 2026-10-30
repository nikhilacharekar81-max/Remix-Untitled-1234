import React, { useEffect, useRef, useState, useMemo } from 'react';
import { formatMessageTime } from '../../utils/messageTime';
import {
  FileText, Download, ShieldCheck, Activity, CheckCircle2,
  Clock, AlertTriangle, MessageSquare, Sparkles,
  FileSignature, Receipt, Lock, Loader2, RotateCcw, ExternalLink,
  Star, Briefcase, Package, Scale, CreditCard,
  Award, ShieldAlert, Video, PhoneMissed, Layers,
  DollarSign, Check, MoreHorizontal, Ban, X
} from 'lucide-react';
import { WorkstreamMessage, WorkstreamOffer, WorkstreamItem, isInquiryWorkstream } from './types';
import { UserAccount } from '../../types';
import { DEFAULT_AVATAR } from '../../constants';
import {
  classifyActivityEvent,
  matchesActivityFilter,
  formatDividerDate,
  formatEventTime,
  formatRelativeTime,
  ActivityFilter,
  ClassifiedEvent
} from './activityClassifier';

interface WorkstreamActivityStreamProps {
  messages: WorkstreamMessage[];
  currentUserId?: string;
  usersList?: UserAccount[];
  partnerUser?: UserAccount;
  onDownloadFile?: (fileInfo: { name: string; url: string }) => void;
  /** Real offer records for this workstream (the source of truth for every offer card). */
  offers?: WorkstreamOffer[];
  buyerId?: string;
  sellerId?: string;
  orderAmount?: number;
  escrowRemaining?: number;
  orderReview?: any;
  sellerReview?: any;
  onOfferAction?: (offerId: string, action: 'accept' | 'decline' | 'cancel', reason?: string) => Promise<{ ok: boolean; error?: string }>;
  onRequestRevisionFromInvoice?: () => void;
  onReplyReview?: (reviewId: string, replyText: string) => Promise<{ ok: boolean; error?: string }>;
  onRetryMessage?: (msg: WorkstreamMessage) => void;
  order?: WorkstreamItem;
  workspaceOrders?: WorkstreamItem[];
  onOpenDeliverModal?: () => void;
  onOpenReleaseModal?: () => void;
  onOpenRevisionModal?: () => void;
  onOpenReviewModal?: () => void;
  onOpenDisputeModal?: () => void;
  onStartVideoCall?: () => void;
  onRespondToExtension?: (action: 'approve' | 'reject', reason?: string) => Promise<{ ok: boolean; error?: string }>;
  isCustomOrderStream?: boolean;
}

export const WorkstreamActivityStream: React.FC<WorkstreamActivityStreamProps> = ({
  messages,
  currentUserId,
  usersList = [],
  partnerUser,
  onDownloadFile,
  offers = [],
  buyerId,
  sellerId,
  orderAmount,
  escrowRemaining,
  orderReview,
  sellerReview,
  onOfferAction,
  onRequestRevisionFromInvoice,
  onReplyReview,
  onRetryMessage,
  order,
  workspaceOrders = [],
  onOpenDeliverModal,
  onOpenReleaseModal,
  onOpenRevisionModal,
  onOpenReviewModal,
  onOpenDisputeModal,
  onStartVideoCall,
  onRespondToExtension,
  isCustomOrderStream
}) => {
  const hasMultipleOrders = workspaceOrders.length > 1;
  const scrollEndRef = useRef<HTMLDivElement>(null);
  const [activeFilter, setActiveFilter] = useState<ActivityFilter>('all');
  const [busyOfferId, setBusyOfferId] = useState<string | null>(null);
  const [confirmingOffer, setConfirmingOffer] = useState<{ offer: WorkstreamOffer; action: 'accept' | 'decline' | 'cancel' } | null>(null);
  const [rejectingOfferId, setRejectingOfferId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [offerError, setOfferError] = useState<{ id: string; message: string } | null>(null);
  const [replyDraft, setReplyDraft] = useState('');
  const [isSubmittingReply, setIsSubmittingReply] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);
  const [expandedOfferIds, setExpandedOfferIds] = useState<Record<string, boolean>>({});
  const [isRejectingExtension, setIsRejectingExtension] = useState<string | null>(null);
  const [extensionRejectionReason, setExtensionRejectionReason] = useState('');
  const [extensionError, setExtensionError] = useState<string | null>(null);

  const KIND_CFG = {
    proposal: { label: 'Proposal', icon: <FileSignature className="w-4 h-4" />, accept: 'Accept & Fund Escrow' },
    invoice: { label: 'Invoice', icon: <Receipt className="w-4 h-4" />, accept: 'Pay Invoice & Release Escrow' },
    deposit: { label: 'Deposit Request', icon: <Lock className="w-4 h-4" />, accept: 'Fund Escrow Deposit' }
  } as const;

  const STATUS_CFG: Record<string, { label: string; cls: string }> = {
    pending: { label: 'Awaiting buyer response', cls: 'bg-amber-50 text-amber-800 border-amber-200' },
    accepted: { label: 'Accepted', cls: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
    paid: { label: 'Paid & Released', cls: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
    declined: { label: 'Rejected', cls: 'bg-rose-50 text-rose-800 border-rose-200' },
    cancelled: { label: 'Cancelled by seller', cls: 'bg-slate-100 text-slate-600 border-slate-200' },
    expired: { label: 'Expired', cls: 'bg-slate-100 text-slate-500 border-slate-200' }
  };

  const executeOfferAction = async (offer: WorkstreamOffer, action: 'accept' | 'decline' | 'cancel', reason?: string) => {
    if (!onOfferAction || busyOfferId) return;
    setConfirmingOffer(null);
    setBusyOfferId(offer.id);
    setOfferError(null);
    const result = await onOfferAction(offer.id, action, reason);
    setBusyOfferId(null);
    if (!result.ok) setOfferError({ id: offer.id, message: result.error || 'Action failed.' });
    else if (rejectingOfferId === offer.id) {
      setRejectingOfferId(null);
      setRejectionReason('');
    }
  };

  /** Deduplicate review_submitted messages (e.g. legacy client-fabricated msg_review_* duplicates) */
  const dedupedMessages = useMemo(() => {
    const isReviewMsg = (m: WorkstreamMessage) =>
      m.type === 'system' &&
      (m.metadata?.action === 'review_submitted' ||
        String(m.id || '').startsWith('msg_review_') ||
        /review submitted/i.test(String(m.text || '')));

    const authoritativeReviews = messages.filter(
      m => isReviewMsg(m) && !String(m.id || '').startsWith('msg_review_') && /review submitted by\s+/i.test(String(m.text || ''))
    );

    const seenKeys = new Set<string>();
    return messages.filter(m => {
      if (!isReviewMsg(m)) return true;

      const isClientFabricated =
        String(m.id || '').startsWith('msg_review_') ||
        !/review submitted by\s+/i.test(String(m.text || ''));

      const mComment = String(m.metadata?.comment || '').trim().toLowerCase();
      const mRating = Number(m.metadata?.rating || 0);
      const mReviewId = m.metadata?.reviewId ? String(m.metadata.reviewId) : '';
      const mReviewerId = m.metadata?.reviewerId ? String(m.metadata.reviewerId) : '';

      // If this is a legacy client-fabricated message and an authoritative server message exists for the same review, drop it
      if (isClientFabricated && authoritativeReviews.some(auth => {
        if (auth.id === m.id) return false;
        const authComment = String(auth.metadata?.comment || '').trim().toLowerCase();
        const authRating = Number(auth.metadata?.rating || 0);
        if (mReviewId && auth.metadata?.reviewId && String(auth.metadata.reviewId) === mReviewId) return true;
        if (mReviewerId && auth.metadata?.reviewerId && String(auth.metadata.reviewerId) === mReviewerId) return true;
        return authRating === mRating && authComment === mComment;
      })) {
        return false;
      }

      const dedupeKey = mReviewId
        ? `id:${mReviewId}`
        : mReviewerId
          ? `reviewer:${mReviewerId}:${mRating}:${mComment}`
          : `text:${String(m.text || '').trim().toLowerCase()}:${mRating}:${mComment}`;

      if (seenKeys.has(dedupeKey)) return false;
      seenKeys.add(dedupeKey);
      return true;
    });
  }, [messages]);

  /** Filter counts */
  const counts = useMemo(() => {
    const res = {
      all: dedupedMessages.length,
      deliveries: 0,
      financial: 0,
      proposals_orders: 0,
      system_audit: 0,
      chat_only: 0
    };
    for (const m of dedupedMessages) {
      if (matchesActivityFilter(m, 'deliveries')) res.deliveries++;
      if (matchesActivityFilter(m, 'financial')) res.financial++;
      if (matchesActivityFilter(m, 'proposals_orders')) res.proposals_orders++;
      if (matchesActivityFilter(m, 'system_audit')) res.system_audit++;
      if (matchesActivityFilter(m, 'chat_only')) res.chat_only++;
    }
    return res;
  }, [dedupedMessages]);

  const filteredMessages = useMemo(() => {
    return dedupedMessages.filter(m => matchesActivityFilter(m, activeFilter));
  }, [dedupedMessages, activeFilter]);

  /** Maps icon names to Lucide icons */
  const renderIcon = (iconName: string) => {
    switch (iconName) {
      case 'FileSignature': return <FileSignature className="w-4 h-4" />;
      case 'Receipt': return <Receipt className="w-4 h-4" />;
      case 'Lock': return <Lock className="w-4 h-4" />;
      case 'ShieldCheck': return <ShieldCheck className="w-4 h-4" />;
      case 'CheckCircle2': return <CheckCircle2 className="w-4 h-4" />;
      case 'RotateCcw': return <RotateCcw className="w-4 h-4" />;
      case 'Package': return <Package className="w-4 h-4" />;
      case 'Briefcase': return <Briefcase className="w-4 h-4" />;
      case 'Clock': return <Clock className="w-4 h-4" />;
      case 'Award': return <Award className="w-4 h-4" />;
      case 'Sparkles': return <Sparkles className="w-4 h-4" />;
      case 'Scale': return <Scale className="w-4 h-4" />;
      case 'Star': return <Star className="w-4 h-4 fill-amber-400 text-amber-400" />;
      case 'Video': return <Video className="w-4 h-4" />;
      case 'PhoneMissed': return <PhoneMissed className="w-4 h-4" />;
      case 'FileText': return <FileText className="w-4 h-4" />;
      case 'ShieldAlert': return <ShieldAlert className="w-4 h-4" />;
      case 'CreditCard': return <CreditCard className="w-4 h-4" />;
      case 'DollarSign': return <DollarSign className="w-4 h-4" />;
      case 'Layers': return <Layers className="w-4 h-4" />;
      case 'AlertTriangle': return <AlertTriangle className="w-4 h-4" />;
      default: return <Activity className="w-4 h-4" />;
    }
  };

  /** Renders the polished Fiverr-Style Interactive Offer Card (PRP-xxxx, INV-xxxx, DEP-xxxx) matching attached reference */
  const renderOfferCard = (msg: WorkstreamMessage, _isMe: boolean, keyStr: string) => {
    const offer = offers.find(o => o.id === msg.metadata?.offerId);
    if (!offer) {
      return (
        <div key={keyStr} className="flex justify-center my-3">
          <div className="w-full max-w-xl bg-white border border-slate-200/80 rounded-2xl p-6 text-xs text-slate-400 flex items-center justify-center gap-2 shadow-sm">
            <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
            <span>Loading offer details ({msg.text})...</span>
          </div>
        </div>
      );
    }
    const isInvoice = offer.kind === 'invoice';
    const st = STATUS_CFG[offer.status] || STATUS_CFG.pending;
    const sym = offer.currencySymbol || '$';
    const iAmBuyer = !!currentUserId && currentUserId === buyerId;
    const iAmSeller = !!currentUserId && currentUserId === sellerId;
    const busy = busyOfferId === offer.id;
    const activeEscrow = escrowRemaining !== undefined ? Number(escrowRemaining) : Number(orderAmount || 0);
    const hasAdditional = isInvoice && offer.amount > activeEscrow;
    const offerFiles = Array.isArray(offer.files) && offer.files.length > 0
      ? offer.files
      : (Array.isArray(msg.metadata?.files) ? msg.metadata.files : []);
    const offerRef = offer.reference || msg.metadata?.reference;
    const isConfirmingThis = confirmingOffer?.offer.id === offer.id;
    const isExpanded = !!expandedOfferIds[offer.id];

    const isCustomOrderStreamLocal = isCustomOrderStream || isInquiryWorkstream(order) || Boolean(
      offer?.metadata?.isInquiry ||
      offer?.metadata?.isCustomOrder ||
      (offer?.workspaceId && !offer?.orderId)
    );

    // Header title & icon matching reference image:
    // "Invoice Received" / "Proposal Received" for buyer; "Invoice Sent" / "Proposal Sent" for seller
    const headerTitle = isInvoice
      ? (isCustomOrderStreamLocal
          ? (iAmBuyer ? 'Custom Order Invoice Received' : 'Custom Order Invoice Sent')
          : (iAmBuyer ? 'Invoice Received' : 'Invoice Sent'))
      : (isCustomOrderStreamLocal
          ? (iAmBuyer ? 'Custom Order Proposal Received' : 'Custom Order Proposal Sent')
          : (iAmBuyer ? 'Proposal Received' : 'Proposal Sent'));

    const iconTileCls = isInvoice
      ? 'bg-blue-50 text-blue-500'
      : 'bg-emerald-50 text-emerald-500';

    const headerIcon = isInvoice
      ? <FileText className="w-5 h-5 text-blue-500" />
      : <FileSignature className="w-5 h-5 text-emerald-500" />;

    const relTime = formatRelativeTime(msg.timestamp) || '2 hours ago';

    // Sender row:
    const sellerObj = usersList.find(u => u.id === sellerId) || (sellerId === partnerUser?.id ? partnerUser : undefined);
    const senderObj = sellerObj || (msg.senderId ? usersList.find(u => u.id === msg.senderId) : undefined) || partnerUser;
    const senderName = senderObj?.name || msg.senderName || 'Alex Carter';
    const senderAvatar = senderObj?.avatar || msg.senderAvatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop';
    const senderRole = 'Seller';

    // One-line message text matching reference image:
    let messageText = '';
    if (offer.status === 'pending') {
      if (isCustomOrderStreamLocal) {
        if (isInvoice) {
          if (iAmBuyer) {
            messageText = `${senderName} has sent you a Custom Order Invoice for this Custom Order.`;
          } else if (iAmSeller) {
            messageText = `Your Custom Order Invoice has been sent to the buyer and is awaiting their response.`;
          } else {
            messageText = `${senderName} has sent a Custom Order Invoice for this Custom Order.`;
          }
        } else {
          if (iAmBuyer) {
            messageText = `${senderName} has sent you a Custom Order Proposal.`;
          } else if (iAmSeller) {
            messageText = `Your Custom Order Proposal has been sent to the buyer and is awaiting their response.`;
          } else {
            messageText = `${senderName} has sent a Custom Order Proposal.`;
          }
        }
      } else {
        if (iAmBuyer) {
          messageText = `${senderName} has sent you an ${isInvoice ? 'invoice' : 'proposal'} for this ${order?.orderType === 'project' ? 'Project' : 'Gig Order'}.`;
        } else if (iAmSeller) {
          messageText = `Your ${isInvoice ? 'invoice' : 'proposal'} has been sent to the buyer and is awaiting their response.`;
        } else {
          messageText = `${senderName} has sent an ${isInvoice ? 'invoice' : 'proposal'} for this ${order?.orderType === 'project' ? 'Project' : 'Gig Order'}.`;
        }
      }
    } else if (offer.status === 'accepted' || offer.status === 'paid') {
      if (isCustomOrderStreamLocal) {
        if (isInvoice) {
          messageText = `The Custom Order Invoice has been accepted, payment was released, and the Custom Order is Completed.`;
        } else {
          messageText = `The Custom Order Proposal has been accepted and escrow was funded to create the Custom Order.`;
        }
      } else {
        messageText = `The ${isInvoice ? 'invoice' : 'proposal'} has been accepted and processed.`;
      }
    } else if (offer.status === 'declined') {
      messageText = `The ${isCustomOrderStreamLocal ? (isInvoice ? 'Custom Order Invoice' : 'Custom Order Proposal') : (isInvoice ? 'invoice' : 'proposal')} was rejected by the buyer.`;
    } else if (offer.status === 'cancelled') {
      messageText = `The ${isCustomOrderStreamLocal ? (isInvoice ? 'Custom Order Invoice' : 'Custom Order Proposal') : (isInvoice ? 'invoice' : 'proposal')} was cancelled by the seller.`;
    } else {
      messageText = `The ${isCustomOrderStreamLocal ? (isInvoice ? 'Custom Order Invoice' : 'Custom Order Proposal') : (isInvoice ? 'invoice' : 'proposal')} has expired.`;
    }

    const amountLabel = isInvoice
      ? (isCustomOrderStreamLocal ? 'Custom Order Invoice Amount' : 'Invoice Amount')
      : (isCustomOrderStreamLocal ? 'Custom Order Proposal Amount' : 'Proposal Amount');
    const formattedAmount = `${sym}${Number(offer.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const detailsLinkText = isInvoice
      ? (isCustomOrderStreamLocal ? 'View Custom Order Invoice details' : 'View invoice details')
      : (isCustomOrderStreamLocal ? 'View Custom Order Proposal details' : 'View proposal details');

    return (
      <div key={keyStr} className="flex justify-center my-4">
        <div className="w-full max-w-xl bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm hover:shadow transition-all">
          {/* Header row */}
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3.5">
              <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${iconTileCls}`}>
                {headerIcon}
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-base font-bold text-gray-900 leading-tight">
                    {headerTitle}
                  </h3>
                  {(hasMultipleOrders || (offer.originOrderId && offer.resultingOrderId && offer.originOrderId !== offer.resultingOrderId)) && (
                    <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200 text-[10px] font-mono">
                      {offer.originOrderId && offer.resultingOrderId && offer.originOrderId !== offer.resultingOrderId
                        ? `#${offer.originOrderId} → #${offer.resultingOrderId}`
                        : `Order #${offer.orderId || msg.orderId}`}
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-400 font-normal mt-0.5">
                  {relTime}
                </p>
              </div>
            </div>
            <button
              type="button"
              aria-label="More options"
              className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-slate-100 transition"
            >
              <MoreHorizontal className="w-5 h-5" />
            </button>
          </div>

          {/* Sender row */}
          <div className="mt-4 flex items-center gap-3">
            <img
              src={senderAvatar || DEFAULT_AVATAR}
              alt={senderName}
              className="w-9 h-9 rounded-full object-cover shrink-0 ring-1 ring-slate-100"
              onError={(e) => { (e.target as HTMLImageElement).src = DEFAULT_AVATAR; }}
            />
            <div>
              <div className="text-sm font-semibold text-gray-900 leading-tight">
                {senderName}
              </div>
              <div className="text-xs text-gray-400 font-normal leading-tight mt-0.5">
                {senderRole}
              </div>
            </div>
          </div>

          {/* One-line message text */}
          <p className="mt-3.5 text-sm text-gray-700 leading-relaxed">
            {messageText}
          </p>

          {/* Light grey rounded inset box */}
          <div className="mt-4 bg-slate-50/80 rounded-xl p-4 border border-slate-100/90">
            <div className="text-xs font-normal text-gray-500">
              {amountLabel}
            </div>
            <div className="text-2xl font-bold text-gray-900 mt-1 font-mono tabular-nums tracking-tight">
              {formattedAmount}
            </div>
            <button
              type="button"
              onClick={() => setExpandedOfferIds(prev => ({ ...prev, [offer.id]: !prev[offer.id] }))}
              className="text-xs font-normal text-gray-500 hover:text-gray-700 mt-3 inline-flex items-center gap-1 cursor-pointer transition"
            >
              <span>{detailsLinkText}</span>
              <span>{isExpanded ? '↑' : '→'}</span>
            </button>

            {/* Expandable details */}
            {isExpanded && (
              <div className="mt-3 pt-3 border-t border-slate-200/70 space-y-2 text-xs text-slate-700">
                {offer.title && (
                  <div>
                    <span className="font-semibold text-slate-800">Title: </span>
                    <span>{offer.title}</span>
                  </div>
                )}
                {offer.deliveryDays && (
                  <div className="flex items-center gap-1.5 text-slate-500">
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                    <span>Estimated delivery in <strong className="text-slate-800">{offer.deliveryDays}</strong> day{offer.deliveryDays === 1 ? '' : 's'}</span>
                  </div>
                )}
                {offer.note && (
                  <div className="bg-white p-2.5 rounded-lg border border-slate-200/80 text-xs text-slate-700 whitespace-pre-wrap">
                    <span className="font-bold text-[10px] uppercase text-slate-400 block mb-1">Scope & Deliverables</span>
                    {offer.note}
                  </div>
                )}
                {isInvoice && hasAdditional && (
                  <div className="text-amber-800 bg-amber-50 p-2 rounded-lg border border-amber-200">
                    Escrow available: {sym}{activeEscrow.toLocaleString()} • Additional debit: +{sym}{(offer.amount - activeEscrow).toLocaleString()}
                  </div>
                )}
                {offerFiles.length > 0 && (
                  <div className="space-y-1 pt-1">
                    <span className="text-[10px] font-bold uppercase text-slate-400 block">Deliverables</span>
                    <div className="flex flex-wrap gap-2">
                      {offerFiles.map((f: any, idx: number) => (
                        <button
                          key={`${offer.id}-f-${idx}`}
                          type="button"
                          onClick={() => onDownloadFile?.(f)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-lg text-xs font-medium cursor-pointer"
                        >
                          <FileText className="w-3.5 h-3.5 text-emerald-600" />
                          <span className="truncate max-w-[160px]">{f.name || 'File'}</span>
                          <Download className="w-3 h-3 text-slate-400" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Pending state buttons */}
          {offer.status === 'pending' && (
            <>
              {/* Buyer View: [Accept] or [Accept & Pay] AND [Reject] on SAME card */}
              {iAmBuyer && !isConfirmingThis && rejectingOfferId !== offer.id && (
                <div className="mt-5 flex items-center gap-3">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setConfirmingOffer({ offer, action: 'accept' })}
                    className="flex-1 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-medium text-sm rounded-lg flex items-center justify-center gap-2 shadow-sm transition cursor-pointer"
                  >
                    {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4 stroke-[2.5]" />}
                    <span>{isInvoice ? 'Accept' : 'Accept & Pay'}</span>
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      if (order?.orderType === 'project' && isInvoice) {
                        setRejectingOfferId(offer.id);
                        setRejectionReason('');
                      } else {
                        executeOfferAction(offer, 'decline');
                      }
                    }}
                    className="flex-1 py-2.5 px-4 bg-rose-500 hover:bg-rose-600 disabled:opacity-50 text-white font-medium text-sm rounded-lg flex items-center justify-center gap-2 shadow-sm transition cursor-pointer"
                  >
                    <X className="w-4 h-4 stroke-[2.5]" />
                    <span>Reject</span>
                  </button>
                </div>
              )}

              {/* Project Invoice Rejection Reason Input Panel (Projects Only) */}
              {iAmBuyer && rejectingOfferId === offer.id && (
                <div className="mt-4 p-4 rounded-xl bg-rose-50/90 border border-rose-200 space-y-3 animate-in fade-in">
                  <div className="flex items-center gap-2 text-rose-950 font-bold text-xs">
                    <AlertTriangle className="w-4 h-4 text-rose-600" />
                    <span>Reason for rejecting project invoice (required)</span>
                  </div>
                  <textarea
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    placeholder="Please explain why this invoice is being rejected (e.g. required changes or deliverables)..."
                    rows={3}
                    maxLength={1000}
                    className="w-full text-xs p-2.5 bg-white border border-rose-300 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-rose-500"
                  />
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      disabled={busy || !rejectionReason.trim()}
                      onClick={() => executeOfferAction(offer, 'decline', rejectionReason.trim())}
                      className="flex-1 py-2 px-3 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-bold rounded-lg text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-sm transition"
                    >
                      {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                      <span>Confirm Rejection</span>
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => { setRejectingOfferId(null); setRejectionReason(''); }}
                      className="py-2 px-3 bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 font-bold rounded-lg text-xs cursor-pointer transition"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Buyer Confirmation Panel */}
              {iAmBuyer && isConfirmingThis && (
                <div className="mt-4 p-4 rounded-xl bg-emerald-50/90 border border-emerald-200 space-y-3 animate-in fade-in">
                  <div className="flex items-center gap-2 text-emerald-950 font-bold text-xs">
                    <ShieldCheck className="w-4 h-4 text-emerald-600" />
                    <span>
                      {isInvoice
                        ? `Confirm Payment: ${isCustomOrderStreamLocal ? 'Custom Order Invoice' : 'Invoice'} ${offer.number || ''} (${sym}${offer.amount.toLocaleString()})`
                        : `Confirm Accept & Pay: ${isCustomOrderStreamLocal ? 'Custom Order Proposal' : 'Proposal'} (${sym}${offer.amount.toLocaleString()})`}
                    </span>
                  </div>
                  <p className="text-xs text-emerald-900 leading-relaxed font-mono tabular-nums">
                    {isInvoice ? (
                      hasAdditional ? (
                        <>Releases <strong>{sym}{activeEscrow.toLocaleString()}</strong> from Escrow and debits <strong>{sym}{Number(offer.clientAdditionalTotal ?? (offer.amount - activeEscrow)).toLocaleString()}</strong> from your wallet.</>
                      ) : (
                        <>Releases <strong>{sym}{offer.amount.toLocaleString()}</strong> directly from your funded Escrow deposit to the seller's wallet to complete the {isCustomOrderStreamLocal ? 'Custom Order' : 'order'}.</>
                      )
                    ) : (
                      <>Funds <strong>{sym}{offer.amount.toLocaleString()}</strong> into Escrow Vault under protection to create your {isCustomOrderStreamLocal ? 'Custom Order' : 'order'} (total wallet debit: <strong>{sym}{Number(offer.clientTotal ?? offer.amount).toLocaleString()}</strong> incl. fees).</>
                    )}
                  </p>
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => executeOfferAction(offer, 'accept')}
                      className="flex-1 py-2 px-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-sm transition"
                    >
                      {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      <span>Confirm & Proceed</span>
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setConfirmingOffer(null)}
                      className="py-2 px-3 bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 font-bold rounded-lg text-xs cursor-pointer transition"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Seller View: [Cancel Proposal] / [Cancel / Withdraw] or [Cancel Invoice] */}
              {iAmSeller && (
                <div className="mt-5 flex items-center">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => executeOfferAction(offer, 'cancel')}
                    className="py-2.5 px-5 border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50 font-medium text-sm rounded-lg flex items-center justify-center gap-2 transition cursor-pointer"
                  >
                    {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Ban className="w-4 h-4 text-slate-600" />}
                    <span>
                      {isCustomOrderStreamLocal
                        ? `Cancel ${isInvoice ? 'Custom Order Invoice' : 'Custom Order Proposal'}`
                        : order?.orderType === 'project'
                          ? (isInvoice ? 'Cancel / Withdraw' : 'Cancel Proposal')
                          : `Cancel ${isInvoice ? 'Invoice' : 'Proposal'}`}
                    </span>
                  </button>
                </div>
              )}
            </>
          )}

          {/* Resolved state: replace buttons with small status badge/line */}
          {offer.status !== 'pending' && (
            <div className="mt-5 pt-3.5 border-t border-slate-100 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500 font-medium">Status</span>
                <span className={`px-2.5 py-1 rounded-md border text-xs font-semibold ${st.cls}`}>
                  {st.label}
                </span>
              </div>
              {offer.rejectionReason && (
                <div className="text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-lg p-2.5">
                  <strong className="block text-[10px] font-bold uppercase tracking-wider text-rose-900 mb-0.5">Rejection Reason:</strong>
                  <span>{offer.rejectionReason}</span>
                </div>
              )}
            </div>
          )}

          {offerError?.id === offer.id && (
            <p className="text-xs font-semibold text-rose-600 pt-2">{offerError.message}</p>
          )}
        </div>
      </div>
    );
  };

  /** Renders the complete, polished Fiverr-style Visual Card for system and activity events */
  const renderVisualActivityCard = (msg: WorkstreamMessage, uniqueKey: string) => {
    const meta = msg.metadata || {};
    const info: ClassifiedEvent = classifyActivityEvent(msg);
    const delivFiles = Array.isArray(meta.files) ? meta.files : [];
    const iAmSeller = !!currentUserId && currentUserId === sellerId;
    const iAmBuyer = !!currentUserId && currentUserId === buyerId;
    const orderIsCompleted = order?.status === 'completed';

    // Review response logic
    const canSellerReplyToReview =
      info.category === 'review' &&
      iAmSeller &&
      orderReview?.id &&
      !orderReview?.reply &&
      !!onReplyReview &&
      meta.reviewerRole !== 'seller';

    const existingReply = meta.reply || orderReview?.reply;

    const senderObj = usersList.find(u => u.id === msg.senderId) || (msg.senderId === partnerUser?.id ? partnerUser : undefined);
    const senderName = msg.senderName || senderObj?.name || (msg.type === 'system' ? 'WorkPerHour System' : 'Collaborator');
    const senderAvatar = msg.senderAvatar || senderObj?.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop';
    const senderRole = msg.senderId === sellerId ? 'Seller' : (msg.senderId === buyerId ? 'Buyer' : 'System');

    const iconTileCls =
      info.accentColor === 'blue' ? 'bg-blue-50 text-blue-500' :
      info.accentColor === 'rose' ? 'bg-rose-50 text-rose-500' :
      info.accentColor === 'purple' ? 'bg-purple-50 text-purple-600' :
      info.accentColor === 'amber' ? 'bg-amber-50 text-amber-600' :
      info.accentColor === 'teal' ? 'bg-teal-50 text-teal-600' :
      info.accentColor === 'emerald' ? 'bg-emerald-50 text-emerald-600' :
      'bg-slate-100 text-slate-600';

    return (
      <div key={uniqueKey} className="flex justify-start my-3">
        <div className="w-full bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm hover:shadow transition-all space-y-4">
          {/* Header Row */}
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3.5 min-w-0">
              <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${iconTileCls}`}>
                {renderIcon(info.iconName)}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-base font-bold text-gray-900 leading-tight">
                    {info.title}
                  </h3>
                  {info.badgeLabel && (
                    <span className={`px-2 py-0.5 rounded-full border text-[10px] font-bold ${info.badgeCls}`}>
                      {info.badgeLabel}
                    </span>
                  )}
                  {(hasMultipleOrders || (msg.orderId && order?.id && msg.orderId !== order.id)) && msg.orderId && (
                    <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200 text-[10px] font-mono">
                      Order #{msg.orderId}
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-400 font-normal mt-0.5">
                  {formatRelativeTime(msg.timestamp) || formatEventTime(msg.timestamp)}
                </p>
              </div>
            </div>
            <button
              type="button"
              aria-label="More options"
              className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-slate-100 transition shrink-0"
            >
              <MoreHorizontal className="w-5 h-5" />
            </button>
          </div>

          {/* Sender row */}
          {msg.senderId && (
            <div className="flex items-center gap-3">
              <img
                src={senderAvatar || DEFAULT_AVATAR}
                alt={senderName}
                className="w-9 h-9 rounded-full object-cover shrink-0 ring-1 ring-slate-100"
                onError={(e) => { (e.target as HTMLImageElement).src = DEFAULT_AVATAR; }}
              />
              <div>
                <div className="text-sm font-semibold text-gray-900 leading-tight">
                  {senderName}
                </div>
                <div className="text-xs text-gray-400 font-normal leading-tight mt-0.5">
                  {senderRole}
                </div>
              </div>
            </div>
          )}

          {/* One-line message text */}
          {info.description && (
            <p className="text-sm text-gray-700 leading-relaxed">
              {info.description}
            </p>
          )}

          {/* Main Card Content */}
          <div className="space-y-3.5 pt-1">

            {/* 1. PROJECT EVENT DETAILS */}
            {info.category === 'project' && (
              <div className="p-3.5 bg-teal-50/60 rounded-xl border border-teal-100 text-xs text-teal-950 space-y-2">
                <div className="flex items-center justify-between flex-wrap gap-2 text-[11px] font-semibold">
                  <div className="flex items-center gap-1.5">
                    <Briefcase className="w-3.5 h-3.5 text-teal-600" />
                    <span>Project: {order?.title || meta.title || 'Marketplace Project'}</span>
                  </div>
                  {order?.amount && (
                    <span className="font-mono tabular-nums font-bold text-teal-800">
                      Budget: ${order.amount.toLocaleString()} USD
                    </span>
                  )}
                </div>
                {meta.scope && (
                  <p className="text-xs text-teal-900 leading-relaxed">{meta.scope}</p>
                )}
              </div>
            )}

            {/* 2. PROPOSAL EVENT DETAILS */}
            {info.category === 'proposal' && meta.amount && (
              <div className="p-3.5 bg-emerald-50/60 rounded-xl border border-emerald-100 flex items-center justify-between text-xs text-emerald-950">
                <div className="flex items-center gap-2">
                  <FileSignature className="w-4 h-4 text-emerald-600" />
                  <span>Bid Amount: <strong className="font-mono tabular-nums">${Number(meta.amount).toLocaleString()} USD</strong></span>
                </div>
                {meta.deliveryDays && (
                  <span className="text-slate-500 text-[11px]">Delivery: {meta.deliveryDays} days</span>
                )}
              </div>
            )}

            {/* 3. ORDER / HIRING SPECIFICS */}
            {info.category === 'order' && (
              <div className="p-3.5 bg-blue-50/60 rounded-xl border border-blue-100 space-y-2 text-xs text-blue-950">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-semibold flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
                    <span>WorkPerHour Escrow Protection Active</span>
                  </span>
                  {order?.dueDate && (
                    <span className="text-slate-500 font-mono tabular-nums">Due: {order.dueDate}</span>
                  )}
                </div>
              </div>
            )}

            {/* 4. DELIVERABLE SPECIFICS */}
            {info.category === 'delivery' && (
              <div className="space-y-3 pt-1">
                {/* Notes callout */}
                {meta.notes && (
                  <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-700 leading-relaxed">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">Submission Notes</span>
                    {meta.notes}
                  </div>
                )}

                {/* Reference URL */}
                {meta.reference && (
                  <div className="flex items-center gap-2 text-xs text-blue-900 bg-blue-50/70 px-3.5 py-2 rounded-xl border border-blue-100">
                    <ExternalLink className="w-3.5 h-3.5 shrink-0 text-blue-600" />
                    <span className="font-semibold text-[11px] text-blue-950">Reference:</span>
                    <span className="truncate font-medium">{meta.reference}</span>
                  </div>
                )}

                {/* Files attached */}
                {delivFiles.length > 0 && (
                  <div className="space-y-1.5">
                    <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      Deliverable Files ({delivFiles.length})
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {delivFiles.map((f: any, fIdx: number) => (
                        <button
                          key={`${uniqueKey}-f-${fIdx}`}
                          type="button"
                          onClick={() => onDownloadFile?.(f)}
                          className="inline-flex items-center gap-2 px-3 py-1.5 bg-slate-50 hover:bg-emerald-50 text-slate-800 hover:text-emerald-950 border border-slate-200 hover:border-emerald-300 rounded-xl text-xs font-semibold transition cursor-pointer"
                        >
                          <FileText className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          <span className="truncate max-w-[190px]">{f.name || 'Deliverable'}</span>
                          {f.size && <span className="text-[10px] text-slate-500 font-mono tabular-nums">({f.size})</span>}
                          <Download className="w-3.5 h-3.5 text-slate-400 hover:text-emerald-700 ml-0.5 shrink-0" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Buyer Actions on Delivery */}
                {iAmBuyer && !orderIsCompleted && (
                  <div className="pt-2 border-t border-slate-100 flex items-center gap-2.5">
                    {onOpenReleaseModal && (
                      <button
                        type="button"
                        onClick={onOpenReleaseModal}
                        className="flex-1 py-2 px-3.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs transition"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Accept & Release Escrow</span>
                      </button>
                    )}
                    {onOpenRevisionModal && (
                      <button
                        type="button"
                        onClick={onOpenRevisionModal}
                        className="py-2 px-3.5 bg-purple-50 hover:bg-purple-100 text-purple-950 border border-purple-200 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 cursor-pointer transition"
                      >
                        <RotateCcw className="w-3.5 h-3.5 text-purple-600" />
                        <span>Request Revision</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* 5. REVISION SPECIFICS */}
            {info.category === 'revision' && (
              <div className="space-y-3 pt-1">
                {meta.reason && (
                  <div className="p-3.5 bg-purple-50/80 rounded-xl border border-purple-200 text-xs text-purple-950 leading-relaxed">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-purple-800 block mb-1">Client Feedback & Requested Changes</span>
                    &ldquo;{meta.reason}&rdquo;
                  </div>
                )}

                {/* Seller Action: Submit Revision */}
                {iAmSeller && !orderIsCompleted && onOpenDeliverModal && (
                  <div className="pt-2 border-t border-purple-100 flex justify-end">
                    <button
                      type="button"
                      onClick={onOpenDeliverModal}
                      className="py-2 px-4 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl text-xs flex items-center gap-2 cursor-pointer shadow-2xs transition"
                    >
                      <Package className="w-3.5 h-3.5" />
                      <span>Submit Revised Deliverables</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* 6. REVIEW SPECIFICS */}
            {info.category === 'review' && (
              <div className="space-y-3 pt-1">
                {/* Star rating display */}
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-0.5 text-amber-400">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Star
                        key={s}
                        className={`w-4 h-4 ${s <= (meta.rating || 5) ? 'fill-amber-400 text-amber-400' : 'text-slate-200'}`}
                      />
                    ))}
                  </div>
                  <span className="text-xs font-bold text-slate-800 font-mono tabular-nums">
                    {meta.rating ? `${meta.rating}.0 / 5.0` : '5.0 / 5.0'}
                  </span>
                </div>

                {/* Comment quote */}
                {meta.comment && (
                  <div className="p-3.5 bg-amber-50/60 rounded-xl border border-amber-200 text-xs text-slate-800 italic leading-relaxed">
                    &ldquo;{meta.comment}&rdquo;
                  </div>
                )}

                {/* Existing seller reply */}
                {existingReply && (
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 flex items-center gap-1.5">
                      <MessageSquare className="w-3 h-3 text-emerald-600" />
                      Freelancer Response ({existingReply.sellerName || 'Seller'}):
                    </span>
                    <p className="text-xs text-slate-700">{existingReply.text}</p>
                  </div>
                )}

                {/* Seller Reply Form */}
                {canSellerReplyToReview && (
                  <div className="pt-2 border-t border-amber-200 space-y-2">
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-amber-900">
                      Post Public Freelancer Response
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={replyDraft}
                        onChange={(e) => setReplyDraft(e.target.value)}
                        placeholder="Thank the client or share your perspective..."
                        className="flex-1 px-3 py-1.5 bg-white border border-amber-300 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
                      />
                      <button
                        type="button"
                        disabled={isSubmittingReply || !replyDraft.trim()}
                        onClick={async () => {
                          if (!onReplyReview || !orderReview?.id || !replyDraft.trim()) return;
                          setIsSubmittingReply(true);
                          setReplyError(null);
                          const res = await onReplyReview(orderReview.id, replyDraft.trim());
                          setIsSubmittingReply(false);
                          if (res.ok) setReplyDraft('');
                          else setReplyError(res.error || 'Failed to post reply.');
                        }}
                        className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-bold rounded-xl text-xs transition cursor-pointer"
                      >
                        {isSubmittingReply ? 'Posting...' : 'Reply'}
                      </button>
                    </div>
                    {replyError && <p className="text-[11px] text-rose-600 font-semibold">{replyError}</p>}
                  </div>
                )}
              </div>
            )}

            {/* 7. ESCROW SPECIFICS */}
            {info.category === 'escrow' && (
              <div className="p-3 bg-emerald-50/60 rounded-xl border border-emerald-100 flex items-center gap-2.5 text-xs text-emerald-950">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="font-medium">Protected by WorkPerHour 14-Day Escrow Guarantee. Funds remain secure until work is verified.</span>
              </div>
            )}

            {/* 8. TIP & BONUS SPECIFICS */}
            {info.category === 'tip_bonus' && (
              <div className="p-3.5 bg-amber-50/80 rounded-xl border border-amber-200 flex items-center gap-3 text-xs text-amber-950 font-medium">
                <Award className="w-5 h-5 text-amber-600 shrink-0" />
                <div>
                  <span className="font-bold block">Appreciation Bonus Credited</span>
                  <span>Buyer awarded freelancer an additional bonus tip for high-quality delivery.</span>
                </div>
              </div>
            )}

            {/* 9. DEADLINE SPECIFICS */}
            {info.category === 'deadline' && (
              <div className="space-y-3 pt-1">
                {(meta.oldDate || meta.newDueDate) && (
                  <div className="p-3 bg-amber-50/60 rounded-xl border border-amber-100 flex items-center justify-between text-xs text-amber-950 font-medium">
                    <span>Previous Due: <strong className="font-mono tabular-nums">{meta.oldDate || '-'}</strong></span>
                    <span className="text-amber-500">➔</span>
                    <span>New Due Date: <strong className="font-mono tabular-nums text-emerald-700">{meta.newDueDate || '-'}</strong></span>
                  </div>
                )}

                {meta.action === 'time_extension_requested' && (
                  <div className="p-3.5 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-950 leading-relaxed shadow-sm">
                    <div className="flex items-center gap-2 mb-2 font-bold text-amber-900">
                      <Clock className="w-4 h-4" />
                      <span>Delivery Extension Requested</span>
                    </div>
                    <div className="space-y-2 text-amber-800">
                      <p>Seller requested <strong>{meta.days || 'additional'} days</strong>.</p>
                      {meta.reason && <p className="italic bg-white/60 p-2.5 rounded-lg border border-amber-100">&ldquo;{meta.reason}&rdquo;</p>}
                    </div>

                    {iAmBuyer && !orderIsCompleted && (
                      <div className="pt-3.5 mt-3 border-t border-amber-200/50 space-y-3">
                        {isRejectingExtension === msg.id ? (
                          <div className="space-y-2 animate-in fade-in slide-in-from-top-1">
                            <label className="block text-[10px] font-bold uppercase text-rose-800">Rejection Reason (Required)</label>
                            <textarea
                              value={extensionRejectionReason}
                              onChange={(e) => setExtensionRejectionReason(e.target.value)}
                              placeholder="Explain why you are rejecting the extension..."
                              className="w-full p-2 bg-white border border-rose-300 rounded-lg text-xs"
                              rows={2}
                            />
                            <div className="flex gap-2">
                              <button
                                onClick={async () => {
                                  if (!extensionRejectionReason.trim()) return;
                                  const res = await onRespondToExtension?.('reject', extensionRejectionReason.trim());
                                  if (res?.ok) {
                                    setIsRejectingExtension(null);
                                    setExtensionRejectionReason('');
                                  } else {
                                    setExtensionError(res?.error || 'Failed to reject');
                                  }
                                }}
                                className="flex-1 py-1.5 bg-rose-600 text-white font-bold rounded-lg text-[10px]"
                              >
                                Confirm Reject
                              </button>
                              <button
                                onClick={() => setIsRejectingExtension(null)}
                                className="px-3 py-1.5 bg-white border border-slate-200 text-slate-600 font-bold rounded-lg text-[10px]"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => onRespondToExtension?.('approve')}
                              className="flex-1 py-2 px-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs transition cursor-pointer shadow-2xs"
                            >
                              Approve Extension
                            </button>
                            <button
                              onClick={() => setIsRejectingExtension(msg.id)}
                              className="flex-1 py-2 px-3 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 font-bold rounded-xl text-xs transition cursor-pointer"
                            >
                              Reject Extension
                            </button>
                          </div>
                        )}
                        {extensionError && <p className="text-[10px] text-rose-600 font-bold">{extensionError}</p>}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* 10. DISPUTE SPECIFICS */}
            {info.category === 'dispute' && (
              <div className="space-y-2">
                {meta.notes && (
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-700">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-0.5">Mediation Notes</span>
                    {meta.notes}
                  </div>
                )}
                {onOpenDisputeModal && (
                  <div className="pt-1 flex justify-end">
                    <button
                      type="button"
                      onClick={onOpenDisputeModal}
                      className="px-3.5 py-1.5 border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold rounded-xl text-xs transition cursor-pointer"
                    >
                      View Dispute Details
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* 11. VIDEO CALL & MEETING SPECIFICS */}
            {info.category === 'meeting' && (
              <div className="p-3.5 bg-indigo-50/70 rounded-xl border border-indigo-100 flex items-center justify-between gap-3 text-xs text-indigo-950">
                <div className="flex items-center gap-2">
                  <Video className="w-4 h-4 text-indigo-600 shrink-0" />
                  <span>Workstream Live Video Conference Channel</span>
                </div>
                {onStartVideoCall && (
                  <button
                    type="button"
                    onClick={onStartVideoCall}
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-lg text-xs flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
                  >
                    <Video className="w-3.5 h-3.5" />
                    <span>Start Video Call</span>
                  </button>
                )}
              </div>
            )}

            {/* 12. ORDER COMPLETION REVIEW CALL TO ACTION */}
            {info.category === 'order' && /completed/i.test(info.title) && onOpenReviewModal && !orderReview && (
              <div className="pt-2 border-t border-slate-100 flex justify-end">
                <button
                  type="button"
                  onClick={onOpenReviewModal}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
                >
                  <Star className="w-3.5 h-3.5" />
                  <span>Leave Feedback & Review</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  useEffect(() => {
    scrollEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, activeFilter]);

  let lastRenderedDate = '';

  const filterButtons: Array<{ id: ActivityFilter; label: string; count: number }> = [
    { id: 'all', label: 'All Activity', count: counts.all },
    { id: 'deliveries', label: 'Deliverables & Revisions', count: counts.deliveries },
    { id: 'proposals_orders', label: 'Proposals & Orders', count: counts.proposals_orders },
    { id: 'financial', label: 'Invoices & Escrow', count: counts.financial },
    { id: 'system_audit', label: 'System & Audit', count: counts.system_audit },
    { id: 'chat_only', label: 'Chat Only', count: counts.chat_only }
  ];

  return (
    <div className="flex flex-col bg-slate-50/50">
      {/* FIVERR-STYLE ACTIVITY FILTER BAR */}
      <div className="px-4 py-2 bg-white border-b border-slate-200/90 flex items-center justify-between gap-2 overflow-x-auto shrink-0 scrollbar-none">
        <div className="flex items-center gap-1.5 p-1 bg-slate-100/80 rounded-xl">
          {filterButtons.map((btn) => (
            <button
              key={btn.id}
              type="button"
              onClick={() => setActiveFilter(btn.id)}
              className={`px-3 py-1.5 text-[13px] font-semibold rounded-lg transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                activeFilter === btn.id
                  ? 'bg-white text-slate-900 shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>{btn.label}</span>
              <span className={`text-[9px] px-1.5 py-0.2 rounded font-mono tabular-nums ${
                activeFilter === btn.id ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-200/70 text-slate-600'
              }`}>
                {btn.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* TIMELINE MESSAGES STREAM */}
      <div className="p-4 sm:p-6 space-y-4">
        {filteredMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center text-slate-400 space-y-2">
            <Activity className="w-8 h-8 text-slate-300" />
            <p className="text-xs font-medium">No activity items matching the selected filter.</p>
            <button
              type="button"
              onClick={() => setActiveFilter('all')}
              className="text-xs font-bold text-emerald-600 hover:underline cursor-pointer"
            >
              Reset to All Activity
            </button>
          </div>
        ) : (
          (() => {
            const renderedOfferIds = new Set<string>();
            return filteredMessages.map((msg, index) => {
              const uniqueKey = `${msg.id || 'msg'}-${index}`;
              const isMe = msg.senderId === currentUserId;

              // Date grouping divider
              const msgDate = formatDividerDate(msg.timestamp);
              const shouldShowDivider = msgDate && msgDate !== lastRenderedDate;
              if (shouldShowDivider) {
                lastRenderedDate = msgDate;
              }

              // Hide duplicate offer system activity cards (accepted, declined, cancelled, paid)
              // because the single offer card updates in place to show the status.
              const action = msg.metadata?.action || '';
              const offerId = msg.metadata?.offerId;
              const isOfferResolutionAction =
                action === 'offer_accepted' ||
                action === 'offer_declined' ||
                action === 'offer_cancelled' ||
                action === 'offer_paid' ||
                action === 'proposal_accepted' ||
                action === 'proposal_declined' ||
                action === 'proposal_withdrawn' ||
                (typeof action === 'string' && action.startsWith('offer_') && action !== 'offer_created');

              if (isOfferResolutionAction && offerId && offers.some(o => o.id === offerId)) {
                return null;
              }

              // 1. Offer creation events (PRP-xxxx, INV-xxxx, DEP-xxxx)
              if (action === 'offer_created' && offerId) {
                if (renderedOfferIds.has(offerId)) {
                  return null;
                }
                renderedOfferIds.add(offerId);

                return (
                  <React.Fragment key={`wrap-${uniqueKey}`}>
                    {shouldShowDivider && (
                      <div className="flex items-center justify-center my-4">
                        <div className="h-px bg-slate-200/70 flex-1 max-w-[100px]" />
                        <span className="mx-3 text-xs font-semibold tracking-wider text-slate-500 uppercase bg-white dark:bg-slate-900 px-3 py-1 rounded-full border border-slate-200 dark:border-slate-800 shadow-2xs">
                          {msgDate}
                        </span>
                        <div className="h-px bg-slate-200/70 flex-1 max-w-[100px]" />
                      </div>
                    )}
                    {renderOfferCard(msg, isMe, uniqueKey)}
                  </React.Fragment>
                );
              }

            // 2. System and meaningful activity events -> Polished Visual Activity Card
            if (msg.type === 'system' || msg.metadata?.action) {
              return (
                <React.Fragment key={`wrap-${uniqueKey}`}>
                  {shouldShowDivider && (
                    <div className="flex items-center justify-center my-4">
                      <div className="h-px bg-slate-200/70 flex-1 max-w-[100px]" />
                      <span className="mx-3 text-xs font-semibold tracking-wider text-slate-500 uppercase bg-white dark:bg-slate-900 px-3 py-1 rounded-full border border-slate-200 dark:border-slate-800 shadow-2xs">
                        {msgDate}
                      </span>
                      <div className="h-px bg-slate-200/70 flex-1 max-w-[100px]" />
                    </div>
                  )}
                  {renderVisualActivityCard(msg, uniqueKey)}
                </React.Fragment>
              );
            }

            // 3. Conversational messages (Chat bubbles)
            const senderObj = usersList.find(u => u.id === msg.senderId) || (isMe ? undefined : partnerUser);
            const avatarUrl = msg.senderAvatar || senderObj?.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop';
            const senderName = msg.senderName || senderObj?.name || (isMe ? 'You' : 'Partner');

            const isFailed = msg.status === 'failed';
            const isSending = msg.status === 'sending';

            return (
              <React.Fragment key={`wrap-${uniqueKey}`}>
                {shouldShowDivider && (
                  <div className="flex items-center justify-center my-4">
                    <div className="h-px bg-slate-200/70 flex-1 max-w-[100px]" />
                    <span className="mx-3 text-xs font-semibold tracking-wider text-slate-500 uppercase bg-white dark:bg-slate-900 px-3 py-1 rounded-full border border-slate-200 dark:border-slate-800 shadow-2xs">
                      {msgDate}
                    </span>
                    <div className="h-px bg-slate-200/70 flex-1 max-w-[100px]" />
                  </div>
                )}
                <div key={uniqueKey} className={`flex gap-3 my-2.5 ${isMe ? 'flex-row-reverse' : ''}`}>
                  <img 
                    src={avatarUrl || DEFAULT_AVATAR} 
                    alt={senderName} 
                    className="w-9 h-9 rounded-full object-cover shrink-0 mt-0.5 border border-slate-200 dark:border-slate-700 shadow-2xs" 
                    onError={(e) => { (e.target as HTMLImageElement).src = DEFAULT_AVATAR; }}
                  />
                  <div className={`flex flex-col gap-1 ${isMe ? 'items-end' : 'items-start'} max-w-[80%] sm:max-w-[75%]`}>
                    <div className="flex items-center gap-2 px-1">
                      <span className="text-xs font-bold text-slate-600 dark:text-slate-400">{senderName}</span>
                      {(hasMultipleOrders || (msg.orderId && order?.id && msg.orderId !== order.id)) && msg.orderId && (
                        <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 text-xs font-mono font-semibold">
                          #{msg.orderId}
                        </span>
                      )}
                    </div>
                    <div className={`px-4.5 py-3 rounded-2xl text-sm leading-relaxed ${
                      isFailed
                        ? 'bg-rose-50 dark:bg-rose-950/60 border border-rose-300 dark:border-rose-800 text-rose-900 dark:text-rose-200 rounded-tr-none'
                        : isMe
                          ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-normal rounded-tr-none shadow-sm'
                          : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 rounded-tl-none shadow-xs'
                    }`}>
                      {msg.type === 'file' && msg.fileInfo ? (
                        <div className="flex items-center gap-3">
                          <div className={`p-2.5 rounded-xl ${isFailed ? 'bg-rose-100 text-rose-700' : isMe ? 'bg-white/20 text-white' : 'bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400'}`}>
                            <FileText className="w-5 h-5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-bold truncate text-sm">{msg.fileInfo.name}</div>
                            <div className="text-xs opacity-80 font-mono tabular-nums">{msg.fileInfo.size}</div>
                          </div>
                          {!isFailed && (
                            <button
                              type="button"
                              onClick={() => onDownloadFile?.(msg.fileInfo!)}
                              className={`p-2 rounded-lg cursor-pointer transition ${isMe ? 'hover:bg-white/20 text-white' : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500'}`}
                              title="Download shared file"
                            >
                              <Download className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {msg.metadata?.offPlatformWarning && (
                            <div className="p-2.5 bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 rounded-xl text-amber-900 dark:text-amber-200 font-semibold flex items-center gap-2 text-xs">
                              <ShieldAlert className="w-4 h-4 shrink-0 text-amber-600" />
                              <span>Safety Warning: Keep payments & contact on WorkPerHour to stay protected.</span>
                            </div>
                          )}
                          <p className="leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                        </div>
                      )}
                    </div>

                    {/* Status and retry bar */}
                    <div className="flex items-center gap-2 px-1 text-xs">
                      {isFailed && (
                        <div className="flex items-center gap-1.5 text-rose-600 font-semibold">
                          <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
                          <span>Failed to send</span>
                          {isMe && onRetryMessage && (
                            <button
                              type="button"
                              onClick={() => onRetryMessage(msg)}
                              className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-rose-100 hover:bg-rose-200 text-rose-700 rounded-md font-bold transition cursor-pointer"
                              title="Retry sending this message"
                            >
                              <RotateCcw className="w-3 h-3" />
                              <span>Retry</span>
                            </button>
                          )}
                        </div>
                      )}
                      {isSending && (
                        <div className="flex items-center gap-1.5 text-slate-400">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Sending...</span>
                        </div>
                      )}
                      {!isFailed && !isSending && (
                        <span className="text-slate-400 font-semibold font-mono tabular-nums">{formatMessageTime(msg.timestamp)}</span>
                      )}
                    </div>
                  </div>
                </div>
              </React.Fragment>
            );
          });
        })()
      )}
        <div ref={scrollEndRef} />
      </div>
    </div>
  );
};

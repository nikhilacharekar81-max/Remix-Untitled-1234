import React, { useState, useEffect, useRef } from 'react';
import { 
  ChevronLeft, ShieldCheck, Clock, CheckCircle2, AlertCircle, 
  RotateCcw, Activity, FolderOpen, Send, Sparkles, MessageSquare, Video, Star, Receipt
} from 'lucide-react';
import { WorkstreamItem, WorkstreamMessage, SharedFileItem, WorkstreamSubTab, isInquiryWorkstream } from './types';
import { UserAccount, Order } from '../../types';
import { WorkstreamActivityStream } from './WorkstreamActivityStream';
import { WorkstreamMessageInput } from './WorkstreamMessageInput';
import { WorkstreamFilesTab } from './WorkstreamFilesTab';
import { WorkstreamInvoiceTab } from './WorkstreamInvoiceTab';
import { WorkstreamSummaryCard } from './WorkstreamSummaryCard';
import { WorkstreamActionsPanel } from './WorkstreamActionsPanel';
import { WorkstreamReleaseModal } from './WorkstreamReleaseModal';
import { WorkstreamDeliverModal } from './WorkstreamDeliverModal';
import { WorkstreamRevisionModal } from './WorkstreamRevisionModal';
import { WorkstreamReviewModal } from './WorkstreamReviewModal';
import { WorkstreamVideoCallModal } from './WorkstreamVideoCallModal';
import { getAuthToken } from '../../utils/authToken';
import { fetchWithRetry } from '../../utils/fetchRetry';
import { classifyFileUrl, openWebLink } from '../../utils/safeFileLink';
import { useWorkstreamOffers } from '../../hooks/workstream/useWorkstreamOffers';

interface WorkstreamWorkspaceProps {
  order: WorkstreamItem;
  workspaceOrders?: WorkstreamItem[];
  onSelectOrder?: (orderId: string) => void;
  messages: WorkstreamMessage[];
  files: SharedFileItem[];
  currentUser?: UserAccount | null;
  usersList?: UserAccount[];
  partner?: UserAccount;
  onBack: () => void;
  onSendMessage: (text: string) => void;
  onRetryMessage?: (msg: WorkstreamMessage) => void;
  onAttachFile: (file: { name: string; size: string; url: string }) => void;
  /** Creates a system event record. */
  sendEvent: (orderId: string, text: string, type: 'system', metadata: Record<string, any>, onError: (msg: string) => void) => void;
  /** Called after a buyer accepts / pays an offer so the parent can refresh its order list. */
  onOrderChanged?: (order: any, newOrder?: any) => void;
  onReleaseEscrow: () => void | Promise<boolean>;
  onDeliverWork: (delivery: {
    notes: string;
    reference?: string;
    files: Array<{ name: string; size: string; url: string }>;
    invoiceTitle?: string;
    invoiceAmount?: number;
  }) => void;
  onRequestRevision: (reason: string) => void;
  onViewPartnerProfile?: (user: UserAccount) => void;
  onLogRequirement?: (requirementText: string) => void;
  onMissedCall?: () => void;
  onDisputeAssistance?: () => void;
  isReviewModalOpen: boolean;
  setIsReviewModalOpen: (open: boolean) => void;
  handleSubmitReview: (review: { rating: number; comment: string; gigId?: string; projectId?: string; reviewId?: string }) => Promise<boolean>;
  reviewError?: string | null;
  isSubmittingReview?: boolean;
  escrowError?: string | null;
}

export const WorkstreamWorkspace: React.FC<WorkstreamWorkspaceProps> = ({
  order,
  workspaceOrders = [],
  onSelectOrder,
  messages,
  files,
  currentUser,
  usersList = [],
  partner,
  onBack,
  onSendMessage,
  onRetryMessage,
  onAttachFile,
  sendEvent,
  onOrderChanged,
  onReleaseEscrow,
  onDeliverWork,
  onRequestRevision,
  onViewPartnerProfile,
  onDisputeAssistance,
  onLogRequirement,
  onMissedCall,
  isReviewModalOpen,
  setIsReviewModalOpen,
  handleSubmitReview,
  reviewError,
  isSubmittingReview,
  escrowError
}) => {
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => {
    setIsMounted(true);
  }, []);

  const [activeSubTab, setActiveSubTab] = useState<WorkstreamSubTab>('activity');
  const [isReleaseModalOpen, setIsReleaseModalOpen] = useState(false);
  const [isDeliverModalOpen, setIsDeliverModalOpen] = useState(false);
  const [isRevisionModalOpen, setIsRevisionModalOpen] = useState(false);
  const [isVideoCallModalOpen, setIsVideoCallModalOpen] = useState(false);
  const [isDisputeModalOpen, setIsDisputeModalOpen] = useState(false);
  const [disputeReasonInput, setDisputeReasonInput] = useState('');
  const [isSubmittingDispute, setIsSubmittingDispute] = useState(false);
  const [disputeModalError, setDisputeModalError] = useState<string | null>(null);

  const [isCancelRequestModalOpen, setIsCancelRequestModalOpen] = useState(false);
  const [isRejectCancelModalOpen, setIsRejectCancelModalOpen] = useState(false);
  const [isVeryLateModalOpen, setIsVeryLateModalOpen] = useState(false);
  const [isExtensionModalOpen, setIsExtensionModalOpen] = useState(false);
  const [cancelModalReason, setCancelModalReason] = useState('Project scope changed');
  const [cancelModalDetails, setCancelModalDetails] = useState('');
  const [rejectModalReason, setRejectModalReason] = useState('');
  const [requestDays, setRequestDays] = useState('3');
  const [requestReason, setRequestReason] = useState('');

  const handleExtensionRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!requestReason.trim() || !requestDays) return;
    setIsSubmittingCancel(true);
    setCancelModalError(null);
    try {
      const res = await fetchWithRetry(`/api/orders/${order.id}/extension-request`, {
        method: 'POST',
        body: JSON.stringify({ days: Number(requestDays), reason: requestReason.trim() })
      });
      if (res.status === 429) {
        setCancelModalError('You are sending requests too quickly. Please wait a moment.');
        return;
      }
      if (res.status === 409) {
        setCancelModalError('This action is currently being processed. Please try again in a moment.');
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to request extension');
      }
      setIsExtensionModalOpen(false);
    } catch (err: any) {
      setCancelModalError(err.message);
    } finally {
      setIsSubmittingCancel(false);
    }
  };
  const [veryLateReason, setVeryLateReason] = useState('');
  const [cancelModalError, setCancelModalError] = useState<string | null>(null);
  const [isSubmittingCancel, setIsSubmittingCancel] = useState(false);

  const handleRequestCancellation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancelModalReason.trim()) return;
    setIsSubmittingCancel(true);
    setCancelModalError(null);
    try {
      const res = await fetchWithRetry(`/api/orders/${order.id}/cancel-request`, {
        method: 'POST',
        body: JSON.stringify({ reason: cancelModalReason.trim(), details: cancelModalDetails.trim() || undefined })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to request cancellation');
      onOrderChanged?.(data.order || null);
      setIsCancelRequestModalOpen(false);
      setCancelModalDetails('');
    } catch (err: any) {
      setCancelModalError(err.message || 'Failed to request cancellation');
    } finally {
      setIsSubmittingCancel(false);
    }
  };

  const handleRespondCancellation = async (action: 'accept' | 'reject', reason?: string) => {
    setIsSubmittingCancel(true);
    setCancelModalError(null);
    try {
      const res = await fetchWithRetry(`/api/orders/${order.id}/cancel-request/respond`, {
        method: 'POST',
        body: JSON.stringify({ action, reason })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to respond to cancellation');
      onOrderChanged?.(data.order || null);
      if (action === 'reject') {
        setIsRejectCancelModalOpen(false);
        setRejectModalReason('');
      }
    } catch (err: any) {
      setCancelModalError(err.message || 'Failed to respond');
    } finally {
      setIsSubmittingCancel(false);
    }
  };

  const handleVeryLateCancellation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!veryLateReason.trim()) return;
    setIsSubmittingCancel(true);
    setCancelModalError(null);
    try {
      const res = await fetchWithRetry('/api/payments/escrow/refund', {
        method: 'POST',
        body: JSON.stringify({ orderId: order.id, reason: veryLateReason.trim() })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to cancel very late order');
      onOrderChanged?.(data.order || null);
      setIsVeryLateModalOpen(false);
      setVeryLateReason('');
    } catch (err: any) {
      setCancelModalError(err.message || 'Failed to cancel very late order');
    } finally {
      setIsSubmittingCancel(false);
    }
  };

  // Real proposals / invoices / deposit requests for this workstream (server is the source of truth)
  const lastMessageId = messages.length ? messages[messages.length - 1].id : '';
  const {
    offers,
    currencySymbol,
    escrowFunded,
    escrowRemaining,
    totalReleased,
    hasPaidInvoice,
    createOffer,
    respond,
    refundEscrow
  } = useWorkstreamOffers(order.id, lastMessageId);

  const isSeller = !!currentUser && currentUser.id === order.sellerId;
  const isBuyer = !!currentUser && currentUser.id === order.buyerId;
  const currentOrderOffers = offers.filter(
    o =>
      o.orderId === order.id ||
      o.originOrderId === order.id ||
      (!o.orderId && !o.originOrderId && Boolean(o.workspaceId) && (o.workspaceId === order.id || o.workspaceId === order.workspaceId))
  );
  const pendingInvoice = currentOrderOffers.find(o => o.kind === 'invoice' && o.status === 'pending');
  const pendingProposal = currentOrderOffers.find(o => o.kind === 'proposal' && o.status === 'pending');
  const invoiceAlreadyPaid = hasPaidInvoice || Boolean((order as any).hasPaidInvoice) || currentOrderOffers.some(o => o.kind === 'invoice' && o.status === 'paid') || order.status === 'completed';
  const activeEscrow = escrowRemaining > 0 ? escrowRemaining : (escrowFunded ? Number(order.amount || 0) : 0);
  const isCustomOrderWorkstream = isInquiryWorkstream(order);
  const isInquiryOrder = isCustomOrderWorkstream && !escrowFunded;

  // PeoplePerHour Gig vs Project Proposal rules:
  // - For Paid Gigs: Seller CANNOT send a new proposal initially because the Gig is already pre-funded.
  //   Once the first invoice is paid, or if the thread is an unfunded Pre-Purchase Inquiry, Seller CAN send proposals in the same WorkStream!
  // - For Projects: Seller can send a proposal when no active escrow/invoice is blocking, or after an invoice is paid.
  const isGigInitiallyLocked = (order.type === 'gig' || (order as any).orderType === 'gig') && !invoiceAlreadyPaid && !isInquiryOrder && !isCustomOrderWorkstream;
  const canSendProposal = isSeller
    && !pendingInvoice
    && !pendingProposal
    && !isGigInitiallyLocked
    && (!escrowFunded || invoiceAlreadyPaid || order.status === 'cancelled');

  const canRaiseInvoice = isSeller
    && (escrowFunded || activeEscrow > 0)
    && order.status !== 'cancelled'
    && !pendingInvoice;

  const proposalHint = !isSeller
    ? (isCustomOrderWorkstream ? 'Only the seller can send a Custom Order Proposal' : 'Only the seller can send a proposal')
    : isGigInitiallyLocked
      ? 'This Gig is already funded in Escrow. Deliver the work and raise your first invoice — once it is paid, you can send follow-on proposals.'
      : pendingInvoice
        ? (isCustomOrderWorkstream ? 'Cannot send a Custom Order Proposal while a Custom Order Invoice is awaiting payment.' : 'Cannot send a proposal while an invoice is awaiting payment.')
        : pendingProposal
          ? (isCustomOrderWorkstream ? 'A Custom Order Proposal is already awaiting the buyer\'s response.' : 'A proposal is already awaiting the buyer\'s response.')
          : escrowFunded && !invoiceAlreadyPaid
            ? (isCustomOrderWorkstream ? 'Escrow is already funded for this Custom Order. Raise a Custom Order Invoice to complete the current work first.' : 'Escrow is already funded for this stage. Raise an invoice to complete the current work first.')
            : (isCustomOrderWorkstream ? 'Send a Custom Order Proposal for this inquiry or additional scope.' : 'Send a custom proposal for this inquiry or additional scope.');

  const invoiceHint = !isSeller
    ? (isCustomOrderWorkstream ? 'Only the seller can raise a Custom Order Invoice' : 'Only the seller can raise an invoice')
    : pendingInvoice
      ? (isCustomOrderWorkstream ? 'A Custom Order Invoice is already awaiting buyer payment.' : 'An invoice is already awaiting buyer payment.')
      : (isCustomOrderWorkstream ? 'Invoices require an active funded Custom Order. Send a Custom Order Proposal first so the buyer can fund Escrow.' : 'Invoices require an active funded Escrow deposit. Send a Proposal first so the buyer can fund Escrow.');

  // Refresh parent order state when an offer or review or escrow action occurs in the stream
  const lastMessage = messages.length ? messages[messages.length - 1] : undefined;
  const handledOfferMsgRef = useRef<string>(lastMessageId);
  useEffect(() => {
    if (!lastMessage || lastMessage.id === handledOfferMsgRef.current) return;
    handledOfferMsgRef.current = lastMessage.id;
    const action = lastMessage.metadata?.action;
    if (action && ['offer_accepted', 'offer_paid', 'offer_declined', 'offer_cancelled', 'escrow_released', 'escrow_refunded', 'deliverable_submitted', 'dispute_opened', 'dispute_resolved', 'review_submitted', 'review_reply_submitted'].includes(action)) {
      onOrderChanged?.(null);
    }
  }, [lastMessage?.id]);

  const handleOfferAction = async (offerId: string, action: 'accept' | 'decline' | 'cancel', reason?: string) => {
    const result = await respond(offerId, action, reason);
    if (result.ok) onOrderChanged?.(result.order || null, result.newOrder);
    return result;
  };

  const handleSellerRefundEscrow = async () => {
    const result = await refundEscrow(order.id);
    if (result.ok) onOrderChanged?.(result.order || null);
    return result;
  };

  const handleReplyReview = async (reviewId: string, replyText: string): Promise<{ ok: boolean; error?: string }> => {
    try {
      const res = await fetchWithRetry(`/api/reviews/${reviewId}/reply`, {
        method: 'POST',
        body: JSON.stringify({ text: replyText })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, error: data.error || 'Failed to post review reply.' };
      onOrderChanged?.(null);
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err?.message || 'Network error posting reply.' };
    }
  };

  const handleSubmitDisputeModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!disputeReasonInput.trim()) return;
    setIsSubmittingDispute(true);
    setDisputeModalError(null);
    try {
      if (escrowFunded || activeEscrow > 0) {
        const res = await fetchWithRetry('/api/disputes/open', {
          method: 'POST',
          body: JSON.stringify({ orderId: order.id, reason: disputeReasonInput.trim() })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setDisputeModalError(data.error || 'Could not open dispute.');
          setIsSubmittingDispute(false);
          return;
        }
        if (data.order) onOrderChanged?.(data.order);
        else onOrderChanged?.(null);
      } else {
        await fetchWithRetry('/api/support-tickets', {
          method: 'POST',
          body: JSON.stringify({
            subject: `Workstream Support: ${order.title} (#${order.id})`,
            text: disputeReasonInput.trim(),
            priority: 'high'
          })
        });
        sendEvent(order.id, `🚨 Support & Dispute Desk notified: "${disputeReasonInput.trim()}"`, 'system', { action: 'dispute_opened', reason: disputeReasonInput.trim() }, () => {});
      }
      setDisputeReasonInput('');
      setIsDisputeModalOpen(false);
    } catch (err: any) {
      setDisputeModalError(err?.message || 'Network error submitting dispute.');
    } finally {
      setIsSubmittingDispute(false);
    }
  };

  const [errorInfo, setErrorInfo] = useState<{msg: string, retryAction: () => void} | null>(null);

  const handleLogRequirement = (reqText: string) => {
    if (onLogRequirement) onLogRequirement(reqText);
    const text = `📋 Project Requirement Logged: "${reqText}"`;
    const metadata = { action: 'requirement_logged', requirementText: reqText };
    
    sendEvent(order.id, text, 'system', metadata, (msg: string) => {
      setErrorInfo({ msg, retryAction: () => handleLogRequirement(reqText) });
    });
  };

  const handleMissedCall = () => {
    if (onMissedCall) onMissedCall();
    const text = `📞 Missed Video Meeting with ${partner?.name || 'collaborator'}`;
    const metadata = { action: 'missed_call' };
    
    sendEvent(order.id, text, 'system', metadata, (msg: string) => {
      setErrorInfo({ msg, retryAction: handleMissedCall });
    });
  };

  const handleDownloadFile = async (f: { name: string; url: string }) => {
    if (!f.url) {
      setErrorInfo({ msg: `"${f.name || 'This file'}" has no valid download link.`, retryAction: () => setErrorInfo(null) });
      return;
    }
    const link0 = classifyFileUrl(f.url);
    if (link0.kind === 'web') { openWebLink(link0.url); return; }
    if (link0.kind === 'text') {
      setErrorInfo({ msg: `${f.name || 'Deliverable'}: ${link0.url}`, retryAction: () => setErrorInfo(null) });
      return;
    }
    try {
      const token = getAuthToken();
      const downloadUrl = f.url.includes('?') ? `${f.url}&download=1` : `${f.url}?download=1`;
      const res = await fetch(downloadUrl, { headers: token ? { 'Authorization': `Bearer ${token}` } : {} });
      if (!res.ok) {
        setErrorInfo({
          msg: res.status === 403 ? 'You do not have access to this file.' : `"${f.name || 'This file'}" could not be downloaded.`,
          retryAction: () => setErrorInfo(null)
        });
        return;
      }
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = f.name || 'download';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);
    } catch (err) {
      console.error('File download failed:', err);
      setErrorInfo({ msg: 'Network error downloading the file. Please try again.', retryAction: () => setErrorInfo(null) });
    }
  };

  const getStatusBadge = () => {
    if (order.status === 'completed' && activeEscrow <= 0) {
      return (
        <span className="px-3 py-1 bg-emerald-50 text-emerald-800 border border-emerald-200 text-[10px] font-bold uppercase rounded-full flex items-center gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
          <span>{isCustomOrderWorkstream ? 'Custom Order Completed' : 'Invoice Paid • WorkStream Open'}</span>
        </span>
      );
    }
    if (order.status === 'cancelled' || (order.status as string) === 'refunded') {
      return (
        <span className="px-3 py-1 bg-rose-50 text-rose-800 border border-rose-200 text-[10px] font-bold uppercase rounded-full flex items-center gap-1.5">
          <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
          <span>{isCustomOrderWorkstream ? 'Custom Order Cancelled • WorkStream Open' : 'Order Cancelled • WorkStream Open'}</span>
        </span>
      );
    }
    if (isInquiryOrder) {
      return (
        <span className="px-3 py-1 bg-indigo-50 text-indigo-800 border border-indigo-200 text-[10px] font-bold uppercase rounded-full flex items-center gap-1.5">
          <MessageSquare className="w-3.5 h-3.5 text-indigo-600" />
          <span>{isCustomOrderWorkstream ? 'Custom Order Proposal • Pre-Purchase' : 'Inquiry • Pre-Purchase'}</span>
        </span>
      );
    }
    if (order.status === 'delivered' || pendingInvoice) {
      return (
        <span className="px-3 py-1 bg-amber-50 text-amber-800 border border-amber-200 text-[10px] font-bold uppercase rounded-full flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5 text-amber-600" />
          <span>{isCustomOrderWorkstream ? 'Custom Order Invoice Raised • Awaiting Buyer Payment' : 'Invoice Raised • Awaiting Buyer Payment'}</span>
        </span>
      );
    }
    if (order.status === 'revision') {
      return (
        <span className="px-3 py-1 bg-purple-50 text-purple-800 border border-purple-200 text-[10px] font-bold uppercase rounded-full flex items-center gap-1.5">
          <RotateCcw className="w-3.5 h-3.5 text-purple-600" />
          <span>Revision in Progress</span>
        </span>
      );
    }
    return (
      <span className="px-3 py-1 bg-blue-50 text-blue-800 border border-blue-200 text-[10px] font-bold uppercase rounded-full flex items-center gap-1.5">
        <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
        <span>{isCustomOrderWorkstream ? 'Custom Order • In Escrow' : 'In Escrow'} ({currencySymbol}{Number(activeEscrow || order.amount || 0).toLocaleString()})</span>
      </span>
    );
  };

  const isCancellationPending = (order as any).cancellationRequest?.status === 'pending';

  const getReviewCountdown = () => {
    if (!isMounted || order.status !== 'delivered' || isCancellationPending || !order.reviewWindowExpiresAt) return null;
    const diff = new Date(order.reviewWindowExpiresAt).getTime() - Date.now();
    if (diff <= 0) return null;
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    if (hours >= 24) {
      const days = Math.floor(hours / 24);
      return `${days}d ${hours % 24}h left`;
    }
    return `${hours}h ${mins}m left`;
  };

  const sellerReview = (order as any).sellerReview;

  const handleRespondExtension = async (action: 'approve' | 'reject', reason?: string) => {
    try {
      const res = await fetchWithRetry(`/api/orders/${order.id}/extension-request/respond`, {
        method: 'POST',
        body: JSON.stringify({ action, reason })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to respond to extension request');
      onOrderChanged?.(data.order || null);
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err.message || 'Failed to respond' };
    }
  };

  return (
    <div className="space-y-6">
      {errorInfo && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 px-4 py-3 rounded-2xl flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            <span className="font-medium">{errorInfo.msg}</span>
          </div>
          <button 
            onClick={() => { errorInfo.retryAction(); setErrorInfo(null); }}
            className="px-3 py-1 bg-rose-200 hover:bg-rose-300 text-rose-900 rounded-lg font-bold transition cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* WORKSTREAM HEADER */}
      <div className="bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 shadow-xs flex flex-col gap-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="p-2 hover:bg-slate-100 rounded-xl text-slate-500 transition-colors cursor-pointer"
              title="Back to All Workstreams"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-extrabold text-fiverr-dark tracking-tight">
                  {order.title}
                </h1>
                {getStatusBadge()}
                {(() => {
                  const remaining = getReviewCountdown();
                  if (!remaining) return null;
                  return (
                    <span suppressHydrationWarning className="px-3 py-1 bg-amber-50 text-amber-800 border border-amber-200 text-xs font-bold uppercase rounded-full flex items-center gap-1.5 shadow-2xs">
                      <Clock className="w-3.5 h-3.5 text-amber-600" />
                      <span>{isBuyer ? 'Buyer Review: ' : 'Review Window: '}</span>
                      <strong className="font-mono text-amber-900">{remaining}</strong>
                    </span>
                  );
                })()}
              </div>
              <p className="text-sm text-slate-500 mt-1">
                WorkStream #{order.id} • Partner: <strong className="text-fiverr-dark font-medium">{partner?.name || 'Collaborator'}</strong>
                {totalReleased > 0 && (
                  <span className="ml-2 text-emerald-600 font-semibold">
                    • Paid: {currencySymbol}{totalReleased.toLocaleString()}
                  </span>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {isBuyer && activeEscrow > 0 && (order.status === 'delivered' || !!pendingInvoice) && (
              <button
                onClick={() => setIsReleaseModalOpen(true)}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-sm flex items-center gap-1.5 shadow-xs transition cursor-pointer"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>{isCustomOrderWorkstream ? (pendingInvoice ? `Pay Custom Order Invoice (${pendingInvoice.number})` : 'Release Custom Order Escrow') : (pendingInvoice ? `Pay Invoice (${pendingInvoice.number})` : 'Release Escrow')}</span>
              </button>
            )}

            {isBuyer && (invoiceAlreadyPaid || order.status === 'cancelled') && !order.review && (
              <button
                onClick={() => setIsReviewModalOpen(true)}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-white font-bold rounded-xl text-sm flex items-center gap-1.5 shadow-xs transition cursor-pointer"
              >
                <Star className="w-4 h-4 fill-white" />
                <span>Review Seller</span>
              </button>
            )}

            {isSeller && (invoiceAlreadyPaid || order.status === 'cancelled') && !sellerReview && (
              <button
                onClick={() => setIsReviewModalOpen(true)}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-white font-bold rounded-xl text-sm flex items-center gap-1.5 shadow-xs transition cursor-pointer"
              >
                <Star className="w-4 h-4 fill-white" />
                <span>Review Buyer</span>
              </button>
            )}

            {isSeller && activeEscrow > 0 && order.status !== 'cancelled' && (
              <button
                onClick={() => setIsDeliverModalOpen(true)}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-sm flex items-center gap-1.5 shadow-xs transition cursor-pointer"
              >
                <Receipt className="w-3.5 h-3.5 text-emerald-400" />
                <span>Raise Invoice & Deliver</span>
              </button>
            )}
            {isSeller && order.status !== 'cancelled' && order.status !== 'completed' && !order.freeExtensionUsed && !order.extensionRequests?.some(r => r.status === 'pending') && (
              <button
                onClick={() => setIsExtensionModalOpen(true)}
                className="px-4 py-2 bg-white hover:bg-slate-50 text-slate-900 border border-slate-200 font-bold rounded-xl text-sm flex items-center gap-1.5 shadow-xs transition cursor-pointer"
              >
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                <span>Request more time</span>
              </button>
            )}
          </div>
        </div>

        {/* MULTI-ORDER WORKSPACE CONTEXT SWITCHER */}
        {workspaceOrders.length > 1 && (
          <div className="pt-3 border-t border-slate-100 flex items-center gap-2 overflow-x-auto" style={{ width: '100%', height: '43px' }}>
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400 shrink-0">
              Workspace Orders ({workspaceOrders.length}):
            </span>
            {workspaceOrders.map((wo, idx) => {
              const isSelected = wo.id === order.id;
              return (
                <button
                  key={wo.id}
                  type="button"
                  onClick={() => onSelectOrder?.(wo.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium border flex items-center gap-1.5 shrink-0 transition cursor-pointer ${
                    isSelected
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-900 font-bold shadow-2xs'
                      : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <span className="font-mono text-xs text-slate-500">#{idx + 1}</span>
                  <span className="truncate max-w-[160px] text-xs font-semibold">{wo.title}</span>
                  <span className="font-mono text-xs opacity-75">({wo.status.replace(/_/g, ' ')})</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* 2-COLUMN LAYOUT: MAIN WORKSTREAM + SUMMARY SIDEBAR */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* LEFT COLUMN: ACTIVITY & FILES TABS (3 COLS) */}
        <div className="lg:col-span-3 space-y-6">
          <div className="bg-white border border-slate-200 rounded-3xl shadow-xs overflow-hidden flex flex-col h-auto">
            {/* SUBTABS HEADER */}
            <div className="flex border-b border-slate-100 bg-slate-50/70 px-6 py-2 items-center justify-between">
              <div className="flex gap-4">
                <button
                  onClick={() => setActiveSubTab('activity')}
                  className={`px-4 py-2.5 text-xs sm:text-sm font-bold uppercase tracking-wider transition-all border-b-2 cursor-pointer ${
                    activeSubTab === 'activity'
                      ? 'border-emerald-600 text-emerald-700'
                      : 'border-transparent text-slate-400 hover:text-slate-600'
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5" />
                    <span className="!text-[11px] !leading-[15px]">Activity Stream</span>
                  </div>
                </button>

                <button
                  onClick={() => setActiveSubTab('files')}
                  className={`px-4 py-2 text-xs font-bold uppercase tracking-wider transition-all border-b-2 cursor-pointer ${
                    activeSubTab === 'files'
                      ? 'border-emerald-600 text-emerald-700'
                      : 'border-transparent text-slate-400 hover:text-slate-600'
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <FolderOpen className="w-3.5 h-3.5" />
                    <span className="!text-[11px] !leading-[15px]">Shared Files ({files.length})</span>
                  </div>
                </button>

                <button
                  onClick={() => setActiveSubTab('invoices')}
                  className={`px-4 py-2 text-xs font-bold uppercase tracking-wider transition-all border-b-2 cursor-pointer ${
                    activeSubTab === 'invoices'
                      ? 'border-emerald-600 text-emerald-700'
                      : 'border-transparent text-slate-400 hover:text-slate-600'
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <Receipt className="w-3.5 h-3.5" />
                    <span className="!text-[11px] !leading-[15px]">Receipt & Invoice</span>
                  </div>
                </button>
              </div>
            </div>

            {/* TAB CONTENT */}
            <div className="flex flex-col relative">
              {activeSubTab === 'activity' ? (
                <>
                  <WorkstreamActivityStream
                    order={order}
                    workspaceOrders={workspaceOrders}
                    messages={messages}
                    currentUserId={currentUser?.id}
                    usersList={usersList}
                    partnerUser={partner}
                    onDownloadFile={handleDownloadFile}
                    offers={offers}
                    buyerId={order.buyerId}
                    sellerId={order.sellerId}
                    orderAmount={order.amount}
                    escrowRemaining={activeEscrow}
                    orderReview={order.review}
                    sellerReview={sellerReview}
                    onOfferAction={handleOfferAction}
                    onRequestRevisionFromInvoice={() => setIsRevisionModalOpen(true)}
                    onReplyReview={handleReplyReview}
                    onRetryMessage={onRetryMessage}
                    onOpenDeliverModal={() => setIsDeliverModalOpen(true)}
                    onOpenReleaseModal={() => setIsReleaseModalOpen(true)}
                    onOpenRevisionModal={() => setIsRevisionModalOpen(true)}
                    onOpenReviewModal={() => setIsReviewModalOpen(true)}
                    onOpenDisputeModal={() => setIsDisputeModalOpen(true)}
                    onStartVideoCall={() => setIsVideoCallModalOpen(true)}
                    onRespondToExtension={handleRespondExtension}
                    isCustomOrderStream={isCustomOrderWorkstream}
                  />
                  <WorkstreamMessageInput
                    key={order.id}
                    orderId={order.id}
                    workspaceId={order.workspaceId || order.id}
                    defaultInvoiceAmount={activeEscrow > 0 ? activeEscrow : Number(order.amount || 0)}
                    defaultInvoiceTitle={`Invoice for ${order.title}`}
                    onSendMessage={onSendMessage}
                    onAttachFile={onAttachFile}
                    onStartVideoCall={() => setIsVideoCallModalOpen(true)}
                    onCreateOffer={async (input) => {
                      const res = await createOffer(input);
                      if (res.ok) onOrderChanged?.(res.order || null);
                      return res;
                    }}
                    onRefundEscrow={isSeller && activeEscrow > 0 ? handleSellerRefundEscrow : undefined}
                    canSendProposal={canSendProposal}
                    canRaiseInvoice={canRaiseInvoice}
                    canRefundEscrow={isSeller && activeEscrow > 0}
                    proposalHint={proposalHint}
                    invoiceHint={invoiceHint}
                    currencySymbol={currencySymbol}
                    isCustomOrderStream={isCustomOrderWorkstream}
                  />
                </>
              ) : activeSubTab === 'files' ? (
                <WorkstreamFilesTab
                  key={`files_${order.id}`}
                  orderId={order.id}
                  workspaceId={order.workspaceId || order.id}
                  files={files}
                  onUploadFile={onAttachFile}
                  onDownloadFile={handleDownloadFile}
                />
              ) : (
                <WorkstreamInvoiceTab
                  key={`inv_${order.id}`}
                  orderId={order.id}
                />
              )}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: SUMMARY CARD & ACTIONS PANEL (1 COL) */}
        <div className="space-y-6 forced-13-17">
          <WorkstreamSummaryCard
            order={order}
            partner={partner}
            currentUser={currentUser}
            escrowRemaining={activeEscrow}
            totalReleased={totalReleased}
            currencySymbol={currencySymbol}
            onViewPartnerProfile={onViewPartnerProfile}
          />

          <WorkstreamActionsPanel
            order={order}
            currentUser={currentUser}
            pendingInvoice={pendingInvoice}
            escrowRemaining={activeEscrow}
            hasPaidInvoice={invoiceAlreadyPaid}
            canSendProposal={canSendProposal}
            onOpenReleaseModal={() => setIsReleaseModalOpen(true)}
            onOpenDeliverModal={() => setIsDeliverModalOpen(true)}
            onOpenRevisionModal={() => setIsRevisionModalOpen(true)}
            onOpenReviewModal={() => setIsReviewModalOpen(true)}
            onStartVideoCall={() => setIsVideoCallModalOpen(true)}
            onAttachFiles={() => setActiveSubTab('files')}
            onDisputeAssistance={() => setIsDisputeModalOpen(true)}
            onOpenCancelRequestModal={() => setIsCancelRequestModalOpen(true)}
            onOpenRejectCancelModal={() => setIsRejectCancelModalOpen(true)}
            onAcceptCancelRequest={() => handleRespondCancellation('accept')}
            onOpenVeryLateCancelModal={() => setIsVeryLateModalOpen(true)}
          />
        </div>
      </div>

      {/* MODALS */}
      {isCancelRequestModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-fiverr-dark flex items-center gap-2">
                <RotateCcw className="w-5 h-5 text-rose-600" />
                <span>Request Gig Cancellation</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsCancelRequestModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 font-bold text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleRequestCancellation} className="space-y-4 text-xs">
              <div>
                <label className="block text-fiverr-dark font-bold uppercase tracking-wider text-[10px] mb-1.5">
                  Cancellation Reason (Required)
                </label>
                <select
                  value={cancelModalReason}
                  onChange={(e) => setCancelModalReason(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-fiverr-dark focus:outline-none focus:border-rose-500"
                >
                  <option value="Project scope changed">Project scope changed</option>
                  <option value="Mutual agreement">Mutual agreement</option>
                  <option value="Unresponsive partner">Unresponsive partner</option>
                  <option value="Timeline conflicts">Timeline conflicts</option>
                  <option value="Other reason">Other reason</option>
                </select>
              </div>
              <div>
                <label className="block text-fiverr-dark font-bold uppercase tracking-wider text-[10px] mb-1.5">
                  Additional Details (Optional)
                </label>
                <textarea
                  rows={3}
                  value={cancelModalDetails}
                  onChange={(e) => setCancelModalDetails(e.target.value)}
                  placeholder="Provide context for the cancellation request..."
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-fiverr-dark placeholder-slate-400 focus:outline-none focus:border-rose-500 resize-none"
                />
              </div>
              {cancelModalError && (
                <p className="text-xs text-rose-600 font-semibold">{cancelModalError}</p>
              )}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCancelRequestModalOpen(false)}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-fiverr-dark font-bold rounded-xl text-xs cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingCancel || !cancelModalReason.trim()}
                  className="px-5 py-2.5 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-bold rounded-xl text-xs cursor-pointer shadow-xs"
                >
                  {isSubmittingCancel ? 'Submitting...' : 'Send Cancellation Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isRejectCancelModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-fiverr-dark flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-amber-600" />
                <span>Reject Cancellation Request</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsRejectCancelModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 font-bold text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); if (rejectModalReason.trim()) handleRespondCancellation('reject', rejectModalReason.trim()); }} className="space-y-4 text-xs">
              <div>
                <label className="block text-fiverr-dark font-bold uppercase tracking-wider text-[10px] mb-1.5">
                  Rejection Reason (Required)
                </label>
                <textarea
                  rows={3}
                  required
                  value={rejectModalReason}
                  onChange={(e) => setRejectModalReason(e.target.value)}
                  placeholder="Explain why you are rejecting the cancellation request..."
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-fiverr-dark placeholder-slate-400 focus:outline-none focus:border-amber-500 resize-none"
                />
              </div>
              {cancelModalError && (
                <p className="text-xs text-rose-600 font-semibold">{cancelModalError}</p>
              )}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsRejectCancelModalOpen(false)}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-fiverr-dark font-bold rounded-xl text-xs cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingCancel || !rejectModalReason.trim()}
                  className="px-5 py-2.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-bold rounded-xl text-xs cursor-pointer shadow-xs"
                >
                  {isSubmittingCancel ? 'Submitting...' : 'Confirm Rejection'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isVeryLateModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-fiverr-dark flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-rose-600" />
                <span>Very Late Cancellation & Full Refund</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsVeryLateModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 font-bold text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              Since this order is more than 24 hours past the agreed delivery due date, you may cancel without seller approval and receive a 100% full escrow refund.
            </p>
            <form onSubmit={handleVeryLateCancellation} className="space-y-4 text-xs">
              <div>
                <label className="block text-fiverr-dark font-bold uppercase tracking-wider text-[10px] mb-1.5">
                  Cancellation Reason (Required)
                </label>
                <textarea
                  rows={3}
                  required
                  value={veryLateReason}
                  onChange={(e) => setVeryLateReason(e.target.value)}
                  placeholder="State reason for very late cancellation..."
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-fiverr-dark placeholder-slate-400 focus:outline-none focus:border-rose-500 resize-none"
                />
              </div>
              {cancelModalError && (
                <p className="text-xs text-rose-600 font-semibold">{cancelModalError}</p>
              )}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsVeryLateModalOpen(false)}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-fiverr-dark font-bold rounded-xl text-xs cursor-pointer"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingCancel || !veryLateReason.trim()}
                  className="px-5 py-2.5 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-bold rounded-xl text-xs cursor-pointer shadow-xs"
                >
                  {isSubmittingCancel ? 'Cancelling...' : 'Cancel & Claim Full Refund'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {isExtensionModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <h3 className="font-bold text-lg text-slate-900">Request more time</h3>
            <p className="text-xs text-slate-500">Current deadline: {new Date(order.dueDate).toLocaleDateString()}</p>
            <form onSubmit={handleExtensionRequest} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Additional Days (1-14)</label>
                <input type="number" min="1" max="14" required value={requestDays} onChange={(e) => setRequestDays(e.target.value)} className="w-full px-3 py-2 border rounded-xl text-xs" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Reason (Required)</label>
                <textarea required rows={3} value={requestReason} onChange={(e) => setRequestReason(e.target.value)} className="w-full px-3 py-2 border rounded-xl text-xs" placeholder="Explain why you need more time..." />
              </div>
              <div className="flex gap-3 justify-end">
                <button type="button" onClick={() => setIsExtensionModalOpen(false)} className="px-4 py-2 bg-slate-100 text-xs font-bold rounded-xl">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-emerald-600 text-white text-xs font-bold rounded-xl">Send Request</button>
              </div>
            </form>
          </div>
        </div>
      )}
      <WorkstreamVideoCallModal
        key={`video_${order.id}`}
        isOpen={isVideoCallModalOpen}
        order={order}
        currentUser={currentUser}
        partner={partner}
        onClose={() => setIsVideoCallModalOpen(false)}
        onLogRequirement={handleLogRequirement}
        onMissedCall={handleMissedCall}
      />

      <WorkstreamReleaseModal
        key={`release_${order.id}`}
        isOpen={isReleaseModalOpen}
        order={order}
        pendingInvoice={pendingInvoice}
        error={escrowError}
        onClose={() => setIsReleaseModalOpen(false)}
        onConfirm={async () => {
          if (pendingInvoice) {
            const res = await handleOfferAction(pendingInvoice.id, 'accept');
            return res.ok;
          }
          return await onReleaseEscrow();
        }}
      />

      <WorkstreamDeliverModal
        key={`deliver_${order.id}`}
        isOpen={isDeliverModalOpen}
        order={order}
        escrowRemaining={activeEscrow}
        currencySymbol={currencySymbol}
        onClose={() => setIsDeliverModalOpen(false)}
        onSubmitDelivery={onDeliverWork}
      />

      <WorkstreamRevisionModal
        key={`revision_${order.id}`}
        isOpen={isRevisionModalOpen}
        order={order}
        onClose={() => setIsRevisionModalOpen(false)}
        onSubmitRevision={onRequestRevision}
      />
      
      <WorkstreamReviewModal
        key={`review_${order.id}`}
        isOpen={isReviewModalOpen}
        order={order}
        currentUserId={currentUser?.id}
        partnerName={partner?.name}
        onClose={() => setIsReviewModalOpen(false)}
        onSubmitReview={handleSubmitReview}
        error={reviewError}
        isSubmitting={isSubmittingReview}
      />

      {isDisputeModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-fiverr-dark flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-rose-600" />
                <span>Escrow Dispute & Support Assistance</span>
              </h3>
              <button
                type="button"
                onClick={() => { setIsDisputeModalOpen(false); setDisputeModalError(null); }}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              Describe the issue with WorkStream #{order.id}. Our arbitration team will review your workstream history and assist both parties fairly.
            </p>
            <form onSubmit={handleSubmitDisputeModal} className="space-y-4">
              <textarea
                rows={4}
                required
                value={disputeReasonInput}
                onChange={(e) => setDisputeReasonInput(e.target.value)}
                placeholder="Explain the issue or reason for requesting arbitration..."
                className="w-full px-3.5 py-2.5 rounded-2xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
              {disputeModalError && (
                <p className="text-xs text-rose-600 font-semibold">{disputeModalError}</p>
              )}
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => { setIsDisputeModalOpen(false); setDisputeModalError(null); }}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingDispute || !disputeReasonInput.trim()}
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-xs font-bold cursor-pointer"
                >
                  {isSubmittingDispute ? 'Submitting...' : 'Submit to Arbitration Desk'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

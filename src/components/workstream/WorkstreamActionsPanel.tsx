import React from 'react';
import { 
  ShieldCheck, ArrowRight, FileText, Paperclip, AlertTriangle, 
  RotateCcw, CheckCircle2, PlusCircle, Settings, Send, Video, Star, Receipt, FileSignature
} from 'lucide-react';
import { WorkstreamItem, WorkstreamOffer, isInquiryWorkstream } from './types';
import { UserAccount } from '../../types';
import { isOrderVeryLate } from '../../utils/deadlineUtils';

interface WorkstreamActionsPanelProps {
  order: WorkstreamItem;
  currentUser?: UserAccount | null;
  pendingInvoice?: WorkstreamOffer;
  escrowRemaining?: number;
  hasPaidInvoice?: boolean;
  canSendProposal?: boolean;
  onOpenReleaseModal: () => void;
  onOpenDeliverModal: () => void;
  onOpenRevisionModal: () => void;
  onOpenReviewModal: () => void;
  onOpenInvoiceModal?: () => void;
  onStartVideoCall?: () => void;
  onAttachFiles: () => void;
  onDisputeAssistance?: () => void;
  onOpenCancelRequestModal?: () => void;
  onOpenRejectCancelModal?: () => void;
  onAcceptCancelRequest?: () => void;
  onOpenVeryLateCancelModal?: () => void;
}

export const WorkstreamActionsPanel: React.FC<WorkstreamActionsPanelProps> = ({
  order,
  currentUser,
  pendingInvoice,
  escrowRemaining,
  hasPaidInvoice,
  canSendProposal,
  onOpenReleaseModal,
  onOpenDeliverModal,
  onOpenRevisionModal,
  onOpenReviewModal,
  onOpenInvoiceModal,
  onStartVideoCall,
  onAttachFiles,
  onDisputeAssistance,
  onOpenCancelRequestModal,
  onOpenRejectCancelModal,
  onAcceptCancelRequest,
  onOpenVeryLateCancelModal
}) => {
  const isCustomOrderStream = isInquiryWorkstream(order);
  const isBuyer = currentUser?.id === order.buyerId;
  const isSeller = currentUser?.id === order.sellerId;
  const isCompleted = order.status === 'completed';
  const isDelivered = order.status === 'delivered' || !!pendingInvoice;
  const activeEscrow = escrowRemaining !== undefined ? escrowRemaining : ((order as any).escrowRemaining ?? (isCompleted ? 0 : Number(order.amount || 0)));
  const invoiceAlreadyPaid = hasPaidInvoice || (order as any).hasPaidInvoice || isCompleted;
  const sellerReview = (order as any).sellerReview;

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4 forced-13-17">
      <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-400 border-b border-slate-100 pb-3">
        Workstream Actions
      </h4>

      <div className="space-y-2.5">

        {/* BUYER ACTIONS */}
        {isBuyer && activeEscrow > 0 && isDelivered && (
          <button
            onClick={onOpenReleaseModal}
            className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl text-xs font-bold text-left flex items-center justify-between transition shadow-xs cursor-pointer"
          >
            <div className="flex items-center gap-2.5">
              <ShieldCheck className="w-4 h-4" />
              <span>{pendingInvoice ? (isCustomOrderStream ? `Pay Custom Order Invoice (${pendingInvoice.number})` : `Pay Invoice (${pendingInvoice.number})`) : (isCustomOrderStream ? 'Approve & Release Custom Order Escrow' : 'Approve & Release Escrow')}</span>
            </div>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        )}

        {isBuyer && activeEscrow > 0 && !isDelivered && (order.status === 'in_progress' || order.status === 'funded_in_escrow') && (
          <div className="text-xs text-blue-800 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0" />
            <span>{isCustomOrderStream ? `Escrow funded ($${activeEscrow.toLocaleString()}). Awaiting seller delivery & Custom Order Invoice.` : `Escrow funded ($${activeEscrow.toLocaleString()}). Awaiting seller delivery & invoice.`}</span>
          </div>
        )}

        {isBuyer && !isCompleted && order.status === 'revision' && (
          <div className="text-xs text-purple-800 flex items-center gap-2">
            <RotateCcw className="w-4 h-4 text-purple-600 shrink-0" />
            <span>{isCustomOrderStream ? 'Revision requested. Seller is updating deliverables & Custom Order Invoice.' : 'Revision requested. Seller is updating deliverables & invoice.'}</span>
          </div>
        )}

        {/* BUYER REVIEW BUTTON */}
        {isBuyer && (invoiceAlreadyPaid || order.status === 'cancelled') && !order.review && (
          <button
            onClick={onOpenReviewModal}
            className="w-full py-3 px-4 bg-amber-500 hover:bg-amber-400 text-white rounded-2xl text-xs font-bold text-left flex items-center justify-between transition shadow-xs cursor-pointer"
          >
            <div className="flex items-center gap-2.5">
              <Star className="w-4 h-4 fill-white" />
              <span>{order.status === 'cancelled' ? 'Rate Cancelled Order' : 'Write a Review for Seller'}</span>
            </div>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        )}

        {/* SELLER REVIEW BUTTON (Mutual Reviews in PeoplePerHour) */}
        {isSeller && (invoiceAlreadyPaid || order.status === 'cancelled') && !sellerReview && (
          <button
            onClick={onOpenReviewModal}
            className="w-full py-3 px-4 bg-amber-500 hover:bg-amber-400 text-white rounded-2xl text-xs font-bold text-left flex items-center justify-between transition shadow-xs cursor-pointer"
          >
            <div className="flex items-center gap-2.5">
              <Star className="w-4 h-4 fill-white" />
              <span>Review Buyer Experience</span>
            </div>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        )}

        {/* BUYER REVIEW SUMMARY */}
        {order.review && (
          <div className="space-y-2 animate-in fade-in">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1 font-bold text-amber-900">
                <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                <span>{order.review.isCancelledOrder ? 'Post-Cancellation Review' : 'Buyer Review'}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-amber-800 text-xs bg-amber-100/70 px-2 py-0.5 rounded-full">
                  {order.review.rating}.0 / 5.0
                </span>
                {isBuyer && (
                  <button onClick={onOpenReviewModal} className="text-xs text-amber-800 underline font-semibold hover:text-amber-950 cursor-pointer">
                    Edit
                  </button>
                )}
              </div>
            </div>
            <p className="text-xs text-amber-800 italic line-clamp-3">"{order.review.comment}"</p>
            {order.review.reply && (
              <div className="mt-2 pt-2 border-t border-amber-200 text-xs text-amber-900">
                <span className="font-bold">Seller Public Response: </span>
                <span className="italic">"{order.review.reply.text}"</span>
              </div>
            )}
          </div>
        )}

        {/* SELLER REVIEW OF BUYER SUMMARY */}
        {sellerReview && (
          <div className="space-y-1.5 animate-in fade-in">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1 font-bold text-emerald-900">
                <Star className="w-3.5 h-3.5 fill-emerald-500 text-emerald-500" />
                <span>Seller Review of Buyer</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-emerald-800 text-xs bg-emerald-100/70 px-2 py-0.5 rounded-full">
                  {sellerReview.rating}.0 / 5.0
                </span>
                {isSeller && (
                  <button onClick={onOpenReviewModal} className="text-xs text-emerald-800 underline font-semibold hover:text-emerald-950 cursor-pointer">
                    Edit
                  </button>
                )}
              </div>
            </div>
            <p className="text-xs text-emerald-800 italic line-clamp-3">"{sellerReview.comment}"</p>
          </div>
        )}

        {isBuyer && isDelivered && activeEscrow > 0 && (
          <button
            onClick={onOpenRevisionModal}
            className="w-full py-2.5 px-4 bg-purple-50 hover:bg-purple-100 text-purple-800 border border-purple-200 rounded-2xl text-xs font-bold text-left flex items-center justify-between transition cursor-pointer"
          >
            <div className="flex items-center gap-2.5">
              <RotateCcw className="w-4 h-4" />
              <span>Request Revisions</span>
            </div>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        )}

        {/* SELLER ACTIONS */}
        {isSeller && activeEscrow > 0 && order.status !== 'cancelled' && (
          <button
            onClick={onOpenDeliverModal}
            className="w-full py-3 px-4 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl text-xs font-bold text-left flex items-center justify-between transition shadow-xs cursor-pointer"
          >
            <div className="flex items-center gap-2.5">
              <Receipt className="w-4 h-4 text-emerald-400" />
              <span>
                {isCustomOrderStream
                  ? (order.status === 'revision'
                      ? 'Submit Revised Custom Order Invoice & Work'
                      : pendingInvoice
                        ? 'Update Custom Order Invoice & Delivery'
                        : 'Raise Custom Order Invoice & Deliver Work')
                  : (order.status === 'revision'
                      ? 'Submit Revised Invoice & Work'
                      : pendingInvoice
                        ? 'Update Delivery & Invoice'
                        : 'Raise Invoice & Deliver Work')}
              </span>
            </div>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        )}

        {/* PEOPLEPERHOUR GIG PROPOSAL LOCK / UNLOCK INDICATOR */}
        {isSeller && order.type === 'gig' && !invoiceAlreadyPaid && !isCustomOrderStream && (
          <div className="text-xs text-amber-800 leading-relaxed forced-13-17">
            <strong>Pre-Funded Gig WorkStream:</strong> New proposals are locked while the initial Gig escrow is active. Deliver the work and get your first invoice paid to unlock follow-on proposals.
          </div>
        )}

        {isSeller && invoiceAlreadyPaid && canSendProposal && (
          <div className="text-xs font-medium text-emerald-800 flex items-center gap-2">
            <FileSignature className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>
              {isCustomOrderStream ? (
                <><strong>Custom Order Completed!</strong> WorkStream remains open for chat and you can now send a <strong>Custom Order Proposal</strong> in the composer below for follow-on work.</>
              ) : (
                <><strong>Invoice Paid!</strong> WorkStream remains open for chat and you can now send a <strong>New Proposal</strong> in the composer below for follow-on work.</>
              )}
            </span>
          </div>
        )}

        {/* COMPLETED BANNER */}
        {isCompleted && activeEscrow <= 0 && (
          <div className="text-emerald-800 text-xs font-medium flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{isCustomOrderStream ? 'Custom Order Completed • Invoice paid & funds credited to seller wallet. Chat remains open.' : 'Invoice paid & funds credited to seller wallet. Chat remains open.'}</span>
          </div>
        )}

        {/* GIG CANCELLATION ACTIONS */}
        {((order?.orderType === 'gig' || (order as any)?.gigOrderId) && (order?.status as string) !== 'completed' && (order?.status as string) !== 'cancelled') && (
          <div className="space-y-2 pt-2 border-t border-slate-100">
            {((order?.orderType === 'gig' || (order as any)?.gigOrderId) && isBuyer && (order?.status as string) !== 'completed' && (order?.status as string) !== 'cancelled' && isOrderVeryLate(order)) && onOpenVeryLateCancelModal && (
              <button
                onClick={onOpenVeryLateCancelModal}
                className="w-full py-2.5 px-4 bg-rose-600 hover:bg-rose-500 text-white rounded-2xl text-xs font-bold text-left flex items-center justify-between transition shadow-xs cursor-pointer"
              >
                <div className="flex items-center gap-2.5">
                  <AlertTriangle className="w-4 h-4" />
                  <span>Cancel (Order is Very Late)</span>
                </div>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}

            {(!((order as any).cancellationRequest && (order as any).cancellationRequest.status === 'pending')) && onOpenCancelRequestModal && (
              <button
                onClick={onOpenCancelRequestModal}
                className="w-full py-2 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold text-left flex items-center justify-between transition cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Request Cancellation</span>
                </div>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}

            {((order as any).cancellationRequest && (order as any).cancellationRequest.status === 'pending') && (
              <div className="space-y-2">
                <div className="flex items-center justify-between font-bold text-rose-900">
                  <span className="flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-rose-600" />
                    <span>Cancellation Requested</span>
                  </span>
                  <span className="text-xs font-mono font-semibold bg-rose-100 px-2 py-0.5 rounded-full text-rose-800">
                    48h response window
                  </span>
                </div>
                <p className="text-xs text-rose-800">
                  Reason: <strong>{(order as any).cancellationRequest.reason}</strong>
                  {(order as any).cancellationRequest.details && ` — "${(order as any).cancellationRequest.details}"`}
                </p>
                {currentUser?.id === (order as any).cancellationRequest.requesterId ? (
                  <p className="text-xs text-rose-700 italic">Awaiting response from other party...</p>
                ) : (
                  <div className="flex items-center gap-2 pt-1">
                    {onAcceptCancelRequest && (
                      <button
                        onClick={onAcceptCancelRequest}
                        className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-center text-xs cursor-pointer shadow-xs transition"
                      >
                        Accept & Refund
                      </button>
                    )}
                    {onOpenRejectCancelModal && (
                      <button
                        onClick={onOpenRejectCancelModal}
                        className="flex-1 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold rounded-xl text-center text-xs cursor-pointer transition"
                      >
                        Reject
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* SHARED COMMON ACTIONS */}
        <button
          onClick={onAttachFiles}
          className="w-full py-2.5 px-4 bg-slate-50 hover:bg-slate-100 text-fiverr-dark border border-slate-200 rounded-2xl text-xs font-semibold text-left flex items-center justify-between transition group cursor-pointer"
        >
          <div className="flex items-center gap-2.5">
            <Paperclip className="w-4 h-4 text-slate-400 group-hover:text-fiverr-dark transition" />
            <span>Share Files & Documents</span>
          </div>
          <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
        </button>

        {onOpenInvoiceModal && (
          <button
            onClick={onOpenInvoiceModal}
            className="w-full py-2.5 px-4 bg-slate-50 hover:bg-slate-100 text-fiverr-dark border border-slate-200 rounded-2xl text-xs font-semibold text-left flex items-center justify-between transition group cursor-pointer"
          >
            <div className="flex items-center gap-2.5">
              <FileText className="w-4 h-4 text-slate-400 group-hover:text-fiverr-dark transition" />
              <span>Raise Milestone Invoice</span>
            </div>
            <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
          </button>
        )}

        {onDisputeAssistance && (
          <button
            onClick={onDisputeAssistance}
            className="w-full py-2 px-3 text-slate-400 hover:text-red-600 rounded-xl text-xs font-medium text-left flex items-center gap-2 transition cursor-pointer mt-1"
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Escrow Dispute Assistance</span>
          </button>
        )}
      </div>
    </div>
  );
};

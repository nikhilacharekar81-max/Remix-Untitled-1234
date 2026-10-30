import React, { useState } from 'react';
import { X, ShieldCheck, CheckCircle2, AlertCircle, Loader2, Receipt } from 'lucide-react';
import { WorkstreamItem, WorkstreamOffer } from './types';

interface WorkstreamReleaseModalProps {
  isOpen: boolean;
  order: WorkstreamItem;
  onClose: () => void;
  onReleaseEscrow?: () => boolean | void | Promise<boolean | void>;
  onConfirm?: () => boolean | void | Promise<boolean | void>;
  pendingInvoice?: WorkstreamOffer;
  error?: string | null;
}

export const WorkstreamReleaseModal: React.FC<WorkstreamReleaseModalProps> = ({
  isOpen,
  order,
  onClose,
  onReleaseEscrow,
  onConfirm,
  pendingInvoice,
  error: propError
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const hasHigherInvoice = !!pendingInvoice && pendingInvoice.kind === 'invoice' && pendingInvoice.status === 'pending' && pendingInvoice.amount > order.amount;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (hasHigherInvoice) {
      setError(`Cannot release escrow directly: Final invoice ${pendingInvoice.number} for $${pendingInvoice.amount.toLocaleString()} is pending. Please pay or decline the invoice in the workstream.`);
      return;
    }
    setIsSubmitting(true);
    try {
      const releaseFn = onReleaseEscrow || onConfirm;
      const result = releaseFn ? await releaseFn() : undefined;
      if (result === true) {
        onClose();
      }
    } catch (err: any) {
      setError(err instanceof Error ? err.message : String(err || 'Failed to release escrow funds'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl space-y-6 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-fiverr-dark">Release Escrow Funds</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Order #{order.id}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-between">
            <div>
              <span className="text-xs text-slate-400 uppercase font-semibold block">
                Total Escrow Release
              </span>
              <span className="text-xl font-bold font-mono text-emerald-600">
                ${order.amount.toLocaleString()} USD
              </span>
            </div>
            <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 text-xs font-bold uppercase rounded-full">
              Instant Payout
            </span>
          </div>

          {hasHigherInvoice ? (
            <div className="p-3.5 bg-amber-50/90 text-xs text-amber-900 rounded-2xl border border-amber-300 space-y-2">
              <div className="flex items-center gap-2 font-bold text-amber-950">
                <Receipt className="w-4 h-4 text-amber-700 shrink-0" />
                <span>Final Invoice Pending (${pendingInvoice.amount.toLocaleString()})</span>
              </div>
              <p className="text-xs text-amber-800 leading-relaxed">
                A final invoice ({pendingInvoice.number}) for <strong>${pendingInvoice.amount.toLocaleString()}</strong> is awaiting payment. Releasing escrow directly is locked to avoid financial mismatch. Please click <strong>Pay Invoice</strong> on the invoice card in the workstream message stream to pay the invoice and release funds.
              </p>
            </div>
          ) : (
            <div className="p-3 bg-emerald-50/80 text-xs text-emerald-800 rounded-2xl border border-emerald-200 flex items-start gap-2.5 leading-relaxed">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>
                Releasing escrow accepts the deliverables, marks the Workstream as completed, and transfers the funds to the seller. Review submission is completely optional and handled separately.
              </span>
            </div>
          )}

          {(error || propError) && (
            <div className="p-3 bg-red-50/80 text-xs text-red-700 rounded-2xl border border-red-200 flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <span>{error || propError}</span>
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-fiverr-dark font-bold rounded-xl text-xs transition cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || hasHigherInvoice}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs shadow-xs transition cursor-pointer flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>{hasHigherInvoice ? 'Pay Invoice in Chat First' : isSubmitting ? 'Releasing...' : 'Confirm & Release Funds'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

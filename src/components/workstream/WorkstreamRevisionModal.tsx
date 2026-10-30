import React, { useState } from 'react';
import { X, RotateCcw, AlertCircle, Loader2 } from 'lucide-react';
import { WorkstreamItem } from './types';

interface WorkstreamRevisionModalProps {
  isOpen: boolean;
  order: WorkstreamItem;
  onClose: () => void;
  onSubmitRevision: (reason: string) => boolean | void | Promise<boolean | void>;
}

export const WorkstreamRevisionModal: React.FC<WorkstreamRevisionModalProps> = ({
  isOpen,
  order,
  onClose,
  onSubmitRevision
}) => {
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) return;
    setIsSubmitting(true);
    try {
      const result = await onSubmitRevision(reason.trim());
      if (result !== false) {
        onClose();
      }
    } catch (err: any) {
      setError(err instanceof Error ? err.message : String(err || 'Failed to submit revision request'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl space-y-6 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-purple-50 text-purple-700 rounded-xl">
              <RotateCcw className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-fiverr-dark">Request Revisions</h3>
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
          <div>
            <label className="block text-fiverr-dark font-bold uppercase tracking-wider text-xs mb-1.5">
              Specific Changes & Adjustments Needed
            </label>
            <textarea
              rows={4}
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Clearly describe what needs adjusting according to agreed scope..."
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-fiverr-dark placeholder-slate-400 focus:outline-none focus:border-purple-500 focus:bg-white resize-none leading-relaxed"
            />
          </div>

          <div className="p-3 bg-purple-50/70 text-xs text-purple-800 rounded-2xl border border-purple-200 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-purple-600 shrink-0" />
            <span>Escrow remains safely held while the freelancer makes the requested updates.</span>
          </div>

          {error && (
            <div className="p-3 bg-red-50/80 text-xs text-red-700 rounded-2xl border border-red-200 flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <span>{error}</span>
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
              disabled={isSubmitting}
              className="px-5 py-2.5 bg-purple-700 hover:bg-purple-600 text-white font-bold rounded-xl text-xs shadow-xs transition cursor-pointer flex items-center gap-2 disabled:opacity-50"
            >
              {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>{isSubmitting ? 'Sending...' : 'Send Revision Request'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

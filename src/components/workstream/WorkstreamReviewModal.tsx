import React, { useState, useEffect } from 'react';
import { Star, X, CheckCircle2, AlertCircle } from 'lucide-react';
import { WorkstreamItem } from './types';

interface WorkstreamReviewModalProps {
  isOpen: boolean;
  order: WorkstreamItem;
  currentUserId?: string;
  partnerName?: string;
  onClose: () => void;
  onSubmitReview: (review: { rating: number; comment: string; gigId?: string; projectId?: string; reviewId?: string }) => Promise<boolean>;
  error?: string | null;
  isSubmitting?: boolean;
}

export const WorkstreamReviewModal: React.FC<WorkstreamReviewModalProps> = ({
  isOpen,
  order,
  currentUserId,
  partnerName,
  onClose,
  onSubmitReview,
  error,
  isSubmitting = false
}) => {
  const isSeller = !!currentUserId && currentUserId === order.sellerId;
  const existingReview = isSeller ? (order as any).sellerReview : order.review;
  const [rating, setRating] = useState<number>(5);
  const [hoveredRating, setHoveredRating] = useState<number | null>(null);
  const [comment, setComment] = useState<string>('');
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setRating(existingReview?.rating || 5);
      setComment(existingReview?.comment || '');
      setLocalError(null);
    }
  }, [isOpen, existingReview?.id, existingReview?.rating, existingReview?.comment]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    if (!comment.trim()) {
      setLocalError('Please write a brief comment about your experience.');
      return;
    }

    const success = await onSubmitReview({
      rating,
      comment: comment.trim(),
      gigId: order.gigId,
      projectId: order.projectId,
      reviewId: existingReview?.id
    });

    if (success) {
      setComment('');
      setRating(5);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="bg-white border border-slate-200 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-5 relative">
        <button
          onClick={onClose}
          disabled={isSubmitting}
          className="absolute top-5 right-5 p-2 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-500">
            <Star className="w-6 h-6 fill-amber-400 text-amber-400" />
          </div>
          <div>
            <h3 className="text-base font-bold text-fiverr-dark">
              {existingReview ? 'Update Your Review' : isSeller ? `Review Buyer${partnerName ? ` (${partnerName})` : ''}` : `Review Freelancer${partnerName ? ` (${partnerName})` : ''}`}
            </h3>
            <p className="text-xs text-slate-400">Order #{order.id} • {order.title}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 text-center space-y-2">
            <p className="text-xs font-bold text-slate-600 uppercase tracking-wider">Overall Rating</p>
            <div className="flex items-center justify-center gap-2">
              {[1, 2, 3, 4, 5].map((star) => {
                const active = (hoveredRating !== null ? hoveredRating : rating) >= star;
                return (
                  <button
                    type="button"
                    key={star}
                    onMouseEnter={() => setHoveredRating(star)}
                    onMouseLeave={() => setHoveredRating(null)}
                    onClick={() => setRating(star)}
                    className="p-1 transition-transform hover:scale-110 cursor-pointer"
                  >
                    <Star
                      className={`w-7 h-7 transition-colors ${
                        active ? 'fill-amber-400 text-amber-400' : 'text-slate-300'
                      }`}
                    />
                  </button>
                );
              })}
            </div>
            <p className="text-xs font-semibold text-amber-600">
              {rating === 5 && 'Exceptional (5/5)'}
              {rating === 4 && 'Very Good (4/5)'}
              {rating === 3 && 'Satisfactory (3/5)'}
              {rating === 2 && 'Subpar (2/5)'}
              {rating === 1 && 'Poor (1/5)'}
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-fiverr-dark block">
              {isSeller ? 'Share your experience working with this buyer' : 'Share your experience working with this seller'}
            </label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={isSeller ? 'Was the buyer clear with requirements, responsive, and fair?' : 'How was the quality of work, communication, and adherence to deadlines?'}
              rows={4}
              disabled={isSubmitting}
              className="w-full rounded-2xl border border-slate-200 p-3.5 text-xs text-fiverr-dark focus:outline-none focus:border-emerald-600 transition resize-none"
            />
          </div>

          {(localError || error) && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{localError || error}</span>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-100 transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition cursor-pointer disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{isSubmitting ? 'Submitting...' : existingReview ? 'Update Review' : 'Submit Review'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

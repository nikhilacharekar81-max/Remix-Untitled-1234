import React, { useState } from 'react';
import { Star, CheckCircle2, MessageSquare, CornerDownRight } from 'lucide-react';
import { Gig, Review, UserAccount, Order } from '../../types';
import { getAuthToken } from '../../utils/authToken';

interface ReviewsProps {
  currentGig?: Gig;
  targetUser?: UserAccount;
  allReviews?: Review[];
  allOrders?: Order[];
  currentUser?: UserAccount | null;
}

export const Reviews: React.FC<ReviewsProps> = ({
  currentGig,
  targetUser,
  allReviews = [],
  allOrders = [],
  currentUser
}) => {
  const [reviewsList, setReviewsList] = useState<Review[]>(allReviews);
  const [replyingReviewId, setReplyingReviewId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [isSubmittingReply, setIsSubmittingReply] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);

  // Sync if allReviews changes
  React.useEffect(() => {
    setReviewsList(allReviews);
  }, [allReviews]);

  const dataset = reviewsList || [];
  
  const filteredReviews = dataset.filter(r => {
    if (currentGig) {
      // 1. Authoritative direct gigId on the review
      if (r.gigId) {
        return r.gigId === currentGig.id;
      }

      // 2. Authoritative Order -> Gig relationship where available
      if (r.orderId && allOrders && allOrders.length > 0) {
        const matchingOrder = allOrders.find(o => o.id === r.orderId);
        if (matchingOrder) {
          if (matchingOrder.gigId) {
            return matchingOrder.gigId === currentGig.id;
          }
          // The order is known and tied to a project or different gig -> strictly NOT this gig
          return false;
        }
      }

      // 3. Fallback: only when no authoritative gigId or order exists, require exact title match (no fuzzy collision)
      if (!r.gigId && !r.orderId && r.orderTitle && currentGig.title) {
        const rTitle = r.orderTitle.toLowerCase().trim();
        const gTitle = currentGig.title.toLowerCase().trim();
        return rTitle === gTitle;
      }
      return false;
    } else if (targetUser) {
      return r.targetUserId === targetUser.id;
    }
    return false;
  });

  const avgRating = currentGig?.rating || (filteredReviews.length > 0 ? (filteredReviews.reduce((s, r) => s + r.rating, 0) / filteredReviews.length) : 0);
  const totalCount = filteredReviews.length;

  const handlePostReply = async (reviewId: string) => {
    if (!replyText.trim()) return;
    setIsSubmittingReply(true);
    setReplyError(null);

    try {
      const token = getAuthToken();
      const res = await fetch(`/api/reviews/${reviewId}/reply`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ text: replyText.trim() })
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setReplyError(data.error || 'Failed to submit response.');
        setIsSubmittingReply(false);
        return;
      }

      if (data.review) {
        setReviewsList(prev => prev.map(r => r.id === reviewId ? data.review : r));
      }
      setReplyingReviewId(null);
      setReplyText('');
    } catch (err: any) {
      setReplyError(err.message || 'Failed to submit response.');
    } finally {
      setIsSubmittingReply(false);
    }
  };

  return (
    <div className="pt-6 font-sans space-y-6">
      {/* Header Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div>
          <h2 className="text-[21px] font-bold text-fiverr-dark tracking-tight flex items-center gap-2">
            <span>Customer Reviews</span>
            <span className="text-xs font-semibold bg-slate-100 text-slate-700 px-2.5 py-0.5 rounded-full">
              {totalCount}
            </span>
          </h2>
          <p className="text-xs text-fiverr-muted mt-1">
            Real feedback from verified buyers.
          </p>
        </div>
      </div>

      {totalCount === 0 ? (
        <div className="p-8 bg-slate-50 border border-slate-200 rounded-2xl text-center text-xs text-slate-500 font-medium">
          No customer reviews yet.
        </div>
      ) : (
        <>
          {/* Rating Summary Header */}
          <div className="flex items-center gap-6 pb-2">
            <div className="flex items-center gap-3">
              <span className="text-3xl font-black text-fiverr-dark font-mono">{avgRating.toFixed(1)}</span>
              <div>
                <div className="flex items-center gap-0.5">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <Star key={s} className="w-4 h-4 fill-amber-400 text-amber-400" />
                  ))}
                </div>
                <span className="text-xs text-fiverr-muted font-medium mt-0.5 block">
                  Based on {totalCount} verified review{totalCount !== 1 ? 's' : ''}
                </span>
              </div>
            </div>
          </div>

          {/* Individual Reviews List */}
          <div className="space-y-4">
            {filteredReviews.map((rev) => {
              const isTargetSeller = currentUser && rev.targetUserId === currentUser.id;
              const canReply = isTargetSeller && !rev.reply;

              return (
                <div key={rev.id} className="p-5 bg-white border border-slate-200 rounded-2xl space-y-3 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <img 
                        src={rev.reviewerAvatar || rev.buyerAvatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&h=100&fit=crop'} 
                        alt={rev.reviewerName || rev.buyerName || 'Buyer'} 
                        className="w-9 h-9 rounded-full object-cover border border-slate-200"
                      />
                      <div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-bold text-fiverr-dark">{rev.reviewerName || rev.buyerName || 'Verified Client'}</span>
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-bold bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded border border-emerald-200">
                            <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" />
                            <span>Verified Purchase</span>
                          </span>
                          {rev.isCancelledOrder && (
                            <span className="text-[10px] font-bold bg-rose-50 text-rose-700 px-1.5 py-0.5 rounded border border-rose-200">
                              Cancelled Order Review
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-fiverr-muted">{rev.createdAt || 'Recent'}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      {[...Array(rev.rating || 5)].map((_, i) => (
                        <Star key={i} className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                      ))}
                    </div>
                  </div>

                  <p className="text-xs text-slate-700 leading-relaxed font-medium">
                    {rev.comment}
                  </p>

                  {rev.orderTitle && (
                    <div className="text-[10px] text-fiverr-muted bg-slate-50 p-2 rounded-lg border border-slate-100 line-clamp-1">
                      <span className="font-semibold text-slate-600">Service:</span> {rev.orderTitle}
                    </div>
                  )}

                  {/* Public Seller Response */}
                  {rev.reply && (
                    <div className="mt-3 pl-3 border-l-2 border-emerald-500 bg-emerald-50/40 p-3 rounded-r-2xl space-y-1">
                      <div className="flex items-center gap-1.5 font-bold text-emerald-950 text-xs">
                        <CornerDownRight className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span>Response from Seller ({rev.reply.sellerName})</span>
                        <span className="text-[10px] font-normal text-slate-500 ml-auto">{new Date(rev.reply.createdAt).toLocaleDateString()}</span>
                      </div>
                      <p className="text-xs text-slate-700 italic pl-5">"{rev.reply.text}"</p>
                    </div>
                  )}

                  {/* Seller Reply Form */}
                  {canReply && (
                    <div className="pt-2 border-t border-slate-100">
                      {replyingReviewId === rev.id ? (
                        <div className="space-y-2 bg-slate-50 p-3 rounded-xl border border-slate-200">
                          <label className="text-xs font-bold text-slate-700 block flex items-center gap-1.5">
                            <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Write Public Response (One-time rebuttal/reply)</span>
                          </label>
                          <textarea
                            value={replyText}
                            onChange={(e) => setReplyText(e.target.value)}
                            rows={2}
                            placeholder="State your side clearly and professionally..."
                            className="w-full text-xs p-2.5 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                          />
                          {replyError && <p className="text-[11px] text-rose-600 font-medium">{replyError}</p>}
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => { setReplyingReviewId(null); setReplyText(''); setReplyError(null); }}
                              className="px-3 py-1 text-xs text-slate-600 hover:text-slate-800 font-semibold cursor-pointer"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => handlePostReply(rev.id)}
                              disabled={isSubmittingReply || !replyText.trim()}
                              className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition shadow-2xs cursor-pointer"
                            >
                              {isSubmittingReply ? 'Posting...' : 'Post Public Response'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => { setReplyingReviewId(rev.id); setReplyText(''); setReplyError(null); }}
                          className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:text-emerald-800 transition cursor-pointer"
                        >
                          <CornerDownRight className="w-3.5 h-3.5" />
                          <span>Reply to Review</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};

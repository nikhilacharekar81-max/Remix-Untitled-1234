import React, { useState, useMemo } from 'react';
import {
  Star, Search, Filter, Eye, CheckCircle2, AlertTriangle,
  Clock, X, Check, RefreshCw, ChevronLeft, ChevronRight,
  TrendingUp, Ban, ShieldCheck, User, MessageSquare, ThumbsUp
} from 'lucide-react';
import { Review } from '../../types';
import { DEFAULT_AVATAR } from '../../constants';

interface ExtendedReview extends Review {
  moderationStatus?: 'approved' | 'flagged' | 'hidden';
  moderationReason?: string;
  orderAmount?: number;
  freelancerName?: string;
  freelancerAvatar?: string;
}

interface AdminReviewsModuleProps {
  initialReviews?: ExtendedReview[];
  onUpdateReviewStatus?: (id: string, status: 'approved' | 'flagged' | 'hidden', reason?: string) => void;
  onDeleteReview?: (id: string) => void;
}

export const AdminReviewsModule: React.FC<AdminReviewsModuleProps> = ({
  initialReviews,
  onUpdateReviewStatus,
  onDeleteReview
}) => {
  // Local robust state for reviews with localStorage filter
  const [reviews, setReviews] = useState<ExtendedReview[]>(() => {
    try {
      const deletedIds = JSON.parse(localStorage.getItem('workperhour_deleted_reviews') || '[]');
      return (initialReviews || []).filter(r => !deletedIds.includes(r.id));
    } catch {
      return initialReviews || [];
    }
  });

  React.useEffect(() => {
    try {
      const deletedIds = JSON.parse(localStorage.getItem('workperhour_deleted_reviews') || '[]');
      setReviews((initialReviews || []).filter(r => !deletedIds.includes(r.id)));
    } catch {
      setReviews(initialReviews || []);
    }
  }, [initialReviews]);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [ratingFilter, setRatingFilter] = useState<'all' | '5' | '4' | '3' | '2' | '1'>('all');
  const [moderationFilter, setModerationFilter] = useState<'all' | 'approved' | 'flagged' | 'hidden'>('all');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 6;

  // Modals
  const [inspectingReview, setInspectingReview] = useState<ExtendedReview | null>(null);
  const [moderateModalReview, setModerateModalReview] = useState<ExtendedReview | null>(null);
  const [newModerationStatus, setNewModerationStatus] = useState<'approved' | 'flagged' | 'hidden'>('approved');
  const [moderationReasonInput, setModerationReasonInput] = useState('');
  const [deleteConfirmReview, setDeleteConfirmReview] = useState<ExtendedReview | null>(null);

  // Metrics
  const metrics = useMemo(() => {
    const total = reviews.length;
    const approved = reviews.filter(r => r.moderationStatus === 'approved').length;
    const flagged = reviews.filter(r => r.moderationStatus === 'flagged').length;
    const hidden = reviews.filter(r => r.moderationStatus === 'hidden').length;
    const avgRating = total > 0 ? (reviews.reduce((sum, r) => sum + r.rating, 0) / total).toFixed(2) : '5.00';
    const fiveStarRatio = total > 0 ? Math.round((reviews.filter(r => r.rating >= 4.5).length / total) * 100) : 100;

    return { total, approved, flagged, hidden, avgRating, fiveStarRatio };
  }, [reviews]);

  // Filtered dataset
  const filteredReviews = useMemo(() => {
    return reviews.filter(review => {
      const matchesSearch =
        review.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (review.reviewerName && review.reviewerName.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (review.freelancerName && review.freelancerName.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (review.gigTitle && review.gigTitle.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (review.comment && review.comment.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesRating = ratingFilter === 'all' || Math.floor(review.rating).toString() === ratingFilter;
      const matchesModeration = moderationFilter === 'all' || review.moderationStatus === moderationFilter;

      return matchesSearch && matchesRating && matchesModeration;
    });
  }, [reviews, searchQuery, ratingFilter, moderationFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredReviews.length / itemsPerPage));
  const paginatedReviews = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredReviews.slice(start, start + itemsPerPage);
  }, [filteredReviews, currentPage, itemsPerPage]);

  // Handlers
  const handleSaveModeration = () => {
    if (!moderateModalReview) return;
    setReviews(prev => prev.map(r => {
      if (r.id === moderateModalReview.id) {
        return {
          ...r,
          moderationStatus: newModerationStatus,
          moderationReason: moderationReasonInput.trim() || undefined
        };
      }
      return r;
    }));
    if (onUpdateReviewStatus) {
      onUpdateReviewStatus(moderateModalReview.id, newModerationStatus, moderationReasonInput.trim());
    }
    setModerateModalReview(null);
  };

  const handleDelete = () => {
    if (!deleteConfirmReview) return;
    const idToDelete = deleteConfirmReview.id;
    try {
      const deletedIds = JSON.parse(localStorage.getItem('workperhour_deleted_reviews') || '[]');
      if (!deletedIds.includes(idToDelete)) {
        deletedIds.push(idToDelete);
        localStorage.setItem('workperhour_deleted_reviews', JSON.stringify(deletedIds));
      }
    } catch (e) {
      console.error("Error saving deleted review ID to localStorage", e);
    }

    setReviews(prev => prev.filter(r => r.id !== idToDelete));
    if (onDeleteReview) onDeleteReview(idToDelete);
    setDeleteConfirmReview(null);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600">
              <Star className="w-5 h-5 fill-amber-500 text-amber-500" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900">Reviews & Reputation Governance</h2>
              <p className="text-xs text-slate-500">Audit client testimonials, filter spam or defamation, and maintain score integrity</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-3 py-1.5 bg-amber-50 text-amber-800 text-xs font-semibold rounded-xl border border-amber-200 flex items-center gap-1">
            <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
            Marketplace Score: {metrics.avgRating} / 5.0
          </span>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Total Reviews</span>
            <MessageSquare className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-bold text-slate-900 mt-2">{metrics.total}</div>
          <span className="text-[11px] text-slate-400">All submitted feedback</span>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-emerald-600">Published Live</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-bold text-emerald-700 mt-2">{metrics.approved}</div>
          <span className="text-[11px] text-emerald-600">Clean & visible</span>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-amber-600">Flagged For Audit</span>
            <AlertTriangle className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-bold text-amber-700 mt-2">{metrics.flagged}</div>
          <span className="text-[11px] text-amber-600">Under investigation</span>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-rose-600">Suppressed / Hidden</span>
            <Ban className="w-4 h-4 text-rose-500" />
          </div>
          <div className="text-2xl font-bold text-rose-700 mt-2">{metrics.hidden}</div>
          <span className="text-[11px] text-rose-500">Removed from public score</span>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-indigo-600">5-Star Ratio</span>
            <ThumbsUp className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="text-2xl font-bold text-indigo-700 mt-2">{metrics.fiveStarRatio}%</div>
          <span className="text-[11px] text-indigo-500">High satisfaction rate</span>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="bg-white border border-slate-200 rounded-3xl p-4 shadow-xs flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search reviews by buyer, freelancer, gig, or keyword..."
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-amber-500/20"
          />
        </div>
        <select
          value={ratingFilter}
          onChange={(e) => { setRatingFilter(e.target.value as any); setCurrentPage(1); }}
          className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700"
        >
          <option value="all">All Star Ratings</option>
          <option value="5">5 Stars</option>
          <option value="4">4 Stars</option>
          <option value="3">3 Stars</option>
          <option value="2">2 Stars</option>
          <option value="1">1 Star</option>
        </select>
        <select
          value={moderationFilter}
          onChange={(e) => { setModerationFilter(e.target.value as any); setCurrentPage(1); }}
          className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700"
        >
          <option value="all">All Moderation Statuses</option>
          <option value="approved">Approved & Visible</option>
          <option value="flagged">Flagged</option>
          <option value="hidden">Hidden / Removed</option>
        </select>
      </div>

      {/* Reviews Table */}
      <div className="bg-white border border-slate-200 rounded-3xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600 border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/75 font-bold text-slate-600 uppercase tracking-wider">
                <th className="py-3 px-4">Reviewer & Target Dev</th>
                <th className="py-3 px-4">Rating</th>
                <th className="py-3 px-4">Testimonial Feedback</th>
                <th className="py-3 px-4">Service & Order</th>
                <th className="py-3 px-4">Moderation</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedReviews.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-slate-400">
                    <Star className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                    No reviews matched the specified filters.
                  </td>
                </tr>
              ) : (
                paginatedReviews.map((review) => (
                  <tr key={review.id} className="hover:bg-slate-50/60 transition group">
                    <td className="py-3.5 px-4">
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2">
                          <img
                            src={review.reviewerAvatar || DEFAULT_AVATAR}
                            alt={review.reviewerName || 'Buyer'}
                            className="w-5 h-5 rounded-full object-cover"
                            onError={(e) => { (e.target as HTMLImageElement).src = DEFAULT_AVATAR; }}
                          />
                          <span className="font-bold text-slate-900 text-[11px]">{review.reviewerName || 'Client'}</span>
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-slate-400">
                          <span>To: </span>
                          <span className="font-semibold text-slate-700">{review.freelancerName || review.targetUserId}</span>
                        </div>
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-1 font-bold text-slate-900">
                        <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                        <span>{review.rating.toFixed(1)}</span>
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {review.createdAt ? new Date(review.createdAt).toLocaleDateString() : 'Recent'}
                      </div>
                    </td>

                    <td className="py-3.5 px-4 max-w-sm">
                      <p className="text-slate-800 line-clamp-2 text-xs italic">
                        "{review.comment || review.review}"
                      </p>
                    </td>

                    <td className="py-3.5 px-4 max-w-xs">
                      <div className="font-semibold text-slate-900 line-clamp-1">
                        {review.gigTitle || review.orderTitle || 'Custom Service'}
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono">
                        Order #{review.orderId || 'N/A'} {review.orderAmount ? `($${review.orderAmount})` : ''}
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      {review.moderationStatus === 'approved' && (
                        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          Approved
                        </span>
                      )}
                      {review.moderationStatus === 'flagged' && (
                        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                          Flagged
                        </span>
                      )}
                      {review.moderationStatus === 'hidden' && (
                        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                          Hidden
                        </span>
                      )}
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => setInspectingReview(review)}
                          className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
                          title="Inspect Review"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            setModerateModalReview(review);
                            setNewModerationStatus(review.moderationStatus || 'approved');
                            setModerationReasonInput(review.moderationReason || '');
                          }}
                          className="p-1.5 text-slate-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition"
                          title="Moderate Review"
                        >
                          <Filter className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setDeleteConfirmReview(review)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                          title="Delete Review"
                        >
                          <Ban className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div className="py-3.5 px-4 bg-slate-50/75 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
          <div>
            Showing <span className="font-semibold text-slate-700">{filteredReviews.length > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0}</span> to <span className="font-semibold text-slate-700">{Math.min(currentPage * itemsPerPage, filteredReviews.length)}</span> of <span className="font-semibold text-slate-700">{filteredReviews.length}</span> reviews
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-2.5 py-1.5 border border-slate-200 rounded-xl bg-white text-slate-600 disabled:opacity-40 hover:bg-slate-50 transition flex items-center gap-1"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>Previous</span>
            </button>
            <span className="font-semibold text-slate-700 px-2">Page {currentPage} of {totalPages}</span>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="px-2.5 py-1.5 border border-slate-200 rounded-xl bg-white text-slate-600 disabled:opacity-40 hover:bg-slate-50 transition flex items-center gap-1"
            >
              <span>Next</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* MODAL 1: INSPECT REVIEW IN FULL */}
      {inspectingReview && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 my-8 space-y-5">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-xs font-bold text-amber-600 uppercase tracking-wider">{inspectingReview.id}</span>
                <h3 className="text-lg font-bold text-slate-900 mt-1">Review Assessment</h3>
                <p className="text-xs text-slate-500">Associated with Order #{inspectingReview.orderId}</p>
              </div>
              <button
                onClick={() => setInspectingReview(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-900 text-sm">{inspectingReview.reviewerName}</span>
                <div className="flex items-center gap-1 text-amber-500 font-bold">
                  <Star className="w-4 h-4 fill-amber-400" />
                  <span>{inspectingReview.rating.toFixed(1)} Stars</span>
                </div>
              </div>
              <p className="text-xs text-slate-700 leading-relaxed italic bg-white p-3 rounded-xl border border-slate-200">
                "{inspectingReview.comment || inspectingReview.review}"
              </p>
            </div>

            <div className="text-xs space-y-1 text-slate-600">
              <div><span className="font-bold text-slate-700">Target Freelancer:</span> {inspectingReview.freelancerName}</div>
              <div><span className="font-bold text-slate-700">Service:</span> {inspectingReview.gigTitle}</div>
              {inspectingReview.moderationReason && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs mt-2">
                  <span className="font-bold block">Audit Reason:</span>
                  {inspectingReview.moderationReason}
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-100">
              <button
                onClick={() => setInspectingReview(null)}
                className="px-4 py-2 bg-slate-100 text-slate-700 text-xs font-bold rounded-xl hover:bg-slate-200"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: MODERATE REVIEW */}
      {moderateModalReview && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <h3 className="text-lg font-bold text-slate-900">Moderate Testimonial #{moderateModalReview.id}</h3>
            
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Moderation Visibility</label>
              <select
                value={newModerationStatus}
                onChange={(e) => setNewModerationStatus(e.target.value as any)}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800"
              >
                <option value="approved">Approved (Live on Profile & Gig)</option>
                <option value="flagged">Flagged (Under Audit Review)</option>
                <option value="hidden">Hidden (Suppressed from Public Score)</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Moderator Audit Note</label>
              <textarea
                rows={3}
                placeholder="Reason for flagging, suppression, or approval..."
                value={moderationReasonInput}
                onChange={(e) => setModerationReasonInput(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => setModerateModalReview(null)}
                className="px-4 py-2 bg-slate-100 text-slate-700 text-xs font-bold rounded-xl hover:bg-slate-200"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveModeration}
                className="px-4 py-2 bg-amber-600 text-white text-xs font-bold rounded-xl hover:bg-amber-700"
              >
                Save Moderation
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: DELETE CONFIRMATION */}
      {deleteConfirmReview && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div className="text-center">
              <h3 className="text-lg font-bold text-slate-900">Delete Review #{deleteConfirmReview.id}?</h3>
              <p className="text-xs text-slate-500 mt-1">
                Are you sure you want to permanently delete this testimonial? The freelancer's average rating calculation will adjust automatically.
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setDeleteConfirmReview(null)}
                className="px-4 py-2 bg-slate-100 text-slate-700 text-xs font-bold rounded-xl hover:bg-slate-200"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="px-4 py-2 bg-rose-600 text-white text-xs font-bold rounded-xl hover:bg-rose-700"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

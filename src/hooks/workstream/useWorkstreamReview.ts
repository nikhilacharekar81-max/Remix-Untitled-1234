import { useState } from 'react';
import { Order, Message, Review } from '../../types';
import { fetchWithRetry } from '../../utils/fetchRetry';

export interface UseWorkstreamReviewProps {
  selectedOrder?: Order | null;
  setOrders?: React.Dispatch<React.SetStateAction<Order[]>>;
  setSelectedOrder?: React.Dispatch<React.SetStateAction<Order | null>>;
  setMessages?: React.Dispatch<React.SetStateAction<Message[]>>;
  setReviews?: React.Dispatch<React.SetStateAction<Review[]>>;
  refresh?: () => Promise<void>;
}

/**
 * Hook responsible for managing workstream review state, validation, and submission.
 * Enforces server-authoritative review persistence, validation error capture,
 * and duplicate-review prevention.
 */
export function useWorkstreamReview({
  selectedOrder,
  setOrders,
  setSelectedOrder,
  setMessages,
  setReviews,
  refresh
}: UseWorkstreamReviewProps) {
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

  const openReviewModal = () => {
    setReviewError(null);
    setIsReviewModalOpen(true);
  };

  const closeReviewModal = () => {
    setReviewError(null);
    setIsReviewModalOpen(false);
  };

  const handleSubmitReview = async (review: {
    rating: number;
    comment: string;
    gigId?: string;
    projectId?: string;
    reviewId?: string;
  }): Promise<boolean> => {
    setReviewError(null);

    if (!selectedOrder) {
      setReviewError('No active Workstream order selected.');
      return false;
    }

    // Verify order eligibility (completed, cancelled, or invoice paid)
    if (selectedOrder.status !== 'completed' && selectedOrder.status !== 'cancelled' && !selectedOrder.hasPaidInvoice) {
      setReviewError(`Reviews can only be submitted once an invoice has been paid or the Workstream is completed.`);
      return false;
    }

    // Client-side validation
    if (!review.rating || review.rating < 1 || review.rating > 5) {
      setReviewError('Please select a star rating between 1 and 5.');
      return false;
    }

    if (!review.comment || !review.comment.trim()) {
      setReviewError('Please provide a feedback comment for this review.');
      return false;
    }

    setIsSubmittingReview(true);
    try {
      const isEdit = Boolean(review.reviewId);
      const url = isEdit ? `/api/reviews/${review.reviewId}` : '/api/reviews';
      const method = isEdit ? 'PUT' : 'POST';

      const res = await fetchWithRetry(url, {
        method,
        body: JSON.stringify({
          orderId: selectedOrder.id,
          rating: review.rating,
          comment: review.comment.trim(),
          orderTitle: selectedOrder.title,
          gigId: review.gigId || selectedOrder.gigId,
          projectId: review.projectId || selectedOrder.projectId
        })
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const errorMsg = data.error || `Review submission failed (status ${res.status}).`;
        setReviewError(errorMsg);
        setIsSubmittingReview(false);
        return false;
      }

      const createdReview = data.review || data;
      const isSellerReview = createdReview.reviewerId === selectedOrder.sellerId;
      const updatedOrder: Order = data.order || {
        ...selectedOrder,
        ...(isSellerReview ? { sellerReview: createdReview } : { review: createdReview })
      };

      if (setOrders) {
        setOrders(prev => prev.map(o => o.id === selectedOrder.id ? updatedOrder : o));
      }
      if (setSelectedOrder) {
        setSelectedOrder(updatedOrder);
      }
      
      if (setReviews) {
        setReviews(prev => [createdReview, ...prev]);
      }
      
      if (refresh) {
        await refresh();
      }

      // Add local review system message if setMessages provided
      if (setMessages) {
        const sysMsg: Message = {
          id: `msg_review_${Date.now()}`,
          orderId: selectedOrder.id,
          senderId: 'system',
          senderName: 'WorkSphere Reviews',
          text: `⭐ Review submitted (${createdReview.rating}/5 stars): "${createdReview.comment}"`,
          timestamp: new Date().toISOString(),
          type: 'system',
          metadata: {
            action: 'review_submitted',
            rating: createdReview.rating,
            comment: createdReview.comment
          }
        };
        setMessages(prev => {
          if (prev.some(m => m.orderId === selectedOrder.id && m.metadata?.action === 'review_submitted')) {
            return prev;
          }
          return [...prev, sysMsg];
        });
      }

      setIsSubmittingReview(false);
      setReviewError(null);
      setIsReviewModalOpen(false);
      return true;
    } catch (err: any) {
      console.error('Failed to submit review:', err);
      setReviewError('A network error occurred while submitting your review. Please try again.');
      setIsSubmittingReview(false);
      return false;
    }
  };

  return {
    isReviewModalOpen,
    setIsReviewModalOpen,
    openReviewModal,
    closeReviewModal,
    isSubmittingReview,
    reviewError,
    setReviewError,
    handleSubmitReview
  };
}

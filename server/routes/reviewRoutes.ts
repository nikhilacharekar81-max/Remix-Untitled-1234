import { Router, Request, Response } from 'express';
import {
  store,
  type Review,
  type Message,
  type Order
} from '../store.js';
import { postgresStore } from '../db/postgresStore.js';
import {
  requireAuth,
  requireRole,
  resolveAuthenticatedUserId
} from '../middleware/auth.js';
import {
  isValidIntegerRating,
  isReviewPublic,
  recalculateUserRating,
  recalculateGigRating,
  sanitizePublicReview
} from '../services/reviewService.js';
import { enrichOrderWithServiceInfo } from '../services/orderService.js';
import { hasPaidInvoiceOrReleasedEscrow } from '../services/workstreamService.js';
import { createNotification } from '../services/notificationService.js';
import { recordMessage } from '../services/messagingService.js';
import { broadcastMessage } from '../websocket.js';

const router = Router();

router.get('/reviews', async (req: Request, res: Response) => {
  try {
    const authUserId = resolveAuthenticatedUserId(req);
    const caller = authUserId ? await store.getUser(authUserId) : null;
    const isAdmin = caller?.role === 'admin' || caller?.role === 'super_admin' || caller?.role === 'support';

    const allReviews = await store.listReviews();

    if (isAdmin) {
      return res.json(allReviews);
    }

    const visibleReviews = allReviews.filter(r => {
      if (authUserId && (r.reviewerId === authUserId || r.targetUserId === authUserId)) {
        return (r as any).moderationStatus !== 'hidden';
      }
      return isReviewPublic(r);
    }).map(sanitizePublicReview);

    res.json(visibleReviews);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to list reviews' });
  }
});

router.get('/users/:userId/reviews', async (req: Request, res: Response) => {
  try {
    const targetUserId = req.params.userId;
    const authUserId = resolveAuthenticatedUserId(req);
    const caller = authUserId ? await store.getUser(authUserId) : null;
    const isAdmin = caller?.role === 'admin' || caller?.role === 'super_admin' || caller?.role === 'support';

    const allReviews = await store.listReviews();
    const userReviews = allReviews.filter(r => {
      if (r.targetUserId !== targetUserId) return false;
      if (isAdmin) return true;
      if (authUserId && (r.reviewerId === authUserId || r.targetUserId === authUserId)) {
        return (r as any).moderationStatus !== 'hidden';
      }
      return isReviewPublic(r);
    }).map(sanitizePublicReview);

    res.json(userReviews);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to list user reviews' });
  }
});

export const handleSubmitReview = async (req: Request, res: Response) => {
  try {
    const authUserId = (req as any).authenticatedUserId;
    const caller = await store.getUser(authUserId);
    if (!caller) return res.status(401).json({ error: 'Authentication required to submit a review' });

    const { orderId, targetUserId, rating, comment, freelancerId, gigId } = req.body || {};

    if (!isValidIntegerRating(rating)) {
      return res.status(400).json({ error: 'Rating must be an integer between 1 and 5 stars.' });
    }
    const numRating = Number(rating);

    if (!comment || typeof comment !== 'string' || !comment.trim()) {
      return res.status(400).json({ error: 'Review comment cannot be empty' });
    }

    let order: Order | null | undefined = null;
    let resolvedOrderId = req.params.id || orderId;

    if (resolvedOrderId) {
      order = await store.getOrder(resolvedOrderId);
      if (!order) return res.status(404).json({ error: 'Workstream order not found' });
      if (caller.id !== order.buyerId && caller.id !== order.sellerId) {
        return res.status(403).json({ error: 'Forbidden: Only the buyer or seller of this order can submit a review.' });
      }
    } else {
      const targetId = targetUserId || freelancerId;
      const targetGigId = gigId;
      const pool = postgresStore.getPool();

      let q = "SELECT * FROM orders WHERE status = 'completed' AND (buyer_id = $1 OR client_id = $1)";
      const params: any[] = [caller.id];
      let pIdx = 2;
      if (targetId) {
        q += ` AND (seller_id = $${pIdx} OR freelancer_id = $${pIdx})`;
        params.push(targetId);
        pIdx++;
      }
      if (targetGigId) {
        q += ` AND (gig_id = $${pIdx} OR id = $${pIdx})`;
        params.push(targetGigId);
        pIdx++;
      }
      q += " ORDER BY completed_at DESC, created_at DESC";
      const completedOrdersRes = await pool.query(q, params);

      for (const row of completedOrdersRes.rows) {
        const revCheck = await pool.query(
          'SELECT id FROM reviews WHERE order_id = $1 AND reviewer_id = $2',
          [row.id, caller.id]
        );
        if (revCheck.rows.length === 0) {
          order = await store.getOrder(row.id);
          resolvedOrderId = row.id;
          break;
        }
      }

      if (!order) {
        return res.status(403).json({ error: 'Forbidden: You must have a completed order with this seller before leaving a review.' });
      }
    }

    const expectedTargetUserId = caller.id === order.buyerId ? order.sellerId : order.buyerId;
    if (targetUserId && targetUserId !== expectedTargetUserId) {
      return res.status(400).json({ error: 'Invalid targetUserId. Review must target the seller or buyer associated with this order.' });
    }
    const resolvedTargetUserId = expectedTargetUserId;

    if (order.status !== 'completed') {
      return res.status(403).json({ error: `Reviews can only be submitted for completed Workstreams (current status: ${order.status}).` });
    }

    const isBuyerReviewer = caller.id === order.buyerId;
    const isSellerReviewer = caller.id === order.sellerId;
    const orderReviews = (await store.listReviews()).filter(r => r.orderId === order!.id);

    if (isBuyerReviewer) {
      if (orderReviews.some(r => (r as any).reviewerRole === 'buyer' || r.reviewerId === order!.buyerId)) {
        return res.status(409).json({ error: 'A review has already been submitted for this order. Use PUT /api/reviews/:id to edit your review.' });
      }
    } else if (isSellerReviewer) {
      const buyerReviewExists = orderReviews.some(r => (r as any).reviewerRole === 'buyer' || r.reviewerId === order!.buyerId);
      if (!buyerReviewExists) {
        return res.status(403).json({ error: 'The buyer must submit their review first before the freelancer can leave a review.' });
      }
      if (orderReviews.some(r => (r as any).reviewerRole === 'seller' || r.reviewerId === order!.sellerId)) {
        return res.status(409).json({ error: 'A review has already been submitted for this order. Use PUT /api/reviews/:id to edit your review.' });
      }
    }

    const existingReviewsRes = await postgresStore.getPool().query(
      'SELECT id FROM reviews WHERE order_id = $1 AND reviewer_id = $2',
      [order.id, caller.id]
    );
    if (existingReviewsRes.rows.length > 0) {
      return res.status(409).json({ error: 'A review has already been submitted for this order. Use PUT /api/reviews/:id to edit your review.' });
    }

    const newReview: Review = {
      id: 'rev_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      orderId: order.id,
      reviewerId: caller.id,
      reviewerName: caller.name,
      reviewerAvatar: caller.avatar,
      ...(isBuyerReviewer ? { reviewerRole: 'buyer' } : { reviewerRole: 'seller' }),
      targetUserId: resolvedTargetUserId,
      rating: numRating,
      comment: comment.trim(),
      orderTitle: order.title || 'Workstream Milestone Deliverable',
      gigId: order.gigId,
      projectId: order.projectId,
      isCancelledOrder: false,
      createdAt: new Date().toISOString().split('T')[0]
    };

    await store.addReview(newReview);

    if (isBuyerReviewer) {
      order.review = newReview;
      await postgresStore.getPool().query('UPDATE orders SET review = $1 WHERE id = $2', [JSON.stringify(newReview), order.id]);
    } else {
      (order as any).sellerReview = newReview;
      await postgresStore.getPool().query('UPDATE orders SET seller_review = $1 WHERE id = $2', [JSON.stringify(newReview), order.id]);
    }

    await recalculateUserRating(resolvedTargetUserId);
    const targetGigId = order.gigId || newReview.gigId;
    if (targetGigId) {
      await recalculateGigRating(targetGigId);
    }

    await createNotification({
      userId: resolvedTargetUserId,
      type: 'review',
      title: 'New Review Received',
      message: `${caller.name} left a ${numRating}-star review for order "${order.title}".`,
      link: `/workstream/${order.id}`,
      dedupKey: `review_${newReview.id}`,
      actorId: caller.id
    });

    const sysMsg: Message = {
      id: 'msg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      orderId: order.id,
      senderId: 'system',
      senderName: 'WorkSphere Reviews',
      text: `⭐ Review submitted by ${caller.name} (${newReview.rating}/5 stars): "${newReview.comment}"`,
      timestamp: new Date().toISOString(),
      type: 'system',
      metadata: {
        action: 'review_submitted',
        rating: newReview.rating,
        comment: newReview.comment,
        isCancelledOrder: false
      }
    };
    await recordMessage(sysMsg);
    broadcastMessage(sysMsg, order.id);

    res.status(201).json({ success: true, review: newReview, order: enrichOrderWithServiceInfo(order) });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to submit review' });
  }
};

router.post('/reviews', requireAuth, handleSubmitReview);
router.post('/orders/:id/review', requireAuth, handleSubmitReview);

router.put('/reviews/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const authUserId = (req as any).authenticatedUserId;
    const caller = await store.getUser(authUserId);
    if (!caller) return res.status(401).json({ error: 'Authentication required' });

    const review = await store.getReview(req.params.id);
    if (!review) return res.status(404).json({ error: 'Review not found' });

    const isAdmin = caller.role === 'admin' || caller.role === 'super_admin';
    if (!isAdmin && review.reviewerId !== caller.id) {
      return res.status(403).json({ error: 'Forbidden: You can only edit your own review.' });
    }

    const { rating, comment } = req.body;
    let newRating = Number(review.rating);
    if (rating !== undefined) {
      if (!isValidIntegerRating(rating)) {
        return res.status(400).json({ error: 'Rating must be an integer between 1 and 5 stars.' });
      }
      newRating = Number(rating);
    }

    let newComment = review.comment;
    if (comment && typeof comment === 'string' && comment.trim()) {
      newComment = comment.trim();
    }

    const now = new Date().toISOString();
    review.rating = newRating;
    review.comment = newComment;
    review.updatedAt = now;
    await store.saveReview(review);

    if (review.targetUserId) {
      await recalculateUserRating(review.targetUserId);
    }

    const targetGigId = review.gigId || (review.orderId ? (await store.getOrder(review.orderId))?.gigId : undefined);
    if (targetGigId) {
      await recalculateGigRating(targetGigId);
    }

    if (review.orderId) {
      const order = await store.getOrder(review.orderId);
      if (order) {
        if (order.review && order.review.id === review.id) {
          order.review.rating = newRating;
          order.review.comment = newComment;
          await postgresStore.getPool().query('UPDATE orders SET review = $1 WHERE id = $2', [JSON.stringify(order.review), order.id]);
        } else if ((order as any).sellerReview && (order as any).sellerReview.id === review.id) {
          (order as any).sellerReview.rating = newRating;
          (order as any).sellerReview.comment = newComment;
          await postgresStore.getPool().query('UPDATE orders SET seller_review = $1 WHERE id = $2', [JSON.stringify((order as any).sellerReview), order.id]);
        }
      }
    }

    res.json({
      success: true,
      review: {
        id: review.id,
        orderId: review.orderId,
        reviewerId: review.reviewerId,
        reviewerName: review.reviewerName,
        targetUserId: review.targetUserId,
        rating: newRating,
        comment: newComment,
        updatedAt: now
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to update review' });
  }
});

router.post('/reviews/:id/reply', requireAuth, async (req: Request, res: Response) => {
  try {
    const authUserId = (req as any).authenticatedUserId;
    const caller = await store.getUser(authUserId);
    if (!caller) return res.status(401).json({ error: 'Authentication required' });

    const review = await store.getReview(req.params.id);
    if (!review) return res.status(404).json({ error: 'Review not found' });

    const isAdmin = caller.role === 'admin' || caller.role === 'super_admin' || caller.role === 'support';
    const isSeller = review.targetUserId === caller.id;
    const isBuyer = review.reviewerId === caller.id;

    if (!isAdmin && !isSeller && !isBuyer) {
      return res.status(403).json({ error: 'Forbidden: Only the reviewed seller, the reviewer (buyer), or an admin can reply to this review.' });
    }

    const { text, asRole } = req.body;
    if (!text || typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({ error: 'Reply text cannot be empty.' });
    }

    const trimmedText = text.trim();
    const replyObj = {
      text: trimmedText,
      createdAt: new Date().toISOString(),
      sellerId: (isSeller || (isAdmin && asRole === 'seller') ? caller.id : (review.targetUserId || 'unknown')) as string,
      sellerName: caller.name,
      sellerAvatar: caller.avatar,
      authorId: caller.id,
      authorName: caller.name,
      authorAvatar: caller.avatar,
      role: isAdmin ? (asRole || 'admin') : (isSeller ? 'seller' : 'buyer')
    };

    let isBuyerReply = isBuyer && !isAdmin;
    if (isAdmin && asRole === 'buyer') isBuyerReply = true;

    review.reply = replyObj;
    await store.saveReview(review);

    if (review.orderId) {
      const order = await store.getOrder(review.orderId);
      if (order) {
        if (order.review && order.review.id === review.id) {
          order.review.reply = replyObj;
          await postgresStore.getPool().query('UPDATE orders SET review = $1 WHERE id = $2', [JSON.stringify(order.review), order.id]);
        } else if ((order as any).sellerReview && (order as any).sellerReview.id === review.id) {
          (order as any).sellerReview.reply = replyObj;
          await postgresStore.getPool().query('UPDATE orders SET seller_review = $1 WHERE id = $2', [JSON.stringify((order as any).sellerReview), order.id]);
        }

        const sysMsg: Message = {
          id: 'msg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
          orderId: order.id,
          senderId: 'system',
          senderName: 'WorkSphere Reviews',
          text: `💬 Public response posted by ${isBuyerReply ? 'buyer' : 'seller'} ${caller.name}: "${replyObj.text}"`,
          timestamp: new Date().toISOString(),
          type: 'system',
          metadata: { action: 'review_reply_submitted', reply: replyObj }
        };
        await recordMessage(sysMsg);
        broadcastMessage(sysMsg, order.id);
      }
    }

    res.json({ success: true, reply: replyObj });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to reply to review' });
  }
});

router.patch('/admin/reviews/:id/moderation', requireRole(['admin', 'super_admin', 'support']), async (req: Request, res: Response) => {
  try {
    const { moderationStatus } = req.body;
    const review = await store.getReview(req.params.id);
    if (!review) return res.status(404).json({ error: 'Review not found' });

    (review as any).moderationStatus = moderationStatus || 'approved';
    await store.saveReview(review);

    if (review.targetUserId) {
      await recalculateUserRating(review.targetUserId);
    }
    const targetGigId = review.gigId || (review.orderId ? (await store.getOrder(review.orderId))?.gigId : undefined);
    if (targetGigId) {
      await recalculateGigRating(targetGigId);
    }
    res.json({ success: true, review });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to moderate review' });
  }
});

export default router;

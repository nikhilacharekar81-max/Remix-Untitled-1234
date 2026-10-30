import { type Review } from '../store.js';
import { postgresStore } from '../db/postgresStore.js';

export function isValidIntegerRating(val: unknown): boolean {
  if (val === null || val === undefined) return false;
  const num = Number(val);
  return typeof num === 'number' && !isNaN(num) && Number.isInteger(num) && num >= 1 && num <= 5;
}

export function isReviewPublic(r: Review): boolean {
  if (!r) return false;
  // Reviews on cancelled orders are private dispute/cancellation records between participants and staff
  if (r.isCancelledOrder) return false;
  // Non-approved, hidden, or non-public moderation status
  if ((r as any).moderationStatus && (r as any).moderationStatus !== 'approved') return false;
  if ((r as any).status && !['approved', 'published', 'active'].includes((r as any).status)) return false;
  return true;
}

export async function recalculateUserRating(userId: string): Promise<void> {
  try {
    const pool = postgresStore.getPool();
    const res = await pool.query(
      `SELECT COUNT(*) as count, COALESCE(AVG(rating), 5.0) as avg_rating
       FROM reviews
       WHERE target_user_id = $1
         AND is_cancelled_order = false
         AND (moderation_status = 'approved' OR moderation_status IS NULL)`,
      [userId]
    );
    const count = Number(res.rows[0]?.count || 0);
    const avg = count > 0 ? Number(Number(res.rows[0]?.avg_rating).toFixed(1)) : 5.0;
    await pool.query(
      'UPDATE users SET reviews_count = $1, rating = $2 WHERE id = $3',
      [count, avg, userId]
    );
    try {
      await pool.query(
        'UPDATE talents SET reviews_count = $1, rating = $2 WHERE user_id = $3 OR id = $3',
        [count, avg, userId]
      );
    } catch {
      // talents table may not exist or column differences
    }
  } catch (err) {
    console.error(`[reviewService] Error recalculating rating for user ${userId}:`, err);
  }
}

export const recomputeTalentStats = recalculateUserRating;

export async function recalculateGigRating(gigId: string): Promise<void> {
  if (!gigId) return;
  try {
    const pool = postgresStore.getPool();
    const res = await pool.query(
      `SELECT COUNT(r.id) as count, COALESCE(AVG(r.rating), 5.0) as avg_rating
       FROM reviews r
       LEFT JOIN orders o ON r.order_id = o.id
       WHERE (r.gig_id = $1 OR o.gig_id = $1)
         AND o.status = 'completed'
         AND r.is_cancelled_order = false
         AND (r.moderation_status = 'approved' OR r.moderation_status IS NULL)
         AND r.reviewer_id = o.buyer_id`,
      [gigId]
    );
    const count = Number(res.rows[0]?.count || 0);
    const avg = count > 0 ? Number(Number(res.rows[0]?.avg_rating).toFixed(1)) : 5.0;
    await pool.query(
      'UPDATE gigs SET reviews_count = $1, rating = $2 WHERE id = $3',
      [count, avg, gigId]
    );
  } catch (err) {
    console.error(`[reviewService] Error recalculating rating for gig ${gigId}:`, err);
  }
}

export function sanitizePublicReview(r: Review): Review {
  const { moderationReason, moderationNotes, ...publicRev } = r as any;
  return publicRev;
}

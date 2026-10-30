import { RepoContext } from '../types.js';
import {
  type Order,
  type Review,
  mapOrderRow,
  mapReviewRow
} from '../../store.js';

export interface ClearingEarning {
  orderId: string;
  sellerId: string;
  amount: number;
  clearsAt: string;
}

export function mapRowToOrder(r: any): Order {
  return mapOrderRow(r);
}

export class OrdersRepo {
  constructor(private ctx: RepoContext) {}

  // --- ORDERS ---
  async saveOrders(orders: Order[], externalClient?: any): Promise<void> {
    if (!orders) return;
    const run = async (client: any) => {
      const seen = new Set<string>();
      for (const order of orders) {
        if (!order?.id || seen.has(order.id)) continue;
        seen.add(order.id);
        const resolvedOrderType = order.orderType || (order as any).type || (order.projectId ? 'project' : (order.gigId ? 'gig' : null));
        const serviceFee = order.serviceFee ?? (order.feeBreakdown as any)?.buyerFee ?? (order.feeBreakdown as any)?.serviceFee ?? 0;
        const smallOrderFee = order.smallOrderFee ?? (order.feeBreakdown as any)?.smallOrderFee ?? 0;
        const selectedExtrasJson = (order as any).selectedExtras !== undefined
          ? JSON.stringify((order as any).selectedExtras)
          : null;
        await client.query(
          `INSERT INTO orders (
            id, title, buyer_id, seller_id, client_id, freelancer_id, amount, status, created_at, due_date, completed_at, 
            requirements, deliverables, deliverable_files, revisions, admin_notes, is_muted, 
            escrow_protection_start_date, escrow_protection_end_date, gig_id, project_id, 
            service_url, gig_slug, seller_username, buyer_username, service_title, service_thumbnail, 
            is_timer_paused, fee_breakdown, delivery_history, delivery_notes, delivery_reference, 
            accepted_version, review_window_days, review_window_expires_at, review,
            workspace_id, seller_review, previous_status,
            order_type, gig_order_id, project_order_id, proposal_id,
            extension_requests, free_extension_used, cancellation_request, cancellation_history,
            cancellation_type, review_window_restarted_at, response_deadline,
            service_fee, small_order_fee, selected_extras, updated_at
          ) VALUES (
            $1, $2, $3, $4, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19,
            $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37,
            $38, $39, $40, $41, $42, $43, $44, $45, $46, $47, $48,
            $49, $50, $51, NOW()
          )
          ON CONFLICT (id) DO UPDATE SET
            title = EXCLUDED.title,
            buyer_id = EXCLUDED.buyer_id,
            seller_id = EXCLUDED.seller_id,
            client_id = COALESCE(EXCLUDED.client_id, orders.client_id, EXCLUDED.buyer_id),
            freelancer_id = COALESCE(EXCLUDED.freelancer_id, orders.freelancer_id, EXCLUDED.seller_id),
            amount = EXCLUDED.amount,
            service_fee = EXCLUDED.service_fee,
            small_order_fee = EXCLUDED.small_order_fee,
            selected_extras = COALESCE(EXCLUDED.selected_extras, orders.selected_extras),
            status = CASE
              WHEN orders.status IN ('completed', 'cancelled', 'refunded') THEN orders.status
              ELSE EXCLUDED.status
            END,
            created_at = EXCLUDED.created_at,
            due_date = EXCLUDED.due_date,
            completed_at = CASE
              WHEN orders.status IN ('completed', 'cancelled', 'refunded') THEN orders.completed_at
              ELSE COALESCE(EXCLUDED.completed_at, orders.completed_at)
            END,
            requirements = EXCLUDED.requirements,
            deliverables = EXCLUDED.deliverables,
            deliverable_files = EXCLUDED.deliverable_files,
            revisions = EXCLUDED.revisions,
            admin_notes = EXCLUDED.admin_notes,
            is_muted = EXCLUDED.is_muted,
            escrow_protection_start_date = EXCLUDED.escrow_protection_start_date,
            escrow_protection_end_date = EXCLUDED.escrow_protection_end_date,
            gig_id = EXCLUDED.gig_id,
            project_id = EXCLUDED.project_id,
            service_url = EXCLUDED.service_url,
            gig_slug = EXCLUDED.gig_slug,
            seller_username = EXCLUDED.seller_username,
            buyer_username = EXCLUDED.buyer_username,
            service_title = EXCLUDED.service_title,
            service_thumbnail = EXCLUDED.service_thumbnail,
            is_timer_paused = EXCLUDED.is_timer_paused,
            fee_breakdown = EXCLUDED.fee_breakdown,
            delivery_history = EXCLUDED.delivery_history,
            delivery_notes = EXCLUDED.delivery_notes,
            delivery_reference = EXCLUDED.delivery_reference,
            accepted_version = COALESCE(EXCLUDED.accepted_version, orders.accepted_version),
            review_window_days = EXCLUDED.review_window_days,
            review_window_expires_at = EXCLUDED.review_window_expires_at,
            review = EXCLUDED.review,
            workspace_id = EXCLUDED.workspace_id,
            seller_review = EXCLUDED.seller_review,
            previous_status = EXCLUDED.previous_status,
            order_type = EXCLUDED.order_type,
            gig_order_id = EXCLUDED.gig_order_id,
            project_order_id = EXCLUDED.project_order_id,
            proposal_id = EXCLUDED.proposal_id,
            extension_requests = EXCLUDED.extension_requests,
            free_extension_used = EXCLUDED.free_extension_used,
            cancellation_request = EXCLUDED.cancellation_request,
            cancellation_history = EXCLUDED.cancellation_history,
            cancellation_type = CASE
              WHEN orders.status IN ('completed', 'cancelled', 'refunded') THEN orders.cancellation_type
              ELSE COALESCE(EXCLUDED.cancellation_type, orders.cancellation_type)
            END,
            review_window_restarted_at = EXCLUDED.review_window_restarted_at,
            response_deadline = EXCLUDED.response_deadline,
            updated_at = NOW()`,
          [
            order.id, order.title, order.buyerId, order.sellerId, order.amount, order.status,
            order.createdAt, order.dueDate, order.completedAt || null, order.requirements || null,
            order.deliverables || null, JSON.stringify(order.deliverableFiles || []),
            JSON.stringify(order.revisions || []), order.adminNotes || null, order.isMuted || false,
            order.escrowProtectionStartDate || null, order.escrowProtectionEndDate || null,
            order.gigId || null, order.projectId || null, order.serviceUrl || null,
            order.gigSlug || null, order.sellerUsername || null, order.buyerUsername || null,
            order.serviceTitle || null, order.serviceThumbnail || null, order.isTimerPaused || false,
            JSON.stringify(order.feeBreakdown || null), JSON.stringify(order.deliveryHistory || []),
            order.deliveryNotes || null, order.deliveryReference || null, order.acceptedVersion ?? null,
            order.reviewWindowDays ?? null, order.reviewWindowExpiresAt || null, JSON.stringify(order.review || null),
            (order as any).workspaceId || null, JSON.stringify((order as any).sellerReview || null), (order as any).previousStatus || null,
            resolvedOrderType, order.gigOrderId || null, order.projectOrderId || null, order.proposalId || null,
            JSON.stringify(order.extensionRequests || []), Boolean(order.freeExtensionUsed),
            JSON.stringify(order.cancellationRequest || null), JSON.stringify(order.cancellationHistory || []),
            order.cancellationType || null, order.reviewWindowRestartedAt || null, order.responseDeadline || null,
            serviceFee, smallOrderFee, selectedExtrasJson
          ]
        );
      }
    };

    if (externalClient) {
      return run(externalClient);
    }

    return this.ctx.withLock('orders', async () => {
      const client = await this.ctx.getPool().connect();
      try {
        await client.query('BEGIN');
        await run(client);
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    });
  }

  async saveOrder(order: Order, client?: any): Promise<void> {
    return this.saveOrders([order], client);
  }

  async listOrders(): Promise<Order[]> {
    const res = await this.ctx.getPool().query('SELECT * FROM orders ORDER BY updated_at DESC NULLS LAST, created_at DESC, id DESC');
    return res.rows.map(mapRowToOrder);
  }

  async getOrderById(id: string, client?: any): Promise<Order | null> {
    if (!id) return null;
    const dbRunner = client || this.ctx.getPool();
    const res = await dbRunner.query(
      `SELECT * FROM orders
       WHERE id = $1 OR gig_order_id = $1 OR project_order_id = $1
       ORDER BY
         CASE
           WHEN id = $1 THEN 0
           ELSE 1
         END ASC,
         updated_at DESC NULLS LAST,
         created_at DESC,
         id DESC
       LIMIT 1`,
      [id]
    );
    return res.rows.length > 0 ? mapRowToOrder(res.rows[0]) : null;
  }

  async listOrdersByWorkspaceId(workspaceId: string, client?: any): Promise<Order[]> {
    if (!workspaceId) return [];
    const dbRunner = client || this.ctx.getPool();
    const wsRes = await dbRunner.query(
      'SELECT workspace_id, buyer_id, seller_id, order_ids FROM workspaces WHERE workspace_id = $1',
      [workspaceId]
    );
    const wsRow = wsRes.rows[0];
    let rows: any[] = [];
    let orderIdsList: string[] = [];
    if (wsRow) {
      orderIdsList = Array.isArray(wsRow.order_ids)
        ? wsRow.order_ids.map(String)
        : (typeof wsRow.order_ids === 'string' ? JSON.parse(wsRow.order_ids || '[]').map(String) : []);
      const res = await dbRunner.query(
        `SELECT * FROM orders
         WHERE buyer_id = $2 AND seller_id = $3
           AND (workspace_id = $1 OR (workspace_id IS NULL AND id = ANY($4::text[])))
         ORDER BY updated_at ASC NULLS LAST, created_at ASC, id ASC`,
        [workspaceId, wsRow.buyer_id, wsRow.seller_id, orderIdsList]
      );
      rows = res.rows;
    } else {
      const res = await dbRunner.query(
        `SELECT * FROM orders
         WHERE workspace_id = $1
         ORDER BY updated_at ASC NULLS LAST, created_at ASC, id ASC`,
        [workspaceId]
      );
      rows = res.rows;
    }

    const mapped = rows.map(mapRowToOrder);
    if (orderIdsList.length > 0) {
      const indexMap = new Map<string, number>();
      orderIdsList.forEach((oid, idx) => indexMap.set(oid, idx));
      mapped.sort((a, b) => {
        const idxA = indexMap.has(a.id) ? indexMap.get(a.id)! : Number.MAX_SAFE_INTEGER;
        const idxB = indexMap.has(b.id) ? indexMap.get(b.id)! : Number.MAX_SAFE_INTEGER;
        if (idxA !== idxB) return idxA - idxB;
        const tA = new Date((a as any).updatedAt || a.createdAt || 0).getTime() || 0;
        const tB = new Date((b as any).updatedAt || b.createdAt || 0).getTime() || 0;
        if (tA !== tB) return tA - tB;
        return a.id.localeCompare(b.id);
      });
    }
    return mapped;
  }

  async resolveWorkspaceActiveOrder(workspaceId: string, client?: any): Promise<Order | null> {
    if (!workspaceId) return null;
    const dbRunner = client || this.ctx.getPool();
    const wsOrders = await this.listOrdersByWorkspaceId(workspaceId, dbRunner);
    if (wsOrders.length === 0) return null;

    const wsRes = await dbRunner.query(
      'SELECT workspace_id, metadata, order_ids FROM workspaces WHERE workspace_id = $1',
      [workspaceId]
    );
    const wsRow = wsRes.rows[0];
    const meta = wsRow
      ? (typeof wsRow.metadata === 'string' ? JSON.parse(wsRow.metadata || '{}') : (wsRow.metadata || {}))
      : {};
    const requestedActiveId = meta?.activeOrderId ? String(meta.activeOrderId) : undefined;

    if (requestedActiveId) {
      const matched = wsOrders.find(
        o => o.id === requestedActiveId && (!o.workspaceId || o.workspaceId === workspaceId)
      );
      if (matched) {
        return matched;
      }
    }

    // Deterministic fallback: prefer the last added verified order in wsOrders (which is sorted chronologically / by order_ids sequence)
    const fallbackOrder = wsOrders[wsOrders.length - 1];

    if (wsRow && fallbackOrder && requestedActiveId !== fallbackOrder.id) {
      try {
        const updatedMeta = { ...meta, activeOrderId: fallbackOrder.id };
        await dbRunner.query(
          'UPDATE workspaces SET metadata = $2, updated_at = $3 WHERE workspace_id = $1',
          [workspaceId, JSON.stringify(updatedMeta), new Date().toISOString()]
        );
      } catch {}
    }

    return fallbackOrder || null;
  }

  async getOrder(id: string, client?: any): Promise<Order | null> {
    if (!id) return null;
    const direct = await this.getOrderById(id, client);
    if (direct) return direct;
    return this.resolveWorkspaceActiveOrder(id, client);
  }

  async listOrdersForUser(userId: string): Promise<Order[]> {
    const res = await this.ctx.getPool().query(
      'SELECT * FROM orders WHERE buyer_id = $1 OR seller_id = $1 ORDER BY updated_at DESC NULLS LAST, created_at DESC, id DESC',
      [userId]
    );
    return res.rows.map(mapRowToOrder);
  }

  async listOrdersByProjectId(projectId: string): Promise<Order[]> {
    const res = await this.ctx.getPool().query(
      'SELECT * FROM orders WHERE project_id = $1 ORDER BY created_at DESC',
      [projectId]
    );
    return res.rows.map(mapRowToOrder);
  }

  // --- REVIEWS ---
  async saveReviews(reviews: Review[]): Promise<void> {
    return this.ctx.withLock('reviews', async () => {
      if (!reviews) return;
      const client = await this.ctx.getPool().connect();
      try {
        await client.query('BEGIN');
        const seen = new Set<string>();
        for (const r of reviews) {
          if (!r?.id || seen.has(r.id)) continue;
          seen.add(r.id);
          await client.query(
            `INSERT INTO reviews (
              id, order_id, reviewer_id, reviewer_name, reviewer_avatar, target_user_id, 
              rating, comment, order_title, gig_id, project_id, created_at, updated_at, is_cancelled_order, reply, moderation_status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
            ON CONFLICT (id) DO UPDATE SET
              order_id = EXCLUDED.order_id,
              reviewer_id = EXCLUDED.reviewer_id,
              reviewer_name = EXCLUDED.reviewer_name,
              reviewer_avatar = EXCLUDED.reviewer_avatar,
              target_user_id = EXCLUDED.target_user_id,
              rating = EXCLUDED.rating,
              comment = EXCLUDED.comment,
              order_title = EXCLUDED.order_title,
              gig_id = EXCLUDED.gig_id,
              project_id = EXCLUDED.project_id,
              created_at = EXCLUDED.created_at,
              updated_at = EXCLUDED.updated_at,
              is_cancelled_order = EXCLUDED.is_cancelled_order,
              reply = EXCLUDED.reply,
              moderation_status = EXCLUDED.moderation_status`,
            [
              r.id, r.orderId || null, r.reviewerId || null, r.reviewerName || null, r.reviewerAvatar || null,
              r.targetUserId || null, r.rating, r.comment || null, r.orderTitle || null, r.gigId || null,
              r.projectId || null, r.createdAt || null, r.updatedAt || null, r.isCancelledOrder || false,
              JSON.stringify(r.reply || null), (r as any).moderationStatus || null
            ]
          );
        }
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    });
  }

  async addReview(review: Review): Promise<void> {
    return this.saveReviews([review]);
  }

  async saveReview(review: Review): Promise<void> {
    return this.saveReviews([review]);
  }

  async listReviews(): Promise<Review[]> {
    const res = await this.ctx.getPool().query('SELECT * FROM reviews ORDER BY created_at DESC');
    return res.rows.map(mapReviewRow);
  }

  async getReview(id: string): Promise<Review | null> {
    const res = await this.ctx.getPool().query('SELECT * FROM reviews WHERE id = $1', [id]);
    return res.rows.length > 0 ? mapReviewRow(res.rows[0]) : null;
  }

  async getReviewById(id: string): Promise<Review | null> {
    return this.getReview(id);
  }

  // --- CLEARING EARNINGS ---
  mapClearingEarningRow(r: any): ClearingEarning {
    const rawClearsAt = r.clearance_end || r.clears_at;
    return {
      orderId: r.order_id,
      sellerId: r.seller_id,
      amount: Number(r.amount),
      clearsAt: rawClearsAt instanceof Date ? rawClearsAt.toISOString() : String(rawClearsAt)
    };
  }

  async saveClearingEarning(e: ClearingEarning, client?: any): Promise<void> {
    const { postgresStore } = await import('../../db/postgresStore.js');
    return postgresStore.saveClearingEarning(e, client);
  }

  async listUnclearedEarningsForUser(sellerId: string, client?: any): Promise<ClearingEarning[]> {
    const dbRunner = client || this.ctx.getPool();
    const res = await dbRunner.query(
      "SELECT * FROM earnings_clearing WHERE seller_id = $1 AND clearance_end > NOW() AND status = 'clearing'",
      [sellerId]
    );
    return res.rows.map((r: any) => this.mapClearingEarningRow(r));
  }

  async getUnclearedEarningsAmount(sellerId: string, client?: any): Promise<number> {
    const dbRunner = client || this.ctx.getPool();
    const res = await dbRunner.query(
      "SELECT COALESCE(SUM(amount), 0) AS total FROM earnings_clearing WHERE seller_id = $1 AND clearance_end > NOW() AND status = 'clearing'",
      [sellerId]
    );
    return Number(res.rows[0]?.total || 0);
  }
}

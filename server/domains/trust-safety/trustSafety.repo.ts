import { RepoContext } from '../types.js';
import {
  type Dispute,
  type SupportTicket,
  mapDisputeRow,
  mapSupportTicketRow
} from '../../store.js';

export class TrustSafetyRepo {
  constructor(private ctx: RepoContext) {}

  // --- DISPUTES ---
  async saveDisputes(disputes: Dispute[]): Promise<void> {
    return this.ctx.withLock('disputes', async () => {
      if (!disputes) return;
      const client = await this.ctx.getPool().connect();
      try {
        await client.query('BEGIN');
        const seen = new Set<string>();
        for (const d of disputes) {
          if (!d?.id || seen.has(d.id)) continue;
          seen.add(d.id);
          await client.query(
            `INSERT INTO disputes (
              id, order_id, buyer_id, seller_id, raised_by, reason, evidence, status, 
              created_at, resolution_notes, resolution_type, notes, assigned_to
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            ON CONFLICT (id) DO UPDATE SET
              order_id = EXCLUDED.order_id,
              buyer_id = EXCLUDED.buyer_id,
              seller_id = EXCLUDED.seller_id,
              raised_by = EXCLUDED.raised_by,
              reason = EXCLUDED.reason,
              evidence = EXCLUDED.evidence,
              status = EXCLUDED.status,
              created_at = EXCLUDED.created_at,
              resolution_notes = EXCLUDED.resolution_notes,
              resolution_type = EXCLUDED.resolution_type,
              notes = EXCLUDED.notes,
              assigned_to = EXCLUDED.assigned_to`,
            [
              d.id, d.orderId, d.buyerId || null, d.sellerId || null, d.raisedBy, d.reason,
              d.evidence || null, d.status, d.createdAt, d.resolutionNotes || null,
              d.resolutionType || null, d.notes || null, d.assignedTo || null
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

  async saveDispute(d: Dispute, client?: any): Promise<void> {
    const dbRunner = client || this.ctx.getPool();
    await dbRunner.query(
      `INSERT INTO disputes (
        id, order_id, buyer_id, seller_id, raised_by, reason, evidence, status, 
        created_at, resolution_notes, resolution_type, notes, assigned_to
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      ON CONFLICT (id) DO UPDATE SET
        order_id = EXCLUDED.order_id,
        buyer_id = EXCLUDED.buyer_id,
        seller_id = EXCLUDED.seller_id,
        raised_by = EXCLUDED.raised_by,
        reason = EXCLUDED.reason,
        evidence = EXCLUDED.evidence,
        status = EXCLUDED.status,
        created_at = EXCLUDED.created_at,
        resolution_notes = EXCLUDED.resolution_notes,
        resolution_type = EXCLUDED.resolution_type,
        notes = EXCLUDED.notes,
        assigned_to = EXCLUDED.assigned_to`,
      [
        d.id, d.orderId, d.buyerId || null, d.sellerId || null, d.raisedBy, d.reason,
        d.evidence || null, d.status, d.createdAt || new Date().toISOString(), d.resolutionNotes || null,
        d.resolutionType || null, d.notes || null, d.assignedTo || null
      ]
    );
  }

  async listDisputes(): Promise<Dispute[]> {
    const res = await this.ctx.getPool().query('SELECT * FROM disputes');
    return res.rows.map(mapDisputeRow);
  }

  async getDisputeById(id: string, client?: any): Promise<Dispute | undefined> {
    const dbRunner = client || this.ctx.getPool();
    const res = await dbRunner.query('SELECT * FROM disputes WHERE id = $1', [id]);
    if (res.rows.length === 0) return undefined;
    return mapDisputeRow(res.rows[0]);
  }

  async getDisputeByOrderId(orderId: string, client?: any): Promise<Dispute | undefined> {
    const dbRunner = client || this.ctx.getPool();
    const res = await dbRunner.query(
      'SELECT * FROM disputes WHERE order_id = $1 ORDER BY created_at DESC LIMIT 1',
      [orderId]
    );
    if (res.rows.length === 0) return undefined;
    return mapDisputeRow(res.rows[0]);
  }

  // --- SUPPORT TICKETS ---
  async saveSupportTickets(tickets: SupportTicket[]): Promise<void> {
    return this.ctx.withLock('support_tickets', async () => {
      if (!tickets) return;
      const client = await this.ctx.getPool().connect();
      try {
        await client.query('BEGIN');
        const seen = new Set<string>();
        for (const t of tickets) {
          if (!t?.id || seen.has(t.id)) continue;
          seen.add(t.id);
          await client.query(
            `INSERT INTO support_tickets (id, user_id, user_name, subject, priority, status, created_at, messages, is_appeal, category, appeal_context)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
             ON CONFLICT (id) DO UPDATE SET
               user_id = EXCLUDED.user_id,
               user_name = EXCLUDED.user_name,
               subject = EXCLUDED.subject,
               priority = EXCLUDED.priority,
               status = EXCLUDED.status,
               created_at = EXCLUDED.created_at,
               messages = EXCLUDED.messages,
               is_appeal = EXCLUDED.is_appeal,
               category = EXCLUDED.category,
               appeal_context = EXCLUDED.appeal_context`,
            [
              t.id,
              t.userId,
              t.userName,
              t.subject,
              t.priority || 'medium',
              t.status || 'open',
              t.createdAt,
              JSON.stringify(t.messages || []),
              !!t.isAppeal,
              t.category || null,
              t.appealContext ? JSON.stringify(t.appealContext) : null
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

  async saveSupportTicket(t: SupportTicket): Promise<void> {
    await this.ctx.getPool().query(
      `INSERT INTO support_tickets (id, user_id, user_name, subject, priority, status, created_at, messages, is_appeal, category, appeal_context)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (id) DO UPDATE SET
         user_id = EXCLUDED.user_id,
         user_name = EXCLUDED.user_name,
         subject = EXCLUDED.subject,
         priority = EXCLUDED.priority,
         status = EXCLUDED.status,
         created_at = EXCLUDED.created_at,
         messages = EXCLUDED.messages,
         is_appeal = EXCLUDED.is_appeal,
         category = EXCLUDED.category,
         appeal_context = EXCLUDED.appeal_context`,
      [
        t.id,
        t.userId,
        t.userName,
        t.subject,
        t.priority || 'medium',
        t.status || 'open',
        t.createdAt || new Date().toISOString(),
        JSON.stringify(t.messages || []),
        Boolean(t.isAppeal),
        t.category || null,
        t.appealContext ? JSON.stringify(t.appealContext) : null
      ]
    );
  }

  async listSupportTickets(): Promise<SupportTicket[]> {
    const res = await this.ctx.getPool().query('SELECT * FROM support_tickets ORDER BY created_at DESC');
    return res.rows.map(mapSupportTicketRow);
  }

  async getSupportTicketById(id: string): Promise<SupportTicket | undefined> {
    const res = await this.ctx.getPool().query('SELECT * FROM support_tickets WHERE id = $1', [id]);
    if (res.rows.length === 0) return undefined;
    return mapSupportTicketRow(res.rows[0]);
  }

  async listSupportTicketsForUser(userId: string): Promise<SupportTicket[]> {
    const res = await this.ctx.getPool().query(
      'SELECT * FROM support_tickets WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    );
    return res.rows.map(mapSupportTicketRow);
  }
}

import { randomUUID } from 'crypto';
import { postgresStore } from '../db/postgresStore.js';
import { createNotification } from './notificationService.js';
import { diagnosticService } from './diagnosticService.js';

export interface OutboxEventRecord {
  id: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: any;
  status: 'pending' | 'processed' | 'failed';
  retryCount: number;
  errorMessage?: string;
  createdAt: string;
  processedAt?: string;
}

/**
  Records a lifecycle/financial event in the outbox table within an existing PostgreSQL transaction client.
  Guarantees that state change and event outbox entry commit atomically.
 */
export async function recordOutboxEvent(
  client: any,
  eventType: string,
  aggregateType: string,
  aggregateId: string,
  payload: any
): Promise<string> {
  const id = `out_${Date.now()}_${randomUUID().slice(0, 8)}`;
  await client.query(
    `INSERT INTO outbox_events (id, event_type, aggregate_type, aggregate_id, payload, status)
     VALUES ($1, $2, $3, $4, $5, 'pending')`,
    [id, eventType, aggregateType, aggregateId, JSON.stringify(payload || {})]
  );
  return id;
}

let outboxIntervalTimer: NodeJS.Timeout | null = null;
let isProcessingOutbox = false;

/**
  Processes pending outbox events sequentially, dispatching notifications and broadcasts cleanly.
  Recoverable upon process restart.
 */
export async function processPendingOutboxEvents(): Promise<number> {
  if (isProcessingOutbox) return 0;
  isProcessingOutbox = true;
  let processedCount = 0;

  try {
    const pool = postgresStore.getPool();
    const candidateRes = await pool.query(
      `SELECT id
       FROM outbox_events
       WHERE status = 'pending' AND retry_count < 5
       ORDER BY created_at ASC
       LIMIT 20`
    );

    for (const candidate of candidateRes.rows) {
      await postgresStore.executeInTransaction(async (client) => {
        const lockRes = await client.query(
          `SELECT id, event_type, aggregate_type, aggregate_id, payload, retry_count
           FROM outbox_events
           WHERE id = $1 AND status = 'pending' AND retry_count < 5
           FOR UPDATE SKIP LOCKED`,
          [candidate.id]
        );
        if (lockRes.rows.length === 0) return;

        const row = lockRes.rows[0];
        const { id, event_type, aggregate_id, payload: rawPayload, retry_count } = row;
        const payload = typeof rawPayload === 'string' ? JSON.parse(rawPayload) : rawPayload;

        try {
          if (event_type === 'ORDER_ESCROW_FUNDED' || event_type === 'ORDER_CREATED') {
            if (payload.sellerId) {
              const canonicalDedupKey = event_type === 'ORDER_ESCROW_FUNDED'
                ? `order_funded_${aggregate_id}_${payload.sellerId}`
                : `order_created_${aggregate_id}`;
              await createNotification({
                userId: payload.sellerId,
                type: 'order',
                title: event_type === 'ORDER_ESCROW_FUNDED' ? 'Order Funded in Escrow' : 'New Order Received',
                message: payload.title ? `Order #${aggregate_id}: "${payload.title}" is active.` : `Order #${aggregate_id} update.`,
                link: `/workstream/${aggregate_id}`,
                dedupKey: canonicalDedupKey,
                client
              }, client);
            }
          } else if (event_type === 'ESCROW_RELEASED') {
            if (payload.sellerId) {
              await createNotification({
                userId: payload.sellerId,
                type: 'finance',
                title: 'Escrow Payment Released',
                message: `Payment of $${Number(payload.amount || 0).toFixed(2)} for order #${aggregate_id} has been released to your balance.`,
                link: `/workstream/${aggregate_id}`,
                dedupKey: `escrow_released_${aggregate_id}_${payload.sellerId}`,
                client
              }, client);
            }
          } else if (event_type === 'ESCROW_REFUNDED') {
            if (payload.buyerId) {
              await createNotification({
                userId: payload.buyerId,
                type: 'finance',
                title: 'Escrow Refund Issued',
                message: `Refund of $${Number(payload.amount || 0).toFixed(2)} for order #${aggregate_id} has been credited to your wallet.`,
                link: `/workstream/${aggregate_id}`,
                dedupKey: `escrow_refunded_${aggregate_id}_${payload.buyerId}`,
                client
              }, client);
            }
          }

          await client.query(
            `UPDATE outbox_events
             SET status = 'processed', processed_at = NOW()
             WHERE id = $1`,
            [id]
          );
          processedCount++;
        } catch (evtErr: any) {
          const nextRetry = (Number(retry_count) || 0) + 1;
          const newStatus = nextRetry >= 5 ? 'failed' : 'pending';
          await client.query(
            `UPDATE outbox_events
             SET retry_count = $1, status = $2, error_message = $3
             WHERE id = $4`,
            [nextRetry, newStatus, String(evtErr?.message || evtErr), id]
          );
          diagnosticService.log('warning', 'outbox', 'processPendingOutboxEvents', 'outboxService.ts', 'process_event', 'FAILED', { eventId: id, eventType: event_type }, evtErr);
        }
      });
    }
  } catch (err) {
    diagnosticService.log('warning', 'outbox', 'processPendingOutboxEvents', 'outboxService.ts', 'batch_fetch', 'FAILED', {}, err);
  } finally {
    isProcessingOutbox = false;
  }

  return processedCount;
}

export function startOutboxProcessor(intervalMs = 3000) {
  if (outboxIntervalTimer) return;
  outboxIntervalTimer = setInterval(() => {
    processPendingOutboxEvents().catch(() => {});
  }, intervalMs);
  if (typeof (outboxIntervalTimer as any)?.unref === 'function') {
    (outboxIntervalTimer as any).unref();
  }
}

export function stopOutboxProcessor() {
  if (outboxIntervalTimer) {
    clearInterval(outboxIntervalTimer);
    outboxIntervalTimer = null;
  }
}

import { randomUUID } from 'crypto';
import {
  store,
  type Message,
  type Order,
  type User
} from '../store.js';
import { postgresStore, isPostgresEnabled } from '../db/postgresStore.js';
import { broadcastMessage } from '../websocket.js';
import { notifyOrderParties } from './notificationService.js';
import { isStaffUser } from '../middleware/auth.js';
import { diagnosticService } from './diagnosticService.js';

export const messageIndex = new Map<string, Message[]>();

export function registerMessage(m: Message) {
  // Authoritative messages are stored directly in PostgreSQL via store.addMessage
  return;
}

export async function recordMessage(m: Message, client?: any): Promise<Message> {
  await store.addMessage(m, client);
  if (m.orderId) {
    const dbRunner = client || postgresStore.getPool();
    try {
      if (client) {
        await client.query('SAVEPOINT sp_record_msg_touch');
        await client.query('UPDATE orders SET updated_at = NOW() WHERE id = $1', [m.orderId]);
        await client.query('RELEASE SAVEPOINT sp_record_msg_touch');
      } else {
        await dbRunner.query('UPDATE orders SET updated_at = NOW() WHERE id = $1', [m.orderId]);
      }
    } catch {
      if (client) {
        try { await client.query('ROLLBACK TO SAVEPOINT sp_record_msg_touch'); } catch {}
      }
    }
    const targetOrderId = m.orderId;
    if (client || postgresStore.isActiveTransaction()) {
      postgresStore.onCommit(() => broadcastMessage(m, targetOrderId));
    } else {
      broadcastMessage(m, targetOrderId);
    }
  }
  return m;
}

export function sanitizeAndCreateMessage(
  sender: User,
  order: Order,
  body: any,
  fileCheck: { ok: boolean; fileInfo?: any; error?: string }
): Message {
  let text = typeof body.text === 'string' ? body.text.trim() : '';
  const isSystemOrStaff = isStaffUser(sender);

  // Check for off-platform contact info
  const offPlatformRegex = /(?:\+?\d{1,4}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}|\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b|(?:https?:\/\/)?(?:www\.)?(?:[a-zA-Z0-9-]+\.)+(?:com|net|org|io|me|co)\b/gi;
  const metadata: any = {};
  if (body.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata)) {
    Object.assign(metadata, body.metadata);
  }

  if (!isSystemOrStaff && offPlatformRegex.test(text)) {
    metadata.offPlatformWarning = true;
  }

  delete metadata.offerId;
  delete metadata.offerKind;

  // Remove reserved metadata.action for all user-submitted messages
  if (typeof metadata.action === 'string') {
    const action = metadata.action.trim().toLowerCase();
    const isReservedAction =
      /^(offer_|escrow_|deliverable_|delivery_|revision_|dispute_|review_|order_|payment_|payout_|refund_|wallet_|transaction_|deposit_|system_|admin_|staff_|moderation_|audit_|project_proposal)/i.test(action) ||
      ['auto_accept', 'order_auto_accepted', 'release_escrow', 'escrow_release'].includes(action);

    if (isReservedAction) {
      delete metadata.action;
    }
  }

  if (!isSystemOrStaff) {
    const FORBIDDEN_METADATA_KEYS = [
      'disputeId', 'revisionId', 'reviewId', 'ticketId', 'payoutId', 'refundId', 'transactionId',
      'deliveryVersion', 'version', 'amount', 'refundAmount', 'feeBreakdown',
      'system', 'isSystem', 'official', 'verified', 'trusted', 'isAdmin', 'isStaff',
      'role', 'senderRole', 'status', 'orderStatus', 'paymentStatus', 'escrowStatus'
    ];
    for (const key of FORBIDDEN_METADATA_KEYS) {
      delete metadata[key];
    }

    for (const k of Object.keys(metadata)) {
      if (k !== 'requirementText' && k !== 'clientMessageId') delete metadata[k];
    }
    if (typeof metadata.requirementText === 'string') {
      metadata.requirementText = metadata.requirementText.slice(0, 2000);
    } else {
      delete metadata.requirementText;
    }
  }

  if (body.clientMessageId) {
    metadata.clientMessageId = String(body.clientMessageId);
  }
  if (body.metadata?.clientMessageId) {
    metadata.clientMessageId = String(body.metadata.clientMessageId);
  }

  const requestedType = typeof body.type === 'string' ? body.type : 'text';
  const ALLOWED_CHAT_TYPES = ['message', 'text', 'file'];
  const safeType = ALLOWED_CHAT_TYPES.includes(requestedType) ? requestedType : 'text';
  if (safeType !== 'file' && !text) throw new Error('Message text is required.');

  return {
    id: 'msg_' + randomUUID(),
    orderId: order.id,
    senderId: sender.id,
    senderName: sender.name,
    text: text.slice(0, 5000),
    timestamp: new Date().toISOString(),
    type: safeType,
    fileInfo: fileCheck.fileInfo,
    metadata: Object.keys(metadata).length ? metadata : undefined
  };
}

export async function emitSystemEvent(
  orderId: string,
  action: string,
  text: string,
  metadata: Record<string, any> = {},
  client?: any
): Promise<void> {
  const sysMsg: Message = {
    id: 'msg_' + randomUUID(),
    orderId,
    senderId: 'system',
    senderName: 'WorkSphere System',
    text,
    timestamp: new Date().toISOString(),
    type: 'system',
    metadata: { ...metadata, action }
  };
  await recordMessage(sysMsg, client);
  await notifyOrderParties(orderId, action, text, sysMsg.id, client);
}

export async function pushSystemMessage(orderId: string, text: string, action = 'system_notice', client?: any): Promise<void> {
  await emitSystemEvent(orderId, action, text, {}, client);
}

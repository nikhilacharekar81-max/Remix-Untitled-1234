import {
  store,
  type Notification,
  type UserEmail,
  type User,
  type Message
} from '../store.js';
import { postgresStore } from '../db/postgresStore.js';
import { broadcastNotificationToUser, clients } from '../websocket.js';
import { WebSocket } from 'ws';
import { IS_PRODUCTION } from '../middleware/auth.js';

const EMAIL_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM || 'WorkPerHour <onboarding@resend.dev>';
export const EMAIL_DELIVERY_ENABLED = Boolean(EMAIL_API_KEY);
const APP_URL = (process.env.APP_URL || '').replace(/\/$/, '');

export function deliverSecurityCode(target: string, type: string, code: string) {
  if (EMAIL_DELIVERY_ENABLED && target.includes('@')) {
    fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${EMAIL_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: [target],
        subject: 'Your WorkPerHour verification code',
        text: `Your verification code is ${code}. It expires in 30 minutes. If you did not request it, ignore this email.`
      })
    }).catch(err => console.error('[email] send failed:', err?.message || err));
    return;
  }
  if (!IS_PRODUCTION) {
    console.warn(`[SECURITY AUTH CODE] ${type} code for ${target}: ${code}`);
  } else {
    console.info(`[SECURITY AUTH CODE] ${type} code generated for ${target}`);
  }
}

export function deliverAdminCode(email: string, code: string) {
  deliverSecurityCode(email, 'ADMIN_2FA', code);
}

export function sendEmail(to: string, subject: string, text: string) {
  if (!EMAIL_DELIVERY_ENABLED || !to || !to.includes('@')) return;
  fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${EMAIL_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: EMAIL_FROM, to: [to], subject, text })
  })
    .then(r => { if (!r.ok) console.error('[email] provider rejected message, status', r.status); })
    .catch(err => console.error('[email] send failed:', err?.message || err));
}

export async function sendOrderEmail(userId: string, subject: string, body: string, path?: string, client?: any) {
  const user = await store.getUser(userId, client);
  if (!user || !user.email) return;
  const link = path && APP_URL ? `\n\nOpen the order: ${APP_URL}${path}` : '';
  const targetEmail = user.email;
  const fullText = `${body}${link}\n\n- WorkPerHour`;
  if (client || postgresStore.isActiveTransaction()) {
    postgresStore.onCommit(() => sendEmail(targetEmail, subject, fullText));
  } else {
    sendEmail(targetEmail, subject, fullText);
  }
}

export async function recordUserEmail(email: UserEmail): Promise<void> {
  const sanitized: UserEmail = {
    ...email,
    snippet: email.snippet ? email.snippet.replace(/\b\d{6}\b/g, '******') : '',
    body: email.body ? email.body.replace(/\b\d{6}\b/g, '******') : ''
  };
  try {
    await store.addUserEmail(sanitized);
  } catch (err) {
    console.error('[PostgresStore] Failed to save user email:', err);
  }
}

export async function createNotification({
  userId,
  type,
  title,
  message,
  link,
  dedupKey,
  actorId,
  client
}: {
  userId: string;
  type: string;
  title: string;
  message: string;
  link?: string;
  dedupKey?: string;
  actorId?: string;
  metadata?: any;
  client?: any;
}, externalClient?: any): Promise<void> {
  if (actorId && actorId === userId) return;
  if (!userId) return;

  const newNotif: Notification = {
    id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    userId,
    type,
    title,
    message,
    link: link || '#',
    read: false,
    createdAt: new Date().toISOString(),
    dedupKey: dedupKey || undefined
  };

  const dbClient = externalClient || client;
  try {
    const saveResult = await postgresStore.saveNotification(newNotif, dbClient);
    if (saveResult && saveResult.duplicate) {
      return;
    }
  } catch (err) {
    console.error('[PostgresStore] Database error saving notification:', err);
    throw err;
  }

  if (dbClient || postgresStore.isActiveTransaction()) {
    postgresStore.onCommit(() => broadcastNotificationToUser(userId, newNotif));
  } else {
    broadcastNotificationToUser(userId, newNotif);
  }
}

export function notifyUser(message: Message, targetUserId: string) {
  const payload = JSON.stringify({ type: 'MESSAGE_RECEIVED', message });
  const orderId = String(message?.orderId || '');
  for (const client of clients) {
    const clientUserId = (client as any).authenticatedUserId;
    const clientRole = (client as any).role || (client as any).authenticatedRole;
    const isSubscribedStaff =
      ['admin', 'super_admin', 'support'].includes(clientRole) &&
      (orderId.startsWith('support_admin_') ||
        ((client as any).subscribedOrderIds instanceof Set && (client as any).subscribedOrderIds.has(orderId)));
    const isAuthorized = clientUserId === targetUserId || isSubscribedStaff;

    if (isAuthorized && client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
}

export async function notifyOrderParties(orderId: string, action: string, text: string, msgId: string, client?: any) {
  const order = await store.getOrder(orderId, client);
  if (!order) return;
  const map: Record<string, { to: ('buyer'|'seller')[]; title: string }> = {
    order_created:        { to: ['seller'],           title: 'New Order Received' },
    escrow_funded:        { to: ['seller'],           title: 'Order Funded' },
    deliverable_approved: { to: ['seller'],           title: 'Delivery Approved' },
    revision_requested:   { to: ['seller'],           title: 'Revision Requested' },
    revision_resolved:    { to: ['buyer'],            title: 'Revision Delivered' },
    escrow_released:      { to: ['seller'],           title: 'Payment Released' },
    escrow_refunded:      { to: ['buyer'],            title: 'Refund Issued' },
    order_completed:      { to: ['buyer', 'seller'],  title: 'Order Completed' },
    dispute_opened:       { to: ['buyer', 'seller'],  title: 'Dispute Opened' },
    dispute_resolved:     { to: ['buyer', 'seller'],  title: 'Dispute Resolved' },
  };
  const rule = map[action];
  if (!rule) return;
  for (const who of rule.to) {
    const userId = who === 'buyer' ? order.buyerId : order.sellerId;
    await createNotification({
      userId,
      type: 'order',
      title: rule.title,
      message: text,
      link: `/workstream/${orderId}`,
      dedupKey: `${action}_${msgId}_${userId}`,
      client
    }, client);
  }
}

export function notifyUserOnAdminAction(user: User, action: 'suspended' | 'restricted' | 'deactivated' | 'impersonated', notes?: string) {
  const timeShort = new Date().toISOString();

  let emailSubject = '';
  let emailBody = '';
  let chatText = '';

  if (action === 'suspended') {
    emailSubject = `[URGENT] WorkSphere Account Suspended - Action Required`;
    emailBody = `Dear ${user.name},\n\nYour WorkSphere account (${user.email}) has been SUSPENDED by Platform Administration.\n\nReason/Notes: ${notes || 'Violation of Marketplace Policies / Security Investigation'}.\n\nWhile suspended, your active listings, gigs, and bidding capabilities are temporarily paused. \n\nAPPEAL PROCESS:\nIf you believe this is an error, please submit an appeal via the Support Tickets section in your dashboard. Our safety team will review your request within 24-48 business hours.`;
    chatText = `🚨 ACCOUNT ALERT: Your WorkSphere account has been SUSPENDED by Platform Administration for: ${notes || 'Policy Violation'}. Please submit an appeal via the Support Tickets section in your dashboard to request a review.`;
  } else if (action === 'restricted') {
    emailSubject = `[NOTICE] WorkSphere Account Privileges Restricted`;
    emailBody = `Dear ${user.name},\n\nYour WorkSphere account (${user.email}) privileges have been RESTRICTED by Platform Administration.\n\nReason/Notes: ${notes || 'Account compliance review / policy warning'}.\n\nCertain actions (such as creating new gigs or submitting bids) are currently limited. \n\nWHAT TO DO:\nYou can still access your existing orders and messages. If you believe this restriction is in error, please submit an appeal via the Support Tickets section in your dashboard.`;
    chatText = `⚠️ ACCOUNT NOTICE: Your WorkSphere account privileges have been RESTRICTED for: ${notes || 'Compliance Review'}. Please submit an appeal via the Support Tickets section in your dashboard to request a review.`;
  } else if (action === 'deactivated') {
    emailSubject = `[NOTICE] WorkSphere Account Deactivated`;
    emailBody = `Dear ${user.name},\n\nYour WorkSphere account (${user.email}) has been DEACTIVATED by Platform Administration.\n\nReason/Notes: ${notes || 'Account deactivated'}.`;
    chatText = `🚨 ACCOUNT ALERT: Your WorkSphere account has been DEACTIVATED.`;
  } else if (action === 'impersonated') {
    return;
  }

  recordUserEmail({
    id: `em_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    userId: user.id,
    userEmail: user.email,
    subject: emailSubject,
    snippet: chatText,
    body: emailBody,
    date: timeShort,
    type: 'ALERT',
    read: false
  });

  createNotification({
    userId: user.id,
    type: 'system',
    title: emailSubject,
    message: chatText,
    link: '/support'
  });
}

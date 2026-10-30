import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { Request } from 'express';
import {
  store,
  mapProposalRow,
  WORKSTREAM_UPLOADS_DIR,
  type Order,
  type Proposal,
  type WorkstreamOffer,
  type WorkstreamOfferKind,
  type Message
} from '../store.js';
import { postgresStore } from '../db/postgresStore.js';
import { calculateOrderFees, quoteOrderWithLiveSettings } from '../domains/finance/fees.js';
import { financialRepository } from './financialService.js';
import { siteSettings } from '../../src/server/siteSettings.js';
import { isStaffUser } from '../middleware/auth.js';
import { recordMessage } from './messagingService.js';
import { broadcastMessage } from '../websocket.js';
import { createNotification } from './notificationService.js';

export { WORKSTREAM_UPLOADS_DIR };
if (!fs.existsSync(WORKSTREAM_UPLOADS_DIR)) {
  fs.mkdirSync(WORKSTREAM_UPLOADS_DIR, { recursive: true });
}

export const WORKSTREAM_FILE_URL_PREFIX = '/api/workstream/files/';
export const workstreamFileExists = (f: string) => fs.existsSync(path.join(WORKSTREAM_UPLOADS_DIR, f));
export const workstreamFileBytes = (f: string) => { try { return fs.statSync(path.join(WORKSTREAM_UPLOADS_DIR, f)).size; } catch { return 0; } };
export const WORKSTREAM_MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25 MB
export const WORKSTREAM_ABANDONED_UPLOAD_TTL_MS = 7 * 24 * 3600 * 1000; // 7 days

export const WORKSTREAM_ALLOWED_EXTENSIONS = new Set([
  '.pdf', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.txt', '.md', '.csv', '.json',
  '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.zip', '.rar', '.7z',
  '.mp4', '.mov', '.webm', '.mp3', '.wav', '.fig', '.psd', '.ai', '.sketch',
  '.html', '.htm', '.js', '.jsx', '.ts', '.tsx', '.css', '.scss',
  '.py', '.java', '.cpp', '.c', '.cs', '.php', '.rb', '.go', '.rs', '.sql', '.sh', '.xml', '.vue', '.svelte', '.yaml', '.yml'
]);

export const WORKSTREAM_INLINE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.pdf', '.txt']);

export const WORKSTREAM_EXTENSION_MIME_MAP: Record<string, { canonical: string; allowed: string[] }> = {
  '.pdf': { canonical: 'application/pdf', allowed: ['application/pdf'] },
  '.png': { canonical: 'image/png', allowed: ['image/png', 'image/x-png'] },
  '.jpg': { canonical: 'image/jpeg', allowed: ['image/jpeg', 'image/jpg', 'image/pjpeg'] },
  '.jpeg': { canonical: 'image/jpeg', allowed: ['image/jpeg', 'image/jpg', 'image/pjpeg'] },
  '.gif': { canonical: 'image/gif', allowed: ['image/gif'] },
  '.webp': { canonical: 'image/webp', allowed: ['image/webp'] },
  '.svg': { canonical: 'image/svg+xml', allowed: ['image/svg+xml', 'text/xml', 'application/xml', 'text/plain'] },
  '.txt': { canonical: 'text/plain', allowed: ['text/plain'] },
  '.md': { canonical: 'text/markdown', allowed: ['text/markdown', 'text/x-markdown', 'text/plain'] },
  '.csv': { canonical: 'text/csv', allowed: ['text/csv', 'application/csv', 'text/plain', 'application/vnd.ms-excel'] },
  '.json': { canonical: 'application/json', allowed: ['application/json', 'text/json', 'text/plain'] },
  '.doc': { canonical: 'application/msword', allowed: ['application/msword', 'application/vnd.ms-word', 'application/x-ole-storage'] },
  '.docx': {
    canonical: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    allowed: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/zip', 'application/x-zip-compressed']
  },
  '.xls': { canonical: 'application/vnd.ms-excel', allowed: ['application/vnd.ms-excel', 'application/x-ole-storage'] },
  '.xlsx': {
    canonical: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    allowed: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/zip', 'application/x-zip-compressed']
  },
  '.ppt': { canonical: 'application/vnd.ms-powerpoint', allowed: ['application/vnd.ms-powerpoint', 'application/x-ole-storage'] },
  '.pptx': {
    canonical: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    allowed: ['application/vnd.openxmlformats-officedocument.presentationml.presentation', 'application/zip', 'application/x-zip-compressed']
  },
  '.zip': { canonical: 'application/zip', allowed: ['application/zip', 'application/x-zip-compressed', 'multipart/x-zip'] },
  '.rar': { canonical: 'application/vnd.rar', allowed: ['application/vnd.rar', 'application/x-rar-compressed', 'application/x-rar'] },
  '.7z': { canonical: 'application/x-7z-compressed', allowed: ['application/x-7z-compressed'] },
  '.mp4': { canonical: 'video/mp4', allowed: ['video/mp4', 'application/mp4'] },
  '.mov': { canonical: 'video/quicktime', allowed: ['video/quicktime', 'video/mov', 'video/mp4'] },
  '.webm': { canonical: 'video/webm', allowed: ['video/webm', 'audio/webm'] },
  '.mp3': { canonical: 'audio/mpeg', allowed: ['audio/mpeg', 'audio/mp3'] },
  '.wav': { canonical: 'audio/wav', allowed: ['audio/wav', 'audio/x-wav', 'audio/wave'] },
  '.fig': { canonical: 'application/octet-stream', allowed: ['application/octet-stream', 'application/x-figma', 'application/zip'] },
  '.psd': { canonical: 'image/vnd.adobe.photoshop', allowed: ['image/vnd.adobe.photoshop', 'application/x-photoshop', 'application/photoshop', 'image/psd'] },
  '.ai': { canonical: 'application/postscript', allowed: ['application/postscript', 'application/illustrator', 'application/pdf'] },
  '.sketch': { canonical: 'application/zip', allowed: ['application/zip', 'application/x-zip-compressed'] },
  '.html': { canonical: 'text/html', allowed: ['text/html', 'text/plain'] },
  '.htm': { canonical: 'text/html', allowed: ['text/html', 'text/plain'] },
  '.js': { canonical: 'text/javascript', allowed: ['text/javascript', 'application/javascript', 'application/x-javascript', 'text/plain'] },
  '.jsx': { canonical: 'text/jsx', allowed: ['text/jsx', 'text/javascript', 'application/javascript', 'text/plain'] },
  '.ts': { canonical: 'text/typescript', allowed: ['text/typescript', 'application/typescript', 'video/mp2t', 'text/plain'] },
  '.tsx': { canonical: 'text/tsx', allowed: ['text/tsx', 'text/typescript', 'application/typescript', 'text/plain'] },
  '.css': { canonical: 'text/css', allowed: ['text/css', 'text/plain'] },
  '.scss': { canonical: 'text/x-scss', allowed: ['text/x-scss', 'text/css', 'text/plain'] },
  '.py': { canonical: 'text/x-python', allowed: ['text/x-python', 'application/x-python-code', 'text/x-script.python', 'text/plain'] },
  '.java': { canonical: 'text/x-java-source', allowed: ['text/x-java-source', 'text/x-java', 'text/plain'] },
  '.cpp': { canonical: 'text/x-c++src', allowed: ['text/x-c++src', 'text/x-c', 'text/plain'] },
  '.c': { canonical: 'text/x-csrc', allowed: ['text/x-csrc', 'text/x-c', 'text/plain'] },
  '.cs': { canonical: 'text/x-csharp', allowed: ['text/x-csharp', 'text/plain'] },
  '.php': { canonical: 'application/x-httpd-php', allowed: ['application/x-httpd-php', 'text/x-php', 'text/php', 'application/php', 'text/plain'] },
  '.rb': { canonical: 'text/x-ruby', allowed: ['text/x-ruby', 'application/x-ruby', 'text/plain'] },
  '.go': { canonical: 'text/x-go', allowed: ['text/x-go', 'text/plain'] },
  '.rs': { canonical: 'text/x-rust', allowed: ['text/x-rust', 'text/plain'] },
  '.sql': { canonical: 'application/sql', allowed: ['application/sql', 'text/x-sql', 'text/sql', 'text/plain'] },
  '.sh': { canonical: 'application/x-sh', allowed: ['application/x-sh', 'text/x-sh', 'text/x-shellscript', 'text/plain'] },
  '.xml': { canonical: 'application/xml', allowed: ['application/xml', 'text/xml', 'text/plain'] },
  '.vue': { canonical: 'text/x-vue', allowed: ['text/x-vue', 'text/plain'] },
  '.svelte': { canonical: 'text/x-svelte', allowed: ['text/x-svelte', 'text/plain'] },
  '.yaml': { canonical: 'application/yaml', allowed: ['application/yaml', 'text/yaml', 'text/x-yaml', 'application/x-yaml', 'text/plain'] },
  '.yml': { canonical: 'application/yaml', allowed: ['application/yaml', 'text/yaml', 'text/x-yaml', 'application/x-yaml', 'text/plain'] }
};

const TEXT_BASED_EXTENSIONS = new Set([
  '.svg', '.txt', '.md', '.csv', '.json',
  '.html', '.htm', '.js', '.jsx', '.ts', '.tsx', '.css', '.scss',
  '.py', '.java', '.cpp', '.c', '.cs', '.php', '.rb', '.go', '.rs', '.sql', '.sh', '.xml', '.vue', '.svelte', '.yaml', '.yml'
]);

const GENERIC_BINARY_MIMES = new Set([
  '',
  '*/*',
  'application/octet-stream',
  'binary/octet-stream',
  'multipart/form-data',
  'application/x-www-form-urlencoded'
]);

export function normalizeMimeType(raw?: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.split(';')[0].trim().toLowerCase();
}

export function getCanonicalMimeForExtension(ext: string): string {
  const normalizedExt = ext.toLowerCase();
  return WORKSTREAM_EXTENSION_MIME_MAP[normalizedExt]?.canonical || 'application/octet-stream';
}

export function sniffBufferMagicMime(buffer: Buffer): { mime: string; allowedExtensions: string[] } | null {
  if (!buffer || buffer.length === 0) return null;

  if (buffer.length >= 4 && buffer.toString('utf8', 0, 4) === '%PDF') {
    return { mime: 'application/pdf', allowedExtensions: ['.pdf', '.ai'] };
  }
  if (buffer.length >= 4 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return { mime: 'image/png', allowedExtensions: ['.png'] };
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { mime: 'image/jpeg', allowedExtensions: ['.jpg', '.jpeg'] };
  }
  if (buffer.length >= 4 && buffer.toString('utf8', 0, 4) === 'GIF8') {
    return { mime: 'image/gif', allowedExtensions: ['.gif'] };
  }
  if (buffer.length >= 12 && buffer.toString('utf8', 0, 4) === 'RIFF' && buffer.toString('utf8', 8, 12) === 'WEBP') {
    return { mime: 'image/webp', allowedExtensions: ['.webp'] };
  }
  if (buffer.length >= 12 && buffer.toString('utf8', 0, 4) === 'RIFF' && buffer.toString('utf8', 8, 12) === 'WAVE') {
    return { mime: 'audio/wav', allowedExtensions: ['.wav'] };
  }
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    ((buffer[2] === 0x03 && buffer[3] === 0x04) ||
      (buffer[2] === 0x05 && buffer[3] === 0x06) ||
      (buffer[2] === 0x07 && buffer[3] === 0x08))
  ) {
    return {
      mime: 'application/zip',
      allowedExtensions: ['.zip', '.docx', '.xlsx', '.pptx', '.sketch', '.fig']
    };
  }
  if (
    buffer.length >= 6 &&
    buffer[0] === 0x52 &&
    buffer[1] === 0x61 &&
    buffer[2] === 0x72 &&
    buffer[3] === 0x21 &&
    buffer[4] === 0x1a &&
    buffer[5] === 0x07
  ) {
    return { mime: 'application/vnd.rar', allowedExtensions: ['.rar'] };
  }
  if (
    buffer.length >= 6 &&
    buffer[0] === 0x37 &&
    buffer[1] === 0x7a &&
    buffer[2] === 0xbc &&
    buffer[3] === 0xaf &&
    buffer[4] === 0x27 &&
    buffer[5] === 0x1c
  ) {
    return { mime: 'application/x-7z-compressed', allowedExtensions: ['.7z'] };
  }
  if (
    buffer.length >= 8 &&
    buffer[0] === 0xd0 &&
    buffer[1] === 0xcf &&
    buffer[2] === 0x11 &&
    buffer[3] === 0xe0 &&
    buffer[4] === 0xa1 &&
    buffer[5] === 0xb1 &&
    buffer[6] === 0x1a &&
    buffer[7] === 0xe1
  ) {
    return { mime: 'application/x-ole-storage', allowedExtensions: ['.doc', '.xls', '.ppt'] };
  }
  if (buffer.length >= 4 && buffer.toString('utf8', 0, 4) === '8BPS') {
    return { mime: 'image/vnd.adobe.photoshop', allowedExtensions: ['.psd'] };
  }
  if (buffer.length >= 4 && buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3) {
    return { mime: 'video/webm', allowedExtensions: ['.webm'] };
  }
  if (buffer.length >= 8 && buffer.toString('ascii', 4, 8) === 'ftyp') {
    const brand = buffer.length >= 12 ? buffer.toString('ascii', 8, 12) : '';
    return {
      mime: brand === 'qt  ' ? 'video/quicktime' : 'video/mp4',
      allowedExtensions: ['.mp4', '.mov']
    };
  }
  if (
    (buffer.length >= 3 && buffer.toString('ascii', 0, 3) === 'ID3') ||
    (buffer.length >= 2 && buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0)
  ) {
    return { mime: 'audio/mpeg', allowedExtensions: ['.mp3'] };
  }
  if (
    (buffer.length >= 2 && buffer[0] === 0x4d && buffer[1] === 0x5a) ||
    (buffer.length >= 4 && buffer[0] === 0x7f && buffer[1] === 0x45 && buffer[2] === 0x4c && buffer[3] === 0x46)
  ) {
    return { mime: 'application/x-executable', allowedExtensions: [] };
  }

  return null;
}

export function resolveAndValidateWorkstreamUploadMime(params: {
  ext: string;
  buffer: Buffer;
  isJsonEnvelope: boolean;
  dataUrlMime?: string;
  declaredMime?: string;
  headerContentType?: string;
}): { ok: true; mimeType: string } | { ok: false; error: string } {
  const ext = params.ext.toLowerCase();
  const extSpec = WORKSTREAM_EXTENSION_MIME_MAP[ext];
  if (!extSpec || !WORKSTREAM_ALLOWED_EXTENSIONS.has(ext)) {
    return { ok: false, error: `File extension "${ext}" is not permitted.` };
  }

  const { buffer } = params;

  // 1. Strict magic byte requirements for formats with fixed headers
  if (ext === '.pdf') {
    if (buffer.length < 4 || buffer.toString('utf8', 0, 4) !== '%PDF') {
      return { ok: false, error: 'Invalid file signature: PDF files must start with %PDF.' };
    }
  } else if (ext === '.png') {
    if (buffer.length < 4 || buffer[0] !== 0x89 || buffer[1] !== 0x50 || buffer[2] !== 0x4e || buffer[3] !== 0x47) {
      return { ok: false, error: 'Invalid file signature: PNG files must start with \\x89PNG.' };
    }
  } else if (ext === '.jpg' || ext === '.jpeg') {
    if (buffer.length < 3 || buffer[0] !== 0xff || buffer[1] !== 0xd8 || buffer[2] !== 0xff) {
      return { ok: false, error: 'Invalid file signature: JPEG files must start with \\xFF\\xD8\\xFF.' };
    }
  } else if (ext === '.gif') {
    if (buffer.length < 4 || buffer.toString('utf8', 0, 4) !== 'GIF8') {
      return { ok: false, error: 'Invalid file signature: GIF files must start with GIF8.' };
    }
  } else if (ext === '.webp') {
    if (buffer.length < 12 || buffer.toString('utf8', 0, 4) !== 'RIFF' || buffer.toString('utf8', 8, 12) !== 'WEBP') {
      return { ok: false, error: 'Invalid file signature: WebP files must start with RIFF...WEBP.' };
    }
  } else if (ext === '.zip') {
    if (
      buffer.length < 4 ||
      buffer[0] !== 0x50 ||
      buffer[1] !== 0x4b ||
      !((buffer[2] === 0x03 && buffer[3] === 0x04) || (buffer[2] === 0x05 && buffer[3] === 0x06) || (buffer[2] === 0x07 && buffer[3] === 0x08))
    ) {
      return { ok: false, error: 'Invalid file signature: ZIP files must start with PK\\x03\\x04.' };
    }
  } else if (ext === '.rar') {
    if (
      buffer.length < 6 ||
      buffer[0] !== 0x52 ||
      buffer[1] !== 0x61 ||
      buffer[2] !== 0x72 ||
      buffer[3] !== 0x21 ||
      buffer[4] !== 0x1a ||
      buffer[5] !== 0x07
    ) {
      return { ok: false, error: 'Invalid file signature: RAR files must start with Rar!\\x1a\\x07.' };
    }
  } else if (ext === '.7z') {
    if (
      buffer.length < 6 ||
      buffer[0] !== 0x37 ||
      buffer[1] !== 0x7a ||
      buffer[2] !== 0xbc ||
      buffer[3] !== 0xaf ||
      buffer[4] !== 0x27 ||
      buffer[5] !== 0x1c
    ) {
      return { ok: false, error: 'Invalid file signature: 7z files must start with 7z signature.' };
    }
  } else if (ext === '.psd') {
    if (buffer.length < 4 || buffer.toString('utf8', 0, 4) !== '8BPS') {
      return { ok: false, error: 'Invalid file signature: PSD files must start with 8BPS.' };
    }
  } else if (ext === '.wav') {
    if (buffer.length < 12 || buffer.toString('utf8', 0, 4) !== 'RIFF' || buffer.toString('utf8', 8, 12) !== 'WAVE') {
      return { ok: false, error: 'Invalid file signature: WAV files must start with RIFF...WAVE.' };
    }
  }

  // 2. Check sniffed magic signature against extension to prevent disguised files
  const sniffed = sniffBufferMagicMime(buffer);
  if (sniffed && !sniffed.allowedExtensions.includes(ext)) {
    return {
      ok: false,
      error: `File content signature (${sniffed.mime}) does not match extension "${ext}".`
    };
  }

  // 3. Validate text/structured content integrity for text-based extensions
  if (TEXT_BASED_EXTENSIONS.has(ext)) {
    const checkLen = Math.min(buffer.length, 8192);
    for (let i = 0; i < checkLen; i++) {
      if (buffer[i] === 0x00) {
        return {
          ok: false,
          error: `Binary file content is not valid for text extension "${ext}".`
        };
      }
    }
    if (ext === '.json') {
      try {
        JSON.parse(buffer.toString('utf8'));
      } catch {
        return { ok: false, error: 'Invalid JSON file content.' };
      }
    }
  }

  // 4. Validate client-provided MIME metadata (if explicitly provided) against permitted types for the extension
  const allowedMimes = new Set(extSpec.allowed);
  const dataMime = normalizeMimeType(params.dataUrlMime);
  const declaredMime = normalizeMimeType(params.declaredMime);
  const headerMime = normalizeMimeType(params.headerContentType);

  if (dataMime && !GENERIC_BINARY_MIMES.has(dataMime)) {
    if (!allowedMimes.has(dataMime)) {
      return {
        ok: false,
        error: `Data URL MIME type "${dataMime}" does not match file extension "${ext}".`
      };
    }
  }

  if (declaredMime && !GENERIC_BINARY_MIMES.has(declaredMime)) {
    if (!allowedMimes.has(declaredMime)) {
      return {
        ok: false,
        error: `Declared MIME type "${declaredMime}" does not match file extension "${ext}".`
      };
    }
  }

  // Only validate HTTP Content-Type header when the request is a raw binary upload (not a JSON upload envelope)
  if (!params.isJsonEnvelope && headerMime && !GENERIC_BINARY_MIMES.has(headerMime)) {
    if (!allowedMimes.has(headerMime)) {
      return {
        ok: false,
        error: `Upload Content-Type "${headerMime}" does not match file extension "${ext}".`
      };
    }
  }

  return { ok: true, mimeType: extSpec.canonical };
}

export const OFFER_LABEL: Record<WorkstreamOfferKind, string> = { proposal: 'proposal', invoice: 'invoice', deposit: 'deposit request' };
export const OFFER_PREFIX: Record<WorkstreamOfferKind, string> = { proposal: 'PRP', invoice: 'INV', deposit: 'DEP' };
export const FUNDED_STATUSES = ['funded_in_escrow', 'delivered', 'revision', 'completed', 'disputed'];

export function generateCollisionSafeOfferNumber(kind: WorkstreamOfferKind): string {
  const prefix = OFFER_PREFIX[kind] || 'OFF';
  const tsPart = Date.now().toString(36).toUpperCase();
  const rndPart = randomUUID().replace(/-/g, '').slice(0, 4).toUpperCase();
  return `${prefix}-${tsPart}-${rndPart}`;
}

export async function cancelPendingOffersForOrder(orderId: string, actorId?: string, client?: any): Promise<void> {
  try {
    const dbRunner = client || postgresStore.getPool();
    await dbRunner.query(
      `UPDATE workstream_offers
       SET status = 'cancelled', resolved_at = NOW(), resolved_by = COALESCE($2, created_by)
       WHERE order_id = $1 AND status = 'pending'`,
      [orderId, actorId || null]
    );
  } catch (err) {
    console.error(`[cancelPendingOffersForOrder] Failed for order ${orderId}:`, err);
  }
}

export async function orderHasEscrow(orderId: string, client?: any): Promise<boolean> {
  const esc = await financialRepository.getEscrow(orderId, client);
  return Boolean(esc && esc.status === 'held' && esc.remaining > 0);
}

export async function hasPaidInvoiceOrReleasedEscrow(order: Order, client?: any): Promise<boolean> {
  const esc = await financialRepository.getEscrow(order.id, client);
  if (order.status === 'completed' || (esc && esc.releasedGross > 0)) return true;
  try {
    const offers = await store.listOffersForOrder(order.id, client);
    return offers.some(o => o.kind === 'invoice' && o.status === 'paid');
  } catch {
    return false;
  }
}

export async function findLinkedProposalForOffer(offer: WorkstreamOffer, order: Order, client?: any): Promise<Proposal | undefined> {
  try {
    const dbRunner = client || postgresStore.getPool();
    if (offer.proposalId) {
      const res = await dbRunner.query('SELECT * FROM proposals WHERE id = $1', [offer.proposalId]);
      if (res.rows.length > 0) return mapProposalRow(res.rows[0]);
    }
    const offerRes = await dbRunner.query('SELECT * FROM proposals WHERE offer_id = $1', [offer.id]);
    if (offerRes.rows.length > 0) return mapProposalRow(offerRes.rows[0]);

    if (order.projectId && order.sellerId) {
      const fallbackRes = await dbRunner.query(
        `SELECT * FROM proposals 
         WHERE project_id = $1 AND freelancer_id = $2 AND status IN ('accepted', 'accepting', 'pending')
         ORDER BY created_at DESC LIMIT 1`,
        [order.projectId, order.sellerId]
      );
      if (fallbackRes.rows.length > 0) return mapProposalRow(fallbackRes.rows[0]);
    }
    return undefined;
  } catch {
    return undefined;
  }
}

export async function viewOffer(o: WorkstreamOffer) {
  let clientTotal: number | undefined;
  let additionalAmount: number | undefined;
  let clientAdditionalTotal: number | undefined;
  try {
    const liveQuote = await quoteOrderWithLiveSettings(o.amount).catch(() => calculateOrderFees(o.amount));
    clientTotal = liveQuote?.clientTotal;
    if (o.kind === 'invoice') {
      const ord = await store.getOrder(o.orderId as string);
      const escrow = ord ? await financialRepository.getEscrow(ord.id) : null;
      const curr = ord ? (o.status === 'pending' ? (escrow?.remaining ?? (ord.status === 'completed' || ord.status === 'cancelled' ? 0 : Number(ord.amount || 0))) : Number(ord.amount || 0)) : 0;
      const addAmt = Math.max(0, Math.round((o.amount - curr) * 100) / 100);
      additionalAmount = addAmt;
      if (addAmt > 0) {
        const addQuote = await quoteOrderWithLiveSettings(addAmt).catch(() => calculateOrderFees(addAmt));
        clientAdditionalTotal = addQuote?.clientTotal;
      } else {
        clientAdditionalTotal = 0;
      }
    }
  } catch { /* quote is informational only */ }
  return {
    ...o,
    clientTotal,
    additionalAmount,
    clientAdditionalTotal,
    currencySymbol: siteSettings.getFlattenedSettings().currencySymbol || '$'
  };
}

export async function postOfferMessage(order: Order, offer: WorkstreamOffer, sender: { id: string; name: string } | null, text: string, action: string, client?: any) {
  const msg: Message = {
    id: `msg_${randomUUID()}`,
    orderId: order.id || undefined,
    workspaceId: (order as any).workspaceId || offer.workspaceId,
    senderId: sender?.id || 'system',
    senderName: sender?.name || 'Workstream',
    text,
    timestamp: new Date().toISOString(),
    type: sender ? 'message' : 'system',
    metadata: {
      action,
      offerId: offer.id,
      offerKind: offer.kind,
      ...(offer.originOrderId || offer.orderId ? { originOrderId: offer.originOrderId || offer.orderId } : {}),
      ...(offer.resultingOrderId ? { resultingOrderId: offer.resultingOrderId } : {}),
      ...((order as any).workspaceId || offer.workspaceId ? { workspaceId: (order as any).workspaceId || offer.workspaceId } : {})
    } as any
  };
  await recordMessage(msg, client);

  const recipientIds: string[] = [];
  if (sender?.id) {
    const other = sender.id === order.buyerId ? order.sellerId : order.buyerId;
    if (other) recipientIds.push(other);
  } else {
    if (order.buyerId) recipientIds.push(order.buyerId);
    if (order.sellerId && order.sellerId !== order.buyerId) recipientIds.push(order.sellerId);
  }
  const targetWorkstreamId = order.id || (order as any).workspaceId || offer.workspaceId;
  for (const userId of recipientIds) {
    await createNotification({
      userId,
      type: 'offer',
      title: 'New Offer Activity',
      message: text,
      link: `/workstream/${targetWorkstreamId}`,
      dedupKey: `offer_${action}_${msg.id}_${userId}`,
      actorId: sender?.id,
      client
    }, client);
  }
}

export async function offerCaller(req: Request) {
  const authUserId = (req as any).authenticatedUserId;
  if ((req as any).authenticatedUser) return (req as any).authenticatedUser;
  if (!authUserId) return null;
  return await store.getUser(authUserId);
}

export function workstreamFilenameFromUrl(url: unknown): string | null {
  if (typeof url !== 'string' || !url.trim()) return null;
  const trimmed = url.trim();
  if (trimmed.startsWith(WORKSTREAM_FILE_URL_PREFIX)) {
    const name = path.basename(trimmed.slice(WORKSTREAM_FILE_URL_PREFIX.length).split('?')[0]);
    if (name && name !== '.' && name !== '..') return name;
  }
  if (trimmed.startsWith('/uploads/workstream/')) {
    const name = path.basename(trimmed.slice('/uploads/workstream/'.length).split('?')[0]);
    if (name && name !== '.' && name !== '..') return name;
  }
  if (trimmed.includes('workstream/')) {
    const parts = trimmed.split('workstream/');
    const lastPart = parts[parts.length - 1].split('?')[0];
    const name = path.basename(lastPart);
    if (name && name !== '.' && name !== '..') {
      return name;
    }
  }
  if (!/^https?:\/\//i.test(trimmed)) {
    const baseName = path.basename(trimmed.split('?')[0]);
    if (baseName && workstreamFileExists(baseName)) {
      return baseName;
    }
  }
  return null;
}

export async function workstreamFileExistsAsync(f: string): Promise<boolean> {
  if (!f) return false;
  const safeBase = path.basename(f);
  if (fs.existsSync(path.join(WORKSTREAM_UPLOADS_DIR, safeBase))) return true;
  try {
    const rec = await store.getUploadRecord(safeBase);
    if (rec) return true;
  } catch {}
  return false;
}

export async function canAccessWorkstreamFile(
  user: any,
  filename: string,
  context?: { workspaceId?: string; orderId?: string }
): Promise<boolean> {
  if (!user) return false;
  if (isStaffUser(user)) return true;

  try {
    const rec = await store.getUploadRecord(filename);
    if (!rec) return false;

    const fileOrder = rec.orderId ? await store.getOrderById(rec.orderId) : undefined;
    const fileWorkspaceId = rec.workspaceId || fileOrder?.workspaceId;

    // Enforce strict Workspace & Order context isolation when context is provided
    if (context?.workspaceId) {
      if (fileWorkspaceId && fileWorkspaceId !== context.workspaceId) {
        return false;
      }
      const wsRes = await postgresStore.getPool().query(
        'SELECT buyer_id, seller_id FROM workspaces WHERE workspace_id = $1',
        [context.workspaceId]
      );
      if (wsRes.rows.length === 0) return false;
      const wsRow = wsRes.rows[0];
      if (user.id !== wsRow.buyer_id && user.id !== wsRow.seller_id) {
        return false;
      }
      if (!fileWorkspaceId && fileOrder) {
        if (fileOrder.buyerId !== wsRow.buyer_id || fileOrder.sellerId !== wsRow.seller_id || fileOrder.workspaceId !== context.workspaceId) {
          return false;
        }
      }
    }

    if (context?.orderId) {
      const ctxOrder = await store.getOrderById(context.orderId);
      if (!ctxOrder) return false;
      if (user.id !== ctxOrder.buyerId && user.id !== ctxOrder.sellerId) {
        return false;
      }
      if (rec.orderId && rec.orderId !== ctxOrder.id) {
        const sameWorkspace =
          Boolean(fileWorkspaceId) &&
          Boolean(ctxOrder.workspaceId) &&
          fileWorkspaceId === ctxOrder.workspaceId &&
          fileOrder?.buyerId === ctxOrder.buyerId &&
          fileOrder?.sellerId === ctxOrder.sellerId;
        if (!sameWorkspace) {
          return false;
        }
      } else if (fileWorkspaceId && ctxOrder.workspaceId && fileWorkspaceId !== ctxOrder.workspaceId) {
        return false;
      }
    }

    if (fileOrder && (user.id === fileOrder.buyerId || user.id === fileOrder.sellerId)) {
      return true;
    }

    if (fileWorkspaceId) {
      const ws = await postgresStore.getPool().query(
        'SELECT buyer_id, seller_id FROM workspaces WHERE workspace_id = $1',
        [fileWorkspaceId]
      );
      if (ws.rows.length > 0) {
        const row = ws.rows[0];
        if (user.id === row.buyer_id || user.id === row.seller_id) {
          return true;
        }
      }
    }

    if (rec.ownerId === user.id) {
      return true;
    }
  } catch (err) {
    console.error(`[canAccessWorkstreamFile] Authorization check error for file ${filename}:`, err);
  }

  return false;
}

export const canAccessWorkstreamUpload = canAccessWorkstreamFile;

export async function validateMessageFileInfo(fileInfo: any, sender: any, targetOrder?: Order):
  Promise<{ ok: true; fileInfo: any } | { ok: false; error: string }> {
  if (fileInfo === undefined || fileInfo === null) return { ok: true, fileInfo: undefined };
  if (typeof fileInfo !== 'object') return { ok: false, error: 'Invalid file attachment.' };

  if (typeof fileInfo.url === 'string') {
    const urlStr = fileInfo.url.trim().toLowerCase();
    if (urlStr.startsWith('javascript:') || urlStr.startsWith('data:') || urlStr.startsWith('file:') || urlStr.startsWith('http:')) {
      return { ok: false, error: 'Insecure URL scheme. Only https:// or internal /api/workstream/files/ links are accepted.' };
    }
  }

  const filename = workstreamFilenameFromUrl(fileInfo.url);
  if (!filename || !(await workstreamFileExistsAsync(filename))) {
    return { ok: false, error: 'Attachments must be uploaded files; placeholder or external URLs are not accepted.' };
  }
  const dbRec = await store.getUploadRecord(filename).catch(() => undefined);
  if (dbRec) {
    const fileOrder = dbRec.orderId ? await store.getOrderById(dbRec.orderId).catch(() => undefined) : undefined;
    const fileWorkspaceId = dbRec.workspaceId || fileOrder?.workspaceId;
    const targetWorkspaceId = targetOrder?.workspaceId;

    if (targetOrder) {
      if (fileWorkspaceId && targetWorkspaceId && fileWorkspaceId !== targetWorkspaceId) {
        return { ok: false, error: 'Forbidden: File belongs to a different workspace.' };
      }
      if (dbRec.orderId && dbRec.orderId !== targetOrder.id) {
        const isSameVerifiedWorkspace =
          Boolean(fileOrder) &&
          Boolean(targetWorkspaceId) &&
          fileOrder!.workspaceId === targetWorkspaceId &&
          fileOrder!.buyerId === targetOrder.buyerId &&
          fileOrder!.sellerId === targetOrder.sellerId;
        if (!isSameVerifiedWorkspace) {
          return { ok: false, error: 'Forbidden: File is bound to a different order or workspace.' };
        }
      }
    }

    if (sender && !isStaffUser(sender)) {
      const isOwner = !dbRec.ownerId || dbRec.ownerId === sender.id;
      const isSameWorkspaceParticipant =
        Boolean(targetOrder) &&
        Boolean(fileWorkspaceId) &&
        Boolean(targetWorkspaceId) &&
        fileWorkspaceId === targetWorkspaceId &&
        (sender.id === targetOrder!.buyerId || sender.id === targetOrder!.sellerId);
      if (!isOwner && !isSameWorkspaceParticipant) {
        return { ok: false, error: 'Forbidden: You do not own this uploaded file.' };
      }
    }
  }
  const bytes = workstreamFileBytes(filename) || Number(dbRec?.size || 0);
  const size = bytes > 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
  const fileExt = path.extname(filename).toLowerCase();
  const canonicalMime = getCanonicalMimeForExtension(fileExt);
  const storedMime = normalizeMimeType(dbRec?.mime);
  const extSpec = WORKSTREAM_EXTENSION_MIME_MAP[fileExt];
  const resolvedMime = storedMime && extSpec?.allowed.includes(storedMime) ? extSpec.canonical : canonicalMime;
  return {
    ok: true,
    fileInfo: {
      name: typeof fileInfo.name === 'string' && fileInfo.name.trim() ? fileInfo.name.trim().slice(0, 200) : (dbRec?.originalName || filename),
      size,
      url: `${WORKSTREAM_FILE_URL_PREFIX}${filename}`,
      type: resolvedMime
    }
  };
}

export async function validateStoredWorkstreamFiles(
  raw: any[],
  submitter?: any,
  targetOrderId?: string
): Promise<{ ok: true; files: Array<{ name: string; size: string; url: string }> } | { ok: false; error: string; status?: number }> {
  if (!Array.isArray(raw)) return { ok: true, files: [] };
  const out: Array<{ name: string; size: string; url: string }> = [];
  const baseUploadDir = path.resolve(WORKSTREAM_UPLOADS_DIR);
  const targetOrder = targetOrderId ? await store.getOrderById(targetOrderId).catch(() => undefined) : undefined;
  const targetWorkspaceId = targetOrder?.workspaceId;

  for (const f of raw) {
    const filename = workstreamFilenameFromUrl(f?.url);
    if (!filename) {
      if (typeof f?.url !== 'string') {
        return { ok: false, error: 'Invalid deliverable link.' };
      }
      const extUrl = f.url.trim();
      if (!extUrl.startsWith('https://')) {
        return { ok: false, error: 'Deliverable external links must use https:// scheme.' };
      }
      out.push({
        name: typeof f?.name === 'string' && f.name.trim() ? f.name.trim().slice(0, 200) : 'External Deliverable',
        size: typeof f?.size === 'string' ? f.size : '1.0 MB',
        url: extUrl
      });
      continue;
    }

    const resolvedPath = path.resolve(WORKSTREAM_UPLOADS_DIR, filename);
    if (!resolvedPath.startsWith(baseUploadDir + path.sep) && resolvedPath !== baseUploadDir) {
      return { ok: false, error: 'Access denied: Invalid file path.' };
    }

    if (!(await workstreamFileExistsAsync(filename))) {
      return { ok: false, error: `Uploaded file not found on server: ${filename}` };
    }

    let dbSize = 0;
    // Verify upload ownership and order/workspace binding in PostgreSQL
    try {
      const pool = postgresStore.getPool();
      const res = await pool.query('SELECT * FROM uploads WHERE filename = $1', [filename]);
      if (res.rows.length > 0) {
        const row = res.rows[0];
        dbSize = Number(row.size || 0);
        const fileOrder = row.order_id ? await store.getOrderById(String(row.order_id)).catch(() => undefined) : undefined;
        const fileWorkspaceId = row.workspace_id ? String(row.workspace_id) : fileOrder?.workspaceId;

        if (targetWorkspaceId && fileWorkspaceId && fileWorkspaceId !== targetWorkspaceId) {
          return { ok: false, error: 'Forbidden: File belongs to a different workspace.', status: 403 };
        }

        if (targetOrderId && row.order_id && String(row.order_id) !== targetOrderId) {
          const isSameVerifiedWorkspace =
            Boolean(targetOrder) &&
            Boolean(fileOrder) &&
            Boolean(targetWorkspaceId) &&
            fileOrder!.workspaceId === targetWorkspaceId &&
            fileOrder!.buyerId === targetOrder!.buyerId &&
            fileOrder!.sellerId === targetOrder!.sellerId;
          if (!isSameVerifiedWorkspace) {
            return { ok: false, error: 'Forbidden: File is bound to a different order.', status: 403 };
          }
        }

        if (submitter && !isStaffUser(submitter)) {
          const isOwner = !row.owner_id || row.owner_id === submitter.id;
          const isSameWorkspaceParticipant =
            Boolean(targetOrder) &&
            Boolean(fileWorkspaceId) &&
            Boolean(targetWorkspaceId) &&
            fileWorkspaceId === targetWorkspaceId &&
            (submitter.id === targetOrder!.buyerId || submitter.id === targetOrder!.sellerId);
          if (!isOwner && !isSameWorkspaceParticipant) {
            return { ok: false, error: 'Forbidden: You do not have ownership of this uploaded file.', status: 403 };
          }
        }
      }
    } catch (err: any) {
      console.error('[validateStoredWorkstreamFiles] DB verification error:', err);
      return { ok: false, error: 'Failed to verify uploaded file ownership', status: 500 };
    }

    const bytes = workstreamFileBytes(filename) || dbSize;
    const size = bytes > 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
    const parts = filename.split('_');
    const fallbackName = parts.length > 2 ? parts.slice(2).join('_') : filename;
    out.push({ name: typeof f?.name === 'string' && f.name.trim() ? f.name.trim().slice(0, 200) : fallbackName, size, url: `${WORKSTREAM_FILE_URL_PREFIX}${filename}` });
  }
  return { ok: true, files: out };
}

export async function cleanupAbandonedWorkstreamUploads() {
  // Workstream messages and uploads are permanently retained and must never be deleted.
  return;
}

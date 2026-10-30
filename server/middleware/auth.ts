import { Request, Response, NextFunction } from 'express';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { IS_PRODUCTION as INIT_IS_PRODUCTION, resolveIsProduction } from '../initEnv.js';
import { store, type User } from '../store.js';
import { postgresStore } from '../db/postgresStore.js';
import { siteSettings } from '../domains/admin/siteSettings.js';
import { disconnectUserSessionSocket } from '../websocket.js';

export const IS_PRODUCTION = INIT_IS_PRODUCTION || resolveIsProduction(import.meta.url);

const WEAK_JWT_SECRET_PLACEHOLDERS = new Set([
  'changeme',
  'secret',
  'default',
  'jwt_secret',
  'your-jwt-secret',
  'your_jwt_secret',
  'dev_mode_fixed_jwt_secret',
  'wph-dev-only-ephemeral-secret',
  'replace-with-strong-secret',
  'password',
  '12345678',
  '1234567890123456',
  'admin',
  'administrator',
  'supersecret',
  'mysecretkey123456',
  'testsecretkey1234',
  'secretkey1234567890',
  'production_jwt_secret',
  'gateway_encryption_key'
]);

const EPHEMERAL_DEV_JWT_SECRET = randomBytes(32).toString('hex');

function hasLowEntropySecret(secret: string): boolean {
  const trimmed = secret.trim();
  const uniqueChars = new Set(trimmed).size;
  if (uniqueChars < 8) return true;

  for (let patternLen = 1; patternLen <= 8; patternLen++) {
    const pattern = trimmed.slice(0, patternLen);
    const repeated = pattern.repeat(Math.ceil(trimmed.length / patternLen)).slice(0, trimmed.length);
    if (trimmed === repeated) return true;
  }

  const alphaSeq = 'abcdefghijklmnopqrstuvwxyz0123456789';
  if (alphaSeq.includes(trimmed.toLowerCase())) return true;
  const numSeq = '0123456789012345678901234567890123456789';
  if (numSeq.includes(trimmed)) return true;

  return false;
}

export function isValidJwtSecret(secret: unknown, isProductionCheck = false): secret is string {
  if (typeof secret !== 'string') return false;
  const trimmed = secret.trim();
  const minLen = isProductionCheck ? 32 : 16;
  if (trimmed.length < minLen) return false;

  const normalized = trimmed.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (WEAK_JWT_SECRET_PLACEHOLDERS.has(trimmed.toLowerCase()) || WEAK_JWT_SECRET_PLACEHOLDERS.has(normalized)) {
    return false;
  }

  if (hasLowEntropySecret(trimmed)) return false;

  return true;
}

export function assertProductionJwtSecret(): string {
  const fromEnv = process.env.JWT_SECRET;
  if (!isValidJwtSecret(fromEnv, true)) {
    throw new Error(
      'FATAL: Production requires an explicit, high-entropy JWT_SECRET environment variable (minimum 32 characters, non-placeholder, non-repetitive). Predictable or ephemeral fallback secrets are disabled in production.'
    );
  }
  return fromEnv.trim();
}

export function resolveJwtSecret(): string {
  const isProd = IS_PRODUCTION || process.env.NODE_ENV === 'production' || resolveIsProduction(import.meta.url);
  const fromEnv = process.env.JWT_SECRET;
  if (isValidJwtSecret(fromEnv, isProd)) {
    return fromEnv.trim();
  }
  if (isProd) {
    return assertProductionJwtSecret();
  }
  return EPHEMERAL_DEV_JWT_SECRET;
}

export const JWT_SECRET: string = resolveJwtSecret();

export const MAX_ACTIVE_SESSIONS = 3;

export function escapeHtml(text: string): string {
  if (typeof text !== 'string') return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function areSimulatedDepositsAllowed(): boolean {
  if (process.env.NODE_ENV === 'production') return false;
  return !(IS_PRODUCTION || resolveIsProduction(import.meta.url));
}

export function apiError(res: Response, message: string, status: number = 400) {
  return res.status(status).json({ error: message });
}

export function formatApiError(err: any, fallbackMessage = 'An unexpected error occurred'): { error: string } {
  if (!err) return { error: fallbackMessage };
  const rawMessage = typeof err === 'string' ? err : (err.message || fallbackMessage);
  if (IS_PRODUCTION || resolveIsProduction(import.meta.url)) {
    const isDbError = /SELECT|INSERT|UPDATE|DELETE|PG::|postgres|sql/i.test(rawMessage);
    if (isDbError) {
      return { error: 'A database error occurred. Please try again later.' };
    }
  }
  return { error: rawMessage };
}

export function getUserActiveSessions(user: User): number[] {
  const current = user.sessionVersion ? Number(user.sessionVersion) : 1;
  const minVer = Math.max(1, current - (MAX_ACTIVE_SESSIONS - 1));
  if (!Array.isArray((user as any).activeSessionVersions)) {
    const versions: number[] = [];
    for (let v = minVer; v <= current; v++) {
      versions.push(v);
    }
    (user as any).activeSessionVersions = versions;
  } else {
    // Keep activeSessionVersions synchronized if sessionVersion advanced in PostgreSQL
    const existing: number[] = (user as any).activeSessionVersions;
    if (!existing.includes(current)) {
      const versions: number[] = [];
      for (let v = minVer; v <= current; v++) {
        versions.push(v);
      }
      (user as any).activeSessionVersions = versions;
    }
  }
  return (user as any).activeSessionVersions;
}

export function registerNewUserSession(user: User): number {
  const nextVersion = (user.sessionVersion || 0) + 1;
  user.sessionVersion = nextVersion;
  const sessions = getUserActiveSessions(user);
  if (!sessions.includes(nextVersion)) {
    sessions.push(nextVersion);
  }
  while (sessions.length > MAX_ACTIVE_SESSIONS) {
    const evicted = sessions.shift();
    if (evicted !== undefined) {
      disconnectUserSessionSocket(user.id, evicted);
    }
  }
  (user as any).activeSessionVersions = sessions;
  return nextVersion;
}

/**
 * Atomically locks the user row in PostgreSQL, increments session_version,
 * enforces the 3-device concurrent session limit without race conditions,
 * and evicts expired WebSocket sessions.
 */
export async function registerNewUserSessionAtomic(user: User): Promise<number> {
  let evictedVersions: number[] = [];
  const nextVersion = await postgresStore.executeInTransaction(async (client) => {
    const lockRes = await client.query(
      'SELECT session_version, known_devices FROM users WHERE id = $1 FOR UPDATE',
      [user.id]
    );
    if (lockRes.rows.length === 0) {
      return registerNewUserSession(user);
    }

    const dbSessionVer = Number(lockRes.rows[0].session_version || user.sessionVersion || 0);
    const nextVer = dbSessionVer + 1;
    const minActiveVer = Math.max(1, nextVer - (MAX_ACTIVE_SESSIONS - 1));
    const prevMinVer = Math.max(1, dbSessionVer - (MAX_ACTIVE_SESSIONS - 1));
    for (let v = prevMinVer; v < minActiveVer; v++) {
      evictedVersions.push(v);
    }

    // Merge knownDevices so concurrent logins on different devices don't clobber each other
    let mergedDevices: string[] = [];
    const rawDbDevices = lockRes.rows[0].known_devices;
    const dbDevices = typeof rawDbDevices === 'string'
      ? (() => { try { return JSON.parse(rawDbDevices); } catch { return []; } })()
      : (Array.isArray(rawDbDevices) ? rawDbDevices : []);
    const memDevices = Array.isArray(user.knownDevices) ? user.knownDevices : [];
    for (const d of [...dbDevices, ...memDevices]) {
      if (typeof d === 'string' && d && !mergedDevices.includes(d)) {
        mergedDevices.push(d);
      }
    }
    if (mergedDevices.length > 10) {
      mergedDevices = mergedDevices.slice(mergedDevices.length - 10);
    }

    await client.query(
      `UPDATE users
       SET session_version = $1,
           known_devices = $2,
           email_verified = $3,
           verified = $4
       WHERE id = $5`,
      [
        nextVer,
        mergedDevices,
        Boolean(user.emailVerified),
        Boolean(user.verified),
        user.id
      ]
    );

    user.sessionVersion = nextVer;
    user.knownDevices = mergedDevices;
    const activeVersions: number[] = [];
    for (let v = minActiveVer; v <= nextVer; v++) {
      activeVersions.push(v);
    }
    (user as any).activeSessionVersions = activeVersions;

    return nextVer;
  });

  for (const evicted of evictedVersions) {
    disconnectUserSessionSocket(user.id, evicted);
  }

  return nextVersion;
}

export function signToken(
  payload: { id: string; role: string; email: string; sessionVersion?: number },
  expiresInMs?: number
): string {
  const secret = resolveJwtSecret();
  const defaultTtlMs = (siteSettings.getSettings()?.security?.sessionTimeoutMinutes || 60) * 60 * 1000;
  const ttl = typeof expiresInMs === 'number' ? expiresInMs : defaultTtlMs;
  const data = JSON.stringify({ ...payload, exp: Date.now() + ttl });
  const base64Data = Buffer.from(data).toString('base64url');
  const signature = createHmac('sha256', secret).update(base64Data).digest('base64url');
  return `${base64Data}.${signature}`;
}

export function verifyToken(token: string): { id: string; role: string; email: string; sessionVersion?: number } | null {
  try {
    const secret = resolveJwtSecret();
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [base64Data, signature] = parts;
    const expectedSig = createHmac('sha256', secret).update(base64Data).digest('base64url');

    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }

    const payload = JSON.parse(Buffer.from(base64Data, 'base64url').toString('utf-8'));
    if (payload.exp && payload.exp < Date.now()) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

// Global Authentication Middleware: verifies cryptographic signed JWT/session and populates req.user
export async function verifyAuthTokenMiddleware(req: Request, res: Response, next: NextFunction) {
  (req as any).authDbError = false;
  (req as any).authDbErrorObject = null;

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    const payload = verifyToken(token);
    if (payload) {
      try {
        const dbUser = await store.getUser(payload.id);
        if (dbUser) {
          if (payload.sessionVersion !== undefined) {
            const activeSessions = getUserActiveSessions(dbUser);
            if (!activeSessions.includes(payload.sessionVersion)) {
              if (payload.sessionVersion === dbUser.sessionVersion) {
                activeSessions.push(payload.sessionVersion);
              } else {
                (req as any).user = null;
                (req as any).authenticatedUserId = null;
                (req as any).authenticatedUser = null;
                return next();
              }
            }
          }
          (req as any).user = {
            id: dbUser.id,
            role: dbUser.role,
            status: dbUser.status,
            email: dbUser.email
          };
          (req as any).authenticatedUserId = dbUser.id;
          (req as any).authenticatedUser = dbUser;
          return next();
        }
      } catch (err) {
        (req as any).authDbError = true;
        (req as any).authDbErrorObject = err;
      }
    }
  }

  (req as any).user = null;
  (req as any).authenticatedUserId = null;
  (req as any).authenticatedUser = null;
  next();
}

export function resolveAuthenticatedUserId(req: Request): string | null {
  const authUser = (req as any).user?.id || (req as any).authenticatedUserId;
  if (authUser && typeof authUser === 'string' && authUser.trim()) {
    return authUser.trim();
  }
  return null;
}

const rateBuckets = new Map<string, { count: number; resetAt: number }>();
const MAX_RATE_BUCKETS = 10_000;
let lastRateBucketSweep = 0;

function sweepExpiredRateBuckets(now: number) {
  if (now - lastRateBucketSweep < 60_000 && rateBuckets.size < MAX_RATE_BUCKETS) {
    return;
  }
  lastRateBucketSweep = now;
  for (const [k, v] of rateBuckets.entries()) {
    if (now > v.resetAt) {
      rateBuckets.delete(k);
    }
  }
  if (rateBuckets.size >= MAX_RATE_BUCKETS) {
    const excess = rateBuckets.size - MAX_RATE_BUCKETS + 1000;
    let removed = 0;
    for (const k of rateBuckets.keys()) {
      rateBuckets.delete(k);
      removed++;
      if (removed >= excess) break;
    }
  }
}

export function rateLimit(max: number, windowMs: number, prefix: string = '') {
  return (req: Request, res: Response, next: NextFunction) => {
    if (process.env.NODE_ENV === 'test') {
      return next();
    }
    const now = Date.now();
    sweepExpiredRateBuckets(now);
    const identity = (req as any).authenticatedUserId || req.ip || req.socket?.remoteAddress || 'anon';
    const route = prefix || req.route?.path || req.path;
    const key = `${route}:${identity}`;
    const record = rateBuckets.get(key) || { count: 0, resetAt: now + windowMs };
    if (now > record.resetAt) {
      record.count = 0;
      record.resetAt = now + windowMs;
    }
    record.count++;
    rateBuckets.set(key, record);
    if (record.count > max) {
      return res.status(429).json({ error: 'Too many requests. Please try again later.' });
    }
    next();
  };
}

export function safeUser(user: any) {
  if (!user) return null;
  const { password, knownDevices, sessionVersion, activeSessionVersions, ...safe } = user;
  return safe;
}

export function orderParticipantSafeUser(user: any) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    avatar: user.avatar,
    title: user.title,
    rating: user.rating,
    reviewsCount: user.reviewsCount,
    hourlyRate: user.hourlyRate,
    skills: user.skills,
    verified: user.verified,
    status: user.status
  };
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  if ((req as any).authDbError) {
    return res.status(503).json(formatApiError((req as any).authDbErrorObject, 'Authentication service temporarily unavailable. Please try again.'));
  }

  const authUserId = resolveAuthenticatedUserId(req);
  if (!authUserId) {
    return res.status(401).json({ error: 'Authentication required. Please provide a valid session token.' });
  }
  let u = (req as any).authenticatedUser;
  if (!u || u.id !== authUserId) {
    try {
      u = await store.getUser(authUserId);
    } catch (err) {
      return res.status(503).json(formatApiError(err, 'Authentication service temporarily unavailable. Please try again.'));
    }
  }
  if (!u) {
    return res.status(401).json({ error: 'User account not found.' });
  }
  if (u.status === 'deactivated') {
    return res.status(403).json({ error: 'Forbidden: This account has been permanently deactivated.' });
  }
  (req as any).authenticatedUserId = u.id;
  (req as any).authenticatedUser = u;
  next();
}

export function requireActiveStatus(req: Request, res: Response, next: NextFunction) {
  const u = (req as any).authenticatedUser;
  if (!u) return res.status(401).json({ error: 'Authentication required.' });

  if (u.status === 'suspended') {
    return res.status(403).json({ error: 'Action forbidden: Your account is currently suspended. Please submit an appeal via Support.' });
  }
  // Allow read-only (GET) requests so restricted/frozen users can view their orders and dashboard
  if (req.method === 'GET') {
    return next();
  }
  if (u.status === 'restricted') {
    return res.status(403).json({ error: 'Action forbidden: Your account privileges are restricted. Please contact support.' });
  }
  next();
}

export function requireFinancialActiveStatus(req: Request, res: Response, next: NextFunction) {
  const u = (req as any).authenticatedUser;
  if (!u) return res.status(401).json({ error: 'Authentication required.' });

  if (u.status === 'suspended') {
    return res.status(403).json({ error: 'Action forbidden: Your account is currently suspended. Please submit an appeal via Support.' });
  }
  if (u.status === 'restricted') {
    return res.status(403).json({ error: 'Action forbidden: Your account privileges are restricted. Please contact support.' });
  }
  if (u.status === 'frozen') {
    return res.status(403).json({ error: 'Action forbidden: Your account is frozen. Financial transactions are restricted.' });
  }
  next();
}

export const STAFF_ROLES = ['admin', 'super_admin', 'support'];
export function isStaffUser(user: any): boolean {
  return !!user && STAFF_ROLES.includes(user.role);
}

export function canAccessOrderWorkstream(user: any, order: { buyerId: string; sellerId: string } | undefined): boolean {
  if (!user || !order) return false;
  return isStaffUser(user) || user.id === order.buyerId || user.id === order.sellerId;
}

export function adminActor(req: Request): string {
  const authUser = (req as any).authenticatedUser;
  if (authUser) return `${authUser.name} (${authUser.role || 'admin'})`;
  return 'Administrator';
}

export function requireRole(allowedRoles: string[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if ((req as any).authDbError) {
      return res.status(503).json(formatApiError((req as any).authDbErrorObject, 'Authentication service temporarily unavailable. Please try again.'));
    }

    const authUserId = resolveAuthenticatedUserId(req);
    if (!authUserId) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    let u = (req as any).authenticatedUser;
    if (!u || u.id !== authUserId) {
      try {
        u = await store.getUser(authUserId);
      } catch (err) {
        return res.status(503).json(formatApiError(err, 'Authentication service temporarily unavailable. Please try again.'));
      }
    }
    if (!u) {
      return res.status(401).json({ error: 'User not found.' });
    }
    if (u.status && u.status !== 'active') {
      return res.status(403).json({ error: `Forbidden: Account is ${u.status}.` });
    }
    if (!allowedRoles.includes(u.role)) {
      return res.status(403).json({ error: 'Forbidden: Insufficient privileges.' });
    }
    (req as any).authenticatedUserId = u.id;
    (req as any).authenticatedUser = u;
    next();
  };
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if ((req as any).authDbError) {
    return res.status(503).json(formatApiError((req as any).authDbErrorObject, 'Authentication service temporarily unavailable. Please try again.'));
  }

  const authUserId = resolveAuthenticatedUserId(req);
  if (!authUserId) {
    return res.status(401).json({ error: 'Authentication required. Valid admin session missing.' });
  }
  let u = (req as any).authenticatedUser;
  if (!u || u.id !== authUserId) {
    try {
      u = await store.getUser(authUserId);
    } catch (err) {
      return res.status(503).json(formatApiError(err, 'Authentication service temporarily unavailable. Please try again.'));
    }
  }
  if (!u || (u.role !== 'super_admin' && u.role !== 'admin')) {
    return res.status(403).json({ error: 'Forbidden: Administrator privileges required.' });
  }
  if (u.status && u.status !== 'active') {
    return res.status(403).json({ error: `Forbidden: Admin account is ${u.status}.` });
  }
  (req as any).authenticatedUserId = u.id;
  (req as any).authenticatedUser = u;
  next();
}

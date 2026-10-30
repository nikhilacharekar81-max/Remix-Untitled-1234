import { IS_PRODUCTION } from './server/initEnv.js';
import express from 'express';
import fs from 'fs';
import { createServer } from 'http';
import { randomUUID } from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { initWebSocketServer } from './server/websocket.js';
import { runBackgroundJobs } from './server/jobs/backgroundJobs.js';
import { setupSSR } from './server/ssr.js';
import { slugify } from './src/utils/slugify.js';
import { postgresStore, assertProductionPostgresConfigured } from './server/db/postgresStore.js';
import { apiRouter } from './server/routes/index.js';
import { categories } from './server/routes/adminRoutes.js';
import { rootRouter } from './server/routes/rootRoutes.js';
import { siteSettings, DEFAULT_SITE_SETTINGS } from './src/server/siteSettings.js';
import { isGigPublic, sanitizePublicGig } from './server/publicData.js';
import { safeUser, assertProductionJwtSecret } from './server/middleware/auth.js';
import { assertProductionGatewayEncryptionKey } from './server/domains/finance/paymentGateways.js';
import {
  saveOrdersToDisk,
  hydrateStoreFromPostgres,
  users,
  gigs,
  orders,
  projects,
  proposals,
  reviews,
  messages,
  disputes,
  refunds,
  payouts,
  customInvoices,
  workstreamOffers,
  auditLogs
} from './server/store.js';
import {
  clearingEarnings,
  getUnclearedEarnings,
  releaseOrderFunds,
  refundOrderFunds,
  processAutoAcceptOrders,
  isAutoAcceptEnabled,
  getReviewWindowDays,
  registerOrder,
  orderIndex
} from './server/services/orderService.js';

// Backward compatibility exports for existing unit and regression tests
export {
  orders,
  users,
  gigs,
  projects,
  proposals,
  reviews,
  messages,
  disputes,
  refunds,
  payouts,
  customInvoices,
  workstreamOffers,
  auditLogs,
  categories,
  siteSettings,
  DEFAULT_SITE_SETTINGS,
  isGigPublic,
  sanitizePublicGig,
  safeUser,
  saveOrdersToDisk,
  clearingEarnings,
  getUnclearedEarnings,
  releaseOrderFunds,
  refundOrderFunds,
  processAutoAcceptOrders,
  isAutoAcceptEnabled,
  getReviewWindowDays,
  registerOrder,
  orderIndex
};

dotenv.config();

function safeDecodeURIComponent(str: string): string {
  try {
    return decodeURIComponent(str);
  } catch {
    return str;
  }
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export const app = express();
app.set('trust proxy', 1);

// Production detection (authoritative from ./server/initEnv.js)
export { IS_PRODUCTION };
const IS_PROD = IS_PRODUCTION;

if (IS_PROD) {
  (process.env as any).NODE_ENV = 'production';
  assertProductionJwtSecret();
  assertProductionGatewayEncryptionKey();
  assertProductionPostgresConfigured();
}

let isShuttingDown = false;

// Global Security Middleware
app.use((req, res, next) => {
  if (isShuttingDown) {
    res.setHeader('Connection', 'close');
    return res.status(503).json({ error: 'Server is shutting down. Please retry shortly.' });
  }
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  if (IS_PRODUCTION) res.setHeader('Strict-Transport-Security', 'max-age=15552000');
  (req as any).requestId = randomUUID();
  res.setHeader('X-Request-ID', (req as any).requestId);

  // Production error sanitizer: intercept 500 responses to sanitize error messages
  const originalJson = res.json.bind(res);
  res.json = function (body: any) {
    if (process.env.NODE_ENV === 'production' && res.statusCode >= 500) {
      if (body && typeof body === 'object') {
        return originalJson({ ...body, error: 'Internal server error' });
      }
      return originalJson({ error: 'Internal server error' });
    }
    return originalJson(body);
  };

  next();
});

// JSON Body Parser with raw body exemption for webhook endpoints
app.use((req, res, next) => {
  if ((req.path === '/api/payments/webhook' || req.path === '/api/webhooks/payment') && req.method === 'POST') {
    return next();
  }
  return express.json({ limit: '10mb' })(req, res, next);
});

let resolveStartupReady!: () => void;
const startupReadyPromise = new Promise<void>((resolve) => {
  resolveStartupReady = resolve;
});

// Gate requests until hydration and SSR middleware are registered
app.use(async (_req, _res, next) => {
  await startupReadyPromise;
  next();
});

// Mount Central API Router
app.use('/api', apiRouter);

// Register root routes (robots.txt, sitemap.xml)
app.use('/', rootRouter);

// Global Error Handler
app.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const status = Number(err?.status || err?.statusCode || 500);
  const isUriError = err instanceof URIError || err?.name === 'URIError' || (err?.message && String(err.message).includes('URI'));

  if (isUriError && !req.path?.startsWith('/api') && !req.originalUrl?.startsWith('/api')) {
    const clientDistHtml = path.resolve(__dirname, 'dist/client/index.html');
    const devHtml = path.resolve(__dirname, 'index.html');
    const htmlPath = fs.existsSync(clientDistHtml) ? clientDistHtml : devHtml;
    if (fs.existsSync(htmlPath)) {
      return res.status(200).setHeader('Content-Type', 'text/html').sendFile(htmlPath);
    }
  }

  console.error(`[Error] ${req.method} ${req.path}:`, err);
  if (process.env.NODE_ENV === 'production' && status >= 500) {
    return res.status(500).json({ error: 'Internal server error' });
  }
  return res.status(status).json({ error: err?.message || 'Internal server error' });
});


export const server = createServer(app);

// Initialize WebSocket Engine
initWebSocketServer(server);

const portArgIndex = process.argv.findIndex(arg => arg === '--port' || arg === '-p');
const cliPort = portArgIndex !== -1 && process.argv[portArgIndex + 1] ? Number(process.argv[portArgIndex + 1]) : null;
const PORT = cliPort || (process.env.PORT ? Number(process.env.PORT) : 3000);

process.on('unhandledRejection', (reason) => {
  console.error('[UnhandledRejection]', reason);
});

if (process.env.NODE_ENV !== 'test' && !server.listening) {
  server.on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`Port ${PORT} in use, selecting dynamic fallback port`);
      server.listen(0, '0.0.0.0');
    }
  });
  server.listen(Number(PORT), '0.0.0.0', () => {
    const actualPort = (server.address() as any)?.port || PORT;
    console.log(`WorkPerHour server running on http://0.0.0.0:${actualPort}`);
  });
}

// Application Startup & Hydration
(async () => {
  try {
    await hydrateStoreFromPostgres();
    runBackgroundJobs();
  } catch (err) {
    if (IS_PROD) {
      console.error('[FATAL] Postgres hydration failed; refusing to start:', err);
      process.exit(1);
    } else {
      console.warn('[DEV] Postgres hydration notice (continuing in dev mode):', err);
    }
  }

  try {
    await setupSSR(app, IS_PROD, __dirname, async (pathname?: string) => {
      try {
        const pool = postgresStore.getPool();
        const pathParts = (pathname || '').split('/').filter(Boolean).map(p => safeDecodeURIComponent(p));
        const candidateTokens = Array.from(new Set(pathParts.filter(p => p.length > 0 && p.length <= 120)));

        const [gigsRes, usersRes, projectsRes] = await Promise.all([
          candidateTokens.length > 0
            ? pool.query(
                `SELECT * FROM gigs
                 WHERE status IN ('active', 'published')
                   AND (id = ANY($1::text[]) OR LOWER(COALESCE(slug, '')) = ANY($2::text[]))
                 UNION
                 (SELECT * FROM gigs WHERE status IN ('active', 'published') ORDER BY created_at DESC NULLS LAST LIMIT 50)`,
                [candidateTokens, candidateTokens.map(t => t.toLowerCase())]
              )
            : pool.query("SELECT * FROM gigs WHERE status IN ('active', 'published') ORDER BY created_at DESC NULLS LAST LIMIT 50"),
          candidateTokens.length > 0
            ? pool.query(
                `SELECT id, name, username, role, avatar, title, rating, reviews_count, hourly_rate, earned, completed_jobs, bio, skills, status, verified, email_verified, mobile_verified, created_at, is_flagged, is_available_now
                 FROM users
                 WHERE status = 'active'
                   AND (id = ANY($1::text[]) OR LOWER(COALESCE(username, '')) = ANY($2::text[]))
                 UNION
                 (SELECT id, name, username, role, avatar, title, rating, reviews_count, hourly_rate, earned, completed_jobs, bio, skills, status, verified, email_verified, mobile_verified, created_at, is_flagged, is_available_now
                  FROM users WHERE status = 'active' ORDER BY created_at DESC NULLS LAST LIMIT 50)`,
                [candidateTokens, candidateTokens.map(t => t.toLowerCase())]
              )
            : pool.query(
                `SELECT id, name, username, role, avatar, title, rating, reviews_count, hourly_rate, earned, completed_jobs, bio, skills, status, verified, email_verified, mobile_verified, created_at, is_flagged, is_available_now
                 FROM users WHERE status = 'active' ORDER BY created_at DESC NULLS LAST LIMIT 50`
              ),
          candidateTokens.length > 0
            ? pool.query(
                `SELECT * FROM projects
                 WHERE status = 'open'
                   AND (id = ANY($1::text[]) OR LOWER(COALESCE(slug, '')) = ANY($2::text[]))
                 UNION
                 (SELECT * FROM projects WHERE status = 'open' ORDER BY created_at DESC NULLS LAST LIMIT 50)`,
                [candidateTokens, candidateTokens.map(t => t.toLowerCase())]
              )
            : pool.query("SELECT * FROM projects WHERE status = 'open' ORDER BY created_at DESC NULLS LAST LIMIT 50")
        ]);
        
        const gigs = gigsRes.rows.map(r => ({
            id: r.id,
            freelancerId: r.freelancer_id,
            freelancerName: r.freelancer_name,
            freelancerUsername: r.freelancer_username || r.freelancer_name?.toLowerCase().replace(/\s+/g, '_'),
            freelancerAvatar: r.freelancer_avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80',
            freelancerLevel: r.freelancer_level || 'Level 1 ★',
            title: r.title,
            slug: r.slug || r.title?.toLowerCase().trim().replace(/[^\w\s-]/g, '').replace(/[\s_-]+/g, '-').replace(/^-+|-+$/g, ''),
            category: r.category,
            subcategory: r.subcategory || 'General',
            description: r.description,
            price: Number(r.price),
            deliveryDays: Number(r.delivery_days || 7),
            rating: Number(r.rating || 5.0),
            reviewsCount: Number(r.reviews_count || 0),
            image: r.image || 'https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=800&h=500&fit=crop',
            coverImage: r.cover_image || '',
            gallery: r.gallery || [],
            tags: r.tags || [],
            status: r.status === 'published' ? 'active' : (r.status || 'active'),
            moderationStatus: r.moderation_status || 'approved',
            createdAt: r.created_at,
            extras: r.extras || []
          }));

        const users = usersRes.rows.map(r => ({
            id: r.id,
            name: r.name,
            username: r.username,
            role: r.role,
            avatar: r.avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80',
            title: r.title || '',
            rating: Number(r.rating || 5.0),
            reviewsCount: Number(r.reviews_count || 0),
            hourlyRate: Number(r.hourly_rate || 0),
            earned: Number(r.earned || 0),
            completedJobs: Number(r.completed_jobs || 0),
            bio: r.bio || '',
            skills: r.skills || [],
            status: r.status,
            verified: Boolean(r.verified),
            emailVerified: Boolean(r.email_verified),
            mobileVerified: Boolean(r.mobile_verified),
            createdAt: r.created_at,
            isFlagged: Boolean(r.is_flagged),
            isAvailableNow: Boolean(r.is_available_now)
          }));

        const projects = projectsRes.rows.map(r => ({
            id: r.id,
            buyerId: r.buyer_id,
            buyerName: r.buyer_name,
            buyerAvatar: r.buyer_avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80',
            title: r.title,
            slug: r.slug || r.title?.toLowerCase().trim().replace(/[^\w\s-]/g, '').replace(/[\s_-]+/g, '-').replace(/^-+|-+$/g, ''),
            description: r.description,
            category: r.category,
            budgetType: r.budget_type,
            budget: Number(r.budget),
            budgetMin: Number(r.budget_min),
            budgetMax: Number(r.budget_max),
            deadlineDays: Number(r.deadline_days),
            duration: r.duration,
            status: r.status,
            proposalsCount: Number(r.proposals_count || 0),
            skills: r.skills || [],
            createdAt: r.created_at,
            acceptedProposalId: r.accepted_proposal_id || undefined
          }));
        
        return { gigs, users, projects, categories };
      } catch (err) {
        console.error('[SSR] Error fetching data for SSR:', err);
        return { gigs: [], users: [], projects: [], categories };
      }
    });
  } catch (ssrSetupErr) {
    console.error('[SSR Setup Error]', ssrSetupErr);
  } finally {
    resolveStartupReady();
  }
})();

// Graceful shutdown
import { stopOutboxProcessor } from './server/services/outboxService.js';
import { clients } from './server/websocket.js';

let shutdownInitiated = false;
async function gracefulShutdown(signal: string) {
  if (shutdownInitiated) return;
  shutdownInitiated = true;
  isShuttingDown = true;
  console.log(`Received ${signal}. Initiating graceful shutdown...`);
  
  stopOutboxProcessor();

  for (const client of clients) {
    try { client.close(1001, 'Server shutting down'); } catch {}
  }

  // 1. Stop accepting new HTTP requests
  server.close(async () => {
    console.log('HTTP server closed.');
    
    // 2. Flush pending writes
    try {
      await postgresStore.flushAll();
      console.log('Pending writes flushed.');
    } catch (err) {
      console.error('Error flushing pending writes:', err);
    }

    // 3. Close DB connections
    try {
      await postgresStore.getPool().end();
      console.log('Postgres pool closed.');
    } catch (err) {
      console.error('Error closing Postgres pool:', err);
    }
    
    process.exit(0);
  });
  
  // Force exit after 10s if not shut down
  setTimeout(() => {
    console.error('Shutdown timeout, forcing exit.');
    process.exit(1);
  }, 10000);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

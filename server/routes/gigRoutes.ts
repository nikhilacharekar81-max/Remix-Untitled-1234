/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { postgresStore } from '../db/postgresStore.js';
import { store } from '../store.js';
import { isGigPublic, sanitizePublicGig } from '../publicData.js';
import {
  requireAuth,
  requireActiveStatus,
  requireAdmin,
  adminActor,
  resolveAuthenticatedUserId,
  isStaffUser,
  escapeHtml
} from '../middleware/auth.js';
import { siteSettings } from '../../src/server/siteSettings.js';
import { financialTransactionService } from '../services/financialService.js';
import { registerAuditLog } from '../services/orderService.js';
import { diagnosticService } from '../services/diagnosticService.js';
import type { Gig } from '../../src/types.js';

export const gigRouter = Router();

export function parseAndValidateExtraDeliveryDays(rawDays: any): { valid: boolean; value: number; error?: string } {
  if (rawDays === undefined || rawDays === '') {
    return { valid: true, value: 0 };
  }

  if (typeof rawDays === 'string' && rawDays.trim() === '') {
    return { valid: true, value: 0 };
  }

  if (typeof rawDays === 'boolean' || rawDays === null || typeof rawDays === 'object') {
    return {
      valid: false,
      value: 0,
      error: 'Extra delivery days must be a whole number between 0 and 365.'
    };
  }

  const num = Number(rawDays);

  if (!Number.isFinite(num) || !Number.isInteger(num)) {
    return {
      valid: false,
      value: 0,
      error: 'Extra delivery days must be a whole number between 0 and 365.'
    };
  }

  if (num < 0 || num > 365) {
    return {
      valid: false,
      value: 0,
      error: 'Extra delivery days must be a whole number between 0 and 365.'
    };
  }

  return { valid: true, value: num };
}

// Public gigs list
gigRouter.get('/gigs', async (req: Request, res: Response) => {
  try {
    const rawGigs = await store.listGigs();
    const publicGigs = rawGigs.filter(isGigPublic).map(sanitizePublicGig);
    res.json(publicGigs);
  } catch (err) {
    console.error('[GET /gigs] Error:', err);
    res.status(500).json({ error: 'Failed to fetch gigs' });
  }
});

// Single Gig Detail
gigRouter.get('/gigs/:id', async (req: Request, res: Response) => {
  try {
    const gig = await store.getGig(req.params.id);
    if (!gig) return res.status(404).json({ error: 'Gig not found' });

    const authUserId = resolveAuthenticatedUserId(req);
    const user = authUserId ? await store.getUser(authUserId) : null;
    const isAdmin = isStaffUser(user);
    const isOwner = authUserId && gig.freelancerId === authUserId;

    if (isGigPublic(gig)) {
      if (isAdmin || isOwner) return res.json(gig);
      return res.json(sanitizePublicGig(gig));
    }

    if (isAdmin || isOwner) {
      return res.json(gig);
    }
    return res.status(404).json({ error: 'Gig not found or unavailable' });
  } catch (err) {
    console.error('[GET /gigs/:id] Error:', err);
    res.status(500).json({ error: 'Failed to fetch gig detail' });
  }
});

// Authenticated Owner Listings
gigRouter.get('/my/gigs', requireAuth, async (req: Request, res: Response) => {
  try {
    const authUserId = (req as any).authenticatedUserId;
    const myGigs = await store.listGigsForFreelancer(authUserId);
    res.json(myGigs);
  } catch (err) {
    console.error('[GET /my/gigs] Error:', err);
    res.status(500).json({ error: 'Failed to fetch user gigs' });
  }
});

// Create Gig
gigRouter.post('/gigs', requireAuth, requireActiveStatus, async (req: Request, res: Response) => {
  const caller = (req as any).authenticatedUser;
  if (caller.status === 'restricted') return res.status(403).json({ error: 'Restricted: You cannot post new services while your account is restricted.' });

  const activeSettings = siteSettings.getSettings();

  const gigPrice = Number(req.body.price);
  if (!Number.isFinite(gigPrice)) return res.status(400).json({ error: 'Gig price must be a valid number.' });
  const minGigPrice = activeSettings.marketplace.minimumGigPrice ?? 1;
  const maxGigPrice = activeSettings.marketplace.maximumGigPrice ?? 10000;
  if (gigPrice < minGigPrice) {
    return res.status(400).json({ error: `Gig price ($${gigPrice}) cannot be lower than the platform minimum of $${minGigPrice}.` });
  }
  if (gigPrice > maxGigPrice) {
    return res.status(400).json({ error: `Gig price ($${gigPrice}) cannot exceed the platform maximum of $${maxGigPrice}.` });
  }

  // Validate package tiers
  if (req.body.packages && typeof req.body.packages === 'object') {
    for (const tier of ['basic', 'standard', 'premium']) {
      if (req.body.packages[tier]) {
        const p = Number(req.body.packages[tier].price);
        if (!Number.isFinite(p) || p < minGigPrice) {
          return res.status(400).json({ error: `Package tier '${tier}' price ($${p}) must be a valid number >= $${minGigPrice}.` });
        }
      }
    }
  }
  if (Array.isArray(req.body.tiers)) {
    for (const tier of req.body.tiers) {
      if (tier && tier.price !== undefined) {
        const p = Number(tier.price);
        if (!Number.isFinite(p) || p < minGigPrice) {
          return res.status(400).json({ error: `Package tier price must be >= $${minGigPrice}.` });
        }
      }
    }
  }

  const deliveryDays = Math.min(365, Math.max(1, Math.round(Number(req.body.deliveryDays)) || 7));
  const category = typeof req.body.category === 'string' ? req.body.category.trim().slice(0, 100) || 'Development & IT' : 'Development & IT';
  const subcategory = typeof req.body.subcategory === 'string' ? req.body.subcategory.trim().slice(0, 100) || 'General' : 'General';
  const rawImage = req.body.image;
  const defaultImage = 'https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=800&h=500&fit=crop';
  const image = (typeof rawImage === 'string' && !/^\s*(javascript:|vbscript:|data:(?!image\/))/i.test(rawImage)) ? rawImage : defaultImage;
  let extras: { id: string; title: string; price: number; deliveryDays: number }[] = [];
  if (Array.isArray(req.body.extras)) {
    const rawExtras = req.body.extras.slice(0, 20);
    for (let idx = 0; idx < rawExtras.length; idx++) {
      const ex = rawExtras[idx];
      const rawDays = ex?.deliveryDays !== undefined ? ex.deliveryDays : ex?.delivery_days;
      const daysCheck = parseAndValidateExtraDeliveryDays(rawDays);
      if (!daysCheck.valid) {
        return res.status(400).json({ error: daysCheck.error || 'Extra delivery days must be a whole number between 0 and 365.' });
      }
      extras.push({
        id: String(ex?.id || `extra_${Date.now()}_${idx}_${randomUUID().slice(0, 6)}`),
        title: String(ex?.title || '').slice(0, 200),
        price: Math.round(Math.min(100000, Math.max(0, Number(ex?.price) || 0)) * 100) / 100,
        deliveryDays: daysCheck.value
      });
    }
  }

  const initialStatus = activeSettings.marketplace.gigModerationRequired ? 'moderation' : 'active';

  const newGig: Gig = {
    id: 'gig_' + Date.now() + '_' + randomUUID().slice(0, 8),
    freelancerId: caller.id,
    freelancerName: caller.name,
    freelancerUsername: caller.username || caller.name.toLowerCase().replace(/\s+/g, '_'),
    freelancerAvatar: caller.avatar,
    freelancerLevel: 'Level 1 ★',
    title: String(req.body.title || 'Untitled Gig').trim().slice(0, 300),
    slug: req.body.title ? String(req.body.title).toLowerCase().trim().replace(/[^\w\s-]/g, '').replace(/[\s_-]+/g, '-').replace(/^-+|-+$/g, '') : 'custom-gig',
    category,
    subcategory,
    description: String(req.body.description || '').trim(),
    price: gigPrice,
    deliveryDays,
    rating: 0,
    reviewsCount: 0,
    image,
    status: initialStatus,
    featured: false,
    isFeatured: false,
    featuredUntil: undefined,
    featured_until: undefined,
    isUrgent: false,
    packages: req.body.packages || undefined,
    extras,
    moderationStatus: activeSettings.marketplace.gigModerationRequired ? 'pending' : 'approved'
  } as any;

  try {
    await store.saveGig(newGig);
    res.json(newGig);
  } catch (err) {
    console.error('[CreateGig] Failed to persist to PostgreSQL:', err);
    res.status(500).json({ error: 'Could not save gig. Please try again.' });
  }
});

// Update Gig
const handleGigUpdate = async (req: Request, res: Response) => {
  const caller = (req as any).authenticatedUser;
  try {
    const g = await store.getGig(req.params.id);
    if (!g) return res.status(404).json({ error: 'Gig/Service not found' });

    if (g.freelancerId !== caller.id) {
      return res.status(403).json({ error: 'Forbidden: You can only edit your own gigs.' });
    }

    if (g.status === 'deleted') {
      return res.status(400).json({ error: 'Deleted gigs cannot be edited or restored.' });
    }

    const updates: Record<string, any> = {};

    if (req.body.title !== undefined) {
      const newTitle = String(req.body.title).trim().slice(0, 300);
      updates.title = newTitle;
      const candidateSlug = newTitle.toLowerCase().replace(/[^\w\s-]/g, '').replace(/[\s_-]+/g, '-').replace(/^-+|-+$/g, '') || `gig-${g.id}`;
      if (candidateSlug !== g.slug) {
        updates.slug = candidateSlug;
      }
    }
    if (req.body.category !== undefined && typeof req.body.category === 'string') {
      updates.category = req.body.category.trim().slice(0, 100);
    }
    if (req.body.subcategory !== undefined && typeof req.body.subcategory === 'string') {
      updates.subcategory = req.body.subcategory.trim().slice(0, 100);
    }
    if (req.body.description !== undefined) {
      updates.description = String(req.body.description).trim();
    }
    if (req.body.price !== undefined) {
      const newPrice = Number(req.body.price);
      if (!Number.isFinite(newPrice)) return res.status(400).json({ error: 'Gig price must be a valid number.' });
      const activeSettings = siteSettings.getSettings();
      const minGigPrice = activeSettings.marketplace.minimumGigPrice ?? 1;
      const maxGigPrice = activeSettings.marketplace.maximumGigPrice ?? 10000;
      if (newPrice < minGigPrice) {
        return res.status(400).json({ error: `Gig price ($${newPrice}) cannot be lower than the platform minimum of $${minGigPrice}.` });
      }
      if (newPrice > maxGigPrice) {
        return res.status(400).json({ error: `Gig price ($${newPrice}) cannot exceed the platform maximum of $${maxGigPrice}.` });
      }
      updates.price = newPrice;
    }
    if (req.body.deliveryDays !== undefined) {
      updates.deliveryDays = Math.min(365, Math.max(1, Math.round(Number(req.body.deliveryDays)) || 7));
    }
    if (req.body.packages !== undefined && typeof req.body.packages === 'object') {
      const activeSettings = siteSettings.getSettings();
      const minGigPrice = activeSettings.marketplace.minimumGigPrice ?? 1;
      for (const tier of ['basic', 'standard', 'premium']) {
        if (req.body.packages[tier]) {
          const p = Number(req.body.packages[tier].price);
          if (!Number.isFinite(p) || p < minGigPrice) {
            return res.status(400).json({ error: `Package tier '${tier}' price ($${p}) must be a valid number >= $${minGigPrice}.` });
          }
        }
      }
      updates.packages = req.body.packages;
    }
    if (req.body.extras !== undefined && Array.isArray(req.body.extras)) {
      const parsedExtras: { id: string; title: string; price: number; deliveryDays: number }[] = [];
      const rawExtras = req.body.extras.slice(0, 20);
      for (let idx = 0; idx < rawExtras.length; idx++) {
        const ex = rawExtras[idx];
        const rawDays = ex?.deliveryDays !== undefined ? ex.deliveryDays : ex?.delivery_days;
        const daysCheck = parseAndValidateExtraDeliveryDays(rawDays);
        if (!daysCheck.valid) {
          return res.status(400).json({ error: daysCheck.error || 'Extra delivery days must be a whole number between 0 and 365.' });
        }
        parsedExtras.push({
          id: String(ex?.id || `extra_${Date.now()}_${idx}_${randomUUID().slice(0, 6)}`),
          title: String(ex?.title || '').slice(0, 200),
          price: Math.round(Math.min(100000, Math.max(0, Number(ex?.price) || 0)) * 100) / 100,
          deliveryDays: daysCheck.value
        });
      }
      updates.extras = parsedExtras;
    }
    if (req.body.image !== undefined && typeof req.body.image === 'string') {
      const defaultImage = 'https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=800&h=500&fit=crop';
      updates.image = /^\s*(javascript:|vbscript:|data:(?!image\/))/i.test(req.body.image) ? defaultImage : req.body.image;
    }

    const activeSettings = siteSettings.getSettings();
    const isMaterialEdit = (updates.title !== undefined && updates.title !== g.title) ||
      (updates.description !== undefined && updates.description !== g.description) ||
      (updates.image !== undefined && updates.image !== g.image) ||
      (updates.price !== undefined && updates.price !== g.price);

    if (req.body.status !== undefined) {
      const requestedStatus = String(req.body.status).toLowerCase().trim();
      if (!['active', 'paused', 'deleted'].includes(requestedStatus)) {
        return res.status(400).json({ error: 'Invalid status. Sellers can only set status to active, paused, or deleted.' });
      }

      if (requestedStatus === 'active') {
        if (g.moderationStatus === 'rejected' || g.moderationStatus === 'flagged') {
          return res.status(400).json({ error: 'This gig has been rejected or flagged by moderators and cannot be activated until reviewed and approved by an administrator.' });
        }

        if (activeSettings.marketplace?.gigModerationRequired && g.moderationStatus !== 'approved') {
          updates.status = 'moderation';
          updates.moderationStatus = 'pending';
        } else {
          updates.status = 'active';
        }
      } else if (requestedStatus === 'paused') {
        updates.status = 'paused';
      } else if (requestedStatus === 'deleted') {
        updates.status = 'deleted';
      }
    } else if (isMaterialEdit && activeSettings.marketplace?.gigModerationRequired) {
      updates.moderationStatus = 'pending';
      if (g.status === 'active') {
        updates.status = 'moderation';
      }
    }

    const updatedGig = await store.updateGig(g.id, updates, caller.id);

    if (!updatedGig) {
      return res.status(404).json({ error: 'Gig not found or cannot be updated.' });
    }

    await registerAuditLog({
      id: 'log_' + Date.now() + '_' + randomUUID().slice(0, 8),
      actor: caller.name,
      role: caller.role,
      action: 'GIG_UPDATED',
      target: `Gig "${updatedGig.title}"`,
      details: `Updated gig fields: ${Object.keys(updates).join(', ')}`,
      timestamp: new Date().toLocaleString()
    });

    res.json(updatedGig);
  } catch (err) {
    console.error('[UpdateGig] Error:', err);
    res.status(500).json({ error: 'Failed to update gig' });
  }
};

gigRouter.patch('/gigs/:id', requireAuth, requireActiveStatus, handleGigUpdate);
gigRouter.put('/gigs/:id', requireAuth, requireActiveStatus, handleGigUpdate);

// Delete Gig
gigRouter.delete('/gigs/:id', requireAuth, requireActiveStatus, async (req: Request, res: Response) => {
  const caller = (req as any).authenticatedUser;
  try {
    const g = await store.getGig(req.params.id);
    if (!g) return res.status(404).json({ error: 'Gig/Service not found' });

    if (g.freelancerId !== caller.id) {
      return res.status(403).json({ error: 'Forbidden: You can only delete your own gigs.' });
    }

    await store.deleteGig(req.params.id);

    await registerAuditLog({
      id: 'log_' + Date.now() + '_' + randomUUID().slice(0, 8),
      actor: caller.name,
      role: caller.role,
      action: 'GIG_DELETED',
      target: `Gig "${g.title}"`,
      details: `Soft-deleted freelancer gig #${g.id} by ${g.freelancerName} (status set to "deleted")`,
      timestamp: new Date().toLocaleString()
    });

    res.json({ success: true, id: g.id });
  } catch (err) {
    console.error('[DeleteGig] Error:', err);
    res.status(500).json({ error: 'Failed to delete gig' });
  }
});

// Feature Gig
gigRouter.patch('/gigs/:id/feature', requireAuth, requireActiveStatus, async (req: Request, res: Response) => {
  const caller = (req as any).authenticatedUser;
  try {
    const activeSettings = siteSettings.getSettings();
    const fee = activeSettings.marketplace.featuredGigFee;
    if (!fee || fee <= 0) {
      return res.status(500).json({ error: 'Feature fee is not configured.' });
    }

    const callerIdempKey = (
      req.headers['idempotency-key'] ||
      req.headers['x-idempotency-key'] ||
      req.body?.idempotencyKey ||
      req.body?.requestKey
    ) as string | undefined;
    const trimmedIdempKey = callerIdempKey && String(callerIdempKey).trim() ? String(callerIdempKey).trim() : undefined;

    const callerOpId = (
      req.body?.operationId ||
      req.headers['x-request-id'] ||
      (req as any).requestId
    ) as string | undefined;
    const trimmedOpId = callerOpId && String(callerOpId).trim() ? String(callerOpId).trim() : undefined;

    const result = await financialTransactionService.chargeFeaturedGigFee({
      gigId: req.params.id,
      sellerId: caller.id,
      feeAmount: fee,
      extensionDays: 7,
      actor: `user:${caller.id}`,
      idempotencyKey: trimmedIdempKey,
      operationId: trimmedOpId
    });

    res.json(result);
  } catch (err: any) {
    console.error('[FeatureGig] Error:', err);
    res.status(500).json({ error: err.message || 'Failed to feature gig' });
  }
});

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { UserAccount, Gig, Project } from '../src/types.js';

const EXCLUDED_STAFF_ROLES = ['admin', 'super_admin', 'support', 'moderator', 'staff', 'internal'];

export function isUserPublic(u: any): boolean {
  if (!u || typeof u !== 'object') return false;

  // Must have active status
  const status = typeof u.status === 'string' ? u.status.trim().toLowerCase() : '';
  if (status !== 'active') return false;

  // Exclude flagged users
  if (u.isFlagged === true || u.flagged === true) return false;

  // Exclude admin, super_admin, support, and other internal/staff roles
  const role = typeof u.role === 'string' ? u.role.trim().toLowerCase() : '';
  if (EXCLUDED_STAFF_ROLES.includes(role)) return false;

  return true;
}

export function sanitizePublicUser(user: any) {
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    role: user.role,
    title: user.title,
    bio: user.bio,
    avatar: user.avatar,
    rating: user.rating,
    reviewsCount: user.reviewsCount,
    reviews: user.reviews,
    completedJobs: user.completedJobs,
    hourlyRate: user.hourlyRate,
    skills: user.skills,
    verified: user.verified,
    isVerified: user.isVerified ?? user.verified,
    sellerLevel: user.sellerLevel,
    portfolio: user.portfolio,
    status: user.status,
    createdAt: user.createdAt,
    location: user.location,
    countryFlag: user.countryFlag,
    responseTime: user.responseTime,
    category: user.category,
    subcategory: user.subcategory,
    languages: user.languages,
    certifications: user.certifications,
    isAvailableNow: user.isAvailableNow
  };
}

export function isGigPublic(g: Gig): boolean {
  if (!g) return false;
  const status = (g.status || '').toLowerCase();
  if (status !== 'active') return false;
  const modStatus = (g.moderationStatus || '').toLowerCase();
  if (modStatus && modStatus !== 'approved') return false;
  return true;
}

export function sanitizePublicGig(g: Gig) {
  const { moderationStatus, moderationNotes, ...publicGig } = g;
  const featuredUntil = (publicGig as any).featuredUntil || (publicGig as any).featured_until;
  const isFeaturedActive = Boolean(
    (publicGig.featured || (publicGig as any).isFeatured) &&
    featuredUntil &&
    new Date(featuredUntil).getTime() > Date.now()
  );

  return {
    ...publicGig,
    featured: isFeaturedActive,
    isFeatured: isFeaturedActive,
    featuredUntil: isFeaturedActive ? featuredUntil : null,
    featured_until: isFeaturedActive ? featuredUntil : null
  };
}

const PUBLIC_PROJECT_STATUSES = new Set(['open', 'published', 'in_progress']);

export function isProjectPublic(p: Project): boolean {
  if (!p || typeof p !== 'object') return false;
  const status = (p.status || '').toLowerCase();
  if (!PUBLIC_PROJECT_STATUSES.has(status)) return false;

  const modStatus = (p.moderationStatus || '').toLowerCase();
  if (modStatus === 'pending' || modStatus === 'rejected' || modStatus === 'flagged') return false;

  return true;
}

export function sanitizePublicProject(p: Project) {
  const { moderationStatus, moderationNotes, ...publicProject } = p;
  return publicProject;
}

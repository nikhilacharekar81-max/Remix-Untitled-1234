/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export const PRIVATE_ROUTES = [
  'admin', 'messages', 'workstream', 'workstreams', 'workspace', 'orders', 'payments', 
  'wallet', 'settings', 'edit-profile', 'login', 'signup', 'forgot-password', 'verify', 
  'wishlist', 'notifications', 'switch-user', 'post-project', 'create-gig', 'support', 'freelancer', 'freelance-activity', 'buyer-activity'
];

export const RESERVED_ROUTES = [
  ...PRIVATE_ROUTES,
  'gigs', 'projects', 'search-projects', 'project-search', 'freelance-jobs', 'categories', 'freelancers', 'search-freelancers', 'freelancer-search', 'profile'
];

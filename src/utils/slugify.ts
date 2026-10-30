/** Converts text into a URL-safe slug (lowercase, hyphen-separated). */
export const slugify = (text?: string | null): string =>
  String(text || '')
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');

/** Constructs canonical Gig URL: /:username/:slug */
export const getGigUrl = (gig: any): string => {
  if (!gig) return '/gigs';
  const username = slugify(gig.freelancerUsername || gig.freelancerName || 'freelancer');
  const gigSlug = slugify(gig.slug || gig.title || gig.id || 'gig');
  return `/${username}/${gigSlug}`;
};

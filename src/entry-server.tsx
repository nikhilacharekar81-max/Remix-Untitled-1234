/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { renderToString } from 'react-dom/server';
import App from './App.tsx';
import { slugify } from './utils/slugify.js';

function escapeHtml(text: string): string {
  if (typeof text !== 'string') return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function render(url: string, initialData?: any) {
  const html = renderToString(<App initialPath={url} initialData={initialData} />);
  
  let headTags: string[] = [];
  const pageType = initialData?.pageType;
  const gig = initialData?.gig;
  const profileUser = initialData?.profileUser;
  const notFound = initialData?.notFound;
  const isPrivate = initialData?.isPrivate;

  const baseUrl = 'https://workperhour.com';
  const canonical = `${baseUrl}${url.split('?')[0]}`;

  // Robots
  if (notFound || isPrivate || pageType === 'private') {
    headTags.push('<meta name="robots" content="noindex, nofollow" />');
  } else {
    headTags.push('<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" />');
  }

  // Title & Description
  if (notFound) {
    headTags.push('<title>Page Not Found | Work Per Hour</title>');
    headTags.push('<meta name="description" content="The requested page could not be found." />');
  } else if (isPrivate || pageType === 'private') {
    headTags.push('<title>Work Per Hour | Platform</title>');
    headTags.push('<meta name="description" content="Secure Work Per Hour member area." />');
  } else if (gig) {
    const title = `${escapeHtml(gig.title)} | Work Per Hour`;
    headTags.push(`<title>${title}</title>`);
    headTags.push(`<meta name="description" content="${escapeHtml((gig.description || '').slice(0, 160))}" />`);
    
    // JSON-LD
    const jsonLd = {
      "@context": "https://schema.org",
      "@type": "Service",
      "name": gig.title,
      "description": gig.description,
      "provider": { "@type": "Person", "name": gig.freelancerName },
      "offers": { "@type": "Offer", "price": gig.price, "priceCurrency": "USD" }
    };
    if (gig.reviewsCount > 0 && gig.rating) {
      (jsonLd as any).aggregateRating = { "@type": "AggregateRating", "ratingValue": gig.rating, "reviewCount": gig.reviewsCount };
    }
    headTags.push(`<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>`);
  } else if (profileUser) {
    headTags.push(`<title>${escapeHtml(profileUser.name)} - ${escapeHtml(profileUser.title)} | Work Per Hour</title>`);
    headTags.push(`<meta name="description" content="${escapeHtml((profileUser.bio || '').slice(0, 160))}" />`);
  } else if (pageType === 'gigs') {
    headTags.push('<title>Freelance Services & Gigs | Work Per Hour</title>');
    headTags.push('<meta name="description" content="Browse and hire top freelance talent." />');
    if (initialData?.gigs) {
      const itemList = {
        "@context": "https://schema.org",
        "@type": "ItemList",
        "itemListElement": initialData.gigs.map((g: any, i: number) => ({
          "@type": "ListItem", "position": i + 1, "url": `${baseUrl}/${(g.freelancerUsername || slugify(g.freelancerName)).toLowerCase()}/${(g.slug || slugify(g.title)).toLowerCase()}`
        }))
      };
      headTags.push(`<script type="application/ld+json">${JSON.stringify(itemList).replace(/</g, '\\u003c')}</script>`);
    }
  } else if (pageType === 'projects') {
    headTags.push('<title>Browse Freelance Projects & Jobs | Work Per Hour</title>');
    headTags.push('<meta name="description" content="Find freelance projects and jobs." />');
  } else if (pageType === 'freelancers') {
    headTags.push('<title>Top Freelancers & Experts | Work Per Hour</title>');
    headTags.push('<meta name="description" content="Discover and hire verified freelance professionals." />');
  } else {
    headTags.push('<title>Work Per Hour | Freelance Marketplace</title>');
    headTags.push('<meta name="description" content="A feature-rich freelance marketplace." />');
  }

  headTags.push(`<link rel="canonical" href="${canonical}" />`);

  return { html, head: headTags.join('\n') };
}

import { Router, Request, Response } from 'express';
import { store } from '../store.js';
import { isGigPublic } from '../publicData.js';
import { slugify } from '../../src/utils/slugify.js';

export const rootRouter = Router();

rootRouter.get('/robots.txt', (_req, res) => {
  res.type('text/plain').send(
    `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /admin/\nDisallow: /workstream/\nDisallow: /checkout/\nDisallow: /payouts/\n\nSitemap: https://workperhour.com/sitemap.xml\n`
  );
});

rootRouter.get('/sitemap.xml', async (_req, res) => {
  try {
    const baseUrl = 'https://workperhour.com';
    const rawGigs = await store.listGigs();
    const gigs = rawGigs.filter(isGigPublic);
    const urls = [
      `${baseUrl}/`,
      `${baseUrl}/gigs`,
      `${baseUrl}/projects`,
      `${baseUrl}/freelancers`,
      ...gigs.map((g) => {
        const uname = (g.freelancerUsername || slugify(g.freelancerName || '')).toLowerCase();
        const gslug = (g.slug || slugify(g.title || '')).toLowerCase();
        return `${baseUrl}/${uname}/${gslug}`;
      })
    ];
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
      urls.map(u => `  <url><loc>${u}</loc><changefreq>weekly</changefreq></url>`).join('\n') +
      `\n</urlset>`;
    res.type('application/xml').send(xml);
  } catch (err) {
    res.status(500).send('Error generating sitemap');
  }
});


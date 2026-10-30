/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import fs from 'fs';
import path from 'path';
import type { Express, Request, Response } from 'express';
import { isGigPublic, sanitizePublicGig, isUserPublic, sanitizePublicUser, isProjectPublic, sanitizePublicProject } from './publicData.js';
import { slugify } from '../src/utils/slugify.js';
import { PRIVATE_ROUTES, RESERVED_ROUTES } from '../src/shared/routes.js';

function safeDecodeURIComponent(str: string): string {
  try {
    return decodeURIComponent(str);
  } catch {
    return str;
  }
}

function getGigUrl(gig: any) {
  const uname = (gig.freelancerUsername || slugify(gig.freelancerName)).toLowerCase();
  const gslug = (gig.slug || slugify(gig.title)).toLowerCase();
  return `/${uname}/${gslug}`;
}

export async function setupSSR(
  app: Express,
  isProd: boolean,
  root: string,
  getData: (pathname?: string) => Promise<{ gigs: any[]; users: any[]; projects: any[]; categories: any[] }> | { gigs: any[]; users: any[]; projects: any[]; categories: any[] }
) {
  let vite: any;
  let templateHtml: string = '';
  let ssrRender: any;

  const distPath = path.resolve(root, 'dist');
  const clientDist = path.resolve(distPath, 'client');
  const serverDist = path.resolve(distPath, 'server');
  const hasProdBuild = isProd && fs.existsSync(path.resolve(clientDist, 'index.html'));
  const isTest = process.env.NODE_ENV === 'test';

  if (isTest) {
    templateHtml = fs.readFileSync(path.resolve(root, 'index.html'), 'utf-8');
    const mod = await import('../src/entry-server.tsx');
    ssrRender = mod.render;
  } else if (!hasProdBuild) {
    const { createServer } = await import('vite');
    vite = await createServer({
      root,
      server: {
        middlewareMode: true,
        hmr: false,
        watch: null
      },
      appType: 'custom'
    });
    app.use(vite.middlewares);
    templateHtml = fs.readFileSync(path.resolve(root, 'index.html'), 'utf-8');

    // Load SSR entry module in background
    vite.ssrLoadModule('/src/entry-server.tsx').then((mod: any) => {
      ssrRender = mod.render;
    }).catch((err: any) => {
      console.warn('Vite SSR module load warning:', err);
    });
  } else {
    app.use(express.static(clientDist, { index: false }));
    templateHtml = fs.readFileSync(path.resolve(clientDist, 'index.html'), 'utf-8');

    if (fs.existsSync(serverDist)) {
      const serverEntryFiles = fs.readdirSync(serverDist);
      const entryFile = serverEntryFiles.find(f => f.startsWith('entry-server') || f.endsWith('.js'));
      if (entryFile) {
        const ssrModule = await import(path.resolve(serverDist, entryFile));
        ssrRender = ssrModule.render;
      }
    }
  }

  // Single SSR Flow: Express gets request -> loads current PUBLIC data -> React SSR renders full HTML
  app.use('*', async (req: Request, res: Response, next) => {
    if (req.originalUrl.startsWith('/api')) {
      return next();
    }

    let rawPathname = req.originalUrl.split('?')[0];
    let pathname = safeDecodeURIComponent(rawPathname);
    if (pathname.endsWith('/index.html')) {
      pathname = pathname.slice(0, -11) || '/';
    } else if (pathname.endsWith('.html')) {
      pathname = pathname.slice(0, -5) || '/';
    }

    const ext = path.extname(pathname);
    const accept = req.headers.accept || '';
    const secFetchDest = req.headers['sec-fetch-dest'] || '';

    const isViteOrAssetPath =
      pathname.startsWith('/@vite') ||
      pathname.startsWith('/@id') ||
      pathname.startsWith('/@fs') ||
      pathname.startsWith('/@react-refresh') ||
      pathname.startsWith('/node_modules') ||
      pathname.startsWith('/src') ||
      (Boolean(ext) && ext !== '.html');

    const isNonHtmlAccept =
      Boolean(accept) &&
      !accept.includes('text/html') &&
      !accept.includes('*/*');

    const isSubresourceFetch =
      secFetchDest !== '' && secFetchDest !== 'document' && secFetchDest !== 'iframe' && secFetchDest !== 'empty';

    if (!isProd && (isViteOrAssetPath || isNonHtmlAccept || isSubresourceFetch)) {
      return next();
    }

    if (ext && ext !== '.html') {
      return next();
    }

    try {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');

      const [, query] = req.originalUrl.split('?');
      const pathParts = pathname.split('/').filter(Boolean);

      // 1. Load current PUBLIC data
      const rawData = await getData(pathname);
      const PUBLIC_GIGS = rawData.gigs.filter(isGigPublic).map(sanitizePublicGig);
      const PUBLIC_USERS = rawData.users.filter(isUserPublic).map(sanitizePublicUser);
      const PUBLIC_PROJECTS = rawData.projects.filter(isProjectPublic).map(sanitizePublicProject);
      const PUBLIC_CATEGORIES = rawData.categories || [];

      let initialData: any = {
        query,
        gigs: PUBLIC_GIGS,
        users: PUBLIC_USERS,
        projects: PUBLIC_PROJECTS,
        categories: PUBLIC_CATEGORIES
      };

      let notFound = false;
      let isPrivate = false;

      // 2. Determine pageType and matching entity
      const isPrivateRoute = (p: string) => {
        const parts = p.split('/').filter(Boolean);
        return parts.length > 0 && PRIVATE_ROUTES.some(pr => parts[0].toLowerCase() === pr.toLowerCase());
      };

      if (isPrivateRoute(pathname)) {
        isPrivate = true;
        initialData.isPrivate = true;
        initialData.pageType = 'private';
      } else if (pathname === '/' || pathname === '') {
        initialData.pageType = 'home';
      } else if (pathname === '/gigs') {
        initialData.pageType = 'gigs';
      } else if (pathname.startsWith('/categories/')) {
        initialData.pageType = 'gigs';
      } else if (['/projects', '/search-projects', '/project-search', '/freelance-jobs'].includes(pathname)) {
        initialData.pageType = 'projects';
      } else if (['/freelancers', '/search-freelancers', '/freelancer-search'].includes(pathname)) {
        initialData.pageType = 'freelancers';
      } else if (pathParts.length >= 2 && (pathParts[0].toLowerCase() === 'gig' || pathParts[0].toLowerCase() === 'gigs')) {
        const gigId = pathParts[1];
        const subSlug = pathParts[2];
        const matchedGig = PUBLIC_GIGS.find(g => g.id === gigId || (g.slug && g.slug.toLowerCase() === gigId.toLowerCase()) || (subSlug && g.slug && g.slug.toLowerCase() === subSlug.toLowerCase()));
        if (matchedGig) {
          initialData.pageType = 'gig_detail';
          initialData.gig = matchedGig;
        } else {
          notFound = true;
        }
      } else if (pathParts.length === 2 && (pathParts[0].toLowerCase() === 'projects' || pathParts[0].toLowerCase() === 'project')) {
        const projId = pathParts[1];
        const matchedProj = PUBLIC_PROJECTS.find(p => p.id === projId || (p.slug && p.slug.toLowerCase() === projId.toLowerCase()));
        if (matchedProj) {
          initialData.pageType = 'project_detail';
          initialData.project = matchedProj;
        } else {
          notFound = true;
        }
      } else if (pathParts.length === 2 && RESERVED_ROUTES.includes(pathParts[0].toLowerCase())) {
        notFound = true;
      } else if (pathParts.length === 2) {
        const [username, gigSlug] = pathParts;
        const matchedGig = PUBLIC_GIGS.find(g => {
          const gUrl = getGigUrl(g).toLowerCase();
          const target = `/${username.toLowerCase()}/${gigSlug.toLowerCase()}`;
          return gUrl === target || (g.slug && g.slug.toLowerCase() === gigSlug.toLowerCase()) || g.id === gigSlug;
        });
        if (matchedGig) {
          initialData.pageType = 'gig_detail';
          initialData.gig = matchedGig;
        } else {
          notFound = true;
        }
      } else if (pathParts.length === 1) {
        const usernameParam = pathParts[0];
        const matchedUser = PUBLIC_USERS.find(u => (u.username && u.username.toLowerCase() === usernameParam.toLowerCase()) || slugify(u.name) === usernameParam.toLowerCase() || u.id === usernameParam);
        if (matchedUser) {
          initialData.pageType = 'freelancer_profile';
          initialData.profileUser = matchedUser;
        } else {
          notFound = true;
        }
      } else {
        notFound = true;
      }

      if (notFound) {
        initialData.notFound = true;
      }

      // 3. Prepare HTML template
      let template = templateHtml || fs.readFileSync(path.resolve(root, 'index.html'), 'utf-8');
      if (!hasProdBuild && vite) {
        template = await vite.transformIndexHtml(req.originalUrl, template);
      }

      // Clean existing head tags from template
      template = template
        .replace(/<title>.*?<\/title>/gi, '')
        .replace(/<meta\s+name=["']description["'].*?>/gi, '')
        .replace(/<meta\s+name=["']robots["'].*?>/gi, '')
        .replace(/<link\s+rel=["']canonical["'].*?>/gi, '')
        .replace(/<meta\s+property=["']og:.*?["'].*?>/gi, '')
        .replace(/<meta\s+name=["']twitter:.*?["'].*?>/gi, '');

      // 4. React SSR render full HTML
      let renderFn = ssrRender;
      if (!renderFn && !hasProdBuild && vite) {
        const mod = await vite.ssrLoadModule('/src/entry-server.tsx');
        renderFn = mod.render;
        ssrRender = renderFn;
      }

      const rendered = renderFn ? renderFn(pathname, initialData) : { html: '', head: '' };

      const serializedInitialData = JSON.stringify(initialData)
        .replace(/</g, '\\u003c')
        .replace(/>/g, '\\u003e')
        .replace(/\u2028/g, '\\u2028')
        .replace(/\u2029/g, '\\u2029');

      const finalHtml = template
        .replace('</head>', `${rendered.head}\n</head>`)
        .replace(
          '<div id="root"></div>',
          `<div id="root">${rendered.html}</div>\n<script>window.__INITIAL_DATA__ = ${serializedInitialData};</script>`
        );

      const statusCode = notFound ? 404 : 200;
      return res.status(statusCode).setHeader('Content-Type', 'text/html').end(finalHtml);

    } catch (e: any) {
      if (!isProd && vite) {
        try {
          vite.ssrFixStacktrace(e);
        } catch {}
      }
      console.error('SSR Error:', e);
      try {
        let template = templateHtml || fs.readFileSync(path.resolve(root, 'index.html'), 'utf-8');
        if (!hasProdBuild && vite) {
          try {
            template = await vite.transformIndexHtml('/', template);
          } catch {
            // Keep template as is if transformIndexHtml fails
          }
        }
        return res.status(200).setHeader('Content-Type', 'text/html').end(template);
      } catch {
        next(e);
      }
    }
  });
}

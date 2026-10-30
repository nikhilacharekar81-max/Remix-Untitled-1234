// Render-boundary helper for user-provided file/deliverable "links".
// Users may store ANY text as a link (working URLs, broken URLs, free text, javascript:..., data:...).
// Nothing is rejected on the server; instead, this decides how the UI may act on the value:
//   stored -> an uploaded file on this app; fetched with the session token (same origin only)
//   web    -> a plain http(s) URL; opened in a new tab with noopener, never sent our auth token
//   text   -> anything else; shown as plain text and NEVER navigated to, fetched or used as an href
export const STORED_FILE_PREFIX = '/api/workstream/files/';

export type FileLinkKind = 'stored' | 'web' | 'text';

export function classifyFileUrl(raw: unknown): { kind: FileLinkKind; url: string } {
  const url = typeof raw === 'string' ? raw.trim() : '';
  if (url.startsWith(STORED_FILE_PREFIX)) return { kind: 'stored', url };
  // Require the literal prefix first: new URL() would also accept "  javascript:..." style oddities elsewhere.
  if (/^https?:\/\//i.test(url)) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return { kind: 'web', url: parsed.href };
    } catch { /* not a valid URL: treat as text */ }
  }
  return { kind: 'text', url };
}

/** Opens a plain http(s) link safely (no opener access, no referrer). */
export function openWebLink(url: string): void {
  window.open(url, '_blank', 'noopener,noreferrer');
}

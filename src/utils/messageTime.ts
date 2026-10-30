// Message timestamps are ISO strings, but older stored messages hold a bare time such as "02:30 PM".
// Never let an unparseable value render as "Invalid Date" or break sorting.
export function messageTimeValue(ts: string | undefined): number {
  const t = new Date(ts || '').getTime();
  return Number.isNaN(t) ? 0 : t;
}

export function formatMessageTime(ts: string | undefined): string {
  const d = new Date(ts || '');
  if (Number.isNaN(d.getTime())) return ts || '';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/** Stable sort that keeps original order for entries without a parseable time. */
export function compareMessageTime(a: { timestamp?: string }, b: { timestamp?: string }): number {
  const ta = messageTimeValue(a.timestamp), tb = messageTimeValue(b.timestamp);
  return ta && tb ? ta - tb : 0;
}

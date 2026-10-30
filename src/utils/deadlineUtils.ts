/**
 * Shared deadline parsing and late-order calculation utility for client components.
 * Matches server/services/orderService.ts:parseDeadlineInstant and late-order protection exactly.
 */

export const LATE_ORDER_PROTECTION_HOURS = 48;

/**
 * Parses an order deadline into an authoritative UTC timestamp in milliseconds.
 * - Full ISO timestamps (e.g. 2026-10-30T14:30:00.000Z) are parsed directly.
 * - Legacy date-only records (e.g. 2026-10-30) are handled conservatively:
 *   If the order's creation timestamp has a valid time-of-day, that time-of-day is preserved.
 *   Otherwise, the date-only record is treated as end-of-day (23:59:59.999Z) so the deadline
 *   is never prematurely triggered earlier than intended.
 * - Invalid or unparseable inputs return null.
 */
export function parseDeadlineInstant(dueDate: unknown, referenceCreatedAt?: unknown): number | null {
  if (!dueDate || typeof dueDate !== 'string') return null;
  const trimmed = dueDate.trim();
  if (!trimmed) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    if (referenceCreatedAt && typeof referenceCreatedAt === 'string' && referenceCreatedAt.includes('T')) {
      const createdDate = new Date(referenceCreatedAt);
      if (!isNaN(createdDate.getTime())) {
        const timePart = referenceCreatedAt.split('T')[1];
        if (timePart) {
          const candidate = new Date(`${trimmed}T${timePart}`);
          if (!isNaN(candidate.getTime())) {
            return candidate.getTime();
          }
        }
      }
    }
    const endOfDay = new Date(`${trimmed}T23:59:59.999Z`);
    return isNaN(endOfDay.getTime()) ? null : endOfDay.getTime();
  }

  const parsed = new Date(trimmed);
  const time = parsed.getTime();
  return isNaN(time) ? null : time;
}

/**
 * Determines whether an order is very late (exceeded deadline + 48-hour protection window).
 */
export function isOrderVeryLate(order: { dueDate?: unknown; createdAt?: unknown }): boolean {
  if (!order?.dueDate) return false;
  const deadlineMs = parseDeadlineInstant(order.dueDate, order.createdAt);
  if (deadlineMs === null) return false;
  return Date.now() > deadlineMs + LATE_ORDER_PROTECTION_HOURS * 3600 * 1000;
}

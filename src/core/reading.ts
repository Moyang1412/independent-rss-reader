import type { FeedEntry } from './model';

export const RECENT_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1_000;

export function filterRecentEntries(entries: FeedEntry[], now = Date.now(), days = RECENT_DAYS): FeedEntry[] {
  const windowMs = Math.max(0, days) * DAY_MS;
  const cutoff = now - windowMs;
  return entries.filter(entry => {
    const publishedAt = entry.publishedAt;
    if (typeof publishedAt !== 'number' || !Number.isFinite(publishedAt)) return false;
    return publishedAt >= cutoff && publishedAt <= now;
  });
}

/**
 * Return the id next to the current article in the supplied display order.
 * When there is no current article, forward navigation starts at the first row;
 * backward navigation has no target. The input array is never changed.
 */
export function adjacentEntryId(entries: FeedEntry[], selectedId: string | undefined, direction: -1 | 1): string | undefined {
  if (!entries.length) return undefined;
  const index = selectedId ? entries.findIndex(entry => entry.id === selectedId) : -1;
  if (index < 0) return direction === 1 ? entries[0]?.id : undefined;
  return entries[index + direction]?.id;
}

export function markAllReadIds(existing: readonly string[], entries: FeedEntry[]): string[] {
  return [...new Set([...existing, ...entries.map(entry => entry.id)])];
}

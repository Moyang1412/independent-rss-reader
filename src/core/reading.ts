import type { FeedEntry } from './model';

export const RECENT_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1_000;

export type SortOrder = 'asc' | 'desc';

/** The last article opened in each subscription, keyed by subscription id. */
export type LastReadPositions = Record<string, string>;

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
  return addEntryIds(existing, entries);
}

/** Add a batch of article ids to a collection without changing the input list. */
export function addEntryIds(existing: readonly string[], entries: readonly FeedEntry[]): string[] {
  return [...new Set([...existing, ...entries.map(entry => entry.id)])];
}

/** Sort a copy of the article list by publication time, putting undated items last. */
export function sortEntriesByPublishedAt(entries: FeedEntry[], order: SortOrder = 'desc'): FeedEntry[] {
  return entries
    .map((entry, index) => ({ entry, index }))
    .sort((left, right) => {
      const leftTime = left.entry.publishedAt;
      const rightTime = right.entry.publishedAt;
      const leftHasTime = typeof leftTime === 'number' && Number.isFinite(leftTime);
      const rightHasTime = typeof rightTime === 'number' && Number.isFinite(rightTime);
      if (!leftHasTime && !rightHasTime) return left.index - right.index;
      if (!leftHasTime) return 1;
      if (!rightHasTime) return -1;
      if (leftTime === rightTime) return left.index - right.index;
      return order === 'asc' ? leftTime - rightTime : rightTime - leftTime;
    })
    .map(item => item.entry);
}

export function rememberLastReadPosition(
  positions: Readonly<LastReadPositions>,
  subscriptionId: string,
  entryId: string,
): LastReadPositions {
  if (!subscriptionId || !entryId) return { ...positions };
  return { ...positions, [subscriptionId]: entryId };
}

export function getLastReadPosition(
  positions: Readonly<LastReadPositions>,
  subscriptionId: string,
): string | undefined {
  const entryId = positions[subscriptionId];
  return entryId || undefined;
}

export function forgetLastReadPosition(
  positions: Readonly<LastReadPositions>,
  subscriptionId: string,
): LastReadPositions {
  if (!Object.hasOwn(positions, subscriptionId)) return { ...positions };
  const next = { ...positions };
  delete next[subscriptionId];
  return next;
}

/** Remove positions whose subscription or article no longer exists. */
export function pruneLastReadPositions(
  positions: Readonly<LastReadPositions>,
  entriesBySubscription: Readonly<Record<string, readonly FeedEntry[]>>,
): LastReadPositions {
  const next: LastReadPositions = {};
  for (const [subscriptionId, entryId] of Object.entries(positions)) {
    const entries = entriesBySubscription[subscriptionId];
    if (entries?.some(entry => entry.id === entryId)) next[subscriptionId] = entryId;
  }
  return next;
}

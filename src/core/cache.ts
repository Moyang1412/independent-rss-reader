import type { FeedEntry } from './model';

export const DEFAULT_CACHE_LIMIT = 50;

/** Merge a fresh feed snapshot while retaining protected or recently cached entries. */
export function mergeCachedEntries(
  previous: readonly FeedEntry[],
  incoming: readonly FeedEntry[],
  limit = DEFAULT_CACHE_LIMIT,
  protectedIds: ReadonlySet<string> = new Set(),
): FeedEntry[] {
  const seen = new Set<string>();
  const ordered: FeedEntry[] = [];
  for (const entry of [...incoming, ...previous]) {
    if (seen.has(entry.id)) continue;
    seen.add(entry.id);
    ordered.push(entry);
  }
  const max = Math.max(1, Math.floor(limit));
  if (ordered.length <= max) return ordered;
  const protectedEntries = ordered.filter(entry => protectedIds.has(entry.id));
  const regularEntries = ordered.filter(entry => !protectedIds.has(entry.id));
  return [...protectedEntries, ...regularEntries.slice(0, Math.max(0, max - protectedEntries.length))];
}

export function imageUrlsInEntry(entry: FeedEntry): string[] {
  const urls = new Set<string>();
  if (entry.imageUrl) urls.add(entry.imageUrl);
  const parser = typeof DOMParser === 'undefined' ? undefined : new DOMParser();
  if (parser) {
    const document = parser.parseFromString(entry.content, 'text/html');
    for (const image of Array.from(document.querySelectorAll<HTMLImageElement>('img[src]'))) {
      const src = image.getAttribute('src');
      if (src) urls.add(src);
    }
  } else {
    for (const match of entry.content.matchAll(/<img\b[^>]*\bsrc=["']([^"']+)["']/gi)) urls.add(match[1]);
  }
  return [...urls];
}

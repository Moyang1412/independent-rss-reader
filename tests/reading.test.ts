import { describe, expect, it } from 'vitest';
import { adjacentEntryId, filterRecentEntries, markAllReadIds } from '../src/core/reading';
import type { FeedEntry } from '../src/core/model';

const now = Date.parse('2026-11-15T00:00:00Z');
const entries: FeedEntry[] = [
  { id: 'new', feedUrl: 'https://example.com/feed', title: 'New', summary: '', content: '', publishedAt: now - 2 * 24 * 60 * 60 * 1_000 },
  { id: 'old', feedUrl: 'https://example.com/feed', title: 'Old', summary: '', content: '', publishedAt: now - 10 * 24 * 60 * 60 * 1_000 },
];

describe('reading helpers', () => {
  it('filters articles from an inclusive recent window and preserves display order', () => {
    const boundary = { ...entries[0], id: 'boundary', publishedAt: now - 7 * 24 * 60 * 60 * 1_000 };
    const future = { ...entries[0], id: 'future', publishedAt: now + 1 };
    const withoutDate = { ...entries[0], id: 'without-date', publishedAt: undefined };
    const invalidDate = { ...entries[0], id: 'invalid-date', publishedAt: Number.NaN };

    expect(filterRecentEntries([boundary, future, entries[0], withoutDate, invalidDate, entries[1]], now).map(entry => entry.id))
      .toEqual(['boundary', 'new']);
  });

  it('does not mutate entries when filtering', () => {
    const input = [...entries];
    expect(filterRecentEntries(input, now)).toHaveLength(1);
    expect(input).toEqual(entries);
  });

  it('supports a zero-day window for articles published at the reference time', () => {
    const atNow = { ...entries[0], id: 'at-now', publishedAt: now };
    expect(filterRecentEntries([atNow, entries[0]], now, 0).map(entry => entry.id)).toEqual(['at-now']);
  });

  it('returns adjacent article ids', () => {
    expect(adjacentEntryId(entries, 'new', 1)).toBe('old');
    expect(adjacentEntryId(entries, 'old', -1)).toBe('new');
    expect(adjacentEntryId(entries, 'old', 1)).toBeUndefined();
  });

  it('starts at the first article only for forward navigation', () => {
    expect(adjacentEntryId(entries, undefined, 1)).toBe('new');
    expect(adjacentEntryId(entries, '', 1)).toBe('new');
    expect(adjacentEntryId(entries, undefined, -1)).toBeUndefined();
    expect(adjacentEntryId([], undefined, 1)).toBeUndefined();
  });

  it('returns no target when the selected article is outside the list', () => {
    expect(adjacentEntryId(entries, 'missing', -1)).toBeUndefined();
    expect(adjacentEntryId(entries, 'missing', 1)).toBe('new');
  });

  it('marks all article ids without duplicates', () => {
    const duplicate = { ...entries[0], title: 'Duplicate copy' };
    expect(markAllReadIds(['old', 'old'], [entries[0], duplicate])).toEqual(['old', 'new']);
  });

  it('does not mutate existing read ids when marking a batch', () => {
    const existing = ['old'];
    expect(markAllReadIds(existing, entries)).toEqual(['old', 'new']);
    expect(existing).toEqual(['old']);
  });
});

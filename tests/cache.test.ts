import { describe, expect, it } from 'vitest';
import { imageUrlsInEntry, mergeCachedEntries } from '../src/core/cache';
import type { FeedEntry } from '../src/core/model';

const entry = (id: string, content = ''): FeedEntry => ({ id, feedUrl: 'https://example.com/feed', title: id, summary: '', content });

describe('offline cache helpers', () => {
  it('merges incoming entries and preserves protected older entries beyond the limit', () => {
    const previous = [entry('old-protected'), entry('old')];
    const incoming = [entry('new-1'), entry('new-2')];
    const result = mergeCachedEntries(previous, incoming, 2, new Set(['old-protected']));
    expect(result.map(item => item.id)).toEqual(['old-protected', 'new-1']);
  });

  it('deduplicates image URLs from the lead image and article body', () => {
    const value = entry('one', '<p><img src="https://example.com/a.png"><img src="https://example.com/a.png"></p>');
    value.imageUrl = 'https://example.com/cover.png';
    expect(imageUrlsInEntry(value)).toEqual(['https://example.com/cover.png', 'https://example.com/a.png']);
  });
});

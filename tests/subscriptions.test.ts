import { describe, expect, it } from 'vitest';
import { countUnreadEntries, mergeSavedEntries, moveSubscription, shouldRefreshSubscription } from '../src/core/subscriptions';
import type { Subscription } from '../src/core/model';

const subscription: Subscription = {
  id: 'feed-1', url: 'https://example.com/feed.xml', name: 'Example', group: '', entries: [
    { id: 'one', feedUrl: 'https://example.com/feed.xml', title: 'One', summary: '', content: '' },
    { id: 'two', feedUrl: 'https://example.com/feed.xml', title: 'Two', summary: '', content: '' },
  ], updatedAt: 0, lastAttemptAt: 0, paused: false,
};

describe('subscription helpers', () => {
  it('counts unread entries without changing subscription state', () => {
    expect(countUnreadEntries(subscription, ['one'])).toBe(1);
    expect(subscription.entries).toHaveLength(2);
  });

  it('skips paused subscriptions during refresh', () => {
    expect(shouldRefreshSubscription(subscription)).toBe(true);
    expect(shouldRefreshSubscription({ ...subscription, paused: true })).toBe(false);
  });

  it('moves subscriptions without mutating the original list', () => {
    const second = { ...subscription, id: 'feed-2', name: 'Second' };
    const original = [subscription, second];
    const moved = moveSubscription(original, 'feed-2', 'feed-1');
    expect(moved.map(item => item.id)).toEqual(['feed-2', 'feed-1']);
    expect(original.map(item => item.id)).toEqual(['feed-1', 'feed-2']);
  });

  it('merges saved entries without duplicating article ids', () => {
    const copy = { ...subscription.entries[0], title: 'Updated' };
    const merged = mergeSavedEntries([subscription.entries[0]], [copy, subscription.entries[1]]);
    expect(merged.map(entry => entry.id)).toEqual(['one', 'two']);
    expect(merged[0].title).toBe('One');
  });
});

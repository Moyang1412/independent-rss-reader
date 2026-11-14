import { describe, expect, it } from 'vitest';
import { countUnreadEntries, shouldRefreshSubscription } from '../src/core/subscriptions';
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
});

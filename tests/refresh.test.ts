import { describe, expect, it } from 'vitest';
import { countNewEntries, nextRetryAt, retryDelayMinutes, shouldAttemptSubscription, shouldRunScheduledRefresh } from '../src/core/refresh';
import type { FeedEntry, RefreshConfig, Subscription } from '../src/core/model';

const config: RefreshConfig = { enabled: true, intervalMinutes: 30, refreshOnOpen: false };
const entry = (id: string): FeedEntry => ({ id, feedUrl: 'https://example.com/feed', title: id, summary: '', content: '' });
const subscription: Subscription = { id: 'feed', url: 'https://example.com/feed', name: 'Feed', group: '', entries: [], updatedAt: 0, lastAttemptAt: 0 };

describe('refresh helpers', () => {
  it('runs only when enabled and the interval has elapsed', () => {
    expect(shouldRunScheduledRefresh(config, 0, 1_000)).toBe(true);
    expect(shouldRunScheduledRefresh({ ...config, enabled: false }, 0, 1_000)).toBe(false);
    expect(shouldRunScheduledRefresh(config, 1_000, 1_000 + 29 * 60_000)).toBe(false);
    expect(shouldRunScheduledRefresh(config, 1_000, 1_000 + 30 * 60_000)).toBe(true);
  });

  it('uses capped exponential retry backoff', () => {
    expect(retryDelayMinutes(1)).toBe(5);
    expect(retryDelayMinutes(2)).toBe(10);
    expect(retryDelayMinutes(20)).toBe(360);
    expect(nextRetryAt(1_000, 2)).toBe(1_000 + 10 * 60_000);
  });

  it('skips paused subscriptions and retry windows for automatic refresh', () => {
    expect(shouldAttemptSubscription(subscription, true, 10_000)).toBe(true);
    expect(shouldAttemptSubscription({ ...subscription, paused: true }, true, 10_000)).toBe(false);
    expect(shouldAttemptSubscription({ ...subscription, nextRetryAt: 20_000 }, true, 10_000)).toBe(false);
    expect(shouldAttemptSubscription({ ...subscription, nextRetryAt: 20_000 }, true, 20_000)).toBe(true);
    expect(shouldAttemptSubscription({ ...subscription, nextRetryAt: 20_000 }, false, 10_000)).toBe(true);
  });

  it('counts only entries that were not in the previous snapshot', () => {
    expect(countNewEntries([entry('one'), entry('two')], [entry('two'), entry('three'), entry('three')])).toBe(1);
  });
});

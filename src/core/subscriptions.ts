import type { Subscription } from './model';

export function countUnreadEntries(subscription: Subscription, readIds: readonly string[]): number {
  const read = new Set(readIds);
  return subscription.entries.reduce((count, entry) => count + (read.has(entry.id) ? 0 : 1), 0);
}

export function shouldRefreshSubscription(subscription: Subscription): boolean {
  return subscription.paused !== true;
}

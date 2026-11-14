import type { FeedEntry, Subscription } from './model';

export function countUnreadEntries(subscription: Subscription, readIds: readonly string[]): number {
  const read = new Set(readIds);
  return subscription.entries.reduce((count, entry) => count + (read.has(entry.id) ? 0 : 1), 0);
}

export function shouldRefreshSubscription(subscription: Subscription): boolean {
  return subscription.paused !== true;
}

export function moveSubscription(subscriptions: Subscription[], sourceId: string, targetId: string): Subscription[] {
  const sourceIndex = subscriptions.findIndex(item => item.id === sourceId);
  const targetIndex = subscriptions.findIndex(item => item.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return subscriptions;
  const next = [...subscriptions];
  const [moved] = next.splice(sourceIndex, 1);
  next.splice(targetIndex, 0, moved);
  return next;
}

export function mergeSavedEntries(existing: FeedEntry[], incoming: FeedEntry[]): FeedEntry[] {
  const seen = new Set(existing.map(entry => entry.id));
  return [...existing, ...incoming.filter(entry => !seen.has(entry.id))];
}

import type { FeedEntry, RefreshConfig, Subscription } from './model';

export const DEFAULT_REFRESH_INTERVAL_MINUTES = 30;
export const RETRY_BASE_MINUTES = 5;
export const MAX_BACKOFF_MINUTES = 6 * 60;

export function shouldRunScheduledRefresh(config: RefreshConfig, lastFinishedAt: number, now = Date.now()): boolean {
  if (!config.enabled) return false;
  const interval = Math.max(1, config.intervalMinutes) * 60_000;
  return !lastFinishedAt || now - lastFinishedAt >= interval;
}

export function retryDelayMinutes(failureCount: number, baseMinutes = RETRY_BASE_MINUTES, maxMinutes = MAX_BACKOFF_MINUTES): number {
  const exponent = Math.max(0, Math.floor(failureCount) - 1);
  return Math.min(maxMinutes, Math.max(1, baseMinutes) * (2 ** exponent));
}

export function nextRetryAt(now: number, failureCount: number): number {
  return now + retryDelayMinutes(failureCount) * 60_000;
}

export function shouldAttemptSubscription(subscription: Subscription, automatic: boolean, now = Date.now()): boolean {
  if (subscription.paused === true) return false;
  if (!automatic) return true;
  return !subscription.nextRetryAt || subscription.nextRetryAt <= now;
}

export function countNewEntries(previous: readonly FeedEntry[], next: readonly FeedEntry[]): number {
  const previousIds = new Set(previous.map(entry => entry.id));
  const seen = new Set<string>();
  return next.reduce((count, entry) => {
    if (previousIds.has(entry.id) || seen.has(entry.id)) return count;
    seen.add(entry.id);
    return count + 1;
  }, 0);
}

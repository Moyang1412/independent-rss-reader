import { requestUrl } from 'obsidian';
import { normalizeFeedUrl, parseFeed } from './core/feed-parser';
import type { ParsedFeed } from './core/model';

export interface FeedResponse {
  url: string;
  feed: ParsedFeed;
  etag?: string;
  lastModified?: string;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error('请求超时')), timeoutMs);
    promise.then(value => { window.clearTimeout(timer); resolve(value); }, error => { window.clearTimeout(timer); reject(error instanceof Error ? error : new Error(String(error))); });
  });
}

export async function fetchFeed(url: string, validators: { etag?: string; lastModified?: string } = {}): Promise<FeedResponse> {
  const normalized = normalizeFeedUrl(url);
  const headers: Record<string, string> = { Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, text/html;q=0.9' };
  if (validators.etag) headers['If-None-Match'] = validators.etag;
  if (validators.lastModified) headers['If-Modified-Since'] = validators.lastModified;
  const response = await withTimeout(requestUrl({ url: normalized, method: 'GET', headers, throw: false }), 20_000);
  if (response.status === 304) throw new Error('NOT_MODIFIED');
  if (response.status < 200 || response.status >= 300) throw new Error(`订阅请求失败（HTTP ${response.status}）`);
  const feed = parseFeed(response.text, normalized);
  return { url: normalized, feed, etag: response.headers?.etag, lastModified: response.headers?.['last-modified'] };
}

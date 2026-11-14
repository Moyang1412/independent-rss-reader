import { requestUrl } from 'obsidian';
import { discoverFeedUrls, MAX_ENTRIES, normalizeFeedUrl, parseFeed } from './core/feed-parser';
import { classifyFeedError, FeedFetchError, httpFeedError, parseFeedError } from './core/feed-errors';
import type { ParsedFeed } from './core/model';

export interface FeedResponse {
  url: string;
  feed: ParsedFeed;
  etag?: string;
  lastModified?: string;
}

export const MAX_FEED_PAGES = 5;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error('请求超时')), timeoutMs);
    promise.then(value => { window.clearTimeout(timer); resolve(value); }, error => { window.clearTimeout(timer); reject(error instanceof Error ? error : new Error(String(error))); });
  });
}

export async function fetchFeed(url: string, validators: { etag?: string; lastModified?: string } = {}): Promise<FeedResponse> {
  const requested = normalizeFeedUrl(url);
  const requestPage = async (pageUrl: string, useValidators: boolean) => {
    const headers: Record<string, string> = { Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, text/html;q=0.9' };
    if (useValidators && validators.etag) headers['If-None-Match'] = validators.etag;
    if (useValidators && validators.lastModified) headers['If-Modified-Since'] = validators.lastModified;
    let response: Awaited<ReturnType<typeof requestUrl>>;
    try {
      response = await withTimeout(requestUrl({ url: pageUrl, method: 'GET', headers, throw: false }), 20_000);
    } catch (error) {
      throw classifyFeedError(error, pageUrl);
    }
    if (response.status === 304) throw new Error('NOT_MODIFIED');
    if (response.status < 200 || response.status >= 300) {
      throw httpFeedError(response.status, pageUrl, response.headers?.location || response.headers?.Location);
    }
    return response;
  };

  let feedUrl = requested;
  let response = await requestPage(feedUrl, true);
  let feed: ParsedFeed;
  try {
    feed = parseFeed(response.text, feedUrl);
  } catch (error) {
    const type = String(response.headers?.['content-type'] || response.headers?.['Content-Type'] || '').toLowerCase();
    const looksHtml = type.includes('html') || /<\s*!doctype\s+html|<\s*(?:html|head|link)\b/i.test(response.text);
    if (!looksHtml) throw parseFeedError(error, feedUrl);
    let discovered: string[];
    try { discovered = discoverFeedUrls(response.text, feedUrl); } catch { discovered = []; }
    if (!discovered.length) throw new FeedFetchError('页面中未发现 RSS、Atom 或 RDF 订阅链接。', 'parse', feedUrl);
    feedUrl = discovered[0];
    response = await requestPage(feedUrl, false);
    try { feed = parseFeed(response.text, feedUrl); } catch (parseError) { throw parseFeedError(parseError, feedUrl); }
  }

  const etag = response.headers?.etag;
  const lastModified = response.headers?.['last-modified'];

  const seenPages = new Set([feedUrl]);
  const allEntries = [...feed.entries];
  let page = 1;
  while (feed.nextUrl && page < MAX_FEED_PAGES && !seenPages.has(feed.nextUrl)) {
    seenPages.add(feed.nextUrl);
    const nextUrl = feed.nextUrl;
    const nextResponse = await requestPage(nextUrl, false);
    let nextFeed: ParsedFeed;
    try { nextFeed = parseFeed(nextResponse.text, nextUrl); } catch (parseError) { throw parseFeedError(parseError, nextUrl); }
    allEntries.push(...nextFeed.entries);
    feed = { ...feed, nextUrl: nextFeed.nextUrl };
    page += 1;
  }
  const byId = new Map<string, typeof allEntries[number]>();
  for (const entry of allEntries) {
    const key = entry.sourceId || entry.id;
    if (!byId.has(key)) byId.set(key, { ...entry, feedUrl });
  }
  feed = { ...feed, url: feedUrl, entries: [...byId.values()].sort((left, right) => (right.publishedAt || 0) - (left.publishedAt || 0)).slice(0, MAX_ENTRIES), nextUrl: feed.nextUrl };
  return { url: feedUrl, feed, etag, lastModified };
}

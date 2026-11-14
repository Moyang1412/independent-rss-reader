import type { FeedEntry, RemoteReadOnlyConfig } from '../core/model';
import { RemoteReadOnlyError, type RemoteReadOnlyAdapter, type RemoteResponse, type RemoteSubscriptionSnapshot, type RemoteTransport } from './adapter';

function validateBaseUrl(value: string) {
  let url: URL;
  try { url = new URL(value); } catch { throw new RemoteReadOnlyError('远程只读服务地址无效'); }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new RemoteReadOnlyError('远程只读服务地址必须使用 HTTP(S)');
  if (url.username || url.password) throw new RemoteReadOnlyError('远程只读服务地址不能包含用户名或密码');
  return url.toString().replace(/\/$/, '');
}

function endpoint(baseUrl: string, path: string) {
  return `${baseUrl.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
}

function stringValue(value: unknown, fallback = '') { return typeof value === 'string' ? value.trim() : fallback; }
function numberValue(value: unknown, fallback = 0) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) { const parsed = Date.parse(value); if (Number.isFinite(parsed)) return parsed; }
  return fallback;
}
function absoluteHttpUrl(value: unknown, baseUrl: string) {
  const raw = stringValue(value);
  if (!raw) return undefined;
  try {
    const url = new URL(raw, `${baseUrl}/`);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : undefined;
  } catch { return undefined; }
}

function payloadArray(payload: unknown, keys: string[]): unknown[] {
  if (Array.isArray(payload)) return payload as unknown[];
  if (!payload || typeof payload !== 'object') return [];
  for (const key of keys) { const value = (payload as Record<string, unknown>)[key]; if (Array.isArray(value)) return value as unknown[]; }
  return [];
}

function parseEntry(value: unknown, subscriptionId: string, baseUrl: string, index: number): FeedEntry | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const item = value as Record<string, unknown>;
  const link = absoluteHttpUrl(item.link || item.url, baseUrl);
  const id = stringValue(item.id || item.guid || item.sourceId || link, `${subscriptionId}:${index}`);
  const title = stringValue(item.title, id);
  const summary = stringValue(item.summary || item.description || item.excerpt);
  const content = stringValue(item.content || item.body, summary);
  const publishedAt = numberValue(item.publishedAt || item.published_at || item.published || item.date, 0) || undefined;
  return {
    id: `remote:${subscriptionId}:${id}`,
    sourceId: id,
    feedUrl: endpoint(baseUrl, `subscriptions/${encodeURIComponent(subscriptionId)}`),
    title,
    link,
    author: stringValue(item.author || item.creator) || undefined,
    summary,
    content,
    publishedAt,
    publishedText: stringValue(item.publishedText || item.published_text) || undefined,
    imageUrl: absoluteHttpUrl(item.imageUrl || item.image || item.image_url, baseUrl),
    categories: Array.isArray(item.categories) ? item.categories.filter((entry): entry is string => typeof entry === 'string') : undefined,
    commentsUrl: absoluteHttpUrl(item.commentsUrl || item.comments_url, baseUrl),
    mediaUrl: absoluteHttpUrl(item.mediaUrl || item.media_url, baseUrl),
    mediaType: stringValue(item.mediaType || item.media_type) || undefined,
  };
}

function parseSnapshot(value: unknown, baseUrl: string, index: number): RemoteSubscriptionSnapshot | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const item = value as Record<string, unknown>;
  const id = stringValue(item.id || item.subscriptionId || item.slug, `subscription-${index}`);
  const rawEntries = payloadArray(item, ['entries', 'articles', 'items']);
  const entries = rawEntries.map((entry, entryIndex) => parseEntry(entry, id, baseUrl, entryIndex)).filter((entry): entry is FeedEntry => Boolean(entry));
  return {
    id,
    name: stringValue(item.name || item.title, id),
    group: stringValue(item.group || item.category),
    url: absoluteHttpUrl(item.url || item.feedUrl || item.feed_url, baseUrl) || endpoint(baseUrl, `subscriptions/${encodeURIComponent(id)}`),
    site: absoluteHttpUrl(item.site || item.siteUrl || item.site_url, baseUrl),
    image: absoluteHttpUrl(item.image || item.imageUrl || item.image_url, baseUrl),
    siteDescription: stringValue(item.siteDescription || item.description) || undefined,
    entries,
    updatedAt: numberValue(item.updatedAt || item.updated_at || item.updated, Date.now()),
  };
}

async function parseJson(response: RemoteResponse) {
  if (response.status < 200 || response.status >= 300) {
    let detail = '';
    try { detail = (await response.text()).slice(0, 300); } catch { /* Keep the status-only error. */ }
    throw new RemoteReadOnlyError(`远程只读服务请求失败（HTTP ${response.status}）${detail ? `：${detail}` : ''}`, response.status);
  }
  try { return await response.json(); } catch { throw new RemoteReadOnlyError('远程只读服务返回的 JSON 无效'); }
}

export class JsonRemoteReadOnlyAdapter implements RemoteReadOnlyAdapter {
  readonly id = 'json';
  readonly label = 'HTTP JSON 只读服务';
  private readonly baseUrl: string;
  private readonly transport: RemoteTransport;

  constructor(private readonly config: RemoteReadOnlyConfig, transport?: RemoteTransport) {
    this.baseUrl = validateBaseUrl(config.baseUrl);
    this.transport = transport || (async () => {
      throw new RemoteReadOnlyError('远程适配器未配置传输层');
    });
  }

  private async get(path: string) {
    const headers: Record<string, string> = { Accept: 'application/json' };
    const token = this.config.apiKey.trim();
    if (token) headers.Authorization = `Bearer ${token}`;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), Math.max(1_000, this.config.timeoutMs));
    try { return await parseJson(await this.transport(endpoint(this.baseUrl, path), { method: 'GET', headers, signal: controller.signal })); }
    catch (error) {
      if (error instanceof RemoteReadOnlyError) throw error;
      if (error instanceof DOMException && error.name === 'AbortError') throw new RemoteReadOnlyError('远程只读服务请求超时');
      if (error instanceof Error && error.name === 'AbortError') throw new RemoteReadOnlyError('远程只读服务请求超时');
      throw new RemoteReadOnlyError(`远程只读服务请求失败：${error instanceof Error ? error.message : '未知错误'}`);
    } finally { window.clearTimeout(timeout); }
  }

  async listSubscriptions() {
    const payload = await this.get('/subscriptions');
    const subscriptions = payloadArray(payload, ['subscriptions', 'feeds', 'items']);
    const snapshots: RemoteSubscriptionSnapshot[] = [];
    for (let index = 0; index < subscriptions.length; index += 1) {
      const snapshot = parseSnapshot(subscriptions[index], this.baseUrl, index);
      if (snapshot) snapshots.push(snapshot);
    }
    return snapshots;
  }
}

export function createJsonRemoteReadOnlyAdapter(config: RemoteReadOnlyConfig, transport?: RemoteTransport) {
  return new JsonRemoteReadOnlyAdapter(config, transport);
}

import type { FeedEntry, RemoteReadOnlyConfig, Subscription } from '../core/model';

export interface RemoteResponse {
  status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
}

export type RemoteTransport = (url: string, init: RequestInit) => Promise<RemoteResponse>;

export interface RemoteSubscriptionSnapshot {
  id: string;
  name: string;
  group: string;
  url: string;
  site?: string;
  image?: string;
  siteDescription?: string;
  entries: FeedEntry[];
  updatedAt: number;
}

export interface RemoteReadOnlyAdapter {
  readonly id: string;
  readonly label: string;
  listSubscriptions(): Promise<RemoteSubscriptionSnapshot[]>;
}

export type RemoteReadOnlyAdapterFactory = (config: RemoteReadOnlyConfig, transport?: RemoteTransport) => RemoteReadOnlyAdapter;

export class RemoteReadOnlyError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'RemoteReadOnlyError';
  }
}

export class RemoteReadOnlyAdapterRegistry {
  private readonly factories = new Map<string, RemoteReadOnlyAdapterFactory>();

  register(id: string, factory: RemoteReadOnlyAdapterFactory) {
    const key = id.trim();
    if (!key) throw new Error('远程适配器 ID 不能为空');
    this.factories.set(key, factory);
    return this;
  }

  has(id: string) { return this.factories.has(id); }
  list() { return [...this.factories.keys()]; }
  create(config: RemoteReadOnlyConfig, transport?: RemoteTransport) {
    const factory = this.factories.get(config.adapterId);
    if (!factory) throw new RemoteReadOnlyError(`未找到远程只读适配器：${config.adapterId}`);
    return factory(config, transport);
  }
}

export function remoteSubscriptionKey(adapterId: string, subscriptionId: string) {
  return `remote:${adapterId}:${subscriptionId}`;
}

export function mergeRemoteSnapshot(existing: Subscription | undefined, snapshot: RemoteSubscriptionSnapshot, adapterId: string): Subscription {
  const previousById = new Map((existing?.entries || []).map(entry => [entry.id, entry]));
  const entries = snapshot.entries.map(entry => {
    const previous = previousById.get(entry.id);
    return previous ? { ...entry, cachedImages: previous.cachedImages, cachedAt: previous.cachedAt } : entry;
  });
  return {
    id: remoteSubscriptionKey(adapterId, snapshot.id),
    url: snapshot.url,
    name: snapshot.name,
    group: snapshot.group,
    entries,
    updatedAt: snapshot.updatedAt,
    lastAttemptAt: Date.now(),
    error: '',
    paused: existing?.paused ?? false,
    cacheLimit: existing?.cacheLimit ?? 50,
    site: snapshot.site,
    image: snapshot.image,
    siteDescription: snapshot.siteDescription,
    remote: { adapterId, subscriptionId: snapshot.id, readOnly: true },
  };
}

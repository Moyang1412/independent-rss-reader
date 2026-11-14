import { beforeAll, describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { DEFAULT_REMOTE_READ_ONLY_CONFIG } from '../src/core/state';
import { mergeRemoteSnapshot, RemoteReadOnlyAdapterRegistry, RemoteReadOnlyError } from '../src/remote/adapter';
import { createJsonRemoteReadOnlyAdapter } from '../src/remote/json-adapter';
import type { RemoteResponse } from '../src/remote/adapter';

beforeAll(() => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>');
  Object.assign(globalThis, { window: dom.window });
});

function response(payload: unknown, status = 200): RemoteResponse {
  return { status, json: async () => payload, text: async () => JSON.stringify(payload) };
}

describe('remote read-only adapters', () => {
  it('uses only GET and maps JSON subscriptions into local entries', async () => {
    const requests: Array<{ url: string; init: RequestInit }> = [];
    const adapter = createJsonRemoteReadOnlyAdapter({ ...DEFAULT_REMOTE_READ_ONLY_CONFIG, enabled: true, baseUrl: 'https://remote.example/api', apiKey: 'secret' }, async (url, init) => {
      requests.push({ url, init });
      return response({ subscriptions: [{ id: 'tech', name: '技术', group: '阅读', entries: [{ id: 'article-1', title: '文章', link: '/a', summary: '摘要', publishedAt: '2026-11-15T00:00:00Z' }] }] });
    });
    const snapshots = await adapter.listSubscriptions();
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe('https://remote.example/api/subscriptions');
    expect(requests[0].init.method).toBe('GET');
    expect((requests[0].init.headers as Record<string, string>).Authorization).toBe('Bearer secret');
    expect(snapshots[0].entries[0]).toMatchObject({ id: 'remote:tech:article-1', sourceId: 'article-1', link: 'https://remote.example/a', title: '文章' });
  });

  it('rejects embedded credentials and non-success responses', async () => {
    expect(() => createJsonRemoteReadOnlyAdapter({ ...DEFAULT_REMOTE_READ_ONLY_CONFIG, baseUrl: 'https://user:pass@example.com/api' })).toThrow('不能包含用户名或密码');
    const adapter = createJsonRemoteReadOnlyAdapter({ ...DEFAULT_REMOTE_READ_ONLY_CONFIG, baseUrl: 'https://remote.example/api' }, async () => response('forbidden', 403));
    await expect(adapter.listSubscriptions()).rejects.toMatchObject({ status: 403 });
  });

  it('preserves local cached image metadata when replacing a remote snapshot', () => {
    const merged = mergeRemoteSnapshot({ id: 'remote:json:tech', url: 'https://remote.example/api/subscriptions/tech', name: '旧', group: '', entries: [{ id: 'remote:tech:article-1', feedUrl: 'x', title: '旧', summary: '', content: '', cachedImages: { image: 'cache/image.png' }, cachedAt: 1 }], updatedAt: 1, lastAttemptAt: 1, cacheLimit: 50 }, { id: 'tech', name: '新', group: '阅读', url: 'https://remote.example/api/subscriptions/tech', entries: [{ id: 'remote:tech:article-1', feedUrl: 'x', title: '新', summary: '', content: '' }], updatedAt: 2 }, 'json');
    expect(merged.remote).toEqual({ adapterId: 'json', subscriptionId: 'tech', readOnly: true });
    expect(merged.entries[0].cachedImages).toEqual({ image: 'cache/image.png' });
  });

  it('supports registering another adapter without changing the HTTP adapter', async () => {
    const registry = new RemoteReadOnlyAdapterRegistry();
    registry.register('fixture', () => ({ id: 'fixture', label: 'Fixture', listSubscriptions: async () => [] }));
    expect(registry.list()).toEqual(['fixture']);
    expect(await registry.create({ ...DEFAULT_REMOTE_READ_ONLY_CONFIG, adapterId: 'fixture' }).listSubscriptions()).toEqual([]);
    expect(() => registry.create({ ...DEFAULT_REMOTE_READ_ONLY_CONFIG, adapterId: 'missing' })).toThrow(RemoteReadOnlyError);
  });
});

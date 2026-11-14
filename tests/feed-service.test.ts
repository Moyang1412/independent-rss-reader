import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';

vi.mock('obsidian', () => ({ requestUrl: vi.fn() }));
import { requestUrl } from 'obsidian';
import { fetchFeed } from '../src/feed-service';

const mockedRequestUrl = vi.mocked(requestUrl);

beforeAll(() => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://reader.test/' });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, DOMParser: dom.window.DOMParser, Node: dom.window.Node });
});

beforeEach(() => mockedRequestUrl.mockReset());

describe('fetchFeed', () => {
  it('discovers an RSS link from an HTML landing page', async () => {
    mockedRequestUrl
      .mockResolvedValueOnce({ status: 200, text: '<html><head><link rel="alternate" type="application/rss+xml" href="/feed.xml"></head></html>', headers: { 'content-type': 'text/html' } } as never)
      .mockResolvedValueOnce({ status: 200, text: '<rss><channel><title>Discovered</title><item><title>One</title><guid>one</guid></item></channel></rss>', headers: { 'content-type': 'application/rss+xml', etag: 'feed-etag' } } as never);
    const result = await fetchFeed('https://example.com/blog/');
    expect(result.url).toBe('https://example.com/feed.xml');
    expect(result.feed.title).toBe('Discovered');
    expect(result.etag).toBe('feed-etag');
    expect(mockedRequestUrl).toHaveBeenCalledTimes(2);
  });

  it('follows Atom next links and merges pages without duplicate entries', async () => {
    const pageOne = '<feed xmlns="http://www.w3.org/2005/Atom"><title>Pages</title><link rel="next" href="/page2.xml"/><entry><id>one</id><title>One</title></entry></feed>';
    const pageTwo = '<feed xmlns="http://www.w3.org/2005/Atom"><title>Pages</title><link rel="next" href="/page3.xml"/><entry><id>one</id><title>Updated One</title></entry><entry><id>two</id><title>Two</title></entry></feed>';
    const pageThree = '<feed xmlns="http://www.w3.org/2005/Atom"><title>Pages</title><entry><id>three</id><title>Three</title></entry></feed>';
    mockedRequestUrl
      .mockResolvedValueOnce({ status: 200, text: pageOne, headers: {} } as never)
      .mockResolvedValueOnce({ status: 200, text: pageTwo, headers: {} } as never)
      .mockResolvedValueOnce({ status: 200, text: pageThree, headers: {} } as never);
    const result = await fetchFeed('https://example.com/page1.xml');
    expect(result.feed.entries.map(entry => entry.title)).toEqual(['One', 'Two', 'Three']);
    expect(mockedRequestUrl).toHaveBeenCalledTimes(3);
  });

  it('reports redirect and HTTP status failures clearly', async () => {
    mockedRequestUrl.mockResolvedValueOnce({ status: 301, text: '', headers: { location: 'https://example.com/feed.xml' } } as never);
    await expect(fetchFeed('https://example.com/old.xml')).rejects.toThrow('发生重定向');
    mockedRequestUrl.mockResolvedValueOnce({ status: 404, text: '', headers: {} } as never);
    await expect(fetchFeed('https://example.com/missing.xml')).rejects.toThrow('地址不存在');
  });

  it('classifies certificate and network failures', async () => {
    mockedRequestUrl.mockRejectedValueOnce(new Error('self-signed certificate in certificate chain'));
    await expect(fetchFeed('https://example.com/feed.xml')).rejects.toMatchObject({ kind: 'certificate' });
    mockedRequestUrl.mockRejectedValueOnce(new Error('ENOTFOUND example.com'));
    await expect(fetchFeed('https://example.com/feed.xml')).rejects.toMatchObject({ kind: 'network' });
  });
});

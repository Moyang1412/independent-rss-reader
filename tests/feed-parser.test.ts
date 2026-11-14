import { beforeAll, describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { exportOpml, normalizeFeedUrl, parseFeed, parseOpml, sanitizeArticleHtml } from '../src/core/feed-parser';

let dom: JSDOM;

beforeAll(() => {
  dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://reader.test/' });
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    DOMParser: dom.window.DOMParser,
    Node: dom.window.Node,
  });
});

describe('normalizeFeedUrl', () => {
  it('normalizes hashes and rejects credentials or unsupported protocols', () => {
    expect(normalizeFeedUrl('https://example.com/feed#latest')).toBe('https://example.com/feed');
    expect(() => normalizeFeedUrl('file:///tmp/feed.xml')).toThrow();
    expect(() => normalizeFeedUrl('https://user:pass@example.com/feed')).toThrow();
  });
});

describe('parseFeed', () => {
  it('parses RSS 2, resolves links and removes executable HTML', () => {
    const xml = `<?xml version="1.0"?>
      <rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
        <channel>
          <title>Example Feed</title><link>https://example.com</link>
          <item>
            <title>First story</title><guid>first</guid><link>/posts/1</link>
            <pubDate>Wed, 01 Jan 2025 00:00:00 GMT</pubDate>
            <content:encoded><![CDATA[<p>Hello <strong>reader</strong></p><script>alert(1)</script><a href="/more">More</a><a href="javascript:alert(2)">Bad</a>]]></content:encoded>
          </item>
        </channel>
      </rss>`;
    const feed = parseFeed(xml, 'https://example.com/feed.xml');
    expect(feed.format).toBe('rss');
    expect(feed.title).toBe('Example Feed');
    expect(feed.entries).toHaveLength(1);
    expect(feed.entries[0].link).toBe('https://example.com/posts/1');
    expect(feed.entries[0].content).not.toContain('<script');
    expect(feed.entries[0].content).toContain('https://example.com/more');
    expect(feed.entries[0].content).not.toContain('javascript:');
    expect(feed.entries[0].publishedAt).toBe(Date.parse('Wed, 01 Jan 2025 00:00:00 GMT'));
  });

  it('parses Atom entries and uses the alternate link', () => {
    const xml = `<feed xmlns="http://www.w3.org/2005/Atom">
      <title>Atom example</title><link rel="alternate" href="https://example.com/"/>
      <entry><id>tag:example.com,2025:one</id><title>Atom story</title>
        <link rel="self" href="https://example.com/api/one"/><link href="/one"/>
        <updated>2025-01-02T00:00:00Z</updated><author><name>Author</name></author>
        <summary type="html">&lt;p&gt;Summary&lt;/p&gt;</summary>
      </entry>
    </feed>`;
    const feed = parseFeed(xml, 'https://example.com/atom.xml');
    expect(feed.format).toBe('atom');
    expect(feed.siteUrl).toBe('https://example.com/');
    expect(feed.entries[0].link).toBe('https://example.com/one');
    expect(feed.entries[0].author).toBe('Author');
    expect(feed.entries[0].summary).toBe('Summary');
  });

  it('rejects entity declarations and oversized XML', () => {
    expect(() => parseFeed('<!DOCTYPE rss [ <!ENTITY x "bad"> ]><rss/>', 'https://example.com/feed')).toThrow(/DTD|ENTITY/);
    expect(() => parseFeed(`<rss>${'x'.repeat(5 * 1024 * 1024)}</rss>`, 'https://example.com/feed')).toThrow(/5 MiB/);
  });
});

describe('OPML', () => {
  it('imports nested groups, de-duplicates URLs and exports valid OPML', () => {
    const xml = `<opml version="2.0"><body><outline text="Tech"><outline text="One" xmlUrl="https://example.com/one.xml#x"/><outline title="Duplicate" xmlUrl="https://example.com/one.xml"/></outline><outline text="Two" xmlUrl="https://example.com/two.xml"/></body></opml>`;
    const parsed = parseOpml(xml);
    expect(parsed.feeds).toEqual([
      { url: 'https://example.com/one.xml', name: 'One', group: 'Tech' },
      { url: 'https://example.com/two.xml', name: 'Two', group: '' },
    ]);
    const exported = exportOpml(parsed.feeds);
    expect(parseOpml(exported).feeds).toEqual(parsed.feeds);
  });
});

describe('sanitizeArticleHtml', () => {
  it('keeps simple formatting and strips scripts, event handlers, and unsafe URLs', () => {
    const html = sanitizeArticleHtml('<p onclick="bad()">Safe</p><img src="/image.png" onerror="bad()"><iframe src="https://evil.example"></iframe>', 'https://example.com/feed');
    expect(html).toContain('<p>Safe</p>');
    expect(html).toContain('https://example.com/image.png');
    expect(html).not.toContain('onclick');
    expect(html).not.toContain('<iframe');
  });
});

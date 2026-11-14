import createDOMPurify from 'dompurify';
import type { FeedEntry, FeedFormat, OpmlFeed, ParsedFeed } from './model';

export const MAX_XML_BYTES = 5 * 1024 * 1024;
export const MAX_INSPECTED_ENTRIES = 200;
export const MAX_ENTRIES = 50;
export const MAX_ENTRY_CONTENT_CHARS = 100_000;
export const MAX_FEED_BYTES = 1 * 1024 * 1024;

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

export function normalizeFeedUrl(value: string): string {
  let url: URL;
  try { url = new URL(value.trim()); } catch { throw new Error('订阅地址无效'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('订阅地址必须是没有账号密码的 HTTP(S) 地址');
  }
  url.hash = '';
  return url.href;
}

function safeUrl(value: string | undefined, base?: string): string | undefined {
  if (!value?.trim()) return undefined;
  try {
    const url = new URL(value.trim(), base);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return undefined;
    url.hash = '';
    return url.href;
  } catch { return undefined; }
}

function children(node: Element, localName: string): Element[] {
  return Array.from(node.children).filter(child => child.localName === localName);
}

function firstChild(node: Element | undefined, localName: string): Element | undefined {
  return node ? children(node, localName)[0] : undefined;
}

function textOf(node: Element | undefined): string {
  return node?.textContent?.trim() || '';
}

function xmlDocument(xml: string): XMLDocument {
  if (byteLength(xml) > MAX_XML_BYTES) throw new Error('订阅 XML 超过 5 MiB 限制');
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('订阅 XML 不允许 DTD 或 ENTITY');
  const parsed = new DOMParser().parseFromString(xml, 'application/xml');
  if (parsed.getElementsByTagName('parsererror').length) throw new Error('订阅 XML 格式无效');
  if (!parsed.documentElement) throw new Error('订阅 XML 没有根元素');
  return parsed;
}

const ALLOWED_TAGS = [
  'a', 'abbr', 'b', 'blockquote', 'br', 'code', 'del', 'em', 'figure', 'figcaption',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'i', 'img', 'li', 'mark', 'ol', 'p',
  'pre', 's', 'small', 'strong', 'sub', 'sup', 'table', 'tbody', 'td', 'th', 'thead',
  'tr', 'u', 'ul',
];
const ALLOWED_ATTR = ['alt', 'colspan', 'height', 'href', 'rel', 'src', 'target', 'title', 'width'];

function domPurify(): ReturnType<typeof createDOMPurify> {
  const view = typeof window === 'undefined' ? undefined : window;
  if (!view) throw new Error('无法创建 HTML 清理器');
  return createDOMPurify(view);
}

/** Sanitize feed HTML before it is inserted into the Obsidian DOM. */
export function sanitizeArticleHtml(html: string, baseUrl?: string): string {
  const purifier = domPurify();
  const sanitized = purifier.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_ARIA_ATTR: false,
    ALLOW_DATA_ATTR: false,
    FORBID_TAGS: ['audio', 'embed', 'form', 'iframe', 'input', 'link', 'meta', 'object', 'script', 'style', 'textarea', 'video'],
    ALLOWED_URI_REGEXP: /^(?:(?:https?):\/\/|\/|#|mailto:)/i,
    KEEP_CONTENT: true,
  });
  if (!baseUrl) return sanitized;
  // Resolve relative URLs in a detached, already-sanitized document. The URL
  // resolver only accepts HTTP(S), and the result is sanitized once more.
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<body>${sanitized}</body>`, 'text/html');
  for (const element of Array.from(doc.body.querySelectorAll('[href], [src]'))) {
    for (const attribute of ['href', 'src']) {
      const raw = element.getAttribute(attribute);
      if (!raw) continue;
      const resolved = safeUrl(raw, baseUrl);
      if (resolved) element.setAttribute(attribute, resolved);
      else element.removeAttribute(attribute);
    }
  }
  return purifier.sanitize(doc.body.innerHTML, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_ARIA_ATTR: false,
    ALLOW_DATA_ATTR: false,
    FORBID_TAGS: ['audio', 'embed', 'form', 'iframe', 'input', 'link', 'meta', 'object', 'script', 'style', 'textarea', 'video'],
    ALLOWED_URI_REGEXP: /^(?:(?:https?):\/\/|\/|#|mailto:)/i,
    KEEP_CONTENT: true,
  });
}

function plainText(html: string): string {
  const value = domPurify().sanitize(html, { ALLOWED_TAGS: [], ALLOWED_ATTR: [], KEEP_CONTENT: true });
  return value.replace(/\s+/g, ' ').trim();
}

function dateOf(value: string): { publishedText?: string; publishedAt?: number } {
  const publishedText = value.trim();
  if (!publishedText) return {};
  const publishedAt = Date.parse(publishedText);
  return Number.isFinite(publishedAt) ? { publishedText, publishedAt } : { publishedText };
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function atomContent(node: Element | undefined): string {
  if (!node) return '';
  if (node.getAttribute('type') === 'xhtml') return Array.from(node.children).map(child => child.outerHTML).join('');
  const value = node.textContent || '';
  return node.getAttribute('type') === 'html' ? value : `<p>${escapeHtml(value)}</p>`;
}

function contentOf(item: Element, atom: boolean): string {
  if (atom) return atomContent(firstChild(item, 'content') || firstChild(item, 'summary'));
  return textOf(firstChild(item, 'encoded')) || textOf(firstChild(item, 'description'));
}

function linkOf(item: Element, base: string): string | undefined {
  const atomLink = children(item, 'link').find(link => !link.getAttribute('rel') || link.getAttribute('rel') === 'alternate');
  return safeUrl(atomLink?.getAttribute('href') || textOf(firstChild(item, 'link')), base);
}

function authorOf(item: Element): string | undefined {
  const atomAuthor = firstChild(item, 'author');
  return textOf(firstChild(atomAuthor || item, 'name')) || textOf(firstChild(item, 'creator')) || textOf(firstChild(item, 'author')) || undefined;
}

function imageOf(item: Element, base: string): string | undefined {
  for (const node of Array.from(item.getElementsByTagName('*'))) {
    const name = node.localName.toLowerCase();
    const type = node.getAttribute('type') || '';
    const candidate = node.getAttribute('url') || node.getAttribute('href');
    if (name === 'thumbnail' || (name === 'content' && (node.getAttribute('medium') === 'image' || type.startsWith('image/'))) || (name === 'enclosure' && type.startsWith('image/'))) {
      const resolved = safeUrl(candidate || undefined, base);
      if (resolved) return resolved;
    }
  }
  return undefined;
}

function formatOf(root: Element): FeedFormat {
  if (root.localName === 'feed') return 'atom';
  if (root.localName === 'RDF' || root.localName === 'rdf') return 'rdf';
  if (root.localName === 'rss') return 'rss';
  throw new Error('只支持 RSS、RDF 和 Atom 订阅');
}

function entriesOf(root: Element, format: FeedFormat): Element[] {
  if (format === 'atom') return children(root, 'entry').slice(0, MAX_INSPECTED_ENTRIES);
  const parent = format === 'rdf' ? root : firstChild(root, 'channel');
  if (!parent && format === 'rss') throw new Error('RSS 缺少 channel');
  return Array.from((parent || root).children).filter(node => node.localName === 'item').slice(0, MAX_INSPECTED_ENTRIES);
}

function simpleHash(value: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 0x01000193);
    h2 = Math.imul(h2 ^ (code + i), 0x85ebca6b);
  }
  return `${(h1 >>> 0).toString(16).padStart(8, '0')}${(h2 >>> 0).toString(16).padStart(8, '0')}`;
}

function entryIdentity(item: Element, atom: boolean, title: string, published: string, link?: string): string {
  return (atom ? textOf(firstChild(item, 'id')) : textOf(firstChild(item, 'guid'))) || link || `${title}\n${published}`;
}

/** Parse one RSS 2/RSS 1 RDF/Atom document synchronously in the host DOM. */
export function parseFeed(xml: string, rawUrl: string): ParsedFeed {
  const url = normalizeFeedUrl(rawUrl);
  const parsed = xmlDocument(xml);
  const root = parsed.documentElement;
  const format = formatOf(root);
  const channel = format === 'atom' ? root : firstChild(root, 'channel') || root;
  const atom = format === 'atom';
  const titleRaw = atom ? textOf(firstChild(root, 'title')) : textOf(firstChild(channel, 'title'));
  const title = plainText(titleRaw).slice(0, 200) || new URL(url).hostname;
  const siteUrl = atom
    ? safeUrl(children(root, 'link').find(link => !link.getAttribute('rel') || link.getAttribute('rel') === 'alternate')?.getAttribute('href') || undefined, url)
    : safeUrl(textOf(firstChild(channel, 'link')), url);
  const imageUrl = atom
    ? safeUrl(textOf(firstChild(root, 'logo')) || textOf(firstChild(root, 'icon')), url)
    : safeUrl(textOf(firstChild(firstChild(channel, 'image') || channel, 'url')), siteUrl || url);

  const entries: FeedEntry[] = [];
  const seen = new Set<string>();
  let storedBytes = 0;
  for (const item of entriesOf(root, format)) {
    const rawContent = contentOf(item, atom);
    const titleValue = plainText(atom ? atomContent(firstChild(item, 'title')) : textOf(firstChild(item, 'title'))).slice(0, 300) || plainText(rawContent).slice(0, 80) || '未命名文章';
    const link = linkOf(item, url);
    const published = atom ? textOf(firstChild(item, 'published')) || textOf(firstChild(item, 'updated')) : textOf(firstChild(item, 'pubDate')) || textOf(firstChild(item, 'date'));
    const identity = entryIdentity(item, atom, titleValue, published, link);
    const id = `local:${simpleHash(`${url}\n${identity}`)}`;
    if (seen.has(id)) continue;
    const content = sanitizeArticleHtml(rawContent.slice(0, MAX_ENTRY_CONTENT_CHARS), link || url);
    const date = dateOf(published);
    const entry: FeedEntry = { id, feedUrl: url, title: titleValue, link, author: authorOf(item), summary: plainText(rawContent).slice(0, 240), content, ...date, imageUrl: imageOf(item, link || url) };
    const nextBytes = storedBytes + byteLength(JSON.stringify(entry));
    if (nextBytes > MAX_FEED_BYTES && entries.length > 0) break;
    entries.push(entry); seen.add(id); storedBytes = nextBytes;
    if (entries.length >= MAX_ENTRIES) break;
  }
  entries.sort((left, right) => (right.publishedAt || 0) - (left.publishedAt || 0));
  return { url, format, title, site: siteUrl, image: imageUrl, siteUrl, imageUrl, entries };
}

function attr(node: Element, ...names: string[]): string {
  for (const name of names) {
    const value = node.getAttribute(name) || node.getAttributeNS('http://www.w3.org/XML/1998/namespace', name);
    if (value?.trim()) return value.trim();
  }
  return '';
}

export function parseOpml(xml: string): { feeds: OpmlFeed[] } {
  const parsed = xmlDocument(xml);
  const root = parsed.documentElement;
  if (root.localName !== 'opml') throw new Error('OPML 根元素无效');
  const feeds: OpmlFeed[] = [];
  const seen = new Set<string>();
  for (const node of Array.from(root.getElementsByTagName('outline'))) {
    const rawUrl = attr(node, 'xmlUrl', 'xmlurl');
    if (!rawUrl) continue;
    let url: string;
    try { url = normalizeFeedUrl(rawUrl); } catch { continue; }
    if (seen.has(url)) continue;
    seen.add(url);
    const groups: string[] = [];
    let parent = node.parentElement;
    while (parent?.localName === 'outline') {
      const name = attr(parent, 'text', 'title');
      if (name) groups.unshift(name);
      parent = parent.parentElement;
    }
    feeds.push({ url, name: attr(node, 'title', 'text') || new URL(url).hostname, group: groups.join(' / ') });
  }
  if (!feeds.length) throw new Error('OPML 中没有有效订阅');
  return { feeds };
}

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

export function exportOpml(feeds: OpmlFeed[]): string {
  const groups = new Map<string, OpmlFeed[]>();
  for (const feed of feeds) {
    const current = groups.get(feed.group) || [];
    current.push(feed); groups.set(feed.group, current);
  }
  const sections: string[] = [];
  for (const [group, values] of groups) {
    const children = values.map(feed => `    <outline type="rss" text="${escapeXml(feed.name)}" title="${escapeXml(feed.name)}" xmlUrl="${escapeXml(feed.url)}"/>`).join('\n');
    sections.push(group ? `  <outline text="${escapeXml(group)}" title="${escapeXml(group)}">\n${children}\n  </outline>` : children);
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<opml version="2.0"><head><title>RSS subscriptions</title></head><body>\n${sections.join('\n')}\n</body></opml>\n`;
}

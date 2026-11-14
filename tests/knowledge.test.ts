import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DAILY_NOTE_TEMPLATE,
  DEFAULT_SAVE_TEMPLATE,
  articleFilename,
  htmlToMarkdown,
  isAlreadySaved,
  markArticleSaved,
  normalizeTags,
  renderTemplate,
  safeVaultPath,
  templateVariables,
  updateArticleKnowledge,
} from '../src/core/knowledge';
import type { ArticleKnowledge, FeedEntry } from '../src/core/model';

const entry: FeedEntry = {
  id: 'entry-1',
  feedUrl: 'https://example.com/feed.xml',
  title: '本地 RSS',
  author: '作者',
  summary: '摘要',
  content: '<p>正文</p><strong>重点</strong>',
  link: 'https://example.com/article',
  publishedAt: Date.parse('2026-11-15T08:00:00Z'),
};

const knowledge: ArticleKnowledge = { tags: ['rss', '#obsidian'], note: '值得回看' };

describe('knowledge helpers', () => {
  it('normalizes duplicate article tags while removing leading hashes', () => {
    expect(normalizeTags([' #rss ', 'rss', '', '#obsidian'])).toEqual(['rss', 'obsidian']);
  });

  it('renders article variables for save templates', () => {
    const variables = templateVariables(entry, '示例订阅', knowledge);
    const rendered = renderTemplate('{{title}}|{{source}}|{{author}}|{{publishedAt}}|{{link}}|{{tags}}|{{note}}', variables);
    expect(rendered).toBe('本地 RSS|示例订阅|作者|2026-11-15T08:00:00.000Z|https://example.com/article|#rss #obsidian|值得回看');
  });

  it('converts basic article HTML to Markdown before rendering', () => {
    expect(htmlToMarkdown('<p>一段</p><strong>重点</strong><br>下一行')).toContain('**重点**');
    expect(templateVariables(entry, '示例订阅', knowledge).content).toContain('**重点**');
  });

  it('provides Daily Note and article save templates', () => {
    const variables = templateVariables(entry, '示例订阅', knowledge);
    expect(renderTemplate(DEFAULT_DAILY_NOTE_TEMPLATE, variables)).toBe('- [本地 RSS](https://example.com/article) — 示例订阅');
    expect(renderTemplate(DEFAULT_SAVE_TEMPLATE, variables)).toContain('# 本地 RSS');
    expect(renderTemplate('## {{title}}\n{{tags}}\n{{note}}', variables)).toBe('## 本地 RSS\n#rss #obsidian\n值得回看');
  });

  it('validates vault-relative paths and creates a deterministic filename', () => {
    expect(safeVaultPath('RSS', '本地 RSS.md')).toBe('RSS/本地 RSS.md');
    expect(articleFilename(entry)).toBe('本地 RSS entry-1.md');
    expect(articleFilename({ ...entry, id: 'local:09a51d8452fe5302' })).toBe('本地 RSS local09a51d8.md');
    expect(() => safeVaultPath('../outside', 'article.md')).toThrow('保存路径无效');
    expect(() => safeVaultPath('RSS/..', 'article.md')).toThrow('保存路径无效');
    expect(() => safeVaultPath('/outside', 'article.md')).toThrow('保存路径无效');
    expect(() => safeVaultPath('RSS', 'article\0.md')).toThrow('保存路径无效');
  });

  it('detects duplicate article saves without mutating knowledge state', () => {
    const saved = { [entry.id]: { ...knowledge, savedPath: 'RSS/本地 RSS.md', savedAt: 123 } };
    expect(isAlreadySaved(saved, entry.id, 'RSS/本地 RSS.md')).toBe(true);
    expect(isAlreadySaved(saved, entry.id, 'Other/本地 RSS.md')).toBe(true);
    expect(isAlreadySaved(saved, 'missing', 'RSS/本地 RSS.md')).toBe(false);
    expect(saved[entry.id]).toEqual({ ...knowledge, savedPath: 'RSS/本地 RSS.md', savedAt: 123 });
  });

  it('updates tags and notes while preserving a previous saved path', () => {
    const initial = { [entry.id]: { ...knowledge, savedPath: 'RSS/本地 RSS.md', savedAt: 123 } };
    const updated = updateArticleKnowledge(initial, entry.id, { tags: ['#news', 'news'], note: '新备注' });
    expect(updated[entry.id]).toEqual({ tags: ['news'], note: '新备注', savedPath: 'RSS/本地 RSS.md', savedAt: 123 });
    expect(initial[entry.id].note).toBe('值得回看');
  });

  it('records a validated target path when saving an article', () => {
    const updated = markArticleSaved({}, entry.id, 'RSS/本地 RSS.md', 123);
    expect(updated[entry.id]).toEqual({ tags: [], note: '', savedPath: 'RSS/本地 RSS.md', savedAt: 123 });
    expect(() => markArticleSaved({}, entry.id, '../outside.md')).toThrow('保存路径无效');
  });
});


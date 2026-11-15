import { describe, expect, it } from 'vitest';
import {
  DATAVIEW_INDEX_MARKER,
  DEFAULT_DATAVIEW_INDEX_FIELDS,
  renderDataviewIndex,
  normalizeDataviewFolder,
} from '../src/core/dataview';

describe('Dataview integration helpers', () => {
  it('renders an ordinary Markdown index with the configured folder and fields', () => {
    const markdown = renderDataviewIndex({
      saveFolder: 'RSS\\Articles',
      title: '我的 RSS 索引',
      fields: ['article', 'source', 'published', 'tags'],
    });

    expect(markdown).toContain(DATAVIEW_INDEX_MARKER);
    expect(markdown).toContain('# 我的 RSS 索引');
    expect(markdown).toContain('FROM "RSS/Articles"');
    expect(markdown).toContain('file.link AS "文章"');
    expect(markdown).toContain('source AS "来源"');
    expect(markdown).toContain('published AS "发布时间"');
    expect(markdown).toContain('tags AS "标签"');
    expect(markdown).toContain('WHERE file.path != this.file.path');
    expect(markdown.endsWith('\n')).toBe(true);
  });

  it('uses safe defaults and keeps the query independent of Dataview internals', () => {
    const markdown = renderDataviewIndex({ saveFolder: 'RSS Articles' });
    expect(markdown).toContain('# RSS 文章索引');
    for (const field of DEFAULT_DATAVIEW_INDEX_FIELDS) {
      expect(markdown).toContain(`AS "${({ article: '文章', source: '来源', published: '发布时间', tags: '标签', path: '路径' } as const)[field]}"`);
    }
    expect(markdown).toContain('```dataview');
    expect(markdown).not.toContain('app.plugins');
    expect(markdown).not.toContain('DataviewAPI');
  });

  it('deduplicates selected fields and supports the file path column', () => {
    const markdown = renderDataviewIndex({ saveFolder: 'RSS', fields: ['path', 'path', 'article'] });
    expect(markdown.match(/file\.path AS "路径"/g)).toHaveLength(1);
    expect(markdown.match(/file\.link AS "文章"/g)).toHaveLength(1);
  });

  it('rejects unsafe vault folders before placing them in a query', () => {
    expect(normalizeDataviewFolder('RSS\\Articles')).toBe('RSS/Articles');
    expect(() => normalizeDataviewFolder('')).toThrow('目录不能为空');
    expect(() => normalizeDataviewFolder('../outside')).toThrow('目录无效');
    expect(() => normalizeDataviewFolder('/outside')).toThrow('目录无效');
    expect(() => normalizeDataviewFolder('https://example.com')).toThrow('目录无效');
    expect(() => renderDataviewIndex({ saveFolder: 'RSS', fields: ['unknown' as never] })).toThrow('字段无效');
  });

  it('flattens line breaks in a custom heading so the generated note stays valid Markdown', () => {
    const markdown = renderDataviewIndex({ saveFolder: 'RSS', title: 'RSS\n索引' });
    expect(markdown).toContain('# RSS 索引');
    expect(markdown).not.toContain('# RSS\n索引');
  });
});

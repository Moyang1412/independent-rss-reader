import { describe, expect, it } from 'vitest';
import { CURRENT_STATE_VERSION } from '../src/core/model';
import { needsStateMigration, normalizeState } from '../src/core/state';

describe('state migrations', () => {
  it('normalizes a new empty state to the current version', () => {
    const state = normalizeState({});
    expect(state.version).toBe(CURRENT_STATE_VERSION);
    expect(state.subscriptions).toEqual([]);
    expect(state.deepseek.apiKey).toBe('');
    expect(state.aiSummaries).toEqual({});
    expect(state.savedEntries).toEqual([]);
    expect(state.lastReadBySubscription).toEqual({});
    expect(state.refresh.enabled).toBe(false);
    expect(state.refresh.intervalMinutes).toBe(30);
    expect(state.lastRefresh.newArticleCount).toBe(0);
    expect(state.cache.cacheImages).toBe(true);
    expect(state.articleKnowledge).toEqual({});
    expect(state.knowledge.saveFolder).toBe('RSS Articles');
    expect(state.knowledge.dailyNoteTemplate).toContain('{{title}}');
  });

  it('migrates legacy v1 data and removes the old daily note setting', () => {
    const state = normalizeState({ version: 1, dailyNoteFolder: 'Daily Notes', query: 'rss' });
    expect(state.version).toBe(CURRENT_STATE_VERSION);
    expect(state.query).toBe('rss');
    expect(needsStateMigration({ version: 1, dailyNoteFolder: 'Daily Notes' })).toBe(true);
    expect(needsStateMigration(state)).toBe(false);
  });

  it('preserves current optional data while migrating the version', () => {
    const state = normalizeState({ version: 1, deepseek: { enabled: true, apiKey: 'secret' }, aiSummaries: { one: { text: '摘要', createdAt: 1, model: 'deepseek-flash' } }, lastReadBySubscription: { feedA: 'entry-1' }, articleKnowledge: { one: { tags: ['rss'], note: '稍后整理', savedPath: 'RSS/one.md', savedAt: 1 } }, knowledge: { saveFolder: 'Clips', saveTemplate: '# {{title}}', dailyNoteTemplate: '- {{title}}' } });
    expect(state.deepseek.enabled).toBe(true);
    expect(state.aiSummaries.one.text).toBe('摘要');
    expect(state.lastReadBySubscription).toEqual({ feedA: 'entry-1' });
    expect(state.articleKnowledge.one.savedPath).toBe('RSS/one.md');
    expect(state.knowledge.saveFolder).toBe('Clips');
  });

  it('preserves stage 6 source IDs and health metadata', () => {
    const state = normalizeState({ version: 7, subscriptions: [{ id: 's', url: 'https://example.com/feed.xml', name: '示例', group: '', entries: [{ id: 'local:one', sourceId: 'guid:one', feedUrl: 'https://example.com/feed.xml', title: '文章', summary: '', content: '' }], updatedAt: 0, lastAttemptAt: 0, healthStatus: 'warning', healthCheckedAt: 123, healthError: '发生重定向' }] });
    expect(state.version).toBe(CURRENT_STATE_VERSION);
    expect(state.subscriptions[0].entries[0].sourceId).toBe('guid:one');
    expect(state.subscriptions[0].healthStatus).toBe('warning');
    expect(state.subscriptions[0].healthError).toBe('发生重定向');
  });

  it('rejects data from a future version', () => {
    expect(() => normalizeState({ version: CURRENT_STATE_VERSION + 1 })).toThrow('不支持的本地数据版本');
  });
});

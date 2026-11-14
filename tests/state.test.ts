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
    expect(state.remote.enabled).toBe(false);
    expect(state.remote.adapterId).toBe('json');
    expect(state.remote.timeoutMs).toBe(15_000);
    expect(state.remote).toEqual({ enabled: false, adapterId: 'json', baseUrl: '', apiKey: '', timeoutMs: 15_000 });
    expect(state.translation).toEqual({ enabled: false, targetLanguage: '中文' });
    expect(state.aiTranslations).toEqual({});
    expect(state.organization).toEqual({ enabled: false, targetLanguage: '中文' });
    expect(state.aiOrganizations).toEqual({});
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

  it('migrates stage 8 remote read-only settings and bindings', () => {
    const state = normalizeState({ version: 8, remote: { enabled: true, adapterId: 'json', baseUrl: 'https://remote.example/api', apiKey: 'token', timeoutMs: 4_000 }, subscriptions: [{ id: 'remote:json:tech', url: 'https://remote.example/api/subscriptions/tech', name: '技术', group: '', entries: [], updatedAt: 0, lastAttemptAt: 0, remote: { adapterId: 'json', subscriptionId: 'tech', readOnly: true } }] });
    expect(state.remote.enabled).toBe(true);
    expect(state.remote.baseUrl).toBe('https://remote.example/api');
    expect(state.subscriptions[0].remote?.readOnly).toBe(true);
  });

  it('migrates optional remote read-only settings and bindings', () => {
    const state = normalizeState({ version: 8, remote: { enabled: true, adapterId: 'json', baseUrl: 'https://reader.example/api', apiKey: 'secret', timeoutMs: 2_000 }, subscriptions: [{ id: 'remote:json:team', url: 'https://reader.example/api/subscriptions/team', name: '团队', group: '', entries: [], updatedAt: 1, lastAttemptAt: 1, remote: { adapterId: 'json', subscriptionId: 'team', readOnly: true } }] });
    expect(state.version).toBe(CURRENT_STATE_VERSION);
    expect(state.remote.enabled).toBe(true);
    expect(state.remote.baseUrl).toBe('https://reader.example/api');
    expect(state.subscriptions[0].remote).toEqual({ adapterId: 'json', subscriptionId: 'team', readOnly: true });
  });

  it('rejects data from a future version', () => {
    expect(() => normalizeState({ version: CURRENT_STATE_VERSION + 1 })).toThrow('不支持的本地数据版本');
  });

  it('migrates translation settings and cached translations from v9', () => {
    const state = normalizeState({ version: 9, translation: { enabled: true, targetLanguage: 'English' }, aiTranslations: { one: { text: 'Translated', createdAt: 1, targetLanguage: 'English', model: 'deepseek-flash' } } });
    expect(state.version).toBe(CURRENT_STATE_VERSION);
    expect(state.translation).toEqual({ enabled: true, targetLanguage: 'English' });
    expect(state.aiTranslations.one.text).toBe('Translated');
  });

  it('adds AI organization settings and cache when migrating from v10', () => {
    const state = normalizeState({ version: 10, translation: { enabled: false, targetLanguage: '中文' }, aiTranslations: {} });
    expect(state.version).toBe(CURRENT_STATE_VERSION);
    expect(state.organization).toEqual({ enabled: false, targetLanguage: '中文' });
    expect(state.aiOrganizations).toEqual({});
  });
});

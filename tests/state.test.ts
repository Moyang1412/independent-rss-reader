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
  });

  it('migrates legacy v1 data and removes the old daily note setting', () => {
    const state = normalizeState({ version: 1, dailyNoteFolder: 'Daily Notes', query: 'rss' });
    expect(state.version).toBe(CURRENT_STATE_VERSION);
    expect(state.query).toBe('rss');
    expect(needsStateMigration({ version: 1, dailyNoteFolder: 'Daily Notes' })).toBe(true);
    expect(needsStateMigration(state)).toBe(false);
  });

  it('preserves current optional data while migrating the version', () => {
    const state = normalizeState({ version: 1, deepseek: { enabled: true, apiKey: 'secret' }, aiSummaries: { one: { text: '摘要', createdAt: 1, model: 'deepseek-flash' } }, lastReadBySubscription: { feedA: 'entry-1' } });
    expect(state.deepseek.enabled).toBe(true);
    expect(state.aiSummaries.one.text).toBe('摘要');
    expect(state.lastReadBySubscription).toEqual({ feedA: 'entry-1' });
  });

  it('rejects data from a future version', () => {
    expect(() => normalizeState({ version: CURRENT_STATE_VERSION + 1 })).toThrow('不支持的本地数据版本');
  });
});

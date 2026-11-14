import { z } from 'zod';
import { CURRENT_STATE_VERSION, type StoredState } from './model';
import { DEFAULT_DEEPSEEK_CONFIG } from '../ai/deepseek';
import { DEFAULT_REFRESH_INTERVAL_MINUTES } from './refresh';
import { DEFAULT_DAILY_NOTE_TEMPLATE, DEFAULT_SAVE_FOLDER, DEFAULT_SAVE_TEMPLATE } from './knowledge';

const rawStateSchema = z.looseObject({ version: z.number().int().nonnegative().optional() });

function migratedObject(value: unknown): Record<string, unknown> {
  const parsed = rawStateSchema.parse(value ?? {});
  const version = parsed.version ?? 0;
  if (version > CURRENT_STATE_VERSION) throw new Error(`不支持的本地数据版本：${version}`);
  let data: Record<string, unknown> = { ...parsed };
  if (version < 1) data = { ...data, version: 1 };
  if (version < 2 || Object.hasOwn(data, 'dailyNoteFolder')) {
    const withoutLegacyDailyNote = Object.fromEntries(Object.entries(data).filter(([key]) => key !== 'dailyNoteFolder'));
    data = { ...withoutLegacyDailyNote, version: 2 };
  }
  if (version < 3) data = { ...data, version: CURRENT_STATE_VERSION, savedEntries: data.savedEntries || [] };
  if (version < 4) data = { ...data, version: CURRENT_STATE_VERSION, lastReadBySubscription: data.lastReadBySubscription || {} };
  if (version < 5) data = { ...data, version: CURRENT_STATE_VERSION, refresh: data.refresh || {}, lastRefresh: data.lastRefresh || {} };
  if (version < 6) data = { ...data, version: CURRENT_STATE_VERSION, cache: data.cache || {} };
  if (version < 7) data = { ...data, version: CURRENT_STATE_VERSION, articleKnowledge: data.articleKnowledge || {} };
  return data;
}

export function needsStateMigration(value: unknown): boolean {
  if (!value || typeof value !== 'object') return true;
  const raw = value as Record<string, unknown>;
  return raw.version !== CURRENT_STATE_VERSION || Object.hasOwn(raw, 'dailyNoteFolder');
}

const subscriptionSchema = z.object({
  id: z.string(), url: z.string(), name: z.string(), group: z.string().default(''),
  entries: z.array(z.object({
    id: z.string(), feedUrl: z.string(), title: z.string(), link: z.string().optional(), author: z.string().optional(),
    summary: z.string().default(''), content: z.string().default(''), publishedAt: z.number().optional(),
    publishedText: z.string().optional(), imageUrl: z.string().optional(), cachedImages: z.record(z.string(), z.string()).optional(), cachedAt: z.number().optional(),
  })).default([]), updatedAt: z.number().default(0),
  lastAttemptAt: z.number().default(0), error: z.string().optional(), etag: z.string().optional(),
  lastModified: z.string().optional(), paused: z.boolean().default(false), site: z.string().optional(), image: z.string().optional(),
  refreshFailureCount: z.number().int().nonnegative().default(0), nextRetryAt: z.number().nonnegative().default(0), lastNewCount: z.number().int().nonnegative().default(0),
  cacheLimit: z.number().int().min(1).max(10_000).default(50),
});

export const stateSchema = z.object({
  version: z.literal(CURRENT_STATE_VERSION).default(CURRENT_STATE_VERSION),
  subscriptions: z.array(subscriptionSchema).default([]),
  readIds: z.array(z.string()).default([]),
  favoriteIds: z.array(z.string()).default([]),
  laterIds: z.array(z.string()).default([]),
  selectedSubscriptionId: z.string().default(''),
  selectedEntryId: z.string().default(''),
  lastReadBySubscription: z.record(z.string(), z.string()).default({}),
  refresh: z.object({
    enabled: z.boolean().default(false),
    intervalMinutes: z.number().int().min(1).max(1_440).default(DEFAULT_REFRESH_INTERVAL_MINUTES),
    refreshOnOpen: z.boolean().default(false),
  }).default({ enabled: false, intervalMinutes: DEFAULT_REFRESH_INTERVAL_MINUTES, refreshOnOpen: false }),
  lastRefresh: z.object({
    startedAt: z.number().default(0), finishedAt: z.number().default(0), successCount: z.number().int().nonnegative().default(0),
    failedCount: z.number().int().nonnegative().default(0), skippedCount: z.number().int().nonnegative().default(0), newArticleCount: z.number().int().nonnegative().default(0),
  }).default({ startedAt: 0, finishedAt: 0, successCount: 0, failedCount: 0, skippedCount: 0, newArticleCount: 0 }),
  cache: z.object({ cacheImages: z.boolean().default(true) }).default({ cacheImages: true }),
  articleKnowledge: z.record(z.string(), z.object({
    tags: z.array(z.string()).default([]),
    note: z.string().default(''),
    savedPath: z.string().optional(),
    savedAt: z.number().optional(),
  })).default({}),
  knowledge: z.object({
    saveFolder: z.string().default(DEFAULT_SAVE_FOLDER),
    saveTemplate: z.string().default(DEFAULT_SAVE_TEMPLATE),
    dailyNoteTemplate: z.string().default(DEFAULT_DAILY_NOTE_TEMPLATE),
  }).default({ saveFolder: DEFAULT_SAVE_FOLDER, saveTemplate: DEFAULT_SAVE_TEMPLATE, dailyNoteTemplate: DEFAULT_DAILY_NOTE_TEMPLATE }),
  query: z.string().default(''),
  deepseek: z.object({
    enabled: z.boolean().default(DEFAULT_DEEPSEEK_CONFIG.enabled),
    apiKey: z.string().default(''),
    baseUrl: z.string().default(DEFAULT_DEEPSEEK_CONFIG.baseUrl),
    model: z.string().default(DEFAULT_DEEPSEEK_CONFIG.model),
    timeoutMs: z.number().int().positive().default(DEFAULT_DEEPSEEK_CONFIG.timeoutMs),
  }).default(DEFAULT_DEEPSEEK_CONFIG),
  aiSummaries: z.record(z.string(), z.object({
    text: z.string(),
    createdAt: z.number().default(0),
    model: z.string().default(''),
  })).default({}),
  savedEntries: z.array(z.object({
    id: z.string(), feedUrl: z.string(), title: z.string(), link: z.string().optional(), author: z.string().optional(),
    summary: z.string().default(''), content: z.string().default(''), publishedAt: z.number().optional(),
    publishedText: z.string().optional(), imageUrl: z.string().optional(), cachedImages: z.record(z.string(), z.string()).optional(), cachedAt: z.number().optional(),
  })).default([]),
});

export function normalizeState(value: unknown): StoredState {
  const parsed = stateSchema.parse(migratedObject(value));
  return {
    version: CURRENT_STATE_VERSION,
    subscriptions: parsed.subscriptions,
    readIds: parsed.readIds,
    favoriteIds: parsed.favoriteIds,
    laterIds: parsed.laterIds,
    selectedSubscriptionId: parsed.selectedSubscriptionId,
    selectedEntryId: parsed.selectedEntryId,
    lastReadBySubscription: parsed.lastReadBySubscription,
    refresh: parsed.refresh,
    lastRefresh: parsed.lastRefresh,
    cache: parsed.cache,
    articleKnowledge: parsed.articleKnowledge,
    knowledge: parsed.knowledge,
    query: parsed.query,
    deepseek: parsed.deepseek,
    aiSummaries: parsed.aiSummaries,
    savedEntries: parsed.savedEntries,
  };
}

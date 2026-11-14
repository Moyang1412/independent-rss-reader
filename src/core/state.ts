import { z } from 'zod';
import { CURRENT_STATE_VERSION, type StoredState } from './model';
import { DEFAULT_DEEPSEEK_CONFIG } from '../ai/deepseek';

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
    publishedText: z.string().optional(), imageUrl: z.string().optional(),
  })).default([]), updatedAt: z.number().default(0),
  lastAttemptAt: z.number().default(0), error: z.string().optional(), etag: z.string().optional(),
  lastModified: z.string().optional(), paused: z.boolean().default(false), site: z.string().optional(), image: z.string().optional(),
});

export const stateSchema = z.object({
  version: z.literal(CURRENT_STATE_VERSION).default(CURRENT_STATE_VERSION),
  subscriptions: z.array(subscriptionSchema).default([]),
  readIds: z.array(z.string()).default([]),
  favoriteIds: z.array(z.string()).default([]),
  laterIds: z.array(z.string()).default([]),
  selectedSubscriptionId: z.string().default(''),
  selectedEntryId: z.string().default(''),
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
    publishedText: z.string().optional(), imageUrl: z.string().optional(),
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
    query: parsed.query,
    deepseek: parsed.deepseek,
    aiSummaries: parsed.aiSummaries,
    savedEntries: parsed.savedEntries,
  };
}

import type { DeepSeekConfig } from '../ai/deepseek';

export const CURRENT_STATE_VERSION = 7 as const;
export const SAVED_ENTRIES_SUBSCRIPTION_ID = '__saved_entries__';

export type FeedFormat = 'rss' | 'rdf' | 'atom';

export interface FeedEntry {
  id: string;
  feedUrl: string;
  title: string;
  link?: string;
  author?: string;
  summary: string;
  content: string;
  publishedAt?: number;
  publishedText?: string;
  imageUrl?: string;
  cachedImages?: Record<string, string>;
  cachedAt?: number;
}

export interface ParsedFeed {
  url: string;
  format: FeedFormat;
  title: string;
  site?: string;
  image?: string;
  siteUrl?: string;
  imageUrl?: string;
  entries: FeedEntry[];
}

export interface Subscription {
  id: string;
  url: string;
  name: string;
  group: string;
  entries: FeedEntry[];
  updatedAt: number;
  lastAttemptAt: number;
  error?: string;
  etag?: string;
  lastModified?: string;
  paused?: boolean;
  refreshFailureCount?: number;
  nextRetryAt?: number;
  lastNewCount?: number;
  cacheLimit?: number;
  site?: string;
  image?: string;
}

export interface RefreshConfig {
  enabled: boolean;
  intervalMinutes: number;
  refreshOnOpen: boolean;
}

export interface RefreshSummary {
  startedAt: number;
  finishedAt: number;
  successCount: number;
  failedCount: number;
  skippedCount: number;
  newArticleCount: number;
}

export interface CacheConfig {
  cacheImages: boolean;
}

export interface ArticleKnowledge {
  tags: string[];
  note: string;
  savedPath?: string;
  savedAt?: number;
}

export interface KnowledgeConfig {
  saveFolder: string;
  saveTemplate: string;
  dailyNoteTemplate: string;
}

export interface OpmlFeed {
  url: string;
  name: string;
  group: string;
}

export interface StoredState {
  version: typeof CURRENT_STATE_VERSION;
  subscriptions: Subscription[];
  readIds: string[];
  favoriteIds: string[];
  laterIds: string[];
  selectedSubscriptionId?: string;
  selectedEntryId?: string;
  lastReadBySubscription: Record<string, string>;
  refresh: RefreshConfig;
  lastRefresh: RefreshSummary;
  cache: CacheConfig;
  articleKnowledge: Record<string, ArticleKnowledge>;
  knowledge: KnowledgeConfig;
  query: string;
  deepseek: DeepSeekConfig;
  aiSummaries: Record<string, AiSummary>;
  savedEntries: FeedEntry[];
}

export interface AiSummary {
  text: string;
  createdAt: number;
  model: string;
}

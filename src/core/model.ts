import type { DeepSeekConfig } from '../ai/deepseek';

export const CURRENT_STATE_VERSION = 2 as const;

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
  site?: string;
  image?: string;
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
  query: string;
  deepseek: DeepSeekConfig;
  aiSummaries: Record<string, AiSummary>;
}

export interface AiSummary {
  text: string;
  createdAt: number;
  model: string;
}

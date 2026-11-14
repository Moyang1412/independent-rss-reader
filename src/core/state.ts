import { z } from 'zod';
import type { StoredState, Subscription } from './model';

const subscriptionSchema = z.object({
  id: z.string(), url: z.string(), name: z.string(), group: z.string().default(''),
  entries: z.array(z.unknown()).default([]), updatedAt: z.number().default(0),
  lastAttemptAt: z.number().default(0), error: z.string().optional(), etag: z.string().optional(),
  lastModified: z.string().optional(), paused: z.boolean().default(false), site: z.string().optional(), image: z.string().optional(),
});

export const stateSchema = z.object({
  version: z.literal(1).default(1),
  subscriptions: z.array(subscriptionSchema).default([]),
  readIds: z.array(z.string()).default([]),
  favoriteIds: z.array(z.string()).default([]),
  laterIds: z.array(z.string()).default([]),
  selectedSubscriptionId: z.string().default(''),
  selectedEntryId: z.string().default(''),
  query: z.string().default(''),
});

export function normalizeState(value: unknown): StoredState {
  const parsed = stateSchema.parse(value ?? {});
  return {
    version: 1,
    subscriptions: parsed.subscriptions as Subscription[],
    readIds: parsed.readIds,
    favoriteIds: parsed.favoriteIds,
    laterIds: parsed.laterIds,
    selectedSubscriptionId: parsed.selectedSubscriptionId,
    selectedEntryId: parsed.selectedEntryId,
    query: parsed.query,
  };
}

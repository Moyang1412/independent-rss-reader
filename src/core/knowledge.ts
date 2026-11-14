import type { ArticleKnowledge, FeedEntry } from './model';

export const DEFAULT_SAVE_FOLDER = 'RSS Articles';
export const DEFAULT_SAVE_TEMPLATE = `---
title: {{title}}
source: {{source}}
published: {{publishedAt}}
tags: {{tags}}
---

# {{title}}

来源：{{source}}
发布时间：{{publishedAt}}
原文：{{link}}

{{content}}

备注：{{note}}
`;
export const DEFAULT_DAILY_NOTE_TEMPLATE = '- [{{title}}]({{link}}) — {{source}}';

export interface TemplateVariables {
  title: string;
  source: string;
  author: string;
  publishedAt: string;
  link: string;
  summary: string;
  content: string;
  tags: string;
  note: string;
}

export type ArticleKnowledgeMap = Readonly<Record<string, ArticleKnowledge>>;

export function normalizeTags(tags: readonly string[]): string[] {
  return [...new Set(tags.map(tag => tag.trim().replace(/^#+/, '')).filter(Boolean))];
}

export function renderTemplate(template: string, variables: TemplateVariables): string {
  return template.replace(/{{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*}}/g, (_, key: string) => variables[key as keyof TemplateVariables] || '');
}

export function htmlToMarkdown(html: string): string {
  return html
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|blockquote)>/gi, '\n\n')
    .replace(/<strong>(.*?)<\/strong>/gis, '**$1**')
    .replace(/<em>(.*?)<\/em>/gis, '*$1*')
    .replace(/<a\s+[^>]*href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gis, '[$2]($1)')
    .replace(/<img\s+[^>]*alt=["']([^"']*)["'][^>]*>/gis, '![$1]')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function templateVariables(entry: FeedEntry, source: string, knowledge: ArticleKnowledge): TemplateVariables {
  return {
    title: entry.title,
    source,
    author: entry.author || '',
    publishedAt: entry.publishedAt ? new Date(entry.publishedAt).toISOString() : (entry.publishedText || ''),
    link: entry.link || '',
    summary: entry.summary,
    content: htmlToMarkdown(entry.content),
    tags: normalizeTags(knowledge.tags).map(tag => `#${tag}`).join(' '),
    note: knowledge.note || '',
  };
}

export function renderDailyNoteEntry(
  input: { entry: FeedEntry; source?: string; tags?: readonly string[]; note?: string },
  template = DEFAULT_DAILY_NOTE_TEMPLATE,
): string {
  const variables = templateVariables(input.entry, input.source || input.entry.feedUrl, {
    tags: normalizeTags(input.tags || []),
    note: input.note || '',
  });
  const rendered = renderTemplate(template, variables).trimEnd();
  return `${rendered}\n`;
}

function validatePathValue(value: string, allowEmpty: boolean): string[] {
  const path = value.trim().replaceAll('\\', '/');
  if (!path && allowEmpty) return [];
  if (!path || path.startsWith('/') || path.startsWith('~') || /^[A-Za-z]:\//.test(path) || path.includes('://')) {
    throw new Error('保存路径无效');
  }
  if (/[[\]{}<>:"|?*]/.test(path) || [...path].some(character => character.charCodeAt(0) < 32)) throw new Error('保存路径无效');
  const parts = path.split('/');
  if (parts.some(part => !part || part === '.' || part === '..')) throw new Error('保存路径无效');
  return parts;
}

export function safeVaultPath(folder: string, filename: string): string {
  return [...validatePathValue(folder, true), ...validatePathValue(filename, false)].join('/');
}

export function articleFilename(entry: FeedEntry): string {
  const title = entry.title.replace(/[\\/:*?"<>|#[\]]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'article';
  const stableId = entry.id.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 12) || 'entry';
  return `${title} ${stableId}.md`;
}

/** A savedPath marks an article as saved regardless of the requested target path. */
export function isAlreadySaved(knowledge: Readonly<Record<string, ArticleKnowledge>>, entryId: string, path: string): boolean {
  return Boolean(path && entryId && knowledge[entryId]?.savedPath);
}

export function updateArticleKnowledge(
  knowledge: ArticleKnowledgeMap,
  entryId: string,
  patch: Partial<Pick<ArticleKnowledge, 'tags' | 'note'>>,
): Record<string, ArticleKnowledge> {
  if (!entryId) return { ...knowledge };
  const current = knowledge[entryId];
  return {
    ...knowledge,
    [entryId]: {
      tags: normalizeTags(patch.tags || current?.tags || []),
      note: patch.note ?? current?.note ?? '',
      ...(current?.savedPath ? { savedPath: current.savedPath } : {}),
      ...(typeof current?.savedAt === 'number' ? { savedAt: current.savedAt } : {}),
    },
  };
}

export function markArticleSaved(
  knowledge: ArticleKnowledgeMap,
  entryId: string,
  savedPath: string,
  savedAt = Date.now(),
): Record<string, ArticleKnowledge> {
  if (!entryId) return { ...knowledge };
  const normalizedPath = savedPath.replaceAll('\\', '/');
  const separator = normalizedPath.lastIndexOf('/');
  const folder = separator < 0 ? '' : normalizedPath.slice(0, separator);
  const filename = normalizedPath.slice(separator + 1);
  const path = safeVaultPath(folder, filename);
  const current = knowledge[entryId];
  return {
    ...knowledge,
    [entryId]: {
      tags: current?.tags ? [...current.tags] : [],
      note: current?.note || '',
      savedPath: path,
      savedAt,
    },
  };
}


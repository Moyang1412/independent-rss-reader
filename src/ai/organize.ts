import type { FeedEntry } from '../core/model';
import { DEFAULT_DEEPSEEK_CONFIG, DeepSeekClient, DeepSeekError, type DeepSeekConfig, type DeepSeekFetch } from './deepseek';

export const ORGANIZE_PROMPT_VERSION = 'v1';
export const MAX_ORGANIZE_INPUT_CHARS = 60_000;
export const MAX_ORGANIZE_TAGS = 12;
export const MAX_ORGANIZE_TAG_LENGTH = 60;
export const MAX_ORGANIZE_NOTE_LENGTH = 4_000;
export const MAX_ORGANIZE_SUMMARY_LENGTH = 2_000;

export interface ArticleOrganizationSuggestion {
  tags: string[];
  note: string;
  summary: string;
}

export interface OrganizeArticleOptions {
  language?: string;
  maxTokens?: number;
  promptVersion?: string;
}

function articleContent(entry: Pick<FeedEntry, 'title' | 'summary' | 'content'>): string {
  return [
    entry.title ? `标题：${entry.title}` : '',
    entry.summary ? `摘要：${entry.summary}` : '',
    entry.content ? `正文：${entry.content}` : '',
  ].filter(Boolean).join('\n\n').slice(0, MAX_ORGANIZE_INPUT_CHARS);
}

function normalizedText(value: unknown, maxLength: number, field: string): string {
  if (typeof value !== 'string') throw new DeepSeekError(`AI 整理返回的 ${field} 格式无效`);
  const text = value.trim();
  if (text.length > maxLength) throw new DeepSeekError(`AI 整理返回的 ${field} 过长`);
  return text;
}

function normalizedTags(value: unknown): string[] {
  if (!Array.isArray(value)) throw new DeepSeekError('AI 整理返回的标签格式无效');
  if (value.length > MAX_ORGANIZE_TAGS) throw new DeepSeekError('AI 整理返回的标签数量过多');
  const result: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== 'string') throw new DeepSeekError('AI 整理返回的标签格式无效');
    const tag = item.trim().replace(/^#+/, '').trim();
    if (!tag) continue;
    if (tag.length > MAX_ORGANIZE_TAG_LENGTH) throw new DeepSeekError('AI 整理返回的标签过长');
    const key = tag.toLocaleLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      result.push(tag);
    }
  }
  return result;
}

function jsonCandidate(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced) return fenced[1].trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  return start >= 0 && end > start ? trimmed.slice(start, end + 1) : trimmed;
}

export function parseArticleOrganizationResponse(raw: string): ArticleOrganizationSuggestion {
  let value: unknown;
  try {
    value = JSON.parse(jsonCandidate(raw));
  } catch {
    throw new DeepSeekError('AI 整理返回的 JSON 无效');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new DeepSeekError('AI 整理返回的对象无效');
  const record = value as Record<string, unknown>;
  return {
    tags: normalizedTags(record.tags),
    note: normalizedText(record.note ?? '', MAX_ORGANIZE_NOTE_LENGTH, '备注'),
    summary: normalizedText(record.summary ?? '', MAX_ORGANIZE_SUMMARY_LENGTH, '整理摘要'),
  };
}

export function organizeCacheKey(entryId: string, config: Pick<DeepSeekConfig, 'model'>, options: OrganizeArticleOptions = {}): string {
  const model = config.model.trim() || DEFAULT_DEEPSEEK_CONFIG.model;
  const language = options.language?.trim() || '中文';
  const promptVersion = options.promptVersion?.trim() || ORGANIZE_PROMPT_VERSION;
  return `${entryId}::${model}::${language}::${promptVersion}`;
}

export class ArticleOrganizer {
  private readonly client: DeepSeekClient;

  constructor(private readonly config: DeepSeekConfig, fetchFn: DeepSeekFetch = fetch) {
    this.client = new DeepSeekClient(config, fetchFn);
  }

  async organize(entry: Pick<FeedEntry, 'title' | 'summary' | 'content'>, options: OrganizeArticleOptions = {}): Promise<ArticleOrganizationSuggestion> {
    const content = articleContent(entry);
    if (!content) throw new DeepSeekError('文章没有可供整理的内容');
    const language = options.language?.trim() || '中文';
    const promptVersion = options.promptVersion?.trim() || ORGANIZE_PROMPT_VERSION;
    const raw = await this.client.chat([
      {
        role: 'system',
        content: `你是 RSS 阅读器中的知识整理助手。请用${language}阅读文章，并只输出一个 JSON 对象，不要 Markdown 代码块，不要解释。JSON 必须包含三个字段：tags（字符串数组，最多${MAX_ORGANIZE_TAGS}个，不要带 #）、note（适合保存到个人笔记的简短整理建议）、summary（文章的一句话整理摘要）。不得编造文章没有提到的事实。提示版本：${promptVersion}`,
      },
      { role: 'user', content: `请整理下面这篇文章：\n\n${content}` },
    ], { maxTokens: options.maxTokens || 1_024 });
    return parseArticleOrganizationResponse(raw);
  }
}

export async function organizeArticleWithDeepSeek(
  config: DeepSeekConfig,
  entry: Pick<FeedEntry, 'title' | 'summary' | 'content'>,
  options: OrganizeArticleOptions = {},
): Promise<ArticleOrganizationSuggestion> {
  return new ArticleOrganizer(config).organize(entry, options);
}

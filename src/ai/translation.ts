import type { FeedEntry } from '../core/model';
import { DEFAULT_DEEPSEEK_CONFIG, DeepSeekClient, DeepSeekError, type DeepSeekConfig, type DeepSeekFetch } from './deepseek';

export const DEFAULT_TRANSLATION_TARGET_LANGUAGE = '中文';
export const MAX_TRANSLATION_INPUT_CHARS = 60_000;

export interface TranslationConfig extends DeepSeekConfig {
  targetLanguage: string;
}

export const DEFAULT_TRANSLATION_CONFIG: TranslationConfig = {
  ...DEFAULT_DEEPSEEK_CONFIG,
  targetLanguage: DEFAULT_TRANSLATION_TARGET_LANGUAGE,
};

export class TranslationError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'TranslationError';
  }
}

export interface TranslationOptions {
  targetLanguage?: string;
  maxTokens?: number;
  signal?: AbortSignal;
}

function translationInput(entry: Pick<FeedEntry, 'title' | 'summary' | 'content'>) {
  return [
    entry.title ? `标题：${entry.title}` : '',
    entry.summary ? `摘要：${entry.summary}` : '',
    entry.content ? `正文：${entry.content}` : '',
  ].filter(Boolean).join('\n\n').slice(0, MAX_TRANSLATION_INPUT_CHARS);
}

export class TranslationClient {
  private readonly config: TranslationConfig;
  private readonly chat: DeepSeekClient;

  constructor(config: TranslationConfig, fetchFn: DeepSeekFetch = fetch) {
    this.config = { ...DEFAULT_TRANSLATION_CONFIG, ...config };
    this.chat = new DeepSeekClient(this.config, fetchFn);
  }

  async translate(entry: Pick<FeedEntry, 'title' | 'summary' | 'content'>, options: TranslationOptions = {}): Promise<string> {
    if (!this.config.enabled) throw new TranslationError('请先在设置中启用文章翻译');
    const content = translationInput(entry);
    if (!content) throw new TranslationError('文章没有可供翻译的内容');
    const targetLanguage = options.targetLanguage?.trim() || this.config.targetLanguage.trim() || DEFAULT_TRANSLATION_TARGET_LANGUAGE;
    try {
      return await this.chat.chat([
        { role: 'system', content: `你是 RSS 阅读器中的文章翻译助手。请把输入内容翻译成${targetLanguage}，准确保留原意、专有名词、段落和列表结构。只输出译文，不要解释翻译过程，不要添加原文没有的事实。` },
        { role: 'user', content: `请翻译下面这篇文章：\n\n${content}` },
      ], { maxTokens: options.maxTokens || 4_096, signal: options.signal });
    } catch (error) {
      if (error instanceof TranslationError) throw error;
      if (error instanceof DeepSeekError) throw new TranslationError(error.message, error.status);
      throw new TranslationError(error instanceof Error ? `文章翻译失败：${error.message}` : '文章翻译失败');
    }
  }
}

export function translateWithDeepSeek(config: TranslationConfig, entry: Pick<FeedEntry, 'title' | 'summary' | 'content'>, options: TranslationOptions = {}) {
  return new TranslationClient(config).translate(entry, options);
}

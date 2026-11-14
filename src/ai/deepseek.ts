import type { FeedEntry } from '../core/model';

export const DEFAULT_DEEPSEEK_BASE_URL = 'https://api.deepseek.com';
export const DEFAULT_DEEPSEEK_MODEL = 'deepseek-flash';
export const DEFAULT_DEEPSEEK_TIMEOUT_MS = 30_000;
export const MAX_SUMMARY_INPUT_CHARS = 60_000;

export interface DeepSeekConfig {
  enabled: boolean;
  apiKey: string;
  baseUrl: string;
  model: string;
  timeoutMs: number;
}

export const DEFAULT_DEEPSEEK_CONFIG: DeepSeekConfig = {
  enabled: false,
  apiKey: '',
  baseUrl: DEFAULT_DEEPSEEK_BASE_URL,
  model: DEFAULT_DEEPSEEK_MODEL,
  timeoutMs: DEFAULT_DEEPSEEK_TIMEOUT_MS,
};

export interface DeepSeekChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface DeepSeekChatOptions {
  system?: string;
  maxTokens?: number;
  signal?: AbortSignal;
}

export type DeepSeekFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export class DeepSeekError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'DeepSeekError';
  }
}

function normalizedBaseUrl(value: string): string {
  const raw = value.trim() || DEFAULT_DEEPSEEK_BASE_URL;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new DeepSeekError('DeepSeek 接口地址无效');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new DeepSeekError('DeepSeek 接口地址必须使用 HTTP(S)');
  url.pathname = url.pathname.replace(/\/+$/, '');
  return url.toString().replace(/\/$/, '');
}

function responseText(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return '';
  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || !choices.length) return '';
  const message = choices[0] && typeof choices[0] === 'object' ? (choices[0] as { message?: unknown }).message : undefined;
  if (!message || typeof message !== 'object') return '';
  const content = (message as { content?: unknown }).content;
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) return content.filter(item => typeof item === 'string').join('').trim();
  return '';
}

export class DeepSeekClient {
  private readonly config: DeepSeekConfig;
  private readonly fetchFn: DeepSeekFetch;

  constructor(config: DeepSeekConfig, fetchFn: DeepSeekFetch = fetch) {
    this.config = { ...DEFAULT_DEEPSEEK_CONFIG, ...config };
    this.fetchFn = fetchFn;
  }

  async chat(messages: DeepSeekChatMessage[], options: DeepSeekChatOptions = {}): Promise<string> {
    const apiKey = this.config.apiKey.trim();
    if (!this.config.enabled) throw new DeepSeekError('请先在设置中启用 DeepSeek');
    if (!apiKey) throw new DeepSeekError('请先填写 DeepSeek API Key');
    if (!messages.length) throw new DeepSeekError('DeepSeek 请求缺少消息');
    const model = this.config.model.trim() || DEFAULT_DEEPSEEK_MODEL;
    const timeoutMs = Number.isFinite(this.config.timeoutMs) && this.config.timeoutMs > 0 ? this.config.timeoutMs : DEFAULT_DEEPSEEK_TIMEOUT_MS;
    const controller = new AbortController();
    const timerHost = typeof window === 'undefined' ? globalThis : window;
    const timer = timerHost.setTimeout(() => controller.abort(), timeoutMs);
    if (options.signal) {
      if (options.signal.aborted) controller.abort();
      else options.signal.addEventListener('abort', () => controller.abort(), { once: true });
    }
    try {
      const body: Record<string, unknown> = { model, messages, stream: false };
      if (options.maxTokens) body.max_tokens = options.maxTokens;
      const response = await this.fetchFn(`${normalizedBaseUrl(this.config.baseUrl)}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const raw = await response.text();
      let payload: unknown;
      try { payload = raw ? JSON.parse(raw) : undefined; } catch { payload = undefined; }
      if (!response.ok) {
        const detail = payload && typeof payload === 'object' && 'error' in payload && typeof (payload as { error?: unknown }).error === 'object'
          ? (payload as { error: { message?: unknown } }).error.message : undefined;
        throw new DeepSeekError(typeof detail === 'string' ? `DeepSeek 请求失败（HTTP ${response.status}）：${detail}` : `DeepSeek 请求失败（HTTP ${response.status}）`, response.status);
      }
      const text = responseText(payload);
      if (!text) throw new DeepSeekError('DeepSeek 返回了空结果');
      return text;
    } catch (error) {
      if (error instanceof DeepSeekError) throw error;
      if (error instanceof DOMException && error.name === 'AbortError') throw new DeepSeekError('DeepSeek 请求超时');
      if (error instanceof Error && error.name === 'AbortError') throw new DeepSeekError('DeepSeek 请求超时');
      throw new DeepSeekError(error instanceof Error ? `DeepSeek 请求失败：${error.message}` : 'DeepSeek 请求失败');
    } finally {
      timerHost.clearTimeout(timer);
    }
  }

  async summarize(entry: Pick<FeedEntry, 'title' | 'summary' | 'content'>, options: { language?: string; maxTokens?: number } = {}): Promise<string> {
    const language = options.language?.trim() || '中文';
    const content = [entry.title ? `标题：${entry.title}` : '', entry.summary ? `摘要：${entry.summary}` : '', entry.content ? `正文：${entry.content}` : '']
      .filter(Boolean).join('\n\n').slice(0, MAX_SUMMARY_INPUT_CHARS);
    if (!content) throw new DeepSeekError('文章没有可供摘要的内容');
    return this.chat([
      { role: 'system', content: `你是 RSS 阅读器中的文章摘要助手。请用${language}输出简洁、准确的摘要，不要编造文章没有提到的事实。` },
      { role: 'user', content: `请概括下面这篇文章，输出 3-5 条要点，最后补充一句话总结。\n\n${content}` },
    ], { maxTokens: options.maxTokens || 1_024 });
  }
}

export async function summarizeWithDeepSeek(config: DeepSeekConfig, entry: Pick<FeedEntry, 'title' | 'summary' | 'content'>): Promise<string> {
  return new DeepSeekClient(config).summarize(entry);
}

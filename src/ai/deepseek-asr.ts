import { DeepSeekError, DEFAULT_DEEPSEEK_BASE_URL, type DeepSeekConfig, type DeepSeekFetch } from './deepseek';

export const DEEPSEEK_ASR_PATH = '/v1/tools/asr';
export const MAX_ASR_FILE_BYTES = 8 * 1024 * 1024;
export const MAX_ASR_DURATION_MS = 120_000;

export interface DeepSeekAudioInput {
  data: Blob | ArrayBuffer | Uint8Array;
  filename?: string;
  mimeType?: string;
  durationMs?: number;
}

export interface DeepSeekAsrResult {
  requestId: string;
  text: string;
  durationMs: number;
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

function asBlob(input: DeepSeekAudioInput): Blob {
  if (input.data instanceof Blob) return input.data;
  if (input.data instanceof ArrayBuffer) return new Blob([input.data], { type: input.mimeType || 'application/octet-stream' });
  const bytes = new Uint8Array(input.data);
  return new Blob([bytes.buffer], { type: input.mimeType || 'application/octet-stream' });
}

function looksLikeSupportedAudio(input: DeepSeekAudioInput, blob: Blob): boolean {
  const mime = (input.mimeType || blob.type || '').toLowerCase().split(';', 1)[0].trim();
  if (mime && !['audio/wav', 'audio/wave', 'audio/x-wav', 'audio/ogg', 'audio/opus', 'application/ogg'].includes(mime)) return false;
  const filename = (input.filename || '').toLowerCase();
  return !filename || /\.(wav|ogg|opus)$/.test(filename) || mime !== '';
}

function errorMessage(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') return undefined;
  const error = (payload as { error?: unknown }).error;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object' && typeof (error as { message?: unknown }).message === 'string') return (error as { message: string }).message;
  return typeof (payload as { message?: unknown }).message === 'string' ? (payload as { message: string }).message : undefined;
}

export class DeepSeekAsrClient {
  private readonly config: DeepSeekConfig;
  private readonly fetchFn: DeepSeekFetch;

  constructor(config: DeepSeekConfig, fetchFn: DeepSeekFetch = fetch) {
    this.config = { ...config };
    this.fetchFn = fetchFn;
  }

  async transcribe(input: DeepSeekAudioInput): Promise<DeepSeekAsrResult> {
    const apiKey = this.config.apiKey.trim();
    if (!this.config.enabled) throw new DeepSeekError('请先在设置中启用 DeepSeek');
    if (!apiKey) throw new DeepSeekError('请先填写 DeepSeek API Key');
    const blob = asBlob(input);
    if (blob.size > MAX_ASR_FILE_BYTES) throw new DeepSeekError('音频文件不能超过 8 MiB');
    if (input.durationMs !== undefined && input.durationMs > MAX_ASR_DURATION_MS) throw new DeepSeekError('音频时长不能超过 120 秒');
    if (input.durationMs !== undefined && input.durationMs < 0) throw new DeepSeekError('音频时长无效');
    if (!looksLikeSupportedAudio(input, blob)) throw new DeepSeekError('只支持 16-bit PCM WAV 或 Ogg Opus 音频');

    const form = new FormData();
    const filename = input.filename || (blob.type.toLowerCase().includes('ogg') || blob.type.toLowerCase().includes('opus') ? 'recording.ogg' : 'recording.wav');
    form.append('file', blob, filename);
    const timeoutMs = Number.isFinite(this.config.timeoutMs) && this.config.timeoutMs > 0 ? this.config.timeoutMs : 30_000;
    const controller = new AbortController();
    const timerHost = typeof window === 'undefined' ? globalThis : window;
    const timer = timerHost.setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await this.fetchFn(`${normalizedBaseUrl(this.config.baseUrl)}${DEEPSEEK_ASR_PATH}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
        body: form,
        signal: controller.signal,
      });
      const raw = await response.text();
      let payload: unknown;
      try { payload = raw ? JSON.parse(raw) : undefined; } catch { payload = undefined; }
      if (!response.ok) {
        const detail = errorMessage(payload);
        throw new DeepSeekError(detail ? `DeepSeek 语音识别失败（HTTP ${response.status}）：${detail}` : `DeepSeek 语音识别失败（HTTP ${response.status}）`, response.status);
      }
      if (!payload || typeof payload !== 'object') throw new DeepSeekError('DeepSeek 语音识别返回格式无效');
      const result = payload as { request_id?: unknown; text?: unknown; duration_ms?: unknown };
      if (typeof result.request_id !== 'string' || typeof result.text !== 'string' || typeof result.duration_ms !== 'number') throw new DeepSeekError('DeepSeek 语音识别返回格式无效');
      return { requestId: result.request_id, text: result.text.trim(), durationMs: result.duration_ms };
    } catch (error) {
      if (error instanceof DeepSeekError) throw error;
      if (error instanceof DOMException && error.name === 'AbortError') throw new DeepSeekError('DeepSeek 语音识别请求超时');
      if (error instanceof Error && error.name === 'AbortError') throw new DeepSeekError('DeepSeek 语音识别请求超时');
      throw new DeepSeekError(error instanceof Error ? `DeepSeek 语音识别失败：${error.message}` : 'DeepSeek 语音识别失败');
    } finally {
      timerHost.clearTimeout(timer);
    }
  }
}

export function createDeepSeekAsrClient(config: DeepSeekConfig, fetchFn?: DeepSeekFetch) {
  return new DeepSeekAsrClient(config, fetchFn);
}

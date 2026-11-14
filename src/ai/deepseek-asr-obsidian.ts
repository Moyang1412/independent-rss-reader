import { requestUrl } from 'obsidian';
import { DeepSeekAsrClient, type DeepSeekAudioInput } from './deepseek-asr';
import type { DeepSeekConfig } from './deepseek';

async function obsidianFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  const headers = { ...((init.headers || {}) as Record<string, string>) };
  let body: string | ArrayBuffer | undefined;
  if (init.body instanceof FormData) {
    const file = init.body.get('file');
    if (!(file instanceof Blob)) throw new Error('语音请求缺少音频文件');
    const boundary = `----DeepSeekASR${Math.random().toString(16).slice(2)}`;
    const filename = 'name' in file && typeof file.name === 'string' ? file.name : 'recording.wav';
    const prefix = new TextEncoder().encode(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename.replaceAll('"', '')}"\r\nContent-Type: ${file.type || 'application/octet-stream'}\r\n\r\n`);
    const suffix = new TextEncoder().encode(`\r\n--${boundary}--\r\n`);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const combined = new Uint8Array(prefix.byteLength + bytes.byteLength + suffix.byteLength);
    combined.set(prefix, 0); combined.set(bytes, prefix.byteLength); combined.set(suffix, prefix.byteLength + bytes.byteLength);
    body = combined.buffer;
    headers['Content-Type'] = `multipart/form-data; boundary=${boundary}`;
  } else if (typeof init.body === 'string' || init.body instanceof ArrayBuffer) {
    body = init.body;
  }
  const response = await requestUrl({
    url,
    method: init.method || 'GET',
    headers,
    body,
    throw: false,
  });
  return new Response(response.text, { status: response.status, headers: response.headers });
}

export function createObsidianDeepSeekAsrClient(config: DeepSeekConfig, _input?: DeepSeekAudioInput) {
  return new DeepSeekAsrClient(config, obsidianFetch);
}

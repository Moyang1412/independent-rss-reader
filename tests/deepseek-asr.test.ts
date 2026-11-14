import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_DEEPSEEK_CONFIG, type DeepSeekFetch } from '../src/ai/deepseek';
import { DeepSeekAsrClient, MAX_ASR_DURATION_MS, MAX_ASR_FILE_BYTES } from '../src/ai/deepseek-asr';

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

const config = { ...DEFAULT_DEEPSEEK_CONFIG, enabled: true, apiKey: 'secret' };

describe('DeepSeek ASR adapter', () => {
  it('sends only a multipart file to the ASR endpoint', async () => {
    const fetchFn = vi.fn<DeepSeekFetch>(async (_input, init) => {
      expect(init?.method).toBe('POST');
      expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer secret');
      const form = init?.body as FormData;
      expect(form.get('file')).toBeInstanceOf(Blob);
      expect(form.get('model')).toBeNull();
      expect(form.get('language')).toBeNull();
      return response({ request_id: 'req-1', text: '你好，世界', duration_ms: 1200 });
    });
    const result = await new DeepSeekAsrClient(config, fetchFn).transcribe({ data: new Blob(['wav'], { type: 'audio/wav' }), filename: 'speech.wav', durationMs: 1200 });
    expect(fetchFn.mock.calls[0][0]).toBe('https://api.deepseek.com/v1/tools/asr');
    expect(result).toEqual({ requestId: 'req-1', text: '你好，世界', durationMs: 1200 });
  });

  it('rejects size and duration limits before a network request', async () => {
    const fetchFn = vi.fn<DeepSeekFetch>();
    const client = new DeepSeekAsrClient(config, fetchFn);
    await expect(client.transcribe({ data: new Uint8Array(MAX_ASR_FILE_BYTES + 1), filename: 'speech.wav' })).rejects.toThrow('8 MiB');
    await expect(client.transcribe({ data: new Blob(['wav'], { type: 'audio/wav' }), filename: 'speech.wav', durationMs: MAX_ASR_DURATION_MS + 1 })).rejects.toThrow('120 秒');
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('rejects disabled configuration, unsupported audio, and API errors', async () => {
    const fetchFn = vi.fn<DeepSeekFetch>(async () => response({ error: { message: 'bad audio' } }, 400));
    await expect(new DeepSeekAsrClient(DEFAULT_DEEPSEEK_CONFIG, fetchFn).transcribe({ data: new Blob(['x'], { type: 'audio/webm' }), filename: 'speech.webm' })).rejects.toThrow('启用 DeepSeek');
    await expect(new DeepSeekAsrClient(config, fetchFn).transcribe({ data: new Blob(['x'], { type: 'audio/webm' }), filename: 'speech.webm' })).rejects.toThrow('WAV 或 Ogg');
    await expect(new DeepSeekAsrClient(config, fetchFn).transcribe({ data: new Blob(['x'], { type: 'audio/wav' }), filename: 'speech.wav' })).rejects.toMatchObject({ status: 400 });
  });
});

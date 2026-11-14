import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_TRANSLATION_CONFIG, MAX_TRANSLATION_INPUT_CHARS, TranslationClient, TranslationError, type TranslationConfig } from '../src/ai/translation';
import type { DeepSeekFetch } from '../src/ai/deepseek';

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('article translation adapter', () => {
  it('sends only the selected article to the chat endpoint and returns translated text', async () => {
    const fetchFn = vi.fn<DeepSeekFetch>(async () => response({ choices: [{ message: { content: 'Translated article' } }] }));
    const config: TranslationConfig = { ...DEFAULT_TRANSLATION_CONFIG, enabled: true, apiKey: 'secret', targetLanguage: 'English' };
    await expect(new TranslationClient(config, fetchFn).translate({ title: '标题', summary: '摘要', content: '正文' })).resolves.toBe('Translated article');
    const [, init] = fetchFn.mock.calls[0] as [RequestInfo | URL, RequestInit | undefined];
    const body = JSON.parse(init?.body as string) as { messages: Array<{ content: string }>; max_tokens: number };
    expect(body.max_tokens).toBe(4_096);
    expect(body.messages[0].content).toContain('English');
    expect(body.messages[1].content).toContain('正文');
    expect(body.messages[1].content).not.toContain('整个库');
  });

  it('truncates oversized article input before sending it', async () => {
    const fetchFn = vi.fn<DeepSeekFetch>(async () => response({ choices: [{ message: { content: 'ok' } }] }));
    const content = 'x'.repeat(MAX_TRANSLATION_INPUT_CHARS + 10_000);
    await new TranslationClient({ ...DEFAULT_TRANSLATION_CONFIG, enabled: true, apiKey: 'secret' }, fetchFn).translate({ title: '', summary: '', content });
    const [, init] = fetchFn.mock.calls[0] as [RequestInfo | URL, RequestInit | undefined];
    const body = JSON.parse(init?.body as string) as { messages: Array<{ content: string }> };
    expect(body.messages[1].content.length).toBeLessThanOrEqual(MAX_TRANSLATION_INPUT_CHARS + 20);
  });

  it('keeps translation optional and reports provider failures as translation errors', async () => {
    const disabled = new TranslationClient(DEFAULT_TRANSLATION_CONFIG, async () => response({}));
    await expect(disabled.translate({ title: '标题', summary: '', content: '正文' })).rejects.toMatchObject({ name: 'TranslationError' });
    const failed = new TranslationClient({ ...DEFAULT_TRANSLATION_CONFIG, enabled: true, apiKey: 'bad' }, async () => response({ error: { message: 'bad key' } }, 401));
    await expect(failed.translate({ title: '标题', summary: '', content: '正文' })).rejects.toMatchObject({ name: 'TranslationError', status: 401 });
  });

  it('rejects empty articles before making a request', async () => {
    const fetchFn = vi.fn<DeepSeekFetch>(async () => response({ choices: [{ message: { content: 'unused' } }] }));
    const client = new TranslationClient({ ...DEFAULT_TRANSLATION_CONFIG, enabled: true, apiKey: 'secret' }, fetchFn);
    await expect(client.translate({ title: '', summary: '', content: '' })).rejects.toBeInstanceOf(TranslationError);
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

import { describe, expect, it, vi } from 'vitest';
import { DeepSeekClient, DeepSeekError, DEFAULT_DEEPSEEK_CONFIG, type DeepSeekFetch } from '../src/ai/deepseek';
import { normalizeState } from '../src/core/state';

vi.mock('obsidian', () => ({ requestUrl: vi.fn() }));

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('DeepSeek adapter', () => {
  it('sends a chat completions request and returns the summary', async () => {
    const fetchFn = vi.fn<DeepSeekFetch>(async () => response({ choices: [{ message: { content: '摘要结果' } }] }));
    const client = new DeepSeekClient({ ...DEFAULT_DEEPSEEK_CONFIG, enabled: true, apiKey: 'secret' }, fetchFn);
    await expect(client.summarize({ title: '标题', summary: '简介', content: '正文' })).resolves.toBe('摘要结果');
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0] as [RequestInfo | URL, RequestInit | undefined];
    expect(url).toBe('https://api.deepseek.com/chat/completions');
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer secret');
    expect(JSON.parse(init?.body as string)).toMatchObject({ model: 'deepseek-flash', stream: false });
  });

  it('reports API errors and missing key', async () => {
    const client = new DeepSeekClient({ ...DEFAULT_DEEPSEEK_CONFIG, enabled: true, apiKey: 'bad' }, async () => response({ error: { message: 'bad key' } }, 401));
    await expect(client.chat([{ role: 'user', content: 'hi' }])).rejects.toMatchObject({ name: 'DeepSeekError', status: 401 });
    const disabled = new DeepSeekClient(DEFAULT_DEEPSEEK_CONFIG, async () => response({}));
    await expect(disabled.chat([{ role: 'user', content: 'hi' }])).rejects.toBeInstanceOf(DeepSeekError);
  });

  it('keeps existing local state compatible without DeepSeek settings', () => {
    const state = normalizeState({});
    expect(state.deepseek).toEqual(DEFAULT_DEEPSEEK_CONFIG);
  });
});

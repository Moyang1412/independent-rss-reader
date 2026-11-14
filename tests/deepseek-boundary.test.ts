import { describe, expect, it, vi } from 'vitest';
import { DeepSeekClient, DeepSeekError, DEFAULT_DEEPSEEK_CONFIG } from '../src/ai/deepseek';

vi.mock('obsidian', () => ({ requestUrl: vi.fn() }));

describe('DeepSeek optional boundary', () => {
  it('does not call the network when the adapter is disabled or has no key', async () => {
    const fetchFn = vi.fn();
    const disabled = new DeepSeekClient(DEFAULT_DEEPSEEK_CONFIG, fetchFn);
    await expect(disabled.summarize({ title: '文章', summary: '摘要', content: '正文' })).rejects.toBeInstanceOf(DeepSeekError);
    const missingKey = new DeepSeekClient({ ...DEFAULT_DEEPSEEK_CONFIG, enabled: true }, fetchFn);
    await expect(missingKey.summarize({ title: '文章', summary: '摘要', content: '正文' })).rejects.toThrow('API Key');
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('rejects an invalid base URL before sending article data', async () => {
    const fetchFn = vi.fn();
    const client = new DeepSeekClient({ ...DEFAULT_DEEPSEEK_CONFIG, enabled: true, apiKey: 'local-secret', baseUrl: 'ftp://example.test' }, fetchFn);
    await expect(client.summarize({ title: '文章', summary: '摘要', content: '正文' })).rejects.toThrow('HTTP(S)');
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

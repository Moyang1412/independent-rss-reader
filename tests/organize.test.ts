import { describe, expect, it, vi } from 'vitest';
import { ArticleOrganizer, ORGANIZE_PROMPT_VERSION, organizeCacheKey, parseArticleOrganizationResponse } from '../src/ai/organize';
import { DEFAULT_DEEPSEEK_CONFIG, type DeepSeekFetch } from '../src/ai/deepseek';

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

const entry = { title: '文章标题', summary: '文章摘要', content: '文章正文' };

describe('AI article organization adapter', () => {
  it('requests strict JSON and normalizes the returned suggestion', async () => {
    const fetchFn = vi.fn<DeepSeekFetch>(async () => response({ choices: [{ message: { content: '{"tags":["#RSS","RSS","知识管理"],"note":"值得回看","summary":"文章讨论个人知识管理。"}' } }] }));
    const organizer = new ArticleOrganizer({ ...DEFAULT_DEEPSEEK_CONFIG, enabled: true, apiKey: 'secret' }, fetchFn);
    await expect(organizer.organize(entry)).resolves.toEqual({ tags: ['RSS', '知识管理'], note: '值得回看', summary: '文章讨论个人知识管理。' });
    const body = JSON.parse(fetchFn.mock.calls[0][1]?.body as string) as { messages?: Array<{ content?: string }> };
    const systemPrompt = body.messages?.[0]?.content || '';
    expect(systemPrompt).toContain('只输出一个 JSON 对象');
    expect(systemPrompt).toContain(ORGANIZE_PROMPT_VERSION);
  });

  it('accepts fenced JSON with surrounding text', () => {
    expect(parseArticleOrganizationResponse('结果如下：\n```json\n{"tags":["技术"],"note":"稍后整理","summary":"一句话"}\n```')).toEqual({ tags: ['技术'], note: '稍后整理', summary: '一句话' });
  });

  it('rejects malformed or unsafe structures', () => {
    expect(() => parseArticleOrganizationResponse('不是 JSON')).toThrow('JSON 无效');
    expect(() => parseArticleOrganizationResponse('{"tags":"技术","note":"","summary":""}')).toThrow('标签格式无效');
    expect(() => parseArticleOrganizationResponse(`{"tags":["${'x'.repeat(61)}"],"note":"","summary":""}`)).toThrow('标签过长');
  });

  it('keeps cache keys stable and prompt-versioned', () => {
    expect(organizeCacheKey('entry-1', { model: 'deepseek-flash' })).toBe(`entry-1::deepseek-flash::中文::${ORGANIZE_PROMPT_VERSION}`);
    expect(organizeCacheKey('entry-1', { model: 'deepseek-flash' }, { language: 'English', promptVersion: 'v2' })).toBe('entry-1::deepseek-flash::English::v2');
  });

  it('keeps local flow independent when DeepSeek is disabled', async () => {
    const fetchFn = vi.fn<DeepSeekFetch>(async () => response({}));
    const organizer = new ArticleOrganizer(DEFAULT_DEEPSEEK_CONFIG, fetchFn);
    await expect(organizer.organize(entry)).rejects.toThrow('启用 DeepSeek');
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

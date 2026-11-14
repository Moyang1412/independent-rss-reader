import { requestUrl } from 'obsidian';
import { TranslationClient, type TranslationConfig } from './translation';

async function obsidianFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const requestBody = typeof init.body === 'string' ? init.body : undefined;
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  const response = await requestUrl({
    url,
    method: init.method || 'GET',
    headers: (init.headers || {}) as Record<string, string>,
    body: requestBody,
    throw: false,
  });
  return new Response(response.text, { status: response.status, headers: response.headers });
}

export function createObsidianTranslationClient(config: TranslationConfig) {
  return new TranslationClient(config, obsidianFetch);
}

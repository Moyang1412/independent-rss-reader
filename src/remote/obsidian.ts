import { requestUrl } from 'obsidian';
import { RemoteReadOnlyAdapterRegistry } from './adapter';
import { createJsonRemoteReadOnlyAdapter } from './json-adapter';

export function createObsidianRemoteRegistry() {
  return new RemoteReadOnlyAdapterRegistry().register('json', (config, transport) => createJsonRemoteReadOnlyAdapter(config, transport || (async (url, init) => {
    const response = await requestUrl({
      url,
      method: 'GET',
      headers: Object.fromEntries(new Headers(init.headers).entries()),
      throw: false,
    });
    return {
      status: response.status,
      json: async () => response.json as unknown,
      text: async () => response.text,
    };
  })));
}

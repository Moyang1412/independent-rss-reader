export type FeedErrorKind = 'timeout' | 'network' | 'certificate' | 'redirect' | 'http' | 'parse' | 'unknown';

export class FeedFetchError extends Error {
  constructor(
    message: string,
    readonly kind: FeedErrorKind,
    readonly url?: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'FeedFetchError';
  }
}

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string' && error.trim()) return error;
  return '未知错误';
}

export function classifyFeedError(error: unknown, url?: string): FeedFetchError {
  if (error instanceof FeedFetchError) return error;
  const detail = errorText(error);
  const lower = detail.toLocaleLowerCase();
  if (lower.includes('超时') || lower.includes('timeout') || lower.includes('timed out')) {
    return new FeedFetchError('订阅请求超时（20 秒）。请检查网络或稍后重试。', 'timeout', url);
  }
  if (/(certificate|cert\b|tls|ssl|self[- ]signed|unable to verify|err_cert|证书)/i.test(detail)) {
    return new FeedFetchError('HTTPS 证书验证失败。请检查站点证书，或改用有效的 HTTPS 地址。', 'certificate', url);
  }
  if (/(enotfound|eai_again|econnrefused|econnreset|network|dns|socket|fetch failed|网络|连接)/i.test(detail)) {
    return new FeedFetchError(`无法连接订阅地址：${detail}`, 'network', url);
  }
  return new FeedFetchError(`订阅请求失败：${detail}`, 'unknown', url);
}

export function httpFeedError(status: number, url: string, location?: string): FeedFetchError {
  if (status >= 300 && status < 400) {
    const suffix = location ? `，目标地址：${location}` : '';
    return new FeedFetchError(`订阅发生重定向（HTTP ${status}）${suffix}。请更新订阅地址。`, 'redirect', url, status);
  }
  if (status === 401 || status === 403) return new FeedFetchError(`订阅拒绝访问（HTTP ${status}）。请检查访问权限或地址。`, 'http', url, status);
  if (status === 404 || status === 410) return new FeedFetchError(`订阅地址不存在（HTTP ${status}）。请检查地址或站点是否已迁移。`, 'http', url, status);
  if (status === 429) return new FeedFetchError('订阅请求过于频繁（HTTP 429）。请稍后重试。', 'http', url, status);
  if (status >= 500) return new FeedFetchError(`订阅服务器暂时不可用（HTTP ${status}）。请稍后重试。`, 'http', url, status);
  return new FeedFetchError(`订阅请求失败（HTTP ${status}）。`, 'http', url, status);
}

export function parseFeedError(error: unknown, url: string): FeedFetchError {
  const detail = errorText(error);
  return new FeedFetchError(`订阅解析失败：${detail}`, 'parse', url);
}

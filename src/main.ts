import { moment, Notice, Plugin, TFile, normalizePath, requestUrl } from 'obsidian';
import { AddFeedModal } from './add-feed-modal';
import { DeleteFeedModal } from './delete-feed-modal';
import { EditFeedModal } from './edit-feed-modal';
import { fetchFeed } from './feed-service';
import { needsStateMigration, normalizeState } from './core/state';
import { SAVED_ENTRIES_SUBSCRIPTION_ID, type FeedEntry, type Subscription, type StoredState } from './core/model';
import { exportOpml, normalizeFeedUrl, parseOpml } from './core/feed-parser';
import { mergeSavedEntries, moveSubscription, shouldRefreshSubscription } from './core/subscriptions';
import { markAllReadIds, pruneLastReadPositions } from './core/reading';
import { countNewEntries, nextRetryAt, shouldAttemptSubscription } from './core/refresh';
import { DEFAULT_CACHE_LIMIT, imageUrlsInEntry, mergeCachedEntries } from './core/cache';
import { ImportOpmlModal } from './opml-modal';
import { ReaderSettingsTab } from './settings-tab';
import { READER_VIEW_TYPE, ReaderView } from './view';
import { createObsidianDeepSeekClient } from './ai/deepseek-obsidian';
import { createObsidianDeepSeekAsrClient } from './ai/deepseek-asr-obsidian';
import type { DeepSeekAsrResult } from './ai/deepseek-asr';

function unique(values: string[]) { return [...new Set(values)]; }

export default class LocalRssPlugin extends Plugin {
  state!: StoredState;
  private refreshTimer?: number;
  private readonly refreshing = new Set<string>();

  override async onload() {
    const raw: unknown = await this.loadData();
    this.state = normalizeState(raw);
    const entriesBySubscription = Object.fromEntries([
      ...this.state.subscriptions.map(subscription => [subscription.id, subscription.entries] as const),
      [SAVED_ENTRIES_SUBSCRIPTION_ID, this.state.savedEntries],
    ]);
    this.state.lastReadBySubscription = pruneLastReadPositions(this.state.lastReadBySubscription, entriesBySubscription);
    if (needsStateMigration(raw)) await this.saveData(this.state);
    this.registerView(READER_VIEW_TYPE, leaf => new ReaderView(leaf, this));
    this.addRibbonIcon('rss', '打开本地 RSS', () => { void this.openReader(); });
    this.addCommand({ id: 'open-reader', name: '打开本地 RSS', callback: () => { void this.openReader(); } });
    this.addCommand({ id: 'add-subscription', name: '添加 RSS 订阅', callback: () => this.openAddSubscription() });
    this.addCommand({ id: 'refresh-subscriptions', name: '刷新 RSS 订阅', callback: () => { void this.refreshSubscriptions(); } });
    this.addCommand({ id: 'mark-all-read', name: '标记当前订阅全部已读', callback: () => { void this.markAllRead(); } });
    this.addCommand({ id: 'next-article', name: '打开下一篇文章', checkCallback: checking => {
      const view = this.app.workspace.getActiveViewOfType(ReaderView);
      if (!view || !view.canUseKeyboardShortcuts()) return false;
      if (!checking) view.navigateVisible(1);
      return true;
    } });
    this.addCommand({ id: 'previous-article', name: '打开上一篇文章', checkCallback: checking => {
      const view = this.app.workspace.getActiveViewOfType(ReaderView);
      if (!view || !view.canUseKeyboardShortcuts()) return false;
      if (!checking) view.navigateVisible(-1);
      return true;
    } });
    this.addCommand({ id: 'refresh-current-subscription', name: '刷新当前 RSS 订阅', checkCallback: checking => {
      const view = this.app.workspace.getActiveViewOfType(ReaderView);
      if (!view || !view.canUseKeyboardShortcuts()) return false;
      if (!checking) view.refreshCurrentSubscription();
      return true;
    } });
    this.addCommand({ id: 'import-opml', name: '导入 OPML', callback: () => this.openImportOpml() });
    this.addCommand({ id: 'export-opml', name: '导出 OPML', callback: () => { void this.exportSubscriptions(); } });
    this.addSettingTab(new ReaderSettingsTab(this.app, this));
    this.app.workspace.onLayoutReady(() => {
      if (this.state.refresh.refreshOnOpen) void this.refreshSubscriptions({ automatic: true, reason: 'open' });
      this.restartRefreshScheduler();
    });
  }

  override onunload() {
    if (this.refreshTimer !== undefined) window.clearInterval(this.refreshTimer);
    this.refreshTimer = undefined;
  }

  restartRefreshScheduler() {
    if (this.refreshTimer !== undefined) window.clearInterval(this.refreshTimer);
    this.refreshTimer = undefined;
    if (!this.state.refresh.enabled) return;
    const intervalMs = Math.max(1, this.state.refresh.intervalMinutes) * 60_000;
    this.refreshTimer = window.setInterval(() => { void this.refreshSubscriptions({ automatic: true, reason: 'interval' }); }, intervalMs);
  }

  async openReader() {
    const existing = this.app.workspace.getLeavesOfType(READER_VIEW_TYPE)[0];
    const leaf = existing || this.app.workspace.getLeaf('tab');
    await leaf.setViewState({ type: READER_VIEW_TYPE, active: true });
    await this.app.workspace.revealLeaf(leaf);
  }

  openAddSubscription() { new AddFeedModal(this).open(); }
  openEditSubscription(id: string) {
    const subscription = this.state.subscriptions.find(item => item.id === id);
    if (subscription) new EditFeedModal(this, subscription).open();
  }
  openImportOpml() { new ImportOpmlModal(this).open(); }

  async persist() { await this.saveData(this.state); this.refreshViews(); }

  private cacheImageDirectory() {
    return normalizePath(`${this.manifest.dir}/cache/images`);
  }

  private async ensureCacheImageDirectory() {
    const path = this.cacheImageDirectory();
    const parent = normalizePath(path.split('/').slice(0, -1).join('/'));
    if (parent && !(await this.app.vault.adapter.exists(parent))) await this.app.vault.adapter.mkdir(parent);
    if (!(await this.app.vault.adapter.exists(path))) await this.app.vault.adapter.mkdir(path);
    return path;
  }

  private imageExtension(url: string, contentType = '') {
    const mime = contentType.split(';')[0].trim().toLowerCase();
    const fromMime = mime.match(/^image\/(png|jpe?g|gif|webp|svg\+xml|avif)$/)?.[1];
    if (fromMime) return fromMime === 'jpeg' ? 'jpg' : fromMime === 'svg+xml' ? 'svg' : fromMime;
    try {
      const ext = new URL(url).pathname.split('.').pop()?.toLowerCase();
      if (ext && /^[a-z0-9]{1,5}$/.test(ext)) return ext;
    } catch { /* Use a safe default. */ }
    return 'bin';
  }

  private imageHash(value: string) {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
    return (hash >>> 0).toString(16).padStart(8, '0');
  }

  private async downloadCachedImage(url: string): Promise<string | undefined> {
    try {
      const response = await requestUrl({ url, method: 'GET', throw: false });
      if (response.status < 200 || response.status >= 300 || response.arrayBuffer.byteLength > 10 * 1024 * 1024) return undefined;
      const directory = await this.ensureCacheImageDirectory();
      const path = normalizePath(`${directory}/${this.imageHash(url)}.${this.imageExtension(url, response.headers['content-type'] || response.headers['Content-Type'] || '')}`);
      if (!(await this.app.vault.adapter.exists(path))) await this.app.vault.adapter.writeBinary(path, response.arrayBuffer);
      return path;
    } catch {
      return undefined;
    }
  }

  private async cacheEntries(entries: FeedEntry[], previous: FeedEntry[] = []) {
    if (!this.state.cache.cacheImages) return entries.map(entry => ({ ...entry, cachedAt: Date.now() }));
    const previousById = new Map(previous.map(entry => [entry.id, entry]));
    return Promise.all(entries.map(async entry => {
      const old = previousById.get(entry.id);
      const cachedImages = { ...(old?.cachedImages || {}), ...(entry.cachedImages || {}) };
      for (const url of imageUrlsInEntry(entry)) {
        if (cachedImages[url] && await this.app.vault.adapter.exists(cachedImages[url])) continue;
        const cachedPath = await this.downloadCachedImage(url);
        if (cachedPath) cachedImages[url] = cachedPath;
      }
      return { ...entry, cachedImages, cachedAt: Date.now() };
    }));
  }

  private protectedEntryIds(subscription: Subscription) {
    return new Set(subscription.entries.filter(entry => !this.state.readIds.includes(entry.id) || this.state.favoriteIds.includes(entry.id)).map(entry => entry.id));
  }

  private async cleanupImageCache() {
    const directory = this.cacheImageDirectory();
    if (!(await this.app.vault.adapter.exists(directory))) return;
    const referenced = new Set<string>();
    for (const subscription of this.state.subscriptions) for (const entry of subscription.entries) for (const path of Object.values(entry.cachedImages || {})) referenced.add(path);
    for (const entry of this.state.savedEntries) for (const path of Object.values(entry.cachedImages || {})) referenced.add(path);
    const listed = await this.app.vault.adapter.list(directory);
    for (const file of listed.files) if (!referenced.has(file)) await this.app.vault.adapter.remove(file);
  }

  canUseDeepSeek() {
    return this.state.deepseek.enabled && Boolean(this.state.deepseek.apiKey.trim());
  }

  getCachedSummary(entryId: string) {
    return this.state.aiSummaries[entryId]?.text || '';
  }

  async summarizeEntry(entry: FeedEntry) {
    const cached = this.state.aiSummaries[entry.id];
    if (cached?.text) return cached.text;
    const summary = await createObsidianDeepSeekClient(this.state.deepseek).summarize(entry);
    this.state.aiSummaries[entry.id] = {
      text: summary,
      createdAt: Date.now(),
      model: this.state.deepseek.model.trim(),
    };
    await this.persist();
    return summary;
  }

  async transcribeAudio(audio: Blob, filename = 'recording.wav'): Promise<DeepSeekAsrResult> {
    const durationMs = await this.audioDurationMs(audio);
    return createObsidianDeepSeekAsrClient(this.state.deepseek).transcribe({
      data: audio,
      filename,
      mimeType: audio.type,
      durationMs,
    });
  }

  private async audioDurationMs(audio: Blob): Promise<number | undefined> {
    if (typeof document === 'undefined' || typeof URL.createObjectURL !== 'function') return undefined;
    const url = URL.createObjectURL(audio);
    try {
      const audio = document.createElement('audio');
      audio.preload = 'metadata';
      return await new Promise<number | undefined>(resolve => {
        const finish = (value: number | undefined) => {
          audio.removeAttribute('src');
          audio.load();
          resolve(value);
        };
        audio.addEventListener('loadedmetadata', () => finish(Number.isFinite(audio.duration) ? audio.duration * 1_000 : undefined), { once: true });
        audio.addEventListener('error', () => finish(undefined), { once: true });
        audio.src = url;
        audio.load();
      });
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  private refreshViews() {
    for (const leaf of this.app.workspace.getLeavesOfType(READER_VIEW_TYPE)) {
      const view = leaf.view;
      if (view instanceof ReaderView) view.render();
    }
  }

  async addSubscription(rawUrl: string, requestedName = '', requestedGroup = '') {
    const result = await fetchFeed(rawUrl);
    if (this.state.subscriptions.some(subscription => subscription.url === result.url)) throw new Error('这个订阅已经存在');
    const entries = await this.cacheEntries(result.feed.entries);
    const subscription: Subscription = {
      id: crypto.randomUUID(), url: result.url, name: requestedName.trim() || result.feed.title || new URL(result.url).hostname,
      group: requestedGroup.trim(), site: result.feed.site, image: result.feed.image, entries,
      updatedAt: Date.now(), lastAttemptAt: Date.now(), error: '', etag: result.etag, lastModified: result.lastModified,
      paused: false, cacheLimit: DEFAULT_CACHE_LIMIT,
    };
    this.state.subscriptions.push(subscription);
    this.state.selectedSubscriptionId = subscription.id;
    await this.persist();
    await this.openReader();
  }

  openDeleteSubscription(id: string) {
    const subscription = this.state.subscriptions.find(item => item.id === id);
    if (subscription) new DeleteFeedModal(this, subscription).open();
  }

  async removeSubscription(id: string, keepEntries = false) {
    const subscription = this.state.subscriptions.find(item => item.id === id);
    if (!subscription) return;
    if (keepEntries) {
      this.state.savedEntries = mergeSavedEntries(this.state.savedEntries, subscription.entries);
    }
    this.state.subscriptions = this.state.subscriptions.filter(item => item.id !== id);
    delete this.state.lastReadBySubscription[id];
    if (this.state.selectedSubscriptionId === id) this.state.selectedSubscriptionId = this.state.subscriptions[0]?.id || (this.state.savedEntries.length ? SAVED_ENTRIES_SUBSCRIPTION_ID : '');
    await this.persist();
  }

  async reorderSubscriptions(sourceId: string, targetId: string) {
    this.state.subscriptions = moveSubscription(this.state.subscriptions, sourceId, targetId);
    await this.persist();
  }

  async updateSubscription(id: string, rawUrl: string, requestedName = '', requestedGroup = '', requestedCacheLimit?: number) {
    const subscription = this.state.subscriptions.find(item => item.id === id);
    if (!subscription) throw new Error('订阅不存在');
    const url = normalizeFeedUrl(rawUrl);
    const duplicate = this.state.subscriptions.find(item => item.id !== id && item.url === url);
    if (duplicate) throw new Error('这个订阅已经存在');
    if (url !== subscription.url) {
      const result = await fetchFeed(url);
      subscription.url = result.url;
      subscription.entries = await this.cacheEntries(result.feed.entries, subscription.entries);
      subscription.site = result.feed.site;
      subscription.image = result.feed.image;
      subscription.updatedAt = Date.now();
      subscription.lastAttemptAt = Date.now();
      subscription.error = '';
      subscription.etag = result.etag;
      subscription.lastModified = result.lastModified;
    }
    subscription.name = requestedName.trim() || subscription.name || new URL(url).hostname;
    subscription.group = requestedGroup.trim();
    if (requestedCacheLimit !== undefined) subscription.cacheLimit = Math.max(1, Math.min(10_000, Math.round(requestedCacheLimit)));
    subscription.entries = mergeCachedEntries(subscription.entries, [], subscription.cacheLimit || DEFAULT_CACHE_LIMIT, this.protectedEntryIds(subscription));
    await this.cleanupImageCache();
    await this.persist();
  }

  async toggleSubscriptionPaused(id: string) {
    const subscription = this.state.subscriptions.find(item => item.id === id);
    if (!subscription) return;
    subscription.paused = !subscription.paused;
    await this.persist();
  }

  private async refreshSubscription(subscription: Subscription, automatic = false) {
    const now = Date.now();
    if (!shouldAttemptSubscription(subscription, automatic, now) || this.refreshing.has(subscription.id)) {
      return { success: false, newCount: 0, skipped: true };
    }
    this.refreshing.add(subscription.id);
    subscription.lastAttemptAt = Date.now();
    try {
      const previousEntries = subscription.entries;
      const result = await fetchFeed(subscription.url, subscription);
      const incomingEntries = await this.cacheEntries(result.feed.entries, previousEntries);
      subscription.entries = mergeCachedEntries(previousEntries, incomingEntries, subscription.cacheLimit || DEFAULT_CACHE_LIMIT, this.protectedEntryIds(subscription));
      subscription.site = result.feed.site;
      subscription.image = result.feed.image;
      subscription.updatedAt = Date.now();
      subscription.error = '';
      subscription.etag = result.etag;
      subscription.lastModified = result.lastModified;
      subscription.refreshFailureCount = 0;
      subscription.nextRetryAt = 0;
      subscription.lastNewCount = countNewEntries(previousEntries, incomingEntries);
      return { success: true, newCount: subscription.lastNewCount, skipped: false };
    } catch (error) {
      if (error instanceof Error && error.message === 'NOT_MODIFIED') {
        subscription.error = '';
        subscription.refreshFailureCount = 0;
        subscription.nextRetryAt = 0;
        subscription.lastNewCount = 0;
        return { success: true, newCount: 0, skipped: false };
      }
      subscription.error = error instanceof Error ? error.message : '刷新失败';
      subscription.refreshFailureCount = (subscription.refreshFailureCount || 0) + 1;
      subscription.nextRetryAt = nextRetryAt(Date.now(), subscription.refreshFailureCount);
      subscription.lastNewCount = 0;
      return { success: false, newCount: 0, skipped: false };
    } finally {
      this.refreshing.delete(subscription.id);
    }
  }

  async refreshOneSubscription(id: string) {
    const subscription = this.state.subscriptions.find(item => item.id === id);
    if (!subscription) return;
    if (subscription.paused) { new Notice('这个订阅已暂停'); return; }
    const notice = new Notice(`正在刷新“${subscription.name}”…`, 0);
    const result = await this.refreshSubscription(subscription, false);
    if (result.skipped && subscription.paused) { notice.hide(); new Notice('这个订阅已暂停'); return; }
    await this.cleanupImageCache();
    await this.persist();
    notice.hide();
    if (result.success && result.newCount) new Notice(`已刷新“${subscription.name}”，发现 ${result.newCount} 篇新文章`);
    else if (result.success) new Notice(`已刷新“${subscription.name}”`);
    else {
      const retry = subscription.nextRetryAt ? `，将在 ${new Date(subscription.nextRetryAt).toLocaleTimeString()} 后重试` : '';
      new Notice(`刷新失败：${subscription.error || '未知错误'}${retry}`);
    }
  }

  async markAllRead() {
    const id = this.state.selectedSubscriptionId || this.state.subscriptions[0]?.id;
    const subscription = id === SAVED_ENTRIES_SUBSCRIPTION_ID
      ? { entries: this.state.savedEntries }
      : this.state.subscriptions.find(item => item.id === id);
    if (!subscription) { new Notice('还没有选中的订阅'); return; }
    this.state.readIds = markAllReadIds(this.state.readIds, subscription.entries);
    await this.persist();
    new Notice('已将当前订阅全部标记为已读');
  }

  async addEntriesToFavorites(ids: readonly string[]) {
    if (!ids.length) return;
    this.state.favoriteIds = unique([...this.state.favoriteIds, ...ids]);
    await this.persist();
  }

  async addEntriesToLater(ids: readonly string[]) {
    if (!ids.length) return;
    this.state.laterIds = unique([...this.state.laterIds, ...ids]);
    await this.persist();
  }

  async importOpml(text: string) {
    const feeds = parseOpml(text).feeds;
    let added = 0;
    for (const feed of feeds) {
      const url = normalizeFeedUrl(feed.url);
      if (this.state.subscriptions.some(subscription => subscription.url === url)) continue;
      try { await this.addSubscription(url, feed.name, feed.group); added++; }
      catch { /* Keep importing valid entries; the caller receives the successful count. */ }
    }
    return added;
  }

  async exportSubscriptions() {
    const xml = exportOpml(this.state.subscriptions.map(subscription => ({ url: subscription.url, name: subscription.name, group: subscription.group })));
    const path = normalizePath('RSS Exports/subscriptions.opml');
    const parent = path.split('/').slice(0, -1).join('/');
    if (parent && !(await this.app.vault.adapter.exists(parent))) await this.app.vault.createFolder(parent);
    const file = this.app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) await this.app.vault.modify(file, xml);
    else await this.app.vault.create(path, xml);
    new Notice(`已导出 OPML：${path}`);
  }

  async refreshSubscriptions(options: { automatic?: boolean; reason?: 'open' | 'interval' } = {}) {
    if (!this.state.subscriptions.length) { if (!options.automatic) new Notice('还没有订阅'); return; }
    const automatic = options.automatic === true;
    const notice = automatic ? undefined : new Notice('正在刷新订阅…', 0);
    let success = 0;
    let skipped = 0;
    let failed = 0;
    let newArticleCount = 0;
    const startedAt = Date.now();
    for (const subscription of this.state.subscriptions) {
      if (!shouldRefreshSubscription(subscription)) { skipped++; continue; }
      const result = await this.refreshSubscription(subscription, automatic);
      if (result.skipped) { skipped++; continue; }
      if (result.success) { success++; newArticleCount += result.newCount; }
      else failed++;
    }
    this.state.lastRefresh = { startedAt, finishedAt: Date.now(), successCount: success, failedCount: failed, skippedCount: skipped, newArticleCount };
    await this.cleanupImageCache();
    await this.persist();
    notice?.hide();
    if (automatic) {
      if (newArticleCount) new Notice(`发现 ${newArticleCount} 篇新文章`);
      return;
    }
    const suffix = skipped ? `，跳过 ${skipped} 个已暂停订阅` : '';
    const failureSuffix = failed ? `，失败 ${failed} 个` : '';
    const newSuffix = newArticleCount ? `，新增 ${newArticleCount} 篇文章` : '';
    new Notice(`已刷新 ${success}/${this.state.subscriptions.length} 个订阅${suffix}${failureSuffix}${newSuffix}`);
  }

  toggleFavorite(id: string) {
    this.state.favoriteIds = this.state.favoriteIds.includes(id) ? this.state.favoriteIds.filter(value => value !== id) : unique([...this.state.favoriteIds, id]);
    void this.persist();
  }

  toggleLater(id: string) {
    this.state.laterIds = this.state.laterIds.includes(id) ? this.state.laterIds.filter(value => value !== id) : unique([...this.state.laterIds, id]);
    void this.persist();
  }

  private dailyNotesOptions(): { folder: string; format: string; template: string } {
    const internalPlugins = (this.app as unknown as { internalPlugins?: {
      getEnabledPluginById?: (id: string) => { options?: { folder?: string; format?: string; template?: string }; instance?: { options?: { folder?: string; format?: string; template?: string } } } | null;
    } }).internalPlugins;
    const plugin = internalPlugins?.getEnabledPluginById?.('daily-notes');
    const options = plugin?.options || plugin?.instance?.options;
    if (!options) throw new Error('请先启用 Obsidian 核心日记插件');
    return { folder: options.folder || '', format: options.format || 'YYYY-MM-DD', template: options.template || '' };
  }

  private todayFileName(format: string): string {
    const createMoment = moment as unknown as (value?: Date) => { format: (pattern: string) => string };
    return createMoment().format(format);
  }

  private async ensureFolder(path: string) {
    const parts = normalizePath(path).split('/').filter(Boolean);
    let current = '';
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      if (!(await this.app.vault.adapter.exists(current))) await this.app.vault.createFolder(current);
    }
  }

  async appendDailyNote(entry: FeedEntry) {
    const options = this.dailyNotesOptions();
    const filename = `${this.todayFileName(options.format)}.md`;
    const folder = normalizePath(options.folder);
    const path = normalizePath(folder ? `${folder}/${filename}` : filename);
    const parent = path.split('/').slice(0, -1).join('/');
    if (parent) await this.ensureFolder(parent);
    const title = entry.title.replaceAll('[', '').replaceAll(']', '');
    const line = `- [${title}](${entry.link || ''})\n`;
    const file = this.app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) {
      const current = await this.app.vault.read(file);
      if (!current.includes(line.trim())) await this.app.vault.modify(file, current.endsWith('\n') ? current + line : `${current}\n${line}`);
    } else {
      let content = '';
      if (options.template) {
        const template = this.app.vault.getAbstractFileByPath(normalizePath(options.template));
        if (template instanceof TFile) content = await this.app.vault.read(template);
      }
      if (content && !content.endsWith('\n')) content += '\n';
      await this.app.vault.create(path, content + line);
    }
  }
}

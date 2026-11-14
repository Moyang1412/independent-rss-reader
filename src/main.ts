import { moment, Notice, Plugin, TFile, normalizePath } from 'obsidian';
import { AddFeedModal } from './add-feed-modal';
import { DeleteFeedModal } from './delete-feed-modal';
import { EditFeedModal } from './edit-feed-modal';
import { fetchFeed } from './feed-service';
import { needsStateMigration, normalizeState } from './core/state';
import { SAVED_ENTRIES_SUBSCRIPTION_ID, type FeedEntry, type Subscription, type StoredState } from './core/model';
import { exportOpml, normalizeFeedUrl, parseOpml } from './core/feed-parser';
import { mergeSavedEntries, moveSubscription, shouldRefreshSubscription } from './core/subscriptions';
import { markAllReadIds } from './core/reading';
import { ImportOpmlModal } from './opml-modal';
import { ReaderSettingsTab } from './settings-tab';
import { READER_VIEW_TYPE, ReaderView } from './view';
import { createObsidianDeepSeekClient } from './ai/deepseek-obsidian';
import { createObsidianDeepSeekAsrClient } from './ai/deepseek-asr-obsidian';
import type { DeepSeekAsrResult } from './ai/deepseek-asr';

function unique(values: string[]) { return [...new Set(values)]; }

export default class LocalRssPlugin extends Plugin {
  state!: StoredState;

  override async onload() {
    const raw: unknown = await this.loadData();
    this.state = normalizeState(raw);
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
    const subscription: Subscription = {
      id: crypto.randomUUID(), url: result.url, name: requestedName.trim() || result.feed.title || new URL(result.url).hostname,
      group: requestedGroup.trim(), site: result.feed.site, image: result.feed.image, entries: result.feed.entries,
      updatedAt: Date.now(), lastAttemptAt: Date.now(), error: '', etag: result.etag, lastModified: result.lastModified,
      paused: false,
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
    if (this.state.selectedSubscriptionId === id) this.state.selectedSubscriptionId = this.state.subscriptions[0]?.id || (this.state.savedEntries.length ? SAVED_ENTRIES_SUBSCRIPTION_ID : '');
    await this.persist();
  }

  async reorderSubscriptions(sourceId: string, targetId: string) {
    this.state.subscriptions = moveSubscription(this.state.subscriptions, sourceId, targetId);
    await this.persist();
  }

  async updateSubscription(id: string, rawUrl: string, requestedName = '', requestedGroup = '') {
    const subscription = this.state.subscriptions.find(item => item.id === id);
    if (!subscription) throw new Error('订阅不存在');
    const url = normalizeFeedUrl(rawUrl);
    const duplicate = this.state.subscriptions.find(item => item.id !== id && item.url === url);
    if (duplicate) throw new Error('这个订阅已经存在');
    if (url !== subscription.url) {
      const result = await fetchFeed(url);
      subscription.url = result.url;
      subscription.entries = result.feed.entries;
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
    await this.persist();
  }

  async toggleSubscriptionPaused(id: string) {
    const subscription = this.state.subscriptions.find(item => item.id === id);
    if (!subscription) return;
    subscription.paused = !subscription.paused;
    await this.persist();
  }

  private async refreshSubscription(subscription: Subscription) {
    subscription.lastAttemptAt = Date.now();
    try {
      const result = await fetchFeed(subscription.url, subscription);
      subscription.entries = result.feed.entries;
      subscription.site = result.feed.site;
      subscription.image = result.feed.image;
      subscription.updatedAt = Date.now();
      subscription.error = '';
      subscription.etag = result.etag;
      subscription.lastModified = result.lastModified;
      return true;
    } catch (error) {
      if (error instanceof Error && error.message === 'NOT_MODIFIED') {
        subscription.error = '';
        return true;
      }
      subscription.error = error instanceof Error ? error.message : '刷新失败';
      return false;
    }
  }

  async refreshOneSubscription(id: string) {
    const subscription = this.state.subscriptions.find(item => item.id === id);
    if (!subscription) return;
    if (subscription.paused) { new Notice('这个订阅已暂停'); return; }
    const notice = new Notice(`正在刷新“${subscription.name}”…`, 0);
    const success = await this.refreshSubscription(subscription);
    await this.persist();
    notice.hide();
    new Notice(success ? `已刷新“${subscription.name}”` : `刷新失败：${subscription.error || '未知错误'}`);
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

  async refreshSubscriptions() {
    if (!this.state.subscriptions.length) { new Notice('还没有订阅'); return; }
    const notice = new Notice('正在刷新订阅…', 0);
    let success = 0;
    let skipped = 0;
    for (const subscription of this.state.subscriptions) {
      if (!shouldRefreshSubscription(subscription)) { skipped++; continue; }
      if (await this.refreshSubscription(subscription)) success++;
    }
    await this.persist();
    notice.hide();
    const suffix = skipped ? `，跳过 ${skipped} 个已暂停订阅` : '';
    new Notice(`已刷新 ${success}/${this.state.subscriptions.length} 个订阅${suffix}`);
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

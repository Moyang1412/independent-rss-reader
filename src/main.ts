import { moment, Notice, Plugin, TFile, normalizePath } from 'obsidian';
import { AddFeedModal } from './add-feed-modal';
import { fetchFeed } from './feed-service';
import { normalizeState } from './core/state';
import type { FeedEntry, Subscription, StoredState } from './core/model';
import { exportOpml, normalizeFeedUrl, parseOpml } from './core/feed-parser';
import { ImportOpmlModal } from './opml-modal';
import { ReaderSettingsTab } from './settings-tab';
import { READER_VIEW_TYPE, ReaderView } from './view';
import { createObsidianDeepSeekClient } from './ai/deepseek-obsidian';

function unique(values: string[]) { return [...new Set(values)]; }

export default class LocalRssPlugin extends Plugin {
  state!: StoredState;

  override async onload() {
    const raw: unknown = await this.loadData();
    this.state = normalizeState(raw);
    if (raw && typeof raw === 'object' && Object.hasOwn(raw, 'dailyNoteFolder')) await this.saveData(this.state);
    this.registerView(READER_VIEW_TYPE, leaf => new ReaderView(leaf, this));
    this.addRibbonIcon('rss', '打开本地 RSS', () => { void this.openReader(); });
    this.addCommand({ id: 'open-reader', name: '打开本地 RSS', callback: () => { void this.openReader(); } });
    this.addCommand({ id: 'add-subscription', name: '添加 RSS 订阅', callback: () => this.openAddSubscription() });
    this.addCommand({ id: 'refresh-subscriptions', name: '刷新 RSS 订阅', callback: () => { void this.refreshSubscriptions(); } });
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

  async removeSubscription(id: string) {
    this.state.subscriptions = this.state.subscriptions.filter(subscription => subscription.id !== id);
    if (this.state.selectedSubscriptionId === id) this.state.selectedSubscriptionId = this.state.subscriptions[0]?.id || '';
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

  async refreshSubscriptions() {
    if (!this.state.subscriptions.length) { new Notice('还没有订阅'); return; }
    const notice = new Notice('正在刷新订阅…', 0);
    let success = 0;
    for (const subscription of this.state.subscriptions) {
      subscription.lastAttemptAt = Date.now();
      try {
        const result = await fetchFeed(subscription.url, subscription);
        subscription.entries = result.feed.entries; subscription.site = result.feed.site; subscription.image = result.feed.image;
        subscription.updatedAt = Date.now(); subscription.error = ''; subscription.etag = result.etag; subscription.lastModified = result.lastModified; success++;
      } catch (error) {
        if (error instanceof Error && error.message === 'NOT_MODIFIED') { subscription.error = ''; success++; continue; }
        subscription.error = error instanceof Error ? error.message : '刷新失败';
      }
    }
    await this.persist();
    notice.hide();
    new Notice(`已刷新 ${success}/${this.state.subscriptions.length} 个订阅`);
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

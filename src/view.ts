import { ItemView, Menu, Notice, setIcon, type WorkspaceLeaf } from 'obsidian';
import type LocalRssPlugin from './main';
import { SAVED_ENTRIES_SUBSCRIPTION_ID, type FeedEntry, type Subscription } from './core/model';
import { sanitizeArticleHtml } from './core/feed-parser';
import { MicrophoneRecorder } from './audio/recorder';
import { countUnreadEntries } from './core/subscriptions';
import { adjacentEntryId, filterRecentEntries, getLastReadPosition, RECENT_DAYS, rememberLastReadPosition, sortEntriesByPublishedAt, type SortOrder } from './core/reading';
import { virtualWindowRange } from './core/virtual-list';

export const READER_VIEW_TYPE = 'independent-rss-reader-view';

type Filter = 'all' | 'unread' | 'favorites' | 'later' | 'recent';

function safeSetHtml(element: HTMLElement, html: string) {
  const candidate = element as HTMLElement & { setHTML?: (value: string, options?: unknown) => void };
  if (typeof candidate.setHTML === 'function') {
    candidate.setHTML(html, { sanitizer: { elements: ['p', 'br', 'strong', 'em', 'b', 'i', 'u', 'blockquote', 'code', 'pre', 'ul', 'ol', 'li', 'h2', 'h3', 'h4', 'a', 'img', 'figure', 'figcaption'], attributes: ['href', 'src', 'alt', 'title', 'target', 'rel', 'loading', 'referrerpolicy'] } });
  } else {
    const parsed = new DOMParser().parseFromString(html, 'text/html');
    element.replaceChildren(...Array.from(parsed.body.childNodes).map(node => element.ownerDocument.importNode(node, true)));
  }
  for (const image of element.querySelectorAll<HTMLImageElement>('img')) {
    image.loading = 'lazy';
    image.referrerPolicy = 'no-referrer';
    image.addEventListener('error', () => image.remove());
  }
  for (const link of element.querySelectorAll<HTMLAnchorElement>('a[href]')) {
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
  }
}

export class ReaderView extends ItemView {
  private sourceList!: HTMLElement;
  private articleList!: HTMLElement;
  private article!: HTMLElement;
  private status!: HTMLElement;
  private search!: HTMLInputElement;
  private sortButton!: HTMLButtonElement;
  private batchBar!: HTMLElement;
  private filter: Filter = 'all';
  private sortOrder: SortOrder = 'desc';
  private selectionMode = false;
  private selectedIds = new Set<string>();
  private selectedId = '';
  private destroyed = false;
  private microphone?: MicrophoneRecorder;
  private voiceButton?: HTMLButtonElement;
  private recordButton?: HTMLButtonElement;

  constructor(leaf: WorkspaceLeaf, private readonly plugin: LocalRssPlugin) { super(leaf); }
  override getViewType() { return READER_VIEW_TYPE; }
  override getDisplayText() { return '本地 RSS'; }
  override getIcon() { return 'rss'; }

  override async onOpen() {
    this.contentEl.empty();
    this.contentEl.addClass('lrr-view');
    this.contentEl.tabIndex = 0;
    this.contentEl.setAttribute('aria-keyshortcuts', 'j k ArrowUp ArrowDown Home End r');
    this.registerDomEvent(this.contentEl, 'keydown', event => this.handleKeydown(event));
    const shell = this.contentEl.createDiv({ cls: 'lrr-shell' });
    const header = shell.createEl('header', { cls: 'lrr-header' });
    const title = header.createEl('h1', { text: '本地 RSS' });
    title.addClass('lrr-title');
    const actions = header.createDiv({ cls: 'lrr-actions' });
    const add = actions.createEl('button', { cls: 'lrr-icon-button', attr: { type: 'button', 'aria-label': '添加订阅' } });
    setIcon(add, 'plus');
    add.onclick = () => this.plugin.openAddSubscription();
    const refresh = actions.createEl('button', { cls: 'lrr-icon-button', attr: { type: 'button', 'aria-label': '刷新订阅' } });
    setIcon(refresh, 'refresh-cw');
    refresh.onclick = () => { void this.plugin.refreshSubscriptions(); };

    shell.createEl('a', { text: '跳到文章列表', cls: 'lrr-skip-link', href: '#lrr-article-list' });
    const body = shell.createEl('main', { cls: 'lrr-body', attr: { 'aria-label': 'RSS 阅读器内容' } });
    const nav = body.createEl('nav', { cls: 'lrr-sources', attr: { 'aria-label': '订阅源' } });
    nav.createEl('h2', { text: '订阅' });
    this.sourceList = nav.createDiv({ cls: 'lrr-source-list' });
    const center = body.createDiv({ cls: 'lrr-center' });
    const searchWrap = center.createEl('search', { cls: 'lrr-search' });
    const searchRow = searchWrap.createDiv({ cls: 'lrr-search-row' });
    this.search = searchRow.createEl('input', { type: 'search', placeholder: '搜索文章', attr: { 'aria-label': '搜索文章', 'aria-controls': 'lrr-article-list' } });
    this.search.oninput = () => this.renderArticles();
    const voice = searchRow.createEl('button', { text: '选择音频', attr: { type: 'button', 'aria-label': '选择音频进行 DeepSeek 语音搜索' } });
    this.voiceButton = voice;
    voice.disabled = !this.plugin.canUseDeepSeek();
    if (voice.disabled) voice.title = '请先在插件设置中启用 DeepSeek 并填写 API Key';
    const record = searchRow.createEl('button', { text: '开始录音', attr: { type: 'button', 'aria-label': '开始麦克风录音' } });
    this.recordButton = record;
    record.disabled = voice.disabled;
    if (record.disabled) record.title = '请先在插件设置中启用 DeepSeek 并填写 API Key';
    const audioInput = searchRow.createEl('input', { type: 'file', attr: { accept: '.wav,.ogg,.opus,audio/wav,audio/ogg,audio/opus', 'aria-label': '选择语音文件' } });
    audioInput.hidden = true;
    audioInput.addClass('lrr-audio-input-hidden');
    voice.onclick = () => audioInput.click();
    audioInput.onchange = () => {
      const file = audioInput.files?.[0];
      audioInput.value = '';
      if (!file) return;
      if (file) void this.submitAudio(file, file.name);
    };
    record.onclick = () => { void this.toggleRecording(); };
    const filters = center.createDiv({ cls: 'lrr-filters', attr: { role: 'toolbar', 'aria-label': '文章筛选' } });
    for (const [value, label] of [['all', '全部'], ['unread', '未读'], ['favorites', '收藏'], ['later', '稍后读'], ['recent', `最近 ${RECENT_DAYS} 天`]] as const) {
      const button = filters.createEl('button', { text: label, attr: { type: 'button', 'aria-pressed': String(value === this.filter) } });
      button.onclick = () => { this.filter = value; this.selectedIds.clear(); for (const item of filters.children) item.setAttribute('aria-pressed', String(item === button)); this.renderArticles(); };
    }
    const markAll = filters.createEl('button', { text: '全部已读', attr: { type: 'button', 'aria-label': '将当前订阅全部标记为已读' } });
    markAll.addClass('lrr-mark-all-read');
    markAll.onclick = () => { void this.plugin.markAllRead(); };
    const readingControls = center.createDiv({ cls: 'lrr-reading-controls', attr: { role: 'toolbar', 'aria-label': '阅读列表操作' } });
    this.sortButton = readingControls.createEl('button', { text: '排序：最新在前', attr: { type: 'button' } });
    this.sortButton.onclick = () => {
      this.sortOrder = this.sortOrder === 'desc' ? 'asc' : 'desc';
      this.updateSortButton();
      this.renderArticles();
    };
    this.batchBar = center.createDiv({ cls: 'lrr-batch-actions', attr: { role: 'toolbar', 'aria-label': '批量文章操作' } });
    this.status = center.createDiv({ cls: 'lrr-status', attr: { role: 'status', 'aria-live': 'polite' } });
    this.articleList = center.createDiv({ cls: 'lrr-article-list', attr: { id: 'lrr-article-list', role: 'list', 'aria-label': '文章列表', 'aria-busy': 'false', tabindex: '-1' } });
    this.registerDomEvent(this.articleList, 'scroll', () => this.renderArticles());
    this.article = body.createEl('article', { cls: 'lrr-article', attr: { 'aria-live': 'polite' } });
    this.render();
    this.contentEl.focus({ preventScroll: true });
    if (!this.plugin.state.subscriptions.length) this.status.setText('还没有订阅，点击“+”添加一个 RSS 或 Atom 地址。');
    await Promise.resolve();
  }

  render() {
    if (this.destroyed) return;
    this.renderSources();
    this.renderArticles();
    this.renderArticle();
  }

  private currentSubscription(): Subscription | undefined {
    if (this.plugin.state.selectedSubscriptionId === SAVED_ENTRIES_SUBSCRIPTION_ID && this.plugin.state.savedEntries.length) {
      return { id: SAVED_ENTRIES_SUBSCRIPTION_ID, url: '', name: '已保存文章', group: '已保存文章', entries: this.plugin.state.savedEntries, updatedAt: 0, lastAttemptAt: 0 };
    }
    return this.plugin.state.subscriptions.find(item => item.id === (this.plugin.state.selectedSubscriptionId || this.plugin.state.subscriptions[0]?.id));
  }

  private renderSources() {
    this.sourceList.empty();
    const groups = new Map<string, Subscription[]>();
    const subscriptions = [...this.plugin.state.subscriptions];
    if (this.plugin.state.savedEntries.length) subscriptions.push({ id: SAVED_ENTRIES_SUBSCRIPTION_ID, url: '', name: '已保存文章', group: '已保存文章', entries: this.plugin.state.savedEntries, updatedAt: 0, lastAttemptAt: 0 });
    for (const subscription of subscriptions) {
      const group = subscription.group || '未分组';
      const list = groups.get(group) || []; list.push(subscription); groups.set(group, list);
    }
    for (const [group, subscriptions] of groups) {
      const section = this.sourceList.createEl('section', { cls: 'lrr-source-group' });
      section.createEl('h3', { text: group });
      for (const subscription of subscriptions) {
        const selected = this.currentSubscription()?.id === subscription.id;
        const unreadCount = countUnreadEntries(subscription, this.plugin.state.readIds);
        const healthLabel = subscription.healthStatus === 'error' ? '，健康检查失败' : subscription.healthStatus === 'warning' ? '，健康检查警告' : '';
        const remoteLabel = subscription.remote ? '，远程只读' : '';
        const row = section.createEl('button', { cls: 'lrr-source-row', attr: { type: 'button', 'aria-pressed': String(selected), 'aria-label': `${subscription.name || subscription.url}，${unreadCount} 篇未读${subscription.paused ? '，已暂停' : ''}${healthLabel}${remoteLabel}` } });
        const isSaved = subscription.id === SAVED_ENTRIES_SUBSCRIPTION_ID;
        if (!isSaved && subscription.image) {
          const icon = row.createEl('img', { cls: 'lrr-source-icon', attr: { src: subscription.image, alt: '', 'aria-hidden': 'true' } });
          icon.addEventListener('error', () => icon.remove(), { once: true });
        }
        row.createSpan({ text: subscription.name || subscription.url, cls: 'lrr-source-name' });
        row.draggable = !isSaved && !subscription.remote;
        const unread = unreadCount;
        const meta = row.createSpan({ cls: 'lrr-source-meta' });
        meta.createSpan({ text: `${unread} 未读`, cls: 'lrr-source-unread' });
        if (subscription.remote) meta.createSpan({ text: '远程只读', cls: 'lrr-source-state' });
        if (subscription.paused) meta.createSpan({ text: '已暂停', cls: 'lrr-source-state' });
        else if (subscription.error) {
          const retryText = subscription.nextRetryAt ? `，${new Date(subscription.nextRetryAt).toLocaleTimeString()} 重试` : '';
          meta.createSpan({ text: '更新失败', cls: 'lrr-source-error', attr: { title: `${subscription.error}${retryText}` } });
        }
        if (subscription.healthStatus && subscription.healthStatus !== 'healthy') {
          meta.createSpan({ text: subscription.healthStatus === 'warning' ? '健康检查警告' : '健康检查失败', cls: 'lrr-source-error', attr: { title: subscription.healthError || '请检查订阅地址' } });
        }
        else if (subscription.updatedAt) meta.createSpan({ text: new Date(subscription.updatedAt).toLocaleDateString(), cls: 'lrr-source-date' });
        if (!isSaved && (subscription.site || subscription.siteDescription || subscription.language || subscription.generator)) {
          const details = [subscription.site, subscription.siteDescription, subscription.language && `语言：${subscription.language}`, subscription.generator && `生成器：${subscription.generator}`].filter(Boolean).join(' · ');
          meta.createSpan({ text: '站点', cls: 'lrr-source-site', attr: { title: details } });
        }
        if ((subscription.lastNewCount || 0) > 0) meta.createSpan({ text: `${subscription.lastNewCount} 新`, cls: 'lrr-source-new' });
        row.onclick = () => {
          this.plugin.state.selectedSubscriptionId = subscription.id;
          const lastReadId = getLastReadPosition(this.plugin.state.lastReadBySubscription, subscription.id);
          this.selectedId = subscription.entries.some(entry => entry.id === lastReadId) ? lastReadId || '' : '';
          this.plugin.state.selectedEntryId = this.selectedId;
          this.selectedIds.clear();
          void this.plugin.persist();
          this.render();
        };
        if (!isSaved && !subscription.remote) {
          row.ondragstart = event => { event.dataTransfer?.setData('text/plain', subscription.id); if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'; };
          row.ondragover = event => { event.preventDefault(); if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'; };
          row.ondrop = event => { event.preventDefault(); const sourceId = event.dataTransfer?.getData('text/plain'); if (sourceId && sourceId !== subscription.id) void this.plugin.reorderSubscriptions(sourceId, subscription.id); };
        }
        row.oncontextmenu = event => {
          event.preventDefault();
          if (isSaved) return;
          const menu = new Menu();
          if (subscription.remote) {
            menu.addItem(item => item.setTitle('同步远程只读订阅').setIcon('download').onClick(() => { void this.plugin.syncRemoteReadOnly(); }));
          } else {
            menu.addItem(item => item.setTitle('编辑订阅').setIcon('pencil').onClick(() => this.plugin.openEditSubscription(subscription.id)));
            menu.addItem(item => item.setTitle(subscription.paused ? '恢复订阅' : '暂停订阅').setIcon(subscription.paused ? 'play' : 'pause').onClick(() => { void this.plugin.toggleSubscriptionPaused(subscription.id); }));
            menu.addItem(item => item.setTitle('刷新此订阅').setIcon('refresh-cw').onClick(() => { void this.plugin.refreshOneSubscription(subscription.id); }));
            menu.addItem(item => item.setTitle('检查订阅健康状态').setIcon('heart-pulse').onClick(() => { void this.plugin.checkSubscriptionHealth(subscription.id); }));
            menu.addSeparator();
            menu.addItem(item => item.setTitle('删除订阅').setIcon('trash').onClick(() => this.plugin.openDeleteSubscription(subscription.id)));
          }
          menu.showAtMouseEvent(event);
        };
      }
    }
  }

  private visibleEntries(): FeedEntry[] {
    const subscription = this.currentSubscription();
    if (!subscription) return [];
    const query = this.search?.value.trim().toLocaleLowerCase() || '';
    const entries = this.filter === 'recent' ? filterRecentEntries(subscription.entries) : subscription.entries;
    const filtered = entries.filter(entry => {
      if (this.filter === 'unread' && this.plugin.state.readIds.includes(entry.id)) return false;
      if (this.filter === 'favorites' && !this.plugin.state.favoriteIds.includes(entry.id)) return false;
      if (this.filter === 'later' && !this.plugin.state.laterIds.includes(entry.id)) return false;
      return !query || `${entry.title} ${entry.summary}`.toLocaleLowerCase().includes(query);
    });
    return sortEntriesByPublishedAt(filtered, this.sortOrder);
  }

  private updateSortButton() {
    if (this.sortButton) this.sortButton.setText(this.sortOrder === 'desc' ? '排序：最新在前' : '排序：最早在前');
  }

  private renderBatchActions() {
    this.batchBar.empty();
    if (!this.selectionMode) {
      const select = this.batchBar.createEl('button', { text: '选择文章', attr: { type: 'button' } });
      select.onclick = () => { this.selectionMode = true; this.selectedIds.clear(); this.renderArticles(); };
      return;
    }
    this.batchBar.createSpan({ text: `已选 ${this.selectedIds.size} 篇`, cls: 'lrr-batch-count' });
    const visibleIds = this.visibleEntries().map(entry => entry.id);
    const selectAll = this.batchBar.createEl('button', { text: this.selectedIds.size === visibleIds.length && visibleIds.length ? '取消全选' : '全选当前列表', attr: { type: 'button' } });
    selectAll.onclick = () => {
      if (this.selectedIds.size === visibleIds.length && visibleIds.length) this.selectedIds.clear();
      else for (const id of visibleIds) this.selectedIds.add(id);
      this.renderArticles();
    };
    const favorite = this.batchBar.createEl('button', { text: '批量收藏', attr: { type: 'button' } });
    favorite.disabled = !this.selectedIds.size;
    favorite.onclick = () => { void this.applyBatchAction('favorite'); };
    const later = this.batchBar.createEl('button', { text: '批量加入稍后读', attr: { type: 'button' } });
    later.disabled = !this.selectedIds.size;
    later.onclick = () => { void this.applyBatchAction('later'); };
    const exit = this.batchBar.createEl('button', { text: '退出选择', attr: { type: 'button' } });
    exit.onclick = () => { this.selectionMode = false; this.selectedIds.clear(); this.renderArticles(); };
  }

  private toggleSelected(entryId: string) {
    if (this.selectedIds.has(entryId)) this.selectedIds.delete(entryId);
    else this.selectedIds.add(entryId);
    this.renderArticles();
  }

  private async applyBatchAction(action: 'favorite' | 'later') {
    const ids = [...this.selectedIds];
    if (!ids.length) return;
    if (action === 'favorite') await this.plugin.addEntriesToFavorites(ids);
    else await this.plugin.addEntriesToLater(ids);
    new Notice(action === 'favorite' ? `已收藏 ${ids.length} 篇文章` : `已加入稍后读 ${ids.length} 篇文章`);
    this.selectionMode = false;
    this.selectedIds.clear();
    this.renderArticles();
  }

  private sourceLabel(entry: FeedEntry, subscription = this.currentSubscription()): string {
    if (subscription?.id === SAVED_ENTRIES_SUBSCRIPTION_ID) return entry.feedUrl;
    return subscription?.name || subscription?.url || entry.feedUrl;
  }

  private selectEntry(entryId: string): boolean {
    const entry = this.visibleEntries().find(item => item.id === entryId);
    if (!entry) return false;
    this.selectedId = entry.id;
    this.plugin.state.selectedEntryId = entry.id;
    const subscription = this.currentSubscription();
    if (subscription) this.plugin.state.lastReadBySubscription = rememberLastReadPosition(this.plugin.state.lastReadBySubscription, subscription.id, entry.id);
    if (!this.plugin.state.readIds.includes(entry.id)) this.plugin.state.readIds.push(entry.id);
    void this.plugin.persist();
    this.render();
    this.contentEl.focus({ preventScroll: true });
    return true;
  }

  private navigate(direction: -1 | 1): boolean {
    const entries = this.visibleEntries();
    const currentId = this.selectedId || this.plugin.state.selectedEntryId;
    const nextId = adjacentEntryId(entries, currentId, direction);
    return nextId ? this.selectEntry(nextId) : false;
  }

  navigateVisible(direction: -1 | 1): boolean {
    return this.navigate(direction);
  }

  refreshCurrentSubscription() {
    const subscription = this.currentSubscription();
    if (subscription && subscription.id !== SAVED_ENTRIES_SUBSCRIPTION_ID) void this.plugin.refreshOneSubscription(subscription.id);
  }

  canUseKeyboardShortcuts(): boolean {
    const active = this.contentEl.ownerDocument.activeElement;
    return !(active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement || active instanceof HTMLSelectElement || (active instanceof HTMLElement && active.isContentEditable));
  }

  private handleKeydown(event: KeyboardEvent) {
    if (event.defaultPrevented || event.isComposing || event.metaKey || event.ctrlKey || event.altKey) return;
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || (target instanceof HTMLElement && target.isContentEditable)) return;
    const key = event.key.toLowerCase();
    if (key === 'j' || event.key === 'ArrowDown') {
      if (this.navigate(1)) event.preventDefault();
      return;
    }
    if (key === 'k' || event.key === 'ArrowUp') {
      if (this.navigate(-1)) event.preventDefault();
      return;
    }
    if (key === 'r') {
      const subscription = this.currentSubscription();
      if (subscription && subscription.id !== SAVED_ENTRIES_SUBSCRIPTION_ID) {
        event.preventDefault();
        void this.plugin.refreshOneSubscription(subscription.id);
      }
      return;
    }
    if (key === 'home' || key === 'end') {
      const entries = this.visibleEntries();
      const target = key === 'home' ? entries[0] : entries[entries.length - 1];
      if (target && this.selectEntry(target.id)) event.preventDefault();
    }
  }

  private renderArticles() {
    this.updateSortButton();
    this.renderBatchActions();
    const previousScrollTop = this.articleList.scrollTop;
    this.articleList.empty();
    const entries = this.visibleEntries();
    this.status.setText(entries.length ? `${entries.length} 篇文章` : '没有符合条件的文章');
    this.articleList.setAttribute('aria-setsize', String(entries.length));
    this.articleList.setAttribute('aria-busy', 'true');
    if (!entries.length) {
      this.articleList.setAttribute('aria-busy', 'false');
      return;
    }
    const subscription = this.currentSubscription();
    const rowHeight = 56;
    const selectedIndex = entries.findIndex(entry => entry.id === this.selectedId);
    const range = virtualWindowRange(entries.length, previousScrollTop, this.articleList.clientHeight || 480, rowHeight, 8, selectedIndex);
    const spacer = this.articleList.createDiv({ cls: 'lrr-virtual-spacer', attr: { 'aria-hidden': 'true' } });
    spacer.style.height = `${range.totalHeight}px`;
    const windowEl = this.articleList.createDiv({ cls: 'lrr-virtual-window' });
    windowEl.style.transform = `translateY(${range.offset}px)`;
    const safeScrollTop = Math.min(previousScrollTop, Math.max(0, range.totalHeight - (this.articleList.clientHeight || 480)));
    if (safeScrollTop !== previousScrollTop) this.articleList.scrollTop = safeScrollTop;
    for (let index = range.start; index < range.end; index += 1) {
      const entry = entries[index];
      const wrapper = this.articleList.createDiv({ cls: 'lrr-article-select-row', attr: { role: 'listitem', 'aria-setsize': String(entries.length), 'aria-posinset': String(index + 1) } });
      if (this.selectionMode) {
        const checkbox = wrapper.createEl('input', { type: 'checkbox', attr: { 'aria-label': `选择文章：${entry.title}` } });
        checkbox.checked = this.selectedIds.has(entry.id);
        checkbox.onclick = event => { event.stopPropagation(); this.toggleSelected(entry.id); };
      }
      const source = this.sourceLabel(entry, subscription);
      const date = entry.publishedAt ? new Date(entry.publishedAt).toLocaleDateString() : '';
      const unread = !this.plugin.state.readIds.includes(entry.id);
      const row = wrapper.createEl('button', { cls: 'lrr-article-row', attr: { type: 'button', 'aria-pressed': String(this.selectedId === entry.id), 'aria-label': `${entry.title}，来源 ${source}${date ? `，${date}` : ''}${unread ? '，未读' : ''}` } });
      row.createSpan({ text: entry.title, cls: 'lrr-article-title' });
      row.createSpan({ text: source, cls: 'lrr-article-source' });
      row.createSpan({ text: date, cls: 'lrr-article-date' });
      if (unread) row.addClass('is-unread');
      if (this.plugin.state.favoriteIds.includes(entry.id)) row.createSpan({ text: '★', cls: 'lrr-article-mark', attr: { 'aria-label': '已收藏' } });
      row.onclick = () => { this.selectEntry(entry.id); };
      windowEl.appendChild(wrapper);
    }
    this.articleList.setAttribute('aria-busy', 'false');
  }

  private renderArticle() {
    this.article.empty();
    const subscription = this.currentSubscription();
    const lastReadId = subscription ? getLastReadPosition(this.plugin.state.lastReadBySubscription, subscription.id) : undefined;
    const entry = subscription?.entries.find(item => item.id === (lastReadId || this.selectedId || this.plugin.state.selectedEntryId));
    if (!entry) { this.article.createEl('p', { text: '选择一篇文章开始阅读。', cls: 'lrr-empty' }); return; }
    this.selectedId = entry.id;
    this.plugin.state.selectedEntryId = entry.id;
    const head = this.article.createDiv({ cls: 'lrr-article-head' });
    head.createEl('h2', { text: entry.title });
    const meta = head.createDiv({ cls: 'lrr-article-meta' });
    const source = subscription?.id === SAVED_ENTRIES_SUBSCRIPTION_ID ? entry.feedUrl : (subscription?.name || subscription?.url);
    if (source) meta.createSpan({ text: `来源：${source}`, attr: { title: source } });
    if (entry.author) meta.createSpan({ text: entry.author });
    if (entry.publishedAt) meta.createSpan({ text: new Date(entry.publishedAt).toLocaleString() });
    if (entry.categories?.length) meta.createSpan({ text: `分类：${entry.categories.join('、')}` });
    const knowledge = this.plugin.getArticleKnowledge(entry.id);
    if (knowledge.tags.length) meta.createSpan({ text: `标签：${knowledge.tags.map(tag => `#${tag}`).join(' ')}` });
    if (knowledge.note) meta.createSpan({ text: `备注：${knowledge.note}`, attr: { title: knowledge.note } });
    const actions = head.createDiv({ cls: 'lrr-article-actions' });
    const previousId = adjacentEntryId(this.visibleEntries(), entry.id, -1);
    const previous = actions.createEl('button', { text: '上一篇', attr: { type: 'button' } });
    previous.disabled = !previousId;
    previous.onclick = () => { if (previousId) this.selectEntry(previousId); };
    const nextId = adjacentEntryId(this.visibleEntries(), entry.id, 1);
    const next = actions.createEl('button', { text: '下一篇', attr: { type: 'button' } });
    next.disabled = !nextId;
    next.onclick = () => { if (nextId) this.selectEntry(nextId); };
    const favorite = actions.createEl('button', { text: this.plugin.state.favoriteIds.includes(entry.id) ? '取消收藏' : '收藏', attr: { type: 'button' } });
    favorite.onclick = () => { this.plugin.toggleFavorite(entry.id); this.render(); };
    const later = actions.createEl('button', { text: this.plugin.state.laterIds.includes(entry.id) ? '移出稍后读' : '稍后读', attr: { type: 'button' } });
    later.onclick = () => { this.plugin.toggleLater(entry.id); this.render(); };
    const metaButton = actions.createEl('button', { text: knowledge.tags.length || knowledge.note ? '编辑标签/备注' : '标签/备注', attr: { type: 'button' } });
    metaButton.onclick = () => this.plugin.openArticleKnowledge(entry);
    const saveButton = actions.createEl('button', { text: knowledge.savedPath ? '已保存文章' : '保存为 Markdown', attr: { type: 'button' } });
    saveButton.disabled = Boolean(knowledge.savedPath);
    saveButton.onclick = () => { void this.plugin.saveEntryAsMarkdown(entry).catch(error => new Notice(error instanceof Error ? error.message : '保存文章失败')); };
    const cachedSummary = this.plugin.getCachedSummary(entry.id);
    const summarize = actions.createEl('button', { text: cachedSummary ? '已生成摘要' : '生成摘要', attr: { type: 'button' } });
    summarize.disabled = !cachedSummary && !this.plugin.canUseDeepSeek();
    if (summarize.disabled) summarize.title = '请先在插件设置中启用 DeepSeek 并填写 API Key';
    summarize.onclick = () => {
      summarize.disabled = true;
      summarize.setText('生成中…');
      void this.plugin.summarizeEntry(entry).then(() => this.render()).catch(error => {
        new Notice(error instanceof Error ? error.message : '摘要生成失败');
        this.render();
      });
    };
    const cachedTranslation = this.plugin.getCachedTranslation(entry.id);
    const translate = actions.createEl('button', { text: cachedTranslation ? '已翻译' : '翻译文章', attr: { type: 'button', 'aria-label': cachedTranslation ? '查看本地缓存译文' : '翻译当前文章' } });
    translate.disabled = !cachedTranslation && !this.plugin.canUseTranslation();
    if (translate.disabled) translate.title = '请先在设置中启用文章翻译，并配置 DeepSeek API Key';
    translate.onclick = () => {
      translate.disabled = true;
      translate.setText('翻译中…');
      void this.plugin.translateEntry(entry).then(() => this.render()).catch(error => {
        new Notice(error instanceof Error ? error.message : '文章翻译失败');
        this.render();
      });
    };
    const note = actions.createEl('button', { text: '记到今日日记', attr: { type: 'button' } });
    note.onclick = () => { void this.plugin.appendDailyNote(entry).then(() => new Notice('已追加到今日日记')).catch(error => new Notice(error instanceof Error ? error.message : '写入失败')); };
    if (entry.link) {
      const link = actions.createEl('a', { text: '打开原文', href: entry.link, attr: { target: '_blank', rel: 'noopener noreferrer' } });
      link.addClass('lrr-external-link');
    }
    const content = this.article.createDiv({ cls: 'lrr-article-content' });
    safeSetHtml(content, sanitizeArticleHtml(entry.content, entry.link || undefined));
    for (const image of content.querySelectorAll<HTMLImageElement>('img[src]')) {
      const remote = image.getAttribute('src') || '';
      const cachedPath = entry.cachedImages?.[remote] || (entry.imageUrl ? entry.cachedImages?.[entry.imageUrl] : undefined);
      if (cachedPath) image.src = this.app.vault.adapter.getResourcePath(cachedPath);
    }
    if (cachedSummary) {
      const summary = this.article.createDiv({ cls: 'lrr-ai-summary' });
      summary.createEl('h3', { text: 'DeepSeek 摘要' });
      summary.createEl('div', { text: cachedSummary });
    }
    if (cachedTranslation) {
      const translation = this.article.createDiv({ cls: 'lrr-translation', attr: { 'aria-live': 'polite' } });
      translation.createEl('h3', { text: `文章翻译（${this.plugin.state.translation.targetLanguage}）` });
      translation.createDiv({ text: cachedTranslation, cls: 'lrr-translation-body' });
    }
  }

  private updateAudioButtons() {
    if (this.destroyed) return;
    const enabled = this.plugin.canUseDeepSeek();
    if (this.voiceButton) { this.voiceButton.disabled = !enabled; this.voiceButton.setText('选择音频'); this.voiceButton.setAttribute('aria-label', '选择音频进行 DeepSeek 语音搜索'); }
    if (this.recordButton) { this.recordButton.disabled = !enabled; this.recordButton.setText('开始录音'); this.recordButton.setAttribute('aria-label', '开始麦克风录音'); }
  }

  private async submitAudio(audio: Blob, filename: string) {
    if (!this.plugin.canUseDeepSeek()) return;
    if (this.voiceButton) { this.voiceButton.disabled = true; this.voiceButton.setText('识别中…'); }
    if (this.recordButton) { this.recordButton.disabled = true; this.recordButton.setText('识别中…'); }
    try {
      const result = await this.plugin.transcribeAudio(audio, filename);
      this.search.value = result.text;
      this.renderArticles();
      new Notice('语音识别完成');
    } catch (error) {
      new Notice(error instanceof Error ? error.message : '语音识别失败');
    } finally {
      this.updateAudioButtons();
    }
  }

  private async toggleRecording() {
    if (this.microphone?.isRecording) {
      try {
        const audio = await this.microphone.stop();
        this.microphone = undefined;
        await this.submitAudio(audio.data, audio.filename);
      } catch (error) {
        new Notice(error instanceof Error ? error.message : '录音停止失败');
        this.microphone = undefined;
        this.updateAudioButtons();
      }
      return;
    }
    if (!this.plugin.canUseDeepSeek()) return;
    try {
      let recorder!: MicrophoneRecorder;
      recorder = new MicrophoneRecorder({ onMaxDuration: audio => {
        if (this.microphone === recorder) this.microphone = undefined;
        void this.submitAudio(audio.data, audio.filename);
      } });
      await recorder.start();
      this.microphone = recorder;
      if (this.recordButton) { this.recordButton.setText('停止录音'); this.recordButton.disabled = false; }
      if (this.voiceButton) this.voiceButton.disabled = true;
      new Notice('正在录音，再次点击“停止录音”结束');
    } catch (error) {
      new Notice(error instanceof Error ? error.message : '无法开始录音');
      this.updateAudioButtons();
    }
  }

  override onClose() {
    this.destroyed = true;
    const cancel = this.microphone?.cancel();
    this.microphone = undefined;
    this.contentEl.empty();
    return cancel || Promise.resolve();
  }
}

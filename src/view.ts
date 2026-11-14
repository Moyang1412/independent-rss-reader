import { ItemView, Notice, setIcon, type WorkspaceLeaf } from 'obsidian';
import type LocalRssPlugin from './main';
import type { FeedEntry, Subscription } from './core/model';
import { sanitizeArticleHtml } from './core/feed-parser';
import { ConfirmModal } from './confirm-modal';

export const READER_VIEW_TYPE = 'independent-rss-reader-view';

type Filter = 'all' | 'unread' | 'favorites' | 'later';

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
  private filter: Filter = 'all';
  private selectedId = '';
  private destroyed = false;

  constructor(leaf: WorkspaceLeaf, private readonly plugin: LocalRssPlugin) { super(leaf); }
  override getViewType() { return READER_VIEW_TYPE; }
  override getDisplayText() { return '本地 RSS'; }
  override getIcon() { return 'rss'; }

  override async onOpen() {
    this.contentEl.empty();
    this.contentEl.addClass('lrr-view');
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

    const body = shell.createDiv({ cls: 'lrr-body' });
    const nav = body.createEl('nav', { cls: 'lrr-sources', attr: { 'aria-label': '订阅源' } });
    nav.createEl('h2', { text: '订阅' });
    this.sourceList = nav.createDiv({ cls: 'lrr-source-list' });
    const center = body.createDiv({ cls: 'lrr-center' });
    const searchWrap = center.createEl('search', { cls: 'lrr-search' });
    this.search = searchWrap.createEl('input', { type: 'search', placeholder: '搜索文章', attr: { 'aria-label': '搜索文章' } });
    this.search.oninput = () => this.renderArticles();
    const filters = center.createDiv({ cls: 'lrr-filters', attr: { role: 'toolbar', 'aria-label': '文章筛选' } });
    for (const [value, label] of [['all', '全部'], ['unread', '未读'], ['favorites', '收藏'], ['later', '稍后读']] as const) {
      const button = filters.createEl('button', { text: label, attr: { type: 'button', 'aria-pressed': String(value === this.filter) } });
      button.onclick = () => { this.filter = value; for (const item of filters.children) item.setAttribute('aria-pressed', String(item === button)); this.renderArticles(); };
    }
    this.status = center.createDiv({ cls: 'lrr-status', attr: { role: 'status', 'aria-live': 'polite' } });
    this.articleList = center.createDiv({ cls: 'lrr-article-list' });
    this.article = body.createEl('article', { cls: 'lrr-article', attr: { 'aria-live': 'polite' } });
    this.render();
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
    return this.plugin.state.subscriptions.find(item => item.id === (this.plugin.state.selectedSubscriptionId || this.plugin.state.subscriptions[0]?.id));
  }

  private renderSources() {
    this.sourceList.empty();
    const groups = new Map<string, Subscription[]>();
    for (const subscription of this.plugin.state.subscriptions) {
      const group = subscription.group || '未分组';
      const list = groups.get(group) || []; list.push(subscription); groups.set(group, list);
    }
    for (const [group, subscriptions] of groups) {
      const section = this.sourceList.createEl('section', { cls: 'lrr-source-group' });
      section.createEl('h3', { text: group });
      for (const subscription of subscriptions) {
        const row = section.createEl('button', { cls: 'lrr-source-row', attr: { type: 'button', 'aria-pressed': String(this.currentSubscription()?.id === subscription.id) } });
        row.createSpan({ text: subscription.name || subscription.url, cls: 'lrr-source-name' });
        row.createSpan({ text: String(subscription.entries.length), cls: 'lrr-source-count' });
        row.onclick = () => { this.plugin.state.selectedSubscriptionId = subscription.id; this.selectedId = ''; void this.plugin.persist(); this.render(); };
        row.oncontextmenu = event => { event.preventDefault(); new ConfirmModal(this.plugin.app, `删除订阅“${subscription.name}”？已保存的文章不会自动删除。`, () => { void this.plugin.removeSubscription(subscription.id); }).open(); };
      }
    }
  }

  private visibleEntries(): FeedEntry[] {
    const subscription = this.currentSubscription();
    if (!subscription) return [];
    const query = this.search?.value.trim().toLocaleLowerCase() || '';
    return subscription.entries.filter(entry => {
      if (this.filter === 'unread' && this.plugin.state.readIds.includes(entry.id)) return false;
      if (this.filter === 'favorites' && !this.plugin.state.favoriteIds.includes(entry.id)) return false;
      if (this.filter === 'later' && !this.plugin.state.laterIds.includes(entry.id)) return false;
      return !query || `${entry.title} ${entry.summary}`.toLocaleLowerCase().includes(query);
    });
  }

  private renderArticles() {
    this.articleList.empty();
    const entries = this.visibleEntries();
    this.status.setText(entries.length ? `${entries.length} 篇文章` : '没有符合条件的文章');
    for (const entry of entries) {
      const row = this.articleList.createEl('button', { cls: 'lrr-article-row', attr: { type: 'button', 'aria-pressed': String(this.selectedId === entry.id) } });
      row.createSpan({ text: entry.title, cls: 'lrr-article-title' });
      row.createSpan({ text: entry.publishedAt ? new Date(entry.publishedAt).toLocaleDateString() : '', cls: 'lrr-article-date' });
      if (!this.plugin.state.readIds.includes(entry.id)) row.addClass('is-unread');
      if (this.plugin.state.favoriteIds.includes(entry.id)) row.createSpan({ text: '★', cls: 'lrr-article-mark', attr: { 'aria-label': '已收藏' } });
      row.onclick = () => { this.selectedId = entry.id; this.plugin.state.selectedEntryId = entry.id; if (!this.plugin.state.readIds.includes(entry.id)) this.plugin.state.readIds.push(entry.id); void this.plugin.persist(); this.render(); };
    }
  }

  private renderArticle() {
    this.article.empty();
    const entry = this.currentSubscription()?.entries.find(item => item.id === (this.selectedId || this.plugin.state.selectedEntryId));
    if (!entry) { this.article.createEl('p', { text: '选择一篇文章开始阅读。', cls: 'lrr-empty' }); return; }
    const head = this.article.createDiv({ cls: 'lrr-article-head' });
    head.createEl('h2', { text: entry.title });
    const meta = head.createDiv({ cls: 'lrr-article-meta' });
    if (entry.author) meta.createSpan({ text: entry.author });
    if (entry.publishedAt) meta.createSpan({ text: new Date(entry.publishedAt).toLocaleString() });
    const actions = head.createDiv({ cls: 'lrr-article-actions' });
    const favorite = actions.createEl('button', { text: this.plugin.state.favoriteIds.includes(entry.id) ? '取消收藏' : '收藏', attr: { type: 'button' } });
    favorite.onclick = () => { this.plugin.toggleFavorite(entry.id); this.render(); };
    const later = actions.createEl('button', { text: this.plugin.state.laterIds.includes(entry.id) ? '移出稍后读' : '稍后读', attr: { type: 'button' } });
    later.onclick = () => { this.plugin.toggleLater(entry.id); this.render(); };
    const note = actions.createEl('button', { text: '记到今日日记', attr: { type: 'button' } });
    note.onclick = () => { void this.plugin.appendDailyNote(entry).then(() => new Notice('已追加到今日日记')).catch(error => new Notice(error instanceof Error ? error.message : '写入失败')); };
    if (entry.link) {
      const link = actions.createEl('a', { text: '打开原文', href: entry.link, attr: { target: '_blank', rel: 'noopener noreferrer' } });
      link.addClass('lrr-external-link');
    }
    const content = this.article.createDiv({ cls: 'lrr-article-content' });
    safeSetHtml(content, sanitizeArticleHtml(entry.content, entry.link || undefined));
  }

  override onClose() { this.destroyed = true; this.contentEl.empty(); return Promise.resolve(); }
}

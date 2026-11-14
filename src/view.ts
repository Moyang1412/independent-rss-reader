import { ItemView, Menu, Notice, setIcon, type WorkspaceLeaf } from 'obsidian';
import type LocalRssPlugin from './main';
import { SAVED_ENTRIES_SUBSCRIPTION_ID, type FeedEntry, type Subscription } from './core/model';
import { sanitizeArticleHtml } from './core/feed-parser';
import { MicrophoneRecorder } from './audio/recorder';
import { countUnreadEntries } from './core/subscriptions';

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
    const searchRow = searchWrap.createDiv({ cls: 'lrr-search-row' });
    this.search = searchRow.createEl('input', { type: 'search', placeholder: '搜索文章', attr: { 'aria-label': '搜索文章' } });
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
        const row = section.createEl('button', { cls: 'lrr-source-row', attr: { type: 'button', 'aria-pressed': String(this.currentSubscription()?.id === subscription.id) } });
        row.createSpan({ text: subscription.name || subscription.url, cls: 'lrr-source-name' });
        const isSaved = subscription.id === SAVED_ENTRIES_SUBSCRIPTION_ID;
        row.draggable = !isSaved;
        const unread = countUnreadEntries(subscription, this.plugin.state.readIds);
        const meta = row.createSpan({ cls: 'lrr-source-meta' });
        meta.createSpan({ text: `${unread} 未读`, cls: 'lrr-source-unread' });
        if (subscription.paused) meta.createSpan({ text: '已暂停', cls: 'lrr-source-state' });
        else if (subscription.error) meta.createSpan({ text: '更新失败', cls: 'lrr-source-error', attr: { title: subscription.error } });
        else if (subscription.updatedAt) meta.createSpan({ text: new Date(subscription.updatedAt).toLocaleDateString(), cls: 'lrr-source-date' });
        row.onclick = () => { this.plugin.state.selectedSubscriptionId = subscription.id; this.selectedId = ''; void this.plugin.persist(); this.render(); };
        if (!isSaved) {
          row.ondragstart = event => { event.dataTransfer?.setData('text/plain', subscription.id); if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'; };
          row.ondragover = event => { event.preventDefault(); if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'; };
          row.ondrop = event => { event.preventDefault(); const sourceId = event.dataTransfer?.getData('text/plain'); if (sourceId && sourceId !== subscription.id) void this.plugin.reorderSubscriptions(sourceId, subscription.id); };
        }
        row.oncontextmenu = event => {
          event.preventDefault();
          if (isSaved) return;
          const menu = new Menu();
          menu.addItem(item => item.setTitle('编辑订阅').setIcon('pencil').onClick(() => this.plugin.openEditSubscription(subscription.id)));
          menu.addItem(item => item.setTitle(subscription.paused ? '恢复订阅' : '暂停订阅').setIcon(subscription.paused ? 'play' : 'pause').onClick(() => { void this.plugin.toggleSubscriptionPaused(subscription.id); }));
          menu.addItem(item => item.setTitle('刷新此订阅').setIcon('refresh-cw').onClick(() => { void this.plugin.refreshOneSubscription(subscription.id); }));
          menu.addSeparator();
          menu.addItem(item => item.setTitle('删除订阅').setIcon('trash').onClick(() => this.plugin.openDeleteSubscription(subscription.id)));
          menu.showAtMouseEvent(event);
        };
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
    const note = actions.createEl('button', { text: '记到今日日记', attr: { type: 'button' } });
    note.onclick = () => { void this.plugin.appendDailyNote(entry).then(() => new Notice('已追加到今日日记')).catch(error => new Notice(error instanceof Error ? error.message : '写入失败')); };
    if (entry.link) {
      const link = actions.createEl('a', { text: '打开原文', href: entry.link, attr: { target: '_blank', rel: 'noopener noreferrer' } });
      link.addClass('lrr-external-link');
    }
    const content = this.article.createDiv({ cls: 'lrr-article-content' });
    safeSetHtml(content, sanitizeArticleHtml(entry.content, entry.link || undefined));
    if (cachedSummary) {
      const summary = this.article.createDiv({ cls: 'lrr-ai-summary' });
      summary.createEl('h3', { text: 'DeepSeek 摘要' });
      summary.createEl('div', { text: cachedSummary });
    }
  }

  private updateAudioButtons() {
    if (this.destroyed) return;
    const enabled = this.plugin.canUseDeepSeek();
    if (this.voiceButton) { this.voiceButton.disabled = !enabled; this.voiceButton.setText('选择音频'); }
    if (this.recordButton) { this.recordButton.disabled = !enabled; this.recordButton.setText('开始录音'); }
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

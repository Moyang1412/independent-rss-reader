import { Modal, Notice, Setting } from 'obsidian';
import type LocalRssPlugin from './main';
import type { Subscription } from './core/model';

export class EditFeedModal extends Modal {
  private url: string;
  private name: string;
  private group: string;
  private cacheLimit: string;

  constructor(private readonly plugin: LocalRssPlugin, private readonly subscription: Subscription) {
    super(plugin.app);
    this.url = subscription.url;
    this.name = subscription.name;
    this.group = subscription.group;
    this.cacheLimit = String(subscription.cacheLimit || 50);
  }

  override onOpen() {
    this.titleEl.setText('编辑订阅');
    new Setting(this.contentEl).setName('地址').setDesc('必须是 http:// 或 https:// 地址。').addText(text => {
      text.inputEl.type = 'url';
      text.setValue(this.url).setPlaceholder('https://example.com/feed.xml');
      text.onChange(value => { this.url = value; });
      window.setTimeout(() => text.inputEl.focus(), 0);
    });
    new Setting(this.contentEl).setName('名称').addText(text => {
      text.setValue(this.name).onChange(value => { this.name = value; });
    });
    new Setting(this.contentEl).setName('分组').setDesc('可留空。').addText(text => {
      text.setValue(this.group).onChange(value => { this.group = value; });
    });
    new Setting(this.contentEl).setName('缓存上限').setDesc('保留的文章数量，范围为 1 到 10000。未读和收藏文章会优先保留。').addText(text => {
      text.setValue(this.cacheLimit).onChange(value => { this.cacheLimit = value; });
    });
    const buttons = this.contentEl.createDiv({ cls: 'lrr-modal-actions' });
    buttons.createEl('button', { text: '取消', attr: { type: 'button' } }).onclick = () => this.close();
    const submit = buttons.createEl('button', { text: '保存', cls: 'mod-cta', attr: { type: 'button' } });
    submit.onclick = () => {
      submit.disabled = true;
      const limit = Number(this.cacheLimit);
      if (!Number.isInteger(limit) || limit < 1 || limit > 10_000) {
        submit.disabled = false;
        new Notice('缓存上限必须是 1 到 10000 的整数');
        return;
      }
      void this.plugin.updateSubscription(this.subscription.id, this.url, this.name, this.group, limit).then(() => this.close()).catch(error => {
        submit.disabled = false;
        new Notice(error instanceof Error ? error.message : '订阅保存失败');
      });
    };
  }

  override onClose() { this.contentEl.empty(); }
}

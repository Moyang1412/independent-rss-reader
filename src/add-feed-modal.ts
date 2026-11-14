import { Modal, Notice, Setting } from 'obsidian';
import type LocalRssPlugin from './main';

export class AddFeedModal extends Modal {
  private url = '';
  private name = '';
  private group = '';
  constructor(private readonly plugin: LocalRssPlugin) { super(plugin.app); }

  override onOpen() {
    this.titleEl.setText('添加订阅');
    const intro = this.contentEl.createEl('p', { text: '输入 RSS、Atom 或 OPML 地址。订阅内容直接从该地址读取。' });
    intro.addClass('lrr-form-hint');
    new Setting(this.contentEl).setName('地址').setDesc('必须是 http:// 或 https:// 地址，不包含用户名或密码。').addText(text => {
      text.inputEl.type = 'url';
      text.inputEl.placeholder = 'https://example.com/feed.xml';
      text.inputEl.setAttribute('autocomplete', 'url');
      text.inputEl.setAttribute('aria-label', 'RSS 或 OPML 地址');
      text.onChange(value => { this.url = value; });
      window.setTimeout(() => text.inputEl.focus(), 0);
    });
    new Setting(this.contentEl).setName('名称').setDesc('留空时使用订阅源自身的名称。').addText(text => {
      text.inputEl.setAttribute('autocomplete', 'off');
      text.onChange(value => { this.name = value; });
    });
    new Setting(this.contentEl).setName('分组').setDesc('可选，例如“技术”或“阅读”。').addText(text => {
      text.inputEl.setAttribute('autocomplete', 'off');
      text.onChange(value => { this.group = value; });
    });
    const buttons = this.contentEl.createDiv({ cls: 'lrr-modal-actions' });
    const cancel = buttons.createEl('button', { text: '取消', attr: { type: 'button' } });
    cancel.onclick = () => this.close();
    const submit = buttons.createEl('button', { text: '添加', cls: 'mod-cta', attr: { type: 'button' } });
    submit.onclick = () => {
      submit.disabled = true;
      void this.plugin.addSubscription(this.url, this.name, this.group).then(() => this.close()).catch(error => {
        submit.disabled = false;
        new Notice(error instanceof Error ? error.message : '订阅添加失败');
      });
    };
  }

  override onClose() { this.contentEl.empty(); }
}

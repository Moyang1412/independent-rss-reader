import { Modal, Notice, Setting } from 'obsidian';
import type LocalRssPlugin from './main';

export class ImportOpmlModal extends Modal {
  private text = '';
  constructor(private readonly plugin: LocalRssPlugin) { super(plugin.app); }
  override onOpen() {
    this.titleEl.setText('导入 OPML');
    this.contentEl.createEl('p', { text: '粘贴 OPML 内容。导入会先解析和去重，再逐个验证订阅地址。' }).addClass('lrr-form-hint');
    const textarea = this.contentEl.createEl('textarea', { attr: { rows: '12', 'aria-label': 'OPML 内容' } });
    textarea.addClass('lrr-opml-textarea');
    textarea.oninput = () => { this.text = textarea.value; };
    const actions = this.contentEl.createDiv({ cls: 'lrr-modal-actions' });
    actions.createEl('button', { text: '取消', attr: { type: 'button' } }).onclick = () => this.close();
    const submit = actions.createEl('button', { text: '导入', cls: 'mod-cta', attr: { type: 'button' } });
    submit.onclick = () => {
      submit.disabled = true;
      void this.plugin.importOpml(this.text).then(count => { new Notice(`已导入 ${count} 个订阅`); this.close(); }).catch(error => {
        submit.disabled = false; new Notice(error instanceof Error ? error.message : 'OPML 导入失败');
      });
    };
    new Setting(this.contentEl).setName('提示').setDesc('导入本身不会把笔记或其他库文件上传到任何服务。');
    window.setTimeout(() => textarea.focus(), 0);
  }
  override onClose() { this.contentEl.empty(); }
}

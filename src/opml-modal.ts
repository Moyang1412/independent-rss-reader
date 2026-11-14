import { Modal, Notice, Setting } from 'obsidian';
import type LocalRssPlugin from './main';

export class ImportOpmlModal extends Modal {
  private text = '';
  constructor(private readonly plugin: LocalRssPlugin) { super(plugin.app); }
  override onOpen() {
    this.titleEl.setText('导入 OPML');
    this.contentEl.createEl('p', { text: '粘贴 OPML 内容，或选择 .opml/.xml 文件。导入会先解析和去重，再逐个验证订阅地址。' }).addClass('lrr-form-hint');
    const textarea = this.contentEl.createEl('textarea', { attr: { rows: '12', 'aria-label': 'OPML 内容' } });
    textarea.addClass('lrr-opml-textarea');
    textarea.oninput = () => { this.text = textarea.value; };
    const actions = this.contentEl.createDiv({ cls: 'lrr-modal-actions' });
    const fileInput = this.contentEl.createEl('input', { type: 'file', attr: { accept: '.opml,.xml,application/xml,text/xml', 'aria-label': '选择 OPML 文件' } });
    fileInput.hidden = true;
    const choose = actions.createEl('button', { text: '选择文件', attr: { type: 'button' } });
    choose.onclick = () => fileInput.click();
    fileInput.onchange = () => {
      const file = fileInput.files?.[0];
      fileInput.value = '';
      if (!file) return;
      if (!/\.(opml|xml)$/i.test(file.name)) { new Notice('请选择 .opml 或 .xml 文件'); return; }
      void file.text().then(text => { this.text = text; textarea.value = text; }).catch(() => new Notice('无法读取 OPML 文件'));
    };
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

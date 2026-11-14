import { Modal, Notice, Setting } from 'obsidian';
import type LocalRssPlugin from './main';
import type { FeedEntry } from './core/model';

export class ArticleKnowledgeModal extends Modal {
  private tags: string;
  private note: string;

  constructor(private readonly plugin: LocalRssPlugin, private readonly entry: FeedEntry) {
    super(plugin.app);
    const knowledge = plugin.getArticleKnowledge(entry.id);
    this.tags = knowledge.tags.join(', ');
    this.note = knowledge.note;
  }

  override onOpen() {
    this.titleEl.setText('文章标签和备注');
    new Setting(this.contentEl).setName('标签').setDesc('用逗号分隔，例如：技术, 阅读。').addText(text => {
      text.setValue(this.tags).onChange(value => { this.tags = value; });
    });
    new Setting(this.contentEl).setName('备注').addTextArea(text => {
      text.setValue(this.note).onChange(value => { this.note = value; });
    });
    const buttons = this.contentEl.createDiv({ cls: 'lrr-modal-actions' });
    buttons.createEl('button', { text: '取消', attr: { type: 'button' } }).onclick = () => this.close();
    const save = buttons.createEl('button', { text: '保存', cls: 'mod-cta', attr: { type: 'button' } });
    save.onclick = () => {
      save.disabled = true;
      const tags = this.tags.split(',');
      void this.plugin.updateArticleKnowledge(this.entry.id, tags, this.note).then(() => this.close()).catch(error => {
        save.disabled = false;
        new Notice(error instanceof Error ? error.message : '保存文章信息失败');
      });
    };
  }

  override onClose() { this.contentEl.empty(); }
}

import { Modal, Notice } from 'obsidian';
import type LocalRssPlugin from './main';
import type { Subscription } from './core/model';

export class DeleteFeedModal extends Modal {
  constructor(private readonly plugin: LocalRssPlugin, private readonly subscription: Subscription) { super(plugin.app); }

  override onOpen() {
    this.titleEl.setText('删除订阅');
    this.contentEl.createEl('p', { text: `要如何处理“${this.subscription.name}”中的 ${this.subscription.entries.length} 篇文章？` });
    const actions = this.contentEl.createDiv({ cls: 'lrr-modal-actions lrr-modal-actions-stacked' });
    const keep = actions.createEl('button', { text: '删除订阅，保留文章', attr: { type: 'button' } });
    keep.onclick = () => { keep.disabled = true; void this.plugin.removeSubscription(this.subscription.id, true).then(() => this.close()).catch(error => { keep.disabled = false; new Notice(error instanceof Error ? error.message : '删除失败'); }); };
    const discard = actions.createEl('button', { text: '删除订阅和文章', cls: 'mod-warning', attr: { type: 'button' } });
    discard.onclick = () => { discard.disabled = true; void this.plugin.removeSubscription(this.subscription.id, false).then(() => this.close()).catch(error => { discard.disabled = false; new Notice(error instanceof Error ? error.message : '删除失败'); }); };
    actions.createEl('button', { text: '取消', attr: { type: 'button' } }).onclick = () => this.close();
  }

  override onClose() { this.contentEl.empty(); }
}

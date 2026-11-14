import { Modal } from 'obsidian';

export class ConfirmModal extends Modal {
  constructor(app: ConfirmModal['app'], private readonly message: string, private readonly confirm: () => void) { super(app); }
  override onOpen() {
    this.titleEl.setText('确认操作');
    this.contentEl.createEl('p', { text: this.message });
    const actions = this.contentEl.createDiv({ cls: 'lrr-modal-actions' });
    actions.createEl('button', { text: '取消', attr: { type: 'button' } }).onclick = () => this.close();
    actions.createEl('button', { text: '删除', cls: 'mod-warning', attr: { type: 'button' } }).onclick = () => { this.confirm(); this.close(); };
  }
  override onClose() { this.contentEl.empty(); }
}

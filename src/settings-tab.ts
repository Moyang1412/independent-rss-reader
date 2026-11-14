import { PluginSettingTab, Setting } from 'obsidian';
import type LocalRssPlugin from './main';

export class ReaderSettingsTab extends PluginSettingTab {
  constructor(app: PluginSettingTab['app'], private readonly plugin: LocalRssPlugin) { super(app, plugin); }

  override display() {
    const { containerEl } = this;
    containerEl.empty();
    new Setting(containerEl).setName('阅读器设置').setHeading();
    containerEl.createEl('p', { text: '这是独立的本地/个人 RSS 阅读核心。当前版本不连接乔木服务，也不包含播客、语音、实验室或 Agent 功能。' });
    new Setting(containerEl).setName('订阅数量').setDesc(`${this.plugin.state.subscriptions.length} 个订阅`).addButton(button => {
      button.setButtonText('打开阅读器').setCta().onClick(() => { void this.plugin.openReader(); });
    });
    new Setting(containerEl).setName('今日日记').setDesc('“记到今日日记”会读取 Obsidian 核心日记插件的目录、日期格式和模板设置。');
  }
}

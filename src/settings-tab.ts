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

    new Setting(containerEl).setName('DeepSeek（可选）').setHeading();
    containerEl.createEl('p', { text: '配置后可在文章页面生成摘要或使用语音搜索。支持 16-bit PCM WAV、Ogg Opus，单个音频最多 8 MiB、120 秒。API Key 只保存在当前 Obsidian 库的插件数据中；不配置时，本地 RSS 阅读功能仍可正常使用。' });
    new Setting(containerEl).setName('启用 DeepSeek').setDesc('只影响摘要功能，不影响订阅、阅读、收藏和日记。').addToggle(toggle => {
      toggle.setValue(this.plugin.state.deepseek.enabled).onChange(async value => {
        this.plugin.state.deepseek.enabled = value;
        await this.plugin.persist();
      });
    });
    new Setting(containerEl).setName('API Key').setDesc('不会显示在日志或界面通知中。').addText(text => {
      text.inputEl.type = 'password';
      text.setPlaceholder('sk-…').setValue(this.plugin.state.deepseek.apiKey).onChange(async value => {
        this.plugin.state.deepseek.apiKey = value.trim();
        await this.plugin.persist();
      });
    });
    new Setting(containerEl).setName('接口地址').setDesc('默认使用 DeepSeek 官方 API，也可填写兼容代理地址。').addText(text => {
      text.setValue(this.plugin.state.deepseek.baseUrl).onChange(async value => {
        this.plugin.state.deepseek.baseUrl = value.trim();
        await this.plugin.persist();
      });
    });
    new Setting(containerEl).setName('模型').setDesc('例如 deepseek-flash。').addText(text => {
      text.setValue(this.plugin.state.deepseek.model).onChange(async value => {
        this.plugin.state.deepseek.model = value.trim();
        await this.plugin.persist();
      });
    });
    new Setting(containerEl).setName('请求超时（毫秒）').addText(text => {
      text.setValue(String(this.plugin.state.deepseek.timeoutMs)).onChange(async value => {
        const timeout = Number(value);
        if (!Number.isFinite(timeout) || timeout <= 0) return;
        this.plugin.state.deepseek.timeoutMs = Math.round(timeout);
        await this.plugin.persist();
      });
    });
  }
}

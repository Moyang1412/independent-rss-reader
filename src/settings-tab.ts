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

    new Setting(containerEl).setName('自动刷新').setHeading();
    containerEl.createEl('p', { text: '自动刷新只请求未暂停且已到重试时间的订阅。失败后会按 5、10、20 分钟递增退避，最长 6 小时。' });
    new Setting(containerEl).setName('启用自动刷新').setDesc('启用后按刷新间隔在后台检查订阅。').addToggle(toggle => {
      toggle.setValue(this.plugin.state.refresh.enabled).onChange(async value => {
        this.plugin.state.refresh.enabled = value;
        await this.plugin.persist();
        this.plugin.restartRefreshScheduler();
      });
    });
    new Setting(containerEl).setName('刷新间隔（分钟）').setDesc('范围为 1 到 1440 分钟。').addText(text => {
      text.setValue(String(this.plugin.state.refresh.intervalMinutes)).onChange(async value => {
        const minutes = Number(value);
        if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1_440) return;
        this.plugin.state.refresh.intervalMinutes = minutes;
        await this.plugin.persist();
        this.plugin.restartRefreshScheduler();
      });
    });
    new Setting(containerEl).setName('打开 Obsidian 时刷新').setDesc('库打开并完成布局后执行一次自动刷新。').addToggle(toggle => {
      toggle.setValue(this.plugin.state.refresh.refreshOnOpen).onChange(async value => {
        this.plugin.state.refresh.refreshOnOpen = value;
        await this.plugin.persist();
      });
    });
    const lastRefresh = this.plugin.state.lastRefresh;
    new Setting(containerEl).setName('最近一次刷新').setDesc(lastRefresh.finishedAt ? `${new Date(lastRefresh.finishedAt).toLocaleString()}，成功 ${lastRefresh.successCount}，失败 ${lastRefresh.failedCount}，新增 ${lastRefresh.newArticleCount}` : '尚未刷新');

    new Setting(containerEl).setName('远程只读服务').setHeading();
    containerEl.createEl('p', { text: '远程适配器只使用 GET 读取订阅快照，并把结果缓存到本地阅读器。它不会写入远程服务；关闭后本地 RSS 阅读继续独立工作。' });
    new Setting(containerEl).setName('启用远程只读适配器').setDesc('默认关闭。启用后可手动同步远程订阅。').addToggle(toggle => {
      toggle.setValue(this.plugin.state.remote.enabled).onChange(async value => {
        this.plugin.state.remote.enabled = value;
        await this.plugin.persist();
      });
    });
    new Setting(containerEl).setName('适配器').setDesc('可插拔适配器注册表中的只读实现。').addDropdown(dropdown => {
      for (const id of this.plugin.remoteAdapters.list()) dropdown.addOption(id, id === 'json' ? 'HTTP JSON 只读服务' : id);
      dropdown.setValue(this.plugin.state.remote.adapterId).onChange(async value => {
        if (!this.plugin.remoteAdapters.has(value)) return;
        this.plugin.state.remote.adapterId = value;
        await this.plugin.persist();
      });
    });
    new Setting(containerEl).setName('服务地址').setDesc('例如 https://example.com/api；适配器只请求 GET /subscriptions。').addText(text => {
      text.setValue(this.plugin.state.remote.baseUrl).onChange(async value => {
        this.plugin.state.remote.baseUrl = value.trim();
        await this.plugin.persist();
      });
    });
    new Setting(containerEl).setName('访问令牌（可选）').setDesc('只放在本地设置中，以 Bearer 令牌发送给远程服务。').addText(text => {
      text.inputEl.type = 'password';
      text.setValue(this.plugin.state.remote.apiKey).onChange(async value => {
        this.plugin.state.remote.apiKey = value.trim();
        await this.plugin.persist();
      });
    });
    new Setting(containerEl).setName('请求超时（毫秒）').addText(text => {
      text.setValue(String(this.plugin.state.remote.timeoutMs)).onChange(async value => {
        const timeout = Number(value);
        if (!Number.isFinite(timeout) || timeout < 1_000) return;
        this.plugin.state.remote.timeoutMs = Math.round(timeout);
        await this.plugin.persist();
      });
    });
    new Setting(containerEl).setName('同步远程订阅').setDesc('把远程只读快照缓存到本地；远程条目仍可搜索、阅读、收藏和写入今日日记。').addButton(button => {
      button.setButtonText('立即同步').onClick(() => { void this.plugin.syncRemoteReadOnly(); });
    });

    new Setting(containerEl).setName('离线缓存').setHeading();
    containerEl.createEl('p', { text: '正文会随文章保存在本地。图片缓存写入插件目录，清理时会保留未读和收藏文章使用的图片。' });
    new Setting(containerEl).setName('缓存图片').setDesc('关闭后保留正文缓存，但不再下载新的图片。').addToggle(toggle => {
      toggle.setValue(this.plugin.state.cache.cacheImages).onChange(async value => {
        this.plugin.state.cache.cacheImages = value;
        await this.plugin.persist();
      });
    });

    new Setting(containerEl).setName('知识整理').setHeading();
    containerEl.createEl('p', { text: '保存模板变量：{{title}}、{{source}}、{{author}}、{{publishedAt}}、{{link}}、{{summary}}、{{content}}、{{tags}}、{{note}}。' });
    new Setting(containerEl).setName('文章保存文件夹').setDesc('相对于库根目录的 Markdown 文件夹。').addText(text => {
      text.setValue(this.plugin.state.knowledge.saveFolder).onChange(async value => {
        this.plugin.state.knowledge.saveFolder = value.trim();
        await this.plugin.persist();
      });
    });
    new Setting(containerEl).setName('文章保存模板').addTextArea(text => {
      text.setValue(this.plugin.state.knowledge.saveTemplate).onChange(async value => {
        this.plugin.state.knowledge.saveTemplate = value;
        await this.plugin.persist();
      });
    });
    new Setting(containerEl).setName('Daily Note 插入格式').setDesc('支持 {{title}}、{{source}}、{{publishedAt}}、{{link}}、{{tags}}、{{note}}。').addText(text => {
      text.setValue(this.plugin.state.knowledge.dailyNoteTemplate).onChange(async value => {
        this.plugin.state.knowledge.dailyNoteTemplate = value;
        await this.plugin.persist();
      });
    });

    new Setting(containerEl).setName('DeepSeek（可选）').setHeading();
    containerEl.createEl('p', { text: '配置后可在文章页面生成摘要、直接录音或选择音频进行语音搜索。录音会在本地编码为 16-bit PCM WAV；选择音频时支持 WAV、Ogg Opus，单个音频最多 8 MiB、120 秒。API Key 只保存在当前 Obsidian 库的插件数据中；不配置时，本地 RSS 阅读功能仍可正常使用。' });
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

    new Setting(containerEl).setName('文章翻译（可选）').setHeading();
    containerEl.createEl('p', { text: '翻译复用上面的 DeepSeek API 配置，只发送当前打开的文章；译文保存在本地，不会替换原文。未启用或翻译失败时，本地阅读功能继续可用。' });
    new Setting(containerEl).setName('启用文章翻译').setDesc('默认关闭。启用后可在文章页面按需翻译当前文章；同时需要启用 DeepSeek 并填写 API Key。').addToggle(toggle => {
      toggle.setValue(this.plugin.state.translation.enabled).onChange(async value => {
        this.plugin.state.translation.enabled = value;
        await this.plugin.persist();
      });
    });
    new Setting(containerEl).setName('目标语言').setDesc('例如中文、English、日本語。').addText(text => {
      text.setValue(this.plugin.state.translation.targetLanguage).onChange(async value => {
        this.plugin.state.translation.targetLanguage = value.trim() || '中文';
        await this.plugin.persist();
      });
    });
  }
}

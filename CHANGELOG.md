# Changelog

## 0.1.3 — 2026-11-14

Direct microphone recording for DeepSeek voice search.

### Included

- Start and stop microphone recording from the reader search bar;
- Local 16-bit PCM WAV encoding before upload;
- Automatic microphone and audio-context cleanup on stop, cancel, close, or error;
- Existing WAV/Ogg file selection remains available;
- Microphone permission is requested only after the user starts recording.

## 0.1.2 — 2026-11-14

DeepSeek speech recognition for voice search.

### Included

- Optional DeepSeek ASR adapter using the standalone `/v1/tools/asr` endpoint;
- WAV and Ogg Opus file selection from the reader search bar;
- Local validation for supported formats and the 8 MiB file limit;
- Voice transcript inserted into the local article search box;
- Speech recognition remains opt-in and does not affect local RSS reading.

## 0.1.1 — 2026-11-14

Optional DeepSeek article summaries.

### Included

- Optional DeepSeek Chat Completions adapter, disabled by default;
- Local settings for API key, base URL, model, and timeout;
- Article summary action with local summary caching;
- Obsidian `requestUrl` transport for the runtime adapter;
- Local RSS reading remains available without DeepSeek configuration;
- Speech recognition remains deferred to a later release.

## 0.1.0 — 2026-11-14

First MIT release of **本地 RSS 阅读器**.

### Included

- RSS 2.x, RSS 1/RDF, and Atom parsing;
- OPML paste import and vault export;
- Personal subscriptions with grouping, refresh, search, read state, favorites, and reading later;
- Safe article HTML rendering with URL validation, XML size bounds, and DTD/entity rejection;
- Local persistence in the Obsidian plugin data store;
- Daily Note links using Obsidian's core Daily Notes folder, date format, and template settings;
- Responsive Obsidian view and manual install package.

### Excluded from this release

- Qiaomu backend integration;
- Podcasts, speech, laboratory workflows, Agent integration, and Qiaomu branding;
- Final mobile-device and Windows host validation.

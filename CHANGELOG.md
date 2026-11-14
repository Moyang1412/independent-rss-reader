# Changelog

## 0.4.0 — 2026-11-15

Add controlled automatic refresh.

### Included

- Optional background refresh with a configurable interval;
- Optional refresh when Obsidian finishes opening the vault;
- Paused subscriptions are skipped by automatic refresh;
- New article count notices after successful refreshes;
- Failure counts with exponential retry backoff from 5 minutes up to 6 hours;
- Shared refresh status for manual, open-time, and scheduled refreshes;
- State migration to v5 for refresh settings and refresh summaries.

## 0.3.0 — 2026-11-15

Complete the remaining first reading-efficiency features.

### Included

- Batch favorite selected articles;
- Batch add selected articles to reading later;
- Toggle the article list between newest-first and oldest-first publication order;
- Remember the last opened article for each subscription and restore it after reopening;
- Migrate local state to v4 with per-subscription reading positions.

## 0.2.0 — 2026-11-15

Complete the first reading-efficiency features.

### Included

- Mark every article in the current subscription as read from the reader toolbar;
- Navigate between visible articles with previous/next buttons;
- Use `j`/`k` or Arrow Up/Down for article navigation, and `r` to refresh the current subscription;
- Show the article source in the article list and reading view;
- Filter the current subscription to articles published in the last 7 days;
- Keep the local reading state and all existing RSS, Daily Notes, DeepSeek, and subscription-management features.

## 0.1.5 — 2026-11-15

Complete the remaining subscription-management features.

### Included

- Choose whether to keep articles when deleting a subscription;
- A local “已保存文章” collection for kept articles;
- Drag-and-drop subscription ordering with persistence;
- OPML file picker import for `.opml` and `.xml` files;
- State migration to v3 for saved articles.

## 0.1.4 — 2026-11-15

State migration framework and subscription management.

### Included

- Versioned state migration from legacy v1 data to v2;
- Automatic removal of the old plugin-specific Daily Note folder setting;
- Typed subscription and article state validation;
- Edit subscription URL, name, and group;
- Pause and resume subscriptions;
- Refresh one subscription independently;
- Skip paused subscriptions during full refresh;
- Show unread count, latest update date, paused state, and refresh errors;
- Right-click subscription management menu.

### Still to come

- Delete subscription while keeping its articles;
- Drag-and-drop subscription ordering;
- OPML file picker import.

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

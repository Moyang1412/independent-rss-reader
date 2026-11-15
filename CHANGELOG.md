# Changelog

## 0.12.0 — 2026-11-15

Add an optional Dataview integration while keeping saved articles as ordinary Markdown and local RSS reading independent.

### Included

- Add an opt-in Dataview integration setting with a vault-relative index path, defaulting to `RSS Articles/RSS Articles Index.md`;
- Add the `生成 RSS Dataview 索引` command and a settings-page button to generate or rewrite the index;
- Generate an idempotent Markdown index containing a `dataview` query for saved article links, sources, publication times, and tags;
- Keep the index readable as ordinary Markdown when Dataview is not installed or enabled;
- Reuse the existing article frontmatter fields (`source`, `published`, and `tags`) for queries instead of calling Dataview's internal write APIs;
- Validate index folders before placing them in a Dataview `FROM` clause;
- Keep RSS fetching, local article storage, reading state, offline cache, Markdown saves, and Daily Notes independent of Dataview;
- Add state migration to v12 for the optional Dataview settings.

## 0.11.0 — 2026-11-15

Add optional AI-assisted article organization while keeping manual knowledge editing and local reading independent.

### Included

- Add a DeepSeek-compatible organization adapter with strict JSON validation;
- Generate optional tags, notes, and a one-sentence organization summary for the current article;
- Cache suggestions locally by article, model, target language, and prompt version;
- Require explicit confirmation before merging suggested tags or notes into local article knowledge;
- Preserve manual tags and notes, make confirmation idempotent, and keep failures from changing article state;
- Add state migration to v11 for organization settings and cached suggestions.

## 0.10.0 — 2026-11-15

Add an optional article translation adapter while keeping original articles and local reading independent.

### Included

- Add DeepSeek-compatible article translation through the existing Chat Completions configuration;
- Add target-language configuration and local translation caching by article ID;
- Keep translations opt-in, preserve the original article, and report failures without changing feed state;
- Add state migration to v10 for translation settings and cached translations.

## 0.9.0 — 2026-11-15

Add an optional remote read-only service adapter while keeping local RSS as the primary reading path.

### Included

- Add a registry for pluggable remote read-only adapters;
- Add the built-in JSON adapter with GET-only subscription snapshot loading;
- Validate remote URLs, JSON payloads, article fields, HTTP status, and request timeouts;
- Keep remote subscriptions marked read-only and keep reading state, caching, notes, Markdown saves, and Daily Note writes local;
- Add state migration to v9 for remote adapter settings and subscription bindings;
- Keep the adapter disabled by default so local RSS reading works without a remote service.

## 0.8.0 — 2026-11-15

Improve narrow-screen, mobile, accessibility, and large-list behavior.

### Included

- Add container-query layouts for narrow panels and 320px-wide screens;
- Use larger 44px touch targets on coarse-pointer devices;
- Add skip-to-article-list navigation, main landmarks, accessible names, live status, and visible focus rings;
- Add `Home` and `End` keyboard navigation alongside existing `j`/`k`, arrow keys, and `r` shortcuts;
- Window the article list with a fixed-height virtual rendering range and overscan;
- Preserve article selection, filtering, batch actions, and keyboard navigation while virtualized;
- Respect Obsidian light/dark themes and native color-scheme controls.

## 0.7.0 — 2026-11-15

Improve RSS/Atom compatibility and subscription diagnostics.

### Included

- Discover RSS, Atom, and RDF links from HTML site pages;
- Follow `rel="next"` pagination links for up to five pages and merge entries across pages;
- De-duplicate paginated entries by their source ID;
- Parse categories, comments URLs, media URLs/types, site descriptions, language, and generator fields;
- Resolve relative article, image, enclosure, and site links;
- Show site icons, site information, and feed cover images in the subscription list;
- Add per-subscription and all-subscription health checks;
- Classify timeout, network, certificate, redirect, HTTP, and XML parsing failures with readable messages;
- State migration to v8 for source IDs and health metadata.

## 0.6.0 — 2026-11-15

Add local knowledge organization for RSS articles.

### Included

- Add article tags and notes with local persistence;
- Show saved tags and notes in the article reading view;
- Save an article as Markdown in a configurable vault-relative folder;
- Support custom article save templates and Daily Note insertion formats;
- Provide template variables for title, source, author, publication time, link, summary, Markdown body, tags, and notes;
- Record the saved path and prevent saving the same article twice;
- Sanitize entry IDs when generating filenames so local IDs such as `local:...` remain valid vault paths;
- State migration to v7 for article knowledge and save settings.

## 0.5.0 — 2026-11-15

Add offline article and image caching.

### Included

- Keep complete article bodies in the local subscription cache;
- Download and reuse article images from the plugin cache directory;
- Continue reading cached articles when a refresh fails or the network is unavailable;
- Set a cache limit for each subscription;
- Clean old article and image cache entries while protecting unread and favorite articles;
- State migration to v6 for cache settings and cached image metadata.

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

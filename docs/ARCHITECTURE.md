# First-version architecture

The plugin is deliberately split into a platform-independent core and a thin Obsidian adapter.

- `src/core/`: feed parsing, validation, safe HTML, state types, and storage-independent domain logic.
- `src/`: plugin lifecycle, settings, modal forms, vault writes, feed transport, and Obsidian views.
- `src/styles.css`: the plugin's own visual system; it does not reuse the reference project's assets or branding.

The first version uses direct user-provided feed URLs. It has no Qiaomu API client. An optional DeepSeek adapter provides article summaries through the Chat Completions API; the feed parser, local state, and reader view do not depend on that adapter. Daily Note writes read the enabled Obsidian core Daily Notes plugin at action time, including its folder, date format, and template.

## Data boundary

Feed XML is fetched from the URL the user adds. It is parsed locally. The plugin stores subscription metadata, article summaries/content, read/favorite state, and optional DeepSeek configuration in Obsidian plugin data. Daily Note writes are explicit user actions. DeepSeek requests are explicit user actions and include only the selected article fields needed for summarization. The plugin does not upload vault notes, searches, read markers, or favorites.

## Security boundary

The parser rejects oversized XML and DTD/entity declarations. URLs must be HTTP(S) without embedded credentials. Article HTML is sanitized before insertion. Scripts, event-handler attributes, executable embeds, unsafe URL schemes, and remote forms are not rendered.

## Optional DeepSeek adapter

The adapter uses `POST /chat/completions` below the configured base URL. It sends a non-streaming JSON request with the configured model and selected article content. It is disabled by default, keeps the API key in local plugin data, and reports API failures without changing the locally cached feed or article state. Speech recognition is intentionally outside this version.

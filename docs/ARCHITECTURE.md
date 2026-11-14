# First-version architecture

The plugin is deliberately split into a platform-independent core and a thin Obsidian adapter.

- `src/core/`: feed parsing, validation, safe HTML, state types, and storage-independent domain logic.
- `src/`: plugin lifecycle, settings, modal forms, vault writes, feed transport, and Obsidian views.
- `src/styles.css`: the plugin's own visual system; it does not reuse the reference project's assets or branding.

The first version uses direct user-provided feed URLs. It has no Qiaomu API client and no server-side generation path. A future remote adapter can be added without changing the feed parser or local state model. Daily Note writes read the enabled Obsidian core Daily Notes plugin at action time, including its folder, date format, and template.

## Data boundary

Feed XML is fetched from the URL the user adds. It is parsed locally. The plugin stores subscription metadata, article summaries/content, and read/favorite state in Obsidian plugin data. Daily Note writes are explicit user actions. The first version does not upload vault notes, searches, read markers, or favorites.

## Security boundary

The parser rejects oversized XML and DTD/entity declarations. URLs must be HTTP(S) without embedded credentials. Article HTML is sanitized before insertion. Scripts, event-handler attributes, executable embeds, unsafe URL schemes, and remote forms are not rendered.

# 本地 RSS 阅读器

This is an independent Obsidian plugin for reading personal RSS and Atom subscriptions locally.

The first version is MIT-licensed. It does not connect to the Qiaomu service and does not include podcasts, speech, laboratory workflows, Agent integration, or Qiaomu branding.

## First-version scope

- RSS 2.x, RSS 1.0/RDF, and Atom 1.0 feeds
- OPML import and export
- Local subscription groups
- Article list, search, read state, favorites, and reading later
- Safe article HTML rendering
- Local persistence through the Obsidian vault plugin data store
- Append a title link to today's Daily Note using Obsidian's core Daily Notes folder, format, and template settings

## Development

```sh
npm ci
npm run check
```

The plugin bundle is written to `main.js`, and the build copies the stylesheet to the root `styles.css`.

## Install

Download the latest zip from the [GitHub Releases](../../releases) page, then extract it into your vault:

```text
<vault>/.obsidian/plugins/independent-rss-reader/
├── main.js
├── manifest.json
├── styles.css
└── LICENSE
```

Open Obsidian settings → Community plugins, turn off Restricted mode if needed, and enable **本地 RSS 阅读器**. The plugin ID is `independent-rss-reader`.

The current release uses Obsidian's core Daily Notes settings for “记到今日日记”: its folder, date format, and template are read at action time.

## License

The project code is licensed under the MIT License. See [LICENSE](LICENSE). Dependencies and remote feed content retain their own licenses and terms.

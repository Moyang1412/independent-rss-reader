# First-version architecture

The plugin is deliberately split into a platform-independent core and a thin Obsidian adapter.

- `src/core/`: feed parsing, validation, safe HTML, state types, and storage-independent domain logic.
- `src/`: plugin lifecycle, settings, modal forms, vault writes, feed transport, and Obsidian views.
- `src/styles.css`: the plugin's own visual system; it does not reuse the reference project's assets or branding.

The plugin uses direct user-provided feed URLs as its local source of truth. It has no Qiaomu API client. Optional DeepSeek adapters provide article summaries through Chat Completions, article translations and AI organization suggestions through the same Chat Completions endpoint, and file-based speech recognition through `/v1/tools/asr`. An optional remote read-only adapter can import subscription and article snapshots through GET requests, but it cannot mutate the remote service and does not replace local RSS subscriptions. The feed parser, local state, and reader view remain usable without any adapter. Daily Note writes read the enabled Obsidian core Daily Notes plugin at action time, including its folder, date format, and template.

## Data boundary

Feed XML is fetched from the URL the user adds. It is parsed locally. When enabled, the remote adapter issues only GET requests to its configured read-only service and converts the returned subscriptions/articles into local snapshots. The plugin stores subscription metadata, article summaries/content, read/favorite state, optional article translations, cached AI organization suggestions, remote snapshot metadata, and optional adapter configuration in Obsidian plugin data. Daily Note writes are explicit user actions. DeepSeek requests are explicit user actions and include only the selected article fields or selected audio file needed for the action. The plugin does not upload vault notes, searches, read markers, or favorites.

## Security boundary

The parser rejects oversized XML and DTD/entity declarations. URLs must be HTTP(S) without embedded credentials. Article HTML is sanitized before insertion. Scripts, event-handler attributes, executable embeds, unsafe URL schemes, and remote forms are not rendered.

## Optional DeepSeek adapter

The text adapter uses `POST /chat/completions` below the configured base URL. It sends a non-streaming JSON request with the configured model and selected article content. The ASR adapter uses `POST /v1/tools/asr`, sends one `file` multipart field, and validates the 8 MiB and 120-second limits before making a request. Both adapters are disabled by default, keep the API key in local plugin data, and report failures without changing the locally cached feed or article state.

## Optional article translation adapter

The translation adapter reuses the configured DeepSeek-compatible Chat Completions endpoint and credentials. It sends only the selected article title, summary, and content with an explicit target language, limits the input to 60,000 characters, and caches the returned translation locally by article ID. The original article remains the source of truth; translation errors are reported without changing feed state or blocking local reading.

## Optional AI organization adapter

The organization adapter reuses the configured DeepSeek-compatible Chat Completions endpoint and credentials. It sends only the selected article title, summary, and content and asks for a strict JSON object containing tags, a suggested note, and a one-sentence organization summary. The response is validated, bounded, de-duplicated, and cached locally by article ID, model, target language, and prompt version. A cached suggestion is displayed for review; only an explicit confirmation updates local article tags and notes. Existing manual knowledge is preserved and confirmation is idempotent. Organization errors do not change feed state or block local reading.

## Optional remote read-only adapter

The remote adapter is represented by a small registry so other providers can be added without changing the local reader core. The built-in `json` provider uses a `GET /subscriptions` endpoint and accepts subscription payloads containing `entries`, `articles`, or `items`. Requests include the configured API key as a bearer token when one is provided, and use the configured timeout. Responses are validated before they enter local state.

Remote subscriptions carry an adapter ID and remote subscription ID and are marked `readOnly`. The UI can display and read them, but local edit, delete, reorder, and RSS refresh actions do not write back to the remote service. Local read markers, favorites, later-reading state, cached bodies/images, tags, notes, Markdown saves, and Daily Note writes remain local. If the adapter is disabled or unavailable, existing local RSS subscriptions and already imported remote snapshots remain readable.

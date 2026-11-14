# First-version validation

Validated locally on 2026-11-14:

- `npm run check` completes with zero lint errors.
- Vitest: 6 parser and sanitization tests pass.
- TypeScript typecheck passes.
- esbuild produces an Obsidian bundle (`main.js`, about 843 KB).

The automated tests cover URL validation, RSS 2 parsing, Atom parsing, DTD/entity rejection, XML size limits, HTML sanitization, OPML group import, de-duplication, and export round-tripping.

Not yet validated:

- Installing the bundle inside a real Obsidian vault;
- Physical iOS or Android behavior;
- Windows behavior;
- network behavior against a representative set of live feeds;
- migration from any other plugin's data format;
- final name, branding, and distribution license.

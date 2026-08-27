# OpenMastery

A self-hostable K–12 mastery-learning engine. Skills derive from the
standards layer (CCSS-M + the Coherence Map + the Progressions documents),
practice is generated and machine-verified, lessons are parameterized
widget animations, and mastery is tracked with BKT + FSRS spaced review
over an event-sourced core.

| directory | what | license |
|---|---|---|
| `schema/` | curriculum schema, cairn-expr template language, validator | MIT |
| `cairn/` | engine, PWA client, widgets, site server | AGPL-3.0 |
| `curriculum/` | skills, items, explanation timelines | CC BY 4.0 |

- Architecture: `cairn-architecture.md` (authoritative design doc)
- Task queue: `TODO.md`
- Widget standard: `cairn/GOLDEN_WIDGET.md`
- Standards derivation: `curriculum/sources/standards/`

## Try it

**Browser demo** (no backend — the engine runs in your browser, progress
stays on your device): deployed by `.github/workflows/demo-pages.yml`,
or locally:

```sh
cd schema && npm ci && cd ../cairn && npm ci
npm run build:demo && npx serve dist-demo   # any static file server
```

**Dev loop** (real client/server split):

```sh
cd cairn && npm run build && npm run server   # site server on :4777
```

## Content licensing

The catalog is CC BY 4.0 only — NC-licensed OER is excluded outright
(`curriculum/sources/*/SOURCES.md` records the pinned upstream commits
and the policy's reasoning).

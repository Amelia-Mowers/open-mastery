# Cairn

Self-hostable mastery-learning engine (architecture v0.9). AGPL-3.0-only.

Three sibling repos: this one (client + core + server), `../schema`
(curriculum schema + cairn-expr, MIT), `../curriculum` (content, CC BY 4.0).

## Prerequisites

Either enter the dev shell (Bun + Node 24, pinned by `flake.nix`):

```sh
nix develop
```

…or bring your own Node ≥ 24 (needed to run TypeScript directly). Then, once
per checkout, in each sibling repo:

```sh
(cd ../schema && npm install)
(cd ../curriculum && npm install)   # optional, for content validation
npm install
```

## Run the app locally

```sh
npm run build     # build the PWA client into dist/
npm run server    # site server on http://localhost:4777
```

Open http://localhost:4777 — enter any name on the join card and work
through lesson → faded → practice → mastery check against the real
Prealgebra §8.2 content from `../curriculum`. Flags/state per student:
`/api/state?student=<name>`, event log: `/api/events?student=<name>`.

Server options: `npm run server -- --curriculum <dir> --port <n> --static <dir>`.

For client work with hot reload, run the server in one terminal and:

```sh
npm run dev       # vite on http://localhost:5173, proxying /api to :4777
```

## Test

```sh
npm test              # everything: widgets, core, server loop, client E2E
npm run typecheck
npx vitest run test/core      # synthetic-student simulations + core properties
npx vitest run test/server    # HTTP loop against the dev site server
npx vitest run test/client    # real <App/> vs real server, jsdom
(cd ../schema && npm test)    # cairn-expr + schema + bundle validator
(cd ../curriculum && npm run validate)  # content: authoring profile
```

The server-loop and client tests use the in-repo fixture bundle and, where
present, the sibling `../curriculum` content.

## Layout

```
src/core/      pure engine: BKT, graders, fold, corrective policy/v1, selector
src/client/    widget layer (§4.4) and the PWA app shell
src/server/    dev site server (node:http; the step-5 Bun binary replaces it)
test/          the executable spec (§10)
```

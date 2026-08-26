# Cairn engine notes

- `npm test` (vitest: core simulations, server loop, client E2E in jsdom),
  `npm run typecheck`, `npm run build` (PWA), `npm run server` (dev site
  server on :4777 serving ../curriculum + dist).
- The architecture doc (`../cairn-architecture.md`) is authoritative; the
  UI mockup is reference only.
- **Widget sourcing: mine Illustrative Mathematics first edition (CC BY)
  for diagrams before inventing visualizations** — inventory and license
  rules in `../curriculum/sources/illustrative-mathematics/SOURCES.md`.
  Existing viz widgets: balance-scale, envelope-model, tape-diagram,
  hanger-diagram, area-model; lesson timelines drive them via patches
  (see `src/client/app/LessonPlayer.tsx` setup functions).
- **Widget standard: programmatic + tested at extremes.** Widgets render
  from actual instance variables (never another family's numbers), and
  every widget gets edge-case tests at the generator's extremes: max/min
  counts, negatives, zero, unevaluable templates — see
  `test/client/widget-extremes.test.tsx`. Player setup guards must fall
  back to caption-only rather than render something broken or overflowing.
- **Widget zoo**: `?view=zoo` renders every explanation animation and
  answer input on one page (autoplaying, replayable, params shown) — use
  it for widget testing/debugging before staging curriculum flows.
- Dev-server screenshot workflow: kill old servers first (`pkill -f` on
  the server pattern kills the invoking shell — run it in its own command
  and expect exit 144), start with nohup+disown, then verify served
  content via `/api/explain` curl BEFORE screenshotting.

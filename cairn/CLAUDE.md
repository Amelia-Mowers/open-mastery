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
- **The widget trinity (§4.4): one widget = display + input + lesson.**
  The single contract (render(params, mode), extract(), applyPatch())
  covers all three roles: 'lesson' mode is patch-driven animation,
  'problem' mode is the interactive answer space (extract() returns the
  answer), 'review' is disabled display. WIDGET_ROLES in the registry is
  the live matrix; the zoo shows both roles. When a representation IS the
  answer space, the same widget teaches AND asks (opposite-flip does
  both for negate). Planned input semantics for the display-only widgets:
  balance-scale/hanger = op ENTRY (construct the move: symbol + operand
  via shared OpEntry, mirrored under both sides; graded by the 'op'
  answer type); tape-diagram = fill a part; envelope-model = distribute
  counters; area-model = fill the products; worked-equation = write the
  next line. Inputs are constructed responses — never multiple choice
  unless the answer is genuinely categorical (choice widget).
- **STEPWISE PROBLEMS (the unified-widget direction)**: timeline steps
  may carry `expect` ({type: op|expr|numeric|pick, value, prompt?,
  hint?}) — in stepwise play (`StepwisePlayer`) the timeline PAUSES
  there and the student constructs the move; the step's patch plays as
  confirmation. `pick` = decomposition gates (click the equation-banner
  piece; value = acceptable segment indices; needs an earlier `equation`
  patch). Every gate has "Show me" (the widget solves that step,
  tallied); completed steps scrub via dots. THE SPECTRUM: faded serves
  always lead stepwise; scaffolded PRACTICE serves lead stepwise too
  when expects exist (engaging any gate → hintLevel ≥1 via onEngaged;
  skipping straight to the answer box keeps full credit — the
  expertise-reversal guard). Autoplay lessons ignore expects. Author
  expects on the steps that ARE moves (decompositions, both-sides ops,
  next lines), never on pure scene-setting.
- **`GOLDEN_WIDGET.md` is the widget standard** — trinity roles, staged
  decomposition entrances paired with `eqHighlight`, semantic (never
  numeric) widget fit, review-mode inertness, keyboard operation, motion,
  and the add-a-widget checklist. Conformance tests:
  `test/client/golden-widget.test.tsx`. The bullets below are summaries.
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
- **Future work is tracked centrally in `../TODO.md`** (flow gaps,
  planned inputs, build steps) — leave context in docs, move the task.
- **Browser demo** (`npm run build:demo` → `dist-demo/`): the app with the
  backend rolled into the browser — `src/site/core.ts` (SiteCore) is ALL
  site behavior, shared by the HTTP dev server and `src/client/demo/DemoApi`
  (localStorage event log). Demo builds ship answer keys by design; the
  normal build never references the demo entry. GH Pages workflow:
  `../.github/workflows/demo-pages.yml` (expects an open_mastery monorepo
  remote).
- **MONOREPO (2026-08-27)**: this directory is part of the single git repo
  at the workspace root (github.com/Amelia-Mowers/open-mastery). Commit at
  the ROOT — the old per-directory repos are archived as .git-local-archive
  and must not be used. Every push to main redeploys the Pages demo.
- **Fail loudly.** A wrong-but-plausible render (an addition walkthrough
  on a subtraction problem) is worse than an error. Prefer invariants
  that make the state unrepresentable; where that's not mechanical, add
  a validator check that at least WARNS (see [form_mismatch]). Never let
  a fallback silently produce content that could teach the wrong thing.
- **Visual review pass**: after ANY widget or timeline change, run
  `scripts/shoot-widgets.sh <out>` (screenshots every explanation's final
  state via ?view=zoo&exp=<id>, tiles contact sheets) and actually REVIEW
  the sheets. The harness needs --run-all-compositor-stages-before-draw
  (already set) — without it, virtual-time screenshots can capture stale
  frames and report phantom bugs.

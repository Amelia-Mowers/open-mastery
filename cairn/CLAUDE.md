# Cairn engine notes

- `npm test` (vitest: core simulations, server loop, client E2E in jsdom),
  `npm run typecheck`, `npm run build` (PWA), `npm run server` (dev site
  server on :4777 serving ../curriculum + dist).
- The architecture doc (`../cairn-architecture.md`) is authoritative; the
  UI mockup is reference only.
- **Widget sourcing: IM FIRST, fleet LAST.** Read Illustrative
  Mathematics first edition (CC BY) for the standard, decide what the
  representation should BE, and only then ask whether an existing widget
  already is that. Reuse is a conclusion, not a starting assumption —
  starting from the fleet shipped two wrong pictures (the simplify-first
  number line, cube's bar model). Full sequence in
  `../curriculum/CLAUDE.md`; inventory and license rules in
  `../curriculum/sources/illustrative-mathematics/SOURCES.md`.
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
  tallied); completed steps scrub via dots. THE SPECTRUM IS THE WHOLE MODEL: there
  are no discrete kinds of problem left. The 'faded' phase is gone and so
  is the 'led' item kind — stepwise made EVERY problem one the student
  works step by step, so the lesson flows straight into ordinary
  practice. `itemKind` is now practice | check | probe | review, and the
  only thing that varies is how much support rides along: a PRACTICE
  serve leads stepwise while `scaffolded` (p below fadeAtP) and expects
  exist (engaging any gate → hintLevel ≥1 via onEngaged;
  skipping straight to the answer box keeps full credit — the
  expertise-reversal guard). Autoplay lessons ignore expects. Author
  expects on the steps that ARE moves (decompositions, both-sides ops,
  next lines), never on pure scene-setting.
- **The picture taught is the picture practised.** Two halves: the
  scaffolded lead replays the representation of the lesson JUST watched (the LAST
  entry in representationsViewed, not the first — leading with the
  original balance after rotating to the tape is the "tape lesson, scale
  practice" bug), and a lesson served to teach an unseen representation
  reserves the item that triggered it (`session.promised`) so the very
  next serve for that skill is the problem the lesson was about.
- **A representation is never met cold.** Items declare
  `representation`; the engine serves that representation's LESSON before
  the first item framed in it (engine.ts, `itemRep` check), and the
  first lesson is simply the first UNSEEN representation rather than a
  hardcoded `instruction[0]`. Cycling representations through practice
  is intended (varied encoding beats one picture repeated) — teaching
  each one first is what makes the variety instruction rather than a
  surprise.
- **BKT defaults are a stated prior, not a fit.** L0 0.2 / T 0.08 /
  S 0.12 / G 0.25 across the catalog: ~3 unassisted corrects to the
  check gate, from a bar that starts near 40%. Validator guards:
  [bkt_degenerate] (S+G ≥ 1 errors; S or G ≥ 0.5 warns — Beck & Chang's
  identifiability region) and [bkt_fast] (high L0 with high T "masters"
  a skill in two answers). Retune `scaffolding.fadeAtP` and
  `check.pThreshold` together with these; per-skill fitting waits for
  pilot data.
- **Wrong answers are DIAGNOSED, not just marked.** Items and stepwise
  gates carry `misconceptions: [{id, when, says}]`; `diagnose()` in
  graders.ts matches a miss against them (by value, or by move at op
  gates) and the named sentence replaces the generic "not quite" in both
  the item card and the stepwise gate. Authoring rules and invariants:
  `../curriculum/CLAUDE.md`.
- **A gate ASKS; it never tells.** A gated step poses the question the
  move answers, and the last gate asks the LESSON'S OWN question ("what
  is x?"), not the bookkeeping ("what line is left?"). A both-sides move
  is two gates: `op` for the move, `expr` for the line it leaves — an
  open "write the next step" grades by equivalence, so it cannot tell a
  student who worked the move from one who jumped to the answer. Every
  channel leaks: caption, whiteboard `note`, and the prompt itself.
  Invariants `[gate_tells]` / `[gate_telegraph]`; full rules and the
  reasoning in `../curriculum/CLAUDE.md`.
- **Gates never solve themselves.** A miss re-offers the hint and points
  at "Show me"; the student chooses the reveal. Taking the step away
  turns their problem back into a movie against their will.
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
  KEEP IT CURRENT: check items off in the SAME commit that finishes
  them, and re-read it when picking up work. A stale queue is worse
  than none — it hides what's actually left and re-proposes finished
  work. Shipped narratives go in memory/commit messages, not here.
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
- **NO SILENT FALLBACKS. Fail loudly.** A wrong-but-plausible render (an
  addition walkthrough on a subtraction problem) is worse than an error.
  Prefer invariants that make the state unrepresentable; where that's not
  mechanical, add a validator check that at least WARNS (see
  [form_mismatch]).
  **A fallback that "does something sensible" when the right answer is
  unavailable is a bug, not resilience.** It converts a detectable fault
  into undefined behaviour that ships. Every instance of this has cost us
  a user-visible defect: `??` chains in the demo/zoo param picker rendered
  raw `{a*b}` on the board when the chosen item was a different form
  (twice — the second time my "prefer this, else that" fix just moved the
  breakage to another timeline); `SiteApi`/`DemoApi` cast HTTP error
  bodies to the success type, so "Show me how" silently did nothing and a
  stale attempt rendered a NaN delta; `explanationDemo` fell back to
  `practiceItems[0]`, which is how a lesson taught one problem while the
  answer box graded another.
  When the correct value is not available, RETURN AN ERROR or throw —
  including in tests, which is where these are cheapest to catch. Correct
  or loud; never quietly approximate.
- **Review EVERY STEP, not the last frame.** `node
  scripts/shoot-steps.mjs <explanation-id> <out.png>` drives the real
  widget through its patches, renders each state with the app's own
  stylesheet, and shoots them as one strip. `shoot-widgets.sh` captures
  only resting states, which is how thin arcs, adrift labels and a final
  step that dropped its own working all reached the user. Look at the
  strip after any timeline or widget change.
- **Visual review pass**: after ANY widget or timeline change, run
  `scripts/shoot-widgets.sh <out>` (screenshots every explanation's final
  state via ?view=zoo&exp=<id>, tiles contact sheets) and actually REVIEW
  the sheets. The harness needs --run-all-compositor-stages-before-draw
  (already set) — without it, virtual-time screenshots can capture stale
  frames and report phantom bugs.

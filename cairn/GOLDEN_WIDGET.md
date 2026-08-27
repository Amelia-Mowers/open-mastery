# The Golden Widget standard

What every Cairn widget must satisfy. The §4.4 contract is one interface —
`render(params, mode)`, `extract()`, `applyPatch(patch)`, `trace()`, `a11y`
— and a golden widget honors all of it, in every role.

## 1. Trinity roles

- **lesson**: patch-driven animation. Setup derives from the FIRST timeline
  patch carrying the widget's setup keys (all cairn-expr templated,
  evaluated per instance). A setup function in `LessonPlayer.tsx` guards
  ranges and falls back to caption-only — never render broken or
  overflowing.
- **problem** (and **faded**): the interactive answer space. `extract()`
  returns `{ raw }` and/or `{ value }` that ItemCard can submit. If the
  input role is not yet built, `WIDGET_ROLES.input` is `false` AND the
  planned input semantic is documented in `CLAUDE.md` — display-only is a
  stage, not a category.
- **review**: inert — `disabled` + `aria-disabled`, no pointer or keyboard
  mutation, single tab stop removed (`tabIndex -1`).

## 2. Programmatic, always

Everything renders from the actual instance's params/config. Config values
may be cairn-expr templates (`"{-2*abs(b)}"`) — ItemCard evaluates them per
instance (numbers via `evalNumber`, strings via `renderText`). No hardcoded
family assumptions; a widget fed another family's numbers is a bug.

This includes **semantic fit, not just numeric fit**: a widget encodes a
specific equation shape (envelopes = "a groups of x total b"), and any
place that picks a widget for a problem — scaffolds, rotations, leads —
must check the ITEM'S declared shape (its `representation:` or viz
binding), never "the numbers happen to be in range". `a=5, b=6` fits both
`5n = 6` and `n/5 = 6`; only one of them is five envelopes.

## 3. Decomposition-ready

Lessons open on the raw symbolic question (player-level `equation` /
`eqHighlight` patch keys) and decompose it into the diagram. Each
decomposition step must PAIR the highlight of the symbol part
(`eqHighlight`) with the arrival of the region it becomes — and, where
the widget supports region highlighting, highlight that region in the
same step. The student's eye follows symbol → shape, every time. Widgets
whose regions map to symbol parts expose **staged entrance flags**
(default `true`, so plain timelines are unaffected):

- balance-scale: `leftIn`, `rightIn`
- envelope-model: `envelopesIn`, `countersIn`
- hanger-diagram: `shapesIn`, `weightIn`
- tape-diagram: `totalIn` (cells already stage via `partLabel`/`highlight`)
- opposite-flip / area-model / worked-equation: inherently staged
  (`flip`/`resolve`, `products`, appended lines)

The **faded phase** ("finish this one") replays the SAME representation
the student's initial lesson used — `/api/explain?viewedFirst=1` prefers
the first completed representation from the student's own event history,
so the metaphor that taught the skill is the one that fades.

## 4. Contract mechanics

- State in a `WidgetStore` consumed via `useSyncExternalStore` — so
  `extract()`/`applyPatch()` work from outside React and backward seeks can
  rebuild + replay.
- `trace()` records interactions AND patches with monotonic `seq`.
- `a11y`: declared role + `label(params)`; the interactive element carries
  real ARIA (slider/group semantics, value attributes) and is fully
  keyboard-operable (arrow keys, Home/End where positional).

## 5. Motion (the house feel)

Entrances fade-and-rise (staggered `animationDelay` for lists), state
changes transition (never snap), house palette, stable footprint across
states (min-heights where content varies). Never let an animation's end
state clobber a layout transform — keyframes must END at the layout value.
Global `prefers-reduced-motion` handling covers the rest.

## 6. Quality gates

- Component tests: render-from-params, the canonical patch walk,
  extract-after-interaction, a11y role/label, keyboard-only operation,
  review-mode inertness.
- Extremes tests (`test/client/widget-extremes.test.tsx`): generator
  max/min counts, negatives, zero, unevaluable templates; setup-guard
  fallbacks.
- Verification lives at the item level (`verify:` + `answer.integer`) —
  the widget submits raw answers and never grades.

## 6b. Reuse with care — new widgets are cheap

Reuse a widget only when the REPRESENTATION genuinely matches, not
because the data shape fits. The ratio-table can display any x→y pairs,
but pressing it into service as a function machine (and the area model
as "a square, sort of") reads as the wrong picture to a learner. A
purpose-built widget costs an afternoon against this checklist — when in
doubt, build the right picture. (Widget-type saturation is an
observation about progressions reusing representations, not a budget.)

## 7. Fleet integration checklist (adding a widget)

1. `src/client/viz/<name>.tsx` (or `widgets/` for pure inputs) meeting §1–6.
2. Registry: `createWidget` case (PASS THE CONFIG THROUGH) + `WIDGET_ROLES`
   entry.
3. Player: setup function + adapter case in `createLessonWidget`.
4. Zoo: input sample in `INPUT_SAMPLES` if input-capable. Lesson demos are
   single-sourced from the curriculum (`/api/demos`); until an explanation
   adopts the widget, add a labeled `FALLBACK_DEMOS` entry (it auto-hides
   on adoption).
5. Tests per §6.
6. Curriculum adoption: an explanation using it (its final content step
   must BE the resolution — the faded phase truncates it), items whose
   `representation:` matches, `verify:` on those items.

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
- **problem** (and **faded**): the interactive answer space — for widgets
  that ARE inputs. Display-only is a CATEGORY, not a stage: an input is
  not owed to a representation. The trinity assumed every widget should
  also collect an answer; across 62 authored items not one does, because
  the answer FORMAT is orthogonal to the picture. A display-only widget
  is conformant, carries no debt, and needs no "planned input semantic".
  Where a widget genuinely IS the answer space, it may still be both.
  Purpose-built inputs are tied to a problem SHAPE, not a representation
  (`term-input`'s `[ ]x [±] [ ]`), and `extract()` returns `{ raw }`
  and/or `{ value }` that ItemCard can submit. Inputs are never
  multiple-choice in costume: options rows are reserved for the `choice`
- **review**: inert — `disabled` + `aria-disabled`, no pointer or keyboard
  mutation, single tab stop removed (`tabIndex -1`).

Every widget needs a patch vocabulary for the MOVES its representation
can make, not just for what it displays: the balance has op badges, the
tape has `removed` (a section collapses and the bar shrinks) plus
`totalOp`, the area model has `fillRows`. Without one, a gate asking
"what do you do?" has no way to show it happening, and the validator
([gate_moves_nothing]) will say so.

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

The **scaffolded lead** ("finish this one") replays the SAME
representation the student was JUST taught — `/api/explain?viewedFirst=1`
prefers the LAST completed representation in the student's own event
history, so the metaphor that taught the skill is the one that fades.
Taking the first instead is the "tape lesson, scale practice" bug: after
rotating to a new picture, the lead must follow the rotation.

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

**Ask the reuse question LAST.** Read Illustrative Mathematics for the
standard, decide what the representation should be, write that down, and
only then look at the fleet. Opening the registry first biases every
answer toward "close enough" — that is how the simplify-first number
line and cube's bar model shipped. Full sequence:
`../curriculum/CLAUDE.md`, "Representation decisions go IM FIRST".

Reuse a widget only when the REPRESENTATION genuinely matches, not
because the data shape fits. The ratio-table can display any x→y pairs,
but pressing it into service as a function machine (and the area model
as "a square, sort of") reads as the wrong picture to a learner. A
purpose-built widget costs an afternoon against this checklist — when in
doubt, build the right picture. (Widget-type saturation is an
observation about progressions reusing representations, not a budget.)

## 6c. Slab kickoff checklist (before authoring ANY new slab)

Run this once per slab, before the first skill is written:

1. **Read IM's lessons** for every standard in the slab. Note what each
   one uses to teach the idea, and what that picture DOES.
2. **Read the Progressions figures** for the domain — they name expected
   representations and their ordering.
3. **Write the representation list** the slab needs, per skill, from 1–2
   alone — without consulting the registry.
4. **Now diff that list against the fleet.** Genuine matches are reuse;
   everything else is a queued widget with a named source.
5. **Size the slab from that diff.** A slab needing several new widgets
   is fleet-building work and costs like the FIRST slab, not like the
   saturated ones (EE added 8 skills with zero new widgets; 8.EE/8.F,
   SP and G will not).

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
   must BE the resolution — the stepwise lead truncates it), items whose
   `representation:` matches, `verify:` on those items.

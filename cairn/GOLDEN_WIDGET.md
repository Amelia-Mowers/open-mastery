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


## 8. Pedagogical grounding (2026-09-11) — the standard against the literature

A review of §1–7 against the learning-science literature, plus new
guidelines it produced. Citations are the load-bearing ones; each
names the finding we rely on, not just a paper.

### 8a. Existing rules the literature supports

- **Stepwise gates + manual Continue (segmenting under learner
  control).** Presenting an animated explanation in learner-paced
  segments beats continuous presentation (Mayer & Chandler 2001, *J.
  Educational Psychology* 93). Our clock-holds at caption boundaries
  and Continue-gated beats are this principle; keep every autoplaying
  sequence pausable and scrubbable.
- **Gates that MOVE the picture ([gate_moves_nothing]).** Behavioral
  activity is not cognitive activity: interaction helps only when the
  action forces processing of the content (generative learning;
  Fiorella & Mayer 2016, *Educational Psychology Review* 28). A click
  that changes nothing is decoration; a confirm that performs the
  student's move is the model being built.
- **Progressive reveal / never print the answer.** Generating an
  answer beats reading it (generation effect, Slamecka & Graf 1978;
  testing effect, Roediger & Karpicke 2006, *Psychological Science*
  17). Our labelled/cellsIn/reveal staging is the widget-level form.
- **The scaffolded lead + expertise-reversal guard.** Worked examples
  with steps that fade as competence grows outperform both pure
  problem solving and unfaded examples (Renkl & Atkinson 2003,
  *Educational Psychologist* 38); guidance that helps novices HARMS
  more advanced learners (expertise reversal, Kalyuga et al. 2003,
  *Educational Psychologist* 38). The answer-box skip keeping full
  credit is exactly the reversal guard.
- **Misconception diagnosis over "wrong, try again."** Elaborated
  feedback that says what-and-why beats verification-only feedback
  (Shute 2008, *Review of Educational Research* 78). Our {id, when,
  says} standard is the authored form of this.
- **eqHighlight/mark pairing (signaling).** Visual cues that direct
  attention to the named element improve learning from complex
  visuals (signaling principle: van Gog, in Mayer's *Cambridge
  Handbook of Multimedia Learning*, 2014). Symbol → region pairing is
  signaling done twice over.
- **Vocab beats before the lesson (pre-training).** Learning the
  names and characteristics of components BEFORE the causal story
  reduces load during it (pre-training principle, Mayer & Pilegard,
  *Cambridge Handbook*, 2014).
- **Preamble voice ("we/you", across-a-table).** Conversational style
  outperforms formal style in multimedia lessons (personalization
  principle, Mayer 2014).
- **Rotation + rep intros (teach a picture before serving it).**
  Multiple external representations pay off only when the learner can
  translate between them — each new representation carries a real
  learning cost that must be paid deliberately (Ainsworth 2006, the
  DeFT framework, *Learning and Instruction* 16). Teaching an unseen
  representation before the first item framed in it IS paying that
  cost; serving it cold is where MERs fail.
- **Concreteness fading (models fade toward the worked board;
  [worked_primary]).** Beginning concrete and explicitly fading to
  the abstract outperforms either alone (Fyfe, McNeil, Son &
  Goldstone 2014, *Educational Psychology Review* 26). instruction[]
  ordering with worked-equation never first is this, catalog-wide.
- **Negate leaving the balance.** The balance model is empirically
  weak for equations with negative terms — students' errors cluster
  exactly there, and the model "detaches" (Vlassis 2002, *Educational
  Studies in Mathematics* 49; echoed across the 34-study review of
  Otten, Van den Heuvel-Panhuizen & Veldhuis 2019, *International
  Journal of STEM Education* 6:30). The 2026-09-10 ruling (opposite-
  flip instead) is what the literature recommends.
- **Motion carries meaning only.** Animation helps only when the
  motion corresponds to the conceptual change and is learner-paced;
  otherwise statics do as well or better (Tversky, Morrison &
  Bétrancourt 2002, *Int. J. Human-Computer Studies* 57 — the
  congruence and apprehension principles). House motion rules (§5)
  already say this; treat decorative motion as a defect.

### 8b. New guidelines (adopted 2026-09-11)

1. **Comparison is SIMULTANEOUS or it isn't comparison.** Comparing
   two methods/objects side by side builds flexibility and conceptual
   knowledge better than studying them sequentially (Rittle-Johnson &
   Star 2007, *J. Educational Psychology* 99). When a lesson's point
   is that two things are equivalent or one is better, both must be
   on screen at once, aligned for the eye: the derive-table's
   original|rewritten columns, compare-rates' two arcs on one line.
   Never "show A, clear, show B".
2. **One new element per step.** Element interactivity is the load
   that matters (Sweller's cognitive load theory): a patch that
   introduces two new pieces at once (a region AND a badge AND a
   relabel) splits attention. If a confirm needs to change several
   things, stage them across the confirm animation, dominant first.
3. **Signal sparsely and transiently.** One mark/highlight at a time;
   clear it when the narration moves on (mark: null). A board with
   three simultaneous highlights signals nothing (signaling works by
   SELECTION — van Gog 2014).
4. **Erroneous examples are teaching material, not just feedback.**
   Explaining why a WRONG worked step is wrong builds conceptual
   knowledge beyond correct examples alone (Booth, Lange, Koedinger &
   Newton 2013, *Learning and Instruction* 25). Queued direction: a
   gate kind that shows a plausible wrong move and asks what broke —
   the misconception catalog is already the content for it.
5. **Contrast before telling.** A concept lands harder when the
   learner has first grappled with cases that differ in exactly the
   critical feature (contrasting cases: Schwartz & Bransford 1998,
   *Cognition and Instruction* 16). test-proportional's YES table
   needs its NO neighbor (currently the mastery check is the first NO
   a student ever sees — backlogged as a timeline fix).
6. **Keep captions short because they are narrated.** Narrating text
   that is also printed at length risks the redundancy effect (Mayer;
   Kalyuga, Chandler & Sweller). Our resolution: SYMBOLS live on the
   board, the caption is 1–2 short sentences, and the voice reads
   only the caption. A caption long enough to wrap thrice is a
   redundancy bug even if the copy is good.
7. **The number line's power is its linearity.** Linear-board
   experience causally improves numerical magnitude knowledge (Siegler
   & Ramani 2009, *J. Educational Psychology* 101; Booth & Siegler
   2008). So: equal-interval ticks always, 0 labeled (shipped
   2026-09-10), never a nonlinear or broken axis, and never reuse the
   line for a relation it cannot pace out linearly.
8. **Retrieval is the review; keep reviews raw.** Long-term retention
   comes from retrieval practice, spaced (Roediger & Karpicke 2006;
   Cepeda et al. 2006 meta-analysis) — FSRS reviews serving the raw
   mastered form, unassisted, is the right call; resist making
   reviews "nicer" with scaffolds.
9. **Vary the surface, keep the structure.** A pool whose isomorphs
   vary only digits teaches digit-blindness; varying non-critical
   features (contexts, letters, which side the unknown sits) while
   holding the critical structure is what makes the structure visible
   (variation theory, Marton; interleaving, Rohrer & Taylor 2007,
   *Instructional Science* 35). Prefer isomorph lists that vary a
   surface feature deliberately, and let practice interleave skills
   rather than block them.

### 8c. Tensions to watch (research qualifies us, not the reverse)

- **Rotation vs. fading.** Ainsworth's cost argument cuts both ways:
  every added representation taxes the learner before it pays. Our
  engine rotates representations through practice — right for
  variety, but watch per-skill rep counts (3 is the floor, it should
  not silently become 5) and never rotate before the first picture
  has actually taught (the promised-instance mechanism is the guard).
- **Guidance-first vs. productive failure.** Kapur (2008, *Cognition
  and Instruction* 26) shows unscaffolded struggle BEFORE instruction
  can outperform instruction-first for conceptual knowledge. Our
  model is guidance-first everywhere. If we ever test an "attempt
  before the lesson" flow, it is a policy experiment for pilot data,
  not an authoring change.
- **Immediate feedback.** We give it everywhere; Shute (2008) notes
  delayed feedback can benefit transfer for able learners. Keep
  immediate (right for procedural fluency and for children), but this
  is a tunable, not a law.

## Invisible, never absent (2026-09-01)

When a widget hides content that will appear later — an unfilled label,
an unarrived value, a staged annotation — make it TRANSPARENT
(`color: transparent`, `opacity: 0`, or a `\u00A0` placeholder glyph),
never empty or unmounted. Empty content collapses its line box and the
whole element changes size when the real content lands: the divide
tape's blank sections (`partLabel: ""`) shrank the bar's height until
the labels arrived. Layout is part of the staging promise — the shape
the student will fill must already be the shape they see. (Deliberate
size ANIMATION — the tape's removed-section collapse — is the
exception: there the size change IS the meaning.)

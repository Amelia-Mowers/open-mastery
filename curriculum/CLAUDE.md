# Curriculum authoring notes

## The skill graph derives from STANDARDS, not textbooks

Textbooks implement the standards; deriving our graph from a textbook
inherits its editorial slicing and its license churn (both OpenStax and
IM drifted to NC terms in recent editions). Derive from the source:
CCSS-M standard IDs are the node vocabulary, the Coherence Map
(achievethecore.org) is the default prerequisite backbone, and the
Progressions documents (mathematicalmusings.org, 2023 compiled PDF) are
the design rationale AND the widget backlog — they name the expected
representations and their ordering per standard. A standard is too
coarse to be a mastery node: decompose it into skills (the decomposition
is OURS — LLM-assisted, human-reviewed), tag every skill with
`standards: [<CCSS ids>]`, and read the standard's actual text before
tagging (6.EE.B.7 is NONNEGATIVE-only — that's why negate is 6.NS.C.6a +
7.EE.B.4a, and why fraction-coefficient reciprocal IS 6.EE.B.7).
Licensing, links, pipeline, and the state-crosswalk caveat:
`sources/standards/SOURCES.md`.

## Representation sourcing: mine Illustrative Mathematics FIRST

OpenStax Prealgebra teaches through worked symbolic steps and has few
diagrams. **Illustrative Mathematics 6–8 (FIRST EDITION ONLY) is the
diagram quarry** — when authoring a new skill, check IM's treatment of the
topic before inventing a representation, and translate its diagrams into
widgets/explanation timelines.

- Inventory + verified license notes: `sources/illustrative-mathematics/SOURCES.md`
- First edition (© 2017–2019 OUR / © 2019 IM) is CC BY 4.0 — usable.
  **IM v.360 (© 2024+) is CC BY-NC — never derive from it.** Same rule as
  OpenStax: the catalog is CC BY 4.0 only (see `sources/openstax/SOURCES.md`).
- Access: https://im.kendallhunt.com/MS/students/{1|2|3}/{unit}/{lesson}/index.html
  (1 = Grade 6). Cite grade/unit/lesson in each derived record's `source:`.

Implemented so far: tape diagram (G7 U6 L2–3), hanger diagram (G6 U6 L3),
area model (G6 U6 L10), plus OpenStax's envelopes-and-counters (§3.5).

## Don't map textbook sections to skills naively

A textbook section is NOT a skill. OpenStax §8.2 quietly contained three
equation forms (ax = b, x/a = b, -x = b) — the last snuck in as "an
example" and initially got no coverage of its own. When converting a
section: FIRST enumerate every distinct equation/problem FORM it contains
(scan the examples and exercise sets), then decide the skill split — one
skill per form that needs its own explanation, with prereq edges between
them. The book's section structure is a reading order, not a skill graph.

## The programmatic-widget standard

**Every equation FORM gets explicit representation coverage — never
implied.** The DANGEROUS case is identifier overlap: feedableParams
checks identifier presence only, so an item of a different form that
reuses the same param names (x − p = q sharing p,d with x + p = q) will
happily feed the WRONG timeline with its numbers — a student asking
"show me how" on a subtraction problem got an addition walkthrough
labeled "same numbers". Different form ⇒ different skill, even when the
identifiers line up. If an item family's shape differs from its skill's explanations
(different identifiers, different structure — e.g. -x = b vs x/a = b), it
is a smell: split it into its own skill with explanations and, if needed,
its own widget/animation authored against ITS params. Widgets are
programmatic: they render from the actual instance variables, and a lesson
that silently falls back to another family's numbers is a bug, not a
feature.

**Every skill carries at least THREE distinct representations, and one
of them is the whiteboard (`worked-equation`) — but the whiteboard NEVER
leads instruction** (instruction[0] must be a concrete model; worked is
what the models fade toward; validator warns [worked_primary]) — two concrete models
plus the symbolic form the concrete ones fade toward. The validator
warns ([representation_count], [worked_missing]) below the floor.
Prefer worked-equation over caption-only timelines, always.

**Inputs are widgets too.** Where the representation IS the answer space,
let the student answer by manipulating it (e.g. negate items answer by
moving the dot on a number line; `min`/`max`/`step` config values may be
cairn-expr templates evaluated per instance). Direct text entry is the
fallback, not the default.

## Decomposition steps pair the symbol with its region

Lessons open on the raw symbolic equation (`equation` segments) and
decompose it into the diagram. Each arrival step sets `eqHighlight` on
the symbol part AND brings in the region it becomes (staged entrance
flags: `leftIn`/`rightIn`, `shapesIn`/`weightIn`, `totalIn`,
`envelopesIn`/`countersIn` — default true), highlighting that region
where the widget supports it. The student's eye follows symbol → shape
every time. Full standard: `../cairn/GOLDEN_WIDGET.md` §3.

## The faded phase is the visualization, not a separate system

Faded examples are NOT separate items with worked-steps lists (the old
`faded.steps` mechanism is retired). The engine serves a normal instance
marked `faded`; the client plays the skill's explanation with THAT
instance's numbers up to just before the resolution, and the student
finishes it in the ordinary answer input. Authoring rule this relies on:
**an explanation's final content step must BE the resolution** (the reveal
/ "x = …" step), so truncating one step leaves a complete setup.

## Difficulty ceilings are RAW (capstone rule)

Widget answer spaces (tape, number lines, tables, flip, choice) scaffold
the EASIER difficulty tiers of a skill. Every skill's hardest item(s)
must take a raw text answer (numeric/expression/equation input) — checks
pick hardest-first and mastery evidence tops out at the raw symbolic
form. The validator warns ([capstone_raw]) when a skill's difficulty
ceiling is widget-only. Choice answers additionally carry a guessing
floor, so the engine discounts correct choice attempts (hint-level-1,
like rubric items) and they are never check-eligible — prefer richer
interactions (row-select on the table, fill-a-cell) over choice when the
judgment can be expressed in the representation itself.

## Ground rules

- Every record is `review: {status: draft}` until a human vets it; the
  release CI profile refuses unvetted content.
- Explanations are authored against a param FAMILY (usually the skill's
  first practice item). Items of other families must either share those
  identifiers or declare `representation: null`.
- **Every item carries `verify:`** — an independent boolean relation with
  `answer` bound to the computed answer value ("{a * answer == b}"),
  substituting the solution back into the ORIGINAL equation (never the
  answer template — that would be circular). Add `integer: true` on the
  answer whenever instances must have whole-number solutions; CI checks
  both across authored params and generator seeds.
- `npm run validate` (authoring) must pass with 0 errors before committing.

- **Future work is tracked centrally in `../TODO.md`** — don't scatter
  queued-work notes across docs; leave context, move the task.
- **MONOREPO (2026-08-27)**: this directory is part of the single git repo
  at the workspace root (github.com/Amelia-Mowers/open-mastery). Commit at
  the ROOT — the old per-directory repos are archived as .git-local-archive
  and must not be used. Every push to main redeploys the Pages demo.

# Curriculum authoring notes

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
implied.** If an item family's shape differs from its skill's explanations
(different identifiers, different structure — e.g. -x = b vs x/a = b), it
is a smell: split it into its own skill with explanations and, if needed,
its own widget/animation authored against ITS params. Widgets are
programmatic: they render from the actual instance variables, and a lesson
that silently falls back to another family's numbers is a bug, not a
feature.

**`worked-equation` (whiteboard worked steps with movement) is the
STANDARD representation shape: most skills should carry one** alongside
their concrete model — it is the abstraction the concrete models fade
toward. Prefer it over caption-only timelines, always.

**Inputs are widgets too.** Where the representation IS the answer space,
let the student answer by manipulating it (e.g. negate items answer by
moving the dot on a number line; `min`/`max`/`step` config values may be
cairn-expr templates evaluated per instance). Direct text entry is the
fallback, not the default.

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

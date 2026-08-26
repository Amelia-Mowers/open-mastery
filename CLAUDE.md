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

## Ground rules

- Every record is `review: {status: draft}` until a human vets it; the
  release CI profile refuses unvetted content.
- Explanations are authored against a param FAMILY (usually the skill's
  first practice item). Items of other families must either share those
  identifiers or declare `representation: null`.
- `npm run validate` (authoring) must pass with 0 errors before committing.

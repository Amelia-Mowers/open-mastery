# OpenMastery Curriculum

Plain-file curriculum for [Cairn](../cairn): skills, items, and explanations
as YAML validated by the published [`@openmastery/schema`](../schema) spec.

**License: CC BY 4.0.** Content is derived from OpenStax textbooks
(themselves CC BY 4.0); see `sources/openstax/SOURCES.md` for provenance and
attribution. Every derived record carries a `source:` reference back to the
original book, section, and (for items) exercise.

## Layout (architecture §8)

```
skills/ items/ explanations/   # the curriculum records, YAML
templates/ standards/          # viz templates, standards mappings
sources/                       # provenance notes + fetch scripts (corpus not committed)
pipeline/                      # extraction/conversion tooling (build step 8)
```

## Review states

Records enter as `review: {status: draft}`, are promoted to `vetted` only by
human review, and CI's release profile refuses anything unreviewed
(architecture invariant: nothing unreviewed ships in a release bundle).

- `npm run validate` — authoring profile (completeness gates are warnings)
- `npm run validate:release` — the ship gate

## Pilot scope

One OpenStax chapter, hard-capped (architecture §8): **Prealgebra 2e,
chapter 8 — Solve Linear Equations**, starting with §8.2 (division and
multiplication properties of equality).

# OpenStax corpus provenance

The corpus is fetched, not committed (see `.gitignore`). Run `./fetch.sh`
from this directory to reproduce the exact pinned checkouts.

## License — read this before deriving anything

OpenStax relicensed these repositories to **CC BY-NC-SA 4.0** (prealgebra
bundle on 2026-03-12, algebra-1 on 2025-04-07). NC-SA is incompatible with
this repo's CC BY 4.0 license, so **derivation happens ONLY from the pinned
pre-relicense revisions below**, which were published under CC BY 4.0 —
irrevocably, per the license's own terms. Do not derive from `main`.

| repo | pinned commit (last CC BY 4.0 revision) | contents |
|---|---|---|
| openstax/osbooks-prealgebra-bundle | `77a933c672e9c48c746eb802d588a9a7ddfd6e0d` | Prealgebra 2e, Elementary Algebra 2e, Intermediate Algebra 2e |
| openstax/osbooks-algebra-1 | `a277f9bb2abcc90d201a66879973463a45e5eaa4` | OpenStax Algebra 1 (K-12) |

Verify after fetching: `head -1 <repo>/LICENSE` must read
`Attribution 4.0 International` (no "NonCommercial").

## Attribution

Derived records carry `source: { book, section, exercise? }`. Book keys:

- `openstax-prealgebra-2e` — *Prealgebra 2e*, OpenStax, Rice University.
  CC BY 4.0. https://openstax.org/details/books/prealgebra-2e
  Section 8.2 = module `m81321` in the pinned bundle revision.
  `exercise:` values of the form `m81321:fs-...` are CNXML exercise ids in
  that module.

## Pilot mapping (architecture §8: one chapter, hard-capped)

Prealgebra 2e ch. 8 "Solving Linear Equations": modules m81319 (intro),
m81320 (§8.1), m81321 (§8.2 — converted first), m81322 (§8.3), m81323 (§8.4).

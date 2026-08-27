# Pilot slab: G6–7 Ratios & Proportional Relationships

The first standards-first derivation (per `SOURCES.md`): CCSS 6.RP.A +
7.RP.A decomposed into mastery-sized skills, prereq edges from the
Coherence Map plus the RP Progression's narrative, representations per
node from the Progression ("double number lines to tables to equations"
is an explicit representation sequence — and our widget backlog).

## Standards covered

- 6.RP.A.1 ratio language · 6.RP.A.2 unit rate language ·
  6.RP.A.3 solve problems (a tables · b unit rate · c percent · d units)
- 7.RP.A.1 unit rates with fractions · 7.RP.A.2 recognize/represent
  proportional relationships (a test · b constant k · c equation
  y = kx · d graph) · 7.RP.A.3 multistep percent problems

Coherence Map backbone: 6.RP.A.1 → 6.RP.A.2 → 6.RP.A.3;
6.RP.A.3 → 7.RP.A.1 → 7.RP.A.2 → 7.RP.A.3. External prerequisites
(outside the slab, already-assumed): multiplication/division fluency
(3.OA), fraction division 6.NS.A.1 (feeds `g7.rp.unit-rate-frac`).

## Implemented nodes (skills/rp/, items/rp/, explanations/rp/)

| skill | standard | primary rep | second rep | answer shape |
|---|---|---|---|---|
| g6.rp.equiv-table | 6.RP.A.3a | ratio-table (fill cell) | double-number-line | integer |
| g6.rp.unit-rate | 6.RP.A.2, 3b | double-number-line (to 1) | ratio-table | integer |
| g6.rp.missing-value | 6.RP.A.3b | double-number-line (fill) | worked-equation | integer |
| g6.rp.percent-of | 6.RP.A.3c | double-number-line (0–100%) | worked-equation | integer |
| g6.rp.find-whole | 6.RP.A.3c | double-number-line | worked-equation | integer |
| g7.rp.unit-rate-frac | 7.RP.A.1 | worked-equation | double-number-line | integer |
| g7.rp.constant-k | 7.RP.A.2b | ratio-table (÷ arrow) | worked-equation | integer |
| g7.rp.equation | 7.RP.A.2c | worked-equation | ratio-table | expr `y = kx` |
| g7.rp.percent-multistep | 7.RP.A.3 | worked-equation | double-number-line | integer |
| g6.rp.compare-rates | 6.RP.A.3b | worked-equation | ratio-table | choice + integer checks |
| g7.rp.test-proportional | 7.RP.A.2a | ratio-table | worked-equation | choice + integer checks |

Edges (all within-slab; roots have only external prereqs):
equiv-table → unit-rate → {missing-value, percent-of, unit-rate-frac,
constant-k}; equiv-table → missing-value; percent-of → {find-whole,
percent-multistep}; constant-k → {equation, test-proportional};
unit-rate → compare-rates.

Progression notes honored: unit rate is DERIVED from equivalent-ratio
reasoning (tables/DNL), so equiv-table precedes it; percent is a rate
per 100 (DNL with a 0–100% bottom line, not the p/100 × q formula first);
k in 7.RP is the unit rate wearing its grown-up name (constant-k's
lesson says so).

## Deferred nodes (real gaps the pilot surfaced — the point of piloting)

| node | standard | blocked on |
|---|---|---|
| ratio-language ("3:2, 3 to 2") | 6.RP.A.1 | a ratio-pair answer shape + grader (a:b with equivalence policy) |
| graph-interpret ((0,0), (1,r)) | 7.RP.A.2d | proportional-graph widget (line through origin, read points) |
| unit-convert | 6.RP.A.3d | nothing hard — cut for slab size; next batch |
| percent-error/markup chains | 7.RP.A.3 | multi-step answer UX; single-step tax/tip/discount IS implemented |

UNBLOCKED by the choice widget (now implemented): **g6.rp.compare-rates**
(6.RP.A.3b, better buy — choice items with per-instance option shuffle
plus numeric "what does ONE cost in the better pack" check items, since
§5 requires checks to be non-choice) and **g7.rp.test-proportional**
(7.RP.A.2a, yes/no on the y÷x test, with "what must y be to keep it
proportional" numeric checks). Choice answer keys are semantic and
FIXED per item family; the client shuffles display order per paramHash,
and `verify:` asserts the scenario invariant (the cross-product
inequality that makes the keyed option genuinely correct).

## Granularity watchlist (candidate splits — decide on mastery DATA)

The implemented nodes are method-sized (one solution method, one primary
representation, one misconception profile each), which is the right
mastery-node test. But several deliberately bundle variants that the
literature says can dissociate. The rule: split when p trajectories go
bimodal within a skill, or when misses cluster on a form the
explanations never show (the -r = 2 lesson). Watch for:

- **unit-rate**: only ONE direction is taught ($ per pound). The other
  unit rate (pounds per $) and *choosing which one a question needs* is
  a classic, well-documented misconception — likeliest first split.
- **equiv-table**: scaling UP only. Scaling DOWN (÷) and composite
  scaling (through the unit rate, non-integer factor) are variants.
- **percent-of**: benchmark percents only (multiples of 5). Arbitrary
  percents, decimals, and percents > 100% are real jumps.
- **missing-value**: teaches the unit-rate-first strategy; the
  scale-factor-between-ratios strategy is genuinely different. If data
  shows two populations, split by strategy.
- **percent-multistep**: single change only (one discount OR one tax).
  Chained changes and percent error are separate nodes (deferred).

Splitting later is cheap (new skill ids + `supersedes`, prereq edge from
the narrow node; mastery events survive) — so default to method-sized
now and let BKT arbitrate.

## New widgets this slab demanded (the measured "widget load")

3 new widget types for 11 skills: `double-number-line`, `ratio-table`
(both trinity: lesson + fill-a-cell input + review) and `choice`
(input-only, like numeric-input; deterministic per-instance option
shuffle), per GOLDEN_WIDGET.md. Existing tape-diagram/worked-equation
reused. The remaining deferred nodes need 1 more (proportional-graph).

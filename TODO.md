# OpenMastery — central task list

The ONE place future work lives. Docs and memory may explain context, but
queued work belongs here. Keep entries one line + pointer; delete when done.

## MILESTONE: tutoring-center demo (the sellable cut)

Not K–12 — the middle-school band plus the manager's view (~2–3 months):

- [ ] Slabs 10–15 authored (6–8 band; RP and 6–7.EE done — slab-map.md).
      ~200 timelines at the measured pace; vet in fresh-eyes batches, and
      recruit pilot-center tutors as external reviewers.
- [ ] Build step 5: real site server (SQLite SiteStore, auth/enrollment).
- [x] Build step 6 v1: guide dashboard SHIPPED (?view=guide; Needs-
      attention + roster; ?seed=1 seeds a synthetic class in-browser).
      v2: per-student drill-in (their skill map + event timeline),
      intervention actions (clear a flag, assign focus), real auth
      (arrives with step 5).
- [ ] Flow-gap polish list (below) closed.
- [ ] Deployment + pricing story: per-seat HOSTED plans (~$12/seat is
      2–4% of a center's per-student revenue — "one retained student pays
      for the roster"); self-host (AGPL) is the no-lock-in trust card and
      enterprise path, not the product; CC BY-only is what makes a
      commercial hosted catalog legal for for-profit centers at all (NC
      content would poison it) — a compliance moat, not a discount.

K–5 expansion is the roadmap slide, not a prerequisite. K–2 is a
different product profile (manipulative widgets, read-aloud for
non-readers) — scope it separately when its turn comes.

## Client / widgets

- [ ] Remaining trinity inputs for display-only widgets (semantics in
      cairn/CLAUDE.md): balance = pick the operation, envelope = distribute
      counters, hanger = choose the move, area = fill the products,
      worked-equation = choose the next line.
- [ ] proportional-graph widget (line through origin, read (0,0)/(1,r)) —
      unblocks g7 graph-interpret (rp-slab.md deferred table).
- [ ] compare-rates "pick with work" upgrade: two offer cards each with a
      unit-rate fill-in, then click the winner — constructed response where
      today's choice items are the d1 entry point.
- [ ] area-model curriculum adoption (zoo fallback disappears on adoption;
      natural home: distribute/§8.3-equivalent, 6.EE.A.3).
- [ ] Flow gaps from playtests: Reset-demo confirmation; check-unlock
      dismissal resets on reload; no visible focus-mode indicator after
      "keep practicing"; parked-vs-done framing on session_done;
      offered-hint auto-reveal lacks framing copy.

- [x] Browser demo LIVE: https://amelia-mowers.github.io/open-mastery/
      (monorepo github.com/Amelia-Mowers/open-mastery; every push to main
      redeploys via .github/workflows/demo-pages.yml).

- [ ] Wrong-answer DIAGNOSIS (playtest #5): misconception-tagged feedback —
      author common-error patterns per item family (off-by-one, inverse-op,
      sign flip) and match the submitted answer against them.
- [ ] Skill map phone REFLOW (playtest #6, partial): horizontal scroll +
      hyphenation shipped; a true stacked-list layout under 560px is the
      real fix.

- [ ] ENGAGEMENT batch (family playtest): sounds (correct/mastery
      chimes), alternate palettes/themes, friendlier voice pass over all
      student-facing copy, gamification beyond points (streaks? stones
      gallery?), themed word-problem skins per item family.
- [ ] square-tiles widget (exponents deserve their own picture — the
      gridded area model is a stopgap; see GOLDEN_WIDGET §6b reuse rule).
- [ ] g7 two-step SUBTRACTION variant (ax − b = c) as its own skill with
      its own timelines (form_mismatch caught it riding the addition
      skill).

## Engine / server

- [ ] Build step 5: Bun site server + SQLite SiteStore, auth/enrollment,
      outbox (dev server is the reference wiring).

- [ ] Build step 7: LLM rubric grading + help queue (needs_llm verdicts
      currently no-op).
- [ ] FSRS: carry pre-lapse stability into re-grants (v1 re-inits fresh —
      conservative; revisit with data).
- [ ] Playwright browser E2E lane (jsdom + headless screenshots today).

## Curriculum / standards

- [ ] EE-slab deferred (ee-slab.md): 6.EE.B.8 inequalities (answer shape
      + region number-line), 6.EE.C.9 dependent variables, 7.EE.B.3
      multi-step rational problems, factoring (`form: factored`),
      write-the-EQUATION-from-context.
- [ ] ratio-language node (6.RP.A.1) — needs a ratio-pair answer shape +
      grader (a:b equivalence policy).
- [ ] unit-convert (6.RP.A.3d) — nothing blocking, cut for slab size.
- [ ] percent-error / chained percent changes (7.RP.A.3).
- [ ] Granularity watchlist: split skills when mastery data says so
      (rp-slab.md — unit-rate direction choice is the likeliest first).
- [ ] Human vetting of ALL draft content (release CI refuses unvetted).
- [ ] Next slab: per the slab map order — 6–7.EE first (closes lineq's
      audited 6.EE.B.7 gaps), then 6–8.NS, then 4–5 fraction operations
      (curriculum/sources/standards/slab-map.md).

## Ops / hardware (user side)

- [ ] Low-end Android CI lane.
- [ ] Raspberry Pi HTTPS spike (local-network trust, §9).

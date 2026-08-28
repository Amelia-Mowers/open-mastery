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

- [x] Trinity inputs for display-only widgets (2026-08-27, reworked same
      day from op-pick MC to constructed op ENTRY per Mia: symbol + operand,
      mirrored on both sides; worked-equation = write the next line).
- [ ] **STEPWISE PROBLEMS — CONFIRMED DIRECTION (Mia 2026-08-27, "going
      with this moving forward")**: ONE unified interactive timeline
      replaces the lesson/faded/problem mode zoo. Guidance-fading ladder:
      (1) full process shown (autoplay = today's lesson); (2) stepwise
      WITH prompting/heavy hinting (each stage pauses, hint offered,
      student constructs the move); (3) independent stepwise (same pauses,
      no prompts); (4) fluent solving (answer box only). An ANSWER BOX is
      always present so a student who can produce the final answer skips
      the process — correct final answer = strong evidence at any rung;
      wrong final answer drops them into the stepwise ladder (this is the
      expertise-reversal guard: never force steps on someone who can
      solve). Evidence model: per-step correctness = per-step BKT
      evidence, discounted by prompt depth (rung), which also gives
      wrong-answer DIAGNOSIS nearly free (the failed step names the
      misconception). Design: timeline steps gain optional `expect` (op /
      value / expr the student must supply; the patch then plays as
      confirmation); LessonPlayer gains a mode param = rung; widget entry
      affordances (OpEntry, fill-cells, next-line — shipped) are the
      per-step inputs; capstone stays raw final answer. Literature:
      worked-example effect + completion problems + backward/adaptive
      fading (Renkl & Atkinson; Kalyuga rapid-assessment fading beats
      fixed). PILOT SHIPPED 2026-08-27: schema `expect` on timeline steps
      (op/expr/numeric + prompt/hint; validator expect_shape + template
      checks), StepwisePlayer (pause-at-gate, hint on miss, reveal on 2nd
      miss, tallies out), wired as the faded phase whenever the lead
      explanation carries expects (answer box below = the skip), zoo
      stepwise card; g7.ee.two-step balance+worked timelines authored.
      SPECTRUM SHIPPED 2026-08-27 round 2: scaffolded PRACTICE serves
      lead stepwise too (the p-driven scaffolded flag IS the rung
      selector: lesson → faded stepwise → scaffolded-practice stepwise →
      bare practice → check); gate engagement marks the try assisted
      (hintLevel ≥1), skipping to the answer box keeps full credit;
      every gate has "Show me" (the widget solves the step); `pick`
      expects make decomposition steps interactive (click the equation
      piece); completed steps scrub via dots.
      CATALOG MIGRATION COMPLETE 2026-08-27: 80/80 timelines gated
      (~180 gates; 76 play after faded truncation, all self-passable
      per stepwise-coverage). Mechanical passes: op patches → op gates;
      eqHighlight steps → pick gates; worked lines → expr gates
      (first=last segment, ascii-normalized); value-label lines,
      table-row reveals (rows[k-1] last cell, k≥2), number-line
      markers, cube counts, area fills/products, flip resolve, hanger
      share, tape partLabel → numeric gates; 4 wordy worked timelines
      hand-gated. [no_expects] validator warning = the standing
      invariant against regressing to passive timelines.
      FIRST-RUN REPORT (artifact 14a3480f, 2026-08-27) — deferred items:
      [ ] S-01 mastery MOMENT: verify/restore the grant card in the demo
      flow (report saw silent skill transition); smooth the mastery-meter
      curve (5%→67% jump reads arbitrary). [ ] S-02 guide roster reads
      stale skill/stones — read from the same projection as the student
      view; make rows open a student detail. [ ] S-04 practice scaffolds
      must not print the answer (number-line scaffold labeled through the
      final value) — withhold-terminal-value mode, reveal on submit.
      [ ] S-05 map: label the three clusters, print standards codes on
      cards, wrap titles, empty-cairn state. [ ] S-06 emit scaffold_step
      events (folds into per-step BKT evidence below). [ ] F-02 opening
      placement: open on the map or ask a grade; frame the first pick.
      [ ] F-03 leftovers: reset-demo confirmation feedback; name display
      keeps typed casing. [ ] OG image for the share card.
      REMAINING for the full ladder: HUMAN VETTING PASS over the ~180
      mechanically-derived gate prompts/values (zoo per-timeline view is
      the tracker; machine checks prove self-passability, not
      pedagogy), gate-fatigue tuning (some timelines now carry 4-6
      gates — consider max-gates-per-serve or rung-based gate
      sampling), per-step BKT evidence events (tallies currently
      collapse into hintLevel), prompted rung (proactive hints at gates
      for lowest p),
      wrong-step → misconception diagnosis surfacing, stepwise in the
      corrective ladder (missed practice → stepwise retry of the SAME
      instance), scrub for LessonPlayer parity.
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
- [ ] algebra-tiles widget — unlocks the honest third rep for
      write-expression, combine, simplify-first (its number-line rep was
      removed as a wrong picture) and future factoring.
- [ ] g7 two-step SUBTRACTION variant (ax − b = c) as its own skill with
      its own timelines (form_mismatch caught it riding the addition
      skill).

- [x] Representation-floor backfill DONE (19 new explanations; 22→2
      warnings). Remaining 2 are intentional: write-expression and
      combine await the algebra-tiles widget (their honest third rep).

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

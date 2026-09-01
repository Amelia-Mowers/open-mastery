# OpenMastery — central task list

The ONE place future work lives. Docs and memory may explain context, but
queued work belongs here.

**Keep it current.** Check an item off (or delete it) in the same commit
that finishes it, and re-read this file before starting a work session —
a stale queue costs more than no queue, because it hides what is actually
left. Long "shipped" narratives belong in memory or commit messages, not
here: entries are one line plus a pointer. Last audited 2026-08-28.

## MILESTONE: homeschool pilot (the sellable cut)

PIVOT 2026-08-30: the target is HOMESCHOOL FAMILIES, not tutoring
centers. The guide view is the PARENT's view. Plan: recruit pilot
families starting the week of 2026-09-01 using the existing demo; the
6–8 band WORKING by end of September 2026. Review throughput (Mia's) is
the schedule — see the review-days note below.

Not K–12 — the middle-school band plus the parent's view:

- [ ] Slabs 10–15 authored (6–8 band). NEXT: 6–8.NS, then 8.EE/F
      (slab-map.md). ~200 timelines; vet in fresh-eyes batches — pilot
      PARENTS are candidate fresh-eyes reviewers once the queue exists.
      THE BINDING CONSTRAINT IS REVIEW, NOT AUTHORING (Mia, 2026-08-30:
      "authoring is the cheap part… it's been reviewing them that's been
      the bitch" — widgets take an afternoon; a hard review day covered
      ~25 timelines WITH fix-cycles). Schedule the band in REVIEW-DAYS
      (~243 timelines left ≈ 10 of them at that rate, fewer if the
      author-with-gates rule holds first-pass quality) and spend
      engineering on review leverage: invariants that pre-judge, the
      zoo's end-to-end page, and anything that cuts per-timeline review
      seconds.
      MEASURED 2026-08-29: 18/110 sub-clauses = **16% of 6–8**. RP 9/12,
      EE 8/16, everything else 0. The two "DONE" slabs are done as
      teachable SPINES, not as full coverage — RP defers 6.RP.A.3.D, EE
      defers inequalities (6.EE.B.5/6/8, 7.EE.B.4.B).
      SIZE EACH SLAB FROM ITS WIDGET DIFF, not from the EE rate. EE added
      8 skills with ZERO new widgets because the fleet already covered
      it; that saturation does NOT hold for 8.EE/8.F (no coordinate-plane
      or graph widget exists), SP (dot/box plots, histograms, probability
      trees) or G (scale drawings, angle figures). Those cost like the
      FIRST slab. Run the §6c slab-kickoff checklist (GOLDEN_WIDGET.md)
      before sizing: IM first, fleet last.
- [x] Voice corpus pre-render (SHIPPED 2026-09-01): 8,185 sentences
      rendered fp32 on GPU (scripts/render-voice-corpus-gpu.sh, ~55min
      full rebuild) and published to the HF dataset repo
      AmeliaMowers/cairn-voice; runtime is fetch-and-play
      (content-addressed .ogg), worker/model machinery deleted, coverage
      is a loud CI gate (voice:check in demo-pages.yml). Curriculum copy
      changes now require render + upload before the deploy passes.
- [ ] Widgets silently ignore unknown/unsupported patch keys (found in
      the 2026-09-01 review sweep: ratio-table drops `cols` patches,
      area-model drops `height` patches — both authored as if they
      worked). Fail loudly per the house rule: throw or validator-warn
      ([unknown_patch_key]) on a patch key the widget does not apply.
- [ ] Per-problem difficulty analytics (enabled by discrete pools):
      (itemId, paramHash) now has repeated observations — aggregate
      per-instance correct rates in the guide view; later IRT-style
      calibration per instance instead of per-item difficulty tiers.
- [ ] Build step 5: real site server (SQLite SiteStore, auth/enrollment).
- [ ] Guide v2: per-student drill-in (their map + event timeline),
      intervention actions (clear a flag, assign focus), real auth
      (arrives with step 5). v1 shipped: ?view=guide, roster +
      needs-attention, ?seed=1 synthetic class.
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

## Stepwise problems (the unified-widget direction)

Shipped 2026-08-27: `expect` gates on timeline steps (op/expr/numeric/
pick), StepwisePlayer with hint→reveal→"Show me" and scrubbing, wired as
the faded phase AND the scaffolded-practice lead, all 80 timelines gated,
[no_expects] + [expect_shape] + [gate_telegraph] invariants, and
stepwise-coverage proving every gate accepts its own key. Design
rationale and literature live in memory + cairn/CLAUDE.md. What is LEFT:

- [ ] HUMAN VETTING of the ~180 mechanically-derived gate prompts/values
      (zoo per-timeline view is the tracker; machine checks prove
      self-passability, not pedagogy).
- [ ] Gate-fatigue tuning — some timelines carry 4–6 gates; consider a
      max-gates-per-serve cap or rung-based gate sampling.
- [ ] Per-step BKT evidence: emit a scaffold_step event (step id, choice,
      correctness) and feed it as discounted evidence. Today the tallies
      collapse into hintLevel. (= first-run report S-06.)
- [ ] Prompted rung: proactive hints at gates for the lowest p (today's
      hints are on-miss only) — the ladder's rung 2.
- [ ] Misconception ids → the guide view: aggregate which error a student
      repeats, per skill (the ids exist; nothing reads them yet).
- [ ] Stepwise in the corrective ladder: a missed practice item retries
      the SAME instance stepwise instead of re-serving a different one.
- [ ] Scrub parity for LessonPlayer (step dots exist only in stepwise).

## First-run report #2 (artifact 920e438d, 2026-08-29)

Fixed: stale-problem state sync (01), finish-what-you-start so skills
reach mastery instead of stranding at ~88% (02/03 root cause), picker
clears on a wrong pick (05), step box gets inputMode (04 half).
Remaining, roughly in the report's order:

- [ ] 02/03 the stone: verify a milestone/grant now lands in-band and a
      demo session can actually place a stone inside five minutes.
- [ ] 04 the step box calls a correct FINAL answer wrong. Merging the two
      boxes is NOT the plan (Mia) — they have distinct jobs and conflating
      them risks reading a step answer as a final one. Options worth
      weighing: recognise the final answer at a step and say "that's the
      answer — put it below", or separate them visually so the mistake
      stops happening. Decide before building.
- [ ] 06 unparseable input ("eight") must be a format nudge, not a
      misconception, and must not log an attempt.
- [ ] 07 guide view off the event log: per-skill mastery, last attempts,
      the misconception names we already compute (= S-02 below).
- [ ] 08 hints are scoped to the current step; clear hint state on change.
- [ ] 09 locked skills: either gate them or drop the lock language.
- [ ] 10 one noun for points/stones/mastery, with a sentence saying what
      earns it.
- [ ] 11 hash routes so screens are linkable and Back works.
- [ ] 13 switch-student shows existing names; keep typed capitalisation.
- [ ] 14 aria-live on feedback, an h1, and per-step SVG labels.
- [ ] 15 exponents lesson narrates "6 + 6 = 12" in a lesson about not
      doing that — narrate as area, not repeated addition.

## First-run report follow-ups (artifact 14a3480f, 2026-08-27)

Blocking items and the front door were fixed 2026-08-27/28. Remaining:

- [ ] S-01 mastery MOMENT: the grant card exists and MILESTONES now mark
      the climb (2026-08-28); still open — smooth the mastery-meter curve
      (5%→67% on one answer reads arbitrary; BKT is genuinely that fast,
      so this is a display-scale question) and check the grant card
      actually shows in the demo flow.
- [ ] S-02 guide roster shows stale skill/stones — read from the same
      projection as the student view; rows open a student detail (guide v2).
- [ ] S-04 practice scaffolds must not print the answer (the number-line
      scaffold is labeled through the final value) — withhold-terminal-
      value mode, reveal on submit.
- [ ] S-05 map: label the three clusters, print standards codes on cards,
      wrap titles to two lines, empty-cairn state.
- [ ] F-02 opening placement: open on the map or ask a grade; frame the
      first pick as deliberate.
- [ ] OG image for the share card (title/description/OG tags shipped).

## Client / widgets

- [ ] proportional-graph widget (line through origin, read (0,0)/(1,r)) —
      unblocks g7 graph-interpret (rp-slab.md deferred table).
- [ ] compare-rates "pick with work" upgrade: two offer cards each with a
      unit-rate fill-in, then click the winner — constructed response where
      today's choice items are the d1 entry point.
- [x] Wrong-answer DIAGNOSIS: standard + CATALOG AUTHORING done
      2026-08-28 — all 62 items and every op gate carry named
      misconceptions ([no_misconceptions] warns on any that don't;
      diagnosis-coverage.test proves each fires on its own wrong answer).
      Remaining: numeric/pick/expr gates are still generic (169 gates,
      11 op ones done) — author as the vetting pass reaches them.
- [ ] Skill map phone REFLOW: horizontal scroll + hyphenation shipped; a
      true stacked-list layout under 560px is the real fix.
- [ ] ENGAGEMENT batch (family playtest): sounds (correct/mastery chimes),
      alternate palettes/themes, friendlier voice pass over all
      student-facing copy, gamification beyond points (streaks? stones
      gallery?), themed word-problem skins per item family.
- [ ] square-tiles widget (exponents deserve their own picture — the
      gridded area model is a stopgap; see GOLDEN_WIDGET §6b reuse rule).
- [ ] algebra-tiles widget — unlocks the honest third rep for
      write-expression, combine, simplify-first (its number-line rep was
      removed as a wrong picture) and future factoring. Also clears the
      last 2 representation_count warnings.
- [x] ~~cube-model counting input~~ — dropped 2026-08-30 with the trinity.
      An input is not owed to a representation: display-only is a category,
      not debt. Build an input when a PROBLEM needs one, not to complete a
      widget's role matrix.
- [ ] First-run report 3 (29 Aug), still open. DONE: the K–8 overclaim
      (copy now "grades 6–7 today, 3–12 in progress") and the missing
      placement (grade picker on sign-in, 3–12 with unbuilt grades
      disabled; picking a grade marks everything below it known via a
      `placement` event — NOT mastery, no check evidence, no stone).
      DONE since: the event log is live in the guide view ("Watch it
      live", polling, signals first); step_attempt logs every stepwise
      move (step index, gate type, answer, correct, revealed,
      misconception, per-gate latency); the roster row opens a per-child
      detail panel whose "Where the moves break" names the STEP.
      Remaining, roughly by the report's own ordering:
      - hints are keyed to the problem, not the current step, so they
        describe a step already finished (S-06; the one still open)
      - lesson's own numbers reused as a practice problem (engine design
        question — the scaffolded lead is SUPPOSED to share numbers; is
        the follow-up serve too similar?)
      DONE 2026-08-30 (funnel batch for the homeschool pilot): mastery
      bar capped at 96% + "check to finish" until the stone; sign-in
      lists this device's profiles (tap to continue); muted text
      #8b8070 → #6f6557 (AA at small sizes); points chip + dashboard
      explain points (effort) vs stones (mastery via check); work↔cairn
      rides location.hash so Back toggles views (#my-cairn linkable).
      Earlier: Enter-to-submit (form), 390px map (overflow-x), reset
      confirm (15s disarm).
- [ ] Flow gaps still open: parked-vs-done framing on session_done;
      offered-hint auto-reveal lacks framing copy. (Reset-demo, the
      focus-mode indicator, and the check-unlock dismissal: done — the
      dismissal is a countdown now, CHECK_DEFER_SERVES.)
- [ ] SESSION STATE IS NOT DURABLE (flow review, 2026-08-28). SiteCore
      replay rebuilds `student` from the log but hands back a fresh
      SessionState, and the demo reconstructs SiteCore on EVERY page
      load. The credit-destroying case is fixed (see reload-credit.test
      .ts) by removing the 'led' discount, but these remain, worst first:
      - DONE: the lesson's promise now survives (StudentState.lastTaught,
        folded from explanation_viewed; lesson-promise.test.ts). The
        instance-level `session.promised` is still session-only, so the
        exact NUMBERS may differ after a reload — the skill and the
        representation no longer do.
      - `session.check` lost ⇒ a check IN PROGRESS restarts and passed
        items are thrown away. (The reported re-take bypass is NOT real
        and was verified: failing a check zeroes consecUnassistedCorrect
        AND drops p below pThreshold in the durable fold, so both gates
        close and startCheck is refused after a reload just as it is
        live.)
      - DONE: the corrective ladder survives (restoreSession replays the
        log's attempts through applySkillAttempt; corrective-reload.test
        .ts checks all three rungs).
      - `session.served` lost ⇒ the same instance with the same numbers
        can be served twice.
      Fix shape: `check` should become an event rather than memory; the
      instance-level `promised` likewise if the exact numbers matter.
      `pending` is correctly non-durable (it 409s, which is right).
- [x] WRONG-PROBLEM WALKTHROUGH guarded for symbolic answers too
      (2026-08-30). [resolution_answer] now matches non-integer answers by
      expression equivalence against the rendered resolution (verbatim
      substring first, expression-segment equivalence as fallback). On
      arrival it found two LIVE wrong-form pairs — write-expression.002
      (4n−7) and combine.002 (6y−10) fed plus-form timelines — resolved by
      the add-solve/sub-solve precedent: split into g6.ee.write-expression-sub
      and g7.ee.combine-neg (see below).
- [ ] IM-FIRST concrete models for g6.ee.write-expression-sub and
      g7.ee.combine-neg (created 2026-08-30 from the minus-form items that
      used to wrong-problem the plus skills). Each has only a
      worked-equation timeline — the [worked_primary] and
      [representation_count] warnings on both skills ARE this task. Read
      IM first edition for 6.EE.A.2a / 7.EE.A.1 before choosing pictures
      (a tape shows "4n with 7 removed" naturally, but decide from IM,
      not the fleet).
- [ ] `SiteApi` never checks `r.ok`, so an HTTP error body is cast to the
      success type — `attempt` can hand ItemCard `{error}` and render a
      NaN point delta. Same shape in DemoApi.unwrap for 409s.

## Engine / server

- [ ] Build step 5: Bun site server + SQLite SiteStore, auth/enrollment,
      outbox (dev server is the reference wiring).
- [ ] Build step 7: LLM rubric grading + help queue (needs_llm verdicts
      currently no-op).
- [ ] FSRS: carry pre-lapse stability into re-grants (v1 re-inits fresh —
      conservative; revisit with data).
- [ ] Playwright browser E2E lane (jsdom + headless screenshots today).

## Curriculum / standards

- [ ] NEXT SLAB: 6–8.NS, then 4–5 fraction operations
      (curriculum/sources/standards/slab-map.md for the order).
- [ ] g7 two-step SUBTRACTION variant (ax − b = c) as its own skill with
      its own timelines (form_mismatch caught it riding the addition skill).
- [ ] percent-tax skill (split out of percent-multistep.002).
- [ ] EE-slab deferred (ee-slab.md): 6.EE.B.8 inequalities (answer shape +
      region number-line), 6.EE.C.9 dependent variables, 7.EE.B.3
      multi-step rational problems, factoring (`form: factored`),
      write-the-EQUATION-from-context.
- [ ] ratio-language node (6.RP.A.1) — needs a ratio-pair answer shape +
      grader (a:b equivalence policy).
- [ ] unit-convert (6.RP.A.3d) — nothing blocking, cut for slab size.
- [ ] percent-error / chained percent changes (7.RP.A.3).
- [ ] Granularity watchlist: split skills when mastery data says so
      (rp-slab.md — unit-rate direction choice is the likeliest first).
- [ ] BKT: fit per-skill parameters once pilot data exists (today all 26
      skills share one stated prior — L0 .2/T .08/S .12/G .25, ~3 corrects
      to the gate). Empirical-probability or brute-force grid fitting per
      Baker/Corbett; watch the [bkt_fast]/[bkt_degenerate] guards.
- [ ] Per-skill LOAD for the working-set cap (Mia's idea): a `load`
      field defaulting to 1, budget ~3, so a heavy skill (write-from-words)
      costs 2 and crowds out less — needs an authoring rubric (how many new
      elements must be held at once) before it is worth the curriculum cost.
- [ ] Human vetting of ALL draft content (release CI refuses unvetted);
      the zoo's ✓/◌ chips are the progress board.

## Ops / hardware (user side)

- [ ] Low-end Android CI lane.
- [ ] Raspberry Pi HTTPS spike (local-network trust, §9).

/** core/policy/v1 — the corrective/selection constants of §5.
 *
 * This is a VERSIONED MODULE, not config: operators cannot weaken it, and a
 * later release ships policy/v2 rather than editing these numbers. Events
 * record coreVersion; the fold never reads this module, so changing policy is
 * a release with no replay consequences (§4.7 version taxonomy).
 */
export const policyV1 = {
  version: 'policy/v1',

  corrective: {
    /** consecutive misses → action before the next item (§5 table) */
    offerHintAtMisses: 1,
    altExplanationAtMisses: 2,
    prereqProbeAtMisses: 3,
    /** park the skill and flag the guide. Interpretation: the cap is part of
     * the miss-escalation machine, so it fires when a MISS lands at or beyond
     * the cap — an all-correct run is never parked by attempt count.
     * Parking is SOFT: the skill leaves the automatic rotation and the guide
     * is flagged, but a student who chooses to keep practicing it may (the
     * selector honors an explicit focus request; no further escalation or
     * flags while parked). */
    attemptCapPerSession: 6,
    /** probe exit: one correct resumes the skill; this many probe misses
     * flags `prereq_failure` and parks the skill for the session. (The doc
     * is silent on the probe exit; this matches its guide-flag vocabulary.) */
    probeMissLimit: 3,
  },

  hints: {
    maxLevel: 2,
  },

  check: {
    /** offer the check when p ≥ this, or after this many consecutive
     * unassisted correct answers */
    pThreshold: 0.9,
    /** the streak path is deliberately LONGER than the p path: p can be
     * reached with three clean answers, so the streak exists to catch the
     * student whose p is dragged down by early misses but who has since
     * strung together real unassisted work */
    consecUnassisted: 4,
    /** passing this many unassisted isomorphs from distinct base items
     * grants mastery regardless of p */
    itemsRequired: 2,
    distinctBaseItems: true,
    /** mastery_granted sets p to at least this (also hard-coded in the
     * reducer — a fold constant, not a policy read) */
    grantP: 0.95,
  },

  lapse: {
    /** failed FSRS review: demote to practice (not lesson), reset p */
    demoteToPhase: 'practice',
    pAfterLapse: 0.7,
  },

  scaffolding: {
    /** concreteness fading: below this mastery estimate a practice item is
     * served WITH its representation scaffold (viz); at or above it the
     * problem stands alone — the raw symbolic form is the goal, and checks
     * are always raw. From L0 0.2 the retuned BKT reaches ~0.71 after two
     * unassisted corrects and ~0.88 after three, so this keeps the scaffold
     * for roughly the first three practice wins — and brings it back when p
     * drops on misses. Retune together with bkt_defaults. */
    fadeAtP: 0.85,
  },

  selector: {
    /** ~1 review per 3 new items */
    interleaveReviewEvery: 4,
    /** working-set cap: never START a new skill while this many are already
     * in lesson/faded/practice — breadth with breathing room, not a lesson
     * avalanche after every unlock */
    maxActiveSkills: 3,
    /** blocked acquisition: stay on a skill through its lesson, faded phase,
     * and this many practice serves — THEN it joins the interleaved rotation
     * (novices benefit from a short blocked run; interleave after) */
    acquisitionRun: 2,
    /** target expected-correctness band, practice/review phases only */
    expectedCorrectness: [0.7, 0.9],
    /** avoid re-serving any of the last N instances */
    recentWindow: 5,
    /** bounded search for a fresh isomorph paramHash */
    isomorphSeedTries: 32,
  },

  fsrs: {
    /** correct with latency > this × the skill's latency estimate → 'hard' (§5) */
    hardLatencyFactor: 1.5,
    /** correct, unassisted, faster than this × the estimate → 'easy' (§5) */
    easyLatencyFactor: 0.6,
    /** stand-in estimate until the skill has its own latency EMA */
    defaultLatencyMs: 20000,
    /** use bundle latency defaults until a site has this many attempts */
    minAttemptsForSiteMedian: 30,
  },
} as const

export type PolicyV1 = typeof policyV1
export type Policy = PolicyV1

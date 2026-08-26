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
     * the cap — an all-correct run is never parked by attempt count. */
    attemptCapPerSession: 6,
    /** probe exit: one correct resumes the skill; this many probe misses
     * flags `prereq_failure` and parks the skill for the session. (The doc
     * is silent on the probe exit; this matches its guide-flag vocabulary.) */
    probeMissLimit: 2,
  },

  hints: {
    maxLevel: 2,
  },

  check: {
    /** offer the check when p ≥ this, or after this many consecutive
     * unassisted correct answers */
    pThreshold: 0.9,
    consecUnassisted: 3,
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

  selector: {
    /** ~1 review per 3 new items (FSRS reviews arrive in build step 8) */
    interleaveReviewEvery: 4,
    /** target expected-correctness band, practice/review phases only */
    expectedCorrectness: [0.7, 0.9],
    /** avoid re-serving any of the last N instances */
    recentWindow: 5,
    /** bounded search for a fresh isomorph paramHash */
    isomorphSeedTries: 32,
  },

  fsrs: {
    /** correct with latency > this × skill median rates 'hard' (§5) */
    hardLatencyFactor: 1.5,
    /** use bundle latency defaults until a site has this many attempts */
    minAttemptsForSiteMedian: 30,
  },
} as const

export type PolicyV1 = typeof policyV1
export type Policy = PolicyV1

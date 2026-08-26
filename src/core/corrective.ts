/** Corrective policy (§5) — a state machine over CONSECUTIVE misses on a
 * skill within a session. Engine behavior, not a setting; constants come from
 * the versioned policy module.
 *
 *   miss 1 → hint level 1 offered on the next item
 *   miss 2 → alternative explanation (representation not yet viewed), new item
 *   miss 3 → prerequisite probe (weakest unmastered-or-lapsed prereq)
 *   miss at ≥ cap attempts this session → park the skill, guide_flag
 *
 * Accounting: hints do not consume attempts; probe attempts count only
 * against the prerequisite skill; a fresh isomorph is a different item but
 * still counts toward the skill cap. A correct UNASSISTED answer resets the
 * miss counter; a correct assisted answer does not.
 */
import type { PolicyV1 } from './policy/v1.ts'

export interface SkillSession {
  /** attempts on this skill this session (probe attempts excluded — they
   * belong to the prereq's own SkillSession) */
  attempts: number
  consecMisses: number
  probeMisses: number
  parked: boolean
  /** alternative explanation already used this session (v1 has exactly one
   * alternative before the probe) */
  altShown: boolean
}

export const freshSkillSession = (): SkillSession => ({
  attempts: 0,
  consecMisses: 0,
  probeMisses: 0,
  parked: false,
  altShown: false,
})

export function applySkillAttempt(
  s: SkillSession,
  correct: boolean,
  assisted: boolean,
): SkillSession {
  return {
    ...s,
    attempts: s.attempts + 1,
    consecMisses: correct ? (assisted ? s.consecMisses : 0) : s.consecMisses + 1,
  }
}

export type CorrectiveDirective =
  | { kind: 'continue'; offerHintLevel?: number }
  | { kind: 'alt_explanation' }
  | { kind: 'prereq_probe' }
  | { kind: 'park'; reason: 'attempt_cap' }

/** Decide what happens before the next item, given the just-updated session
 * counters. The attempt cap fires only on a miss: an all-correct run is never
 * parked by attempt count. */
export function nextDirective(s: SkillSession, pol: PolicyV1): CorrectiveDirective {
  const c = pol.corrective
  if (s.consecMisses === 0) return { kind: 'continue' }
  if (s.attempts >= c.attemptCapPerSession) return { kind: 'park', reason: 'attempt_cap' }
  if (s.consecMisses >= c.prereqProbeAtMisses) return { kind: 'prereq_probe' }
  if (s.consecMisses >= c.altExplanationAtMisses && !s.altShown)
    return { kind: 'alt_explanation' }
  if (s.consecMisses >= c.offerHintAtMisses)
    return { kind: 'continue', offerHintLevel: Math.min(s.consecMisses, pol.hints.maxLevel) }
  return { kind: 'continue' }
}

export type ProbeOutcome =
  | { kind: 'resume' }
  | { kind: 'continue_probe' }
  | { kind: 'flag_and_park'; reason: 'prereq_failure' }

/** Probe exit: one correct resumes the skill; a miss under the limit serves
 * another probe item; probeMissLimit misses flags the guide and parks the
 * skill for the session. */
export function applyProbeResult(
  s: SkillSession,
  correct: boolean,
  pol: PolicyV1,
): { session: SkillSession; outcome: ProbeOutcome } {
  if (correct)
    return { session: { ...s, probeMisses: 0 }, outcome: { kind: 'resume' } }
  const probeMisses = s.probeMisses + 1
  if (probeMisses >= pol.corrective.probeMissLimit)
    return {
      session: { ...s, probeMisses, parked: true },
      outcome: { kind: 'flag_and_park', reason: 'prereq_failure' },
    }
  return { session: { ...s, probeMisses }, outcome: { kind: 'continue_probe' } }
}

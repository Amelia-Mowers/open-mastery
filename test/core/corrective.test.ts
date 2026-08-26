// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
  applyProbeResult,
  applySkillAttempt,
  freshSkillSession,
  nextDirective,
  type SkillSession,
} from '../../src/core/corrective'
import { policyV1 } from '../../src/core/policy/v1'

const miss = (s: SkillSession) => applySkillAttempt(s, false, false)
const hitUnassisted = (s: SkillSession) => applySkillAttempt(s, true, false)
const hitAssisted = (s: SkillSession) => applySkillAttempt(s, true, true)

describe('corrective state machine (§5 table)', () => {
  it('walks the ladder: hint → alt representation → prereq probe', () => {
    let s = freshSkillSession()
    s = miss(s)
    expect(nextDirective(s, policyV1)).toEqual({ kind: 'continue', offerHintLevel: 1 })
    s = miss(s)
    expect(nextDirective(s, policyV1)).toEqual({ kind: 'alt_explanation' })
    s = { ...s, altShown: true }
    s = miss(s)
    expect(nextDirective(s, policyV1)).toEqual({ kind: 'prereq_probe' })
  })

  it('parks with attempt_cap when a miss lands at the cap', () => {
    let s = freshSkillSession()
    for (let i = 0; i < policyV1.corrective.attemptCapPerSession; i++) s = miss(s)
    expect(nextDirective(s, policyV1)).toEqual({ kind: 'park', reason: 'attempt_cap' })
  })

  it('an all-correct run is never parked by attempt count', () => {
    let s = freshSkillSession()
    for (let i = 0; i < 20; i++) s = hitUnassisted(s)
    expect(nextDirective(s, policyV1)).toEqual({ kind: 'continue' })
  })

  it('correct unassisted resets the miss counter; correct assisted does not', () => {
    let s = miss(freshSkillSession())
    expect(s.consecMisses).toBe(1)
    s = hitAssisted(s)
    expect(s.consecMisses).toBe(1) // not reset
    s = miss(s)
    expect(s.consecMisses).toBe(2)
    expect(nextDirective(s, policyV1)).toEqual({ kind: 'alt_explanation' })
    s = hitUnassisted(s)
    expect(s.consecMisses).toBe(0) // reset
  })

  it('the single v1 alternative is not offered twice; the ladder passes through to the probe', () => {
    let s = freshSkillSession()
    s = miss(s)
    s = miss(s)
    s = { ...s, altShown: true } // alternative consumed
    // a later pair of misses after a reset lands on 2 again
    s = hitUnassisted(s)
    s = miss(s)
    s = miss(s)
    expect(s.consecMisses).toBe(2)
    // alt already shown → hint continues instead
    expect(nextDirective(s, policyV1)).toEqual({ kind: 'continue', offerHintLevel: 2 })
  })

  it('hints never consume attempts (attempts move only via applySkillAttempt)', () => {
    const s = freshSkillSession()
    expect(s.attempts).toBe(0)
    const after = applySkillAttempt(s, true, false)
    expect(after.attempts).toBe(1)
  })

  it('probe: one correct resumes; probeMissLimit misses flag prereq_failure and park', () => {
    const r1 = applyProbeResult(freshSkillSession(), true, policyV1)
    expect(r1.outcome).toEqual({ kind: 'resume' })
    let s = freshSkillSession()
    for (let i = 0; i < policyV1.corrective.probeMissLimit - 1; i++) {
      const r = applyProbeResult(s, false, policyV1)
      expect(r.outcome).toEqual({ kind: 'continue_probe' })
      s = r.session
    }
    const last = applyProbeResult(s, false, policyV1)
    expect(last.outcome).toEqual({ kind: 'flag_and_park', reason: 'prereq_failure' })
    expect(last.session.parked).toBe(true)
  })
})

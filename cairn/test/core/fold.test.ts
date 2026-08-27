// @vitest-environment node
import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { foldStudent, initialStudentState, applyEvent, type StudentState } from '../../src/core/fold'
import { instanceKey, type CairnEvent } from '../../src/core/events'
import type { BktParams } from '../../src/core/bkt'
import { makeCtx, bktFor, SKILL_A, SKILL_B } from './fixtures'
import { runSession, alwaysCorrect } from './students'

/** comparable snapshot (Sets → sorted arrays) */
const snap = (s: StudentState) => ({
  skills: s.skills,
  assisted: [...s.assisted].sort(),
  representationsViewed: s.representationsViewed,
  openFlags: s.openFlags,
  deleted: s.deleted,
})

function masteredRun(): { events: CairnEvent[]; student: StudentState } {
  const { ctx, all } = makeCtx()
  const { student } = runSession(ctx, alwaysCorrect)
  return { events: all(), student }
}

describe('fold (§4.7): state = fold(core, events by siteSeq)', () => {
  it('the engine state IS the fold of its emitted events', () => {
    const { events, student } = masteredRun()
    expect(snap(foldStudent(events, bktFor()))).toEqual(snap(student))
  })

  it('replay is deterministic and input-order independent (siteSeq is the order)', () => {
    const { events } = masteredRun()
    const sorted = foldStudent(events, bktFor())
    fc.assert(
      fc.property(fc.constant(null).chain(() => fc.shuffledSubarray(events, { minLength: events.length })), (shuffled) => {
        expect(snap(foldStudent(shuffled, bktFor()))).toEqual(snap(sorted))
      }),
      { numRuns: 20 },
    )
  })

  it('tolerates siteSeq gaps (deletion): renumbering with holes changes nothing', () => {
    const { events } = masteredRun()
    const gapped = events.map((e) => ({ ...e, siteSeq: e.siteSeq * 10 }))
    expect(snap(foldStudent(gapped, bktFor()))).toEqual(snap(foldStudent(events, bktFor())))
  })

  it('retuning BKT parameters never revokes mastery_granted (§10 core property)', () => {
    const { events } = masteredRun()
    const arbParams: fc.Arbitrary<BktParams> = fc.record({
      L0: fc.double({ min: 0.05, max: 0.9, noNaN: true }),
      T: fc.double({ min: 0.01, max: 0.5, noNaN: true }),
      S: fc.double({ min: 0.01, max: 0.4, noNaN: true }),
      G: fc.double({ min: 0.01, max: 0.4, noNaN: true }),
    })
    fc.assert(
      fc.property(arbParams, (prm) => {
        const state = foldStudent(events, () => prm)
        for (const id of [SKILL_A, SKILL_B]) {
          expect(state.skills[id]?.phase).toBe('mastered')
          expect(state.skills[id]?.p).toBeGreaterThanOrEqual(0.95)
        }
      }),
      { numRuns: 30 },
    )
  })

  it('mastery_lapsed demotes to practice (not lesson) at p = 0.7', () => {
    const { events } = masteredRun()
    const last = events[events.length - 1]!
    const lapse: CairnEvent = {
      ...last,
      siteSeq: last.siteSeq + 1,
      t: last.t + 1000,
      kind: 'mastery_lapsed',
      skillId: SKILL_A,
    }
    const state = foldStudent([...events, lapse], bktFor())
    expect(state.skills[SKILL_A]?.phase).toBe('practice')
    expect(state.skills[SKILL_A]?.p).toBe(0.7)
    expect(state.skills[SKILL_A]?.lapsed).toBe(true)
    // the grant remains a fact
    expect(state.skills[SKILL_A]?.masteredAt).toBeDefined()
  })

  it('a correct faded attempt earns less mastery: it replays at the hint-level-2 discount', () => {
    const env = {
      siteSeq: 1, deviceId: 'd', deviceSeq: 1, coreVersion: 'c', bundleVersion: 'b', studentId: 's', t: 1,
    }
    const attempt = (itemKind: 'faded' | 'practice', hintLevel: number): number => {
      const state = initialStudentState()
      applyEvent(
        state,
        {
          ...env, kind: 'attempt', itemId: 'i.x', paramHash: 'h1', skillId: SKILL_A,
          itemKind, answer: 'x = 7', correct: true, hintLevel, latencyMs: 3000, assisted: false,
        },
        bktFor(),
      )
      return state.skills[SKILL_A]!.p
    }
    // heavily assisted by construction — exactly the maximal-hint evidence,
    // no matter how few hints were revealed on the answer step itself
    expect(attempt('faded', 0)).toBeCloseTo(attempt('practice', 2), 10)
    expect(attempt('faded', 0)).toBeLessThan(attempt('practice', 0) - 0.1)
  })

  it('llm_help marks exactly (itemId, paramHash) assisted', () => {
    const state = initialStudentState()
    const env = {
      siteSeq: 1, deviceId: 'd', deviceSeq: 1, coreVersion: 'c', bundleVersion: 'b', studentId: 's', t: 1,
    }
    applyEvent(state, { ...env, kind: 'llm_help', itemId: 'i.x', paramHash: 'h1', turnCount: 3 }, bktFor())
    expect(state.assisted.has(instanceKey('i.x', 'h1'))).toBe(true)
    expect(state.assisted.has(instanceKey('i.x', 'h2'))).toBe(false)
  })

  it('explanation progress: viewing starts the lesson, completing it moves to faded', () => {
    const state = initialStudentState()
    const env = {
      siteSeq: 1, deviceId: 'd', deviceSeq: 1, coreVersion: 'c', bundleVersion: 'b', studentId: 's', t: 1,
    }
    applyEvent(
      state,
      { ...env, kind: 'explanation_viewed', explanationId: 'e1', skillId: SKILL_A, completed: false, representation: 'number-line' },
      bktFor(),
    )
    expect(state.skills[SKILL_A]?.phase).toBe('lesson')
    applyEvent(
      state,
      { ...env, siteSeq: 2, kind: 'explanation_viewed', explanationId: 'e1', skillId: SKILL_A, completed: true, representation: 'number-line' },
      bktFor(),
    )
    expect(state.skills[SKILL_A]?.phase).toBe('faded')
    expect(state.representationsViewed[SKILL_A]).toEqual(['number-line'])
  })
})

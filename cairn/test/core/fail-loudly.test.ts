// @vitest-environment node
/** NO SILENT FALLBACKS in the engine's model and grading paths.
 *
 * Each of these used to substitute something plausible for a fault, so the
 * fault reached a student as ordinary-looking behaviour — and two of them
 * wrote the damage into the durable event log, where replay reproduces it
 * forever.
 */
import { describe, it, expect } from 'vitest'
import { AnswerKeyError, gradeAnswer, diagnose } from '../../src/core/graders'
import { SiteCore } from '../../src/site/core'
import { fixtureBundle } from './fixtures'

describe('model and grading faults are loud', () => {
  it('a malformed answer key throws instead of marking the student wrong', () => {
    // an unrenderable key: the student typed a fine answer, our key is broken
    expect(() =>
      gradeAnswer({ type: 'expr', value: '{nope}' } as never, { a: 1 } as never, '4'),
    ).toThrow(AnswerKeyError)
    // it must NOT come back as a verdict the engine can log as a miss
    try {
      gradeAnswer({ type: 'op', value: '{nope} 3' } as never, {} as never, 'subtract 3')
      throw new Error('should have thrown')
    } catch (e) {
      expect(e).toBeInstanceOf(AnswerKeyError)
    }
  })

  it('an unrenderable misconception falls back to the generic line, never raw template text', () => {
    const said = diagnose(
      [{ id: 'x', when: '{a}', says: 'you did {nope} instead' }],
      { a: 5 } as never,
      '5',
    )
    // matched the wrong answer, but its message cannot render — so no
    // diagnosis at all, rather than "{nope}" shown to a child
    expect(said).toBeNull()
  })

  it('a skill with no BKT parameters throws rather than scoring under a house default', () => {
    const core = new SiteCore(fixtureBundle(), { now: () => Date.UTC(2026, 0, 1) })
    // a skill id not in this bundle — e.g. renamed between versions, with
    // the student's state still live in the event log
    expect(() => core.masteryOf('kid', 'nonexistent.skill')).toThrow(/no BKT parameters/)
  })
})

// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { paramHash } from '@openmastery/schema'
import {
  eligibleSkills,
  instantiate,
  nextCheckBaseItem,
  rankSkills,
  targetDifficulty,
  weakestPrereq,
} from '../../src/core/select'
import { instanceKey } from '../../src/core/events'
import { initialStudentState } from '../../src/core/fold'
import { policyV1 } from '../../src/core/policy/v1'
import { fixtureIndex, bktFor, SKILL_A, SKILL_B } from './fixtures'

const cur = fixtureIndex()

describe('selector (§5)', () => {
  it('prereq gating: dependent skill locked until the prereq is mastered', () => {
    const student = initialStudentState()
    expect(eligibleSkills(student, cur)).toEqual([SKILL_A])
    student.skills[SKILL_A] = { p: 0.95, attempts: 5, phase: 'mastered', consecUnassistedCorrect: 3, masteredAt: 1 }
    expect(eligibleSkills(student, cur)).toEqual([SKILL_B])
  })

  it('a lapsed prereq does NOT re-lock dependents (mastery was granted); it becomes probe-eligible', () => {
    const student = initialStudentState()
    student.skills[SKILL_A] = { p: 0.7, attempts: 5, phase: 'practice', consecUnassistedCorrect: 0, masteredAt: 1, lapsed: true }
    const eligible = eligibleSkills(student, cur)
    expect(eligible).toContain(SKILL_B)
    expect(eligible).toContain(SKILL_A) // lapsed skill itself needs re-mastery
    expect(weakestPrereq(SKILL_B, student, cur, bktFor())).toBe(SKILL_A)
  })

  it('weakestPrereq is null when every prereq is mastered and unlapsed (probe step skipped)', () => {
    const student = initialStudentState()
    student.skills[SKILL_A] = { p: 0.95, attempts: 5, phase: 'mastered', consecUnassistedCorrect: 3, masteredAt: 1 }
    expect(weakestPrereq(SKILL_B, student, cur, bktFor())).toBeNull()
  })

  it('practice skills rank by distance from the expected-correctness band', () => {
    const student = initialStudentState()
    // both in practice; A far below the band, B inside it
    student.skills[SKILL_A] = { p: 0.1, attempts: 1, phase: 'practice', consecUnassistedCorrect: 0 }
    student.skills[SKILL_B] = { p: 0.8, attempts: 1, phase: 'practice', consecUnassistedCorrect: 0 }
    const ranked = rankSkills([SKILL_A, SKILL_B], student, cur, bktFor(), policyV1)
    expect(ranked[0]).toBe(SKILL_B)
  })

  it('instruction-phase skills are exempt from band targeting and lead', () => {
    const student = initialStudentState()
    student.skills[SKILL_A] = { p: 0.8, attempts: 1, phase: 'practice', consecUnassistedCorrect: 0 }
    student.skills[SKILL_B] = { p: 0.3, attempts: 0, phase: 'unseen', consecUnassistedCorrect: 0 }
    const ranked = rankSkills([SKILL_A, SKILL_B], student, cur, bktFor(), policyV1)
    expect(ranked[0]).toBe(SKILL_B)
  })

  it('instantiate: authored params first, then fresh generator isomorphs; never a blocked (itemId, paramHash)', () => {
    const item = cur.items.get('alg1.linear.solve-one-step.001')!
    const blocked = new Set<string>()
    const first = instantiate(item, blocked, 1, 32)!
    expect(first.paramHash).toBe(paramHash(item.params))
    blocked.add(instanceKey(first.itemId, first.paramHash))
    for (let round = 0; round < 20; round++) {
      const next = instantiate(item, blocked, 1000 + round * 97, 32)!
      expect(next).not.toBeNull()
      expect(blocked.has(instanceKey(next.itemId, next.paramHash))).toBe(false)
      blocked.add(instanceKey(next.itemId, next.paramHash))
      // isomorph params satisfy the item's own constraints
      const { a, b } = next.params as { a: number; b: number }
      expect(b % a).toBe(0)
    }
  })

  it('instantiate: a generator-less item runs dry once its authored instance is used', () => {
    const faded = cur.items.get('alg1.linear.solve-one-step.f01')!
    const key = instanceKey(faded.id, paramHash(faded.params))
    expect(instantiate(faded, new Set([key]), 1, 32)).toBeNull()
  })

  it('checks are capstones: the hardest base item comes first', () => {
    const first = nextCheckBaseItem(SKILL_B, [], cur)!
    const second = nextCheckBaseItem(SKILL_B, [first.id], cur)!
    expect(first.difficulty).toBeGreaterThanOrEqual(second.difficulty)
    expect(first.difficulty).toBe(2)
  })

  it('practice difficulty ramps with the mastery estimate', () => {
    const pool = cur.itemsBySkill.get(SKILL_B)!.filter((it) => it.faded == null)
    expect(targetDifficulty(0.2, pool)).toBe(1)
    expect(targetDifficulty(0.55, pool)).toBe(2)
    expect(targetDifficulty(0.95, pool)).toBe(2)
    expect(targetDifficulty(0.5, [])).toBe(1)
  })

  it('check base items are generator-backed, non-choice, and distinct', () => {
    const first = nextCheckBaseItem(SKILL_B, [], cur)!
    expect(first).not.toBeNull()
    const second = nextCheckBaseItem(SKILL_B, [first.id], cur)!
    expect(second).not.toBeNull()
    expect(second.id).not.toBe(first.id)
    for (const it of [first, second]) {
      expect(it.generator).not.toBeNull()
      expect(it.widget.type).not.toBe('choice')
      expect(it.rubric ?? null).toBeNull()
      expect(it.faded ?? null).toBeNull()
    }
    // only two check-eligible base items exist in the fixture
    expect(nextCheckBaseItem(SKILL_B, [first.id, second.id], cur)).toBeNull()
  })
})

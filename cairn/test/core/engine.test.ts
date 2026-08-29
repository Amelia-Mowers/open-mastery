// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { applyEvent, foldStudent, initialStudentState, type StudentState } from '../../src/core/fold'
import { instanceKey, type CairnEvent } from '../../src/core/events'
import {
  freshSession,
  nextAction,
  recordLlmHelp,
  startCheck,
} from '../../src/core/engine'
import { makeCtx, bktFor, SKILL_A, SKILL_B } from './fixtures'
import {
  alwaysCorrect,
  alwaysWrong,
  guesser,
  hintDependent,
  runLoop,
  runSession,
  slowLearner,
} from './students'

/** Every mastery_granted must be backed by the required unassisted check
 * attempts on distinct base items — verified from the event log alone. */
function verifyMasteryEvidence(events: CairnEvent[]): void {
  const grants = events.filter((e) => e.kind === 'mastery_granted')
  for (const g of grants) {
    expect(g.checkItemIds).toHaveLength(2)
    const baseItems = new Set<string>()
    for (const key of g.checkItemIds) {
      const att = events.find(
        (e) => e.kind === 'attempt' && instanceKey(e.itemId, e.paramHash) === key,
      )
      expect(att, `check attempt for ${key}`).toBeDefined()
      if (att?.kind !== 'attempt') continue
      expect(att.itemKind).toBe('check')
      expect(att.correct).toBe(true)
      expect(att.hintLevel).toBe(0)
      expect(att.assisted).toBe(false)
      expect(att.skillId).toBe(g.skillId)
      baseItems.add(att.itemId)
    }
    expect(baseItems.size).toBe(2) // two DISTINCT base items
  }
}

const snap = (s: StudentState) => ({
  skills: s.skills,
  assisted: [...s.assisted].sort(),
  representationsViewed: s.representationsViewed,
  openFlags: s.openFlags,
})

describe('synthetic students (§10): the fast executable spec', () => {
  it('always-correct: lesson → faded → practice → 2-item unassisted check → mastered, prereq order respected', () => {
    const { ctx, all } = makeCtx()
    const { student, actions, steps } = runSession(ctx, alwaysCorrect)
    expect(steps).toBeLessThan(60)
    // both skills mastered, prereq first
    expect(student.skills[SKILL_A]?.phase).toBe('mastered')
    expect(student.skills[SKILL_B]?.phase).toBe('mastered')
    const events = all()
    const grants = events.filter((e) => e.kind === 'mastery_granted')
    expect(grants.map((g) => (g.kind === 'mastery_granted' ? g.skillId : ''))).toEqual([SKILL_A, SKILL_B])
    verifyMasteryEvidence(events)
    // p floors at 0.95 on grant
    expect(student.skills[SKILL_A]!.p).toBeGreaterThanOrEqual(0.95)
    expect(student.skills[SKILL_B]!.p).toBeGreaterThanOrEqual(0.95)
    // B's flow included its faded example before practice
    const bServes = actions.filter((a) => a.kind === 'serve_item' && a.forSkillId === SKILL_B)
    expect(bServes[0]).toMatchObject({ itemKind: 'led' })
    // no lesson attempt before the lesson explanation
    const firstLessonIdx = actions.findIndex((a) => a.kind === 'lesson')
    const firstServeIdx = actions.findIndex((a) => a.kind === 'serve_item')
    expect(firstLessonIdx).toBeGreaterThanOrEqual(0)
    expect(firstLessonIdx).toBeLessThan(firstServeIdx)
    // engine state ≡ fold of emitted events
    expect(snap(foldStudent(events, bktFor()))).toEqual(snap(student))
  })

  it('always-wrong: hint offer → unseen-representation explanation → park + attempt_cap flag; dependents stay locked', () => {
    const { ctx, all } = makeCtx()
    const { student, actions } = runSession(ctx, alwaysWrong)
    const serves = actions.filter((a) => a.kind === 'serve_item')
    // miss 1 → hint level 1 offered on the next item
    expect(serves[1]).toMatchObject({ offeredHintLevel: 1 })
    // miss 2 → alternative explanation with a representation not yet viewed
    const alt = actions.find((a) => a.kind === 'alt_explanation')
    expect(alt).toMatchObject({ skillId: SKILL_A, representation: 'area-model' })
    // miss ladder ends in park + guide_flag(attempt_cap)
    const flags = all().filter((e) => e.kind === 'guide_flag')
    expect(flags).toHaveLength(1)
    expect(flags[0]).toMatchObject({ reason: 'attempt_cap', skillId: SKILL_A })
    expect(student.skills[SKILL_A]?.attempts).toBe(6)
    expect(student.skills[SKILL_A]?.phase).not.toBe('mastered')
    // B never became eligible, so it was never served
    expect(actions.some((a) => a.kind === 'serve_item' && a.forSkillId === SKILL_B)).toBe(false)
    expect(snap(foldStudent(all(), bktFor()))).toEqual(snap(student))
  })

  it('lapsed prereq: miss 3 on the dependent → probe of the lapsed prereq → prereq_failure flag + park', () => {
    const { ctx, all } = makeCtx()
    const student = initialStudentState()
    const session = freshSession()
    // master the prereq honestly
    runLoop(student, session, ctx, alwaysCorrect, 100, (s) => s.skills[SKILL_A]?.phase === 'mastered')
    expect(student.skills[SKILL_A]?.phase).toBe('mastered')
    // FSRS review fails (build step 8 emits this for real): the lapse arrives as an event
    applyEvent(student, ctx.stamp({ kind: 'mastery_lapsed', skillId: SKILL_A }), ctx.bkt)
    expect(student.skills[SKILL_A]?.lapsed).toBe(true)
    // B is still eligible (mastery was granted) and now fails repeatedly
    const { actions } = runLoop(student, session, ctx, alwaysWrong, 100)
    const probes = actions.filter((a) => a.kind === 'serve_item' && a.itemKind === 'probe')
    expect(probes.length).toBeGreaterThanOrEqual(2)
    expect(probes[0]).toMatchObject({ skillId: SKILL_A, forSkillId: SKILL_B })
    // probe attempts are scoped to the prereq skill
    const probeAttempts = all().filter((e) => e.kind === 'attempt' && e.itemKind === 'probe')
    expect(probeAttempts.length).toBeGreaterThanOrEqual(2)
    for (const e of probeAttempts) if (e.kind === 'attempt') expect(e.skillId).toBe(SKILL_A)
    // two probe misses → prereq_failure flag, dependent parked
    const flags = all().filter((e) => e.kind === 'guide_flag')
    expect(flags.some((f) => f.kind === 'guide_flag' && f.reason === 'prereq_failure' && f.skillId === SKILL_B)).toBe(true)
    expect(student.skills[SKILL_B]?.phase).not.toBe('mastered')
    // the earlier grant remains a fact through it all
    expect(student.skills[SKILL_A]?.masteredAt).toBeDefined()
    expect(snap(foldStudent(all(), bktFor()))).toEqual(snap(student))
  })

  it('hint-dependent: the check gate is reached (not trapped below threshold), but assisted work never masters', () => {
    const { ctx, all } = makeCtx()
    const { student, actions } = runSession(ctx, hintDependent, 200)
    // the p-gate opened and a check was actually served (gate decoupled from consec streak)
    expect(actions.some((a) => a.kind === 'serve_item' && a.itemKind === 'check')).toBe(true)
    // …but hints are off in the check, this student fails it, and mastery is never granted
    expect(all().filter((e) => e.kind === 'mastery_granted')).toHaveLength(0)
    expect(student.skills[SKILL_A]?.phase).not.toBe('mastered')
    // every practice attempt was assisted → consec streak never opened the gate
    expect(student.skills[SKILL_A]?.consecUnassistedCorrect).toBe(0)
    expect(snap(foldStudent(all(), bktFor()))).toEqual(snap(student))
  })

  it('LLM help marks the instance assisted; the selector never serves it again and checks avoid it', () => {
    const { ctx } = makeCtx()
    const student = initialStudentState()
    const session = freshSession()
    runLoop(student, session, ctx, alwaysCorrect, 100, (s) => s.skills[SKILL_A]?.phase === 'mastered')
    // enter B's practice
    runLoop(student, session, ctx, alwaysCorrect, 10, (s) => s.skills[SKILL_B]?.phase === 'practice')
    const a1 = nextAction(student, session, ctx)
    expect(a1.kind).toBe('serve_item')
    if (a1.kind !== 'serve_item') return
    recordLlmHelp(student, ctx, a1.instance.itemId, a1.instance.paramHash, 4)
    const key = instanceKey(a1.instance.itemId, a1.instance.paramHash)
    expect(student.assisted.has(key)).toBe(true)
    const a2 = nextAction(student, session, ctx)
    if (a2.kind !== 'serve_item') throw new Error('expected serve')
    expect(instanceKey(a2.instance.itemId, a2.instance.paramHash)).not.toBe(key)
    // force the gate open and start a check: its instances must dodge the assisted key
    student.skills[SKILL_B]!.p = 0.95
    student.skills[SKILL_B]!.phase = 'practice'
    expect(startCheck(student, session, ctx, SKILL_B)).toBe(true)
    const c = nextAction(student, session, ctx)
    if (c.kind !== 'serve_item') throw new Error('expected check serve')
    expect(c.itemKind).toBe('check')
    expect(instanceKey(c.instance.itemId, c.instance.paramHash)).not.toBe(key)
  })

  it('scaffolding fades with mastery: early practice keeps the representation, later practice and checks are raw', () => {
    const { ctx } = makeCtx()
    const student = initialStudentState()
    const session = freshSession()
    // reach SKILL_A practice with a low estimate: scaffolded
    runLoop(student, session, ctx, alwaysCorrect, 20, (s) => s.skills[SKILL_A]?.phase === 'practice')
    const early = nextAction(student, session, ctx)
    if (early.kind !== 'serve_item') throw new Error('expected serve')
    // 'led' is the first serve after a lesson — stepwise, but a real
    // problem the student finishes; either kind is working practice here
    expect(['led', 'practice']).toContain(early.itemKind)
    expect(student.skills[SKILL_A]!.p).toBeLessThan(0.85)
    expect(early.scaffolded).toBe(true)
    // push the estimate past the fade threshold: raw problems from here
    runLoop(student, session, ctx, alwaysCorrect, 30, (s) => (s.skills[SKILL_A]?.p ?? 0) >= 0.85)
    const late = nextAction(student, session, ctx)
    if (late.kind !== 'serve_item') throw new Error('expected serve')
    expect(late.scaffolded).toBe(false)
    // checks are always raw
    student.skills[SKILL_A]!.p = 0.95
    expect(startCheck(student, session, ctx, SKILL_A)).toBe(true)
    const check = nextAction(student, session, ctx)
    if (check.kind !== 'serve_item') throw new Error('expected check serve')
    expect(check.itemKind).toBe('check')
    expect(check.scaffolded).toBe(false)
  })

  const invariants = (name: string, seed: number, model: (s: number) => ReturnType<typeof guesser>) =>
    it(`${name}: log invariants hold (unique serves, p bounds, mastery evidence, fold consistency)`, () => {
      const { ctx, all } = makeCtx()
      const { student, attempted } = runSession(ctx, model(seed), 250)
      // never the same (itemId, paramHash) twice
      expect(new Set(attempted).size).toBe(attempted.length)
      for (const st of Object.values(student.skills)) {
        expect(st.p).toBeGreaterThan(0)
        expect(st.p).toBeLessThan(1)
      }
      verifyMasteryEvidence(all())
      expect(snap(foldStudent(all(), bktFor()))).toEqual(snap(student))
    })

  invariants('guesser', 11, (s) => guesser(s))
  invariants('slow learner', 7, (s) => slowLearner(s))

  it('slow learner eventually masters the prereq skill', () => {
    const { ctx, all } = makeCtx()
    const { student } = runSession(ctx, slowLearner(3), 250)
    const grants = all().filter((e) => e.kind === 'mastery_granted')
    expect(grants.length).toBeGreaterThanOrEqual(1)
    expect(student.skills[SKILL_A]?.phase).toBe('mastered')
  })
})

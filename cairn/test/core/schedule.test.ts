// @vitest-environment node
/** Scheduling (§5): blocked acquisition then interleaved consolidation, the
 * working-set cap, and FSRS spaced review — the "breathing room" behavior. */
import { describe, it, expect } from 'vitest'
import { itemSchema, skillSchema, explanationSchema, renderTemplate, type Bundle, type Env } from '@openmastery/schema'
import { buildIndex } from '../../src/core/curriculum'
import { policyV1 } from '../../src/core/policy/v1'
import { DAY_MS } from '../../src/core/fsrs'
import { SiteCore } from '../../src/site/core'
import { initialStudentState } from '../../src/core/fold'
import {
  freshSession,
  nextAction,
  recordAttempt,
  recordExplanationViewed,
  type EngineCtx,
  type NextAction,
} from '../../src/core/engine'
import { bktUpdate, type BktParams } from '../../src/core/bkt'
import { makeStamper } from './fixtures'
import { runLoop, runSession, alwaysCorrect, type StudentModel } from './students'

const BKT: BktParams = { L0: 0.2, T: 0.08, S: 0.12, G: 0.25 }
const review = { status: 'vetted' as const }

/** n independent single-layer skills, 2 check-eligible items each. */
function miniCtx(n: number): { ctx: EngineCtx; all: () => ReturnType<typeof makeStamper>['all'] extends () => infer R ? R : never; clock: { t: number } } {
  const bundle: Bundle = { skills: [], items: [], explanations: [] }
  for (let i = 1; i <= n; i++) {
    const sid = `t.sched.s${i}`
    bundle.skills.push(
      skillSchema.parse({
        id: sid,
        name: `Skill ${i}`,
        prereqs: [],
        bkt_defaults: BKT,
        instruction: [`${sid}.exp`],
      }),
    )
    bundle.explanations.push(
      explanationSchema.parse({
        id: `${sid}.exp`,
        skill: sid,
        representation: 'worked-equation',
        widget: 'worked-equation',
        params_from: 'item',
        timeline: [
          { t: 0, caption: 'Watch.' },
          { t: 2, handoff: { prompt: 'Now you try.' } },
        ],
        review,
      }),
    )
    for (const num of ['001', '002'])
      bundle.items.push(
        itemSchema.parse({
          id: `${sid}.${num}`,
          skills: [sid],
          difficulty: num === '001' ? 1 : 2,
          params: { a: 3 + i, b: 10 + i },
          generator: { a: { int: [2, 30] }, b: { int: [2, 30] } },
          widget: { type: 'numeric-input', config: { stem: 'What is {a} + {b}?' } },
          answer: { type: 'expr', value: '{a+b}' },
          review,
        }),
      )
  }
  const { stamp, all, clock } = makeStamper()
  return {
    ctx: { cur: buildIndex(bundle), bkt: () => BKT, policy: policyV1, stamp, now: () => clock.t },
    all: all as never,
    clock,
  }
}

const neverChecks: StudentModel = {
  answer: (_a, correctRaw) => ({ raw: correctRaw, hintLevel: 0 }),
  acceptCheck: false,
}

const workSkills = (actions: NextAction[]): string[] =>
  actions
    .filter((a): a is Extract<NextAction, { kind: 'serve_item' }> => a.kind === 'serve_item')
    .map((a) => a.forSkillId)

describe('blocked acquisition, interleaved consolidation', () => {
  it('stays on one skill through its blocked run, then rotates the working set', () => {
    const { ctx } = miniCtx(3)
    const { actions } = runSession(ctx, neverChecks, 24)
    const serves = workSkills(actions)
    // the led serve counts toward the run (it IS the first problem), so the
    // blocked stretch is acquisitionRun serves, not one more
    const run = policyV1.selector.acquisitionRun
    // blocked: each skill's acquisition is a contiguous run. It may run
    // LONGER than acquisitionRun — a skill that climbs past finishAtP holds
    // the floor until its check is on the table (finish what you start), so
    // assert contiguity rather than an exact length.
    const firstRun = serves.findIndex((s) => s !== 't.sched.s1')
    expect(firstRun).toBeGreaterThanOrEqual(run)
    expect(serves.slice(0, firstRun)).toEqual(Array(firstRun).fill('t.sched.s1'))
    expect(serves[firstRun]).toBe('t.sched.s2')
    // interleaved: once every skill has had its blocked run, no immediate
    // repeats. Each run may extend past acquisitionRun (finish what you
    // start), so find where the LAST skill's contiguous run ends.
    const s3start = serves.indexOf('t.sched.s3')
    let s3end = s3start
    while (serves[s3end + 1] === 't.sched.s3') s3end++
    const tail = serves.slice(s3end + 1)
    expect(tail.length).toBeGreaterThanOrEqual(6)
    // interleaved: the working set is genuinely shared, and no skill is
    // allowed to monopolise the tail. (Strict alternation is too strong now:
    // a NEW representation's lesson restarts a short blocked run so its own
    // problems follow it, and a skill past finishAtP holds until its check.)
    expect(new Set(tail).size).toBeGreaterThanOrEqual(2)
    for (const id of new Set(tail))
      expect(tail.filter((x) => x === id).length, id).toBeLessThan(tail.length)
  })

  it('the working-set cap: a 4th skill is not started while 3 are underway — but all master eventually', () => {
    const capped = miniCtx(5)
    const { actions } = runSession(capped.ctx, neverChecks, 40)
    const started = new Set(workSkills(actions))
    expect(policyV1.selector.maxActiveSkills).toBe(3)
    expect(started.size).toBe(3)
    // with checks accepted the cap releases as skills master: all 5 finish
    const full = miniCtx(5)
    const { student } = runSession(full.ctx, alwaysCorrect, 400)
    for (let i = 1; i <= 5; i++) expect(student.skills[`t.sched.s${i}`]?.phase).toBe('mastered')
  })
})

describe('forceFocus (demo/testing) bypasses the eligibility gate', () => {
  it('a locked skill serves its lesson under forceFocus; never without', () => {
    const { ctx } = miniCtx(2)
    // make s2 locked behind s1
    const s2 = ctx.cur.skills.get('t.sched.s2')!
    ctx.cur.skills.set('t.sched.s2', { ...s2, prereqs: ['t.sched.s1'] })
    const student = initialStudentState()
    const session = freshSession()
    const plain = nextAction(student, session, ctx, { focusSkill: 't.sched.s2' })
    expect(plain.kind === 'lesson' ? plain.skillId : null).not.toBe('t.sched.s2')
    const forced = nextAction(student, session, ctx, { focusSkill: 't.sched.s2', forceFocus: true })
    expect(forced.kind).toBe('lesson')
    if (forced.kind === 'lesson') expect(forced.skillId).toBe('t.sched.s2')
  })
})

describe('the faded phase poses a DIFFERENT problem than the lesson', () => {
  it('the first faded serve never uses the authored (lesson-example) params', () => {
    const { ctx } = miniCtx(1)
    const student = initialStudentState()
    const session = freshSession()
    // lesson → faded
    const lesson = nextAction(student, session, ctx)
    if (lesson.kind !== 'lesson') throw new Error('expected lesson')
    recordExplanationViewed(student, session, ctx, {
      skillId: lesson.skillId,
      explanationId: lesson.explanationId,
      completed: true,
    })
    const faded = nextAction(student, session, ctx)
    if (faded.kind !== 'serve_item') throw new Error('expected faded serve')
    expect(faded.itemKind).toBe('led')
    const authored = ctx.cur.items.get(faded.instance.itemId)!.params
    expect(faded.instance.params).not.toEqual(authored)
  })
})

describe('choice answers carry a guessing floor', () => {
  it('a correct choice attempt updates p at the hint-level-1 discount', () => {
    const { ctx } = miniCtx(1)
    const choiceItem = itemSchema.parse({
      id: 't.sched.s1.choice',
      skills: ['t.sched.s1'],
      difficulty: 1,
      params: { a: 4, b: 7 },
      widget: {
        type: 'choice',
        config: {
          stem: 'Which is bigger?',
          options: [
            { key: 'a', label: '{a}' },
            { key: 'b', label: '{b}' },
          ],
        },
      },
      answer: { type: 'choice', value: 'b' },
      review,
    })
    ctx.cur.items.set(choiceItem.id, choiceItem)
    const student = initialStudentState()
    const session = freshSession()
    const action = {
      kind: 'serve_item',
      itemKind: 'practice',
      skillId: 't.sched.s1',
      forSkillId: 't.sched.s1',
      instance: { itemId: choiceItem.id, params: { a: 4, b: 7 }, paramHash: 'h1' },
      scaffolded: false,
    } as Extract<NextAction, { kind: 'serve_item' }>
    const r = recordAttempt(student, session, ctx, action, { raw: 'b', hintLevel: 0, latencyMs: 3000 })
    expect(r.correct).toBe(true)
    const attempt = r.events.find((e) => e.kind === 'attempt')
    expect(attempt && 'hintLevel' in attempt ? attempt.hintLevel : -1).toBe(1)
    // exactly the discounted update — not the full-credit one
    expect(student.skills['t.sched.s1']!.p).toBeCloseTo(bktUpdate(BKT.L0, true, 1, BKT), 12)
    expect(student.skills['t.sched.s1']!.p).toBeLessThan(bktUpdate(BKT.L0, true, 0, BKT))
  })
})

describe('FSRS spaced review (§5, build step 8)', () => {
  it('mastery schedules a review; when due it is served, and passing it pushes the next one out', () => {
    const { ctx, clock } = miniCtx(1)
    const { student } = runSession(ctx, alwaysCorrect, 100)
    const fsrs0 = student.skills['t.sched.s1']!.fsrs!
    expect(student.skills['t.sched.s1']!.phase).toBe('mastered')
    expect(fsrs0.due).toBeGreaterThan(clock.t)

    // a fresh session days later: the review comes up even at cadence 0
    clock.t += 10 * DAY_MS
    const session = freshSession()
    const a = nextAction(student, session, ctx)
    expect(a.kind).toBe('serve_item')
    if (a.kind !== 'serve_item') return
    expect(a.itemKind).toBe('review')
    expect(a.scaffolded).toBe(false)

    // fast unassisted correct → 'easy'; due moves out, mastery keeps standing
    const r = recordAttempt(student, session, ctx, a, { raw: correctFor(ctx, a), hintLevel: 0, latencyMs: 1500 })
    expect(r.correct).toBe(true)
    const attempt = r.events.find((e) => e.kind === 'attempt')
    expect(attempt && 'rating' in attempt ? attempt.rating : undefined).toBe('easy')
    const fsrs1 = student.skills['t.sched.s1']!.fsrs!
    expect(fsrs1.stability).toBeGreaterThan(fsrs0.stability)
    expect(fsrs1.due).toBeGreaterThan(clock.t)
    expect(student.skills['t.sched.s1']!.phase).toBe('mastered')
    expect(nextAction(student, session, ctx).kind).toBe('session_done')
  })

  it('a failed review lapses mastery: practice at p 0.7, and a fresh check re-masters', () => {
    const { ctx, clock } = miniCtx(1)
    const { student } = runSession(ctx, alwaysCorrect, 100)
    clock.t += 10 * DAY_MS
    const session = freshSession()
    const a = nextAction(student, session, ctx)
    if (a.kind !== 'serve_item') throw new Error('expected review serve')
    const r = recordAttempt(student, session, ctx, a, { raw: '999999', hintLevel: 0, latencyMs: 4000 })
    expect(r.events.some((e) => e.kind === 'mastery_lapsed')).toBe(true)
    const st = student.skills['t.sched.s1']!
    expect(st.phase).toBe('practice')
    expect(st.p).toBeCloseTo(0.7, 10)
    expect(st.lapsed).toBe(true)
    expect(st.masteredAt).toBeDefined() // the graph unlock survives (§4.7)

    // relearn: the ordinary loop re-masters it and re-enters review
    const r2 = runLoop(student, session, ctx, alwaysCorrect, 100)
    expect(student.skills['t.sched.s1']!.phase).toBe('mastered')
    expect(student.skills['t.sched.s1']!.lapsed).toBe(false)
    expect(student.skills['t.sched.s1']!.fsrs!.due).toBeGreaterThan(clock.t)
    expect(r2.steps).toBeGreaterThan(0)
  })

  it('reviews interleave into new work at the policy cadence', () => {
    const { ctx, clock } = miniCtx(2)
    // master only s1 (cap the run right after its mastery)
    const student = initialStudentState()
    const session = freshSession()
    runLoop(student, session, ctx, alwaysCorrect, 300, (st) => st.skills['t.sched.s1']?.phase === 'mastered')
    expect(student.skills['t.sched.s1']?.phase).toBe('mastered')

    clock.t += 10 * DAY_MS
    const s2 = freshSession()
    const acts: NextAction[] = []
    const { actions } = { actions: acts }
    // drive by hand so no checks intervene
    for (let i = 0; i < 12; i++) {
      const a = nextAction(student, s2, ctx)
      acts.push(a)
      if (a.kind === 'session_done') break
      if (a.kind === 'lesson' || a.kind === 'alt_explanation') {
        recordExplanationViewed(student, s2, ctx, {
          skillId: a.skillId,
          explanationId: a.explanationId,
          completed: true,
        })
        continue
      }
      recordAttempt(student, s2, ctx, a, { raw: correctFor(ctx, a), hintLevel: 0, latencyMs: 4000 })
    }
    const kinds = actions
      .filter((a): a is Extract<NextAction, { kind: 'serve_item' }> => a.kind === 'serve_item')
      .map((a) => a.itemKind)
    // s2's acquisition runs first (review not yet at cadence), then the due
    // review interleaves — exactly one review serve, mid-stream
    expect(kinds).toContain('review')
    expect(kinds[0]).not.toBe('review')
    expect(kinds.filter((k) => k === 'review')).toHaveLength(1)
  })
})

function correctFor(ctx: EngineCtx, a: Extract<NextAction, { kind: 'serve_item' }>): string {
  const item = ctx.cur.items.get(a.instance.itemId)!
  const r = renderTemplate(item.answer.value as string, a.instance.params as Env, { numberStyle: 'fraction' })
  if (!r.ok) throw new Error(r.error.message)
  return r.value
}

describe('milestones (earned by leaving with ground gained)', () => {
  it('ranks name how far the climb got, highest first', () => {
    expect(SiteCore.milestoneRank(0.85).name).toBe('Nearly there')
    expect(SiteCore.milestoneRank(0.5).name).toBe('Real progress')
    expect(SiteCore.milestoneRank(0.3).name).toBe('Getting it')
    expect(SiteCore.milestoneRank(0.05).name).toBe('Started')
    // thresholds descend, so the FIRST match is the highest earned rank
    const mins = SiteCore.MILESTONE_RANKS.map((r) => r.min)
    expect([...mins].sort((a, b) => b - a)).toEqual(mins)
  })
})

describe('representations are taught before they are tested', () => {
  it('an item framed in an unseen representation is preceded by its lesson', () => {
    // the real curriculum: items carry `representation`, and a skill has
    // several explanations — a student must never meet a picture cold
    const skills: string[] = []
    const bundle: Bundle = { skills: [], items: [], explanations: [] }
    const sid = 't.reps.s1'
    for (const rep of ['balance-scale', 'tape-diagram']) {
      bundle.explanations.push(
        explanationSchema.parse({
          id: `${sid}.exp-${rep}`,
          skill: sid,
          representation: rep,
          widget: rep,
          params_from: 'item',
          timeline: [{ t: 0, caption: 'Watch.' }, { t: 2, handoff: { prompt: 'Now you try.' } }],
          review,
        }),
      )
      bundle.items.push(
        itemSchema.parse({
          id: `${sid}.${rep === 'balance-scale' ? '001' : '002'}`,
          skills: [sid],
          difficulty: rep === 'balance-scale' ? 1 : 2,
          representation: rep,
          params: { a: 3, b: 12 },
          generator: { a: { int: [2, 9] }, b: { int: [4, 40] } },
          widget: { type: 'numeric-input', config: { stem: 'What is {b} over {a}?' } },
          answer: { type: 'expr', value: '{b/a}' },
          review,
        }),
      )
    }
    skills.push(sid)
    bundle.skills.push(
      skillSchema.parse({
        id: sid,
        name: 'Reps',
        prereqs: [],
        bkt_defaults: BKT,
        instruction: [`${sid}.exp-balance-scale`, `${sid}.exp-tape-diagram`],
      }),
    )
    const { stamp, clock } = makeStamper()
    const ctx = { cur: buildIndex(bundle), bkt: () => BKT, policy: policyV1, stamp, now: () => clock.t }
    const { actions } = runSession(ctx as never, alwaysCorrect, 40)
    const taught = new Set<string>()
    for (const a of actions) {
      if (a.kind === 'lesson' || a.kind === 'alt_explanation') taught.add(a.representation)
      if (a.kind === 'serve_item' && a.itemKind === 'practice') {
        const rep = ctx.cur.items.get(a.instance.itemId)?.representation
        if (rep) expect(taught.has(rep), `served ${rep} before teaching it`).toBe(true)
      }
    }
    // and BOTH representations got taught, not just the first
    expect(taught.size).toBeGreaterThanOrEqual(2)
  })

  it('the lesson that interrupts an item is followed by THAT item', () => {
    // teaching the tape and then serving a balance problem is the bug: the
    // lesson was about a specific instance, so that instance must come next
    const bundle: Bundle = { skills: [], items: [], explanations: [] }
    const sid = 't.reps.s2'
    for (const rep of ['balance-scale', 'tape-diagram']) {
      bundle.explanations.push(
        explanationSchema.parse({
          id: `${sid}.exp-${rep}`,
          skill: sid,
          representation: rep,
          widget: rep,
          params_from: 'item',
          timeline: [{ t: 0, caption: 'Watch.' }, { t: 2, handoff: { prompt: 'Now you try.' } }],
          review,
        }),
      )
      bundle.items.push(
        itemSchema.parse({
          id: `${sid}.${rep === 'balance-scale' ? '001' : '002'}`,
          skills: [sid],
          difficulty: rep === 'balance-scale' ? 1 : 2,
          representation: rep,
          params: { a: 3, b: 12 },
          generator: { a: { int: [2, 9] }, b: { int: [4, 40] } },
          widget: { type: 'numeric-input', config: { stem: 'What is {b} over {a}?' } },
          answer: { type: 'expr', value: '{b/a}' },
          review,
        }),
      )
    }
    bundle.skills.push(
      skillSchema.parse({
        id: sid,
        name: 'Reps2',
        prereqs: [],
        bkt_defaults: BKT,
        instruction: [`${sid}.exp-balance-scale`, `${sid}.exp-tape-diagram`],
      }),
    )
    const { stamp, clock } = makeStamper()
    const ctx = { cur: buildIndex(bundle), bkt: () => BKT, policy: policyV1, stamp, now: () => clock.t }
    const { actions } = runSession(ctx as never, alwaysCorrect, 40)
    let pendingRep: string | null = null
    let checked = 0
    for (const a of actions) {
      if (a.kind === 'lesson') pendingRep = a.representation
      else if (a.kind === 'serve_item' && pendingRep !== null) {
        const rep = ctx.cur.items.get(a.instance.itemId)?.representation ?? null
        expect(rep, 'the lesson taught a rep and then served a different one').toBe(pendingRep)
        pendingRep = null
        checked++
      }
    }
    expect(checked).toBeGreaterThanOrEqual(2) // both lessons were honoured
  })
})

describe('finish what you start', () => {
  it('a skill past finishAtP is not abandoned mid-climb', () => {
    // the reported symptom: a session ends with several skills at ~88% and
    // no stone placed, because interleaving rotated away from each one just
    // before its check
    const { ctx } = miniCtx(3)
    const { actions, student } = runSession(ctx, alwaysCorrect, 200)
    const serves = workSkills(actions)
    // every skill that got worked on reached mastery — nothing stranded high
    for (const [id, st] of Object.entries(student.skills)) {
      const L0 = BKT.L0
      const shown = (st.p - L0) / (0.95 - L0)
      if (shown >= policyV1.selector.finishAtP)
        expect(st.phase, `${id} stranded at ${Math.round(shown * 100)}%`).toBe('mastered')
    }
    expect(serves.length).toBeGreaterThan(6)
  })

  it('but a student who declines the check is not pinned forever', () => {
    // nearlyDone releases once the check is ON OFFER — otherwise declining it
    // would trap the student on one skill for the rest of the session
    const { ctx } = miniCtx(3)
    const { actions } = runSession(ctx, neverChecks, 40)
    const serves = workSkills(actions)
    expect(new Set(serves).size).toBeGreaterThanOrEqual(2)
  })
})

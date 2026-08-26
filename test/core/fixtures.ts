/** Hand-authored two-skill fixture curriculum (§10: tiny, hand-authored) and
 * a synthetic envelope stamper standing in for the site server. */
import {
  skillSchema,
  itemSchema,
  explanationSchema,
  validateBundle,
  type Bundle,
} from '@openmastery/schema'
import type { BktParams } from '../../src/core/bkt'
import { buildIndex, type CurriculumIndex } from '../../src/core/curriculum'
import type { CairnEvent, EventBody } from '../../src/core/events'
import { policyV1 } from '../../src/core/policy/v1'
import type { EngineCtx } from '../../src/core/engine'

const review = { status: 'vetted' as const }
const BKT: BktParams = { L0: 0.3, T: 0.15, S: 0.1, G: 0.2 }

export function fixtureBundle(): Bundle {
  const skills = [
    skillSchema.parse({
      id: 'alg1.arith.inverse-ops',
      name: 'Inverse operations',
      bkt_defaults: BKT,
      instruction: ['alg1.arith.inverse-ops.exp-numberline'],
    }),
    skillSchema.parse({
      id: 'alg1.linear.solve-one-step',
      name: 'Solve one-step linear equations',
      prereqs: ['alg1.arith.inverse-ops'],
      bkt_defaults: BKT,
      instruction: ['alg1.linear.solve-one-step.exp-balance'],
      faded_examples: ['alg1.linear.solve-one-step.f01'],
    }),
  ]
  const mkSolveItem = (num: string, difficulty: number) =>
    itemSchema.parse({
      id: `alg1.linear.solve-one-step.${num}`,
      skills: ['alg1.linear.solve-one-step'],
      difficulty,
      params: { a: 7, b: 21, variable: 'x' },
      generator: { a: { int: [2, 12] }, b: { mult_of: 'a', range: [10, 60] } },
      widget: { type: 'equation-input', config: { stem: 'Solve: {a}{variable} = {b}.' } },
      answer: { type: 'expr', value: '{variable} = {b/a}', equivalence: 'symbolic' },
      hints: ['What operation undoes multiplying by {a}?', 'Divide both sides by {a}.'],
      review,
    })
  const mkInverseItem = (num: string, difficulty: number) =>
    itemSchema.parse({
      id: `alg1.arith.inverse-ops.${num}`,
      skills: ['alg1.arith.inverse-ops'],
      difficulty,
      params: { a: 6, b: 24 },
      generator: { a: { int: [2, 12] }, b: { mult_of: 'a', range: [10, 72] } },
      widget: { type: 'numeric-input', config: { stem: 'What is {b} ÷ {a}?' } },
      answer: { type: 'expr', value: '{b/a}' },
      hints: ['How many groups of {a} make {b}?', '{b} ÷ {a} = {b/a}.'],
      review,
    })
  const items = [
    mkSolveItem('001', 1),
    mkSolveItem('002', 2),
    mkInverseItem('001', 1),
    mkInverseItem('002', 2),
    itemSchema.parse({
      id: 'alg1.linear.solve-one-step.f01',
      skills: ['alg1.linear.solve-one-step'],
      difficulty: 1,
      params: { a: 5, b: 40, variable: 'x' },
      widget: { type: 'equation-input', config: { stem: 'Finish solving: {a}{variable} = {b}.' } },
      answer: { type: 'expr', value: '{variable} = {b/a}' },
      faded: { reveal_steps: [1, 2], student_completes: [3] },
      review,
    }),
  ]
  const mkExp = (id: string, skill: string, representation: string) =>
    explanationSchema.parse({
      id,
      skill,
      representation,
      widget: representation,
      params_from: 'item',
      timeline: [
        { t: 0, caption: 'Watch.' },
        { t: 3, handoff: { prompt: 'Now you try.' } },
      ],
      review,
    })
  const explanations = [
    mkExp('alg1.arith.inverse-ops.exp-numberline', 'alg1.arith.inverse-ops', 'number-line'),
    mkExp('alg1.arith.inverse-ops.exp-area', 'alg1.arith.inverse-ops', 'area-model'),
    mkExp('alg1.linear.solve-one-step.exp-balance', 'alg1.linear.solve-one-step', 'balance-scale'),
    mkExp('alg1.linear.solve-one-step.exp-numberline', 'alg1.linear.solve-one-step', 'number-line'),
  ]
  return { skills, items, explanations }
}

export const SKILL_A = 'alg1.arith.inverse-ops'
export const SKILL_B = 'alg1.linear.solve-one-step'

export function fixtureIndex(): CurriculumIndex {
  const bundle = fixtureBundle()
  // the fixture itself must pass the release gates it exercises
  const issues = validateBundle(bundle).filter((i) => i.severity === 'error')
  if (issues.length > 0)
    throw new Error(`fixture bundle invalid: ${issues.map((i) => `${i.where}:${i.code}`).join(', ')}`)
  return buildIndex(bundle)
}

export const bktFor = (): ((skillId: string) => BktParams) => () => BKT

/** Synthetic site server: assigns siteSeq and site time. */
export function makeStamper(studentId = 's1'): {
  stamp: (body: EventBody) => CairnEvent
  all: () => CairnEvent[]
} {
  let seq = 0
  const log: CairnEvent[] = []
  return {
    stamp: (body) => {
      seq += 1
      const ev: CairnEvent = {
        ...body,
        siteSeq: seq,
        deviceId: 'd1',
        deviceSeq: seq,
        coreVersion: 'core-test',
        bundleVersion: 'bundle-test',
        studentId,
        t: seq * 1000,
      }
      log.push(ev)
      return ev
    },
    all: () => [...log],
  }
}

export function makeCtx(): { ctx: EngineCtx; all: () => CairnEvent[] } {
  const { stamp, all } = makeStamper()
  return { ctx: { cur: fixtureIndex(), bkt: bktFor(), policy: policyV1, stamp }, all }
}

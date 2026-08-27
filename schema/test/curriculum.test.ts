import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { skillSchema } from '../src/curriculum/skill.ts'
import { itemSchema } from '../src/curriculum/item.ts'
import { explanationSchema } from '../src/curriculum/explanation.ts'
import { validateBundle, type Bundle } from '../src/curriculum/bundle.ts'
import { normalizeLoadedDoc } from '../src/curriculum/normalize.ts'

/** The architecture doc's own examples (§4.1–4.3) must validate. */
const docSkill = {
  id: 'alg1.linear.solve-one-step',
  name: 'Solve one-step linear equations',
  prereqs: ['alg1.arith.inverse-ops', 'alg1.expr.evaluate'],
  standards: ['CCSS.MATH.CONTENT.6.EE.B.7'],
  source: { book: 'openstax-prealgebra', section: '3.3' },
  bkt_defaults: { L0: 0.3, T: 0.15, S: 0.1, G: 0.2 },
  fluency: false,
  instruction: [
    'alg1.linear.solve-one-step.exp-balance',
    'alg1.linear.solve-one-step.exp-inverse',
  ],
  faded_examples: [],
}

const docItem = {
  id: 'alg1.linear.solve-one-step.007',
  skills: ['alg1.linear.solve-one-step'],
  difficulty: 2,
  params: { a: 7, b: 21, variable: 'x' },
  generator: { a: { int: [2, 12] }, b: { mult_of: 'a', range: [10, 60] } },
  widget: { type: 'equation-input', config: { allow_fraction: true } },
  answer: { type: 'expr', value: '{variable} = {b/a}', equivalence: 'symbolic' },
  rubric: null,
  viz: { template: 'balance-scale', bind: { left: '{a}{variable}', right: '{b}' } },
  hints: ['What operation undoes multiplying by {a}?', 'Divide both sides by {a}.'],
  faded: null,
  // exercise arrives as a number from unquoted YAML; normalizeLoadedDoc handles it
  source: { book: 'openstax-prealgebra', section: '3.3', exercise: '41' },
  review: { status: 'vetted', by: '@handle', date: '2026-08-24' },
}

const docExplanation = {
  id: 'alg1.linear.solve-one-step.exp-balance',
  skill: 'alg1.linear.solve-one-step',
  representation: 'balance-scale',
  widget: 'balance-scale',
  params_from: 'item',
  timeline: [
    { t: 0, patch: { left: '{a}{variable}', right: '{b}' }, caption: 'Both sides are balanced.' },
    { t: 2.5, patch: { highlight: 'left.coef' }, caption: '{variable} is multiplied by {a}. Undo it by dividing.' },
    { t: 5, patch: { op: 'divide', by: '{a}' }, caption: 'Divide both sides by {a}.' },
    { t: 7.5, patch: { left: '{variable}', right: '{b/a}' }, caption: '{variable} = {b/a}.' },
    { t: 9, handoff: { prompt: 'Now you try.' } },
  ],
  review: { status: 'vetted' },
}

describe('file-level schemas', () => {
  it("accept the architecture doc's own examples", () => {
    expect(skillSchema.safeParse(docSkill).success).toBe(true)
    expect(itemSchema.safeParse(docItem).success).toBe(true)
    expect(explanationSchema.safeParse(docExplanation).success).toBe(true)
  })

  it('YAML loader quirks (bare dates, numeric exercise) are normalized before validation', () => {
    const asLoaded = normalizeLoadedDoc({
      ...docItem,
      source: { book: 'openstax-prealgebra', section: 3.3, exercise: 41 },
      review: { status: 'vetted', date: new Date('2026-08-24T00:00:00Z') },
    })
    const r = itemSchema.parse(asLoaded)
    expect(r.review.date).toBe('2026-08-24')
    expect(r.source?.section).toBe('3.3')
    expect(r.source?.exercise).toBe('41')
    // params named 'section' are NOT touched
    expect(normalizeLoadedDoc({ params: { section: 3 } })).toEqual({ params: { section: 3 } })
  })

  it('rejects malformed ids, probabilities, and timelines', () => {
    expect(skillSchema.safeParse({ ...docSkill, id: 'Alg1.Linear' }).success).toBe(false)
    expect(skillSchema.safeParse({ ...docSkill, id: 'single-segment' }).success).toBe(false)
    expect(
      skillSchema.safeParse({ ...docSkill, bkt_defaults: { L0: 0.3, T: 0.15, S: 0, G: 0.2 } })
        .success,
    ).toBe(false)
    expect(skillSchema.safeParse({ ...docSkill, instruction: [] }).success).toBe(false)
    expect(
      explanationSchema.safeParse({
        ...docExplanation,
        timeline: [
          { t: 5, caption: 'later' },
          { t: 1, caption: 'earlier' },
        ],
      }).success,
    ).toBe(false)
    expect(
      explanationSchema.safeParse({ ...docExplanation, timeline: [{ t: 0 }] }).success,
    ).toBe(false)
    expect(itemSchema.safeParse({ ...docItem, difficulty: 0 }).success).toBe(false)
    expect(itemSchema.safeParse({ ...docItem, unknown_field: 1 }).success).toBe(false)
  })

  it('generated params require an int/range domain', () => {
    expect(
      itemSchema.safeParse({ ...docItem, generator: { a: { mult_of: 'b' } } }).success,
    ).toBe(false)
  })

  it('exports JSON Schema (the published spec)', () => {
    const js = z.toJSONSchema(skillSchema)
    expect(js.type).toBe('object')
    expect((js as { required?: string[] }).required).toContain('id')
  })
})

/** A minimal internally-consistent bundle that passes the release gates. */
function goodBundle(): Bundle {
  const skill = skillSchema.parse({
    ...docSkill,
    prereqs: [],
    instruction: ['alg1.linear.solve-one-step.exp-balance'],
  })
  const expl1 = explanationSchema.parse(docExplanation)
  const expl2 = explanationSchema.parse({
    ...docExplanation,
    id: 'alg1.linear.solve-one-step.exp-numberline',
    representation: 'number-line',
    widget: 'number-line',
  })
  const item1 = itemSchema.parse(docItem)
  const item2 = itemSchema.parse({ ...docItem, id: 'alg1.linear.solve-one-step.008' })
  return { skills: [skill], items: [item1, item2], explanations: [expl1, expl2] }
}

describe('bundle validation (release gates)', () => {
  it('a consistent bundle has no issues', () => {
    const advisory = new Set(['representation_count', 'worked_missing', 'missing_banner'])
    expect(validateBundle(goodBundle()).filter((i) => !advisory.has(i.code))).toEqual([])
  })

  it('flags dangling references and wrong-skill instruction', () => {
    const b = goodBundle()
    b.skills[0]!.prereqs = ['alg1.missing.skill']
    const issues = validateBundle(b)
    expect(issues.some((i) => i.code === 'dangling_ref' && i.severity === 'error')).toBe(true)
  })

  it('flags prerequisite cycles', () => {
    const b = goodBundle()
    const s2 = skillSchema.parse({
      ...docSkill,
      id: 'alg1.linear.two-step',
      prereqs: ['alg1.linear.solve-one-step'],
      instruction: ['alg1.linear.solve-one-step.exp-balance'],
    })
    b.skills[0]!.prereqs = ['alg1.linear.two-step']
    b.skills.push(s2)
    const issues = validateBundle(b)
    expect(issues.some((i) => i.code === 'prereq_cycle')).toBe(true)
  })

  it('release gate: ≥2 vetted explanations with distinct representations', () => {
    const b = goodBundle()
    b.explanations[1]!.representation = 'balance-scale' // same rep as the first
    const issues = validateBundle(b, { profile: 'release' })
    expect(issues.some((i) => i.code === 'explanation_variety' && i.severity === 'error')).toBe(true)
    // authoring profile downgrades to warning
    const authoring = validateBundle(b, { profile: 'authoring' })
    expect(authoring.some((i) => i.code === 'explanation_variety' && i.severity === 'warning')).toBe(true)
  })

  it('stepwise expects: need a confirmation patch, and op expects need a legal move shape', () => {
    const b = goodBundle()
    const tl = b.explanations[0]!.timeline
    // a well-formed op expect on a patch step validates clean
    tl[0]!.expect = { type: 'op', value: 'subtract {b}' }
    const advisory = new Set(['representation_count', 'worked_missing', 'missing_banner', 'form_mismatch'])
    expect(validateBundle(b).filter((i) => !advisory.has(i.code))).toEqual([])
    // a move word outside add/subtract/multiply/divide is an error
    tl[0]!.expect = { type: 'op', value: 'banish {b}' }
    expect(validateBundle(b).some((i) => i.code === 'expect_shape' && i.severity === 'error')).toBe(true)
    // schema-level: an expect step without a patch is unrepresentable
    expect(() =>
      explanationSchema.parse({
        ...b.explanations[0]!,
        timeline: [{ t: 0, caption: 'watch', expect: { type: 'op', value: 'subtract 2' } }],
      }),
    ).toThrow(/needs a patch/)
  })

  it('op answers: value must render to a known move with a numeric operand, and the widget must offer entry', () => {
    const b = goodBundle()
    b.items[1]!.answer = { type: 'op', value: 'subtract {b}' } as (typeof b.items)[number]['answer']
    b.items[1]!.widget = { type: 'balance-scale', config: { left: '{a}{variable} + {b}', right: '{a*3+b}', entry: true } }
    const advisory = new Set(['representation_count', 'worked_missing', 'missing_banner', 'form_mismatch'])
    expect(validateBundle(b).filter((i) => !advisory.has(i.code))).toEqual([])
    // missing the entry answer space is an error, not a silent MC fallback
    b.items[1]!.widget = { type: 'balance-scale', config: { left: 'x', right: '3' } }
    expect(validateBundle(b).some((i) => i.code === 'op_answer' && i.severity === 'error')).toBe(true)
    // an op value that renders to no known move word is an error
    b.items[1]!.widget = { type: 'balance-scale', config: { entry: true } }
    b.items[1]!.answer = { type: 'op', value: 'banish {b}' } as (typeof b.items)[number]['answer']
    expect(validateBundle(b).some((i) => i.code === 'op_answer' && i.severity === 'error')).toBe(true)
  })

  it('release gate: ≥2 generator-backed non-choice check items per skill', () => {
    const b = goodBundle()
    b.items[1]!.generator = null
    const issues = validateBundle(b)
    expect(issues.some((i) => i.code === 'check_items')).toBe(true)
  })

  it('rubric and faded items are not check-eligible', () => {
    const b = goodBundle()
    b.items[1] = itemSchema.parse({
      ...docItem,
      id: 'alg1.linear.solve-one-step.008',
      rubric: { prompt: 'Explain your steps', criteria: ['mentions inverse operation'] },
    })
    const issues = validateBundle(b)
    expect(issues.some((i) => i.code === 'check_items')).toBe(true)
  })

  it('flags templates referencing unknown params', () => {
    const b = goodBundle()
    b.items[0]!.hints.push('What about {mystery}?')
    const issues = validateBundle(b)
    expect(issues.some((i) => i.code === 'unknown_param')).toBe(true)
  })

  it('checks widget.config string templates (e.g. the stem)', () => {
    const b = goodBundle()
    b.items[0]!.widget.config['stem'] = 'Solve: {a}{variable} = {nope}.'
    const issues = validateBundle(b)
    expect(issues.some((i) => i.code === 'unknown_param' && i.where.includes('widget.config.stem'))).toBe(true)
  })

  it('flags generators that fail or whose answer cannot evaluate', () => {
    const b = goodBundle()
    b.items[0]!.generator = { a: { int: [5, 4] } }
    const issues = validateBundle(b)
    expect(issues.some((i) => i.code === 'generator_failed')).toBe(true)
  })

  it('verify: the computed answer must satisfy the item relation (catches wrong answer templates)', () => {
    const b = goodBundle()
    b.items[0]!.verify = '{a * answer == b}' // a·x = b substituted back
    expect(validateBundle(b).filter((i) => i.code === 'verify_failed')).toEqual([])
    // now sabotage the answer template — every current check would pass, verify catches it
    b.items[0]!.answer.value = '{variable} = {a*b}'
    const issues = validateBundle(b)
    expect(issues.some((i) => i.code === 'verify_failed')).toBe(true)
  })

  it('verify referencing unknown params is flagged; `answer` is in scope', () => {
    const b = goodBundle()
    b.items[0]!.verify = '{mystery * answer == b}'
    expect(validateBundle(b).some((i) => i.code === 'unknown_param' && i.where.includes('verify'))).toBe(true)
  })

  it('answer.integer requires integer answers across every generated instance', () => {
    const b = goodBundle()
    b.items[0]!.answer.integer = true
    expect(validateBundle(b).filter((i) => i.code === 'answer_not_integer')).toEqual([])
    // break the divisibility guarantee: b no longer a multiple of a
    b.items[0]!.generator = { a: { int: [2, 12] }, b: { int: [10, 60] } }
    b.items[0]!.params = { a: 4, b: 27, variable: 'x' }
    const issues = validateBundle(b)
    expect(issues.some((i) => i.code === 'answer_not_integer')).toBe(true)
  })

  it('flags duplicate ids across kinds', () => {
    const b = goodBundle()
    b.items[1] = itemSchema.parse({ ...docItem, id: b.items[0]!.id })
    const issues = validateBundle(b)
    expect(issues.some((i) => i.code === 'duplicate_id')).toBe(true)
  })

  it('warns on degenerate BKT defaults (S + G ≥ 1)', () => {
    const b = goodBundle()
    b.skills[0]!.bkt_defaults = { L0: 0.3, T: 0.15, S: 0.6, G: 0.5 }
    const issues = validateBundle(b)
    expect(issues.some((i) => i.code === 'bkt_degenerate' && i.severity === 'warning')).toBe(true)
  })
})

describe('open-expression answers: verify is the alternate form', () => {
  const mk = (answer: string, verify?: string) => ({
    skills: [
      {
        id: 't.open.skill',
        name: 'T',
        prereqs: [],
        bkt_defaults: { L0: 0.3, T: 0.15, S: 0.1, G: 0.2 },
        instruction: ['t.open.skill.exp'],
      },
    ],
    items: [
      {
        id: 't.open.skill.001',
        skills: ['t.open.skill'],
        difficulty: 1,
        params: { a: 3, p: 5, variable: 'n' },
        generator: { a: { int: [2, 9] }, p: { int: [1, 9] } },
        widget: { type: 'expression-input', config: { stem: 'Write it.' } },
        answer: { type: 'expr', value: answer, equivalence: 'symbolic' },
        ...(verify === undefined ? {} : { verify }),
        review: { status: 'vetted' },
      },
      {
        id: 't.open.skill.002',
        skills: ['t.open.skill'],
        difficulty: 2,
        params: { a: 3, p: 5 },
        generator: { a: { int: [2, 9] }, p: { int: [1, 9] } },
        widget: { type: 'numeric-input', config: { stem: 'What is {a}+{p}?' } },
        answer: { type: 'expr', value: '{a+p}' },
        verify: '{answer - p == a}',
        review: { status: 'vetted' },
      },
    ],
    explanations: [
      {
        id: 't.open.skill.exp',
        skill: 't.open.skill',
        representation: 'worked-equation',
        widget: 'worked-equation',
        params_from: 'item',
        timeline: [
          { t: 0, caption: 'Watch.' },
          { t: 2, handoff: { prompt: 'Go.' } },
        ],
        review: { status: 'vetted' },
      },
      {
        id: 't.open.skill.exp2',
        skill: 't.open.skill',
        representation: 'ratio-table',
        widget: 'ratio-table',
        params_from: 'item',
        timeline: [
          { t: 0, caption: 'Watch again.' },
          { t: 2, handoff: { prompt: 'Go.' } },
        ],
        review: { status: 'vetted' },
      },
    ],
  })
  const errorsOf = (b: { skills: unknown[]; items: unknown[]; explanations: unknown[] }) =>
    validateBundle({
      skills: b.skills.map((x) => skillSchema.parse(x)),
      items: b.items.map((x) => itemSchema.parse(x)),
      explanations: b.explanations.map((x) => explanationSchema.parse(x)),
    })
      .filter((i) => i.severity === 'error')
      .map((i) => i.code)

  it('a matching alternate form passes', () => {
    expect(errorsOf(mk('{a}{variable} + {p}', '{p} + {a}*{variable}'))).toEqual([])
  })
  it('a missing verify fails', () => {
    expect(errorsOf(mk('{a}{variable} + {p}'))).toContain('verify_failed')
  })
  it('a NON-equivalent alternate form fails', () => {
    expect(errorsOf(mk('{a}{variable} + {p}', '{p} + {a} + {variable}'))).toContain('verify_failed')
  })
})

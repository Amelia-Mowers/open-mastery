// @vitest-environment node
import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { generateParams, renderTemplate, type Env } from '@openmastery/schema'
import { diagnose, gradeAnswer, gradeItem, exprEquivalent, type AnswerSpec } from '../../src/core/graders'

const expr = (value: string, extra: Partial<AnswerSpec> = {}): AnswerSpec =>
  ({ type: 'expr', value, ...extra }) as AnswerSpec
const numeric = (value: string | number, extra: Partial<AnswerSpec> = {}): AnswerSpec =>
  ({ type: 'numeric', value, ...extra }) as AnswerSpec

const P: Env = { a: 7, b: 21, variable: 'x' }
const v = (spec: AnswerSpec, raw: string | string[], params: Env = P) =>
  gradeAnswer(spec, params, raw).verdict

describe('numeric grader', () => {
  it('exact by default, via exact rationals', () => {
    expect(v(numeric('{b/a}'), '3')).toBe('correct')
    expect(v(numeric('{b/a}'), ' 3.0 ')).toBe('correct')
    expect(v(numeric('{b/a}'), '6/2')).toBe('correct')
    expect(v(numeric('{b/a}'), '4')).toBe('incorrect')
    expect(v(numeric(1.5), '3/2')).toBe('correct')
    expect(v(numeric('{frac(1,3)}'), '0.3333')).toBe('incorrect') // exact means exact
  })
  it('tolerance', () => {
    const spec = numeric(3, { tolerance: 0.01 })
    expect(v(spec, '3.005')).toBe('correct')
    expect(v(spec, '2.99')).toBe('correct')
    expect(v(spec, '3.02')).toBe('incorrect')
  })
  it('units', () => {
    const spec = numeric(12, { units: 'cm' })
    expect(v(spec, '12 cm')).toBe('correct')
    expect(v(spec, '12cm')).toBe('correct')
    expect(v(spec, '12')).toBe('correct')
    expect(v(spec, '12 mm')).toBe('incorrect')
  })
  it('garbage is incorrect, never a throw', () => {
    expect(v(numeric(3), '')).toBe('incorrect')
    expect(v(numeric(3), 'three')).toBe('incorrect')
    expect(v(numeric(3), '1/0')).toBe('incorrect')
  })
})

describe('symbolic expression grader (§5)', () => {
  it("accepts the doc item's answer in every reasonable form", () => {
    const spec = expr('{variable} = {b/a}', { equivalence: 'symbolic' })
    expect(v(spec, 'x = 3')).toBe('correct')
    expect(v(spec, 'x=3')).toBe('correct')
    expect(v(spec, 'X = 3')).toBe('correct') // input is lowercased
    expect(v(spec, '3')).toBe('correct')
    expect(v(spec, '21/7')).toBe('correct')
    expect(v(spec, '3 = x')).toBe('correct') // either orientation
    expect(v(spec, '4')).toBe('incorrect')
    expect(v(spec, 'y = 3')).toBe('incorrect')
    expect(v(spec, 'x = 4')).toBe('incorrect')
    expect(v(spec, '')).toBe('incorrect')
  })
  it('free-variable equivalence: 2*(x+1) ≡ 2*x + 2', () => {
    expect(exprEquivalent('2*(x + 1)', '2*x + 2')).toBe(true)
    expect(exprEquivalent('2*(x + 1)', '2*x + 1')).toBe(false)
    expect(exprEquivalent('(x*x - 1) / (x - 1)', 'x + 1')).toBe(true) // agree where defined
    expect(exprEquivalent('1/x', '1/y')).toBe(false)
  })
  it('exact equivalence compares normalized strings', () => {
    const spec = expr('{variable} = {b/a}', { equivalence: 'exact' })
    expect(v(spec, 'x = 3')).toBe('correct')
    expect(v(spec, '21/7')).toBe('incorrect')
  })
})

describe('set / ordered / choice graders', () => {
  it('set is order-insensitive, ordered is not', () => {
    const set: AnswerSpec = { type: 'set', value: [1, 2, 3] } as AnswerSpec
    const ord: AnswerSpec = { type: 'ordered', value: [1, 2, 3] } as AnswerSpec
    expect(v(set, '3, 1, 2')).toBe('correct')
    expect(v(set, ['3', '1', '2'])).toBe('correct')
    expect(v(set, '3, 1')).toBe('incorrect')
    expect(v(set, '3, 1, 5')).toBe('incorrect')
    expect(v(ord, '1, 2, 3')).toBe('correct')
    expect(v(ord, '3, 1, 2')).toBe('incorrect')
  })
  it('choice matches exactly', () => {
    const spec: AnswerSpec = { type: 'choice', value: 'b' } as AnswerSpec
    expect(v(spec, 'b')).toBe('correct')
    expect(v(spec, 'a')).toBe('incorrect')
  })
  it('op grades the move word exactly and the operand numerically', () => {
    const spec: AnswerSpec = { type: 'op', value: 'subtract {b}' } as AnswerSpec
    expect(v(spec, 'subtract 21')).toBe('correct')
    expect(v(spec, 'subtract 21.0')).toBe('correct') // operand is numeric, not textual
    expect(v(spec, 'subtract 20')).toBe('incorrect')
    expect(v(spec, 'divide 21')).toBe('incorrect') // right operand, wrong move
    expect(v(spec, 'subtract')).toBe('incorrect') // half a move
    expect(v(spec, '')).toBe('incorrect')
    expect(v(spec, 'banish 21')).toBe('incorrect') // unknown op word
    const div: AnswerSpec = { type: 'op', value: 'divide {a}' } as AnswerSpec
    expect(v(div, 'divide 7')).toBe('correct')
    expect(v(div, 'divide 14/2')).toBe('correct')
  })
})

describe('form guards (echo-proofing symbolic equivalence)', () => {
  const item = (form?: 'expanded' | 'combined') => ({
    answer: { type: 'expr' as const, value: '{a}{variable} + {a*b}', equivalence: 'symbolic' as const, ...(form ? { form } : {}) },
    rubric: null,
  })
  const params = { a: 3, b: 2, variable: 'x' }

  it("'expanded' rejects the parenthesized echo but accepts the expansion", () => {
    expect(gradeItem(item('expanded') as never, params, '3(x+2)').verdict).toBe('incorrect')
    expect(gradeItem(item('expanded') as never, params, '3x + 6').verdict).toBe('correct')
    // without the guard, the echo would pass on pure equivalence
    expect(gradeItem(item() as never, params, '3(x+2)').verdict).toBe('correct')
  })

  it("'combined' rejects answers where the variable appears twice", () => {
    const combined = {
      answer: { type: 'expr' as const, value: '{a}{variable} + {b}', equivalence: 'symbolic' as const, form: 'combined' as const },
      rubric: null,
    }
    expect(gradeItem(combined as never, params, '2x + x + 2').verdict).toBe('incorrect')
    expect(gradeItem(combined as never, params, '3x + 2').verdict).toBe('correct')
  })

  it('implicit multiplication in student input parses ("3x", "3(x+2)")', () => {
    expect(gradeItem(item() as never, params, '6 + 3x').verdict).toBe('correct')
  })
})

describe('rubric routing', () => {
  it('rubric items route to the LLM and never grade locally', () => {
    const item = {
      answer: expr('{variable} = {b/a}'),
      rubric: { prompt: 'Explain your steps', criteria: ['names the inverse operation'] },
    }
    expect(gradeItem(item, P, 'x = 3').verdict).toBe('needs_llm')
  })
})

describe('generator ↔ grader contract (§5: total, grader-verified)', () => {
  it('the templated answer is accepted by the grader for every generated isomorph', () => {
    const spec = { a: { int: [2, 12] as [number, number] }, b: { mult_of: 'a', range: [10, 60] as [number, number] } }
    const answer = expr('{variable} = {b/a}', { equivalence: 'symbolic' })
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 5000 }), (seed) => {
        const g = generateParams(spec, { variable: 'x' }, seed)
        expect(g.ok).toBe(true)
        if (!g.ok) return
        const rendered = renderTemplate('{variable} = {b/a}', g.value, { numberStyle: 'fraction' })
        expect(rendered.ok).toBe(true)
        if (!rendered.ok) return
        expect(gradeAnswer(answer, g.value as Env, rendered.value).verdict).toBe('correct')
        expect(gradeAnswer(answer, g.value as Env, '999999').verdict).toBe('incorrect')
      }),
    )
  })
})

describe('diagnosis: named wrong answers (the misconception standard)', () => {
  const MIS = [
    { id: 'added-instead-of-subtracted', when: '{2*p+d}', says: 'That is {p+d} plus {p}.' },
    { id: 'off-by-one', when: '{d+1}', says: 'One too many.' },
  ]
  const P2: Env = { p: 8, d: 13 }

  it('names the error a wrong value matches, and stays silent otherwise', () => {
    // x + 8 = 21 → answer 13; adding instead of subtracting gives 29
    expect(diagnose(MIS, P2, '29')?.id).toBe('added-instead-of-subtracted')
    expect(diagnose(MIS, P2, '29')?.says).toBe('That is 21 plus 8.') // templated
    expect(diagnose(MIS, P2, '14')?.id).toBe('off-by-one')
    expect(diagnose(MIS, P2, '7')).toBeNull() // an unanticipated miss stays generic
    expect(diagnose(MIS, P2, '')).toBeNull()
    expect(diagnose(undefined, P2, '29')).toBeNull()
  })

  it('matches the VALUE, not the spelling — equation shape and arithmetic both', () => {
    expect(diagnose(MIS, P2, 'x = 29')?.id).toBe('added-instead-of-subtracted')
    expect(diagnose(MIS, P2, '21 + 8')?.id).toBe('added-instead-of-subtracted')
  })

  it('MOVE-shaped errors compare as moves (op gates), word and operand', () => {
    const moves = [{ id: 'divided-early', when: 'divide {a}', says: 'Clear the add first.' }]
    const P3: Env = { a: 3, b: 5 }
    expect(diagnose(moves, P3, 'divide 3')?.id).toBe('divided-early')
    expect(diagnose(moves, P3, 'divide 5')).toBeNull() // right word, wrong operand
    expect(diagnose(moves, P3, 'subtract 3')).toBeNull() // wrong word
    expect(diagnose(moves, P3, '3')).toBeNull() // not a move at all
  })
})

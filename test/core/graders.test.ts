// @vitest-environment node
import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { generateParams, renderTemplate, type Env } from '@openmastery/schema'
import { gradeAnswer, gradeItem, exprEquivalent, type AnswerSpec } from '../../src/core/graders'

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

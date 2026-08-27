import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { generateParams, generationOrder, type GeneratorSpec } from '../src/expr/generate.ts'
import { renderTemplate } from '../src/expr/render.ts'

/** the generator from the architecture doc's item example */
const docSpec: GeneratorSpec = {
  a: { int: [2, 12] },
  b: { mult_of: 'a', range: [10, 60] },
}

describe('generator constraints (§4.3a)', () => {
  it('samples satisfy every constraint, for many seeds', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 100_000 }), (seed) => {
        const r = generateParams(docSpec, { variable: 'x' }, seed)
        expect(r.ok).toBe(true)
        if (!r.ok) return
        const { a, b } = r.value as { a: number; b: number }
        expect(a).toBeGreaterThanOrEqual(2)
        expect(a).toBeLessThanOrEqual(12)
        expect(b % a).toBe(0)
        expect(b).toBeGreaterThanOrEqual(10)
        expect(b).toBeLessThanOrEqual(60)
      }),
    )
  })

  it('is deterministic per seed', () => {
    const r1 = generateParams(docSpec, { variable: 'x' }, 42)
    const r2 = generateParams(docSpec, { variable: 'x' }, 42)
    expect(r1).toEqual(r2)
  })

  it('the templated answer always evaluates under generated params (§5: total, grader-verified)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 10_000 }), (seed) => {
        const g = generateParams(docSpec, { variable: 'x' }, seed)
        expect(g.ok).toBe(true)
        if (!g.ok) return
        const rendered = renderTemplate('{variable} = {b/a}', g.value)
        expect(rendered.ok).toBe(true)
      }),
    )
  })

  it('coprime and distinct', () => {
    const spec: GeneratorSpec = {
      a: { int: [2, 12] },
      c: { int: [2, 12], coprime: 'a', distinct: ['a'] },
    }
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 5000 }), (seed) => {
        const r = generateParams(spec, {}, seed)
        expect(r.ok).toBe(true)
        if (!r.ok) return
        const { a, c } = r.value as { a: number; c: number }
        expect(c).not.toBe(a)
        const gcd = (x: number, y: number): number => (y === 0 ? x : gcd(y, x % y))
        expect(gcd(a, c)).toBe(1)
      }),
    )
  })

  it('orders dependencies and rejects cycles', () => {
    const order = generationOrder(docSpec, new Set(['variable']))
    expect(order).toEqual({ ok: true, value: ['a', 'b'] })
    const cyclic: GeneratorSpec = {
      a: { int: [1, 10], mult_of: 'b' },
      b: { int: [1, 10], mult_of: 'a' },
    }
    const r = generationOrder(cyclic, new Set())
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('cycle')
  })

  it('unsatisfiable and malformed constraints are error values, not throws', () => {
    const r1 = generateParams({ a: { int: [5, 4] } }, {}, 1)
    expect(r1.ok).toBe(false)
    if (!r1.ok) expect(r1.error.code).toBe('unsatisfiable')
    const r2 = generateParams({ b: { mult_of: 'a', range: [10, 60] } }, {}, 1)
    expect(r2.ok).toBe(false)
    if (!r2.ok) expect(r2.error.code).toBe('bad_constraint')
    const r3 = generateParams({ b: { mult_of: 'nope', range: [1, 9] } }, { a: 2 }, 1)
    expect(r3.ok).toBe(false)
    if (!r3.ok) expect(r3.error.code).toBe('bad_constraint')
    // multiples of 7 between 8 and 13: none
    const r4 = generateParams({ b: { mult_of: 'a', range: [8, 13] } }, { a: 7 }, 1)
    expect(r4.ok).toBe(false)
    if (!r4.ok) expect(r4.error.code).toBe('unsatisfiable')
  })
})

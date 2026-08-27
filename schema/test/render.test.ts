import { describe, it, expect } from 'vitest'
import { parseTemplate, renderTemplate, templateIdentifiers } from '../src/expr/render.ts'

const render = (tpl: string, env: Record<string, number | string>, opts = {}) => {
  const r = renderTemplate(tpl, env, opts)
  if (!r.ok) throw new Error(r.error.message)
  return r.value
}

describe('cairn-expr templates (§4.3a rendering rules)', () => {
  it('substitutes params and expressions', () => {
    expect(render('Divide both sides by {a}.', { a: 7 })).toBe('Divide both sides by 7.')
    expect(render('{variable} = {b/a}', { a: 7, b: 21, variable: 'x' })).toBe('x = 3')
    expect(render('{a}{variable} = {b}', { a: 7, b: 21, variable: 'x' })).toBe('7x = 21')
  })

  it('rule: 1x → x (and -1x → -x)', () => {
    expect(render('{a}{variable}', { a: 1, variable: 'x' })).toBe('x')
    expect(render('{a}{variable}', { a: -1, variable: 'x' })).toBe('-x')
    expect(render('{a}{variable}', { a: 11, variable: 'x' })).toBe('11x')
    // only applies before an alphabetic continuation
    expect(render('{a} + {b}', { a: 1, b: 2 })).toBe('1 + 2')
  })

  it('rule: sign normalization (+ -3 → - 3)', () => {
    expect(render('x + {c}', { c: -3 })).toBe('x - 3')
    expect(render('x - {c}', { c: -3 })).toBe('x + 3')
    expect(render('x + {c}', { c: 3 })).toBe('x + 3')
    expect(render('x +{c}', { c: -3 })).toBe('x -3')
  })

  it('rule: fraction vs decimal display from the per-item flag', () => {
    const env = { a: 2, b: 3 }
    expect(render('{b/a}', env)).toBe('3/2') // default: fraction
    expect(render('{b/a}', env, { numberStyle: 'fraction' })).toBe('3/2')
    expect(render('{b/a}', env, { numberStyle: 'decimal' })).toBe('1.5')
    expect(render('{-b/a}', env, { numberStyle: 'fraction' })).toBe('-3/2')
  })

  it('is total: errors come back as values', () => {
    const r1 = renderTemplate('{b/a}', { a: 0, b: 1 })
    expect(r1.ok).toBe(false)
    if (!r1.ok) expect(r1.error.code).toBe('div_zero')
    const r2 = renderTemplate('{missing}', {})
    expect(r2.ok).toBe(false)
    if (!r2.ok) expect(r2.error.code).toBe('unknown_var')
    expect(parseTemplate('{a').ok).toBe(false)
    expect(parseTemplate('a}').ok).toBe(false)
    expect(parseTemplate('{}').ok).toBe(false)
  })

  it('collects identifiers for validator cross-checks', () => {
    const segs = parseTemplate('{a}{variable} = {b} and {gcd(a, c) + 1}')
    expect(segs.ok).toBe(true)
    if (!segs.ok) return
    expect([...templateIdentifiers(segs.value)].sort()).toEqual(['a', 'b', 'c', 'variable'])
  })

  it("doc's own hint templates render", () => {
    expect(render('What operation undoes multiplying by {a}?', { a: 7 })).toBe(
      'What operation undoes multiplying by 7?',
    )
    expect(render('{a}x ÷ {a} = {b} ÷ {a}', { a: 7, b: 21 })).toBe('7x ÷ 7 = 21 ÷ 7')
  })
})

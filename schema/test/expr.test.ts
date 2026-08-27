import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { parseExpr, printExpr } from '../src/expr/parse.ts'
import { evaluate, type Env, type Value } from '../src/expr/eval.ts'
import { rat, eq } from '../src/expr/rational.ts'
import type { Expr } from '../src/expr/ast.ts'

const evalOk = (src: string, env: Env = {}): Value => {
  const p = parseExpr(src)
  if (!p.ok) throw new Error(`parse failed: ${p.error.message}`)
  const v = evaluate(p.value, env)
  if (!v.ok) throw new Error(`eval failed: ${v.error.message}`)
  return v.value
}
const evalErr = (src: string, env: Env = {}) => {
  const p = parseExpr(src)
  if (!p.ok) return p.error
  const v = evaluate(p.value, env)
  if (!v.ok) return v.error
  throw new Error(`expected error, got ok`)
}
const num = (v: Value) => {
  if (v.t !== 'num') throw new Error('not a number')
  return v.v
}

describe('cairn-expr parse + eval', () => {
  it('arithmetic with exact rationals and precedence', () => {
    expect(eq(num(evalOk('1 + 2 * 3')), rat(7)!)).toBe(true)
    expect(eq(num(evalOk('(1 + 2) * 3')), rat(9)!)).toBe(true)
    expect(eq(num(evalOk('b / a', { a: 7, b: 21 })), rat(3)!)).toBe(true)
    expect(eq(num(evalOk('1/3 + 1/6')), rat(1, 2)!)).toBe(true)
    expect(eq(num(evalOk('0.1 + 0.2')), rat(3, 10)!)).toBe(true) // exact, not float
    expect(eq(num(evalOk('-a', { a: 4 })), rat(-4)!)).toBe(true)
    expect(eq(num(evalOk('2 - -3')), rat(5)!)).toBe(true)
  })

  it('the fixed function set', () => {
    expect(eq(num(evalOk('frac(3, 4)')), rat(3, 4)!)).toBe(true)
    expect(eq(num(evalOk('gcd(12, 18)')), rat(6)!)).toBe(true)
    expect(eq(num(evalOk('round(5/2)')), rat(3)!)).toBe(true)
    expect(eq(num(evalOk('abs(-7)')), rat(7)!)).toBe(true)
    expect(eq(num(evalOk('min(3, 1, 2)')), rat(1)!)).toBe(true)
    expect(eq(num(evalOk('max(3, 1, 2)')), rat(3)!)).toBe(true)
  })

  it('comparison, non-associative', () => {
    expect(evalOk('a < b', { a: 1, b: 2 })).toEqual({ t: 'bool', v: true })
    expect(evalOk('a == b', { a: 2, b: 2 })).toEqual({ t: 'bool', v: true })
    expect(evalOk('x == y', { x: 'p', y: 'q' })).toEqual({ t: 'bool', v: false })
    expect(evalErr('1 < 2 < 3').code).toBe('syntax')
  })

  it('strings pass through as values but reject arithmetic', () => {
    expect(evalOk('variable', { variable: 'x' })).toEqual({ t: 'str', v: 'x' })
    expect(evalErr('variable + 1', { variable: 'x' }).code).toBe('type_error')
  })

  it('typed errors, never exceptions', () => {
    expect(evalErr('1 / 0').code).toBe('div_zero')
    expect(evalErr('frac(1, 0)').code).toBe('div_zero')
    expect(evalErr('nope', {}).code).toBe('unknown_var')
    expect(evalErr('sin(1)').code).toBe('unknown_fn')
    expect(evalErr('gcd(1)').code).toBe('arity')
    expect(evalErr('gcd(1/2, 3)').code).toBe('not_integer')
    expect(evalErr('1 +').code).toBe('syntax')
    expect(evalErr('(1').code).toBe('syntax')
    expect(evalErr('1 ; 2').code).toBe('syntax')
  })

  it('evaluation is total on arbitrary input (never throws)', () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        const p = parseExpr(s)
        if (p.ok) evaluate(p.value, { a: 1, b: 2 })
      }),
    )
  })

  it('print → parse round-trips evaluation', () => {
    const { arb } = astArb()
    fc.assert(
      fc.property(arb, (ast) => {
        const env: Env = { a: 3, b: 7, c: -2 }
        const printed = printExpr(ast)
        const reparsed = parseExpr(printed)
        expect(reparsed.ok, `reparse of ${printed}`).toBe(true)
        if (!reparsed.ok) return
        const v1 = evaluate(ast, env)
        const v2 = evaluate(reparsed.value, env)
        expect(v2.ok).toBe(v1.ok)
        if (v1.ok && v2.ok) {
          expect(v2.value.t).toBe(v1.value.t)
          if (v1.value.t === 'num' && v2.value.t === 'num')
            expect(eq(v1.value.v, v2.value.v)).toBe(true)
          else expect(v2.value.v).toBe(v1.value.v)
        } else if (!v1.ok && !v2.ok) {
          expect(v2.error.code).toBe(v1.error.code)
        }
      }),
    )
  })
})

function astArb() {
  const leaf: fc.Arbitrary<Expr> = fc.oneof(
    fc.integer({ min: 0, max: 50 }).map((n): Expr => ({ k: 'num', v: rat(n)! })),
    fc.constantFrom('a', 'b', 'c').map((name): Expr => ({ k: 'var', name })),
  )
  const arb = fc.letrec<{ expr: Expr }>((tie) => ({
    expr: fc.oneof(
      { maxDepth: 4, withCrossShrink: true },
      leaf,
      fc
        .record({
          op: fc.constantFrom('+', '-', '*', '/') as fc.Arbitrary<'+' | '-' | '*' | '/'>,
          l: tie('expr'),
          r: tie('expr'),
        })
        .map((r): Expr => ({ k: 'bin', ...r })),
      tie('expr').map((e): Expr => ({ k: 'neg', e })),
      fc
        .record({
          fn: fc.constantFrom('abs', 'round', 'min', 'max'),
          args: fc.array(tie('expr'), { minLength: 1, maxLength: 3 }),
        })
        .map((r): Expr => ({ k: 'call', ...r })),
    ),
  })).expr
  return { arb }
}

describe('parseExprLoose (implicit multiplication in human/rendered notation)', () => {
  it('inserts * for juxtaposition but leaves function calls alone', async () => {
    const { parseExprLoose, insertImplicitMul } = await import('../src/expr/parse.ts')
    expect(insertImplicitMul('3x + 6')).toBe('3*x + 6')
    expect(insertImplicitMul('3(x+2)')).toBe('3*(x+2)')
    expect(insertImplicitMul('(x+1)(x+2)')).toBe('(x+1)*(x+2)')
    expect(insertImplicitMul('abs(x)')).toBe('abs(x)')
    expect(parseExprLoose('3x + 6').ok).toBe(true)
    expect(parseExprLoose('2(n+1) - 4n').ok).toBe(true)
  })
})

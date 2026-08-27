import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import {
  rat,
  add,
  mul,
  sub,
  div,
  neg,
  cmp,
  eq,
  bgcd,
  fromDecimalString,
  toDecimalString,
  toFractionString,
  roundHalfAway,
} from '../src/expr/rational.ts'

const arbRat = fc
  .record({ n: fc.integer({ min: -10_000, max: 10_000 }), d: fc.integer({ min: 1, max: 10_000 }) })
  .map(({ n, d }) => rat(n, d)!)

describe('rational invariants', () => {
  it('is always reduced with positive denominator', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -10_000, max: 10_000 }),
        fc.integer({ min: -10_000, max: 10_000 }).filter((d) => d !== 0),
        (n, d) => {
          const r = rat(n, d)!
          expect(r.d > 0n).toBe(true)
          expect(bgcd(r.n, r.d)).toBe(r.n === 0n ? r.d : 1n)
        },
      ),
    )
  })

  it('rat with zero denominator is null, div by zero is null', () => {
    expect(rat(1, 0)).toBeNull()
    expect(div(rat(1)!, rat(0)!)).toBeNull()
  })

  it('field laws: commutativity, associativity, inverses', () => {
    fc.assert(
      fc.property(arbRat, arbRat, arbRat, (a, b, c) => {
        expect(eq(add(a, b), add(b, a))).toBe(true)
        expect(eq(mul(a, b), mul(b, a))).toBe(true)
        expect(eq(add(add(a, b), c), add(a, add(b, c)))).toBe(true)
        expect(eq(mul(mul(a, b), c), mul(a, mul(b, c)))).toBe(true)
        expect(eq(sub(a, a), rat(0)!)).toBe(true)
        expect(eq(add(a, neg(a)), rat(0)!)).toBe(true)
        if (b.n !== 0n) expect(eq(mul(div(a, b)!, b), a)).toBe(true)
      }),
    )
  })

  it('cmp is a total order consistent with subtraction', () => {
    fc.assert(
      fc.property(arbRat, arbRat, (a, b) => {
        const c = cmp(a, b)
        const d = sub(a, b)
        expect(c).toBe(d.n < 0n ? -1 : d.n > 0n ? 1 : 0)
      }),
    )
  })

  it('decimal round-trip for terminating decimals', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -99_999, max: 99_999 }),
        fc.integer({ min: 0, max: 999_999 }),
        (whole, frac) => {
          const s = `${whole < 0 ? '-' : ''}${Math.abs(whole)}.${String(frac).padStart(6, '0')}`
          const r = fromDecimalString(s)!
          const back = fromDecimalString(toDecimalString(r, 6))!
          expect(eq(r, back)).toBe(true)
        },
      ),
    )
  })

  it('renders exact and rounded decimals', () => {
    expect(toDecimalString(rat(3, 2)!)).toBe('1.5')
    expect(toDecimalString(rat(-3, 2)!)).toBe('-1.5')
    expect(toDecimalString(rat(1, 3)!, 6)).toBe('0.333333')
    expect(toDecimalString(rat(2, 3)!, 6)).toBe('0.666667')
    expect(toDecimalString(rat(9999, 10000)!, 2)).toBe('1')
    expect(toDecimalString(rat(21, 7)!)).toBe('3')
  })

  it('fraction strings', () => {
    expect(toFractionString(rat(21, 7)!)).toBe('3')
    expect(toFractionString(rat(3, 2)!)).toBe('3/2')
    expect(toFractionString(rat(-3, 2)!)).toBe('-3/2')
  })

  it('round half away from zero', () => {
    expect(roundHalfAway(rat(5, 2)!)).toBe(3n) // 2.5 → 3
    expect(roundHalfAway(rat(-5, 2)!)).toBe(-3n) // -2.5 → -3
    expect(roundHalfAway(rat(7, 3)!)).toBe(2n)
    expect(roundHalfAway(rat(0)!)).toBe(0n)
  })
})

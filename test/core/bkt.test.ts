// @vitest-environment node
import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { bktUpdate, gEff, predictCorrect, type BktParams } from '../../src/core/bkt'

const arbP = fc.double({ min: 0.01, max: 0.99, noNaN: true })
const arbParams: fc.Arbitrary<BktParams> = fc.record({
  L0: arbP,
  T: fc.double({ min: 0.01, max: 0.5, noNaN: true }),
  S: fc.double({ min: 0.01, max: 0.4, noNaN: true }),
  G: fc.double({ min: 0.01, max: 0.4, noNaN: true }),
})

describe('BKT with branch-specific assistance discount (§5)', () => {
  it('updates stay in (0, 1)', () => {
    fc.assert(
      fc.property(arbP, arbParams, fc.boolean(), fc.integer({ min: 0, max: 3 }), (p, prm, correct, k) => {
        const p2 = bktUpdate(p, correct, k, prm)
        expect(p2).toBeGreaterThan(0)
        expect(p2).toBeLessThan(1)
      }),
    )
  })

  it('assisted-correct is weaker evidence than unassisted-correct (monotone in hint level)', () => {
    fc.assert(
      fc.property(arbP, arbParams, fc.integer({ min: 0, max: 2 }), (p, prm, k) => {
        const withMore = bktUpdate(p, true, k + 1, prm)
        const withLess = bktUpdate(p, true, k, prm)
        expect(withMore).toBeLessThanOrEqual(withLess + 1e-12)
      }),
    )
  })

  it('assisted-incorrect equals unassisted-incorrect (full negative evidence)', () => {
    fc.assert(
      fc.property(arbP, arbParams, fc.integer({ min: 1, max: 3 }), (p, prm, k) => {
        expect(bktUpdate(p, false, k, prm)).toBe(bktUpdate(p, false, 0, prm))
      }),
    )
  })

  it('incorrect never increases p more than the transit floor; correct unassisted increases p', () => {
    fc.assert(
      fc.property(arbP, arbParams, (p, prm) => {
        // wrong: posterior below p (evidence against), then transit
        const wrong = bktUpdate(p, false, 0, prm)
        const transitOnly = p + (1 - p) * prm.T
        expect(wrong).toBeLessThanOrEqual(transitOnly + 1e-12)
        // unassisted correct beats pure transit when 1−S > G (informative params)
        if (1 - prm.S > prm.G) {
          const right = bktUpdate(p, true, 0, prm)
          expect(right).toBeGreaterThanOrEqual(transitOnly - 1e-12)
        }
      }),
    )
  })

  it('update is monotone in prior p', () => {
    fc.assert(
      fc.property(arbP, arbP, arbParams, fc.boolean(), fc.integer({ min: 0, max: 2 }), (pa, pb, prm, correct, k) => {
        const [lo, hi] = pa < pb ? [pa, pb] : [pb, pa]
        expect(bktUpdate(lo, correct, k, prm)).toBeLessThanOrEqual(bktUpdate(hi, correct, k, prm) + 1e-12)
      }),
    )
  })

  it('gEff: no hints → base G; each level halves the distance to 1', () => {
    expect(gEff(0.2, 0)).toBeCloseTo(0.2)
    expect(gEff(0.2, 1)).toBeCloseTo(0.6)
    expect(gEff(0.2, 2)).toBeCloseTo(0.8)
  })

  it('predictCorrect stays in (0, 1) and is monotone in p', () => {
    fc.assert(
      fc.property(arbP, arbP, arbParams, (pa, pb, prm) => {
        const [lo, hi] = pa < pb ? [pa, pb] : [pb, pa]
        const plo = predictCorrect(lo, prm)
        const phi = predictCorrect(hi, prm)
        expect(plo).toBeGreaterThan(0)
        expect(phi).toBeLessThan(1)
        if (1 - prm.S > prm.G) expect(plo).toBeLessThanOrEqual(phi + 1e-12)
      }),
    )
  })
})

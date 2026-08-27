// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { DAY_MS, fsrsInit, fsrsReview, retrievability } from '../../src/core/fsrs'

describe('FSRS-4.5 scheduler (§5, build step 8)', () => {
  it('a grant schedules the first review about stability-days out', () => {
    const s = fsrsInit('good', 0)
    expect(s.stability).toBeGreaterThan(1)
    // requestRetention 0.9 → interval = stability days exactly
    expect(s.due).toBeCloseTo(s.stability * DAY_MS, 5)
    expect(s.difficulty).toBeGreaterThanOrEqual(1)
    expect(s.difficulty).toBeLessThanOrEqual(10)
  })

  it('retrievability decays with elapsed time', () => {
    const s = fsrsInit('good', 0)
    const r1 = retrievability(1 * DAY_MS, s.stability)
    const r30 = retrievability(30 * DAY_MS, s.stability)
    expect(r1).toBeGreaterThan(r30)
    expect(retrievability(9 * s.stability * DAY_MS, s.stability)).toBeCloseTo(0.5, 10)
  })

  it('successful reviews grow stability: easy > good > hard; a lapse collapses it', () => {
    const t = 5 * DAY_MS
    const base = fsrsInit('good', 0)
    const hard = fsrsReview(base, 'hard', t)
    const good = fsrsReview(base, 'good', t)
    const easy = fsrsReview(base, 'easy', t)
    const again = fsrsReview(base, 'again', t)
    expect(hard.stability).toBeGreaterThan(base.stability)
    expect(good.stability).toBeGreaterThan(hard.stability)
    expect(easy.stability).toBeGreaterThan(good.stability)
    expect(again.stability).toBeLessThan(base.stability)
    expect(good.due).toBeGreaterThan(t)
    // spacing compounds: each on-time good review pushes the next one further
    const second = fsrsReview(good, 'good', good.due)
    expect(second.due - good.due).toBeGreaterThan(good.due - t)
  })

  it('lapses raise difficulty; easy reviews lower it (both stay in 1..10)', () => {
    const base = fsrsInit('good', 0)
    const t = 5 * DAY_MS
    expect(fsrsReview(base, 'again', t).difficulty).toBeGreaterThan(base.difficulty)
    expect(fsrsReview(base, 'easy', t).difficulty).toBeLessThanOrEqual(base.difficulty)
  })
})

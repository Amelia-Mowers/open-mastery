/** Widgets at extremes and edge cases (standing standard — see CLAUDE.md):
 * maximum generator ranges, minimums, negatives, and the player's setup
 * guards that fall back to captions rather than rendering something broken. */
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { act } from 'react'
import { explanationSchema, type Explanation } from '@openmastery/schema'
import { createHangerDiagram } from '../../src/client/viz/hanger-diagram'
import { createTapeDiagram } from '../../src/client/viz/tape-diagram'
import { createEnvelopeModel } from '../../src/client/viz/envelope-model'
import { createAreaModel } from '../../src/client/viz/area-model'
import { createOppositeFlip } from '../../src/client/viz/opposite-flip'
import { createWorkedEquation } from '../../src/client/viz/worked-equation'
import { LessonPlayer } from '../../src/client/app/LessonPlayer'

afterEach(cleanup)

describe('widgets at extremes', () => {
  it('hanger: max generator coefficient (12 copies) and the trivial 1 copy', () => {
    const big = createHangerDiagram()
    const { container } = render(big.render({ copies: 12, shapeLabel: 'x', weight: '60' }, 'lesson'))
    expect(container.querySelectorAll('[data-shape]')).toHaveLength(12)
    cleanup()
    const one = createHangerDiagram()
    const { container: c1 } = render(one.render({ copies: 1, shapeLabel: 'x', weight: '3' }, 'lesson'))
    expect(c1.querySelectorAll('[data-shape]')).toHaveLength(1)
  })

  it('tape: 14 parts still renders every cell; 1 part is fine', () => {
    const w = createTapeDiagram()
    const { container } = render(w.render({ parts: 14, partLabel: '3', total: 'x' }, 'lesson'))
    expect(container.querySelectorAll('[data-part]')).toHaveLength(14)
    cleanup()
    const w1 = createTapeDiagram()
    const { container: c1 } = render(w1.render({ parts: 1, partLabel: 'x', total: 'x' }, 'lesson'))
    expect(c1.querySelectorAll('[data-part]')).toHaveLength(1)
  })

  it('envelopes: 12 envelopes / 72 counters, and negative counters go red', () => {
    const w = createEnvelopeModel()
    const { container } = render(w.render({ envelopes: 12, counters: 72 }, 'lesson'))
    expect(container.querySelectorAll('[data-envelope]')).toHaveLength(12)
    expect(container.querySelectorAll('[data-counter]')).toHaveLength(72)
    cleanup()
    const neg = createEnvelopeModel()
    const { container: cn } = render(neg.render({ envelopes: 3, counters: -12 }, 'lesson'))
    expect(cn.querySelectorAll('[data-counter]')).toHaveLength(12) // magnitude
    expect(cn.textContent).toContain('negatives are red')
  })

  it('area model: four columns and a single column', () => {
    const w = createAreaModel()
    const { container } = render(w.render({ height: '3', parts: ['x', '2', 'y', '5'] }, 'lesson'))
    expect(container.querySelectorAll('[data-cell]')).toHaveLength(4)
    cleanup()
    const w1 = createAreaModel()
    const { container: c1 } = render(w1.render({ height: '3', parts: ['x'] }, 'lesson'))
    expect(c1.querySelectorAll('[data-cell]')).toHaveLength(1)
  })

  it('opposite-flip: extreme magnitudes keep both points inside the axis', () => {
    for (const value of [20, -20, 1]) {
      const w = createOppositeFlip()
      const { container } = render(w.render({ value }, 'lesson'))
      act(() => w.applyPatch({ flip: true }))
      const b = container.querySelector('[data-point-b]')!
      const cx = Number(b.getAttribute('cx'))
      expect(cx).toBeGreaterThan(20)
      expect(cx).toBeLessThan(540)
      cleanup()
    }
  })

  it('balance: long expressions stay inside their tiles (nowrap + clip)', async () => {
    const { createBalanceScale } = await import('../../src/client/viz/balance-scale')
    const w = createBalanceScale()
    const { container } = render(
      <>{w.render({ left: '12x + 345 + 6789', right: '99999' }, 'lesson')}</>,
    )
    const tile = container.querySelector('[data-pan="left"]')! as HTMLElement
    expect(tile.textContent).toBe('12x + 345 + 6789')
    expect(tile.style.whiteSpace).toBe('nowrap')
    expect(tile.style.maxWidth).toBe('32%')
  })

  it('choice: five long options all render and stay selectable', async () => {
    const user = (await import('@testing-library/user-event')).default.setup()
    const { createChoice } = await import('../../src/client/widgets/choice')
    const opts = Array.from({ length: 5 }, (_, i) => ({
      key: `k${i}`,
      label: `Option ${i}: ${'a very long label '.repeat(6)}`,
    }))
    const w = createChoice({ options: opts, seed: 'extreme' })
    const { container } = render(<>{w.render({}, 'problem')}</>)
    expect(container.querySelectorAll('[data-choice]')).toHaveLength(5)
    await user.click(container.querySelector('[data-choice="k3"]')!)
    expect(w.extract()).toEqual({ raw: 'k3' })
  })

  it('worked equation: a long solution keeps every line', () => {
    const w = createWorkedEquation()
    const { container } = render(w.render({ start: 'a = b' }, 'lesson'))
    act(() => {
      for (let i = 0; i < 8; i++) w.applyPatch({ line: `step ${i}` })
    })
    expect(container.querySelectorAll('[data-line]')).toHaveLength(9)
  })
})

describe('player setup guards fall back to captions instead of broken widgets', () => {
  const mk = (widget: string, patch: Record<string, unknown>): Explanation =>
    explanationSchema.parse({
      id: 'alg1.test.exp-guard',
      skill: 'alg1.test.skill',
      representation: widget,
      widget,
      params_from: 'item',
      timeline: [
        { t: 0, patch, caption: 'Only words.' },
        { t: 2, handoff: { prompt: 'Now you try.' } },
      ],
      review: { status: 'vetted' },
    })

  const expectCaptionOnly = (e: Explanation, params: Record<string, number | string>) => {
    render(<LessonPlayer explanation={e} params={params} kind="lesson" onDone={() => {}} />)
    expect(screen.queryByRole('img')).toBeNull()
    expect(screen.getByTestId('lesson-caption')).toHaveTextContent('Only words.')
    cleanup()
  }

  it('rejects out-of-range setups (too many parts/copies, zero flip value, bad templates)', () => {
    expectCaptionOnly(mk('hanger-diagram', { copies: '20', shapeLabel: 'x', weight: '5' }), {})
    expectCaptionOnly(mk('tape-diagram', { parts: '99', partLabel: 'x', total: 'y' }), {})
    expectCaptionOnly(mk('envelope-model', { envelopes: '3', counters: '999' }), {})
    expectCaptionOnly(mk('opposite-flip', { value: '{b}' }), { b: 0 }) // zero has no opposite story
    expectCaptionOnly(mk('number-line', { min: 0, max: '{b}', step: '1' }), { b: 500 }) // >40 ticks
    expectCaptionOnly(mk('opposite-flip', { value: '{missing}' }), {}) // unevaluable template
  })
})

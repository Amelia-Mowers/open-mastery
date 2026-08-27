/** Golden Widget standard (GOLDEN_WIDGET.md) conformance the other suites
 * don't cover: keyboard-only operation, review-mode inertness, staged
 * decomposition entrances, and semantic (not merely numeric) scaffold fit. */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, act, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { itemSchema } from '@openmastery/schema'
import { createOppositeFlip } from '../../src/client/viz/opposite-flip'
import { createTapeDiagram } from '../../src/client/viz/tape-diagram'
import { createBalanceScale } from '../../src/client/viz/balance-scale'
import { createHangerDiagram } from '../../src/client/viz/hanger-diagram'
import { ItemCard } from '../../src/client/app/ItemCard'
import type { NextAction } from '../../src/core/engine'

afterEach(cleanup)

describe('keyboard-only operation (§4)', () => {
  it('opposite-flip: arrows walk the ticks, Home/End jump the ends, extract() follows', async () => {
    const user = userEvent.setup()
    const w = createOppositeFlip({ value: 2 })
    const { container } = render(<>{w.render({ value: 2 }, 'problem')}</>)
    const slider = container.querySelector('[role="slider"]')! as HTMLElement
    slider.focus()
    await user.keyboard('{ArrowLeft}')
    expect(w.extract()).toEqual({ value: -2 })
    await user.keyboard('{Home}')
    expect(w.extract()).toEqual({ value: -4 })
    await user.keyboard('{End}')
    expect(w.extract()).toEqual({ value: 4 })
    expect(slider.getAttribute('aria-valuenow')).toBe('4')
  })
})

describe('clicking the line itself (not only the tick buttons)', () => {
  it('opposite-flip: a click on the number line snaps to the nearest tick', () => {
    const w = createOppositeFlip({ value: 2 })
    const { container } = render(<>{w.render({ value: 2 }, 'problem')}</>)
    const svg = container.querySelector('svg')!
    // jsdom has no layout: give the svg a real box, then click at 3/4 width
    svg.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 560, height: 120, right: 560, bottom: 120, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect
    // ticks map to x = 280 + 50·v here (unit 2, m 4.8): x(2) = 380, x(-4) = 80
    fireEvent.click(svg, { clientX: 370, clientY: 60 })
    expect(w.extract()).toEqual({ value: 2 })
    fireEvent.click(svg, { clientX: 90, clientY: 60 })
    expect(w.extract()).toEqual({ value: -4 })
  })
})

describe('review-mode inertness (§1)', () => {
  it('opposite-flip: no tab stop, no clicks, no keys', async () => {
    const user = userEvent.setup()
    const w = createOppositeFlip({ value: 2 })
    const { container } = render(<>{w.render({ value: 2 }, 'review')}</>)
    const slider = container.querySelector('[role="slider"]')! as HTMLElement
    expect(slider.getAttribute('tabindex')).toBe('-1')
    expect(slider.getAttribute('aria-disabled')).toBe('true')
    await user.click(container.querySelector('[data-tick="-2"]')!)
    slider.focus()
    await user.keyboard('{ArrowLeft}')
    expect(container.querySelector('[data-selected-dot]')).toBeNull()
    expect(w.extract()).toEqual({ value: null })
  })

  it('numeric, expression, and number-line inputs are all inert in review', async () => {
    const user = userEvent.setup()
    const { createNumericInput } = await import('../../src/client/widgets/numeric-input')
    const { createExpressionInput } = await import('../../src/client/widgets/expression-input')
    const { createNumberLine } = await import('../../src/client/widgets/number-line')
    for (const w of [createNumericInput({}), createExpressionInput({})]) {
      const r = render(<>{w.render({} as never, 'review')}</>)
      const input = r.container.querySelector('input')!
      expect(input.disabled).toBe(true)
      cleanup()
    }
    const nl = createNumberLine({ min: -4, max: 4, step: 2 })
    const r = render(<>{nl.render({}, 'review')}</>)
    const slider = r.container.querySelector('[role="slider"]')! as HTMLElement
    expect(slider.getAttribute('tabindex')).toBe('-1')
    await user.click(r.container.querySelector('button')!)
    expect((nl.extract() as { value: number | null }).value).toBeNull()
  })

  it('tape-diagram: the fill boxes are disabled', () => {
    const w = createTapeDiagram({ parts: 4, total: 28, fill: 'part' })
    const { container } = render(<>{w.render({ parts: 4, partLabel: '?', total: '28' }, 'review')}</>)
    const inputs = container.querySelectorAll('input')
    expect(inputs.length).toBeGreaterThan(0)
    for (const el of inputs) expect(el.disabled).toBe(true)
  })
})

describe('staged decomposition entrances (§3)', () => {
  it('balance-scale: pans arrive one at a time via leftIn/rightIn', () => {
    const w = createBalanceScale()
    const { container } = render(<>{w.render({ left: '4x', right: '28' }, 'lesson')}</>)
    act(() => w.applyPatch({ leftIn: false, rightIn: false }))
    expect(container.querySelector('[data-pan]')).toBeNull()
    act(() => w.applyPatch({ leftIn: true }))
    expect(container.querySelector('[data-pan="left"]')).not.toBeNull()
    expect(container.querySelector('[data-pan="right"]')).toBeNull()
    act(() => w.applyPatch({ rightIn: true }))
    expect(container.querySelector('[data-pan="right"]')).not.toBeNull()
  })

  it('hanger-diagram: shapes and weight arrive via shapesIn/weightIn', () => {
    const w = createHangerDiagram()
    const { container } = render(
      <>{w.render({ copies: 4, shapeLabel: 'x', weight: '28' }, 'lesson')}</>,
    )
    act(() => w.applyPatch({ shapesIn: false, weightIn: false }))
    expect(container.querySelector('[data-shape]')).toBeNull()
    expect(container.querySelector('[data-weight]')).toBeNull()
    act(() => w.applyPatch({ shapesIn: true }))
    expect(container.querySelectorAll('[data-shape]')).toHaveLength(4)
    expect(container.querySelector('[data-weight]')).toBeNull()
    act(() => w.applyPatch({ weightIn: true }))
    expect(container.querySelector('[data-weight]')).not.toBeNull()
  })

  it('tape-diagram: the brace total arrives via totalIn', () => {
    const w = createTapeDiagram()
    const { container } = render(<>{w.render({ parts: 4, partLabel: '?', total: '28' }, 'lesson')}</>)
    act(() => w.applyPatch({ totalIn: false }))
    expect(container.querySelector('[data-total]')!.textContent).toBe('')
    act(() => w.applyPatch({ totalIn: true }))
    expect(container.querySelector('[data-total]')!.textContent).toBe('28')
  })
})

// ---- semantic scaffold fit (§2): envelopes mean "a groups of x total b" ----

const mkItem = (id: string, stem: string, left: string, answer: string) =>
  itemSchema.parse({
    id,
    skills: ['prealg.lineq.test'],
    difficulty: 1,
    representation: 'balance-scale',
    params: { a: 5, b: 6, variable: 'n' },
    generator: { a: { int: [2, 9] }, b: { int: [2, 15] } },
    widget: { type: 'equation-input', config: { stem } },
    answer: { type: 'expr', value: answer, equivalence: 'symbolic' },
    viz: { template: 'balance-scale', bind: { left, right: '{b}' } },
    review: { status: 'draft' },
  })

// hash whose leading byte is odd — the rotation branch WOULD pick envelopes
const mkAction = (itemId: string) =>
  ({
    kind: 'serve_item',
    itemKind: 'practice',
    skillId: 'prealg.lineq.test',
    forSkillId: 'prealg.lineq.test',
    instance: { itemId, params: { a: 5, b: 6, variable: 'n' }, paramHash: 'a1feedbeef' },
    scaffolded: true,
  }) as Extract<NextAction, { kind: 'serve_item' }>

function renderCard(item: ReturnType<typeof mkItem>) {
  return render(
    <ItemCard
      action={mkAction(item.id)}
      item={item}
      pointsBefore={0}
      mastery={0.3}
      onSubmit={vi.fn()}
      onContinue={() => {}}
      onStartCheck={() => {}}
      fetchExplanation={vi.fn().mockResolvedValue({ explanation: null, params: {}, skillName: '', totalReps: 0 })}
      onExplained={() => {}}
      showInlineCheckOffer={false}
    />,
  )
}

describe('scaffold picks by the item\'s declared shape, never by numeric fit (§2)', () => {
  it('n/5 = 6 never shows envelopes — 5 envelopes would depict 5n = 6', () => {
    const { container } = renderCard(
      mkItem('t.multiply', 'Solve: {variable}/{a} = {b}.', '{variable}/{a}', '{variable} = {a*b}'),
    )
    expect(container.querySelector('[data-envelope]')).toBeNull()
    expect(container.querySelector('[aria-label^="Balance scale"]')).not.toBeNull()
  })

  it('5n = 6 (the ax = b shape) may rotate to envelopes', () => {
    const { container } = renderCard(
      mkItem('t.divide', 'Solve: {a}{variable} = {b}.', '{a}{variable}', '{variable} = {b/a}'),
    )
    expect(container.querySelectorAll('[data-envelope]')).toHaveLength(5)
  })
})

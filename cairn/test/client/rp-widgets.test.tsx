/** The RP-slab widgets (double-number-line, ratio-table) against the Golden
 * Widget standard: trinity roles, patch walk, extract, review inertness,
 * staged/reveal entrances, and player setup guards. */
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createDoubleNumberLine } from '../../src/client/viz/double-number-line'
import { createRatioTable } from '../../src/client/viz/ratio-table'

afterEach(cleanup)

const DNL = { topLabel: 'pounds', bottomLabel: 'dollars', top: ['0', '3', '6', '9'], bottom: ['0', '12', '24', '36'] }

describe('double-number-line', () => {
  it('lesson: reveal walks pairs in, highlight emphasizes a tick, lines stage in', () => {
    const w = createDoubleNumberLine()
    const { container } = render(<>{w.render(DNL, 'lesson')}</>)
    // staged decomposition: one line at a time
    act(() => w.applyPatch({ topIn: false, bottomIn: false }))
    expect(container.querySelector('[data-line]')).toBeNull()
    act(() => w.applyPatch({ topIn: true }))
    expect(container.querySelector('[data-line="top"]')).not.toBeNull()
    expect(container.querySelector('[data-line="bottom"]')).toBeNull()
    act(() => w.applyPatch({ bottomIn: true, reveal: [0, 3] }))
    // 4 ticks per line but only the first 2 values visible
    const visible = [...container.querySelectorAll('[data-value="top"]')].filter(
      (el) => (el as HTMLElement).style.opacity !== '0',
    )
    expect(visible).toHaveLength(2)
    act(() => w.applyPatch({ reveal: null, highlight: 3 }))
    expect(container.querySelectorAll('[data-value][data-highlighted]')).toHaveLength(2) // top + bottom of the pair
  })

  it('problem: the ? cell is an input; typing feeds extract(); review is inert', async () => {
    const user = userEvent.setup()
    const w = createDoubleNumberLine({
      topLabel: 'pounds',
      bottomLabel: 'dollars',
      top: [0, 3, 7],
      bottom: [0, 12, '?'],
    })
    const { container } = render(<>{w.render({} as never, 'problem')}</>)
    const input = container.querySelector('input')!
    await user.type(input, '28')
    expect(w.extract()).toEqual({ raw: '28', value: 28 })
    cleanup()
    const r = render(<>{w.render({} as never, 'review')}</>)
    expect(r.container.querySelector('input')!.disabled).toBe(true)
  })
})

const RT = { cols: ['cups', 'muffins'], rows: [['2', '12'], ['4', '24'], ['6', '36']] }

describe('ratio-table', () => {
  it('lesson: rows reveal, highlight marks a row, the ×k factor arrow appears', () => {
    const w = createRatioTable()
    const { container } = render(<>{w.render(RT, 'lesson')}</>)
    act(() => w.applyPatch({ reveal: 1 }))
    const shown = [...container.querySelectorAll('[data-row]')].filter(
      (el) => (el as HTMLElement).style.opacity !== '0',
    )
    expect(shown).toHaveLength(1)
    act(() => w.applyPatch({ reveal: 3, highlight: 2, factor: { from: 1, to: 2, text: '×2' } }))
    expect(container.querySelector('[data-row][data-highlighted]')).not.toBeNull()
    expect(container.querySelector('[data-factor]')!.textContent).toBe('×2')
    act(() => w.applyPatch({ factor: null }))
    expect(container.querySelector('[data-factor]')).toBeNull()
  })

  it('problem: fill the ? cell; review is inert', async () => {
    const user = userEvent.setup()
    const w = createRatioTable({ cols: ['cups', 'muffins'], rows: [[2, 12], [5, '?']] })
    const { container } = render(<>{w.render({} as never, 'problem')}</>)
    await user.type(container.querySelector('input')!, '30')
    expect(w.extract()).toEqual({ raw: '30', value: 30 })
    cleanup()
    const r = render(<>{w.render({} as never, 'review')}</>)
    expect(r.container.querySelector('input')!.disabled).toBe(true)
  })

  it('row-select: click the breaking row (or the none chip); review inert', async () => {
    const user = userEvent.setup()
    const w = createRatioTable({
      select: true,
      noneLabel: 'All rows agree',
      cols: ['x', 'y'],
      rows: [[2, 6], [5, 17], [8, 24]],
    })
    const { container } = render(<>{w.render({} as never, 'problem')}</>)
    expect(w.extract()).toEqual({ raw: '', value: null })
    await user.click(container.querySelector('[data-select-row="2"]')!)
    expect(w.extract()).toEqual({ raw: '2', value: 2 })
    await user.click(container.querySelector('[data-select-none]')!)
    expect(w.extract()).toEqual({ raw: '0', value: 0 })
    cleanup()
    const w2 = createRatioTable({ select: true, cols: ['x', 'y'], rows: [[2, 6], [5, 15]] })
    const r = render(<>{w2.render({} as never, 'review')}</>)
    await user.click(r.container.querySelector('[data-select-row="1"]')!)
    expect(w2.extract()).toEqual({ raw: '', value: null })
  })

  it('row-select: arrows walk rows then the none-chip from a single tab stop', async () => {
    const user = userEvent.setup()
    const w = createRatioTable({
      select: true,
      noneLabel: 'All rows agree',
      cols: ['x', 'y'],
      rows: [[2, 6], [5, 17]],
    })
    const { container } = render(<>{w.render({} as never, 'problem')}</>)
    const group = container.querySelector('[role="radiogroup"]')! as HTMLElement
    expect(group.getAttribute('aria-label')).toContain('All rows agree')
    group.focus()
    await user.keyboard('{ArrowDown}')
    expect(w.extract()).toEqual({ raw: '1', value: 1 })
    await user.keyboard('{ArrowDown}{ArrowDown}')
    expect(w.extract()).toEqual({ raw: '0', value: 0 }) // the none-chip
    await user.keyboard('{ArrowDown}')
    expect(w.extract()).toEqual({ raw: '1', value: 1 }) // wraps
  })

  it('extremes: 6 rows renders every row; long values stay in their cells', () => {
    const w = createRatioTable()
    const rows = Array.from({ length: 6 }, (_, i) => [String((i + 1) * 123), String((i + 1) * 45678)])
    const { container } = render(<>{w.render({ cols: ['servings', 'milliliters of concentrate'], rows }, 'lesson')}</>)
    expect(container.querySelectorAll('[data-row]')).toHaveLength(6)
    expect(container.textContent).toContain('274068')
  })

  it('extremes: 8 tick pairs render; 2 is the floor', () => {
    const w8 = createDoubleNumberLine()
    const eight = Array.from({ length: 8 }, (_, i) => String(i * 7))
    const r8 = render(<>{w8.render({ topLabel: 'a', bottomLabel: 'b', top: eight, bottom: eight }, 'lesson')}</>)
    expect(r8.container.querySelectorAll('[data-value="top"]')).toHaveLength(8)
    cleanup()
    const w2 = createDoubleNumberLine()
    const r2 = render(<>{w2.render({ topLabel: 'a', bottomLabel: 'b', top: ['0', '1'], bottom: ['0', '4'] }, 'lesson')}</>)
    expect(r2.container.querySelectorAll('[data-value="bottom"]')).toHaveLength(2)
  })
})

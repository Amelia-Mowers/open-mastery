/** The line WALKS: jumps are drawn as arcs with their size above, and ticks
 * stay unlabelled until reached — a line whose axis spans the answer prints
 * the answer before the student has done anything. */
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { createNumberLine } from '../../src/client/widgets/number-line'

afterEach(cleanup)

describe('number line: jumps are shown, answers are not', () => {
  it('labels only what has been reached, and draws an arc per jump', () => {
    const w = createNumberLine({ min: 0, max: 20, step: 4 })
    const view = () => <>{w.render({}, 'lesson')}</>
    const { container, rerender } = render(view())
    const labels = () =>
      [...container.querySelectorAll('[data-tick]')].map((el) => el.textContent)

    // before anything: every tick is bare — 20 (the answer) is NOT on screen
    w.applyPatch({ labelled: [] })
    rerender(view())
    expect(labels().every((t) => t === '')).toBe(true)

    // the start is named
    w.applyPatch({ labelled: [8], marker: 8 })
    rerender(view())
    expect(labels().filter((t) => t !== '')).toEqual(['8'])

    // a jump: an arc from 8 to 12 carrying its size, and 12 now shows
    w.applyPatch({ arcs: [{ from: 8, to: 12, label: '+4' }], marker: 12, labelled: [8, 12] })
    rerender(view())
    const arc = container.querySelector('[data-arc="8-12"]') as SVGPathElement
    expect(arc).toBeTruthy()
    // the arc springs from tick CENTRES — ticks sit at (i+0.5)/n across the
    // row, so an arc anchored at i/(n-1) hangs off the ends of the line
    const d = arc.getAttribute('d') ?? ''
    const [x1, x2] = [...d.matchAll(/M ([\d.]+)|([\d.]+) 24$/g)].map((m) => Number(m[1] ?? m[2]))
    expect(x1).toBeCloseTo(((2 + 0.5) / 6) * 100, 1) // tick 8 of 0,4,8,12,16,20
    expect(x2).toBeCloseTo(((3 + 0.5) / 6) * 100, 1) // tick 12
    expect(container.querySelector('[data-arc-label]')?.textContent).toBe('+4')
    expect(labels().filter((t) => t !== '').sort()).toEqual(['12', '8'])
    // and the endpoint 20 is still hidden
    expect(labels()).not.toContain('20')
  })
})

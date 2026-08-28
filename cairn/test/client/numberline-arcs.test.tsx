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
    expect(container.querySelector('[data-arc="8-12"]')).toBeTruthy()
    expect(container.querySelector('[data-arc-label]')?.textContent).toBe('+4')
    expect(labels().filter((t) => t !== '').sort()).toEqual(['12', '8'])
    // and the endpoint 20 is still hidden
    expect(labels()).not.toContain('20')
  })
})

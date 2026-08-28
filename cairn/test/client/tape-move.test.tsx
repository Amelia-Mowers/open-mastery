/** A step that asks for a move must SHOW the move: the removed section
 * collapses (flex 0) and the total carries the operation badge, so the bar
 * visibly gets shorter instead of the answer being asserted in prose. */
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { createTapeDiagram } from '../../src/client/viz/tape-diagram'

afterEach(cleanup)

describe('tape: a move changes the bar', () => {
  it('a removed section collapses and the total shows the operation', () => {
    const w = createTapeDiagram()
    const { container, rerender } = render(
      <>{w.render({ parts: 2, partLabel: '', total: '21', cells: ['x', '8'] }, 'lesson')}</>,
    )
    const cells = () => [...container.querySelectorAll('[data-part]')] as HTMLElement[]
    expect(cells()).toHaveLength(2)
    expect(cells()[1]!.getAttribute('data-removed')).toBeNull()
    expect(container.querySelector('[data-total-op]')).toBeNull()

    w.applyPatch({ removed: [2], totalOp: { op: 'subtract', by: '8' } })
    rerender(<>{w.render({ parts: 2, partLabel: '', total: '21', cells: ['x', '8'] }, 'lesson')}</>)

    const gone = cells()[1]!
    expect(gone.getAttribute('data-removed')).toBe('true')
    // the section collapses to nothing — the bar is genuinely shorter
    expect(gone.style.flex).toBe('0 0 0px')
    expect(gone.style.opacity).toBe('0')
    // …and the move is named on the total, like the balance's op badge
    expect(container.querySelector('[data-total-op]')?.textContent).toContain('8')
    expect(container.querySelector('[data-total-op]')?.textContent).toContain('−')
    // the surviving section is untouched
    expect(cells()[0]!.getAttribute('data-removed')).toBeNull()
    expect(cells()[0]!.style.opacity).toBe('')
  })
})

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { act } from 'react'
import { createBalanceScale } from '../src/client/viz/balance-scale'

describe('balance-scale viz template', () => {
  it('renders both pans from params', () => {
    const w = createBalanceScale()
    render(w.render({ left: '7x', right: '21' }, 'lesson'))
    expect(screen.getByText('7x')).toBeInTheDocument()
    expect(screen.getByText('21')).toBeInTheDocument()
  })

  it('has img role and a descriptive label', () => {
    const w = createBalanceScale()
    expect(w.a11y.role).toBe('img')
    expect(w.a11y.label({ left: '7x', right: '21' })).toContain('7x')
    render(w.render({ left: '7x', right: '21' }, 'lesson'))
    expect(screen.getByRole('img')).toHaveAttribute('aria-label', w.a11y.label({ left: '7x', right: '21' }))
  })

  it('walks the §4.3 explanation timeline via applyPatch', () => {
    const w = createBalanceScale()
    const { container } = render(w.render({ left: '7x', right: '21' }, 'lesson'))

    // t=0: initial patch + caption
    act(() => {
      w.applyPatch({ left: '7x', right: '21', caption: 'Both sides are balanced.' })
    })
    expect(screen.getByText('Both sides are balanced.')).toBeInTheDocument()

    // t=2.5: highlight the left coefficient
    act(() => {
      w.applyPatch({ highlight: 'left.coef', caption: 'x is multiplied by 7. Undo it by dividing.' })
    })
    expect(container.querySelector('[data-pan="left"]')).toHaveAttribute('data-highlighted')
    expect(container.querySelector('[data-pan="right"]')).not.toHaveAttribute('data-highlighted')

    // t=5: divide both sides
    act(() => {
      w.applyPatch({ op: { op: 'divide', by: '7' }, caption: 'Divide both sides by 7.' })
    })
    expect(container.querySelector('[data-op-badge="left"]')).toHaveTextContent('÷ 7')
    expect(container.querySelector('[data-op-badge="right"]')).toHaveTextContent('÷ 7')

    // t=7.5: resolve
    act(() => {
      w.applyPatch({ left: 'x', right: '3', op: null, highlight: null, caption: 'x = 3.' })
    })
    expect(screen.getByText('x')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(container.querySelector('[data-op-badge="left"]')).toBeNull()
    expect(container.querySelector('[data-pan="left"]')).not.toHaveAttribute('data-highlighted')
    expect(screen.getByText('x = 3.')).toBeInTheDocument()
  })

  it('extract() is null (viz templates carry no answer)', () => {
    const w = createBalanceScale()
    expect(w.extract()).toBeNull()
  })

  it('patches land in the trace with increasing seq', () => {
    const w = createBalanceScale()
    render(w.render({ left: '2x', right: '8' }, 'lesson'))
    act(() => {
      w.applyPatch({ caption: 'a' })
      w.applyPatch({ caption: 'b' })
    })
    const t = w.trace()
    expect(t.filter((e) => e.type === 'patch')).toHaveLength(2)
    expect(t.map((e) => e.seq)).toEqual([1, 2])
  })
})

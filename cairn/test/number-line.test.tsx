import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { act } from 'react'
import { createNumberLine } from '../src/client/widgets/number-line'

const config = { min: 0, max: 10, step: 1 }

describe('number-line widget', () => {
  it('renders ticks from config', () => {
    const w = createNumberLine(config)
    render(w.render({ prompt: 'Find 7.' }, 'problem'))
    expect(screen.getByText('Find 7.')).toBeInTheDocument()
    for (const t of [0, 5, 10]) {
      expect(screen.getByText(String(t))).toBeInTheDocument()
    }
  })

  it('clicking a tick selects it; extract() returns the value', async () => {
    const user = userEvent.setup()
    const w = createNumberLine(config)
    render(w.render({}, 'problem'))
    expect(w.extract()).toEqual({ value: null })
    await user.click(screen.getByText('7'))
    expect(w.extract()).toEqual({ value: 7 })
  })

  it('is fully keyboard operable: arrows, Home, End', async () => {
    const user = userEvent.setup()
    const w = createNumberLine(config)
    render(w.render({}, 'problem'))
    await user.tab()
    const slider = screen.getByRole('slider')
    expect(slider).toHaveFocus()
    await user.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}')
    expect(w.extract().value).toBe(3)
    await user.keyboard('{ArrowLeft}')
    expect(w.extract().value).toBe(2)
    await user.keyboard('{End}')
    expect(w.extract().value).toBe(10)
    await user.keyboard('{ArrowRight}') // clamped at max
    expect(w.extract().value).toBe(10)
    await user.keyboard('{Home}')
    expect(w.extract().value).toBe(0)
    await user.keyboard('{ArrowLeft}') // clamped at min
    expect(w.extract().value).toBe(0)
  })

  it('exposes slider a11y semantics', async () => {
    const user = userEvent.setup()
    const w = createNumberLine(config)
    expect(w.a11y.role).toBe('slider')
    render(w.render({ prompt: 'P' }, 'problem'))
    const slider = screen.getByRole('slider')
    expect(slider).toHaveAttribute('aria-label', w.a11y.label({ prompt: 'P' }))
    expect(slider).toHaveAttribute('aria-valuemin', '0')
    expect(slider).toHaveAttribute('aria-valuemax', '10')
    await user.click(screen.getByText('4'))
    expect(slider).toHaveAttribute('aria-valuenow', '4')
  })

  it('applyPatch highlights ticks and places a marker', () => {
    const w = createNumberLine(config)
    const { container } = render(w.render({}, 'lesson'))
    act(() => {
      w.applyPatch({ highlight: [2, 4], marker: 4 })
    })
    const highlighted = [...container.querySelectorAll('[data-highlighted]')].map((el) =>
      el.getAttribute('data-tick'),
    )
    expect(highlighted).toEqual(['2', '4'])
    expect(container.querySelector('[data-marked]')?.getAttribute('data-tick')).toBe('4')
    act(() => {
      w.applyPatch({ highlight: [], marker: null })
    })
    expect(container.querySelector('[data-highlighted]')).toBeNull()
    expect(container.querySelector('[data-marked]')).toBeNull()
  })

  it('review mode disables interaction', async () => {
    const user = userEvent.setup()
    const w = createNumberLine(config)
    render(w.render({}, 'review'))
    const slider = screen.getByRole('slider')
    expect(slider).toHaveAttribute('aria-disabled', 'true')
    expect(slider).toHaveAttribute('tabindex', '-1')
    await user.click(screen.getByText('3'))
    expect(w.extract().value).toBeNull()
  })

  it('interactions and patches land in the trace with increasing seq', async () => {
    const user = userEvent.setup()
    const w = createNumberLine(config)
    render(w.render({}, 'problem'))
    await user.click(screen.getByText('3'))
    act(() => {
      w.applyPatch({ marker: 3 })
    })
    const t = w.trace()
    expect(t.some((e) => e.type === 'click')).toBe(true)
    expect(t.some((e) => e.type === 'patch')).toBe(true)
    const seqs = t.map((e) => e.seq)
    expect(seqs).toEqual([...seqs].sort((a, b) => a - b))
  })
})

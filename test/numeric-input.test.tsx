import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createNumericInput, parseNumeric } from '../src/client/widgets/numeric-input'

describe('numeric-input widget', () => {
  it('renders from params with prompt and units', () => {
    const w = createNumericInput({ units: 'cm', placeholder: '?' })
    render(w.render({ prompt: 'How long is the segment?' }, 'problem'))
    expect(screen.getByText('How long is the segment?')).toBeInTheDocument()
    expect(screen.getByText('cm')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('?')).toBeInTheDocument()
  })

  it('extract() returns raw and parsed value after typing', async () => {
    const user = userEvent.setup()
    const w = createNumericInput({})
    render(w.render({}, 'problem'))
    await user.type(screen.getByRole('textbox'), '3.5')
    expect(w.extract()).toEqual({ raw: '3.5', value: 3.5 })
  })

  it('parses integers, decimals, fractions; null otherwise', () => {
    expect(parseNumeric('42')).toBe(42)
    expect(parseNumeric('-7')).toBe(-7)
    expect(parseNumeric('3.25')).toBe(3.25)
    expect(parseNumeric(' 3/4 ')).toBe(0.75)
    expect(parseNumeric('-3/4')).toBe(-0.75)
    expect(parseNumeric('1/0')).toBeNull()
    expect(parseNumeric('')).toBeNull()
    expect(parseNumeric('abc')).toBeNull()
    expect(parseNumeric('1+2')).toBeNull()
  })

  it('has a11y role and label; input carries the aria-label', () => {
    const w = createNumericInput({})
    expect(w.a11y.role).toBe('textbox')
    expect(w.a11y.label({ prompt: 'Q1' })).toContain('Q1')
    render(w.render({ prompt: 'Q1' }, 'problem'))
    expect(screen.getByLabelText(w.a11y.label({ prompt: 'Q1' }))).toBeInTheDocument()
  })

  it('is keyboard reachable and usable without mouse', async () => {
    const user = userEvent.setup()
    const w = createNumericInput({})
    render(w.render({}, 'problem'))
    await user.tab()
    expect(screen.getByRole('textbox')).toHaveFocus()
    await user.keyboard('12')
    expect(w.extract().value).toBe(12)
  })

  it('review mode disables the input', () => {
    const w = createNumericInput({})
    render(w.render({}, 'review'))
    const input = screen.getByLabelText('Numeric answer')
    expect(input).toBeDisabled()
    expect(input).toHaveAttribute('aria-disabled', 'true')
  })

  it('interactions produce trace events with increasing seq', async () => {
    const user = userEvent.setup()
    const w = createNumericInput({})
    render(w.render({}, 'problem'))
    await user.type(screen.getByRole('textbox'), '12')
    const t = w.trace()
    expect(t.length).toBeGreaterThan(0)
    expect(t.map((e) => e.seq)).toEqual([...t.map((e) => e.seq)].sort((a, b) => a - b))
    expect(new Set(t.map((e) => e.seq)).size).toBe(t.length)
    expect(t.some((e) => e.type === 'input')).toBe(true)
  })
})

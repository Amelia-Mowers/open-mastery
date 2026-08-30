import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createExpressionInput, normalizeExpression } from '../src/client/widgets/expression-input'

describe('expression-input widget', () => {
  it('renders from params', () => {
    const w = createExpressionInput({ variable: 'x', placeholder: 'x = ?' })
    render(w.render({ prompt: 'Solve for x.' }, 'problem'))
    expect(screen.getByText('Solve for x.')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('x = ?')).toBeInTheDocument()
  })

  it('shows NO placeholder unless one is configured — a bare-expression answer must not see "x = ?"', () => {
    const w = createExpressionInput({ variable: 'x' })
    render(w.render({ prompt: 'Expand.' }, 'problem'))
    expect(screen.getByRole('textbox')).not.toHaveAttribute('placeholder')
  })

  it('extract() returns raw and normalized after typing', async () => {
    const user = userEvent.setup()
    const w = createExpressionInput({ variable: 'x' })
    render(w.render({}, 'problem'))
    await user.type(screen.getByRole('textbox'), 'X = 3')
    expect(w.extract()).toEqual({ raw: 'X = 3', normalized: '3' })
  })

  it('normalization lowercases, strips whitespace, strips leading var=', () => {
    expect(normalizeExpression('x = 3', 'x')).toBe('3')
    expect(normalizeExpression('X=3/7', 'x')).toBe('3/7')
    expect(normalizeExpression('2 X + 1', 'x')).toBe('2x+1')
    expect(normalizeExpression('y = 3', 'x')).toBe('y=3')
    expect(normalizeExpression('x = 3')).toBe('x=3')
  })

  it('does not grade — answer is structural only', async () => {
    const user = userEvent.setup()
    const w = createExpressionInput({ variable: 'x' })
    render(w.render({}, 'problem'))
    await user.type(screen.getByRole('textbox'), 'definitely wrong')
    expect(w.extract().normalized).toBe('definitelywrong')
  })

  it('has a11y role and label', () => {
    const w = createExpressionInput({})
    expect(w.a11y.role).toBe('textbox')
    render(w.render({ prompt: 'P' }, 'problem'))
    expect(screen.getByLabelText(w.a11y.label({ prompt: 'P' }))).toBeInTheDocument()
  })

  it('keyboard-only operation', async () => {
    const user = userEvent.setup()
    const w = createExpressionInput({ variable: 'x' })
    render(w.render({}, 'problem'))
    await user.tab()
    expect(screen.getByRole('textbox')).toHaveFocus()
    await user.keyboard('x=5')
    expect(w.extract().normalized).toBe('5')
  })

  it('review mode disables the input', () => {
    const w = createExpressionInput({})
    render(w.render({}, 'review'))
    const input = screen.getByLabelText('Expression answer')
    expect(input).toBeDisabled()
    expect(input).toHaveAttribute('aria-disabled', 'true')
  })

  it('trace has increasing seq', async () => {
    const user = userEvent.setup()
    const w = createExpressionInput({})
    render(w.render({}, 'problem'))
    await user.type(screen.getByRole('textbox'), 'ab')
    const seqs = w.trace().map((e) => e.seq)
    expect(seqs.length).toBeGreaterThan(1)
    expect(seqs).toEqual([...seqs].sort((a, b) => a - b))
  })
})

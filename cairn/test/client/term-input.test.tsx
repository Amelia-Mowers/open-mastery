// @vitest-environment jsdom
/** Structured [ ]x + [ ] answer space — scaffolds the easier tiers of an
 * expression skill so a student is graded on the MATHEMATICS, not on
 * whether they typed "6x" rather than "6*x". The ceiling stays raw.
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createWidget } from '../../src/client/widgets/registry'
import { assembleTerm } from '../../src/client/widgets/term-input'
import { gradeAnswer } from '../../src/core/graders'

describe('term input', () => {
  it('assembles an ordinary expression, so the SAME key grades both inputs', () => {
    expect(assembleTerm('6', '+', '15', 'x')).toBe('6x + 15')
    expect(assembleTerm('6', '-', '15', 'x')).toBe('6x - 15')
    // and what it produces really is accepted by the item's own key
    const v = gradeAnswer(
      { type: 'expr', value: '{a*b}{variable} + {a*c}', form: 'expanded' } as never,
      { a: 3, b: 2, c: 5, variable: 'x' } as never,
      assembleTerm('6', '+', '15', 'x'),
    )
    expect(v.verdict).toBe('correct')
  })

  it('an unfinished answer stays EMPTY rather than defaulting', () => {
    // no silent "+" and no implied 0 — a half-filled answer must read as
    // incomplete, not as a confident wrong one
    expect(assembleTerm('6', null, '15', 'x')).toBe('')
    expect(assembleTerm('', '+', '15', 'x')).toBe('')
    expect(assembleTerm('6', '+', '', 'x')).toBe('')
  })

  it('the SIGN is chosen by the student, not printed for them', async () => {
    const user = userEvent.setup()
    const w = createWidget('term-input', { variable: 'x' })
    render(<>{w.render({} as never, 'problem')}</>)
    // both signs are offered; neither is pre-selected
    const plus = screen.getByRole('button', { name: 'plus' })
    const minus = screen.getByRole('button', { name: 'minus' })
    expect(plus.getAttribute('aria-pressed')).toBe('false')
    expect(minus.getAttribute('aria-pressed')).toBe('false')

    await user.type(screen.getByLabelText(/number multiplying x/i), '6')
    await user.click(minus)
    await user.type(screen.getByLabelText(/the plain number/i), '15')
    expect((w.extract() as { raw: string }).raw).toBe('6x - 15')
  })

  it('is inert in review mode', () => {
    const w = createWidget('term-input', { variable: 'x' })
    render(<>{w.render({} as never, 'review')}</>)
    expect((screen.getByLabelText(/number multiplying x/i) as HTMLInputElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'plus' }) as HTMLButtonElement).disabled).toBe(true)
  })
})

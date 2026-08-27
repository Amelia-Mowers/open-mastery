/** The formerly display-only widgets hold their input roles as CONSTRUCTED
 * responses (GOLDEN §1) — the student enters the move's symbol AND operand
 * (mirrored live on both sides of the model), or writes the next line;
 * nothing is offered as a ready-made answer. */
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createBalanceScale } from '../../src/client/viz/balance-scale'
import { createHangerDiagram } from '../../src/client/viz/hanger-diagram'
import { createWorkedEquation } from '../../src/client/viz/worked-equation'
import { createEnvelopeModel } from '../../src/client/viz/envelope-model'
import { createAreaModel } from '../../src/client/viz/area-model'

afterEach(cleanup)

describe('op-entry inputs (balance, hanger)', () => {
  it('symbol + operand build the move; both sides mirror it; extract is the grader shape', async () => {
    const user = userEvent.setup()
    for (const make of [
      () => createBalanceScale({ left: '4x + 5', right: '33', entry: true }),
      () => createHangerDiagram({ copies: 4, shapeLabel: 'x', weight: '28', entry: true }),
    ]) {
      const w = make()
      const { container } = render(<>{w.render({} as never, 'problem')}</>)
      expect(w.extract()).toEqual({ raw: '' })
      // half-entered moves stay incomplete
      await user.click(container.querySelector('[data-op-sym="subtract"]')!)
      expect(w.extract()).toEqual({ raw: '' })
      expect(container.querySelector('[data-op-badge="left"]')).toBeNull()
      await user.type(container.querySelector('[data-op-by]')!, '5')
      expect(w.extract()).toEqual({ raw: 'subtract 5' })
      // the entered move is REFLECTED under both sides
      expect(container.querySelector('[data-op-badge="left"]')!.textContent).toContain('5')
      expect(container.querySelector('[data-op-badge="right"]')!.textContent).toContain('5')
      // arrow keys cycle the symbol from the single tab stop
      const group = container.querySelector('[role="radiogroup"]')! as HTMLElement
      group.focus()
      await user.keyboard('{ArrowRight}')
      expect(w.extract()).toEqual({ raw: 'multiply 5' })
      cleanup()
      const w2 = make()
      const r = render(<>{w2.render({} as never, 'review')}</>)
      await user.click(r.container.querySelector('[data-op-sym="divide"]')!)
      expect(w2.extract()).toEqual({ raw: '' })
      expect((r.container.querySelector('[data-op-by]') as HTMLInputElement).disabled).toBe(true)
      cleanup()
    }
  })
})

describe('worked-equation write-the-next-line', () => {
  it('the next line is typed free-form on the board; review inert', async () => {
    const user = userEvent.setup()
    const w = createWorkedEquation({ lines: ['4x + 5 = 33', '4x = 28'], next: true })
    const { container } = render(<>{w.render({} as never, 'problem')}</>)
    expect(w.extract()).toEqual({ raw: '' })
    await user.type(container.querySelector('[data-next-input]')!, 'x = 7')
    expect(w.extract()).toEqual({ raw: 'x = 7' })
    cleanup()
    const w2 = createWorkedEquation({ lines: ['4x = 28'], next: true })
    const r = render(<>{w2.render({} as never, 'review')}</>)
    expect((r.container.querySelector('[data-next-input]') as HTMLInputElement).disabled).toBe(true)
  })
})

describe('envelope distribute input', () => {
  it('stepper shares counters equally; pool narrates; review inert', async () => {
    const user = userEvent.setup()
    const w = createEnvelopeModel({ envelopes: 4, counters: 28 })
    const { container, getByText } = render(<>{w.render({} as never, 'problem')}</>)
    expect(container.querySelectorAll('[data-env]')).toHaveLength(4)
    for (let i = 0; i < 7; i++) await user.click(container.querySelector('[data-plus]')!)
    expect(w.extract()).toEqual({ raw: '7', value: 7 })
    expect(getByText(/every counter is shared out/)).toBeInTheDocument()
    await user.click(container.querySelector('[data-plus]')!)
    expect(getByText(/4 counters too many/)).toBeInTheDocument()
    await user.click(container.querySelector('[data-minus]')!)
    expect(w.extract()).toEqual({ raw: '7', value: 7 })
    cleanup()
    const w2 = createEnvelopeModel({ envelopes: 4, counters: 28 })
    const r = render(<>{w2.render({} as never, 'review')}</>)
    expect((r.container.querySelector('[data-plus]') as HTMLButtonElement).disabled).toBe(true)
  })
})

describe('area fill-a-product input', () => {
  it("the '?' product is an input; extract is numeric; review inert", async () => {
    const user = userEvent.setup()
    const w = createAreaModel({ height: '3', parts: ['x', '2'], products: ['3x', '?'] })
    const { container } = render(<>{w.render({} as never, 'problem')}</>)
    await user.type(container.querySelector('input')!, '6')
    expect(w.extract()).toEqual({ raw: '6', value: 6 })
    cleanup()
    const w2 = createAreaModel({ height: '3', parts: ['x', '2'], products: ['3x', '?'] })
    const r = render(<>{w2.render({} as never, 'review')}</>)
    expect((r.container.querySelector('input') as HTMLInputElement).disabled).toBe(true)
  })
})

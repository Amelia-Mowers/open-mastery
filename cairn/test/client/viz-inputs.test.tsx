/** The five formerly display-only widgets now hold their input role
 * (GOLDEN §1: display-only is a stage, not a category): select/extract,
 * keyboard via the shared OpChoiceRow, review inertness. */
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createBalanceScale } from '../../src/client/viz/balance-scale'
import { createHangerDiagram } from '../../src/client/viz/hanger-diagram'
import { createWorkedEquation } from '../../src/client/viz/worked-equation'
import { createEnvelopeModel } from '../../src/client/viz/envelope-model'
import { createAreaModel } from '../../src/client/viz/area-model'

afterEach(cleanup)

const OPS = [
  { key: 'divide', label: '÷ 4 both sides' },
  { key: 'subtract', label: '− 4 both sides' },
]

describe('pick-the-operation inputs (balance, hanger, worked)', () => {
  it('click and arrow keys select; extract returns the key; review inert', async () => {
    const user = userEvent.setup()
    for (const make of [
      () => createBalanceScale({ left: '4x', right: '28', ops: OPS }),
      () => createHangerDiagram({ copies: 4, shapeLabel: 'x', weight: '28', ops: OPS }),
      () => createWorkedEquation({ lines: ['4x = 28'], options: OPS }),
    ]) {
      const w = make()
      const { container } = render(<>{w.render({} as never, 'problem')}</>)
      expect(w.extract()).toEqual({ raw: '' })
      await user.click(container.querySelector('[data-op-option="subtract"]')!)
      expect(w.extract()).toEqual({ raw: 'subtract' })
      const group = container.querySelector('[role="radiogroup"]')! as HTMLElement
      group.focus()
      await user.keyboard('{ArrowLeft}')
      expect(w.extract()).toEqual({ raw: 'divide' })
      cleanup()
      const w2 = make()
      const r = render(<>{w2.render({} as never, 'review')}</>)
      await user.click(r.container.querySelector('[data-op-option="divide"]')!)
      expect(w2.extract()).toEqual({ raw: '' })
      cleanup()
    }
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

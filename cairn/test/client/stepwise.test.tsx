/** Stepwise problem player: the timeline pauses at expect steps, the
 * student constructs each move, wrong tries hint then reveal, and the
 * result tallies flow out — the unified-widget direction's pilot. */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { explanationSchema } from '@openmastery/schema'
import { StepwisePlayer, hasExpects } from '../../src/client/app/StepwisePlayer'
import type { Params } from '../../src/client/app/render'

afterEach(cleanup)

/** two-step balance walkthrough, truncated like a faded lead (no resolution) */
const stepwiseExp = () =>
  explanationSchema.parse({
    id: 'g7.ee.two-step.exp-balance',
    skill: 'g7.ee.two-step',
    representation: 'balance-scale',
    widget: 'balance-scale',
    params_from: 'item',
    timeline: [
      {
        t: 0,
        patch: { equation: ['{a}{variable}', ' + {b}', ' = ', '{a*ans+b}'], left: '{a}{variable} + {b}', right: '{a*ans+b}' },
        caption: 'Two operations hide {variable}.',
      },
      {
        t: 0.5,
        patch: { eqHighlight: ['0', '1'], leftIn: true },
        caption: '{a}{variable} + {b} sits on the left pan.',
        expect: { type: 'pick', value: ['0', '1'], prompt: 'Click the LEFT-pan piece.' },
      },
      {
        t: 1,
        patch: { op: 'subtract', by: '{b}' },
        caption: 'Subtract {b} from both pans.',
        expect: {
          type: 'op',
          value: 'subtract {b}',
          prompt: 'Which move comes FIRST?',
          hint: 'The + {b} was applied last — undo it first.',
        },
      },
      { t: 2, patch: { left: '{a}{variable}', right: '{a*ans}', op: null }, caption: 'Now {a}{variable} = {a*ans}.' },
      {
        t: 3,
        patch: { op: 'divide', by: '{a}' },
        caption: 'Divide both pans by {a}.',
        expect: { type: 'op', value: 'divide {a}' },
      },
    ],
    review: { status: 'vetted' },
  })

const P: Params = { a: 3, b: 5, ans: 4, variable: 'x' }

describe('stepwise player', () => {
  it('pauses at each expect, hints on a miss, plays the confirmation on the right move', async () => {
    const user = userEvent.setup()
    const done = vi.fn()
    const { container } = render(
      <StepwisePlayer explanation={stepwiseExp()} params={P} stepDelayMs={10} onReachedEnd={done} />,
    )
    expect(hasExpects(stepwiseExp().timeline)).toBe(true)

    // decomposition gate: MULTI-select with explicit confirm — a wrong or
    // partial set is a miss, exact set advances (no more, no fewer)
    await waitFor(() => expect(screen.getByText('Click the LEFT-pan piece.')).toBeInTheDocument())
    await user.click(container.querySelector('[data-pick-seg="0"]')!)
    await user.click(container.querySelector('[data-pick-seg="2"]')!) // '=' selected too
    await user.click(screen.getByTestId('stepwise-check'))
    expect(screen.getByTestId('stepwise-feedback').textContent).toContain('Not that piece')
    // the wrong set STAYS selected for adjusting: drop '=', add '+ 5'
    await user.click(container.querySelector('[data-pick-seg="2"]')!) // deselect '='
    await user.click(container.querySelector('[data-pick-seg="1"]')!)
    expect(container.querySelector('[data-pick-seg="0"]')!.getAttribute('aria-pressed')).toBe('true')
    expect(container.querySelector('[data-pick-seg="2"]')!.getAttribute('aria-pressed')).toBe('false')
    await user.click(screen.getByTestId('stepwise-check'))

    // op gate opens with its authored prompt; the confirmation has NOT played
    await waitFor(() => expect(screen.getByText('Which move comes FIRST?')).toBeInTheDocument())
    expect(container.querySelector('[data-op-badge="left"]')).toBeNull()

    // an INCOMPLETE entry never counts as a miss — the missing parts pulse
    expect(screen.getByTestId('stepwise-check').getAttribute('aria-disabled')).toBe('true')
    await user.click(screen.getByTestId('stepwise-check'))
    expect(container.querySelectorAll('.sw-nudge').length).toBeGreaterThanOrEqual(2)
    expect(screen.queryByTestId('stepwise-feedback')).toBeNull()

    // wrong move → hint, gate stays
    await user.click(container.querySelector('[data-op-sym="divide"]')!)
    await user.type(container.querySelector('[data-op-by]')!, '3')
    await user.click(screen.getByTestId('stepwise-check'))
    expect(screen.getByTestId('stepwise-feedback').textContent).toContain('applied last')
    expect(screen.getByTestId('stepwise-gate')).toBeInTheDocument()

    // right move → confirmation patch plays (badges on both pans), play continues
    await user.click(container.querySelector('[data-op-sym="subtract"]')!)
    await user.clear(container.querySelector('[data-op-by]')!)
    await user.type(container.querySelector('[data-op-by]')!, '5')
    await user.click(screen.getByTestId('stepwise-check'))
    await waitFor(() => expect(container.querySelector('[data-op-badge="left"]')).toBeInTheDocument())

    // gate 2 (default prompt), answer correctly → the run completes
    await waitFor(() => expect(screen.getByText(/what do we do to both sides/)).toBeInTheDocument())
    await user.click(container.querySelector('[data-op-sym="divide"]')!)
    await user.type(container.querySelector('[data-op-by]')!, '3')
    await user.click(screen.getByTestId('stepwise-check'))
    await waitFor(() => expect(screen.getByTestId('stepwise-done')).toBeInTheDocument())
    expect(done).toHaveBeenCalledWith({ misses: 2, reveals: 0 })
  })

  it('two wrong tries reveal the move and keep the run going (tallied)', async () => {
    const user = userEvent.setup()
    const done = vi.fn()
    const { container } = render(
      <StepwisePlayer explanation={stepwiseExp()} params={P} stepDelayMs={10} onReachedEnd={done} />,
    )
    await waitFor(() => expect(container.querySelector('[data-pick-seg="0"]')).toBeInTheDocument())
    await user.click(container.querySelector('[data-pick-seg="0"]')!)
    await user.click(container.querySelector('[data-pick-seg="1"]')!)
    await user.click(screen.getByTestId('stepwise-check'))
    await waitFor(() => expect(container.querySelector('[data-op-sym="add"]')).toBeInTheDocument())
    for (let i = 0; i < 2; i++) {
      await user.click(container.querySelector('[data-op-sym="add"]')!)
      const by = container.querySelector('[data-op-by]')! as HTMLInputElement
      await user.clear(by)
      await user.type(by, '9')
      await user.click(screen.getByTestId('stepwise-check'))
    }
    // revealed: the move is named and its confirmation plays anyway
    expect(screen.getByTestId('stepwise-feedback').textContent).toContain('subtract 5')
    await waitFor(() => expect(container.querySelector('[data-op-badge="right"]')).toBeInTheDocument())
    // finish gate 2 correctly (wait for ITS inputs — the panel never unmounts)
    await waitFor(() => expect(container.querySelector('[data-op-sym="divide"]')).toBeInTheDocument())
    await user.click(container.querySelector('[data-op-sym="divide"]')!)
    await user.type(container.querySelector('[data-op-by]')!, '3')
    await user.click(screen.getByTestId('stepwise-check'))
    await waitFor(() => expect(done).toHaveBeenCalledWith({ misses: 2, reveals: 1 }))
  })
})

describe('stepwise assistance affordances', () => {
  it('"Show me" solves the step in the widget, tallies a reveal, fires onEngaged once', async () => {
    const user = userEvent.setup()
    const done = vi.fn()
    const engaged = vi.fn()
    const { container } = render(
      <StepwisePlayer explanation={stepwiseExp()} params={P} stepDelayMs={10} onReachedEnd={done} onEngaged={engaged} />,
    )
    await waitFor(() => expect(screen.getByTestId('stepwise-showme')).toBeInTheDocument())
    await user.click(screen.getByTestId('stepwise-showme')) // pick gate revealed
    expect(engaged).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(container.querySelector('[data-op-sym="add"]')).toBeInTheDocument())
    await user.click(screen.getByTestId('stepwise-showme')) // op gate revealed
    expect(screen.getByTestId('stepwise-feedback').textContent).toContain('subtract 5')
    await waitFor(() => expect(container.querySelector('[data-op-badge="left"]')).toBeInTheDocument())
    await waitFor(() => expect(container.querySelector('[data-op-sym="divide"]')).toBeInTheDocument())
    await user.click(screen.getByTestId('stepwise-showme')) // divide gate revealed
    await waitFor(() => expect(done).toHaveBeenCalledWith({ misses: 0, reveals: 3 }))
    expect(engaged).toHaveBeenCalledTimes(1)
  })

  it('completed steps scrub: dots rebuild the earlier view, Back to now returns to the frontier', async () => {
    const user = userEvent.setup()
    const { container } = render(<StepwisePlayer explanation={stepwiseExp()} params={P} stepDelayMs={10} />)
    await waitFor(() => expect(screen.getByTestId('stepwise-showme')).toBeInTheDocument())
    await user.click(screen.getByTestId('stepwise-showme')) // past pick gate
    await waitFor(() => expect(container.querySelector('[data-op-sym="add"]')).toBeInTheDocument())
    // two steps applied -> dots appear; scrub back to step 1
    await user.click(container.querySelector('[data-step-dot="0"]')!)
    expect(screen.getByTestId('stepwise-caption').textContent).toContain('Two operations hide x')
    // the gate hides while reviewing; Back to now restores it
    expect(screen.queryByTestId('stepwise-gate')).toBeNull()
    await user.click(screen.getByTestId('stepwise-resume'))
    expect(screen.getByTestId('stepwise-gate')).toBeInTheDocument()
    expect(screen.getByTestId('stepwise-caption').textContent).toContain('left pan')
  })
})

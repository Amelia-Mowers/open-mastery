/** The assistance spectrum on PRACTICE serves: a scaffolded practice item
 * gets a stepwise lead; engaging any gate marks the try assisted
 * (hintLevel ≥ 1), while skipping straight to the answer keeps full
 * credit — the expertise-reversal guard, wired end to end. */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { itemSchema, explanationSchema } from '@openmastery/schema'
import { ItemCard } from '../../src/client/app/ItemCard'
import type { NextAction } from '../../src/core/engine'
import type { ExplainResult } from '../../src/client/app/api'

afterEach(cleanup)

const item = itemSchema.parse({
  id: 't.twostep.001',
  skills: ['t.twostep'],
  difficulty: 1,
  params: { a: 3, b: 5, ans: 4, variable: 'x' },
  widget: { type: 'equation-input', config: { stem: 'Solve: {a}{variable} + {b} = {a*ans+b}.' } },
  answer: { type: 'expr', value: '{variable} = {ans}' },
  review: { status: 'draft' },
})

const P = { a: 3, b: 5, ans: 4, variable: 'x' }

const action = (scaffolded: boolean) =>
  ({
    kind: 'serve_item',
    itemKind: 'practice',
    skillId: 't.twostep',
    forSkillId: 't.twostep',
    instance: { itemId: item.id, params: P, paramHash: 'h-sw' },
    scaffolded,
  }) as Extract<NextAction, { kind: 'serve_item' }>

const leadExplanation = explanationSchema.parse({
  id: 't.twostep.exp-balance',
  skill: 't.twostep',
  representation: 'balance-scale',
  widget: 'balance-scale',
  params_from: 'item',
  timeline: [
    { t: 0, patch: { left: '{a}{variable} + {b}', right: '{a*ans+b}' }, caption: 'Balanced.' },
    {
      t: 1,
      patch: { op: 'subtract', by: '{b}' },
      caption: 'Subtract {b}.',
      expect: { type: 'op', value: 'subtract {b}' },
    },
    { t: 2, patch: { left: '{variable}', right: '{ans}' }, caption: '{variable} = {ans}.' },
  ],
  review: { status: 'draft' },
})

const explain: ExplainResult = {
  explanation: leadExplanation,
  params: P,
  totalReps: 1,
  sameNumbers: true,
} as unknown as ExplainResult

const renderCard = (scaffolded: boolean, onSubmit: ReturnType<typeof vi.fn>) =>
  render(
    <ItemCard
      action={action(scaffolded)}
      item={item}
      pointsBefore={0}
      mastery={0.4}
      onSubmit={onSubmit}
      onContinue={() => {}}
      onStartCheck={() => {}}
      fetchExplanation={vi.fn().mockResolvedValue(explain)}
      onExplained={() => {}}
      showInlineCheckOffer={false}
    />,
  )

const ok = { verdict: { verdict: 'correct' }, correct: true, points: 5, emitted: [] }

describe('practice serves on the assistance spectrum', () => {
  it('working the steps CORRECTLY is the primary path, not assistance', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn().mockResolvedValue(ok)
    const { container } = renderCard(true, onSubmit)
    await waitFor(() => expect(container.querySelector('[data-op-sym="subtract"]')).toBeInTheDocument())
    // work the gate correctly — stepwise IS the intended way to solve,
    // so it must not be charged as help
    await user.click(container.querySelector('[data-op-sym="subtract"]')!)
    await user.type(container.querySelector('[data-op-by]')!, '5')
    await user.click(screen.getByTestId('stepwise-check'))
    await user.type(screen.getByLabelText(/answer/i), 'x = 4')
    await user.click(screen.getByRole('button', { name: 'Check answer' }))
    expect(onSubmit).toHaveBeenCalledWith('x = 4', 0, expect.any(Number))
  })

  it('taking help at a gate ("Show me") does mark the try assisted', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn().mockResolvedValue(ok)
    renderCard(true, onSubmit)
    await waitFor(() => expect(screen.getByTestId('stepwise-showme')).toBeInTheDocument())
    await user.click(screen.getByTestId('stepwise-showme'))
    await user.type(screen.getByLabelText(/answer/i), 'x = 4')
    await user.click(screen.getByRole('button', { name: 'Check answer' }))
    expect(onSubmit).toHaveBeenCalledWith('x = 4', 1, expect.any(Number))
  })

  it('skipping the lead and answering directly keeps full credit (hintLevel 0)', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn().mockResolvedValue(ok)
    renderCard(true, onSubmit)
    await waitFor(() => expect(screen.getByTestId('stepwise-gate')).toBeInTheDocument())
    await user.type(screen.getByLabelText(/answer/i), 'x = 4')
    await user.click(screen.getByRole('button', { name: 'Check answer' }))
    expect(onSubmit).toHaveBeenCalledWith('x = 4', 0, expect.any(Number))
  })

  it('unscaffolded practice never fetches a lead', async () => {
    const onSubmit = vi.fn().mockResolvedValue(ok)
    const fetchExplanation = vi.fn().mockResolvedValue(explain)
    render(
      <ItemCard
        action={action(false)}
        item={item}
        pointsBefore={0}
        mastery={0.9}
        onSubmit={onSubmit}
        onContinue={() => {}}
        onStartCheck={() => {}}
        fetchExplanation={fetchExplanation}
        onExplained={() => {}}
        showInlineCheckOffer={false}
      />,
    )
    await waitFor(() => expect(screen.getByRole('button', { name: 'Check answer' })).toBeInTheDocument())
    expect(fetchExplanation).not.toHaveBeenCalled()
    expect(screen.queryByTestId('stepwise')).toBeNull()
  })
})

describe('recognition goes to unaided work', () => {
  it('praises solving it alone, and stays warm when help was taken', async () => {
    const user = userEvent.setup()
    // unaided: skip the lead entirely and answer
    const solo = vi.fn().mockResolvedValue(ok)
    const { unmount } = renderCard(true, solo)
    await user.type(await screen.findByLabelText(/answer/i), 'x = 4')
    await user.click(screen.getByRole('button', { name: 'Check answer' }))
    expect((await screen.findByRole('status')).textContent).toMatch(/on your own/)
    unmount()

    // helped: take "Show me" at a gate, then answer
    const helped = vi.fn().mockResolvedValue(ok)
    renderCard(true, helped)
    await user.click(await screen.findByTestId('stepwise-showme'))
    await user.type(screen.getByLabelText(/answer/i), 'x = 4')
    await user.click(screen.getByRole('button', { name: 'Check answer' }))
    const fb = await screen.findByRole('status')
    expect(fb.textContent).toMatch(/You got it/)
    // no penalty framing on the primary path
    expect(fb.textContent).not.toMatch(/on your own|helped try|counts as/)
  })
})

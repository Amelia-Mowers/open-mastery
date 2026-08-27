/** Manipulable answer inputs: negate items are answered by moving the dot on
 * a number line whose bounds are cairn-expr templates evaluated per instance
 * — not by typing. */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { itemSchema } from '@openmastery/schema'
import { ItemCard } from '../../src/client/app/ItemCard'
import type { NextAction } from '../../src/core/engine'

afterEach(cleanup)

const item = itemSchema.parse({
  id: 'prealg.lineq.negate.001',
  skills: ['prealg.lineq.negate'],
  difficulty: 1,
  representation: 'opposite-flip',
  params: { b: 2, variable: 'r' },
  generator: { b: { int: [2, 20] } },
  widget: {
    type: 'number-line',
    config: {
      stem: 'Solve: -{variable} = {b}.  Move the dot to {variable}.',
      min: '{-2*abs(b)}',
      max: '{2*abs(b)}',
      step: '{abs(b)}',
    },
  },
  answer: { type: 'expr', value: '{variable} = {-b}', equivalence: 'symbolic' },
  review: { status: 'draft' },
})

const action = {
  kind: 'serve_item',
  itemKind: 'practice',
  skillId: 'prealg.lineq.negate',
  forSkillId: 'prealg.lineq.negate',
  instance: { itemId: item.id, params: { b: 2, variable: 'r' }, paramHash: 'testhash' },
  scaffolded: false,
} as Extract<NextAction, { kind: 'serve_item' }>

const flipItem = itemSchema.parse({
  ...JSON.parse(JSON.stringify(item)),
  id: 'prealg.lineq.negate.099',
  widget: {
    type: 'opposite-flip',
    config: { stem: 'Solve: -{variable} = {b}.  Move the dot to {variable}.', value: '{b}' },
  },
})

describe('opposite-flip as the answer input (the widget trinity)', () => {
  it('the lesson widget doubles as the answer space: click where x lives', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn().mockResolvedValue({
      verdict: { verdict: 'correct' },
      correct: true,
      emitted: [],
      points: 5,
      mastery: 0.7,
    })
    const { container } = render(
      <ItemCard
        action={{ ...action, instance: { ...action.instance, itemId: flipItem.id } }}
        item={flipItem}
        pointsBefore={0}
        mastery={0.3}
        onSubmit={onSubmit}
        onContinue={() => {}}
        onStartCheck={() => {}}
        fetchExplanation={vi.fn()}
        onExplained={() => {}}
        showInlineCheckOffer={false}
      />,
    )
    // config.value template evaluated → ticks at ±2b, ±b, 0
    for (const t of [-4, -2, 0, 2, 4])
      expect(container.querySelector(`[data-tick="${t}"]`)).not.toBeNull()
    await user.click(container.querySelector('[data-tick="-2"]')!)
    expect(container.querySelector('[data-selected-dot]')).not.toBeNull()
    await user.click(screen.getByRole('button', { name: 'Check answer' }))
    expect(onSubmit).toHaveBeenCalledWith('-2', 0, expect.any(Number))
  })
})

describe('number-line as the answer input', () => {
  it('evaluates templated bounds and submits the picked tick as the answer', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn().mockResolvedValue({
      verdict: { verdict: 'correct' },
      correct: true,
      emitted: [],
      points: 5,
      mastery: 0.7,
    })
    const { container } = render(
      <ItemCard
        action={action}
        item={item}
        pointsBefore={0}
        mastery={0.3}
        onSubmit={onSubmit}
        onContinue={() => {}}
        onStartCheck={() => {}}
        fetchExplanation={vi.fn()}
        onExplained={() => {}}
        showInlineCheckOffer={false}
      />,
    )
    // bounds came from {-2*abs(b)} … with b=2 → ticks -4..4 step 2
    for (const t of [-4, -2, 0, 2, 4])
      expect(container.querySelector(`[data-tick="${t}"]`)).not.toBeNull()
    // answer by moving the dot: click -2 (the opposite of 2)
    await user.click(container.querySelector('[data-tick="-2"]')!)
    await user.click(screen.getByRole('button', { name: 'Check answer' }))
    expect(onSubmit).toHaveBeenCalledWith('-2', 0, expect.any(Number))
  })
})

/** Choice input against the Golden Widget standard: select/extract, keyboard,
 * review inertness, deterministic per-instance shuffle, and the ItemCard
 * integration (templated option labels, key submission). */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { itemSchema } from '@openmastery/schema'
import { createChoice } from '../../src/client/widgets/choice'
import { ItemCard } from '../../src/client/app/ItemCard'
import type { NextAction } from '../../src/core/engine'

afterEach(cleanup)

const OPTS = [
  { key: 'a', label: 'Brand A' },
  { key: 'b', label: 'Brand B' },
  { key: 'c', label: 'Brand C' },
]

describe('choice widget', () => {
  it('click selects, extract returns the KEY, radios carry ARIA state', async () => {
    const user = userEvent.setup()
    const w = createChoice({ options: OPTS, seed: 's1' })
    const { container } = render(<>{w.render({}, 'problem')}</>)
    expect(w.extract()).toEqual({ raw: '' })
    await user.click(container.querySelector('[data-choice="b"]')!)
    expect(w.extract()).toEqual({ raw: 'b' })
    expect(container.querySelector('[data-choice="b"]')!.getAttribute('aria-checked')).toBe('true')
    expect(container.querySelector('[data-choice="a"]')!.getAttribute('aria-checked')).toBe('false')
  })

  it('keyboard: arrows walk the (shuffled) list from a single tab stop', async () => {
    const user = userEvent.setup()
    const w = createChoice({ options: OPTS, seed: 's1' })
    const { container } = render(<>{w.render({}, 'problem')}</>)
    const group = container.querySelector('[role="radiogroup"]')! as HTMLElement
    const order = [...container.querySelectorAll('[data-choice]')].map((el) =>
      el.getAttribute('data-choice'),
    )
    group.focus()
    await user.keyboard('{ArrowDown}')
    expect(w.extract().raw).toBe(order[0])
    await user.keyboard('{ArrowDown}')
    expect(w.extract().raw).toBe(order[1])
    await user.keyboard('{ArrowUp}')
    expect(w.extract().raw).toBe(order[0])
  })

  it('review is inert; the shuffle is deterministic per seed and varies across seeds', async () => {
    const user = userEvent.setup()
    const w = createChoice({ options: OPTS, seed: 's1' })
    const { container } = render(<>{w.render({}, 'review')}</>)
    await user.click(container.querySelector('[data-choice="a"]')!)
    expect(w.extract()).toEqual({ raw: '' })
    expect(container.querySelector('[role="radiogroup"]')!.getAttribute('tabindex')).toBe('-1')
    cleanup()
    const orderFor = (seed: string): string => {
      const r = render(<>{createChoice({ options: OPTS, seed }).render({}, 'problem')}</>)
      const o = [...r.container.querySelectorAll('[data-choice]')]
        .map((el) => el.getAttribute('data-choice'))
        .join('')
      cleanup()
      return o
    }
    expect(orderFor('same')).toBe(orderFor('same'))
    const seeds = ['s1', 's2', 's3', 's4', 's5', 's6']
    expect(new Set(seeds.map(orderFor)).size).toBeGreaterThan(1)
  })
})

describe('choice through the item card', () => {
  const item = itemSchema.parse({
    id: 't.choice.001',
    skills: ['t.choice'],
    difficulty: 1,
    representation: null,
    params: { a1: 4, p1: 2, a2: 7, p2: 5 },
    widget: {
      type: 'choice',
      config: {
        stem: 'Which is the better buy?',
        options: [
          { key: 'a', label: '{a1} pencils for ${p1*a1}' },
          { key: 'b', label: '{a2} pencils for ${p2*a2}' },
        ],
      },
    },
    answer: { type: 'choice', value: 'a' },
    review: { status: 'draft' },
  })
  const action = {
    kind: 'serve_item',
    itemKind: 'practice',
    skillId: 't.choice',
    forSkillId: 't.choice',
    instance: { itemId: item.id, params: { a1: 4, p1: 2, a2: 7, p2: 5 }, paramHash: 'h1' },
    scaffolded: false,
  } as Extract<NextAction, { kind: 'serve_item' }>

  it('templated labels evaluate per instance; submitting sends the option key', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn().mockResolvedValue({ verdict: { verdict: 'correct' }, correct: true, points: 5 })
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
    expect(screen.getByText('4 pencils for $8')).toBeInTheDocument()
    expect(screen.getByText('7 pencils for $35')).toBeInTheDocument()
    await user.click(container.querySelector('[data-choice="b"]')!)
    await user.click(screen.getByRole('button', { name: 'Check answer' }))
    expect(onSubmit).toHaveBeenCalledWith('b', 0, expect.any(Number))
  })
})

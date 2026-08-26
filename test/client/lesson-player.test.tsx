/** The explanation player (§6, build step 4): scrub, pause, backward-seek
 * replay, patch-driven widgets, handoff. */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { fireEvent, render, screen, cleanup } from '@testing-library/react'
import { explanationSchema } from '@openmastery/schema'
import { LessonPlayer } from '../../src/client/app/LessonPlayer'

afterEach(cleanup)

const balanceExp = explanationSchema.parse({
  id: 'alg1.test.exp-balance',
  skill: 'alg1.test.skill',
  representation: 'balance-scale',
  widget: 'balance-scale',
  params_from: 'item',
  timeline: [
    { t: 0, patch: { left: '{a}{variable}', right: '{b}' }, caption: 'Both sides are balanced.' },
    { t: 3, patch: { highlight: 'left.coef' }, caption: '{variable} is multiplied by {a}.' },
    { t: 6, patch: { op: 'divide', by: '{a}' }, caption: 'Divide both sides by {a}.' },
    { t: 9, patch: { left: '{variable}', right: '{b/a}', op: null, highlight: null }, caption: '{variable} = {b/a}.' },
    { t: 11, handoff: { prompt: 'Now you try.' } },
  ],
  review: { status: 'vetted' },
})

const numberLineExp = explanationSchema.parse({
  id: 'alg1.test.exp-numberline',
  skill: 'alg1.test.skill',
  representation: 'number-line',
  widget: 'number-line',
  params_from: 'item',
  timeline: [
    { t: 0, patch: { min: 0, max: '{b}', step: '{b/a}' }, caption: '{a} equal jumps land on {b}.' },
    { t: 3, patch: { highlight: ['{b/a}'], marker: '{b/a}' }, caption: 'One jump is {b/a}.' },
    { t: 6, patch: { marker: '{b}' }, caption: 'So {variable} = {b/a}.' },
    { t: 8, handoff: { prompt: 'Now you try.' } },
  ],
  review: { status: 'vetted' },
})

const P = { a: 4, b: 28, variable: 'x' }
const scrubTo = (t: number) => {
  fireEvent.change(screen.getByRole('slider', { name: 'Lesson timeline' }), {
    target: { value: String(t) },
  })
}

describe('explanation player', () => {
  it('drives the balance scale through the timeline and hands off', () => {
    const onDone = vi.fn()
    const { container } = render(
      <LessonPlayer explanation={balanceExp} params={P} kind="lesson" onDone={onDone} />,
    )
    // t=0 patch applied immediately
    expect(screen.getByText('4x')).toBeInTheDocument()
    expect(screen.getByText('28')).toBeInTheDocument()
    expect(screen.getByTestId('lesson-caption')).toHaveTextContent('Both sides are balanced.')

    scrubTo(6) // op step
    expect(container.querySelector('[data-op-badge="left"]')).toHaveTextContent('÷ 4')
    expect(screen.getByTestId('lesson-caption')).toHaveTextContent('Divide both sides by 4.')

    scrubTo(11) // handoff
    expect(container.querySelector('[data-op-badge="left"]')).toBeNull() // resolved step cleared it
    expect(screen.getByText('7')).toBeInTheDocument() // x = 7
    const cta = screen.getByRole('button', { name: 'Now you try.' })
    fireEvent.click(cta)
    expect(onDone).toHaveBeenCalledOnce()
  })

  it('backward scrubbing replays patches onto a fresh widget', () => {
    const { container } = render(
      <LessonPlayer explanation={balanceExp} params={P} kind="lesson" onDone={() => {}} />,
    )
    scrubTo(6)
    expect(container.querySelector('[data-op-badge="left"]')).not.toBeNull()
    scrubTo(0)
    expect(container.querySelector('[data-op-badge="left"]')).toBeNull()
    expect(container.querySelector('[data-pan="left"]')).toHaveTextContent('4x')
    expect(screen.getByTestId('lesson-caption')).toHaveTextContent('Both sides are balanced.')
  })

  it('pause/play toggles and scrubbing pauses autoplay', () => {
    render(<LessonPlayer explanation={balanceExp} params={P} kind="lesson" onDone={() => {}} />)
    // starts playing
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument()
    scrubTo(3)
    // manual seek pauses
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Play' }))
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument()
  })

  it('sets up a number line from the timeline and drives highlight/marker', () => {
    const { container } = render(
      <LessonPlayer explanation={numberLineExp} params={P} kind="lesson" onDone={() => {}} />,
    )
    // ticks 0, 7, 14, 21, 28 from min/max/step templates
    for (const tick of [0, 7, 14, 21, 28])
      expect(container.querySelector(`[data-tick="${tick}"]`)).not.toBeNull()
    scrubTo(3)
    expect(container.querySelector('[data-tick="7"]')).toHaveAttribute('data-highlighted')
    expect(container.querySelector('[data-tick="7"]')).toHaveAttribute('data-marked')
    scrubTo(6)
    expect(container.querySelector('[data-tick="28"]')).toHaveAttribute('data-marked')
    expect(screen.getByTestId('lesson-caption')).toHaveTextContent('So x = 7.')
  })

  it('falls back to caption-only when the widget has no lesson support', () => {
    const captionOnly = explanationSchema.parse({
      ...numberLineExp,
      id: 'alg1.test.exp-captions',
      widget: 'area-model',
      timeline: [
        { t: 0, caption: 'Just words here.' },
        { t: 2, handoff: { prompt: 'Now you try.' } },
      ],
    })
    render(<LessonPlayer explanation={captionOnly} params={P} kind="lesson" onDone={() => {}} />)
    expect(screen.getByTestId('lesson-caption')).toHaveTextContent('Just words here.')
    expect(screen.queryByRole('img')).toBeNull()
  })
})

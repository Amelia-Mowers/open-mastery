/** The explanation player (§6, build step 4+): preamble, scrub via step
 * segments, speed control, pause, backward-seek replay, patch-driven widgets
 * (balance, number-line, envelopes), handoff and the another-way chain. */
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

const envelopeExp = explanationSchema.parse({
  id: 'alg1.test.exp-envelopes',
  skill: 'alg1.test.skill',
  representation: 'envelopes-counters',
  widget: 'envelope-model',
  params_from: 'item',
  timeline: [
    { t: 0, patch: { envelopes: '{a}', counters: '{b}' }, caption: '{a} envelopes hold {b} counters.' },
    { t: 4, patch: { partition: true }, caption: 'Share into {a} equal groups.' },
    { t: 8, patch: { reveal: true }, caption: 'Each envelope holds {b/a}.' },
    { t: 10, handoff: { prompt: 'Now you try.' } },
  ],
  review: { status: 'vetted' },
})

const P = { a: 4, b: 28, variable: 'x' }
const goToStep = (n: number, total: number) =>
  fireEvent.click(screen.getByRole('button', { name: `Go to step ${n} of ${total}` }))

describe('explanation player', () => {
  it('drives the balance scale through the timeline and hands off', () => {
    const onDone = vi.fn()
    const { container } = render(
      <LessonPlayer explanation={balanceExp} params={P} kind="lesson" onDone={onDone} />,
    )
    expect(screen.getByText('4x')).toBeInTheDocument()
    expect(screen.getByText('28')).toBeInTheDocument()
    expect(screen.getByTestId('lesson-caption')).toHaveTextContent('Both sides are balanced.')

    goToStep(3, 4) // op step at t=6
    expect(container.querySelector('[data-op-badge="left"]')).toHaveTextContent('÷ 4')
    expect(screen.getByTestId('lesson-caption')).toHaveTextContent('Divide both sides by 4.')

    goToStep(4, 4) // handoff
    expect(container.querySelector('[data-op-badge="left"]')).toBeNull()
    expect(screen.getByText('7')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Now you try.' }))
    expect(onDone).toHaveBeenCalledOnce()
  })

  it('backward scrubbing replays patches onto a fresh widget', () => {
    const { container } = render(
      <LessonPlayer explanation={balanceExp} params={P} kind="lesson" onDone={() => {}} />,
    )
    goToStep(3, 4)
    expect(container.querySelector('[data-op-badge="left"]')).not.toBeNull()
    goToStep(1, 4)
    expect(container.querySelector('[data-op-badge="left"]')).toBeNull()
    expect(container.querySelector('[data-pan="left"]')).toHaveTextContent('4x')
    expect(screen.getByTestId('lesson-caption')).toHaveTextContent('Both sides are balanced.')
  })

  it('pause/play toggles; seeking pauses; speed control cycles', () => {
    render(<LessonPlayer explanation={balanceExp} params={P} kind="lesson" onDone={() => {}} />)
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument()
    goToStep(2, 4)
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Play' }))
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument()
    const speed = screen.getByRole('button', { name: /Playback speed/ })
    expect(speed).toHaveTextContent('1×')
    fireEvent.click(speed)
    expect(speed).toHaveTextContent('1.5×')
    fireEvent.click(speed)
    expect(speed).toHaveTextContent('2×')
  })

  it('shows a preamble naming what you are learning before play begins', () => {
    render(
      <LessonPlayer
        explanation={balanceExp}
        params={P}
        kind="lesson"
        intro={{
          title: 'Solve ax = b using the Division Property of Equality',
          plain: 'Undo multiplication by dividing both sides.',
          vocab: [{ term: 'equation', meaning: 'a math sentence saying two things are equal' }],
        }}
        onDone={() => {}}
      />,
    )
    expect(screen.getByText(/what you're learning/i)).toBeInTheDocument()
    expect(screen.getByText('Solve ax = b using the Division Property of Equality')).toBeInTheDocument()
    // timeline not visible yet
    expect(screen.queryByRole('button', { name: /Go to step/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Start the lesson' }))
    expect(screen.getByTestId('lesson-caption')).toHaveTextContent('Both sides are balanced.')
  })

  it('offers "another way" at the handoff when a handler is provided', () => {
    const onAnother = vi.fn()
    render(
      <LessonPlayer explanation={balanceExp} params={P} kind="lesson" onDone={() => {}} onAnotherWay={onAnother} />,
    )
    expect(screen.queryByRole('button', { name: 'Show me another way' })).toBeNull()
    goToStep(4, 4)
    fireEvent.click(screen.getByRole('button', { name: 'Show me another way' }))
    expect(onAnother).toHaveBeenCalledOnce()
  })

  it('sets up a number line from the timeline and drives highlight/marker', () => {
    const { container } = render(
      <LessonPlayer explanation={numberLineExp} params={P} kind="lesson" onDone={() => {}} />,
    )
    for (const tick of [0, 7, 14, 21, 28])
      expect(container.querySelector(`[data-tick="${tick}"]`)).not.toBeNull()
    goToStep(2, 3)
    expect(container.querySelector('[data-tick="7"]')).toHaveAttribute('data-highlighted')
    expect(container.querySelector('[data-tick="7"]')).toHaveAttribute('data-marked')
    goToStep(3, 3)
    expect(container.querySelector('[data-tick="28"]')).toHaveAttribute('data-marked')
    expect(screen.getByTestId('lesson-caption')).toHaveTextContent('So x = 7.')
  })

  it('plays the OpenStax envelopes-and-counters model: setup → partition → reveal', () => {
    const { container } = render(
      <LessonPlayer explanation={envelopeExp} params={P} kind="lesson" onDone={() => {}} />,
    )
    expect(container.querySelectorAll('[data-envelope]')).toHaveLength(4)
    expect(container.querySelectorAll('[data-counter]')).toHaveLength(28)
    expect(container.querySelectorAll('[data-partition]')).toHaveLength(0)

    goToStep(2, 3) // partition into 4 groups of 7
    expect(container.querySelectorAll('[data-partition]')).toHaveLength(4)
    expect(container.querySelectorAll('[data-counter]')).toHaveLength(28)

    goToStep(3, 3) // reveal: each envelope = 7
    const shares = container.querySelectorAll('[data-share]')
    expect(shares).toHaveLength(4)
    expect(shares[0]).toHaveTextContent('= 7')
  })

  it("plays IM's tape diagram: parts, one-part highlight, total reveal", () => {
    const tapeExp = explanationSchema.parse({
      id: 'alg1.test.exp-tape',
      skill: 'alg1.test.skill',
      representation: 'tape-diagram',
      widget: 'tape-diagram',
      params_from: 'item',
      timeline: [
        { t: 0, patch: { parts: '{a}', partLabel: '?', total: '{variable}' }, caption: '{variable} as {a} equal parts.' },
        { t: 4, patch: { partLabel: '{b}', highlight: ['1'] }, caption: 'One part is {b}.' },
        { t: 8, patch: { total: '{variable} = {a*b}', highlight: [] }, caption: '{a} parts of {b}: {a*b}.' },
        { t: 10, handoff: { prompt: 'Now you try.' } },
      ],
      review: { status: 'vetted' },
    })
    const { container } = render(
      <LessonPlayer explanation={tapeExp} params={{ a: 4, b: 7, variable: 'x' }} kind="lesson" onDone={() => {}} />,
    )
    expect(container.querySelectorAll('[data-part]')).toHaveLength(4)
    expect(container.querySelector('[data-total]')).toHaveTextContent('x')
    goToStep(2, 3)
    expect(container.querySelectorAll('[data-part]')[0]).toHaveAttribute('data-highlighted')
    expect(container.querySelectorAll('[data-part]')[0]).toHaveTextContent('7')
    goToStep(3, 3)
    expect(container.querySelector('[data-total]')).toHaveTextContent('x = 28')
    expect(container.querySelector('[data-highlighted]')).toBeNull()
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

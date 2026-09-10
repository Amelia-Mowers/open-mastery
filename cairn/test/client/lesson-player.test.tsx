/** The explanation player (§6, build step 4+): intro beats, scrub via step
 * segments, speed control, pause, backward-seek replay, patch-driven widgets
 * (balance, number-line, envelopes), handoff and the another-way chain. */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { fireEvent, render, screen, cleanup } from '@testing-library/react'
import { explanationSchema } from '@openmastery/schema'
import { LessonPlayer } from '../../src/client/app/LessonPlayer'
import { introBeats, skillSpeak, vocabSpeak } from '../../src/client/app/intro'

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

  it('pause/play toggles; seeking PLAYS from the landed step; speed control cycles', () => {
    render(<LessonPlayer explanation={balanceExp} params={P} kind="lesson" onDone={() => {}} />)
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }))
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument()
    // a section click restarts playback from that step — the transport
    // shows the true state (playing), not the pre-click pause
    goToStep(2, 4)
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument()
    const speed = screen.getByRole('button', { name: /Playback speed/ })
    expect(speed).toHaveTextContent('1×')
    fireEvent.click(speed)
    expect(speed).toHaveTextContent('1.5×')
    fireEvent.click(speed)
    expect(speed).toHaveTextContent('2×')
  })

  const INTRO = {
    skillName: 'Solve ax = b',
    plain: 'Undo multiplication by dividing both sides.',
    vocab: [{ term: 'equation', meaning: 'a math sentence saying two things are equal' }],
    rep: { name: 'balance scale', intro: 'This is a balance scale.' },
  }
  const widgetStage = (c: HTMLElement) => c.querySelector('.lesson-stage:not(.lesson-stage-intro)')!

  it('plays the intro beats over the stage before the first frame: skill, vocabulary, then the picture', () => {
    const { container } = render(
      <LessonPlayer
        explanation={balanceExp}
        params={P}
        kind="lesson"
        intro={{ ...INTRO, playSkill: true, playRep: true }}
        onDone={() => {}}
      />,
    )
    // the skill beat: headline where the widget will be, the plain line
    // as the (narrated) caption, the board already set above
    expect(screen.getByTestId('lesson-intro')).toHaveTextContent('NEW SKILL')
    expect(screen.getByTestId('lesson-intro')).toHaveTextContent('Solve ax = b')
    expect(screen.getByTestId('lesson-caption')).toHaveTextContent('Undo multiplication by dividing both sides.')
    expect(widgetStage(container)).toHaveAttribute('hidden')
    // a skill beat waits for the student — no clock, a Continue
    expect(screen.getByRole('button', { name: 'Continue' })).toBeInTheDocument()
    // the whole track is there: three intro pips + the four lesson steps
    expect(screen.getAllByRole('button', { name: /Go to intro/ })).toHaveLength(3)
    expect(screen.getAllByRole('button', { name: /Go to step/ })).toHaveLength(4)

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(screen.getByTestId('lesson-intro')).toHaveTextContent('A TERM TO KNOW')
    expect(screen.getByTestId('lesson-intro')).toHaveTextContent('equation')
    // the box shows the meaning; the headline is on screen (and spoken)
    expect(screen.getByTestId('lesson-caption')).toHaveTextContent(
      'a math sentence saying two things are equal.',
    )
    expect(screen.getByRole('button', { name: 'Continue' })).toBeInTheDocument()

    // the rep beat reveals the widget in its opening state, and runs on
    // the clock like any caption
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull()
    expect(screen.queryByTestId('lesson-intro')).toBeNull()
    expect(widgetStage(container)).not.toHaveAttribute('hidden')
    expect(container.querySelector('[data-pan="left"]')).toHaveTextContent('4x')
    expect(screen.getByTestId('lesson-caption')).toHaveTextContent('This is a balance scale.')

    goToStep(1, 4)
    expect(screen.getByTestId('lesson-caption')).toHaveTextContent('Both sides are balanced.')
  })

  it('a multi-line opening applies ONCE on a first lesson (the intro carries t0)', () => {
    // the first intro beat carries timeline[0]'s patch; the content copy
    // must shed it — appending patches (a worked board's line array)
    // otherwise apply twice and the opening doubles (batch-4 review)
    const workedExp = explanationSchema.parse({
      id: 'alg1.linear.solve-one-step.exp-worked-multiline',
      skill: 'alg1.linear.solve-one-step',
      representation: 'worked-equation',
      widget: 'worked-equation',
      params_from: 'item',
      timeline: [
        { t: 0, patch: { start: '{a}{variable} = {b}', line: ['{a} pounds → ${b}', '1 pound → $?'] }, caption: 'The problem.' },
        { t: 4, patch: { line: '{variable} = {b/a}' }, caption: 'Solved.' },
        { t: 6, handoff: { prompt: 'Now you try.' } },
      ],
      review: { status: 'vetted' },
    })
    const { container } = render(
      <LessonPlayer
        explanation={workedExp}
        params={P}
        kind="lesson"
        intro={{ ...INTRO, playSkill: true, playRep: true }}
        onDone={() => {}}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Continue' })) // skill → vocab
    fireEvent.click(screen.getByRole('button', { name: 'Continue' })) // vocab → problem/rep
    goToStep(1, 2) // land on the opening frame
    // start line + the two problem lines — each exactly once
    expect(container.querySelectorAll('[data-line]')).toHaveLength(3)
  })

  it('beats that are not due stay on the track, skipped: the lesson starts at its first frame', () => {
    const { container } = render(
      <LessonPlayer
        explanation={balanceExp}
        params={P}
        kind="lesson"
        intro={{ ...INTRO, playSkill: false, playRep: false }}
        onDone={() => {}}
      />,
    )
    expect(screen.getByTestId('lesson-caption')).toHaveTextContent('Both sides are balanced.')
    expect(screen.queryByTestId('lesson-intro')).toBeNull()
    expect(widgetStage(container)).not.toHaveAttribute('hidden')
    // scrubbing back reaches them
    expect(screen.getAllByRole('button', { name: /Go to intro/ })).toHaveLength(3)
    fireEvent.click(screen.getByRole('button', { name: 'Go to intro 1 of 3' }))
    expect(screen.getByTestId('lesson-caption')).toHaveTextContent('Undo multiplication by dividing both sides.')
    expect(widgetStage(container)).toHaveAttribute('hidden')
  })

  it('only the DUE beats play when some are: a known picture is not re-introduced on a new skill', () => {
    render(
      <LessonPlayer
        explanation={balanceExp}
        params={P}
        kind="lesson"
        intro={{ ...INTRO, playSkill: true, playRep: false }}
        onDone={() => {}}
      />,
    )
    expect(screen.getAllByRole('button', { name: /Go to intro/ })).toHaveLength(2)
    expect(screen.getByTestId('lesson-caption')).toHaveTextContent('Undo multiplication by dividing both sides.')
    cleanup()
    render(
      <LessonPlayer
        explanation={balanceExp}
        params={P}
        kind="alt_explanation"
        intro={{ skillName: 'Solve ax = b', rep: INTRO.rep, playSkill: false, playRep: true }}
        onDone={() => {}}
      />,
    )
    expect(screen.getAllByRole('button', { name: /Go to intro/ })).toHaveLength(1)
    expect(screen.getByTestId('lesson-caption')).toHaveTextContent('This is a balance scale.')
  })

  it('intro beats SPEAK their headline, show only the line, and bridge into the problem', () => {
    expect(skillSpeak('Find x', 'A number is hiding')).toBe('New skill: Find x. A number is hiding.')
    expect(vocabSpeak({ term: 'cube', meaning: 'three equal factors!' })).toBe(
      'A term to know: cube. three equal factors!',
    )
    const beats = introBeats(
      {
        skillName: 'Find {variable}',
        plain: 'A number is hiding.',
        vocab: [{ term: 'cube', meaning: 'three equal factors' }],
        problem: 'x + 8 = 21',
        rep: { name: 'tape', intro: 'This is a tape diagram.' },
        playSkill: true,
        playRep: true,
      },
      { variable: 'y' },
    )
    expect(beats.map((b) => b.kind)).toEqual(['skill', 'vocab', 'problem', 'rep'])
    expect(beats[0]!.headline).toBe('Find y')
    expect(beats[0]!.speak).toBe('New skill: Find y. A number is hiding.')
    expect(beats.map((b) => b.manual)).toEqual([true, true, false, false])
    expect(beats[1]!.caption).toBe('three equal factors.')
    expect(beats[2]!.speak).toBe("Here's how it works with x + 8 = 21.")
    // no skill intro ⇒ no problem bridge either (it is the skill's, not the rep's)
    expect(
      introBeats({ skillName: 'Find x', problem: 'x + 8 = 21', rep: { name: 'tape', intro: 'Tape.' }, playSkill: false, playRep: true }, {}).map((b) => b.kind),
    ).toEqual(['rep'])
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

  it("plays IM's hanger diagram: copies of the shape, split the weight, reveal shares", () => {
    const hangerExp = explanationSchema.parse({
      id: 'alg1.test.exp-hanger',
      skill: 'alg1.test.skill',
      representation: 'hanger-diagram',
      widget: 'hanger-diagram',
      params_from: 'item',
      timeline: [
        { t: 0, patch: { copies: '{a}', shapeLabel: '{variable}', weight: '{b}' }, caption: '{a} copies of {variable} balance {b}.' },
        { t: 4, patch: { split: true, share: '{b/a}' }, caption: 'Share {b} into {a} pieces.' },
        { t: 8, patch: { reveal: true }, caption: 'Each {variable} = {b/a}.' },
        { t: 10, handoff: { prompt: 'Now you try.' } },
      ],
      review: { status: 'vetted' },
    })
    const { container } = render(
      <LessonPlayer explanation={hangerExp} params={P} kind="lesson" onDone={() => {}} />,
    )
    // 4x = 28: four x-shapes vs one weight of 28
    expect(container.querySelectorAll('[data-shape]')).toHaveLength(4)
    expect(container.querySelector('[data-weight]')).toHaveTextContent('28')
    goToStep(2, 3)
    expect(container.querySelectorAll('[data-piece]')).toHaveLength(4)
    expect(container.querySelectorAll('[data-piece]')[0]).toHaveTextContent('7')
    goToStep(3, 3)
    expect(container.querySelectorAll('[data-share]')).toHaveLength(4)
    expect(container.querySelectorAll('[data-share]')[0]).toHaveTextContent('= 7')
  })

  it("plays IM's area model: partitioned rectangle with product reveal", () => {
    const areaExp = explanationSchema.parse({
      id: 'alg1.test.exp-area',
      skill: 'alg1.test.skill',
      representation: 'area-model',
      widget: 'area-model',
      params_from: 'item',
      timeline: [
        { t: 0, patch: { height: '{a}', parts: ['{variable}', '{b}'] }, caption: '{a}({variable} + {b}) as a rectangle.' },
        { t: 4, patch: { highlight: ['1'] }, caption: 'The first piece is {a} by {variable}.' },
        { t: 8, patch: { products: ['{a}{variable}', '{a*b}'], highlight: [] }, caption: '{a}({variable} + {b}) = {a}{variable} + {a*b}.' },
        { t: 10, handoff: { prompt: 'Now you try.' } },
      ],
      review: { status: 'vetted' },
    })
    const { container } = render(
      <LessonPlayer explanation={areaExp} params={P} kind="lesson" onDone={() => {}} />,
    )
    expect(container.querySelectorAll('[data-cell]')).toHaveLength(2)
    expect(container.querySelector('[data-height-label]')).toHaveTextContent('4')
    goToStep(2, 3)
    expect(container.querySelectorAll('[data-cell]')[0]).toHaveAttribute('data-highlighted')
    goToStep(3, 3)
    const products = container.querySelectorAll('[data-product]')
    expect(products[0]).toHaveTextContent('4x')
    expect(products[1]).toHaveTextContent('112')
  })

  it('plays the opposite-flip: mark b, flip across zero, resolve at -b', () => {
    const flipExp = explanationSchema.parse({
      id: 'alg1.test.exp-flip',
      skill: 'alg1.test.skill',
      representation: 'opposite-flip',
      widget: 'opposite-flip',
      params_from: 'item',
      timeline: [
        { t: 0, patch: { value: '{b}' }, caption: 'The opposite of {variable} is {b}.' },
        { t: 4, patch: { flip: true }, caption: 'Mirror twins across zero.' },
        { t: 8, patch: { resolve: true }, caption: '{variable} = {-b}.' },
        { t: 10, handoff: { prompt: 'Now you try.' } },
      ],
      review: { status: 'vetted' },
    })
    const { container } = render(
      <LessonPlayer explanation={flipExp} params={{ b: 2, variable: 'r' }} kind="lesson" onDone={() => {}} />,
    )
    expect(container.querySelector('[data-point-b]')).not.toBeNull()
    expect(container.querySelector('[data-arc]')).toBeNull()
    goToStep(2, 3)
    expect(container.querySelector('[data-arc]')).not.toBeNull()
    expect(container.querySelector('[data-point-neg]')).not.toBeNull()
    goToStep(3, 3)
    expect(screen.getByTestId('lesson-caption')).toHaveTextContent('r = -2.')
  })

  it('plays the whiteboard worked-equation: lines append with operation notes', () => {
    const workedExp = explanationSchema.parse({
      id: 'alg1.test.exp-worked',
      skill: 'alg1.test.skill',
      representation: 'worked-equation',
      widget: 'worked-equation',
      params_from: 'item',
      timeline: [
        { t: 0, patch: { start: '-{variable} = {b}' }, caption: 'On the board.' },
        { t: 4, patch: { line: '(-1) · (-{variable}) = (-1) · {b}', note: 'multiply both sides by -1' }, caption: 'Both sides.' },
        { t: 8, patch: { line: '{variable} = {-b}', note: 'the negatives cancel' }, caption: 'Done.' },
        { t: 10, handoff: { prompt: 'Now you try.' } },
      ],
      review: { status: 'vetted' },
    })
    const { container } = render(
      <LessonPlayer explanation={workedExp} params={{ b: 2, variable: 'r' }} kind="lesson" onDone={() => {}} />,
    )
    expect(container.querySelectorAll('[data-line]')).toHaveLength(1)
    expect(container.querySelectorAll('[data-line]')[0]).toHaveTextContent('-r = 2')
    goToStep(3, 3)
    const lines = container.querySelectorAll('[data-line]')
    expect(lines).toHaveLength(3)
    expect(lines[1]).toHaveTextContent('(-1) · (-r) = (-1) · 2')
    expect(lines[2]).toHaveTextContent('r = -2')
    expect(container.querySelectorAll('[data-note]')[0]).toHaveTextContent('multiply both sides by -1')
    // backward seek rebuilds and replays the lines
    goToStep(1, 3)
    expect(container.querySelectorAll('[data-line]')).toHaveLength(1)
  })

  it('decomposition: the symbolic equation appears and its parts light up as the diagram builds', () => {
    const decompExp = explanationSchema.parse({
      id: 'alg1.test.exp-decomp',
      skill: 'alg1.test.skill',
      representation: 'envelopes-counters',
      widget: 'envelope-model',
      params_from: 'item',
      timeline: [
        { t: 0, patch: { equation: ['{a}', '{variable}', ' = ', '{b}'], envelopes: '{a}', counters: '{b}', envelopesIn: false, countersIn: false }, caption: 'Symbols first.' },
        { t: 4, patch: { eqHighlight: ['0', '1'], envelopesIn: true }, caption: '{a}{variable} becomes envelopes.' },
        { t: 8, patch: { eqHighlight: ['3'], countersIn: true }, caption: '{b} becomes counters.' },
        { t: 10, handoff: { prompt: 'Now you try.' } },
      ],
      review: { status: 'vetted' },
    })
    const { container } = render(
      <LessonPlayer explanation={decompExp} params={P} kind="lesson" onDone={() => {}} />,
    )
    // t0: equation shown, diagram empty
    expect(screen.getByTestId('lesson-equation')).toHaveTextContent('4x = 28')
    expect(container.querySelectorAll('[data-envelope]')).toHaveLength(0)
    expect(container.querySelectorAll('[data-counter]')).toHaveLength(0)
    // 4x lights up as the envelopes arrive
    goToStep(2, 3)
    expect(container.querySelectorAll('.eq-hl')).toHaveLength(2)
    expect(container.querySelectorAll('.eq-hl')[0]).toHaveTextContent('4')
    expect(container.querySelectorAll('[data-envelope]')).toHaveLength(4)
    expect(container.querySelectorAll('[data-counter]')).toHaveLength(0)
    // 28 lights up as the counters pour in
    goToStep(3, 3)
    expect(container.querySelectorAll('.eq-hl')).toHaveLength(1)
    expect(container.querySelectorAll('.eq-hl')[0]).toHaveTextContent('28')
    expect(container.querySelectorAll('[data-counter]')).toHaveLength(28)
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

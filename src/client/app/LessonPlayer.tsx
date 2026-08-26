/** The explanation player (§6, build step 4): an intro naming what you're
 * learning (new-skill entry only), timed autoplay over the §4.3 timeline,
 * play/pause, speed control, a segmented step timeline (each rectangle fills
 * through its step; click to jump), backward-seek replay onto a fresh widget,
 * interaction mid-timeline, and handoff into faded/practice — with an
 * optional looping "show me another way" chain. Captions are the source of
 * truth and are rendered by the player. */
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import type { Explanation } from '@openmastery/schema'
import type { WidgetInstance } from '../widgets/contract'
import { createBalanceScale } from '../viz/balance-scale'
import { createEnvelopeModel } from '../viz/envelope-model'
import { createNumberLine } from '../widgets/number-line'
import {
  adaptBalancePatch,
  adaptNumberLinePatch,
  evalNumber,
  numberLineSetup,
  renderText,
  type Params,
} from './render'

export interface LessonIntro {
  title: string
  /** plain-words version of what you're learning */
  plain?: string
  vocab?: Array<{ term: string; meaning: string }>
}

export interface LessonPlayerProps {
  explanation: Explanation
  params: Params
  kind: 'lesson' | 'alt_explanation' | 'walkthrough'
  /** shown once, before play begins — new-skill entry only */
  intro?: LessonIntro
  /** render without the outer card (playing inside an item card) */
  embedded?: boolean
  onDone: () => void
  /** offered at the handoff: chain into another representation (loops) */
  onAnotherWay?: () => void
  /** leave without finishing (embedded walk-throughs only) — no logging */
  onCancel?: () => void
}

const TICK_MS = 100
const SPEEDS = [1, 1.5, 2, 0.5] as const

const KICKER: Record<LessonPlayerProps['kind'], string> = {
  lesson: 'LESSON',
  alt_explanation: "LET'S LOOK AT IT DIFFERENTLY",
  walkthrough: 'WALK-THROUGH · SAME NUMBERS',
}

interface LessonWidget {
  element: ReactElement
  apply: (patch: Record<string, unknown>) => void
}

function envelopeSetup(
  timeline: ReadonlyArray<{ patch?: Record<string, unknown> | undefined }>,
  params: Params,
): { envelopes: number; counters: number } | null {
  for (const s of timeline) {
    const p = s.patch
    if (!p || !('envelopes' in p) || !('counters' in p)) continue
    const envelopes = evalNumber(p['envelopes'], params)
    const counters = evalNumber(p['counters'], params)
    if (envelopes === null || counters === null) return null
    if (envelopes < 1 || envelopes > 14 || Math.abs(counters) > 80) return null
    return { envelopes, counters }
  }
  return null
}

function createLessonWidget(explanation: Explanation, params: Params): LessonWidget | null {
  if (explanation.widget === 'balance-scale') {
    const w = createBalanceScale()
    return {
      element: w.render({ left: '', right: '' }, 'lesson'),
      apply: (patch) => w.applyPatch(adaptBalancePatch(patch, params)),
    }
  }
  if (explanation.widget === 'number-line') {
    const setup = numberLineSetup(explanation.timeline, params)
    if (!setup) return null
    const w: WidgetInstance<{ prompt?: string }, unknown, { highlight?: number[]; marker?: number | null }> =
      createNumberLine(setup)
    return {
      element: w.render({}, 'lesson'),
      apply: (patch) => w.applyPatch(adaptNumberLinePatch(patch, params)),
    }
  }
  if (explanation.widget === 'envelope-model') {
    const setup = envelopeSetup(explanation.timeline, params)
    if (!setup) return null
    const w = createEnvelopeModel()
    return {
      element: w.render(setup, 'lesson'),
      apply: (patch) => {
        const view: { partition?: boolean; reveal?: boolean } = {}
        if ('partition' in patch) view.partition = patch['partition'] === true
        if ('reveal' in patch) view.reveal = patch['reveal'] === true
        w.applyPatch(view)
      },
    }
  }
  return null // caption-only fallback for widgets without lesson support yet
}

export function LessonPlayer({
  explanation,
  params,
  kind,
  intro,
  embedded,
  onDone,
  onAnotherWay,
  onCancel,
}: LessonPlayerProps) {
  const steps = explanation.timeline
  const handoffStep = steps.find((s) => s.handoff)
  const handoffT = handoffStep?.t ?? steps[steps.length - 1]!.t
  // segments cover the content steps; a trailing handoff-only step is the
  // resting point, not a segment of its own
  const contentSteps = steps.filter((s) => s.patch !== undefined || s.caption !== undefined)
  const lastContentT = contentSteps[contentSteps.length - 1]?.t ?? 0

  const [preamble, setPreamble] = useState(intro !== undefined)
  const [time, setTime] = useState(0)
  const [playing, setPlaying] = useState(intro === undefined)
  const [speedIdx, setSpeedIdx] = useState(0)
  /** the handoff row stays once the end has been reached, even when scrubbing back */
  const [reachedEnd, setReachedEnd] = useState(false)
  /** bumped to rebuild the widget for backward seeks (patches only merge) */
  const [epoch, setEpoch] = useState(0)
  const appliedRef = useRef(-1)
  const widgetRef = useRef<LessonWidget | null>(null)

  const widget = useMemo(() => createLessonWidget(explanation, params), [explanation.id, epoch])
  // a fresh widget (new explanation or backward seek) replays from the top
  if (widgetRef.current !== widget) {
    widgetRef.current = widget
    appliedRef.current = -1
  }

  // last step whose time has been reached (over ALL steps — patches included)
  let stepIdx = -1
  for (let i = 0; i < steps.length; i++) if (steps[i]!.t <= time + 1e-9) stepIdx = i

  useEffect(() => {
    if (time >= lastContentT - 1e-9) setReachedEnd(true)
  }, [time, lastContentT])

  // reset per explanation (the another-way chain swaps explanations in place)
  const firstExplanation = useRef(explanation.id)
  useEffect(() => {
    if (firstExplanation.current === explanation.id) return
    firstExplanation.current = explanation.id
    setTime(0)
    setReachedEnd(false)
    setPlaying(true) // chained representations play right away — no preamble
    setPreamble(false)
  }, [explanation.id])

  // apply newly-reached patches (forward only; backward is handled by epoch)
  useEffect(() => {
    if (appliedRef.current > stepIdx) return
    for (let i = appliedRef.current + 1; i <= stepIdx; i++) {
      const p = steps[i]!.patch
      if (p && widget) widget.apply(p)
    }
    appliedRef.current = stepIdx
  }, [stepIdx, widget, steps])

  // autoplay: advance until the handoff time, then rest there
  useEffect(() => {
    if (!playing || preamble) return
    const speed = SPEEDS[speedIdx]!
    const id = setInterval(() => {
      setTime((t) => {
        const next = t + (TICK_MS / 1000) * speed
        if (next >= handoffT) {
          setPlaying(false)
          return handoffT
        }
        return next
      })
    }, TICK_MS)
    return () => clearInterval(id)
  }, [playing, preamble, speedIdx, handoffT])

  const seek = (target: number) => {
    setPlaying(false)
    let targetIdx = -1
    for (let i = 0; i < steps.length; i++) if (steps[i]!.t <= target + 1e-9) targetIdx = i
    if (targetIdx < appliedRef.current) {
      setEpoch((e) => e + 1) // fresh widget; patches replay from the top
    }
    setTime(target)
  }

  /** fill fraction of content segment i at the current time */
  const fillOf = (i: number): number => {
    const start = contentSteps[i]!.t
    const end = i + 1 < contentSteps.length ? contentSteps[i + 1]!.t : handoffT
    if (end <= start) return time >= start - 1e-9 ? 1 : 0
    if (time <= start) return 0
    if (time >= end) return 1
    return (time - start) / (end - start)
  }
  const currentSegIdx = contentSteps.reduce((acc, s, i) => (s.t <= time + 1e-9 ? i : acc), 0)

  // the caption sticks: latest step at/before now that HAS one
  let caption = ''
  for (let i = 0; i <= stepIdx; i++) {
    const c = steps[i]!.caption
    if (c !== undefined) caption = renderText(c, params)
  }

  if (preamble && intro) {
    return (
      <section className="card unlock" aria-label="What you're learning">
        <div className="card-kicker">
          <span className="kicker">NEW SKILL</span>
          <span className="mono-chip">representation: {explanation.representation}</span>
        </div>
        <p className="muted preamble-lead">Here's what you're learning:</p>
        <h1 className="preamble-title">{intro.title}</h1>
        {intro.plain && <p className="preamble-plain">{intro.plain}</p>}
        {intro.vocab && intro.vocab.length > 0 && (
          <dl className="preamble-vocab">
            {intro.vocab.map((v) => (
              <div key={v.term} className="vocab-row">
                <dt>{v.term}</dt>
                <dd>{v.meaning}</dd>
              </div>
            ))}
          </dl>
        )}
        <div className="answer-row" style={{ justifyContent: 'center' }}>
          <button
            className="btn btn-primary"
            onClick={() => {
              setPreamble(false)
              setPlaying(true)
            }}
          >
            Start the lesson
          </button>
        </div>
      </section>
    )
  }

  const body = (
    <>
      <div className="card-kicker">
        <span className={kind === 'lesson' ? 'kicker' : 'kicker kicker-alt'}>{KICKER[kind]}</span>
        <span className="mono-chip">representation: {explanation.representation}</span>
        {onCancel && (
          <button className="btn btn-quiet player-close" aria-label="Back to the problem" onClick={onCancel}>
            ✕
          </button>
        )}
      </div>
      <div className="lesson-stage" key={epoch}>
        {widget ? widget.element : null}
      </div>
      <p
        key={caption}
        className={widget ? 'lesson-caption lesson-caption-under' : 'lesson-caption'}
        data-testid="lesson-caption"
      >
        {caption}
      </p>
      <div className="lesson-controls">
        <button
          className="btn btn-round"
          aria-label={playing ? 'Pause' : 'Play'}
          onClick={() => {
            if (!playing && time >= handoffT) seek(0)
            setPlaying((p) => !p)
          }}
        >
          {playing ? '❚❚' : '▶'}
        </button>
        <div className="step-track" role="group" aria-label="Lesson timeline">
          {contentSteps.map((s, i) => (
            <button
              key={i}
              type="button"
              className="step-seg"
              aria-label={`Go to step ${i + 1} of ${contentSteps.length}`}
              aria-current={i === currentSegIdx ? 'step' : undefined}
              onClick={() => seek(s.t)}
            >
              <span className="step-fill" style={{ width: `${fillOf(i) * 100}%` }} />
            </button>
          ))}
        </div>
        <button
          className="btn btn-speed"
          aria-label={`Playback speed ${SPEEDS[speedIdx]}x`}
          onClick={() => setSpeedIdx((i) => (i + 1) % SPEEDS.length)}
        >
          {SPEEDS[speedIdx]}×
        </button>
      </div>
      {reachedEnd && (
        <div className="answer-row handoff-row">
          <button className="btn btn-primary handoff" onClick={onDone}>
            {handoffStep ? renderText(handoffStep.handoff!.prompt, params) : 'Now you try.'}
          </button>
          {onAnotherWay && (
            <button className="btn" onClick={onAnotherWay}>
              Show me another way
            </button>
          )}
        </div>
      )}
    </>
  )

  if (embedded) return <div className="embedded-player">{body}</div>
  return (
    <section className="card" aria-label={KICKER[kind]}>
      {body}
    </section>
  )
}

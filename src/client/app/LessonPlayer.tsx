/** The explanation player (§6, build step 4): a preamble naming what you're
 * learning, timed autoplay over the §4.3 timeline, play/pause, speed control,
 * a segmented step timeline (each rectangle fills through its step; click to
 * jump), backward-seek replay onto a fresh widget, interaction mid-timeline,
 * and handoff into faded/practice — with an optional "show me another way"
 * chain. Captions are the source of truth and are rendered by the player. */
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

export interface LessonPlayerProps {
  explanation: Explanation
  params: Params
  kind: 'lesson' | 'alt_explanation'
  /** what you're learning — shown as a preamble before play begins */
  title?: string
  onDone: () => void
  /** offered at the handoff: chain into an unseen representation */
  onAnotherWay?: () => void
}

const TICK_MS = 100
const SPEEDS = [1, 1.5, 2, 0.5] as const

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
  title,
  onDone,
  onAnotherWay,
}: LessonPlayerProps) {
  const steps = explanation.timeline
  const handoffT = steps.find((s) => s.handoff)?.t ?? steps[steps.length - 1]!.t

  const [preamble, setPreamble] = useState(title !== undefined)
  const [time, setTime] = useState(0)
  const [playing, setPlaying] = useState(title === undefined)
  const [speedIdx, setSpeedIdx] = useState(0)
  /** bumped to rebuild the widget for backward seeks (patches only merge) */
  const [epoch, setEpoch] = useState(0)
  const appliedRef = useRef(-1)

  const widget = useMemo(() => createLessonWidget(explanation, params), [explanation.id, epoch])

  // last step whose time has been reached
  let stepIdx = -1
  for (let i = 0; i < steps.length; i++) if (steps[i]!.t <= time + 1e-9) stepIdx = i
  const current = steps[Math.max(stepIdx, 0)]!

  // apply newly-reached patches (forward only; backward is handled by epoch)
  useEffect(() => {
    if (appliedRef.current > stepIdx) return
    for (let i = appliedRef.current + 1; i <= stepIdx; i++) {
      const p = steps[i]!.patch
      if (p && widget) widget.apply(p)
    }
    appliedRef.current = stepIdx
  }, [stepIdx, widget, steps])

  // autoplay: advance until the handoff step, then rest there
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
      appliedRef.current = -1
      setEpoch((e) => e + 1) // fresh widget; patches replay via the effect
    }
    setTime(target)
  }

  /** fill fraction of step segment i at the current time */
  const fillOf = (i: number): number => {
    const start = steps[i]!.t
    const end = i + 1 < steps.length ? steps[i + 1]!.t : handoffT
    if (time <= start) return 0
    if (time >= end || end <= start) return 1
    return (time - start) / (end - start)
  }

  const atHandoff = current.handoff !== undefined && stepIdx === steps.length - 1
  const caption = current.caption ? renderText(current.caption, params) : ''

  if (preamble) {
    return (
      <section className="card unlock" aria-label="What you're learning">
        <div className="card-kicker">
          <span className={kind === 'lesson' ? 'kicker' : 'kicker kicker-alt'}>
            {kind === 'lesson' ? 'NEW SKILL' : 'ANOTHER WAY TO SEE IT'}
          </span>
          <span className="mono-chip">representation: {explanation.representation}</span>
        </div>
        <p className="muted preamble-lead">{kind === 'lesson' ? "Here's what you're learning:" : 'Same idea, new picture:'}</p>
        <h1 className="preamble-title">{title}</h1>
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

  return (
    <section className="card" aria-label={kind === 'lesson' ? 'Lesson' : 'Another way to see it'}>
      <div className="card-kicker">
        <span className={kind === 'lesson' ? 'kicker' : 'kicker kicker-alt'}>
          {kind === 'lesson' ? 'LESSON' : "LET'S LOOK AT IT DIFFERENTLY"}
        </span>
        <span className="mono-chip">representation: {explanation.representation}</span>
      </div>
      {widget ? (
        <div className="lesson-stage" key={epoch}>
          {widget.element}
        </div>
      ) : null}
      <p className={widget ? 'lesson-caption lesson-caption-under' : 'lesson-caption'} data-testid="lesson-caption">
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
          {steps.map((_, i) => (
            <button
              key={i}
              type="button"
              className="step-seg"
              aria-label={`Go to step ${i + 1} of ${steps.length}`}
              aria-current={i === stepIdx ? 'step' : undefined}
              onClick={() => seek(steps[i]!.t)}
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
      {atHandoff && (
        <div className="answer-row handoff-row">
          <button className="btn btn-primary handoff" onClick={onDone}>
            {renderText(current.handoff!.prompt, params)}
          </button>
          {onAnotherWay && (
            <button className="btn" onClick={onAnotherWay}>
              Show me another way
            </button>
          )}
        </div>
      )}
    </section>
  )
}

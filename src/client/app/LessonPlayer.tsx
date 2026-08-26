/** The explanation player (§6, build step 4): timed autoplay over the §4.3
 * timeline, play/pause, scrubbing (backward seeks replay patches onto a fresh
 * widget), interaction mid-timeline (pausing never blocks the widget), and
 * handoff into faded/practice. Captions are the source of truth and are
 * rendered by the player itself for every widget type. */
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import type { Explanation } from '@openmastery/schema'
import type { WidgetInstance } from '../widgets/contract'
import { createBalanceScale } from '../viz/balance-scale'
import { createNumberLine } from '../widgets/number-line'
import {
  adaptBalancePatch,
  adaptNumberLinePatch,
  numberLineSetup,
  renderText,
  type Params,
} from './render'

export interface LessonPlayerProps {
  explanation: Explanation
  params: Params
  kind: 'lesson' | 'alt_explanation'
  onDone: () => void
}

const TICK_MS = 100

interface LessonWidget {
  element: ReactElement
  apply: (patch: Record<string, unknown>) => void
}

function createLessonWidget(
  explanation: Explanation,
  params: Params,
): LessonWidget | null {
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
  return null // caption-only fallback for widgets without lesson support yet
}

export function LessonPlayer({ explanation, params, kind, onDone }: LessonPlayerProps) {
  const steps = explanation.timeline
  const lastT = steps[steps.length - 1]!.t
  const handoffT = steps.find((s) => s.handoff)?.t ?? lastT

  const [time, setTime] = useState(0)
  const [playing, setPlaying] = useState(true)
  /** bumped to rebuild the widget for backward seeks (patches only merge) */
  const [epoch, setEpoch] = useState(0)
  const appliedRef = useRef(-1)

  const widget = useMemo(
    () => createLessonWidget(explanation, params),
    [explanation.id, epoch],
  )

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
    if (!playing) return
    const id = setInterval(() => {
      setTime((t) => {
        const next = t + TICK_MS / 1000
        if (next >= handoffT) {
          setPlaying(false)
          return handoffT
        }
        return next
      })
    }, TICK_MS)
    return () => clearInterval(id)
  }, [playing, handoffT])

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

  const atHandoff = current.handoff !== undefined && stepIdx === steps.length - 1
  const caption = current.caption ? renderText(current.caption, params) : ''

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
        <input
          type="range"
          className="lesson-scrub"
          aria-label="Lesson timeline"
          min={0}
          max={handoffT}
          step={0.1}
          value={Math.min(time, handoffT)}
          onChange={(e) => seek(Number(e.target.value))}
        />
        <div className="dots" aria-hidden>
          {steps.map((s, i) => (
            <button
              key={i}
              type="button"
              tabIndex={-1}
              className={i <= stepIdx ? 'dot dot-on' : 'dot'}
              onClick={() => seek(s.t)}
            />
          ))}
        </div>
        {atHandoff && (
          <button className="btn btn-primary handoff" onClick={onDone}>
            {renderText(current.handoff!.prompt, params)}
          </button>
        )}
      </div>
    </section>
  )
}

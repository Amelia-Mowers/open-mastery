/** Stepwise problem player — the unified-widget direction's first rung
 * beyond autoplay. Plays a timeline like a lesson UNTIL a step carrying
 * `expect`, then PAUSES: the student must construct that step's move (op
 * entry or typed value/line) before the step's patch plays as
 * confirmation. Wrong try → hint; second wrong try → the move is revealed
 * and played (counted). The answer box below the player stays live the
 * whole time, so a student who can produce the final answer skips the
 * process entirely (expertise-reversal guard).
 *
 * Grading here is instructional (client-side, same graders the server
 * uses): timelines already display their own resolutions, so expects leak
 * nothing the walkthrough doesn't. The ITEM answer below remains
 * server-graded evidence. */
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Explanation, TimelineStep, StepExpect } from '@openmastery/schema'
import { gradeAnswer, type AnswerSpec } from '../../core/graders'
import { createLessonWidget } from './LessonPlayer'
import { renderText, type Params } from './render'
import { OpEntry, type OpMove } from '../widgets/op-entry'

export interface StepwiseResult {
  /** wrong tries across all expects */
  misses: number
  /** expects the player had to reveal (two wrong tries) */
  reveals: number
}

const STEP_DELAY_MS = 1700
const CONFIRM_DELAY_MS = 350

/** does this (possibly truncated) timeline make a stepwise problem? */
export const hasExpects = (timeline: ReadonlyArray<TimelineStep>): boolean =>
  timeline.some((st) => st.expect !== undefined)

export function StepwisePlayer({
  explanation,
  params,
  onReachedEnd,
  stepDelayMs = STEP_DELAY_MS,
}: {
  explanation: Explanation
  params: Params
  onReachedEnd?: (result: StepwiseResult) => void
  stepDelayMs?: number
}) {
  const steps = useMemo(
    () => explanation.timeline.filter((st) => st.patch !== undefined || st.caption !== undefined),
    [explanation],
  )
  const widget = useMemo(() => createLessonWidget(explanation, params), [explanation.id])
  const [applied, setApplied] = useState(0)
  const [unlocked, setUnlocked] = useState<ReadonlySet<number>>(new Set())
  const [tries, setTries] = useState(0)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [move, setMove] = useState<OpMove>({ op: null, by: '' })
  const [typed, setTyped] = useState('')
  const tallies = useRef<StepwiseResult>({ misses: 0, reveals: 0 })
  const endNotified = useRef(false)

  const pending = applied < steps.length ? steps[applied]! : null
  const waitingOn: StepExpect | null =
    pending?.expect !== undefined && !unlocked.has(applied) ? pending.expect : null

  // a reveal note lingers while its move plays; clear it when a NEW gate opens
  useEffect(() => {
    if (waitingOn !== null) setFeedback(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applied])

  // advance: apply non-gated steps on a cadence; gated steps wait for input
  useEffect(() => {
    if (pending === null) {
      if (!endNotified.current) {
        endNotified.current = true
        onReachedEnd?.(tallies.current)
      }
      return
    }
    if (waitingOn !== null) return
    const confirm = pending.expect !== undefined
    const timer = setTimeout(
      () => {
        if (pending.patch && widget) widget.apply(pending.patch)
        setApplied((n) => n + 1)
      },
      applied === 0 ? 0 : confirm ? CONFIRM_DELAY_MS : stepDelayMs,
    )
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applied, waitingOn === null])

  // sticky caption + equation banner from the steps applied so far
  let caption = ''
  let equation: string[] | null = null
  let eqHighlight: number[] = []
  for (let i = 0; i < applied; i++) {
    const st = steps[i]!
    if (st.caption !== undefined) caption = renderText(st.caption, params)
    const patch = st.patch
    if (patch) {
      if (Array.isArray(patch['equation']))
        equation = (patch['equation'] as unknown[]).map((seg) => renderText(String(seg), params))
      if (Array.isArray(patch['eqHighlight']))
        eqHighlight = (patch['eqHighlight'] as unknown[])
          .map((v) => Number(v))
          .filter((v) => Number.isInteger(v))
    }
  }

  const submitStep = (raw: string) => {
    if (waitingOn === null) return
    const spec = { type: waitingOn.type, value: waitingOn.value } as AnswerSpec
    const verdict = gradeAnswer(spec, params as never, raw)
    if (verdict.verdict === 'correct') {
      setFeedback(null)
      setTries(0)
      setMove({ op: null, by: '' })
      setTyped('')
      setUnlocked((u) => new Set([...u, applied]))
      return
    }
    tallies.current.misses += 1
    if (tries === 0) {
      setTries(1)
      setFeedback(
        waitingOn.hint !== undefined
          ? renderText(waitingOn.hint, params)
          : 'Not quite — look at the equation and try again.',
      )
      return
    }
    // second wrong try: reveal the move and play it
    tallies.current.reveals += 1
    const shown =
      typeof waitingOn.value === 'string' ? renderText(waitingOn.value, params) : String(waitingOn.value)
    setFeedback(`The move: ${shown}. Watch it play — you'll get the next one.`)
    setTries(0)
    setMove({ op: null, by: '' })
    setTyped('')
    setUnlocked((u) => new Set([...u, applied]))
  }

  return (
    <div className="stepwise" data-testid="stepwise">
      {equation && (
        <div className="lesson-equation" aria-label={`Equation ${equation.join('')}`}>
          {equation.map((seg, i) => (
            <span key={`${i}-${eqHighlight.includes(i)}`} className={eqHighlight.includes(i) ? 'eq-seg eq-hl' : 'eq-seg'}>
              {seg}
            </span>
          ))}
        </div>
      )}
      <div className="lesson-stage">{widget ? widget.element : null}</div>
      <p key={caption} className={widget ? 'lesson-caption lesson-caption-under' : 'lesson-caption'} data-testid="stepwise-caption">
        {caption}
      </p>
      {waitingOn !== null && (
        <div className="stepwise-gate" data-testid="stepwise-gate">
          <p className="stepwise-prompt">
            {waitingOn.prompt !== undefined
              ? renderText(waitingOn.prompt, params)
              : waitingOn.type === 'op'
                ? 'Your move — what do we do to both sides?'
                : 'Your move — write the next step.'}
          </p>
          {waitingOn.type === 'op' ? (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                submitStep(move.op !== null && move.by.trim() !== '' ? `${move.op} ${move.by.trim()}` : '')
              }}
            >
              <OpEntry move={move} disabled={false} onChange={setMove} ariaLabel="Operation to apply to both sides" />
              <div className="answer-row" style={{ justifyContent: 'center' }}>
                <button type="submit" className="btn btn-primary" data-testid="stepwise-check">
                  That's my move
                </button>
              </div>
            </form>
          ) : (
            <form
              className="answer-row"
              style={{ justifyContent: 'center' }}
              onSubmit={(e) => {
                e.preventDefault()
                submitStep(typed.trim())
              }}
            >
              <input
                className="answer-input"
                aria-label="Your next step"
                value={typed}
                autoFocus
                onChange={(e) => setTyped(e.target.value)}
              />
              <button type="submit" className="btn btn-primary" data-testid="stepwise-check">
                That's my move
              </button>
            </form>
          )}
        </div>
      )}
      {feedback !== null && (
        <p className="stepwise-feedback" data-testid="stepwise-feedback">
          {feedback}
        </p>
      )}
      {pending === null && (
        <p className="muted stepwise-done" data-testid="stepwise-done">
          One step left — put the answer in the box below.
        </p>
      )}
      {applied > 0 && pending !== null && waitingOn === null && (
        <p className="muted stepwise-skip">Know the answer already? Type it below anytime.</p>
      )}
    </div>
  )
}

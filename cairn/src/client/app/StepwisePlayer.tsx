/** Stepwise problem player — assistance as a spectrum, not categories. A
 * timeline plays like a lesson until a step carrying `expect`, then PAUSES:
 * the student constructs that step's move (op entry, typed line, or picking
 * the equation piece a decomposition step is about) before the step's patch
 * plays as confirmation. Wrong try → hint; second wrong try or "Show me" →
 * the widget solves that step (counted). Completed steps are scrubbable.
 * The answer box below the player stays live the whole time, so a student
 * who can produce the final answer skips the process (expertise-reversal
 * guard).
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
  /** expects the player had to reveal (two wrong tries or "Show me") */
  reveals: number
}

const STEP_DELAY_MS = 1700
const CONFIRM_DELAY_MS = 350

/** does this (possibly truncated) timeline make a stepwise problem? */
export const hasExpects = (timeline: ReadonlyArray<TimelineStep>): boolean =>
  timeline.some((st) => st.expect !== undefined)

/** sticky caption + equation banner state after steps[0..upto) */
function stickyState(steps: TimelineStep[], upto: number, params: Params) {
  let caption = ''
  let equation: string[] | null = null
  let eqHighlight: number[] = []
  for (let i = 0; i < upto; i++) {
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
  return { caption, equation, eqHighlight }
}

export function StepwisePlayer({
  explanation,
  params,
  onReachedEnd,
  onEngaged,
  stepDelayMs = STEP_DELAY_MS,
}: {
  explanation: Explanation
  params: Params
  onReachedEnd?: (result: StepwiseResult) => void
  /** first interaction with any gate (a submit or "Show me") — the host
   * marks the try as assisted; skipping straight to the answer never fires */
  onEngaged?: () => void
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
  const [picked, setPicked] = useState<ReadonlySet<number>>(new Set())
  /** reviewing an earlier step (index into steps), or null = live frontier */
  const [scrub, setScrub] = useState<number | null>(null)
  const tallies = useRef<StepwiseResult>({ misses: 0, reveals: 0 })
  const endNotified = useRef(false)
  const engagedNotified = useRef(false)

  const pending = applied < steps.length ? steps[applied]! : null
  const waitingOn: StepExpect | null =
    pending?.expect !== undefined && !unlocked.has(applied) ? pending.expect : null

  const engage = () => {
    if (engagedNotified.current) return
    engagedNotified.current = true
    onEngaged?.()
  }

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

  // scrub view: a fresh widget replayed to the reviewed step (the live
  // widget keeps its state untouched underneath)
  const scrubWidget = useMemo(() => {
    if (scrub === null) return null
    const w = createLessonWidget(explanation, params)
    if (w) for (let i = 0; i <= scrub; i++) if (steps[i]!.patch) w.apply(steps[i]!.patch!)
    return w
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrub])

  const live = stickyState(steps, applied, params)
  const view = scrub === null ? live : stickyState(steps, scrub + 1, params)
  const shownWidget = scrub === null ? widget : scrubWidget

  const unlock = () => {
    setTries(0)
    setMove({ op: null, by: '' })
    setTyped('')
    setPicked(new Set())
    setUnlocked((u) => new Set([...u, applied]))
  }

  const reveal = (lead: string) => {
    if (waitingOn === null) return
    tallies.current.reveals += 1
    const shown =
      waitingOn.type === 'pick'
        ? (live.equation ?? [])
            .filter((_, i) => (waitingOn.value as unknown[]).map(Number).includes(i))
            .join('')
            .trim()
        : typeof waitingOn.value === 'string'
          ? renderText(waitingOn.value, params)
          : String(waitingOn.value)
    setFeedback(
      `${lead} ${waitingOn.type === 'pick' ? `this piece — ${shown}` : shown}. Watch it play — you'll get the next one.`,
    )
    unlock()
  }

  const submitStep = (raw: string) => {
    if (waitingOn === null) return
    engage()
    const correct =
      waitingOn.type === 'pick'
        ? // set equality: exactly the expected segments, no more, no fewer
          (() => {
            const want = new Set((waitingOn.value as unknown[]).map(Number))
            return picked.size === want.size && [...picked].every((i) => want.has(i))
          })()
        : gradeAnswer(
            { type: waitingOn.type, value: waitingOn.value } as AnswerSpec,
            params as never,
            raw,
          ).verdict === 'correct'
    if (correct) {
      setFeedback(null)
      unlock()
      return
    }
    tallies.current.misses += 1
    const missLead = waitingOn.type === 'pick' ? 'Not that piece.' : 'Not quite.'
    if (tries === 0) {
      setTries(1)
      setFeedback(
        waitingOn.hint !== undefined
          ? `${missLead} ${renderText(waitingOn.hint, params)}`
          : `${missLead} Look at the equation and try again.`,
      )
      return
    }
    reveal(waitingOn.type === 'pick' ? 'It was' : 'The move:')
  }

  const gatePrompt = (e: StepExpect): string =>
    e.prompt !== undefined
      ? renderText(e.prompt, params)
      : e.type === 'op'
        ? 'Your move — what do we do to both sides?'
        : e.type === 'pick'
          ? 'Click the piece of the equation this step is about.'
          : 'Your move — write the next step.'

  return (
    <div className="stepwise" data-testid="stepwise">
      {view.equation && (
        <div className="lesson-equation" aria-label={`Equation ${view.equation.join('')}`}>
          {view.equation.map((seg, i) => (
            <span
              key={`${i}-${view.eqHighlight.includes(i)}`}
              className={view.eqHighlight.includes(i) ? 'eq-seg eq-hl' : 'eq-seg'}
            >
              {seg}
            </span>
          ))}
        </div>
      )}
      <div className="lesson-stage" key={scrub ?? 'live'}>
        {shownWidget ? shownWidget.element : null}
      </div>
      <p
        key={view.caption}
        className={shownWidget ? 'lesson-caption lesson-caption-under' : 'lesson-caption'}
        data-testid="stepwise-caption"
      >
        {view.caption}
      </p>
      {/* scrub through what has played so far; the frontier stays put */}
      {applied > 1 && (
        <div className="stepwise-track" role="group" aria-label="Steps so far">
          {steps.slice(0, applied).map((_, i) => (
            <button
              key={i}
              type="button"
              data-step-dot={i}
              className={
                (scrub === null ? i === applied - 1 : i === scrub)
                  ? 'stepwise-dot stepwise-dot-on'
                  : 'stepwise-dot'
              }
              aria-label={`Step ${i + 1} of ${applied}`}
              onClick={() => setScrub(i === applied - 1 ? null : i)}
            />
          ))}
          {scrub !== null && (
            <button type="button" className="btn btn-quiet" data-testid="stepwise-resume" onClick={() => setScrub(null)}>
              Back to now
            </button>
          )}
        </div>
      )}
      {waitingOn !== null && scrub === null && (
        <div className="stepwise-gate" data-testid="stepwise-gate">
          <p className="stepwise-prompt">{gatePrompt(waitingOn)}</p>
          {waitingOn.type === 'pick' ? (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                if (picked.size > 0) submitStep('')
              }}
            >
              <div className="stepwise-pick" role="group" aria-label="Pick the piece of the equation">
                {(live.equation ?? []).map((seg, i) =>
                  seg.trim() === '' ? null : (
                    <button
                      key={i}
                      type="button"
                      className="stepwise-pick-seg"
                      data-pick-seg={i}
                      aria-pressed={picked.has(i)}
                      onClick={() =>
                        setPicked((ps) => {
                          const next = new Set(ps)
                          if (next.has(i)) next.delete(i)
                          else next.add(i)
                          return next
                        })
                      }
                    >
                      {seg.trim()}
                    </button>
                  ),
                )}
              </div>
              <div className="answer-row" style={{ justifyContent: 'center' }}>
                <button type="submit" className="btn btn-primary" data-testid="stepwise-check" disabled={picked.size === 0}>
                  That's my pick
                </button>
              </div>
            </form>
          ) : waitingOn.type === 'op' ? (
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
          <div className="answer-row" style={{ justifyContent: 'center', marginTop: 6 }}>
            <button
              type="button"
              className="btn btn-quiet"
              data-testid="stepwise-showme"
              onClick={() => {
                engage()
                reveal('Show me:')
              }}
            >
              Show me
            </button>
          </div>
        </div>
      )}
      {feedback !== null && scrub === null && (
        <p className="stepwise-feedback" data-testid="stepwise-feedback">
          {feedback}
        </p>
      )}
      {pending === null && scrub === null && (
        <p className="muted stepwise-done" data-testid="stepwise-done">
          One step left — put the answer in the box below.
        </p>
      )}
      {applied > 0 && pending !== null && waitingOn === null && scrub === null && (
        <p className="muted stepwise-skip">Know the answer already? Type it below anytime.</p>
      )}
    </div>
  )
}

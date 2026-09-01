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
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { speech } from '../tts/speech'
import type { Explanation, TimelineStep, StepExpect } from '@openmastery/schema'
import { diagnose, gradeAnswer, type AnswerSpec } from '../../core/graders'
import { createLessonWidget } from './LessonPlayer'
import { renderText, type Params } from './render'
import { OpEntry, type OpMove } from '../widgets/op-entry'
import { SmoothHeight } from './SmoothHeight'

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
  onStep,
  stepDelayMs = STEP_DELAY_MS,
}: {
  explanation: Explanation
  params: Params
  onReachedEnd?: (result: StepwiseResult) => void
  /** the student TOOK HELP at a gate — a missed step or a "Show me"
   * reveal. Working the steps correctly is the primary path, not
   * assistance, so a right answer never fires this; nor does skipping
   * straight to the answer box. */
  onEngaged?: () => void
  /** every MOVE the student makes at a gate — right, wrong, or revealed.
   * The host turns these into step_attempt events, which is what lets the
   * engine say WHICH step broke rather than only that the problem did. */
  onStep?: (move: {
    stepIndex: number
    expectType: string
    answer: unknown
    correct: boolean
    revealed: boolean
    misconceptionId?: string
    latencyMs: number
  }) => void
  stepDelayMs?: number
}) {
  const steps = useMemo(
    () => explanation.timeline.filter((st) => st.patch !== undefined || st.caption !== undefined),
    [explanation],
  )

  // optimistic voice: synthesize every caption and gate question this
  // lead will show, so speech starts WITH each step
  const voiceOn = useSyncExternalStore(speech.subscribe, () => speech.getState().enabled, () => false)
  useEffect(() => {
    if (!voiceOn) return
    const texts: string[] = []
    for (const st of steps) {
      if (st.caption !== undefined) texts.push(renderText(st.caption, params))
      if (st.expect?.prompt !== undefined) texts.push(renderText(st.expect.prompt, params))
    }
    speech.pregenerate(texts.filter((t) => t !== ''))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [explanation.id, voiceOn])
  const widget = useMemo(() => createLessonWidget(explanation, params), [explanation.id])
  const [applied, setApplied] = useState(0)
  const [unlocked, setUnlocked] = useState<ReadonlySet<number>>(new Set())
  const [tries, setTries] = useState(0)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [move, setMove] = useState<OpMove>({ op: null, by: '' })
  const [typed, setTyped] = useState('')
  const [picked, setPicked] = useState<ReadonlySet<number>>(new Set())
  /** pulse whichever gate inputs are missing after an attempted submit */
  const [nudge, setNudge] = useState<{ seq: number; parts: ReadonlyArray<'op' | 'by'> }>({
    seq: 0,
    parts: [],
  })
  /** reviewing an earlier step (index into steps), or null = live frontier */
  const [scrub, setScrub] = useState<number | null>(null)
  const tallies = useRef<StepwiseResult>({ misses: 0, reveals: 0 })
  /** when the current gate opened, for per-move latency */
  const gateShownAt = useRef(performance.now())
  const endNotified = useRef(false)
  const engagedNotified = useRef(false)
  /** last active gate content height — the between-gates state holds this
   * size so the panel tweens gate→gate directly, never dipping small */
  const gateRef = useRef<HTMLDivElement | null>(null)
  const lastGateH = useRef<number | null>(null)

  const pending = applied < steps.length ? steps[applied]! : null
  const waitingOn: StepExpect | null =
    pending?.expect !== undefined && !unlocked.has(applied) ? pending.expect : null
  /** gates still to come (incl. the active one): the panel stays mounted and
   * tweens between its contents instead of closing and reopening */
  const gatesAhead = steps.slice(applied).some((st) => st.expect !== undefined)

  const engage = () => {
    if (engagedNotified.current) return
    engagedNotified.current = true
    onEngaged?.()
  }

  // remember the open gate's rendered height (updates as hints appear)
  useEffect(() => {
    if (waitingOn !== null && gateRef.current) {
      const h = gateRef.current.offsetHeight
      if (h > 0) lastGateH.current = h
    }
  })

  // a reveal note lingers while its move plays; clear it once the NEXT
  // gate's input is open (waitingOn non-null at a fresh frontier)
  useEffect(() => {
    if (waitingOn !== null) {
      setFeedback(null)
      // time each MOVE from the moment its gate opened — a per-problem
      // clock would just measure how long the lead took to play
      gateShownAt.current = performance.now()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waitingOn !== null ? applied : -1])

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
    setNudge({ seq: 0, parts: [] })
    setUnlocked((u) => new Set([...u, applied]))
  }

  /** an incomplete entry is never a miss — pulse what's missing instead */
  const nudgeParts = (parts: ReadonlyArray<'op' | 'by'>) => {
    setNudge((n) => ({ seq: n.seq + 1, parts }))
  }

  const reveal = (lead: string) => {
    if (waitingOn === null) return
    tallies.current.reveals += 1
    onStep?.({
      stepIndex: applied,
      expectType: waitingOn.type,
      answer: null,
      correct: false,
      revealed: true,
      latencyMs: Math.round(performance.now() - gateShownAt.current),
    })
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
    const correct =
      waitingOn.type === 'pick'
        ? // set equality: exactly the expected segments, no more, no fewer
          (() => {
            const want = new Set((waitingOn.value as unknown[]).map(Number))
            return picked.size === want.size && [...picked].every((i) => want.has(i))
          })()
        : gradeAnswer(
            // carry the gate's `form` through: without it a gate accepts
            // the unsimplified line the board already shows
            {
              type: waitingOn.type,
              value: waitingOn.value,
              ...(waitingOn.form ? { form: waitingOn.form } : {}),
            } as AnswerSpec,
            params as never,
            raw,
          ).verdict === 'correct'
    if (correct) {
      onStep?.({
        stepIndex: applied,
        expectType: waitingOn.type,
        answer: waitingOn.type === 'pick' ? [...picked] : raw,
        correct: true,
        revealed: false,
        latencyMs: Math.round(performance.now() - gateShownAt.current),
      })
      setFeedback(null)
      unlock()
      return
    }
    tallies.current.misses += 1
    // help starts HERE, on a missed step — not on engaging the gate at
    // all. Working the steps correctly is the primary path and must not
    // be charged as assistance.
    engage()
    // a wrong set clears itself: leaving it lit turned "click x instead"
    // into {x, 21} — one mistake charged as two misses
    if (waitingOn.type === 'pick') setPicked(new Set())
    // the same diagnosis standard as final answers, applied to this move
    const named = diagnose(waitingOn.misconceptions, params as never, raw)
    onStep?.({
      stepIndex: applied,
      expectType: waitingOn.type,
      answer: waitingOn.type === 'pick' ? [...picked] : raw,
      correct: false,
      revealed: false,
      ...(named ? { misconceptionId: named.id } : {}),
      latencyMs: Math.round(performance.now() - gateShownAt.current),
    })
    if (named) {
      setTries(1)
      setFeedback(named.says)
      return
    }
    let missLead = 'Not quite.'
    if (waitingOn.type === 'pick') {
      const want = new Set((waitingOn.value as unknown[]).map(Number))
      const allInside = [...picked].every((i) => want.has(i))
      missLead =
        allInside && picked.size < want.size
          ? 'Almost — more than one piece goes together. Pick ALL of them.'
          : picked.size > 1
            ? 'Not those pieces.'
            : 'Not that piece.'
    }
    // The gate NEVER solves itself: a second miss repeats the hint and points
    // at "Show me", which the student chooses. Taking the step away is the
    // one thing that turns a problem back into a lesson against their will.
    setTries(tries + 1)
    const hint =
      waitingOn.hint !== undefined
        ? renderText(waitingOn.hint, params)
        : 'Look at the equation and try again.'
    setFeedback(
      tries === 0
        ? `${missLead} ${hint}`
        : `${missLead} ${hint} — or tap “Show me” and I'll walk this step.`,
    )
  }

  const gatePrompt = (e: StepExpect): string =>
    e.prompt !== undefined
      ? renderText(e.prompt, params)
      : e.type === 'op'
        ? 'Your move — what do we do to both sides?'
        : e.type === 'pick'
          ? 'Click the piece — or pieces — of the equation this step uses.'
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
        {shownWidget ? (
          shownWidget.element
        ) : (
          // NO SILENT FALLBACK: the gates below ask about a diagram
          // ("which piece goes in the left pan?"). Rendering nothing
          // leaves the student answering questions about an invisible
          // picture, so say what happened instead. Reachable when an
          // instance's generated params fall outside a widget setup's
          // guards — lesson-coverage only proves the FAMILY params build.
          <p className="lesson-caption" role="status" data-testid="stepwise-no-widget">
            This walk-through could not be drawn for these numbers.
          </p>
        )}
      </div>
      <p
        key={view.caption}
        className={shownWidget ? 'lesson-caption lesson-caption-under' : 'lesson-caption'}
        data-testid="stepwise-caption"
      >
        {view.caption}
      </p>
      <SpeakLine text={waitingOn !== null ? `${view.caption} ${gatePrompt(waitingOn)}` : view.caption} />
      <SmoothHeight>
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
      {gatesAhead && scrub === null && (
        <div className="stepwise-gate" data-testid="stepwise-gate">
          {waitingOn === null ? (
            <div
              className="stepwise-gate-content"
              key={`wait-${applied}`}
              style={{
                minHeight: lastGateH.current ?? undefined,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {feedback !== null && (
                <p className="stepwise-feedback" data-testid="stepwise-feedback">
                  {feedback}
                </p>
              )}
            </div>
          ) : (
          <div className="stepwise-gate-content" key={`gate-${applied}`} ref={gateRef}>
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
                if (move.op === null || move.by.trim() === '') {
                  nudgeParts([
                    ...(move.op === null ? (['op'] as const) : []),
                    ...(move.by.trim() === '' ? (['by'] as const) : []),
                  ])
                  return
                }
                submitStep(`${move.op} ${move.by.trim()}`)
              }}
            >
              <OpEntry
                move={move}
                disabled={false}
                onChange={setMove}
                ariaLabel="Operation to apply to both sides"
                nudge={nudge}
              />
              <div className="answer-row" style={{ justifyContent: 'center' }}>
                <button
                  type="submit"
                  className="btn btn-primary"
                  data-testid="stepwise-check"
                  aria-disabled={move.op === null || move.by.trim() === ''}
                  title={
                    move.op === null || move.by.trim() === ''
                      ? 'Pick the operation AND the amount first'
                      : undefined
                  }
                >
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
                if (typed.trim() === '') {
                  nudgeParts(['by'])
                  return
                }
                submitStep(typed.trim())
              }}
            >
              <input
                key={`typed-${nudge.seq}`}
                className={nudge.parts.includes('by') ? 'answer-input sw-nudge' : 'answer-input'}
                aria-label="Your next step"
                inputMode="decimal"
                value={typed}
                autoFocus
                onChange={(e) => setTyped(e.target.value)}
              />
              <button
                type="submit"
                className="btn btn-primary"
                data-testid="stepwise-check"
                aria-disabled={typed.trim() === ''}
                title={typed.trim() === '' ? 'Write the step first' : undefined}
              >
                That's my move
              </button>
            </form>
          )}
          {feedback !== null && (
            <p className="stepwise-feedback" data-testid="stepwise-feedback">
              {feedback}
            </p>
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
        </div>
      )}
      {!gatesAhead && feedback !== null && scrub === null && (
        <p className="stepwise-feedback" data-testid="stepwise-feedback">
          {feedback}
        </p>
      )}
      {pending === null && scrub === null && (
        <p className="muted stepwise-done" data-testid="stepwise-done">
          One step left — put the answer in the box below.
        </p>
      )}
      </SmoothHeight>
    </div>
  )
}


/** Voice: read the caption — and the open gate's question — as they land. */
function SpeakLine({ text }: { text: string }) {
  useEffect(() => {
    if (text.trim() !== '') void speech.speak(text)
    return () => speech.stop()
  }, [text])
  return null
}

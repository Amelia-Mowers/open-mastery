/** One served item: stem, answer widget, optional viz, hints, feedback, and
 * an in-place walk-through of the skill with this problem's own numbers.
 * All copy here is child-facing: encouraging, no mastery-model internals. */
import { useEffect, useMemo, useState } from 'react'
import type { Explanation } from '@openmastery/schema'
import type { NextAction } from '../../core/engine'
import { createWidget } from '../widgets/registry'
import { createBalanceScale } from '../viz/balance-scale'
import { createEnvelopeModel } from '../viz/envelope-model'
import { StepwisePlayer, hasExpects } from './StepwisePlayer'
import { SmoothHeight } from './SmoothHeight'
import { LessonPlayer } from './LessonPlayer'
import { evalNumber, renderText, type Params } from './render'
import type { AttemptOutcome, ClientItem, ExplainResult } from './api'

type ServeAction = Extract<NextAction, { kind: 'serve_item' }>

export interface ItemCardProps {
  action: ServeAction
  item: ClientItem
  /** points before this attempt (to show the delta as juice) */
  pointsBefore: number
  /** mastery estimate (0..1) for this item's skill, before the attempt */
  mastery: number
  onSubmit: (raw: string, hintLevel: number, latencyMs: number) => Promise<AttemptOutcome>
  /** one retry of a missed practice item — same instance, second attempt
   * is honest evidence (interim until the ladder retries stepwise) */
  onRetry?: () => Promise<void>
  /** continue; focus 'skill-id' keeps practicing that skill, null moves on */
  onContinue: (focus?: string | null) => void
  onStartCheck: (skillId: string) => void
  /** fetch an explanation for this problem's skill (server supplies the
   * pending instance's params; the item's representation is preferred, or
   * with sameAsLesson the representation the initial lesson used) */
  fetchExplanation: (excludeReps: string[], sameAsLesson?: boolean) => Promise<ExplainResult>
  /** report a completed walk-through so it lands in the event log */
  onExplained: (explanationId: string) => void
  /** the check is unlocked but the student chose more practice first */
  showInlineCheckOffer: boolean
  /** report one stepwise MOVE so the engine can say which step broke */
  onStepAttempt?: (move: {
    itemId: string
    paramHash: string
    skillId: string
    explanationId: string
    stepIndex: number
    expectType: string
    answer: unknown
    correct: boolean
    revealed: boolean
    misconceptionId?: string
    latencyMs: number
  }) => void
}

interface InlinePlay {
  explanation: Explanation
  params: Params
  seenReps: string[]
  totalReps: number
  sameNumbers?: boolean
}

/** widget types whose answer space is a text field — these sit inline with
 * the buttons; every other input widget gets a full-width row of its own */
const TEXT_INPUTS = new Set(['numeric-input', 'expression-input', 'equation-input'])

/** the rank boundaries a departure milestone is named for (mirrors
 * SiteCore.MILESTONE_RANKS) — the bar shows how far along the climb is */
const MILESTONE_MARKS = [0.2, 0.45, 0.7]

const KICKERS: Record<ServeAction['itemKind'], string> = {
  review: 'QUICK REVIEW',
  practice: 'PRACTICE',
  check: 'MASTERY CHECK',
  probe: 'QUICK LOOK AT AN EARLIER SKILL',
}

export function ItemCard({
  action,
  item,
  pointsBefore,
  mastery,
  onSubmit,
  onRetry,
  onContinue,
  onStartCheck,
  fetchExplanation,
  onExplained,
  showInlineCheckOffer,
  onStepAttempt,
}: ItemCardProps) {
  const params = action.instance.params as Params
  const isCheck = action.itemKind === 'check'
  // An OFFER is not a reveal. The corrective ladder offers help after a
  // miss, but pre-opening the hint hands the student text they never
  // asked for — and, because revealedHints is submitted as the hint
  // level, DISCOUNTS their mastery credit for help they did not take.
  // The offer surfaces the button (and pulses it); the student decides.
  const [revealedHints, setRevealedHints] = useState(0)
  const hintOffered = !isCheck && (action.offeredHintLevel ?? 0) > 0
  const [outcome, setOutcome] = useState<AttemptOutcome | null>(null)
  /** the one interim retry has been spent on this instance */
  const [retriedOnce, setRetriedOnce] = useState(false)
  /** the open stepwise gate's hint — the Hint button serves THIS step's
   * help while a gate is open (S-06: problem-ladder hints answered the
   * wrong step) */
  const [gateHint, setGateHint] = useState<string | null>(null)
  const [shownGateHint, setShownGateHint] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  /** the walk-through playing inside this card */
  const [inline, setInline] = useState<InlinePlay | null>(null)
  /** watched the walk-through → this try counts as helped */
  const [explained, setExplained] = useState(false)
  /** watched a full walk-through end to end — maximal assistance, and
   * distinct from taking help at a stepwise gate (which is level 1) */
  const [watchedFull, setWatchedFull] = useState(false)
  /** took help at a stepwise gate (missed a step, or asked "Show me") */
  const [gateHelped, setGateHelped] = useState(false)
  /** the student CLICKED for help (vs help offered/served) — copy only */
  const [askedForHelp, setAskedForHelp] = useState(false)
  /** the bar the student sees; jumps to the server's post-attempt value */
  const [shownMastery, setShownMastery] = useState(mastery)
  /** faded phase: the skill's explanation, THIS instance's numbers, played
   * up to just before the resolution — the student finishes it below */
  const [fadedLead, setFadedLead] = useState<InlinePlay | null>(null)
  /** the lead finished playing — only NOW guide the eye to the answer box */
  const [leadDone, setLeadDone] = useState(false)
  const startedAt = useMemo(() => performance.now(), [action.instance.paramHash])

  const widget = useMemo(() => {
    const { stem: _stem, ...config } = (item.widget.config ?? {}) as Record<string, unknown>
    const variable = typeof params['variable'] === 'string' ? params['variable'] : undefined
    if (variable && config['variable'] === undefined &&
        (item.widget.type === 'equation-input' || item.widget.type === 'expression-input')) {
      config['variable'] = variable
    }
    // "x = ?" is the shape of an EQUATION answer. The curriculum names the
    // shape in the widget type — equation-input solves for the variable,
    // expression-input takes a bare expression, where "x = ?" would tell
    // the student to write an equals sign that doesn't belong.
    if (variable && item.widget.type === 'equation-input' && config['placeholder'] === undefined) {
      config['placeholder'] = `${variable} = ?`
    }
    if (item.widget.type === 'numeric-input' && config['placeholder'] === undefined) {
      config['placeholder'] = '?'
    }
    if (item.widget.type === 'choice' && config['seed'] === undefined) {
      config['seed'] = action.instance.paramHash // per-instance option shuffle
    }
    // widget config values may be cairn-expr templates ("{-2*abs(b)}" …)
    // evaluated against this instance's params (number-line bounds,
    // opposite-flip value, ratio-table rows, …) — recursively, so nested
    // arrays like rows: [["{a}","{b}"], …] work
    const evalDeep = (v: unknown): unknown => {
      if (typeof v === 'string' && v.includes('{')) {
        const n = evalNumber(v, params)
        return n !== null ? n : renderText(v, params)
      }
      if (Array.isArray(v)) return v.map(evalDeep)
      if (v !== null && typeof v === 'object')
        return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, evalDeep(x)]))
      return v
    }
    for (const [key, v] of Object.entries(config)) config[key] = evalDeep(v)
    return createWidget(item.widget.type, config)
  }, [item.id, action.instance.paramHash])

  /** the scaffold, when the engine says this serve keeps one (concreteness
   * fading). For variety it rotates between the item's own metaphor and the
   * envelope model when the params fit it — a stable per-instance choice. */
  const scaffold = useMemo(() => {
    if (!action.scaffolded || item.viz?.template !== 'balance-scale') return null
    const a = params['a']
    const b = params['b']
    // envelopes depict exactly "a groups of x total b" — only rotate to them
    // when the item's OWN binding is the ax = b shape (never by numeric fit:
    // a=5,b=6 also fits n/5 = 6, where 5 envelopes would teach the wrong idea)
    const envelopeFits =
      item.viz.bind['left'] === '{a}{variable}' && item.viz.bind['right'] === '{b}' &&
      typeof a === 'number' && Number.isInteger(a) && a >= 2 && a <= 14 &&
      typeof b === 'number' && Number.isInteger(b) && b > 0 && b <= 80
    const rotate = envelopeFits && parseInt(action.instance.paramHash.slice(0, 2), 16) % 2 === 1
    if (rotate) {
      const w = createEnvelopeModel()
      return { element: w.render({ envelopes: a as number, counters: b as number }, 'problem') }
    }
    const w = createBalanceScale()
    return {
      element: w.render(
        {
          left: renderText(item.viz.bind['left'] ?? '', params),
          right: renderText(item.viz.bind['right'] ?? '', params),
        },
        'problem',
      ),
    }
  }, [item.id, action.instance.paramHash, action.scaffolded])

  const stem = typeof item.widget.config?.['stem'] === 'string'
    ? renderText(item.widget.config['stem'] as string, params)
    : null
  const maxHints = isCheck ? 0 : Math.min(item.hints.length, 2)

  /** answers lock the moment the verdict lands — review mode is inert */
  const answerMode = outcome !== null ? 'review' : 'problem'

  // THE ASSISTANCE SPECTRUM. Not a set of phases: a scaffolded practice
  // serve gets the lesson replaying above it, and that support fades as
  // the estimate climbs. The first problem after a lesson is just the
  // most-supported end of the same continuum.
  const wantsLead = action.itemKind === 'practice' && action.scaffolded

  // guide the eye: focus the answer box when a fresh problem arrives — on
  // serves with a lead (faded, or scaffolded practice), only once the lead
  // reaches its final step (pulsing mid-playback points at the wrong thing)
  const guideReady = !wantsLead || leadDone
  useEffect(() => {
    if (!guideReady) return
    const el = document.querySelector<HTMLElement>(
      '.answer-row input, .viz-answer input, .viz-answer [role="slider"], .viz-answer [role="radiogroup"]',
    )
    el?.focus()
  }, [action.instance.paramHash, guideReady])

  useEffect(() => {
    setRetriedOnce(false)
  }, [action.instance.paramHash])

  const submit = async () => {
    if (busy || outcome) return
    const extracted = widget.extract() as { raw?: string; value?: number | null } | null
    const raw = extracted?.raw ?? (extracted?.value != null ? String(extracted.value) : '')
    if (raw.trim() === '') return
    setBusy(true)
    try {
      // watching the full walk-through is maximal assistance even though
      // it reveals no hint text; grading must not depend on what happens
      // to be rendered
      const assistLevel = watchedFull
        ? Math.max(revealedHints, 2)
        : gateHelped
          ? Math.max(revealedHints, 1)
          : revealedHints
      const out = await onSubmit(raw, assistLevel, Math.round(performance.now() - startedAt))
      setOutcome(out)
      if (out.mastery !== undefined) setShownMastery(out.mastery)
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (!wantsLead) return
    setLeadDone(false)
    let cancelled = false
    void fetchExplanation([], true).then((r) => {
      if (cancelled) return
      // any bail below means NO lead will play — release the answer-box
      // pulse instead of holding it forever
      if (!r?.explanation) {
        setLeadDone(true)
        return
      }
      // drop the resolution (final content step) and the handoff — the
      // answer input below IS the resolution
      const content = r.explanation.timeline.filter(
        (st) => st.patch !== undefined || st.caption !== undefined,
      )
      if (content.length < 2) {
        setLeadDone(true)
        return
      }
      const truncated = { ...r.explanation, timeline: content.slice(0, -1) }
      // practice rung: only an INTERACTIVE lead earns its place above a
      // problem; passive replays stay a faded-phase affordance
      if (action.itemKind === 'practice' && !hasExpects(truncated.timeline)) {
        setLeadDone(true)
        return
      }
      setFadedLead({
        explanation: truncated,
        params: r.params as Params,
        seenReps: [r.explanation.representation],
        totalReps: r.totalReps,
        sameNumbers: r.sameNumbers,
      })
      // the lead is served instruction, not requested help: log the view,
      // no assistance marking
      onExplained(r.explanation.id)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action.instance.paramHash])

  const openWalkthrough = async (excludeReps: string[]) => {
    const r = await fetchExplanation(excludeReps)
    if (!r.explanation) return
    setInline({
      explanation: r.explanation,
      params: r.params as Params,
      seenReps: [...excludeReps, r.explanation.representation],
      totalReps: r.totalReps,
      sameNumbers: r.sameNumbers,
    })
  }

  const finishWalkthrough = () => {
    if (!inline) return
    onExplained(inline.explanation.id)
    setInline(null)
    // This problem is already graded, so "Now you try." means the NEXT
    // one — landing back on a card whose answer box is spent (and whose
    // verdict is still on screen) is the dead end the two-continues
    // layout came from.
    if (outcome !== null) {
      onContinue()
      return
    }
    // Watching the walk-through does NOT open the hints. The student has
    // just been shown the whole method; stacking hint text under it is
    // more to read, not more help — the same "help arrives unasked"
    // pattern as the pre-opened hint offer. It still counts as a helped
    // try (see `assistLevel`), which is what the credit turns on.
    setExplained(true)
    setWatchedFull(true)
    setAskedForHelp(true)
  }

  const mastered = outcome?.emitted.some((e) => e.kind === 'mastery_granted') ?? false
  const flagged = outcome?.emitted.some((e) => e.kind === 'guide_flag') ?? false
  const delta = outcome ? outcome.points - pointsBefore : 0

  const feedbackText = !outcome
    ? ''
    : outcome.correct
      ? action.kind === 'serve_item' && action.lessonEcho === true
        ? // the lesson just worked THIS problem — a correct is following
          // along, not independent evidence; celebrate that honestly
          'Correct — just like the lesson showed. The next one is all yours.'
        : watchedFull || gateHelped || revealedHints > 0
          ? // help was taken: warm, never a scolding, and never a reminder
            // that this one "counted less"
            'You got it — nice work.'
          : // unaided: THIS is what earns the extra recognition
            'Correct — all on your own!'
      : // a named misconception speaks for itself — the generic line would
        // only bury it
        outcome.verdict.verdict === 'incorrect' && outcome.verdict.reason
        ? outcome.verdict.reason
        : isCheck
          ? 'Not this time — back to practice. The check will come around again.'
          : 'Not quite — you’ll get another one like it.'

  return (
    <section className="card" aria-label={KICKERS[action.itemKind]}>
      <div className="card-kicker">
        <span className={isCheck ? 'kicker kicker-check' : 'kicker'}>
          {KICKERS[action.itemKind]}
          {isCheck && action.checkIndex !== undefined ? ` · ${action.checkIndex} OF 2` : ''}
        </span>
        {isCheck && <span className="muted">no hints on these — show what you know</span>}
        {action.itemKind === 'probe' && <span className="muted">these count for the earlier skill</span>}
        {(() => {
          // the ESTIMATE can saturate before the check, but the bar must
          // never read 100% while the stone is unearned — a full bar
          // beside an unpassed check reads as a lie to anyone evaluating
          // rigor. Cap the readout: the last few percent belong to the
          // check itself.
          const pct = Math.round(shownMastery * 100)
          const atCap = pct >= 97
          const shownPct = atCap ? 96 : pct
          return (
            <span
              className="mastery-meter"
              aria-label={
                atCap
                  ? 'Mastery nearly complete — pass the check to finish'
                  : `Mastery ${pct} percent`
              }
            >
              <span className="mastery-label">MASTERY</span>
              <span className="m-bar" aria-hidden>
                <span className="m-fill" style={{ width: `${shownPct}%` }} />
                {MILESTONE_MARKS.map((at) => (
                  <span
                    key={at}
                    className={shownMastery >= at ? 'm-tick m-tick-hit' : 'm-tick'}
                    style={{ left: `${at * 100}%` }}
                  />
                ))}
              </span>
              <b data-testid="mastery-pct">{atCap ? 'check to finish' : `${pct}%`}</b>
            </span>
          )
        })()}
      </div>
      {stem && (
        <h2 className="stem" data-testid="stem">
          {stem}
        </h2>
      )}
      {/* the lead region keeps a stable footprint from FIRST PAINT — nothing
          that accepts typing may move under the student's cursor (B-02) */}
      {wantsLead && !inline && (
      <SmoothHeight>
      {!fadedLead && outcome === null && !leadDone && <div className="lead-skeleton" aria-hidden />}
      {fadedLead && (
        hasExpects(fadedLead.explanation.timeline) ? (
          <StepwisePlayer
            key={`lead-${action.instance.paramHash}`}
            explanation={fadedLead.explanation}
            params={fadedLead.params}
            inert={outcome !== null}
            onActiveGate={(h) => {
              setGateHint(h)
              setShownGateHint(null)
            }}
            onReachedEnd={() => setLeadDone(true)}
            onStep={(move) =>
              onStepAttempt?.({
                ...move,
                itemId: action.instance.itemId,
                paramHash: action.instance.paramHash,
                skillId: action.forSkillId,
                explanationId: fadedLead.explanation.id,
              })
            }
            onEngaged={
              action.itemKind === 'practice'
                ? () => {
                    // records the help (assistLevel), but never opens hint
                    // text — the gate already gave its own feedback
                    setExplained(true)
                    setGateHelped(true)
                  }
                : undefined
            }
          />
        ) : (
          <LessonPlayer
            key={`lead-${action.instance.paramHash}`}
            explanation={fadedLead.explanation}
            params={fadedLead.params}
            kind="walkthrough"
            sameNumbers={fadedLead.sameNumbers}
            embedded
            tail="none"
            onReachedEnd={() => setLeadDone(true)}
            onDone={() => {}}
          />
        )
      )}
      {/* B-03: while the stepwise lead is live, name the second affordance */}
      {fadedLead && hasExpects(fadedLead.explanation.timeline) && !leadDone && outcome === null && (
        <p className="skip-divider" aria-hidden>
          — or skip ahead: put the final answer below —
        </p>
      )}
      </SmoothHeight>
      )}
      {inline ? (
        <LessonPlayer
          key={inline.explanation.id}
          explanation={inline.explanation}
          params={inline.params}
          sameNumbers={inline.sameNumbers}
          kind="walkthrough"
          embedded
          onDone={finishWalkthrough}
          onCancel={() => setInline(null)}
          onAnotherWay={
            inline.totalReps > 1
              ? () => {
                  void openWalkthrough(inline.seenReps)
                }
              : undefined
          }
        />
      ) : (
        <>
          {scaffold && !fadedLead && <div className="viz">{scaffold.element}</div>}
          {/* wide widget answer spaces (tape, number lines, tables …) take a
              full row of their own; only the text inputs sit inline with the
              buttons. A <form> so Enter submits from any text field. */}
          <form
            className={guideReady && outcome === null ? 'awaiting-answer' : undefined}
            onSubmit={(e) => {
              e.preventDefault()
              void submit()
            }}
          >
          {!TEXT_INPUTS.has(item.widget.type) && (
            <div className="viz-answer">
              {widget.render({} as never, answerMode)}
            </div>
          )}
          <div className="answer-row">
            {TEXT_INPUTS.has(item.widget.type) && widget.render({} as never, answerMode)}
            <button type="submit" className="btn btn-primary" disabled={busy || outcome !== null}>
              Check answer
            </button>
            {(gateHint !== null ? shownGateHint === null : maxHints > revealedHints) &&
              outcome === null && (
              <button
                type="button"
                // the ladder OFFERED help — point at the button, don't
                // open the hint for them
                className={hintOffered && revealedHints === 0 ? 'btn pulse' : 'btn'}
                onClick={() => {
                  setAskedForHelp(true)
                  // a gate is open: serve ITS hint, not the problem ladder's
                  if (gateHint !== null) setShownGateHint(gateHint)
                  else setRevealedHints((h) => h + 1)
                }}
              >
                Hint
              </button>
            )}
            {!isCheck && outcome === null && (
              <button type="button" className="btn btn-quiet" onClick={() => void openWalkthrough([])}>
                Show me how
              </button>
            )}
          </div>
          </form>
        </>
      )}
      {/* No "this counts as a helped try" warning. Announcing a penalty
          before the student has even answered discourages the very paths
          — working the steps, asking to see it done — that we want them
          taking. Credit still reflects the help (assistLevel); the
          RECOGNITION goes to unaided work instead, below. */}
      {!inline && shownGateHint !== null && (
        <p className="hint" data-testid="gate-hint">
          {shownGateHint}
        </p>
      )}
      {!inline && item.hints.slice(0, revealedHints).map((h, i) => (
        <p key={i} className="hint" data-testid={`hint-${i + 1}`}>
          {renderText(h, params)}
        </p>
      ))}
      {outcome && !mastered && !inline && (
        <div className={outcome.correct ? 'feedback ok' : 'feedback bad'} role="status">
          {feedbackText}
          {delta > 0 && <span className="pts-delta">+{delta}</span>}
        </div>
      )}
      {outcome?.reviewHeld && (
        <div className="review-held" role="status">
          <span className="review-spark" aria-hidden />
          <div>
            <strong>Still got it.</strong> You remembered {outcome.reviewHeld.skillName} after time
            away
            {outcome.reviewHeld.kept > 1 ? ` — ${outcome.reviewHeld.kept} reviews in a row` : ''}.
            <span className="milestone-sub">
              Next check-in in about {outcome.reviewHeld.days}{' '}
              {outcome.reviewHeld.days === 1 ? 'day' : 'days'} — the better you hold it, the longer
              the gap.
            </span>
          </div>
        </div>
      )}
      {mastered && (
        <div className="grant" role="status">
          <span className="grant-stone" aria-hidden />
          <div>
            <strong>Mastered!</strong> A new stone lands on your cairn.
            {delta > 0 && <span className="pts-delta">+{delta}</span>}
          </div>
        </div>
      )}
      {flagged && (
        <div className="parked" role="status">
          You’ve worked hard on this one — your guide will come check in. You don’t have to stop,
          though.
        </div>
      )}
      {/* While the walk-through plays it OWNS the exit — its own
          "Now you try." is the way out. Rendering the outcome row
          underneath gave two competing continues. */}
      {outcome &&
        !inline &&
        (flagged ? (
          <div className="answer-row">
            <button className="btn btn-primary" onClick={() => onContinue(action.forSkillId)}>
              Keep practicing this
            </button>
            <button className="btn" onClick={() => onContinue(null)}>
              Switch it up
            </button>
          </div>
        ) : (
          // After a MISS the next move is to see it worked, not to move on:
          // "Show me how" is the primary and Continue steps back to quiet,
          // so the default path is understanding this problem before
          // meeting another one.
          <div className="answer-row">
            {!outcome.correct && !isCheck && (
              <button
                className="btn btn-primary pulse"
                onClick={() => void openWalkthrough([])}
              >
                Show me how
              </button>
            )}
            {!outcome.correct && !isCheck && action.itemKind === 'practice' && !retriedOnce && onRetry && (
              <button
                className="btn"
                onClick={() => {
                  void (async () => {
                    await onRetry()
                    setRetriedOnce(true)
                    setOutcome(null)
                  })()
                }}
              >
                Try again
              </button>
            )}
            <button
              className={outcome.correct || isCheck ? 'btn btn-primary' : 'btn btn-quiet'}
              onClick={() => onContinue()}
            >
              Continue
            </button>
          </div>
        ))}
      {/* The ladder found a representation this skill has not taught yet.
          It used to play over the student's problem uninvited; now it asks. */}
      {action.altOffer && !inline && !explained && (
        <div className="check-offer">
          <span>Want to see this a different way?</span>
          <button className="btn btn-quiet" onClick={() => void openWalkthrough([])}>
            Show me another way
          </button>
        </div>
      )}
      {showInlineCheckOffer && outcome === null && !inline && (
        <div className="check-offer">
          <span>The mastery check is ready when you are.</span>
          <button className="btn btn-check" onClick={() => onStartCheck(action.forSkillId)}>
            Take the check
          </button>
        </div>
      )}
    </section>
  )
}

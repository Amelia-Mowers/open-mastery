/** One served item: stem, answer widget, optional viz, hints, feedback, and
 * an in-place walk-through of the skill with this problem's own numbers.
 * All copy here is child-facing: encouraging, no mastery-model internals. */
import { useEffect, useMemo, useState } from 'react'
import type { Explanation } from '@openmastery/schema'
import type { NextAction } from '../../core/engine'
import { createWidget } from '../widgets/registry'
import { createBalanceScale } from '../viz/balance-scale'
import { createEnvelopeModel } from '../viz/envelope-model'
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

const KICKERS: Record<ServeAction['itemKind'], string> = {
  faded: 'FINISH THIS ONE',
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
  onContinue,
  onStartCheck,
  fetchExplanation,
  onExplained,
  showInlineCheckOffer,
}: ItemCardProps) {
  const params = action.instance.params as Params
  const isCheck = action.itemKind === 'check'
  const [revealedHints, setRevealedHints] = useState(isCheck ? 0 : (action.offeredHintLevel ?? 0))
  const [outcome, setOutcome] = useState<AttemptOutcome | null>(null)
  const [busy, setBusy] = useState(false)
  /** the walk-through playing inside this card */
  const [inline, setInline] = useState<InlinePlay | null>(null)
  /** watched the walk-through → this try counts as helped */
  const [explained, setExplained] = useState(false)
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
    // give inputs a friendly placeholder from the item's variable param
    const variable = typeof params['variable'] === 'string' ? params['variable'] : undefined
    if (variable && config['variable'] === undefined &&
        (item.widget.type === 'equation-input' || item.widget.type === 'expression-input')) {
      config['variable'] = variable
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
  const answerMode = outcome !== null ? 'review' : action.itemKind === 'faded' ? 'faded' : 'problem'

  // guide the eye: focus the answer box when a fresh problem arrives — for
  // faded items, only once the walkthrough reaches its final step (pulsing
  // mid-playback points at the wrong thing)
  const guideReady = action.itemKind !== 'faded' || leadDone
  useEffect(() => {
    if (!guideReady) return
    const el = document.querySelector<HTMLElement>(
      '.answer-row input, .viz-answer input, .viz-answer [role="slider"], .viz-answer [role="radiogroup"]',
    )
    el?.focus()
  }, [action.instance.paramHash, guideReady])

  const submit = async () => {
    if (busy || outcome) return
    const extracted = widget.extract() as { raw?: string; value?: number | null } | null
    const raw = extracted?.raw ?? (extracted?.value != null ? String(extracted.value) : '')
    if (raw.trim() === '') return
    setBusy(true)
    try {
      const out = await onSubmit(raw, revealedHints, Math.round(performance.now() - startedAt))
      setOutcome(out)
      if (out.mastery !== undefined) setShownMastery(out.mastery)
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (action.itemKind !== 'faded') return
    setLeadDone(false)
    let cancelled = false
    void fetchExplanation([], true).then((r) => {
      if (cancelled || !r?.explanation) return
      // drop the resolution (final content step) and the handoff — the
      // answer input below IS the resolution
      const content = r.explanation.timeline.filter(
        (st) => st.patch !== undefined || st.caption !== undefined,
      )
      if (content.length < 2) return
      const truncated = { ...r.explanation, timeline: content.slice(0, -1) }
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
    setExplained(true)
    setRevealedHints((h) => Math.max(h, 1, Math.min(item.hints.length, 2)))
    setInline(null)
  }

  const mastered = outcome?.emitted.some((e) => e.kind === 'mastery_granted') ?? false
  const flagged = outcome?.emitted.some((e) => e.kind === 'guide_flag') ?? false
  const delta = outcome ? outcome.points - pointsBefore : 0

  const feedbackText = !outcome
    ? ''
    : outcome.correct
      ? revealedHints > 0
        ? 'You got it — the hint helped. Try the next one on your own!'
        : 'Correct!'
      : isCheck
        ? 'Not this time — back to practice. The check will come around again.'
        : 'Not quite — you’ll get another shot.'

  return (
    <section className="card" aria-label={KICKERS[action.itemKind]}>
      <div className="card-kicker">
        <span className={isCheck ? 'kicker kicker-check' : 'kicker'}>
          {KICKERS[action.itemKind]}
          {isCheck && action.checkIndex !== undefined ? ` · ${action.checkIndex} OF 2` : ''}
        </span>
        {isCheck && <span className="muted">no hints on these — show what you know</span>}
        {action.itemKind === 'probe' && <span className="muted">these count for the earlier skill</span>}
        <span className="mastery-meter" aria-label={`Mastery ${Math.round(shownMastery * 100)} percent`}>
          <span className="mastery-label">MASTERY</span>
          <span className="m-bar" aria-hidden>
            <span className="m-fill" style={{ width: `${Math.round(shownMastery * 100)}%` }} />
          </span>
          <b data-testid="mastery-pct">{Math.round(shownMastery * 100)}%</b>
        </span>
      </div>
      {stem && (
        <h2 className="stem" data-testid="stem">
          {stem}
        </h2>
      )}
      {action.itemKind === 'faded' && fadedLead && !inline && (
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
          {scaffold && action.itemKind !== 'faded' && <div className="viz">{scaffold.element}</div>}
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
            {maxHints > revealedHints && outcome === null && (
              <button type="button" className="btn" onClick={() => setRevealedHints((h) => h + 1)}>
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
      {explained && outcome === null && !inline && (
        <p className="muted explained-note">
          You watched the full walk-through, so this one counts as a helped try.
        </p>
      )}
      {!inline && item.hints.slice(0, revealedHints).map((h, i) => (
        <p key={i} className="hint" data-testid={`hint-${i + 1}`}>
          {renderText(h, params)}
        </p>
      ))}
      {outcome && !mastered && (
        <div className={outcome.correct ? 'feedback ok' : 'feedback bad'} role="status">
          {feedbackText}
          {delta > 0 && <span className="pts-delta">+{delta}</span>}
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
      {outcome &&
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
          <button className="btn btn-primary" onClick={() => onContinue()}>
            Continue
          </button>
        ))}
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

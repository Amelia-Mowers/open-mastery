/** One served item: stem, answer widget, optional viz, hints, feedback.
 * All copy here is child-facing: encouraging, no mastery-model internals. */
import { useMemo, useState } from 'react'
import type { NextAction } from '../../core/engine'
import { createWidget } from '../widgets/registry'
import { createBalanceScale } from '../viz/balance-scale'
import { renderText, type Params } from './render'
import type { AttemptOutcome, ClientItem } from './api'

type ServeAction = Extract<NextAction, { kind: 'serve_item' }>

export interface ItemCardProps {
  action: ServeAction
  item: ClientItem
  /** points before this attempt (to show the delta as juice) */
  pointsBefore: number
  onSubmit: (raw: string, hintLevel: number, latencyMs: number) => Promise<AttemptOutcome>
  /** continue; focus 'skill-id' keeps practicing that skill, null moves on */
  onContinue: (focus?: string | null) => void
  onStartCheck: (skillId: string) => void
  /** the check is unlocked but the student chose more practice first */
  showInlineCheckOffer: boolean
}

const KICKERS: Record<ServeAction['itemKind'], string> = {
  faded: 'FINISH THIS ONE',
  practice: 'PRACTICE',
  check: 'MASTERY CHECK',
  probe: 'QUICK LOOK AT AN EARLIER SKILL',
}

export function ItemCard({
  action,
  item,
  pointsBefore,
  onSubmit,
  onContinue,
  onStartCheck,
  showInlineCheckOffer,
}: ItemCardProps) {
  const params = action.instance.params as Params
  const isCheck = action.itemKind === 'check'
  const [revealedHints, setRevealedHints] = useState(isCheck ? 0 : (action.offeredHintLevel ?? 0))
  const [outcome, setOutcome] = useState<AttemptOutcome | null>(null)
  const [busy, setBusy] = useState(false)
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
    return createWidget(item.widget.type, config)
  }, [item.id, action.instance.paramHash])

  const viz = useMemo(() => {
    if (item.viz?.template !== 'balance-scale') return null
    return createBalanceScale()
  }, [item.id, action.instance.paramHash])

  const stem = typeof item.widget.config?.['stem'] === 'string'
    ? renderText(item.widget.config['stem'] as string, params)
    : null
  const maxHints = isCheck ? 0 : Math.min(item.hints.length, 2)

  const submit = async () => {
    if (busy || outcome) return
    const extracted = widget.extract() as { raw?: string; value?: number | null } | null
    const raw = extracted?.raw ?? (extracted?.value != null ? String(extracted.value) : '')
    if (raw.trim() === '') return
    setBusy(true)
    try {
      setOutcome(await onSubmit(raw, revealedHints, Math.round(performance.now() - startedAt)))
    } finally {
      setBusy(false)
    }
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
      </div>
      {stem && (
        <h2 className="stem" data-testid="stem">
          {stem}
        </h2>
      )}
      {action.itemKind === 'faded' && item.faded?.steps && (
        <ol className="faded-steps">
          {item.faded.steps.map((s, i) => {
            const n = i + 1
            const revealed = item.faded!.reveal_steps.includes(n)
            const yours = item.faded!.student_completes.includes(n)
            return (
              <li key={n} className={revealed ? 'faded-step done' : 'faded-step yours'}>
                <span className="faded-step-tag">{revealed ? `step ${n} ✓` : 'your turn'}</span>
                <span className="faded-step-text">{renderText(s, params)}</span>
                {yours && <span className="faded-step-arrow" aria-hidden>→</span>}
              </li>
            )
          })}
        </ol>
      )}
      {viz &&
        item.viz && (
          <div className="viz">
            {viz.render(
              {
                left: renderText(item.viz.bind['left'] ?? '', params),
                right: renderText(item.viz.bind['right'] ?? '', params),
              },
              'problem',
            )}
          </div>
        )}
      <div className="answer-row">
        {widget.render({} as never, action.itemKind === 'faded' ? 'faded' : 'problem')}
        <button className="btn btn-primary" onClick={() => void submit()} disabled={busy || outcome !== null}>
          Check answer
        </button>
        {maxHints > revealedHints && outcome === null && (
          <button className="btn" onClick={() => setRevealedHints((h) => h + 1)}>
            Hint
          </button>
        )}
      </div>
      {item.hints.slice(0, revealedHints).map((h, i) => (
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
      {showInlineCheckOffer && outcome === null && (
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

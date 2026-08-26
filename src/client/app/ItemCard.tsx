/** One served item: stem, answer widget, optional viz, hints, feedback. */
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
  onSubmit: (raw: string, hintLevel: number, latencyMs: number) => Promise<AttemptOutcome>
  onContinue: () => void
  onStartCheck: (skillId: string) => void
}

const KICKERS: Record<ServeAction['itemKind'], string> = {
  faded: 'FADED EXAMPLE',
  practice: 'PRACTICE',
  check: 'MASTERY CHECK',
  probe: 'QUICK CHECK OF AN EARLIER SKILL',
}

export function ItemCard({ action, item, onSubmit, onContinue, onStartCheck }: ItemCardProps) {
  const params = action.instance.params as Params
  const isCheck = action.itemKind === 'check'
  const [revealedHints, setRevealedHints] = useState(isCheck ? 0 : (action.offeredHintLevel ?? 0))
  const [outcome, setOutcome] = useState<AttemptOutcome | null>(null)
  const [busy, setBusy] = useState(false)
  const startedAt = useMemo(() => performance.now(), [action.instance.paramHash])

  const widget = useMemo(() => {
    const { stem: _stem, ...config } = (item.widget.config ?? {}) as Record<string, unknown>
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

  return (
    <section className="card" aria-label={KICKERS[action.itemKind]}>
      <div className="card-kicker">
        <span className={isCheck ? 'kicker kicker-check' : 'kicker'}>
          {KICKERS[action.itemKind]}
          {isCheck && action.checkIndex !== undefined ? ` · ITEM ${action.checkIndex} OF 2` : ''}
        </span>
        {isCheck && <span className="muted">unassisted — hints are off</span>}
        <span className="mono-chip">widget: {item.widget.type}</span>
      </div>
      {stem && (
        <h2 className="stem" data-testid="stem">
          {stem}
        </h2>
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
      {outcome && (
        <div className={outcome.correct ? 'feedback ok' : 'feedback bad'} role="status">
          {outcome.correct ? 'Correct.' : 'Not quite.'}
          {revealedHints > 0 && outcome.correct ? ' Assisted, so it carries reduced evidence.' : ''}
        </div>
      )}
      {mastered && (
        <div className="grant" role="status">
          <strong>Skill mastered</strong> — two unassisted problems, two different item families.
        </div>
      )}
      {flagged && (
        <div className="parked" role="status">
          Good stopping point — your guide has been flagged, and something else is up next.
        </div>
      )}
      {outcome && (
        <button className="btn btn-primary" onClick={onContinue}>
          Continue
        </button>
      )}
      {action.checkAvailable && outcome === null && (
        <div className="check-offer">
          <span>Mastery check is ready — two fresh problems, no hints.</span>
          <button className="btn btn-check" onClick={() => onStartCheck(action.forSkillId)}>
            Start the check
          </button>
        </div>
      )}
    </section>
  )
}

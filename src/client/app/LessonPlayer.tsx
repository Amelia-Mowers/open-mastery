/** Lite explanation player for the step-3 loop: steps through a timeline,
 * driving the balance-scale viz via patches. The full player (scrubbing,
 * timed autoplay, mid-timeline interaction) is build step 4. */
import { useEffect, useMemo, useState } from 'react'
import type { Explanation } from '@openmastery/schema'
import { createBalanceScale } from '../viz/balance-scale'
import { adaptBalancePatch, renderText, type Params } from './render'

export interface LessonPlayerProps {
  explanation: Explanation
  params: Params
  kind: 'lesson' | 'alt_explanation'
  onDone: () => void
}

export function LessonPlayer({ explanation, params, kind, onDone }: LessonPlayerProps) {
  const [step, setStep] = useState(0)
  const steps = explanation.timeline
  const current = steps[Math.min(step, steps.length - 1)]!
  const isBalance = explanation.widget === 'balance-scale'

  const scale = useMemo(() => (isBalance ? createBalanceScale() : null), [isBalance, explanation.id])

  useEffect(() => {
    if (!scale) return
    const s = steps[step]
    if (!s) return
    if (s.patch) scale.applyPatch(adaptBalancePatch(s.patch, params))
    scale.applyPatch({ caption: s.caption ? renderText(s.caption, params) : '' })
  }, [scale, step, steps, params])

  const handoff = current.handoff
  return (
    <section className="card" aria-label={kind === 'lesson' ? 'Lesson' : 'Another way to see it'}>
      <div className="card-kicker">
        <span className={kind === 'lesson' ? 'kicker' : 'kicker kicker-alt'}>
          {kind === 'lesson' ? 'LESSON' : "LET'S LOOK AT IT DIFFERENTLY"}
        </span>
        <span className="mono-chip">representation: {explanation.representation}</span>
      </div>
      {scale ? (
        <div className="lesson-stage">{scale.render({ left: '', right: '' }, 'lesson')}</div>
      ) : (
        <p className="lesson-caption" data-testid="lesson-caption">
          {current.caption ? renderText(current.caption, params) : ''}
        </p>
      )}
      <div className="lesson-controls">
        <div className="dots" aria-hidden>
          {steps.map((_, i) => (
            <span key={i} className={i <= step ? 'dot dot-on' : 'dot'} />
          ))}
        </div>
        {handoff ? (
          <button className="btn btn-primary" onClick={onDone}>
            {renderText(handoff.prompt, params)}
          </button>
        ) : (
          <button className="btn btn-primary" onClick={() => setStep((s) => s + 1)}>
            Next
          </button>
        )}
      </div>
    </section>
  )
}

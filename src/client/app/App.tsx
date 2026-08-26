/** Student session shell: a thin loop over the site server. */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Explanation } from '@openmastery/schema'
import { SiteApi, type AttemptOutcome, type ServerNext } from './api'
import { LessonPlayer } from './LessonPlayer'
import { ItemCard } from './ItemCard'
import { Dashboard } from './Dashboard'
import type { Params } from './render'

/** an on-demand explanation being played over the normal flow */
interface OverlayExplanation {
  explanation: Explanation
  params: Params
  skillId: string
  skillName: string
  /** representations already seen in this chain (for "another way") */
  seenReps: string[]
  /** where to return when done */
  context: { kind: 'lesson-chain' } | { kind: 'item'; instanceKey: string }
}

export interface AppProps {
  /** API origin; '' = same origin (the site server serves the client) */
  apiBase?: string
  /** preset student id (tests; normally the join card or ?student= URL) */
  initialStudent?: string
}

function readStoredStudent(): string {
  try {
    return localStorage.getItem('cairn.student') ?? ''
  } catch {
    return ''
  }
}

const urlParam = (name: string): string | null => {
  try {
    return new URLSearchParams(window.location.search).get(name)
  } catch {
    return null
  }
}

export function App({ apiBase = '', initialStudent }: AppProps) {
  const [student, setStudent] = useState(
    initialStudent ?? urlParam('student') ?? readStoredStudent(),
  )
  if (student === '') return <JoinCard onJoin={setStudent} />
  return <Session key={student} apiBase={apiBase} student={student} onLeave={() => setStudent('')} />
}

function JoinCard({ onJoin }: { onJoin: (id: string) => void }) {
  const [name, setName] = useState('')
  const join = () => {
    const id = name.trim().toLowerCase()
    if (id === '') return
    try {
      localStorage.setItem('cairn.student', id)
    } catch {
      /* storage unavailable is fine */
    }
    onJoin(id)
  }
  return (
    <main className="shell">
      <Header points={null} />
      <section className="card join">
        <h1>Welcome to Cairn</h1>
        <p className="muted">Type your name to pick up where you left off.</p>
        <div className="answer-row">
          <input
            aria-label="Your name"
            value={name}
            placeholder="your name"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') join()
            }}
          />
          <button className="btn btn-primary" onClick={join}>
            Start
          </button>
        </div>
      </section>
    </main>
  )
}

function Header({
  student,
  points,
  view,
  onToggleView,
  onLeave,
  onReset,
}: {
  student?: string
  points: number | null
  view?: 'work' | 'dashboard'
  onToggleView?: () => void
  onLeave?: () => void
  onReset?: () => void
}) {
  return (
    <header className="topbar">
      <span className="cairn-mark" aria-hidden>
        <i /> <i /> <i />
      </span>
      <span className="brand">Cairn</span>
      {points !== null && (
        <span key={points} className="points-chip bump" aria-label={`${points} points`}>
          ● {points}
        </span>
      )}
      <span className="spacer" />
      {onToggleView && (
        <button className="btn btn-quiet" onClick={onToggleView}>
          {view === 'dashboard' ? 'Back to work' : 'My cairn'}
        </button>
      )}
      {onReset && (
        <button className="btn btn-quiet" onClick={onReset} title="Start this student over (demo)">
          Reset demo
        </button>
      )}
      {student && onLeave && (
        <button className="btn btn-quiet" onClick={onLeave}>
          {student} · switch
        </button>
      )}
    </header>
  )
}

function Session({ apiBase, student, onLeave }: { apiBase: string; student: string; onLeave: () => void }) {
  const api = useMemo(() => new SiteApi(apiBase, student), [apiBase, student])
  const [next, setNext] = useState<ServerNext | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<'work' | 'dashboard'>(
    urlParam('view') === 'dashboard' ? 'dashboard' : 'work',
  )
  const [points, setPoints] = useState<number | null>(null)
  /** skill the student explicitly chose to keep working (soft-park opt-in) */
  const focusSkill = useRef<string | null>(null)
  /** skills whose check-unlocked interstitial was dismissed for now */
  const [checkDismissed, setCheckDismissed] = useState<ReadonlySet<string>>(new Set())
  /** an on-demand explanation playing over the flow */
  const [overlay, setOverlay] = useState<OverlayExplanation | null>(null)
  /** instances the student asked to be shown — their attempts count assisted */
  const [explained, setExplained] = useState<ReadonlySet<string>>(new Set())

  const refresh = useCallback(() => {
    setNext(null)
    api
      .next(focusSkill.current ?? undefined)
      .then((n) => {
        setNext(n)
        setPoints(n.points)
      })
      .catch((e: unknown) => setError(String(e)))
  }, [api])

  useEffect(refresh, [refresh])

  const onSubmit = useCallback(
    async (raw: string, hintLevel: number, latencyMs: number): Promise<AttemptOutcome> => {
      const outcome = await api.attempt(raw, hintLevel, latencyMs)
      setPoints(outcome.points)
      return outcome
    },
    [api],
  )

  const startCheck = (skillId: string) => {
    void api.startCheck(skillId).then(refresh)
  }

  const reset = () => {
    focusSkill.current = null
    setCheckDismissed(new Set())
    setOverlay(null)
    setExplained(new Set())
    void api.reset().then(refresh)
  }

  /** fetch the next unseen-representation explanation and play it */
  const openExplanation = useCallback(
    async (skillId: string, seenReps: string[], context: OverlayExplanation['context']) => {
      const r = await api.explain(skillId, seenReps)
      if (!r.explanation) return // every representation seen — nothing to chain
      setOverlay({
        explanation: r.explanation,
        params: r.params as Params,
        skillId,
        skillName: r.skillName,
        seenReps: [...seenReps, r.explanation.representation],
        context,
      })
    },
    [api],
  )

  const closeOverlay = useCallback(async () => {
    if (!overlay) return
    await api.explained(overlay.explanation.id, overlay.skillId)
    if (overlay.context.kind === 'lesson-chain') {
      // the underlying lesson action completes with the whole chain
      await api.explanationViewed()
      setOverlay(null)
      refresh()
    } else {
      // back to the same problem; its attempt now counts as helped
      setExplained(new Set([...explained, overlay.context.instanceKey]))
      setOverlay(null)
    }
  }, [api, overlay, explained, refresh])

  let body
  if (view === 'dashboard') {
    body = <Dashboard api={api} />
  } else if (overlay) {
    body = (
      <LessonPlayer
        key={overlay.explanation.id}
        explanation={overlay.explanation}
        params={overlay.params}
        kind={overlay.context.kind === 'item' ? 'lesson' : 'alt_explanation'}
        title={overlay.skillName}
        onDone={() => {
          void closeOverlay()
        }}
        onAnotherWay={() => {
          void openExplanation(overlay.skillId, overlay.seenReps, overlay.context)
        }}
      />
    )
  } else if (error) {
    body = (
      <section className="card">
        <p className="feedback bad">Can’t reach the site server: {error}</p>
        <button className="btn btn-primary" onClick={refresh}>
          Retry
        </button>
      </section>
    )
  } else if (!next) {
    body = <p className="muted loading">Loading…</p>
  } else if (next.action.kind === 'session_done') {
    body = (
      <section className="card done">
        <h1>That’s the whole trail for today</h1>
        <p className="muted">Nothing else is ready right now — check your cairn to see how far you’ve come.</p>
        <button className="btn btn-primary" onClick={() => setView('dashboard')}>
          See my cairn
        </button>
      </section>
    )
  } else if (next.action.kind === 'lesson' || next.action.kind === 'alt_explanation') {
    const { skillId } = next.action
    const rep = next.explanation!.representation
    body = (
      <LessonPlayer
        key={next.action.explanationId}
        explanation={next.explanation!}
        params={(next.params ?? {}) as Params}
        kind={next.action.kind}
        title={urlParam('autostart') === '1' ? undefined : (next.skillName ?? skillId)}
        onDone={() => {
          void api.explanationViewed().then(refresh)
        }}
        onAnotherWay={() => {
          void openExplanation(skillId, [rep], { kind: 'lesson-chain' })
        }}
      />
    )
  } else if (
    next.action.checkAvailable &&
    !checkDismissed.has(next.action.forSkillId)
  ) {
    const skillId = next.action.forSkillId
    body = (
      <section className="card unlock" aria-label="Mastery check unlocked">
        <div className="unlock-burst" aria-hidden>
          ★
        </div>
        <h1>Mastery check unlocked!</h1>
        <p className="muted">
          Two fresh problems, no hints. Get both right and this skill goes on your cairn.
        </p>
        <div className="answer-row">
          <button className="btn btn-check" onClick={() => startCheck(skillId)}>
            Take the check
          </button>
          <button
            className="btn"
            onClick={() => setCheckDismissed(new Set([...checkDismissed, skillId]))}
          >
            More practice first
          </button>
        </div>
      </section>
    )
  } else {
    const instanceKey = `${next.action.instance.itemId}#${next.action.instance.paramHash}`
    const { skillId } = next.action
    body = (
      <ItemCard
        key={instanceKey}
        action={next.action}
        item={next.item!}
        pointsBefore={next.points}
        explanationAssisted={explained.has(instanceKey)}
        onSubmit={onSubmit}
        onContinue={(focus) => {
          if (focus !== undefined) focusSkill.current = focus
          refresh()
        }}
        onStartCheck={startCheck}
        onExplain={() => {
          void openExplanation(skillId, [], { kind: 'item', instanceKey })
        }}
        showInlineCheckOffer={next.action.checkAvailable === true}
      />
    )
  }

  return (
    <main className="shell">
      <Header
        student={student}
        points={points}
        view={view}
        onToggleView={() => setView(view === 'dashboard' ? 'work' : 'dashboard')}
        onLeave={onLeave}
        onReset={reset}
      />
      {body}
    </main>
  )
}

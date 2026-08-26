/** Student session shell: a thin loop over the site server. */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { SiteApi, type AttemptOutcome, type ServerNext } from './api'
import { LessonPlayer } from './LessonPlayer'
import { ItemCard } from './ItemCard'
import type { Params } from './render'

export interface AppProps {
  /** API origin; '' = same origin (the site server serves the client) */
  apiBase?: string
  /** preset student id (used by tests; normally comes from the join card) */
  initialStudent?: string
}

function readStoredStudent(): string {
  try {
    return localStorage.getItem('cairn.student') ?? ''
  } catch {
    return ''
  }
}

export function App({ apiBase = '', initialStudent }: AppProps) {
  const [student, setStudent] = useState(initialStudent ?? readStoredStudent())
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
      <Header />
      <section className="card join">
        <h1>Join your session</h1>
        <p className="muted">Class-code + PIN sign-in arrives with device enrollment (build step 5); this is the dev join card.</p>
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

function Header({ student, onLeave }: { student?: string; onLeave?: () => void }) {
  return (
    <header className="topbar">
      <span className="cairn-mark" aria-hidden>
        <i /> <i /> <i />
      </span>
      <span className="brand">Cairn</span>
      <span className="mono-chip">prealgebra · linear equations pilot</span>
      <span className="spacer" />
      {student && (
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

  const refresh = useCallback(() => {
    setNext(null)
    api
      .next()
      .then(setNext)
      .catch((e: unknown) => setError(String(e)))
  }, [api])

  useEffect(refresh, [refresh])

  const onSubmit = useCallback(
    (raw: string, hintLevel: number, latencyMs: number): Promise<AttemptOutcome> =>
      api.attempt(raw, hintLevel, latencyMs),
    [api],
  )

  let body
  if (error) {
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
        <h1>All done for now</h1>
        <p className="muted">Nothing else is eligible this session — nice work.</p>
      </section>
    )
  } else if (next.action.kind === 'lesson' || next.action.kind === 'alt_explanation') {
    body = (
      <LessonPlayer
        key={next.action.explanationId}
        explanation={next.explanation!}
        params={(next.params ?? {}) as Params}
        kind={next.action.kind}
        onDone={() => {
          void api.explanationViewed().then(refresh)
        }}
      />
    )
  } else {
    body = (
      <ItemCard
        key={`${next.action.instance.itemId}#${next.action.instance.paramHash}`}
        action={next.action}
        item={next.item!}
        onSubmit={onSubmit}
        onContinue={refresh}
        onStartCheck={(skillId) => {
          void api.startCheck(skillId).then(refresh)
        }}
      />
    )
  }

  return (
    <main className="shell">
      <Header student={student} onLeave={onLeave} />
      {body}
    </main>
  )
}

/** Student session shell: a thin loop over the site server. */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Explanation } from '@openmastery/schema'
import { SiteApi, type AttemptOutcome, type CairnApi, type ServerNext } from './api'
import { LessonPlayer } from './LessonPlayer'
import { ItemCard } from './ItemCard'
import { Dashboard } from './Dashboard'
import { Zoo } from './Zoo'
import { Guide } from './Guide'
import { SmoothHeight } from './SmoothHeight'
import type { Params } from './render'

/** an alternative explanation chained from the current lesson */
interface OverlayExplanation {
  explanation: Explanation
  params: Params
  skillId: string
  /** representations seen in this chain — the loop cycles through them */
  seenReps: string[]
  totalReps: number
}

export interface AppProps {
  /** API origin; '' = same origin (the site server serves the client) */
  apiBase?: string
  /** preset student id (tests; normally the join card or ?student= URL) */
  initialStudent?: string
  /** backend override — the GitHub-Pages demo passes a DemoApi factory */
  apiFactory?: (base: string, student: string) => CairnApi
  /** small "runs in your browser" notice (demo builds) */
  demoBanner?: boolean
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

export function App({ apiBase = '', initialStudent, apiFactory, demoBanner }: AppProps) {
  const [student, setStudent] = useState(
    initialStudent ?? urlParam('student') ?? readStoredStudent(),
  )
  const banner = demoBanner === true && (
    <p className="muted demo-banner">
      Demo — runs entirely in your browser. Progress stays on this device.
    </p>
  )
  if (student === '')
    return (
      <>
        {banner}
        <JoinCard onJoin={setStudent} />
      </>
    )
  return (
    <>
      {banner}
      <Session
        key={student}
        apiBase={apiBase}
        student={student}
        onLeave={() => setStudent('')}
        apiFactory={apiFactory}
      />
    </>
  )
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
  focused,
  onClearFocus,
  onToggleView,
  onLeave,
  onReset,
}: {
  student?: string
  points: number | null
  view?: 'work' | 'dashboard' | 'zoo' | 'guide'
  focused?: boolean
  onClearFocus?: () => void
  onToggleView?: () => void
  onLeave?: () => void
  onReset?: () => void
}) {
  const [confirmReset, setConfirmReset] = useState(false)
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
      {focused === true && onClearFocus && (
        <button className="btn btn-quiet focus-chip" onClick={onClearFocus} title="You chose to keep practicing one skill — click to go back to the normal mix">
          ◎ focused · clear
        </button>
      )}
      <span className="spacer" />
      {onToggleView && (
        <button className="btn btn-quiet" onClick={onToggleView}>
          {view === 'dashboard' ? 'Back to work' : 'My cairn'}
        </button>
      )}
      {onReset && !confirmReset && (
        <button
          className="btn btn-quiet"
          onClick={() => {
            setConfirmReset(true)
            setTimeout(() => setConfirmReset(false), 4000)
          }}
          title="Start this student over (demo)"
        >
          Reset demo
        </button>
      )}
      {onReset && confirmReset && (
        <button
          className="btn btn-quiet reset-confirm"
          onClick={() => {
            setConfirmReset(false)
            onReset()
          }}
        >
          Really erase progress?
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

function Session({
  apiBase,
  student,
  onLeave,
  apiFactory,
}: {
  apiBase: string
  student: string
  onLeave: () => void
  apiFactory?: (base: string, student: string) => CairnApi
}) {
  const api = useMemo(
    () => (apiFactory ? apiFactory(apiBase, student) : new SiteApi(apiBase, student)),
    [apiBase, student, apiFactory],
  )
  const [next, setNext] = useState<ServerNext | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** a fetch is in flight — the previous card stays, dimmed, so the height
   * glides to the next one instead of flashing through a loading state */
  const [fetching, setFetching] = useState(false)
  const [view, setView] = useState<'work' | 'dashboard' | 'zoo' | 'guide'>(
    urlParam('view') === 'dashboard'
      ? 'dashboard'
      : urlParam('view') === 'zoo'
        ? 'zoo'
        : urlParam('view') === 'guide'
          ? 'guide'
          : 'work',
  )
  const [points, setPoints] = useState<number | null>(null)
  /** skill the student explicitly chose to keep working (soft-park opt-in) */
  const focusSkill = useRef<string | null>(null)
  /** display mirror of focusSkill (the header chip) */
  const [focusedOn, setFocusedOn] = useState(false)
  /** skills whose check-unlocked interstitial was dismissed for now */
  const [checkDismissed, setCheckDismissed] = useState<ReadonlySet<string>>(new Set())
  /** the just-answered skill unlocked its check — offer before moving on */
  const [unlockOffer, setUnlockOffer] = useState<string | null>(null)
  /** an alternative explanation playing in the lesson slot */
  const [overlay, setOverlay] = useState<OverlayExplanation | null>(null)

  const refresh = useCallback(() => {
    setFetching(true)
    api
      .next(focusSkill.current ?? undefined)
      .then((n) => {
        setNext(n)
        setPoints(n.points)
      })
      .catch((e: unknown) => setError(String(e)))
      .finally(() => setFetching(false))
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
    setFocusedOn(false)
    setCheckDismissed(new Set())
    setOverlay(null)
    void api.reset().then(refresh)
  }

  /** chain into the next representation (api.explain loops when exhausted) */
  const openAnotherWay = useCallback(
    async (skillId: string, seenReps: string[]) => {
      const r = await api.explain(skillId, seenReps)
      if (!r.explanation) return
      setOverlay({
        explanation: r.explanation,
        params: r.params as Params,
        skillId,
        seenReps: [...seenReps, r.explanation.representation],
        totalReps: r.totalReps,
      })
    },
    [api],
  )

  const closeOverlay = useCallback(async () => {
    if (!overlay) return
    await api.explained(overlay.explanation.id, overlay.skillId)
    // the underlying lesson action completes with the whole chain
    await api.explanationViewed()
    setOverlay(null)
    refresh()
  }, [api, overlay, refresh])

  let body
  if (view === 'guide') {
    body = <Guide api={api} />
  } else if (view === 'zoo') {
    body = <Zoo api={api} />
  } else if (view === 'dashboard') {
    body = (
      <Dashboard
        api={api}
        onPick={(skillId) => {
          focusSkill.current = skillId
          setFocusedOn(true)
          setView('work')
          refresh()
        }}
      />
    )
  } else if (overlay) {
    body = (
      <LessonPlayer
        key={overlay.explanation.id}
        explanation={overlay.explanation}
        params={overlay.params}
        kind="alt_explanation"
        onDone={() => {
          void closeOverlay()
        }}
        onAnotherWay={
          overlay.totalReps > 1
            ? () => {
                void openAnotherWay(overlay.skillId, overlay.seenReps)
              }
            : undefined
        }
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
    // the preamble belongs to the NEW-SKILL entry only, never to alternative
    // explanations or chained representations
    const intro =
      next.action.kind === 'lesson' && urlParam('autostart') !== '1'
        ? {
            title: next.skillName ?? skillId,
            ...(next.preamble ? { plain: next.preamble.plain, vocab: next.preamble.vocab } : {}),
          }
        : undefined
    body = (
      <LessonPlayer
        key={next.action.explanationId}
        explanation={next.explanation!}
        params={(next.params ?? {}) as Params}
        kind={next.action.kind}
        intro={intro}
        onDone={() => {
          void api.explanationViewed().then(refresh)
        }}
        onAnotherWay={
          (next.totalReps ?? 1) > 1
            ? () => {
                void openAnotherWay(skillId, [rep])
              }
            : undefined
        }
      />
    )
  } else if (
    (unlockOffer !== null && !checkDismissed.has(unlockOffer)) ||
    (next.action.checkAvailable === true && !checkDismissed.has(next.action.forSkillId))
  ) {
    const skillId =
      unlockOffer !== null && !checkDismissed.has(unlockOffer) ? unlockOffer : next.action.forSkillId
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
          <button
            className="btn btn-check"
            onClick={() => {
              setUnlockOffer(null)
              startCheck(skillId)
            }}
          >
            Take the check
          </button>
          <button
            className="btn"
            onClick={() => {
              setUnlockOffer(null)
              setCheckDismissed(new Set([...checkDismissed, skillId]))
            }}
          >
            More practice first
          </button>
        </div>
      </section>
    )
  } else {
    const instanceKey = `${next.action.instance.itemId}#${next.action.instance.paramHash}`
    const { skillId, forSkillId } = next.action
    const itemRep = next.item?.representation ?? undefined
    body = (
      <ItemCard
        key={instanceKey}
        action={next.action}
        item={next.item!}
        pointsBefore={next.points}
        mastery={next.mastery ?? 0}
        onSubmit={async (raw, hintLevel, latencyMs) => {
          const out = await onSubmit(raw, hintLevel, latencyMs)
          if (out.checkUnlocked === true && !checkDismissed.has(forSkillId)) setUnlockOffer(forSkillId)
          return out
        }}
        onContinue={(focus) => {
          if (focus !== undefined) {
            focusSkill.current = focus
            setFocusedOn(focus !== null)
          }
          refresh()
        }}
        onStartCheck={startCheck}
        fetchExplanation={(exclude, sameAsLesson) =>
          api.explain(skillId, exclude, itemRep ?? undefined, sameAsLesson)
        }
        onExplained={(explanationId) => {
          void api.explained(explanationId, skillId)
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
        focused={focusedOn}
        onClearFocus={() => {
          focusSkill.current = null
          setFocusedOn(false)
          refresh()
        }}
        onToggleView={() => setView(view === 'dashboard' ? 'work' : 'dashboard')}
        onLeave={onLeave}
        onReset={reset}
      />
      <SmoothHeight dim={fetching && next !== null && view !== 'dashboard'}>{body}</SmoothHeight>
    </main>
  )
}

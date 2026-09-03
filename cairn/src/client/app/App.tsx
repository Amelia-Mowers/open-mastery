/** Student session shell: a thin loop over the site server. */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { speech } from '../tts/speech'
import type { Explanation } from '@openmastery/schema'
import { SiteApi, type AttemptOutcome, type CairnApi, type ServerNext } from './api'
import { LessonPlayer } from './LessonPlayer'
import { ItemCard } from './ItemCard'
import { Dashboard } from './Dashboard'
import { Zoo } from './Zoo'
import { Guide } from './Guide'
import { SmoothHeight } from './SmoothHeight'
import { ContentErrorBoundary } from './ContentErrorBoundary'
import { createTapeDiagram } from '../viz/tape-diagram'
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

/** how many more serves of a skill to wait before re-offering its check
 * after the student chose "More practice first" */
const CHECK_DEFER_SERVES = 3

export function App(props: AppProps) {
  // a content fault (unrenderable template, undrawable widget) must stop
  // the lesson honestly rather than render something broken
  return (
    <ContentErrorBoundary>
      <AppInner {...props} />
    </ContentErrorBoundary>
  )
}

function AppInner({ apiBase = '', initialStudent, apiFactory, demoBanner }: AppProps) {
  /** a student who has signed in but not yet been placed — the grade page
   * stands between the two, and only for someone new */
  const [pendingStudent, setPendingStudent] = useState<string | null>(null)
  const [student, setStudent] = useState(
    initialStudent ?? urlParam('student') ?? readStoredStudent(),
  )
  /** the guide view stands alone — no student join needed (?view=guide,
   * or the link on the join card) */
  const [guideMode, setGuideMode] = useState(urlParam('view') === 'guide')
  const zooMode = urlParam('view') === 'zoo'
  // honest about the one external fetch: pre-rendered voice audio streams
  // from a public corpus; the ENGINE and all answers/progress stay local
  const banner = demoBanner === true && (
    <p className="muted demo-banner">
      Demo — the engine runs in your browser; answers and progress never leave this device.
    </p>
  )
  if (guideMode)
    return (
      <>
        {banner}
        <GuidePage
          api={apiFactory ? apiFactory(apiBase, 'guide-viewer') : new SiteApi(apiBase, 'guide-viewer')}
          onBack={() => setGuideMode(false)}
          autoSeed={demoBanner === true}
        />
      </>
    )

  // The zoo is a WIDGET WORKBENCH, not student work: it renders the
  // curriculum's own demos and reads nothing student-scoped. Requiring a
  // sign-in to reach it made ?view=zoo links useless to anyone reviewing
  // widgets, which is the only thing it is for.
  if (zooMode)
    return (
      <>
        {banner}
        <main className="shell">
          <Header points={null} />
          <Zoo
            api={apiFactory ? apiFactory(apiBase, 'zoo-viewer') : new SiteApi(apiBase, 'zoo-viewer')}
          />
        </main>
      </>
    )
  if (pendingStudent !== null)
    return (
      <>
        {banner}
        <GradePage
          api={apiFactory ? apiFactory(apiBase, pendingStudent) : new SiteApi(apiBase, pendingStudent)}
          onPlaced={() => {
            const id = pendingStudent
            setPendingStudent(null)
            setStudent(id)
          }}
        />
      </>
    )

  // SIGN-IN IS A LOGIN. The grade step is a separate page and appears
  // only for a student with no history — asking a returning student what
  // grade they are in, every single time, is the wrong contract.
  if (student === '')
    return (
      <>
        <JoinCard
          onJoin={(id) => setPendingStudent(id)}
          onGuide={() => setGuideMode(true)}
          about={demoBanner === true}
        />
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
        testMode={demoBanner === true}
      />
    </>
  )
}

function GuidePage({ api, onBack, autoSeed }: { api: CairnApi; onBack: () => void; autoSeed?: boolean }) {
  return (
    <main className="shell">
      <header className="topbar">
        <span className="cairn-mark" aria-hidden>
          <i /> <i /> <i />
        </span>
        <span className="brand">Cairn</span>
        <span className="mono-chip">guide view</span>
        <span className="spacer" />
        <button className="btn btn-quiet" onClick={onBack}>
          Student view
        </button>
      </header>
      <Guide api={api} autoSeed={autoSeed === true} />
    </main>
  )
}

/** A silent loop of the tape diagram solving x + 8 = 21, beat for beat
 * the vetted add-solve lesson: empty bar → x arrives → 8 joins → the 21
 * brace lands → the 8 section comes off with the "21 − 8" chip. The
 * widgets are the whole sell, and a visitor should see one moving before
 * they type a name (external eval: nothing above the fold moved). */
function LandingLoop() {
  const widget = useMemo(() => createTapeDiagram(), [])
  useEffect(() => {
    const beats: Array<Record<string, unknown>> = [
      { cellsIn: 0, totalIn: false, removed: [], totalOp: null, highlight: [] },
      { cellsIn: 1, highlight: [1] },
      { cellsIn: 2, highlight: [2] },
      { totalIn: true, highlight: [] },
      { removed: [2], totalOp: { op: 'subtract', by: '8' }, highlight: [1] },
    ]
    let i = 0
    widget.applyPatch(beats[0]!)
    const id = setInterval(() => {
      i = (i + 1) % (beats.length + 1) // extra beat holds the resolution
      widget.applyPatch(beats[Math.min(i, beats.length - 1)]!)
      if (i === beats.length) i = -1 // next tick restarts the build
    }, 1700)
    return () => clearInterval(id)
  }, [widget])
  return (
    <div className="landing-loop" aria-hidden>
      {widget.render({ parts: 2, partLabel: '', total: '21', cells: ['x', '8'] }, 'lesson')}
    </div>
  )
}

function AboutPanel() {
  return (
    <section className="card about">
      <h1>Cairn</h1>
      <LandingLoop />
      <p>
        An open-source, self-hostable <b>mastery-learning engine</b> for school math —{' '}
        <b>grades 6–7 today, 3–12 in progress</b>. Every skill is
        taught with animated lessons in several representations — a balance scale, a bar model, a
        number line, the worked symbols — and practiced as <b>stepwise problems</b> you work move
        by move, with an answer box always open if you can already solve it. Skills unlock along a
        graph derived from the Common Core standards, and mastered skills come back for spaced
        review.
      </p>
      <p className="muted">
        The engine runs entirely in your browser — event log and all, no server; answers and
        progress never leave this device. Type a name below to try it as a student.{' '}
        <a href="https://github.com/Amelia-Mowers/open-mastery" target="_blank" rel="noreferrer">
          Source on GitHub
        </a>
        {' · '}AGPL engine, CC BY curriculum.
      </p>
    </section>
  )
}

/** Grades the product intends to cover. Ones the catalog cannot teach yet
 * are shown but disabled — the roadmap stays visible without dropping a
 * 4th-grader into grade-6 algebra. */
const GRADE_RANGE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12]

/** A page of its own, shown ONCE to a student with no history. Sign-in is
 * a login for everyone else, so this must never become a question they
 * answer again on every visit. Not optional: a starting point is needed
 * to serve anything sensible, and "skip" would just recreate the
 * everyone-lands-in-grade-6 problem the picker exists to fix. */
function GradePage({ api, onPlaced }: { api: CairnApi; onPlaced: () => void }) {
  const [available, setAvailable] = useState<number[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    // a returning student never sees this page
    void api
      .needsPlacement()
      .then((r) => {
        if (!live) return
        if (!r.needsPlacement) {
          onPlaced()
          return null
        }
        return api.grades().then((g) => {
          if (live) setAvailable(g.available)
        })
      })
      .catch((e: unknown) => {
        // NO SILENT FALLBACK: proceeding as though placed serves this
        // student from the BOTTOM of the graph — a 7th-grader lands in
        // grade-6 material — and, because the placement never landed,
        // asks them their grade again next visit. Say so instead.
        if (live) setError(String(e))
      })
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api])

  const pick = (g: number) => {
    if (busy) return
    setBusy(true)
    void api
      .place(g)
      .then(onPlaced)
      .catch((e: unknown) => {
        // a failed placement must not look like a successful one
        setBusy(false)
        setError(String(e))
      })
  }

  if (available === null)
    return (
      <main className="shell">
        <Header points={null} />
        <section className="card">
          <p className="muted">Loading…</p>
        </section>
      </main>
    )

  return (
    <main className="shell">
      <Header points={null} />
      <section className="card grade-page">
        <h1>What grade are you in?</h1>
        <p className="muted">
          This just sets where you start. You can work above or below it whenever you like.
        </p>
        <div className="grade-grid" role="group" aria-label="Choose your grade">
          {GRADE_RANGE.map((g) => {
            const ready = available.includes(g)
            return (
              <button
                key={g}
                type="button"
                className="grade-big"
                disabled={!ready || busy}
                onClick={() => pick(g)}
                aria-label={ready ? `Grade ${g}` : `Grade ${g}, coming soon`}
              >
                <span className="grade-big-num">{g}</span>
                <span className="grade-big-sub">{ready ? 'Grade' : 'soon'}</span>
              </button>
            )
          })}
        </div>
        {error !== null && (
          <p className="feedback bad" role="alert">
            Could not save that — please try again. ({error})
          </p>
        )}
        <p className="muted grade-page-note">
          Grades {available[0]}–{available[available.length - 1]} are built today; the rest are on
          the way.
        </p>
      </section>
    </main>
  )
}

/** student ids already in this browser's demo log, most recent first —
 * a returning family should tap their name, not retype it */
function localProfiles(): string[] {
  try {
    const raw = localStorage.getItem('cairn.demo.events')
    if (!raw) return []
    const events = JSON.parse(raw) as Array<{ studentId?: string; t?: number }>
    const lastSeen = new Map<string, number>()
    for (const e of events)
      if (typeof e.studentId === 'string' && e.studentId !== '')
        lastSeen.set(e.studentId, e.t ?? 0)
    return [...lastSeen.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id)
  } catch {
    return []
  }
}

function JoinCard({ onJoin, onGuide, about }: { onJoin: (id: string) => void; onGuide?: () => void; about?: boolean }) {
  const [name, setName] = useState('')
  const [profiles] = useState(localProfiles)

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
      {about && <AboutPanel />}
      <section className="card join">
        <h1>{about ? 'Try it as a student' : 'Welcome to Cairn'}</h1>
        <p className="muted">
          {about
            ? 'Pick any name — progress stays on this device under that name.'
            : 'Type your name to pick up where you left off.'}
        </p>
        {profiles.length > 0 && (
          <div className="profile-row">
            {profiles.slice(0, 6).map((id) => (
              <button
                key={id}
                className="btn btn-quiet profile-chip"
                onClick={() => {
                  try {
                    localStorage.setItem('cairn.student', id)
                  } catch {
                    /* storage unavailable is fine */
                  }
                  onJoin(id)
                }}
              >
                {id}
              </button>
            ))}
          </div>
        )}
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
          <button className="btn btn-primary" onClick={join} disabled={name.trim() === ''}>
            Start
          </button>
        </div>
        {onGuide && (
          <p className="muted join-guide-link">
            Running the room?{' '}
            <button className="btn btn-quiet" onClick={onGuide}>
              Open the guide view →
            </button>
          </p>
        )}
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
  // the confirm disarms itself, but generously: a 4s window used to swap the
  // button back mid-click, so a slightly slow second click silently re-armed
  // instead of resetting ("reset sometimes doesn't work")
  useEffect(() => {
    if (!confirmReset) return
    const t = setTimeout(() => setConfirmReset(false), 15000)
    return () => clearTimeout(t)
  }, [confirmReset])
  return (
    <header className="topbar">
      <span className="cairn-mark" aria-hidden>
        <i /> <i /> <i />
      </span>
      <span className="brand">Cairn</span>
      {points !== null && (
        <span
          key={points}
          className="points-chip bump"
          aria-label={`${points} points`}
          title="Points measure EFFORT — every try earns some. Stones (on My cairn) mark skills mastered by passing their check."
        >
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
      {onReset && (
        <button
          className={confirmReset ? 'btn btn-quiet reset-confirm' : 'btn btn-quiet'}
          onClick={() => {
            if (confirmReset) {
              setConfirmReset(false)
              onReset()
              return
            }
            setConfirmReset(true)
          }}
          title={confirmReset ? 'Click again to erase' : 'Start this student over (demo)'}
        >
          {confirmReset ? 'Really erase progress?' : 'Reset demo'}
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
  testMode,
}: {
  apiBase: string
  student: string
  onLeave: () => void
  apiFactory?: (base: string, student: string) => CairnApi
  testMode?: boolean
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
    urlParam('view') === 'dashboard' ||
    (typeof window !== 'undefined' && window.location.hash === '#my-cairn')
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
  /** the map popup already showed this skill's preamble — don't repeat it */
  const skipIntroFor = useRef<string | null>(null)
  /** display mirror of focusSkill (the header chip) */
  const [focusedOn, setFocusedOn] = useState(false)
  /** skills whose check-unlocked interstitial was deferred, and how many
   * more serves to wait. "More practice first" means LATER, not never —
   * as a permanent set it silently retired the check card for the rest of
   * the session the first time a student chose the encouraged option. */
  const [checkDeferred, setCheckDeferred] = useState<ReadonlyMap<string, number>>(new Map())
  const checkDismissed = useMemo(
    () => new Set([...checkDeferred].filter(([, n]) => n > 0).map(([id]) => id)),
    [checkDeferred],
  )
  const deferCheck = useCallback((skillId: string) => {
    setCheckDeferred((m) => new Map(m).set(skillId, CHECK_DEFER_SERVES))
  }, [])
  /** serves that moved off a skill with ground gained, oldest first. A
   * queue because milestones are one-shot server-side (see refresh). */
  const [milestones, setMilestones] = useState<Array<NonNullable<ServerNext['milestone']>>>([])
  const milestone = milestones[0] ?? null
  const dismissMilestone = useCallback(() => setMilestones((q) => q.slice(1)), [])
  // Back must move between views, not exit the app: the work↔cairn
  // toggle rides on location.hash so phone back-gestures behave
  useEffect(() => {
    const wanted = view === 'dashboard' ? '#my-cairn' : ''
    try {
      if (window.location.hash !== wanted && (wanted !== '' || window.location.hash !== ''))
        window.history.pushState(null, '', wanted === '' ? window.location.pathname + window.location.search : wanted)
    } catch {
      /* history unavailable (embeds) is fine */
    }
  }, [view])
  useEffect(() => {
    const onPop = () => {
      setView(window.location.hash === '#my-cairn' ? 'dashboard' : 'work')
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])
  /** the just-answered skill unlocked its check — offer before moving on */
  const [unlockOffer, setUnlockOffer] = useState<string | null>(null)
  /** an alternative explanation playing in the lesson slot */
  const [overlay, setOverlay] = useState<OverlayExplanation | null>(null)

  // narration is always on (mute only silences it); the zoo scopes its
  // own voice — the full grid suspends, the single-explanation view speaks
  useEffect(() => {
    speech.warm()
  }, [])

  const refresh = useCallback(() => {
    setFetching(true)
    // a previous failure must not outrank a successful serve — the error
    // card sits above everything, so leaving it set made Retry look dead
    // while each click really did burn a serve (and a milestone with it)
    setError(null)
    api
      .next(focusSkill.current ?? undefined)
      .then((n) => {
        setNext(n)
        setPoints(n.points)
        // QUEUE, never overwrite. The server marks a milestone shown when it
        // GENERATES it, so one dropped here is destroyed for good: a second
        // refresh landing before the student dismissed the first used to
        // silently eat an award they had earned.
        if (n.milestone) setMilestones((q) => [...q, n.milestone!])
        // each further serve of a deferred skill burns down its deferral,
        // so the check comes back on offer after a little more practice
        const served =
          n.action.kind === 'serve_item'
            ? n.action.forSkillId
            : n.action.kind === 'lesson' || n.action.kind === 'alt_explanation'
              ? n.action.skillId
              : null
        if (served !== null)
          setCheckDeferred((m) => {
            const left = m.get(served)
            if (left === undefined || left <= 0) return m
            return new Map(m).set(served, left - 1)
          })
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
    // Reset = start over from a blank browser: the api scrubs its stored
    // state, we forget the name, then RELOAD so nothing in memory (cores,
    // component state, in-flight fetches) can survive and repopulate it.
    void api.reset().then(() => {
      try {
        localStorage.removeItem('cairn.student')
      } catch {
        /* storage unavailable is fine */
      }
      try {
        // drop ?student=/?seed= etc so the reload lands on the front door
        window.location.replace(window.location.pathname)
        return
      } catch {
        /* no navigation available (tests): fall back to unmounting */
      }
      onLeave()
    })
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
    // Complete the UNDERLYING lesson first, then record the chained
    // representation — recency decides which picture the practice problem
    // is framed in, and doing it the other way round made "show me another
    // way" end with the ORIGINAL lesson as the most recent one.
    await api.explanationViewed()
    await api.explained(overlay.explanation.id, overlay.skillId)
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
        testMode={testMode}
        onPick={(skillId) => {
          focusSkill.current = skillId
          skipIntroFor.current = skillId // the popup just showed the preamble
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
  } else if (milestone) {
    body = (
      <section className="card milestone-moment" aria-label={`Milestone on ${milestone.skillName}`}>
        <span className="milestone-pebble-big" aria-hidden />
        <h1>Milestone!</h1>
        <p className="milestone-blurb">
          You&rsquo;re doing great on {milestone.skillName}.
        </p>
        <div className="answer-row" style={{ justifyContent: 'center' }}>
          <button
            className="btn"
            onClick={() => {
              const id = milestone.skillId
              dismissMilestone()
              focusSkill.current = id
              setFocusedOn(true)
              refresh()
            }}
          >
            Keep going on this
          </button>
          <button className="btn btn-primary" autoFocus onClick={dismissMilestone}>
            Try another skill
          </button>
        </div>
      </section>
    )
  } else if (next.action.kind === 'lesson' || next.action.kind === 'alt_explanation') {
    const { skillId } = next.action
    const rep = next.explanation!.representation
    // the preamble belongs to the NEW-SKILL entry only, never to alternative
    // explanations or chained representations
    const introSkipped = skipIntroFor.current === skillId
    if (introSkipped) skipIntroFor.current = null
    // no preamble payload ⇒ not the skill's first lesson ⇒ no intro card
    const intro =
      next.action.kind === 'lesson' &&
      next.preamble !== undefined &&
      urlParam('autostart') !== '1' &&
      !introSkipped
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
              deferCheck(skillId)
            }}
          >
            More practice first
          </button>
        </div>
      </section>
    )
  } else {
    const paramHash = next.action.instance.paramHash
    const instanceKey = `${next.action.instance.itemId}#${paramHash}`
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
        onRetry={() => api.retry()}
        onContinue={(focus) => {
          if (focus !== undefined) {
            focusSkill.current = focus
            setFocusedOn(focus !== null)
          }
          refresh()
        }}
        onStartCheck={startCheck}
        fetchExplanation={(exclude, sameAsLesson) =>
          api.explain(
            skillId,
            exclude,
            itemRep ?? undefined,
            sameAsLesson,
            paramHash,
          )
        }
        onStepAttempt={(move) => {
          // fire-and-forget: telemetry must never block the student
          void api.stepAttempt(move).catch(() => {})
        }}
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

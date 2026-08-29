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

/** how many more serves of a skill to wait before re-offering its check
 * after the student chose "More practice first" */
const CHECK_DEFER_SERVES = 3

export function App({ apiBase = '', initialStudent, apiFactory, demoBanner }: AppProps) {
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
  const banner = demoBanner === true && (
    <p className="muted demo-banner">
      Demo — runs entirely in your browser. Progress stays on this device.
    </p>
  )
  if (guideMode)
    return (
      <>
        {banner}
        <GuidePage
          api={apiFactory ? apiFactory(apiBase, 'guide-viewer') : new SiteApi(apiBase, 'guide-viewer')}
          onBack={() => setGuideMode(false)}
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
        {banner}
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

function GuidePage({ api, onBack }: { api: CairnApi; onBack: () => void }) {
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
      <Guide api={api} />
    </main>
  )
}

function AboutPanel() {
  return (
    <section className="card about">
      <h1>Cairn</h1>
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
        This demo runs entirely in your browser — the full engine, event log and all, with no
        server. Type a name below to try it as a student.{' '}
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
      .catch(() => {
        // if we cannot tell, do not trap them on this page
        if (live) onPlaced()
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
      .catch(() => {
        /* never trap a student on the way in */
      })
      .finally(onPlaced)
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
        <p className="muted grade-page-note">
          Grades {available[0]}–{available[available.length - 1]} are built today; the rest are on
          the way.
        </p>
      </section>
    </main>
  )
}

function JoinCard({ onJoin, onGuide, about }: { onJoin: (id: string) => void; onGuide?: () => void; about?: boolean }) {
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
      {about && <AboutPanel />}
      <section className="card join">
        <h1>{about ? 'Try it as a student' : 'Welcome to Cairn'}</h1>
        <p className="muted">
          {about
            ? 'Pick any name — progress stays on this device under that name.'
            : 'Type your name to pick up where you left off.'}
        </p>
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
  /** the just-answered skill unlocked its check — offer before moving on */
  const [unlockOffer, setUnlockOffer] = useState<string | null>(null)
  /** an alternative explanation playing in the lesson slot */
  const [overlay, setOverlay] = useState<OverlayExplanation | null>(null)

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

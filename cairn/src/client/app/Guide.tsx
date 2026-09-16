/** Guide dashboard (build step 6, v1): the manager/tutor view — who needs
 * help NOW, and the roster's progress at a glance. Reached via ?view=guide;
 * never linked from the student UI (invariant 3: students see only their own
 * progress). The dev/demo surface has no auth; the real server gates this. */
import { useCallback, useEffect, useState } from 'react'
import type { CairnApi, GuideStudent, GuideStudentDetail, GuideView, RecentEvents } from './api'

/** guide-facing (not child-facing) reason copy — plain parent language,
 * describing what happened and implying the next move, never alarm */
const FLAG_COPY: Record<string, string> = {
  corrective_exhausted: 'worked through all the hints and is still stuck on',
  prereq_failure: 'may be missing an earlier skill needed for',
  attempt_cap: 'took a lot of tries without cracking',
}

const PHASE_LABEL: Record<string, string> = {
  lesson: 'in the lesson',
  practice: 'practicing',
}

function since(t: number): string {
  if (t === 0) return '—'
  const mins = Math.max(0, Math.round((Date.now() - t) / 60000))
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const h = Math.round(mins / 60)
  if (h < 48) return `${h}h ago`
  return `${Math.round(h / 24)}d ago`
}

export function Guide({ api, autoSeed = false }: { api: CairnApi; autoSeed?: boolean }) {
  const [view, setView] = useState<GuideView | null>(null)
  const [openStudent, setOpenStudent] = useState<string | null>(null)
  const [seeding, setSeeding] = useState(false)

  const refresh = useCallback(() => {
    void api.guide().then(setView)
  }, [api])
  useEffect(refresh, [refresh])

  // ?seed=1 populates an empty class; on the PAGES DEMO the guide view
  // seeds by default — a parent evaluating the product should see the
  // parent portal populated, not an empty state (external eval)
  useEffect(() => {
    let seed = autoSeed
    try {
      seed = seed || new URLSearchParams(window.location.search).get('seed') === '1'
    } catch {
      /* no window */
    }
    if (!seed) return
    void api.guide().then((v) => {
      if (v.students.length === 0) void api.seedClass().then(refresh)
    })
  }, [api, refresh, autoSeed])

  if (view === null) return <p className="muted loading">Loading…</p>

  // group by STUDENT: five kids with paused skills is five rows, not a
  // wall of nineteen warnings (dashboard rule: exceptions are summarized,
  // the raw feed lives in the drill-in)
  const flaggedStudents = view.students.filter((st) => st.flags.length > 0)
  const flagCount = flaggedStudents.reduce((n, st) => n + st.flags.length, 0)

  return (
    <div className="guide-grid">
      <div className="guide-main">
      <section className="card">
        <h1 className="dash-h">Your class</h1>
        {view.students.length === 0 ? (
          <div>
            <p className="muted">
              No students yet. Students appear here as soon as they start working.
            </p>
            <button
              className="btn btn-primary"
              disabled={seeding}
              onClick={() => {
                setSeeding(true)
                void api.seedClass().then(() => {
                  setSeeding(false)
                  refresh()
                })
              }}
            >
              {seeding ? 'Seeding…' : 'Seed a demo class'}
            </button>
          </div>
        ) : (
          <p className="muted">
            {view.students.length} students ·{' '}
            {flaggedStudents.length === 0
              ? 'everyone is moving along'
              : `${view.students.length - flaggedStudents.length} moving along · ${flaggedStudents.length} worth a look`}
          </p>
        )}
      </section>

      {flaggedStudents.length > 0 && (
        <section className="card">
          <h2 className="dash-h">Worth a look</h2>
          <p className="muted">
            Cairn paused these skills so nobody grinds alone — a short sit-down together usually
            clears them.
          </p>
          {flaggedStudents.map((st) => {
            const first = st.flags[0]!
            const more = st.flags.length - 1
            const pausedSkills = [...new Set(st.flags.map((f) => f.skillId).filter((x): x is string => x !== null))]
            return (
              <div key={st.id} className="guide-flag" role="listitem">
                <button className="btn btn-quiet guide-flag-name" onClick={() => setOpenStudent(st.id)}>
                  {st.id}
                </button>{' '}
                {FLAG_COPY[first.reason] ?? 'is paused on'}{' '}
                <em>{first.skillName ?? 'a skill'}</em>
                {more > 0 && <span className="muted"> and {more} more</span>}
                {pausedSkills.length > 0 && (
                  <button
                    className="btn btn-quiet guide-unpause"
                    onClick={() => {
                      void Promise.all(
                        pausedSkills.map((sk) => api.guideAction(st.id, 'unpause', sk)),
                      ).then(refresh)
                    }}
                  >
                    Unpause{pausedSkills.length > 1 ? ' all' : ''}
                  </button>
                )}
              </div>
            )
          })}
        </section>
      )}

      {openStudent !== null && (
        <StudentDetail
          api={api}
          id={openStudent}
          row={view.students.find((st) => st.id === openStudent) ?? null}
          onChanged={refresh}
          onClose={() => setOpenStudent(null)}
        />
      )}

      {view.students.length > 0 && (
        <section className="card">
          <h2 className="dash-h">Roster</h2>
          <div className="guide-table-scroll">
            <table className="guide-table">
              <thead>
                <tr>
                  <th>student</th>
                  <th>stones</th>
                  <th>working on</th>
                  <th>flags</th>
                  <th>last active</th>
                </tr>
              </thead>
              <tbody>
                {view.students.map((s) => (
                  <tr key={s.id} data-flagged={s.flags.length > 0 || undefined}>
                    <td className="guide-name">
                      <button
                        className="btn btn-quiet guide-open"
                        onClick={() => setOpenStudent(s.id)}
                        aria-label={`Open ${s.id}'s detail`}
                      >
                        {s.id}
                      </button>
                    </td>
                    <td className="guide-stones">
                      {s.mastered > 0 ? (
                        <span aria-label={`${s.mastered} skills mastered`}>
                          {'▮'.repeat(Math.min(s.mastered, 8))} {s.mastered}
                        </span>
                      ) : (
                        <span className="muted">0</span>
                      )}
                    </td>
                    <td>
                      {s.working.length === 0 ? (
                        <span className="muted">—</span>
                      ) : (
                        s.working.map((w) => (
                          <span key={w.skillId} className="guide-skill-chip" title={w.name}>
                            {w.name.length > 26 ? `${w.name.slice(0, 24)}…` : w.name}
                            <span className="guide-chip-bar" aria-hidden>
                              <span style={{ width: `${Math.round(w.masteryPct * 100)}%` }} />
                            </span>
                            <span className="muted"> {PHASE_LABEL[w.phase] ?? w.phase}</span>
                            {w.lapsed && ' · slipped'}
                          </span>
                        ))
                      )}
                    </td>
                    <td>{s.flags.length > 0 ? `⚑ ${s.flags.length}` : ''}</td>
                    <td className="muted">{since(s.lastActive)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      </div>

      <aside className="guide-rail">
        <EventStream api={api} />
      </aside>
    </div>
  )
}

/** One child, in the detail a guide can act on. The roster answers "who
 * needs me"; this answers "what is it". The stuck list is the payoff of
 * logging stepwise moves — it names the MOVE, not just the problem. */
function StudentDetail({
  api,
  id,
  row,
  onChanged,
  onClose,
}: {
  api: CairnApi
  id: string
  row: GuideStudent | null
  onChanged: () => void
  onClose: () => void
}) {
  const [d, setD] = useState<GuideStudentDetail | null>(null)
  const [err, setErr] = useState<string | null>(null)
  // a dialog closes on Escape — table stakes for a popup
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  const pausedSkills = [
    ...new Set((row?.flags ?? []).map((f) => f.skillId).filter((x): x is string => x !== null)),
  ]
  const act = (action: 'unpause' | 'focus' | 'unfocus', skillId?: string) =>
    void api.guideAction(id, action, skillId).then(onChanged)

  useEffect(() => {
    let live = true
    setD(null)
    setErr(null)
    api
      .guideStudentDetail(id)
      .then((r) => {
        if (live) setD(r)
      })
      .catch((e: unknown) => {
        if (live) setErr(String(e))
      })
    return () => {
      live = false
    }
  }, [api, id])

  return (
    <div className="guide-modal-backdrop" onClick={onClose}>
    <section
      className="card guide-detail guide-modal"
      role="dialog"
      aria-modal="true"
      aria-label={`${id} detail`}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="guide-detail-head">
        <h2 className="dash-h">{id}</h2>
        <button className="btn btn-quiet" onClick={onClose}>
          Close
        </button>
      </div>
      {pausedSkills.length > 0 && (
        <div className="guide-detail-paused">
          {pausedSkills.map((sk) => {
            const fl = row?.flags.find((f) => f.skillId === sk)
            return (
              <div key={sk} className="guide-flag">
                Paused: <em>{fl?.skillName ?? sk}</em>
                <button className="btn btn-quiet guide-unpause" onClick={() => act('unpause', sk)}>
                  Unpause
                </button>
              </div>
            )
          })}
        </div>
      )}
      {err !== null && <p className="muted">Could not load this student.</p>}
      {d === null && err === null && <p className="muted">Loading…</p>}
      {d !== null && (
        <>
          <p className="muted guide-detail-totals">
            {d.totals.correct}/{d.totals.attempts} problems right · {d.totals.stepMoves} steps
            worked · {d.totals.lessonsWatched} lessons watched
            {d.placedGrade !== null && ` · started at grade ${d.placedGrade}`}
          </p>

          <h3 className="guide-detail-h">Sticking points</h3>
          {d.stuck.length === 0 ? (
            <p className="muted">
              Nothing sticking out yet — no step has been missed more than once.
            </p>
          ) : (
            <div className="guide-table-scroll">
              <table className="guide-table guide-detail-table">
                <thead>
                  <tr>
                    <th>skill</th>
                    <th>step</th>
                    <th className="guide-num">missed</th>
                    <th className="guide-num">shown</th>
                  </tr>
                </thead>
                <tbody>
                  {d.stuck.slice(0, 6).map((sk) => {
                    const named = Object.entries(sk.misconceptions).sort((a, b) => b[1] - a[1])[0]
                    return (
                      <tr key={`${sk.explanationId}#${sk.stepIndex}`}>
                        <td>
                          <strong>{sk.skillName}</strong>
                          {named && <div className="guide-misc">keeps doing: {named[0]}</div>}
                        </td>
                        <td>{sk.stepIndex + 1}</td>
                        <td className="guide-num">{sk.misses}</td>
                        <td className="guide-num">{sk.reveals > 0 ? sk.reveals : '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          <h3 className="guide-detail-h">Skills</h3>
          <div className="guide-table-scroll">
            <table className="guide-table guide-detail-table">
              <thead>
                <tr>
                  <th>skill</th>
                  <th className="guide-num">mastery</th>
                  <th>status</th>
                  <th aria-label="focus" />
                </tr>
              </thead>
              <tbody>
                {d.skills.map((sk) => {
                  const focused = row?.guideFocus === sk.skillId
                  return (
                    <tr key={sk.skillId}>
                      <td>{sk.name}</td>
                      <td className="guide-num">{Math.round(sk.masteryPct * 100)}%</td>
                      <td className="muted">
                        {/* a declared starting grade is not earned mastery */}
                        {sk.placed ? 'assumed from grade' : sk.phase}
                        {sk.lapsed && ' · slipped'}
                      </td>
                      <td>
                        {sk.phase !== 'mastered' && (
                          <button
                            className={focused ? 'btn btn-quiet guide-focus guide-focus-on' : 'btn btn-quiet guide-focus'}
                            title={focused ? 'Stop focusing this skill' : 'Serve this skill next'}
                            onClick={() => act(focused ? 'unfocus' : 'focus', sk.skillId)}
                          >
                            {focused ? '★ focused' : '☆ focus'}
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <h3 className="guide-detail-h">Recent work</h3>
          <div className="guide-table-scroll">
            <table className="guide-table guide-detail-table">
              <thead>
                <tr>
                  <th aria-label="result" />
                  <th>skill</th>
                  <th>kind</th>
                  <th className="guide-num">time</th>
                </tr>
              </thead>
              <tbody>
                {d.recent.slice(0, 12).map((r, i) => (
                  <tr key={i}>
                    <td className={r.correct ? 'guide-ok' : 'guide-bad'}>{r.correct ? '✓' : '✗'}</td>
                    <td>{r.skillName}</td>
                    <td className="muted">
                      {r.itemKind}
                      {r.assisted && ' · helped'}
                    </td>
                    <td className="guide-num muted">{(r.latencyMs / 1000).toFixed(1)}s</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
    </div>
  )
}

/** The event log, live. Every serve, move and grade lands here as a
 * versioned, doubly-sequenced row — it is what separates an engine from a
 * nicely animated worksheet, and it was previously only visible from the
 * browser console. Rows are read-only; the log is the source of truth
 * that every view above is folded from. */
function EventStream({ api }: { api: CairnApi }) {
  const [data, setData] = useState<RecentEvents | null>(null)
  // live by default: an activity feed that must be discovered is dead
  // weight; the toggle pauses it instead
  const [open, setOpen] = useState(true)

  useEffect(() => {
    if (!open) return
    let live = true
    const pull = () => {
      api
        .recentEvents(40)
        .then((r) => {
          if (live) setData(r)
        })
        .catch(() => {
          /* the stream is an extra; never break the guide over it */
        })
    }
    pull()
    const h = setInterval(pull, 2000)
    return () => {
      live = false
      clearInterval(h)
    }
  }, [api, open])

  return (
    <section className="card">
      <div className="guide-detail-head">
        <h2 className="dash-h">
          Event log{data !== null && <span className="muted"> · {data.total} events</span>}
        </h2>
        <button className="btn btn-quiet" onClick={() => setOpen(!open)}>
          {open ? 'Pause feed' : 'Resume'}
        </button>
      </div>
      {!open ? (
        <p className="muted">
          A live feed of everything that happens — every problem served, every answer, every
          step. Everything above is computed from this record, and nothing else.
        </p>
      ) : data === null ? (
        <p className="muted">Loading…</p>
      ) : data.events.length === 0 ? (
        <p className="muted">Nothing yet — work a problem and rows will appear here.</p>
      ) : (
        <div className="event-stream" role="log" aria-label="Live event log">
          {data.events.map((e, i) => (
            <div className="event-row" key={`${String(e['siteSeq'])}-${i}`}>
              <span className="event-seq">#{String(e['siteSeq'])}</span>
              <span className={`event-kind kind-${String(e['kind'])}`}>{String(e['kind'])}</span>
              <span className="event-who">{String(e['studentId'])}</span>
              <span className="event-detail">
                {/* the SIGNALS come first — a long skill name must not push
                    correctness and latency off the end of the row */}
                {e['correct'] !== undefined && (
                  <span className={e['correct'] === true ? 'guide-ok' : 'guide-bad'}>
                    {e['correct'] === true ? '✓' : '✗'}{' '}
                  </span>
                )}
                {e['stepIndex'] !== undefined && (
                  <span className="muted">step {Number(e['stepIndex']) + 1} </span>
                )}
                {e['latencyMs'] !== undefined && (
                  <span className="muted">{(Number(e['latencyMs']) / 1000).toFixed(1)}s </span>
                )}
                {e['revealed'] === true && <span className="muted">shown </span>}
                {e['assisted'] === true && <span className="muted">assisted </span>}
                {e['hintLevel'] !== undefined && Number(e['hintLevel']) > 0 && (
                  <span className="muted">hint {String(e['hintLevel'])} </span>
                )}
                {e['misconceptionId'] !== undefined && (
                  <span className="guide-misc">{String(e['misconceptionId'])} </span>
                )}
                {e['skillName'] !== undefined && (
                  <span className="event-skill">{String(e['skillName'])}</span>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

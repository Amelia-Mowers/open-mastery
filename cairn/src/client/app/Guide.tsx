/** Guide dashboard (build step 6, v1): the manager/tutor view — who needs
 * help NOW, and the roster's progress at a glance. Reached via ?view=guide;
 * never linked from the student UI (invariant 3: students see only their own
 * progress). The dev/demo surface has no auth; the real server gates this. */
import { useCallback, useEffect, useState } from 'react'
import type { CairnApi, GuideStudentDetail, GuideView } from './api'

/** guide-facing (not child-facing) reason copy */
const FLAG_COPY: Record<string, string> = {
  corrective_exhausted: 'worked the full hint ladder and is still stuck',
  prereq_failure: 'is missing an earlier skill (probe failed)',
  attempt_cap: 'hit the session attempt cap',
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

export function Guide({ api }: { api: CairnApi }) {
  const [view, setView] = useState<GuideView | null>(null)
  const [openStudent, setOpenStudent] = useState<string | null>(null)
  const [seeding, setSeeding] = useState(false)

  const refresh = useCallback(() => {
    void api.guide().then(setView)
  }, [api])
  useEffect(refresh, [refresh])

  // demo-link convenience: ?seed=1 populates an empty class automatically
  useEffect(() => {
    let seed = false
    try {
      seed = new URLSearchParams(window.location.search).get('seed') === '1'
    } catch {
      /* no window */
    }
    if (!seed) return
    void api.guide().then((v) => {
      if (v.students.length === 0) void api.seedClass().then(refresh)
    })
  }, [api, refresh])

  if (view === null) return <p className="muted loading">Loading…</p>

  const flagged = view.students.flatMap((s) =>
    s.flags.map((f) => ({ student: s.id, ...f })),
  )

  return (
    <div>
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
            {flagged.length === 0 ? 'no open flags' : `${flagged.length} open flag${flagged.length === 1 ? '' : 's'}`}
          </p>
        )}
      </section>

      {flagged.length > 0 && (
        <section className="card">
          <h2 className="dash-h">Needs attention</h2>
          {flagged.map((f, i) => (
            <div key={i} className="guide-flag" role="listitem">
              <strong>{f.student}</strong>{' '}
              {FLAG_COPY[f.reason] ?? `flagged (${f.reason})`}
              {f.skillName && (
                <>
                  {' '}
                  on <em>{f.skillName}</em>
                </>
              )}
            </div>
          ))}
        </section>
      )}

      {openStudent !== null && (
        <StudentDetail api={api} id={openStudent} onClose={() => setOpenStudent(null)} />
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
  )
}

/** One child, in the detail a guide can act on. The roster answers "who
 * needs me"; this answers "what is it". The stuck list is the payoff of
 * logging stepwise moves — it names the MOVE, not just the problem. */
function StudentDetail({
  api,
  id,
  onClose,
}: {
  api: CairnApi
  id: string
  onClose: () => void
}) {
  const [d, setD] = useState<GuideStudentDetail | null>(null)
  const [err, setErr] = useState<string | null>(null)

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
    <section className="card guide-detail" aria-label={`${id} detail`}>
      <div className="guide-detail-head">
        <h2 className="dash-h">{id}</h2>
        <button className="btn btn-quiet" onClick={onClose}>
          Close
        </button>
      </div>
      {err !== null && <p className="muted">Could not load this student.</p>}
      {d === null && err === null && <p className="muted">Loading…</p>}
      {d !== null && (
        <>
          <p className="muted guide-detail-totals">
            {d.totals.correct}/{d.totals.attempts} problems right · {d.totals.stepMoves} steps
            worked · {d.totals.lessonsWatched} lessons watched
            {d.placedGrade !== null && ` · started at grade ${d.placedGrade}`}
          </p>

          <h3 className="guide-detail-h">Where the moves break</h3>
          {d.stuck.length === 0 ? (
            <p className="muted">
              Nothing sticking out yet — no step has been missed more than once.
            </p>
          ) : (
            <ul className="guide-stuck">
              {d.stuck.slice(0, 6).map((sk) => {
                const named = Object.entries(sk.misconceptions).sort((a, b) => b[1] - a[1])[0]
                return (
                  <li key={`${sk.explanationId}#${sk.stepIndex}`}>
                    <strong>{sk.skillName}</strong> · step {sk.stepIndex + 1}
                    <span className="muted">
                      {' '}
                      — {sk.misses} miss{sk.misses === 1 ? '' : 'es'}
                      {sk.reveals > 0 && `, ${sk.reveals} shown`}
                    </span>
                    {named && <div className="guide-misc">keeps doing: {named[0]}</div>}
                  </li>
                )
              })}
            </ul>
          )}

          <h3 className="guide-detail-h">Skills</h3>
          <ul className="guide-detail-skills">
            {d.skills.map((sk) => (
              <li key={sk.skillId}>
                {sk.name}
                <span className="muted">
                  {' '}
                  — {Math.round(sk.masteryPct * 100)}%
                  {/* a declared starting grade is not earned mastery */}
                  {sk.placed ? ' (assumed from grade)' : ` · ${sk.phase}`}
                  {sk.lapsed && ' · slipped'}
                </span>
              </li>
            ))}
          </ul>

          <h3 className="guide-detail-h">Recent work</h3>
          <ul className="guide-recent">
            {d.recent.slice(0, 12).map((r, i) => (
              <li key={i}>
                <span className={r.correct ? 'guide-ok' : 'guide-bad'}>{r.correct ? '✓' : '✗'}</span>{' '}
                {r.skillName}
                <span className="muted">
                  {' '}
                  · {r.itemKind}
                  {r.assisted && ' · helped'} · {(r.latencyMs / 1000).toFixed(1)}s
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

/** Guide dashboard (build step 6, v1): the manager/tutor view — who needs
 * help NOW, and the roster's progress at a glance. Reached via ?view=guide;
 * never linked from the student UI (invariant 3: students see only their own
 * progress). The dev/demo surface has no auth; the real server gates this. */
import { useCallback, useEffect, useState } from 'react'
import type { CairnApi, GuideView } from './api'

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
                    <td className="guide-name">{s.id}</td>
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

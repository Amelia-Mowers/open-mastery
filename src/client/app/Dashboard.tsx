/** Student progress view: your cairn (a stone per mastered skill), points,
 * and the skill map — prereq layers flowing top to bottom. Personal progress
 * only; no comparisons (invariant 3). */
import { useEffect, useMemo, useState } from 'react'
import type { BundleView, SiteApi, StateView } from './api'

const PHASE_STYLE: Record<string, { bg: string; fg: string; label: string }> = {
  unseen: { bg: '#ede7db', fg: '#8b8070', label: 'up ahead' },
  lesson: { bg: '#e7d9be', fg: '#6b5a33', label: 'learning' },
  faded: { bg: '#e7d9be', fg: '#6b5a33', label: 'learning' },
  practice: { bg: '#ecd0b0', fg: '#8a5320', label: 'practicing' },
  mastered: { bg: '#dbe8d6', fg: '#3f6a4d', label: 'mastered ✓' },
}

const STONES = ['#b05f28', '#8b6a4d', '#5c4a38', '#a8814f', '#6e5a45', '#96502a']

export function Dashboard({ api }: { api: SiteApi }) {
  const [bundle, setBundle] = useState<BundleView | null>(null)
  const [state, setState] = useState<StateView | null>(null)
  useEffect(() => {
    void api.bundle().then(setBundle)
    void api.state().then(setState)
  }, [api])

  const layout = useMemo(() => {
    if (!bundle) return null
    const depth = new Map<string, number>()
    const skillById = new Map(bundle.skills.map((s) => [s.id, s]))
    const depthOf = (id: string, seen: string[] = []): number => {
      if (depth.has(id)) return depth.get(id)!
      if (seen.includes(id)) return 0
      const s = skillById.get(id)
      const d = !s || s.prereqs.length === 0
        ? 0
        : 1 + Math.max(...s.prereqs.map((p) => depthOf(p, [...seen, id])))
      depth.set(id, d)
      return d
    }
    bundle.skills.forEach((s) => depthOf(s.id))
    const layers: string[][] = []
    for (const s of bundle.skills) {
      const d = depth.get(s.id)!
      ;(layers[d] ??= []).push(s.id)
    }
    // node centers in percent, per layer; order each layer by the average x
    // of its prereqs (barycentric) so edges don't cross
    const pos = new Map<string, { x: number; y: number }>()
    const rowH = 96
    layers.forEach((layer, li) => {
      if (li > 0) {
        layer.sort((a, b) => {
          const bary = (id: string): number => {
            const xs = (skillById.get(id)?.prereqs ?? [])
              .map((p) => pos.get(p)?.x)
              .filter((x): x is number => x !== undefined)
            return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 50
          }
          return bary(a) - bary(b)
        })
      }
      layer.forEach((id, i) =>
        pos.set(id, { x: ((i + 1) / (layer.length + 1)) * 100, y: li * rowH + 40 }),
      )
    })
    return { layers, pos, height: layers.length * rowH + 20, skillById }
  }, [bundle])

  if (!bundle || !state || !layout) return <p className="muted loading">Loading…</p>

  const masteredIds = bundle.skills.filter((s) => state.skills[s.id]?.phase === 'mastered')
  const flaggedIds = new Set(state.openFlags.map((f) => f.skillId).filter(Boolean))

  return (
    <div>
      <section className="card dash-top">
        <div className="cairn-stack" aria-label={`${masteredIds.length} skills mastered`}>
          {masteredIds.length === 0 ? (
            <p className="muted">Your cairn starts with your first mastered skill.</p>
          ) : (
            <div className="stones">
              {masteredIds.map((s, i) => (
                <div
                  key={s.id}
                  className="stone"
                  title={s.name}
                  style={{
                    width: Math.max(56, 148 - i * 22),
                    background: STONES[i % STONES.length],
                    animationDelay: `${i * 0.08}s`,
                  }}
                />
              ))}
            </div>
          )}
          <p className="stack-label">
            {masteredIds.length === 0
              ? ''
              : `${masteredIds.length} stone${masteredIds.length === 1 ? '' : 's'} stacked`}
          </p>
        </div>
        <div className="dash-points">
          <div className="dash-points-num">{state.points}</div>
          <div className="muted">points earned</div>
        </div>
      </section>

      <section className="card">
        <h2 className="dash-h">Your path</h2>
        <div className="skill-map" style={{ height: layout.height }}>
          <svg
            className="skill-edges"
            viewBox={`0 0 100 ${layout.height}`}
            preserveAspectRatio="none"
            aria-hidden
          >
            {bundle.skills.flatMap((s) =>
              s.prereqs.map((p) => {
                const a = layout.pos.get(p)
                const b = layout.pos.get(s.id)
                if (!a || !b) return null
                return (
                  <line
                    key={`${p}->${s.id}`}
                    x1={a.x}
                    y1={a.y + 24}
                    x2={b.x}
                    y2={b.y - 24}
                    stroke="#d8cdbb"
                    strokeWidth="0.6"
                    strokeDasharray="1.4 1.4"
                  />
                )
              }),
            )}
          </svg>
          {bundle.skills.map((s) => {
            const phase = state.skills[s.id]?.phase ?? 'unseen'
            const unlocked = s.prereqs.every((pr) => state.skills[pr]?.phase === 'mastered')
            const style =
              phase === 'unseen'
                ? unlocked
                  ? { bg: '#f3e4d4', fg: '#8a5320', label: 'ready for you' }
                  : PHASE_STYLE['unseen']!
                : (PHASE_STYLE[phase] ?? PHASE_STYLE['unseen']!)
            const p = layout.pos.get(s.id)!
            return (
              <div
                key={s.id}
                className="skill-node"
                data-phase={phase}
                style={{
                  left: `${p.x}%`,
                  top: p.y,
                  background: style.bg,
                  color: style.fg,
                  borderColor: flaggedIds.has(s.id) ? '#a8453a' : 'transparent',
                }}
              >
                <div className="skill-node-name">{s.name}</div>
                <div className="skill-node-phase">{style.label}</div>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}

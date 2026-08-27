/** Student progress view: your cairn (a stone per mastered skill), points,
 * and the skill map — prereq layers flowing top to bottom. Personal progress
 * only; no comparisons (invariant 3). */
import { useEffect, useMemo, useState } from 'react'
import type { BundleView, CairnApi, StateView } from './api'

const PHASE_STYLE: Record<string, { bg: string; fg: string; label: string }> = {
  unseen: { bg: '#ede7db', fg: '#8b8070', label: 'up ahead' },
  lesson: { bg: '#e7d9be', fg: '#6b5a33', label: 'learning' },
  faded: { bg: '#e7d9be', fg: '#6b5a33', label: 'learning' },
  practice: { bg: '#ecd0b0', fg: '#8a5320', label: 'practicing' },
  mastered: { bg: '#dbe8d6', fg: '#3f6a4d', label: 'mastered ✓' },
}

const STONES = ['#b05f28', '#8b6a4d', '#5c4a38', '#a8814f', '#6e5a45', '#96502a']

export function Dashboard({
  api,
  onPick,
}: {
  api: CairnApi
  /** click an unlocked, unmastered skill to go work on it */
  onPick?: (skillId: string) => void
}) {
  const [bundle, setBundle] = useState<BundleView | null>(null)
  const [state, setState] = useState<StateView | null>(null)
  useEffect(() => {
    void api.bundle().then(setBundle)
    void api.state().then(setState)
  }, [api])

  /** One block per connected component of the prereq graph — unrelated
   * curricula never share rows or cross edges. Within a block: layer = longest
   * prereq chain, then barycenter sweeps (down by prereqs, up by children,
   * down again) order each row to keep edges short and uncrossed. */
  const layout = useMemo(() => {
    if (!bundle) return null
    const skillById = new Map(bundle.skills.map((s) => [s.id, s]))
    const depth = new Map<string, number>()
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

    // connected components (union-find over prereq edges)
    const parent = new Map<string, string>(bundle.skills.map((s) => [s.id, s.id]))
    const find = (x: string): string => {
      let r = x
      while (parent.get(r) !== r) r = parent.get(r)!
      parent.set(x, r)
      return r
    }
    for (const s of bundle.skills)
      for (const p of s.prereqs) if (skillById.has(p)) parent.set(find(p), find(s.id))
    const compIds = new Map<string, string[]>()
    for (const s of bundle.skills) (compIds.get(find(s.id)) ?? compIds.set(find(s.id), []).get(find(s.id))!).push(s.id)

    const children = new Map<string, string[]>()
    for (const s of bundle.skills)
      for (const p of s.prereqs) (children.get(p) ?? children.set(p, []).get(p)!).push(s.id)

    const rowH = 150
    const gapBetween = 46
    let yOffset = 0
    const pos = new Map<string, { x: number; y: number; rowLen: number }>()
    const blocks = [...compIds.values()].map((ids) => {
      const layers: string[][] = []
      for (const id of ids) (layers[depth.get(id)!] ??= []).push(id)
      const order = new Map<string, number>()
      const setOrders = (layer: string[]) => layer.forEach((id, i) => order.set(id, i))
      layers.forEach(setOrders)
      const bary = (id: string, over: (id: string) => string[]): number => {
        const xs = over(id).map((n) => order.get(n)).filter((x): x is number => x !== undefined)
        return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : (order.get(id) ?? 0)
      }
      const sweep = (down: boolean) => {
        const idxs = down ? layers.keys() : [...layers.keys()].reverse()
        for (const li of idxs) {
          const over = down
            ? (id: string) => skillById.get(id)?.prereqs ?? []
            : (id: string) => children.get(id) ?? []
          layers[li]!.sort((a, b) => bary(a, over) - bary(b, over))
          setOrders(layers[li]!)
        }
      }
      sweep(true)
      sweep(false)
      sweep(true)
      layers.forEach((layer, li) =>
        layer.forEach((id, i) =>
          pos.set(id, { x: ((i + 1) / (layer.length + 1)) * 100, y: yOffset + li * rowH + 58, rowLen: layer.length }),
        ),
      )
      const height = layers.length * rowH
      const top = yOffset
      yOffset += height + gapBetween
      const maxRow = Math.max(...layers.map((l) => l.length), 1)
      return { ids, top, height, maxRow }
    })
    return { blocks, pos, height: Math.max(0, yOffset - gapBetween) + 12, skillById }
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
                  title={
                    s.standards.length > 0
                      ? `${s.name}\n${s.standards.map((c) => c.replace('CCSS.MATH.CONTENT.', '')).join(', ')}`
                      : s.name
                  }
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
        <div className="skill-map-scroll">
        <div className="skill-map" style={{ height: layout.height }}>
          <svg
            className="skill-edges"
            viewBox={`0 0 100 ${layout.height}`}
            preserveAspectRatio="none"
            aria-hidden
          >
            {bundle.skills.flatMap((s) => {
              const unlocked = s.prereqs.every((pr) => state.skills[pr]?.phase === 'mastered')
              return s.prereqs.map((p) => {
                const a = layout.pos.get(p)
                const b = layout.pos.get(s.id)
                if (!a || !b) return null
                const y1 = a.y + 46
                const y2 = b.y - 46
                const mid = (y1 + y2) / 2
                return (
                  <path
                    key={`${p}->${s.id}`}
                    d={`M ${a.x} ${y1} C ${a.x} ${mid}, ${b.x} ${mid}, ${b.x} ${y2}`}
                    fill="none"
                    stroke={unlocked ? '#c4a37f' : '#ddd3c2'}
                    strokeWidth={unlocked ? 0.7 : 0.55}
                    vectorEffect="non-scaling-stroke"
                  />
                )
              })
            })}
          </svg>
          {/* dividers between unrelated paths */}
          {layout.blocks.slice(1).map((b) => (
            <div
              key={`div-${b.top}`}
              aria-hidden
              style={{
                position: 'absolute',
                left: '6%',
                right: '6%',
                top: b.top - 24,
                borderTop: '1.5px dashed #e0d7c7',
              }}
            />
          ))}
          {layout.blocks.flatMap((block) =>
            block.ids.map((id, idx) => {
              const s = layout.skillById.get(id)!
              const phase = state.skills[s.id]?.phase ?? 'unseen'
              const unlocked = s.prereqs.every((pr) => state.skills[pr]?.phase === 'mastered')
              const style =
                phase === 'unseen'
                  ? unlocked
                    ? { bg: '#f3e4d4', fg: '#8a5320', label: 'ready for you' }
                    : PHASE_STYLE['unseen']!
                  : (PHASE_STYLE[phase] ?? PHASE_STYLE['unseen']!)
              const p = layout.pos.get(s.id)!
              const pickable = onPick !== undefined && unlocked && phase !== 'mastered'
              return (
                <div
                  key={s.id}
                  className="skill-node"
                  data-phase={phase}
                  role={pickable ? 'button' : undefined}
                  tabIndex={pickable ? 0 : undefined}
                  onClick={pickable ? () => onPick(s.id) : undefined}
                  onKeyDown={
                    pickable
                      ? (e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            onPick(s.id)
                          }
                        }
                      : undefined
                  }
                  title={
                    s.standards.length > 0
                      ? `${s.name}\n${s.standards.map((c) => c.replace('CCSS.MATH.CONTENT.', '')).join(', ')}`
                      : s.name
                  }
                  style={{
                    cursor: pickable ? 'pointer' : undefined,
                    left: `${p.x}%`,
                    top: p.y,
                    // centers are 100/(n+1)% apart within this node's own row
                    width: `min(230px, ${Math.max(12, Math.floor(100 / (p.rowLen + 1)) - 2)}%)`,
                    background: style.bg,
                    color: style.fg,
                    borderColor: flaggedIds.has(s.id) ? '#a8453a' : 'transparent',
                    animationDelay: `${idx * 0.06}s`,
                  }}
                >
                  <div className="skill-node-name">{s.name}</div>
                  <div className="skill-node-phase">{style.label}</div>
                  <div className="node-bar" aria-hidden>
                    <span
                      style={{
                        width: `${Math.round(
                          ((state.skills[s.id] as { masteryPct?: number } | undefined)?.masteryPct ??
                            state.skills[s.id]?.p ??
                            0) * 100,
                        )}%`,
                      }}
                    />
                  </div>
                </div>
              )
            }),
          )}
        </div>
        </div>
      </section>
    </div>
  )
}

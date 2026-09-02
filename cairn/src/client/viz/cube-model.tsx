/** Cube model: n³ built the way the mind builds it — the n×n square appears
 * (unit grid), then n square SLICES stack back into depth, each offset like a
 * deck of cards, until the cube stands. Lesson-only for now (planned input:
 * count the visible unit cubes). */
import { useSyncExternalStore } from 'react'
import type { WidgetInstance, WidgetMode } from '../widgets/contract'
import { WidgetStore } from '../widgets/store'

export interface CubeModelParams {
  /** edge length, 2..12 */
  n: number
}

export interface CubeModelView {
  /** how many n×n slices are stacked (1 = the flat square, n = the cube) */
  slices?: number | null
  /** running count shown on the front face, e.g. "2 × 16 = 32" */
  count?: string | null
  /** decomposition staging: horizontal dividers + row-count label (default
   * true; a timeline building the face from the equation starts false) */
  rowsIn?: boolean
  /** vertical dividers + column-count label (default true) */
  colsIn?: boolean
}

type CubeState = {
  slices: number | null
  count: string | null
  rowsIn: boolean
  colsIn: boolean
}

const label = (p: CubeModelParams): string =>
  `Cube model: an ${p.n} by ${p.n} square stacked ${p.n} deep`

export function createCubeModel(): WidgetInstance<CubeModelParams, null, CubeModelView> {
  const store = new WidgetStore<CubeState>({ slices: 1, count: null, rowsIn: true, colsIn: true })

  function View({ params, mode: _mode }: { params: CubeModelParams; mode: WidgetMode }) {
    const state = useSyncExternalStore(store.subscribe, store.getState, store.getState)
    const n = Math.max(2, Math.min(12, Math.round(params.n)))
    const u = Math.min(30, Math.max(16, Math.floor(180 / n)))
    const d = Math.max(6, Math.round(u * 0.42)) // per-slice depth offset
    const face = n * u
    const depth = (n - 1) * d
    const W = face + depth + 8
    const H = face + depth + 8
    const k = Math.max(1, Math.min(n, state.slices ?? n))
    const grid = (ox: number, oy: number, key: number, front: boolean) => (
      <g key={key} data-slice style={{ animation: 'cairn-rise 0.4s ease both' }}>
        <rect
          x={ox}
          y={oy}
          width={face}
          height={face}
          fill={front ? '#fffdf9' : '#f4ead9'}
          stroke="#5c4a38"
          strokeWidth={front ? 2.5 : 1.5}
          rx={4}
        />
        {Array.from({ length: n - 1 }, (_, i) => (
          <g key={i}>
            {state.colsIn && (
              <line x1={ox + (i + 1) * u} y1={oy} x2={ox + (i + 1) * u} y2={oy + face} stroke="#d9cdb8" strokeWidth={1} />
            )}
            {state.rowsIn && (
              <line x1={ox} y1={oy + (i + 1) * u} x2={ox + face} y2={oy + (i + 1) * u} stroke="#d9cdb8" strokeWidth={1} />
            )}
          </g>
        ))}
      </g>
    )
    // back slices first (up-and-right), front slice last
    const slices = Array.from({ length: k }, (_, j) => {
      const back = k - 1 - j // j=0 → furthest back
      const ox = 4 + depth - back * d + (back === 0 ? 0 : 0)
      return { back, ox }
    })
    // gutter for the dimension counts (rows left, columns below) — the
    // labels are opacity-staged with their dividers, never absent
    const LG = 18
    const dimStyle = (on: boolean) => ({
      font: "700 15px 'Lora', Georgia, serif",
      fill: '#8a5320',
      opacity: on ? 1 : 0,
      transition: 'opacity 0.4s ease',
    })
    return (
      <div role="img" aria-label={label(params)} style={{ maxWidth: 420 + LG, margin: '0 auto' }}>
        <svg
          viewBox={`0 0 ${W + LG} ${H + LG}`}
          style={{ width: '100%', maxWidth: W + LG, display: 'block', margin: '0 auto' }}
          aria-hidden
        >
          <g transform={`translate(${LG},0)`}>
            {Array.from({ length: k }, (_, j) => {
              const back = k - 1 - j // draw furthest first
              return grid(4 + back * d, 4 + depth - back * d, back, back === 0)
            })}
            {state.count !== null && (
              <text
                x={4 + face / 2}
                y={4 + depth + face / 2}
                textAnchor="middle"
                dominantBaseline="central"
                data-count
                style={{ font: "700 26px 'Lora', Georgia, serif", fill: '#2e2822' }}
              >
                <tspan
                  style={{
                    paintOrder: 'stroke',
                    stroke: '#fffdf9',
                    strokeWidth: 10,
                    strokeLinejoin: 'round',
                  }}
                >
                  {state.count}
                </tspan>
              </text>
            )}
          </g>
          <text
            x={LG / 2 + 1}
            y={4 + depth + face / 2}
            textAnchor="middle"
            dominantBaseline="central"
            data-rows-label
            style={dimStyle(state.rowsIn)}
          >
            {n}
          </text>
          <text
            x={LG + 4 + face / 2}
            y={4 + depth + face + 14}
            textAnchor="middle"
            data-cols-label
            style={dimStyle(state.colsIn)}
          >
            {n}
          </text>
        </svg>
      </div>
    )
  }

  return {
    render: (params, mode) => <View params={params} mode={mode} />,
    extract: () => null,
    trace: () => store.trace(),
    applyPatch: (patch) => {
      store.record('patch', patch)
      const next: Partial<CubeState> = {}
      if (patch.slices !== undefined) next.slices = patch.slices
      if (patch.count !== undefined) next.count = patch.count ?? null
      if (patch.rowsIn !== undefined) next.rowsIn = patch.rowsIn === true
      if (patch.colsIn !== undefined) next.colsIn = patch.colsIn === true
      store.setState(next)
    },
    a11y: { role: 'img', label },
  }
}

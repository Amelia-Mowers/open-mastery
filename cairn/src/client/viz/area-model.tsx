/** Illustrative Mathematics' area/rectangle diagram (IM 6–8 first ed.,
 * G6 U6 L10 "The Distributive Property, Part 2", CC BY 4.0) as a viz
 * widget: a rectangle of height h partitioned into columns whose widths are
 * labeled, demonstrating h(p₁ + p₂ + …) = h·p₁ + h·p₂ + … by area. */
import { useSyncExternalStore } from 'react'
import type { WidgetInstance, WidgetMode } from '../widgets/contract'
import { WidgetStore } from '../widgets/store'

export interface AreaModelParams {
  /** the common factor (rectangle height label) */
  height: string
  /** column width labels, e.g. ["x", "2"] */
  parts: string[]
}

export interface AreaModelView {
  /** per-column product labels shown inside the cells, e.g. ["3x", "6"] */
  products?: string[]
  /** 1-based column indices to highlight */
  highlight?: number[]
  /** unit-grid build-up: tint the first n rows of numeric cells (null = none) */
  fillRows?: number | null
}

type AreaState = {
  products: string[] | null
  highlight: number[]
  fillRows: number | null
}

const label = (p: AreaModelParams): string =>
  `Area model: a rectangle ${p.height} tall split into widths ${p.parts.join(' and ')}`

export function createAreaModel(): WidgetInstance<AreaModelParams, null, AreaModelView> {
  const store = new WidgetStore<AreaState>({ products: null, highlight: [], fillRows: null })

  /** small positive integer, or null — numeric dimensions get a unit grid
   * and proportional sizing so "6 rows of 6" LOOKS like 6 rows of 6 */
  const dim = (s: string): number | null => {
    const n = Number(s)
    return Number.isInteger(n) && n > 0 && n <= 14 ? n : null
  }

  function View({ params, mode: _mode }: { params: AreaModelParams; mode: WidgetMode }) {
    const state = useSyncExternalStore(store.subscribe, store.getState, store.getState)
    const cols = params.parts.length
    const h = dim(params.height)
    // TRUE-TO-SCALE geometry: every numeric dimension is w units wide and
    // the rectangle is exactly h units tall, so a unit grid shows the REAL
    // cell counts (6² is a 6×6 square, the "2" column is 2 columns wide).
    // Variable columns get a fixed symbolic width in units.
    const widthUnits = params.parts.map((w) => dim(w) ?? (h ? Math.max(4, Math.round(h * 1.3)) : 5))
    const totalUnits = widthUnits.reduce((a, b) => a + b, 0)
    const unit = Math.min(
      34,
      Math.max(14, Math.floor(Math.min(h ? 220 / h : 34, 460 / Math.max(1, totalUnits)))),
    )
    const boxH = h ? h * unit : 110
    const boxW = totalUnits * unit
    const grid = (w: string): string | undefined => {
      if (!h || dim(w) === null) return undefined
      return (
        `repeating-linear-gradient(90deg, #e4dbc9 0, #e4dbc9 1px, transparent 1px, transparent ${unit}px), ` +
        `repeating-linear-gradient(0deg, #e4dbc9 0, #e4dbc9 1px, transparent 1px, transparent ${unit}px)`
      )
    }
    return (
      <div role="img" aria-label={label(params)} style={{ width: boxW + 56, maxWidth: '100%', margin: '0 auto' }}>
        {/* width labels above the columns */}
        <div style={{ display: 'flex', marginLeft: 56 }}>
          {params.parts.map((w, i) => (
            <div
              key={i}
              data-width-label
              style={{
                width: widthUnits[i]! * unit,
                textAlign: 'center',
                font: "600 19px 'Lora', Georgia, serif",
                color: '#5c5245',
                paddingBottom: 4,
              }}
            >
              {w}
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'stretch' }}>
          {/* height label */}
          <div
            data-height-label
            style={{
              width: 56,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              font: "600 22px 'Lora', Georgia, serif",
              color: '#5c5245',
            }}
          >
            {params.height}
          </div>
          {/* the partitioned rectangle — exact unit dimensions */}
          <div
            style={{
              width: boxW,
              flex: 'none',
              display: 'flex',
              border: '2.5px solid #5c4a38',
              borderRadius: 8,
              overflow: 'hidden',
              height: boxH,
              background: '#fffdf9',
            }}
          >
            {params.parts.map((_, i) => {
              const highlighted = state.highlight.includes(i + 1)
              return (
                <div
                  key={i}
                  data-cell
                  data-highlighted={highlighted || undefined}
                  style={{
                    position: 'relative',
                    width: widthUnits[i]! * unit,
                    flex: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRight: i < cols - 1 ? '2px dashed #8b6a4d' : 'none',
                    backgroundColor: highlighted ? '#f7e6d4' : 'transparent',
                    backgroundImage: grid(params.parts[i]!),
                    font: "600 clamp(16px, 4vw, 24px) 'Lora', Georgia, serif",
                    color: highlighted ? '#8a4d1d' : '#2e2822',
                    transition: 'background 0.3s ease, color 0.3s ease',
                    animation: 'cairn-rise 0.35s ease both',
                    animationDelay: `${i * 0.08}s`,
                    padding: 6,
                  }}
                >
                  {h !== null && dim(params.parts[i]!) !== null && state.fillRows !== null && (
                    <div
                      data-fill-rows
                      aria-hidden
                      style={{
                        position: 'absolute',
                        left: 0,
                        right: 0,
                        top: 0,
                        height: Math.min(state.fillRows, h) * unit,
                        background: 'rgba(176, 95, 40, 0.16)',
                        transition: 'height 0.6s ease',
                      }}
                    />
                  )}
                  <span
                    data-product
                    style={
                      state.products?.[i]
                        ? { background: 'rgba(255,253,249,0.88)', padding: '2px 10px', borderRadius: 8 }
                        : undefined
                    }
                  >
                    {state.products?.[i] ?? ''}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  return {
    render: (params, mode) => <View params={params} mode={mode} />,
    extract: () => null,
    trace: () => store.trace(),
    applyPatch: (patch) => {
      store.record('patch', patch)
      const next: Partial<AreaState> = {}
      if (patch.products !== undefined) next.products = patch.products ?? null
      if (patch.highlight !== undefined) next.highlight = patch.highlight ?? []
      if (patch.fillRows !== undefined) next.fillRows = patch.fillRows
      store.setState(next)
    },
    a11y: { role: 'img', label },
  }
}

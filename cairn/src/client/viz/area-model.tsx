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
  /** decomposition staging (default true): height label + horizontal unit
   * rows arrive with their gate */
  heightIn?: boolean
  /** width partition: column borders, width labels, vertical unit lines */
  partsIn?: boolean
}

type AreaState = {
  heightIn: boolean
  partsIn: boolean
  products: string[] | null
  highlight: number[]
  fillRows: number | null
}

const label = (p: AreaModelParams): string =>
  `Area model: a rectangle ${p.height} tall split into widths ${p.parts.join(' and ')}`

export interface AreaModelConfig {
  height?: string
  parts?: string[]
  /** problem mode: products with exactly one '?' — the input cell */
  products?: Array<string | number>
}

export function createAreaModel(
  config: AreaModelConfig = {},
): WidgetInstance<AreaModelParams, { raw: string; value: number | null } | null, AreaModelView> {
  const store = new WidgetStore<AreaState & { raw: string }>({ heightIn: true, partsIn: true, products: null, highlight: [], fillRows: null, raw: '' })

  /** small positive integer, or null — numeric dimensions get a unit grid
   * and proportional sizing so "6 rows of 6" LOOKS like 6 rows of 6 */
  const dim = (s: string): number | null => {
    const n = Number(s)
    return Number.isInteger(n) && n > 0 && n <= 14 ? n : null
  }

  function View({ params, mode }: { params: AreaModelParams; mode: WidgetMode }) {
    const state = useSyncExternalStore(store.subscribe, store.getState, store.getState)
    const interactive = mode !== 'lesson' && Array.isArray(config.products)
    const effParams = interactive
      ? { height: String(config.height ?? ''), parts: (config.parts ?? []).map(String) }
      : params
    const shownProducts = interactive ? config.products!.map(String) : state.products
    const cols = effParams.parts.length
    const h = dim(effParams.height)
    // TRUE-TO-SCALE geometry: every numeric dimension is w units wide and
    // the rectangle is exactly h units tall, so a unit grid shows the REAL
    // cell counts (6² is a 6×6 square, the "2" column is 2 columns wide).
    // Variable columns get a fixed symbolic width in units.
    const widthUnits = effParams.parts.map((w) => dim(w) ?? (h ? Math.max(4, Math.round(h * 1.3)) : 5))
    const totalUnits = widthUnits.reduce((a, b) => a + b, 0)
    const unit = Math.min(
      34,
      Math.max(14, Math.floor(Math.min(h ? 220 / h : 34, 460 / Math.max(1, totalUnits)))),
    )
    const boxH = h ? h * unit : 110
    const boxW = totalUnits * unit
    const grid = (w: string): string | undefined => {
      if (!h || dim(w) === null) return undefined
      const layers: string[] = []
      if (state.partsIn)
        layers.push(`repeating-linear-gradient(90deg, #e4dbc9 0, #e4dbc9 1px, transparent 1px, transparent ${unit}px)`)
      if (state.heightIn)
        layers.push(`repeating-linear-gradient(0deg, #e4dbc9 0, #e4dbc9 1px, transparent 1px, transparent ${unit}px)`)
      return layers.length > 0 ? layers.join(', ') : undefined
    }
    return (
      <div role="img" aria-label={label(effParams)} style={{ width: boxW + 56, maxWidth: '100%', margin: '0 auto' }}>
        {/* width labels above the columns */}
        <div style={{ display: 'flex', marginLeft: 56 }}>
          {effParams.parts.map((w, i) => (
            <div
              key={i}
              data-width-label
              style={{
                width: widthUnits[i]! * unit,
                textAlign: 'center',
                font: "600 19px 'Lora', Georgia, serif",
                color: '#5c5245',
                paddingBottom: 4,
                opacity: state.partsIn ? 1 : 0,
                transition: 'opacity 0.35s ease',
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
              opacity: state.heightIn ? 1 : 0,
              transition: 'opacity 0.35s ease',
            }}
          >
            {effParams.height}
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
            {effParams.parts.map((_, i) => {
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
                    borderRight: i < cols - 1 && state.partsIn ? '2px dashed #8b6a4d' : 'none',
                    backgroundColor: highlighted ? '#f7e6d4' : 'transparent',
                    backgroundImage: grid(effParams.parts[i]!),
                    font: "600 clamp(16px, 4vw, 24px) 'Lora', Georgia, serif",
                    color: highlighted ? '#8a4d1d' : '#2e2822',
                    transition: 'background 0.3s ease, color 0.3s ease',
                    animation: 'cairn-rise 0.35s ease both',
                    animationDelay: `${i * 0.08}s`,
                    padding: 6,
                  }}
                >
                  {h !== null && dim(effParams.parts[i]!) !== null && state.fillRows !== null && (
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
                  {interactive && shownProducts?.[i] === '?' ? (
                    <input
                      aria-label="Missing piece of area"
                      aria-disabled={mode === 'review'}
                      disabled={mode === 'review'}
                      placeholder="?"
                      value={state.raw}
                      onChange={(e) => {
                        store.record('input', { raw: e.target.value })
                        store.setState({ raw: e.target.value })
                      }}
                      style={{
                        width: 64,
                        font: "600 18px 'Lora', Georgia, serif",
                        textAlign: 'center',
                        padding: '2px 2px',
                        border: '2px dashed #b05f28',
                        borderRadius: 8,
                        background: '#fffdf9',
                        color: '#8a4d1d',
                      }}
                    />
                  ) : (
                    <span
                      data-product
                      style={
                        shownProducts?.[i]
                          ? { background: 'rgba(255,253,249,0.88)', padding: '2px 10px', borderRadius: 8 }
                          : undefined
                      }
                    >
                      {shownProducts?.[i] ?? ''}
                    </span>
                  )}
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
    extract: () => {
      if (!Array.isArray(config.products)) return null
      const raw = store.getState().raw
      const n = Number(raw.trim())
      return { raw, value: raw.trim() !== '' && Number.isFinite(n) ? n : null }
    },
    trace: () => store.trace(),
    applyPatch: (patch) => {
      store.record('patch', patch)
      const next: Partial<AreaState> = {}
      if (patch.products !== undefined) next.products = patch.products ?? null
      if (patch.highlight !== undefined) next.highlight = patch.highlight ?? []
      if (patch.fillRows !== undefined) next.fillRows = patch.fillRows
      if (patch.heightIn !== undefined) next.heightIn = patch.heightIn === true
      if (patch.partsIn !== undefined) next.partsIn = patch.partsIn === true
      store.setState(next)
    },
    a11y: { role: 'img', label },
  }
}

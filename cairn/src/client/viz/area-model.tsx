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
}

type AreaState = {
  products: string[] | null
  highlight: number[]
}

const label = (p: AreaModelParams): string =>
  `Area model: a rectangle ${p.height} tall split into widths ${p.parts.join(' and ')}`

export function createAreaModel(): WidgetInstance<AreaModelParams, null, AreaModelView> {
  const store = new WidgetStore<AreaState>({ products: null, highlight: [] })

  function View({ params, mode: _mode }: { params: AreaModelParams; mode: WidgetMode }) {
    const state = useSyncExternalStore(store.subscribe, store.getState, store.getState)
    const cols = params.parts.length
    return (
      <div role="img" aria-label={label(params)} style={{ maxWidth: 520, margin: '0 auto' }}>
        {/* width labels above the columns */}
        <div style={{ display: 'flex', marginLeft: 56 }}>
          {params.parts.map((w, i) => (
            <div
              key={i}
              data-width-label
              style={{
                flex: i === 0 ? 2 : 1,
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
          {/* the partitioned rectangle */}
          <div
            style={{
              flex: 1,
              display: 'flex',
              border: '2.5px solid #5c4a38',
              borderRadius: 8,
              overflow: 'hidden',
              minHeight: 110,
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
                    flex: i === 0 ? 2 : 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRight: i < cols - 1 ? '2px dashed #8b6a4d' : 'none',
                    background: highlighted ? '#f7e6d4' : 'transparent',
                    font: "600 clamp(16px, 4vw, 24px) 'Lora', Georgia, serif",
                    color: highlighted ? '#8a4d1d' : '#2e2822',
                    transition: 'background 0.3s ease, color 0.3s ease',
                    animation: 'cairn-rise 0.35s ease both',
                    animationDelay: `${i * 0.08}s`,
                    padding: 6,
                  }}
                >
                  <span data-product>{state.products?.[i] ?? ''}</span>
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
      store.setState(next)
    },
    a11y: { role: 'img', label },
  }
}

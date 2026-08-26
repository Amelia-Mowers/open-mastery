/** Illustrative Mathematics' tape diagram (IM 6–8 first ed., G7 U6 L2–3,
 * CC BY 4.0) as a viz widget: a bar of equal parts with a brace for the
 * total. Models ax = b (a parts, total b), x/a = b (a parts of b, total x),
 * and later a(x+c) = b. */
import { useSyncExternalStore } from 'react'
import type { WidgetInstance, WidgetMode } from '../widgets/contract'
import { WidgetStore } from '../widgets/store'

export interface TapeDiagramParams {
  parts: number
  partLabel: string
  total: string
}

export interface TapeDiagramView {
  partLabel?: string
  total?: string
  /** 1-based part indices to highlight */
  highlight?: number[]
}

type TapeState = {
  partLabel: string | null
  total: string | null
  highlight: number[]
}

const label = (p: TapeDiagramParams): string =>
  `Tape diagram: ${p.parts} equal parts of ${p.partLabel}, total ${p.total}`

export function createTapeDiagram(): WidgetInstance<TapeDiagramParams, null, TapeDiagramView> {
  const store = new WidgetStore<TapeState>({ partLabel: null, total: null, highlight: [] })

  function View({ params, mode: _mode }: { params: TapeDiagramParams; mode: WidgetMode }) {
    const state = useSyncExternalStore(store.subscribe, store.getState, store.getState)
    const n = Math.max(1, Math.round(params.parts))
    const partLabel = state.partLabel ?? params.partLabel
    const total = state.total ?? params.total
    return (
      <div role="img" aria-label={label(params)} style={{ maxWidth: 560, margin: '0 auto' }}>
        <div
          style={{
            display: 'flex',
            border: '2.5px solid #5c4a38',
            borderRadius: 10,
            overflow: 'hidden',
            background: '#fffdf9',
          }}
        >
          {Array.from({ length: n }, (_, i) => {
            const highlighted = state.highlight.includes(i + 1)
            return (
              <div
                key={i}
                data-part
                data-highlighted={highlighted || undefined}
                style={{
                  flex: 1,
                  minWidth: 0,
                  textAlign: 'center',
                  padding: '18px 4px',
                  borderRight: i < n - 1 ? '2px solid #5c4a38' : 'none',
                  background: highlighted ? '#f7e6d4' : 'transparent',
                  font: "600 clamp(15px, 3.4vw, 22px) 'Lora', Georgia, serif",
                  color: highlighted ? '#8a4d1d' : '#2e2822',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  transition: 'background 0.3s ease, color 0.3s ease',
                  animation: 'cairn-rise 0.3s ease both',
                  animationDelay: `${i * 0.05}s`,
                }}
              >
                {partLabel}
              </div>
            )
          })}
        </div>
        {/* brace + total */}
        <div aria-hidden style={{ padding: '0 2px' }}>
          <svg viewBox="0 0 560 16" style={{ width: '100%', height: 16, display: 'block' }}>
            <path
              d="M4 2 Q4 12 24 12 L268 12 Q280 12 280 16 Q280 12 292 12 L536 12 Q556 12 556 2"
              fill="none"
              stroke="#8b8070"
              strokeWidth="2.5"
            />
          </svg>
        </div>
        <div
          data-total
          style={{
            textAlign: 'center',
            font: "700 20px 'Lora', Georgia, serif",
            color: '#5c5245',
            marginTop: 2,
            transition: 'color 0.3s ease',
          }}
        >
          {total}
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
      const next: Partial<TapeState> = {}
      if (patch.partLabel !== undefined) next.partLabel = patch.partLabel ?? null
      if (patch.total !== undefined) next.total = patch.total ?? null
      if (patch.highlight !== undefined) next.highlight = patch.highlight ?? []
      store.setState(next)
    },
    a11y: { role: 'img', label },
  }
}

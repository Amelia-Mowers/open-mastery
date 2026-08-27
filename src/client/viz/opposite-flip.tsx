/** The "opposite" flip for -x = b — a full trinity widget (§4.4):
 *  - lesson mode: patch-driven animation (b flips across zero to -b)
 *  - problem mode: the SAME axis becomes the answer input — move the dot to
 *    where x lives (click a tick or use arrow keys), extract() returns it
 * Opposites sit the same distance from 0 on the other side — the metaphor is
 * identical whether it is teaching or asking. */
import { useSyncExternalStore } from 'react'
import type { WidgetInstance, WidgetMode } from '../widgets/contract'
import { WidgetStore } from '../widgets/store'

export interface OppositeFlipConfig {
  /** the known value b in -x = b (answer-input use; lessons pass it as a param) */
  value?: number
}

export interface OppositeFlipParams {
  value: number
}

export interface OppositeFlipView {
  /** draw the flip arc from b across 0 to -b */
  flip?: boolean
  /** land the answer: solid dot at -b */
  resolve?: boolean
}

type FlipState = { flip: boolean; resolve: boolean; selected: number | null }

const label = (p: OppositeFlipParams): string =>
  `Number line showing ${p.value} and its opposite across zero`

export interface OppositeFlipAnswer {
  value: number | null
}

export function createOppositeFlip(
  config: OppositeFlipConfig = {},
): WidgetInstance<OppositeFlipParams, OppositeFlipAnswer, OppositeFlipView> {
  const store = new WidgetStore<FlipState>({ flip: false, resolve: false, selected: null })

  function View({ params, mode }: { params: OppositeFlipParams; mode: WidgetMode }) {
    const state = useSyncExternalStore(store.subscribe, store.getState, store.getState)
    const b = params.value ?? config.value ?? 0
    const unit = Math.max(1, Math.abs(b))
    const m = unit * 2.4
    const x = (v: number): number => 280 + (v / m) * 240 // viewBox 560 wide
    const interactive = mode === 'problem' || mode === 'faded'
    const disabled = mode === 'review'
    const ticks = [-2, -1, 0, 1, 2].map((k) => k * unit)

    const select = (v: number): void => {
      store.record('select', { value: v })
      store.setState({ selected: v })
    }

    if (interactive || disabled) {
      // ---- answer input: move the dot to x ----
      const sel = state.selected
      return (
        <div
          role="slider"
          tabIndex={disabled ? -1 : 0}
          aria-label={`Where is the answer? Number line from ${-2 * unit} to ${2 * unit}`}
          aria-valuemin={-2 * unit}
          aria-valuemax={2 * unit}
          aria-valuenow={sel ?? undefined}
          aria-disabled={disabled}
          onKeyDown={(e) => {
            if (disabled) return
            const cur = sel ?? 0
            if (e.key === 'ArrowRight') {
              e.preventDefault()
              select(Math.min(2 * unit, cur + unit))
            } else if (e.key === 'ArrowLeft') {
              e.preventDefault()
              select(Math.max(-2 * unit, cur - unit))
            } else if (e.key === 'Home') {
              e.preventDefault()
              select(-2 * unit)
            } else if (e.key === 'End') {
              e.preventDefault()
              select(2 * unit)
            }
          }}
          style={{ maxWidth: 560, margin: '0 auto', minWidth: 300, flex: '1 1 300px', outlineColor: '#b05f28' }}
        >
          <svg viewBox="0 0 560 120" style={{ width: '100%', display: 'block' }} aria-hidden>
            <line x1="20" y1="60" x2="540" y2="60" stroke="#8b8070" strokeWidth="3" strokeLinecap="round" />
            <path d="M540 60 l-9 -5 v10 Z" fill="#8b8070" />
            <path d="M20 60 l9 -5 v10 Z" fill="#8b8070" />
            {/* the known value b, fixed */}
            <circle data-point-b cx={x(b)} cy="60" r="7" fill="#8b6a4d" />
            {ticks.map((t) => (
              <g key={t}>
                <line x1={x(t)} y1={t === 0 ? 51 : 54} x2={x(t)} y2={t === 0 ? 69 : 66} stroke="#5c4a38" strokeWidth={t === 0 ? 3 : 2} />
                <text x={x(t)} y="92" textAnchor="middle" style={{ font: "600 15px 'Lora', Georgia, serif", fill: '#5c4a38' }}>
                  {t}
                </text>
              </g>
            ))}
            {sel !== null && (
              <circle data-selected-dot cx={x(sel)} cy="60" r="10" fill="#b05f28" stroke="#fffdf9" strokeWidth="2.5" style={{ transition: 'cx 0.25s ease' }} />
            )}
          </svg>
          {/* clickable tick targets (one tab stop; ticks are pointer targets) */}
          <div style={{ position: 'relative', height: 26, margin: '0 auto' }} aria-hidden>
            {ticks.map((t) => (
              <button
                key={t}
                type="button"
                tabIndex={-1}
                data-tick={t}
                data-selected={sel === t || undefined}
                disabled={disabled}
                onClick={() => {
                  if (!disabled) select(t)
                }}
                style={{
                  position: 'absolute',
                  left: `${((x(t) - 0) / 560) * 100}%`,
                  transform: 'translateX(-50%)',
                  border: 'none',
                  cursor: disabled ? 'default' : 'pointer',
                  background: sel === t ? '#f3e4d4' : 'transparent',
                  color: sel === t ? '#8a4d1d' : '#8b8070',
                  font: "700 12px 'Nunito Sans', sans-serif",
                  padding: '4px 9px',
                  borderRadius: 9,
                }}
              >
                {sel === t ? '●' : '○'}
              </button>
            ))}
          </div>
        </div>
      )
    }

    // ---- lesson mode: patch-driven flip animation ----
    return (
      <div role="img" aria-label={label({ value: b })} style={{ maxWidth: 560, margin: '0 auto' }}>
        <svg viewBox="0 0 560 150" style={{ width: '100%', display: 'block' }}>
          <line x1="20" y1="105" x2="540" y2="105" stroke="#8b8070" strokeWidth="3" strokeLinecap="round" />
          <path d="M540 105 l-9 -5 v10 Z" fill="#8b8070" />
          <path d="M20 105 l9 -5 v10 Z" fill="#8b8070" />
          <line data-zero x1={x(0)} y1="96" x2={x(0)} y2="114" stroke="#5c4a38" strokeWidth="3" />
          <text x={x(0)} y="134" textAnchor="middle" style={{ font: "600 16px 'Lora', Georgia, serif", fill: '#5c4a38' }}>
            0
          </text>
          <circle data-point-b cx={x(b)} cy="105" r="9" fill={state.resolve ? '#e6ddd0' : '#b05f28'} style={{ transition: 'fill 0.4s ease' }} />
          <text x={x(b)} y="134" textAnchor="middle" style={{ font: "700 17px 'Lora', Georgia, serif", fill: state.resolve ? '#8b8070' : '#8a4d1d' }}>
            {b}
          </text>
          {state.flip && (
            <g data-arc style={{ animation: 'cairn-pop 0.5s ease both' }}>
              <path
                d={`M ${x(b)} 92 Q ${x(0)} 8 ${x(-b)} 92`}
                fill="none"
                stroke="#b05f28"
                strokeWidth="3"
                strokeDasharray="7 6"
              />
              <path d={`M ${x(-b)} 92 l ${b > 0 ? 7 : -7} -9 l ${b > 0 ? 3 : -3} 11 Z`} fill="#b05f28" />
            </g>
          )}
          {state.flip && (
            <g data-point-neg style={{ animation: 'cairn-rise 0.4s ease both', animationDelay: '0.25s' }}>
              <circle cx={x(-b)} cy="105" r="9" fill={state.resolve ? '#4f7f5d' : '#f3e4d4'} stroke="#b05f28" strokeWidth={state.resolve ? 0 : 2.5} style={{ transition: 'fill 0.4s ease' }} />
              <text x={x(-b)} y="134" textAnchor="middle" style={{ font: "700 17px 'Lora', Georgia, serif", fill: state.resolve ? '#3f6a4d' : '#8a4d1d' }}>
                {-b}
              </text>
            </g>
          )}
          {state.flip && !state.resolve && (
            <line x1={x(0)} y1="30" x2={x(0)} y2="96" stroke="#d8cdbb" strokeWidth="2" strokeDasharray="4 5" />
          )}
        </svg>
      </div>
    )
  }

  return {
    render: (params, mode) => <View params={params} mode={mode} />,
    extract: () => ({ value: store.getState().selected }),
    trace: () => store.trace(),
    applyPatch: (patch) => {
      store.record('patch', patch)
      const next: Partial<FlipState> = {}
      if (patch.flip !== undefined) next.flip = patch.flip === true
      if (patch.resolve !== undefined) next.resolve = patch.resolve === true
      store.setState(next)
    },
    a11y: { role: 'img', label },
  }
}

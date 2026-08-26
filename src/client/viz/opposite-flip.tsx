/** The "opposite" flip for -x = b: a number line where b flips across zero
 * to land on -b. Opposites sit the same distance from 0 on the other side —
 * the animation IS the idea. */
import { useSyncExternalStore } from 'react'
import type { WidgetInstance, WidgetMode } from '../widgets/contract'
import { WidgetStore } from '../widgets/store'

export interface OppositeFlipParams {
  /** the known value b in -x = b */
  value: number
}

export interface OppositeFlipView {
  /** draw the flip arc from b across 0 to -b */
  flip?: boolean
  /** land the answer: solid dot at -b */
  resolve?: boolean
}

type FlipState = { flip: boolean; resolve: boolean }

const label = (p: OppositeFlipParams): string =>
  `Number line showing ${p.value} flipping across zero to ${-p.value}`

export function createOppositeFlip(): WidgetInstance<OppositeFlipParams, null, OppositeFlipView> {
  const store = new WidgetStore<FlipState>({ flip: false, resolve: false })

  function View({ params, mode: _mode }: { params: OppositeFlipParams; mode: WidgetMode }) {
    const state = useSyncExternalStore(store.subscribe, store.getState, store.getState)
    const b = params.value
    const m = Math.max(2, Math.ceil(Math.abs(b) * 1.4))
    const x = (v: number): number => 280 + (v / m) * 240 // viewBox 560 wide
    return (
      <div role="img" aria-label={label(params)} style={{ maxWidth: 560, margin: '0 auto' }}>
        <svg viewBox="0 0 560 150" style={{ width: '100%', display: 'block' }}>
          {/* axis */}
          <line x1="20" y1="105" x2="540" y2="105" stroke="#8b8070" strokeWidth="3" strokeLinecap="round" />
          <path d="M540 105 l-9 -5 v10 Z" fill="#8b8070" />
          <path d="M20 105 l9 -5 v10 Z" fill="#8b8070" />
          {/* zero */}
          <line data-zero x1={x(0)} y1="96" x2={x(0)} y2="114" stroke="#5c4a38" strokeWidth="3" />
          <text x={x(0)} y="134" textAnchor="middle" style={{ font: "600 16px 'Lora', Georgia, serif", fill: '#5c4a38' }}>
            0
          </text>
          {/* b: where the opposite of x sits */}
          <circle data-point-b cx={x(b)} cy="105" r="9" fill={state.resolve ? '#e6ddd0' : '#b05f28'} style={{ transition: 'fill 0.4s ease' }} />
          <text x={x(b)} y="134" textAnchor="middle" style={{ font: "700 17px 'Lora', Georgia, serif", fill: state.resolve ? '#8b8070' : '#8a4d1d' }}>
            {b}
          </text>
          {/* flip arc over zero */}
          {state.flip && (
            <g data-arc style={{ animation: 'cairn-pop 0.5s ease both' }}>
              <path
                d={`M ${x(b)} 92 Q ${x(0)} 8 ${x(-b)} 92`}
                fill="none"
                stroke="#b05f28"
                strokeWidth="3"
                strokeDasharray="7 6"
              />
              <path
                d={`M ${x(-b)} 92 l ${b > 0 ? 7 : -7} -9 l ${b > 0 ? 3 : -3} 11 Z`}
                fill="#b05f28"
              />
            </g>
          )}
          {/* -b: where x lands */}
          {state.flip && (
            <g data-point-neg style={{ animation: 'cairn-rise 0.4s ease both', animationDelay: '0.25s' }}>
              <circle cx={x(-b)} cy="105" r="9" fill={state.resolve ? '#4f7f5d' : '#f3e4d4'} stroke="#b05f28" strokeWidth={state.resolve ? 0 : 2.5} style={{ transition: 'fill 0.4s ease' }} />
              <text x={x(-b)} y="134" textAnchor="middle" style={{ font: "700 17px 'Lora', Georgia, serif", fill: state.resolve ? '#3f6a4d' : '#8a4d1d' }}>
                {-b}
              </text>
            </g>
          )}
          {/* mirror hint at zero */}
          {state.flip && !state.resolve && (
            <line x1={x(0)} y1="30" x2={x(0)} y2="96" stroke="#d8cdbb" strokeWidth="2" strokeDasharray="4 5" />
          )}
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
      const next: Partial<FlipState> = {}
      if (patch.flip !== undefined) next.flip = patch.flip === true
      if (patch.resolve !== undefined) next.resolve = patch.resolve === true
      store.setState(next)
    },
    a11y: { role: 'img', label },
  }
}

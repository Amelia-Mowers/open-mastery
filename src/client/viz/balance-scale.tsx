import { useSyncExternalStore } from 'react'
import type { WidgetInstance, WidgetMode } from '../widgets/contract'
import { WidgetStore } from '../widgets/store'

export interface BalanceScaleParams {
  left: string
  right: string
}

export interface BalanceScaleView {
  left?: string
  right?: string
  highlight?: 'left.coef' | 'left' | 'right' | null
  op?: { op: 'divide' | 'multiply'; by: string } | null
  caption?: string
  /** staged decomposition: bring each pan in as its symbol is explained */
  leftIn?: boolean
  rightIn?: boolean
}

type BalanceScaleState = {
  left: string | null // null → fall back to render params
  right: string | null
  highlight: BalanceScaleView['highlight'] | null
  op: BalanceScaleView['op'] | null
  caption: string
  leftIn: boolean
  rightIn: boolean
}

const label = (params: BalanceScaleParams): string =>
  `Balance scale showing ${params.left} = ${params.right}`

/** Geometry in viewBox units (560 × 240); tiles/badges are HTML overlaid at
 * matching percentages so text stays crisp and auto-sized. */
const PAN_X = ['18%', '82%'] as const

export function createBalanceScale(): WidgetInstance<BalanceScaleParams, null, BalanceScaleView> {
  const store = new WidgetStore<BalanceScaleState>({
    left: null,
    right: null,
    highlight: null,
    op: null,
    caption: '',
    leftIn: true,
    rightIn: true,
  })

  function Tile({ text, highlighted, side }: { text: string; highlighted: boolean; side: 'left' | 'right' }) {
    return (
      <div
        data-pan={side}
        data-highlighted={highlighted || undefined}
        style={{
          position: 'absolute',
          left: PAN_X[side === 'left' ? 0 : 1],
          top: '49%',
          transform: 'translate(-50%, -100%)',
          maxWidth: '32%',
          textAlign: 'center',
          background: '#fffdf9',
          border: `2.5px solid ${highlighted ? '#b05f28' : '#d8cdbb'}`,
          borderRadius: 10,
          padding: '6px 14px',
          font: "600 clamp(18px, 4.6vw, 26px) 'Lora', Georgia, serif",
          whiteSpace: 'nowrap',
          boxShadow: '0 2px 0 rgba(92, 74, 56, 0.12)',
          transition: 'border-color 0.25s',
        }}
      >
        {text}
      </div>
    )
  }

  function OpBadge({ side, op }: { side: 'left' | 'right'; op: NonNullable<BalanceScaleView['op']> }) {
    return (
      <span
        data-op-badge={side}
        style={{
          position: 'absolute',
          left: PAN_X[side === 'left' ? 0 : 1],
          top: '62%',
          transform: 'translateX(-50%)',
          font: "700 16px 'Lora', Georgia, serif",
          color: '#b05f28',
          background: '#f7e6d4',
          border: '1.5px solid #e8c9a8',
          padding: '3px 13px',
          borderRadius: 15,
          whiteSpace: 'nowrap',
          animation: 'cairn-pop 0.3s ease',
        }}
      >
        {op.op === 'divide' ? '÷' : '×'} {op.by}
      </span>
    )
  }

  function View({ params, mode: _mode }: { params: BalanceScaleParams; mode: WidgetMode }) {
    const state = useSyncExternalStore(store.subscribe, store.getState, store.getState)
    const left = state.left ?? params.left
    const right = state.right ?? params.right
    const hl = state.highlight
    return (
      <div role="img" aria-label={label(params)} style={{ maxWidth: 560, margin: '0 auto' }}>
        <div style={{ position: 'relative', aspectRatio: '560 / 240' }}>
          <svg
            viewBox="0 0 560 240"
            aria-hidden
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
          >
            {/* ground */}
            <rect x="200" y="216" width="160" height="9" rx="4.5" fill="#b6a88f" />
            {/* base + post */}
            <path d="M280 150 L236 216 L324 216 Z" fill="#5c4a38" />
            <rect x="274" y="52" width="12" height="104" rx="4" fill="#5c4a38" />
            {/* beam */}
            <rect x="76" y="44" width="408" height="10" rx="5" fill="#8b6a4d" />
            <circle cx="280" cy="49" r="9" fill="#5c4a38" />
            <circle cx="280" cy="49" r="3.5" fill="#f2ede4" />
            {/* strings */}
            <line x1="100" y1="54" x2="86" y2="118" stroke="#8b8070" strokeWidth="2.5" />
            <line x1="100" y1="54" x2="114" y2="118" stroke="#8b8070" strokeWidth="2.5" />
            <line x1="459" y1="54" x2="445" y2="118" stroke="#8b8070" strokeWidth="2.5" />
            <line x1="459" y1="54" x2="473" y2="118" stroke="#8b8070" strokeWidth="2.5" />
            {/* hanging pans */}
            <path d="M64 118 L136 118 Q132 138 100 138 Q68 138 64 118 Z" fill="#8b6a4d" />
            <path d="M423 118 L495 118 Q491 138 459 138 Q427 138 423 118 Z" fill="#8b6a4d" />
            {/* beam end caps */}
            <circle cx="100" cy="49" r="5" fill="#5c4a38" />
            <circle cx="459" cy="49" r="5" fill="#5c4a38" />
          </svg>
          {state.leftIn && <Tile text={left} highlighted={hl === 'left' || hl === 'left.coef'} side="left" />}
          {state.rightIn && <Tile text={right} highlighted={hl === 'right'} side="right" />}
          {state.op && state.leftIn && <OpBadge side="left" op={state.op} />}
          {state.op && state.rightIn && <OpBadge side="right" op={state.op} />}
        </div>
        <div
          data-caption
          style={{
            textAlign: 'center',
            font: "600 17px 'Lora', Georgia, serif",
            color: '#5c5245',
            marginTop: 6,
            minHeight: 24,
          }}
        >
          {state.caption}
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
      const next: Partial<BalanceScaleState> = {}
      if (patch.left !== undefined) next.left = patch.left ?? null
      if (patch.right !== undefined) next.right = patch.right ?? null
      if (patch.highlight !== undefined) next.highlight = patch.highlight
      if (patch.op !== undefined) next.op = patch.op
      if (patch.caption !== undefined) next.caption = patch.caption ?? ''
      if (patch.leftIn !== undefined) next.leftIn = patch.leftIn === true
      if (patch.rightIn !== undefined) next.rightIn = patch.rightIn === true
      store.setState(next)
    },
    a11y: { role: 'img', label },
  }
}

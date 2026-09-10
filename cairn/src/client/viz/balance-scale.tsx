import { useSyncExternalStore } from 'react'
import type { WidgetInstance, WidgetMode } from '../widgets/contract'
import { WidgetStore } from '../widgets/store'
import { OpEntry, moveRaw, type OpMove } from '../widgets/op-entry'

export interface BalanceScaleParams {
  left: string
  right: string
}

export interface BalanceScaleConfig {
  /** problem mode: the equation on the pans */
  left?: string
  right?: string
  /** problem mode: constructed op entry — the student enters the symbol
   * and operand of the move, mirrored live under BOTH pans */
  entry?: boolean
}

export interface BalanceScaleView {
  left?: string
  right?: string
  highlight?: 'left.coef' | 'left' | 'right' | null
  op?: { op: 'divide' | 'multiply' | 'add' | 'subtract'; by: string } | null
  caption?: string
  /** staged decomposition: bring each pan in as its symbol is explained */
  leftIn?: boolean
  rightIn?: boolean
  /** separate weights on a pan (combining-like-terms lessons): each string
   * is one chip; a chip starting with '−' renders as a takeaway. Set back
   * to null as the confirm merges them into the pan's single tile. */
  leftItems?: string[] | null
  rightItems?: string[] | null
}

type BalanceScaleState = {
  left: string | null // null → fall back to render params
  right: string | null
  highlight: BalanceScaleView['highlight'] | null
  op: BalanceScaleView['op'] | null
  caption: string
  leftIn: boolean
  rightIn: boolean
  leftItems: string[] | null
  rightItems: string[] | null
  move: OpMove
}

const label = (params: BalanceScaleParams): string =>
  `Balance scale showing ${params.left} = ${params.right}`

/** Geometry in viewBox units (560 × 240); tiles/badges are HTML overlaid at
 * matching percentages so text stays crisp and auto-sized. */
const PAN_X = ['18%', '82%'] as const
/** vertical drop of the loaded side while the scale is out of balance:
 * arm 179px at a 7° tilt */
const TILT_DY = Math.sin((7 * Math.PI) / 180) * 179

export function createBalanceScale(
  config: BalanceScaleConfig = {},
): WidgetInstance<BalanceScaleParams, { raw: string } | null, BalanceScaleView> {
  const store = new WidgetStore<BalanceScaleState>({
    left: null,
    right: null,
    highlight: null,
    op: null,
    caption: '',
    leftIn: true,
    rightIn: true,
    leftItems: null,
    rightItems: null,
    move: { op: null, by: '' },
  })

  function Tile({ text, highlighted, side, dy }: { text: string; highlighted: boolean; side: 'left' | 'right'; dy: number }) {
    return (
      <div
        data-pan={side}
        data-highlighted={highlighted || undefined}
        style={{
          position: 'absolute',
          left: PAN_X[side === 'left' ? 0 : 1],
          top: `calc(49% + ${(dy / 240) * 100}%)`,
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
          transition: 'border-color 0.25s, top 0.6s ease',
          animation: 'cairn-pop 0.3s ease',
        }}
      >
        {text}
      </div>
    )
  }

  /** separate weights sitting side by side on one pan — the state a
   * combining step starts from, merged away by its confirm */
  function ChipRow({ items, highlighted, side, dy }: { items: string[]; highlighted: boolean; side: 'left' | 'right'; dy: number }) {
    return (
      <div
        data-pan-chips={side}
        style={{
          position: 'absolute',
          left: PAN_X[side === 'left' ? 0 : 1],
          top: `calc(49% + ${(dy / 240) * 100}%)`,
          transform: 'translate(-50%, -100%)',
          maxWidth: '30%',
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'center',
          alignItems: 'flex-end',
          gap: 4,
          transition: 'top 0.6s ease',
        }}
      >
        {items.map((text, i) => {
          const takeaway = text.trimStart().startsWith('−') || text.trimStart().startsWith('-')
          return (
            <span
              key={i}
              data-chip={text}
              style={{
                background: takeaway ? 'transparent' : '#fffdf9',
                border: `2px ${takeaway ? 'dashed' : 'solid'} ${highlighted ? '#b05f28' : '#d8cdbb'}`,
                color: takeaway ? '#8b6a4d' : undefined,
                borderRadius: 8,
                padding: '4px 8px',
                font: "600 clamp(13px, 3vw, 17px) 'Lora', Georgia, serif",
                whiteSpace: 'nowrap',
                boxShadow: takeaway ? undefined : '0 2px 0 rgba(92, 74, 56, 0.12)',
                animation: 'cairn-pop 0.3s ease',
              }}
            >
              {text}
            </span>
          )
        })}
      </div>
    )
  }

  function OpBadge({ side, op, dy }: { side: 'left' | 'right'; op: NonNullable<BalanceScaleView['op']>; dy: number }) {
    return (
      <span
        data-op-badge={side}
        style={{
          position: 'absolute',
          left: PAN_X[side === 'left' ? 0 : 1],
          top: `calc(62% + ${(dy / 240) * 100}%)`,
          transform: 'translateX(-50%)',
          font: "700 16px 'Lora', Georgia, serif",
          color: '#b05f28',
          background: '#f7e6d4',
          border: '1.5px solid #e8c9a8',
          padding: '3px 13px',
          borderRadius: 15,
          whiteSpace: 'nowrap',
          animation: 'cairn-pop 0.3s ease',
          transition: 'top 0.6s ease',
        }}
      >
        {op.op === 'divide' ? '÷' : op.op === 'multiply' ? '×' : op.op === 'add' ? '+' : '−'} {op.by}
      </span>
    )
  }

  function View({ params, mode }: { params: BalanceScaleParams; mode: WidgetMode }) {
    const state = useSyncExternalStore(store.subscribe, store.getState, store.getState)
    const interactive = mode !== 'lesson' && config.entry === true
    // the entered move is reflected on BOTH pans through the same badge the
    // lesson animation uses
    const entered: BalanceScaleView['op'] | null =
      interactive && state.move.op !== null && state.move.by.trim() !== ''
        ? { op: state.move.op, by: state.move.by.trim() }
        : null
    const shownOp = interactive ? entered : state.op
    const left = state.left ?? params.left ?? config.left ?? ''
    const right = state.right ?? params.right ?? config.right ?? ''
    const hl = state.highlight
    // a pan is loaded once its tile or chips are in; one loaded side tips
    // the beam until the other lands — the level-out IS "= says they
    // weigh the same"
    const leftLoaded = state.leftIn || (state.leftItems?.length ?? 0) > 0
    const rightLoaded = state.rightIn || (state.rightItems?.length ?? 0) > 0
    const tilt: 'left' | 'right' | null =
      leftLoaded && !rightLoaded ? 'left' : rightLoaded && !leftLoaded ? 'right' : null
    const beamAngle = tilt === 'left' ? -7 : tilt === 'right' ? 7 : 0
    const dyFor = (side: 'left' | 'right'): number =>
      tilt === null ? 0 : tilt === side ? TILT_DY : -TILT_DY
    const sway = { transition: 'transform 0.6s ease' } as const
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
            {/* beam (tilts about the pivot while one pan waits) */}
            <g data-beam style={{ ...sway, transform: `rotate(${beamAngle}deg)`, transformOrigin: '280px 49px' }}>
              <rect x="76" y="44" width="408" height="10" rx="5" fill="#8b6a4d" />
              <circle cx="100" cy="49" r="5" fill="#5c4a38" />
              <circle cx="459" cy="49" r="5" fill="#5c4a38" />
            </g>
            <circle cx="280" cy="49" r="9" fill="#5c4a38" />
            <circle cx="280" cy="49" r="3.5" fill="#f2ede4" />
            {/* strings + hanging pans ride their beam end */}
            <g data-pan-group="left" style={{ ...sway, transform: `translateY(${dyFor('left')}px)` }}>
              <line x1="100" y1="54" x2="86" y2="118" stroke="#8b8070" strokeWidth="2.5" />
              <line x1="100" y1="54" x2="114" y2="118" stroke="#8b8070" strokeWidth="2.5" />
              <path d="M64 118 L136 118 Q132 138 100 138 Q68 138 64 118 Z" fill="#8b6a4d" />
            </g>
            <g data-pan-group="right" style={{ ...sway, transform: `translateY(${dyFor('right')}px)` }}>
              <line x1="459" y1="54" x2="445" y2="118" stroke="#8b8070" strokeWidth="2.5" />
              <line x1="459" y1="54" x2="473" y2="118" stroke="#8b8070" strokeWidth="2.5" />
              <path d="M423 118 L495 118 Q491 138 459 138 Q427 138 423 118 Z" fill="#8b6a4d" />
            </g>
          </svg>
          {state.leftItems && state.leftItems.length > 0 ? (
            <ChipRow items={state.leftItems} highlighted={hl === 'left' || hl === 'left.coef'} side="left" dy={dyFor('left')} />
          ) : (
            state.leftIn && <Tile text={left} highlighted={hl === 'left' || hl === 'left.coef'} side="left" dy={dyFor('left')} />
          )}
          {state.rightItems && state.rightItems.length > 0 ? (
            <ChipRow items={state.rightItems} highlighted={hl === 'right'} side="right" dy={dyFor('right')} />
          ) : (
            state.rightIn && <Tile text={right} highlighted={hl === 'right'} side="right" dy={dyFor('right')} />
          )}
          {shownOp && leftLoaded && <OpBadge side="left" op={shownOp} dy={dyFor('left')} />}
          {shownOp && rightLoaded && <OpBadge side="right" op={shownOp} dy={dyFor('right')} />}
        </div>
        {interactive && (
          <OpEntry
            move={state.move}
            disabled={mode === 'review'}
            onChange={(move) => {
              store.record('move', { op: move.op, by: move.by })
              store.setState({ move })
            }}
            ariaLabel="Operation to apply to both sides"
          />
        )}
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
    extract: () => {
      if (config.entry !== true) return null
      return { raw: moveRaw(store.getState().move) ?? '' }
    },
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
      if (patch.leftItems !== undefined) next.leftItems = patch.leftItems ?? null
      if (patch.rightItems !== undefined) next.rightItems = patch.rightItems ?? null
      store.setState(next)
    },
    a11y: { role: 'img', label },
  }
}

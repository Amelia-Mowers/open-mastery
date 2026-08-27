/** Illustrative Mathematics' balanced hanger (IM 6–8 first ed., G6 U6 L3
 * "Staying in Balance", CC BY 4.0) as a viz widget. The coefficient is
 * VISIBLE as object count: ax = b is a copies of the x-shape hanging on one
 * side, a weight of b on the other. Split shares the weight into a equal
 * pieces; reveal pairs each shape with its share. */
import { useSyncExternalStore } from 'react'
import type { WidgetInstance, WidgetMode } from '../widgets/contract'
import { WidgetStore } from '../widgets/store'
import { OpChoiceRow, type OpOption } from '../widgets/op-choice'

export interface HangerDiagramParams {
  /** copies of the variable shape (the coefficient, as a count) */
  copies: number
  /** label inside each shape (the variable) */
  shapeLabel: string
  /** the known weight on the other side */
  weight: string
}

export interface HangerDiagramView {
  /** share the weight into `copies` equal pieces */
  split?: boolean
  /** label for one piece (templated by the timeline, e.g. "{b/a}") */
  share?: string
  /** pair each shape with its share */
  reveal?: boolean
  /** staged decomposition: bring each side in as its symbol is explained */
  shapesIn?: boolean
  weightIn?: boolean
}

type HangerState = {
  split: boolean
  share: string | null
  reveal: boolean
  shapesIn: boolean
  weightIn: boolean
  selectedOp: string | null
}

const label = (p: HangerDiagramParams): string =>
  `Balanced hanger: ${p.copies} copies of ${p.shapeLabel} balancing ${p.weight}`

export interface HangerDiagramConfig {
  copies?: number
  shapeLabel?: string
  weight?: string
  /** problem mode: which move keeps the hanger level? */
  ops?: OpOption[]
}

export function createHangerDiagram(
  config: HangerDiagramConfig = {},
): WidgetInstance<HangerDiagramParams, { raw: string } | null, HangerDiagramView> {
  const store = new WidgetStore<HangerState>({ split: false, share: null, reveal: false, shapesIn: true, weightIn: true, selectedOp: null })

  function Shape({ text, share, i, size }: { text: string; share: string | null; i: number; size: number }) {
    return (
      <div
        data-shape
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 3,
          animation: 'cairn-rise 0.3s ease both',
          animationDelay: `${i * 0.06}s`,
        }}
      >
        <span aria-hidden style={{ width: 2, height: 14, background: '#8b8070', display: 'block' }} />
        <span
          style={{
            width: size,
            height: size,
            borderRadius: '50%',
            border: '2.5px solid #b05f28',
            background: '#f3e4d4',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            font: `600 ${Math.round(size * 0.45)}px 'Lora', Georgia, serif`,
            color: '#8a4d1d',
          }}
        >
          {text}
        </span>
        {share !== null && (
          <span
            data-share
            style={{
              font: "700 12.5px 'Lora', Georgia, serif",
              color: '#3f6a4d',
              background: '#e9efe6',
              padding: '1px 7px',
              borderRadius: 9,
              animation: 'cairn-pop 0.3s ease both',
              animationDelay: `${0.1 + i * 0.06}s`,
            }}
          >
            = {share}
          </span>
        )}
      </div>
    )
  }

  function View({ params, mode }: { params: HangerDiagramParams; mode: WidgetMode }) {
    const state = useSyncExternalStore(store.subscribe, store.getState, store.getState)
    const p = {
      copies: params.copies ?? config.copies ?? 1,
      shapeLabel: params.shapeLabel ?? config.shapeLabel ?? '?',
      weight: params.weight ?? config.weight ?? '',
    }
    const interactive = mode !== 'lesson' && (config.ops?.length ?? 0) > 0
    const n = Math.max(1, Math.round(p.copies))
    // everything must hang UNDER the bar: shapes shrink as the count grows
    const size = n > 8 ? 26 : n > 5 ? 32 : 40
    return (
      <div role="img" aria-label={label(p)} style={{ maxWidth: 560, margin: '0 auto' }}>
        {/* hook + crossbar spanning the full hanging area */}
        <svg viewBox="0 0 560 34" aria-hidden style={{ width: '100%', display: 'block' }}>
          <line x1="280" y1="0" x2="280" y2="14" stroke="#5c4a38" strokeWidth="3.5" />
          <circle cx="280" cy="16" r="5" fill="#5c4a38" />
          <line x1="14" y1="30" x2="546" y2="30" stroke="#8b6a4d" strokeWidth="6" strokeLinecap="round" />
          <line x1="280" y1="18" x2="280" y2="30" stroke="#5c4a38" strokeWidth="3.5" />
        </svg>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 2.5%' }}>
          {/* left: n copies of the shape, centered under the left half */}
          <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start', flexWrap: 'wrap', width: '47%', justifyContent: 'center' }}>
            {state.shapesIn &&
              Array.from({ length: n }, (_, i) => (
                <Shape key={i} i={i} size={size} text={p.shapeLabel} share={state.reveal ? state.share : null} />
              ))}
          </div>
          {/* right: the weight, whole or split into n equal pieces */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, width: '47%' }}>
            <span aria-hidden style={{ width: 2, height: 14, background: '#8b8070', display: 'block' }} />
            {!state.weightIn ? null : state.split ? (
              <div data-weight-split style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'center' }}>
                {Array.from({ length: n }, (_, i) => (
                  <span
                    key={i}
                    data-piece
                    style={{
                      minWidth: n > 8 ? 24 : 34,
                      textAlign: 'center',
                      padding: '8px 6px',
                      background: '#e7d9be',
                      border: '2px solid #8b6a4d',
                      borderRadius: 7,
                      font: "600 15px 'Lora', Georgia, serif",
                      animation: 'cairn-pop 0.3s ease both',
                      animationDelay: `${i * 0.05}s`,
                    }}
                  >
                    {state.share ?? ''}
                  </span>
                ))}
              </div>
            ) : (
              <span
                data-weight
                style={{
                  minWidth: 64,
                  textAlign: 'center',
                  padding: '12px 18px',
                  background: '#e7d9be',
                  border: '2.5px solid #8b6a4d',
                  borderRadius: 9,
                  font: "600 22px 'Lora', Georgia, serif",
                  animation: 'cairn-rise 0.3s ease both',
                }}
              >
                {p.weight}
              </span>
            )}
          </div>
        </div>
        {interactive && (
          <OpChoiceRow
            options={config.ops!}
            selected={state.selectedOp}
            disabled={mode === 'review'}
            onSelect={(key) => {
              store.record('select', { key })
              store.setState({ selectedOp: key })
            }}
            ariaLabel="Which move keeps the hanger level?"
          />
        )}
      </div>
    )
  }

  return {
    render: (params, mode) => <View params={params} mode={mode} />,
    extract: () => {
      if (!config.ops?.length) return null
      const key = store.getState().selectedOp
      return key === null ? { raw: '' } : { raw: key }
    },
    trace: () => store.trace(),
    applyPatch: (patch) => {
      store.record('patch', patch)
      const next: Partial<HangerState> = {}
      if (patch.split !== undefined) next.split = patch.split === true
      if (patch.share !== undefined) next.share = patch.share ?? null
      if (patch.reveal !== undefined) next.reveal = patch.reveal === true
      if (patch.shapesIn !== undefined) next.shapesIn = patch.shapesIn === true
      if (patch.weightIn !== undefined) next.weightIn = patch.weightIn === true
      store.setState(next)
    },
    a11y: { role: 'img', label },
  }
}

/** Illustrative Mathematics' balanced hanger (IM 6–8 first ed., G6 U6 L3
 * "Staying in Balance", CC BY 4.0) as a viz widget. The coefficient is
 * VISIBLE as object count: ax = b is a copies of the x-shape hanging on one
 * side, a weight of b on the other. Split shares the weight into a equal
 * pieces; reveal pairs each shape with its share. */
import { useSyncExternalStore } from 'react'
import type { WidgetInstance, WidgetMode } from '../widgets/contract'
import { WidgetStore } from '../widgets/store'

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
}

type HangerState = {
  split: boolean
  share: string | null
  reveal: boolean
}

const label = (p: HangerDiagramParams): string =>
  `Balanced hanger: ${p.copies} copies of ${p.shapeLabel} balancing ${p.weight}`

export function createHangerDiagram(): WidgetInstance<HangerDiagramParams, null, HangerDiagramView> {
  const store = new WidgetStore<HangerState>({ split: false, share: null, reveal: false })

  function Shape({ text, share, i }: { text: string; share: string | null; i: number }) {
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
            width: 40,
            height: 40,
            borderRadius: '50%',
            border: '2.5px solid #b05f28',
            background: '#f3e4d4',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            font: "600 18px 'Lora', Georgia, serif",
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

  function View({ params, mode: _mode }: { params: HangerDiagramParams; mode: WidgetMode }) {
    const state = useSyncExternalStore(store.subscribe, store.getState, store.getState)
    const n = Math.max(1, Math.round(params.copies))
    return (
      <div role="img" aria-label={label(params)} style={{ maxWidth: 560, margin: '0 auto' }}>
        {/* hook + crossbar */}
        <svg viewBox="0 0 560 34" aria-hidden style={{ width: '100%', display: 'block' }}>
          <line x1="280" y1="0" x2="280" y2="14" stroke="#5c4a38" strokeWidth="3.5" />
          <circle cx="280" cy="16" r="5" fill="#5c4a38" />
          <line x1="70" y1="30" x2="490" y2="30" stroke="#8b6a4d" strokeWidth="6" strokeLinecap="round" />
          <line x1="280" y1="18" x2="280" y2="30" stroke="#5c4a38" strokeWidth="3.5" />
          <line x1="140" y1="30" x2="140" y2="34" stroke="#8b8070" strokeWidth="2.5" />
          <line x1="420" y1="30" x2="420" y2="34" stroke="#8b8070" strokeWidth="2.5" />
        </svg>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 6%' }}>
          {/* left: n copies of the shape */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap', maxWidth: '46%' }}>
            {Array.from({ length: n }, (_, i) => (
              <Shape key={i} i={i} text={params.shapeLabel} share={state.reveal ? state.share : null} />
            ))}
          </div>
          {/* right: the weight, whole or split into n equal pieces */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, maxWidth: '46%' }}>
            <span aria-hidden style={{ width: 2, height: 14, background: '#8b8070', display: 'block' }} />
            {state.split ? (
              <div data-weight-split style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'center' }}>
                {Array.from({ length: n }, (_, i) => (
                  <span
                    key={i}
                    data-piece
                    style={{
                      minWidth: 34,
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
                {params.weight}
              </span>
            )}
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
      const next: Partial<HangerState> = {}
      if (patch.split !== undefined) next.split = patch.split === true
      if (patch.share !== undefined) next.share = patch.share ?? null
      if (patch.reveal !== undefined) next.reveal = patch.reveal === true
      store.setState(next)
    },
    a11y: { role: 'img', label },
  }
}

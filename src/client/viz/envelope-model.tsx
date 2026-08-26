/** OpenStax's envelopes-and-counters model (Prealgebra §3.5) as a viz
 * widget: a divided workspace with envelopes on one side and counters on the
 * other. For ax = b: a envelopes balance b counters; partition shares the
 * counters into a equal groups; reveal opens the envelopes to show b/a each.
 * Negative totals use red counters, following the book's convention. */
import { useSyncExternalStore } from 'react'
import type { WidgetInstance, WidgetMode } from '../widgets/contract'
import { WidgetStore } from '../widgets/store'

export interface EnvelopeModelParams {
  envelopes: number
  counters: number
}

export interface EnvelopeModelView {
  partition?: boolean
  reveal?: boolean
}

type EnvelopeModelState = {
  partition: boolean
  reveal: boolean
}

const label = (p: EnvelopeModelParams): string =>
  `${p.envelopes} envelopes balancing ${p.counters} counters`

function Envelope({ share, revealed, i }: { share: number; revealed: boolean; i: number }) {
  return (
    <div
      data-envelope
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
        animation: `cairn-rise 0.35s ease both`,
        animationDelay: `${i * 0.06}s`,
      }}
    >
      <svg width="46" height="32" viewBox="0 0 46 32" aria-hidden>
        <rect x="1" y="1" width="44" height="30" rx="4" fill="#f3e4d4" stroke="#b05f28" strokeWidth="2" />
        <path d="M1 3 L23 18 L45 3" fill="none" stroke="#b05f28" strokeWidth="2" />
      </svg>
      {revealed && (
        <span
          data-share
          style={{
            font: "700 13px 'Lora', Georgia, serif",
            color: '#3f6a4d',
            background: '#e9efe6',
            padding: '2px 8px',
            borderRadius: 10,
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

export function createEnvelopeModel(): WidgetInstance<EnvelopeModelParams, null, EnvelopeModelView> {
  const store = new WidgetStore<EnvelopeModelState>({ partition: false, reveal: false })

  function View({ params, mode: _mode }: { params: EnvelopeModelParams; mode: WidgetMode }) {
    const state = useSyncExternalStore(store.subscribe, store.getState, store.getState)
    const n = Math.max(1, Math.round(params.envelopes))
    const total = Math.round(params.counters)
    const magnitude = Math.abs(total)
    const negative = total < 0
    const share = magnitude / n
    const counterColor = negative ? '#c0392b' : '#2a9d8f'
    const counterFill = negative ? '#f5dfda' : '#d9efe7'

    // partitioned: one column of counters per envelope; flat: rows of 10
    const groups: number[][] = []
    if (state.partition && Number.isInteger(share)) {
      for (let g = 0; g < n; g++) groups.push(Array.from({ length: share }, (_, i) => g * share + i))
    }

    return (
      <div role="img" aria-label={label(params)} style={{ maxWidth: 560, margin: '0 auto' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'stretch',
            border: '2.5px solid #5c4a38',
            borderRadius: 12,
            background: '#fffdf9',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              flex: 1,
              padding: '16px 12px',
              display: 'flex',
              flexWrap: 'wrap',
              gap: 10,
              alignItems: 'flex-start',
              justifyContent: 'center',
              alignContent: 'center',
              minHeight: 170,
            }}
          >
            {Array.from({ length: n }, (_, i) => (
              <Envelope key={i} i={i} share={share} revealed={state.reveal} />
            ))}
          </div>
          <div style={{ width: 2.5, background: '#5c4a38' }} aria-hidden />
          <div style={{ flex: 1.2, padding: '16px 12px', display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 170 }}>
            {state.partition && groups.length > 0 ? (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                {groups.map((g, gi) => (
                  <div
                    key={gi}
                    data-partition
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                      padding: 5,
                      border: '1.5px dashed #b6a88f',
                      borderRadius: 8,
                      animation: 'cairn-pop 0.3s ease both',
                      animationDelay: `${gi * 0.05}s`,
                    }}
                  >
                    {g.map((ci) => (
                      <Counter key={ci} i={ci} color={counterColor} fill={counterFill} />
                    ))}
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', justifyContent: 'center', maxWidth: 240 }}>
                {Array.from({ length: magnitude }, (_, i) => (
                  <Counter key={i} i={i} color={counterColor} fill={counterFill} />
                ))}
              </div>
            )}
          </div>
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            font: "700 12px 'Nunito Sans', sans-serif",
            color: '#7a6f61',
            padding: '6px 10px 0',
          }}
        >
          <span>
            {n} envelope{n === 1 ? '' : 's'}
          </span>
          <span>
            {total} counter{Math.abs(total) === 1 ? '' : 's'}
            {negative ? ' (negatives are red)' : ''}
          </span>
        </div>
      </div>
    )
  }

  function Counter({ i, color, fill }: { i: number; color: string; fill: string }) {
    return (
      <span
        data-counter
        style={{
          width: 15,
          height: 15,
          borderRadius: '50%',
          background: fill,
          border: `2px solid ${color}`,
          display: 'inline-block',
          animation: 'cairn-pop 0.25s ease both',
          animationDelay: `${Math.min(i * 0.02, 0.6)}s`,
        }}
      />
    )
  }

  return {
    render: (params, mode) => <View params={params} mode={mode} />,
    extract: () => null,
    trace: () => store.trace(),
    applyPatch: (patch) => {
      store.record('patch', patch)
      const next: Partial<EnvelopeModelState> = {}
      if (patch.partition !== undefined) next.partition = patch.partition === true
      if (patch.reveal !== undefined) next.reveal = patch.reveal === true
      store.setState(next)
    },
    a11y: { role: 'img', label },
  }
}

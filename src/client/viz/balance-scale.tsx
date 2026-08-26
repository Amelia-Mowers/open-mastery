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
  op?: { op: 'divide'; by: string } | null
  caption?: string
}

type BalanceScaleState = {
  left: string | null // null → fall back to render params
  right: string | null
  highlight: BalanceScaleView['highlight'] | null
  op: BalanceScaleView['op'] | null
  caption: string
}

const label = (params: BalanceScaleParams): string =>
  `Balance scale showing ${params.left} = ${params.right}`

export function createBalanceScale(): WidgetInstance<BalanceScaleParams, null, BalanceScaleView> {
  const store = new WidgetStore<BalanceScaleState>({
    left: null,
    right: null,
    highlight: null,
    op: null,
    caption: '',
  })

  function Pan({ text, highlighted, side }: { text: string; highlighted: boolean; side: 'left' | 'right' }) {
    return (
      <div
        data-pan={side}
        data-highlighted={highlighted || undefined}
        style={{
          minWidth: 120,
          textAlign: 'center',
          background: '#fffdf9',
          border: `2.5px solid ${highlighted ? '#b05f28' : '#d8cdbb'}`,
          borderRadius: 12,
          padding: '14px 10px',
          font: "600 26px 'Lora', serif",
        }}
      >
        {text}
      </div>
    )
  }

  function View({ params, mode: _mode }: { params: BalanceScaleParams; mode: WidgetMode }) {
    const state = useSyncExternalStore(store.subscribe, store.getState, store.getState)
    const left = state.left ?? params.left
    const right = state.right ?? params.right
    const hl = state.highlight
    return (
      <div role="img" aria-label={label(params)} style={{ maxWidth: 520 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 24 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <Pan text={left} highlighted={hl === 'left' || hl === 'left.coef'} side="left" />
            {state.op && (
              <span
                data-op-badge="left"
                style={{
                  font: "700 15px 'Lora', serif",
                  color: '#b05f28',
                  background: '#f3e4d4',
                  padding: '3px 12px',
                  borderRadius: 14,
                }}
              >
                ÷ {state.op.by}
              </span>
            )}
          </div>
          <div aria-hidden style={{ alignSelf: 'center', height: 7, flex: 1, background: '#8b8070', borderRadius: 4 }} />
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <Pan text={right} highlighted={hl === 'right'} side="right" />
            {state.op && (
              <span
                data-op-badge="right"
                style={{
                  font: "700 15px 'Lora', serif",
                  color: '#b05f28',
                  background: '#f3e4d4',
                  padding: '3px 12px',
                  borderRadius: 14,
                }}
              >
                ÷ {state.op.by}
              </span>
            )}
          </div>
        </div>
        <div
          data-caption
          style={{ textAlign: 'center', font: "600 16px 'Lora', serif", color: '#5c5245', marginTop: 16, minHeight: 22 }}
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
      store.setState(next)
    },
    a11y: { role: 'img', label },
  }
}

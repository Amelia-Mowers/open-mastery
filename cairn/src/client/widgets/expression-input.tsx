import { useSyncExternalStore } from 'react'
import type { WidgetFactory, WidgetInstance, WidgetMode } from './contract'
import { WidgetStore } from './store'

export interface ExpressionInputConfig {
  variable?: string
}

export interface ExpressionInputParams {
  prompt?: string
}

export interface ExpressionAnswer {
  raw: string
  normalized: string
}

type ExpressionState = { raw: string }

export function normalizeExpression(raw: string, variable?: string): string {
  let s = raw.toLowerCase().replace(/\s+/g, '')
  if (variable) {
    const prefix = `${variable.toLowerCase()}=`
    if (s.startsWith(prefix)) s = s.slice(prefix.length)
  }
  return s
}

const label = (params: ExpressionInputParams): string =>
  params.prompt ? `Expression answer: ${params.prompt}` : 'Expression answer'

export const createExpressionInput: WidgetFactory<
  ExpressionInputParams,
  ExpressionAnswer,
  Record<never, never>,
  ExpressionInputConfig
> = (config): WidgetInstance<ExpressionInputParams, ExpressionAnswer, Record<never, never>> => {
  const store = new WidgetStore<ExpressionState>({ raw: '' })

  function View({ params, mode }: { params: ExpressionInputParams; mode: WidgetMode }) {
    const state = useSyncExternalStore(store.subscribe, store.getState, store.getState)
    const disabled = mode === 'review'
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {params.prompt && <span style={{ color: '#5c5245', fontFamily: "'Lora', serif" }}>{params.prompt}</span>}
        <input
          aria-label={label(params)}
          aria-disabled={disabled}
          disabled={disabled}
          placeholder={config.variable ? `${config.variable} = ?` : undefined}
          value={state.raw}
          onChange={(e) => {
            store.record('input', { raw: e.target.value })
            store.setState({ raw: e.target.value })
          }}
          onKeyDown={(e) => store.record('key', { key: e.key })}
          style={{
            width: 150,
            font: "600 20px 'Lora', serif",
            textAlign: 'center',
            padding: 8,
            border: '2px solid #d8cdbb',
            borderRadius: 10,
            background: '#fffdf9',
          }}
        />
      </div>
    )
  }

  return {
    render: (params, mode) => <View params={params} mode={mode} />,
    extract: () => {
      const { raw } = store.getState()
      return { raw, normalized: normalizeExpression(raw, config.variable) }
    },
    trace: () => store.trace(),
    applyPatch: () => {
      store.record('patch')
    },
    a11y: { role: 'textbox', label },
  }
}

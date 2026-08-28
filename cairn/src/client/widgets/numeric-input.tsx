import { useSyncExternalStore } from 'react'
import type { WidgetFactory, WidgetInstance, WidgetMode } from './contract'
import { WidgetStore } from './store'

export interface NumericInputConfig {
  units?: string
  placeholder?: string
}

export interface NumericInputParams {
  prompt?: string
}

export interface NumericAnswer {
  raw: string
  value: number | null
}

type NumericState = { raw: string }

export function parseNumeric(raw: string): number | null {
  const s = raw.trim()
  if (s === '') return null
  const frac = s.match(/^(-?\d+(?:\.\d+)?)\s*\/\s*(-?\d+(?:\.\d+)?)$/)
  if (frac) {
    const num = Number(frac[1])
    const den = Number(frac[2])
    if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) return null
    return num / den
  }
  if (!/^-?\d+(?:\.\d+)?$/.test(s)) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

const label = (params: NumericInputParams): string =>
  params.prompt ? `Numeric answer: ${params.prompt}` : 'Numeric answer'

export const createNumericInput: WidgetFactory<NumericInputParams, NumericAnswer, Record<never, never>, NumericInputConfig> = (
  config,
): WidgetInstance<NumericInputParams, NumericAnswer, Record<never, never>> => {
  const store = new WidgetStore<NumericState>({ raw: '' })

  function View({ params, mode }: { params: NumericInputParams; mode: WidgetMode }) {
    const state = useSyncExternalStore(store.subscribe, store.getState, store.getState)
    const disabled = mode === 'review'
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: "'Lora', serif" }}>
        {params.prompt && <span style={{ color: '#5c5245' }}>{params.prompt}</span>}
        <input
          inputMode="decimal"
          aria-label={label(params)}
          aria-disabled={disabled}
          disabled={disabled}
          placeholder={config.placeholder}
          value={state.raw}
          onChange={(e) => {
            store.record('input', { raw: e.target.value })
            store.setState({ raw: e.target.value })
          }}
          onKeyDown={(e) => store.record('key', { key: e.key })}
          style={{
            width: 110,
            font: "600 20px 'Lora', serif",
            textAlign: 'center',
            padding: 8,
            border: '2px solid #d8cdbb',
            borderRadius: 10,
            background: '#fffdf9',
          }}
        />
        {config.units && <span style={{ color: '#7a6f61' }}>{config.units}</span>}
      </div>
    )
  }

  return {
    render: (params, mode) => <View params={params} mode={mode} />,
    extract: () => {
      const { raw } = store.getState()
      return { raw, value: parseNumeric(raw) }
    },
    trace: () => store.trace(),
    applyPatch: () => {
      store.record('patch')
    },
    a11y: { role: 'textbox', label },
  }
}

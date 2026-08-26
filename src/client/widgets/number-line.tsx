import { useSyncExternalStore } from 'react'
import type { WidgetFactory, WidgetInstance, WidgetMode } from './contract'
import { WidgetStore } from './store'

export interface NumberLineConfig {
  min: number
  max: number
  step: number
}

export interface NumberLineParams {
  prompt?: string
}

export interface NumberLineAnswer {
  value: number | null
}

export interface NumberLineView {
  highlight?: number[]
  marker?: number | null
}

type NumberLineState = {
  value: number | null
  highlight: number[]
  marker: number | null
}

const label = (params: NumberLineParams): string =>
  params.prompt ? `Number line: ${params.prompt}` : 'Number line'

function ticksOf(config: NumberLineConfig): number[] {
  const out: number[] = []
  // tolerate float steps without drift accumulation
  const n = Math.round((config.max - config.min) / config.step)
  for (let i = 0; i <= n; i++) out.push(config.min + i * config.step)
  return out
}

export const createNumberLine: WidgetFactory<NumberLineParams, NumberLineAnswer, NumberLineView, NumberLineConfig> = (
  config,
): WidgetInstance<NumberLineParams, NumberLineAnswer, NumberLineView> => {
  const store = new WidgetStore<NumberLineState>({ value: null, highlight: [], marker: null })
  const ticks = ticksOf(config)

  const clamp = (v: number) => Math.min(config.max, Math.max(config.min, v))

  const select = (v: number, via: string) => {
    const value = clamp(v)
    store.record(via, { value })
    store.setState({ value })
  }

  function View({ params, mode }: { params: NumberLineParams; mode: WidgetMode }) {
    const state = useSyncExternalStore(store.subscribe, store.getState, store.getState)
    const disabled = mode === 'review'
    const current = state.value ?? config.min
    return (
      <div style={{ fontFamily: "'Lora', serif" }}>
        {params.prompt && <div style={{ color: '#5c5245', marginBottom: 8 }}>{params.prompt}</div>}
        <div
          role="slider"
          tabIndex={disabled ? -1 : 0}
          aria-label={label(params)}
          aria-valuemin={config.min}
          aria-valuemax={config.max}
          aria-valuenow={state.value ?? undefined}
          aria-disabled={disabled}
          onKeyDown={(e) => {
            if (disabled) return
            if (e.key === 'ArrowRight') {
              e.preventDefault()
              select(current + config.step, 'key')
            } else if (e.key === 'ArrowLeft') {
              e.preventDefault()
              select(current - config.step, 'key')
            } else if (e.key === 'Home') {
              e.preventDefault()
              select(config.min, 'key')
            } else if (e.key === 'End') {
              e.preventDefault()
              select(config.max, 'key')
            }
          }}
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            gap: 0,
            borderBottom: '3px solid #8b8070',
            paddingBottom: 4,
            outlineColor: '#b05f28',
          }}
        >
          {ticks.map((t) => {
            const selected = state.value === t
            const highlighted = state.highlight.includes(t)
            const marked = state.marker === t
            return (
              <button
                key={t}
                type="button"
                tabIndex={-1}
                disabled={disabled}
                aria-disabled={disabled}
                data-tick={t}
                data-selected={selected || undefined}
                data-highlighted={highlighted || undefined}
                data-marked={marked || undefined}
                onClick={() => {
                  if (!disabled) select(t, 'click')
                }}
                style={{
                  flex: 1,
                  border: 'none',
                  cursor: disabled ? 'default' : 'pointer',
                  background: highlighted ? '#f3e4d4' : 'transparent',
                  color: selected ? '#b05f28' : '#5c5245',
                  fontWeight: selected || marked ? 700 : 600,
                  fontSize: 14,
                  fontFamily: "'Lora', serif",
                  padding: '6px 4px',
                  borderBottom: selected ? '4px solid #b05f28' : marked ? '4px solid #5c4a38' : '4px solid transparent',
                }}
              >
                {t}
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  return {
    render: (params, mode) => <View params={params} mode={mode} />,
    extract: () => ({ value: store.getState().value }),
    trace: () => store.trace(),
    applyPatch: (patch) => {
      store.record('patch', patch)
      const next: Partial<NumberLineState> = {}
      if (patch.highlight !== undefined) next.highlight = patch.highlight ?? []
      if (patch.marker !== undefined) next.marker = patch.marker ?? null
      store.setState(next)
    },
    a11y: { role: 'slider', label },
  }
}

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
  /** the MOVE: an arc from → to with its label above ("+ 4"), so a jump is
   * shown happening instead of a landing spot merely being highlighted */
  arcs?: Array<{ from: number; to: number; label?: string }> | null
  /** progressive labelling: only these ticks show their number (plus any
   * marked/arc endpoints). Without it a line that spans the answer PRINTS
   * the answer before the student has done anything. */
  labelled?: number[] | null
}

type NumberLineState = {
  value: number | null
  highlight: number[]
  marker: number | null
  arcs: Array<{ from: number; to: number; label?: string }>
  labelled: number[] | null
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
  const store = new WidgetStore<NumberLineState>({ value: null, highlight: [], marker: null, arcs: [], labelled: null })
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
      <div style={{ fontFamily: "'Lora', serif", minWidth: 300, flex: '1 1 300px', maxWidth: 560 }}>
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
            position: 'relative',
            marginTop: 34,
          }}
        >
          {state.arcs.length > 0 && (
            <svg
              aria-hidden
              viewBox="0 0 100 22"
              preserveAspectRatio="none"
              style={{ position: 'absolute', left: 0, right: 0, bottom: '100%', width: '100%', height: 30 }}
            >
              {state.arcs.map((a, i) => {
                const at = (v: number) =>
                  ticks.length < 2 ? 50 : (ticks.indexOf(v) / (ticks.length - 1)) * 100
                const x1 = at(a.from)
                const x2 = at(a.to)
                if (x1 < 0 || x2 < 0) return null
                return (
                  <path
                    key={i}
                    data-arc={`${a.from}-${a.to}`}
                    d={`M ${x1} 20 Q ${(x1 + x2) / 2} 0 ${x2} 20`}
                    fill="none"
                    stroke="#b05f28"
                    strokeWidth="0.7"
                    vectorEffect="non-scaling-stroke"
                    style={{ animation: 'cairn-rise 0.4s ease both' }}
                  />
                )
              })}
            </svg>
          )}
          {state.arcs.map((a, i) =>
            a.label === undefined ? null : (
              <span
                key={`l${i}`}
                data-arc-label
                style={{
                  position: 'absolute',
                  bottom: '100%',
                  left: `${
                    ticks.length < 2
                      ? 50
                      : ((ticks.indexOf(a.from) + ticks.indexOf(a.to)) / 2 / (ticks.length - 1)) * 100
                  }%`,
                  transform: 'translate(-50%, -14px)',
                  font: "700 14px 'Lora', Georgia, serif",
                  color: '#b05f28',
                  whiteSpace: 'nowrap',
                  animation: 'cairn-pop 0.35s ease both',
                }}
              >
                {a.label}
              </span>
            ),
          )}
          {ticks.map((t) => {
            const selected = state.value === t
            const highlighted = state.highlight.includes(t)
            const marked = state.marker === t
            // a tick shows its number once it has been reached; before the
            // walk starts, an unlabelled line cannot give the answer away
            const shows = (v: number): boolean =>
              state.labelled === null ||
              state.labelled.includes(v) ||
              state.marker === v ||
              state.value === v ||
              state.arcs.some((a) => a.from === v || a.to === v)
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
                  transition: 'background 0.25s ease, border-color 0.25s ease, color 0.25s ease',
                }}
              >
                {shows(t) ? t : ''}
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
      if (patch.arcs !== undefined) next.arcs = patch.arcs ?? []
      if (patch.labelled !== undefined) next.labelled = patch.labelled ?? null
      store.setState(next)
    },
    a11y: { role: 'slider', label },
  }
}

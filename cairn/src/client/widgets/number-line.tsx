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
            alignItems: 'flex-start',
            gap: 0,
            borderTop: '2.5px solid #8b8070',
            paddingTop: 0,
            outlineColor: '#b05f28',
            position: 'relative',
            marginTop: 70,
          }}
        >
          {/* Jumps are drawn per-arc in their own box. A single stretched
              SVG (preserveAspectRatio="none") squashes every triangle
              horizontally and puts nothing where the geometry says, which is
              why the head looked like a wedge. The curve keeps the stretch
              (it only needs to span the gap); the head is an HTML triangle
              that cannot be distorted; the label sits above the box. */}
          {state.arcs.map((a, i) => {
            // ticks are centred inside equal flex cells, so tick i sits at
            // (i + 0.5)/n of the width — not i/(n-1)
            const at = (v: number) => {
              const k = ticks.indexOf(v)
              return k < 0 ? -1 : (k + 0.5) / ticks.length
            }
            const p1 = at(a.from)
            const p2 = at(a.to)
            if (p1 < 0 || p2 < 0) return null
            const left = Math.min(p1, p2)
            const width = Math.abs(p2 - p1)
            const forward = p2 >= p1
            return (
              <div
                key={i}
                data-arc={`${a.from}-${a.to}`}
                style={{
                  position: 'absolute',
                  left: `${left * 100}%`,
                  width: `${width * 100}%`,
                  bottom: 'calc(100% - 4px)',
                  height: 44,
                  animation: 'cairn-pop 0.45s ease both',
                }}
              >
                {a.label !== undefined && (
                  <span
                    data-arc-label
                    style={{
                      position: 'absolute',
                      left: '50%',
                      bottom: '100%',
                      transform: 'translate(-50%, 6px)',
                      font: "700 16px 'Lora', Georgia, serif",
                      color: '#b05f28',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {a.label}
                  </span>
                )}
                <svg
                  aria-hidden
                  viewBox="0 0 100 44"
                  preserveAspectRatio="none"
                  style={{ width: '100%', height: '100%', display: 'block', overflow: 'visible' }}
                >
                  <path
                    d={`M ${forward ? 0 : 100} 42 Q 50 -10 ${forward ? 100 : 0} 42`}
                    fill="none"
                    stroke="#b05f28"
                    strokeWidth="3"
                    strokeDasharray="7 6"
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                  />
                </svg>
                <span
                  aria-hidden
                  data-arc-head
                  style={{
                    position: 'absolute',
                    left: forward ? '100%' : 0,
                    bottom: 0,
                    transform: `translate(-50%, 6px) rotate(${forward ? 34 : -34}deg)`,
                    width: 0,
                    height: 0,
                    borderLeft: '5px solid transparent',
                    borderRight: '5px solid transparent',
                    borderTop: '10px solid #b05f28',
                  }}
                />
              </div>
            )
          })}
          {ticks.map((t) => {
            const selected = state.value === t
            const highlighted = state.highlight.includes(t)
            const marked = state.marker === t
            // a tick shows its number once it has been reached; before the
            // walk starts, an unlabelled line cannot give the answer away
            // An arc's DESTINATION is deliberately not self-labelling: a jump
            // can be drawn while "where does it land?" is still the question.
            // `labelled` (and the marker) say what has been established.
            const shows = (v: number): boolean =>
              state.labelled === null ||
              state.labelled.includes(v) ||
              state.marker === v ||
              state.value === v
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
                  // 'none' alone is dropped by the style serialiser here and
                  // the UA's button border comes back, boxing every tick —
                  // the line then reads as a table of cells
                  borderWidth: 0,
                  borderStyle: 'none',
                  background: 'transparent',
                  appearance: 'none',
                  WebkitAppearance: 'none',
                  cursor: disabled ? 'default' : 'pointer',
                  padding: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 3,
                  fontFamily: "'Lora', serif",
                }}
              >
                {/* the tick itself: a mark ON the axis, so the numbers below
                    are anchored to a place rather than floating in a row */}
                <span
                  aria-hidden
                  style={{
                    width: selected || marked ? 3 : 2,
                    height: selected || marked ? 20 : 13,
                    borderRadius: 2,
                    background: selected ? '#b05f28' : marked ? '#5c4a38' : '#a89c88',
                    transition: 'height 0.25s ease, background 0.25s ease, width 0.25s ease',
                  }}
                />
                <span
                  style={{
                    fontSize: 15,
                    fontWeight: selected || marked ? 700 : 600,
                    color: selected ? '#b05f28' : marked ? '#2e2822' : '#5c5245',
                    background: highlighted ? '#f3e4d4' : 'transparent',
                    borderRadius: 5,
                    padding: '1px 6px',
                    minHeight: 21,
                    transition: 'color 0.25s ease, background 0.25s ease',
                  }}
                >
                  {shows(t) ? t : ''}
                </span>
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

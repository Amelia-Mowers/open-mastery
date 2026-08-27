/** Illustrative Mathematics' tape diagram (IM 6–8 first ed., G7 U6 L2–3,
 * CC BY 4.0) — a trinity widget (§4.4):
 *  - lesson mode: patch-driven (partLabel / total / highlight)
 *  - problem mode: FILL A PART — one cell is an inline input and the other
 *    equal parts mirror it live (fill: 'part'), or the total under the brace
 *    is the input while the parts are known (fill: 'total'). */
import { useSyncExternalStore } from 'react'
import type { CSSProperties } from 'react'
import type { WidgetInstance, WidgetMode } from '../widgets/contract'
import { WidgetStore } from '../widgets/store'

export interface TapeDiagramConfig {
  /** part count (answer-input use; lessons carry it in the setup patch) */
  parts?: number
  /** brace label when filling a part; ignored when filling the total */
  total?: string | number
  /** known-part label when filling the total */
  partLabel?: string | number
  /** which piece the student fills in (default 'part') */
  fill?: 'part' | 'total'
}

export interface TapeDiagramParams {
  parts: number
  partLabel: string
  total: string
}

export interface TapeDiagramView {
  partLabel?: string
  total?: string
  /** 1-based part indices to highlight */
  highlight?: number[]
}

export interface TapeDiagramAnswer {
  raw: string
  value: number | null
}

type TapeState = {
  partLabel: string | null
  total: string | null
  highlight: number[]
  raw: string
}

const label = (p: TapeDiagramParams): string =>
  `Tape diagram: ${p.parts} equal parts of ${p.partLabel}, total ${p.total}`

const cellStyle = (highlighted: boolean, last: boolean): CSSProperties => ({
  flex: 1,
  minWidth: 0,
  textAlign: 'center',
  padding: '18px 4px',
  borderRight: last ? 'none' : '2px solid #5c4a38',
  background: highlighted ? '#f7e6d4' : 'transparent',
  font: "600 clamp(15px, 3.4vw, 22px) 'Lora', Georgia, serif",
  color: highlighted ? '#8a4d1d' : '#2e2822',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  transition: 'background 0.3s ease, color 0.3s ease',
})

export function createTapeDiagram(
  config: TapeDiagramConfig = {},
): WidgetInstance<TapeDiagramParams, TapeDiagramAnswer, TapeDiagramView> {
  const store = new WidgetStore<TapeState>({ partLabel: null, total: null, highlight: [], raw: '' })

  function Brace() {
    return (
      <div aria-hidden style={{ padding: '0 2px' }}>
        <svg viewBox="0 0 560 16" style={{ width: '100%', height: 16, display: 'block' }}>
          <path
            d="M4 2 Q4 12 24 12 L268 12 Q280 12 280 16 Q280 12 292 12 L536 12 Q556 12 556 2"
            fill="none"
            stroke="#8b8070"
            strokeWidth="2.5"
          />
        </svg>
      </div>
    )
  }

  function InputBox({ disabled, wide }: { disabled: boolean; wide?: boolean }) {
    const state = useSyncExternalStore(store.subscribe, store.getState, store.getState)
    return (
      <input
        aria-label={config.fill === 'total' ? 'Total of the tape' : 'Value of one part'}
        aria-disabled={disabled}
        disabled={disabled}
        placeholder="?"
        value={state.raw}
        onChange={(e) => {
          store.record('input', { raw: e.target.value })
          store.setState({ raw: e.target.value })
        }}
        onKeyDown={(e) => store.record('key', { key: e.key })}
        style={{
          width: wide ? 110 : '85%',
          maxWidth: 110,
          font: "600 20px 'Lora', Georgia, serif",
          textAlign: 'center',
          padding: '4px 2px',
          border: '2px dashed #b05f28',
          borderRadius: 8,
          background: '#fffdf9',
          color: '#8a4d1d',
        }}
      />
    )
  }

  function ProblemView({ mode }: { mode: WidgetMode }) {
    const state = useSyncExternalStore(store.subscribe, store.getState, store.getState)
    const n = Math.max(1, Math.round(config.parts ?? 2))
    const disabled = mode === 'review'
    const fillTotal = config.fill === 'total'
    const mirror = state.raw.trim() === '' ? '?' : state.raw
    return (
      <div
        role="group"
        aria-label={`Tape diagram with ${n} equal parts`}
        style={{ maxWidth: 560, minWidth: 300, flex: '1 1 300px', margin: '0 auto' }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'stretch',
            border: '2.5px solid #5c4a38',
            borderRadius: 10,
            overflow: 'hidden',
            background: '#fffdf9',
          }}
        >
          {Array.from({ length: n }, (_, i) => {
            const isInput = !fillTotal && i === 0
            return (
              <div key={i} data-part data-mirror={!fillTotal && i > 0 ? true : undefined} style={cellStyle(isInput, i === n - 1)}>
                {isInput ? (
                  <InputBox disabled={disabled} />
                ) : fillTotal ? (
                  String(config.partLabel ?? '?')
                ) : (
                  <span style={{ opacity: state.raw.trim() === '' ? 0.35 : 0.75 }}>{mirror}</span>
                )}
              </div>
            )
          })}
        </div>
        <Brace />
        <div
          data-total
          style={{
            textAlign: 'center',
            font: "700 20px 'Lora', Georgia, serif",
            color: '#5c5245',
            marginTop: 2,
          }}
        >
          {fillTotal ? <InputBox disabled={disabled} wide /> : String(config.total ?? '')}
        </div>
      </div>
    )
  }

  function LessonView({ params }: { params: TapeDiagramParams }) {
    const state = useSyncExternalStore(store.subscribe, store.getState, store.getState)
    const n = Math.max(1, Math.round(params.parts))
    const partLabel = state.partLabel ?? params.partLabel
    const total = state.total ?? params.total
    return (
      <div role="img" aria-label={label(params)} style={{ maxWidth: 560, margin: '0 auto' }}>
        <div
          style={{
            display: 'flex',
            border: '2.5px solid #5c4a38',
            borderRadius: 10,
            overflow: 'hidden',
            background: '#fffdf9',
          }}
        >
          {Array.from({ length: n }, (_, i) => (
            <div
              key={i}
              data-part
              data-highlighted={state.highlight.includes(i + 1) || undefined}
              style={{
                ...cellStyle(state.highlight.includes(i + 1), i === n - 1),
                animation: 'cairn-rise 0.3s ease both',
                animationDelay: `${i * 0.05}s`,
              }}
            >
              {partLabel}
            </div>
          ))}
        </div>
        <Brace />
        <div
          data-total
          style={{
            textAlign: 'center',
            font: "700 20px 'Lora', Georgia, serif",
            color: '#5c5245',
            marginTop: 2,
            transition: 'color 0.3s ease',
          }}
        >
          {total}
        </div>
      </div>
    )
  }

  return {
    render: (params, mode) =>
      mode === 'lesson' ? <LessonView params={params} /> : <ProblemView mode={mode} />,
    extract: () => {
      const raw = store.getState().raw
      const n = Number(raw.trim())
      return { raw, value: raw.trim() !== '' && Number.isFinite(n) ? n : null }
    },
    trace: () => store.trace(),
    applyPatch: (patch) => {
      store.record('patch', patch)
      const next: Partial<TapeState> = {}
      if (patch.partLabel !== undefined) next.partLabel = patch.partLabel ?? null
      if (patch.total !== undefined) next.total = patch.total ?? null
      if (patch.highlight !== undefined) next.highlight = patch.highlight ?? []
      store.setState(next)
    },
    a11y: { role: 'img', label },
  }
}

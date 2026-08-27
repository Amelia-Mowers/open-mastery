/** Whiteboard-style worked equations: lines of algebra appear one after
 * another with accent-colored operation notes between them — the way a
 * teacher writes a solution, and the way OpenStax color-codes its worked
 * steps. Timeline patches append lines: { line, note? }. */
import { useSyncExternalStore } from 'react'
import type { WidgetInstance, WidgetMode } from '../widgets/contract'
import { WidgetStore } from '../widgets/store'

export interface WorkedEquationParams {
  /** first line (the starting equation) */
  start: string
}

export interface WorkedEquationConfig {
  /** problem mode: the lines already on the board */
  lines?: string[]
  /** problem mode: the student WRITES the next line of the solution */
  next?: boolean
}

export interface WorkedEquationView {
  /** append a line of working */
  line?: string
  /** operation annotation for that line, e.g. "multiply both sides by -1" */
  note?: string
}

type WorkedState = { lines: Array<{ text: string; note?: string }>; next: string }

const label = (p: WorkedEquationParams): string => `Worked solution starting from ${p.start}`

export function createWorkedEquation(
  config: WorkedEquationConfig = {},
): WidgetInstance<WorkedEquationParams, { raw: string } | null, WorkedEquationView> {
  const store = new WidgetStore<WorkedState>({ lines: [], next: '' })

  function View({ params, mode }: { params: WorkedEquationParams; mode: WidgetMode }) {
    const state = useSyncExternalStore(store.subscribe, store.getState, store.getState)
    const interactive = mode !== 'lesson' && config.next === true
    const lines: Array<{ text: string; note?: string }> = interactive
      ? (config.lines ?? []).map((text) => ({ text }))
      : [{ text: params.start }, ...state.lines]
    return (
      <div
        role="img"
        aria-label={label(params)}
        style={{
          maxWidth: 460,
          margin: '0 auto',
          background: '#fff',
          border: '2px solid #e6ddd0',
          borderRadius: 12,
          padding: '18px 26px',
          boxShadow: '0 2px 0 rgba(92, 74, 56, 0.08)',
        }}
      >
        {lines.map((l, i) => {
          const last = i === lines.length - 1
          return (
            <div key={i} data-line style={{ animation: 'cairn-rise 0.35s ease both' }}>
              {l.note !== undefined && (
                <div
                  data-note
                  style={{
                    font: "700 12.5px 'Nunito Sans', sans-serif",
                    color: '#b05f28',
                    margin: '10px 0 2px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <span aria-hidden style={{ color: '#d8cdbb' }}>↓</span>
                  {l.note}
                </div>
              )}
              <div
                style={{
                  font: `600 ${last ? 26 : 22}px 'Lora', Georgia, serif`,
                  color: last ? '#2e2822' : '#8b8070',
                  padding: '3px 0',
                  transition: 'color 0.3s ease, font-size 0.3s ease',
                }}
              >
                {l.text}
              </div>
            </div>
          )
        })}
        {interactive && (
          <div data-next-line>
            <div
              style={{
                font: "700 12.5px 'Nunito Sans', sans-serif",
                color: '#b05f28',
                margin: '12px 0 0',
              }}
            >
              <span aria-hidden style={{ color: '#d8cdbb' }}>↓</span> what comes next?
            </div>
            <input
              data-next-input
              aria-label="Write the next line of the solution"
              disabled={mode === 'review'}
              value={state.next}
              placeholder="write it…"
              onChange={(e) => {
                store.record('write', { text: e.target.value })
                store.setState({ next: e.target.value })
              }}
              style={{
                display: 'block',
                width: '100%',
                boxSizing: 'border-box',
                font: "600 24px 'Lora', Georgia, serif",
                color: '#2e2822',
                background: 'transparent',
                border: 'none',
                borderBottom: '2.5px dashed #d8cdbb',
                outlineColor: '#b05f28',
                padding: '6px 0 3px',
                marginTop: 2,
              }}
            />
          </div>
        )}
      </div>
    )
  }

  return {
    render: (params, mode) => <View params={params} mode={mode} />,
    extract: () => {
      if (config.next !== true) return null
      return { raw: store.getState().next.trim() }
    },
    trace: () => store.trace(),
    applyPatch: (patch) => {
      store.record('patch', patch)
      if (patch.line !== undefined && patch.line !== null) {
        const entry: { text: string; note?: string } =
          patch.note !== undefined && patch.note !== null
            ? { text: String(patch.line), note: String(patch.note) }
            : { text: String(patch.line) }
        store.setState({ lines: [...store.getState().lines, entry] })
      }
    },
    a11y: { role: 'img', label },
  }
}

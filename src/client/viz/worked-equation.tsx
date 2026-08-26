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

export interface WorkedEquationView {
  /** append a line of working */
  line?: string
  /** operation annotation for that line, e.g. "multiply both sides by -1" */
  note?: string
}

type WorkedState = { lines: Array<{ text: string; note?: string }> }

const label = (p: WorkedEquationParams): string => `Worked solution starting from ${p.start}`

export function createWorkedEquation(): WidgetInstance<WorkedEquationParams, null, WorkedEquationView> {
  const store = new WidgetStore<WorkedState>({ lines: [] })

  function View({ params, mode: _mode }: { params: WorkedEquationParams; mode: WidgetMode }) {
    const state = useSyncExternalStore(store.subscribe, store.getState, store.getState)
    const lines = [{ text: params.start }, ...state.lines]
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
      </div>
    )
  }

  return {
    render: (params, mode) => <View params={params} mode={mode} />,
    extract: () => null,
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

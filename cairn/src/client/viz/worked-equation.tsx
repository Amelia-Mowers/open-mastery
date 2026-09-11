/** Whiteboard-style worked equations: lines of algebra appear one after
 * another with accent-colored operation notes between them — the way a
 * teacher writes a solution, and the way OpenStax color-codes its worked
 * steps. Timeline patches append lines: { line, note? }. */
import { useEffect, useRef, useSyncExternalStore } from 'react'
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
  /** append a line of working — or several as one emphasis group */
  line?: string | string[]
  /** operation annotation for that line, e.g. "multiply both sides by -1" */
  note?: string
  /** light these substrings wherever they appear on the board — the
   * piece the caption is naming ("− 34", "³", a variable). Recolor
   * only, so the board never shifts; null/[] clears. */
  mark?: string | string[] | null
}

type WorkedState = { lines: Array<{ text: string; note?: string }>; next: string; marks: string[] }

/** split a line around every occurrence of every mark, longest-first so
 * "− 34" wins over "3" */
function markedSpans(text: string, marks: string[]): Array<{ t: string; hit: boolean }> {
  const ms = [...marks].filter((m) => m !== '').sort((a, b) => b.length - a.length)
  if (ms.length === 0) return [{ t: text, hit: false }]
  const out: Array<{ t: string; hit: boolean }> = []
  let rest = text
  while (rest !== '') {
    let at = -1
    let hit = ''
    for (const m of ms) {
      const i = rest.indexOf(m)
      if (i !== -1 && (at === -1 || i < at)) {
        at = i
        hit = m
      }
    }
    if (at === -1) {
      out.push({ t: rest, hit: false })
      break
    }
    if (at > 0) out.push({ t: rest.slice(0, at), hit: false })
    out.push({ t: hit, hit: true })
    rest = rest.slice(at + hit.length)
  }
  return out
}

const label = (p: WorkedEquationParams): string => `Worked solution starting from ${p.start}`

export function createWorkedEquation(
  config: WorkedEquationConfig = {},
): WidgetInstance<WorkedEquationParams, { raw: string } | null, WorkedEquationView> {
  const store = new WidgetStore<WorkedState>({ lines: [], next: '', marks: [] })

  function View({ params, mode }: { params: WorkedEquationParams; mode: WidgetMode }) {
    const state = useSyncExternalStore(store.subscribe, store.getState, store.getState)
    const interactive = mode !== 'lesson' && config.next === true
    const lines: Array<{ text: string; note?: string }> = interactive
      ? (config.lines ?? []).map((text) => ({ text }))
      : [{ text: params.start }, ...state.lines]
    // a long solve (7–11 lines) must not push the caption below the
    // fold: the board caps its height and stays pinned to the newest
    // line — earlier working scrolls up out of the frame
    const scrollRef = useRef<HTMLDivElement | null>(null)
    useEffect(() => {
      const el = scrollRef.current
      if (el) el.scrollTop = el.scrollHeight
    }, [lines.length])
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
        <div ref={scrollRef} style={{ maxHeight: 336, overflowY: 'auto' }}>
        {(() => {
          // emphasis groups are delimited by the operation dividers: the
          // CURRENT group is every line since the last note. A multi-line
          // opening (given + question, no divider between) reads with
          // equal weight; each worked step still gets its single-line
          // emphasis because each arrives with its divider.
          const lastNoted = lines.reduce((acc, l, i) => (l.note !== undefined ? i : acc), 0)
          return lines.map((l, i) => {
          const last = i >= lastNoted
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
                  // ONE size for every line: the old 26→22 shrink re-wrapped
                  // the opening line whenever a new line landed (§5 stable
                  // footprint) — emphasis is weight + color now
                  font: `${last ? 700 : 600} 24px 'Lora', Georgia, serif`,
                  color: last ? '#2e2822' : '#8b8070',
                  padding: '3px 0',
                  transition: 'color 0.3s ease',
                }}
              >
                {markedSpans(l.text, state.marks).map((seg, j) =>
                  seg.hit ? (
                    <span
                      key={j}
                      data-marked
                      style={{ color: '#b05f28', background: '#f7e6d4', borderRadius: 6 }}
                    >
                      {seg.t}
                    </span>
                  ) : (
                    <span key={j}>{seg.t}</span>
                  ),
                )}
              </div>
            </div>
          )
        })
        })()}
        </div>
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
        // an ARRAY of lines lands as one emphasis group (a multi-line
        // opening: statement, given pair, question) — the note, if any,
        // belongs to the first
        const texts = Array.isArray(patch.line) ? patch.line : [patch.line]
        const entries = texts.map((t, i) =>
          i === 0 && patch.note !== undefined && patch.note !== null
            ? { text: String(t), note: String(patch.note) }
            : { text: String(t) },
        )
        store.setState({ lines: [...store.getState().lines, ...entries] })
      }
      if (patch.mark !== undefined) {
        const mv = patch.mark
        store.setState({ marks: mv == null ? [] : Array.isArray(mv) ? mv.map(String) : [String(mv)] })
      }
    },
    a11y: { role: 'img', label },
  }
}

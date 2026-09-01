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
  /** bar-model mode: UNEQUAL labeled cells (e.g. ["x", "8"] braced by 21)
   * instead of `parts` equal cells — the part-part-whole picture */
  cells?: string[]
}

export interface TapeDiagramView {
  partLabel?: string
  total?: string
  /** 1-based part indices to highlight */
  highlight?: number[]
  /** staged decomposition: show the brace total once its symbol is explained */
  totalIn?: boolean
  /** staged construction: how many CELLS have arrived (bar-model mode).
   * The bar is built piece by piece as the student names each one, so the
   * diagram is CONSTRUCTED from the equation rather than presented whole. */
  cellsIn?: number | null
  /** the MOVE, shown on the bar: 1-based indices of sections taken away.
   * The section COLLAPSES (width → 0) and the bar shrinks, because that is
   * what taking a piece off actually looks like — the tape's equivalent of
   * the balance's op badge, so a step that asks for a move shows it. */
  removed?: number[] | 'others'
  /** an operation applied to the total, e.g. { op: 'subtract', by: '8' } */
  totalOp?: { op: 'add' | 'subtract' | 'multiply' | 'divide'; by: string } | null
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
  totalIn: boolean
  cellsIn: number | null
  removed: number[] | 'others'
  totalOp: { op: string; by: string } | null
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
  const store = new WidgetStore<TapeState>({ partLabel: null, total: null, highlight: [], raw: '', totalIn: true, cellsIn: null, removed: [], totalOp: null })

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
    const cells = params.cells
    const n = cells ? cells.length : Math.max(1, Math.round(params.parts))
    const partLabel = state.partLabel ?? params.partLabel
    const total = state.total ?? params.total
    // The BAR ITSELF shrinks when a section is taken away. Cells are flex:1,
    // so collapsing one only lets the others expand — the bar has to lose
    // that share of its own width, or "take the 8 off" looks like "the x
    // piece got bigger", which is the opposite of what the move means.
    // 'others' = every section but the first — the solve-reduction for
    // {a}x = b tapes, where {a} is a template and indices can't be authored
    const removedList =
      state.removed === 'others'
        ? Array.from({ length: Math.max(0, n - 1) }, (_, i) => i + 2)
        : state.removed
    const alive = Array.from({ length: n }, (_, i) => i + 1).filter(
      (k) => !removedList.includes(k),
    ).length
    const barWidth = n > 0 ? `${(alive / n) * 100}%` : '100%'
    return (
      <div role="img" aria-label={label(params)} style={{ maxWidth: 560, margin: '0 auto' }}>
        <div
          data-bar-wrap
          style={{ width: barWidth, margin: '0 auto', transition: 'width 0.55s ease' }}
        >
        <div
          data-bar
          style={{
            display: 'flex',
            border: '2.5px solid #5c4a38',
            borderRadius: 10,
            overflow: 'hidden',
            background: '#fffdf9',
          }}
        >
          {Array.from({ length: n }, (_, i) => {
            const arrived = state.cellsIn === null || i < state.cellsIn
            const gone = removedList.includes(i + 1)
            return (
              <div
                key={i}
                data-part
                data-empty={!arrived || undefined}
                data-removed={gone || undefined}
                data-highlighted={(arrived && state.highlight.includes(i + 1)) || undefined}
                style={{
                  ...cellStyle(arrived && !gone && state.highlight.includes(i + 1), i === n - 1),
                  // not yet placed: the label is invisible but still there, so
                  // the empty bar has the same height as the filled one
                  ...(arrived ? {} : { background: '#f6f1e7', color: 'transparent' }),
                  // a removed section collapses away and the bar shrinks
                  transition: 'flex 0.55s ease, padding 0.55s ease, opacity 0.4s ease',
                  ...(gone
                    ? {
                        flex: '0 0 0px',
                        paddingLeft: 0,
                        paddingRight: 0,
                        opacity: 0,
                        overflow: 'hidden',
                        borderRightWidth: 0,
                      }
                    : {}),
                  ...(gone ? {} : { animation: 'cairn-rise 0.3s ease both' }),
                  animationDelay: `${i * 0.05}s`,
                }}
              >
                {/* an EMPTY label must still hold a glyph: '' collapses
                    the text line and the whole bar changes height —
                    invisible content, never absent content */}
                {(cells ? cells[i] : partLabel) || '\u00A0'}
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
            transition: 'color 0.3s ease',
          }}
        >
          {state.totalIn ? total : ''}
          {state.totalIn && state.totalOp && (
            <span
              data-total-op
              style={{
                marginLeft: 10,
                font: "700 16px 'Lora', Georgia, serif",
                color: '#b05f28',
                background: '#f7e6d4',
                border: '1.5px solid #e8c9a8',
                padding: '2px 12px',
                borderRadius: 14,
                whiteSpace: 'nowrap',
                animation: 'cairn-pop 0.3s ease',
              }}
            >
              {state.totalOp.op === 'subtract'
                ? '−'
                : state.totalOp.op === 'add'
                  ? '+'
                  : state.totalOp.op === 'multiply'
                    ? '×'
                    : '÷'}{' '}
              {state.totalOp.by}
            </span>
          )}
        </div>
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
      if (patch.totalIn !== undefined) next.totalIn = patch.totalIn === true
      if (patch.cellsIn !== undefined)
        next.cellsIn = patch.cellsIn === null ? null : Number(patch.cellsIn)
      if (patch.removed !== undefined)
        next.removed =
          patch.removed === 'others'
            ? 'others' // resolved against the live part count at render
            : Array.isArray(patch.removed)
              ? patch.removed.map(Number)
              : []
      if (patch.totalOp !== undefined) next.totalOp = patch.totalOp ?? null
      store.setState(next)
    },
    a11y: { role: 'img', label },
  }
}

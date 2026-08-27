/** Ratio table (CCSS RP progression): two labeled columns of equivalent
 * pairs; a scale-factor arrow (×k / ÷k) can join two rows. Trinity: lesson
 * (rows reveal, row highlight, factor arrow), problem/faded (one cell is
 * '?' — the input), review (inert). */
import { useSyncExternalStore } from 'react'
import type { WidgetInstance, WidgetMode } from '../widgets/contract'
import { WidgetStore } from '../widgets/store'

export interface RatioTableParams {
  cols: string[]
  /** 1..6 rows of 2 values */
  rows: string[][]
}

export interface RatioTableConfig {
  cols?: (string | number)[]
  /** problem mode: exactly one cell is '?' — the input */
  rows?: (string | number)[][]
  /** row-select input: the answer is a clicked 1-based row (0 = the
   * none-option, e.g. "All rows agree") instead of a filled cell */
  select?: boolean
  noneLabel?: string
}

export interface RatioTableView {
  /** show the first n rows (header always shows) */
  reveal?: number
  /** 1-based row to emphasize, or null */
  highlight?: number | null
  /** scale-factor arrow joining two 1-based rows, e.g. { from: 1, to: 2, text: "×3" } */
  factor?: { from: number; to: number; text: string } | null
}

export interface RatioTableAnswer {
  raw: string
  value: number | null
}

type RtState = {
  reveal: number | null
  highlight: number | null
  factor: { from: number; to: number; text: string } | null
  raw: string
  selectedRow: number | null
}

const label = (p: RatioTableParams): string =>
  `Ratio table of ${p.cols.join(' and ')}, ${p.rows.length} rows`

const ROW_H = 44

export function createRatioTable(
  config: RatioTableConfig = {},
): WidgetInstance<RatioTableParams, RatioTableAnswer, RatioTableView> {
  const store = new WidgetStore<RtState>({ reveal: null, highlight: null, factor: null, raw: '', selectedRow: null })

  function Cell({ v, input, disabled }: { v: string | number; input: boolean; disabled: boolean }) {
    const state = useSyncExternalStore(store.subscribe, store.getState, store.getState)
    if (input && String(v) === '?')
      return (
        <input
          aria-label="Missing table value"
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
            width: 72,
            font: "600 18px 'Lora', Georgia, serif",
            textAlign: 'center',
            padding: '2px 2px',
            border: '2px dashed #b05f28',
            borderRadius: 8,
            background: '#fffdf9',
            color: '#8a4d1d',
          }}
        />
      )
    return <>{String(v)}</>
  }

  const selectRow = (row: number): void => {
    store.record('select', { row })
    store.setState({ selectedRow: row })
  }

  function View({ params, mode }: { params: RatioTableParams; mode: WidgetMode }) {
    const state = useSyncExternalStore(store.subscribe, store.getState, store.getState)
    const lesson = mode === 'lesson'
    const disabled = mode === 'review'
    const selecting = !lesson && config.select === true
    const cols = lesson ? params.cols : (config.cols ?? [])
    const rows = lesson ? params.rows : (config.rows ?? [])
    const shown = lesson && state.reveal !== null ? state.reveal : rows.length
    const f = lesson ? state.factor : null
    return (
      <div
        role={lesson ? 'img' : 'group'}
        aria-label={lesson ? label(params) : `Ratio table: fill in the missing value`}
        style={{ maxWidth: 400, minWidth: 260, margin: '0 auto', position: 'relative', paddingRight: 64 }}
      >
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            background: '#fffdf9',
            border: '2.5px solid #5c4a38',
            borderRadius: 10,
            font: "600 18px 'Lora', Georgia, serif",
          }}
        >
          <thead>
            <tr>
              {cols.map((c, i) => (
                <th
                  key={i}
                  style={{
                    padding: '8px 10px',
                    background: '#f2ede4',
                    borderBottom: '2.5px solid #5c4a38',
                    borderRight: i === 0 ? '2px solid #5c4a38' : 'none',
                    font: "700 14px 'Nunito Sans', sans-serif",
                    color: '#5c5245',
                  }}
                >
                  {String(c)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => {
              const hidden = r >= shown
              return (
                <tr
                  key={r}
                  data-row
                  data-select-row={selecting ? r + 1 : undefined}
                  data-selected={(selecting && state.selectedRow === r + 1) || undefined}
                  aria-checked={selecting ? state.selectedRow === r + 1 : undefined}
                  role={selecting ? 'radio' : undefined}
                  data-highlighted={state.highlight === r + 1 || undefined}
                  onClick={() => {
                    if (selecting && !disabled) selectRow(r + 1)
                  }}
                  style={{
                    background:
                      selecting && state.selectedRow === r + 1
                        ? '#f7e6d4'
                        : state.highlight === r + 1
                          ? '#f7e6d4'
                          : 'transparent',
                    outline: selecting && state.selectedRow === r + 1 ? '2.5px solid #b05f28' : 'none',
                    outlineOffset: -2,
                    cursor: selecting && !disabled ? 'pointer' : 'default',
                    opacity: hidden ? 0 : 1,
                    transition: 'opacity 0.35s ease, background 0.3s ease',
                    animation: hidden ? undefined : 'cairn-rise 0.3s ease both',
                    height: ROW_H,
                  }}
                >
                  {row.map((v, c) => (
                    <td
                      key={c}
                      style={{
                        textAlign: 'center',
                        padding: '6px 10px',
                        borderRight: c === 0 ? '2px solid #5c4a38' : 'none',
                        borderTop: r > 0 ? '1.5px solid #d8cdbb' : 'none',
                        color: state.highlight === r + 1 ? '#8a4d1d' : '#2e2822',
                      }}
                    >
                      {hidden ? '' : <Cell v={v} input={!lesson} disabled={disabled} />}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
        {selecting && (
          <button
            type="button"
            data-select-none
            data-selected={state.selectedRow === 0 || undefined}
            aria-checked={state.selectedRow === 0}
            role="radio"
            disabled={disabled}
            onClick={() => {
              if (!disabled) selectRow(0)
            }}
            style={{
              marginTop: 10,
              font: "600 15px 'Nunito Sans', sans-serif",
              color: state.selectedRow === 0 ? '#8a4d1d' : '#5c5245',
              background: state.selectedRow === 0 ? '#f7e6d4' : '#fffdf9',
              border: `2.5px solid ${state.selectedRow === 0 ? '#b05f28' : '#d8cdbb'}`,
              borderRadius: 11,
              padding: '9px 16px',
              cursor: disabled ? 'default' : 'pointer',
              transition: 'border-color 0.2s ease, background 0.2s ease',
            }}
          >
            {String(config.noneLabel ?? 'None of the rows')}
          </button>
        )}
        {f && f.from >= 1 && f.to >= 1 && f.from !== f.to && (
          <div
            data-factor
            style={{
              position: 'absolute',
              right: 0,
              // arrow spans from the middle of row `from` to the middle of row `to`
              top: 42 + (Math.min(f.from, f.to) - 0.5) * ROW_H,
              height: Math.abs(f.to - f.from) * ROW_H,
              width: 58,
              animation: 'cairn-pop 0.3s ease both',
            }}
          >
            <svg viewBox="0 0 58 100" preserveAspectRatio="none" aria-hidden style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
              <path
                d={f.to > f.from ? 'M6 4 Q46 50 6 96' : 'M6 96 Q46 50 6 4'}
                fill="none"
                stroke="#b05f28"
                strokeWidth="2.5"
              />
              <path
                d={f.to > f.from ? 'M6 96 l3 -9 l7 6 Z' : 'M6 4 l3 9 l7 -6 Z'}
                fill="#b05f28"
              />
            </svg>
            <span
              style={{
                position: 'absolute',
                right: 0,
                top: '50%',
                transform: 'translateY(-50%)',
                font: "700 15px 'Lora', Georgia, serif",
                color: '#b05f28',
                background: '#f7e6d4',
                border: '1.5px solid #e8c9a8',
                padding: '2px 9px',
                borderRadius: 12,
                whiteSpace: 'nowrap',
              }}
            >
              {f.text}
            </span>
          </div>
        )}
      </div>
    )
  }

  return {
    render: (params, mode) => <View params={params} mode={mode} />,
    extract: () => {
      if (config.select === true) {
        const row = store.getState().selectedRow
        return row === null ? { raw: '', value: null } : { raw: String(row), value: row }
      }
      const raw = store.getState().raw
      const n = Number(raw.trim())
      return { raw, value: raw.trim() !== '' && Number.isFinite(n) ? n : null }
    },
    trace: () => store.trace(),
    applyPatch: (patch) => {
      store.record('patch', patch)
      const next: Partial<RtState> = {}
      if (patch.reveal !== undefined) next.reveal = patch.reveal ?? null
      if (patch.highlight !== undefined) next.highlight = patch.highlight ?? null
      if (patch.factor !== undefined) next.factor = patch.factor ?? null
      store.setState(next)
    },
    a11y: { role: 'img', label },
  }
}

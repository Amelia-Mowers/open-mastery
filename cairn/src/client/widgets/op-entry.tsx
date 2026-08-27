/** Shared constructed-response entry for a both-sides move: the student
 * picks the operation SYMBOL and types the operand — nothing is offered as
 * a ready-made answer (this is entry, not multiple choice). The host widget
 * mirrors the entered move onto both sides of its model as it's typed.
 * Extract contract (matches the 'op' grader): "<word> <operand>". */

export type OpKey = 'add' | 'subtract' | 'multiply' | 'divide'

export const OP_KEYS: OpKey[] = ['add', 'subtract', 'multiply', 'divide']

export const OP_SYMBOL: Record<OpKey, string> = {
  add: '+',
  subtract: '−',
  multiply: '×',
  divide: '÷',
}

export const OP_WORD: Record<OpKey, string> = {
  add: 'Add',
  subtract: 'Subtract',
  multiply: 'Multiply by',
  divide: 'Divide by',
}

export interface OpMove {
  op: OpKey | null
  by: string
}

/** A complete move ("divide", "4") in the grader's raw shape, or null. */
export const moveRaw = (move: OpMove): string | null =>
  move.op !== null && move.by.trim() !== '' ? `${move.op} ${move.by.trim()}` : null

export function OpEntry({
  move,
  disabled,
  onChange,
  ariaLabel,
  nudge,
}: {
  move: OpMove
  disabled: boolean
  onChange: (move: OpMove) => void
  ariaLabel: string
  /** pulse incomplete parts after an attempted submit; seq replays it */
  nudge?: { seq: number; parts: ReadonlyArray<'op' | 'by'> }
}) {
  const cycle = (delta: number): void => {
    const idx = move.op === null ? -delta : OP_KEYS.indexOf(move.op)
    const next = OP_KEYS[(idx + delta + OP_KEYS.length) % OP_KEYS.length]!
    onChange({ ...move, op: next })
  }
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 10,
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 14,
      }}
    >
      <div
        key={`op-${nudge?.seq ?? 0}`}
        className={nudge?.parts.includes('op') ? 'sw-nudge' : undefined}
        role="radiogroup"
        aria-label={ariaLabel}
        aria-disabled={disabled}
        tabIndex={disabled ? -1 : 0}
        onKeyDown={(e) => {
          if (disabled) return
          if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
            e.preventDefault()
            cycle(1)
          } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
            e.preventDefault()
            cycle(-1)
          }
        }}
        style={{ display: 'flex', gap: 8, outlineColor: '#b05f28' }}
      >
        {OP_KEYS.map((k) => {
          const on = move.op === k
          return (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={OP_WORD[k]}
              tabIndex={-1}
              data-op-sym={k}
              data-selected={on || undefined}
              disabled={disabled}
              onClick={() => {
                if (!disabled) onChange({ ...move, op: k })
              }}
              style={{
                font: "700 20px 'Lora', Georgia, serif",
                color: on ? '#8a4d1d' : '#5c5245',
                background: on ? '#f7e6d4' : '#fffdf9',
                border: `2.5px solid ${on ? '#b05f28' : '#d8cdbb'}`,
                borderRadius: 11,
                width: 44,
                height: 44,
                cursor: disabled ? 'default' : 'pointer',
                transition: 'border-color 0.2s ease, background 0.2s ease',
              }}
            >
              {OP_SYMBOL[k]}
            </button>
          )
        })}
      </div>
      <input
        key={`by-${nudge?.seq ?? 0}`}
        className={nudge?.parts.includes('by') ? 'sw-nudge' : undefined}
        data-op-by
        aria-label="Amount for the move"
        inputMode="decimal"
        disabled={disabled}
        value={move.by}
        placeholder="how much?"
        onChange={(e) => onChange({ ...move, by: e.target.value })}
        style={{
          font: "600 18px 'Lora', Georgia, serif",
          color: '#2e2822',
          background: '#fffdf9',
          border: '2.5px solid #d8cdbb',
          borderRadius: 11,
          padding: '8px 12px',
          width: 136,
        }}
      />
      <span
        aria-hidden
        style={{ font: "700 13px 'Nunito Sans', sans-serif", color: '#8b8070' }}
      >
        both sides
      </span>
    </div>
  )
}

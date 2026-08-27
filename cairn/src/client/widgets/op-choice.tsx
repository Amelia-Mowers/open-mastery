/** Shared single-select option row for widget answer spaces (pick the
 * operation on the balance, choose the move on the hanger, choose the next
 * line on the whiteboard). One tab stop, arrow keys, review-inert — the
 * Golden keyboard/inertness contract in one place. */
export interface OpOption {
  key: string
  label: string
}

export function OpChoiceRow({
  options,
  selected,
  disabled,
  onSelect,
  ariaLabel,
}: {
  options: OpOption[]
  selected: string | null
  disabled: boolean
  onSelect: (key: string) => void
  ariaLabel: string
}) {
  const move = (delta: number): void => {
    const idx = options.findIndex((o) => o.key === selected)
    const next = options[(idx + delta + options.length) % options.length]
    if (next) onSelect(next.key)
  }
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      aria-disabled={disabled}
      tabIndex={disabled ? -1 : 0}
      onKeyDown={(e) => {
        if (disabled) return
        if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
          e.preventDefault()
          move(1)
        } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
          e.preventDefault()
          move(-1)
        }
      }}
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 10,
        justifyContent: 'center',
        marginTop: 14,
        outlineColor: '#b05f28',
      }}
    >
      {options.map((o) => {
        const on = selected === o.key
        return (
          <button
            key={o.key}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={-1}
            data-op-option={o.key}
            data-selected={on || undefined}
            disabled={disabled}
            onClick={() => {
              if (!disabled) onSelect(o.key)
            }}
            style={{
              font: "700 16px 'Lora', Georgia, serif",
              color: on ? '#8a4d1d' : '#5c5245',
              background: on ? '#f7e6d4' : '#fffdf9',
              border: `2.5px solid ${on ? '#b05f28' : '#d8cdbb'}`,
              borderRadius: 11,
              padding: '9px 16px',
              cursor: disabled ? 'default' : 'pointer',
              transition: 'border-color 0.2s ease, background 0.2s ease',
            }}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

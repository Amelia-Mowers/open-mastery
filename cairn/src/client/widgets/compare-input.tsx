/** The composite answer for COMPARISON problems: two labelled rate boxes
 * plus the decision between them ("Pack A — $ per pencil", "Pack B — $
 * per pencil", "The better buy: [A] [B]").
 *
 * A comparison answered as a bare choice is a coin flip, and answered as
 * one number ("the better buy's unit price") still lets a student price
 * ONE pack and guess the comparison. This input demands the full computed
 * state the choice is based on: both rates AND the pick, one submission.
 * It is the CHECK instrument for compare skills — checks have no stepwise
 * lead, so nothing upstream hands these values over.
 *
 * It assembles an ordinary comma list ("2, 3, a"), so the standard
 * `ordered` grader and one answer key serve it — no structured key. */
import { useSyncExternalStore } from 'react'
import type { WidgetFactory, WidgetInstance, WidgetMode } from './contract'
import { WidgetStore } from './store'

export interface CompareInputConfig {
  /** optional sentence above the boxes */
  stem?: string
  /** the computed slots, in answer order — e.g. one per ratio pair
   * ("6 ÷ 2", "15 ÷ 5", "24 ÷ 8"). Takes precedence over aLabel/bLabel. */
  fields?: Array<{ label: string }>
  /** two-slot shorthand: label for the first computed slot */
  aLabel?: string
  /** two-slot shorthand: label for the second computed slot */
  bLabel?: string
  /** header over the value boxes naming WHAT goes in them (e.g.
   * "constant of proportionality") — names the what, never the how */
  fieldsLabel?: string
  /** the deciding question, e.g. "The better buy" / "Proportional?" */
  pickLabel?: string
  /** the options; `key` is the answer token the grader sees */
  options?: Array<{ key: string; label: string }>
}

export interface CompareInputParams {
  prompt?: string
}

export interface CompareAnswer {
  /** "«v1», …, «pick»" — empty until every part is filled, so a partial
   * answer can never grade as a wrong one */
  raw: string
  values: string[]
  pick: string | null
  missing: string[]
}

type CompareState = { values: string[]; pick: string | null }

const label = (params: CompareInputParams): string =>
  params.prompt ? `Comparison answer: ${params.prompt}` : 'Comparison answer'

const boxStyle = {
  width: 84,
  font: "600 20px 'Lora', serif",
  textAlign: 'center' as const,
  padding: 8,
  border: '2px solid #d8cdbb',
  borderRadius: 10,
  background: '#fffdf9',
}

export const createCompareInput: WidgetFactory<
  CompareInputParams,
  CompareAnswer,
  Record<never, never>,
  CompareInputConfig
> = (config): WidgetInstance<CompareInputParams, CompareAnswer, Record<never, never>> => {
  const fields: Array<{ label: string }> =
    config.fields ?? [{ label: config.aLabel ?? 'A' }, { label: config.bLabel ?? 'B' }]
  const store = new WidgetStore<CompareState>({ values: fields.map(() => ''), pick: null })
  const options = config.options ?? [
    { key: 'a', label: 'A' },
    { key: 'b', label: 'B' },
  ]

  function Field({
    slot,
    text,
    disabled,
  }: {
    slot: number
    text: string
    disabled: boolean
  }) {
    const state = useSyncExternalStore(store.subscribe, store.getState, store.getState)
    return (
      <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontFamily: "'Lora', serif", color: '#2e2822' }}>
        <span style={{ minWidth: 180 }}>{text}</span>
        <input
          aria-label={text}
          inputMode="decimal"
          aria-disabled={disabled}
          disabled={disabled}
          value={state.values[slot] ?? ''}
          onChange={(e) => {
            store.record('input', { part: `v${slot}`, raw: e.target.value })
            const values = [...store.getState().values]
            values[slot] = e.target.value
            store.setState({ ...store.getState(), values })
          }}
          style={boxStyle}
        />
      </label>
    )
  }

  function View({ params, mode }: { params: CompareInputParams; mode: WidgetMode }) {
    const state = useSyncExternalStore(store.subscribe, store.getState, store.getState)
    const disabled = mode === 'review'
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {config.stem !== undefined && (
          <p data-testid="stem" style={{ font: "600 18px 'Lora', serif", color: '#2e2822' }}>
            {config.stem}
          </p>
        )}
        {config.fieldsLabel !== undefined && (
          <div style={{ marginLeft: 190, font: "700 12.5px 'Nunito Sans', sans-serif", color: '#8b8070' }}>
            {config.fieldsLabel}
          </div>
        )}
        {fields.map((f, i) => (
          <Field key={i} slot={i} text={f.label} disabled={disabled} />
        ))}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ minWidth: 180, fontFamily: "'Lora', serif", color: '#2e2822' }}>
            {config.pickLabel ?? 'Which one?'}
          </span>
          <span role="group" aria-label={config.pickLabel ?? 'Which one?'} style={{ display: 'flex', gap: 6 }}>
            {options.map((op) => (
              <button
                key={op.key}
                type="button"
                aria-pressed={state.pick === op.key}
                disabled={disabled}
                onClick={() => {
                  store.record('input', { part: 'pick', raw: op.key })
                  store.setState({ ...store.getState(), pick: op.key })
                }}
                style={{
                  padding: '8px 14px',
                  font: "600 16px 'Lora', serif",
                  cursor: disabled ? 'default' : 'pointer',
                  color: state.pick === op.key ? '#fffdf9' : '#6b5a33',
                  background: state.pick === op.key ? '#b05f28' : '#fffdf9',
                  border: `2px solid ${state.pick === op.key ? '#b05f28' : '#d8cdbb'}`,
                  borderRadius: 10,
                }}
              >
                {op.label}
              </button>
            ))}
          </span>
        </div>
      </div>
    )
  }

  return {
    render: (params, mode) => <View params={params} mode={mode} />,
    extract: () => {
      const { values, pick } = store.getState()
      const missing: string[] = []
      values.forEach((v, i) => {
        if (v.trim() === '') missing.push(fields[i]?.label ?? `value ${i + 1}`)
      })
      if (pick === null) missing.push(config.pickLabel ?? 'the pick')
      return {
        raw:
          missing.length === 0 ? [...values.map((v) => v.trim()), pick].join(', ') : '',
        values,
        pick,
        missing,
      }
    },
    trace: () => store.trace(),
    applyPatch: () => {
      store.record('patch')
    },
    a11y: { role: 'group', label },
  }
}

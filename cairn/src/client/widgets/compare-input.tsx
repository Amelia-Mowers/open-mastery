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
  /** label for the first computed slot, e.g. "Pack A — $ per pencil" */
  aLabel?: string
  /** label for the second computed slot */
  bLabel?: string
  /** the deciding question, e.g. "The better buy" */
  pickLabel?: string
  /** the two options; `key` is the answer token the grader sees */
  options?: Array<{ key: string; label: string }>
}

export interface CompareInputParams {
  prompt?: string
}

export interface CompareAnswer {
  /** "«a», «b», «pick»" — empty until every part is filled, so a partial
   * answer can never grade as a wrong one */
  raw: string
  a: string
  b: string
  pick: string | null
  missing: Array<'a' | 'b' | 'pick'>
}

type CompareState = { a: string; b: string; pick: string | null }

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
  const store = new WidgetStore<CompareState>({ a: '', b: '', pick: null })
  const options = config.options ?? [
    { key: 'a', label: 'A' },
    { key: 'b', label: 'B' },
  ]

  function Field({
    slot,
    text,
    disabled,
  }: {
    slot: 'a' | 'b'
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
          value={state[slot]}
          onChange={(e) => {
            store.record('input', { part: slot, raw: e.target.value })
            store.setState({ ...store.getState(), [slot]: e.target.value })
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
        <Field slot="a" text={config.aLabel ?? 'A'} disabled={disabled} />
        <Field slot="b" text={config.bLabel ?? 'B'} disabled={disabled} />
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
      const { a, b, pick } = store.getState()
      const missing: Array<'a' | 'b' | 'pick'> = []
      if (a.trim() === '') missing.push('a')
      if (b.trim() === '') missing.push('b')
      if (pick === null) missing.push('pick')
      return {
        raw: missing.length === 0 ? `${a.trim()}, ${b.trim()}, ${pick}` : '',
        a,
        b,
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

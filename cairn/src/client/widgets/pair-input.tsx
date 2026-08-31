/** The composite answer for a RATIO ROW: both quantities of the scaled
 * pair, entered as one submission — [ ] cups : [ ] muffins.
 *
 * A scaled ratio asked as one blank splits into two item directions
 * ("missing cups" vs "missing muffins"), and any lesson caption fronting
 * the box must then hedge ("the missing value"). Asking for the WHOLE
 * row removes the ambiguity and matches what the lesson actually builds:
 * both quantities scale together, so both are the answer.
 *
 * It assembles an ordinary comma list ("12, 32"), so the standard
 * `ordered` grader and one answer key serve it — no structured key. */
import { useSyncExternalStore } from 'react'
import type { WidgetFactory, WidgetInstance, WidgetMode } from './contract'
import { WidgetStore } from './store'

export interface PairInputConfig {
  /** optional sentence above the boxes */
  stem?: string
  /** unit label for the first slot, e.g. "cups" */
  aLabel?: string
  /** unit label for the second slot, e.g. "muffins" */
  bLabel?: string
}

export interface PairInputParams {
  prompt?: string
}

export interface PairAnswer {
  /** "«a», «b»" — empty until both are filled, so a partial answer can
   * never grade as a wrong one */
  raw: string
  a: string
  b: string
  missing: Array<'a' | 'b'>
}

type PairState = { a: string; b: string }

const label = (params: PairInputParams): string =>
  params.prompt ? `Ratio answer: ${params.prompt}` : 'Ratio answer'

const boxStyle = {
  width: 72,
  font: "600 20px 'Lora', serif",
  textAlign: 'center' as const,
  padding: 8,
  border: '2px solid #d8cdbb',
  borderRadius: 10,
  background: '#fffdf9',
}

export const createPairInput: WidgetFactory<
  PairInputParams,
  PairAnswer,
  Record<never, never>,
  PairInputConfig
> = (config): WidgetInstance<PairInputParams, PairAnswer, Record<never, never>> => {
  const store = new WidgetStore<PairState>({ a: '', b: '' })

  function Slot({ slot, unit, disabled }: { slot: 'a' | 'b'; unit: string; disabled: boolean }) {
    const state = useSyncExternalStore(store.subscribe, store.getState, store.getState)
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        <input
          aria-label={unit}
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
        <span style={{ fontFamily: "'Lora', serif", color: '#5c5245' }}>{unit}</span>
      </span>
    )
  }

  function View({ mode }: { params: PairInputParams; mode: WidgetMode }) {
    const disabled = mode === 'review'
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {config.stem !== undefined && (
          <p data-testid="stem" style={{ font: "600 18px 'Lora', serif", color: '#2e2822' }}>
            {config.stem}
          </p>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Slot slot="a" unit={config.aLabel ?? 'first'} disabled={disabled} />
          <span style={{ font: "600 22px 'Lora', serif", color: '#2e2822' }}>:</span>
          <Slot slot="b" unit={config.bLabel ?? 'second'} disabled={disabled} />
        </div>
      </div>
    )
  }

  return {
    render: (params, mode) => <View params={params} mode={mode} />,
    extract: () => {
      const { a, b } = store.getState()
      const missing: Array<'a' | 'b'> = []
      if (a.trim() === '') missing.push('a')
      if (b.trim() === '') missing.push('b')
      return {
        raw: missing.length === 0 ? `${a.trim()}, ${b.trim()}` : '',
        a,
        b,
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

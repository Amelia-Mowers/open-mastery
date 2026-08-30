/** A structured expression answer: [ ]x + [ ], one numeric box per term.
 *
 * Scaffolds the EASIER tiers of expression skills. A free-text box also
 * tests notation — writing 6x rather than 6*x or x6, remembering the + —
 * so a student who can distribute perfectly can still be marked wrong for
 * typing. These boxes remove that noise and isolate the mathematics.
 *
 * The blank structure is itself part of the teaching: seeing [ ]x + [ ]
 * says the answer has exactly two parts, one attached to the variable and
 * one not, which is the conceptual content of distributing over a sum.
 * And the split localises the error — a student who fills the coefficient
 * but leaves the constant as the untouched original distributed to the
 * first term only, which a single box could never tell you.
 *
 * It is deliberately NOT the ceiling: it gives away the form of the
 * answer. Per the capstone rule, a skill's hardest item takes a raw
 * expression, where the student must produce the whole thing unprompted.
 */
import { useSyncExternalStore } from 'react'
import type { WidgetFactory, WidgetInstance, WidgetMode } from './contract'
import { WidgetStore } from './store'

export interface TermInputConfig {
  /** the letter the first box multiplies, e.g. "x" */
  variable?: string
  /** optional sentence above the boxes */
  stem?: string
}

export interface TermInputParams {
  prompt?: string
}

/** the SIGN is the student's to choose. Printing "+" hands them half the
 * answer, and for 3(2x − 5) the sign is the part most often got wrong. */
export type Sign = '+' | '-'

export interface TermAnswer {
  /** assembled as an ordinary expression, so the SAME grader and answer
   * key serve both this and the raw input — a structured answer must not
   * need a structured key */
  raw: string
  coefficient: string
  sign: Sign | null
  constant: string
  /** which parts are still blank. An incomplete answer collapses to an
   * empty `raw`, so without this the host can only say "nothing entered"
   * — useless to a student who filled both boxes but chose no sign. */
  missing: Array<'coefficient' | 'sign' | 'constant'>
}

type TermState = { coefficient: string; sign: Sign | null; constant: string }

const label = (params: TermInputParams): string =>
  params.prompt ? `Expression answer: ${params.prompt}` : 'Expression answer'

/** "6", "+", "15" → "6x + 15". An unfilled box or unchosen sign yields an
 * INCOMPLETE string rather than a defaulted one — the grader must see a
 * half-finished answer as wrong, never silently assume "+" or 0. */
export function assembleTerm(
  coefficient: string,
  sign: Sign | null,
  constant: string,
  variable: string,
): string {
  const c = coefficient.trim()
  const k = constant.trim()
  if (c === '' || k === '' || sign === null) return ''
  return `${c}${variable} ${sign} ${k}`
}

const boxStyle = {
  width: 64,
  font: "600 20px 'Lora', serif",
  textAlign: 'center' as const,
  padding: 8,
  border: '2px solid #d8cdbb',
  borderRadius: 10,
  background: '#fffdf9',
}

export const createTermInput: WidgetFactory<
  TermInputParams,
  TermAnswer,
  Record<never, never>,
  TermInputConfig
> = (config): WidgetInstance<TermInputParams, TermAnswer, Record<never, never>> => {
  const store = new WidgetStore<TermState>({ coefficient: '', sign: null, constant: '' })
  const variable = config.variable ?? 'x'

  function View({ params, mode }: { params: TermInputParams; mode: WidgetMode }) {
    const state = useSyncExternalStore(store.subscribe, store.getState, store.getState)
    const disabled = mode === 'review'
    return (
      <div>
        {config.stem !== undefined && (
          <p data-testid="stem" style={{ font: "600 18px 'Lora', serif", color: '#2e2822' }}>
            {config.stem}
          </p>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {params.prompt !== undefined && (
            <span style={{ color: '#5c5245', fontFamily: "'Lora', serif" }}>{params.prompt}</span>
          )}
          <input
            aria-label={`${label(params)}, number multiplying ${variable}`}
            inputMode="decimal"
            aria-disabled={disabled}
            disabled={disabled}
            value={state.coefficient}
            onChange={(e) => {
              store.record('input', { part: 'coefficient', raw: e.target.value })
              store.setState({ ...store.getState(), coefficient: e.target.value })
            }}
            style={boxStyle}
          />
          <span style={{ font: "600 22px 'Lora', serif", color: '#2e2822' }}>{variable}</span>
          <span role="group" aria-label="sign between the terms" style={{ display: 'flex', gap: 4 }}>
            {(['+', '-'] as const).map((sg) => (
              <button
                key={sg}
                type="button"
                aria-label={sg === '+' ? 'plus' : 'minus'}
                aria-pressed={state.sign === sg}
                disabled={disabled}
                onClick={() => {
                  store.record('input', { part: 'sign', raw: sg })
                  store.setState({ ...store.getState(), sign: sg })
                }}
                style={{
                  width: 40,
                  height: 40,
                  font: "600 20px 'Lora', serif",
                  cursor: disabled ? 'default' : 'pointer',
                  color: state.sign === sg ? '#fffdf9' : '#6b5a33',
                  background: state.sign === sg ? '#b05f28' : '#fffdf9',
                  border: `2px solid ${state.sign === sg ? '#b05f28' : '#d8cdbb'}`,
                  borderRadius: 10,
                }}
              >
                {sg === '+' ? '+' : '−'}
              </button>
            ))}
          </span>
          <input
            aria-label={`${label(params)}, the plain number`}
            inputMode="decimal"
            aria-disabled={disabled}
            disabled={disabled}
            value={state.constant}
            onChange={(e) => {
              store.record('input', { part: 'constant', raw: e.target.value })
              store.setState({ ...store.getState(), constant: e.target.value })
            }}
            style={boxStyle}
          />
        </div>
      </div>
    )
  }

  return {
    render: (params, mode) => <View params={params} mode={mode} />,
    extract: () => {
      const { coefficient, sign, constant } = store.getState()
      const missing: Array<'coefficient' | 'sign' | 'constant'> = []
      if (coefficient.trim() === '') missing.push('coefficient')
      if (sign === null) missing.push('sign')
      if (constant.trim() === '') missing.push('constant')
      return {
        raw: assembleTerm(coefficient, sign, constant, variable),
        coefficient,
        sign,
        constant,
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

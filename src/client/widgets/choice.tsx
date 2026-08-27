/** Choice input: pick one option. Options are authored with stable semantic
 * keys; their on-screen ORDER is shuffled deterministically per instance
 * (seeded by paramHash) so the correct answer has no fixed position. Pure
 * input widget (like numeric-input): no lesson role. Review mode is inert. */
import { useSyncExternalStore } from 'react'
import { mulberry32 } from '@openmastery/schema'
import type { WidgetInstance, WidgetMode } from './contract'
import { WidgetStore } from './store'

export interface ChoiceOption {
  key: string
  label: string
}

export interface ChoiceConfig {
  options?: ChoiceOption[]
  /** instance discriminator (ItemCard passes the paramHash) — shuffles order */
  seed?: string
}

export interface ChoiceAnswer {
  raw: string
}

type ChoiceState = { selected: string | null }

const hashSeed = (s: string): number => {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

const shuffled = <T,>(arr: readonly T[], seed: string): T[] => {
  const rng = mulberry32(hashSeed(seed))
  const out = [...arr]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j]!, out[i]!]
  }
  return out
}

export function createChoice(
  config: ChoiceConfig = {},
): WidgetInstance<Record<string, never>, ChoiceAnswer, Record<string, unknown>> {
  const store = new WidgetStore<ChoiceState>({ selected: null })
  const options = shuffled(config.options ?? [], config.seed ?? '')

  const select = (key: string): void => {
    store.record('select', { key })
    store.setState({ selected: key })
  }

  function View({ mode }: { mode: WidgetMode }) {
    const state = useSyncExternalStore(store.subscribe, store.getState, store.getState)
    const disabled = mode === 'review'
    const move = (delta: number): void => {
      const idx = options.findIndex((o) => o.key === state.selected)
      const next = options[(idx + delta + options.length) % options.length]
      if (next) select(next.key)
    }
    return (
      <div
        role="radiogroup"
        aria-label="Pick your answer"
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
        style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 560, outlineColor: '#b05f28' }}
      >
        {options.map((o) => {
          const on = state.selected === o.key
          return (
            <button
              key={o.key}
              type="button"
              role="radio"
              aria-checked={on}
              tabIndex={-1}
              data-choice={o.key}
              data-selected={on || undefined}
              disabled={disabled}
              onClick={() => {
                if (!disabled) select(o.key)
              }}
              style={{
                textAlign: 'left',
                font: "600 17px 'Lora', Georgia, serif",
                color: on ? '#8a4d1d' : '#2e2822',
                background: on ? '#f7e6d4' : '#fffdf9',
                border: `2.5px solid ${on ? '#b05f28' : '#d8cdbb'}`,
                borderRadius: 11,
                padding: '13px 16px',
                cursor: disabled ? 'default' : 'pointer',
                transition: 'border-color 0.2s ease, background 0.2s ease',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 18,
                  height: 18,
                  flex: 'none',
                  borderRadius: '50%',
                  border: `2.5px solid ${on ? '#b05f28' : '#b6a88f'}`,
                  background: on ? 'radial-gradient(circle, #b05f28 45%, transparent 50%)' : 'transparent',
                  transition: 'border-color 0.2s ease',
                }}
              />
              {o.label}
            </button>
          )
        })}
      </div>
    )
  }

  return {
    render: (_params, mode) => <View mode={mode} />,
    extract: () => {
      const key = store.getState().selected
      return key === null ? { raw: '' } : { raw: key }
    },
    trace: () => store.trace(),
    applyPatch: () => {},
    a11y: { role: 'radiogroup', label: () => 'Pick your answer' },
  }
}

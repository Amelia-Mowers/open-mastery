/** Double number line (CCSS RP progression, G6 ratios): two parallel lines
 * whose aligned ticks carry equivalent pairs — pounds above, dollars below.
 * Trinity: lesson (reveal pairs, highlight a tick, staged line entrances),
 * problem/faded (one tick's value is a fill-in input), review (inert). */
import { useSyncExternalStore } from 'react'
import type { WidgetInstance, WidgetMode } from '../widgets/contract'
import { WidgetStore } from '../widgets/store'

export interface DoubleNumberLineParams {
  topLabel: string
  bottomLabel: string
  /** aligned tick values, same length 2..8 */
  top: string[]
  bottom: string[]
}

export interface DoubleNumberLineConfig {
  topLabel?: string
  bottomLabel?: string
  /** problem mode: exactly one entry (top or bottom) is '?' — the input */
  top?: (string | number)[]
  bottom?: (string | number)[]
}

export interface DoubleNumberLineView {
  /** 0-based tick indices whose values show (ticks always show); null = all */
  reveal?: number[] | null
  /** 0-based tick index to emphasize, or null */
  highlight?: number | null
  /** staged decomposition: bring each line in as its quantity is explained */
  topIn?: boolean
  bottomIn?: boolean
}

export interface DoubleNumberLineAnswer {
  raw: string
  value: number | null
}

type DnlState = {
  reveal: number[] | null // null → all
  highlight: number | null
  topIn: boolean
  bottomIn: boolean
  raw: string
}

const label = (p: DoubleNumberLineParams): string =>
  `Double number line: ${p.topLabel} above, ${p.bottomLabel} below, ${p.top.length} tick pairs`

const tickX = (i: number, n: number): number => 60 + (i * 460) / Math.max(1, n - 1)

export function createDoubleNumberLine(
  config: DoubleNumberLineConfig = {},
): WidgetInstance<DoubleNumberLineParams, DoubleNumberLineAnswer, DoubleNumberLineView> {
  const store = new WidgetStore<DnlState>({
    reveal: null,
    highlight: null,
    topIn: true,
    bottomIn: true,
    raw: '',
  })

  function Line({
    y,
    values,
    valueAbove,
    lineLabel,
    shown,
    reveal,
    highlight,
    input,
    disabled,
  }: {
    y: number
    values: (string | number)[]
    valueAbove: boolean
    lineLabel: string
    shown: boolean
    reveal: number[] | null
    highlight: number | null
    input: boolean
    disabled: boolean
  }) {
    const state = useSyncExternalStore(store.subscribe, store.getState, store.getState)
    const n = values.length
    if (!shown) return null
    return (
      <div data-line={valueAbove ? 'top' : 'bottom'} style={{ animation: 'cairn-rise 0.35s ease both' }}>
        <div style={{ position: 'relative', height: 66 }}>
          <span
            style={{
              position: 'absolute',
              left: 0,
              top: y === 0 ? 26 : 22,
              font: "700 13px 'Nunito Sans', sans-serif",
              color: '#8b8070',
              maxWidth: 52,
              lineHeight: 1.1,
            }}
          >
            {lineLabel}
          </span>
          <svg viewBox="0 0 560 66" aria-hidden style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
            <line x1="52" y1="33" x2="540" y2="33" stroke="#8b8070" strokeWidth="3" strokeLinecap="round" />
            <path d="M540 33 l-9 -5 v10 Z" fill="#8b8070" />
            {values.map((_, i) => (
              <line
                key={i}
                x1={tickX(i, n)}
                y1={highlight === i ? 24 : 27}
                x2={tickX(i, n)}
                y2={highlight === i ? 42 : 39}
                stroke={highlight === i ? '#b05f28' : '#5c4a38'}
                strokeWidth={highlight === i ? 3.5 : 2.5}
                style={{ transition: 'stroke 0.25s ease' }}
              />
            ))}
          </svg>
          {values.map((v, i) => {
            const hidden = reveal !== null && !reveal.includes(i)
            const isInput = input && String(v) === '?'
            return (
              <span
                key={i}
                data-value={valueAbove ? 'top' : 'bottom'}
                data-highlighted={highlight === i || undefined}
                style={{
                  position: 'absolute',
                  left: `${(tickX(i, n) / 560) * 100}%`,
                  top: valueAbove ? 0 : 42,
                  transform: 'translateX(-50%)',
                  font: "600 17px 'Lora', Georgia, serif",
                  color: highlight === i ? '#8a4d1d' : '#2e2822',
                  background: highlight === i ? '#f7e6d4' : 'transparent',
                  borderRadius: 7,
                  padding: '0 5px',
                  opacity: hidden ? 0 : 1,
                  transition: 'opacity 0.35s ease, color 0.25s ease, background 0.25s ease',
                  whiteSpace: 'nowrap',
                  maxWidth: '20%',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {isInput ? (
                  <input
                    aria-label={`Missing ${lineLabel} value`}
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
                      width: 64,
                      font: "600 18px 'Lora', Georgia, serif",
                      textAlign: 'center',
                      padding: '2px 2px',
                      border: '2px dashed #b05f28',
                      borderRadius: 8,
                      background: '#fffdf9',
                      color: '#8a4d1d',
                    }}
                  />
                ) : (
                  String(v)
                )}
              </span>
            )
          })}
        </div>
      </div>
    )
  }

  function View({ params, mode }: { params: DoubleNumberLineParams; mode: WidgetMode }) {
    const state = useSyncExternalStore(store.subscribe, store.getState, store.getState)
    const lesson = mode === 'lesson'
    const disabled = mode === 'review'
    const top = lesson ? params.top : (config.top ?? [])
    const bottom = lesson ? params.bottom : (config.bottom ?? [])
    const topLabel = lesson ? params.topLabel : (config.topLabel ?? '')
    const bottomLabel = lesson ? params.bottomLabel : (config.bottomLabel ?? '')
    return (
      <div
        role={lesson ? 'img' : 'group'}
        aria-label={
          lesson
            ? label(params)
            : `Double number line: fill in the missing ${String(config.top ?? []).includes('?') ? topLabel : bottomLabel} value`
        }
        style={{ maxWidth: 560, minWidth: 300, flex: '1 1 300px', margin: '0 auto' }}
      >
        <Line
          y={0}
          values={top}
          valueAbove
          lineLabel={topLabel}
          shown={state.topIn}
          reveal={lesson ? state.reveal : null}
          highlight={state.highlight}
          input={!lesson}
          disabled={disabled}
        />
        <Line
          y={1}
          values={bottom}
          valueAbove={false}
          lineLabel={bottomLabel}
          shown={state.bottomIn}
          reveal={lesson ? state.reveal : null}
          highlight={state.highlight}
          input={!lesson}
          disabled={disabled}
        />
      </div>
    )
  }

  return {
    render: (params, mode) => <View params={params} mode={mode} />,
    extract: () => {
      const raw = store.getState().raw
      const n = Number(raw.trim())
      return { raw, value: raw.trim() !== '' && Number.isFinite(n) ? n : null }
    },
    trace: () => store.trace(),
    applyPatch: (patch) => {
      store.record('patch', patch)
      const next: Partial<DnlState> = {}
      if (patch.reveal !== undefined) next.reveal = patch.reveal ?? null
      if (patch.highlight !== undefined) next.highlight = patch.highlight ?? null
      if (patch.topIn !== undefined) next.topIn = patch.topIn === true
      if (patch.bottomIn !== undefined) next.bottomIn = patch.bottomIn === true
      store.setState(next)
    },
    a11y: { role: 'img', label },
  }
}

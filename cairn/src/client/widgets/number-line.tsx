import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { WidgetFactory, WidgetInstance, WidgetMode } from './contract'
import { WidgetStore } from './store'

/** One jump arc, drawn in REAL PIXELS (measured via ResizeObserver) so
 * the arrowhead can sit exactly on the curve's end tangent. A stretched
 * viewBox plus a fixed-angle head never matched — the arrival angle
 * depends on the arc's pixel width, so any guessed rotation reads as a
 * head glued on (reported twice). jsdom (no ResizeObserver) renders at a
 * fallback width; tests assert structure, not geometry. */
function ArcHop({
  forward,
  label,
  color = '#b05f28',
  below = false,
}: {
  forward: boolean
  label?: string | undefined
  color?: string | undefined
  below?: boolean | undefined
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    setW(el.clientWidth)
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => setW(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const W = w > 8 ? w : 120 // fallback before measurement / in jsdom
  const H = 44
  const m = 3 // inset so round caps don't clip
  const baseY = below ? 4 : H - 4
  // quadratic S → C → E along the hop, in pixels
  const S = { x: forward ? m : W - m, y: baseY }
  const E = { x: forward ? W - m : m, y: baseY }
  const C = { x: W / 2, y: below ? H + 6 : -6 }
  // trim the dashed curve ~9px short of E (the head continues it):
  // near t=1 the speed is ~2·|E−C|, so back off dt ≈ 9 / (2·|E−C|)
  const dEC = Math.hypot(E.x - C.x, E.y - C.y)
  const t = Math.max(0.55, 1 - 9 / (2 * dEC))
  // de Casteljau: the sub-curve S→C'→Q(t)
  const lerp = (a: { x: number; y: number }, b: { x: number; y: number }, k: number) => ({
    x: a.x + (b.x - a.x) * k,
    y: a.y + (b.y - a.y) * k,
  })
  const C1 = lerp(S, C, t)
  const Qt = lerp(lerp(S, C, t), lerp(C, E, t), t)
  // head: filled triangle at E, rotated onto the true end tangent (E − C)
  const ang = Math.atan2(E.y - C.y, E.x - C.x)
  const dir = { x: Math.cos(ang), y: Math.sin(ang) }
  const perp = { x: -dir.y, y: dir.x }
  const L = 11
  const half = 4.5
  const b1 = { x: E.x - dir.x * L + perp.x * half, y: E.y - dir.y * L + perp.y * half }
  const b2 = { x: E.x - dir.x * L - perp.x * half, y: E.y - dir.y * L - perp.y * half }
  return (
    <div ref={ref} style={{ width: '100%', height: '100%' }}>
      {label !== undefined && (
        <span
          data-arc-label
          style={{
            position: 'absolute',
            left: '50%',
            ...(below ? { top: '100%' } : { bottom: '100%' }),
            transform: below ? 'translate(-50%, -6px)' : 'translate(-50%, 6px)',
            font: "700 16px 'Lora', Georgia, serif",
            color,
            whiteSpace: 'nowrap',
          }}
        >
          {label}
        </span>
      )}
      <svg
        aria-hidden
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible' }}
      >
        <path
          d={`M ${S.x} ${S.y} Q ${C1.x} ${C1.y} ${Qt.x} ${Qt.y}`}
          fill="none"
          stroke={color}
          strokeWidth="3"
          strokeDasharray="7 6"
          strokeLinecap="round"
        />
        <path
          data-arc-head
          d={`M ${E.x} ${E.y} L ${b1.x} ${b1.y} L ${b2.x} ${b2.y} Z`}
          fill={color}
          stroke={color}
          strokeWidth="2"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  )
}

export interface NumberLineConfig {
  min: number
  max: number
  step: number
}

export interface NumberLineParams {
  prompt?: string
}

export interface NumberLineAnswer {
  value: number | null
}

export interface NumberLineView {
  /** rescale the line mid-lesson (the zoom-out move: the first story's
   * whole span becomes one step of the bigger one). Ticks, arcs, marker
   * and labels all re-read the active axis. */
  axis?: { min: number; max: number; step: number } | null
  highlight?: number[]
  marker?: number | null
  /** the MOVE: an arc from → to with its label above ("+ 4"), so a jump is
   * shown happening instead of a landing spot merely being highlighted */
  arcs?: Array<{ from: number; to: number; label?: string; color?: string; below?: boolean }> | null
  /** progressive labelling: only these ticks show their number (plus any
   * marked/arc endpoints). Without it a line that spans the answer PRINTS
   * the answer before the student has done anything. */
  labelled?: number[] | null
}

type NumberLineState = {
  value: number | null
  highlight: number[]
  marker: number | null
  arcs: Array<{ from: number; to: number; label?: string; color?: string; below?: boolean }>
  labelled: number[] | null
  axis: { min: number; max: number; step: number } | null
}

const label = (params: NumberLineParams): string =>
  params.prompt ? `Number line: ${params.prompt}` : 'Number line'

function ticksOf(config: NumberLineConfig): number[] {
  const out: number[] = []
  // tolerate float steps without drift accumulation
  const n = Math.round((config.max - config.min) / config.step)
  for (let i = 0; i <= n; i++) out.push(config.min + i * config.step)
  return out
}

export const createNumberLine: WidgetFactory<NumberLineParams, NumberLineAnswer, NumberLineView, NumberLineConfig> = (
  config,
): WidgetInstance<NumberLineParams, NumberLineAnswer, NumberLineView> => {
  const store = new WidgetStore<NumberLineState>({ value: null, highlight: [], marker: null, arcs: [], labelled: null, axis: null })

  const clamp = (v: number) => Math.min(config.max, Math.max(config.min, v))

  const select = (v: number, via: string) => {
    const value = clamp(v)
    store.record(via, { value })
    store.setState({ value })
  }

  function View({ params, mode }: { params: NumberLineParams; mode: WidgetMode }) {
    const state = useSyncExternalStore(store.subscribe, store.getState, store.getState)
    const ticks = ticksOf(state.axis ?? config)
    const disabled = mode === 'review'
    const current = state.value ?? config.min
    return (
      <div
        style={{
          fontFamily: "'Lora', serif",
          minWidth: 300,
          flex: '1 1 300px',
          maxWidth: 560,
          // below-the-line arcs (a second series) dip into the space the
          // caption would otherwise use — reserve it
          paddingBottom: state.arcs.some((a) => a.below === true) ? 56 : 0,
        }}
      >
        {params.prompt && <div style={{ color: '#5c5245', marginBottom: 8 }}>{params.prompt}</div>}
        <div
          role="slider"
          tabIndex={disabled ? -1 : 0}
          aria-label={label(params)}
          aria-valuemin={config.min}
          aria-valuemax={config.max}
          aria-valuenow={state.value ?? undefined}
          aria-disabled={disabled}
          onKeyDown={(e) => {
            if (disabled) return
            if (e.key === 'ArrowRight') {
              e.preventDefault()
              select(current + config.step, 'key')
            } else if (e.key === 'ArrowLeft') {
              e.preventDefault()
              select(current - config.step, 'key')
            } else if (e.key === 'Home') {
              e.preventDefault()
              select(config.min, 'key')
            } else if (e.key === 'End') {
              e.preventDefault()
              select(config.max, 'key')
            }
          }}
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 0,
            borderTop: '2.5px solid #8b8070',
            paddingTop: 0,
            outlineColor: '#b05f28',
            position: 'relative',
            marginTop: 70,
          }}
        >
          {/* Jumps are drawn per-arc in their own box. A single stretched
              SVG (preserveAspectRatio="none") squashes every triangle
              horizontally and puts nothing where the geometry says, which is
              why the head looked like a wedge. The curve keeps the stretch
              (it only needs to span the gap); the head is an HTML triangle
              that cannot be distorted; the label sits above the box. */}
          {state.arcs.map((a, i) => {
            // arcs are VALUE-positioned on the tick scale (ticks are
            // centred in equal flex cells, so value v sits at
            // ((v − min)/step + 0.5)/n) — an arc may land between ticks
            // (two series with different unit sizes share one line)
            const ax = state.axis ?? config
            const at = (v: number) => {
              if (v < ax.min - 1e-9 || v > ax.max + 1e-9) return -1
              return ((v - ax.min) / ax.step + 0.5) / ticks.length
            }
            const p1 = at(a.from)
            const p2 = at(a.to)
            if (p1 < 0 || p2 < 0) return null
            const left = Math.min(p1, p2)
            const width = Math.abs(p2 - p1)
            const forward = p2 >= p1
            return (
              <div
                key={i}
                data-arc={`${a.from}-${a.to}`}
                style={{
                  position: 'absolute',
                  left: `${left * 100}%`,
                  width: `${width * 100}%`,
                  ...(a.below === true
                    ? { top: 4, height: 44 }
                    : { bottom: 'calc(100% - 4px)', height: 44 }),
                  animation: 'cairn-pop 0.45s ease both',
                }}
              >
                <ArcHop forward={forward} label={a.label} color={a.color} below={a.below} />
              </div>
            )
          })}
          {ticks.map((t) => {
            const selected = state.value === t
            const highlighted = state.highlight.includes(t)
            const marked = state.marker === t
            // a tick shows its number once it has been reached; before the
            // walk starts, an unlabelled line cannot give the answer away
            // An arc's DESTINATION is deliberately not self-labelling: a jump
            // can be drawn while "where does it land?" is still the question.
            // `labelled` (and the marker) say what has been established.
            const shows = (v: number): boolean =>
              state.labelled === null ||
              state.labelled.includes(v) ||
              state.marker === v ||
              state.value === v
            return (
              <button
                key={t}
                type="button"
                tabIndex={-1}
                disabled={disabled}
                aria-disabled={disabled}
                data-tick={t}
                data-selected={selected || undefined}
                data-highlighted={highlighted || undefined}
                data-marked={marked || undefined}
                onClick={() => {
                  if (!disabled) select(t, 'click')
                }}
                style={{
                  flex: 1,
                  // 'none' alone is dropped by the style serialiser here and
                  // the UA's button border comes back, boxing every tick —
                  // the line then reads as a table of cells
                  borderWidth: 0,
                  borderStyle: 'none',
                  background: 'transparent',
                  appearance: 'none',
                  WebkitAppearance: 'none',
                  cursor: disabled ? 'default' : 'pointer',
                  padding: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 3,
                  fontFamily: "'Lora', serif",
                }}
              >
                {/* the tick itself: a mark ON the axis, so the numbers below
                    are anchored to a place rather than floating in a row */}
                <span
                  aria-hidden
                  style={{
                    width: selected || marked ? 3 : 2,
                    height: selected || marked ? 20 : 13,
                    borderRadius: 2,
                    background: selected ? '#b05f28' : marked ? '#5c4a38' : '#a89c88',
                    transition: 'height 0.25s ease, background 0.25s ease, width 0.25s ease',
                  }}
                />
                <span
                  style={{
                    fontSize: 15,
                    fontWeight: selected || marked ? 700 : 600,
                    color: selected ? '#b05f28' : marked ? '#2e2822' : '#5c5245',
                    background: highlighted ? '#f3e4d4' : 'transparent',
                    borderRadius: 5,
                    padding: '1px 6px',
                    minHeight: 21,
                    transition: 'color 0.25s ease, background 0.25s ease',
                  }}
                >
                  {shows(t) ? t : ''}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  return {
    render: (params, mode) => <View params={params} mode={mode} />,
    extract: () => ({ value: store.getState().value }),
    trace: () => store.trace(),
    applyPatch: (patch) => {
      store.record('patch', patch)
      const next: Partial<NumberLineState> = {}
      if (patch.highlight !== undefined) next.highlight = patch.highlight ?? []
      if (patch.marker !== undefined) next.marker = patch.marker ?? null
      if (patch.arcs !== undefined) next.arcs = patch.arcs ?? []
      if (patch.labelled !== undefined) next.labelled = patch.labelled ?? null
      if (patch.axis !== undefined) {
        const a = patch.axis
        next.axis =
          a !== null && a.step > 0 && a.max > a.min && (a.max - a.min) / a.step <= 40 ? a : null
      }
      store.setState(next)
    },
    a11y: { role: 'slider', label },
  }
}

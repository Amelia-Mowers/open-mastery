/** The explanation player (§6, build step 4): an intro naming what you're
 * learning (new-skill entry only), timed autoplay over the §4.3 timeline,
 * play/pause, speed control, a segmented step timeline (each rectangle fills
 * through its step; click to jump), backward-seek replay onto a fresh widget,
 * interaction mid-timeline, and handoff into faded/practice — with an
 * optional looping "show me another way" chain. Captions are the source of
 * truth and are rendered by the player. */
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { speech } from '../tts/speech'
import { VoiceControl, VoiceGenSpinner } from '../tts/VoiceToggle'
import type { ReactElement } from 'react'
import type { Explanation } from '@openmastery/schema'
import type { WidgetInstance } from '../widgets/contract'
import { createBalanceScale } from '../viz/balance-scale'
import { createEnvelopeModel } from '../viz/envelope-model'
import { createTapeDiagram } from '../viz/tape-diagram'
import { createHangerDiagram } from '../viz/hanger-diagram'
import { createAreaModel } from '../viz/area-model'
import { createOppositeFlip } from '../viz/opposite-flip'
import { createWorkedEquation } from '../viz/worked-equation'
import { createNumberLine } from '../widgets/number-line'
import { createDoubleNumberLine } from '../viz/double-number-line'
import { createRatioTable } from '../viz/ratio-table'
import { createCubeModel } from '../viz/cube-model'
import {
  adaptBalancePatch,
  adaptNumberLinePatch,
  evalNumber,
  numberLineSetup,
  renderText,
  type Params,
} from './render'

export interface LessonIntro {
  title: string
  /** plain-words version of what you're learning */
  plain?: string
  vocab?: Array<{ term: string; meaning: string }>
}

export interface LessonPlayerProps {
  explanation: Explanation
  params: Params
  kind: 'lesson' | 'alt_explanation' | 'walkthrough'
  /** shown once, before play begins — new-skill entry only */
  intro?: LessonIntro
  /** render without the outer card (playing inside an item card) */
  embedded?: boolean
  onDone: () => void
  /** offered at the handoff: chain into another representation (loops) */
  onAnotherWay?: () => void
  /** leave without finishing (embedded walk-throughs only) — no logging */
  onCancel?: () => void
  /** 'none' hides the handoff row — used when the player leads INTO an
   * answer that sits below it (the faded phase) */
  tail?: 'handoff' | 'none'
  /** fires when playback first reaches the final content step (independent
   * of the handoff button — the faded phase uses it to cue the answer box) */
  onReachedEnd?: () => void
  /** false when a walkthrough fell back to the family's example numbers —
   * the kicker must not claim "same numbers" */
  sameNumbers?: boolean
  /** false = wait for a play click before running OR speaking (the zoo's
   * cards, where many mounted players must not all start at once) */
  autoplay?: boolean
}

const TICK_MS = 100
const SPEEDS = [1, 1.5, 2, 0.5] as const

const KICKER: Record<LessonPlayerProps['kind'], string> = {
  lesson: 'LESSON',
  alt_explanation: "LET'S LOOK AT IT DIFFERENTLY",
  walkthrough: 'WALK-THROUGH · SAME NUMBERS',
}
const KICKER_EXAMPLE = 'WALK-THROUGH · EXAMPLE NUMBERS'

interface LessonWidget {
  element: ReactElement
  apply: (patch: Record<string, unknown>) => void
}

function envelopeSetup(
  timeline: ReadonlyArray<{ patch?: Record<string, unknown> | undefined }>,
  params: Params,
): { envelopes: number; counters: number } | null {
  for (const s of timeline) {
    const p = s.patch
    if (!p || !('envelopes' in p) || !('counters' in p)) continue
    const envelopes = evalNumber(p['envelopes'], params)
    const counters = evalNumber(p['counters'], params)
    if (envelopes === null || counters === null) return null
    if (envelopes < 1 || envelopes > 14 || Math.abs(counters) > 80) return null
    return { envelopes, counters }
  }
  return null
}

function tapeSetup(
  timeline: ReadonlyArray<{ patch?: Record<string, unknown> | undefined }>,
  params: Params,
): { parts: number; partLabel: string; total: string; cells?: string[] } | null {
  for (const s of timeline) {
    const p = s.patch
    if (!p) continue
    // bar-model form: unequal labeled cells
    if ('cells' in p && Array.isArray(p['cells']) && 'total' in p) {
      const cells = (p['cells'] as unknown[]).map((v) => renderText(String(v), params))
      if (cells.length < 1 || cells.length > 10) return null
      return {
        parts: cells.length,
        partLabel: '',
        total: renderText(String(p['total']), params),
        cells,
      }
    }
    if (!('parts' in p) || !('partLabel' in p) || !('total' in p)) continue
    const parts = evalNumber(p['parts'], params)
    if (parts === null || parts < 1 || parts > 14) return null
    return {
      parts,
      partLabel: renderText(String(p['partLabel']), params),
      total: renderText(String(p['total']), params),
    }
  }
  return null
}

function hangerSetup(
  timeline: ReadonlyArray<{ patch?: Record<string, unknown> | undefined }>,
  params: Params,
): { copies: number; shapeLabel: string; weight: string } | null {
  for (const s of timeline) {
    const p = s.patch
    if (!p || !('copies' in p) || !('shapeLabel' in p) || !('weight' in p)) continue
    const copies = evalNumber(p['copies'], params)
    if (copies === null || copies < 1 || copies > 14) return null
    // a hanger cannot hang negative weight — negative instances (e.g.
    // divide.002 arriving via "show me differently") get caption-only
    const weightValue = evalNumber(p['weight'], params)
    if (weightValue !== null && weightValue < 0) return null
    return {
      copies,
      shapeLabel: renderText(String(p['shapeLabel']), params),
      weight: renderText(String(p['weight']), params),
    }
  }
  return null
}

function dnlSetup(
  timeline: ReadonlyArray<{ patch?: Record<string, unknown> | undefined }>,
  params: Params,
): { topLabel: string; bottomLabel: string; top: string[]; bottom: string[] } | null {
  for (const s of timeline) {
    const p = s.patch
    if (!p || !('top' in p) || !('bottom' in p) || !Array.isArray(p['top']) || !Array.isArray(p['bottom']))
      continue
    const top = (p['top'] as unknown[]).map((v) => renderText(String(v), params))
    const bottom = (p['bottom'] as unknown[]).map((v) => renderText(String(v), params))
    if (top.length !== bottom.length || top.length < 2 || top.length > 8) return null
    return {
      topLabel: renderText(String(p['topLabel'] ?? ''), params),
      bottomLabel: renderText(String(p['bottomLabel'] ?? ''), params),
      top,
      bottom,
    }
  }
  return null
}

function ratioTableSetup(
  timeline: ReadonlyArray<{ patch?: Record<string, unknown> | undefined }>,
  params: Params,
): { cols: string[]; rows: string[][] } | null {
  for (const s of timeline) {
    const p = s.patch
    if (!p || !('cols' in p) || !('rows' in p) || !Array.isArray(p['cols']) || !Array.isArray(p['rows']))
      continue
    const cols = (p['cols'] as unknown[]).map((v) => renderText(String(v), params))
    const rows = (p['rows'] as unknown[]).map((r) =>
      Array.isArray(r) ? r.map((v) => renderText(String(v), params)) : [],
    )
    if (cols.length !== 2 || rows.length < 1 || rows.length > 6) return null
    if (rows.some((r) => r.length !== 2)) return null
    return { cols, rows }
  }
  return null
}

function areaSetup(
  timeline: ReadonlyArray<{ patch?: Record<string, unknown> | undefined }>,
  params: Params,
): { height: string; parts: string[] } | null {
  for (const s of timeline) {
    const p = s.patch
    if (!p || !('height' in p) || !('parts' in p) || !Array.isArray(p['parts'])) continue
    const parts = (p['parts'] as unknown[]).map((v) => renderText(String(v), params))
    if (parts.length < 1 || parts.length > 4) return null
    return { height: renderText(String(p['height']), params), parts }
  }
  return null
}

/** exported for the no-silent-fallback conformance test */
export function createLessonWidget(explanation: Explanation, params: Params): LessonWidget | null {
  if (explanation.widget === 'balance-scale') {
    const w = createBalanceScale()
    return {
      element: w.render({ left: '', right: '' }, 'lesson'),
      apply: (patch) => w.applyPatch(adaptBalancePatch(patch, params)),
    }
  }
  if (explanation.widget === 'number-line') {
    const setup = numberLineSetup(explanation.timeline, params)
    if (!setup) return null
    const w: WidgetInstance<{ prompt?: string }, unknown, { highlight?: number[]; marker?: number | null }> =
      createNumberLine(setup)
    return {
      element: w.render({}, 'lesson'),
      apply: (patch) => w.applyPatch(adaptNumberLinePatch(patch, params)),
    }
  }
  if (explanation.widget === 'envelope-model') {
    const setup = envelopeSetup(explanation.timeline, params)
    if (!setup) return null
    const w = createEnvelopeModel()
    return {
      element: w.render(setup, 'lesson'),
      apply: (patch) => {
        const view: { partition?: boolean; reveal?: boolean; envelopesIn?: boolean; countersIn?: boolean } = {}
        if ('partition' in patch) view.partition = patch['partition'] === true
        if ('reveal' in patch) view.reveal = patch['reveal'] === true
        if ('envelopesIn' in patch) view.envelopesIn = patch['envelopesIn'] === true
        if ('countersIn' in patch) view.countersIn = patch['countersIn'] === true
        w.applyPatch(view)
      },
    }
  }
  if (explanation.widget === 'tape-diagram') {
    const setup = tapeSetup(explanation.timeline, params)
    if (!setup) return null
    const w = createTapeDiagram()
    return {
      element: w.render(setup, 'lesson'),
      apply: (patch) => {
        const view: {
          partLabel?: string
          total?: string
          highlight?: number[]
          totalIn?: boolean
          cellsIn?: number | null
          removed?: number[] | 'others'
          totalOp?: { op: 'add' | 'subtract' | 'multiply' | 'divide'; by: string } | null
        } = {}
        if ('partLabel' in patch) view.partLabel = renderText(String(patch['partLabel']), params)
        if ('total' in patch) view.total = renderText(String(patch['total']), params)
        if ('totalIn' in patch) view.totalIn = patch['totalIn'] === true
        if ('cellsIn' in patch)
          view.cellsIn = patch['cellsIn'] === null ? null : evalNumber(patch['cellsIn'], params)
        if ('removed' in patch) {
          const raw = patch['removed']
          view.removed =
            raw === 'others' // every section but the first (solve-reduction)
              ? 'others'
              : Array.isArray(raw)
                ? raw.map((v) => evalNumber(v, params)).filter((x): x is number => x !== null)
                : []
        }
        if ('totalOp' in patch) {
          const o = patch['totalOp'] as { op?: unknown; by?: unknown } | null
          view.totalOp = o
            ? {
                op: String(o.op) as 'add' | 'subtract' | 'multiply' | 'divide',
                by: renderText(String(o.by), params),
              }
            : null
        }
        if ('highlight' in patch) {
          const raw = patch['highlight']
          view.highlight = Array.isArray(raw)
            ? raw.map((v) => evalNumber(v, params)).filter((x): x is number => x !== null)
            : []
        }
        w.applyPatch(view)
      },
    }
  }
  if (explanation.widget === 'hanger-diagram') {
    const setup = hangerSetup(explanation.timeline, params)
    if (!setup) return null
    const w = createHangerDiagram()
    return {
      element: w.render(setup, 'lesson'),
      apply: (patch) => {
        const view: { split?: boolean; share?: string; reveal?: boolean; shapesIn?: boolean; weightIn?: boolean } = {}
        if ('split' in patch) view.split = patch['split'] === true
        if ('reveal' in patch) view.reveal = patch['reveal'] === true
        if ('share' in patch) view.share = renderText(String(patch['share']), params)
        if ('shapesIn' in patch) view.shapesIn = patch['shapesIn'] === true
        if ('weightIn' in patch) view.weightIn = patch['weightIn'] === true
        w.applyPatch(view)
      },
    }
  }
  if (explanation.widget === 'double-number-line') {
    const setup = dnlSetup(explanation.timeline, params)
    if (!setup) return null
    const w = createDoubleNumberLine()
    return {
      element: w.render(setup, 'lesson'),
      apply: (patch) => {
        const view: { reveal?: number[] | null; highlight?: number | null; topIn?: boolean; bottomIn?: boolean } = {}
        if ('reveal' in patch) {
          const raw = patch['reveal']
          view.reveal = Array.isArray(raw)
            ? raw.map((v) => evalNumber(v, params)).filter((x): x is number => x !== null)
            : null
        }
        if ('highlight' in patch)
          view.highlight = patch['highlight'] === null ? null : evalNumber(patch['highlight'], params)
        if ('topIn' in patch) view.topIn = patch['topIn'] === true
        if ('bottomIn' in patch) view.bottomIn = patch['bottomIn'] === true
        w.applyPatch(view as Record<string, unknown>)
      },
    }
  }
  if (explanation.widget === 'ratio-table') {
    const setup = ratioTableSetup(explanation.timeline, params)
    if (!setup) return null
    const w = createRatioTable()
    return {
      element: w.render(setup, 'lesson'),
      apply: (patch) => {
        const view: {
          reveal?: number | null
          highlight?: number | null
          factor?: { from: number; to: number; text: string } | null
        } = {}
        if ('reveal' in patch) view.reveal = evalNumber(patch['reveal'], params)
        if ('highlight' in patch)
          view.highlight = patch['highlight'] === null ? null : evalNumber(patch['highlight'], params)
        if ('factor' in patch) {
          const f = patch['factor'] as { from?: unknown; to?: unknown; text?: unknown } | null
          const from = f ? evalNumber(f.from, params) : null
          const to = f ? evalNumber(f.to, params) : null
          view.factor =
            f && from !== null && to !== null
              ? { from, to, text: renderText(String(f.text ?? ''), params) }
              : null
        }
        w.applyPatch(view as Record<string, unknown>)
      },
    }
  }
  if (explanation.widget === 'cube-model') {
    let n: number | null = null
    for (const step of explanation.timeline) {
      const p = step.patch
      if (p && 'n' in p) {
        n = evalNumber(p['n'], params)
        break
      }
    }
    if (n === null || n < 2 || n > 8) return null
    const w = createCubeModel()
    return {
      element: w.render({ n }, 'lesson'),
      apply: (patch) => {
        const view: { slices?: number | null; count?: string | null; rowsIn?: boolean; colsIn?: boolean } = {}
        if ('slices' in patch)
          view.slices = patch['slices'] === null ? null : evalNumber(patch['slices'], params)
        if ('count' in patch)
          view.count = patch['count'] === null ? null : renderText(String(patch['count']), params)
        if ('rowsIn' in patch) view.rowsIn = patch['rowsIn'] === true
        if ('colsIn' in patch) view.colsIn = patch['colsIn'] === true
        w.applyPatch(view as Record<string, unknown>)
      },
    }
  }
  if (explanation.widget === 'area-model') {
    const setup = areaSetup(explanation.timeline, params)
    if (!setup) return null
    const w = createAreaModel()
    return {
      element: w.render(setup, 'lesson'),
      apply: (patch) => {
        const view: { products?: string[]; highlight?: number[]; fillRows?: number | null } = {}
        if ('fillRows' in patch)
          view.fillRows = patch['fillRows'] === null ? null : evalNumber(patch['fillRows'], params)
        if ('products' in patch && Array.isArray(patch['products']))
          view.products = (patch['products'] as unknown[]).map((v) => renderText(String(v), params))
        if ('highlight' in patch) {
          const raw = patch['highlight']
          view.highlight = Array.isArray(raw)
            ? raw.map((v) => evalNumber(v, params)).filter((x): x is number => x !== null)
            : []
        }
        w.applyPatch(view)
      },
    }
  }
  if (explanation.widget === 'opposite-flip') {
    let value: number | null = null
    for (const step of explanation.timeline) {
      const p = step.patch
      if (p && 'value' in p) {
        value = evalNumber(p['value'], params)
        break
      }
    }
    if (value === null || value === 0 || Math.abs(value) > 999) return null
    const w = createOppositeFlip()
    return {
      element: w.render({ value }, 'lesson'),
      apply: (patch) => {
        const view: { flip?: boolean; resolve?: boolean; landingLabel?: boolean } = {}
        if ('flip' in patch) view.flip = patch['flip'] === true
        if ('resolve' in patch) view.resolve = patch['resolve'] === true
        if ('landingLabel' in patch) view.landingLabel = patch['landingLabel'] === true
        w.applyPatch(view)
      },
    }
  }
  if (explanation.widget === 'worked-equation') {
    let start: string | null = null
    for (const step of explanation.timeline) {
      const p = step.patch
      if (p && 'start' in p) {
        start = renderText(String(p['start']), params)
        break
      }
    }
    if (start === null) return null
    const w = createWorkedEquation()
    return {
      element: w.render({ start }, 'lesson'),
      apply: (patch) => {
        if (!('line' in patch)) return
        // an array of lines is one emphasis group (a multi-line opening) —
        // String() would comma-join it into a single mangled line
        const lv = patch['line']
        const view: { line?: string | string[]; note?: string } = {
          line: Array.isArray(lv)
            ? lv.map((t) => renderText(String(t), params))
            : renderText(String(lv), params),
        }
        if ('note' in patch && patch['note'] != null) view.note = renderText(String(patch['note']), params)
        w.applyPatch(view)
      },
    }
  }
  return null // caption-only fallback for widgets without lesson support yet
}

export function LessonPlayer({
  explanation,
  params,
  kind,
  intro,
  embedded,
  onDone,
  onReachedEnd,
  sameNumbers,
  onAnotherWay,
  onCancel,
  tail = 'handoff',
  autoplay = true,
}: LessonPlayerProps) {
  const steps = explanation.timeline
  const handoffStep = steps.find((s) => s.handoff)
  const handoffT = handoffStep?.t ?? steps[steps.length - 1]!.t
  // segments cover the content steps; a trailing handoff-only step is the
  // resting point, not a segment of its own
  const contentSteps = steps.filter((s) => s.patch !== undefined || s.caption !== undefined)
  // optimistic voice: prefetch this lesson's captions ahead of playback.
  // Keyed on a STRING — the params object is a fresh identity every
  // render, and depending on it refired this on each frame
  const paramsKey = JSON.stringify(params)
  useEffect(() => {
    speech.pregenerate(
      contentSteps
        .map((s) => (s.caption !== undefined ? renderText(s.caption, params) : ''))
        .filter((t) => t !== ''),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [explanation.id, paramsKey])
  const lastContentT = contentSteps[contentSteps.length - 1]?.t ?? 0

  const [preamble, setPreamble] = useState(intro !== undefined)
  const [time, setTime] = useState(0)
  const [playing, setPlaying] = useState(autoplay && intro === undefined)
  /** narration follows the transport: silent until played (or scrubbed) */
  const [voiceLive, setVoiceLive] = useState(autoplay)
  /** bumped by section clicks so the landed step's line restarts from its
   * beginning even when the caption text is unchanged */
  const [speakCue, setSpeakCue] = useState(0)
  /** render driver while the clock is CLAMPED at a boundary: setTime with
   * an unchanged value bails out of re-rendering, and the segment bar
   * tracks speech.progress() — which only updates on render */
  const [, setPulse] = useState(0)
  const [speedIdx, setSpeedIdx] = useState(0)
  // the play/pause button shows the ACTUAL state: running clock OR audio
  // actually sounding for THIS player's line (the voice is a singleton —
  // another card's narration must not light this transport)
  const captionRef = useRef('')
  const audioActive = useSyncExternalStore(
    speech.subscribe,
    () => {
      const s = speech.getState()
      return s.speaking && !s.paused && speech.speaksLine([captionRef.current])
    },
    () => false,
  )
  /** the handoff row stays once the end has been reached, even when scrubbing back */
  const [reachedEnd, setReachedEnd] = useState(false)
  const endNotified = useRef(false)
  /** bumped to rebuild the widget for backward seeks (patches only merge) */
  const [epoch, setEpoch] = useState(0)
  const appliedRef = useRef(-1)
  const widgetRef = useRef<LessonWidget | null>(null)

  const widget = useMemo(() => createLessonWidget(explanation, params), [explanation.id, epoch])
  // a fresh widget (new explanation or backward seek) replays from the top
  if (widgetRef.current !== widget) {
    widgetRef.current = widget
    appliedRef.current = -1
  }

  // last step whose time has been reached (over ALL steps — patches included)
  let stepIdx = -1
  for (let i = 0; i < steps.length; i++) if (steps[i]!.t <= time + 1e-9) stepIdx = i

  useEffect(() => {
    if (time >= lastContentT - 1e-9) {
      setReachedEnd(true)
      if (!endNotified.current) {
        endNotified.current = true
        onReachedEnd?.()
      }
    }
  }, [time, lastContentT])

  // reset per explanation (the another-way chain swaps explanations in place)
  const firstExplanation = useRef(explanation.id)
  useEffect(() => {
    if (firstExplanation.current === explanation.id) return
    firstExplanation.current = explanation.id
    setTime(0)
    setReachedEnd(false)
    setPlaying(true) // chained representations play right away — no preamble
    setPreamble(false)
  }, [explanation.id])

  // apply newly-reached patches (forward only; backward is handled by epoch)
  useEffect(() => {
    if (appliedRef.current > stepIdx) return
    for (let i = appliedRef.current + 1; i <= stepIdx; i++) {
      const p = steps[i]!.patch
      if (p && widget) widget.apply(p)
    }
    appliedRef.current = stepIdx
  }, [stepIdx, widget, steps])

  // the caption sticks: latest step at/before now that HAS one; the symbolic
  // equation banner and its highlighted spans stick the same way
  let caption = ''
  let equation: string[] | null = null
  let eqHighlight: number[] = []
  for (let i = 0; i <= stepIdx; i++) {
    const st = steps[i]!
    if (st.caption !== undefined) caption = renderText(st.caption, params)
    const patch = st.patch
    if (patch) {
      if (Array.isArray(patch['equation']))
        equation = (patch['equation'] as unknown[]).map((seg) => renderText(String(seg), params))
      if (Array.isArray(patch['eqHighlight']))
        eqHighlight = (patch['eqHighlight'] as unknown[])
          .map((v) => Number(v))
          .filter((v) => Number.isInteger(v))
    }
  }
  captionRef.current = caption

  // autoplay: advance until the handoff time, then rest there.
  // With the voice on, the clock HOLDS at the next caption boundary until
  // the current caption's narration has PLAYED TO THE END (finished(), not
  // a sampled speaking flag — the flag has a not-yet-started window right
  // after a caption lands, and racing through it clipped narrations).
  const nextCaptionT = (t: number): number => {
    for (const st of steps)
      if (st.t > t + 0.001 && (st.caption !== undefined || st.handoff !== undefined))
        return st.t
    return Infinity
  }
  useEffect(() => {
    if (!playing || preamble) return
    const speed = SPEEDS[speedIdx]!
    const id = setInterval(() => {
      setTime((t) => {
        const next = t + (TICK_MS / 1000) * speed
        if (caption !== '' && !speech.finished([caption])) {
          const boundary = nextCaptionT(t)
          // clamp WELL below nextCaptionT's epsilon: a clamp at exactly
          // boundary − ε made the held step stop counting as "next" on
          // the following tick, so every hold lasted one tick and the
          // clock sailed through mid-narration
          if (next >= boundary) return Math.min(next, boundary - 0.01)
        }
        if (next >= handoffT) {
          setPlaying(false)
          return handoffT
        }
        return next
      })
      // repaint even when the clock clamped to the same value (batched
      // with setTime, so this adds no renders while time is moving)
      setPulse((n) => n + 1)
    }, TICK_MS)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, preamble, speedIdx, handoffT, caption])

  /** jump to a step and PLAY from its beginning — clock and narration
   * restart together, and the play button reflects it */
  const seek = (target: number) => {
    speech.resume() // the click is a gesture; clear any transport pause
    setVoiceLive(true)
    setSpeakCue((c) => c + 1) // re-speak even when the landed caption text is unchanged
    let targetIdx = -1
    for (let i = 0; i < steps.length; i++) if (steps[i]!.t <= target + 1e-9) targetIdx = i
    if (targetIdx < appliedRef.current) {
      setEpoch((e) => e + 1) // fresh widget; patches replay from the top
    }
    setTime(target)
    setPlaying(true)
  }

  /** fill fraction of content segment i — the clock's position, except
   * that the CURRENT segment tracks the narration while its line is
   * still being read: the bar completes when the slower of the two
   * (authored gap, audio) does, which is exactly when the step advances */
  const currentSegIdx = contentSteps.reduce((acc, s, i) => (s.t <= time + 1e-9 ? i : acc), 0)
  const fillOf = (i: number): number => {
    const start = contentSteps[i]!.t
    const end = i + 1 < contentSteps.length ? contentSteps[i + 1]!.t : handoffT
    let clockFill: number
    if (end <= start) clockFill = time >= start - 1e-9 ? 1 : 0
    else if (time <= start) clockFill = 0
    else if (time >= end) clockFill = 1
    else clockFill = (time - start) / (end - start)
    if (i === currentSegIdx && voiceLive && caption !== '' && !speech.finished([caption])) {
      const audioFill = speech.progress() ?? 0
      return Math.min(clockFill, audioFill)
    }
    return clockFill
  }

  if (preamble && intro) {
    return (
      <section className="card unlock" aria-label="What you're learning">
        <div className="card-kicker">
          <span className="kicker">NEW SKILL</span>
        </div>
        <p className="muted preamble-lead">Here's what you're learning:</p>
        <h1 className="preamble-title">{intro.title}</h1>
        {intro.plain && <p className="preamble-plain">{intro.plain}</p>}
        {intro.vocab && intro.vocab.length > 0 && (
          <dl className="preamble-vocab">
            {intro.vocab.map((v) => (
              <div key={v.term} className="vocab-row">
                <dt>{v.term}</dt>
                <dd>{v.meaning}</dd>
              </div>
            ))}
          </dl>
        )}
        <div className="answer-row" style={{ justifyContent: 'center' }}>
          <button
            className="btn btn-primary"
            onClick={() => {
              setPreamble(false)
              setPlaying(true)
            }}
          >
            Start the lesson
          </button>
        </div>
      </section>
    )
  }

  const body = (
    <>
      <div className="card-kicker">
        <span className={kind === 'lesson' ? 'kicker' : 'kicker kicker-alt'}>{kind === 'walkthrough' && sameNumbers === false ? KICKER_EXAMPLE : KICKER[kind]}</span>
        {onCancel && (
          <button className="btn btn-quiet player-close" aria-label="Back to the problem" onClick={onCancel}>
            ✕
          </button>
        )}
      </div>
      {equation && (
        <div className="lesson-equation" data-testid="lesson-equation" aria-label={`Equation ${equation.join('')}`}>
          {equation.map((seg, i) => (
            <span key={`${i}-${eqHighlight.includes(i)}`} className={eqHighlight.includes(i) ? 'eq-seg eq-hl' : 'eq-seg'}>
              {seg}
            </span>
          ))}
        </div>
      )}
      <div className="lesson-stage" key={epoch}>
        {widget ? widget.element : null}
      </div>
      <p
        key={caption}
        className={widget ? 'lesson-caption lesson-caption-under' : 'lesson-caption'}
        data-testid="lesson-caption"
      >
        {caption}
      </p>
      <SpeakCaption text={caption} live={voiceLive} cue={speakCue} />
      <VoiceGenSpinner />
      <div className="lesson-controls">
        <button
          className="btn btn-round"
          aria-label={playing || audioActive ? 'Pause' : 'Play'}
          onClick={() => {
            if (playing || audioActive) {
              // pause the narration WITH the lesson — resume picks the
              // audio up mid-word on the frozen audio clock
              speech.pause()
              setPlaying(false)
              return
            }
            if (time >= handoffT) {
              seek(0) // restart: seek plays
              return
            }
            speech.resume()
            setVoiceLive(true)
            setPlaying(true)
          }}
        >
          {playing || audioActive ? '❚❚' : '▶'}
        </button>
        <div className="step-track" role="group" aria-label="Lesson timeline">
          {contentSteps.map((s, i) => (
            <button
              key={i}
              type="button"
              className="step-seg"
              aria-label={`Go to step ${i + 1} of ${contentSteps.length}`}
              aria-current={i === currentSegIdx ? 'step' : undefined}
              onClick={() => seek(s.t)}
            >
              <span className="step-fill" style={{ width: `${fillOf(i) * 100}%` }} />
            </button>
          ))}
        </div>
        <button
          className="btn btn-speed"
          aria-label={`Playback speed ${SPEEDS[speedIdx]}x`}
          onClick={() => setSpeedIdx((i) => (i + 1) % SPEEDS.length)}
        >
          {SPEEDS[speedIdx]}×
        </button>
        <VoiceControl />
      </div>
      {reachedEnd && tail !== 'none' && (
        <div className="answer-row handoff-row">
          <button className="btn btn-primary handoff" onClick={onDone}>
            {handoffStep ? renderText(handoffStep.handoff!.prompt, params) : 'Now you try.'}
          </button>
          {onAnotherWay && (
            <button className="btn" onClick={onAnotherWay}>
              Show me another way
            </button>
          )}
        </div>
      )}
    </>
  )

  if (embedded) return <div className="embedded-player">{body}</div>
  return (
    <section className="card" aria-label={kind === 'walkthrough' && sameNumbers === false ? KICKER_EXAMPLE : KICKER[kind]}>
      {body}
    </section>
  )
}


/** Voice: read each caption as it lands. Narration always runs (mute
 * only zeroes the gain), so this never re-fires on mute changes — but it
 * follows the transport: silent until the player has been started or
 * scrubbed (`live`), so a mounted-but-unstarted player says nothing.
 * `cue` bumps re-speak the line from its beginning (a section click on
 * the step already showing). */
function SpeakCaption({ text, live, cue }: { text: string; live: boolean; cue: number }) {
  useEffect(() => {
    if (live && text !== '') void speech.speak([text])
  }, [text, live, cue])
  useEffect(() => () => speech.stop(), [])
  return null
}

/** Voice: optimistically synthesize every caption this lesson will show,
 * so each starts WITH its step instead of seconds behind it. */
export function pregenCaptions(texts: string[]): void {
  speech.pregenerate(texts)
}

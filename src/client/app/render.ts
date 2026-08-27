/** Client-side cairn-expr template rendering. Total: a template that fails to
 * render (curriculum bug) falls back to its raw source so the UI never
 * crashes mid-lesson. */
import { renderTemplate, type Env } from '@openmastery/schema'
import type { BalanceScaleView } from '../viz/balance-scale'

export type Params = Record<string, number | string>

export function renderText(template: string, params: Params): string {
  const r = renderTemplate(template, params as Env)
  return r.ok ? r.value : template
}

/** Evaluate a templated patch value ("{b/a}", 7, "3") to a finite number, or
 * null when it doesn't evaluate — the player falls back gracefully. */
export function evalNumber(v: unknown, params: Params): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v !== 'string') return null
  const r = renderTemplate(v, params as Env, { numberStyle: 'decimal', maxDecimalPlaces: 6 })
  if (!r.ok) return null
  const n = Number(r.value)
  return Number.isFinite(n) ? n : null
}

/** Adapt a number-line timeline patch: highlight/marker templates evaluate to
 * numbers against the item params. (min/max/step are consumed once, at widget
 * setup — see the player.) */
export function adaptNumberLinePatch(
  patch: Record<string, unknown>,
  params: Params,
): { highlight?: number[]; marker?: number | null } {
  const out: { highlight?: number[]; marker?: number | null } = {}
  if ('highlight' in patch) {
    const raw = patch['highlight']
    out.highlight = Array.isArray(raw)
      ? raw.map((v) => evalNumber(v, params)).filter((n): n is number => n !== null)
      : []
  }
  if ('marker' in patch) {
    out.marker = patch['marker'] == null ? null : evalNumber(patch['marker'], params)
  }
  return out
}

/** Widget setup for a number-line lesson: the first patch carrying
 * min/max/step. Null when absent or degenerate (caption-only fallback). */
export function numberLineSetup(
  timeline: ReadonlyArray<{ patch?: Record<string, unknown> | undefined }>,
  params: Params,
): { min: number; max: number; step: number } | null {
  for (const s of timeline) {
    const p = s.patch
    if (!p || !('min' in p) || !('max' in p) || !('step' in p)) continue
    const min = evalNumber(p['min'], params)
    const max = evalNumber(p['max'], params)
    const step = evalNumber(p['step'], params)
    if (min === null || max === null || step === null) return null
    if (step <= 0 || max <= min || (max - min) / step > 40) return null
    return { min, max, step }
  }
  return null
}

/** Adapt a raw explanation-timeline patch (§4.3: flat `{left, right,
 * highlight, op, by}` with templated strings) into the balance-scale widget's
 * view patch, rendering every template against the item params. */
export function adaptBalancePatch(
  patch: Record<string, unknown>,
  params: Params,
): Partial<BalanceScaleView> {
  const out: Partial<BalanceScaleView> = {}
  const str = (v: unknown): string => renderText(String(v), params)
  if ('left' in patch) out.left = patch['left'] == null ? undefined : str(patch['left'])
  if ('right' in patch) out.right = patch['right'] == null ? undefined : str(patch['right'])
  if ('highlight' in patch)
    out.highlight = (patch['highlight'] ?? null) as BalanceScaleView['highlight']
  if ('op' in patch) {
    const op = patch['op']
    out.op =
      op === null || op === undefined
        ? null
        : op === 'divide' || op === 'multiply'
          ? { op, by: str(patch['by'] ?? '') }
          : null
  }
  if ('leftIn' in patch) out.leftIn = patch['leftIn'] === true
  if ('rightIn' in patch) out.rightIn = patch['rightIn'] === true
  return out
}

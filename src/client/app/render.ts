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
  return out
}

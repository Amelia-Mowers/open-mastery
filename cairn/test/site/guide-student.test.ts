// @vitest-environment node
/** The guide view was one roster row with nothing to click, and "no open
 * flags" was the only thing it could ever say. A guide (often the parent)
 * needs to know WHAT THIS CHILD IS STUCK ON — which is exactly what
 * step_attempt makes answerable.
 */
import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { loadBundleDir } from '@openmastery/schema/load'
import { SiteCore } from '../../src/site/core'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'curriculum')
const T = Date.UTC(2026, 0, 1)

function bundle() {
  const b = { skills: [] as never[], items: [] as never[], explanations: [] as never[] }
  for (const d of ['skills', 'items', 'explanations']) {
    const r = loadBundleDir(join(root, d))
    b.skills.push(...(r.bundle.skills as never[]))
    b.items.push(...(r.bundle.items as never[]))
    b.explanations.push(...(r.bundle.explanations as never[]))
  }
  return b
}

type Detail = {
  totals: { attempts: number; stepMoves: number }
  stuck: Array<{ skillName: string; stepIndex: number; misses: number; reveals: number }>
  recent: Array<{ skillName: string; correct: boolean }>
  skills: Array<{ name: string; placed: boolean }>
}

describe('per-student guide detail', () => {
  it('names the steps a student keeps missing', () => {
    if (!existsSync(root)) return
    const core = new SiteCore(bundle() as never, { now: () => T })
    const SKILL = 'g6.ee.add-solve'

    // the student works, misses some problems, and fumbles the same MOVE
    for (let i = 0; i < 4; i++) {
      const a = (core.next('kid', SKILL, true).body as { action: { kind: string; [k: string]: unknown } })
        .action
      if (a.kind === 'lesson' || a.kind === 'alt_explanation') {
        core.explanationViewed('kid')
        continue
      }
      if (a.kind !== 'serve_item') break
      const inst = a['instance'] as { itemId: string; paramHash: string }
      // two misses on step 2 of the same explanation, one reveal
      core.stepAttempt('kid', {
        itemId: inst.itemId,
        paramHash: inst.paramHash,
        skillId: SKILL,
        explanationId: 'g6.ee.add-solve.exp-tape',
        stepIndex: 2,
        expectType: 'numeric',
        answer: '99',
        correct: false,
        revealed: false,
        misconceptionId: 'added-instead-of-subtracted',
        latencyMs: 4200,
      })
      core.attempt('kid', { raw: 'wrong', hintLevel: 0, latencyMs: 900 })
    }

    const d = core.guideStudent('kid').body as Detail
    expect(d.totals.attempts).toBeGreaterThan(0)
    expect(d.totals.stepMoves).toBeGreaterThan(0)
    // the detail POINTS AT A STEP, which the roster row never could
    expect(d.stuck.length).toBeGreaterThan(0)
    expect(d.stuck[0]!.stepIndex).toBe(2)
    expect(d.stuck[0]!.misses).toBeGreaterThan(1)
    expect(d.stuck[0]!.skillName).toBeTruthy()
    // and there is real work history to read
    expect(d.recent.length).toBeGreaterThan(0)
  })

  it('never presents a placed grade as earned mastery', () => {
    if (!existsSync(root)) return
    const core = new SiteCore(bundle() as never, { now: () => T })
    core.place('kid', 7)
    const d = core.guideStudent('kid').body as Detail
    const placed = d.skills.filter((s) => s.placed)
    expect(placed.length).toBeGreaterThan(0)
  })

  it('404s an unknown student rather than inventing a row', () => {
    if (!existsSync(root)) return
    const core = new SiteCore(bundle() as never, { now: () => T })
    expect(core.guideStudent('nobody').status).toBe(404)
  })
})

// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { loadBundleDir } from '@openmastery/schema/load'
import { renderTemplate, type Env } from '@openmastery/schema'
import { SiteCore } from '../../src/site/core'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'curriculum')

describe('a demo session reaches a stone', () => {
  it('a student answering correctly masters a skill within a short run', () => {
    const b = { skills: [] as never[], items: [] as never[], explanations: [] as never[] }
    for (const d of ['skills', 'items', 'explanations']) {
      const r = loadBundleDir(join(root, d))
      b.skills.push(...(r.bundle.skills as never[]))
      b.items.push(...(r.bundle.items as never[]))
      b.explanations.push(...(r.bundle.explanations as never[]))
    }
    const items = new Map(b.items.map((i: never) => [(i as { id: string }).id, i]))
    let t = Date.UTC(2026, 0, 1)
    const core = new SiteCore(b as never, { now: () => t })
    let mastered = 0
    let serves = 0
    for (let step = 0; step < 60 && mastered === 0; step++) {
      const body = core.next('kid').body as { action: { kind: string; [k: string]: unknown } }
      const a = body.action
      if (a.kind === 'session_done') break
      if (a.kind === 'lesson' || a.kind === 'alt_explanation') { core.explanationViewed('kid'); continue }
      if (a.kind !== 'serve_item') break
      if (a['checkAvailable'] === true) { core.startCheck('kid', a['forSkillId'] as string); continue }
      const inst = a['instance'] as { itemId: string; params: unknown }
      const full = items.get(inst.itemId) as unknown as { answer: { value: unknown } }
      const r = renderTemplate(String(full.answer.value), inst.params as Env, { numberStyle: 'fraction' })
      const out = core.attempt('kid', { raw: r.ok ? r.value : '', hintLevel: 0, latencyMs: 900 }).body as {
        emitted: Array<{ kind: string }>
      }
      serves++
      if (out.emitted.some((e) => e.kind === 'mastery_granted')) mastered++
    }
    // The report: 25 minutes, 144 points, ZERO stones — in a product named
    // for the pile of stones. A correct student now places the first one
    // after ~14 problems, a few minutes of play; the ceiling guards against
    // a scheduling change quietly pushing the payoff out of a demo again.
    expect(mastered, `no stone after ${serves} problems`).toBeGreaterThan(0)
    expect(serves).toBeLessThanOrEqual(20)
  })
})

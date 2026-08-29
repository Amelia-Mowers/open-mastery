// @vitest-environment node
/** A skill's practice TAIL must keep rotating representations.
 *
 * Difficulty was a hard first sort key in instantiateFor, so once the
 * student's estimate targeted the hardest tier, the hardest item won every
 * comparison and the least-served tiebreak never ran: one picture, 17
 * serves in a row. "Varied encoding beats one picture repeated" is the
 * whole point of authoring several representations per skill.
 */
import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { loadBundleDir } from '@openmastery/schema/load'
import { renderTemplate, type Env } from '@openmastery/schema'
import { SiteCore } from '../../src/site/core'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'curriculum')
const SKILL = 'g6.ee.add-solve'

describe('representation rotation', () => {
  it('keeps rotating pictures through a skill practice tail', () => {
    if (!existsSync(root)) return
    const b = { skills: [] as never[], items: [] as never[], explanations: [] as never[] }
    for (const d of ['skills', 'items', 'explanations']) {
      const r = loadBundleDir(join(root, d))
      b.skills.push(...(r.bundle.skills as never[]))
      b.items.push(...(r.bundle.items as never[]))
      b.explanations.push(...(r.bundle.explanations as never[]))
    }
    const items = new Map(b.items.map((i: never) => [(i as { id: string }).id, i]))
    const core = new SiteCore(b as never, { now: () => Date.UTC(2026, 0, 1) })

    const repsServed: string[] = []
    for (let step = 0; step < 40; step++) {
      const a = (core.next('kid', SKILL, true).body as { action: { kind: string; [k: string]: unknown } })
        .action
      if (a.kind === 'session_done') break
      if (a.kind === 'lesson' || a.kind === 'alt_explanation') {
        core.explanationViewed('kid')
        continue
      }
      if (a.kind !== 'serve_item') break
      if (a['checkAvailable'] === true) {
        core.startCheck('kid', a['forSkillId'] as string)
        continue
      }
      const inst = a['instance'] as { itemId: string; params: unknown }
      const full = items.get(inst.itemId) as unknown as {
        answer: { value: unknown }
        representation?: string
      }
      if (a['itemKind'] === 'practice' && full.representation) repsServed.push(full.representation)
      const r = renderTemplate(String(full.answer.value), inst.params as Env, {
        numberStyle: 'fraction',
      })
      core.attempt('kid', { raw: r.ok ? r.value : '', hintLevel: 0, latencyMs: 900 })
    }

    // the tail is the part after the acquisition run + check, which is
    // exactly where rotation used to die
    const tail = repsServed.slice(4)
    expect(tail.length).toBeGreaterThan(6)
    expect(
      new Set(tail).size,
      `practice tail showed one picture only: ${[...new Set(tail)].join(', ')}`,
    ).toBeGreaterThanOrEqual(2)
  })
})

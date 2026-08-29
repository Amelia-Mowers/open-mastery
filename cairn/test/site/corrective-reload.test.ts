// @vitest-environment node
/** The corrective ladder must survive a reload.
 *
 * hint → alternative representation → prereq probe → park is driven by
 * SkillSession counters, which are session-only. SiteCore replay handed
 * back a fresh session and the demo rebuilds SiteCore on every page load,
 * so a student who reloaded got plain practice with no hint, no
 * alternative explanation and no probe — that is exactly the STRUGGLING
 * student, the one the ladder exists for. restoreSession rebuilds the
 * counters from the attempts in the log.
 */
import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { loadBundleDir } from '@openmastery/schema/load'
import { SiteCore } from '../../src/site/core'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'curriculum')
const T = Date.UTC(2026, 0, 1)
const SKILL = 'g6.ee.add-solve'

type Action = { kind: string; [k: string]: unknown }

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

/** the rung the ladder is on, as the student would experience it: the
 * hint on offer AND whether an alternative representation is offered */
const rung = (a: Action): string => {
  const alt = a['altOffer'] as { representation: string } | undefined
  return `${a.kind}/${String(a['itemKind'] ?? '')}/hint=${String(a['offeredHintLevel'])}/alt=${alt?.representation ?? 'none'}`
}

describe('the corrective ladder survives a reload', () => {
  it('a struggling student gets the same help after reloading', () => {
    if (!existsSync(root)) return
    const b = bundle()

    // 2 misses → alternative representation; 4 → hint; 6 → parked
    for (const misses of [2, 4, 6]) {
      const core = new SiteCore(b as never, { now: () => T })
      let n = 0
      for (let s = 0; s < 20 && n < misses; s++) {
        const a = (core.next('kid', SKILL, true).body as { action: Action }).action
        if (a.kind === 'lesson' || a.kind === 'alt_explanation') {
          core.explanationViewed('kid')
          continue
        }
        if (a.kind !== 'serve_item') break
        core.attempt('kid', { raw: '999999', hintLevel: 0, latencyMs: 900 })
        n++
      }
      const live = (core.next('kid', SKILL, true).body as { action: Action }).action
      const revived = new SiteCore(b as never, {
        now: () => T,
        replay: (core.events('kid').body as { events: never[] }).events,
      })
      const after = (revived.next('kid', SKILL, true).body as { action: Action }).action
      // A `lesson` here is representation ROTATION (teaching a picture
      // before its first problem), not a corrective rung — it depends on
      // which item the selector picks, so it is not a ladder comparison.
      if (live.kind === 'lesson' || after.kind === 'lesson') continue
      expect(rung(after), `after ${misses} misses: reload changed the help offered`).toBe(rung(live))
    }
  })

  it('offers real help — not just the same thing — partway up the ladder', () => {
    if (!existsSync(root)) return
    const b = bundle()
    const core = new SiteCore(b as never, { now: () => T })
    let n = 0
    for (let s = 0; s < 20 && n < 4; s++) {
      const a = (core.next('kid', SKILL, true).body as { action: Action }).action
      if (a.kind === 'lesson' || a.kind === 'alt_explanation') {
        core.explanationViewed('kid')
        continue
      }
      if (a.kind !== 'serve_item') break
      core.attempt('kid', { raw: '999999', hintLevel: 0, latencyMs: 900 })
      n++
    }
    const revived = new SiteCore(b as never, {
      now: () => T,
      replay: (core.events('kid').body as { events: never[] }).events,
    })
    const after = (revived.next('kid', SKILL, true).body as { action: Action }).action
    // a hint is actually on offer, rather than a bare practice item
    expect(after['offeredHintLevel']).toBeGreaterThanOrEqual(1)
  })
})

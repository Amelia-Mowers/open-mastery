// @vitest-environment node
/** A page reload must not cost the student mastery credit.
 *
 * `led` (the first problem after a lesson, played with the walkthrough
 * above it) is folded at the MAXIMAL-ASSISTANCE discount, and that attempt
 * goes into the durable log. It was derived from session-only
 * `practiceServes`, which resets on every page load — so a student who
 * reloaded got `led` every single serve and was permanently held back.
 * Measured before the fix: identical correct answers reached p = 1.00 and
 * mastery with no reloads, but only p = 0.71 — never even reaching the
 * check — when reloading between serves.
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
const T = Date.UTC(2026, 0, 1)

function load() {
  const b = { skills: [] as never[], items: [] as never[], explanations: [] as never[] }
  for (const d of ['skills', 'items', 'explanations']) {
    const r = loadBundleDir(join(root, d))
    b.skills.push(...(r.bundle.skills as never[]))
    b.items.push(...(r.bundle.items as never[]))
    b.explanations.push(...(r.bundle.explanations as never[]))
  }
  return b
}

describe('reload does not cost mastery credit', () => {
  it('a reloading student reaches the same estimate as one who never reloads', () => {
    if (!existsSync(root)) return
    const b = load()
    const items = new Map(b.items.map((i: never) => [(i as { id: string }).id, i]))

    const play = (core: SiteCore, n: number): void => {
      for (let s = 0; s < n; s++) {
        const a = (
          core.next('kid', SKILL, true).body as { action: { kind: string; [k: string]: unknown } }
        ).action
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
        const full = items.get(inst.itemId) as unknown as { answer: { value: unknown } }
        const r = renderTemplate(String(full.answer.value), inst.params as Env, {
          numberStyle: 'fraction',
        })
        core.attempt('kid', { raw: r.ok ? r.value : '', hintLevel: 0, latencyMs: 900 })
      }
    }

    const straight = new SiteCore(b as never, { now: () => T })
    play(straight, 10)

    // the same student, reconstructed from the log before every serve —
    // which is what the demo does on each page load
    let reloading = new SiteCore(b as never, { now: () => T })
    for (let i = 0; i < 10; i++) {
      play(reloading, 1)
      reloading = new SiteCore(b as never, {
        now: () => T,
        replay: (reloading.events('kid').body as { events: never[] }).events,
      })
    }

    const a = straight.masteryOf('kid', SKILL)
    const c = reloading.masteryOf('kid', SKILL)
    expect(a).toBeGreaterThan(0.9)
    expect(c, `reloading student fell behind: ${c.toFixed(3)} vs ${a.toFixed(3)}`).toBeGreaterThan(
      a - 0.05,
    )
  })
})

// @vitest-environment node
/** The whiteboard never LEADS instruction.
 *
 * `instruction` is the skill's authored priority order, but the engine also
 * teaches an item's OWN representation before serving it — and that check
 * silently outranked the order. `evaluate` lists the table first, yet both
 * its items declare worked-equation, so every student met the whiteboard
 * first. The whiteboard is what the concrete models fade toward, so it can
 * never be the opening picture.
 */
import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { loadBundleDir } from '@openmastery/schema/load'
import { buildIndex } from '../../src/core/curriculum'
import { SiteCore } from '../../src/site/core'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'curriculum')

describe('the whiteboard never leads', () => {
  it('no skill opens on worked-equation, whatever its items are framed in', () => {
    if (!existsSync(root)) return
    const b = { skills: [] as never[], items: [] as never[], explanations: [] as never[] }
    for (const d of ['skills', 'items', 'explanations']) {
      const r = loadBundleDir(join(root, d))
      b.skills.push(...(r.bundle.skills as never[]))
      b.items.push(...(r.bundle.items as never[]))
      b.explanations.push(...(r.bundle.explanations as never[]))
    }
    const cur = buildIndex(b as never)

    const offenders: string[] = []
    for (const skillId of cur.skills.keys()) {
      // a skill with only the whiteboard authored has nothing else to lead with
      const reps = new Set((cur.explanationsBySkill.get(skillId) ?? []).map((e) => e.representation))
      if (reps.size < 2) continue
      const core = new SiteCore(b as never, { now: () => Date.UTC(2026, 0, 1) })
      const a = (core.next('kid', skillId, true).body as { action: { kind: string; [k: string]: unknown } })
        .action
      if (a.kind !== 'lesson') continue
      const exp = cur.explanations.get(String(a['explanationId']))
      if (exp?.representation === 'worked-equation') offenders.push(`${skillId} → ${exp.id}`)
    }
    expect(offenders, `opened on the whiteboard: ${offenders.join(', ')}`).toEqual([])
  })
})

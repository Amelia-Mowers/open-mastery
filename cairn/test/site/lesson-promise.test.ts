// @vitest-environment node
/** The picture taught is the picture practised — ACROSS A RELOAD.
 *
 * `session.promised` and `session.currentSkill` are session-only, and
 * currentSkill is set on an item serve but never on a lesson. So a student
 * who watched a lesson and reloaded was re-ranked from scratch: reproduced
 * as watching the add-solve TAPE lesson and being handed a lesson for a
 * different skill entirely. `lastTaught` is folded from explanation_viewed,
 * so the skill in hand now survives the reload.
 */
import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { loadBundleDir } from '@openmastery/schema/load'
import { SiteCore } from '../../src/site/core'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'curriculum')
const T = Date.UTC(2026, 0, 1)

describe('a lesson keeps its promise across a reload', () => {
  it('serves the taught skill and picture, not a re-ranked different skill', () => {
    if (!existsSync(root)) return
    const b = { skills: [] as never[], items: [] as never[], explanations: [] as never[] }
    for (const d of ['skills', 'items', 'explanations']) {
      const r = loadBundleDir(join(root, d))
      b.skills.push(...(r.bundle.skills as never[]))
      b.items.push(...(r.bundle.items as never[]))
      b.explanations.push(...(r.bundle.explanations as never[]))
    }
    const exps = new Map(b.explanations.map((e: never) => [(e as { id: string }).id, e]))
    const items = new Map(b.items.map((i: never) => [(i as { id: string }).id, i]))
    const core = new SiteCore(b as never, { now: () => T })

    // walk to the first lesson and watch it
    let taughtSkill: string | null = null
    let taughtRep: string | null = null
    for (let s = 0; s < 12; s++) {
      const a = (core.next('kid').body as { action: { kind: string; [k: string]: unknown } }).action
      if (a.kind === 'lesson' || a.kind === 'alt_explanation') {
        taughtSkill = String(a['skillId'])
        taughtRep =
          (exps.get(String(a['explanationId'])) as unknown as { representation?: string })
            .representation ?? null
        core.explanationViewed('kid')
        break
      }
      if (a.kind !== 'serve_item') break
      if (a['checkAvailable'] === true) {
        core.startCheck('kid', a['forSkillId'] as string)
        continue
      }
      core.attempt('kid', { raw: 'wrong', hintLevel: 0, latencyMs: 900 })
    }
    expect(taughtSkill).not.toBeNull()

    // reload: rebuild from the durable log, exactly as the demo does
    const revived = new SiteCore(b as never, {
      now: () => T,
      replay: (core.events('kid').body as { events: never[] }).events,
    })
    const a = (revived.next('kid').body as { action: { kind: string; [k: string]: unknown } }).action

    expect(a.kind, 'the promised problem should follow the lesson').toBe('serve_item')
    expect(a['forSkillId'], `taught ${taughtSkill}, served ${String(a['forSkillId'])}`).toBe(
      taughtSkill,
    )
    const inst = a['instance'] as { itemId: string }
    const rep = (items.get(inst.itemId) as unknown as { representation?: string }).representation
    expect(rep, `taught the ${taughtRep}, practised the ${String(rep)}`).toBe(taughtRep)
  })
})

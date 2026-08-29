// @vitest-environment node
/** "Show me how" must work AFTER a wrong answer.
 *
 * `attempt()` clears st.pending once the answer is graded, and explain()
 * read the problem's numbers from pending — so a walkthrough requested
 * after a miss either 409'd ("that problem is no longer on screen") or
 * silently fell back to the item family's authored numbers. Seeing the
 * problem you just missed worked through, with YOUR numbers, is the whole
 * point of asking.
 */
import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { loadBundleDir } from '@openmastery/schema/load'
import { SiteCore } from '../../src/site/core'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'curriculum')
type Action = { kind: string; [k: string]: unknown }

describe('show me how, after a miss', () => {
  it('replays the problem the student just answered, with its own numbers', () => {
    if (!existsSync(root)) return
    const b = { skills: [] as never[], items: [] as never[], explanations: [] as never[] }
    for (const d of ['skills', 'items', 'explanations']) {
      const r = loadBundleDir(join(root, d))
      b.skills.push(...(r.bundle.skills as never[]))
      b.items.push(...(r.bundle.items as never[]))
      b.explanations.push(...(r.bundle.explanations as never[]))
    }
    const core = new SiteCore(b as never, { now: () => Date.UTC(2026, 0, 1) })

    // reach a real problem
    let served: Action | null = null
    for (let s = 0; s < 12; s++) {
      const a = (core.next('kid').body as { action: Action }).action
      if (a.kind === 'lesson' || a.kind === 'alt_explanation') {
        core.explanationViewed('kid')
        continue
      }
      if (a.kind !== 'serve_item') break
      served = a
      break
    }
    expect(served).not.toBeNull()
    const inst = served!['instance'] as { itemId: string; paramHash: string; params: Record<string, unknown> }
    const skill = String(served!['forSkillId'])

    // get it WRONG
    const out = core.attempt('kid', { raw: 'definitely-wrong-99999', hintLevel: 0, latencyMs: 900 })
    expect((out.body as { correct: boolean }).correct).toBe(false)

    // now ask for the walkthrough, exactly as the card does — pinned to
    // the instance still on screen
    const r = core.explain('kid', { skill, forParamHash: inst.paramHash })
    expect(r.status, 'the problem the student is looking at must still resolve').toBe(200)
    const body = r.body as {
      explanation: { id: string } | null
      params: Record<string, unknown>
      sameNumbers?: boolean
    }
    expect(body.explanation, 'a walkthrough must be offered').not.toBeNull()
    // and it must use the numbers the student actually saw
    expect(body.sameNumbers).toBe(true)
    for (const [k, v] of Object.entries(inst.params)) expect(body.params[k]).toEqual(v)
  })
})

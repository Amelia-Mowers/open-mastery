// @vitest-environment node
/** "The student should never be punted without a reward."
 *
 * Reported: "if I fail a problem and it goes to the next skill, I don't get
 * a milestone." The departure milestone was gated on MASTERY PERCENT
 * (pct >= 0.12), so the student it exists for — one answering wrong, sitting
 * at pct = 0.00 on every skill, being interleaved away every few serves —
 * was the one student who could never earn it. The gate is effort now:
 * a skill with attempts on it was worked at; 'Started' is its rank.
 */
import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { loadBundleDir } from '@openmastery/schema/load'
import { SiteCore } from '../../src/site/core'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'curriculum')

type Action = { kind: string; [k: string]: unknown }
type NextBody = { action: Action; milestone?: { skillId: string; name: string } }

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

describe('departure milestones', () => {
  it('a struggling student moved off a worked skill is still recognised', () => {
    if (!existsSync(root)) return
    const b = bundle()
    const core = new SiteCore(b as never, { now: () => Date.UTC(2026, 0, 1) })

    const milestones: string[] = []
    const worked = new Set<string>()
    for (let step = 0; step < 20; step++) {
      const body = core.next('kid').body as NextBody
      if (body.milestone) milestones.push(`${body.milestone.skillId}:${body.milestone.name}`)
      const a = body.action
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
      worked.add(a['forSkillId'] as string)
      // every answer wrong — this is the punted student from the report
      core.attempt('kid', { raw: 'definitely-wrong-99999', hintLevel: 0, latencyMs: 900 })
    }

    // they were bounced across several skills, so they must have been
    // recognised for the ones they actually put work into
    expect(worked.size).toBeGreaterThanOrEqual(2)
    expect(milestones.length).toBeGreaterThan(0)
    // every milestone names a skill they genuinely worked at
    for (const m of milestones) expect([...worked]).toContain(m.split(':')[0])
    // and never the same skill+rank twice
    expect(new Set(milestones).size).toBe(milestones.length)
  })
})

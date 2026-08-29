// @vitest-environment node
/** A grade picker places the student ON their grade.
 *
 * The demo dropped every new student on the first skill in the graph —
 * grade-6 algebra — with no placement and no choice, so a parent of a
 * 9-year-old (or a 13-year-old) met the wrong material on screen one.
 * Placement marks the grades BELOW the chosen one as already known.
 * It is explicitly not mastery: no check evidence, no stone.
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

describe('grade placement', () => {
  it('offers only grades the catalog can actually teach', () => {
    if (!existsSync(root)) return
    const core = new SiteCore(bundle() as never, { now: () => T })
    // today: 6 and 7 authored. The picker must not offer an empty grade.
    expect(core.gradesAvailable()).toEqual([6, 7])
  })

  it('starts a grade-7 student on grade-7 work, not the bottom of the graph', () => {
    if (!existsSync(root)) return
    const b = bundle()
    const core = new SiteCore(b as never, { now: () => T })
    const gradeOfSkill = (id: string): number | null =>
      SiteCore.gradeOf(core.cur.skills.get(id)?.standards ?? [])

    // unplaced: the first serve is grade 6
    const cold = (core.next('cold').body as { action: { kind: string; [k: string]: unknown } }).action
    expect(gradeOfSkill(String(cold['skillId'] ?? cold['forSkillId']))).toBe(6)

    // placed at 7: the first serve is grade 7
    core.place('kid', 7)
    const a = (core.next('kid').body as { action: { kind: string; [k: string]: unknown } }).action
    expect(gradeOfSkill(String(a['skillId'] ?? a['forSkillId']))).toBe(7)
  })

  it('placement is NOT mastery: no check evidence, and it is marked as placed', () => {
    if (!existsSync(root)) return
    const core = new SiteCore(bundle() as never, { now: () => T })
    core.place('kid', 7)
    const events = (core.events('kid').body as { events: Array<{ kind: string }> }).events
    // never forges the event that asserts earned mastery
    expect(events.some((e) => e.kind === 'mastery_granted')).toBe(false)
    expect(events.some((e) => e.kind === 'placement')).toBe(true)
    const skills = (core.state('kid').body as {
      skills: Record<string, { phase: string; placed?: boolean }>
    }).skills
    const placed = Object.values(skills).filter((s) => s.placed === true)
    expect(placed.length).toBeGreaterThan(0)
    for (const s of placed) expect(s.phase).toBe('mastered')
  })

  it('never overwrites work the student has already done', () => {
    if (!existsSync(root)) return
    const b = bundle()
    const core = new SiteCore(b as never, { now: () => T })
    // do some grade-6 work first
    for (let i = 0; i < 3; i++) {
      const a = (core.next('kid').body as { action: { kind: string; [k: string]: unknown } }).action
      if (a.kind === 'lesson' || a.kind === 'alt_explanation') {
        core.explanationViewed('kid')
        continue
      }
      if (a.kind !== 'serve_item') break
      core.attempt('kid', { raw: 'wrong', hintLevel: 0, latencyMs: 900 })
    }
    const before = core.state('kid').body as { skills: Record<string, { attempts: number }> }
    const worked = Object.entries(before.skills).filter(([, v]) => v.attempts > 0)
    expect(worked.length).toBeGreaterThan(0)

    core.place('kid', 7)
    const after = (core.state('kid').body as {
      skills: Record<string, { phase: string; placed?: boolean }>
    }).skills
    // a skill they actually attempted is not silently marked known
    for (const [id] of worked) expect(after[id]?.placed).not.toBe(true)
  })
})

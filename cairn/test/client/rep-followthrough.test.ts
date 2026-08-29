// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { loadBundleDir } from '@openmastery/schema/load'
import { SiteCore } from '../../src/site/core'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'curriculum')

/** Teaching a picture and then testing a different one is the bug Mia hit:
 * "shows the tape lesson, gives a scale practice". The faded serve is
 * exempt — its lead REPLAYS the lesson's representation with the item's
 * numbers, so the picture the student sees is the one just taught
 * whatever the item's own tag says. PRACTICE serves have no such lead. */
describe('real curriculum: a taught representation is the one practised', () => {
  it('every practice item that follows a lesson is framed in that lesson', () => {
    const b = { skills: [] as never[], items: [] as never[], explanations: [] as never[] }
    for (const d of ['skills', 'items', 'explanations']) {
      const r = loadBundleDir(join(root, d))
      b.skills.push(...(r.bundle.skills as never[]))
      b.items.push(...(r.bundle.items as never[]))
      b.explanations.push(...(r.bundle.explanations as never[]))
    }
    let t = Date.UTC(2026, 0, 1)
    const core = new SiteCore(b as never, { now: () => t })
    const items = new Map(b.items.map((i: never) => [(i as { id: string }).id, i]))
    let pending: { rep: string; skill: string } | null = null
    const bad: string[] = []
    for (let step = 0; step < 120; step++) {
      const body = core.next('kid').body as { action: never; explanation?: { representation: string } }
      const a = body.action as { kind: string; skillId?: string; instance?: { itemId: string } }
      if (a.kind === 'session_done') break
      if (a.kind === 'lesson' || a.kind === 'alt_explanation') {
        pending = { rep: body.explanation!.representation, skill: a.skillId! }
        core.explanationViewed('kid')
        continue
      }
      if (a.kind !== 'serve_item') break
      if (pending && a.skillId === pending.skill && (a as { itemKind?: string }).itemKind !== 'faded') {
        const rep = (items.get(a.instance!.itemId) as { representation?: string } | undefined)?.representation
        if (rep && rep !== pending.rep) bad.push(`taught ${pending.rep} then served ${rep} (${a.instance!.itemId})`)
        pending = null
      }
      core.attempt('kid', { raw: 'nope', hintLevel: 0, latencyMs: 500 })
    }
    expect(bad, bad.join('; ')).toEqual([])
  })
  it('the faded lead replays the lesson JUST taught, not the first one ever', () => {
    const b = { skills: [] as never[], items: [] as never[], explanations: [] as never[] }
    for (const d of ['skills', 'items', 'explanations']) {
      const r = loadBundleDir(join(root, d))
      b.skills.push(...(r.bundle.skills as never[]))
      b.items.push(...(r.bundle.items as never[]))
      b.explanations.push(...(r.bundle.explanations as never[]))
    }
    let t = Date.UTC(2026, 0, 1)
    const core = new SiteCore(b as never, { now: () => t })
    let lastTaught: { rep: string; skill: string } | null = null
    const bad: string[] = []
    for (let step = 0; step < 150; step++) {
      const body = core.next('kid2').body as { action: never; explanation?: { representation: string } }
      const a = body.action as { kind: string; skillId?: string; itemKind?: string }
      if (a.kind === 'session_done') break
      if (a.kind === 'lesson' || a.kind === 'alt_explanation') {
        lastTaught = { rep: body.explanation!.representation, skill: a.skillId! }
        core.explanationViewed('kid2')
        continue
      }
      if (a.kind !== 'serve_item') break
      if (a.itemKind === 'faded' && lastTaught && a.skillId === lastTaught.skill) {
        // the client asks for the lead with sameAsLesson=true
        const lead = core.explain('kid2', { skill: a.skillId!, viewedFirst: true }).body as {
          explanation?: { representation: string }
        }
        const got = lead.explanation?.representation
        if (got && got !== lastTaught.rep)
          bad.push(`lesson ${lastTaught.rep} but faded lead ${got} (${a.skillId})`)
      }
      core.attempt('kid2', { raw: 'nope', hintLevel: 0, latencyMs: 500 })
    }
    expect(bad, bad.join('; ')).toEqual([])
    expect(bad.length).toBe(0)
  })
  it('"show me another way" during the lesson decides the practice picture', () => {
    // the chained representation must end up MOST RECENT: recency is what
    // the faded lead replays and what the practice item is matched against,
    // so completing the underlying lesson afterwards silently reinstated the
    // original picture — the student was taught one thing and drilled another
    const b = { skills: [] as never[], items: [] as never[], explanations: [] as never[] }
    for (const d of ['skills', 'items', 'explanations']) {
      const r = loadBundleDir(join(root, d))
      b.skills.push(...(r.bundle.skills as never[]))
      b.items.push(...(r.bundle.items as never[]))
      b.explanations.push(...(r.bundle.explanations as never[]))
    }
    let t = Date.UTC(2026, 0, 1)
    const core = new SiteCore(b as never, { now: () => t })
    // first serve is the skill's opening lesson
    const first = core.next('chain').body as {
      action: { kind: string; skillId?: string; explanationId?: string }
      explanation?: { representation: string }
    }
    expect(first.action.kind).toBe('lesson')
    const skill = first.action.skillId!
    const taught = first.explanation!.representation

    // the student asks for another way, and the client chains it
    const alt = core.explain('chain', { skill, exclude: [taught] }).body as {
      explanation?: { id: string; representation: string }
    }
    expect(alt.explanation, 'the skill should offer a second representation').toBeDefined()
    const chained = alt.explanation!.representation
    expect(chained).not.toBe(taught)

    // closeOverlay's order: finish the underlying lesson, THEN record the chain
    core.explanationViewed('chain')
    core.explained('chain', { explanationId: alt.explanation!.id, skillId: skill })

    // the lead the next problem replays is the CHAINED one
    const lead = core.explain('chain', { skill, viewedFirst: true }).body as {
      explanation?: { representation: string }
    }
    expect(lead.explanation?.representation, 'practice replays the picture just taught').toBe(chained)
  })
})

// @vitest-environment node
/** Intro beats are served with every lesson and flagged DUE only once:
 * the skill's beats on its first lesson, the representation's beat the
 * first time this student meets that picture in ANY skill. A chained
 * "another way" (explain) carries the same flag, since that can be the
 * first meeting too. */
import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { loadBundleDir } from '@openmastery/schema/load'
import type { Bundle, Explanation } from '@openmastery/schema'
import { SiteCore } from '../../src/site/core'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'curriculum')

function load(): Bundle {
  const b: Bundle = { skills: [], items: [], explanations: [], representations: [] }
  for (const d of ['skills', 'items', 'explanations', 'representations']) {
    const r = loadBundleDir(join(root, d))
    expect(r.errors).toEqual([])
    b.skills.push(...r.bundle.skills)
    b.items.push(...r.bundle.items)
    b.explanations.push(...r.bundle.explanations)
    b.representations!.push(...(r.bundle.representations ?? []))
  }
  return b
}

interface LessonServe {
  action: { kind: string; skillId?: string; explanationId?: string }
  explanation?: Explanation
  preamble?: { plain: string; vocab: unknown[] }
  skillName?: string
  skillShort?: string
  repIntro?: { name: string; intro: string }
  introDue?: { skill: boolean; rep: boolean }
}

describe('intro beats', () => {
  it('every representation a lesson draws in has an intro record', () => {
    if (!existsSync(root)) return
    const b = load()
    const reps = new Set(b.representations!.map((r) => r.id))
    for (const e of b.explanations) expect(reps.has(e.representation), e.representation).toBe(true)
  })

  it('skill beats are due on the first lesson only; the rep beat until the picture is met', () => {
    if (!existsSync(root)) return
    const b = load()
    const core = new SiteCore(b, { now: () => Date.UTC(2026, 0, 1) })
    const SKILL = 'g6.ee.add-solve'

    const first = core.next('kid', SKILL, true).body as LessonServe
    expect(first.action.kind).toBe('lesson')
    expect(first.preamble?.plain).toBeTruthy()
    // the child-facing name headlines the skill beat; the formal one stays
    expect(first.skillShort).toBe('Find x when something was added')
    expect(first.skillName).toMatch(/Subtraction Property of Equality/)
    expect(first.repIntro?.intro).toBeTruthy()
    expect(first.introDue).toEqual({ skill: true, rep: true })
    const rep1 = first.explanation!.representation
    core.explanationViewed('kid')

    // "another way" for the same skill: a NEW representation → rep due,
    // and the skill beats never ride an alternative explanation (the
    // client decides that; the server just reports the rep)
    const other = core.explain('kid', { skill: SKILL, exclude: [rep1] }).body as {
      explanation: Explanation | null
      repIntro?: { intro: string }
      repIntroDue?: boolean
    }
    expect(other.explanation).not.toBeNull()
    expect(other.explanation!.representation).not.toBe(rep1)
    expect(other.repIntro?.intro).toBeTruthy()
    expect(other.repIntroDue).toBe(true)
    core.explained('kid', { explanationId: other.explanation!.id, skillId: SKILL })

    // met now — the same picture asked for again is no longer due
    const again = core.explain('kid', { skill: SKILL, prefer: other.explanation!.representation })
      .body as { explanation: Explanation | null; repIntroDue?: boolean }
    expect(again.explanation!.representation).toBe(other.explanation!.representation)
    expect(again.repIntroDue).toBe(false)

    // the picture already seen in ANOTHER skill is not re-introduced,
    // while the new skill's own beats are
    const twin = core.next('kid', 'g6.ee.sub-solve', true).body as LessonServe
    expect(twin.action.kind).toBe('lesson')
    expect(twin.introDue?.skill).toBe(true)
    const seen = new Set([rep1, other.explanation!.representation])
    expect(twin.introDue?.rep).toBe(!seen.has(twin.explanation!.representation))
  })
})

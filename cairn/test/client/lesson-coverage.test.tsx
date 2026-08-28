/** Fail loudly (standing rule): every curriculum explanation must set up a
 * LIVE lesson widget under its own family params — the caption-only fallback
 * is for broken instances, never for the authored family. Catches bad tick
 * math, out-of-range setups, and missing player adapters at authoring time. */
import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { loadBundleDir } from '@openmastery/schema/load'
import { buildIndex } from '../../src/core/curriculum'
import { practiceItems } from '../../src/core/select'
import { createLessonWidget } from '../../src/client/app/LessonPlayer'
import { evalNumber, numberLineSetup } from '../../src/client/app/render'
import { WIDGET_ROLES, type WidgetType } from '../../src/client/widgets/registry'

const curriculumRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'curriculum')
const has = existsSync(join(curriculumRoot, 'skills'))

describe.skipIf(!has)('every curriculum explanation renders a live lesson', () => {
  it('no explanation falls back to caption-only under its family params', () => {
    const bundle = { skills: [] as never[], items: [] as never[], explanations: [] as never[] }
    for (const d of ['skills', 'items', 'explanations']) {
      const r = loadBundleDir(join(curriculumRoot, d))
      expect(r.errors).toEqual([])
      bundle.skills.push(...(r.bundle.skills as never[]))
      bundle.items.push(...(r.bundle.items as never[]))
      bundle.explanations.push(...(r.bundle.explanations as never[]))
    }
    const cur = buildIndex(bundle as never)
    const failures: string[] = []
    for (const e of cur.explanations.values()) {
      if (!WIDGET_ROLES[e.widget as WidgetType]?.lesson) continue
      const family = practiceItems(e.skill, cur)[0]?.params ?? {}
      const w = createLessonWidget(e, family as never)
      if (w === null) failures.push(e.id)
    }
    expect(failures, failures.join(', ')).toEqual([])
  })

  /** Building is not enough: a patch can name values the widget cannot
   * place — a number line labelled {b} whose axis is anchored at 0 shows
   * nothing at all — and the widget renders happily but blank. */
  it('number-line timelines only name values that exist on their own axis', () => {
    const bundle = { skills: [] as never[], items: [] as never[], explanations: [] as never[] }
    for (const d of ['skills', 'items', 'explanations']) {
      const r = loadBundleDir(join(curriculumRoot, d))
      bundle.skills.push(...(r.bundle.skills as never[]))
      bundle.items.push(...(r.bundle.items as never[]))
      bundle.explanations.push(...(r.bundle.explanations as never[]))
    }
    const cur = buildIndex(bundle as never)
    const bad: string[] = []
    for (const e of cur.explanations.values()) {
      if (e.widget !== 'number-line') continue
      const params = (practiceItems(e.skill, cur)[0]?.params ?? {}) as Record<string, unknown>
      const setup = numberLineSetup(e.timeline as never, params as never)
      if (!setup) continue
      const ticks = new Set<number>()
      const n = Math.round((setup.max - setup.min) / setup.step)
      for (let i = 0; i <= n; i++) ticks.add(setup.min + i * setup.step)
      const check = (v: unknown, what: string) => {
        const num = evalNumber(v, params as never)
        if (num !== null && !ticks.has(num)) bad.push(`${e.id}: ${what} ${num} is not on the axis`)
      }
      for (const st of e.timeline) {
        const p = st.patch as Record<string, unknown> | undefined
        if (!p) continue
        if (Array.isArray(p['labelled'])) for (const v of p['labelled']) check(v, 'labelled')
        if (p['marker'] != null) check(p['marker'], 'marker')
        if (Array.isArray(p['arcs']))
          for (const a of p['arcs'] as Array<Record<string, unknown>>) {
            check(a['from'], 'arc from')
            check(a['to'], 'arc to')
          }
      }
    }
    expect(bad, bad.join('; ')).toEqual([])
  })
})

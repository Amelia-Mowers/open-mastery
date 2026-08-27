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
})

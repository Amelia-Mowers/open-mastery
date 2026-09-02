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
import { feedableParams } from '../../src/site/core'
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
      // NO SILENT FALLBACK: a skill may hold several forms with disjoint
      // identifiers, so item[0]'s params may not render this board at all.
      // Use params that can actually feed it, or skip — never substitute.
      const family = feedableParams(e, practiceItems(e.skill, cur).map((it) => it.params))
      if (family === null) continue
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
      const fed = feedableParams(e, practiceItems(e.skill, cur).map((it) => it.params))
      if (fed === null) continue
      const params = fed as Record<string, unknown>
      const setup = numberLineSetup(e.timeline as never, params as never)
      if (!setup) continue
      // the axis can RESCALE mid-lesson (`axis` patch — the zoom-out
      // move); every named value checks against the axis ACTIVE at its step
      let ticks = new Set<number>()
      const setAxis = (ax: { min: number; max: number; step: number }) => {
        ticks = new Set<number>()
        const n = Math.round((ax.max - ax.min) / ax.step)
        for (let i = 0; i <= n; i++) ticks.add(ax.min + i * ax.step)
      }
      setAxis(setup)
      let range = { min: setup.min, max: setup.max }
      const check = (v: unknown, what: string) => {
        const num = evalNumber(v, params as never)
        if (num !== null && !ticks.has(num)) bad.push(`${e.id}: ${what} ${num} is not on the axis`)
      }
      // arcs are VALUE-positioned (they may land between ticks — two
      // series with different unit sizes share one line), so their
      // endpoints need only sit within the active axis range
      const checkRange = (v: unknown, what: string) => {
        const num = evalNumber(v, params as never)
        if (num !== null && (num < range.min - 1e-9 || num > range.max + 1e-9))
          bad.push(`${e.id}: ${what} ${num} is outside the axis range`)
      }
      for (const st of e.timeline) {
        const p = st.patch as Record<string, unknown> | undefined
        if (!p) continue
        if (p['axis'] != null && typeof p['axis'] === 'object') {
          const a = p['axis'] as Record<string, unknown>
          const min = evalNumber(a['min'], params as never)
          const max = evalNumber(a['max'], params as never)
          const step = evalNumber(a['step'], params as never)
          if (min === null || max === null || step === null || step <= 0 || max <= min)
            bad.push(`${e.id}: axis patch does not evaluate to a valid axis`)
          else {
            setAxis({ min, max, step })
            range = { min, max }
          }
        }
        if (Array.isArray(p['labelled'])) for (const v of p['labelled']) check(v, 'labelled')
        if (p['marker'] != null) check(p['marker'], 'marker')
        if (Array.isArray(p['arcs']))
          for (const a of p['arcs'] as Array<Record<string, unknown>>) {
            checkRange(a['from'], 'arc from')
            checkRange(a['to'], 'arc to')
          }
        const jraw = p['jumps'] as Record<string, unknown> | Array<Record<string, unknown>> | null | undefined
        if (jraw != null && typeof jraw === 'object') {
          for (const j of Array.isArray(jraw) ? jraw : [jraw]) {
            const size = evalNumber(j['size'], params as never)
            const count = evalNumber(j['count'], params as never)
            const start = j['from'] === undefined ? 0 : evalNumber(j['from'], params as never)
            if (size !== null && count !== null && start !== null)
              for (let i = 0; i <= count; i++) checkRange(start + i * size, `jump point ${i}`)
          }
        }
      }
    }
    expect(bad, bad.join('; ')).toEqual([])
  })
})

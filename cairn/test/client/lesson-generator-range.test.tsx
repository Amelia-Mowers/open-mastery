// @vitest-environment jsdom
/** lesson-coverage proves every explanation builds under its FAMILY
 * params. Students see GENERATED params, and a widget setup guard
 * (envelope counts, tape cells, axis ranges) can reject those — which
 * used to render an invisible diagram under gates asking about it.
 *
 * NO SILENT FALLBACK: a timeline that cannot draw some of its own
 * generator's range is a curriculum fault and must fail here.
 */
import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { loadBundleDir } from '@openmastery/schema/load'
import { buildIndex } from '../../src/core/curriculum'
import { instantiate, practiceItems } from '../../src/core/select'
import { feedableParams } from '../../src/site/core'
import { createLessonWidget } from '../../src/client/app/LessonPlayer'
import type { Params } from '../../src/client/app/render'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'curriculum')
const has = existsSync(root)

describe.skipIf(!has)('lesson widgets build across the generator range', () => {
  it('every explanation draws for many generated instances, not just its family params', () => {
    const bundle = { skills: [] as never[], items: [] as never[], explanations: [] as never[] }
    for (const d of ['skills', 'items', 'explanations']) {
      const r = loadBundleDir(join(root, d))
      bundle.skills.push(...(r.bundle.skills as never[]))
      bundle.items.push(...(r.bundle.items as never[]))
      bundle.explanations.push(...(r.bundle.explanations as never[]))
    }
    const cur = buildIndex(bundle as never)
    const failures: string[] = []

    for (const e of cur.explanations.values()) {
      const items = practiceItems(e.skill, cur)
      for (let seed = 0; seed < 12; seed++) {
        // an instance's params, as a student would actually meet them
        const inst = items
          .map((it) => instantiate(it, new Set(), 1000 + seed * 37, 6))
          .filter((i) => i !== null)
        const fed = feedableParams(e, inst.map((i) => i!.params))
        if (fed === null) continue // a different form — cannot feed this board
        let built = false
        try {
          built = createLessonWidget(e, fed as Params) !== null
        } catch (err) {
          failures.push(`${e.id} threw on ${JSON.stringify(fed)}: ${String(err)}`)
          continue
        }
        if (!built) failures.push(`${e.id} could not draw ${JSON.stringify(fed)}`)
      }
    }
    expect(failures.slice(0, 8)).toEqual([])
  })
})

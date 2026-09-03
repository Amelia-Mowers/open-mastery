// @vitest-environment node
/** The first practice serve after a lesson is the lesson's OWN problem —
 * same numbers, answer just spoken aloud. A correct there is following
 * along, not independent evidence (Mia, from the 2026-09-02 external
 * eval: "keep the same-numbers serve but withhold the 'all on your own'
 * credit"). The serve carries lessonEcho and the attempt records at the
 * hint-level-1 discount, exactly like rubric/choice grading. */
import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { loadBundleDir } from '@openmastery/schema/load'
import { gradeItem } from '../../src/core/graders'
import type { Env } from '@openmastery/schema'
import { SiteCore } from '../../src/site/core'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'curriculum')
const T = Date.UTC(2026, 0, 1)

describe('lesson-echo serves withhold unassisted credit', () => {
  it('marks the promised serve and floors the attempt to assisted evidence', () => {
    if (!existsSync(root)) return
    const b = { skills: [] as never[], items: [] as never[], explanations: [] as never[] }
    for (const d of ['skills', 'items', 'explanations']) {
      const r = loadBundleDir(join(root, d))
      b.skills.push(...(r.bundle.skills as never[]))
      b.items.push(...(r.bundle.items as never[]))
      b.explanations.push(...(r.bundle.explanations as never[]))
    }
    const items = new Map(b.items.map((i: never) => [(i as { id: string }).id, i]))
    const core = new SiteCore(b as never, { now: () => T })

    // fresh student: first action is the lesson, second is its own problem
    const first = (core.next('kid').body as { action: Record<string, unknown> }).action
    expect(first['kind']).toBe('lesson')
    core.explanationViewed('kid')
    const serve = (core.next('kid').body as { action: Record<string, unknown> }).action
    expect(serve['kind']).toBe('serve_item')
    expect(serve['lessonEcho']).toBe(true)

    // answer it correctly with NO help — the echo discount must apply anyway
    const inst = serve['instance'] as { itemId: string; params: Record<string, unknown> }
    const item = items.get(inst.itemId) as unknown as Parameters<typeof gradeItem>[0]
    // derive the correct answer from the item's own answer template
    const res = core.attempt('kid', {
      raw: String(
        (() => {
          // grade candidate integers until one is correct — small search
          // keeps this test independent of any answer-template evaluator
          for (let v = -100; v <= 100; v++)
            if (gradeItem(item, inst.params as Env, String(v)).verdict === 'correct') return v
          throw new Error('no integer answer found for the echo item')
        })(),
      ),
      hintLevel: 0,
      latencyMs: 1500,
    })
    const body = res.body as { correct: boolean }
    expect(body.correct).toBe(true)
    const attempt = (core.events('kid').body as { events: Array<Record<string, unknown>> }).events
      .filter((e) => e['kind'] === 'attempt')
      .pop()!
    // the durable evidence is DISCOUNTED: hintLevel floored to 1 even
    // though the student asked for nothing
    expect(attempt['hintLevel']).toBe(1)

    // and the NEXT practice serve (a fresh isomorph) is not an echo
    const serve2 = (core.next('kid').body as { action: Record<string, unknown> }).action
    if (serve2['kind'] === 'serve_item') expect(serve2['lessonEcho']).not.toBe(true)
  })
})

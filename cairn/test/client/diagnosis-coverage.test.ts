// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { loadBundleDir } from '@openmastery/schema/load'
import { renderTemplate } from '@openmastery/schema'
import { diagnose } from '../../src/core/graders'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'curriculum')

describe('every authored misconception fires on its own wrong answer', () => {
  it('renders and matches under the item family params', () => {
    const r = loadBundleDir(join(root, 'items'))
    expect(r.errors).toEqual([])
    let checked = 0
    const dead: string[] = []
    for (const it of r.bundle.items) {
      for (const m of it.misconceptions ?? []) {
        // feed the misconception's own rendered value back in: it must be
        // recognised, or the diagnosis is decorative
        const rendered = renderTemplate(m.when, it.params, { numberStyle: 'fraction' })
        if (!rendered.ok) { dead.push(`${it.id}/${m.id}: template`); continue }
        const hit = diagnose(it.misconceptions, it.params as never, rendered.value)
        if (hit?.id !== m.id) dead.push(`${it.id}/${m.id} -> ${hit?.id ?? 'no match'}`)
        checked++
      }
    }
    expect(dead, dead.join('; ')).toEqual([])
    // the whole catalog is diagnosed; keep the floor honest
    expect(checked).toBeGreaterThanOrEqual(70)
  })
})

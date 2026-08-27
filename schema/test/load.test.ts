import { describe, it, expect } from 'vitest'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { loadBundleDir, classify } from '../src/curriculum/load.ts'
import { validateBundle } from '../src/curriculum/bundle.ts'

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'curriculum')

describe('bundle loading from a curriculum directory', () => {
  it('loads the hand-authored YAML fixture with no errors and passes release gates', () => {
    const { bundle, errors } = loadBundleDir(fixtureDir)
    expect(errors).toEqual([])
    expect(bundle.skills).toHaveLength(1)
    expect(bundle.items).toHaveLength(2)
    expect(bundle.explanations).toHaveLength(2)
    const advisory = new Set(['representation_count', 'worked_missing', 'missing_banner', 'no_expects'])
    expect(validateBundle(bundle, { profile: 'release' }).filter((i) => !advisory.has(i.code))).toEqual([])
  })

  it('normalizes YAML quirks on the way in (bare dates, numeric exercise)', () => {
    const { bundle } = loadBundleDir(fixtureDir)
    const item = bundle.items.find((i) => i.id === 'alg1.linear.solve-one-step.007')!
    expect(item.review.date).toBe('2026-08-24') // authored as a bare YAML date
    expect(item.source?.exercise).toBe('41') // authored as an unquoted number
  })

  it('classifies records by shape, not directory', () => {
    expect(classify({ timeline: [] })).toBe('explanation')
    expect(classify({ widget: {}, answer: {} })).toBe('item')
    expect(classify({ instruction: [] })).toBe('skill')
    expect(classify({ something: 'else' })).toBeNull()
  })
})

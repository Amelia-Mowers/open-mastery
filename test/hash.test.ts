import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { paramHash, stableStringify } from '../src/hash.ts'

describe('paramHash', () => {
  it('is key-order independent', () => {
    expect(paramHash({ a: 7, b: 21, variable: 'x' })).toBe(
      paramHash({ variable: 'x', b: 21, a: 7 }),
    )
  })
  it('distinguishes different params', () => {
    expect(paramHash({ a: 7, b: 21 })).not.toBe(paramHash({ a: 7, b: 28 }))
  })
  it('stableStringify sorts keys recursively', () => {
    expect(stableStringify({ b: { d: 1, c: 2 }, a: [1, 2] })).toBe(
      '{"a":[1,2],"b":{"c":2,"d":1}}',
    )
  })
  it('is 16 lowercase hex chars for arbitrary params', () => {
    fc.assert(
      fc.property(
        fc.dictionary(fc.string(), fc.oneof(fc.integer(), fc.string(), fc.boolean())),
        (params) => {
          expect(paramHash(params)).toMatch(/^[0-9a-f]{16}$/)
        },
      ),
    )
  })
})

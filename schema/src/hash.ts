/** Canonical param hashing, shared so "same item" = (itemId, paramHash) means
 * the same thing in client, core, and pipeline. */

export function stableStringify(x: unknown): string {
  if (x === null || typeof x !== 'object') return JSON.stringify(x)
  if (Array.isArray(x)) return '[' + x.map(stableStringify).join(',') + ']'
  const keys = Object.keys(x as Record<string, unknown>).sort()
  return (
    '{' +
    keys
      .map((k) => JSON.stringify(k) + ':' + stableStringify((x as Record<string, unknown>)[k]))
      .join(',') +
    '}'
  )
}

/** FNV-1a 64-bit over the canonical serialization, as 16 hex chars. */
export function paramHash(params: Record<string, unknown>): string {
  const s = stableStringify(params)
  let h = 0xcbf29ce484222325n
  const prime = 0x100000001b3n
  const mask = 0xffffffffffffffffn
  for (let i = 0; i < s.length; i++) {
    h ^= BigInt(s.charCodeAt(i))
    h = (h * prime) & mask
  }
  return h.toString(16).padStart(16, '0')
}

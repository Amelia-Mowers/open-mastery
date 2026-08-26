/** Normalize a freshly-loaded YAML/JSON document into the JSON-pure shape the
 * schemas expect. YAML parses bare dates (`date: 2026-08-24`) into Date
 * objects and unquoted section/exercise values (`exercise: 41`) into numbers;
 * the published JSON Schema wants ISO date strings and strings there. Only
 * `source.{section,exercise}` is coerced — params and everything else pass
 * through untouched. */
export function normalizeLoadedDoc<T>(doc: T): T {
  return walk(doc, false) as T
}

function walk(x: unknown, inSource: boolean): unknown {
  if (x instanceof Date) return x.toISOString().slice(0, 10)
  if (Array.isArray(x)) return x.map((v) => walk(v, false))
  if (x !== null && typeof x === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(x)) {
      if (inSource && (k === 'section' || k === 'exercise') && typeof v === 'number') {
        out[k] = String(v)
      } else {
        out[k] = walk(v, k === 'source')
      }
    }
    return out
  }
  return x
}

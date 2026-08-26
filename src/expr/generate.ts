import { type Result, ok, err } from '../result.ts'

/** Generator constraint spec (§4.3a): int, range, mult_of, coprime, distinct.
 * All generated values are integers in v1; non-integers arise only through
 * expressions over them (e.g. `{b/a}`). */
export interface ParamConstraint {
  /** integer in [lo, hi] */
  int?: [number, number]
  /** integer in [lo, hi] (used when the domain comes from another constraint, e.g. mult_of) */
  range?: [number, number]
  /** multiple of another param */
  mult_of?: string
  /** coprime with another param */
  coprime?: string
  /** distinct from the listed params */
  distinct?: string | string[]
}

export type GeneratorSpec = Record<string, ParamConstraint>

const gcd = (a: number, b: number): number => {
  a = Math.abs(a)
  b = Math.abs(b)
  while (b !== 0) [a, b] = [b, a % b]
  return a
}

/** Deterministic PRNG (mulberry32) so isomorph generation replays exactly. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const refsOf = (c: ParamConstraint): string[] => {
  const out: string[] = []
  if (c.mult_of) out.push(c.mult_of)
  if (c.coprime) out.push(c.coprime)
  if (c.distinct) out.push(...(Array.isArray(c.distinct) ? c.distinct : [c.distinct]))
  return out
}

/** Order generated params so every reference points to a fixed param or an
 * earlier generated one. Returns a cycle error when impossible. */
export function generationOrder(
  spec: GeneratorSpec,
  fixed: ReadonlySet<string>,
): Result<string[]> {
  const names = Object.keys(spec)
  const placed = new Set<string>()
  const order: string[] = []
  while (order.length < names.length) {
    const next = names.find(
      (n) =>
        !placed.has(n) &&
        refsOf(spec[n]!).every((r) => fixed.has(r) || placed.has(r)),
    )
    if (!next) {
      const stuck = names.filter((n) => !placed.has(n))
      const missing = stuck
        .flatMap((n) => refsOf(spec[n]!))
        .filter((r) => !fixed.has(r) && !names.includes(r))
      if (missing.length > 0)
        return err('bad_constraint', `constraint references unknown param '${missing[0]}'`)
      return err('cycle', `circular constraints among: ${stuck.join(', ')}`)
    }
    placed.add(next)
    order.push(next)
  }
  return ok(order)
}

/** Sample one assignment satisfying the spec. Deterministic per (spec, fixed,
 * seed). Total: unsatisfiable constraints come back as an error value. */
export function generateParams(
  spec: GeneratorSpec,
  fixed: Record<string, number | string>,
  seed: number,
): Result<Record<string, number | string>> {
  const orderR = generationOrder(spec, new Set(Object.keys(fixed)))
  if (!orderR.ok) return orderR
  const rng = mulberry32(seed)
  const out: Record<string, number | string> = { ...fixed }

  for (const name of orderR.value) {
    const c = spec[name]!
    const resolve = (ref: string): Result<number> => {
      const v = out[ref]
      if (typeof v !== 'number' || !Number.isInteger(v))
        return err('bad_constraint', `constraint on '${name}' references non-integer param '${ref}'`)
      return ok(v)
    }

    let candidates: number[]
    const interval = c.int ?? c.range
    if (c.mult_of !== undefined) {
      const baseR = resolve(c.mult_of)
      if (!baseR.ok) return baseR
      const base = baseR.value
      if (base === 0) return err('bad_constraint', `'${name}': mult_of a zero param`)
      if (!interval)
        return err('bad_constraint', `'${name}': mult_of requires an int or range bound`)
      const [lo, hi] = interval
      candidates = []
      const step = Math.abs(base)
      for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) candidates.push(v)
    } else if (interval) {
      const [lo, hi] = interval
      candidates = []
      for (let v = Math.ceil(lo); v <= hi; v++) candidates.push(v)
    } else {
      return err('bad_constraint', `'${name}': no int/range domain`)
    }

    if (c.coprime !== undefined) {
      const otherR = resolve(c.coprime)
      if (!otherR.ok) return otherR
      const other = otherR.value
      candidates = candidates.filter((v) => gcd(v, other) === 1)
    }
    if (c.distinct !== undefined) {
      const list = Array.isArray(c.distinct) ? c.distinct : [c.distinct]
      for (const ref of list) {
        const otherR = resolve(ref)
        if (!otherR.ok) return otherR
        candidates = candidates.filter((v) => v !== otherR.value)
      }
    }

    if (candidates.length === 0)
      return err('unsatisfiable', `no value satisfies the constraints on '${name}'`)
    out[name] = candidates[Math.floor(rng() * candidates.length)]!
  }
  return ok(out)
}

/** Exact rational arithmetic over bigints. Invariant: d > 0 and gcd(|n|, d) === 1. */
export interface Rational {
  readonly n: bigint
  readonly d: bigint
}

const babs = (x: bigint): bigint => (x < 0n ? -x : x)

export function bgcd(a: bigint, b: bigint): bigint {
  a = babs(a)
  b = babs(b)
  while (b !== 0n) {
    const t = a % b
    a = b
    b = t
  }
  return a
}

/** Construct a reduced rational. Returns null when d === 0. */
export function rat(n: bigint | number, d: bigint | number = 1n): Rational | null {
  let nn = typeof n === 'number' ? BigInt(n) : n
  let dd = typeof d === 'number' ? BigInt(d) : d
  if (dd === 0n) return null
  if (dd < 0n) {
    nn = -nn
    dd = -dd
  }
  const g = bgcd(nn, dd)
  return g === 0n ? { n: 0n, d: 1n } : { n: nn / g, d: dd / g }
}

export const ZERO: Rational = { n: 0n, d: 1n }
export const ONE: Rational = { n: 1n, d: 1n }

/** Parse a plain decimal literal ("42", "-3.25"). Returns null on anything else. */
export function fromDecimalString(s: string): Rational | null {
  const m = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(s.trim())
  if (!m) return null
  const sign = m[1] === '-' ? -1n : 1n
  const whole = BigInt(m[2]!)
  const frac = m[3] ?? ''
  const scale = 10n ** BigInt(frac.length)
  const n = sign * (whole * scale + (frac === '' ? 0n : BigInt(frac)))
  return rat(n, scale)!
}

/** Convert a JS number to an exact rational. Integers directly; finite
 * non-integers via their shortest decimal string. Returns null for
 * NaN/Infinity or numbers whose string form is exponential. */
export function fromNumber(x: number): Rational | null {
  if (!Number.isFinite(x)) return null
  if (Number.isInteger(x)) return rat(BigInt(x))
  return fromDecimalString(String(x))
}

export const add = (a: Rational, b: Rational): Rational => rat(a.n * b.d + b.n * a.d, a.d * b.d)!
export const sub = (a: Rational, b: Rational): Rational => rat(a.n * b.d - b.n * a.d, a.d * b.d)!
export const mul = (a: Rational, b: Rational): Rational => rat(a.n * b.n, a.d * b.d)!
/** Returns null when dividing by zero. */
export const div = (a: Rational, b: Rational): Rational | null =>
  b.n === 0n ? null : rat(a.n * b.d, a.d * b.n)
export const neg = (a: Rational): Rational => ({ n: -a.n, d: a.d })
export const abs = (a: Rational): Rational => ({ n: babs(a.n), d: a.d })

export const cmp = (a: Rational, b: Rational): -1 | 0 | 1 => {
  const l = a.n * b.d
  const r = b.n * a.d
  return l < r ? -1 : l > r ? 1 : 0
}
export const eq = (a: Rational, b: Rational): boolean => a.n === b.n && a.d === b.d
export const isInt = (a: Rational): boolean => a.d === 1n

/** Round to nearest integer, halves away from zero. */
export function roundHalfAway(a: Rational): bigint {
  const q = babs(a.n) / a.d
  const rem = babs(a.n) % a.d
  const roundedAbs = 2n * rem >= a.d ? q + 1n : q
  return a.n < 0n ? -roundedAbs : roundedAbs
}

export const toFractionString = (a: Rational): string =>
  a.d === 1n ? a.n.toString() : `${a.n.toString()}/${a.d.toString()}`

/** Decimal rendering: exact when the expansion terminates within maxPlaces,
 * otherwise rounded (half away from zero) to maxPlaces; trailing zeros trimmed. */
export function toDecimalString(a: Rational, maxPlaces = 6): string {
  const sign = a.n < 0n ? '-' : ''
  const an = babs(a.n)
  const whole = an / a.d
  let rem = an % a.d
  if (rem === 0n) return sign + whole.toString()
  let digits = ''
  for (let i = 0; i < maxPlaces && rem !== 0n; i++) {
    rem *= 10n
    digits += (rem / a.d).toString()
    rem %= a.d
  }
  // round the last kept digit if the truncated remainder is >= half
  let wholeOut = whole
  if (rem !== 0n && 2n * rem >= a.d) {
    let carry = 1n
    let out = ''
    for (let i = digits.length - 1; i >= 0; i--) {
      const v = BigInt(digits[i]!) + carry
      out = (v % 10n).toString() + out
      carry = v / 10n
    }
    digits = out
    if (carry > 0n) wholeOut = whole + carry
  }
  digits = digits.replace(/0+$/, '')
  return digits === '' ? sign + wholeOut.toString() : sign + wholeOut.toString() + '.' + digits
}

import type { Expr } from './ast.ts'
import {
  type Rational,
  add,
  sub,
  mul,
  div,
  neg,
  abs,
  cmp,
  eq,
  isInt,
  rat,
  roundHalfAway,
  fromNumber,
  bgcd,
} from './rational.ts'
import { type Result, ok, err } from '../result.ts'

export type Value =
  | { t: 'num'; v: Rational }
  | { t: 'str'; v: string }
  | { t: 'bool'; v: boolean }

/** Host-facing parameter environment. Numbers are converted to exact
 * rationals; strings stay strings (e.g. `variable: x`). */
export type Env = Record<string, number | string | boolean | Rational>

const isRational = (x: unknown): x is Rational =>
  typeof x === 'object' && x !== null && 'n' in x && 'd' in x

function toValue(name: string, raw: Env[string]): Result<Value> {
  if (typeof raw === 'string') return ok({ t: 'str', v: raw })
  if (typeof raw === 'boolean') return ok({ t: 'bool', v: raw })
  if (isRational(raw)) return ok({ t: 'num', v: raw })
  const r = fromNumber(raw)
  if (!r) return err('type_error', `param '${name}' is not a finite decimal number`)
  return ok({ t: 'num', v: r })
}

const num = (v: Rational): Value => ({ t: 'num', v })
const bool = (v: boolean): Value => ({ t: 'bool', v })

function wantNum(v: Value, what: string): Result<Rational> {
  if (v.t !== 'num') return err('type_error', `${what} requires a number, got ${v.t}`)
  return ok(v.v)
}

/** Evaluate an expression against an environment. Total: never throws. */
export function evaluate(e: Expr, env: Env): Result<Value> {
  switch (e.k) {
    case 'num':
      return ok(num(e.v))
    case 'var': {
      if (!(e.name in env)) return err('unknown_var', `unknown param '${e.name}'`)
      return toValue(e.name, env[e.name]!)
    }
    case 'neg': {
      const r = evaluate(e.e, env)
      if (!r.ok) return r
      const n = wantNum(r.value, 'unary -')
      if (!n.ok) return n
      return ok(num(neg(n.value)))
    }
    case 'bin': {
      const lr = evaluate(e.l, env)
      if (!lr.ok) return lr
      const rr = evaluate(e.r, env)
      if (!rr.ok) return rr
      const l = wantNum(lr.value, `'${e.op}'`)
      if (!l.ok) return l
      const r = wantNum(rr.value, `'${e.op}'`)
      if (!r.ok) return r
      switch (e.op) {
        case '+':
          return ok(num(add(l.value, r.value)))
        case '-':
          return ok(num(sub(l.value, r.value)))
        case '*':
          return ok(num(mul(l.value, r.value)))
        case '/': {
          const q = div(l.value, r.value)
          if (!q) return err('div_zero', 'division by zero')
          return ok(num(q))
        }
      }
      break
    }
    case 'cmp': {
      const lr = evaluate(e.l, env)
      if (!lr.ok) return lr
      const rr = evaluate(e.r, env)
      if (!rr.ok) return rr
      const l = lr.value
      const r = rr.value
      if (e.op === '==' || e.op === '!=') {
        if (l.t !== r.t) return err('type_error', `'${e.op}' requires operands of the same type`)
        const same =
          l.t === 'num' ? eq(l.v, (r as { t: 'num'; v: Rational }).v) : l.v === r.v
        return ok(bool(e.op === '==' ? same : !same))
      }
      const ln = wantNum(l, `'${e.op}'`)
      if (!ln.ok) return ln
      const rn = wantNum(r, `'${e.op}'`)
      if (!rn.ok) return rn
      const c = cmp(ln.value, rn.value)
      switch (e.op) {
        case '<':
          return ok(bool(c < 0))
        case '<=':
          return ok(bool(c <= 0))
        case '>':
          return ok(bool(c > 0))
        case '>=':
          return ok(bool(c >= 0))
      }
      break
    }
    case 'call': {
      const args: Value[] = []
      for (const a of e.args) {
        const r = evaluate(a, env)
        if (!r.ok) return r
        args.push(r.value)
      }
      return callFn(e.fn, args)
    }
  }
  return err('syntax', 'unreachable')
}

function callFn(fn: string, args: Value[]): Result<Value> {
  const nums = (want: string): Result<Rational[]> => {
    const out: Rational[] = []
    for (const a of args) {
      const n = wantNum(a, want)
      if (!n.ok) return { ok: false, error: n.error }
      out.push(n.value)
    }
    return ok(out)
  }
  switch (fn) {
    case 'frac': {
      if (args.length !== 2) return err('arity', 'frac(n, d) takes 2 arguments')
      const ns = nums('frac')
      if (!ns.ok) return ns
      const [a, b] = ns.value
      if (!isInt(a!) || !isInt(b!)) return err('not_integer', 'frac() requires integers')
      const r = rat(a!.n, b!.n)
      if (!r) return err('div_zero', 'frac() with zero denominator')
      return ok(num(r))
    }
    case 'gcd': {
      if (args.length !== 2) return err('arity', 'gcd(a, b) takes 2 arguments')
      const ns = nums('gcd')
      if (!ns.ok) return ns
      const [a, b] = ns.value
      if (!isInt(a!) || !isInt(b!)) return err('not_integer', 'gcd() requires integers')
      return ok(num(rat(bgcd(a!.n, b!.n))!))
    }
    case 'round': {
      if (args.length !== 1) return err('arity', 'round(x) takes 1 argument')
      const ns = nums('round')
      if (!ns.ok) return ns
      return ok(num(rat(roundHalfAway(ns.value[0]!))!))
    }
    case 'abs': {
      if (args.length !== 1) return err('arity', 'abs(x) takes 1 argument')
      const ns = nums('abs')
      if (!ns.ok) return ns
      return ok(num(abs(ns.value[0]!)))
    }
    case 'min':
    case 'max': {
      if (args.length < 1) return err('arity', `${fn}() takes at least 1 argument`)
      const ns = nums(fn)
      if (!ns.ok) return ns
      let best = ns.value[0]!
      for (const x of ns.value.slice(1)) {
        const c = cmp(x, best)
        if (fn === 'min' ? c < 0 : c > 0) best = x
      }
      return ok(num(best))
    }
    default:
      return err('unknown_fn', `unknown function '${fn}'`)
  }
}

import type { Expr } from './ast.ts'
import { parseExpr } from './parse.ts'
import { evaluate, type Env, type Value } from './eval.ts'
import { type Rational, cmp, ZERO, abs, isInt, toFractionString, toDecimalString } from './rational.ts'
import { type Result, ok, err } from '../result.ts'

export type Segment =
  | { kind: 'text'; text: string }
  | { kind: 'expr'; src: string; expr: Expr }

/** Parse a template string: literal text with `{expr}` holes. Unmatched or
 * empty braces are syntax errors. */
export function parseTemplate(s: string): Result<Segment[]> {
  const segs: Segment[] = []
  let i = 0
  let text = ''
  while (i < s.length) {
    const c = s[i]!
    if (c === '}') return err('syntax', "unmatched '}'", i)
    if (c !== '{') {
      text += c
      i++
      continue
    }
    const close = s.indexOf('}', i)
    if (close === -1) return err('syntax', "unmatched '{'", i)
    const src = s.slice(i + 1, close)
    if (src.trim() === '') return err('syntax', 'empty template hole', i)
    const e = parseExpr(src)
    if (!e.ok) return err('syntax', `in '{${src}}': ${e.error.message}`, i)
    if (text !== '') {
      segs.push({ kind: 'text', text })
      text = ''
    }
    segs.push({ kind: 'expr', src, expr: e.value })
    i = close + 1
  }
  if (text !== '') segs.push({ kind: 'text', text })
  return ok(segs)
}

/** All identifiers referenced by a template (for validator cross-checks). */
export function templateIdentifiers(segs: Segment[]): Set<string> {
  const out = new Set<string>()
  const walk = (e: Expr): void => {
    switch (e.k) {
      case 'var':
        out.add(e.name)
        break
      case 'neg':
        walk(e.e)
        break
      case 'bin':
      case 'cmp':
        walk(e.l)
        walk(e.r)
        break
      case 'call':
        e.args.forEach(walk)
        break
      case 'num':
        break
    }
  }
  for (const s of segs) if (s.kind === 'expr') walk(s.expr)
  return out
}

export interface RenderOptions {
  /** How non-integer rationals display; the per-item flag from the schema. */
  numberStyle?: 'fraction' | 'decimal'
  maxDecimalPlaces?: number
}

export function renderValue(v: Value, opts: RenderOptions = {}): string {
  switch (v.t) {
    case 'str':
      return v.v
    case 'bool':
      return v.v ? 'true' : 'false'
    case 'num':
      return renderNumber(v.v, opts)
  }
}

function renderNumber(r: Rational, opts: RenderOptions): string {
  if (isInt(r)) return r.n.toString()
  return (opts.numberStyle ?? 'fraction') === 'fraction'
    ? toFractionString(r)
    : toDecimalString(r, opts.maxDecimalPlaces ?? 6)
}

interface Piece {
  kind: 'text' | 'expr'
  out: string
  value?: Value
}

/** Render a template against an environment, applying the §4.3a display rules:
 *  1. coefficient-1: a numeric hole rendering "1"/"-1" immediately followed by
 *     a letter drops the digit ("1x" → "x", "-1x" → "-x");
 *  2. sign normalization: literal "+ " followed by a negative value becomes
 *     "- " with the absolute value (and "- " followed by negative becomes "+ ");
 *  3. fraction vs decimal display via RenderOptions.
 *  Total: any evaluation error is returned, never thrown. */
export function renderTemplate(
  template: string | Segment[],
  env: Env,
  opts: RenderOptions = {},
): Result<string> {
  let segs: Segment[]
  if (typeof template === 'string') {
    const p = parseTemplate(template)
    if (!p.ok) return p
    segs = p.value
  } else {
    segs = template
  }

  const pieces: Piece[] = []
  for (const s of segs) {
    if (s.kind === 'text') {
      pieces.push({ kind: 'text', out: s.text })
    } else {
      const v = evaluate(s.expr, env)
      if (!v.ok) return err(v.error.code, `in '{${s.src}}': ${v.error.message}`)
      pieces.push({ kind: 'expr', out: renderValue(v.value, opts), value: v.value })
    }
  }

  // rule 2: sign normalization across a text/expr boundary
  for (let i = 0; i < pieces.length - 1; i++) {
    const t = pieces[i]!
    const e = pieces[i + 1]!
    if (t.kind !== 'text' || e.kind !== 'expr' || !e.value || e.value.t !== 'num') continue
    const m = /([+-])(\s*)$/.exec(t.out)
    if (!m) continue
    if (cmp(e.value.v, ZERO) < 0) {
      const flipped = m[1] === '+' ? '-' : '+'
      t.out = t.out.slice(0, m.index) + flipped + m[2]
      const absV = abs(e.value.v)
      e.value = { t: 'num', v: absV }
      e.out = renderNumber(absV, opts)
    }
  }

  // rule 1: coefficient-1 before an alphabetic continuation
  for (let i = 0; i < pieces.length - 1; i++) {
    const c = pieces[i]!
    const nxt = pieces[i + 1]!
    if (c.kind !== 'expr' || !c.value || c.value.t !== 'num') continue
    if (!/^[A-Za-z]/.test(nxt.out)) continue
    if (c.out === '1') c.out = ''
    else if (c.out === '-1') c.out = '-'
  }

  return ok(pieces.map((p) => p.out).join(''))
}

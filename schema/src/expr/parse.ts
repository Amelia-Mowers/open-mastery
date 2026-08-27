import type { Expr, BinOp, CmpOp } from './ast.ts'
import { fromDecimalString } from './rational.ts'
import { type Result, ok, err } from '../result.ts'

interface Tok {
  kind: 'num' | 'ident' | 'op' | 'lparen' | 'rparen' | 'comma' | 'eof'
  text: string
  pos: number
}

const CMP_OPS: ReadonlySet<string> = new Set(['==', '!=', '<', '<=', '>', '>='])

function tokenize(src: string): Result<Tok[]> {
  const toks: Tok[] = []
  let i = 0
  while (i < src.length) {
    const c = src[i]!
    if (/\s/.test(c)) {
      i++
      continue
    }
    if (/[0-9]/.test(c)) {
      const m = /^\d+(\.\d+)?/.exec(src.slice(i))!
      toks.push({ kind: 'num', text: m[0], pos: i })
      i += m[0].length
      continue
    }
    if (/[A-Za-z_]/.test(c)) {
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i))!
      toks.push({ kind: 'ident', text: m[0], pos: i })
      i += m[0].length
      continue
    }
    const two = src.slice(i, i + 2)
    if (CMP_OPS.has(two)) {
      toks.push({ kind: 'op', text: two, pos: i })
      i += 2
      continue
    }
    if ('+-*/'.includes(c) || CMP_OPS.has(c)) {
      toks.push({ kind: 'op', text: c, pos: i })
      i++
      continue
    }
    if (c === '(') {
      toks.push({ kind: 'lparen', text: c, pos: i })
      i++
      continue
    }
    if (c === ')') {
      toks.push({ kind: 'rparen', text: c, pos: i })
      i++
      continue
    }
    if (c === ',') {
      toks.push({ kind: 'comma', text: c, pos: i })
      i++
      continue
    }
    return err('syntax', `unexpected character '${c}'`, i)
  }
  toks.push({ kind: 'eof', text: '', pos: src.length })
  return ok(toks)
}

/** Parse a cairn-expr expression. Grammar (comparison is non-associative):
 *   expr    := additive (CMPOP additive)?
 *   additive:= mult (('+'|'-') mult)*
 *   mult    := unary (('*'|'/') unary)*
 *   unary   := '-' unary | primary
 *   primary := NUM | IDENT | IDENT '(' args ')' | '(' expr ')'
 */
export function parseExpr(src: string): Result<Expr> {
  const tr = tokenize(src)
  if (!tr.ok) return tr
  const toks = tr.value
  let p = 0
  const peek = () => toks[p]!
  const next = () => toks[p++]!

  function primary(): Result<Expr> {
    const t = next()
    if (t.kind === 'num') {
      const v = fromDecimalString(t.text)
      if (!v) return err('syntax', `bad number '${t.text}'`, t.pos)
      return ok({ k: 'num', v })
    }
    if (t.kind === 'ident') {
      if (peek().kind === 'lparen') {
        next() // (
        const args: Expr[] = []
        if (peek().kind !== 'rparen') {
          for (;;) {
            const a = expr()
            if (!a.ok) return a
            args.push(a.value)
            if (peek().kind === 'comma') {
              next()
              continue
            }
            break
          }
        }
        const close = next()
        if (close.kind !== 'rparen') return err('syntax', `expected ')'`, close.pos)
        return ok({ k: 'call', fn: t.text, args })
      }
      return ok({ k: 'var', name: t.text })
    }
    if (t.kind === 'lparen') {
      const e = expr()
      if (!e.ok) return e
      const close = next()
      if (close.kind !== 'rparen') return err('syntax', `expected ')'`, close.pos)
      return e
    }
    return err('syntax', `unexpected '${t.text || 'end of input'}'`, t.pos)
  }

  function unary(): Result<Expr> {
    if (peek().kind === 'op' && peek().text === '-') {
      next()
      const e = unary()
      if (!e.ok) return e
      return ok({ k: 'neg', e: e.value })
    }
    return primary()
  }

  function mult(): Result<Expr> {
    const first = unary()
    if (!first.ok) return first
    let l = first.value
    while (peek().kind === 'op' && (peek().text === '*' || peek().text === '/')) {
      const op = next().text as BinOp
      const r = unary()
      if (!r.ok) return r
      l = { k: 'bin', op, l, r: r.value }
    }
    return ok(l)
  }

  function additive(): Result<Expr> {
    const first = mult()
    if (!first.ok) return first
    let l = first.value
    while (peek().kind === 'op' && (peek().text === '+' || peek().text === '-')) {
      const op = next().text as BinOp
      const r = mult()
      if (!r.ok) return r
      l = { k: 'bin', op, l, r: r.value }
    }
    return ok(l)
  }

  function expr(): Result<Expr> {
    const l = additive()
    if (!l.ok) return l
    if (peek().kind === 'op' && CMP_OPS.has(peek().text)) {
      const t = next()
      const r = additive()
      if (!r.ok) return r
      // non-associative: a second comparison at this level is a syntax error
      if (peek().kind === 'op' && CMP_OPS.has(peek().text)) {
        return err('syntax', 'chained comparisons are not allowed', peek().pos)
      }
      return ok({ k: 'cmp', op: t.text as CmpOp, l: l.value, r: r.value })
    }
    return l
  }

  const e = expr()
  if (!e.ok) return e
  const t = peek()
  if (t.kind !== 'eof') return err('syntax', `unexpected trailing '${t.text}'`, t.pos)
  return e
}

/** Print an AST back to parseable source (used by property tests). */
export function printExpr(e: Expr): string {
  switch (e.k) {
    case 'num':
      return e.v.d === 1n
        ? e.v.n < 0n
          ? `(0 - ${(-e.v.n).toString()})`
          : e.v.n.toString()
        : `frac(${e.v.n.toString()}, ${e.v.d.toString()})`
    case 'var':
      return e.name
    case 'neg':
      return `(-${printExpr(e.e)})`
    case 'bin':
      return `(${printExpr(e.l)} ${e.op} ${printExpr(e.r)})`
    case 'cmp':
      return `(${printExpr(e.l)}) ${e.op} (${printExpr(e.r)})`
    case 'call':
      return `${e.fn}(${e.args.map(printExpr).join(', ')})`
  }
}

/** Insert the implicit multiplications people (and rendered templates)
 * write: "3x" → "3*x", "3(x+2)" → "3*(x+2)", "(x+1)(x+2)" → ...*(x+2).
 * Letter-before-paren is left alone so function calls (abs(x)) survive. */
export const insertImplicitMul = (src: string): string =>
  src.replace(/(\d)\s*(?=[a-zA-Z(])/g, '$1*').replace(/(\))\s*(?=[\w(])/g, '$1*')

/** parseExpr over human/rendered notation (implicit multiplication allowed). */
export const parseExprLoose = (src: string): ReturnType<typeof parseExpr> =>
  parseExpr(insertImplicitMul(src))

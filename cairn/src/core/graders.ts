/** Graders (§5): numeric (tolerance, units), symbolic expression equivalence,
 * set/order, choice, and rubric routing. Everything here is deterministic —
 * `needs_llm` is a ROUTE (rubric items, queued when offline), never a fallback
 * for the symbolic grader, because check items must be gradable with no LLM
 * (invariant 7). Rubric-graded attempts are practice-only.
 *
 * Symbolic equivalence: parse both sides with cairn-expr and compare exact
 * rational evaluations at fixed sample points (sound for the rational
 * functions cairn-expr can express, up to the trial count; indeterminate
 * cases grade incorrect, conservatively).
 */
import {
  parseExpr,
  parseExprLoose,
  evaluate,
  parseTemplate,
  renderTemplate,
  rat,
  sub,
  abs as ratAbs,
  cmp,
  eq as ratEq,
  fromNumber,
  type Rational,
  type Expr,
  type Env,
  type Item,
} from '@openmastery/schema'

export type AnswerSpec = Item['answer']

export type Verdict =
  | { verdict: 'correct' }
  | { verdict: 'incorrect'; reason?: string }
  | { verdict: 'needs_llm'; reason: string }

const correct: Verdict = { verdict: 'correct' }
const incorrect = (reason?: string): Verdict =>
  reason === undefined ? { verdict: 'incorrect' } : { verdict: 'incorrect', reason }

/** Diagnosis (§5): a wrong submission is matched against the item's NAMED
 * misconceptions, so the student hears what they did rather than only that
 * they missed. Deterministic and authored — no inference, no LLM: a
 * misconception fires only when the submitted value equals the value that
 * error produces under these params.
 *
 * The match is numeric-or-symbolic on purpose: "84" and "25 + 59" are the
 * same mistake. */
export function diagnose(
  misconceptions: ReadonlyArray<{ id: string; when: string; says: string }> | undefined,
  params: Env,
  raw: string,
): { id: string; says: string } | null {
  if (!misconceptions || misconceptions.length === 0) return null
  const student = raw.trim()
  if (student === '') return null
  for (const m of misconceptions) {
    const rendered = renderTemplate(m.when, params, { numberStyle: 'fraction' })
    if (!rendered.ok) continue
    // MOVE-shaped errors ("divide 3" at an op gate) compare as moves: the
    // word must match and the operand must agree numerically
    const asMove = (x: string): [string, string] | null => {
      const mm = /^(add|subtract|multiply|divide)\s+(\S.*)$/i.exec(x.trim())
      return mm ? [mm[1]!.toLowerCase(), mm[2]!] : null
    }
    const wantMove = asMove(rendered.value)
    if (wantMove) {
      const gotMove = asMove(student)
      if (
        gotMove &&
        gotMove[0] === wantMove[0] &&
        (() => {
          const a = evalClosed(gotMove[1])
          const b = evalClosed(wantMove[1])
          return a !== null && b !== null && ratEq(a, b)
        })()
      ) {
        const says = renderTemplate(m.says, params, { numberStyle: 'fraction' })
        // NO RAW TEMPLATE TO A STUDENT. An unrenderable `says` used to be
        // shown verbatim — "You added {a} and {b} instead of multiplying".
        // Fall through to the generic "not quite" instead: a missing
        // diagnosis is a gap, a templated one is nonsense.
        if (!says.ok) return null
        return { id: m.id, says: says.value }
      }
      continue
    }
    // an equation-shaped submission ("x = 84") is compared on its value side
    const side = (x: string): string => {
      const parts = x.split(/(?<![=<>!])=(?!=)/)
      return (parts.length === 2 ? parts[1]! : x).trim()
    }
    if (exprEquivalent(side(student), side(rendered.value))) {
      const says = renderTemplate(m.says, params, { numberStyle: 'fraction' })
      if (!says.ok) return null
      return { id: m.id, says: says.value }
    }
  }
  return null
}

/** Route an item's attempt: rubric items go to the LLM queue, everything else
 * grades deterministically. */
export function gradeItem(
  item: Pick<Item, 'answer' | 'rubric'>,
  params: Env,
  raw: string | string[],
): Verdict {
  if (item.rubric != null)
    return { verdict: 'needs_llm', reason: 'rubric item: queued for LLM grading' }
  return gradeAnswer(item.answer, params, raw)
}

/** A malformed ANSWER KEY is a curriculum fault, never a student's miss.
 * Returning `incorrect` for it logged an attempt event, drove the mastery
 * estimate down, advanced the corrective ladder and could park the
 * student with a guide flag — all for our bug, with authoring
 * diagnostics ("answer key does not evaluate") shown to a child. It
 * throws now; the caller must not convert this into a verdict. */
export class AnswerKeyError extends Error {
  constructor(reason: string) {
    super(`answer key fault: ${reason}`)
    this.name = 'AnswerKeyError'
  }
}

export function gradeAnswer(spec: AnswerSpec, params: Env, raw: string | string[]): Verdict {
  switch (spec.type) {
    case 'numeric':
      return gradeNumeric(spec, params, asOne(raw))
    case 'expr':
      return gradeExpr(spec, params, asOne(raw))
    case 'set':
      return gradeList(spec, params, raw, false)
    case 'ordered':
      return gradeList(spec, params, raw, true)
    case 'choice':
      return String(spec.value).trim() === asOne(raw).trim()
        ? correct
        : incorrect()
    case 'op':
      return gradeOp(spec, params, asOne(raw))
  }
}

/** Constructed both-sides move: "<word> <operand>" where word ∈ add |
 * subtract | multiply | divide (exact) and the operand is numerically
 * equal to the key's. The widget's OpEntry emits exactly this shape. */
const OP_WORDS = new Set(['add', 'subtract', 'multiply', 'divide'])

function gradeOp(spec: AnswerSpec, params: Env, raw: string): Verdict {
  if (typeof spec.value !== 'string') throw new AnswerKeyError('answer key is not an op template')
  const rendered = renderTemplate(spec.value, params, { numberStyle: 'fraction' })
  if (!rendered.ok) throw new AnswerKeyError('answer key does not evaluate')
  const splitMove = (s: string): [string, string] | null => {
    const m = /^(\S+)\s+(.+)$/.exec(s.trim())
    return m ? [m[1]!.toLowerCase(), m[2]!] : null
  }
  const key = splitMove(rendered.value)
  if (!key || !OP_WORDS.has(key[0])) throw new AnswerKeyError('answer key is not an op template')
  const student = splitMove(raw)
  if (!student) return incorrect('empty')
  if (!OP_WORDS.has(student[0])) return incorrect('unknown operation')
  if (student[0] !== key[0]) return incorrect()
  const expected = evalClosed(key[1])
  if (!expected) throw new AnswerKeyError('answer key operand does not evaluate')
  const got = evalClosed(student[1])
  if (!got) return incorrect('operand is not a number')
  return ratEq(got, expected) ? correct : incorrect()
}

const asOne = (raw: string | string[]): string => (Array.isArray(raw) ? raw.join(',') : raw)

// ---------- closed evaluation helpers ----------

/** Evaluate a template (or plain number) to a closed rational under params. */
function resolveClosed(value: string | number, params: Env): Rational | null {
  if (typeof value === 'number') return fromNumber(value)
  const rendered = renderTemplate(value, params, { numberStyle: 'fraction' })
  if (!rendered.ok) return null
  return evalClosed(rendered.value)
}

/** Parse + evaluate a plain expression string with no free variables. */
function evalClosed(src: string): Rational | null {
  const p = parseExprLoose(src.trim())
  if (!p.ok) return null
  const v = evaluate(p.value, {})
  if (!v.ok || v.value.t !== 'num') return null
  return v.value.v
}

// ---------- numeric ----------

function gradeNumeric(spec: AnswerSpec, params: Env, raw: string): Verdict {
  const expected = resolveClosed(spec.value as string | number, params)
  if (!expected) throw new AnswerKeyError('answer key does not evaluate')
  let s = raw.trim().toLowerCase()
  if (s === '') return incorrect('empty')
  if (spec.units) {
    const unit = spec.units.toLowerCase()
    if (s.endsWith(unit)) s = s.slice(0, -unit.length).trim()
    else if (/[a-z]/.test(s)) return incorrect('wrong or unknown units')
    // a bare number is accepted as being in the item's units
  } else if (/[a-z]/.test(s)) {
    return incorrect('not a number')
  }
  const student = evalClosed(s)
  if (!student) return incorrect('not a number')
  const tol = spec.tolerance !== undefined ? fromNumber(spec.tolerance) : null
  if (tol) return cmp(ratAbs(sub(student, expected)), tol) <= 0 ? correct : incorrect()
  return ratEq(student, expected) ? correct : incorrect()
}

// ---------- symbolic expression / equation equivalence ----------

/** Deterministic sample values (exact rationals, mixed signs and fractions). */
const SAMPLE_TABLE: Rational[] = [
  rat(2)!,
  rat(-3)!,
  rat(5, 2)!,
  rat(7)!,
  rat(-1, 3)!,
  rat(4)!,
  rat(9, 4)!,
  rat(-6)!,
  rat(11)!,
  rat(3, 5)!,
]
const TRIALS = 8
const MIN_VALID_TRIALS = 3

function freeVars(e: Expr, bound: ReadonlySet<string>): Set<string> {
  const out = new Set<string>()
  const walk = (x: Expr): void => {
    switch (x.k) {
      case 'var':
        if (!bound.has(x.name)) out.add(x.name)
        break
      case 'neg':
        walk(x.e)
        break
      case 'bin':
      case 'cmp':
        walk(x.l)
        walk(x.r)
        break
      case 'call':
        x.args.forEach(walk)
        break
      case 'num':
        break
    }
  }
  walk(e)
  return out
}

/** Are two expressions equivalent as functions of their free variables?
 * Exact-rational agreement across TRIALS deterministic points; trials where
 * either side is undefined (division by zero) are skipped; fewer than
 * MIN_VALID_TRIALS valid points grades not-equivalent (conservative). */
export function exprEquivalent(aSrc: string, bSrc: string): boolean {
  const pa = parseExprLoose(aSrc)
  const pb = parseExprLoose(bSrc)
  if (!pa.ok || !pb.ok) return false
  const vars = [...new Set([...freeVars(pa.value, new Set()), ...freeVars(pb.value, new Set())])].sort()
  let valid = 0
  for (let t = 0; t < TRIALS; t++) {
    const env: Env = {}
    vars.forEach((v, j) => {
      env[v] = SAMPLE_TABLE[(t + j * 3) % SAMPLE_TABLE.length]!
    })
    const va = evaluate(pa.value, env)
    const vb = evaluate(pb.value, env)
    if (!va.ok || !vb.ok) {
      // undefined on one side only is disagreement
      if (va.ok !== vb.ok) return false
      continue
    }
    if (va.value.t !== 'num' || vb.value.t !== 'num') return false
    if (!ratEq(va.value.v, vb.value.v)) return false
    valid++
  }
  return valid >= MIN_VALID_TRIALS
}

/** Split "lhs = rhs" on a single top-level '='. Returns 1 or 2 parts. */
function splitEquation(s: string): string[] | null {
  const parts = s.split(/(?<![=<>!])=(?!=)/)
  if (parts.length > 2) return null
  return parts.map((p) => p.trim())
}

function gradeExpr(spec: AnswerSpec, params: Env, raw: string): Verdict {
  if (typeof spec.value !== 'string') throw new AnswerKeyError('answer key is not an expression')
  // syntactic form guards: symbolic equivalence would accept an echo of the
  // stem ("3(x+2)" ≡ "3x+6"), so expansion/combination items constrain shape
  if (spec.form === 'expanded') {
    if (/[()]/.test(raw)) return incorrect('give the expanded form — no parentheses')
    // …and the arithmetic must be CARRIED OUT. "3*2x + 3*5" has no
    // parentheses and is equivalent to "6x + 15", but it is the line the
    // board already shows: typing it back demonstrates nothing, and
    // producing the simplified form IS the skill. A number multiplying a
    // number, or a number multiplying a coefficient, is unfinished work.
    const pending = /\d\s*[*·×]\s*\d/.test(raw)
    if (pending) return incorrect('multiply it out — give the simplified terms')
  }
  if (spec.form === 'evaluated') {
    // the value side must be a literal number (optionally signed/decimal or
    // a single fraction) — no pending arithmetic
    const rhs = (() => {
      const parts = raw.split(/(?<![=<>!])=(?!=)/)
      return (parts.length === 2 ? parts[1]! : raw).trim()
    })()
    if (!/^-?\d+(\.\d+)?(\s*\/\s*-?\d+(\.\d+)?)?$/.test(rhs))
      return incorrect('finish the arithmetic — give the number itself')
  }
  if (spec.form === 'combined') {
    const v = typeof params['variable'] === 'string' ? params['variable'] : null
    if (v !== null) {
      const count = raw.split(v).length - 1
      if (count > 1) return incorrect(`combine the ${v}-terms — ${v} should appear once`)
    }
  }
  const rendered = renderTemplate(spec.value, params, { numberStyle: 'fraction' })
  if (!rendered.ok) throw new AnswerKeyError('answer key does not evaluate')
  const expectedParts = splitEquation(rendered.value)
  const studentParts = splitEquation(raw.trim().toLowerCase())
  if (!expectedParts || !studentParts || studentParts.some((p) => p === ''))
    return incorrect('malformed answer')

  if (spec.equivalence === 'exact') {
    const norm = (xs: string[]) => xs.map((x) => x.replace(/\s+/g, '')).join('=')
    return norm(expectedParts) === norm(studentParts) ? correct : incorrect()
  }

  if (expectedParts.length === 1) {
    if (studentParts.length !== 1) return incorrect('expected an expression, not an equation')
    return exprEquivalent(studentParts[0]!, expectedParts[0]!) ? correct : incorrect()
  }

  // expected is an equation lhs = rhs
  const [eLhs, eRhs] = expectedParts as [string, string]
  if (studentParts.length === 1) {
    // bare value accepted when the key isolates a single variable: "x = 3" ⇐ "3"
    const lhsExpr = parseExprLoose(eLhs)
    const isBareVar = lhsExpr.ok && lhsExpr.value.k === 'var'
    if (!isBareVar) return incorrect('answer must be an equation')
    return exprEquivalent(studentParts[0]!, eRhs) ? correct : incorrect()
  }
  // equation ≡ equation: compare the differences (either orientation)
  const [sLhs, sRhs] = studentParts as [string, string]
  const eDiff = `(${eLhs}) - (${eRhs})`
  const sDiff = `(${sLhs}) - (${sRhs})`
  return exprEquivalent(sDiff, eDiff) || exprEquivalent(sDiff, `-(${eDiff})`)
    ? correct
    : incorrect()
}

// ---------- set / ordered ----------

function gradeList(spec: AnswerSpec, params: Env, raw: string | string[], ordered: boolean): Verdict {
  const expectedRaw = Array.isArray(spec.value) ? spec.value : [spec.value]
  const expected: Rational[] = []
  for (const v of expectedRaw) {
    const r = resolveClosed(v as string | number, params)
    if (!r) throw new AnswerKeyError('answer key does not evaluate')
    expected.push(r)
  }
  const parts = (Array.isArray(raw) ? raw : raw.split(/[,;]/)).map((p) => p.trim()).filter((p) => p !== '')
  if (parts.length !== expected.length) return incorrect('wrong number of values')
  const student: Rational[] = []
  for (const p of parts) {
    const r = evalClosed(p)
    if (!r) return incorrect(`'${p}' is not a number`)
    student.push(r)
  }
  const sortKey = (xs: Rational[]) => [...xs].sort((x, y) => cmp(x, y))
  const a = ordered ? student : sortKey(student)
  const b = ordered ? expected : sortKey(expected)
  return a.every((x, i) => ratEq(x, b[i]!)) ? correct : incorrect()
}

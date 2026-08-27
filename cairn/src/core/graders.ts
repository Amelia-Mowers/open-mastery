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
  }
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
  if (!expected) return incorrect('answer key does not evaluate')
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
  if (typeof spec.value !== 'string') return incorrect('answer key is not an expression')
  // syntactic form guards: symbolic equivalence would accept an echo of the
  // stem ("3(x+2)" ≡ "3x+6"), so expansion/combination items constrain shape
  if (spec.form === 'expanded' && /[()]/.test(raw))
    return incorrect('give the expanded form — no parentheses')
  if (spec.form === 'combined') {
    const v = typeof params['variable'] === 'string' ? params['variable'] : null
    if (v !== null) {
      const count = raw.split(v).length - 1
      if (count > 1) return incorrect(`combine the ${v}-terms — ${v} should appear once`)
    }
  }
  const rendered = renderTemplate(spec.value, params, { numberStyle: 'fraction' })
  if (!rendered.ok) return incorrect('answer key does not evaluate')
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
    if (!r) return incorrect('answer key does not evaluate')
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

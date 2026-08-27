import type { Skill } from './skill.ts'
import type { Item } from './item.ts'
import type { Explanation } from './explanation.ts'
import { parseTemplate, templateIdentifiers, renderTemplate } from '../expr/render.ts'
import { parseExpr } from '../expr/parse.ts'
import { evaluate } from '../expr/eval.ts'
import { isInt, type Rational } from '../expr/rational.ts'
import { generateParams, type GeneratorSpec } from '../expr/generate.ts'
import type { Env } from '../expr/eval.ts'

export interface Bundle {
  skills: Skill[]
  items: Item[]
  explanations: Explanation[]
}

export interface Issue {
  severity: 'error' | 'warning'
  code: string
  /** id of the offending record, plus an optional field path */
  where: string
  message: string
}

export interface ValidateOptions {
  /** 'release' enforces the ship gates as errors; 'authoring' downgrades the
   * completeness gates (≥2 vetted explanations, ≥2 check items) to warnings. */
  profile?: 'authoring' | 'release'
  /** seeds used to smoke-test each item generator */
  generatorSeeds?: number[]
}

/** Cross-file validation. File-level shape is assumed already checked by the
 * Zod schemas; this layer checks references, graphs, and release gates. */
export function validateBundle(bundle: Bundle, opts: ValidateOptions = {}): Issue[] {
  const profile = opts.profile ?? 'release'
  const gate: 'error' | 'warning' = profile === 'release' ? 'error' : 'warning'
  const seeds = opts.generatorSeeds ?? [1, 2, 3, 4, 5]
  const issues: Issue[] = []
  const push = (severity: Issue['severity'], code: string, where: string, message: string) =>
    issues.push({ severity, code, where, message })

  // ---- id uniqueness across every kind (ids are never reused) ----
  const seen = new Map<string, string>()
  const all: Array<[string, string]> = [
    ...bundle.skills.map((s) => [s.id, 'skill'] as [string, string]),
    ...bundle.items.map((i) => [i.id, 'item'] as [string, string]),
    ...bundle.explanations.map((e) => [e.id, 'explanation'] as [string, string]),
  ]
  for (const [id, kind] of all) {
    const prev = seen.get(id)
    if (prev) push('error', 'duplicate_id', id, `id used by both ${prev} and ${kind}`)
    else seen.set(id, kind)
  }

  const skillById = new Map(bundle.skills.map((s) => [s.id, s]))
  const itemById = new Map(bundle.items.map((i) => [i.id, i]))
  const explById = new Map(bundle.explanations.map((e) => [e.id, e]))

  // ---- reference resolution ----
  for (const s of bundle.skills) {
    for (const p of s.prereqs)
      if (!skillById.has(p)) push('error', 'dangling_ref', `${s.id}.prereqs`, `unknown skill '${p}'`)
    for (const ex of s.instruction) {
      const e = explById.get(ex)
      if (!e) push('error', 'dangling_ref', `${s.id}.instruction`, `unknown explanation '${ex}'`)
      else if (e.skill !== s.id)
        push('error', 'wrong_skill', `${s.id}.instruction`, `explanation '${ex}' belongs to '${e.skill}'`)
    }
    for (const f of s.faded_examples) {
      const it = itemById.get(f)
      if (!it) push('error', 'dangling_ref', `${s.id}.faded_examples`, `unknown item '${f}'`)
      else if (it.faded == null)
        push('error', 'not_faded', `${s.id}.faded_examples`, `item '${f}' has no faded spec`)
    }
  }
  for (const it of bundle.items)
    for (const sk of it.skills)
      if (!skillById.has(sk)) push('error', 'dangling_ref', `${it.id}.skills`, `unknown skill '${sk}'`)
  for (const e of bundle.explanations)
    if (!skillById.has(e.skill))
      push('error', 'dangling_ref', `${e.id}.skill`, `unknown skill '${e.skill}'`)

  // ---- prereq graph must be acyclic ----
  {
    const state = new Map<string, 'visiting' | 'done'>()
    const visit = (id: string, path: string[]): void => {
      const st = state.get(id)
      if (st === 'done') return
      if (st === 'visiting') {
        push('error', 'prereq_cycle', id, `prerequisite cycle: ${[...path, id].join(' → ')}`)
        return
      }
      state.set(id, 'visiting')
      for (const p of skillById.get(id)?.prereqs ?? [])
        if (skillById.has(p)) visit(p, [...path, id])
      state.set(id, 'done')
    }
    for (const s of bundle.skills) visit(s.id, [])
  }

  // ---- BKT sanity ----
  for (const s of bundle.skills) {
    const { S, G } = s.bkt_defaults
    if (S + G >= 1)
      push('warning', 'bkt_degenerate', `${s.id}.bkt_defaults`, `S + G = ${S + G} ≥ 1 makes evidence uninformative`)
  }

  // ---- release gates (§8 CI, §4.1 CI rule) ----
  const explBySkill = new Map<string, Explanation[]>()
  for (const e of bundle.explanations) {
    const list = explBySkill.get(e.skill) ?? []
    list.push(e)
    explBySkill.set(e.skill, list)
  }
  for (const s of bundle.skills) {
    const vetted = (explBySkill.get(s.id) ?? []).filter((e) => e.review.status === 'vetted')
    const reps = new Set(vetted.map((e) => e.representation))
    if (reps.size < 2)
      push(
        gate,
        'explanation_variety',
        s.id,
        `needs ≥2 vetted explanations with distinct representations (has ${vetted.length} vetted, ${reps.size} distinct)`,
      )
    // an item's declared representation should have a matching explanation
    for (const it of bundle.items) {
      if (!it.skills.includes(s.id) || it.representation == null) continue
      const reps = new Set((explBySkill.get(s.id) ?? []).map((e) => e.representation))
      if (!reps.has(it.representation))
        push(
          'warning',
          'unknown_representation',
          `${it.id}.representation`,
          `no explanation of '${s.id}' uses representation '${it.representation}'`,
        )
    }
    const checkEligible = bundle.items.filter(
      (it) =>
        it.skills.includes(s.id) &&
        it.generator != null &&
        it.widget.type !== 'choice' &&
        it.answer.type !== 'choice' &&
        it.rubric == null &&
        it.faded == null,
    )
    if (checkEligible.length < 2)
      push(
        gate,
        'check_items',
        s.id,
        `needs ≥2 generator-backed, non-choice, non-rubric items eligible as check items (has ${checkEligible.length})`,
      )
    // capstone rule: the skill's difficulty CEILING must be reachable with a
    // raw text answer — widget inputs scaffold the easier tiers, but checks
    // pick hardest-first and mastery evidence tops out at the raw form
    const skillItems = bundle.items.filter((it) => it.skills.includes(s.id) && it.faded == null)
    if (skillItems.length > 0) {
      const maxD = Math.max(...skillItems.map((it) => it.difficulty))
      const rawTypes = new Set(['numeric-input', 'expression-input', 'equation-input'])
      if (!skillItems.some((it) => it.difficulty === maxD && rawTypes.has(it.widget.type)))
        push(
          'warning',
          'capstone_raw',
          s.id,
          `hardest items (difficulty ${maxD}) are all widget inputs — the ceiling should be a raw text answer`,
        )
    }
  }

  // ---- template validity + identifier scoping ----
  for (const it of bundle.items) {
    const scope = new Set([...Object.keys(it.params), ...Object.keys(it.generator ?? {})])
    const checkTemplate = (src: string, where: string) => {
      const p = parseTemplate(src)
      if (!p.ok) {
        push('error', 'bad_template', where, p.error.message)
        return
      }
      for (const ident of templateIdentifiers(p.value))
        if (!scope.has(ident))
          push('error', 'unknown_param', where, `template references unknown param '${ident}'`)
    }
    if (typeof it.answer.value === 'string') checkTemplate(it.answer.value, `${it.id}.answer.value`)
    if (it.verify !== undefined) {
      const scopeWithAnswer = new Set([...scope, 'answer'])
      const pv = parseTemplate(it.verify)
      if (!pv.ok) push('error', 'bad_template', `${it.id}.verify`, pv.error.message)
      else
        for (const ident of templateIdentifiers(pv.value))
          if (!scopeWithAnswer.has(ident))
            push('error', 'unknown_param', `${it.id}.verify`, `template references unknown param '${ident}'`)
    }
    it.hints.forEach((h, i) => checkTemplate(h, `${it.id}.hints[${i}]`))
    if (it.viz)
      for (const [key, tpl] of Object.entries(it.viz.bind))
        checkTemplate(tpl, `${it.id}.viz.bind.${key}`)
    // widget config strings (e.g. the stem) are templates too
    for (const [key, val] of Object.entries(it.widget.config))
      if (typeof val === 'string' && val.includes('{'))
        checkTemplate(val, `${it.id}.widget.config.${key}`)
    it.faded?.steps?.forEach((s, i) => checkTemplate(s, `${it.id}.faded.steps[${i}]`))
  }
  for (const e of bundle.explanations) {
    // params_from: item defers identifier scoping to the item; parse-check only
    const scope = e.params_from === 'item' ? null : new Set(Object.keys(e.params ?? {}))
    e.timeline.forEach((step, i) => {
      for (const src of [
        step.caption,
        step.handoff?.prompt,
        ...Object.values(step.patch ?? {}).filter((v): v is string => typeof v === 'string'),
      ]) {
        if (src === undefined) continue
        const p = parseTemplate(src)
        if (!p.ok) {
          push('error', 'bad_template', `${e.id}.timeline[${i}]`, p.error.message)
          continue
        }
        if (scope)
          for (const ident of templateIdentifiers(p.value))
            if (!scope.has(ident))
              push('error', 'unknown_param', `${e.id}.timeline[${i}]`, `unknown param '${ident}'`)
      }
    })
  }

  // ---- generator smoke + SOLUTION VERIFICATION: sampling always succeeds,
  //      the templated answer evaluates under every instance, integer
  //      requirements hold, and the computed answer actually satisfies the
  //      item's verify relation ----
  for (const it of bundle.items) {
    const answerTpl = typeof it.answer.value === 'string' ? it.answer.value : null
    /** evaluate the answer VALUE (the RHS when the template is an equation) */
    const answerValue = (env: Env): Rational | null => {
      if (!answerTpl) return null
      const rendered = renderTemplate(answerTpl, env, { numberStyle: 'fraction' })
      if (!rendered.ok) return null
      const last = rendered.value.split('=').pop()?.trim() ?? ''
      const parsed = parseExpr(last)
      if (!parsed.ok) return null
      const v = evaluate(parsed.value, {})
      return v.ok && v.value.t === 'num' ? v.value.v : null
    }
    // choice answers: the value is an option KEY, not an expression — check
    // it names a real option, and evaluate `verify` (the scenario invariant
    // that makes the keyed option genuinely correct) over the params alone
    if (it.answer.type === 'choice') {
      const opts = (it.widget.config?.['options'] ?? null) as Array<{ key?: unknown }> | null
      const keys = Array.isArray(opts) ? opts.map((o) => String(o?.key ?? '')) : []
      if (keys.length < 2)
        push('error', 'choice_options', it.id, 'choice items need ≥2 widget.config.options with keys')
      else if (new Set(keys).size !== keys.length)
        push('error', 'choice_options', it.id, 'choice option keys must be unique')
      else if (!keys.includes(String(it.answer.value)))
        push('error', 'choice_options', it.id, `answer value '${String(it.answer.value)}' is not an option key`)
      const checkChoice = (env: Env, where: string) => {
        if (it.verify === undefined) return
        const parsed = parseTemplate(it.verify)
        if (!parsed.ok) return // reported by the template checks
        const seg = parsed.value.find((x) => x.kind === 'expr')
        if (!seg || seg.kind !== 'expr') {
          push('error', 'verify_failed', `${it.id}.verify`, 'verify must contain an expression')
          return
        }
        const result = evaluate(seg.expr, env)
        if (!result.ok)
          push('error', 'verify_failed', where, `verify errored: ${result.error.message}`)
        else if (result.value.t !== 'bool' || !result.value.v)
          push('error', 'verify_failed', where, `scenario does not satisfy '${it.verify}'`)
      }
      checkChoice(it.params as Env, `${it.id} (authored params)`)
      if (it.generator != null) {
        const spec = it.generator as GeneratorSpec
        const fixed: Record<string, number | string> = {}
        for (const [k, v] of Object.entries(it.params)) if (!(k in spec)) fixed[k] = v
        for (const seed of seeds) {
          const g = generateParams(spec, fixed, seed)
          if (g.ok) checkChoice(g.value as Env, `${it.id} (seed ${seed})`)
        }
      }
      continue
    }

    const checkInstance = (env: Env, where: string) => {
      if (!answerTpl) return
      const r = renderTemplate(answerTpl, env)
      if (!r.ok) {
        push('error', 'answer_eval', where, r.error.message)
        return
      }
      const ans = answerValue(env)
      if (it.answer.integer === true) {
        if (ans === null || !isInt(ans))
          push('error', 'answer_not_integer', where, `answer value is not an integer`)
      }
      if (it.verify !== undefined) {
        if (ans === null) {
          push('error', 'verify_failed', where, 'answer value could not be computed for verification')
          return
        }
        const parsed = parseTemplate(it.verify)
        if (!parsed.ok) return // reported by the template checks
        const seg = parsed.value.find((x) => x.kind === 'expr')
        if (!seg || seg.kind !== 'expr') {
          push('error', 'verify_failed', `${it.id}.verify`, 'verify must contain an expression')
          return
        }
        const result = evaluate(seg.expr, { ...env, answer: ans })
        if (!result.ok)
          push('error', 'verify_failed', where, `verify errored: ${result.error.message}`)
        else if (result.value.t !== 'bool' || !result.value.v)
          push('error', 'verify_failed', where, `answer does not satisfy '${it.verify}'`)
      }
    }
    checkInstance(it.params as Env, `${it.id} (authored params)`)
    if (it.generator != null) {
      const spec = it.generator as GeneratorSpec
      const fixed: Record<string, number | string> = {}
      for (const [k, v] of Object.entries(it.params)) if (!(k in spec)) fixed[k] = v
      for (const seed of seeds) {
        const g = generateParams(spec, fixed, seed)
        if (!g.ok) {
          push('error', 'generator_failed', `${it.id}.generator`, `seed ${seed}: ${g.error.message}`)
          break
        }
        checkInstance(g.value as Env, `${it.id} (seed ${seed})`)
      }
    }
  }

  return issues
}

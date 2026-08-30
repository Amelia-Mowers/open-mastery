import type { Skill } from './skill.ts'
import type { Item } from './item.ts'
import type { Explanation } from './explanation.ts'
import { parseTemplate, templateIdentifiers, renderTemplate } from '../expr/render.ts'
import { parseExpr, parseExprLoose } from '../expr/parse.ts'
import type { Expr } from '../expr/ast.ts'
import { eq as ratEq } from '../expr/rational.ts'
import { evaluate } from '../expr/eval.ts'
import { isInt, rat, type Rational } from '../expr/rational.ts'
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

/** Are two rendered expressions the same function of their free variables?
 * Sampled exact-rational comparison — the same technique the runtime grader
 * uses, kept local so the validator has no engine dependency. */
function exprEquivalentStrings(aSrc: string, bSrc: string): boolean {
  const pa = parseExprLoose(aSrc)
  const pb = parseExprLoose(bSrc)
  if (!pa.ok || !pb.ok) return false
  const vars = new Set<string>()
  const walk = (x: Expr): void => {
    if (x.k === 'var') vars.add(x.name)
    else if (x.k === 'neg') walk(x.e)
    else if (x.k === 'bin' || x.k === 'cmp') {
      walk(x.l)
      walk(x.r)
    } else if (x.k === 'call') x.args.forEach(walk)
  }
  walk(pa.value)
  walk(pb.value)
  const names = [...vars].sort()
  const SAMPLES = [2, -3, 5, 7, 11]
  let valid = 0
  for (let t = 0; t < SAMPLES.length; t++) {
    const env: Env = {}
    names.forEach((n, j) => {
      const r = rat(SAMPLES[(t + j) % SAMPLES.length]!)
      if (r) env[n] = r
    })
    const va = evaluate(pa.value, env)
    const vb = evaluate(pb.value, env)
    if (!va.ok || !vb.ok) continue
    if (va.value.t !== 'num' || vb.value.t !== 'num') return false
    if (!ratEq(va.value.v, vb.value.v)) return false
    valid++
  }
  return valid >= 2
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

  // ---- BKT sanity: the degenerate-parameter guard (Beck & Chang 2007) ----
  // S + G ≥ 1 inverts the evidence entirely, but the practical bound is
  // tighter: a guess or slip at or above 0.5 makes an answer say more about
  // luck than knowledge, and the model stops being identifiable.
  for (const s of bundle.skills) {
    const { S, G, T, L0 } = s.bkt_defaults
    if (S + G >= 1)
      push('error', 'bkt_degenerate', `${s.id}.bkt_defaults`, `S + G = ${S + G} ≥ 1 inverts the evidence`)
    else if (S >= 0.5 || G >= 0.5)
      push(
        'warning',
        'bkt_degenerate',
        `${s.id}.bkt_defaults`,
        `S=${S} G=${G}: a slip or guess ≥ 0.5 makes answers uninformative (Beck & Chang degenerate region)`,
      )
    // a high learn rate from a high prior means two answers "master" a skill;
    // flag the combination that produces implausibly fast mastery
    if (T >= 0.12 && L0 >= 0.3)
      push(
        'warning',
        'bkt_fast',
        `${s.id}.bkt_defaults`,
        `L0=${L0} with T=${T} reaches the check gate in ~2 correct answers — evidence that thin is not mastery`,
      )
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
    // representation floor: every skill carries ≥3 distinct representations,
    // one of them the whiteboard (worked-equation) — the abstraction the
    // concrete models fade toward
    {
      const reps = new Set((explBySkill.get(s.id) ?? []).map((e) => e.representation))
      if (reps.size < 3)
        push(
          'warning',
          'representation_count',
          s.id,
          `skills need ≥3 distinct representations (has ${reps.size})`,
        )
      // gate telegraphs: the caption shown WHILE a gate is open (the nearest
      // caption before it) must not contain the gate's answer — captions
      // written for passive playback often did ("Undo adding by
      // SUBTRACTING" right before the subtract gate)
      for (const e of explBySkill.get(s.id) ?? []) {
        const opStem: Record<string, RegExp> = {
          add: /\badd/i,
          subtract: /\bsubtract/i,
          multiply: /\bmultipl/i,
          divide: /\bdivi[ds]/i,
        }
        const bannerSegs = new Set(
          e.timeline.flatMap((st) =>
            Array.isArray(st.patch?.['equation']) ? (st.patch['equation'] as unknown[]).map(String) : [],
          ),
        )
        e.timeline.forEach((st, i) => {
          if (st.expect === undefined) return
          const prior = [...e.timeline.slice(0, i)].reverse().find((p) => p.caption !== undefined)
          if (!prior?.caption) return
          if (st.expect.type === 'op') {
            const word = String(st.expect.value).split(/\s/)[0] ?? ''
            // NO DO-GATE EXEMPTION. A gate whose prompt names its own move
            // ("Do it — multiply both sides by the reciprocal") is a button
            // labelled with its answer; the caption above it stating the
            // method made the whole step a no-op. Both are faults, and the
            // exemption is what let them stack. See [gate_tells] below.
            if (opStem[word]?.test(prior.caption))
              push(
                'warning',
                'gate_telegraph',
                `${e.id}.timeline[${i}]`,
                `the caption on screen ('${prior.caption.slice(0, 60)}…') names the move this gate asks for — ask a question instead`,
              )
          } else if (st.expect.type === 'numeric') {
            const v = String(st.expect.value)
            // Exempt, same as op DO-gates: a prompt that shows the working
            // ("{c} × {c} — what is the repeated factor?") or that names the
            // value's source is asking the student to READ the diagram, so
            // the caption carrying it is the teaching, not a leak.
            const enactment = st.expect.prompt !== undefined && st.expect.prompt.includes(v)
            // values readable off the equation banner are fair game — and
            // that includes SUPERSCRIPT notation: 4³ prints the exponent
            // as '³', so a gate asking "how many factors?" has its answer
            // on the board already. Naming it in a caption is describing
            // the notation, not leaking a result the student must find.
            const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹'
            const deSup = (t: string): string =>
              [...t].map((ch) => (SUP.includes(ch) ? String(SUP.indexOf(ch)) : ch)).join('')
            const onBoard = [...bannerSegs, ...e.timeline.map((x) => String(x.patch?.['start'] ?? ''))]
            if (
              !enactment &&
              prior.caption.includes(v) &&
              !onBoard.some((seg) => deSup(seg).includes(v))
            )
              push(
                'warning',
                'gate_telegraph',
                `${e.id}.timeline[${i}]`,
                `the caption on screen states this gate's answer ('${v}') — drop it or ask a question`,
              )
          }
        })
      // A GATE ASKS. A step the student is asked to work must pose a
        // QUESTION they answer from the diagram, never an instruction they
        // execute — "Do it, multiply both sides by the reciprocal" is a
        // button labelled with its own answer and teaches nothing.
        for (const [i, st] of e.timeline.entries()) {
          // The whiteboard NOTE is a second channel onto the same screen.
          // A step reading "subtract 8 from both sides" hands over the move
          // the gate is grading just as plainly as a caption would — and it
          // is not covered by [gate_telegraph], which only reads captions
          // and only for op gates.
          const note = st.expect !== undefined && typeof st.patch?.['note'] === 'string'
            ? st.patch['note']
            : ''
          if (/\b(add|subtract|multiply|divide)\b[^"]*\b(both sides|from both|to both)\b/i.test(note))
            push(
              'warning',
              'gate_telegraph',
              `${e.id}.timeline[${i}]`,
              `the note on screen ('${note}') names the move this gate asks for — say it on the step that CONFIRMS the move instead`,
            )
          const prompt = st.expect?.prompt
          if (prompt === undefined) continue
          if (!prompt.includes('?'))
            push(
              'warning',
              'gate_tells',
              `${e.id}.timeline[${i}]`,
              `this gate instructs instead of asking ('${prompt.slice(0, 60)}…') — pose the question the move answers`,
            )
          else if (/^\s*(do it|now |go ahead)/i.test(prompt))
            push(
              'warning',
              'gate_tells',
              `${e.id}.timeline[${i}]`,
              `this gate opens by telling the student what to do ('${prompt.slice(0, 40)}…') — lead with the question`,
            )
        }
      }
      // CONSTRUCTION: the diagram is built FROM the equation, so its first
      // frame must be empty (or nearly so). A timeline whose opening patch
      // hands over a finished picture can only annotate it — the student
      // watches rather than builds. Whiteboards are exempt: a board written
      // line by line IS the construction.
      const STAGING: Record<string, string[]> = {
        'balance-scale': ['leftIn', 'rightIn'],
        // for a tape the CELLS are the picture — hiding only the brace total
        // still hands the student a finished bar
        'tape-diagram': ['cellsIn'],
        'hanger-diagram': ['shapesIn', 'weightIn'],
        'envelope-model': ['envelopesIn', 'countersIn'],
        'double-number-line': ['topIn', 'bottomIn'],
        'ratio-table': ['reveal'],
        'area-model': ['fillRows', 'products'],
        'cube-model': ['slices'],
        'number-line': ['labelled'],
      }
      for (const e of explBySkill.get(s.id) ?? []) {
        const keys = STAGING[e.widget]
        if (!keys) continue
        const open = e.timeline.find((st) => st.patch !== undefined)?.patch
        if (!open) continue
        // an OMITTED staging key means "everything present from frame one",
        // which is exactly the fault — cube.exp-tape shipped with all four
        // cells filled because `cellsIn` was simply absent
        const staged = keys.some((k) => {
          const v = open[k]
          if (v === undefined) return false
          if (Array.isArray(v)) return v.length === 0 || (k === 'reveal' && v.length <= 1)
          if (typeof v === 'boolean') return v === false
          const n = Number(v)
          return Number.isFinite(n) ? n <= 1 : true
        })
        if (!staged)
          push(
            'warning',
            'arrives_whole',
            e.id,
            `the ${e.widget} is fully drawn in its first frame — stage it (${keys.join('/')}) so the student builds it from the equation`,
          )
      }
      // A GATE MUST MOVE THE PICTURE. The patch on an expect step is the
      // confirmation the student's answer earns — if it only changes the
      // caption (or nothing but the equation highlight), the diagram sat
      // still while they worked, and the representation taught nothing.
      for (const e of explBySkill.get(s.id) ?? []) {
        e.timeline.forEach((st, i) => {
          if (st.expect === undefined) return
          const keys = Object.keys(st.patch ?? {}).filter(
            (k) => k !== 'eqHighlight' && k !== 'equation' && k !== 'caption',
          )
          if (keys.length === 0)
            push(
              'warning',
              'gate_moves_nothing',
              `${e.id}.timeline[${i}]`,
              'this gate changes nothing in the diagram — the answer should visibly DO something to the representation',
            )
        })
      }
      // …and it must END BY ASKING. The lead stops one step short of the
      // resolution, so if its LAST surviving step is a statement, the
      // student is left staring at a finished diagram with no question —
      // the answer box below has to carry a leap the lesson never set up.
      for (const e of explBySkill.get(s.id) ?? []) {
        const content = e.timeline.filter(
          (st) => st.patch !== undefined || st.caption !== undefined,
        )
        const survivors = content.slice(0, -1)
        const last = survivors[survivors.length - 1]
        if (survivors.length > 0 && last?.expect === undefined)
          push(
            'warning',
            'lead_ends_quiet',
            e.id,
            'the faded lead ends on a statement — gate its last surviving step so the student is left with the question, not a finished picture',
          )
      }
      // …and its LAST GATE must resolve to the ANSWER, not to an
      // intermediate line. The lead drops the final content step because
      // the answer box below IS the resolution — that is the design, and
      // a timeline ending on a gate is correct. What is NOT correct is a
      // last gate whose key is a working line ("{a}{variable} =
      // {a*ans}"), because then neither the gate nor the box ever states
      // what {variable} is, and the lesson stops one move short.
      for (const e of explBySkill.get(s.id) ?? []) {
        const gated = e.timeline.filter((st) => st.expect !== undefined)
        const last = gated[gated.length - 1]
        const key = last?.expect?.value
        if (typeof key !== 'string') continue
        // A last gate that asks for only PART of the answer leaves the
        // lesson unfinished just as surely as a working line does:
        // equivalent's board ended by asking for the constant ({a*b}, "12")
        // when the answer is the whole expression ({a}{variable} + {a*b},
        // "3x + 12"). If the board's final LINE names the variable and the
        // gate's key does not, the student never states the answer.
        const finalLine = [...e.timeline]
          .reverse()
          .map((st) => (typeof st.patch?.['line'] === 'string' ? st.patch['line'] : ''))
          .find((l) => l !== '')
        // op gates ask for a MOVE ("divide {a}"), never for the answer —
        // the resolution line after them is what the answer box collects,
        // so they are finished, not partial.
        const asksForAMove = last?.expect?.type === 'op'
        // A gate asking for the VALUE that the resolution line states
        // ("x = {q*b/p}" with a gate keyed to "{q*b/p}") is finished too:
        // the student produced the number, and the box collects "x = …".
        // Only a gate asking for a DIFFERENT part than the answer — the
        // constant term of "3x + 12" — leaves the lesson incomplete.
        const isResolutionValue =
          finalLine !== undefined &&
          new RegExp(`=\\s*${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`).test(finalLine)
        // A gate asking for a COMPONENT is fine when the caption then puts
        // the whole question to the student and the answer box collects
        // it — combine gates "how many xs?" and "what do the numbers
        // make?", then asks "so what is the whole expression?". That is
        // the design, not an unfinished lesson. [lead_ends_quiet] is what
        // guards the case this was really catching: a last gate on a
        // component with NOTHING asking for the whole.
        const content2 = e.timeline.filter(
          (st) => st.patch !== undefined || st.caption !== undefined,
        )
        const gi2 = content2.map((st, i) => (st.expect ? i : -1)).filter((i) => i >= 0)
        const lastGateIdx = gi2[gi2.length - 1]
        const closingAsks =
          lastGateIdx !== undefined && (content2[lastGateIdx]!.caption ?? '').includes('?')
        if (
          !asksForAMove &&
          !isResolutionValue &&
          !closingAsks &&
          finalLine !== undefined &&
          /\{variable\}/.test(finalLine) &&
          !/\{variable\}/.test(key)
        ) {
          push(
            'warning',
            'ends_mid_solution',
            e.id,
            `the last gate asks for '${key}' but the board finishes on '${finalLine}' — the student never states the whole answer`,
          )
          continue
        }
        if (!key.includes('=')) continue
        // strip the TEMPLATES first: "{p+d}" renders to a single number,
        // so its arithmetic is the author computing the answer, not the
        // student being left mid-working. What matters is arithmetic
        // OUTSIDE the braces — "{a}{variable} = {a*ans} ÷ {a}".
        const rhs = (key.split('=').pop() ?? '').replace(/\{[^}]*\}/g, '').trim()
        if (/[+\-*/×÷]/.test(rhs))
          push(
            'warning',
            'ends_mid_solution',
            e.id,
            `the last gate resolves to '${key}' — a working line, not the answer; the lesson stops one move short of solving the problem`,
          )
      }
      // A whiteboard must not CONDENSE: "3x = 17 − 5 = 12" chains two
      // assertions onto one line, which is the running-equals-sign habit
      // teachers spend years undoing, and it hides the move the student
      // is meant to copy. A named quantity being evaluated
      // ("discount = 15% of 80 = 12") is fine — the fault is two
      // different EQUATIONS sharing a line, which is what an equals sign
      // on BOTH sides of an arithmetic operator looks like.
      for (const e of explBySkill.get(s.id) ?? []) {
        if (e.widget !== 'worked-equation') continue
        for (const [i, st] of e.timeline.entries()) {
          const line = typeof st.patch?.['line'] === 'string' ? st.patch['line'] : ''
          // several equations laid out side by side on one line (a row of
          // worked examples) is not a chain — split on the run of spaces
          // that separates them and check each independently
          if (/\s{3,}/.test(line)) continue
          const parts = line.split('=')
          if (parts.length < 3) continue
          // chained: a middle segment carries arithmetic, i.e. the line
          // asserts A = <working> = <result>
          const middle = parts.slice(1, -1).join('=')
          if (/[+\-−*/×÷]/.test(middle.replace(/\{[^}]*\}/g, '')))
            push(
              'warning',
              'board_condensed',
              `${e.id}.timeline[${i}]`,
              `the board line '${line}' chains two equations — write the move and the line it leaves as SEPARATE steps`,
            )
        }
      }
      // A value-shaped PROMPT with an equation-shaped KEY marks correct
      // arithmetic wrong: asked "what does the right side come to?", a
      // student types 54 and expr rejects it for not being "6y = 54".
      for (const e of explBySkill.get(s.id) ?? []) {
        for (const [i, st] of e.timeline.entries()) {
          const ex = st.expect
          if (ex?.type !== 'expr' || typeof ex.value !== 'string') continue
          if (!ex.value.includes('=')) continue
          const prompt = ex.prompt ?? ''
          // "what is x?" / "what equation…" legitimately want a line
          if (/\bline\b|\bequation\b|what is \{?[a-z]\}?\??$/i.test(prompt)) continue
          if (/\bcome(s)? to\b|\bwork(s)? out to\b|\bwhat do you get\b|\bhow many\b/i.test(prompt))
            push(
              'warning',
              'gate_wants_transcription',
              `${e.id}.timeline[${i}]`,
              `the prompt asks for a value but the key is the equation '${ex.value}' — a correct number is rejected; use numeric on the part that changed`,
            )
        }
      }
      // THE MIRROR CASE. A prompt asking for an algebraic PART ("what does
      // the x-part become?") with a bare NUMERIC key rejects the correct
      // answer: the student writes 6x, the key is 6. Third instance of a
      // prompt/answer-type mismatch this catalog has shipped, so check
      // both directions.
      for (const e of explBySkill.get(s.id) ?? []) {
        for (const [i, st] of e.timeline.entries()) {
          const ex = st.expect
          if (ex?.type !== 'numeric') continue
          const prompt = ex.prompt ?? ''
          // does the prompt name a part of the expression, not a value?
          // "what is it WORTH / what does it equal" wants a number; only a
          // prompt naming a PART of the expression wants a term
          if (!/\{variable\}-part|\bterm\b|\bpart\b\s+become/i.test(prompt)) continue
          const key = String(ex.value)
          // a key naming the variable is fine; a bare number is the fault
          if (!key.includes('{variable}'))
            push(
              'warning',
              'gate_wants_transcription',
              `${e.id}.timeline[${i}]`,
              `the prompt asks for an algebraic part ('${prompt.slice(0, 50)}…') but the key '${key}' is a bare number — the correct term is rejected`,
            )
        }
      }
      // When the last gate sits on the DROPPED final step, the caption on
      // screen with the answer box is the one BEFORE it. If that step is a
      // plain statement, nothing has put the closing question to the
      // student — they meet "what is x?" with the board silent. (When the
      // previous step is itself gated, its own prompt is what they read,
      // so no caption is owed. When the last gate SURVIVES, its own
      // caption is the closing one — the arm below owns that case, and
      // requiring a question here too made the lead ask twice in a row.)
      for (const e of explBySkill.get(s.id) ?? []) {
        const content = e.timeline.filter(
          (st) => st.patch !== undefined || st.caption !== undefined,
        )
        const gi = content.map((st, i) => (st.expect ? i : -1)).filter((i) => i >= 0)
        const last = gi[gi.length - 1]
        if (last === undefined || last === 0) continue
        if (last !== content.length - 1) continue // surviving gate: arm below
        const prev = content[last - 1]!
        if (prev.expect !== undefined) continue // its prompt asks
        const cap = prev.caption ?? ''
        if (cap !== '' && !cap.includes('?'))
          push(
            'warning',
            'lead_ends_quiet',
            `${e.id}.timeline[${last - 1}]`,
            `the caption shown while the last gate is open ('${cap.slice(0, 50)}…') states rather than asks — end it on the lesson's own question`,
          )
      }
      // …and the caption on the LAST GATED step is what a student reads
      // while the ANSWER BOX is open, because the lead drops the final
      // content step. If it only states, nothing has asked for the whole
      // answer the box is waiting for. (Reported on combine: two easy
      // gates, then the box, with no closing question anywhere.)
      for (const e of explBySkill.get(s.id) ?? []) {
        const content = e.timeline.filter(
          (st) => st.patch !== undefined || st.caption !== undefined,
        )
        const gi = content.map((st, i) => (st.expect ? i : -1)).filter((i) => i >= 0)
        const lastGate = gi[gi.length - 1]
        if (lastGate === undefined) continue
        // the dropped step is content.length - 1; if the last gate IS it,
        // the student never sees that caption and the step before it is
        // what [lead_ends_quiet] above already checks
        if (lastGate === content.length - 1) continue
        const cap = (content[lastGate]!.caption ?? '').trim()
        // …and the closing question lives THERE ALONE. While the gate is
        // open the prompt asks; once confirmed, this caption asks. A
        // question on the ungated step before it is a third ask in a row
        // (the two-step balance read "What is x?" twice back to back).
        const prevStep = lastGate > 0 ? content[lastGate - 1] : undefined
        const prevCap = (prevStep?.caption ?? '').trim()
        if (
          prevStep !== undefined &&
          prevStep.expect === undefined &&
          prevCap.endsWith('?') &&
          cap.includes('?')
        )
          push(
            'warning',
            'double_ask',
            `${e.id}.timeline[${lastGate - 1}]`,
            `the step before the last gate already asks ('${prevCap.slice(-50)}') and the gate's caption asks again — the gate's prompt covers the open gate, so drop this question`,
          )
        if (cap !== '' && !cap.includes('?'))
          push(
            'warning',
            'lead_ends_quiet',
            `${e.id}.timeline[${lastGate}]`,
            `the caption left on screen with the answer box ('${cap.slice(0, 50)}…') states rather than asks — end it on the question the box is waiting for`,
          )
      }
      // A step that CHANGES NOTHING is padding. [gate_moves_nothing] only
      // inspects gated steps, so a plain step whose patch has no drawing
      // keys — added to satisfy "end on the answer" when the previous
      // step already wrote it — was invisible to every check and shipped.
      for (const e of explBySkill.get(s.id) ?? []) {
        const content = e.timeline.filter(
          (st) => st.patch !== undefined || st.caption !== undefined,
        )
        content.forEach((st, i) => {
          if (i === 0 || st.expect !== undefined) return
          const draws = Object.keys(st.patch ?? {}).filter(
            (k) => k !== 'eqHighlight' && k !== 'note' && k !== 'caption',
          )
          if (draws.length === 0)
            push(
              'warning',
              'step_moves_nothing',
              `${e.id}.timeline[${i}]`,
              `this step changes nothing on the diagram — it only restates the caption. Drop it, or give it a patch that moves the picture`,
            )
        })
      }
      // Consecutive steps with the SAME caption read as a repeat even when
      // the board moves, and the earlier one usually states the answer to
      // its own gate. Both instances came from splitting a condensed line
      // and carrying the caption across.
      for (const e of explBySkill.get(s.id) ?? []) {
        const content = e.timeline.filter(
          (st) => st.patch !== undefined || st.caption !== undefined,
        )
        for (let i = 1; i < content.length; i++) {
          const a = (content[i - 1]!.caption ?? '').trim()
          const b = (content[i]!.caption ?? '').trim()
          if (a !== '' && a === b)
            push(
              'warning',
              'caption_repeats',
              `${e.id}.timeline[${i}]`,
              `this step repeats the previous caption ('${a.slice(0, 45)}…') — say what THIS step changed`,
            )
        }
      }
      // Two gates keyed to the SAME value ask the student the same thing
      // twice — they answer, the board moves, and the identical question
      // comes back in different words.
      for (const e of explBySkill.get(s.id) ?? []) {
        const gated = e.timeline.filter((st) => st.expect !== undefined)
        for (let i = 1; i < gated.length; i++) {
          const a = JSON.stringify(gated[i - 1]!.expect?.value)
          const b = JSON.stringify(gated[i]!.expect?.value)
          if (a === b)
            push(
              'warning',
              'gate_repeats',
              `${e.id}`,
              `two gates in a row both ask for ${a} — the second repeats the first in different words`,
            )
        }
      }
      // EVERY timeline must be workable: the faded/stepwise lead drops the
      // final content step (the resolution), so a timeline whose only gates
      // sit there plays as a passive movie. Count the gates that SURVIVE.
      for (const e of explBySkill.get(s.id) ?? []) {
        const content = e.timeline.filter(
          (st) => st.patch !== undefined || st.caption !== undefined,
        )
        const playable = content.slice(0, -1).filter((st) => st.expect !== undefined).length
        if (content.length >= 2 && playable === 0)
          push(
            'warning',
            'no_stepwise',
            e.id,
            'no gate survives the faded truncation — this timeline plays as a movie; gate a step before the resolution',
          )
      }
      // stepwise migration (2026-08-27): passive timelines are DEPRECATED —
      // every explanation should gate its move steps with `expect`
      for (const e of explBySkill.get(s.id) ?? []) {
        if (!e.timeline.some((st) => st.expect !== undefined))
          push(
            'warning',
            'no_expects',
            e.id,
            'passive timeline (deprecated): add expect gates to the move steps so it plays stepwise',
          )
      }
      // decomposition rule (GOLDEN_WIDGET §3): every lesson opens on the raw
      // symbolic problem via the equation banner — worked-equation timelines
      // are exempt (their `start` line IS the symbols)
      for (const e of explBySkill.get(s.id) ?? []) {
        if (e.widget === 'worked-equation') continue
        const hasBanner = e.timeline.some((st) => Array.isArray(st.patch?.['equation']))
        if (!hasBanner)
          push(
            'warning',
            'missing_banner',
            e.id,
            'lesson never shows the raw problem — open with an `equation` banner and pair eqHighlight with each region arriving',
          )
      }
      const primary = (explBySkill.get(s.id) ?? []).find((e) => e.id === s.instruction[0])
      if (primary?.widget === 'worked-equation')
        push(
          'warning',
          'worked_primary',
          s.id,
          'the whiteboard must never LEAD instruction — a concrete representation goes first, worked-equation is what they fade toward',
        )
      // instruction[0] being concrete is not enough: the engine teaches an
      // item's OWN representation before serving it, so a skill whose every
      // item is framed on the whiteboard still opened on the whiteboard —
      // the item representations quietly outrank the authored priority.
      // (The engine now refuses to lead with worked-equation; this keeps
      // the authoring visible rather than silently corrected.)
      const skillItems = (bundle.items ?? []).filter((it) => it.skills?.[0] === s.id)
      if (
        skillItems.length > 0 &&
        primary?.widget !== 'worked-equation' &&
        skillItems.every((it) => it.representation === 'worked-equation')
      )
        push(
          'warning',
          'worked_only_items',
          s.id,
          'every item is framed on the whiteboard, so the concrete representations this skill teaches are never the picture practised — point at least one item at a concrete rep',
        )
      const widgets = new Set((explBySkill.get(s.id) ?? []).map((e) => e.widget))
      if (!widgets.has('worked-equation'))
        push(
          'warning',
          'worked_missing',
          s.id,
          'every skill carries the whiteboard (worked-equation) representation',
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
    // FORM-MISMATCH guard (fail loudly): an item's declared representation
    // names the explanation its walkthrough prefers. If that explanation
    // opens on an equation banner, the banner RENDERED WITH THE ITEM'S OWN
    // PARAMS must appear in the item's stem — identifier overlap across
    // different forms (x − p = q sharing p,d with x + p = q) otherwise feeds
    // the wrong timeline silently.
    for (const it of bundle.items.filter((i) => i.skills.includes(s.id) && i.faded == null)) {
      const rep = it.representation
      if (rep == null) continue
      const stemTpl = it.widget.config?.['stem']
      if (typeof stemTpl !== 'string') continue
      const all = explBySkill.get(s.id) ?? []
      const ordered = [
        ...s.instruction.map((id) => all.find((e) => e.id === id)).filter((e) => e !== undefined),
        ...all.filter((e) => !s.instruction.includes(e.id)),
      ]
      const expl = ordered.find((e) => e.representation === rep)
      const banner = expl?.timeline.find((st) => Array.isArray(st.patch?.['equation']))?.patch?.[
        'equation'
      ] as unknown[] | undefined
      if (!banner) continue
      const renderAll = (parts: unknown[]): string | null => {
        let out = ''
        for (const seg of parts) {
          const r = renderTemplate(String(seg), it.params as Env, { numberStyle: 'fraction' })
          if (!r.ok) return null
          out += r.value
        }
        return out
      }
      const bannerText = renderAll(banner)
      const stemR = renderTemplate(stemTpl, it.params as Env, { numberStyle: 'fraction' })
      if (bannerText === null || !stemR.ok) continue
      const norm = (x: string): string => x.replace(/\s+/g, '')
      const b = norm(bannerText)
      const stem = norm(stemR.value)
      // only meaningful when the banner is a concrete equation of THIS item
      if (b.includes('=') && /\d/.test(b) && stem.includes('=') && !stem.includes(b))
        push(
          'warning',
          'form_mismatch',
          `${it.id} ↔ ${expl!.id}`,
          `the '${rep}' explanation's equation banner renders as '${bannerText}' under this item's params, which does not appear in the stem '${stemR.value}' — wrong-form walkthrough risk`,
        )
    }

    // capstone rule: the skill's difficulty CEILING must be reachable with a
    // raw text answer. STRUCTURED inputs (term-input's [ ]x [±] [ ]) scaffold
    // the easier tiers — they give the shape of the answer away — but checks
    // pick hardest-first and mastery evidence tops out at the raw form,
    // where the student produces the whole answer unprompted.
    const skillItems = bundle.items.filter((it) => it.skills.includes(s.id) && it.faded == null)
    if (skillItems.length > 0) {
      const maxD = Math.max(...skillItems.map((it) => it.difficulty))
      const rawTypes = new Set(['numeric-input', 'expression-input', 'equation-input'])
      if (!skillItems.some((it) => it.difficulty === maxD && rawTypes.has(it.widget.type)))
        push(
          'warning',
          'capstone_raw',
          s.id,
          `hardest items (difficulty ${maxD}) all use a structured or widget input — the ceiling should be a raw text answer`,
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
      // stepwise expects: an op expect's move word is literal text, so its
      // shape is statically checkable; templates get the same parse/scope
      // treatment as captions
      if (step.expect !== undefined) {
        if (
          step.expect.type === 'op' &&
          !/^(add|subtract|multiply|divide)\s+\S/.test(String(step.expect.value))
        )
          push(
            'error',
            'expect_shape',
            `${e.id}.timeline[${i}]`,
            `op expect value must be '<add|subtract|multiply|divide> <operand>' (got '${String(step.expect.value)}')`,
          )
        if (step.expect.type === 'expr' || step.expect.type === 'numeric') {
          // an unparseable expect grades every student wrong forever — check
          // the value parses with each template segment stood in by a number
          const tpl = parseTemplate(String(step.expect.value))
          if (tpl.ok) {
            const probe = tpl.value.map((seg) => (seg.kind === 'text' ? seg.text : '7')).join('')
            const parts = probe.split('=').map((x) => x.trim())
            const bad =
              parts.length > 2 ||
              parts.some((x) => x === '' || !parseExprLoose(x).ok) ||
              (step.expect.type === 'numeric' && parts.length !== 1)
            if (bad)
              push(
                'error',
                'expect_shape',
                `${e.id}.timeline[${i}]`,
                `${step.expect.type} expect value '${String(step.expect.value)}' does not parse as gradable math`,
              )
          }
        }
        if (step.expect.type === 'pick') {
          // pick gates click equation-banner segments: indices must be
          // integers within a banner some EARLIER step established
          const eq = e.timeline
            .slice(0, i)
            .map((st) => st.patch?.['equation'])
            .filter((v): v is unknown[] => Array.isArray(v))
            .pop()
          const idxs = (step.expect.value as unknown[]).map((v) => Number(v))
          if (!eq)
            push('error', 'expect_shape', `${e.id}.timeline[${i}]`, 'pick expect needs an earlier equation patch to pick from')
          else if (idxs.length === 0 || idxs.some((n) => !Number.isInteger(n) || n < 0 || n >= eq.length))
            push('error', 'expect_shape', `${e.id}.timeline[${i}]`, `pick expect indices must be integers in [0, ${eq.length - 1}]`)
        }
      }
      for (const src of [
        step.caption,
        step.handoff?.prompt,
        typeof step.expect?.value === 'string' ? step.expect.value : undefined,
        step.expect?.prompt,
        step.expect?.hint,
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
      const parsed = parseExprLoose(last)
      if (!parsed.ok) return null
      const v = evaluate(parsed.value, {})
      return v.ok && v.value.t === 'num' ? v.value.v : null
    }
    // categorical/op answers: the value is not an expression — validate the
    // key against the widget's answer space, and evaluate `verify` (the
    // scenario invariant that makes the keyed answer genuinely correct)
    // over the params alone
    if (it.answer.type === 'choice' || it.answer.type === 'op') {
      if (it.answer.type === 'choice') {
        const opts = (it.widget.config?.['options'] ?? null) as Array<{ key?: unknown }> | null
        const keys = Array.isArray(opts) ? opts.map((o) => String(o?.key ?? '')) : []
        if (keys.length < 2)
          push('error', 'choice_options', it.id, 'choice items need ≥2 widget.config.options with keys')
        else if (new Set(keys).size !== keys.length)
          push('error', 'choice_options', it.id, 'choice option keys must be unique')
        else if (!keys.includes(String(it.answer.value)))
          push('error', 'choice_options', it.id, `answer value '${String(it.answer.value)}' is not an option key`)
      }
      const checkOpKey = (env: Env, where: string) => {
        // op answers: "<word> <operand>" where word names the both-sides
        // move and the operand evaluates to a number under these params
        const tpl = typeof it.answer.value === 'string' ? it.answer.value : null
        const rendered = tpl === null ? null : renderTemplate(tpl, env, { numberStyle: 'fraction' })
        const m = rendered?.ok ? /^(add|subtract|multiply|divide)\s+(\S.*)$/.exec(rendered.value.trim()) : null
        if (!m) {
          push('error', 'op_answer', where, `op answer must render to '<add|subtract|multiply|divide> <operand>' (got '${String(it.answer.value)}')`)
          return
        }
        const parsed = parseExprLoose(m[2]!)
        const v = parsed.ok ? evaluate(parsed.value, {}) : null
        if (!v || !v.ok || v.value.t !== 'num')
          push('error', 'op_answer', where, `op answer operand '${m[2]!}' does not evaluate to a number`)
      }
      if (it.answer.type === 'op' && it.widget.config?.['entry'] !== true)
        push('error', 'op_answer', it.id, "op items need widget.config.entry: true (the widget's op-entry answer space)")
      const checkScenario = (env: Env, where: string) => {
        if (it.answer.type === 'op') checkOpKey(env, where)
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
      checkScenario(it.params as Env, `${it.id} (authored params)`)
      if (it.generator != null) {
        const spec = it.generator as GeneratorSpec
        const fixed: Record<string, number | string> = {}
        for (const [k, v] of Object.entries(it.params)) if (!(k in spec)) fixed[k] = v
        for (const seed of seeds) {
          const g = generateParams(spec, fixed, seed)
          if (g.ok) checkScenario(g.value as Env, `${it.id} (seed ${seed})`)
        }
      }
      continue
    }

    // ---- MISCONCEPTIONS: a named wrong answer must actually be WRONG, and
    //      must evaluate under every instance. A `when` that collides with
    //      the real answer would tell a correct student they made an error —
    //      the one failure mode diagnosis must never have. ----
    if (it.misconceptions && it.misconceptions.length > 0) {
      const ids = it.misconceptions.map((m) => m.id)
      if (new Set(ids).size !== ids.length)
        push('error', 'misconception_dup', it.id, 'misconception ids must be unique within an item')
      const checkMis = (env: Env, where: string) => {
        const truth = answerValue(env)
        for (const m of it.misconceptions ?? []) {
          const rendered = renderTemplate(m.when, env, { numberStyle: 'fraction' })
          if (!rendered.ok) {
            push('error', 'misconception_shape', `${where} [${m.id}]`, `'${m.when}' does not render`)
            continue
          }
          // a `when` may be a NUMBER (most items) or a symbolic expression
          // (expand/combine/write-expression, where the wrong answer is a
          // different expression, not a different value) — both must parse
          const parsed = parseExprLoose(rendered.value)
          if (!parsed.ok) {
            push(
              'error',
              'misconception_shape',
              `${where} [${m.id}]`,
              `'${m.when}' does not parse as an expression`,
            )
            continue
          }
          const v = evaluate(parsed.value, {})
          const closed = v.ok && v.value.t === 'num' ? v.value.v : null
          if (closed !== null) {
            if (truth && ratEq(closed, truth))
              push(
                'error',
                'misconception_correct',
                `${where} [${m.id}]`,
                `'${m.when}' equals the right answer — a correct student would be told they erred`,
              )
          } else if (typeof it.answer.value === 'string') {
            // symbolic: the collision check is equivalence of the rendered
            // forms, not equality of values
            const key = renderTemplate(it.answer.value, env, { numberStyle: 'fraction' })
            if (key.ok && exprEquivalentStrings(rendered.value, key.value))
              push(
                'error',
                'misconception_correct',
                `${where} [${m.id}]`,
                `'${m.when}' is equivalent to the right answer — a correct student would be told they erred`,
              )
          }
        }
      }
      checkMis(it.params as Env, it.id)
      if (it.generator != null) {
        const spec = it.generator as GeneratorSpec
        const fixed: Record<string, number | string> = {}
        for (const [k, v] of Object.entries(it.params)) if (!(k in spec)) fixed[k] = v
        for (const seed of seeds) {
          const g = generateParams(spec, fixed, seed)
          if (g.ok) checkMis(g.value as Env, `${it.id} (seed ${seed})`)
        }
      }
    }

    // COVERAGE: an item with no named wrong answers gives every miss the
    // same generic line. Not every item can be diagnosed (open expressions,
    // selection sentinels), but the default should be "diagnosed" — this
    // warning is the authoring backlog, the way [no_expects] is for gates.
    if (!it.misconceptions || it.misconceptions.length === 0)
      push(
        'warning',
        'no_misconceptions',
        it.id,
        'no named wrong answers: every miss falls back to the generic line — author the predictable errors',
      )

    const exprIdentifiers = (e: Expr): Set<string> => {
      const out = new Set<string>()
      const walk = (x: Expr): void => {
        if (x.k === 'var') out.add(x.name)
        else if (x.k === 'neg') walk(x.e)
        else if (x.k === 'bin' || x.k === 'cmp') {
          walk(x.l)
          walk(x.r)
        } else if (x.k === 'call') x.args.forEach(walk)
      }
      walk(e)
      return out
    }
    /** free identifiers of the rendered answer's value part (open expression
     * answers like "3n + 5" have them; closed ones evaluate to a number) */
    const openVars = (env: Env): string[] | null => {
      if (!answerTpl) return null
      const rendered = renderTemplate(answerTpl, env, { numberStyle: 'fraction' })
      if (!rendered.ok) return null
      const last = rendered.value.split('=').pop()?.trim() ?? ''
      const parsed = parseExprLoose(last)
      if (!parsed.ok) return null
      const vars = [...exprIdentifiers(parsed.value)]
      return vars.length > 0 ? vars : null
    }
    /** equivalence by sampling at integer points (the grader's method) */
    const SAMPLE_POINTS = [2, 3, 5, -2, 7]
    const sampledEquivalent = (aSrc: string, bSrc: string): boolean | null => {
      const pa = parseExprLoose(aSrc)
      const pb = parseExprLoose(bSrc)
      if (!pa.ok || !pb.ok) return null
      const vars = [...new Set([...exprIdentifiers(pa.value), ...exprIdentifiers(pb.value)])].sort()
      for (let t = 0; t < 5; t++) {
        const env: Env = {}
        vars.forEach((v, j) => {
          env[v] = SAMPLE_POINTS[(t + j * 2) % SAMPLE_POINTS.length]!
        })
        const va = evaluate(pa.value, env)
        const vb = evaluate(pb.value, env)
        if (!va.ok || !vb.ok) return va.ok === vb.ok ? null : false
        if (va.value.t !== 'num' || vb.value.t !== 'num') return false
        if (!ratEq(va.value.v, vb.value.v)) return false
      }
      return true
    }
    const checkInstance = (env: Env, where: string) => {
      if (!answerTpl) return
      const r = renderTemplate(answerTpl, env)
      if (!r.ok) {
        push('error', 'answer_eval', where, r.error.message)
        return
      }
      // OPEN expression answer ("3n + 5"): verify holds an independently
      // authored ALTERNATE FORM; require symbolic agreement by sampling
      const open = openVars(env)
      if (open !== null) {
        if (it.verify === undefined) {
          push('error', 'verify_failed', where, 'open-expression answer needs a verify: alternate form')
          return
        }
        const vr = renderTemplate(it.verify, env, { numberStyle: 'fraction' })
        if (!vr.ok) {
          push('error', 'verify_failed', where, `verify render failed: ${vr.error.message}`)
          return
        }
        const aRendered = renderTemplate(answerTpl, env, { numberStyle: 'fraction' })
        const aLast = aRendered.ok ? (aRendered.value.split('=').pop()?.trim() ?? '') : ''
        const same = sampledEquivalent(aLast, vr.value.trim())
        if (same !== true)
          push('error', 'verify_failed', where, `answer '${aLast}' is not equivalent to verify form '${vr.value.trim()}'`)
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

    // ---- RESOLUTION-ANSWER consistency (fail loudly) ----
    // If this item's params can FEED an explanation of its skill, that
    // explanation's resolution (final content step) rendered under THIS
    // item's params must state this item's answer. Otherwise "show me how"
    // can teach a different problem (the 4³ → "4² = 16" class: identifier
    // overlap across forms). Closed integer answers only.
    {
      const ansR = answerValue(it.params as Env)
      // selection answers (row-select etc.) are positional indices, not
      // values a resolution would state
      const isSelection = it.widget.config?.['select'] === true
      if (ansR !== null && ansR.d === 1n && !isSelection) {
        const ansStr = ansR.n.toString()
        const ansRe = new RegExp(`(?<![\\d-])${ansStr.replace('-', '\\-')}(?!\\d)`)
        const stringsOf = (v: unknown): string[] => {
          if (typeof v === 'string') return [v]
          if (Array.isArray(v)) return v.flatMap(stringsOf)
          if (v !== null && typeof v === 'object') return Object.values(v).flatMap(stringsOf)
          return []
        }
        for (const skillId of it.skills) {
          for (const e of explBySkill.get(skillId) ?? []) {
            const needed = new Set<string>()
            for (const step of e.timeline)
              for (const src of [step.caption, step.handoff?.prompt, ...stringsOf(step.patch ?? {})]) {
                if (typeof src !== 'string' || !src.includes('{')) continue
                const pt = parseTemplate(src)
                if (pt.ok) for (const id of templateIdentifiers(pt.value)) needed.add(id)
              }
            // a template-free timeline shows no numbers — nothing to contradict
            if (needed.size === 0) continue
            const feeds = [...needed].every((id) => id in it.params)
            if (!feeds) continue
            const final = [...e.timeline].reverse().find((st) => st.caption !== undefined || st.patch !== undefined)
            if (!final) continue
            let rendered = ''
            let renderable = true
            for (const src of [final.caption ?? '', ...stringsOf(final.patch ?? {})]) {
              const r = renderTemplate(src, it.params as Env, { numberStyle: 'fraction' })
              if (!r.ok) {
                renderable = false
                break
              }
              rendered += ` ${r.value}`
            }
            if (renderable && !ansRe.test(rendered))
              push(
                'error',
                'resolution_answer',
                `${it.id} ↔ ${e.id}`,
                `this item's params feed the explanation, but its resolution ('${rendered.trim().slice(0, 90)}') never states the item's answer ${ansStr} — wrong-problem walkthrough`,
              )
          }
        }
      }
    }
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

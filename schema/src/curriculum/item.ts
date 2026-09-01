import { z } from 'zod'
import { itemIdSchema, skillIdSchema, sourceRefSchema, reviewSchema } from './common.ts'

export const paramValueSchema = z.union([z.number(), z.string()])

const intPair = z.tuple([z.number().int(), z.number().int()])

export const constraintSchema = z
  .object({
    int: intPair.optional(),
    range: intPair.optional(),
    /** explicit finite domain, for values with no interval shape —
     * benchmark percents' denominators {2, 4, 5, 10}, say */
    set: z.array(z.number().int()).min(1).optional(),
    mult_of: z.string().optional(),
    coprime: z.string().optional(),
    distinct: z.union([z.string(), z.array(z.string())]).optional(),
  })
  .strict()
  .refine(
    (c) => c.int !== undefined || c.range !== undefined || c.set !== undefined,
    'every generated param needs an int, range, or set domain',
  )
  .refine(
    (c) => c.set === undefined || (c.int === undefined && c.range === undefined && c.mult_of === undefined),
    'set is a complete domain — combining it with int/range/mult_of is ambiguous',
  )

export const widgetRefSchema = z
  .object({
    type: z.string().min(1),
    config: z.record(z.string(), z.unknown()).default({}),
  })
  .strict()

/** A named wrong answer and what to say when it lands. Shared by items
 * (final answers) and timeline gates (stepwise moves). */
export const misconceptionSchema = z
  .object({
    /** stable id for analytics/aggregation, e.g. 'added-instead-of-subtracted' */
    id: z
      .string()
      .regex(/^[a-z][a-z0-9-]*$/, 'misconception ids are lower-kebab-case'),
    /** cairn-expr template producing the value this error yields */
    when: z.string().min(1),
    /** child-facing: name the move, point at the fix */
    says: z.string().min(1),
  })
  .strict()

export const answerSchema = z
  .object({
    /** 'op' = a constructed both-sides move: the student enters an
     * operation symbol AND its operand (e.g. "subtract 5"); value is a
     * template "subtract {b}" — op word matched exactly, operand
     * numerically */
    type: z.enum(['expr', 'numeric', 'set', 'ordered', 'choice', 'op']),
    /** templated via cairn-expr, e.g. "{variable} = {b/a}" */
    value: z.union([z.string(), z.number(), z.array(z.union([z.string(), z.number()]))]),
    equivalence: z.enum(['symbolic', 'numeric', 'exact']).optional(),
    /** syntactic form guard for open-expression answers (symbolic
     * equivalence would otherwise accept an echo of the stem):
     * 'expanded' = no parentheses in the submission; 'combined' = the
     * variable appears at most once */
    /** 'evaluated' additionally requires the submission to be a FINISHED
     * value: "59 − 25" is arithmetic the student still owes, even though it
     * evaluates correctly. Use it wherever the point of the item is to
     * carry the computation out. */
    form: z.enum(['expanded', 'combined', 'evaluated']).optional(),
    tolerance: z.number().nonnegative().optional(),
    units: z.string().optional(),
    /** per-item display flag for non-integer rationals (§4.3a) */
    display: z.enum(['fraction', 'decimal']).optional(),
    /** require the answer value to be an integer for EVERY generated
     * instance (checked by bundle validation across seeds) */
    integer: z.boolean().optional(),
  })
  .strict()

/** Rubric-graded items are practice-only and never check items (§4.2, §5). */
export const rubricSchema = z
  .object({
    prompt: z.string().min(1),
    criteria: z.array(z.string().min(1)).min(1),
  })
  .strict()

export const fadedSpecSchema = z
  .object({
    /** 1-based indices into `steps` shown pre-completed */
    reveal_steps: z.array(z.number().int().positive()),
    /** 1-based indices the student fills in */
    student_completes: z.array(z.number().int().positive()).min(1),
    /** the worked steps themselves, as cairn-expr templated lines */
    steps: z.array(z.string().min(1)).optional(),
  })
  .strict()
  .refine(
    (f) =>
      f.steps === undefined ||
      [...f.reveal_steps, ...f.student_completes].every((i) => i <= f.steps!.length),
    'reveal_steps/student_completes reference steps beyond the list',
  )

export const itemSchema = z
  .object({
    id: itemIdSchema,
    skills: z.array(skillIdSchema).min(1),
    /** v1: orders items within a skill only; not used in P(correct) */
    difficulty: z.number().int().min(1).max(5),
    /** the representation this problem's framing/viz uses, so on-demand
     * explanations can match the metaphor; null/absent = raw problem (a
     * representation is chosen for it) */
    representation: z.string().min(1).nullish(),
    params: z.record(z.string(), paramValueSchema),
    generator: z.record(z.string(), constraintSchema).nullish(),
    /** HAND-AUTHORED isomorph pool: explicit param sets that ARE the
     * item's discrete instances (with the authored `params` first).
     * Mutually exclusive with `generator` — random draws swing in
     * difficulty (3×5 vs 13×12 as the "same" problem); a curated list
     * pins each instance, which also makes per-instance analytics and
     * pre-rendered voice exact. Every listed set is validated like the
     * authored one. */
    isomorphs: z.array(z.record(z.string(), paramValueSchema)).optional(),
    widget: widgetRefSchema,
    answer: answerSchema,
    rubric: rubricSchema.nullish().default(null),
    viz: z
      .object({ template: z.string().min(1), bind: z.record(z.string(), z.string()) })
      .strict()
      .nullish(),
    hints: z.array(z.string()).default([]),
    /** Named wrong answers: when a submission matches one, the student is
     * told WHAT they did instead of just "not quite". `when` is a cairn-expr
     * template that must evaluate to the value this misconception produces
     * (e.g. "{a+b}" for add-instead-of-subtract); `says` is the child-facing
     * sentence. Diagnosis is a teaching act, so the copy names the move the
     * student made and points at the fix — never scolds. */
    misconceptions: z.array(misconceptionSchema).optional(),
    faded: fadedSpecSchema.nullish().default(null),
    source: sourceRefSchema.optional(),
    review: reviewSchema,
    /** independent solution check: a boolean cairn-expr template evaluated
     * with the item params PLUS `answer` bound to the computed answer value —
     * substitute back into the original relation, e.g. "{a * answer == b}".
     * Never reference the answer template itself (that would be circular). */
    verify: z.string().optional(),
    /** ids are immutable and never reused; a moved/renamed item is a new id
     * pointing at its predecessor */
    supersedes: itemIdSchema.optional(),
  })
  .strict()

export type Item = z.infer<typeof itemSchema>
export type ItemConstraint = z.infer<typeof constraintSchema>

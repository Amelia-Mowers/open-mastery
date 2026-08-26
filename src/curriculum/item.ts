import { z } from 'zod'
import { itemIdSchema, skillIdSchema, sourceRefSchema, reviewSchema } from './common.ts'

export const paramValueSchema = z.union([z.number(), z.string()])

const intPair = z.tuple([z.number().int(), z.number().int()])

export const constraintSchema = z
  .object({
    int: intPair.optional(),
    range: intPair.optional(),
    mult_of: z.string().optional(),
    coprime: z.string().optional(),
    distinct: z.union([z.string(), z.array(z.string())]).optional(),
  })
  .strict()
  .refine(
    (c) => c.int !== undefined || c.range !== undefined,
    'every generated param needs an int or range domain',
  )

export const widgetRefSchema = z
  .object({
    type: z.string().min(1),
    config: z.record(z.string(), z.unknown()).default({}),
  })
  .strict()

export const answerSchema = z
  .object({
    type: z.enum(['expr', 'numeric', 'set', 'ordered', 'choice']),
    /** templated via cairn-expr, e.g. "{variable} = {b/a}" */
    value: z.union([z.string(), z.number(), z.array(z.union([z.string(), z.number()]))]),
    equivalence: z.enum(['symbolic', 'numeric', 'exact']).optional(),
    tolerance: z.number().nonnegative().optional(),
    units: z.string().optional(),
    /** per-item display flag for non-integer rationals (§4.3a) */
    display: z.enum(['fraction', 'decimal']).optional(),
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
    params: z.record(z.string(), paramValueSchema),
    generator: z.record(z.string(), constraintSchema).nullish(),
    widget: widgetRefSchema,
    answer: answerSchema,
    rubric: rubricSchema.nullish().default(null),
    viz: z
      .object({ template: z.string().min(1), bind: z.record(z.string(), z.string()) })
      .strict()
      .nullish(),
    hints: z.array(z.string()).default([]),
    faded: fadedSpecSchema.nullish().default(null),
    source: sourceRefSchema.optional(),
    review: reviewSchema,
  })
  .strict()

export type Item = z.infer<typeof itemSchema>
export type ItemConstraint = z.infer<typeof constraintSchema>

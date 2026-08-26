import { z } from 'zod'

/** IDs are dot-separated lowercase segments (letters, digits, hyphens), at
 * least two segments: `alg1.linear.solve-one-step`, `...solve-one-step.007`.
 * IDs are immutable and never reused; renames are new IDs with `supersedes`. */
export const idSchema = z
  .string()
  .regex(
    /^[a-z0-9][a-z0-9-]*(\.[a-z0-9][a-z0-9-]*)+$/,
    'ids are dot-separated lowercase segments of [a-z0-9-]',
  )

export const skillIdSchema = idSchema
export const itemIdSchema = idSchema
export const explanationIdSchema = idSchema

/** Schemas stay JSON-pure (no transforms) so `z.toJSONSchema` can publish
 * them verbatim. YAML parsing quirks (bare dates → Date objects, unquoted
 * section/exercise numbers) are handled by `normalizeLoadedDoc` before
 * validation. */
export const sourceRefSchema = z
  .object({
    book: z.string().min(1),
    section: z.string().min(1),
    exercise: z.string().min(1).optional(),
  })
  .strict()

export const reviewSchema = z
  .object({
    status: z.enum(['draft', 'in_review', 'vetted']),
    by: z.string().optional(),
    date: z.iso.date().optional(),
  })
  .strict()

export type SourceRef = z.infer<typeof sourceRefSchema>
export type Review = z.infer<typeof reviewSchema>

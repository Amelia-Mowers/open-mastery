import { z } from 'zod'
import { explanationIdSchema, skillIdSchema, reviewSchema } from './common.ts'

/** Stepwise expectation: in worked/stepwise play the timeline PAUSES before
 * this step and the student must supply the move; the step's patch then
 * plays as confirmation. `value` is graded like an item answer of the same
 * type ('op' = "<move word> <operand>"). Autoplay (lesson rung) ignores it. */
export const stepExpectSchema = z
  .object({
    /** 'pick' = decomposition gate: click the equation-banner piece(s) this
     * step is about; value = the acceptable segment indices */
    type: z.enum(['op', 'expr', 'numeric', 'pick']),
    value: z.union([z.string(), z.number(), z.array(z.union([z.string(), z.number()]))]),
    /** question shown at the pause, e.g. "What move comes first?" */
    prompt: z.string().min(1).optional(),
    /** shown after a wrong try (second wrong try reveals the move) */
    hint: z.string().optional(),
  })
  .strict()

export const timelineStepSchema = z
  .object({
    t: z.number().min(0),
    patch: z.record(z.string(), z.unknown()).optional(),
    caption: z.string().optional(),
    handoff: z.object({ prompt: z.string().min(1) }).strict().optional(),
    expect: stepExpectSchema.optional(),
  })
  .strict()
  .refine(
    (s) => s.patch !== undefined || s.caption !== undefined || s.handoff !== undefined,
    'a timeline step needs at least one of patch, caption, handoff',
  )
  .refine(
    (s) => s.expect === undefined || s.patch !== undefined,
    'an expect step needs a patch — the confirmation the correct move plays',
  )
  .refine(
    (s) => s.expect === undefined || (s.expect.type === 'pick') === Array.isArray(s.expect.value),
    'pick expects take an array of segment indices; other expect types take a single value',
  )

export const explanationSchema = z
  .object({
    id: explanationIdSchema,
    skill: skillIdSchema,
    /** used to guarantee representation variety across correctives */
    representation: z.string().min(1),
    widget: z.string().min(1),
    params_from: z.literal('item').optional(),
    params: z.record(z.string(), z.union([z.number(), z.string()])).optional(),
    timeline: z.array(timelineStepSchema).min(1),
    review: reviewSchema,
  })
  .strict()
  .superRefine((e, ctx) => {
    for (let i = 1; i < e.timeline.length; i++) {
      if (e.timeline[i]!.t < e.timeline[i - 1]!.t) {
        ctx.addIssue({
          code: 'custom',
          path: ['timeline', i, 't'],
          message: 'timeline timestamps must be non-decreasing',
        })
      }
    }
  })

export type Explanation = z.infer<typeof explanationSchema>
export type TimelineStep = z.infer<typeof timelineStepSchema>
export type StepExpect = z.infer<typeof stepExpectSchema>

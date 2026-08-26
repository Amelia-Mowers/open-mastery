import { z } from 'zod'
import { explanationIdSchema, skillIdSchema, reviewSchema } from './common.ts'

export const timelineStepSchema = z
  .object({
    t: z.number().min(0),
    patch: z.record(z.string(), z.unknown()).optional(),
    caption: z.string().optional(),
    handoff: z.object({ prompt: z.string().min(1) }).strict().optional(),
  })
  .strict()
  .refine(
    (s) => s.patch !== undefined || s.caption !== undefined || s.handoff !== undefined,
    'a timeline step needs at least one of patch, caption, handoff',
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

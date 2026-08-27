import { z } from 'zod'
import { skillIdSchema, itemIdSchema, explanationIdSchema, sourceRefSchema } from './common.ts'

const prob = z.number().gt(0).lt(1)

export const bktDefaultsSchema = z
  .object({ L0: prob, T: prob, S: prob, G: prob })
  .strict()

/** Child-facing lesson preamble: what you're learning in plain words, plus
 * the vocabulary the formal name uses. */
export const preambleSchema = z
  .object({
    plain: z.string().min(1),
    vocab: z
      .array(z.object({ term: z.string().min(1), meaning: z.string().min(1) }).strict())
      .default([]),
  })
  .strict()

export const skillSchema = z
  .object({
    id: skillIdSchema,
    name: z.string().min(1),
    preamble: preambleSchema.optional(),
    prereqs: z.array(skillIdSchema).default([]),
    standards: z.array(z.string()).default([]),
    source: sourceRefSchema.optional(),
    bkt_defaults: bktDefaultsSchema,
    fluency: z.boolean().default(false),
    /** ordered; first entry is the primary lesson */
    instruction: z.array(explanationIdSchema).min(1),
    /** partially-completed items for the lesson phase */
    faded_examples: z.array(itemIdSchema).default([]),
    supersedes: skillIdSchema.optional(),
  })
  .strict()

export type Skill = z.infer<typeof skillSchema>

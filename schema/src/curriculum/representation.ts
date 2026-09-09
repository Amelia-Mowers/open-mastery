import { z } from 'zod'

/** A representation the lessons draw in (the `representation` field on an
 * explanation): its child-facing name and the ONE narrated sentence that
 * introduces the picture the first time a student ever meets it — "This
 * is a tape diagram. A bar cut into pieces…". Played as the beat before a
 * lesson's first frame, once per student per representation; later
 * lessons skip it unless the student scrubs back to it. */
export const representationSchema = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9-]*$/, 'kebab-case representation id'),
    name: z.string().min(1),
    intro: z.string().min(1),
  })
  .strict()

export type Representation = z.infer<typeof representationSchema>

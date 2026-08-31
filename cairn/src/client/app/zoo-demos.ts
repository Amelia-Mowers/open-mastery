/** FALLBACK demos only. The zoo's real demos are SINGLE-SOURCED from the
 * curriculum via /api/demos (one canonical explanation per widget type), so
 * they can never drift. This list exists solely for registry widgets the
 * curriculum has not adopted yet — each entry disappears the moment a
 * curriculum explanation uses its widget. */
import { explanationSchema, type Explanation } from '@openmastery/schema'
import type { Params } from './render'

export interface ZooDemo {
  title: string
  widget: string
  params: Params
  explanation: Explanation
  /** single-timeline view: representation-matched item */
  item?: {
    id: string
    params: Record<string, number | string>
    widget: { type: string; config?: Record<string, unknown> }
    fadedParams: Record<string, number | string>
    /** zoo ONLY: the key, so the review page can grade its own answer box
     * and a timeline can be played end to end. Never sent to the app. */
    answer?: { type: string; value: unknown; form?: string }
    /** zoo ONLY: so a reviewer can confirm a diagnosis fires */
    misconceptions?: Array<{ id: string; when: string; says: string }>
  } | null
  /** the check's first pick (hardest, raw) — the mastery gate this
   * timeline builds toward, shown on its zoo page */
  checkItem?: {
    id: string
    params: Record<string, number | string>
    widget: { type: string; config?: Record<string, unknown> }
    answer?: { type: string; value: unknown; form?: string }
    misconceptions?: Array<{ id: string; when: string; says: string }>
    difficulty?: number
  } | null
}

const exp = (id: string, widget: string, timeline: unknown[]): Explanation =>
  explanationSchema.parse({
    id: `zoo.demo.${id}`,
    skill: 'zoo.demo',
    representation: widget,
    widget,
    params_from: 'item',
    timeline,
    review: { status: 'vetted' },
  })

export const FALLBACK_DEMOS: ZooDemo[] = [
  {
    title: 'area-model — the distributive property by area (not yet in curriculum)',
    widget: 'area-model',
    params: { a: 3, b: 2, variable: 'x' },
    explanation: exp('area', 'area-model', [
      { t: 0, patch: { height: '{a}', parts: ['{variable}', '{b}'] }, caption: '{a}({variable} + {b}) as a rectangle.' },
      { t: 4, patch: { highlight: ['1'] }, caption: 'The first piece is {a} by {variable}.' },
      { t: 8, patch: { products: ['{a}{variable}', '{a*b}'], highlight: [] }, caption: '{a}({variable} + {b}) = {a}{variable} + {a*b}.' },
      { t: 10, handoff: { prompt: 'Replay' } },
    ]),
  },
]

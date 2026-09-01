/** Item selector (§5): eligible = unmastered skills with prereqs mastered
 * (∪ FSRS-due — arrives in build step 8). Runtime isomorphs come ONLY from
 * the item generator (total, grader-verified). Expected-correctness targeting
 * applies to practice only (lesson/faded exempt) and is the per-skill BKT
 * prediction in v1. */
import { generateParams, paramHash, type Item, type GeneratorSpec } from '@openmastery/schema'
import { predictCorrect, type BktParams } from './bkt.ts'
import { instanceKey } from './events.ts'
import type { StudentState } from './fold.ts'
import type { CurriculumIndex } from './curriculum.ts'
import { isCheckEligible } from './curriculum.ts'
import type { PolicyV1 } from './policy/v1.ts'

export interface ItemInstance {
  itemId: string
  params: Record<string, number | string>
  paramHash: string
}

/** Every item serves from a DISCRETE POOL of instances: the authored
 * params plus generator seeds 1..ISOMORPH_POOL-1. A closed pool makes
 * each instance a stable, repeatable problem — (itemId, paramHash) gets
 * observations across students, so per-problem difficulty is measurable
 * (an open seed space shows every instance once and can calibrate
 * nothing) — and makes complete pre-rendering (voice) and complete
 * validation (every servable instance swept) possible. */
export const ISOMORPH_POOL = 20

/** the pool's seeds, in canonical order (0 = the authored params) */
export function poolSeeds(): number[] {
  return Array.from({ length: ISOMORPH_POOL - 1 }, (_, i) => i + 1)
}

/** The authored instance if unused, else the first unblocked pool
 * isomorph, rotation offset by seedBase for session variety. */
export function instantiate(
  item: Item,
  blocked: ReadonlySet<string>,
  seedBase: number,
): ItemInstance | null {
  const authored = { itemId: item.id, params: item.params, paramHash: paramHash(item.params) }
  if (!blocked.has(instanceKey(authored.itemId, authored.paramHash))) return authored
  // a hand-authored pool replaces the generator: each listed instance is
  // a chosen problem (curated difficulty), walked in rotation
  const hand = (item as { isomorphs?: Array<Record<string, number | string>> }).isomorphs
  if (hand != null && hand.length > 0) {
    for (let i = 0; i < hand.length; i++) {
      const params = hand[(seedBase + i) % hand.length]!
      const hash = paramHash(params)
      if (!blocked.has(instanceKey(item.id, hash)))
        return { itemId: item.id, params, paramHash: hash }
    }
    return null
  }
  if (item.generator == null) return null
  const spec = item.generator as GeneratorSpec
  const fixed: Record<string, number | string> = {}
  for (const [k, v] of Object.entries(item.params)) if (!(k in spec)) fixed[k] = v
  const seeds = poolSeeds()
  for (let i = 0; i < seeds.length; i++) {
    const seed = seeds[(seedBase + i) % seeds.length]!
    const g = generateParams(spec, fixed, seed)
    if (!g.ok) return null // total by CI; a failing generator is a bundle bug
    const hash = paramHash(g.value)
    if (!blocked.has(instanceKey(item.id, hash)))
      return { itemId: item.id, params: g.value, paramHash: hash }
  }
  return null
}

/** Skills whose prerequisites are all mastered and that are not yet mastered.
 * A prereq counts as satisfied once mastery was GRANTED, even if it later
 * lapsed — mastery_granted is an explicit fact (§4.7), and a lapsed prereq is
 * surfaced by the corrective probe ("weakest unmastered-or-lapsed prereq"),
 * not by silently locking every dependent skill again. Prereqs outside the
 * bundle block eligibility (bundle CI prevents this). */
export function eligibleSkills(student: StudentState, cur: CurriculumIndex): string[] {
  return cur.skillOrder.filter((id) => {
    const skill = cur.skills.get(id)!
    const st = student.skills[id]
    if (st?.phase === 'mastered') return false
    return skill.prereqs.every((p) => {
      const ps = student.skills[p]
      return ps !== undefined && (ps.phase === 'mastered' || ps.masteredAt !== undefined)
    })
  })
}

/** Rank eligible skills: instruction phases (unseen/lesson/faded) first in
 * authored order, then practice skills by distance of the BKT-predicted
 * correctness from the target band. */
export function rankSkills(
  eligible: string[],
  student: StudentState,
  cur: CurriculumIndex,
  bkt: (skillId: string) => BktParams,
  pol: PolicyV1,
  /** session serve-seq of each skill's last serve — band ties go to the
   * LEAST recently served skill, which is what makes practice interleave */
  recency?: (skillId: string) => number,
  /** whether the skill's mastery check is on offer right now */
  checkOffered?: (skillId: string) => boolean,
): string[] {
  const [lo, hi] = pol.selector.expectedCorrectness
  const bandDistance = (id: string): number => {
    const st = student.skills[id]
    const phase = st?.phase ?? 'unseen'
    if (phase !== 'practice') return -1 // instruction phases are exempt and lead
    const par = bkt(id)
    const pc = predictCorrect(st?.p ?? par.L0, par)
    // A skill whose mastery is already past the finish line is NOT
    // "appropriately challenging" just because its predicted correctness
    // lands inside the band — it is finished, and only its check can
    // retire it. Left in the band it wins every tie-break (predicted
    // correctness tops out INSIDE [lo, hi], so p=1.0 scores a perfect 0)
    // and drills a learned skill forever while less-known ones wait.
    // Send it to the back; `nearlyDone` still holds the floor for one
    // bounded run so finishing beats rotating.
    const shown = (((st?.p ?? par.L0) - par.L0) / (0.95 - par.L0))
    if (shown >= pol.selector.finishAtP && checkOffered?.(id)) return Number.MAX_SAFE_INTEGER
    return pc < lo ? lo - pc : pc > hi ? pc - hi : 0
  }
  return [...eligible].sort((a, b) => {
    const da = bandDistance(a)
    const db = bandDistance(b)
    if (da !== db) return da - db
    if (recency) {
      const ra = recency(a)
      const rb = recency(b)
      if (ra !== rb) return ra - rb
    }
    return cur.skillOrder.indexOf(a) - cur.skillOrder.indexOf(b)
  })
}

/** Practice items for a skill: not faded examples, ordered by difficulty.
 * Rubric items participate in practice rotation (practice-only by rule). */
export function practiceItems(skillId: string, cur: CurriculumIndex): Item[] {
  return (cur.itemsBySkill.get(skillId) ?? []).filter((it) => it.faded == null)
}

/** Pick the next check base item: check-eligible, distinct from the base
 * items already used in this check. Checks are capstones — hardest first. */
export function nextCheckBaseItem(
  skillId: string,
  usedBaseItems: readonly string[],
  cur: CurriculumIndex,
): Item | null {
  const candidates = (cur.itemsBySkill.get(skillId) ?? []).filter(
    (it) => isCheckEligible(it) && !usedBaseItems.includes(it.id),
  )
  candidates.sort((a, b) => b.difficulty - a.difficulty || a.id.localeCompare(b.id))
  return candidates[0] ?? null
}

/** Practice difficulty ramp: map the skill's current p onto the pool's
 * difficulty range — low estimates get the easiest family, high estimates
 * the hardest (v1: difficulty still only orders items within a skill).
 *
 * The scale is [0, fadeAtP], not [0, 1], and tiers advance by FLOOR, not
 * round: the ceiling is reached when the scaffold fades (~3 unassisted
 * wins under the default BKT), never before. Rounding put the 2-tier
 * boundary at p = 0.5, which a SINGLE correct answer crosses (0.2 → 0.51)
 * — one win took the structured input away, which read as punishment.
 * The check still meets the hardest item regardless (hardest-first), so
 * practice holding support longer costs no mastery evidence. */
export function targetDifficulty(p: number, pool: readonly Item[], fadeAtP = 0.85): number {
  if (pool.length === 0) return 1
  const ds = pool.map((it) => it.difficulty)
  const lo = Math.min(...ds)
  const hi = Math.max(...ds)
  const scaled = Math.min(1, Math.max(0, p) / fadeAtP)
  return lo + Math.min(hi - lo, Math.floor((hi - lo) * scaled + 1e-9))
}

/** The weakest unmastered-or-lapsed prerequisite, or null when every prereq
 * is mastered and unlapsed (then the probe step is skipped). */
export function weakestPrereq(
  skillId: string,
  student: StudentState,
  cur: CurriculumIndex,
  bkt: (skillId: string) => BktParams,
): string | null {
  const skill = cur.skills.get(skillId)
  if (!skill) return null
  const candidates = skill.prereqs.filter((p) => {
    const st = student.skills[p]
    return st === undefined || st.phase !== 'mastered' || st.lapsed === true
  })
  if (candidates.length === 0) return null
  return candidates.reduce((weakest, p) => {
    const pw = student.skills[weakest]?.p ?? bkt(weakest).L0
    const pp = student.skills[p]?.p ?? bkt(p).L0
    return pp < pw ? p : weakest
  })
}

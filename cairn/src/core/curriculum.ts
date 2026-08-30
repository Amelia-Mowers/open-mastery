/** Read-side index over a curriculum bundle, shared by fold-adjacent code,
 * the selector, and the corrective policy. */
import type { Bundle, Skill, Item, Explanation } from '@openmastery/schema'

export interface CurriculumIndex {
  skills: Map<string, Skill>
  items: Map<string, Item>
  explanations: Map<string, Explanation>
  itemsBySkill: Map<string, Item[]>
  explanationsBySkill: Map<string, Explanation[]>
  /** stable skill order as authored (used for deterministic tie-breaks) */
  skillOrder: string[]
}

export function buildIndex(bundle: Bundle): CurriculumIndex {
  const skills = new Map(bundle.skills.map((s) => [s.id, s]))
  const items = new Map(bundle.items.map((i) => [i.id, i]))
  const explanations = new Map(bundle.explanations.map((e) => [e.id, e]))
  const itemsBySkill = new Map<string, Item[]>()
  for (const it of bundle.items)
    for (const sk of it.skills) {
      const list = itemsBySkill.get(sk) ?? []
      list.push(it)
      itemsBySkill.set(sk, list)
    }
  // deterministic within-skill order: difficulty then id (difficulty only
  // orders items within a skill in v1)
  for (const list of itemsBySkill.values())
    list.sort((a, b) => a.difficulty - b.difficulty || a.id.localeCompare(b.id))
  // PRIORITY ORDER: a skill's `instruction` list is the authored teaching
  // order — best representation first — and everything that picks an
  // explanation (first lesson, "show me differently", the corrective
  // ladder) reads this list in order. Explanations absent from
  // `instruction` follow, in file order.
  const explanationsBySkill = new Map<string, Explanation[]>()
  for (const e of bundle.explanations) {
    const list = explanationsBySkill.get(e.skill) ?? []
    list.push(e)
    explanationsBySkill.set(e.skill, list)
  }
  for (const [skillId, list] of explanationsBySkill) {
    const order = skills.get(skillId)?.instruction ?? []
    const rank = (e: Explanation): number => {
      const i = order.indexOf(e.id)
      return i === -1 ? order.length : i
    }
    list.sort((a, b) => rank(a) - rank(b))
  }
  return {
    skills,
    items,
    explanations,
    itemsBySkill,
    explanationsBySkill,
    skillOrder: bundle.skills.map((s) => s.id),
  }
}

/** Check-item eligibility (§4.1 CI rule, §5): generator-backed, non-choice,
 * non-rubric, not a faded example. */
export const isCheckEligible = (it: Item): boolean =>
  it.generator != null &&
  it.widget.type !== 'choice' &&
  // a STRUCTURED input hands over the form of the answer ([ ]x [±] [ ] says
  // "two terms, sign between") — legitimate scaffolding for practice,
  // weak evidence at the gate. Checks are capstones: raw only.
  it.widget.type !== 'term-input' &&
  it.answer.type !== 'choice' &&
  it.rubric == null &&
  it.faded == null

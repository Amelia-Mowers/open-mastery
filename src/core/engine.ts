/** The per-skill sequence engine (§5): lesson → faded → practice → mastery
 * check on unassisted isomorphs, with the corrective ladder woven in.
 *
 * Pure over plain data: the caller owns StudentState + SessionState and an
 * envelope-stamping function (the site server assigns siteSeq and site time;
 * simulations stamp synthetically). Every state change flows through emitted
 * events applied by the SAME reducer the server replays with — the engine
 * never mutates mastery state directly.
 */
import type { Env, Item } from '@openmastery/schema'
import { applyEvent, type StudentState } from './fold.ts'
import type { BktParams } from './bkt.ts'
import { instanceKey, type CairnEvent, type EventBody } from './events.ts'
import {
  applySkillAttempt,
  applyProbeResult,
  freshSkillSession,
  nextDirective,
  type SkillSession,
} from './corrective.ts'
import {
  eligibleSkills,
  instantiate,
  nextCheckBaseItem,
  practiceItems,
  rankSkills,
  targetDifficulty,
  weakestPrereq,
  type ItemInstance,
} from './select.ts'
import type { CurriculumIndex } from './curriculum.ts'
import { isCheckEligible } from './curriculum.ts'
import { gradeItem, type Verdict } from './graders.ts'
import type { PolicyV1 } from './policy/v1.ts'

export interface EngineCtx {
  cur: CurriculumIndex
  bkt: (skillId: string) => BktParams
  policy: PolicyV1
  /** wraps an EventBody in a server envelope (assigns siteSeq and site time) */
  stamp: (body: EventBody) => CairnEvent
}

export interface SessionState {
  bySkill: Record<string, SkillSession>
  /** instances served this session — never re-served (itemId, paramHash) */
  served: Set<string>
  currentSkill: string | null
  /** hint level offered on the next item, per skill (corrective miss 1) */
  pendingHint: Record<string, number>
  overlay:
    | null
    | { kind: 'alt_explanation'; skillId: string; explanationId: string; representation: string }
    | { kind: 'probe'; skillId: string; prereqId: string }
  check: null | { skillId: string; baseItemsUsed: string[]; passedInstanceIds: string[] }
}

export const freshSession = (): SessionState => ({
  bySkill: {},
  served: new Set(),
  currentSkill: null,
  pendingHint: {},
  overlay: null,
  check: null,
})

const skillSession = (session: SessionState, skillId: string): SkillSession =>
  (session.bySkill[skillId] ??= freshSkillSession())

export type NextAction =
  | { kind: 'lesson'; skillId: string; explanationId: string; representation: string }
  | { kind: 'alt_explanation'; skillId: string; explanationId: string; representation: string }
  | {
      kind: 'serve_item'
      itemKind: 'faded' | 'practice' | 'check' | 'probe'
      /** the skill the attempt will count against (prereq for probes) */
      skillId: string
      /** the skill being worked on (differs from skillId for probes) */
      forSkillId: string
      instance: ItemInstance
      /** show the item's representation scaffold (concreteness fading:
       * false once the mastery estimate clears policy.scaffolding.fadeAtP,
       * and always false for checks) */
      scaffolded: boolean
      offeredHintLevel?: number
      checkAvailable?: boolean
      checkIndex?: number
    }
  | { kind: 'session_done' }

// ---------- selection ----------

export interface NextOptions {
  /** student-chosen skill to work on; overrides ranking AND the parked
   * exclusion (soft parking: opt-in practice continues after a flag) */
  focusSkill?: string
}

export function nextAction(
  student: StudentState,
  session: SessionState,
  ctx: EngineCtx,
  opts: NextOptions = {},
): NextAction {
  const pol = ctx.policy

  if (session.overlay?.kind === 'alt_explanation') {
    const o = session.overlay
    return {
      kind: 'alt_explanation',
      skillId: o.skillId,
      explanationId: o.explanationId,
      representation: o.representation,
    }
  }

  if (session.overlay?.kind === 'probe') {
    const o = session.overlay
    const inst = instantiateFor(probeItemPool(o.prereqId, ctx), student, session, pol)
    if (inst) {
      return {
        kind: 'serve_item',
        itemKind: 'probe',
        skillId: o.prereqId,
        forSkillId: o.skillId,
        instance: inst,
        scaffolded: true,
      }
    }
    // no probe item available: drop the overlay and fall through
    session.overlay = null
  }

  if (session.check) {
    const c = session.check
    const base = nextCheckBaseItem(c.skillId, c.baseItemsUsed, ctx.cur)
    if (base) {
      const inst = instantiateFor([base], student, session, pol)
      if (inst) {
        return {
          kind: 'serve_item',
          itemKind: 'check',
          skillId: c.skillId,
          forSkillId: c.skillId,
          instance: inst,
          scaffolded: false,
          checkIndex: c.passedInstanceIds.length + 1,
        }
      }
    }
    // cannot continue the check (bundle bug caught by CI); abandon it
    session.check = null
  }

  // pick a skill
  const allEligible = eligibleSkills(student, ctx.cur)
  const unparked = allEligible.filter((id) => !skillSession(session, id).parked)
  const skillId =
    opts.focusSkill !== undefined && allEligible.includes(opts.focusSkill)
      ? opts.focusSkill
      : session.currentSkill !== null && unparked.includes(session.currentSkill)
        ? session.currentSkill
        : (rankSkills(unparked, student, ctx.cur, ctx.bkt, pol)[0] ?? null)
  if (skillId === null) return { kind: 'session_done' }

  const skill = ctx.cur.skills.get(skillId)!
  const st = student.skills[skillId]
  const phase = st?.phase ?? 'unseen'

  if (phase === 'unseen' || phase === 'lesson') {
    const explanationId = skill.instruction[0]!
    const rep = ctx.cur.explanations.get(explanationId)?.representation ?? 'unknown'
    return { kind: 'lesson', skillId, explanationId, representation: rep }
  }

  if (phase === 'faded') {
    for (const itemId of skill.faded_examples) {
      const item = ctx.cur.items.get(itemId)
      if (!item) continue
      const inst = instantiate(item, blockedSet(student, session), seedFor(session), pol.selector.isomorphSeedTries)
      if (inst) return serveWorkItem('faded', skillId, inst, student, session, ctx)
    }
    // no (more) faded examples: proceed to practice
  }

  const pool = practiceItems(skillId, ctx.cur)
  const inst = instantiateFor(pool, student, session, pol, skillId)
  if (!inst) return { kind: 'session_done' } // out of items (bundle bug)
  return serveWorkItem('practice', skillId, inst, student, session, ctx)
}

function serveWorkItem(
  itemKind: 'faded' | 'practice',
  skillId: string,
  instance: ItemInstance,
  student: StudentState,
  session: SessionState,
  ctx: EngineCtx,
): NextAction {
  const p = student.skills[skillId]?.p ?? ctx.bkt(skillId).L0
  const action: NextAction = {
    kind: 'serve_item',
    itemKind,
    skillId,
    forSkillId: skillId,
    instance,
    // faded examples always keep their scaffolding; practice fades it out
    scaffolded: itemKind === 'faded' || p < ctx.policy.scaffolding.fadeAtP,
  }
  const offered = session.pendingHint[skillId]
  if (offered !== undefined) action.offeredHintLevel = offered
  if (itemKind === 'practice') action.checkAvailable = checkAvailable(student, session, ctx, skillId)
  return action
}

/** Check gate (§5): p ≥ threshold OR N consecutive unassisted correct — and
 * the bundle can actually field the required distinct base items. */
export function checkAvailable(
  student: StudentState,
  session: SessionState,
  ctx: EngineCtx,
  skillId: string,
): boolean {
  const st = student.skills[skillId]
  if (!st || st.phase !== 'practice') return false
  const pol = ctx.policy
  const gate =
    st.p >= pol.check.pThreshold || st.consecUnassistedCorrect >= pol.check.consecUnassisted
  if (!gate) return false
  const bases = (ctx.cur.itemsBySkill.get(skillId) ?? []).filter(isCheckEligible)
  return bases.length >= pol.check.itemsRequired
}

const blockedSet = (student: StudentState, session: SessionState): Set<string> =>
  new Set([...session.served, ...student.assisted])

const seedFor = (session: SessionState): number => 1_000 + session.served.size * 97

function instantiateFor(
  pool: Item[],
  student: StudentState,
  session: SessionState,
  pol: PolicyV1,
  /** when set, ramp difficulty toward this skill's current p */
  rampSkillId?: string,
): ItemInstance | null {
  const blocked = blockedSet(student, session)
  // difficulty ramps with the mastery estimate; within a difficulty, rotate
  // item families least-served-first (variety — e.g. alternating sign
  // families)
  const p = rampSkillId !== undefined ? (student.skills[rampSkillId]?.p ?? 0) : 0
  const target = rampSkillId !== undefined ? targetDifficulty(p, pool) : null
  const servedCount = (itemId: string): number => {
    let n = 0
    for (const key of session.served) if (key.startsWith(`${itemId}#`)) n++
    return n
  }
  const ordered = [...pool].sort((a, b) => {
    if (target !== null) {
      const da = Math.abs(a.difficulty - target)
      const db = Math.abs(b.difficulty - target)
      if (da !== db) return da - db
    }
    return servedCount(a.id) - servedCount(b.id)
  })
  for (const item of ordered) {
    const inst = instantiate(item, blocked, seedFor(session), pol.selector.isomorphSeedTries)
    if (inst) return inst
  }
  return null
}

function probeItemPool(prereqId: string, ctx: EngineCtx): Item[] {
  const pool = practiceItems(prereqId, ctx.cur).filter((it) => it.rubric == null)
  return pool.filter(isCheckEligible).length > 0 ? pool.filter(isCheckEligible) : pool
}

// ---------- recording ----------

export interface AttemptSubmission {
  raw: string | string[]
  hintLevel: number
  latencyMs: number
}

export interface AttemptResult {
  verdict: Verdict
  correct: boolean
  events: CairnEvent[]
}

/** Grade and record an attempt for a serve_item action. Emits the attempt
 * event (plus mastery_granted / guide_flag when triggered), applies every
 * emitted event to the student state via the reducer, and advances the
 * session's corrective machine. */
export function recordAttempt(
  student: StudentState,
  session: SessionState,
  ctx: EngineCtx,
  action: Extract<NextAction, { kind: 'serve_item' }>,
  submission: AttemptSubmission,
): AttemptResult {
  const item = ctx.cur.items.get(action.instance.itemId)!
  const verdict = gradeItem(item, action.instance.params as Env, submission.raw)
  if (verdict.verdict === 'needs_llm') {
    // rubric grading is queued (build step 7); nothing enters the log yet
    return { verdict, correct: false, events: [] }
  }
  const correct = verdict.verdict === 'correct'
  // rubric-graded practice updates p at the hint-level-1 discount (§5)
  const isRubric = item.rubric != null
  const hintLevel = isRubric ? Math.max(1, submission.hintLevel) : submission.hintLevel
  const assisted = hintLevel > 0 || student.assisted.has(instanceKey(action.instance.itemId, action.instance.paramHash))

  const events: CairnEvent[] = []
  const emit = (body: EventBody): void => {
    const ev = ctx.stamp(body)
    events.push(ev)
    applyEvent(student, ev, ctx.bkt)
  }

  emit({
    kind: 'attempt',
    itemId: action.instance.itemId,
    paramHash: action.instance.paramHash,
    skillId: action.skillId,
    itemKind: action.itemKind,
    answer: submission.raw,
    correct,
    hintLevel,
    latencyMs: submission.latencyMs,
    assisted,
  })

  session.served.add(instanceKey(action.instance.itemId, action.instance.paramHash))
  delete session.pendingHint[action.skillId]
  session.currentSkill = action.forSkillId

  switch (action.itemKind) {
    case 'probe': {
      // attempt accounting goes to the prereq's own session
      const prereqSess = skillSession(session, action.skillId)
      session.bySkill[action.skillId] = applySkillAttempt(prereqSess, correct, assisted)
      const target = action.forSkillId
      const targetSess = skillSession(session, target)
      const { session: updated, outcome } = applyProbeResult(targetSess, correct, ctx.policy)
      session.bySkill[target] = updated
      if (outcome.kind === 'resume') {
        session.overlay = null
        // prereq confirmed: restart the miss ladder on the target skill
        session.bySkill[target] = { ...updated, consecMisses: 0 }
      } else if (outcome.kind === 'flag_and_park') {
        session.overlay = null
        session.currentSkill = null
        emit({ kind: 'guide_flag', reason: outcome.reason, skillId: target })
      }
      break
    }
    case 'check': {
      const c = session.check
      if (!c || c.skillId !== action.forSkillId) break // stale action
      const sess = skillSession(session, c.skillId)
      session.bySkill[c.skillId] = applySkillAttempt(sess, correct, assisted)
      // invariant: assisted attempts never satisfy the check (§5); the
      // selector never serves assisted instances here, this is the backstop
      if (correct && !assisted && hintLevel === 0) {
        c.passedInstanceIds.push(instanceKey(action.instance.itemId, action.instance.paramHash))
        c.baseItemsUsed.push(action.instance.itemId)
        if (c.passedInstanceIds.length >= ctx.policy.check.itemsRequired) {
          emit({ kind: 'mastery_granted', skillId: c.skillId, checkItemIds: c.passedInstanceIds })
          session.check = null
          session.currentSkill = null
        }
      } else {
        // failed check: back to practice; the check will come around again
        session.check = null
        if (!skillSession(session, action.forSkillId).parked)
          afterMiss(student, session, ctx, action.forSkillId, emit)
      }
      break
    }
    case 'faded':
    case 'practice': {
      const sess = skillSession(session, action.skillId)
      session.bySkill[action.skillId] = applySkillAttempt(sess, correct, assisted)
      // soft parking: opt-in practice on a parked skill escalates nothing —
      // the guide is already flagged
      if (!correct && !skillSession(session, action.skillId).parked)
        afterMiss(student, session, ctx, action.skillId, emit)
      break
    }
  }

  return { verdict, correct, events }
}

/** Corrective escalation after a miss (shared by practice/faded/check-fail). */
function afterMiss(
  student: StudentState,
  session: SessionState,
  ctx: EngineCtx,
  skillId: string,
  emit: (body: EventBody) => void,
): void {
  const sess = skillSession(session, skillId)
  const directive = nextDirective(sess, ctx.policy)
  switch (directive.kind) {
    case 'park': {
      session.bySkill[skillId] = { ...sess, parked: true }
      session.currentSkill = null
      delete session.pendingHint[skillId]
      emit({ kind: 'guide_flag', reason: directive.reason, skillId })
      break
    }
    case 'alt_explanation': {
      const seen = student.representationsViewed[skillId] ?? []
      const alt = (ctx.cur.explanationsBySkill.get(skillId) ?? []).find(
        (e) => !seen.includes(e.representation),
      )
      if (alt) {
        session.overlay = {
          kind: 'alt_explanation',
          skillId,
          explanationId: alt.id,
          representation: alt.representation,
        }
        session.bySkill[skillId] = { ...sess, altShown: true }
      } else {
        session.pendingHint[skillId] = Math.min(sess.consecMisses, ctx.policy.hints.maxLevel)
      }
      break
    }
    case 'prereq_probe': {
      const prereq = weakestPrereq(skillId, student, ctx.cur, ctx.bkt)
      if (prereq) {
        session.overlay = { kind: 'probe', skillId, prereqId: prereq }
      } else {
        session.pendingHint[skillId] = Math.min(sess.consecMisses, ctx.policy.hints.maxLevel)
      }
      break
    }
    case 'continue': {
      if (directive.offerHintLevel !== undefined)
        session.pendingHint[skillId] = directive.offerHintLevel
      break
    }
  }
}

/** Record an explanation view (lesson or corrective alternative). */
export function recordExplanationViewed(
  student: StudentState,
  session: SessionState,
  ctx: EngineCtx,
  args: { skillId: string; explanationId: string; completed: boolean },
): CairnEvent[] {
  const rep = ctx.cur.explanations.get(args.explanationId)?.representation ?? 'unknown'
  const ev = ctx.stamp({
    kind: 'explanation_viewed',
    explanationId: args.explanationId,
    skillId: args.skillId,
    completed: args.completed,
    representation: rep,
  })
  applyEvent(student, ev, ctx.bkt)
  if (
    args.completed &&
    session.overlay?.kind === 'alt_explanation' &&
    session.overlay.explanationId === args.explanationId
  ) {
    session.overlay = null
  }
  session.currentSkill = args.skillId
  return [ev]
}

/** Student accepts an offered mastery check. */
export function startCheck(
  student: StudentState,
  session: SessionState,
  ctx: EngineCtx,
  skillId: string,
): boolean {
  if (!checkAvailable(student, session, ctx, skillId)) return false
  session.check = { skillId, baseItemsUsed: [], passedInstanceIds: [] }
  return true
}

/** Record LLM help on an instance: marks it assisted; no transcript logged. */
export function recordLlmHelp(
  student: StudentState,
  ctx: EngineCtx,
  itemId: string,
  hash: string,
  turnCount: number,
): CairnEvent[] {
  const ev = ctx.stamp({ kind: 'llm_help', itemId, paramHash: hash, turnCount })
  applyEvent(student, ev, ctx.bkt)
  return [ev]
}

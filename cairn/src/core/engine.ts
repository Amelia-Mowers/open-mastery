/** The per-skill sequence engine (§5): lesson → faded → practice → mastery
 * check on unassisted isomorphs, with the corrective ladder woven in.
 *
 * Pure over plain data: the caller owns StudentState + SessionState and an
 * envelope-stamping function (the site server assigns siteSeq and site time;
 * simulations stamp synthetically). Every state change flows through emitted
 * events applied by the SAME reducer the server replays with — the engine
 * never mutates mastery state directly.
 */
import { paramHash, type Env, type Item } from '@openmastery/schema'
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
import { diagnose, gradeItem, type Verdict } from './graders.ts'
import type { PolicyV1 } from './policy/v1.ts'

export interface EngineCtx {
  cur: CurriculumIndex
  bkt: (skillId: string) => BktParams
  policy: PolicyV1
  /** wraps an EventBody in a server envelope (assigns siteSeq and site time) */
  stamp: (body: EventBody) => CairnEvent
  /** current site time (same coordinate as event `t`) — review due checks */
  now: () => number
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
  /** an item we interrupted to teach its representation — the very next
   * serve for that skill MUST be this instance, or the student watches a
   * tape lesson and then gets a balance problem */
  promised: null | { skillId: string; instance: ItemInstance }
  /** monotonically counts served items (recency for interleaving) */
  serveSeq: number
  /** items served since the last spaced review (cadence, §5) */
  sinceReview: number
}

export const freshSession = (): SessionState => ({
  bySkill: {},
  served: new Set(),
  currentSkill: null,
  pendingHint: {},
  overlay: null,
  check: null,
  promised: null,
  serveSeq: 0,
  sinceReview: 0,
})

const skillSession = (session: SessionState, skillId: string): SkillSession =>
  (session.bySkill[skillId] ??= freshSkillSession())

export type NextAction =
  | { kind: 'lesson'; skillId: string; explanationId: string; representation: string }
  | { kind: 'alt_explanation'; skillId: string; explanationId: string; representation: string }
  | {
      kind: 'serve_item'
      itemKind: 'led' | 'practice' | 'check' | 'probe' | 'review'
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
  /** testing/demo: honor focusSkill even when locked or already mastered */
  forceFocus?: boolean
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

  // ---- spaced review (§5): mastered skills come due on the FSRS clock;
  // interleave ~1 review per interleaveReviewEvery new items ----
  const now = ctx.now()
  const dueReviews = Object.entries(student.skills)
    .filter(([, st]) => st.phase === 'mastered' && st.fsrs !== undefined && st.fsrs.due <= now)
    .sort((a, b) => a[1].fsrs!.due - b[1].fsrs!.due)
    .map(([id]) => id)
  const reviewTurn = session.sinceReview >= pol.selector.interleaveReviewEvery

  // ---- pick a skill: blocked acquisition, interleaved consolidation.
  // Stay on the current skill only through ACQUISITION (lesson, faded, and
  // the first acquisitionRun practice serves — novices benefit from a short
  // blocked run); after that every serve re-ranks, and band ties go to the
  // least recently served skill, which interleaves the working set. ----
  const allEligible = eligibleSkills(student, ctx.cur)
  const unparked = allEligible.filter((id) => !skillSession(session, id).parked)
  // A skill close to mastery holds the floor until it is finished — but
  // only while finishing is actually available. A student who declines the
  // check would otherwise be pinned on one skill forever, so the hold
  // releases as soon as the check is on the table (the offer is the
  // student's to take) or the skill is parked.
  const nearlyDone = (id: string): boolean => {
    const st = student.skills[id]
    if (!st || st.phase === 'mastered') return false
    const L0 = ctx.bkt(id).L0
    const shown = (st.p - L0) / (0.95 - L0)
    if (shown < pol.selector.finishAtP) return false
    // The hold must be SELF-LIMITING. Releasing only when the check is on
    // offer pins the student forever on a skill whose check never comes —
    // one that cannot field the required distinct base items, or whose
    // check is repeatedly declined. Give finishing a bounded number of
    // extra serves, then rejoin the rotation.
    if (checkAvailable(student, session, ctx, id)) return false
    const sess = skillSession(session, id)
    return sess.practiceServes < pol.selector.acquisitionRun + pol.selector.finishGrace
  }
  const inAcquisition = (id: string): boolean => {
    const phase = student.skills[id]?.phase ?? 'unseen'
    return (
      phase === 'unseen' ||
      phase === 'lesson' ||
      (phase === 'practice' && skillSession(session, id).practiceServes < pol.selector.acquisitionRun)
    )
  }
  // working-set cap: never START a new skill while maxActiveSkills are
  // already underway (breadth with breathing room, not a lesson avalanche)
  const activeCount = Object.values(student.skills).filter((st) =>
    st.phase === 'lesson' || st.phase === 'practice',
  ).length
  const started = (id: string): boolean => (student.skills[id]?.phase ?? 'unseen') !== 'unseen'
  const capped =
    activeCount >= pol.selector.maxActiveSkills ? unparked.filter(started) : unparked
  const pickPool = capped.length > 0 ? capped : unparked
  const skillId =
    opts.focusSkill !== undefined &&
    (allEligible.includes(opts.focusSkill) ||
      (opts.forceFocus === true && ctx.cur.skills.has(opts.focusSkill)))
      ? opts.focusSkill
      : session.currentSkill !== null &&
          unparked.includes(session.currentSkill) &&
          (inAcquisition(session.currentSkill) || nearlyDone(session.currentSkill))
        ? session.currentSkill
        : (rankSkills(
            pickPool,
            student,
            ctx.cur,
            ctx.bkt,
            pol,
            (id) => skillSession(session, id).lastServedSeq,
            (id) => checkAvailable(student, session, ctx, id),
          )[0] ?? null)

  // a review is served on cadence, or whenever nothing else is eligible
  if (dueReviews.length > 0 && (reviewTurn || skillId === null) && opts.focusSkill === undefined) {
    for (const reviewSkill of dueReviews) {
      const inst = instantiateFor(practiceItems(reviewSkill, ctx.cur), student, session, pol, reviewSkill)
      if (inst) return serveWorkItem('review', reviewSkill, inst, student, session, ctx)
    }
  }
  if (skillId === null) return { kind: 'session_done' }

  const skill = ctx.cur.skills.get(skillId)!
  const st = student.skills[skillId]
  const phase = st?.phase ?? 'unseen'

  const seenReps = student.representationsViewed[skillId] ?? []

  if (phase === 'unseen' || phase === 'lesson') {
    // A lesson is always ABOUT the problem that follows it. Pick that
    // problem first, then teach ITS representation — otherwise the student
    // watches a tape lesson and gets a balance problem.
    const lead = instantiateFor(practiceItems(skillId, ctx.cur), student, session, pol, skillId)
    const leadRep = lead ? (ctx.cur.items.get(lead.itemId)?.representation ?? null) : null
    const byRep =
      leadRep !== null
        ? (ctx.cur.explanationsBySkill.get(skillId) ?? []).find((e) => e.representation === leadRep)
        : undefined
    const first =
      byRep ??
      (ctx.cur.explanationsBySkill.get(skillId) ?? []).find((e) => !seenReps.includes(e.representation)) ??
      ctx.cur.explanations.get(skill.instruction[0]!)!
    // hold the instance only when the lesson actually matches it
    if (lead && byRep) session.promised = { skillId, instance: lead }
    return { kind: 'lesson', skillId, explanationId: first.id, representation: first.representation }
  }

  const pool = practiceItems(skillId, ctx.cur)
  // LED: the lesson just played, so this problem is served with it replaying
  // above (the student finishes the last step). It is the first problem after
  // any lesson — including one reached via "show me another way".
  const sess0 = skillSession(session, skillId)
  const led = sess0.practiceServes === 0
  const wantFresh = led
  // an item we already promised (we interrupted it to teach its picture)
  // is served now, before any fresh pick — the lesson was ABOUT this item
  const promised = session.promised?.skillId === skillId ? session.promised.instance : null
  if (promised) session.promised = null
  // the faded phase normally wants a FRESH isomorph, but a promised item was
  // the subject of the lesson just watched — honouring it matters more
  // The problem is framed in the representation the student was just taught.
  // Rotation happens BETWEEN lessons — each new lesson introduces the next
  // picture and its problems follow it — never mid-run: taught the balance
  // and handed a tape problem is the bug, not the variety.
  //
  // The blocked run is where that holds. Once it is over the student has
  // seen the picture enough; the pool opens up again, which is what lets an
  // unseen representation surface and earn its own lesson.
  const inRun = sess0.practiceServes < pol.selector.acquisitionRun
  const lastRep = seenReps[seenReps.length - 1] ?? null
  const matching =
    inRun && lastRep !== null
      ? pool.filter((it) => (it.representation ?? null) === lastRep)
      : []
  const promisedMatches =
    promised !== null &&
    (!inRun ||
      lastRep === null ||
      (ctx.cur.items.get(promised.itemId)?.representation ?? null) === lastRep)
  const inst =
    (promisedMatches ? promised : null) ??
    (matching.length > 0
      ? instantiateFor(matching, student, session, pol, skillId, wantFresh)
      : null) ??
    (wantFresh ? instantiateFor(pool, student, session, pol, skillId, true) : null) ??
    instantiateFor(pool, student, session, pol, skillId)
  if (!inst) return { kind: 'session_done' } // out of items (bundle bug)

  // A REPRESENTATION IS NEVER MET COLD: if the item we are about to serve is
  // framed in a representation this student has not been taught, teach it
  // first. Cycling representations through practice is the point (varied
  // encoding beats repetition of one picture) — but an unseen picture is
  // instruction, not a test of it.
  const itemRep = ctx.cur.items.get(inst.itemId)?.representation ?? null
  if (itemRep !== null && !seenReps.includes(itemRep) && !led) {
    const teach = (ctx.cur.explanationsBySkill.get(skillId) ?? []).find(
      (e) => e.representation === itemRep,
    )
    if (teach) {
      // hold the instance so the lesson's own problem is what follows, and
      // restart the blocked run so the NEW picture gets its problems too
      session.promised = { skillId, instance: inst }
      skillSession(session, skillId).practiceServes = 0
      return { kind: 'lesson', skillId, explanationId: teach.id, representation: teach.representation }
    }
  }
  // the client plays the skill's explanation up to just before the
  // resolution with THIS instance's numbers, and the student finishes it
  return serveWorkItem(led ? 'led' : 'practice', skillId, inst, student, session, ctx)
}

function serveWorkItem(
  itemKind: 'led' | 'practice' | 'review',
  skillId: string,
  instance: ItemInstance,
  student: StudentState,
  session: SessionState,
  ctx: EngineCtx,
): NextAction {
  session.serveSeq += 1
  const sess = skillSession(session, skillId)
  sess.lastServedSeq = session.serveSeq
  // counts every WORK serve on this skill (led or plain) — it drives both
  // the blocked-acquisition run and whether the next one still gets a lead
  if (itemKind === 'led' || itemKind === 'practice') sess.practiceServes += 1
  session.sinceReview = itemKind === 'review' ? 0 : session.sinceReview + 1
  const p = student.skills[skillId]?.p ?? ctx.bkt(skillId).L0
  const action: NextAction = {
    kind: 'serve_item',
    itemKind,
    skillId,
    forSkillId: skillId,
    instance,
    // faded examples always keep their scaffolding; practice fades it out;
    // reviews are always raw (retrieval of the mastered, unscaffolded form)
    scaffolded: itemKind === 'led' || (itemKind === 'practice' && p < ctx.policy.scaffolding.fadeAtP),
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
  /** block each item's AUTHORED params — the faded phase must pose a
   * DIFFERENT problem than the lesson's example (which used the family's
   * authored numbers) */
  avoidAuthored = false,
): ItemInstance | null {
  const blocked = new Set(blockedSet(student, session))
  if (avoidAuthored) for (const item of pool) blocked.add(instanceKey(item.id, paramHash(item.params)))
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
  // Difficulty BANDS, not exact distance. As a hard first key it starved
  // the variety tiebreak completely: with items at difficulty 1 and 2 and
  // a target of 2, the harder item won every single comparison and the
  // student saw ONE representation for the rest of the skill (17 serves
  // straight, in the trace that caught this) — the "one picture repeated"
  // failure the whole rotation design exists to prevent. Items within a
  // band are equally appropriate, so rotation decides between them.
  const band = (it: Item): number =>
    target === null ? 0 : Math.abs(it.difficulty - target) <= pol.selector.difficultyBand ? 0 : 1
  const ordered = [...pool].sort((a, b) => {
    const ba = band(a)
    const bb = band(b)
    if (ba !== bb) return ba - bb
    const sa = servedCount(a.id)
    const sb = servedCount(b.id)
    if (sa !== sb) return sa - sb
    // still tied: the closer-to-target item is the better serve
    if (target !== null) return Math.abs(a.difficulty - target) - Math.abs(b.difficulty - target)
    return 0
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
  // a miss the author anticipated is named, not just marked wrong
  if (verdict.verdict === 'incorrect' && verdict.reason === undefined) {
    const raw = Array.isArray(submission.raw) ? submission.raw.join(',') : submission.raw
    const hit = diagnose(item.misconceptions, action.instance.params as Env, raw)
    if (hit) verdict.reason = hit.says
  }
  if (verdict.verdict === 'needs_llm') {
    // rubric grading is queued (build step 7); nothing enters the log yet
    return { verdict, correct: false, events: [] }
  }
  const correct = verdict.verdict === 'correct'
  // rubric-graded practice updates p at the hint-level-1 discount (§5)
  const isRubric = item.rubric != null
  // choice-TYPE answers (the choice widget, pick-the-operation scales,
  // choose-the-next-line boards …) carry a guessing floor far above the
  // per-skill G — like rubric grading, a correct one updates p at the
  // hint-level-1 discount (G_eff ≈ 0.6). Choice answers are never checks (§5).
  const discounted = isRubric || item.answer.type === 'choice'
  const hintLevel = discounted ? Math.max(1, submission.hintLevel) : submission.hintLevel
  const assisted = hintLevel > 0 || student.assisted.has(instanceKey(action.instance.itemId, action.instance.paramHash))

  const events: CairnEvent[] = []
  const emit = (body: EventBody): void => {
    const ev = ctx.stamp(body)
    events.push(ev)
    applyEvent(student, ev, ctx.bkt)
  }

  // §5 BKT→FSRS handoff: rate the review from correctness, help, and latency
  // against the skill's own running estimate; the rating rides ON the event
  // so the fold replays the FSRS update deterministically
  let rating: 'again' | 'hard' | 'good' | 'easy' | undefined
  if (action.itemKind === 'review') {
    const ema = student.skills[action.skillId]?.latencyEmaMs ?? ctx.policy.fsrs.defaultLatencyMs
    rating = !correct
      ? 'again'
      : assisted || submission.latencyMs > ctx.policy.fsrs.hardLatencyFactor * ema
        ? 'hard'
        : submission.latencyMs < ctx.policy.fsrs.easyLatencyFactor * ema
          ? 'easy'
          : 'good'
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
    ...(rating !== undefined ? { rating } : {}),
  })

  session.served.add(instanceKey(action.instance.itemId, action.instance.paramHash))
  delete session.pendingHint[action.skillId]
  if (action.itemKind !== 'review') session.currentSkill = action.forSkillId

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
    case 'review': {
      // a failed review lapses the mastery (§5): demote to practice, reset p,
      // require a fresh unassisted check to re-master. No corrective ladder —
      // the lapse IS the response. A passed review just pushed `due` out.
      if (!correct) emit({ kind: 'mastery_lapsed', skillId: action.skillId })
      break
    }
    case 'led':
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

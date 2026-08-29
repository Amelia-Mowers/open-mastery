/** SiteCore: the site server's whole behavior as a plain, browser-safe class.
 *
 * The HTTP dev server (src/server/dev.ts) is a thin JSON wrapper around this;
 * the GitHub-Pages demo (src/client/demo) wraps the SAME class in the browser
 * — "rolls its own instance of the backend". Every method returns
 * { status, body } so transports map results uniformly.
 *
 * Invariant 1 (clients never compute mastery) is preserved in spirit by the
 * demo: the ENGINE computes mastery, in whichever process hosts SiteCore.
 * What the demo deliberately gives up is answer-key secrecy — the bundle
 * ships to the browser. Demo builds only; real deployments keep this class
 * server-side.
 */
import { parseTemplate, templateIdentifiers, type Bundle, type Explanation } from '@openmastery/schema'
import { DAY_MS } from '../core/fsrs'
import {
  applyEvent,
  bktUpdate,
  buildIndex,
  checkAvailable,
  freshSession,
  initialStudentState,
  nextAction,
  policyV1,
  practiceItems,
  recordAttempt,
  recordExplanationViewed,
  restoreSession,
  startCheck,
  type BktParams,
  type CairnEvent,
  type EngineCtx,
  type EventBody,
  type NextAction,
  type SessionState,
  type StudentState,
} from '../core/index.ts'

export interface SiteResult {
  status: number
  body: unknown
}

interface StudentSlot {
  student: StudentState
  session: SessionState
  /** last action served to this student; attempts must resolve against it */
  pending: NextAction | null
  /** the serve the student JUST answered. `pending` is cleared when the
   * answer is graded, which left "Show me how" with no instance to render
   * — so after a wrong answer it either 409'd or fell back to the family's
   * numbers. Seeing the problem you just missed worked through, with YOUR
   * numbers, is the whole point of asking. */
  answered?: NextAction | null
  /** the skill the last serve worked on — departures are detected against it */
  lastSkill?: string | null
  /** "<skillId>:<rank>" milestones already announced (never repeat one) */
  milestonesShown?: Set<string>
}

/** Every identifier an explanation timeline's templates reference. */
function timelineIdentifiers(e: Explanation): Set<string> {
  const out = new Set<string>()
  const collect = (src: unknown): void => {
    if (typeof src !== 'string' || !src.includes('{')) return
    const p = parseTemplate(src)
    if (!p.ok) return
    for (const id of templateIdentifiers(p.value)) out.add(id)
  }
  for (const step of e.timeline) {
    collect(step.caption)
    collect(step.handoff?.prompt)
    for (const v of Object.values(step.patch ?? {})) collect(v)
  }
  return out
}

/** First candidate param set that can feed every template in the timeline. */
export function feedableParams(
  e: Explanation,
  candidates: Array<Record<string, number | string> | null>,
): Record<string, number | string> | null {
  const needed = timelineIdentifiers(e)
  for (const c of candidates) {
    if (!c) continue
    if ([...needed].every((id) => id in c)) return c
  }
  return null
}

/** Explanations are authored against a param FAMILY; an instance from a
 * different family (e.g. the raw -x = b item, which has no `a`) can't feed
 * the timeline — fall back to the family params so nothing renders as
 * literal `{a}` braces. */
export function paramsForExplanation(
  e: Explanation,
  instanceParams: Record<string, number | string> | null,
  familyParams: Record<string, number | string>,
): Record<string, number | string> {
  if (!instanceParams) return familyParams
  const needed = timelineIdentifiers(e)
  for (const id of needed) if (!(id in instanceParams)) return familyParams
  return instanceParams
}

const ok = (body: unknown): SiteResult => ({ status: 200, body })
const err = (status: number, error: string): SiteResult => ({ status, body: { error } })

export class SiteCore {
  private readonly bundle: Bundle
  readonly cur: ReturnType<typeof buildIndex>
  private readonly bktDefaults: Map<string, BktParams>
  private readonly fallback: BktParams = { L0: 0.3, T: 0.15, S: 0.1, G: 0.2 }
  private siteSeq = 0
  private siteTime = 0
  readonly log: CairnEvent[] = []
  private readonly slots = new Map<string, StudentSlot>()
  private readonly wallClock: () => number

  constructor(bundle: Bundle, opts: { now?: () => number; replay?: CairnEvent[] } = {}) {
    this.bundle = bundle
    this.cur = buildIndex(bundle)
    this.bktDefaults = new Map(bundle.skills.map((s) => [s.id, s.bkt_defaults as BktParams]))
    this.wallClock = opts.now ?? (() => Date.now())
    // Resume from a persisted event log (the demo's localStorage). The fold
    // rebuilds student state; the SESSION is then rebuilt from the same log,
    // because a reload continues the sitting rather than starting a new one
    // — without it the corrective ladder (hint → alternative representation
    // → prereq probe → park) was lost on every page load, so the struggling
    // student got plain practice with no help at all.
    const touched = new Set<string>()
    for (const ev of opts.replay ?? []) {
      this.log.push(ev)
      this.siteSeq = Math.max(this.siteSeq, ev.siteSeq)
      this.siteTime = Math.max(this.siteTime, ev.t)
      applyEvent(this.slot(ev.studentId).student, ev, this.bktFor())
      touched.add(ev.studentId)
    }
    for (const studentId of touched)
      restoreSession(
        this.slot(studentId).session,
        this.log.filter((e) => e.studentId === studentId),
        policyV1,
        { cur: this.cur, student: this.slot(studentId).student },
      )
  }

  private bktFor(): (skillId: string) => BktParams {
    return (skillId) => this.bktDefaults.get(skillId) ?? this.fallback
  }

  private slot(id: string): StudentSlot {
    let s = this.slots.get(id)
    if (!s) {
      s = { student: initialStudentState(), session: freshSession(), pending: null }
      this.slots.set(id, s)
    }
    return s
  }

  private now(): number {
    return Math.max(this.siteTime, this.wallClock())
  }

  private ctxFor(studentId: string): EngineCtx {
    return {
      cur: this.cur,
      bkt: this.bktFor(),
      policy: policyV1,
      now: () => this.now(),
      stamp: (body: EventBody): CairnEvent => {
        this.siteSeq += 1
        this.siteTime = Math.max(this.siteTime + 1, this.wallClock())
        const ev: CairnEvent = {
          ...body,
          siteSeq: this.siteSeq,
          deviceId: 'site',
          deviceSeq: this.siteSeq,
          coreVersion: 'core-dev',
          bundleVersion: 'bundle-dev',
          studentId,
          t: this.siteTime,
        }
        this.log.push(ev)
        this.onEvent?.(ev)
        return ev
      },
    }
  }

  /** transport hook: the demo persists each stamped event */
  onEvent: ((ev: CairnEvent) => void) | null = null

  /** Visible progress points, derived from the log (no rankings — personal
   * only, per invariant 3). Basis: mastery percent gained per skill
   * (highest estimate ever − L0; misses never subtract), +2 per completed
   * explanation (deduped), +10 per mastery. */
  pointsFor(studentId: string): number {
    const p = new Map<string, number>()
    const maxP = new Map<string, number>()
    const explained = new Set<string>()
    let flat = 0
    const bump = (skillId: string, value: number): void => {
      p.set(skillId, value)
      if (value > (maxP.get(skillId) ?? 0)) maxP.set(skillId, value)
    }
    for (const e of this.log) {
      if (e.studentId !== studentId) continue
      if (e.kind === 'attempt') {
        const prm = this.bktFor()(e.skillId)
        const prior = p.get(e.skillId) ?? prm.L0
        bump(e.skillId, bktUpdate(prior, e.correct, e.correct ? e.hintLevel : 0, prm))
      } else if (e.kind === 'mastery_granted') {
        bump(e.skillId, Math.max(p.get(e.skillId) ?? 0, 0.95))
        flat += 10
      } else if (e.kind === 'explanation_viewed' && e.completed && !explained.has(e.explanationId)) {
        explained.add(e.explanationId)
        flat += 2
      }
    }
    let pts = flat
    for (const [skillId, top] of maxP) {
      const L0 = this.bktFor()(skillId).L0
      pts += Math.max(0, Math.floor((top - L0) * 100))
    }
    return pts
  }

  /** A milestone is earned by LEAVING a skill with ground gained, not by
   * crossing a fixed number. The scheduler interleaves — it moves a student
   * off a skill mid-climb by design — and being moved should never feel
   * like a punt, so the departure itself is the trigger. The rank names how
   * far they got; the count per skill is whatever the student's path
   * produces (leave at 40%, return, leave at 70% → two milestones). */
  static readonly MILESTONE_RANKS: ReadonlyArray<{ min: number; name: string; blurb: string }> = [
    { min: 0.7, name: 'Nearly there', blurb: 'one good run from the check' },
    { min: 0.45, name: 'Real progress', blurb: 'you can do these with a little thought' },
    { min: 0.2, name: 'Getting it', blurb: 'the idea is landing' },
    { min: 0.0, name: 'Started', blurb: 'first steps on this one' },
  ]

  static milestoneRank(pct: number): { min: number; name: string; blurb: string } {
    return SiteCore.MILESTONE_RANKS.find((r) => pct >= r.min) ?? SiteCore.MILESTONE_RANKS[3]!
  }

  /** A held review is its own accomplishment: the student proved a memory
   * survived a gap, and the gap to the NEXT one just grew. FSRS already
   * knows both numbers — say them, so spaced repetition reads as strength
   * rather than as the app nagging. */
  private reviewHeld(
    studentId: string,
    skillId: string,
  ): { skillName: string; days: number; kept: number } | null {
    const st = this.slot(studentId)
    const sk = st.student.skills[skillId]
    if (!sk?.fsrs) return null
    const days = Math.max(1, Math.round((sk.fsrs.due - this.now()) / DAY_MS))
    return {
      skillName: this.cur.skills.get(skillId)?.name ?? skillId,
      days,
      kept: sk.reviewsHeld ?? 1,
    }
  }

  /** did this serve move the student OFF a skill they had made progress on?
   * If so, name what they earned there. Mastery has its own moment (the
   * stone), so a grant is never also a milestone. */
  private departureMilestone(
    studentId: string,
    leaving: string | null,
    arrivingAt: string | null,
  ): { name: string; blurb: string; pct: number; skillId: string; skillName: string } | null {
    if (leaving === null || arrivingAt === null || leaving === arrivingAt) return null
    const st = this.slot(studentId)
    const skill = st.student.skills[leaving]
    if (!skill || skill.phase === 'mastered') return null
    const pct = this.masteryOf(studentId, leaving)
    // Recognise EFFORT, not mastery. Gating on pct silenced the milestone
    // for exactly the student the rule exists for: one who answers wrong,
    // gets punted, and sits at pct = 0.00 on every skill — "the student
    // should never be punted without a reward". A skill genuinely worked
    // at has attempts on it; one merely glanced at and left does not.
    // ('Started' is the rank that covers the ground-but-no-progress case.)
    if ((skill.attempts ?? 0) < 1) return null
    const already = st.milestonesShown ?? new Set<string>()
    const rank = SiteCore.milestoneRank(pct)
    const key = `${leaving}:${rank.name}`
    if (already.has(key)) return null
    already.add(key)
    st.milestonesShown = already
    return {
      name: rank.name,
      blurb: rank.blurb,
      pct,
      skillId: leaving,
      skillName: this.cur.skills.get(leaving)?.name ?? leaving,
    }
  }

  /** the bar the student sees: progress from the skill's L0 toward the
   * mastery-grant floor (0.95) — a fresh skill reads 0, a mastered one 1.
   * Raw p is the model's number; this is the display's. */
  masteryOf(studentId: string, skillId: string): number {
    const p = this.slot(studentId).student.skills[skillId]?.p ?? this.bktFor()(skillId).L0
    const L0 = this.bktFor()(skillId).L0
    return Math.min(1, Math.max(0, (p - L0) / (0.95 - L0)))
  }

  // ---------- the endpoints ----------

  bundleView(): SiteResult {
    return ok({
      skills: this.bundle.skills.map((s) => ({
        id: s.id,
        name: s.name,
        prereqs: s.prereqs,
        standards: s.standards,
        preamble: s.preamble,
      })),
      items: this.bundle.items.length,
      explanations: this.bundle.explanations.length,
    })
  }

  /** the widget zoo's single source: one canonical demo per widget type */
  demosView(): SiteResult {
    const seen = new Set<string>()
    const demos: Array<{
      widget: string
      skillName: string
      params: Record<string, number | string>
      explanation: Explanation
    }> = []
    for (const skillId of this.cur.skillOrder) {
      const skill = this.cur.skills.get(skillId)!
      const all = this.cur.explanationsBySkill.get(skillId) ?? []
      const ordered = [
        ...skill.instruction
          .map((id) => all.find((e) => e.id === id))
          .filter((e): e is Explanation => e !== undefined),
        ...all.filter((e) => !skill.instruction.includes(e.id)),
      ]
      for (const e of ordered) {
        if (seen.has(e.widget)) continue
        const family = practiceItems(skillId, this.cur)[0]?.params ?? {}
        const params = feedableParams(e, [family])
        if (!params) continue
        seen.add(e.widget)
        demos.push({ widget: e.widget, skillName: skill.name, params, explanation: e })
      }
    }
    // full index: every timeline, grouped by widget — the zoo links each
    // one to its single-card view (?view=zoo&exp=<id>)
    const index: Record<string, Array<{ id: string; skillName: string; vetted: boolean }>> = {}
    for (const skillId of this.cur.skillOrder) {
      const skill = this.cur.skills.get(skillId)!
      for (const e of this.cur.explanationsBySkill.get(skillId) ?? []) {
        ;(index[e.widget] ??= []).push({
          id: e.id,
          skillName: skill.name,
          vetted: e.review.status === 'vetted',
        })
      }
    }
    return ok({ demos, index })
  }

  /** one explanation as a playable demo (family params) — review tooling.
   * Includes the trinity's other faces: a representation-matched item's
   * answer widget (input + faded preview), answer key stripped. */
  explanationDemo(id: string): SiteResult {
    const e = this.cur.explanations.get(id)
    if (!e) return err(404, `unknown explanation '${id}'`)
    const skill = this.cur.skills.get(e.skill)
    const family = practiceItems(e.skill, this.cur)[0]?.params ?? {}
    const params = feedableParams(e, [family]) ?? family
    const repMatches = practiceItems(e.skill, this.cur).filter(
      (it) => it.representation === e.representation,
    )
    // prefer the item whose ANSWER SPACE is this very widget (shows the
    // widget's own input role), else any item framed in this representation
    const repItem = repMatches.find((it) => it.widget.type === e.widget) ?? repMatches[0]
    const item = repItem
      ? {
          id: repItem.id,
          params: repItem.params,
          widget: repItem.widget,
          fadedParams: feedableParams(e, [repItem.params]) ?? params,
        }
      : null
    return ok({ widget: e.widget, skillName: skill?.name ?? e.skill, params, explanation: e, item })
  }

  next(studentId: string, focusSkill?: string | null, forceFocus = false): SiteResult {
    const st = this.slot(studentId)
    const ctx = this.ctxFor(studentId)
    const action = nextAction(
      st.student,
      st.session,
      ctx,
      focusSkill ? { focusSkill, ...(forceFocus ? { forceFocus: true } : {}) } : {},
    )
    st.pending = action
    // a new serve retires the previous problem — the walkthrough fallback
    // must never answer with the numbers of a problem already left behind
    st.answered = null
    const points = this.pointsFor(studentId)
    // did this serve move them off a skill they'd built something on?
    const arriving =
      action.kind === 'serve_item' || action.kind === 'lesson' || action.kind === 'alt_explanation'
        ? action.skillId
        : null
    const milestone = this.departureMilestone(studentId, st.lastSkill ?? null, arriving)
    if (arriving !== null) st.lastSkill = arriving
    if (action.kind === 'serve_item') {
      const item = this.cur.items.get(action.instance.itemId)!
      const { answer: _answer, ...safe } = item
      return ok({
        action,
        item: safe,
        points,
        mastery: this.masteryOf(studentId, action.skillId),
        ...(milestone ? { milestone } : {}),
      })
    }
    if (action.kind === 'lesson' || action.kind === 'alt_explanation') {
      const params = practiceItems(action.skillId, this.cur)[0]?.params ?? {}
      const skill = this.cur.skills.get(action.skillId)
      return ok({
        action,
        ...(milestone ? { milestone } : {}),
        explanation: this.cur.explanations.get(action.explanationId),
        params,
        skillName: skill?.name ?? action.skillId,
        // the preamble introduces a SKILL, so it rides only the first lesson
        // of that skill — later representation lessons are mid-skill teaching
        preamble:
          (st.student.representationsViewed[action.skillId] ?? []).length === 0
            ? skill?.preamble
            : undefined,
        totalReps: new Set(
          (this.cur.explanationsBySkill.get(action.skillId) ?? []).map((e) => e.representation),
        ).size,
        points,
      })
    }
    return ok({ action, points })
  }

  attempt(studentId: string, body: { raw?: string; hintLevel?: number; latencyMs?: number }): SiteResult {
    const st = this.slot(studentId)
    const pending = st.pending
    if (pending?.kind !== 'serve_item') return err(409, 'no item pending')
    const result = recordAttempt(st.student, st.session, this.ctxFor(studentId), pending, {
      raw: body.raw ?? '',
      hintLevel: body.hintLevel ?? 0,
      latencyMs: body.latencyMs ?? 0,
    })
    st.answered = pending
    st.pending = null
    return ok({
      verdict: result.verdict,
      correct: result.correct,
      emitted: result.events.map((e) => ({
        kind: e.kind,
        skillId: 'skillId' in e ? e.skillId : undefined,
      })),
      points: this.pointsFor(studentId),
      mastery: this.masteryOf(studentId, pending.skillId),
      // a review the student HELD — the memory survived the gap
      ...(pending.itemKind === 'review' && result.correct
        ? (() => {
            const held = this.reviewHeld(studentId, pending.skillId)
            return held ? { reviewHeld: held } : {}
          })()
        : {}),
      // the mastery moment must not be lost to interleaving: say so the
      // instant the qualifying PRACTICE answer lands, whatever skill serves
      // next (never for check items — that would re-offer mid-check)
      checkUnlocked:
        pending.itemKind === 'practice' &&
        checkAvailable(st.student, st.session, this.ctxFor(studentId), pending.skillId),
    })
  }

  explanationViewed(studentId: string): SiteResult {
    const st = this.slot(studentId)
    const pending = st.pending
    if (pending?.kind !== 'lesson' && pending?.kind !== 'alt_explanation')
      return err(409, 'no explanation pending')
    recordExplanationViewed(st.student, st.session, this.ctxFor(studentId), {
      skillId: pending.skillId,
      explanationId: pending.explanationId,
      completed: true,
    })
    st.pending = null
    return ok({ ok: true })
  }

  /** Record one move inside a stepwise problem. Telemetry, not mastery
   * evidence — the item's own attempt still carries that — so this never
   * touches the estimate and is safe to record freely. */
  stepAttempt(studentId: string, body: Record<string, unknown>): SiteResult {
    const need = ['itemId', 'paramHash', 'skillId', 'explanationId']
    for (const k of need) if (typeof body[k] !== 'string') return err(400, `${k} required`)
    if (typeof body['stepIndex'] !== 'number') return err(400, 'stepIndex required')
    const ev = this.ctxFor(studentId).stamp({
      kind: 'step_attempt',
      itemId: body['itemId'] as string,
      paramHash: body['paramHash'] as string,
      skillId: body['skillId'] as string,
      explanationId: body['explanationId'] as string,
      stepIndex: body['stepIndex'] as number,
      expectType: String(body['expectType'] ?? ''),
      answer: body['answer'] ?? null,
      correct: body['correct'] === true,
      revealed: body['revealed'] === true,
      ...(typeof body['misconceptionId'] === 'string'
        ? { misconceptionId: body['misconceptionId'] }
        : {}),
      latencyMs: typeof body['latencyMs'] === 'number' ? body['latencyMs'] : 0,
    })
    applyEvent(this.slot(studentId).student, ev, this.bktFor())
    return ok({ ok: true })
  }

  startCheck(studentId: string, skillId: unknown): SiteResult {
    const st = this.slot(studentId)
    const okStart =
      typeof skillId === 'string' && startCheck(st.student, st.session, this.ctxFor(studentId), skillId)
    if (okStart) st.pending = null
    return { status: okStart ? 200 : 409, body: { ok: okStart } }
  }

  /** The grade a skill belongs to, from its CCSS standard ids
   * ("CCSS.MATH.CONTENT.6.EE.B.7" → 6). Null when untagged or K/HS. */
  static gradeOf(standards: readonly string[]): number | null {
    for (const std of standards) {
      const m = /CCSS\.MATH\.CONTENT\.(\d)\./.exec(std)
      if (m) return Number(m[1])
    }
    return null
  }

  /** Grades the catalog can actually teach — what the picker may offer. */
  gradesAvailable(): number[] {
    const out = new Set<number>()
    for (const skill of this.cur.skills.values()) {
      const g = SiteCore.gradeOf(skill.standards ?? [])
      if (g !== null) out.add(g)
    }
    return [...out].sort((a, b) => a - b)
  }

  /** Place a student at a grade: everything BELOW it is assumed known, so
   * they start on their own grade instead of the bottom of the graph.
   * Not mastery — see the `placement` event. Skills they have already
   * worked are left alone. */
  place(studentId: string, grade: unknown): SiteResult {
    if (typeof grade !== 'number' || !Number.isInteger(grade) || grade < 1 || grade > 12)
      return err(400, 'grade must be an integer 1-12')
    const st = this.slot(studentId)
    const below: string[] = []
    for (const [id, skill] of this.cur.skills) {
      const g = SiteCore.gradeOf(skill.standards ?? [])
      if (g === null || g >= grade) continue
      const existing = st.student.skills[id]
      if (existing?.phase === 'mastered' || (existing?.attempts ?? 0) > 0) continue
      below.push(id)
    }
    const ev = this.ctxFor(studentId).stamp({ kind: 'placement', grade, skillIds: below })
    applyEvent(st.student, ev, this.bktFor())
    return ok({ grade, placed: below.length })
  }

  state(studentId: string): SiteResult {
    const st = this.slot(studentId)
    return ok({
      skills: Object.fromEntries(
        Object.entries(st.student.skills).map(([id, sk]) => [
          id,
          { ...sk, masteryPct: this.masteryOf(studentId, id) },
        ]),
      ),
      assisted: [...st.student.assisted],
      openFlags: st.student.openFlags,
      points: this.pointsFor(studentId),
    })
  }

  explain(
    studentId: string,
    q: {
      skill: string
      exclude?: string[]
      prefer?: string | null
      viewedFirst?: boolean
      /** the instance the CLIENT is showing; a lead fetched for an earlier
       * problem must not answer with that problem's numbers after the
       * student has moved on (the heading said one problem, the widget
       * another) */
      forParamHash?: string
    },
  ): SiteResult {
    const st = this.slot(studentId)
    const skill = this.cur.skills.get(q.skill)
    if (!skill) return err(404, `unknown skill '${q.skill}'`)
    const all = this.cur.explanationsBySkill.get(q.skill) ?? []
    const ordered = [
      ...skill.instruction.map((id) => all.find((e) => e.id === id)).filter((e) => e !== undefined),
      ...all.filter((e) => !skill.instruction.includes(e.id)),
    ]
    // the problem on screen is the pending serve, or — once it has been
    // graded — the one just answered, so a post-miss walkthrough still
    // renders with the numbers the student actually saw
    const pending =
      st.pending?.kind === 'serve_item' ? st.pending : (st.answered ?? st.pending)
    if (
      q.forParamHash !== undefined &&
      (pending?.kind !== 'serve_item' || pending.instance.paramHash !== q.forParamHash)
    )
      return err(409, 'that problem is no longer on screen')
    const instanceParams =
      pending?.kind === 'serve_item' && pending.skillId === q.skill ? pending.instance.params : null
    const familyParams = practiceItems(q.skill, this.cur)[0]?.params ?? {}
    const exclude = q.exclude ?? []
    const eligible = ordered
      .filter((e) => !exclude.includes(e.representation))
      .map((e) => ({ e, params: feedableParams(e, [instanceParams, familyParams]) }))
      .filter((x): x is { e: Explanation; params: Record<string, number | string> } => x.params !== null)
    // The faded lead replays the representation the student was JUST taught,
    // not the first one they ever saw — after rotating to the tape lesson,
    // leading with the balance is exactly the "tape lesson, scale practice"
    // mismatch. (Both are "the representation of their lesson"; which lesson
    // is the point.)
    const seenList = st.student.representationsViewed[q.skill] ?? []
    const firstRep = q.viewedFirst === true ? (seenList[seenList.length - 1] ?? null) : null
    const chosen =
      (firstRep ? eligible.find((x) => x.e.representation === firstRep) : undefined) ??
      (q.prefer ? eligible.find((x) => x.e.representation === q.prefer) : undefined) ??
      eligible[0] ??
      null
    return ok({
      explanation: chosen?.e ?? null,
      params: chosen?.params ?? familyParams,
      // honest labeling: only claim "same numbers" when the walkthrough
      // really renders with the pending instance's params
      sameNumbers: chosen !== null && instanceParams !== null && chosen.params === instanceParams,
      skillName: skill.name,
      totalReps: new Set(all.map((e) => e.representation)).size,
    })
  }

  explained(studentId: string, body: { explanationId?: string; skillId?: string }): SiteResult {
    const st = this.slot(studentId)
    const expl = body.explanationId ? this.cur.explanations.get(body.explanationId) : undefined
    if (!expl || typeof body.skillId !== 'string')
      return err(400, 'explanationId and skillId required')
    const ev = this.ctxFor(studentId).stamp({
      kind: 'explanation_viewed',
      explanationId: expl.id,
      skillId: body.skillId,
      completed: true,
      representation: expl.representation,
    })
    applyEvent(st.student, ev, this.bktFor())
    return ok({ ok: true, points: this.pointsFor(studentId) })
  }

  /** Guide roster (build step 6, v1): every student's phases, mastery bars,
   * and open flags — for guides, never shown to students (invariant 3 bans
   * student-visible comparisons; the real server gates this behind guide
   * auth in step 5's successor). */
  guideView(): SiteResult {
    const skillName = (id: string): string => this.cur.skills.get(id)?.name ?? id
    const lastActive = new Map<string, number>()
    for (const e of this.log) lastActive.set(e.studentId, e.t)
    const students = [...this.slots.entries()]
      // a slot with no activity (e.g. the viewer's own fresh session) isn't
      // a roster row yet
      .filter(([id, slot]) => Object.keys(slot.student.skills).length > 0 || slot.student.openFlags.length > 0 || lastActive.has(id))
      .map(([id, slot]) => {
        const skills = Object.entries(slot.student.skills)
          .filter(([, st]) => st.phase !== 'unseen')
          .map(([sid, st]) => ({
            skillId: sid,
            name: skillName(sid),
            phase: st.phase,
            masteryPct: this.masteryOf(id, sid),
            lapsed: st.lapsed === true,
          }))
        return {
          id,
          points: this.pointsFor(id),
          mastered: skills.filter((k) => k.phase === 'mastered').length,
          working: skills.filter((k) => k.phase !== 'mastered'),
          flags: slot.student.openFlags.map((f) => ({
            reason: f.reason,
            skillId: f.skillId ?? null,
            skillName: f.skillId ? skillName(f.skillId) : null,
            t: f.t,
          })),
          lastActive: lastActive.get(id) ?? 0,
        }
      })
      .sort((a, b) => b.flags.length - a.flags.length || a.id.localeCompare(b.id))
    return ok({ students, totalSkills: this.bundle.skills.length })
  }

  /** wipe EVERY student — the demo's "start over", where there are no
   * accounts to preserve and per-student surgery only invites drift */
  clear(): void {
    this.slots.clear()
    this.log.length = 0
  }

  reset(studentId: string): SiteResult {
    this.slots.delete(studentId) // takes lastSkill + milestonesShown with it
    for (let i = this.log.length - 1; i >= 0; i--)
      if (this.log[i]!.studentId === studentId) this.log.splice(i, 1)
    return ok({ ok: true })
  }

  events(studentId: string): SiteResult {
    return ok({ events: this.log.filter((e) => e.studentId === studentId) })
  }
}

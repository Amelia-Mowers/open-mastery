/** state = fold(core, events by siteSeq)  (§4.7)
 *
 * The fold reads model parameters (BKT numbers — retuning them may shift `p`
 * on rebuild) but NEVER policy constants, so policy changes have no replay
 * consequences. `mastery_granted` is an explicit fact: it survives retuning.
 * Folds read `t` from the envelope and never query a clock. The fold
 * tolerates siteSeq gaps (deletion).
 *
 * Reducer version: reducer/v1. Changing what this file computes from old
 * events is an explicit versioned migration, never an edit of events.
 */
import { fsrsInit, fsrsReview, type FsrsState } from './fsrs.ts'
import { bktUpdate, type BktParams } from './bkt.ts'
import { instanceKey, type CairnEvent } from './events.ts'

export const REDUCER_VERSION = 'reducer/v1'

/** mastery_granted floors p here; a reducer constant (not policy — the fold
 * must replay identically regardless of the policy module in force). */
const GRANT_P_FLOOR = 0.95
const LAPSE_P = 0.7

/** A skill's life. 'faded' used to sit between lesson and practice, back
 * when the first problem after a lesson was a special worked-example kind.
 * Stepwise made every problem that thing — the lead plays, the student
 * finishes it — so the phase was a duplicate of what practice already is. */
export type Phase = 'unseen' | 'lesson' | 'practice' | 'mastered'

export interface SkillState {
  p: number
  attempts: number
  lastCorrect?: number
  phase: Phase
  /** consecutive unassisted correct answers (read model for the check gate) */
  consecUnassistedCorrect: number
  masteredAt?: number
  lapsed?: boolean
  fsrs?: FsrsState
  /** running latency estimate (EMA) — the §5 rating's "skill median" proxy */
  latencyEmaMs?: number
  /** reviews this skill has HELD (correct at review time) — the streak the
   * student is shown; a lapse resets it, because the memory did not hold */
  reviewsHeld?: number
  /** reached 'mastered' by PLACEMENT (the student declared a grade), not
   * by passing a check. No stone is awarded for these, and nothing may
   * present them as evidence of mastery. */
  placed?: boolean
}

export interface StudentState {
  skills: Record<string, SkillState>
  /** the skill whose lesson was watched most recently. Event-derived, so
   * it survives a reload — `session.currentSkill` does not, and without it
   * a student who reloaded right after a lesson was re-ranked onto a
   * DIFFERENT skill and never got the problem the lesson was about. */
  lastTaught?: string | null
  /** instances (itemId#paramHash) that ever received assistance */
  assisted: Set<string>
  /** representations of completed explanations, per skill (corrective variety) */
  representationsViewed: Record<string, string[]>
  /** the grade the student placed into at sign-in, if any */
  placedGrade?: number
  /** open guide flags (read model for the dashboard) */
  openFlags: Array<{ reason: string; skillId?: string; t: number }>
  deleted: boolean
}

export type ParamsFor = (skillId: string) => BktParams

export function initialStudentState(): StudentState {
  return {
    skills: {},
    assisted: new Set(),
    representationsViewed: {},
    openFlags: [],
    deleted: false,
  }
}

function skillState(state: StudentState, skillId: string, params: ParamsFor): SkillState {
  let s = state.skills[skillId]
  if (!s) {
    s = {
      p: params(skillId).L0,
      attempts: 0,
      phase: 'unseen',
      consecUnassistedCorrect: 0,
    }
    state.skills[skillId] = s
  }
  return s
}

const atLeastPhase = (current: Phase, target: Phase): Phase => {
  const order: Phase[] = ['unseen', 'lesson', 'practice', 'mastered']
  return order.indexOf(target) > order.indexOf(current) ? target : current
}

/** Mutating single-event application. Exposed for the engine, which folds its
 * own emitted events through the same reducer the server replays with. */
export function applyEvent(state: StudentState, ev: CairnEvent, params: ParamsFor): void {
  switch (ev.kind) {
    case 'attempt': {
      const s = skillState(state, ev.skillId, params)
      s.attempts += 1
      // Assistance is measured by hints TAKEN, nothing else. The old
      // maximal-assistance discount for a "led" serve assumed the
      // walkthrough played every step but the last — true of the retired
      // faded examples, false of stepwise, where the student constructs
      // each step. Discounting that penalised the work they did.
      s.p = bktUpdate(s.p, ev.correct, ev.correct ? ev.hintLevel : 0, params(ev.skillId))
      s.latencyEmaMs =
        s.latencyEmaMs === undefined ? ev.latencyMs : 0.7 * s.latencyEmaMs + 0.3 * ev.latencyMs
      if (ev.itemKind === 'review' && ev.rating !== undefined && s.fsrs !== undefined)
        s.fsrs = fsrsReview(s.fsrs, ev.rating, ev.t)
      if (ev.itemKind === 'review') s.reviewsHeld = ev.correct ? (s.reviewsHeld ?? 0) + 1 : 0
      if (ev.correct) s.lastCorrect = ev.t
      s.consecUnassistedCorrect = ev.correct && !ev.assisted ? s.consecUnassistedCorrect + 1 : 0
      if (ev.assisted) state.assisted.add(instanceKey(ev.itemId, ev.paramHash))
      if (s.phase !== 'mastered' && ev.itemKind !== 'probe')
        s.phase = atLeastPhase(s.phase, 'practice')
      break
    }
    case 'explanation_viewed': {
      const s = skillState(state, ev.skillId, params)
      if (ev.completed) {
        // MOST-RECENT-LAST: the tail is "the representation they were just
        // taught", which the scaffolded lead replays and the next item
        // is chosen to match. Re-viewing an earlier one moves it to the end,
        // so "show me differently" actually changes what comes next.
        const reps = (state.representationsViewed[ev.skillId] ??= [])
        const at = reps.indexOf(ev.representation)
        if (at !== -1) reps.splice(at, 1)
        reps.push(ev.representation)
        state.lastTaught = ev.skillId
        if (s.phase === 'unseen' || s.phase === 'lesson') s.phase = 'practice'
      } else if (s.phase === 'unseen') {
        s.phase = 'lesson'
      }
      break
    }
    case 'llm_help': {
      state.assisted.add(instanceKey(ev.itemId, ev.paramHash))
      break
    }
    case 'mastery_granted': {
      const s = skillState(state, ev.skillId, params)
      s.phase = 'mastered'
      s.p = Math.max(s.p, GRANT_P_FLOOR)
      s.masteredAt = ev.t
      s.lapsed = false
      // the skill enters spaced review (a re-grant after a lapse re-enters
      // fresh — v1 does not carry pre-lapse stability across)
      s.fsrs = fsrsInit('good', ev.t)
      break
    }
    case 'placement': {
      // A declared starting point, not earned mastery. `placed` marks how
      // the phase was reached so the UI never shows a stone the student
      // did not earn, and masteredAt satisfies the prereq gate in
      // eligibleSkills so the grade's own skills are actually reachable.
      // p sits at the grant floor because the assumption IS "you know
      // this"; a review or prereq probe can still disconfirm it.
      for (const skillId of ev.skillIds) {
        const s = skillState(state, skillId, params)
        if (s.phase === 'mastered' || s.attempts > 0) continue
        s.phase = 'mastered'
        s.p = Math.max(s.p, GRANT_P_FLOOR)
        s.masteredAt = ev.t
        s.placed = true
      }
      state.placedGrade = ev.grade
      break
    }
    case 'mastery_lapsed': {
      const s = skillState(state, ev.skillId, params)
      s.phase = 'practice'
      s.p = LAPSE_P
      s.lapsed = true
      s.consecUnassistedCorrect = 0
      break
    }
    case 'guide_flag': {
      state.openFlags.push(
        ev.skillId === undefined
          ? { reason: ev.reason, t: ev.t }
          : { reason: ev.reason, skillId: ev.skillId, t: ev.t },
      )
      break
    }
    case 'student_deleted': {
      state.deleted = true
      break
    }
    // hint (free — never consumes an attempt), signal, guide_intervention,
    // session, clock_set: no mastery-model effect
    case 'hint':
    case 'signal':
    case 'guide_intervention':
    case 'session':
    case 'clock_set':
      break
  }
}

/** Fold a student's event log. Orders by siteSeq; gaps are fine. */
export function foldStudent(events: readonly CairnEvent[], params: ParamsFor): StudentState {
  const state = initialStudentState()
  for (const ev of [...events].sort((a, b) => a.siteSeq - b.siteSeq))
    applyEvent(state, ev, params)
  return state
}

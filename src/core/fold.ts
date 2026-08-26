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
import { bktUpdate, type BktParams } from './bkt.ts'
import { instanceKey, type CairnEvent } from './events.ts'

export const REDUCER_VERSION = 'reducer/v1'

/** mastery_granted floors p here; a reducer constant (not policy — the fold
 * must replay identically regardless of the policy module in force). */
const GRANT_P_FLOOR = 0.95
const LAPSE_P = 0.7

export type Phase = 'unseen' | 'lesson' | 'faded' | 'practice' | 'mastered'

export interface SkillState {
  p: number
  attempts: number
  lastCorrect?: number
  phase: Phase
  /** consecutive unassisted correct answers (read model for the check gate) */
  consecUnassistedCorrect: number
  masteredAt?: number
  lapsed?: boolean
  fsrs?: { stability: number; difficulty: number; due: number }
}

export interface StudentState {
  skills: Record<string, SkillState>
  /** instances (itemId#paramHash) that ever received assistance */
  assisted: Set<string>
  /** representations of completed explanations, per skill (corrective variety) */
  representationsViewed: Record<string, string[]>
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
  const order: Phase[] = ['unseen', 'lesson', 'faded', 'practice', 'mastered']
  return order.indexOf(target) > order.indexOf(current) ? target : current
}

/** Mutating single-event application. Exposed for the engine, which folds its
 * own emitted events through the same reducer the server replays with. */
export function applyEvent(state: StudentState, ev: CairnEvent, params: ParamsFor): void {
  switch (ev.kind) {
    case 'attempt': {
      const s = skillState(state, ev.skillId, params)
      s.attempts += 1
      s.p = bktUpdate(s.p, ev.correct, ev.correct ? ev.hintLevel : 0, params(ev.skillId))
      if (ev.correct) s.lastCorrect = ev.t
      s.consecUnassistedCorrect = ev.correct && !ev.assisted ? s.consecUnassistedCorrect + 1 : 0
      if (ev.assisted) state.assisted.add(instanceKey(ev.itemId, ev.paramHash))
      if (s.phase !== 'mastered') {
        if (ev.itemKind === 'faded' && ev.correct) s.phase = atLeastPhase(s.phase, 'practice')
        else if (ev.itemKind === 'faded') s.phase = atLeastPhase(s.phase, 'faded')
        else if (ev.itemKind !== 'probe') s.phase = atLeastPhase(s.phase, 'practice')
      }
      break
    }
    case 'explanation_viewed': {
      const s = skillState(state, ev.skillId, params)
      if (ev.completed) {
        const reps = (state.representationsViewed[ev.skillId] ??= [])
        if (!reps.includes(ev.representation)) reps.push(ev.representation)
        if (s.phase === 'unseen' || s.phase === 'lesson') s.phase = 'faded'
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

/** Synthetic-student simulations (§10): student models drive core end to end.
 * The driver plays the client+server loop; models decide answers. */
import { renderTemplate, mulberry32, type Env } from '@openmastery/schema'
import type { StudentState } from '../../src/core/fold'
import {
  nextAction,
  recordAttempt,
  recordExplanationViewed,
  startCheck,
  freshSession,
  type EngineCtx,
  type NextAction,
  type SessionState,
} from '../../src/core/engine'
import { initialStudentState } from '../../src/core/fold'

export interface StudentModel {
  /** answer for a served item; the correct rendering is provided */
  answer(action: Extract<NextAction, { kind: 'serve_item' }>, correctRaw: string): {
    raw: string
    hintLevel: number
  }
  acceptCheck: boolean
}

export function correctAnswerFor(
  ctx: EngineCtx,
  action: Extract<NextAction, { kind: 'serve_item' }>,
): string {
  const item = ctx.cur.items.get(action.instance.itemId)!
  const r = renderTemplate(item.answer.value as string, action.instance.params as Env, {
    numberStyle: 'fraction',
  })
  if (!r.ok) throw new Error(`answer template failed: ${r.error.message}`)
  return r.value
}

export interface RunResult {
  student: StudentState
  session: SessionState
  actions: NextAction[]
  /** instanceKeys actually attempted, in order */
  attempted: string[]
  steps: number
}

/** Drive an existing student/session until session_done, maxSteps, or a
 * custom stop condition. */
export function runLoop(
  student: StudentState,
  session: SessionState,
  ctx: EngineCtx,
  model: StudentModel,
  maxSteps = 300,
  until?: (student: StudentState) => boolean,
): Omit<RunResult, 'student' | 'session'> {
  const actions: NextAction[] = []
  const attempted: string[] = []
  let steps = 0
  for (; steps < maxSteps; steps++) {
    if (until?.(student)) break
    const a = nextAction(student, session, ctx)
    actions.push(a)
    if (a.kind === 'session_done') break
    if (a.kind === 'lesson' || a.kind === 'alt_explanation') {
      recordExplanationViewed(student, session, ctx, {
        skillId: a.skillId,
        explanationId: a.explanationId,
        completed: true,
      })
      continue
    }
    // serve_item
    if (a.checkAvailable && model.acceptCheck && !session.check) {
      startCheck(student, session, ctx, a.forSkillId)
      continue // next loop iteration serves the first check item
    }
    const { raw, hintLevel } = model.answer(a, correctAnswerFor(ctx, a))
    attempted.push(`${a.instance.itemId}#${a.instance.paramHash}`)
    recordAttempt(student, session, ctx, a, {
      raw,
      hintLevel: a.itemKind === 'check' ? 0 : hintLevel,
      latencyMs: 4000,
    })
  }
  return { actions, attempted, steps }
}

/** Run one full session from scratch. */
export function runSession(ctx: EngineCtx, model: StudentModel, maxSteps = 300): RunResult {
  const student = initialStudentState()
  const session = freshSession()
  const r = runLoop(student, session, ctx, model, maxSteps)
  return { student, session, ...r }
}

export const alwaysCorrect: StudentModel = {
  answer: (_a, correctRaw) => ({ raw: correctRaw, hintLevel: 0 }),
  acceptCheck: true,
}

export const alwaysWrong: StudentModel = {
  answer: () => ({ raw: '999999', hintLevel: 0 }),
  acceptCheck: true,
}

/** Correct only with a hint; helpless unassisted (so every check fails). */
export const hintDependent: StudentModel = {
  answer: (a, correctRaw) =>
    a.itemKind === 'check' ? { raw: '999999', hintLevel: 0 } : { raw: correctRaw, hintLevel: 1 },
  acceptCheck: true,
}

export const guesser = (seed: number, pCorrect = 0.25): StudentModel => {
  const rng = mulberry32(seed)
  return {
    answer: (_a, correctRaw) =>
      rng() < pCorrect ? { raw: correctRaw, hintLevel: 0 } : { raw: '999999', hintLevel: 0 },
    acceptCheck: true,
  }
}

/** Gets better with every exposure to a skill. */
export const slowLearner = (seed: number): StudentModel => {
  const rng = mulberry32(seed)
  const exposures: Record<string, number> = {}
  return {
    answer: (a, correctRaw) => {
      const n = (exposures[a.skillId] = (exposures[a.skillId] ?? 0) + 1)
      const p = Math.min(0.97, 0.3 + 0.2 * (n - 1))
      return rng() < p ? { raw: correctRaw, hintLevel: 0 } : { raw: '999999', hintLevel: 0 }
    },
    acceptCheck: true,
  }
}

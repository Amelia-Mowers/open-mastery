/** Synthetic-class seeding: drive SiteCore with archetype student models so
 * a guide dashboard has a real roster to show (demo + dev convenience — the
 * §10 simulation machinery pointed at the site surface instead of the engine
 * directly). Deterministic per student name. */
import { mulberry32, renderTemplate, type Env } from '@openmastery/schema'
import type { NextAction } from '../core/index.ts'
import type { SiteCore } from './core.ts'

export interface Archetype {
  /** probability an attempt is answered correctly */
  pCorrect: number
  /** reveal a hint before answering (when wrong-ish) */
  usesHints: boolean
  /** accept mastery checks when offered */
  acceptsChecks: boolean
  /** how many actions to play */
  steps: number
}

/** quick finisher, steady worker, a striver who leans on hints, a struggling
 * student (flags for the guide), and someone who only just started */
export const ARCHETYPES: Record<string, Archetype> = {
  quick: { pCorrect: 1, usesHints: false, acceptsChecks: true, steps: 90 },
  steady: { pCorrect: 0.85, usesHints: false, acceptsChecks: true, steps: 70 },
  striver: { pCorrect: 0.7, usesHints: true, acceptsChecks: true, steps: 60 },
  struggling: { pCorrect: 0.3, usesHints: true, acceptsChecks: false, steps: 40 },
  starter: { pCorrect: 1, usesHints: false, acceptsChecks: false, steps: 6 },
}

const hashName = (s: string): number => {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

/** Play one student through the site surface. */
export function seedStudent(core: SiteCore, studentId: string, kind: keyof typeof ARCHETYPES): void {
  const a = ARCHETYPES[kind] ?? ARCHETYPES['steady']!
  const rng = mulberry32(hashName(studentId))
  for (let i = 0; i < a.steps; i++) {
    const r = core.next(studentId)
    const body = r.body as { action: NextAction }
    const action = body.action
    if (action.kind === 'session_done') break
    if (action.kind === 'lesson' || action.kind === 'alt_explanation') {
      core.explanationViewed(studentId)
      continue
    }
    if (action.kind !== 'serve_item') break
    if (action.checkAvailable === true && a.acceptsChecks) {
      core.startCheck(studentId, action.forSkillId)
      continue
    }
    const item = core.cur.items.get(action.instance.itemId)!
    const correct = rng() < a.pCorrect
    // Work the STEPS as well as the answer, so the seeded class exercises
    // the telemetry the guide view reads. A student who misses the problem
    // usually fumbled one of its moves first — that is the whole reason
    // the guide can name a step instead of only a skill.
    const lead = (core.cur.explanationsBySkill.get(action.forSkillId) ?? []).find((e) =>
      e.timeline.some((st) => st.expect !== undefined),
    )
    if (lead) {
      const gates = lead.timeline
        .map((st, i) => ({ st, i }))
        .filter((g) => g.st.expect !== undefined)
      for (const g of gates) {
        const gotIt = rng() < a.pCorrect
        core.stepAttempt(studentId, {
          itemId: action.instance.itemId,
          paramHash: action.instance.paramHash,
          skillId: action.forSkillId,
          explanationId: lead.id,
          stepIndex: g.i,
          expectType: String(g.st.expect?.type ?? ''),
          answer: gotIt ? 'ok' : '999999',
          correct: gotIt,
          revealed: !gotIt && a.usesHints && rng() < 0.4,
          ...(gotIt
            ? {}
            : {
                misconceptionId:
                  g.st.expect?.misconceptions?.[0]?.id ?? undefined,
              }),
          latencyMs: 1500 + Math.floor(rng() * 7000),
        })
        if (!gotIt) break // a fumbled move ends the run at that step
      }
    }
    let raw = '999999'
    if (correct) {
      const rendered = renderTemplate(item.answer.value as string, action.instance.params as Env, {
        numberStyle: 'fraction',
      })
      if (rendered.ok) raw = rendered.value
    }
    core.attempt(studentId, {
      raw,
      hintLevel: !correct && a.usesHints ? 1 : 0,
      latencyMs: 2500 + Math.floor(rng() * 9000),
    })
  }
}

export const DEMO_CLASS: Array<{ id: string; kind: keyof typeof ARCHETYPES }> = [
  { id: 'ava', kind: 'quick' },
  { id: 'ben', kind: 'steady' },
  { id: 'chloe', kind: 'steady' },
  { id: 'diego', kind: 'striver' },
  { id: 'emmy', kind: 'quick' },
  { id: 'farid', kind: 'struggling' },
  { id: 'grace', kind: 'steady' },
  { id: 'hana', kind: 'striver' },
  { id: 'iris', kind: 'starter' },
  { id: 'jonah', kind: 'struggling' },
]

export function seedDemoClass(core: SiteCore): string[] {
  for (const s of DEMO_CLASS) seedStudent(core, s.id, s.kind)
  return DEMO_CLASS.map((s) => s.id)
}

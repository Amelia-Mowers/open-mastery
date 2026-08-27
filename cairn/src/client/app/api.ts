/** Thin client for the site server API. The client renders and submits; it
 * never computes mastery (invariant 1) and never sees the answer key. */
import type { Item, Explanation } from '@openmastery/schema'
import type { NextAction } from '../../core/engine'

export type ClientItem = Omit<Item, 'answer'>

export interface ServerNext {
  action: NextAction
  item?: ClientItem
  explanation?: Explanation
  /** params the explanation timeline should render with (params_from: item) */
  params?: Record<string, number | string>
  /** what the lesson teaches (the skill name), for the preamble */
  skillName?: string
  /** plain-language framing + vocab for the preamble */
  preamble?: { plain: string; vocab: Array<{ term: string; meaning: string }> }
  /** distinct representations available for this skill */
  totalReps?: number
  /** current mastery estimate for the served item's skill (0..1) */
  mastery?: number
  points: number
}

export interface ExplainResult {
  explanation: Explanation | null
  params: Record<string, number | string>
  skillName: string
  totalReps: number
}

export interface AttemptOutcome {
  verdict: { verdict: 'correct' } | { verdict: 'incorrect'; reason?: string } | { verdict: 'needs_llm'; reason: string }
  correct: boolean
  emitted: Array<{ kind: string; skillId?: string }>
  points: number
  /** mastery estimate for the attempted skill AFTER this attempt */
  mastery?: number
  /** this answer unlocked the skill's mastery check — offer it NOW */
  checkUnlocked?: boolean
}

export interface ZooDemoView {
  widget: string
  skillName: string
  params: Record<string, number | string>
  explanation: Explanation
}

export interface GuideStudent {
  id: string
  points: number
  mastered: number
  working: Array<{ skillId: string; name: string; phase: string; masteryPct: number; lapsed: boolean }>
  flags: Array<{ reason: string; skillId: string | null; skillName: string | null; t: number }>
  lastActive: number
}

export interface GuideView {
  students: GuideStudent[]
  totalSkills: number
}

export interface BundleView {
  skills: Array<{ id: string; name: string; prereqs: string[]; standards: string[] }>
}

export interface StateView {
  skills: Record<string, { p: number; phase: string; attempts: number; lapsed?: boolean }>
  openFlags: Array<{ reason: string; skillId?: string }>
  points: number
}

/** What the app needs from a backend — implemented over HTTP (SiteApi) and
 * fully in-browser by the GitHub-Pages demo (DemoApi wraps SiteCore). */
export interface CairnApi {
  next(focusSkill?: string): Promise<ServerNext>
  attempt(raw: string, hintLevel: number, latencyMs: number): Promise<AttemptOutcome>
  explanationViewed(): Promise<void>
  startCheck(skillId: string): Promise<void>
  explain(
    skillId: string,
    excludeReps?: string[],
    prefer?: string,
    sameAsLesson?: boolean,
  ): Promise<ExplainResult>
  explained(explanationId: string, skillId: string): Promise<void>
  demos(): Promise<{ demos: ZooDemoView[] }>
  bundle(): Promise<BundleView>
  guide(): Promise<GuideView>
  seedClass(): Promise<void>
  state(): Promise<StateView>
  reset(): Promise<void>
}

export class SiteApi implements CairnApi {
  constructor(
    private readonly base: string,
    private readonly studentId: string,
  ) {}

  private url(path: string, extra: Record<string, string> = {}): string {
    const q = new URLSearchParams({ student: this.studentId, ...extra })
    return `${this.base}${path}?${q.toString()}`
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const r = await fetch(this.url(path), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    return (await r.json()) as T
  }

  async next(focusSkill?: string): Promise<ServerNext> {
    const r = await fetch(this.url('/api/next', focusSkill ? { skill: focusSkill } : {}))
    return (await r.json()) as ServerNext
  }

  attempt(raw: string, hintLevel: number, latencyMs: number): Promise<AttemptOutcome> {
    return this.post('/api/attempt', { raw, hintLevel, latencyMs })
  }

  async explanationViewed(): Promise<void> {
    await this.post('/api/explanation-viewed', {})
  }

  async startCheck(skillId: string): Promise<void> {
    await this.post('/api/start-check', { skillId })
  }

  /** on-demand explanation for a skill; same variables as the pending item.
   * `prefer` asks for the problem's own metaphor; when every representation
   * has been seen, the chain loops (everything but the current one). */
  async explain(
    skillId: string,
    excludeReps: string[] = [],
    prefer?: string,
    sameAsLesson?: boolean,
  ): Promise<ExplainResult> {
    const extra: Record<string, string> = { skill: skillId }
    if (excludeReps.length > 0) extra['exclude'] = excludeReps.join(',')
    if (prefer) extra['prefer'] = prefer
    if (sameAsLesson) extra['viewedFirst'] = '1'
    const r = await fetch(this.url('/api/explain', extra))
    const result = (await r.json()) as ExplainResult
    if (result.explanation === null && excludeReps.length > 0) {
      // loop: everything is fresh again except what's on screen right now
      const again = await fetch(
        this.url('/api/explain', { skill: skillId, exclude: excludeReps[excludeReps.length - 1]! }),
      )
      return (await again.json()) as ExplainResult
    }
    return result
  }

  async explained(explanationId: string, skillId: string): Promise<void> {
    await this.post('/api/explained', { explanationId, skillId })
  }

  async demos(): Promise<{ demos: ZooDemoView[] }> {
    const r = await fetch(`${this.base}/api/demos`)
    return (await r.json()) as { demos: ZooDemoView[] }
  }

  async bundle(): Promise<BundleView> {
    const r = await fetch(`${this.base}/api/bundle`)
    return (await r.json()) as BundleView
  }

  async guide(): Promise<GuideView> {
    const r = await fetch(`${this.base}/api/guide`)
    return (await r.json()) as GuideView
  }

  async seedClass(): Promise<void> {
    await fetch(`${this.base}/api/seed-class`, { method: 'POST' })
  }

  async state(): Promise<StateView> {
    const r = await fetch(this.url('/api/state'))
    return (await r.json()) as StateView
  }

  async reset(): Promise<void> {
    await this.post('/api/reset', {})
  }
}

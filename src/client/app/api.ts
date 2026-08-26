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
  points: number
}

export interface ExplainResult {
  explanation: Explanation | null
  params: Record<string, number | string>
  skillName: string
}

export interface AttemptOutcome {
  verdict: { verdict: 'correct' } | { verdict: 'incorrect'; reason?: string } | { verdict: 'needs_llm'; reason: string }
  correct: boolean
  emitted: Array<{ kind: string; skillId?: string }>
  points: number
}

export interface BundleView {
  skills: Array<{ id: string; name: string; prereqs: string[] }>
}

export interface StateView {
  skills: Record<string, { p: number; phase: string; attempts: number; lapsed?: boolean }>
  openFlags: Array<{ reason: string; skillId?: string }>
  points: number
}

export class SiteApi {
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

  /** on-demand explanation for a skill; same variables as the pending item */
  async explain(skillId: string, excludeReps: string[] = []): Promise<ExplainResult> {
    const extra: Record<string, string> = { skill: skillId }
    if (excludeReps.length > 0) extra['exclude'] = excludeReps.join(',')
    const r = await fetch(this.url('/api/explain', extra))
    return (await r.json()) as ExplainResult
  }

  async explained(explanationId: string, skillId: string): Promise<void> {
    await this.post('/api/explained', { explanationId, skillId })
  }

  async bundle(): Promise<BundleView> {
    const r = await fetch(`${this.base}/api/bundle`)
    return (await r.json()) as BundleView
  }

  async state(): Promise<StateView> {
    const r = await fetch(this.url('/api/state'))
    return (await r.json()) as StateView
  }

  async reset(): Promise<void> {
    await this.post('/api/reset', {})
  }
}

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
}

export interface AttemptOutcome {
  verdict: { verdict: 'correct' } | { verdict: 'incorrect'; reason?: string } | { verdict: 'needs_llm'; reason: string }
  correct: boolean
  emitted: Array<{ kind: string; skillId?: string }>
}

export class SiteApi {
  constructor(
    private readonly base: string,
    private readonly studentId: string,
  ) {}

  private url(path: string): string {
    return `${this.base}${path}?student=${encodeURIComponent(this.studentId)}`
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const r = await fetch(this.url(path), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    return (await r.json()) as T
  }

  async next(): Promise<ServerNext> {
    const r = await fetch(this.url('/api/next'))
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
}

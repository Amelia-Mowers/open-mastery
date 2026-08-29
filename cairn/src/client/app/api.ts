/** Thin client for the site server API. The client renders and submits; it
 * never computes mastery (invariant 1) and never sees the answer key. */
import type { Item, Explanation } from '@openmastery/schema'
import type { NextAction } from '../../core/engine'

export type ClientItem = Omit<Item, 'answer'>

export interface ServerNext {
  /** the serve moved off a skill with ground gained — recognise it */
  milestone?: { name: string; blurb: string; pct: number; skillId: string; skillName: string }
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
  /** the walkthrough renders with the pending problem's own numbers */
  sameNumbers?: boolean
  skillName: string
  totalReps: number
}

export interface AttemptOutcome {
  verdict:
    | { verdict: 'correct' }
    | { verdict: 'incorrect'; reason?: string }
    | { verdict: 'needs_llm'; reason: string }
  correct: boolean
  emitted: Array<{ kind: string; skillId?: string }>
  points: number
  /** mastery estimate for the attempted skill AFTER this attempt */
  mastery?: number
  /** this answer unlocked the skill's mastery check — offer it NOW */
  checkUnlocked?: boolean
  /** a REVIEW the student held: the memory survived the gap, and the next
   * one is `days` away (FSRS stability, in the student's own terms) */
  reviewHeld?: { skillName: string; days: number; kept: number }
}

export interface StepAttemptBody {
  itemId: string
  paramHash: string
  skillId: string
  explanationId: string
  stepIndex: number
  expectType: string
  answer: unknown
  correct: boolean
  revealed: boolean
  misconceptionId?: string
  latencyMs: number
}

export interface ZooDemoView {
  widget: string
  skillName: string
  params: Record<string, number | string>
  explanation: Explanation
  /** single-timeline view: a representation-matched item's answer widget
   * (key stripped) for the faded + input cards */
  item?: {
    id: string
    params: Record<string, number | string>
    widget: { type: string; config?: Record<string, unknown> }
    fadedParams: Record<string, number | string>
  } | null
}

export interface GuideStudent {
  id: string
  points: number
  mastered: number
  working: Array<{ skillId: string; name: string; phase: string; masteryPct: number; lapsed: boolean }>
  flags: Array<{ reason: string; skillId: string | null; skillName: string | null; t: number }>
  lastActive: number
}

export interface GuideStudentDetail {
  id: string
  points: number
  placedGrade: number | null
  totals: {
    attempts: number
    correct: number
    assisted: number
    stepMoves: number
    lessonsWatched: number
  }
  skills: Array<{
    skillId: string
    name: string
    phase: string
    masteryPct: number
    attempts: number
    lapsed: boolean
    placed: boolean
  }>
  /** where the MOVES break — the point of logging stepwise attempts */
  stuck: Array<{
    skillId: string
    skillName: string
    explanationId: string
    stepIndex: number
    misses: number
    reveals: number
    misconceptions: Record<string, number>
  }>
  recent: Array<{
    t: number
    skillId: string
    skillName: string
    itemKind: string
    correct: boolean
    assisted: boolean
    hintLevel: number
    latencyMs: number
  }>
  flags: Array<{ reason: string; skillId: string | null; skillName: string | null; t: number }>
}

export interface RecentEvents {
  events: Array<Record<string, unknown>>
  total: number
}

export interface GuideView {
  students: GuideStudent[]
  totalSkills: number
}

export interface BundleView {
  skills: Array<{
    id: string
    name: string
    prereqs: string[]
    standards: string[]
    preamble?: { plain: string; vocab: Array<{ term: string; meaning: string }> }
  }>
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
  /** one MOVE inside a stepwise problem (which step, what they did) */
  stepAttempt(move: StepAttemptBody): Promise<void>
  startCheck(skillId: string): Promise<void>
  explain(
    skillId: string,
    excludeReps?: string[],
    prefer?: string,
    sameAsLesson?: boolean,
    /** the instance on screen — the server refuses a stale lead */
    forParamHash?: string,
  ): Promise<ExplainResult>
  explained(explanationId: string, skillId: string): Promise<void>
  demos(): Promise<{ demos: ZooDemoView[]; index?: Record<string, Array<{ id: string; skillName: string; vetted: boolean }>> }>
  demoFor(explanationId: string): Promise<ZooDemoView>
  bundle(): Promise<BundleView>
  guide(): Promise<GuideView>
  /** one student's detail — what they worked on and which moves break */
  guideStudentDetail(id: string): Promise<GuideStudentDetail>
  /** the live event log — the proof this is an engine */
  recentEvents(limit?: number): Promise<RecentEvents>
  seedClass(): Promise<void>
  /** grades the catalog can teach, for the sign-in grade picker */
  grades(): Promise<{ available: number[] }>
  /** place the student at a grade (everything below is assumed known) */
  place(grade: number): Promise<void>
  /** true only for a student with no history — the grade step is for
   * new students, not a question returning ones answer again */
  needsPlacement(): Promise<{ needsPlacement: boolean }>
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

  /** An HTTP error body is NOT the success type. Casting it through gave
   * every caller a plausible-looking object with undefined fields: a 409
   * on /api/explain read as "no explanation" and "Show me how" silently
   * did nothing; a 409 on /api/attempt reached the card as
   * {error} and rendered a NaN point delta. Fail loudly instead. */
  private async json<T>(r: Response, what: string): Promise<T> {
    const body: unknown = await r.json().catch(() => null)
    if (!r.ok) {
      const detail =
        body !== null && typeof body === 'object' && 'error' in body
          ? String((body as { error: unknown }).error)
          : `HTTP ${r.status}`
      throw new Error(`${what}: ${detail}`)
    }
    return body as T
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const r = await fetch(this.url(path), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    return this.json<T>(r, `POST ${path}`)
  }

  async next(focusSkill?: string): Promise<ServerNext> {
    const r = await fetch(this.url('/api/next', focusSkill ? { skill: focusSkill } : {}))
    return this.json<ServerNext>(r, 'next')
  }

  attempt(raw: string, hintLevel: number, latencyMs: number): Promise<AttemptOutcome> {
    return this.post('/api/attempt', { raw, hintLevel, latencyMs })
  }

  async explanationViewed(): Promise<void> {
    await this.post('/api/explanation-viewed', {})
  }

  async stepAttempt(move: StepAttemptBody): Promise<void> {
    await this.post('/api/step-attempt', move)
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
    forParamHash?: string,
  ): Promise<ExplainResult> {
    const extra: Record<string, string> = { skill: skillId }
    if (excludeReps.length > 0) extra['exclude'] = excludeReps.join(',')
    if (prefer) extra['prefer'] = prefer
    if (sameAsLesson) extra['viewedFirst'] = '1'
    if (forParamHash !== undefined) extra['forParamHash'] = forParamHash
    const r = await fetch(this.url('/api/explain', extra))
    const result = await this.json<ExplainResult>(r, 'explain')
    if (result.explanation == null && excludeReps.length > 0) {
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

  async demos(): Promise<{ demos: ZooDemoView[]; index?: Record<string, Array<{ id: string; skillName: string; vetted: boolean }>> }> {
    const r = await fetch(`${this.base}/api/demos`)
    return (await r.json()) as { demos: ZooDemoView[]; index?: Record<string, Array<{ id: string; skillName: string; vetted: boolean }>> }
  }

  async demoFor(explanationId: string): Promise<ZooDemoView> {
    const r = await fetch(`${this.base}/api/demo?exp=${encodeURIComponent(explanationId)}`)
    return (await r.json()) as ZooDemoView
  }

  async bundle(): Promise<BundleView> {
    const r = await fetch(`${this.base}/api/bundle`)
    return (await r.json()) as BundleView
  }

  async guide(): Promise<GuideView> {
    const r = await fetch(`${this.base}/api/guide`)
    return this.json<GuideView>(r, 'guide')
  }

  async recentEvents(limit = 40): Promise<RecentEvents> {
    const r = await fetch(`${this.base}/api/recent-events?limit=${limit}`)
    return this.json<RecentEvents>(r, 'recent events')
  }

  async guideStudentDetail(id: string): Promise<GuideStudentDetail> {
    const r = await fetch(`${this.base}/api/guide-student?id=${encodeURIComponent(id)}`)
    return this.json<GuideStudentDetail>(r, 'guide student')
  }

  async grades(): Promise<{ available: number[] }> {
    const r = await fetch(`${this.base}/api/grades`)
    return this.json<{ available: number[] }>(r, 'grades')
  }

  async place(grade: number): Promise<void> {
    await this.post('/api/place', { grade })
  }

  async needsPlacement(): Promise<{ needsPlacement: boolean }> {
    const r = await fetch(this.url('/api/needs-placement'))
    return this.json<{ needsPlacement: boolean }>(r, 'needs placement')
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

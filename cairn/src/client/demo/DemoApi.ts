/** DemoApi: the backend, rolled into the browser. Wraps the SAME SiteCore
 * the dev server uses; the event log persists to localStorage so a returning
 * visitor keeps their progress (state = fold(events), like everywhere else).
 *
 * DEMO ONLY: the curriculum bundle — answer keys included — ships to the
 * client. Real deployments keep SiteCore server-side (invariant 1).
 */
import type { Bundle } from '@openmastery/schema'
import type { CairnEvent } from '../../core/index.ts'
import { SiteCore } from '../../site/core.ts'
import { seedDemoClass } from '../../site/simulate.ts'
import type {
  AttemptOutcome,
  BundleView,
  CairnApi,
  ExplainResult,
  GuideView,
  ServerNext,
  StateView,
  ZooDemoView,
} from '../app/api.ts'

const STORE_KEY = 'cairn.demo.events'

export interface DemoStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

function loadEvents(storage: DemoStorage | null): CairnEvent[] {
  if (!storage) return []
  try {
    const raw = storage.getItem(STORE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? (parsed as CairnEvent[]) : []
  } catch {
    return []
  }
}

export class DemoApi implements CairnApi {
  private readonly core: SiteCore
  private readonly storage: DemoStorage | null

  constructor(
    private readonly studentId: string,
    bundle: Bundle,
    storage?: DemoStorage | null,
  ) {
    this.storage =
      storage !== undefined ? storage : typeof localStorage === 'undefined' ? null : localStorage
    this.core = new SiteCore(bundle, { replay: loadEvents(this.storage) })
    this.core.onEvent = () => this.persist()
  }

  private persist(): void {
    if (!this.storage) return
    try {
      this.storage.setItem(STORE_KEY, JSON.stringify(this.core.log))
    } catch {
      /* quota/unavailable: the session still works, it just won't survive reload */
    }
  }

  private unwrap<T>(r: { status: number; body: unknown }): T {
    // transports surface errors as thrown strings; the app already handles them
    if (r.status >= 400 && r.status !== 409) throw new Error(String((r.body as { error?: string }).error))
    return r.body as T
  }

  next(focusSkill?: string): Promise<ServerNext> {
    return Promise.resolve(this.unwrap(this.core.next(this.studentId, focusSkill ?? null)))
  }

  attempt(raw: string, hintLevel: number, latencyMs: number): Promise<AttemptOutcome> {
    return Promise.resolve(this.unwrap(this.core.attempt(this.studentId, { raw, hintLevel, latencyMs })))
  }

  explanationViewed(): Promise<void> {
    this.core.explanationViewed(this.studentId)
    return Promise.resolve()
  }

  startCheck(skillId: string): Promise<void> {
    this.core.startCheck(this.studentId, skillId)
    return Promise.resolve()
  }

  explain(
    skillId: string,
    excludeReps: string[] = [],
    prefer?: string,
    sameAsLesson?: boolean,
  ): Promise<ExplainResult> {
    const q = (exclude: string[]) =>
      this.unwrap<ExplainResult>(
        this.core.explain(this.studentId, {
          skill: skillId,
          exclude,
          prefer: prefer ?? null,
          viewedFirst: sameAsLesson === true,
        }),
      )
    const result = q(excludeReps)
    if (result.explanation === null && excludeReps.length > 0) {
      // loop: everything is fresh again except what's on screen right now
      return Promise.resolve(q([excludeReps[excludeReps.length - 1]!]))
    }
    return Promise.resolve(result)
  }

  explained(explanationId: string, skillId: string): Promise<void> {
    this.core.explained(this.studentId, { explanationId, skillId })
    return Promise.resolve()
  }

  demos(): Promise<{ demos: ZooDemoView[] }> {
    return Promise.resolve(this.unwrap(this.core.demosView()))
  }

  bundle(): Promise<BundleView> {
    return Promise.resolve(this.unwrap(this.core.bundleView()))
  }

  state(): Promise<StateView> {
    return Promise.resolve(this.unwrap(this.core.state(this.studentId)))
  }

  reset(): Promise<void> {
    this.core.reset(this.studentId)
    this.persist()
    return Promise.resolve()
  }

  guide(): Promise<GuideView> {
    return Promise.resolve(this.unwrap(this.core.guideView()))
  }

  seedClass(): Promise<void> {
    seedDemoClass(this.core)
    this.persist()
    return Promise.resolve()
  }
}

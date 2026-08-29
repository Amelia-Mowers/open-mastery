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
  GuideStudentDetail,
  RecentEvents,
  StepAttemptBody,
  CairnApi,
  ExplainResult,
  GuideView,
  ServerNext,
  StateView,
  ZooDemoView,
} from '../app/api.ts'

export const STORE_KEY = 'cairn.demo.events'

/** Wipe the demo completely: every student's events, the remembered name,
 * and the in-memory core behind them. The demo has no accounts to keep, so
 * "reset" means "put this browser back to a first visit" — a full scrub is
 * both what a visitor expects and far less to get wrong than per-student
 * surgery across live instances. */
export function scrubDemo(storage: DemoStorage | null, core?: SiteCore): void {
  if (storage) {
    try {
      storage.removeItem(STORE_KEY)
      storage.removeItem('cairn.student')
    } catch {
      /* storage unavailable: the in-memory clear below still applies */
    }
    CORES.delete(storage)
  }
  // the caller normally reloads onto the front door, but any instance still
  // holding this core must see an empty world rather than stale state
  core?.clear()
}

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

/** ONE core per storage, shared by every DemoApi in the page.
 *
 * Each DemoApi used to build its own SiteCore from a snapshot of the log
 * and write that snapshot back on every event — so two live instances
 * (the student's and the guide view's, or one left over from a previous
 * name) each held a divergent copy and whichever persisted last won.
 * That is what made "Reset demo" look flaky: the reset emptied one core,
 * then the other instance's next write restored its stale log. */
const CORES = new WeakMap<object, SiteCore>()
/** storage-less (test) instances still get one shared core per bundle */
const ANON_CORES = new WeakMap<Bundle, SiteCore>()

function coreFor(bundle: Bundle, storage: DemoStorage | null): SiteCore {
  const key: object = storage ?? bundle
  const table = storage ? CORES : (ANON_CORES as unknown as WeakMap<object, SiteCore>)
  const existing = table.get(key)
  if (existing) return existing
  const core = new SiteCore(bundle, { replay: loadEvents(storage) })
  if (storage) {
    core.onEvent = () => {
      try {
        storage.setItem(STORE_KEY, JSON.stringify(core.log))
      } catch {
        /* quota/unavailable: the session works, it just won't survive reload */
      }
    }
  }
  table.set(key, core)
  return core
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
    this.core = coreFor(bundle, this.storage)
  }

  /** the shared core persists on every event; reset/seed write immediately
   * because they change the log without emitting one */
  private persist(): void {
    if (!this.storage) return
    try {
      this.storage.setItem(STORE_KEY, JSON.stringify(this.core.log))
    } catch {
      /* quota/unavailable: the session still works, it just won't survive reload */
    }
  }

  private unwrap<T>(r: { status: number; body: unknown }): T {
    // An error body is NOT the success type. Letting 409s through cast an
    // {error} object into the caller's shape, where every field reads
    // undefined — "Show me how" saw no explanation and silently did
    // nothing, and a stale attempt rendered a NaN point delta. Callers
    // that legitimately expect a 409 (startCheck) handle it themselves.
    if (r.status >= 400) throw new Error(String((r.body as { error?: string }).error ?? r.status))
    return r.body as T
  }

  next(focusSkill?: string): Promise<ServerNext> {
    // demo: focus is forced so testers can jump to locked/mastered skills
    return Promise.resolve(this.unwrap(this.core.next(this.studentId, focusSkill ?? null, true)))
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
    forParamHash?: string,
  ): Promise<ExplainResult> {
    const q = (exclude: string[]) =>
      this.unwrap<ExplainResult>(
        this.core.explain(this.studentId, {
          skill: skillId,
          exclude,
          prefer: prefer ?? null,
          viewedFirst: sameAsLesson === true,
          ...(forParamHash !== undefined ? { forParamHash } : {}),
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

  demos(): Promise<{ demos: ZooDemoView[]; index?: Record<string, Array<{ id: string; skillName: string; vetted: boolean }>> }> {
    return Promise.resolve(this.unwrap(this.core.demosView()))
  }

  demoFor(explanationId: string): Promise<ZooDemoView> {
    return Promise.resolve(this.unwrap(this.core.explanationDemo(explanationId)))
  }

  bundle(): Promise<BundleView> {
    return Promise.resolve(this.unwrap(this.core.bundleView()))
  }

  state(): Promise<StateView> {
    return Promise.resolve(this.unwrap(this.core.state(this.studentId)))
  }

  /** In the demo, reset means START OVER: scrub every student's events and
   * the remembered name. The caller reloads onto the front door, so this
   * instance's core is deliberately discarded rather than reused. */
  reset(): Promise<void> {
    scrubDemo(this.storage, this.core)
    return Promise.resolve()
  }

  guide(): Promise<GuideView> {
    return Promise.resolve(this.unwrap(this.core.guideView()))
  }

  recentEvents(limit = 40): Promise<RecentEvents> {
    return Promise.resolve(this.unwrap(this.core.recentEvents(limit)))
  }

  guideStudentDetail(id: string): Promise<GuideStudentDetail> {
    return Promise.resolve(this.unwrap(this.core.guideStudent(id)))
  }

  stepAttempt(move: StepAttemptBody): Promise<void> {
    this.unwrap(this.core.stepAttempt(this.studentId, move as unknown as Record<string, unknown>))
    this.persist()
    return Promise.resolve()
  }

  grades(): Promise<{ available: number[] }> {
    return Promise.resolve({ available: this.core.gradesAvailable() })
  }

  place(grade: number): Promise<void> {
    this.unwrap(this.core.place(this.studentId, grade))
    this.persist()
    return Promise.resolve()
  }

  seedClass(): Promise<void> {
    seedDemoClass(this.core)
    this.persist()
    return Promise.resolve()
  }
}

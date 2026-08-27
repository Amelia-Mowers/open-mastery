/** Development site server: the §5 engine behind HTTP, in-memory state.
 *
 * This is the build-step-3 loop harness — the real site server (step 5) is a
 * single Bun binary with SQLite behind `SiteStore`, but the engine wiring
 * here is the same one it will use: the server owns envelope stamping
 * (siteSeq + site time), holds the pending action per student, and clients
 * only render and submit (invariant 1: clients never compute mastery).
 *
 * Node-portable on purpose (node:http); runs under Bun unchanged.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { extname, join, normalize } from 'node:path'
import { parseTemplate, templateIdentifiers, type Bundle, type Explanation } from '@openmastery/schema'
import {
  applyEvent,
  bktUpdate,
  buildIndex,
  freshSession,
  initialStudentState,
  nextAction,
  policyV1,
  practiceItems,
  recordAttempt,
  recordExplanationViewed,
  startCheck,
  type BktParams,
  type CairnEvent,
  type EngineCtx,
  type EventBody,
  type NextAction,
  type SessionState,
  type StudentState,
} from '../core/index.ts'

interface StudentSlot {
  student: StudentState
  session: SessionState
  /** last action served to this student; attempts must resolve against it */
  pending: NextAction | null
}

export interface DevSite {
  server: Server
  /** listening port (after start) */
  port: () => number
  stop: () => Promise<void>
}

export interface DevSiteOptions {
  /** directory of built client assets to serve for non-/api requests */
  staticDir?: string
}

/** Every identifier an explanation timeline's templates reference. */
function timelineIdentifiers(e: Explanation): Set<string> {
  const out = new Set<string>()
  const collect = (src: unknown): void => {
    if (typeof src !== 'string' || !src.includes('{')) return
    const p = parseTemplate(src)
    if (!p.ok) return
    for (const id of templateIdentifiers(p.value)) out.add(id)
  }
  for (const step of e.timeline) {
    collect(step.caption)
    collect(step.handoff?.prompt)
    for (const v of Object.values(step.patch ?? {})) collect(v)
  }
  return out
}

/** Explanations are authored against a param FAMILY; an instance from a
 * different family (e.g. the raw -x = b item, which has no `a`) can't feed
 * the timeline — fall back to the family params so nothing renders as
 * literal `{a}` braces. */
/** First candidate param set that can feed every template in the timeline. */
export function feedableParams(
  e: Explanation,
  candidates: Array<Record<string, number | string> | null>,
): Record<string, number | string> | null {
  const needed = timelineIdentifiers(e)
  for (const c of candidates) {
    if (!c) continue
    if ([...needed].every((id) => id in c)) return c
  }
  return null
}

export function paramsForExplanation(
  e: Explanation,
  instanceParams: Record<string, number | string> | null,
  familyParams: Record<string, number | string>,
): Record<string, number | string> {
  if (!instanceParams) return familyParams
  const needed = timelineIdentifiers(e)
  for (const id of needed) if (!(id in instanceParams)) return familyParams
  return instanceParams
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
}

export function createDevSite(bundle: Bundle, opts: DevSiteOptions = {}): DevSite {
  const cur = buildIndex(bundle)
  const bktDefaults = new Map(bundle.skills.map((s) => [s.id, s.bkt_defaults as BktParams]))
  const fallback: BktParams = { L0: 0.3, T: 0.15, S: 0.1, G: 0.2 }

  // envelope stamping: the server is the single writer and assigns order;
  // site time is a monotonic counter here (the real server folds clock_set)
  let siteSeq = 0
  let siteTime = 0
  const log: CairnEvent[] = []
  const stampFor =
    (studentId: string) =>
    (body: EventBody): CairnEvent => {
      siteSeq += 1
      siteTime += 1000
      const ev: CairnEvent = {
        ...body,
        siteSeq,
        deviceId: 'dev',
        deviceSeq: siteSeq,
        coreVersion: 'core-dev',
        bundleVersion: 'bundle-dev',
        studentId,
        t: siteTime,
      }
      log.push(ev)
      return ev
    }

  const slots = new Map<string, StudentSlot>()
  const slot = (id: string): StudentSlot => {
    let s = slots.get(id)
    if (!s) {
      s = { student: initialStudentState(), session: freshSession(), pending: null }
      slots.set(id, s)
    }
    return s
  }
  const ctxFor = (studentId: string): EngineCtx => ({
    cur,
    bkt: (skillId) => bktDefaults.get(skillId) ?? fallback,
    policy: policyV1,
    stamp: stampFor(studentId),
  })

  /** Visible progress points, derived from the log (no rankings — personal
   * only, per invariant 3). The BASIS is mastery itself: each skill is worth
   * the mastery percent gained (highest estimate ever reached minus the
   * starting estimate — misses never take points away), so the mastery bar
   * and the points tell the same story. Small flat bonuses: +2 per completed
   * explanation (capped at one per explanation), +10 per mastery. */
  const pointsFor = (studentId: string): number => {
    const p = new Map<string, number>()
    const maxP = new Map<string, number>()
    const explained = new Set<string>()
    let flat = 0
    const bump = (skillId: string, value: number): void => {
      p.set(skillId, value)
      if (value > (maxP.get(skillId) ?? 0)) maxP.set(skillId, value)
    }
    for (const e of log) {
      if (e.studentId !== studentId) continue
      if (e.kind === 'attempt') {
        const prm = bktDefaults.get(e.skillId) ?? fallback
        const prior = p.get(e.skillId) ?? prm.L0
        bump(e.skillId, bktUpdate(prior, e.correct, e.correct ? e.hintLevel : 0, prm))
      } else if (e.kind === 'mastery_granted') {
        bump(e.skillId, Math.max(p.get(e.skillId) ?? 0, 0.95))
        flat += 10
      } else if (e.kind === 'explanation_viewed' && e.completed && !explained.has(e.explanationId)) {
        explained.add(e.explanationId)
        flat += 2
      }
    }
    let pts = flat
    for (const [skillId, top] of maxP) {
      const L0 = (bktDefaults.get(skillId) ?? fallback).L0
      pts += Math.max(0, Math.floor((top - L0) * 100))
    }
    return pts
  }

  /** current mastery estimate for a skill (the bar the student sees) */
  const masteryOf = (studentId: string, skillId: string): number =>
    slot(studentId).student.skills[skillId]?.p ?? (bktDefaults.get(skillId) ?? fallback).L0

  const json = (res: ServerResponse, status: number, body: unknown): void => {
    const s = JSON.stringify(body)
    res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(s) })
    res.end(s)
  }

  const readBody = (req: IncomingMessage): Promise<unknown> =>
    new Promise((resolve, reject) => {
      const chunks: Buffer[] = []
      req.on('data', (c: Buffer) => chunks.push(c))
      req.on('end', () => {
        try {
          resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {})
        } catch (e) {
          reject(e)
        }
      })
      req.on('error', reject)
    })

  const server = createServer((req, res) => {
    void handle(req, res).catch((e: unknown) => {
      json(res, 500, { error: String(e) })
    })
  })

  function serveStatic(pathname: string, res: ServerResponse): boolean {
    const dir = opts.staticDir
    if (!dir) return false
    const rel = normalize(pathname).replace(/^([/\\]|\.\.)+/, '')
    for (const candidate of [join(dir, rel === '' ? 'index.html' : rel), join(dir, 'index.html')]) {
      if (existsSync(candidate) && statSync(candidate).isFile()) {
        res.writeHead(200, { 'content-type': MIME[extname(candidate)] ?? 'application/octet-stream' })
        createReadStream(candidate).pipe(res)
        return true
      }
    }
    return false
  }

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const studentId = url.searchParams.get('student') ?? ''

    if (req.method === 'GET' && !url.pathname.startsWith('/api/')) {
      if (serveStatic(url.pathname, res)) return
      return json(res, 404, { error: 'not found (no staticDir configured)' })
    }

    if (req.method === 'GET' && url.pathname === '/api/bundle') {
      return json(res, 200, {
        skills: bundle.skills.map((s) => ({ id: s.id, name: s.name, prereqs: s.prereqs })),
        items: bundle.items.length,
        explanations: bundle.explanations.length,
      })
    }
    if (req.method === 'GET' && url.pathname === '/api/demos') {
      // the widget zoo's single source: one canonical demo per widget type —
      // the first curriculum explanation using it (skill order, instruction
      // order), played with its family params
      const seen = new Set<string>()
      const demos: Array<{ widget: string; skillName: string; params: Record<string, number | string>; explanation: Explanation }> = []
      for (const skillId of cur.skillOrder) {
        const skill = cur.skills.get(skillId)!
        const all = cur.explanationsBySkill.get(skillId) ?? []
        const ordered = [
          ...skill.instruction.map((id) => all.find((e) => e.id === id)).filter((e): e is Explanation => e !== undefined),
          ...all.filter((e) => !skill.instruction.includes(e.id)),
        ]
        for (const e of ordered) {
          if (seen.has(e.widget)) continue
          const family = practiceItems(skillId, cur)[0]?.params ?? {}
          const params = feedableParams(e, [family])
          if (!params) continue
          seen.add(e.widget)
          demos.push({ widget: e.widget, skillName: skill.name, params, explanation: e })
        }
      }
      return json(res, 200, { demos })
    }

    if (studentId === '') return json(res, 400, { error: 'student query param required' })
    const st = slot(studentId)
    const ctx = ctxFor(studentId)

    if (req.method === 'GET' && url.pathname === '/api/next') {
      const focusSkill = url.searchParams.get('skill')
      const action = nextAction(st.student, st.session, ctx, focusSkill ? { focusSkill } : {})
      st.pending = action
      // clients render; grading data (the answer key) never leaves the server
      const points = pointsFor(studentId)
      if (action.kind === 'serve_item') {
        const item = cur.items.get(action.instance.itemId)!
        const { answer: _answer, ...safe } = item
        return json(res, 200, { action, item: safe, points, mastery: masteryOf(studentId, action.skillId) })
      }
      if (action.kind === 'lesson' || action.kind === 'alt_explanation') {
        // params_from: item — the timeline renders with the skill's primary
        // item family (authored params of its first practice item)
        const params = practiceItems(action.skillId, cur)[0]?.params ?? {}
        const skill = cur.skills.get(action.skillId)
        return json(res, 200, {
          action,
          explanation: cur.explanations.get(action.explanationId),
          params,
          skillName: skill?.name ?? action.skillId,
          preamble: skill?.preamble,
          totalReps: new Set((cur.explanationsBySkill.get(action.skillId) ?? []).map((e) => e.representation)).size,
          points,
        })
      }
      return json(res, 200, { action, points })
    }

    if (req.method === 'POST' && url.pathname === '/api/attempt') {
      const body = (await readBody(req)) as { raw?: string; hintLevel?: number; latencyMs?: number }
      const pending = st.pending
      if (pending?.kind !== 'serve_item') return json(res, 409, { error: 'no item pending' })
      const result = recordAttempt(st.student, st.session, ctx, pending, {
        raw: body.raw ?? '',
        hintLevel: body.hintLevel ?? 0,
        latencyMs: body.latencyMs ?? 0,
      })
      st.pending = null
      return json(res, 200, {
        verdict: result.verdict,
        correct: result.correct,
        // event kinds emitted by this attempt (mastery_granted, guide_flag…)
        // so the client can surface the moment; full payloads stay server-side
        emitted: result.events.map((e) => ({
          kind: e.kind,
          skillId: 'skillId' in e ? e.skillId : undefined,
        })),
        points: pointsFor(studentId),
        mastery: masteryOf(studentId, pending.skillId),
      })
    }

    if (req.method === 'POST' && url.pathname === '/api/explanation-viewed') {
      const pending = st.pending
      if (pending?.kind !== 'lesson' && pending?.kind !== 'alt_explanation')
        return json(res, 409, { error: 'no explanation pending' })
      recordExplanationViewed(st.student, st.session, ctx, {
        skillId: pending.skillId,
        explanationId: pending.explanationId,
        completed: true,
      })
      st.pending = null
      return json(res, 200, { ok: true })
    }

    if (req.method === 'POST' && url.pathname === '/api/start-check') {
      const body = (await readBody(req)) as { skillId?: string }
      const ok = typeof body.skillId === 'string' && startCheck(st.student, st.session, ctx, body.skillId)
      if (ok) st.pending = null // the pending practice offer is superseded
      return json(res, ok ? 200 : 409, { ok })
    }

    if (req.method === 'GET' && url.pathname === '/api/state') {
      return json(res, 200, {
        skills: st.student.skills,
        assisted: [...st.student.assisted],
        openFlags: st.student.openFlags,
        points: pointsFor(studentId),
      })
    }

    if (req.method === 'GET' && url.pathname === '/api/explain') {
      // on-demand explanation for a skill, with the CURRENT instance params
      // when an item of that skill is pending (same variables as the problem)
      const skillId = url.searchParams.get('skill') ?? ''
      const exclude = (url.searchParams.get('exclude') ?? '').split(',').filter(Boolean)
      // the problem's own metaphor, when it declares one
      const prefer = url.searchParams.get('prefer')
      const skill = cur.skills.get(skillId)
      if (!skill) return json(res, 404, { error: `unknown skill '${skillId}'` })
      const all = cur.explanationsBySkill.get(skillId) ?? []
      // primary-first order: instruction list, then any remaining
      const ordered = [
        ...skill.instruction.map((id) => all.find((e) => e.id === id)).filter((e) => e !== undefined),
        ...all.filter((e) => !skill.instruction.includes(e.id)),
      ]
      const pending = st.pending
      const instanceParams =
        pending?.kind === 'serve_item' && pending.skillId === skillId
          ? pending.instance.params
          : null
      const familyParams = practiceItems(skillId, cur)[0]?.params ?? {}
      // only explanations the available params can actually feed
      const eligible = ordered
        .filter((e) => !exclude.includes(e.representation))
        .map((e) => ({ e, params: feedableParams(e, [instanceParams, familyParams]) }))
        .filter((x): x is { e: Explanation; params: Record<string, number | string> } => x.params !== null)
      const chosen =
        (prefer ? eligible.find((x) => x.e.representation === prefer) : undefined) ??
        eligible[0] ??
        null
      return json(res, 200, {
        explanation: chosen?.e ?? null,
        params: chosen?.params ?? familyParams,
        skillName: skill.name,
        totalReps: new Set(all.map((e) => e.representation)).size,
      })
    }

    if (req.method === 'POST' && url.pathname === '/api/explained') {
      // log a completed on-demand explanation view; the pending item (if any)
      // stays pending — the student returns to the same problem
      const body = (await readBody(req)) as { explanationId?: string; skillId?: string }
      const expl = body.explanationId ? cur.explanations.get(body.explanationId) : undefined
      if (!expl || typeof body.skillId !== 'string')
        return json(res, 400, { error: 'explanationId and skillId required' })
      const ev = ctx.stamp({
        kind: 'explanation_viewed',
        explanationId: expl.id,
        skillId: body.skillId,
        completed: true,
        representation: expl.representation,
      })
      applyEvent(st.student, ev, ctx.bkt)
      return json(res, 200, { ok: true, points: pointsFor(studentId) })
    }

    if (req.method === 'POST' && url.pathname === '/api/reset') {
      // dev convenience: wipe this student's slot and log entries
      slots.delete(studentId)
      for (let i = log.length - 1; i >= 0; i--) if (log[i]!.studentId === studentId) log.splice(i, 1)
      return json(res, 200, { ok: true })
    }

    if (req.method === 'GET' && url.pathname === '/api/events') {
      return json(res, 200, { events: log.filter((e) => e.studentId === studentId) })
    }

    return json(res, 404, { error: 'not found' })
  }

  return {
    server,
    port: () => {
      const addr = server.address()
      if (addr === null || typeof addr === 'string') throw new Error('server not listening')
      return addr.port
    },
    stop: () => new Promise((resolve) => server.close(() => resolve())),
  }
}

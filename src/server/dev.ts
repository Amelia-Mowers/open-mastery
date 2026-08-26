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
import type { Bundle } from '@openmastery/schema'
import {
  buildIndex,
  freshSession,
  initialStudentState,
  nextAction,
  policyV1,
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

export function createDevSite(bundle: Bundle): DevSite {
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

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const studentId = url.searchParams.get('student') ?? ''

    if (req.method === 'GET' && url.pathname === '/api/bundle') {
      return json(res, 200, {
        skills: bundle.skills.map((s) => ({ id: s.id, name: s.name, prereqs: s.prereqs })),
        items: bundle.items.length,
        explanations: bundle.explanations.length,
      })
    }
    if (studentId === '') return json(res, 400, { error: 'student query param required' })
    const st = slot(studentId)
    const ctx = ctxFor(studentId)

    if (req.method === 'GET' && url.pathname === '/api/next') {
      const action = nextAction(st.student, st.session, ctx)
      st.pending = action
      // clients render; grading data (the answer key) never leaves the server
      if (action.kind === 'serve_item') {
        const item = cur.items.get(action.instance.itemId)!
        const { answer: _answer, ...safe } = item
        return json(res, 200, { action, item: safe })
      }
      if (action.kind === 'lesson' || action.kind === 'alt_explanation') {
        return json(res, 200, { action, explanation: cur.explanations.get(action.explanationId) })
      }
      return json(res, 200, { action })
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
      return json(res, 200, { verdict: result.verdict, correct: result.correct })
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
      })
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

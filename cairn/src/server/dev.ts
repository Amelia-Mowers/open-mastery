/** Development site server: SiteCore behind HTTP, in-memory state.
 *
 * This is the build-step-3 loop harness — the real site server (step 5) is a
 * single Bun binary with SQLite behind `SiteStore`, but ALL site behavior
 * lives in src/site/core.ts (shared with the browser demo); this file only
 * maps HTTP to it. The server owns envelope stamping and the pending action
 * per student; clients only render and submit (invariant 1: clients never
 * compute mastery).
 *
 * Node-portable on purpose (node:http); runs under Bun unchanged.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { extname, join, normalize } from 'node:path'
import type { Bundle } from '@openmastery/schema'
import { SiteCore, type SiteResult } from '../site/core.ts'

// re-exported for existing imports (tests, client helpers)
export { feedableParams, paramsForExplanation } from '../site/core.ts'

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
  const core = new SiteCore(bundle)

  const send = (res: ServerResponse, r: SiteResult): void => {
    const s = JSON.stringify(r.body)
    res.writeHead(r.status, {
      'content-type': 'application/json',
      'content-length': Buffer.byteLength(s),
    })
    res.end(s)
  }

  const readBody = (req: IncomingMessage): Promise<unknown> =>
    new Promise((resolve, reject) => {
      const chunks: Buffer[] = []
      req.on('data', (c: Buffer) => chunks.push(c))
      req.on('end', () => {
        try {
          resolve(chunks.length === 0 ? {} : JSON.parse(Buffer.concat(chunks).toString('utf8')))
        } catch (e) {
          reject(e instanceof Error ? e : new Error(String(e)))
        }
      })
      req.on('error', reject)
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
      return send(res, { status: 404, body: { error: 'not found (no staticDir configured)' } })
    }

    if (req.method === 'GET' && url.pathname === '/api/grades')
      return send(res, { status: 200, body: { available: core.gradesAvailable() } })
    if (req.method === 'GET' && url.pathname === '/api/bundle') return send(res, core.bundleView())
    if (req.method === 'GET' && url.pathname === '/api/guide') return send(res, core.guideView())
    if (req.method === 'POST' && url.pathname === '/api/seed-class') {
      const { seedDemoClass } = await import('../site/simulate.ts')
      return send(res, { status: 200, body: { seeded: seedDemoClass(core) } })
    }
    if (req.method === 'GET' && url.pathname === '/api/demos') return send(res, core.demosView())
    if (req.method === 'GET' && url.pathname === '/api/demo')
      return send(res, core.explanationDemo(url.searchParams.get('exp') ?? ''))

    if (studentId === '')
      return send(res, { status: 400, body: { error: 'student query param required' } })

    if (req.method === 'GET' && url.pathname === '/api/next')
      return send(res, core.next(studentId, url.searchParams.get('skill'), url.searchParams.get('force') === '1'))
    if (req.method === 'POST' && url.pathname === '/api/attempt')
      return send(res, core.attempt(studentId, (await readBody(req)) as Record<string, never>))
    if (req.method === 'POST' && url.pathname === '/api/explanation-viewed')
      return send(res, core.explanationViewed(studentId))
    if (req.method === 'POST' && url.pathname === '/api/step-attempt')
      return send(res, core.stepAttempt(studentId, (await readBody(req)) as Record<string, unknown>))
    if (req.method === 'POST' && url.pathname === '/api/place')
      return send(res, core.place(studentId, ((await readBody(req)) as { grade?: unknown }).grade))
    if (req.method === 'POST' && url.pathname === '/api/start-check')
      return send(res, core.startCheck(studentId, ((await readBody(req)) as { skillId?: string }).skillId))
    if (req.method === 'GET' && url.pathname === '/api/state') return send(res, core.state(studentId))
    if (req.method === 'GET' && url.pathname === '/api/explain')
      return send(
        res,
        core.explain(studentId, {
          skill: url.searchParams.get('skill') ?? '',
          exclude: (url.searchParams.get('exclude') ?? '').split(',').filter(Boolean),
          prefer: url.searchParams.get('prefer'),
          viewedFirst: url.searchParams.get('viewedFirst') === '1',
        }),
      )
    if (req.method === 'POST' && url.pathname === '/api/explained')
      return send(res, core.explained(studentId, (await readBody(req)) as Record<string, never>))
    if (req.method === 'POST' && url.pathname === '/api/reset') return send(res, core.reset(studentId))
    if (req.method === 'GET' && url.pathname === '/api/events') return send(res, core.events(studentId))

    return send(res, { status: 404, body: { error: 'not found' } })
  }

  const server = createServer((req, res) => {
    void handle(req, res).catch((e: unknown) => {
      send(res, { status: 500, body: { error: String(e) } })
    })
  })

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

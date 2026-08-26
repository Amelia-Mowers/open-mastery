// @vitest-environment node
/** The build-step-3 loop: a client driving the real engine over HTTP against
 * a local site server — lesson → faded → practice → check → mastered. The
 * "client" here is fetch(); the browser PWA arrives with the client app. */
import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { renderTemplate, type Bundle, type Env, type Item } from '@openmastery/schema'
import { loadBundleDir } from '@openmastery/schema/load'
import { createDevSite, type DevSite } from '../../src/server/dev'
import { fixtureBundle } from '../core/fixtures'

const curriculumRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'curriculum')
const hasCurriculum = existsSync(join(curriculumRoot, 'skills'))

function loadCurriculum(): Bundle {
  const bundle: Bundle = { skills: [], items: [], explanations: [] }
  for (const d of ['skills', 'items', 'explanations']) {
    const r = loadBundleDir(join(curriculumRoot, d))
    expect(r.errors).toEqual([])
    bundle.skills.push(...r.bundle.skills)
    bundle.items.push(...r.bundle.items)
    bundle.explanations.push(...r.bundle.explanations)
  }
  return bundle
}

async function listen(site: DevSite): Promise<string> {
  await new Promise<void>((resolve) => site.server.listen(0, resolve))
  return `http://127.0.0.1:${site.port()}`
}

interface ClientOpts {
  /** compute the raw answer for a served item, or null for a wrong answer */
  answerFor: (item: Item, params: Record<string, number | string>) => string | null
  maxSteps?: number
}

/** A thin HTTP client playing the student. It only sees what /api/next
 * returns; correct answers come from the caller's own copy of the bundle. */
async function play(base: string, studentId: string, bundle: Bundle, opts: ClientOpts): Promise<void> {
  const items = new Map(bundle.items.map((i) => [i.id, i]))
  const post = (path: string, body: unknown) =>
    fetch(`${base}${path}?student=${studentId}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  for (let step = 0; step < (opts.maxSteps ?? 400); step++) {
    const r = await fetch(`${base}/api/next?student=${studentId}`)
    const { action, item } = (await r.json()) as { action: Record<string, unknown>; item?: { answer?: unknown } }
    if (action['kind'] === 'session_done') return
    if (action['kind'] === 'lesson' || action['kind'] === 'alt_explanation') {
      await post('/api/explanation-viewed', {})
      continue
    }
    // serve_item — the answer key must never ride along
    expect(item?.answer).toBeUndefined()
    if (action['checkAvailable'] === true) {
      const res = await post('/api/start-check', { skillId: action['forSkillId'] })
      expect(res.status).toBe(200)
      continue
    }
    const instance = action['instance'] as { itemId: string; params: Record<string, number | string> }
    const full = items.get(instance.itemId)!
    const raw = opts.answerFor(full, instance.params)
    await post('/api/attempt', { raw: raw ?? '999999', hintLevel: 0, latencyMs: 3000 })
  }
  throw new Error('client loop did not finish')
}

const correctRaw = (item: Item, params: Record<string, number | string>): string => {
  const r = renderTemplate(item.answer.value as string, params as Env, { numberStyle: 'fraction' })
  if (!r.ok) throw new Error(r.error.message)
  return r.value
}

async function getJson<T>(base: string, path: string, studentId: string): Promise<T> {
  const r = await fetch(`${base}${path}?student=${studentId}`)
  return (await r.json()) as T
}

describe('local site server loop (build step 3)', () => {
  it('a correct student masters the fixture bundle end to end over HTTP', async () => {
    const bundle = fixtureBundle()
    const site = createDevSite(bundle)
    const base = await listen(site)
    try {
      await play(base, 's1', bundle, { answerFor: correctRaw })
      const state = await getJson<{ skills: Record<string, { phase: string; p: number }> }>(base, '/api/state', 's1')
      for (const skill of bundle.skills) {
        expect(state.skills[skill.id]?.phase).toBe('mastered')
        expect(state.skills[skill.id]?.p).toBeGreaterThanOrEqual(0.95)
      }
      const { events } = await getJson<{ events: Array<{ kind: string }> }>(base, '/api/events', 's1')
      expect(events.filter((e) => e.kind === 'mastery_granted')).toHaveLength(bundle.skills.length)
    } finally {
      await site.stop()
    }
  })

  it('a failing student walks the corrective ladder to a guide flag, isolated from other students', async () => {
    const bundle = fixtureBundle()
    const site = createDevSite(bundle)
    const base = await listen(site)
    try {
      await Promise.all([
        play(base, 'good', bundle, { answerFor: correctRaw }),
        play(base, 'bad', bundle, { answerFor: () => null }),
      ])
      const bad = await getJson<{ openFlags: Array<{ reason: string }>; skills: Record<string, { phase: string }> }>(
        base,
        '/api/state',
        'bad',
      )
      expect(bad.openFlags.some((f) => f.reason === 'attempt_cap')).toBe(true)
      expect(Object.values(bad.skills).every((s) => s.phase !== 'mastered')).toBe(true)
      const good = await getJson<{ openFlags: unknown[]; skills: Record<string, { phase: string }> }>(base, '/api/state', 'good')
      expect(good.openFlags).toHaveLength(0)
      expect(Object.values(good.skills).every((s) => s.phase === 'mastered')).toBe(true)
    } finally {
      await site.stop()
    }
  })

  it.skipIf(!hasCurriculum)('the real Prealgebra §8.2 curriculum runs the full loop: all four skills mastered', async () => {
    const bundle = loadCurriculum()
    expect(bundle.skills).toHaveLength(4)
    const site = createDevSite(bundle)
    const base = await listen(site)
    try {
      await play(base, 'learner', bundle, { answerFor: correctRaw })
      const state = await getJson<{ skills: Record<string, { phase: string }> }>(base, '/api/state', 'learner')
      for (const id of [
        'prealg.lineq.divide',
        'prealg.lineq.multiply',
        'prealg.lineq.reciprocal',
        'prealg.lineq.simplify-first',
      ]) {
        expect(state.skills[id]?.phase, id).toBe('mastered')
      }
      const { events } = await getJson<{ events: Array<{ kind: string; skillId?: string }> }>(base, '/api/events', 'learner')
      expect(events.filter((e) => e.kind === 'mastery_granted')).toHaveLength(4)
    } finally {
      await site.stop()
    }
  })
})

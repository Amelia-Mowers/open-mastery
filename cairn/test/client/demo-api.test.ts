// @vitest-environment node
/** The backend-in-the-browser demo: DemoApi wraps SiteCore, persists the
 * event log to (local)storage, and a returning visitor folds back to the
 * same student state. */
import { describe, it, expect } from 'vitest'
import { renderTemplate, type Env } from '@openmastery/schema'
import { DemoApi, type DemoStorage } from '../../src/client/demo/DemoApi'
import { fixtureBundle } from '../core/fixtures'

const memStorage = (): DemoStorage & { data: Map<string, string> } => {
  const data = new Map<string, string>()
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  }
}

describe('DemoApi (backend rolled into the browser)', () => {
  it('drives the full loop to mastery with no server, persisting events', async () => {
    const bundle = fixtureBundle()
    const items = new Map(bundle.items.map((i) => [i.id, i]))
    const storage = memStorage()
    const api = new DemoApi('demo-kid', bundle, storage)

    for (let step = 0; step < 200; step++) {
      const n = await api.next()
      if (n.action.kind === 'session_done') break
      if (n.action.kind === 'lesson' || n.action.kind === 'alt_explanation') {
        await api.explanationViewed()
        continue
      }
      if (n.action.kind !== 'serve_item') throw new Error('unexpected action')
      expect(n.item && 'answer' in n.item).toBe(false) // shape parity with the server
      if (n.action.checkAvailable === true) {
        await api.startCheck(n.action.forSkillId)
        continue
      }
      const full = items.get(n.action.instance.itemId)!
      const r = renderTemplate(full.answer.value as string, n.action.instance.params as Env, {
        numberStyle: 'fraction',
      })
      if (!r.ok) throw new Error(r.error.message)
      await api.attempt(r.value, 0, 3000)
    }

    const state = await api.state()
    for (const s of bundle.skills) expect(state.skills[s.id]?.phase, s.id).toBe('mastered')
    expect(state.points).toBeGreaterThan(0)
    expect(storage.data.get('cairn.demo.events')).toBeDefined()

    // a "reload": a fresh DemoApi over the same storage folds back to mastered
    const again = new DemoApi('demo-kid', bundle, storage)
    const restored = await again.state()
    for (const s of bundle.skills) expect(restored.skills[s.id]?.phase, s.id).toBe('mastered')
    expect(restored.points).toBe(state.points)

    // reset clears this student
    await again.reset()
    const cleared = await again.state()
    expect(Object.keys(cleared.skills)).toHaveLength(0)
  })

  it('explain and demos work offline too', async () => {
    const api = new DemoApi('demo-kid-2', fixtureBundle(), memStorage())
    const r = await api.explain('alg1.arith.inverse-ops')
    expect(r.explanation?.representation).toBe('number-line')
    const { demos } = await api.demos()
    expect(demos.length).toBeGreaterThan(0)
  })
})

describe('reset with more than one live DemoApi', () => {
  it('reset sticks — a second instance cannot resurrect the cleared log', async () => {
    const bundle = fixtureBundle()
    const storage = memStorage()
    const logged = () => JSON.parse(storage.data.get('cairn.demo.events') ?? '[]') as unknown[]
    // the real page holds two at once: the student's and the guide view's
    const student = new DemoApi('kid', bundle, storage)
    const guide = new DemoApi('guide-viewer', bundle, storage)

    await student.next()
    await student.explanationViewed()
    expect(logged().length).toBeGreaterThan(0)

    await student.reset()
    expect(logged()).toEqual([])

    // the guide instance keeps working; its next write must NOT restore the
    // student's events (the old per-instance snapshots did exactly that)
    await guide.guide()
    await guide.next()
    expect(logged().filter((e) => (e as { studentId?: string }).studentId === 'kid')).toEqual([])

    // and a freshly constructed instance (post-reset reload) sees nothing
    const reborn = new DemoApi('kid', bundle, storage)
    const st = await reborn.state()
    expect(st.points).toBe(0)
  })
})

describe('reset races an in-flight serve', () => {
  it('a next() already in flight must not re-populate the log after reset', async () => {
    const bundle = fixtureBundle()
    const storage = memStorage()
    const logged = () => JSON.parse(storage.data.get('cairn.demo.events') ?? '[]') as unknown[]
    const api = new DemoApi('kid', bundle, storage)
    await api.next()
    await api.explanationViewed()
    // the UI fires refresh()/next() and the reset overlaps it
    const inFlight = api.next()
    await api.reset()
    await inFlight
    expect(logged()).toEqual([])
  })
})

describe('milestones arrive with the answer that earns them', () => {
  it('a climbing student crosses named waypoints before any stone', async () => {
    const bundle = fixtureBundle()
    const items = new Map(bundle.items.map((i) => [i.id, i]))
    const api = new DemoApi('climber', bundle, null)
    const seen: string[] = []
    let mastered = false
    for (let step = 0; step < 60 && !mastered; step++) {
      const n = await api.next()
      if (n.action.kind === 'session_done') break
      if (n.action.kind === 'lesson' || n.action.kind === 'alt_explanation') {
        await api.explanationViewed()
        continue
      }
      if (n.action.kind !== 'serve_item') break
      if (n.action.checkAvailable === true) {
        await api.startCheck(n.action.forSkillId)
        continue
      }
      const full = items.get(n.action.instance.itemId)!
      const rendered = renderTemplate(String(full.answer.value), n.action.instance.params as Env, {
        numberStyle: 'fraction',
      })
      const out = await api.attempt(rendered.ok ? rendered.value : '', 0, 800)
      if (out.milestone) seen.push(out.milestone.name)
      mastered = out.emitted.some((e) => e.kind === 'mastery_granted')
    }
    // waypoints land before the stone, each announced once, in order
    expect(seen.length).toBeGreaterThan(0)
    expect(new Set(seen).size).toBe(seen.length)
    const order = ['Getting it', 'Halfway', 'Nearly there']
    expect(seen).toEqual(order.filter((n) => seen.includes(n)))
  })
})

// @vitest-environment node
import { describe, it } from 'vitest'
import { renderTemplate, type Env } from '@openmastery/schema'
import { SiteCore } from '../../src/site/core'
import { fixtureBundle } from '../core/fixtures'
import type { CairnEvent } from '../../src/core/index.ts'

const bundle = fixtureBundle()
const items = new Map(bundle.items.map((i) => [i.id, i]))
const ans = (a: any) => {
  const full = items.get(a.instance.itemId)!
  const r = renderTemplate(String(full.answer.value), a.instance.params as Env, { numberStyle: 'fraction' })
  return r.ok ? r.value : ''
}

describe('audit2', () => {
  it('promised item lost across reload after a representation lesson', () => {
    const core = new SiteCore(bundle)
    const log: CairnEvent[] = []
    core.onEvent = (e) => log.push(e)
    // drive until a mid-skill lesson appears (a representation lesson that
    // reserved an item), i.e. a lesson served when phase is already practice
    for (let step = 0; step < 300; step++) {
      const n = core.next('kid').body as any
      const a = n.action
      if (a.kind === 'session_done') { console.log('done'); break }
      if (a.kind === 'lesson' || a.kind === 'alt_explanation') {
        const stBefore = (core.state('kid').body as any).skills[a.skillId]
        console.log('LESSON', a.explanationId, 'rep', a.representation, 'phase before', stBefore?.phase)
        if (stBefore?.phase === 'practice') {
          // a mid-skill representation lesson -> session.promised is set
          core.explanationViewed('kid')
          const noReload = new SiteCore(bundle, { replay: log.slice() })
          // continuation WITHOUT reload:
          const nA = core.next('kid').body as any
          console.log('  no-reload next:', nA.action.itemKind, nA.action.instance?.itemId, nA.action.instance?.paramHash,
                      'rep', (bundle.items.find(i=>i.id===nA.action.instance?.itemId) as any)?.representation)
          // continuation WITH reload:
          const nB = noReload.next('kid').body as any
          console.log('  reloaded next:', nB.action.kind, nB.action.itemKind, nB.action.instance?.itemId, nB.action.instance?.paramHash,
                      'rep', (bundle.items.find(i=>i.id===nB.action.instance?.itemId) as any)?.representation,
                      nB.action.kind==='lesson'? ('explanation '+nB.action.explanationId+' rep '+nB.action.representation):'')
          return
        }
        core.explanationViewed('kid'); continue
      }
      if (a.kind !== 'serve_item') break
      if (a.checkAvailable === true) { core.startCheck('kid', a.forSkillId); continue }
      core.attempt('kid', { raw: ans(a), hintLevel: 0, latencyMs: 800 })
    }
  })

  it('pending lost: attempt after reload returns 409', () => {
    const core = new SiteCore(bundle)
    const log: CairnEvent[] = []
    core.onEvent = (e) => log.push(e)
    const n = core.next('kid2').body as any
    console.log('first action', n.action.kind)
    core.explanationViewed('kid2')
    const n2 = core.next('kid2').body as any
    console.log('served item', n2.action.itemKind, n2.action.instance.itemId)
    const core2 = new SiteCore(bundle, { replay: log.slice() })
    const r = core2.attempt('kid2', { raw: ans(n2.action), hintLevel: 0, latencyMs: 500 })
    console.log('attempt after reload with no next():', JSON.stringify(r))
    const rv = core2.explanationViewed('kid2')
    console.log('explanationViewed after reload:', JSON.stringify(rv))
    const rc = core2.startCheck('kid2', n2.action.skillId)
    console.log('startCheck after reload:', JSON.stringify(rc))
    const ex = core2.explain('kid2', { skill: n2.action.skillId, forParamHash: n2.action.instance.paramHash })
    console.log('explain w/ forParamHash after reload:', JSON.stringify(ex))
  })
})

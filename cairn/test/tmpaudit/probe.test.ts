// @vitest-environment node
import { describe, it } from 'vitest'
import { renderTemplate, type Env } from '@openmastery/schema'
import { SiteCore } from '../../src/site/core'
import { fixtureBundle } from '../core/fixtures'
import type { CairnEvent } from '../../src/core/index.ts'

describe('audit', () => {
  it('reload mid-check', () => {
    const bundle = fixtureBundle()
    const items = new Map(bundle.items.map((i) => [i.id, i]))
    const ans = (a: any) => {
      const full = items.get(a.instance.itemId)!
      const r = renderTemplate(String(full.answer.value), a.instance.params as Env, { numberStyle: 'fraction' })
      return r.ok ? r.value : ''
    }
    const core = new SiteCore(bundle)
    const log: CairnEvent[] = []
    core.onEvent = (e) => log.push(e)
    let startedCheck = false
    let checkItem1: any = null
    for (let step = 0; step < 300; step++) {
      const n = core.next('kid').body as any
      const a = n.action
      if (a.kind === 'session_done') { console.log('session_done at', step); break }
      if (a.kind === 'lesson' || a.kind === 'alt_explanation') { core.explanationViewed('kid'); continue }
      if (a.kind !== 'serve_item') break
      if (a.checkAvailable === true && !startedCheck) {
        core.startCheck('kid', a.forSkillId); startedCheck = true
        console.log('CHECK STARTED on', a.forSkillId); continue
      }
      if (a.itemKind === 'check' && checkItem1 === null) {
        checkItem1 = a
        console.log('check item 1:', a.instance.itemId, a.instance.paramHash, 'idx', a.checkIndex)
        const out = core.attempt('kid', { raw: ans(a), hintLevel: 0, latencyMs: 800 }).body as any
        console.log('  correct?', out.correct, 'emitted', out.emitted.map((e:any)=>e.kind))
        console.log('--- RELOAD (new SiteCore from log) ---')
        const core2 = new SiteCore(bundle, { replay: log.slice() })
        const n2 = core2.next('kid').body as any
        console.log('after reload next:', JSON.stringify({kind:n2.action.kind,itemKind:n2.action.itemKind,skill:n2.action.skillId,checkAvailable:n2.action.checkAvailable,item:n2.action.instance?.itemId,hash:n2.action.instance?.paramHash}))
        console.log('identical to passed check item?', n2.action.instance?.itemId===checkItem1.instance.itemId && n2.action.instance?.paramHash===checkItem1.instance.paramHash)
        const sc = core2.startCheck('kid', checkItem1.forSkillId)
        console.log('startCheck again ->', JSON.stringify(sc))
        const n3 = core2.next('kid').body as any
        console.log('restarted check item:', n3.action.itemKind, 'idx', n3.action.checkIndex, n3.action.instance?.itemId, n3.action.instance?.paramHash)
        console.log('SAME INSTANCE AS ALREADY-PASSED?', n3.action.instance?.itemId===checkItem1.instance.itemId && n3.action.instance?.paramHash===checkItem1.instance.paramHash)
        return
      }
      core.attempt('kid', { raw: ans(a), hintLevel: 0, latencyMs: 800 })
    }
  })
})

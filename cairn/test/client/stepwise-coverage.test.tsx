/** Fail loudly (standing rule): every authored expect gate must accept ITS
 * OWN rendered key — an unpassable gate is worse than no gate. Drives each
 * gated curriculum explanation through the StepwisePlayer, answering every
 * gate with the key itself (op entry, pick set, typed line/value), and
 * requires the run to complete. Catches wrong-form keys, unparseable
 * values, and player/input mismatches at authoring time. */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { loadBundleDir } from '@openmastery/schema/load'
import type { Explanation, StepExpect } from '@openmastery/schema'
import { buildIndex } from '../../src/core/curriculum'
import { practiceItems } from '../../src/core/select'
import { feedableParams } from '../../src/site/core'
import { StepwisePlayer } from '../../src/client/app/StepwisePlayer'
import { renderText, type Params } from '../../src/client/app/render'

afterEach(cleanup)

const curriculumRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'curriculum')
const has = existsSync(join(curriculumRoot, 'skills'))

/** gated explanations, truncated the way the faded/stepwise lead plays them */
function gatedExplanations(): Array<{ e: Explanation; truncated: Explanation; params: Params }> {
  const bundle = { skills: [] as never[], items: [] as never[], explanations: [] as never[] }
  for (const d of ['skills', 'items', 'explanations']) {
    const r = loadBundleDir(join(curriculumRoot, d))
    if (r.errors.length > 0) throw new Error(JSON.stringify(r.errors))
    bundle.skills.push(...(r.bundle.skills as never[]))
    bundle.items.push(...(r.bundle.items as never[]))
    bundle.explanations.push(...(r.bundle.explanations as never[]))
  }
  const cur = buildIndex(bundle as never)
  const out: Array<{ e: Explanation; truncated: Explanation; params: Params }> = []
  for (const e of cur.explanations.values()) {
    const content = e.timeline.filter((st) => st.patch !== undefined || st.caption !== undefined)
    if (content.length < 2) continue
    const truncated = { ...e, timeline: content.slice(0, -1) }
    if (!truncated.timeline.some((st) => st.expect !== undefined)) continue
    // NO SILENT FALLBACK: params that cannot feed this timeline render
    // raw "{a*b}" on the board. A timeline no item can feed is a
    // curriculum fault and must fail here, not render half-templated.
    const all = practiceItems(e.skill, cur)
    const rep = all.filter((it) => it.representation === e.representation)
    const fed = feedableParams(e, [...rep.map((it) => it.params), ...all.map((it) => it.params)])
    if (fed === null) throw new Error(`${e.id}: no item of ${e.skill} can feed this timeline`)
    const params = fed as Params
    out.push({ e, truncated, params })
  }
  return out
}

const cases = has ? gatedExplanations() : []

describe.skipIf(!has)('every stepwise gate accepts its own key', () => {
  it.each(cases.map((c) => [c.e.id, c] as const))(
    '%s',
    async (_id, { truncated, params }) => {
      const user = userEvent.setup()
      const done = vi.fn()
      const gates: StepExpect[] = truncated.timeline
        .filter((st) => st.expect !== undefined)
        .map((st) => st.expect!)
      const { container } = render(
        <StepwisePlayer explanation={truncated} params={params} stepDelayMs={5} onReachedEnd={done} />,
      )
      for (const g of gates) {
        if (g.type === 'op') {
          const [word, ...rest] = renderText(String(g.value), params).split(/\s+/)
          const sym = await waitFor(() => {
            const el = container.querySelector(`[data-op-sym="${word}"]`)
            expect(el).toBeTruthy()
            return el!
          })
          await user.click(sym)
          const by = container.querySelector('[data-op-by]')! as HTMLInputElement
          await user.clear(by)
          await user.type(by, rest.join(' '))
        } else if (g.type === 'pick') {
          for (const v of g.value as Array<string | number>) {
            const seg = await waitFor(() => {
              const el = container.querySelector(`[data-pick-seg="${Number(v)}"]`)
              expect(el).toBeTruthy()
              return el!
            })
            if (seg.getAttribute('aria-pressed') !== 'true') await user.click(seg)
          }
        } else {
          const input = await waitFor(() => {
            const el = container.querySelector('.stepwise-gate input.answer-input')
            expect(el).toBeTruthy()
            return el! as HTMLInputElement
          })
          await user.clear(input)
          await user.type(input, renderText(String(g.value), params))
        }
        await user.click(screen.getByTestId('stepwise-check'))
        // the key must GRADE CORRECT: no miss feedback may appear
        expect(
          screen.queryByTestId('stepwise-feedback')?.textContent ?? '',
          `${_id}: gate '${String(g.value)}' rejected its own key`,
        ).toBe('')
      }
      await waitFor(() => expect(done).toHaveBeenCalled())
      expect(done).toHaveBeenCalledWith({ misses: 0, reveals: 0 })
    },
    15000,
  )
})

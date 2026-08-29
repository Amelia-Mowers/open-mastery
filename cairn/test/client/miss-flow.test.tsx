// @vitest-environment jsdom
/** The post-miss BUTTON HIERARCHY, as the student meets it.
 *
 * After a wrong answer the next move should be to SEE IT WORKED, not to
 * move on: "Show me how" is the primary and Continue steps back to quiet.
 *
 * NOTE: this fixture cannot reproduce the 409 that made "Show me how" do
 * nothing after a miss — its skill's family params can feed the
 * explanation, so the walkthrough opens either way. The regression that
 * matters is covered by test/site/walkthrough-after-miss.test.ts, which
 * asserts the real catalog's instance params survive grading. Keep both:
 * this one guards the affordance, that one guards the data.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createDevSite, type DevSite } from '../../src/server/dev'
import { fixtureBundle } from '../core/fixtures'
import { App } from '../../src/client/app/App'

let site: DevSite
let base: string

beforeAll(async () => {
  site = createDevSite(fixtureBundle())
  await new Promise<void>((resolve) => site.server.listen(0, resolve))
  base = `http://127.0.0.1:${site.port()}`
})
afterAll(async () => {
  await site.stop()
})

/** walk to the first answerable problem, mirroring app.test.tsx's driver
 * (the stepwise player needs its step-jump, not a wait) */
async function reachProblem(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  for (let i = 0; i < 40; i++) {
    if (screen.queryByTestId('stem') && screen.queryByRole('button', { name: 'Check answer' }))
      return
    const cont = screen.queryByRole('button', { name: 'Continue' })
    const handoff =
      screen.queryByRole('button', { name: 'Now you try.' }) ??
      screen.queryByRole('button', { name: 'Start the lesson' })
    const segs = screen.queryAllByRole('button', { name: /Go to step/ })
    if (handoff) await user.click(handoff)
    else if (segs.length > 0) fireEvent.click(segs[segs.length - 1]!)
    else if (cont) await user.click(cont)
    else await new Promise((r) => setTimeout(r, 50))
  }
  throw new Error('never reached a problem')
}

describe('after a wrong answer', () => {
  it('makes "Show me how" primary and Continue quiet, and opens the walkthrough', { timeout: 25000 }, async () => {
    const user = userEvent.setup()
    render(<App apiBase={base} initialStudent="miss-kid" />)
    await waitFor(() => reachProblem(user), { timeout: 15000 })
    const input = screen.getByRole('textbox')
    await user.clear(input)
    await user.type(input, '99999')
    await user.click(screen.getByRole('button', { name: /check answer/i }))

    // the miss landed
    await waitFor(() => expect(screen.getByRole('status')).toBeTruthy(), { timeout: 8000 })

    // "Show me how" is on offer and is the PRIMARY action; Continue is quiet
    const show = await screen.findByRole('button', { name: /show me how/i })
    expect(show.className).toContain('btn-primary')
    const cont = screen.getByRole('button', { name: /^continue$/i })
    expect(cont.className).toContain('btn-quiet')

    // and clicking it actually opens a walkthrough (it used to 409)
    await user.click(show)
    // the walkthrough is a LessonPlayer: its step controls are the tell
    await waitFor(
      () => {
        const playing =
          screen.queryAllByRole('button', { name: /Go to step/ }).length > 0 ||
          screen.queryByRole('button', { name: /another way/i }) !== null
        expect(playing, 'the walkthrough never opened').toBe(true)
      },
      { timeout: 8000 },
    )
  })
})

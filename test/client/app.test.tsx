/** Client E2E (jsdom): the real <App/> against a real site server over HTTP.
 * A simulated student clicks through lesson → practice → mastery check and
 * must see the mastery moment. Browser-level (Playwright) E2E comes with the
 * device CI lane; this covers the client logic end to end without mocks. */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
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

/** answers for the fixture stems */
function answerFor(stem: string): string {
  let m = /What is (-?\d+) ÷ (-?\d+)\?/.exec(stem)
  if (m) return String(Number(m[1]) / Number(m[2]))
  m = /(?:Solve|Finish solving): (-?\d+)[a-z] = (-?\d+)\./.exec(stem)
  if (m) return String(Number(m[2]) / Number(m[1]))
  throw new Error(`unrecognized stem: ${stem}`)
}

type Actionable =
  | { kind: 'granted' }
  | { kind: 'continue'; el: HTMLElement }
  | { kind: 'start-check'; el: HTMLElement }
  | { kind: 'handoff'; el: HTMLElement }
  | { kind: 'next'; el: HTMLElement }
  | { kind: 'item' }

function findActionable(): Actionable {
  if (screen.queryByText(/Skill mastered/)) return { kind: 'granted' }
  const cont = screen.queryByRole('button', { name: 'Continue' })
  if (cont) return { kind: 'continue', el: cont }
  const check = screen.queryByRole('button', { name: 'Start the check' })
  if (check) return { kind: 'start-check', el: check }
  const handoff = screen.queryByRole('button', { name: 'Now you try.' })
  if (handoff) return { kind: 'handoff', el: handoff }
  const submit = screen.queryByRole('button', { name: 'Check answer' })
  if (submit && screen.queryByTestId('stem')) return { kind: 'item' }
  const next = screen.queryByRole('button', { name: 'Next' })
  if (next) return { kind: 'next', el: next }
  throw new Error('nothing actionable yet')
}

describe('PWA client against the site server', () => {
  it('a student clicks through lesson → practice → check and sees the mastery moment', async () => {
    const user = userEvent.setup()
    render(<App apiBase={base} initialStudent="jsdom-kid" />)

    let sawCheckItem = false
    let granted = false
    for (let i = 0; i < 60 && !granted; i++) {
      const a = await waitFor(findActionable, { timeout: 4000 })
      switch (a.kind) {
        case 'granted':
          granted = true
          break
        case 'continue':
        case 'start-check':
        case 'handoff':
        case 'next':
          await user.click(a.el)
          break
        case 'item': {
          if (screen.queryByText(/MASTERY CHECK/)) sawCheckItem = true
          const stem = screen.getByTestId('stem').textContent ?? ''
          const input = screen.getByRole('textbox')
          await user.clear(input)
          await user.type(input, answerFor(stem))
          await user.click(screen.getByRole('button', { name: 'Check answer' }))
          break
        }
      }
    }

    expect(granted).toBe(true)
    expect(sawCheckItem).toBe(true)
    // the mastery moment names the evidence
    expect(screen.getByText(/two unassisted problems/)).toBeInTheDocument()
    // server agrees: the skill is mastered
    const state = (await (await fetch(`${base}/api/state?student=jsdom-kid`)).json()) as {
      skills: Record<string, { phase: string }>
    }
    expect(Object.values(state.skills).some((s) => s.phase === 'mastered')).toBe(true)
  }, 30_000)

  it('a hint is a click away in practice and its use is reported to the server', async () => {
    const user = userEvent.setup()
    render(<App apiBase={base} initialStudent="hint-kid" />)

    // walk to the first practice item
    for (let i = 0; i < 10; i++) {
      const a = await waitFor(findActionable, { timeout: 4000 })
      if (a.kind === 'item') break
      if (a.kind === 'handoff' || a.kind === 'next') await user.click(a.el)
    }
    await user.click(await screen.findByRole('button', { name: 'Hint' }))
    expect(await screen.findByTestId('hint-1')).toBeInTheDocument()

    const stem = screen.getByTestId('stem').textContent ?? ''
    await user.type(screen.getByRole('textbox'), answerFor(stem))
    await user.click(screen.getByRole('button', { name: 'Check answer' }))
    const fb = await screen.findByRole('status')
    expect(fb.textContent).toMatch(/reduced evidence/)

    const { events } = (await (await fetch(`${base}/api/events?student=hint-kid`)).json()) as {
      events: Array<{ kind: string; hintLevel?: number; assisted?: boolean }>
    }
    const attempt = events.find((e) => e.kind === 'attempt')
    expect(attempt).toMatchObject({ hintLevel: 1, assisted: true })
  }, 30_000)
})

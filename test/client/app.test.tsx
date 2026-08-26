/** Client E2E (jsdom): the real <App/> against a real site server over HTTP.
 * A simulated student clicks through lesson → practice → mastery check and
 * must see the mastery moment. Browser-level (Playwright) E2E comes with the
 * device CI lane; this covers the client logic end to end without mocks. */
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
  | { kind: 'player'; el: HTMLElement }
  | { kind: 'item' }

function findActionable(): Actionable {
  if (screen.queryByText(/Mastered!/)) return { kind: 'granted' }
  const cont = screen.queryByRole('button', { name: 'Continue' })
  if (cont) return { kind: 'continue', el: cont }
  const check = screen.queryByRole('button', { name: 'Take the check' })
  if (check) return { kind: 'start-check', el: check }
  const handoff = screen.queryByRole('button', { name: 'Now you try.' })
  if (handoff) return { kind: 'handoff', el: handoff }
  const startLesson = screen.queryByRole('button', { name: 'Start the lesson' })
  if (startLesson) return { kind: 'handoff', el: startLesson }
  const submit = screen.queryByRole('button', { name: 'Check answer' })
  if (submit && screen.queryByTestId('stem')) return { kind: 'item' }
  const segs = screen.queryAllByRole('button', { name: /Go to step/ })
  if (segs.length > 0) return { kind: 'player', el: segs[segs.length - 1]! }
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
          await user.click(a.el)
          break
        case 'player':
          // jump straight to the handoff instead of waiting out autoplay
          fireEvent.click(a.el)
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
    expect(screen.getByText(/new stone lands on your cairn/)).toBeInTheDocument()
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
      if (a.kind === 'handoff') await user.click(a.el)
      if (a.kind === 'player') fireEvent.click(a.el)
    }
    await user.click(await screen.findByRole('button', { name: 'Hint' }))
    expect(await screen.findByTestId('hint-1')).toBeInTheDocument()

    const stem = screen.getByTestId('stem').textContent ?? ''
    await user.type(screen.getByRole('textbox'), answerFor(stem))
    await user.click(screen.getByRole('button', { name: 'Check answer' }))
    const fb = await screen.findByRole('status')
    expect(fb.textContent).toMatch(/the hint helped/)

    const { events } = (await (await fetch(`${base}/api/events?student=hint-kid`)).json()) as {
      events: Array<{ kind: string; hintLevel?: number; assisted?: boolean }>
    }
    const attempt = events.find((e) => e.kind === 'attempt')
    expect(attempt).toMatchObject({ hintLevel: 1, assisted: true })
  }, 30_000)

  it('"Show me how" plays the explanation with the problem\u2019s numbers and marks the try as helped', async () => {
    const user = userEvent.setup()
    render(<App apiBase={base} initialStudent="show-kid" />)

    // walk to the first practice item
    for (let i = 0; i < 10; i++) {
      const a = await waitFor(findActionable, { timeout: 4000 })
      if (a.kind === 'item') break
      if (a.kind === 'handoff') await user.click(a.el)
      if (a.kind === 'player') fireEvent.click(a.el)
    }
    const stem = screen.getByTestId('stem').textContent ?? ''
    await user.click(screen.getByRole('button', { name: 'Show me how' }))

    // preamble names the skill, then the walk-through plays
    await screen.findByText(/what you're learning/i)
    await user.click(screen.getByRole('button', { name: 'Start the lesson' }))
    const segs = await screen.findAllByRole('button', { name: /Go to step/ })
    fireEvent.click(segs[segs.length - 1]!)
    await user.click(await screen.findByRole('button', { name: 'Now you try.' }))

    // back on the SAME problem, now marked as a helped try
    await waitFor(() => expect(screen.getByTestId('stem').textContent).toBe(stem))
    expect(screen.getByText(/counts as a helped try/)).toBeInTheDocument()
    await user.type(screen.getByRole('textbox'), answerFor(stem))
    await user.click(screen.getByRole('button', { name: 'Check answer' }))
    await screen.findByRole('status')

    const { events } = (await (await fetch(`${base}/api/events?student=show-kid`)).json()) as {
      events: Array<{ kind: string; assisted?: boolean; hintLevel?: number; explanationId?: string }>
    }
    // the on-demand view was logged, and the attempt carries assistance
    expect(events.some((e) => e.kind === 'explanation_viewed')).toBe(true)
    const attempt = events.filter((e) => e.kind === 'attempt').pop()!
    expect(attempt.assisted).toBe(true)
    expect(attempt.hintLevel).toBeGreaterThanOrEqual(1)
  }, 30_000)

  it('a struggling student is flagged softly and can choose to keep practicing', async () => {
    const user = userEvent.setup()
    render(<App apiBase={base} initialStudent="grit-kid" />)

    // answer everything wrong until the guide-flag moment offers a choice
    let keepBtn: HTMLElement | null = null
    for (let i = 0; i < 40 && !keepBtn; i++) {
      const found = await waitFor((): Actionable | { kind: 'park'; el: HTMLElement } => {
        const keep = screen.queryByRole('button', { name: 'Keep practicing this' })
        if (keep) return { kind: 'park', el: keep }
        return findActionable()
      }, { timeout: 4000 })
      if (found.kind === 'park') {
        keepBtn = found.el
        break
      }
      switch (found.kind) {
        case 'continue':
        case 'handoff':
          await user.click(found.el)
          break
        case 'player':
          fireEvent.click(found.el)
          break
        case 'item':
          await user.type(screen.getByRole('textbox'), '999999')
          await user.click(screen.getByRole('button', { name: 'Check answer' }))
          break
        default:
          break
      }
    }
    expect(keepBtn).not.toBeNull()
    // the message is supportive, not punitive
    expect(screen.getByText(/your guide will come check in/i)).toBeInTheDocument()

    // choosing to keep practicing serves the SAME skill again
    await user.click(keepBtn!)
    await waitFor(() => expect(screen.getByTestId('stem')).toBeInTheDocument(), { timeout: 4000 })
    const { events } = (await (await fetch(`${base}/api/events?student=grit-kid`)).json()) as {
      events: Array<{ kind: string; skillId?: string; reason?: string }>
    }
    const flag = events.find((e) => e.kind === 'guide_flag')!
    expect(flag).toBeDefined()
    // and answering there emits attempts on the flagged skill with no new flags
    await user.type(screen.getByRole('textbox'), '999999')
    await user.click(screen.getByRole('button', { name: 'Check answer' }))
    await screen.findByRole('button', { name: 'Continue' })
    const after = (await (await fetch(`${base}/api/events?student=grit-kid`)).json()) as {
      events: Array<{ kind: string; skillId?: string }>
    }
    expect(after.events.filter((e) => e.kind === 'guide_flag')).toHaveLength(1)
    const attempts = after.events.filter((e) => e.kind === 'attempt')
    expect(attempts[attempts.length - 1]!.skillId).toBe(flag.skillId)
  }, 30_000)
})

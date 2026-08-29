// @vitest-environment jsdom
/** The same post-miss flow, against the DEMO backend (DemoApi + SiteCore
 * in-browser) — the thing actually deployed on GitHub Pages, and where
 * the report came from. DemoApi used to pass 409s through as a body,
 * so "Show me how" after a wrong answer silently did nothing. */
import { describe, it, expect } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from '../../src/client/app/App'
import { DemoApi } from '../../src/client/demo/DemoApi'
import { fixtureBundle } from '../core/fixtures'

describe('demo backend: after a wrong answer', () => {
  it('opens the walkthrough instead of silently doing nothing', { timeout: 25000 }, async () => {
    const user = userEvent.setup()
    const bundle = fixtureBundle()
    render(
      <App
        // null storage: no localStorage carry-over between runs
        apiFactory={(_b, student) => new DemoApi(student, bundle, null)}
        initialStudent="demo-miss"
      />,
    )

    // reach a problem
    await waitFor(
      async () => {
        for (let i = 0; i < 40; i++) {
          if (screen.queryByTestId('stem') && screen.queryByRole('button', { name: 'Check answer' }))
            return
          const handoff =
            screen.queryByRole('button', { name: 'Now you try.' }) ??
            screen.queryByRole('button', { name: 'Start the lesson' })
          const segs = screen.queryAllByRole('button', { name: /Go to step/ })
          const cont = screen.queryByRole('button', { name: 'Continue' })
          if (handoff) await user.click(handoff)
          else if (segs.length > 0) fireEvent.click(segs[segs.length - 1]!)
          else if (cont) await user.click(cont)
          else await new Promise((r) => setTimeout(r, 50))
        }
        throw new Error('never reached a problem')
      },
      { timeout: 15000 },
    )

    const input = screen.getByRole('textbox')
    await user.clear(input)
    await user.type(input, '99999')
    await user.click(screen.getByRole('button', { name: 'Check answer' }))
    await waitFor(() => expect(screen.getByRole('status')).toBeTruthy(), { timeout: 8000 })

    const show = await screen.findByRole('button', { name: /show me how/i })
    await user.click(show)
    await waitFor(
      () => {
        const playing =
          screen.queryAllByRole('button', { name: /Go to step/ }).length > 0 ||
          screen.queryByRole('button', { name: /another way/i }) !== null
        expect(playing, 'the walkthrough never opened in the demo').toBe(true)
      },
      { timeout: 8000 },
    )
  })
})

describe('the walk-through owns the screen while it plays', () => {
  it('no competing continue and no stale verdict under an open walk-through', { timeout: 25000 }, async () => {
    const user = userEvent.setup()
    const bundle = fixtureBundle()
    render(
      <App apiFactory={(_b, student) => new DemoApi(student, bundle, null)} initialStudent="tidy" />,
    )
    await waitFor(
      async () => {
        for (let i = 0; i < 40; i++) {
          if (screen.queryByTestId('stem') && screen.queryByRole('button', { name: 'Check answer' }))
            return
          const handoff =
            screen.queryByRole('button', { name: 'Now you try.' }) ??
            screen.queryByRole('button', { name: 'Start the lesson' })
          const segs = screen.queryAllByRole('button', { name: /Go to step/ })
          const cont = screen.queryByRole('button', { name: 'Continue' })
          if (handoff) await user.click(handoff)
          else if (segs.length > 0) fireEvent.click(segs[segs.length - 1]!)
          else if (cont) await user.click(cont)
          else await new Promise((r) => setTimeout(r, 50))
        }
        throw new Error('never reached a problem')
      },
      { timeout: 15000 },
    )
    const input = screen.getByRole('textbox')
    await user.clear(input)
    await user.type(input, '99999')
    await user.click(screen.getByRole('button', { name: 'Check answer' }))
    await waitFor(() => expect(screen.getByRole('status')).toBeTruthy(), { timeout: 8000 })

    await user.click(await screen.findByRole('button', { name: /show me how/i }))
    await waitFor(
      () => expect(screen.queryAllByRole('button', { name: /Go to step/ }).length).toBeGreaterThan(0),
      { timeout: 8000 },
    )

    // the walk-through's own "Now you try." is the ONLY exit on screen
    expect(screen.queryByRole('button', { name: /^continue$/i })).toBeNull()
    expect(screen.queryAllByRole('button', { name: /show me how/i })).toHaveLength(0)
    // and the verdict banner has stood down
    expect(screen.queryByText(/not quite/i)).toBeNull()
  })
})

describe('watching the walk-through does not dump hints', () => {
  it('shows no hint text afterwards, but still counts as a helped try', { timeout: 25000 }, async () => {
    const user = userEvent.setup()
    const bundle = fixtureBundle()
    const submitted: Array<[string, number]> = []
    render(
      <App
        apiFactory={(_b, student) => {
          const api = new DemoApi(student, bundle, null)
          const real = api.attempt.bind(api)
          api.attempt = (raw, hintLevel, latencyMs) => {
            submitted.push([raw, hintLevel])
            return real(raw, hintLevel, latencyMs)
          }
          return api
        }}
        initialStudent="nohints"
      />,
    )
    await waitFor(
      async () => {
        for (let i = 0; i < 40; i++) {
          if (screen.queryByTestId('stem') && screen.queryByRole('button', { name: 'Check answer' }))
            return
          const handoff =
            screen.queryByRole('button', { name: 'Now you try.' }) ??
            screen.queryByRole('button', { name: 'Start the lesson' })
          const segs = screen.queryAllByRole('button', { name: /Go to step/ })
          const cont = screen.queryByRole('button', { name: 'Continue' })
          if (handoff) await user.click(handoff)
          else if (segs.length > 0) fireEvent.click(segs[segs.length - 1]!)
          else if (cont) await user.click(cont)
          else await new Promise((r) => setTimeout(r, 50))
        }
        throw new Error('never reached a problem')
      },
      { timeout: 15000 },
    )

    // ask for the walk-through BEFORE answering, and watch it out
    await user.click(screen.getByRole('button', { name: /show me how/i }))
    await waitFor(
      () => expect(screen.queryAllByRole('button', { name: /Go to step/ }).length).toBeGreaterThan(0),
      { timeout: 8000 },
    )
    // jump to the final step so the handoff appears (autoplay would take
    // the timeline's full running time)
    const segs = screen.queryAllByRole('button', { name: /Go to step/ })
    fireEvent.click(segs[segs.length - 1]!)
    // the handoff label comes from the timeline's own prompt, so match the
    // button by its role in the player rather than by wording
    const done = await waitFor(() => {
      const el = document.querySelector<HTMLButtonElement>('button.handoff')
      if (!el) throw new Error('no handoff button')
      return el
    })
    await user.click(done)

    // NO hint text appeared
    await waitFor(() => expect(screen.queryByTestId('hint-1')).toBeNull())
    expect(screen.queryByTestId('hint-2')).toBeNull()

    // ...but the attempt is still recorded as maximally assisted
    const input = screen.getByRole('textbox')
    await user.clear(input)
    await user.type(input, '99999')
    await user.click(screen.getByRole('button', { name: 'Check answer' }))
    await waitFor(() => expect(submitted.length).toBeGreaterThan(0), { timeout: 8000 })
    expect(submitted[submitted.length - 1]![1], 'a watched walk-through is maximal assistance').toBe(2)
  })
})

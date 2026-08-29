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

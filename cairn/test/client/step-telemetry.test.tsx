// @vitest-environment jsdom
/** Stepwise moves must leave a trace.
 *
 * Only final answers were logged, so the system that decomposes a problem
 * into moves could not say WHICH move a student missed — the entire
 * reason to decompose it, and why the guide view's flags column had
 * nothing to put in it.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { loadBundleDir } from '@openmastery/schema/load'
import { App } from '../../src/client/app/App'
import { DemoApi } from '../../src/client/demo/DemoApi'
import { SiteCore } from '../../src/site/core'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'curriculum')

function realBundle() {
  const b = { skills: [] as never[], items: [] as never[], explanations: [] as never[] }
  for (const d of ['skills', 'items', 'explanations']) {
    const r = loadBundleDir(join(root, d))
    b.skills.push(...(r.bundle.skills as never[]))
    b.items.push(...(r.bundle.items as never[]))
    b.explanations.push(...(r.bundle.explanations as never[]))
  }
  return b
}

describe('stepwise telemetry', () => {
  beforeEach(() => {
    try {
      localStorage.clear()
    } catch {
      /* fine */
    }
  })

  it('records which step was missed, with its diagnosis', { timeout: 30000 }, async () => {
    if (!existsSync(root)) return
    const user = userEvent.setup()
    const bundle = realBundle()
    // drive the real DemoApi, but read the durable log off the core it
    // wraps — the events ARE the assertion here
    const core = new SiteCore(bundle as never, { now: () => Date.UTC(2026, 0, 1) })
    const api = new DemoApi('steps', bundle, null)
    ;(api as unknown as { core: SiteCore }).core = core
    render(<App apiFactory={() => api} initialStudent="steps" />)
    const events = (): Array<Record<string, unknown>> =>
      core.log as unknown as Array<Record<string, unknown>>

    // walk to a stepwise gate and answer it WRONG
    await waitFor(
      async () => {
        for (let i = 0; i < 60; i++) {
          // the gate container is also rendered EMPTY between steps to
          // reserve its height — wait for a gate that can actually be
          // answered, not merely for the box
          if (
            screen.queryByTestId('stepwise-check') !== null ||
            screen.queryByTestId('stepwise-showme') !== null
          )
            return
          const handoff =
            screen.queryByRole('button', { name: 'Now you try.' }) ??
            screen.queryByRole('button', { name: 'Start the lesson' })
          // an autoplaying lesson only offers its handoff at the END —
          // jump to the last step rather than waiting out the timeline
          const segs = screen.queryAllByRole('button', { name: /Go to step/ })
          const cont = screen.queryByRole('button', { name: 'Continue' })
          if (handoff) await user.click(handoff)
          else if (segs.length > 0) fireEvent.click(segs[segs.length - 1]!)
          else if (cont) await user.click(cont)
          else await new Promise((r) => setTimeout(r, 60))
        }
        throw new Error(
          'no stepwise gate reached; buttons on screen: ' +
            [...document.querySelectorAll('button')].map((b) => b.textContent?.trim()).join(' | ') +
            ' ;; testids: ' +
            [...document.querySelectorAll('[data-testid]')]
              .map((e) => e.getAttribute('data-testid'))
              .join(','),
        )
      },
      { timeout: 20000 },
    )
    // Get the gate WRONG, whatever kind it is. "Show me" is always
    // present and always logs a step_attempt (revealed), so it is the
    // gate-type-independent way to make a move happen — the assertions
    // below are about the EVENT, not about which input was used.
    const gateEl = screen.getByTestId('stepwise-gate')
    const input = gateEl.querySelector<HTMLInputElement>('input')
    const check = screen.queryByTestId('stepwise-check')
    if (input && check) {
      await user.type(input, '99999')
      fireEvent.click(check)
    } else {
      fireEvent.click(screen.getByTestId('stepwise-showme'))
    }

    await waitFor(() =>
      expect(events().some((e) => e['kind'] === 'step_attempt')).toBe(true),
    )
    const step = events().find((e) => e['kind'] === 'step_attempt')!
    // the trace names the STEP, not just the problem
    expect(typeof step['stepIndex']).toBe('number')
    expect(step['correct']).toBe(false)
    expect(typeof step['explanationId']).toBe('string')
    expect(typeof step['skillId']).toBe('string')
  })
})

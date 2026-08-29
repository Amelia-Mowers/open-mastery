// @vitest-environment jsdom
/** The demo dropped every new student on the first skill in the graph —
 * grade-6 algebra — with no placement and no choice. A parent of a
 * 9-year-old read "K–8", clicked Start, saw algebra, and left.
 *
 * The sign-in card now asks for a grade. Grades the catalog cannot teach
 * yet are shown but disabled, so the intended 3–12 scope stays visible
 * without promising material that does not exist.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { loadBundleDir } from '@openmastery/schema/load'
import { App } from '../../src/client/app/App'
import { DemoApi } from '../../src/client/demo/DemoApi'
import { fixtureBundle } from '../core/fixtures'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'curriculum')

/** the picker derives grades from CCSS standards, which only the real
 * catalog carries — the fixture has none, and correctly shows no picker */
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

describe('grade picker', () => {
  // the join card remembers the last student in localStorage; each case
  // must start from a cold sign-in
  beforeEach(() => {
    try {
      localStorage.clear()
    } catch {
      /* storage unavailable is fine */
    }
  })

  it('offers 3–12, disables what is not built, and places the student', async () => {
    if (!existsSync(root)) return
    const user = userEvent.setup()
    const bundle = realBundle()
    const placed: number[] = []
    render(
      <App
        demoBanner
        apiFactory={(_b, student) => {
          const api = new DemoApi(student, bundle, null)
          const real = api.place.bind(api)
          api.place = (g) => {
            placed.push(g)
            return real(g)
          }
          return api
        }}
      />,
    )

    // the whole intended range is visible…
    const three = await screen.findByRole('button', { name: '3' })
    expect(three).toBeTruthy()
    expect(screen.getByRole('button', { name: '12' })).toBeTruthy()
    // …but grades with no curriculum are not selectable
    expect((three as HTMLButtonElement).disabled).toBe(true)

    // the grades the catalog can teach are offered
    const offered = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
      .map((g) => screen.getByRole('button', { name: String(g) }) as HTMLButtonElement)
      .filter((b) => !b.disabled)
    expect(offered.length).toBeGreaterThan(0)

    // Start is inert until a name is typed (the report's silent no-op)
    const start = screen.getByRole('button', { name: 'Start' })
    expect((start as HTMLButtonElement).disabled).toBe(true)

    await user.click(offered[0]!)
    await user.type(screen.getByLabelText(/your name/i), 'ada')
    await user.click(start)

    // the choice reached the engine
    await waitFor(() => expect(placed.length).toBe(1))
  })

  it('joining without picking a grade still works', async () => {
    const user = userEvent.setup()
    const bundle = fixtureBundle()
    const placed: number[] = []
    render(
      <App
        demoBanner
        apiFactory={(_b, student) => {
          const api = new DemoApi(student, bundle, null)
          const real = api.place.bind(api)
          api.place = (g) => {
            placed.push(g)
            return real(g)
          }
          return api
        }}
      />,
    )
    await user.type(await screen.findByLabelText(/your name/i), 'sam')
    await user.click(screen.getByRole('button', { name: 'Start' }))
    // no grade chosen ⇒ no placement, and entry is not blocked
    await waitFor(() => expect(screen.queryByLabelText(/your name/i)).toBeNull())
    expect(placed).toEqual([])
  })
})

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

describe('grade page', () => {
  // the join card remembers the last student in localStorage; each case
  // must start from a cold sign-in
  beforeEach(() => {
    try {
      localStorage.clear()
    } catch {
      /* storage unavailable is fine */
    }
  })

  it('is a SEPARATE page after sign-in, with a grade required to continue', async () => {
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

    // SIGN-IN IS A LOGIN: no grade question on this page
    const nameField = await screen.findByLabelText(/your name/i)
    expect(screen.queryByRole('button', { name: /^Grade 6$/ })).toBeNull()
    expect(screen.queryByText(/what grade are you in/i)).toBeNull()

    // Start is inert until a name is typed (was a silent no-op)
    const start = screen.getByRole('button', { name: 'Start' })
    expect((start as HTMLButtonElement).disabled).toBe(true)

    await user.type(nameField, 'ada')
    await user.click(start)

    // …now the grade page, on its own
    await screen.findByText(/what grade are you in/i)
    // the whole intended range is visible, unbuilt grades disabled
    const g3 = screen.getByRole('button', { name: /Grade 3, coming soon/ })
    expect((g3 as HTMLButtonElement).disabled).toBe(true)
    const g6 = screen.getByRole('button', { name: 'Grade 6' })
    expect((g6 as HTMLButtonElement).disabled).toBe(false)

    // picking places, and moves straight on — no "skip"
    expect(screen.queryByRole('button', { name: /skip|later|not now/i })).toBeNull()
    await user.click(g6)
    await waitFor(() => expect(placed).toEqual([6]))
    await waitFor(() => expect(screen.queryByText(/what grade are you in/i)).toBeNull())
  })

  it('a RETURNING student is never asked again', async () => {
    if (!existsSync(root)) return
    const user = userEvent.setup()
    const bundle = realBundle()
    // one shared core, so the second sign-in sees the first one's history
    const apis = new Map<string, DemoApi>()
    const factory = (_b: string, student: string): DemoApi => {
      let api = apis.get(student)
      if (!api) {
        api = new DemoApi(student, bundle, null)
        apis.set(student, api)
      }
      return api
    }
    const { unmount } = render(<App demoBanner apiFactory={factory} />)
    await user.type(await screen.findByLabelText(/your name/i), 'bo')
    await user.click(screen.getByRole('button', { name: 'Start' }))
    await screen.findByText(/what grade are you in/i)
    await user.click(screen.getByRole('button', { name: 'Grade 6' }))
    await waitFor(() => expect(screen.queryByText(/what grade are you in/i)).toBeNull())
    unmount()

    // sign in again as the same student: straight through
    try {
      localStorage.clear()
    } catch {
      /* fine */
    }
    render(<App demoBanner apiFactory={factory} />)
    await user.type(await screen.findByLabelText(/your name/i), 'bo')
    await user.click(screen.getByRole('button', { name: 'Start' }))
    await waitFor(() => expect(screen.queryByLabelText(/your name/i)).toBeNull())
    // the grade question does not come back
    expect(screen.queryByText(/what grade are you in/i)).toBeNull()
  })
})

// @vitest-environment jsdom
/** The zoo is a widget workbench, not student work — it renders the
 * curriculum's own demos and reads nothing student-scoped. Requiring a
 * sign-in to reach it made ?view=zoo links useless to the only people it
 * is for: anyone reviewing widgets.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { loadBundleDir } from '@openmastery/schema/load'
import { App } from '../../src/client/app/App'
import { DemoApi } from '../../src/client/demo/DemoApi'

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

describe('?view=zoo', () => {
  beforeEach(() => {
    try {
      localStorage.clear()
    } catch {
      /* fine */
    }
    window.history.replaceState({}, '', '/?view=zoo')
  })
  afterEach(() => {
    window.history.replaceState({}, '', '/')
  })

  it('opens without a sign-in', async () => {
    if (!existsSync(root)) return
    const bundle = realBundle()
    render(<App apiFactory={(_b, student) => new DemoApi(student, bundle, null)} />)

    // no name field, no grade page — straight to the workbench
    await waitFor(() => expect(screen.queryByLabelText(/your name/i)).toBeNull())
    expect(screen.queryByText(/what grade are you in/i)).toBeNull()
    // and it actually renders curriculum demos
    await waitFor(() => expect(screen.getByText(/widget zoo/i)).toBeTruthy(), { timeout: 8000 })
  })
})

/** Guide dashboard (build step 6, v1): seeded synthetic class → roster with
 * mastery, flags, and guide-facing copy — over both transports. */
import { describe, it, expect } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SiteCore } from '../../src/site/core'
import { seedDemoClass, DEMO_CLASS } from '../../src/site/simulate'
import { DemoApi } from '../../src/client/demo/DemoApi'
import { Guide } from '../../src/client/app/Guide'
import { fixtureBundle } from '../core/fixtures'

describe('synthetic class over the site surface', () => {
  it('archetypes produce the spread a guide needs: masteries AND flags', () => {
    const core = new SiteCore(fixtureBundle(), { now: () => 1_000_000 })
    seedDemoClass(core)
    const view = core.guideView().body as {
      students: Array<{ id: string; mastered: number; flags: unknown[] }>
    }
    expect(view.students).toHaveLength(DEMO_CLASS.length)
    expect(view.students.some((s) => s.mastered > 0)).toBe(true)
    expect(view.students.some((s) => s.flags.length > 0)).toBe(true)
    // deterministic: same names → same class
    const core2 = new SiteCore(fixtureBundle(), { now: () => 1_000_000 })
    seedDemoClass(core2)
    expect(JSON.stringify(core2.guideView().body)).toBe(JSON.stringify(view))
  })
})

describe('guide dashboard UI', () => {
  it('empty state seeds a class; roster and needs-attention render', async () => {
    const user = userEvent.setup()
    const api = new DemoApi('guide-view', fixtureBundle(), null)
    render(<Guide api={api} />)
    await waitFor(() => screen.getByText(/No students yet/))
    await user.click(screen.getByRole('button', { name: 'Seed a demo class' }))
    await waitFor(() => screen.getByText('Roster'))
    expect(screen.getByText('Needs attention')).toBeInTheDocument()
    // guide-facing copy, not raw reason codes
    expect(screen.queryByText(/corrective_exhausted/)).toBeNull()
    expect(screen.getAllByText(/hint ladder|earlier skill|attempt cap/).length).toBeGreaterThan(0)
    // flagged students float to the top of the roster
    const rows = screen.getAllByRole('row').slice(1)
    expect(rows[0]!.textContent).toContain('⚑')
  })
})

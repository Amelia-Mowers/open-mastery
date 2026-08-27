/** The widget zoo single-sources its demos from the curriculum served by the
 * site server — one canonical explanation per widget type — plus labeled
 * fallbacks for registry widgets nothing uses yet. */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { createDevSite, type DevSite } from '../../src/server/dev'
import { fixtureBundle } from '../core/fixtures'
import { SiteApi } from '../../src/client/app/api'
import { Zoo } from '../../src/client/app/Zoo'
import { FALLBACK_DEMOS } from '../../src/client/app/zoo-demos'

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

describe('widget zoo', () => {
  it('renders one curriculum-sourced demo per widget type, plus fallbacks and inputs', async () => {
    const bundle = fixtureBundle()
    const distinctWidgets = new Set(bundle.explanations.map((e) => e.widget))
    const fallbacks = FALLBACK_DEMOS.filter((f) => !distinctWidgets.has(f.widget))
    const { container } = render(<Zoo api={new SiteApi(base, 'zoo-test')} />)

    await waitFor(() => {
      const tracks = screen.getAllByRole('group', { name: 'Lesson timeline' })
      expect(tracks).toHaveLength(distinctWidgets.size + fallbacks.length)
    })
    // demo + input cards all present
    expect(container.querySelectorAll('.zoo-card')).toHaveLength(
      distinctWidgets.size + fallbacks.length + 8,
    )
    // fallback entries are labeled as not yet adopted
    for (const f of fallbacks) expect(screen.getByText(new RegExp(f.widget.toUpperCase()))).toBeInTheDocument()
    // inputs are live
    expect(screen.getAllByRole('textbox').length).toBeGreaterThanOrEqual(3)
    expect(screen.getAllByRole('slider').length).toBeGreaterThanOrEqual(2)
  })
})

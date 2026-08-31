/** The widget zoo single-sources its demos from the curriculum served by the
 * site server — one canonical explanation per widget type — plus labeled
 * fallbacks for registry widgets nothing uses yet. */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { createDevSite, type DevSite } from '../../src/server/dev'
import { fixtureBundle } from '../core/fixtures'
import { SiteApi } from '../../src/client/app/api'
import { INPUT_SAMPLES, Zoo } from '../../src/client/app/Zoo'
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
      // derived, not a magic number: adding an input sample should not
      // fail this test, only a MISSING card should
      distinctWidgets.size + fallbacks.length + INPUT_SAMPLES.length,
    )
    // fallback entries are labeled as not yet adopted
    for (const f of fallbacks) expect(screen.getByText(new RegExp(f.widget.toUpperCase()))).toBeInTheDocument()
    // inputs are live
    expect(screen.getAllByRole('textbox').length).toBeGreaterThanOrEqual(3)
    expect(screen.getAllByRole('slider').length).toBeGreaterThanOrEqual(2)
  })

  it('single-timeline view shows the trinity: lesson, faded phase, answer input', async () => {
    window.history.pushState({}, '', '?view=zoo&exp=alg1.linear.solve-one-step.exp-balance')
    try {
      const { container } = render(<Zoo api={new SiteApi(base, 'zoo-single')} />)
      // lesson demo + faded lead both play (two timelines on the page)
      await waitFor(() => {
        expect(screen.getAllByRole('group', { name: 'Lesson timeline' })).toHaveLength(2)
      })
      // faded card: truncated lead (resolution dropped — only the first
      // caption survives) plus the item's answer space in faded mode
      expect(screen.getByText(/FINISH THIS ONE — FADED PHASE/)).toBeInTheDocument()
      expect(screen.getByText(/PRACTICE PROBLEM — EQUATION-INPUT/)).toBeInTheDocument()
      // the input card is a real practice problem: the item's stem shows —
      // and the MASTERY CHECK EXAMPLE card repeats it when the same item
      // is also the check's hardest pick (this fixture's only item)
      expect(screen.getAllByText(/Solve: 7x = 21\./).length).toBeGreaterThanOrEqual(1)
      expect(screen.getByText(/MASTERY CHECK EXAMPLE/)).toBeInTheDocument()
      // the rep-matched item is equation-input: its faded + problem
      // renders are textboxes, and no answer key ships in the payload
      expect(screen.getAllByRole('textbox').length).toBeGreaterThanOrEqual(2)
      expect(container.innerHTML).not.toContain('b/a')
    } finally {
      window.history.pushState({}, '', '?view=zoo')
    }
  })
})

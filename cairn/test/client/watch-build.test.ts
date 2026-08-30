// @vitest-environment jsdom
/** A tab left open keeps serving the build it loaded with, so a review can
 * easily be of code already replaced — that happened twice in one session.
 * The demo compares its own bundle hash against the deployed index.html and
 * offers a reload.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { watchForNewBuild } from '../../src/client/demo/watch-build'

const LOADED = './assets/demo-AAAA1111.js'

function pageLoadedWith(src: string): void {
  document.head.innerHTML = `<script type="module" crossorigin src="${src}"></script>`
  document.body.innerHTML = ''
}

/** the deployed index.html, as the poller would fetch it */
function deployServes(src: string): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      text: async () => `<script type="module" crossorigin src="${src}"></script>`,
    }),
  )
}

describe('new-build watcher', () => {
  beforeEach(() => {
    pageLoadedWith(LOADED)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('stays quiet while the deployed build matches', async () => {
    deployServes(LOADED)
    watchForNewBuild()
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.waitFor(() => expect(fetch).toHaveBeenCalled())
    expect(document.querySelector('[data-new-build]')).toBeNull()
  })

  it('offers a reload once a different build is deployed', async () => {
    deployServes('./assets/demo-BBBB2222.js')
    watchForNewBuild()
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.waitFor(() => expect(document.querySelector('[data-new-build]')).not.toBeNull())
    // OFFERED, not forced — a silent refresh would discard a part-typed answer
    const bar = document.querySelector('[data-new-build]')!
    expect(bar.textContent).toMatch(/newer version/i)
    expect(bar.querySelector('button')).not.toBeNull()
  })

  it('AUTO-reloads on the widget zoo — a review surface with nothing to lose', async () => {
    const reload = vi.fn()
    vi.stubGlobal('location', { ...window.location, search: '?view=zoo', reload })
    deployServes('./assets/demo-BBBB2222.js')
    watchForNewBuild()
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.waitFor(() => expect(reload).toHaveBeenCalled())
    // no bar: it reloaded instead of asking
    expect(document.querySelector('[data-new-build]')).toBeNull()
  })

  it('still only OFFERS on a student screen, where an answer may be part-typed', async () => {
    const reload = vi.fn()
    vi.stubGlobal('location', { ...window.location, search: '?student=kid', reload })
    deployServes('./assets/demo-BBBB2222.js')
    watchForNewBuild()
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.waitFor(() => expect(document.querySelector('[data-new-build]')).not.toBeNull())
    expect(reload).not.toHaveBeenCalled()
  })

  it('does nothing when the page has no hashed bundle (dev server)', async () => {
    document.head.innerHTML = ''
    deployServes('./assets/demo-BBBB2222.js')
    watchForNewBuild()
    document.dispatchEvent(new Event('visibilitychange'))
    expect(document.querySelector('[data-new-build]')).toBeNull()
  })
})

/** Notice when a new build has been deployed while this tab was open.
 *
 * index.html names its bundle with a content hash, so re-fetching it and
 * comparing that hash is a reliable "is this still the version I loaded"
 * check with no build-time version stamping to keep in sync.
 *
 * The reload is OFFERED, never forced: a silent refresh mid-problem would
 * discard what the student was typing, and a review session is exactly
 * when someone is midway through something.
 */
const POLL_MS = 60_000

/** the bundle URL this page was loaded with */
function currentBundle(): string | null {
  const el = document.querySelector<HTMLScriptElement>('script[type="module"][src*="assets/"]')
  return el?.getAttribute('src') ?? null
}

async function deployedBundle(): Promise<string | null> {
  // cache: 'no-store' so we ask the network, not the memory cache that is
  // the very thing making the tab stale
  const r = await fetch(`./index.html?v=${Date.now()}`, { cache: 'no-store' })
  if (!r.ok) return null
  const html = await r.text()
  return /<script[^>]+src="([^"]*assets\/[^"]+\.js)"/.exec(html)?.[1] ?? null
}

function offerReload(): void {
  if (document.querySelector('[data-new-build]')) return
  const bar = document.createElement('div')
  bar.setAttribute('data-new-build', '')
  bar.className = 'new-build-bar'
  bar.setAttribute('role', 'status')
  const text = document.createElement('span')
  text.textContent = 'A newer version of the demo is available.'
  const btn = document.createElement('button')
  btn.className = 'btn btn-primary'
  btn.textContent = 'Reload'
  btn.onclick = () => location.reload()
  bar.append(text, btn)
  document.body.appendChild(bar)
}

export function watchForNewBuild(): void {
  const loaded = currentBundle()
  if (loaded === null) return
  let stopped = false
  const check = async (): Promise<void> => {
    if (stopped || document.hidden) return
    try {
      const live = await deployedBundle()
      if (live !== null && live !== loaded) {
        stopped = true
        offerReload()
      }
    } catch {
      /* offline or mid-deploy — try again next tick */
    }
  }
  setInterval(() => void check(), POLL_MS)
  // check as soon as the tab is looked at again, which is when a stale
  // review is most likely to start
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) void check()
  })
}

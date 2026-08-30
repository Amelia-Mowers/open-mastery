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
/** the zoo is checked more often: it is a review surface, and the whole
 * point is seeing a rebuild land without thinking about it */
const ZOO_POLL_MS = 5_000

/** The widget zoo (?view=zoo, with or without &exp=) is a REVIEW surface:
 * nothing is being typed, nothing is lost, and looking at a stale widget
 * is the exact failure this watcher exists to prevent. So it reloads
 * itself rather than asking. Everywhere else a student may be mid-answer,
 * so the reload is offered. */
function isReviewSurface(): boolean {
  try {
    return new URLSearchParams(window.location.search).get('view') === 'zoo'
  } catch {
    return false
  }
}

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

/** put the reviewer back where they were after an auto-reload */
function restoreZooScroll(): void {
  if (!isReviewSurface()) return
  let y: string | null = null
  try {
    y = sessionStorage.getItem('cairn.zoo.scroll')
    if (y !== null) sessionStorage.removeItem('cairn.zoo.scroll')
  } catch {
    return
  }
  if (y === null) return
  const to = Number(y)
  if (!Number.isFinite(to) || to <= 0) return
  // the zoo renders its demos asynchronously, so wait for the page to be
  // tall enough before scrolling — otherwise this lands at the bottom of
  // a half-built page
  let tries = 0
  const settle = (): void => {
    if (document.body.scrollHeight > to + window.innerHeight || tries++ > 40) {
      window.scrollTo(0, to)
      return
    }
    setTimeout(settle, 100)
  }
  setTimeout(settle, 100)
}

export function watchForNewBuild(): void {
  restoreZooScroll()
  const loaded = currentBundle()
  if (loaded === null) return
  let stopped = false
  const check = async (): Promise<void> => {
    if (stopped || document.hidden) return
    try {
      const live = await deployedBundle()
      if (live !== null && live !== loaded) {
        stopped = true
        if (isReviewSurface()) {
          // ?exp= keeps the single-widget view across the reload; on the
          // full zoo, remember where the page was scrolled to so the
          // reload does not dump the reviewer back at the top
          try {
            sessionStorage.setItem('cairn.zoo.scroll', String(window.scrollY))
          } catch {
            /* storage unavailable is fine */
          }
          location.reload()
          return
        }
        offerReload()
      }
    } catch {
      /* offline or mid-deploy — try again next tick */
    }
  }
  setInterval(() => void check(), isReviewSurface() ? ZOO_POLL_MS : POLL_MS)
  // check as soon as the tab is looked at again, which is when a stale
  // review is most likely to start
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) void check()
  })
}

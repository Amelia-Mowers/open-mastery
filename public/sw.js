/* Cairn shell service worker: network-first with cache fallback so the
 * installed shell keeps loading through wifi blips (§6). API requests are
 * never cached — student state lives on the site server. */
const CACHE = 'cairn-shell-v1'

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url)
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/')) return
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      try {
        const res = await fetch(e.request)
        if (res.ok) cache.put(e.request, res.clone())
        return res
      } catch {
        const hit = await cache.match(e.request)
        if (hit) return hit
        const shell = await cache.match('/index.html')
        return shell ?? Response.error()
      }
    }),
  )
})

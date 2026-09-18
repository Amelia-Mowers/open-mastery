/** Anonymous view counting for the DEPLOYED demo (GoatCounter's pixel
 * API — no cookies, no third-party script, no stored identifiers).
 *
 * This file is the COMPLETE list of what is ever sent: the view name
 * (join / grade / student / guide / zoo), the id of a lesson that starts
 * playing in the student session, and the browser referrer on the first
 * hit of a visit (so we can see whether visitors came from the pilot
 * post). Answers, attempts, mastery and progress NEVER leave the device
 * — the demo banner's promise is load-bearing; keep it true.
 *
 * Dashboard: https://open-mastery.goatcounter.com. Beacons are sent only
 * on the deployed GitHub Pages host, so dev servers and tests stay
 * silent; until the GoatCounter account exists the requests 404
 * harmlessly.
 */

const ENDPOINT = 'https://open-mastery.goatcounter.com/count'

const enabled = (): boolean =>
  typeof window !== 'undefined' && window.location.hostname.endsWith('github.io')

/** every signal, whether or not it was sent — for tests and probes */
export const recorded: string[] = []
if (typeof window !== 'undefined')
  (window as unknown as Record<string, unknown>)['__cairnAnalytics'] = recorded

let sentFirst = false
function send(path: string, event: boolean): void {
  recorded.push(path)
  if (!enabled()) return
  const q = new URLSearchParams({ p: path })
  if (event) q.set('e', 'true')
  if (!sentFirst) {
    q.set('r', document.referrer)
    sentFirst = true
  }
  // cache-buster; GoatCounter also uses it to dedupe rapid repeats
  q.set('rnd', String(Date.now()))
  new Image().src = `${ENDPOINT}?${q.toString()}`
}

/** which top-level view is on screen (fires once per view change) */
export function trackView(view: string): void {
  send(`/${view}`, false)
}

/** a lesson began playing in the student session — callers exclude
 * walkthroughs (zoo previews and post-miss worked examples) */
export function trackLesson(explanationId: string): void {
  send(`lesson/${explanationId}`, true)
}

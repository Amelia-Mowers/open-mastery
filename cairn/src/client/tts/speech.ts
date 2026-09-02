/** Voice for young readers: every snippet the app can speak (each whole
 * caption, gate prompt, and handoff) is PRE-RENDERED at build time
 * (Kokoro-82M, scripts/render-voice-corpus.ts) and published to a public
 * dataset repo. The client fetches the snippet's content-addressed .ogg
 * and plays it whole — one file, one buffer, one ended event; no model
 * download, no on-device synthesis, no piecewise playback. Requests
 * carry only the SHA-256 of the snippet text (every student on the same
 * lesson fetches the same public file); answers and progress still never
 * leave the machine.
 *
 * THE VOICE IS ALWAYS ON. Narration always plays and always paces the
 * lesson clock; MUTE just silences it (gain 0) — so muting and unmuting
 * never restarts a line and never changes the lesson's rhythm. The
 * player transport drives it: pause() suspends the audio clock (resume
 * continues mid-word), and progress() reports the current line's played
 * fraction so the step timeline can track the audio. The only true
 * off-switch is the VITEST guard (players themselves gate speaking on
 * having been started — the zoo's cards start on click).
 *
 * Coverage is a build-time guarantee (scripts/check-voice-coverage.ts):
 * a snippet missing from the corpus fails the build. If one is somehow
 * missing at runtime anyway, the fetch 404s and the error surfaces on
 * the speaker button — NO SILENT FALLBACKS, a mute voice must say why. */

export interface SpeechState {
  /** 'ready' from birth (nothing to load), 'error' when a fetch or
   * playback failed */
  model: 'ready' | 'error'
  /** narration still runs while muted — only the gain is zeroed */
  muted: boolean
  speaking: boolean
  /** transport pause: the audio clock is frozen mid-line (speaking may
   * still be true — the line resumes where it stopped) */
  paused: boolean
  /** audio for the line on screen still fetching — sound not started */
  generating: boolean
  /** playback volume 0..1 (the in-player slider) */
  volume: number
  /** why the voice is unavailable, when model === 'error' */
  message?: string
}

/** Symbols the board writes but a voice must say. Keep it minimal and
 * tested — every rule here exists because Kokoro reads the glyph badly. */
export function mathToSpeech(text: string): string {
  return (
    text
      // unknowns are SPOKEN; question marks are intonation. "$?" and a
      // free-standing "?" (after space/=/→/:) mean "the unknown"; a "?"
      // attached to a word, paren, or quote ends a question and must
      // stay for Kokoro's rising inflection.
      .replace(/\$\?/g, 'unknown price')
      .replace(/(^|[\s=:→⟶])\?/g, '$1what')
      // money: "$28" → "28 dollars" (glyph-first order reads as "dollar 28")
      .replace(/\$(\d+(?:\.\d+)?)/g, '$1 dollars')
      // simple fractions: "3/4" → "3 over 4" (digits only — don't touch dates or units)
      .replace(/(\d+)\s*\/\s*(\d+)/g, '$1 over $2')
      .replace(/−/g, ' minus ')
      .replace(/(\d|\b)\s*-\s*(?=\d)/g, '$1 minus ')
      .replace(/[×·]/g, ' times ')
      .replace(/÷/g, ' divided by ')
      .replace(/=/g, ' equals ')
      .replace(/²/g, ' squared')
      .replace(/³/g, ' cubed')
      .replace(/[→⟶]/g, ' gives ')
      .replace(/%/g, ' percent')
      .replace(/\s+/g, ' ')
      .trim()
  )
}

export const VOICE_FEATURE = true

/** where render-voice-corpus.ts publishes to (upload-voice-corpus.mjs) */
const CORPUS_URL = 'https://huggingface.co/datasets/AmeliaMowers/cairn-voice/resolve/main/'

const PREF_KEY = 'cairn.voice'
const VOL_KEY = 'cairn.voice.vol'
/** decoded snippets kept in memory; the browser HTTP cache holds the
 * compressed bytes beyond that */
const CACHE_MAX = 64
/** prefetches in flight at once */
const PREFETCH_CONCURRENCY = 3

/** snippet → corpus filename: sha256 hex, first 20 chars (must match
 * fileOf() in scripts/voice-sentences.ts) */
async function fileOf(snippet: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(snippet))
  return (
    [...new Uint8Array(digest)]
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
      .slice(0, 20) + '.ogg'
  )
}

function storedVolume(): number {
  try {
    const raw = localStorage.getItem(VOL_KEY)
    if (raw !== null) {
      const v = Number(raw)
      if (Number.isFinite(v) && v >= 0 && v <= 1) return v
    }
  } catch {
    /* preference is a convenience only */
  }
  return 1
}

function storedMuted(): boolean {
  try {
    return localStorage.getItem(PREF_KEY) === 'off'
  } catch {
    return false
  }
}

class SpeechService {
  private state: SpeechState = {
    model: 'ready',
    muted: storedMuted(),
    speaking: false,
    paused: false,
    generating: false,
    volume: storedVolume(),
  }
  private listeners = new Set<() => void>()
  /** hard off for tests: nothing fetches, speaks, or paces */
  private active = typeof process === 'undefined' || process.env?.['VITEST'] === undefined
  private ctx: AudioContext | null = null
  private gain: GainNode | null = null
  private sources: AudioBufferSourceNode[] = []
  /** monotonic id so a stale fetch never plays over a newer one */
  private turn = 0
  /** the last line (joined snippet key) that PLAYED TO THE END — players
   * pace lesson stages on this via finished() */
  private doneKey: string | null = null
  /** the line currently on (or headed for) the audio clock — lets a
   * player ask whether the sounding audio is ITS line (the service is a
   * singleton; another player's narration must not light this one's
   * transport) */
  private lineKey: string | null = null
  /** snippet → decoded audio, insertion-ordered for LRU */
  private cache = new Map<string, AudioBuffer>()
  /** snippets being fetched right now (dedupes speak vs prefetch) */
  private inFlight = new Map<string, Promise<AudioBuffer>>()
  /** snippets queued for optimistic prefetch, in arrival order */
  private prefetchQueue: string[] = []
  private prefetching = 0

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }
  getState = (): SpeechState => this.state
  private set(patch: Partial<SpeechState>): void {
    this.state = { ...this.state, ...patch }
    for (const fn of this.listeners) fn()
  }

  private gestureClaimed = false
  /** Session start: claim the first user gesture for the AudioContext —
   * always-on narration has no toggle click to piggyback the browser's
   * audio-gesture requirement on. Idempotent. */
  warm(): void {
    if (!VOICE_FEATURE || !this.active || this.gestureClaimed) return
    this.gestureClaimed = true
    const claim = () => {
      document.removeEventListener('pointerdown', claim)
      const ctx = this.ensureCtx()
      if (ctx.state === 'suspended') void ctx.resume()
    }
    document.addEventListener('pointerdown', claim)
  }

  private ensureCtx(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext()
      this.gain = this.ctx.createGain()
      this.gain.gain.value = this.state.muted ? 0 : this.state.volume
      this.gain.connect(this.ctx.destination)
    }
    return this.ctx
  }

  private applyGain(): void {
    if (this.gain) this.gain.gain.value = this.state.muted ? 0 : this.state.volume
  }

  setVolume(v: number): void {
    const vol = Math.max(0, Math.min(1, v))
    try {
      localStorage.setItem(VOL_KEY, String(vol))
    } catch {
      /* preference is a convenience only */
    }
    this.set({ volume: vol })
    this.applyGain()
  }

  setMuted(muted: boolean): void {
    try {
      localStorage.setItem(PREF_KEY, muted ? 'off' : 'on')
    } catch {
      /* preference is a convenience only */
    }
    // a fetch error is stale the moment the student touches the button
    this.set({ muted, model: 'ready', message: undefined })
    this.applyGain()
    if (!muted) {
      // the unmute click is a user gesture — claim it
      const ctx = this.ensureCtx()
      if (ctx.state === 'suspended') void ctx.resume()
    }
  }

  /** deliberate transport pause (play/pause button) — distinct from a
   * context the browser never let start */
  private pausedByUser = false
  /** current line's span on the audio clock, for progress() */
  private lineStartAt = 0
  private lineEndAt = 0

  /** a fade in flight: its sources still sound while the gain ramps down */
  private fading: { timer: ReturnType<typeof setTimeout>; sources: AudioBufferSourceNode[] } | null =
    null

  private settleFade(): void {
    if (!this.fading) return
    clearTimeout(this.fading.timer)
    for (const s of this.fading.sources) {
      try {
        s.stop()
      } catch {
        /* already ended */
      }
    }
    this.fading = null
    if (this.ctx && this.gain) {
      const g = this.gain.gain
      g.cancelScheduledValues(this.ctx.currentTime)
      g.setValueAtTime(this.state.muted ? 0 : this.state.volume, this.ctx.currentTime)
    }
  }

  /** Fade the current line out quickly and stop — used when the student's
   * action (a correct gate answer) makes the rest of the line moot. A
   * hard stop() mid-word reads as a glitch; a short ramp reads as the
   * lesson moving on. */
  fadeOut(ms = 220): void {
    if (!this.active) return
    if (!this.ctx || !this.gain || !this.state.speaking) {
      this.stop()
      return
    }
    this.settleFade()
    this.turn++ // supersede: nothing pending may mark this line done or restart it
    this.lineKey = null
    this.lineStartAt = 0
    this.lineEndAt = 0
    const g = this.gain.gain
    const now = this.ctx.currentTime
    g.cancelScheduledValues(now)
    g.setValueAtTime(g.value, now)
    g.linearRampToValueAtTime(0.0001, now + ms / 1000)
    const sources = this.sources
    this.sources = []
    this.set({ speaking: false, generating: false })
    this.fading = { timer: setTimeout(() => this.settleFade(), ms + 30), sources }
  }

  /** Pause narration mid-word: suspending the AudioContext freezes the
   * audio clock, so resume() continues exactly where it stopped. */
  pause(): void {
    this.pausedByUser = true
    if (this.ctx && this.ctx.state === 'running') void this.ctx.suspend()
    if (!this.state.paused) this.set({ paused: true })
  }

  resume(): void {
    this.pausedByUser = false
    if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume()
    if (this.state.paused) this.set({ paused: false })
  }

  /** Played fraction (0..1) of the line currently on the audio clock, or
   * null when nothing is scheduled — the step timeline tracks this. */
  progress(): number | null {
    if (!this.ctx || this.lineEndAt <= this.lineStartAt) return null
    return Math.max(0, Math.min(1, (this.ctx.currentTime - this.lineStartAt) / (this.lineEndAt - this.lineStartAt)))
  }

  private async fetchUtterance(snippet: string): Promise<AudioBuffer> {
    const cached = this.cache.get(snippet)
    if (cached) return cached
    const pending = this.inFlight.get(snippet)
    if (pending) return pending
    const job = (async () => {
      const file = await fileOf(snippet)
      const res = await fetch(CORPUS_URL + file)
      if (!res.ok)
        throw new Error(
          `no audio in the voice corpus for “${snippet}” (${res.status} on ${file})`,
        )
      const bytes = await res.arrayBuffer()
      const buf = await this.ensureCtx().decodeAudioData(bytes)
      this.put(snippet, buf)
      return buf
    })()
    this.inFlight.set(snippet, job)
    try {
      return await job
    } finally {
      this.inFlight.delete(snippet)
    }
  }

  private put(snippet: string, buf: AudioBuffer): void {
    this.cache.delete(snippet)
    this.cache.set(snippet, buf)
    while (this.cache.size > CACHE_MAX) {
      const oldest = this.cache.keys().next().value
      if (oldest === undefined) break
      this.cache.delete(oldest)
    }
  }

  /** Optimistically fetch upcoming lines into the cache. Cheap to call
   * with the same list repeatedly. Best-effort: the live speak() path
   * surfaces any real error. */
  pregenerate(texts: string[]): void {
    if (!this.active) return
    for (const t of texts) {
      const snippet = mathToSpeech(t)
      if (snippet === '') continue
      if (this.prefetchQueue.length >= 32) break // bounded: upcoming steps only
      if (this.cache.has(snippet) || this.inFlight.has(snippet)) continue
      if (this.prefetchQueue.includes(snippet)) continue
      this.prefetchQueue.push(snippet)
    }
    this.drainPrefetch()
  }

  private drainPrefetch(): void {
    while (this.prefetching < PREFETCH_CONCURRENCY && this.prefetchQueue.length > 0) {
      const snippet = this.prefetchQueue.shift()!
      this.prefetching++
      void this.fetchUtterance(snippet)
        .catch(() => {
          /* prefetch is best-effort; speak() will retry and surface it */
        })
        .finally(() => {
          this.prefetching--
          this.drainPrefetch()
        })
    }
  }

  private keyOf(parts: string[]): string {
    return parts
      .map((p) => mathToSpeech(p))
      .filter((s) => s !== '')
      .join('\n')
  }

  /** Has this line's narration played to the end? Players hold a lesson
   * stage open until its line has been HEARD (muted playback still
   * counts — the rhythm never depends on the volume). Inactive and
   * voices count as finished, and a line whose fetch FAILED is
   * marked finished individually — one bad snippet must not silence the
   * pacing of every later line (it used to: the error state latched and
   * finished() said yes forever, so autoplay clipped every narration). */
  finished(parts: string[]): boolean {
    if (!this.active) return true
    const key = this.keyOf(parts)
    return key === '' || this.doneKey === key
  }

  /** Is this line the one the voice is currently speaking (or loading)? */
  speaksLine(parts: string[]): boolean {
    return this.lineKey !== null && this.lineKey === this.keyOf(parts)
  }

  /** Speak a line — one or more whole snippets played back to back —
   * cancelling whatever is mid-air. Each snippet is one corpus file;
   * they fetch in parallel and schedule gaplessly on the audio clock. */
  async speak(parts: string[]): Promise<void> {
    if (!this.active) return
    const snippets = parts.map((p) => mathToSpeech(p)).filter((s) => s !== '')
    const key = snippets.join('\n')
    const myTurn = ++this.turn
    this.settleFade() // a new line reclaims full gain from any fade in flight
    this.doneKey = null
    this.lineKey = key
    this.stopSources()
    this.lineStartAt = 0
    this.lineEndAt = 0
    if (snippets.length === 0) return
    // a new line means the user (or the clock they started) wants sound —
    // a lingering transport pause must not swallow it
    if (this.pausedByUser) this.resume()
    this.set({ speaking: true, generating: !this.cache.has(snippets[0]!) })
    try {
      const ctx = this.ensureCtx()
      if (ctx.state === 'suspended') {
        // the browser gates audio on a user gesture; give resume a beat,
        // then let the lesson move on unvoiced rather than hang on a
        // context that cannot start until the next click
        await Promise.race([ctx.resume(), new Promise((r) => setTimeout(r, 250))])
        if ((ctx.state as string) !== 'running') {
          if (myTurn === this.turn) {
            this.doneKey = key
            this.set({ speaking: false, generating: false })
          }
          return
        }
      }
      const fetches = snippets.map((s) => this.fetchUtterance(s))
      // the loop below awaits these IN ORDER — a sibling that rejects
      // before its turn (offline, blocked host) must not surface as an
      // uncaught page error; the awaited one still throws into the catch
      for (const f of fetches) f.catch(() => {})
      let nextStart = 0
      let remaining = snippets.length
      for (const fetchJob of fetches) {
        const buf = await fetchJob
        if (myTurn !== this.turn) return // superseded mid-line
        // a working line clears a previous line's error — errors are
        // per-line, never a latch on the whole voice
        if (this.state.generating || this.state.model === 'error')
          this.set({ generating: false, model: 'ready', message: undefined })
        const src = ctx.createBufferSource()
        src.buffer = buf
        src.connect(this.gain!)
        src.onended = () => {
          remaining--
          if (myTurn === this.turn && remaining === 0) {
            this.doneKey = key
            this.set({ speaking: false })
          }
        }
        const at = Math.max(ctx.currentTime, nextStart)
        src.start(at)
        nextStart = at + buf.duration
        if (this.lineEndAt <= this.lineStartAt) this.lineStartAt = at
        this.lineEndAt = nextStart
        this.sources.push(src)
      }
    } catch (e) {
      if (myTurn !== this.turn) return
      // THIS line cannot play: surface why on the control, mark the line
      // finished so the lesson moves past it instead of holding forever
      this.doneKey = key
      this.set({
        model: 'error',
        message: e instanceof Error ? e.message : String(e),
        speaking: false,
        generating: false,
      })
    }
  }

  stop(): void {
    this.turn++
    this.settleFade()
    this.stopSources()
    this.lineKey = null
    this.lineStartAt = 0
    this.lineEndAt = 0
    if (this.state.speaking || this.state.generating) this.set({ speaking: false, generating: false })
  }

  private stopSources(): void {
    for (const src of this.sources) {
      try {
        src.stop()
      } catch {
        /* already ended */
      }
    }
    this.sources = []
  }
}

export const speech = new SpeechService()

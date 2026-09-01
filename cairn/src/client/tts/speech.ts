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
 * never restarts a line and never changes the lesson's rhythm. The only
 * true off-switch is deactivate(), for tests and the zoo (dozens of
 * autoplaying players), where nothing fetches or speaks at all.
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
    generating: false,
    volume: storedVolume(),
  }
  private listeners = new Set<() => void>()
  /** hard off for tests and the zoo: nothing fetches, speaks, or paces */
  private active = typeof process === 'undefined' || process.env?.['VITEST'] === undefined
  private ctx: AudioContext | null = null
  private gain: GainNode | null = null
  private sources: AudioBufferSourceNode[] = []
  /** monotonic id so a stale fetch never plays over a newer one */
  private turn = 0
  /** the last line (joined snippet key) that PLAYED TO THE END — players
   * pace lesson stages on this via finished() */
  private doneKey: string | null = null
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

  /** The full zoo grid mounts dozens of autoplaying players that would
   * all speak at once — while suspended, nothing fetches, speaks, or
   * paces. Scoped and reversible (the single-explanation zoo view and
   * the student app both narrate). */
  private suspended = false
  setSuspended(on: boolean): void {
    this.suspended = on
    if (on) this.stop()
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
    if (!this.active || this.suspended) return
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
   * suspended voices count as finished, and a line whose fetch FAILED is
   * marked finished individually — one bad snippet must not silence the
   * pacing of every later line (it used to: the error state latched and
   * finished() said yes forever, so autoplay clipped every narration). */
  finished(parts: string[]): boolean {
    if (!this.active || this.suspended) return true
    const key = this.keyOf(parts)
    return key === '' || this.doneKey === key
  }

  /** Speak a line — one or more whole snippets played back to back —
   * cancelling whatever is mid-air. Each snippet is one corpus file;
   * they fetch in parallel and schedule gaplessly on the audio clock. */
  async speak(parts: string[]): Promise<void> {
    if (!this.active || this.suspended) return
    const snippets = parts.map((p) => mathToSpeech(p)).filter((s) => s !== '')
    const key = snippets.join('\n')
    const myTurn = ++this.turn
    this.doneKey = null
    this.stopSources()
    if (snippets.length === 0) return
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
    this.stopSources()
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

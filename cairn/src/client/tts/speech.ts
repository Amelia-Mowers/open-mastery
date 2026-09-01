/** Voice for young readers: every sentence the app can speak is
 * PRE-RENDERED at build time (Kokoro-82M, scripts/render-voice-corpus.ts)
 * and published to a public dataset repo. The client just fetches the
 * sentence's content-addressed .ogg and plays it — no model download, no
 * on-device synthesis, instant first sound. Requests carry only the
 * SHA-256 of the sentence text (every student on the same lesson fetches
 * the same public file); answers and progress still never leave the
 * machine.
 *
 * Coverage is a build-time guarantee (scripts/check-voice-coverage.ts):
 * a sentence missing from the corpus fails the build. If one is somehow
 * missing at runtime anyway, the fetch 404s and the error surfaces on
 * the toggle — NO SILENT FALLBACKS, a mute voice must say why. */

export interface SpeechState {
  /** kept for the toggle: 'ready' from birth (nothing to load), 'error'
   * when a fetch or playback failed */
  model: 'ready' | 'error'
  /** the student turned the voice on */
  enabled: boolean
  speaking: boolean
  /** audio for the line on screen still fetching — sound not started */
  generating: boolean
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

/** Sentences are the corpus unit: finer-grained cache hits, and the
 * first sentence plays while the rest are still arriving. */
export function splitSentences(text: string): string[] {
  const parts = text.match(/[^.!?]+[.!?]*\s*/g) ?? [text]
  return parts.map((p) => p.trim()).filter((p) => p !== '')
}

export const VOICE_FEATURE = true

/** where render-voice-corpus.ts publishes to (upload-voice-corpus.mjs) */
const CORPUS_URL = 'https://huggingface.co/datasets/AmeliaMowers/cairn-voice/resolve/main/'

const PREF_KEY = 'cairn.voice'
/** decoded utterances kept in memory; the browser HTTP cache holds the
 * compressed bytes beyond that */
const CACHE_MAX = 64
/** prefetches in flight at once */
const PREFETCH_CONCURRENCY = 3

/** sentence → corpus filename: sha256 hex, first 20 chars (must match
 * fileOf() in scripts/render-voice-corpus.ts) */
async function fileOf(sentence: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(sentence))
  return (
    [...new Uint8Array(digest)]
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
      .slice(0, 20) + '.ogg'
  )
}

class SpeechService {
  private state: SpeechState = { model: 'ready', enabled: false, speaking: false, generating: false }
  private listeners = new Set<() => void>()
  private ctx: AudioContext | null = null
  private sources: AudioBufferSourceNode[] = []
  /** monotonic id so a stale fetch never plays over a newer one */
  private turn = 0
  /** sentence → decoded audio, insertion-ordered for LRU */
  private cache = new Map<string, AudioBuffer>()
  /** sentences being fetched right now (dedupes speak vs prefetch) */
  private inFlight = new Map<string, Promise<AudioBuffer>>()
  /** sentences queued for optimistic prefetch, in arrival order */
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

  prefOn(): boolean {
    try {
      return localStorage.getItem(PREF_KEY) === 'on'
    } catch {
      return false
    }
  }

  /** Restore the saved preference when a session starts. (Nothing to
   * download any more — the name survives from the on-device era.) */
  warm(): void {
    if (!VOICE_FEATURE) return
    if (this.prefOn()) this.set({ enabled: true })
  }

  enable(): void {
    if (!VOICE_FEATURE) return
    try {
      localStorage.setItem(PREF_KEY, 'on')
    } catch {
      /* preference is a convenience only */
    }
    // a fetch error is stale the moment the student retries the toggle
    this.set({ enabled: true, model: 'ready', message: undefined })
    // audio needs a user gesture; the toggle click IS one — claim it
    this.ctx ??= new AudioContext()
    if (this.ctx.state === 'suspended') void this.ctx.resume()
  }

  disable(): void {
    this.prefetchQueue.length = 0
    this.stop()
    try {
      localStorage.setItem(PREF_KEY, 'off')
    } catch {
      /* ignore */
    }
    this.set({ enabled: false })
  }

  private async fetchUtterance(sentence: string): Promise<AudioBuffer> {
    const cached = this.cache.get(sentence)
    if (cached) return cached
    const pending = this.inFlight.get(sentence)
    if (pending) return pending
    const job = (async () => {
      const file = await fileOf(sentence)
      const res = await fetch(CORPUS_URL + file)
      if (!res.ok)
        throw new Error(
          `no audio in the voice corpus for “${sentence}” (${res.status} on ${file})`,
        )
      const bytes = await res.arrayBuffer()
      this.ctx ??= new AudioContext()
      const buf = await this.ctx.decodeAudioData(bytes)
      this.put(sentence, buf)
      return buf
    })()
    this.inFlight.set(sentence, job)
    try {
      return await job
    } finally {
      this.inFlight.delete(sentence)
    }
  }

  private put(sentence: string, buf: AudioBuffer): void {
    this.cache.delete(sentence)
    this.cache.set(sentence, buf)
    while (this.cache.size > CACHE_MAX) {
      const oldest = this.cache.keys().next().value
      if (oldest === undefined) break
      this.cache.delete(oldest)
    }
  }

  /** Optimistically fetch upcoming lines into the cache. Cheap to call
   * with the same list repeatedly; a no-op while the voice is off.
   * Best-effort: the live speak() path surfaces any real error. */
  pregenerate(texts: string[]): void {
    if (!this.state.enabled) return
    for (const t of texts) {
      for (const sentence of splitSentences(mathToSpeech(t))) {
        if (this.prefetchQueue.length >= 32) break // bounded: upcoming steps only
        if (this.cache.has(sentence) || this.inFlight.has(sentence)) continue
        if (this.prefetchQueue.includes(sentence)) continue
        this.prefetchQueue.push(sentence)
      }
    }
    this.drainPrefetch()
  }

  private drainPrefetch(): void {
    while (this.prefetching < PREFETCH_CONCURRENCY && this.prefetchQueue.length > 0) {
      if (!this.state.enabled) return
      const sentence = this.prefetchQueue.shift()!
      this.prefetching++
      void this.fetchUtterance(sentence)
        .catch(() => {
          /* prefetch is best-effort; speak() will retry and surface it */
        })
        .finally(() => {
          this.prefetching--
          this.drainPrefetch()
        })
    }
  }

  /** Speak, cancelling whatever is mid-air. All sentences fetch in
   * parallel; each is scheduled gaplessly on the audio clock as soon as
   * it and its predecessors exist. */
  async speak(text: string): Promise<void> {
    if (!this.state.enabled) return
    const sentences = splitSentences(mathToSpeech(text))
    if (sentences.length === 0) return
    const myTurn = ++this.turn
    this.stopSources()
    this.set({ speaking: true, generating: !this.cache.has(sentences[0]!) })
    try {
      this.ctx ??= new AudioContext()
      if (this.ctx.state === 'suspended') await this.ctx.resume()
      const fetches = sentences.map((s) => this.fetchUtterance(s))
      let nextStart = 0
      let remaining = sentences.length
      for (const fetchJob of fetches) {
        const buf = await fetchJob
        if (myTurn !== this.turn) return // superseded mid-pipeline
        if (this.state.generating) this.set({ generating: false })
        const src = this.ctx.createBufferSource()
        src.buffer = buf
        src.connect(this.ctx.destination)
        src.onended = () => {
          remaining--
          if (myTurn === this.turn && remaining === 0) this.set({ speaking: false })
        }
        const at = Math.max(this.ctx.currentTime, nextStart)
        src.start(at)
        nextStart = at + buf.duration
        this.sources.push(src)
      }
    } catch (e) {
      if (myTurn !== this.turn) return
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

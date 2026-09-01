/** Local text-to-speech for young readers: Kokoro-82M (Apache-2.0)
 * running fully in the browser via kokoro-js — on-device like everything
 * else in the demo; no audio, no text ever leaves the machine.
 *
 * The model AUTOLOADS in the background when a session starts (q8 ~40MB
 * on wasm, fp16 ~80MB on WebGPU; cached by the browser after the first
 * visit), so flipping the voice on is instant. Speaking itself stays
 * opt-in. Synthesis is OPTIMISTIC: players hand the service the captions
 * they are about to show and it pre-generates into an in-memory cache,
 * so the voice starts with the step instead of seconds behind it.
 *
 * NO SILENT FALLBACKS: a load or synthesis failure surfaces on the
 * toggle as an error state, never as quiet muteness. */

export interface SpeechState {
  model: 'cold' | 'loading' | 'ready' | 'error'
  /** download progress while loading */
  pct: number
  /** the student turned the voice on */
  enabled: boolean
  speaking: boolean
  /** synthesis in flight for the line on screen — audio not started yet */
  generating: boolean
  /** estimated progress of that synthesis (0..100; an ESTIMATE from
   * measured ms-per-character, capped at 95 until it really finishes) */
  genPct: number
  /** why the model is unavailable, when model === 'error' */
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

/** Sentences are the synthesis unit: the first one starts playing while
 * the rest generate — first sound arrives in one short inference, not
 * after the whole caption. Also makes cache hits finer-grained. */
export function splitSentences(text: string): string[] {
  const parts = text.match(/[^.!?]+[.!?]*\s*/g) ?? [text]
  return parts.map((p) => p.trim()).filter((p) => p !== '')
}

/** master switch: OFF until the pre-rendered corpus is live — the
 * cutover commit flips this back on. While off: no toggle, no autoload,
 * no synthesis, nothing. */
export const VOICE_FEATURE = false

const PREF_KEY = 'cairn.voice'
/** pre-generated utterances kept in memory (a caption is ~100-500KB) */
const CACHE_MAX = 48
/** synthesized audio persisted across visits — replaying a lesson costs
 * a lookup, not a synthesis */
const DB_NAME = 'cairn-tts'
const DB_STORE = 'utterances'
const DB_MAX = 400

type Utterance = { audio: Float32Array; rate: number }

/** IndexedDB write-through for the utterance cache. Persistence is a
 * CONVENIENCE layer: every path fails soft to synthesis, so a broken or
 * unavailable DB costs latency, never correctness. */
class UtteranceStore {
  private db: Promise<IDBDatabase | null> | null = null

  private open(): Promise<IDBDatabase | null> {
    this.db ??= new Promise((resolve) => {
      try {
        const req = indexedDB.open(DB_NAME, 1)
        req.onupgradeneeded = () => {
          const db = req.result
          if (!db.objectStoreNames.contains(DB_STORE)) {
            const store = db.createObjectStore(DB_STORE, { keyPath: 'key' })
            store.createIndex('added', 'added')
          }
        }
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => resolve(null)
      } catch {
        resolve(null)
      }
    })
    return this.db
  }

  async get(key: string): Promise<Utterance | null> {
    const db = await this.open()
    if (!db) return null
    return new Promise((resolve) => {
      try {
        const req = db.transaction(DB_STORE).objectStore(DB_STORE).get(key)
        req.onsuccess = () => {
          const row = req.result as { pcm: ArrayBuffer; rate: number } | undefined
          resolve(row ? { audio: new Float32Array(row.pcm), rate: row.rate } : null)
        }
        req.onerror = () => resolve(null)
      } catch {
        resolve(null)
      }
    })
  }

  put(key: string, u: Utterance): void {
    void this.open().then((db) => {
      if (!db) return
      try {
        const tx = db.transaction(DB_STORE, 'readwrite')
        const store = tx.objectStore(DB_STORE)
        store.put({ key, rate: u.rate, pcm: u.audio.buffer.slice(0), added: Date.now() })
        // prune oldest beyond the cap, cheaply, in the same transaction
        const count = store.count()
        count.onsuccess = () => {
          if (count.result <= DB_MAX) return
          const cursor = store.index('added').openCursor()
          let toDrop = count.result - DB_MAX
          cursor.onsuccess = () => {
            const c = cursor.result
            if (!c || toDrop <= 0) return
            c.delete()
            toDrop--
            c.continue()
          }
        }
      } catch {
        /* persistence is optional */
      }
    })
  }
}

class SpeechService {
  private state: SpeechState = { model: 'cold', pct: 0, enabled: false, speaking: false, generating: false, genPct: 0 }
  private listeners = new Set<() => void>()
  /** the engine lives in a Web Worker — see tts.worker.ts; main-thread
   * generation janked every interaction while pregen ran */
  private worker: Worker | null = null
  private ready = false
  private rpcId = 0
  private pending = new Map<number, { resolve: (u: Utterance) => void; reject: (e: Error) => void }>()
  private ctx: AudioContext | null = null
  private sources: AudioBufferSourceNode[] = []
  /** monotonic id so a stale synthesis never plays over a newer one */
  private turn = 0
  /** normalized text → synthesized audio, insertion-ordered for LRU */
  private cache = new Map<string, Utterance>()
  private store = new UtteranceStore()
  /** texts queued for optimistic synthesis, in arrival order */
  private pregenQueue: string[] = []
  private pregenRunning = false
  /** THE generation lock: wasm inference pegs cores, and concurrent
   * inferences froze a whole machine — every generate(), live or
   * optimistic, must pass through here, one at a time */
  private genLock: Promise<void> = Promise.resolve()

  /** measured synthesis cost, refined by EMA over real generations —
   * feeds the progress estimate */
  private msPerChar = 45
  private genTimer: ReturnType<typeof setInterval> | null = null

  private generateLocked(key: string): Promise<Utterance> {
    const run = this.genLock.then(async () => {
      const started = performance.now()
      const out = await this.generateInWorker(key)
      const elapsed = performance.now() - started
      if (key.length > 0) this.msPerChar = 0.7 * this.msPerChar + 0.3 * (elapsed / key.length)
      return out
    })
    this.genLock = run.then(
      () => undefined,
      () => undefined,
    )
    return run
  }

  private startGenProgress(chars: number): void {
    this.stopGenProgress()
    const started = performance.now()
    const eta = Math.max(300, chars * this.msPerChar)
    this.genTimer = setInterval(() => {
      const pct = Math.min(95, Math.round(((performance.now() - started) / eta) * 100))
      if (this.state.generating) this.set({ genPct: pct })
    }, 120)
  }

  private stopGenProgress(): void {
    if (this.genTimer !== null) clearInterval(this.genTimer)
    this.genTimer = null
  }

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

  /** Load the model WITHOUT turning the voice on — called when a session
   * starts so the later toggle is instant. Safe to call repeatedly. */
  warm(): void {
    if (!VOICE_FEATURE) return
    // never in tests: jsdom would boot the whole phonemizer and try to
    // download the model on every client E2E render
    if (typeof process !== 'undefined' && process.env?.['VITEST'] !== undefined) return
    if (typeof Worker === 'undefined') {
      this.set({ model: 'error', message: 'this browser cannot run the voice (no workers)' })
      return
    }
    if (this.worker) return
    this.set({ model: 'loading', pct: 0 })
    const w = new Worker(new URL('./tts.worker.ts', import.meta.url), { type: 'module' })
    this.worker = w
    w.onmessage = (ev: MessageEvent) => {
      const msg = ev.data as {
        type: string
        pct?: number
        id?: number
        audio?: Float32Array
        rate?: number
        message?: string
      }
      if (msg.type === 'progress') this.set({ model: 'loading', pct: msg.pct ?? 0 })
      else if (msg.type === 'ready') {
        this.ready = true
        this.set({ model: 'ready', pct: 100 })
        if (this.prefOn()) this.set({ enabled: true })
        void this.drainPregen()
      } else if (msg.type === 'error') {
        // fail loudly ON THE TOGGLE: whoever wanted a voice must be told
        // why there isn't one, not left in silence
        this.set({ model: 'error', message: msg.message ?? 'unknown error' })
      } else if (msg.type === 'audio' && msg.id !== undefined) {
        this.pending.get(msg.id)?.resolve({ audio: msg.audio!, rate: msg.rate! })
        this.pending.delete(msg.id)
      } else if (msg.type === 'fail' && msg.id !== undefined) {
        this.pending.get(msg.id)?.reject(new Error(msg.message ?? 'synthesis failed'))
        this.pending.delete(msg.id)
      }
    }
    w.onerror = (e) => {
      this.set({ model: 'error', message: e.message || 'the voice worker crashed' })
    }
    w.postMessage({ type: 'warm' })
  }

  private generateInWorker(key: string): Promise<Utterance> {
    return new Promise((resolve, reject) => {
      if (!this.worker) {
        reject(new Error('voice worker not started'))
        return
      }
      const id = ++this.rpcId
      this.pending.set(id, { resolve, reject })
      this.worker.postMessage({ type: 'generate', id, text: key })
    })
  }

  enable(): void {
    if (!VOICE_FEATURE) return
    try {
      localStorage.setItem(PREF_KEY, 'on')
    } catch {
      /* preference is a convenience only */
    }
    this.set({ enabled: true })
    // audio needs a user gesture; the toggle click IS one — claim it
    this.ctx ??= new AudioContext()
    if (this.ctx.state === 'suspended') void this.ctx.resume()
    this.warm()
  }

  disable(): void {
    this.pregenQueue.length = 0
    this.stop()
    try {
      localStorage.setItem(PREF_KEY, 'off')
    } catch {
      /* ignore */
    }
    this.set({ enabled: false })
  }

  /** Optimistically synthesize upcoming lines into the cache. Cheap to
   * call with the same list repeatedly; a no-op until the model is
   * ready. Runs strictly one synthesis at a time, and always yields to a
   * live speak() call. */
  pregenerate(texts: string[]): void {
    // no synthesis while the voice is off — this ran unconditionally
    // once, and the zoo's dozens of mounted players queued enough
    // inference to freeze a machine
    if (!this.state.enabled) return
    for (const t of texts) {
      for (const sentence of splitSentences(mathToSpeech(t))) {
        if (this.pregenQueue.length >= 32) return // bounded: upcoming steps only
        if (this.cache.has(sentence) || this.pregenQueue.includes(sentence)) continue
        this.pregenQueue.push(sentence)
      }
    }
    void this.drainPregen()
  }

  private async drainPregen(): Promise<void> {
    if (this.pregenRunning || !this.ready) return
    this.pregenRunning = true
    try {
      while (this.pregenQueue.length > 0) {
        // the voice going off, or a live utterance, releases the engine
        if (!this.state.enabled || this.state.speaking) break
        const key = this.pregenQueue.shift()!
        if (this.cache.has(key)) continue
        try {
          const persisted = await this.store.get(key)
          if (persisted) {
            this.put(key, persisted, false)
            continue
          }
          this.put(key, await this.generateLocked(key))
        } catch {
          // pre-generation is best-effort; the live path will retry and
          // surface the error if it is real
        }
      }
    } finally {
      this.pregenRunning = false
    }
  }

  private put(key: string, u: Utterance, persist = true): void {
    this.cache.delete(key)
    this.cache.set(key, u)
    if (persist) this.store.put(key, u)
    while (this.cache.size > CACHE_MAX) {
      const oldest = this.cache.keys().next().value
      if (oldest === undefined) break
      this.cache.delete(oldest)
    }
  }

  private async obtain(key: string): Promise<Utterance> {
    let u = this.cache.get(key) ?? (await this.store.get(key)) ?? null
    if (u) {
      if (!this.cache.has(key)) this.put(key, u, false)
      return u
    }
    u = await this.generateLocked(key)
    this.put(key, u)
    return u
  }

  /** Speak, cancelling whatever is mid-air. SENTENCE-PIPELINED: the
   * first sentence plays as soon as it exists; the rest synthesize
   * during playback and are scheduled gaplessly on the audio clock. */
  async speak(text: string): Promise<void> {
    if (!this.state.enabled || !this.ready) return
    const sentences = splitSentences(mathToSpeech(text))
    if (sentences.length === 0) return
    const myTurn = ++this.turn
    this.stopSources()
    const cold = !this.cache.has(sentences[0]!)
    this.set({ speaking: true, generating: cold, genPct: 0 })
    if (cold) this.startGenProgress(sentences[0]!.length)
    try {
      this.ctx ??= new AudioContext()
      if (this.ctx.state === 'suspended') await this.ctx.resume()
      let nextStart = 0
      let remaining = sentences.length
      for (const sentence of sentences) {
        const u = await this.obtain(sentence)
        if (myTurn !== this.turn) return // superseded mid-pipeline
        if (this.state.generating) {
          this.stopGenProgress()
          this.set({ generating: false, genPct: 100 })
        }
        const buf = this.ctx.createBuffer(1, u.audio.length, u.rate)
        buf.getChannelData(0).set(u.audio)
        const src = this.ctx.createBufferSource()
        src.buffer = buf
        src.connect(this.ctx.destination)
        src.onended = () => {
          remaining--
          if (myTurn === this.turn && remaining === 0) {
            this.set({ speaking: false })
            void this.drainPregen()
          }
        }
        const at = Math.max(this.ctx.currentTime, nextStart)
        src.start(at)
        nextStart = at + buf.duration
        this.sources.push(src)
        // the loop continues DURING playback: the next sentence
        // synthesizes while this one is heard
      }
    } catch (e) {
      if (myTurn !== this.turn) return
      this.stopGenProgress()
      this.set({ model: 'error', message: e instanceof Error ? e.message : String(e), generating: false, genPct: 0 })
    }
  }

  stop(): void {
    this.turn++
    this.stopSources()
    this.stopGenProgress()
    if (this.state.speaking || this.state.generating) this.set({ speaking: false, generating: false, genPct: 0 })
    void this.drainPregen()
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

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

type Kokoro = {
  generate: (
    text: string,
    opts: { voice: string },
  ) => Promise<{ audio: Float32Array; sampling_rate: number }>
}

const VOICE = 'af_heart'
const MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX'
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
  private state: SpeechState = { model: 'cold', pct: 0, enabled: false, speaking: false }
  private listeners = new Set<() => void>()
  private tts: Kokoro | null = null
  private loading: Promise<void> | null = null
  private ctx: AudioContext | null = null
  private source: AudioBufferSourceNode | null = null
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

  private generateLocked(key: string): Promise<Utterance> {
    const run = this.genLock.then(async () => {
      const out = await this.tts!.generate(key, { voice: VOICE })
      return { audio: out.audio, rate: out.sampling_rate }
    })
    this.genLock = run.then(
      () => undefined,
      () => undefined,
    )
    return run
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
    // never in tests: jsdom would boot the whole phonemizer and try to
    // download the model on every client E2E render
    if (typeof process !== 'undefined' && process.env?.['VITEST'] !== undefined) return
    if (this.tts || this.loading) return
    this.set({ model: 'loading', pct: 0 })
    this.loading = (async () => {
      try {
        const { KokoroTTS } = await import('kokoro-js')
        const hasWebGpu = typeof (navigator as { gpu?: unknown }).gpu !== 'undefined'
        const tts = await KokoroTTS.from_pretrained(MODEL, {
          // fp16 on WebGPU (~80MB), q8 on wasm (~40MB) — fp32 is ~300MB
          // and was a mistake to ever default to
          dtype: hasWebGpu ? 'fp16' : 'q8',
          device: hasWebGpu ? 'webgpu' : 'wasm',
          progress_callback: (p: unknown) => {
            const prog = (p as { progress?: unknown }).progress
            if (typeof prog === 'number') this.set({ model: 'loading', pct: Math.round(prog) })
          },
        })
        this.tts = tts as unknown as Kokoro
        this.set({ model: 'ready', pct: 100 })
        if (this.prefOn()) this.set({ enabled: true })
        void this.drainPregen()
      } catch (e) {
        // fail loudly ON THE TOGGLE: whoever wanted a voice must be told
        // why there isn't one, not left in silence
        this.set({ model: 'error', message: e instanceof Error ? e.message : String(e) })
        this.loading = null
      }
    })()
  }

  enable(): void {
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
      if (this.pregenQueue.length >= 24) break // bounded: upcoming steps only
      const key = mathToSpeech(t)
      if (key === '' || this.cache.has(key) || this.pregenQueue.includes(key)) continue
      this.pregenQueue.push(key)
    }
    void this.drainPregen()
  }

  private async drainPregen(): Promise<void> {
    if (this.pregenRunning || !this.tts) return
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

  /** Speak, cancelling whatever is mid-air. A no-op unless enabled and
   * the model is ready (autoload means "ready" is the common case). */
  async speak(text: string): Promise<void> {
    if (!this.state.enabled || !this.tts) return
    const key = mathToSpeech(text)
    if (key === '') return
    const myTurn = ++this.turn
    this.stopSource()
    this.set({ speaking: true })
    try {
      let u = this.cache.get(key) ?? (await this.store.get(key)) ?? null
      if (u && !this.cache.has(key)) this.put(key, u, false)
      if (!u) {
        u = await this.generateLocked(key)
        this.put(key, u)
      }
      if (myTurn !== this.turn) return // a newer utterance superseded this one
      this.ctx ??= new AudioContext()
      if (this.ctx.state === 'suspended') await this.ctx.resume()
      const buf = this.ctx.createBuffer(1, u.audio.length, u.rate)
      buf.getChannelData(0).set(u.audio)
      const src = this.ctx.createBufferSource()
      src.buffer = buf
      src.connect(this.ctx.destination)
      src.onended = () => {
        if (myTurn === this.turn) {
          this.set({ speaking: false })
          void this.drainPregen()
        }
      }
      this.source = src
      src.start()
    } catch (e) {
      if (myTurn !== this.turn) return
      this.set({ model: 'error', message: e instanceof Error ? e.message : String(e) })
    }
  }

  stop(): void {
    this.turn++
    this.stopSource()
    if (this.state.speaking) this.set({ speaking: false })
    void this.drainPregen()
  }

  private stopSource(): void {
    try {
      this.source?.stop()
    } catch {
      /* already ended */
    }
    this.source = null
  }
}

export const speech = new SpeechService()

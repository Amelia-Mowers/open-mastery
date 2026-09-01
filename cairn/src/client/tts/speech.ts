/** Local text-to-speech for young readers: Kokoro-82M (Apache-2.0)
 * running fully in the browser via kokoro-js — on-device like everything
 * else in the demo; no audio, no text ever leaves the machine.
 *
 * The model (~40–90MB depending on dtype) is fetched and cached the
 * FIRST time a student turns the voice on — voice is strictly opt-in,
 * the library itself is a dynamic import so the main bundle pays
 * nothing. NO SILENT FALLBACKS: a load or synthesis failure surfaces on
 * the toggle as an error state, never as quiet muteness. */

export type SpeechState =
  | { kind: 'off' }
  | { kind: 'loading'; pct: number }
  | { kind: 'ready'; speaking: boolean }
  | { kind: 'error'; message: string }

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

class SpeechService {
  private state: SpeechState = { kind: 'off' }
  private listeners = new Set<() => void>()
  private tts: Kokoro | null = null
  private loading: Promise<void> | null = null
  private ctx: AudioContext | null = null
  private source: AudioBufferSourceNode | null = null
  /** monotonic id so a stale synthesis never plays over a newer one */
  private turn = 0

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }
  getState = (): SpeechState => this.state
  private set(state: SpeechState): void {
    this.state = state
    for (const fn of this.listeners) fn()
  }

  prefOn(): boolean {
    try {
      return localStorage.getItem(PREF_KEY) === 'on'
    } catch {
      return false
    }
  }

  async enable(): Promise<void> {
    if (this.tts) {
      this.set({ kind: 'ready', speaking: false })
      return
    }
    if (this.loading) return this.loading
    this.set({ kind: 'loading', pct: 0 })
    this.loading = (async () => {
      try {
        const { KokoroTTS } = await import('kokoro-js')
        const hasWebGpu = typeof (navigator as { gpu?: unknown }).gpu !== 'undefined'
        const tts = await KokoroTTS.from_pretrained(MODEL, {
          dtype: hasWebGpu ? 'fp32' : 'q8',
          device: hasWebGpu ? 'webgpu' : 'wasm',
          progress_callback: (p: { status?: string; progress?: number }) => {
            if (typeof p.progress === 'number')
              this.set({ kind: 'loading', pct: Math.round(p.progress) })
          },
        })
        this.tts = tts as unknown as Kokoro
        try {
          localStorage.setItem(PREF_KEY, 'on')
        } catch {
          /* preference is a convenience only */
        }
        this.set({ kind: 'ready', speaking: false })
      } catch (e) {
        // fail loudly ON THE TOGGLE: the student asked for a voice and
        // must be told why there isn't one, not left in silence
        this.set({ kind: 'error', message: e instanceof Error ? e.message : String(e) })
        this.loading = null
        throw e
      }
    })()
    return this.loading
  }

  disable(): void {
    this.stop()
    try {
      localStorage.setItem(PREF_KEY, 'off')
    } catch {
      /* ignore */
    }
    this.set({ kind: 'off' })
  }

  /** Speak, cancelling whatever is mid-air. A no-op unless ready. */
  async speak(text: string): Promise<void> {
    if (!this.tts || this.state.kind === 'off' || this.state.kind === 'error') return
    const spoken = mathToSpeech(text)
    if (spoken === '') return
    const myTurn = ++this.turn
    this.stopSource()
    this.set({ kind: 'ready', speaking: true })
    try {
      const out = await this.tts.generate(spoken, { voice: VOICE })
      if (myTurn !== this.turn) return // a newer utterance superseded this one
      this.ctx ??= new AudioContext()
      if (this.ctx.state === 'suspended') await this.ctx.resume()
      const buf = this.ctx.createBuffer(1, out.audio.length, out.sampling_rate)
      buf.getChannelData(0).set(out.audio)
      const src = this.ctx.createBufferSource()
      src.buffer = buf
      src.connect(this.ctx.destination)
      src.onended = () => {
        if (myTurn === this.turn) this.set({ kind: 'ready', speaking: false })
      }
      this.source = src
      src.start()
    } catch (e) {
      if (myTurn !== this.turn) return
      this.set({ kind: 'error', message: e instanceof Error ? e.message : String(e) })
    }
  }

  stop(): void {
    this.turn++
    this.stopSource()
    if (this.state.kind === 'ready') this.set({ kind: 'ready', speaking: false })
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

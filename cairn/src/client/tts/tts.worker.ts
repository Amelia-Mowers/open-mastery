/** The Kokoro engine lives HERE, off the main thread — phonemization and
 * tensor marshalling janked interaction when generate() ran on main.
 * Protocol: {type:'warm'} → progress/ready/error; {type:'generate', id,
 * text} → {type:'audio', id, audio (transferred), rate} | {type:'fail',
 * id, message}. The worker processes one generation at a time by
 * construction (single-threaded event loop + sequential awaits). */

type Kokoro = {
  generate: (
    text: string,
    opts: { voice: string },
  ) => Promise<{ audio: Float32Array; sampling_rate: number }>
}

const VOICE = 'af_heart'
const MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX'

let tts: Kokoro | null = null
let warming: Promise<void> | null = null

async function warm(): Promise<void> {
  warming ??= (async () => {
    const { KokoroTTS, env } = await import('kokoro-js')
    // the ONNX wasm streams from the CDN (exact version pinned) — it is
    // stripped from our Pages artifact
    const ortEnv = (env as { backends?: { onnx?: { wasm?: { wasmPaths?: string } } } })
      .backends?.onnx?.wasm
    if (ortEnv)
      ortEnv.wasmPaths =
        'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0-dev.20250409-89f8206ba4/dist/'
    const hasWebGpu = typeof (navigator as { gpu?: unknown }).gpu !== 'undefined'
    const loaded = await KokoroTTS.from_pretrained(MODEL, {
      dtype: hasWebGpu ? 'fp16' : 'q8',
      device: hasWebGpu ? 'webgpu' : 'wasm',
      progress_callback: (p: unknown) => {
        const prog = (p as { progress?: unknown }).progress
        if (typeof prog === 'number') postMessage({ type: 'progress', pct: Math.round(prog) })
      },
    })
    tts = loaded as unknown as Kokoro
  })()
  return warming
}

onmessage = (ev: MessageEvent) => {
  const msg = ev.data as { type: string; id?: number; text?: string }
  if (msg.type === 'warm') {
    warm().then(
      () => postMessage({ type: 'ready' }),
      (e: unknown) =>
        postMessage({ type: 'error', message: e instanceof Error ? e.message : String(e) }),
    )
    return
  }
  if (msg.type === 'generate') {
    void (async () => {
      try {
        await warm()
        const out = await tts!.generate(msg.text ?? '', { voice: VOICE })
        // transfer, don't copy — audio buffers are hundreds of KB
        postMessage(
          { type: 'audio', id: msg.id, audio: out.audio, rate: out.sampling_rate },
          { transfer: [out.audio.buffer as ArrayBuffer] },
        )
      } catch (e) {
        postMessage({
          type: 'fail',
          id: msg.id,
          message: e instanceof Error ? e.message : String(e),
        })
      }
    })()
  }
}

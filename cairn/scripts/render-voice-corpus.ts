/** Build-time voice corpus: enumerate EVERY sentence the app can speak
 * — all explanations × all feeding items × every discrete pool instance
 * — and synthesize each once with Kokoro, encoding to opus via ffmpeg.
 *
 * Content-addressed: <sha256(sentence).slice(0,20)>.ogg, so the runtime
 * needs no manifest to resolve a sentence — but manifest.json is written
 * anyway as the coverage record (sentence → file) for CI to check
 * against. Incremental: existing files are skipped, so re-runs only
 * synthesize new or changed sentences.
 *
 * Output: cairn/voice-corpus/ (gitignored — it is published to the HF
 * dataset repo, not the git repo). Run niced; this is hours of CPU on
 * first build:  nice -n 19 node scripts/render-voice-corpus.ts
 *
 * GPU (~20x): VOICE_DEVICE=cuda, with the CUDA 12 runtime + cuDNN 9 on
 * the loader path (NixOS has neither by default — the .so files from
 * NVIDIA's pip wheels work; see scripts/render-voice-corpus-gpu.sh):
 *   VOICE_DEVICE=cuda LD_LIBRARY_PATH=~/.cache/cairn-cuda-libs:/run/opengl-driver/lib \
 *     node --experimental-transform-types scripts/render-voice-corpus.ts
 * ffmpeg encodes run in a small async pool either way, off the
 * synthesis critical path.
 */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdirSync, writeFileSync, existsSync, unlinkSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { corpusSentences, fileOf } from './voice-sentences.ts'
import { listFiles } from '@huggingface/hub'

const here = dirname(fileURLToPath(import.meta.url))
const outDir = join(here, '..', 'voice-corpus')
mkdirSync(outDir, { recursive: true })

const all = corpusSentences()
// A machine without the local render (a fresh checkout) would otherwise
// re-synthesize the whole corpus: with REMOTE=1, whatever the published
// manifest already names counts as present, so only the delta renders
// — and the upload script pushes exactly that delta.
const remote = new Set<string>()
if (process.env.REMOTE === '1') {
  const url = 'https://huggingface.co/datasets/AmeliaMowers/cairn-voice/resolve/main/manifest.json'
  const res = await fetch(url)
  if (!res.ok) throw new Error(`could not fetch the published manifest: ${res.status}`)
  for (const [s, f] of Object.entries((await res.json()) as Record<string, string>))
    if (f === fileOf(s)) remote.add(s)
  // a partial render pushed with MANIFEST=0 has files the manifest does
  // not name yet — the repo listing is the truth of what exists
  const files = new Set<string>()
  for await (const f of listFiles({ repo: { type: 'dataset', name: 'AmeliaMowers/cairn-voice' }, recursive: true }))
    files.add(f.path)
  for (const s of all) if (files.has(fileOf(s))) remote.add(s)
  console.log(`published corpus: ${remote.size} sentences (${files.size} files)`)
}
const missing = all.filter((s) => !remote.has(s) && !existsSync(join(outDir, fileOf(s))))
console.log(`corpus: ${all.length} unique sentences, ${missing.length} to synthesize`)

// the manifest is the coverage record even before synthesis finishes
const manifest: Record<string, string> = {}
for (const s of all) manifest[s] = fileOf(s)
writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 1))

if (missing.length === 0) {
  console.log('corpus complete')
  process.exit(0)
}

const device = process.env.VOICE_DEVICE ?? 'cpu'
if (device !== 'cpu' && device !== 'cuda')
  throw new Error(`VOICE_DEVICE must be cpu or cuda, got: ${device}`)

// VOICE_DTYPE overrides the default (fp32 on cuda, q8 on cpu): a small
// delta rendered on a CPU should still be fp32, so it matches the
// published corpus's voice instead of sounding like a different reader
const dtype = (process.env.VOICE_DTYPE ?? (device === 'cuda' ? 'fp32' : 'q8')) as 'fp32' | 'q8'
if (dtype !== 'fp32' && dtype !== 'q8') throw new Error(`VOICE_DTYPE must be fp32 or q8, got: ${dtype}`)
const { KokoroTTS } = await import('kokoro-js')
const tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', { dtype, device })
console.log(`synthesizing on ${device} (${dtype})`)

function wavBytes(audio: Float32Array, rate: number): Buffer {
  const pcm = Buffer.alloc(audio.length * 2)
  for (let i = 0; i < audio.length; i++) {
    const v = Math.max(-1, Math.min(1, audio[i]!))
    pcm.writeInt16LE(Math.round(v * 32767), i * 2)
  }
  const h = Buffer.alloc(44)
  h.write('RIFF', 0)
  h.writeUInt32LE(36 + pcm.length, 4)
  h.write('WAVEfmt ', 8)
  h.writeUInt32LE(16, 16)
  h.writeUInt16LE(1, 20)
  h.writeUInt16LE(1, 22)
  h.writeUInt32LE(rate, 24)
  h.writeUInt32LE(rate * 2, 28)
  h.writeUInt16LE(2, 32)
  h.writeUInt16LE(16, 34)
  h.write('data', 36)
  h.writeUInt32LE(pcm.length, 40)
  return Buffer.concat([h, pcm])
}

// synthesis is single-flight (one model session); ffmpeg encodes run in
// a bounded async pool so they overlap the next generation
const execFileP = promisify(execFile)
const ENCODE_POOL = 4
const inFlight = new Set<Promise<void>>()
let tmpSeq = 0

async function encode(sentence: string, audio: Float32Array, rate: number): Promise<void> {
  const wav = join(outDir, `_tmp${tmpSeq++}.wav`)
  writeFileSync(wav, wavBytes(audio, rate))
  const out = join(outDir, fileOf(sentence))
  mkdirSync(dirname(out), { recursive: true })
  await execFileP('ffmpeg', [
    '-y', '-loglevel', 'error', '-i', wav,
    '-c:a', 'libopus', '-b:a', '24k', '-ac', '1',
    out,
  ])
  unlinkSync(wav)
}

let done = 0
let encodeError: unknown = null
const t0 = Date.now()
for (const sentence of missing) {
  if (encodeError != null) throw encodeError
  const out = await tts.generate(sentence, { voice: 'af_heart' })
  const job = encode(sentence, out.audio as Float32Array, out.sampling_rate).catch((e: unknown) => {
    encodeError = e
  })
  inFlight.add(job)
  void job.finally(() => inFlight.delete(job))
  if (inFlight.size >= ENCODE_POOL) await Promise.race(inFlight)
  done++
  if (done % 25 === 0) {
    const rate = done / ((Date.now() - t0) / 1000)
    console.log(`${done}/${missing.length}  ${rate.toFixed(1)}/s  (${sentence.slice(0, 40)}…)`)
  }
}
await Promise.all(inFlight)
if (encodeError != null) throw encodeError
console.log(`DONE: ${done} synthesized; corpus at ${outDir}`)

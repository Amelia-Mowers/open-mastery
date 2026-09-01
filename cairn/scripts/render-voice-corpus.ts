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
 */
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync, existsSync, unlinkSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadBundleDir } from '@openmastery/schema/load'
import { generateParams, type GeneratorSpec } from '@openmastery/schema'
import { buildIndex } from '../src/core/curriculum.ts'
import { practiceItems, poolSeeds } from '../src/core/select.ts'
import { feedableParams } from '../src/site/core.ts'
import { renderText } from '../src/client/app/render.ts'
import { mathToSpeech, splitSentences } from '../src/client/tts/speech.ts'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..', 'curriculum')
const outDir = join(here, '..', 'voice-corpus')
mkdirSync(outDir, { recursive: true })

const bundle = { skills: [] as unknown[], items: [] as unknown[], explanations: [] as unknown[] }
for (const d of ['skills', 'items', 'explanations'] as const) {
  const r = loadBundleDir(join(root, d))
  bundle.skills.push(...r.bundle.skills)
  bundle.items.push(...r.bundle.items)
  bundle.explanations.push(...r.bundle.explanations)
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const cur = buildIndex(bundle as any)

/** every pool instance of an item: authored params + isomorphs or seeds */
function poolInstances(item: {
  params: Record<string, number | string>
  isomorphs?: Array<Record<string, number | string>>
  generator?: unknown
}): Array<Record<string, number | string>> {
  const out = [item.params]
  if (item.isomorphs != null) return [...out, ...item.isomorphs]
  if (item.generator == null) return out
  const spec = item.generator as GeneratorSpec
  const fixed: Record<string, number | string> = {}
  for (const [k, v] of Object.entries(item.params)) if (!(k in spec)) fixed[k] = v
  for (const seed of poolSeeds()) {
    const g = generateParams(spec, fixed, seed)
    if (!g.ok) throw new Error(`generator failed at seed ${seed}: ${g.error.message}`)
    out.push(g.value as Record<string, number | string>)
  }
  return out
}

const sentences = new Set<string>()
for (const e of cur.explanations.values()) {
  const feeders = practiceItems(e.skill, cur).filter(
    (it) => feedableParams(e, [it.params]) !== null,
  )
  for (const item of feeders) {
    for (const params of poolInstances(item)) {
      for (const st of e.timeline) {
        const texts: string[] = []
        if (st.caption !== undefined) texts.push(renderText(st.caption, params))
        if (st.expect?.prompt !== undefined) texts.push(renderText(st.expect.prompt, params))
        if (st.handoff?.prompt !== undefined) texts.push(renderText(st.handoff.prompt, params))
        for (const t of texts)
          for (const sentence of splitSentences(mathToSpeech(t))) sentences.add(sentence)
      }
    }
  }
}

const all = [...sentences].sort()
const fileOf = (s: string): string => createHash('sha256').update(s).digest('hex').slice(0, 20) + '.ogg'
const missing = all.filter((s) => !existsSync(join(outDir, fileOf(s))))
console.log(`corpus: ${all.length} unique sentences, ${missing.length} to synthesize`)

// the manifest is the coverage record even before synthesis finishes
const manifest: Record<string, string> = {}
for (const s of all) manifest[s] = fileOf(s)
writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 1))

if (missing.length === 0) {
  console.log('corpus complete')
  process.exit(0)
}

const { KokoroTTS } = await import('kokoro-js')
const tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', {
  dtype: 'q8',
  device: 'cpu',
})

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

let done = 0
for (const sentence of missing) {
  const out = await tts.generate(sentence, { voice: 'af_heart' })
  const wav = join(outDir, '_tmp.wav')
  writeFileSync(wav, wavBytes(out.audio as Float32Array, out.sampling_rate))
  execFileSync('ffmpeg', [
    '-y', '-loglevel', 'error', '-i', wav,
    '-c:a', 'libopus', '-b:a', '24k', '-ac', '1',
    join(outDir, fileOf(sentence)),
  ])
  unlinkSync(wav)
  done++
  if (done % 25 === 0) console.log(`${done}/${missing.length}  (${sentence.slice(0, 40)}…)`)
}
console.log(`DONE: ${done} synthesized; corpus at ${outDir}`)

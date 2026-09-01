/** LOUD coverage check: every sentence the app can speak must already be
 * in the voice corpus, or the build fails listing what is missing — the
 * runtime fetches pre-rendered audio and has nothing to fall back to.
 *
 * Checks the local render (voice-corpus/manifest.json) when present,
 * else the live manifest on the dataset repo. Run after curriculum
 * changes; a failure means: run scripts/render-voice-corpus-gpu.sh and
 * scripts/upload-voice-corpus.mjs, then re-check.
 *
 *   node --experimental-transform-types scripts/check-voice-coverage.ts
 */
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { corpusSentences, fileOf } from './voice-sentences.ts'

const MANIFEST_URL =
  'https://huggingface.co/datasets/AmeliaMowers/cairn-voice/resolve/main/manifest.json'

const here = dirname(fileURLToPath(import.meta.url))
const localManifest = join(here, '..', 'voice-corpus', 'manifest.json')

let manifest: Record<string, string>
let source: string
if (existsSync(localManifest)) {
  manifest = JSON.parse(readFileSync(localManifest, 'utf8')) as Record<string, string>
  source = 'local voice-corpus/manifest.json'
} else {
  const res = await fetch(MANIFEST_URL)
  if (!res.ok) throw new Error(`could not fetch corpus manifest: ${res.status} ${MANIFEST_URL}`)
  manifest = (await res.json()) as Record<string, string>
  source = MANIFEST_URL
}

const all = corpusSentences()
const missing = all.filter((s) => manifest[s] === undefined)
const misnamed = all.filter((s) => manifest[s] !== undefined && manifest[s] !== fileOf(s))

if (missing.length > 0 || misnamed.length > 0) {
  console.error(`VOICE COVERAGE FAILED against ${source}`)
  if (missing.length > 0) {
    console.error(`${missing.length} sentence(s) not in the corpus:`)
    for (const s of missing.slice(0, 20)) console.error(`  · ${s}`)
    if (missing.length > 20) console.error(`  … and ${missing.length - 20} more`)
  }
  for (const s of misnamed)
    console.error(`  filename drift: “${s}” → manifest ${manifest[s]}, expected ${fileOf(s)}`)
  console.error('render + upload the corpus, then re-run this check')
  process.exit(1)
}
console.log(`voice coverage OK: all ${all.length} sentences in corpus (${source})`)

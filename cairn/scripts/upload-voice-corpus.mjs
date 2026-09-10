/** Publish the rendered voice corpus to the HF dataset repo.
 *
 * Needs HF_TOKEN in the environment (a write token from
 * https://huggingface.co/settings/tokens). Creates the dataset repo if
 * missing, then makes ONE commit containing every missing .ogg, the
 * manifest, and (with PRUNE=1) the deletion of stale remote files.
 * One commit — never one per batch: HF rate-limits repository commits
 * (128/hour), and the 2026-09-10 sharding migration burned the whole
 * budget on 200-file upload batches that were each their own commit.
 *
 *   HF_TOKEN=hf_… node scripts/upload-voice-corpus.mjs <user>/cairn-voice
 */
import { readdirSync, readFileSync, openAsBlob } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRepo, commit, listFiles } from '@huggingface/hub'

import { homedir } from 'node:os'
const repoName = process.argv[2] ?? 'AmeliaMowers/cairn-voice'
let token = process.env.HF_TOKEN
if (!token) {
  try {
    token = readFileSync(join(homedir(), '.hf_token'), 'utf8').trim()
  } catch {
    /* fall through to the loud exit */
  }
}
if (!token) {
  console.error('no HF token: set HF_TOKEN or put it in ~/.hf_token')
  process.exit(1)
}
const repo = { type: 'dataset', name: repoName }
const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'voice-corpus')

try {
  await createRepo({ repo, accessToken: token, license: 'cc-by-4.0' })
  console.log('created', repoName)
} catch {
  console.log('repo exists:', repoName)
}

// FORCE=1 re-uploads everything (content-addressed names never change,
// so a re-render with different audio — e.g. q8 → fp32 — is invisible
// to the name diff and needs a forced push). PRUNE=1 deletes remote
// .ogg files the local corpus no longer contains (a re-enumeration —
// e.g. sentence-level → snippet-level — orphans every old name).
const have = new Set()
// recursive: the corpus is sharded into 2-hex-prefix directories
for await (const f of listFiles({ repo, accessToken: token, recursive: true })) have.add(f.path)

const local = readdirSync(dir, { recursive: true })
  .map(String)
  .map((f) => f.replaceAll('\\', '/'))
  .filter((f) => f.endsWith('.ogg'))
const todo = local.filter((f) => process.env.FORCE || !have.has(f))

const localSet = new Set(local)
const stale = process.env.PRUNE
  ? [...have].filter((f) => f.endsWith('.ogg') && !localSet.has(f))
  : []

// MANIFEST=0 pushes the .ogg files only — a PARTIAL render handed off
// mid-way (the manifest names every sentence, so publishing it early
// would make the coverage check pass against audio that isn't there)
const withManifest = process.env.MANIFEST !== '0'
console.log(
  `${local.length} local files · ${todo.length} to upload · ${stale.length} to prune · manifest ${withManifest ? 'included' : 'EXCLUDED (MANIFEST=0)'}`,
)

const operations = [
  // openAsBlob is lazy (file-backed) — nothing is read until the
  // uploader streams it, so a full-corpus push stays out of memory
  ...(await Promise.all(
    todo.map(async (f) => ({
      operation: 'addOrUpdate',
      path: f,
      content: await openAsBlob(join(dir, f)),
    })),
  )),
  ...(withManifest
    ? [
        {
          operation: 'addOrUpdate',
          path: 'manifest.json',
          content: new Blob([readFileSync(join(dir, 'manifest.json'))]),
        },
      ]
    : []),
  ...stale.map((path) => ({ operation: 'delete', path })),
]

if (operations.length === 0 || (todo.length === 0 && stale.length === 0 && !process.env.FORCE)) {
  console.log('nothing to do — remote corpus already matches')
  process.exit(0)
}

await commit({
  repo,
  accessToken: token,
  title: `corpus: +${todo.length} −${stale.length}${withManifest ? ' +manifest' : ''}`,
  operations,
})
console.log(`one commit: +${todo.length} −${stale.length}${withManifest ? ' +manifest' : ''}`)
if (withManifest) {
  console.log('corpus live at')
  console.log(`https://huggingface.co/datasets/${repoName}/resolve/main/`)
}

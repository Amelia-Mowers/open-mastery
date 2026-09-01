/** Publish the rendered voice corpus to the HF dataset repo.
 *
 * Needs HF_TOKEN in the environment (a write token from
 * https://huggingface.co/settings/tokens). Creates the dataset repo if
 * missing, uploads manifest.json plus every .ogg not already present
 * (content-addressed names make re-uploads cheap no-ops).
 *
 *   HF_TOKEN=hf_… node scripts/upload-voice-corpus.mjs <user>/cairn-voice
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRepo, uploadFiles, listFiles, deleteFiles } from '@huggingface/hub'

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
for await (const f of listFiles({ repo, accessToken: token })) have.add(f.path)

const local = readdirSync(dir).filter((f) => f.endsWith('.ogg'))
const todo = local.filter((f) => process.env.FORCE || !have.has(f))

if (process.env.PRUNE) {
  const localSet = new Set(local)
  const stale = [...have].filter((f) => f.endsWith('.ogg') && !localSet.has(f))
  console.log(`pruning ${stale.length} stale remote file(s)`)
  const DEL_BATCH = 500
  for (let i = 0; i < stale.length; i += DEL_BATCH) {
    await deleteFiles({ repo, accessToken: token, paths: stale.slice(i, i + DEL_BATCH) })
    console.log(`pruned ${Math.min(i + DEL_BATCH, stale.length)}/${stale.length}`)
  }
}
console.log(`${local.length} local files, ${todo.length} to upload`)

const BATCH = 200
for (let i = 0; i < todo.length; i += BATCH) {
  const batch = todo.slice(i, i + BATCH)
  await uploadFiles({
    repo,
    accessToken: token,
    files: batch.map((f) => ({ path: f, content: new Blob([readFileSync(join(dir, f))]) })),
  })
  console.log(`uploaded ${Math.min(i + BATCH, todo.length)}/${todo.length}`)
}
await uploadFiles({
  repo,
  accessToken: token,
  files: [
    { path: 'manifest.json', content: new Blob([readFileSync(join(dir, 'manifest.json'))]) },
  ],
})
console.log('manifest uploaded — corpus live at')
console.log(`https://huggingface.co/datasets/${repoName}/resolve/main/`)

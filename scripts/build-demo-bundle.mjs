// Compile ../curriculum YAML into the JSON bundle the browser demo ships.
// DEMO ONLY: this puts answer keys in the client build.
import { writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadBundleDir } from '@openmastery/schema/load'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const curriculum = join(root, '..', 'curriculum')
const bundle = { skills: [], items: [], explanations: [] }
for (const d of ['skills', 'items', 'explanations']) {
  const r = loadBundleDir(join(curriculum, d))
  if (r.errors.length > 0) {
    console.error(r.errors)
    process.exit(1)
  }
  bundle.skills.push(...r.bundle.skills)
  bundle.items.push(...r.bundle.items)
  bundle.explanations.push(...r.bundle.explanations)
}
const out = join(root, 'src', 'client', 'demo', 'bundle.json')
mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, JSON.stringify(bundle))
console.log(
  `demo bundle: ${bundle.skills.length} skills, ${bundle.items.length} items, ${bundle.explanations.length} explanations → ${out}`,
)

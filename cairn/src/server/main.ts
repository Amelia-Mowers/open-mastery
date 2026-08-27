#!/usr/bin/env node
/** Run the local site server:
 *   node --experimental-strip-types src/server/main.ts [--curriculum <dir>] [--port <n>] [--static <dir>]
 *
 * Defaults: curriculum = ../curriculum (sibling repo), port = 4777,
 * static = ./dist (the built PWA client, if present).
 */
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { loadBundleDir } from '@openmastery/schema/load'
import { validateBundle, type Bundle } from '@openmastery/schema'
import { createDevSite } from './dev.ts'

const args = process.argv.slice(2)
const argOf = (name: string, dflt: string): string => {
  const i = args.indexOf(`--${name}`)
  return i !== -1 && args[i + 1] !== undefined ? args[i + 1]! : dflt
}

const curriculumRoot = resolve(argOf('curriculum', join(import.meta.dirname, '..', '..', '..', 'curriculum')))
const port = Number(argOf('port', '4777'))
const staticDir = resolve(argOf('static', join(import.meta.dirname, '..', '..', 'dist')))

const bundle: Bundle = { skills: [], items: [], explanations: [] }
for (const d of ['skills', 'items', 'explanations']) {
  const dir = join(curriculumRoot, d)
  if (!existsSync(dir)) {
    console.error(`curriculum directory not found: ${dir}`)
    process.exit(1)
  }
  const { bundle: part, errors } = loadBundleDir(dir)
  for (const e of errors) console.error(`✖ ${d}/${e.file}: ${e.message}`)
  if (errors.length > 0) process.exit(1)
  bundle.skills.push(...part.skills)
  bundle.items.push(...part.items)
  bundle.explanations.push(...part.explanations)
}
const issues = validateBundle(bundle, { profile: 'authoring' }).filter((i) => i.severity === 'error')
for (const i of issues) console.error(`✖ ${i.where}: [${i.code}] ${i.message}`)
if (issues.length > 0) process.exit(1)

const site = createDevSite(bundle, existsSync(staticDir) ? { staticDir } : {})
site.server.listen(port, () => {
  console.log(
    `cairn site server: http://localhost:${port}  ` +
      `(${bundle.skills.length} skills, ${bundle.items.length} items` +
      `${existsSync(staticDir) ? `, client from ${staticDir}` : ', API only — run npm run build for the client'})`,
  )
})

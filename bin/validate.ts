#!/usr/bin/env node
/** openmastery-validate <dir> [--profile authoring|release]
 *
 * Loads every .yaml/.yml/.json file under <dir> (classified by shape),
 * validates file-level schemas, then runs bundle validation. Exit 1 on errors.
 */
import { loadBundleDir } from '../src/curriculum/load.ts'
import { validateBundle } from '../src/curriculum/bundle.ts'

const args = process.argv.slice(2)
const profileIdx = args.indexOf('--profile')
const profile =
  profileIdx !== -1 && (args[profileIdx + 1] === 'authoring' || args[profileIdx + 1] === 'release')
    ? (args[profileIdx + 1] as 'authoring' | 'release')
    : 'release'
const dir = args.find((a) => !a.startsWith('--') && a !== profile)
if (!dir) {
  console.error('usage: openmastery-validate <dir> [--profile authoring|release]')
  process.exit(2)
}

const { bundle, errors } = loadBundleDir(dir)
for (const e of errors) console.error(`✖ ${e.file}${e.kind ? ` [${e.kind}]` : ''} ${e.message}`)

const issues = validateBundle(bundle, { profile })
for (const i of issues)
  console.error(`${i.severity === 'error' ? '✖' : '⚠'} ${i.where}: [${i.code}] ${i.message}`)

const errorCount = errors.length + issues.filter((i) => i.severity === 'error').length
console.log(
  `${bundle.skills.length} skills, ${bundle.items.length} items, ${bundle.explanations.length} explanations · ` +
    `${errorCount} error(s), ${issues.filter((i) => i.severity === 'warning').length} warning(s) [profile: ${profile}]`,
)
process.exit(errorCount > 0 ? 1 : 0)

/** Filesystem bundle loader for the validator CLI, curriculum CI, and the
 * site server's bundle ingest. Node-only (uses node:fs) — deliberately NOT
 * exported from the package root so browser consumers never pull it in;
 * import from '@openmastery/schema/load'. */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { parse as parseYaml } from 'yaml'
import { skillSchema } from './skill.ts'
import { itemSchema } from './item.ts'
import { explanationSchema } from './explanation.ts'
import type { Bundle } from './bundle.ts'
import { normalizeLoadedDoc } from './normalize.ts'

export interface LoadError {
  file: string
  kind: 'skill' | 'item' | 'explanation' | null
  message: string
}

export interface LoadedBundle {
  bundle: Bundle
  errors: LoadError[]
}

function walk(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    if (name.startsWith('.') || name === 'node_modules') continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...walk(p))
    else if (/\.(ya?ml|json)$/.test(name)) out.push(p)
  }
  return out
}

/** Records are classified by shape, not by directory, so repo layout stays a
 * convention: timeline → explanation, widget+answer → item, instruction → skill. */
export function classify(rec: Record<string, unknown>): 'skill' | 'item' | 'explanation' | null {
  if ('timeline' in rec) return 'explanation'
  if ('widget' in rec && 'answer' in rec) return 'item'
  if ('instruction' in rec) return 'skill'
  return null
}

export function loadBundleDir(dir: string): LoadedBundle {
  const bundle: Bundle = { skills: [], items: [], explanations: [] }
  const errors: LoadError[] = []

  for (const file of walk(dir)) {
    const rel = relative(dir, file)
    let raw: unknown
    try {
      const text = readFileSync(file, 'utf8')
      raw = file.endsWith('.json') ? JSON.parse(text) : parseYaml(text)
    } catch (e) {
      errors.push({ file: rel, kind: null, message: `unreadable: ${(e as Error).message}` })
      continue
    }
    if (raw == null || typeof raw !== 'object') continue
    const doc = normalizeLoadedDoc(raw)
    const kind = classify(doc as Record<string, unknown>)
    if (!kind) {
      errors.push({
        file: rel,
        kind: null,
        message: 'cannot classify record (no timeline / widget+answer / instruction)',
      })
      continue
    }
    const schema = kind === 'skill' ? skillSchema : kind === 'item' ? itemSchema : explanationSchema
    const r = schema.safeParse(doc)
    if (!r.success) {
      for (const iss of r.error.issues)
        errors.push({ file: rel, kind, message: `${iss.path.join('.') || '(root)'}: ${iss.message}` })
      continue
    }
    if (kind === 'skill') bundle.skills.push(r.data as never)
    else if (kind === 'item') bundle.items.push(r.data as never)
    else bundle.explanations.push(r.data as never)
  }
  return { bundle, errors }
}

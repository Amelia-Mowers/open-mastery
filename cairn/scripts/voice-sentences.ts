/** ONE enumerator for every sentence the app can speak — all
 * explanations × all feeding items × every discrete pool instance,
 * captions + gate prompts + handoffs. The corpus renderer synthesizes
 * this list and the coverage check compares it to the published
 * manifest; sharing the walk is what makes the check a guarantee. */
import { createHash } from 'node:crypto'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadBundleDir } from '@openmastery/schema/load'
import { generateParams, type GeneratorSpec } from '@openmastery/schema'
import { buildIndex } from '../src/core/curriculum.ts'
import { practiceItems, poolSeeds } from '../src/core/select.ts'
import { feedableParams } from '../src/site/core.ts'
import { renderText } from '../src/client/app/render.ts'
import { mathToSpeech, splitSentences } from '../src/client/tts/speech.ts'

/** sentence → corpus filename (content-addressed; the client derives the
 * same name with crypto.subtle in src/client/tts/speech.ts) */
export const fileOf = (s: string): string =>
  createHash('sha256').update(s).digest('hex').slice(0, 20) + '.ogg'

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

/** all unique speakable sentences, sorted */
export function corpusSentences(): string[] {
  const here = dirname(fileURLToPath(import.meta.url))
  const root = join(here, '..', '..', 'curriculum')
  const bundle = { skills: [] as unknown[], items: [] as unknown[], explanations: [] as unknown[] }
  for (const d of ['skills', 'items', 'explanations'] as const) {
    const r = loadBundleDir(join(root, d))
    bundle.skills.push(...r.bundle.skills)
    bundle.items.push(...r.bundle.items)
    bundle.explanations.push(...r.bundle.explanations)
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cur = buildIndex(bundle as any)

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
  return [...sentences].sort()
}

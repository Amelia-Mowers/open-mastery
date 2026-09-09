/** ONE enumerator for every snippet the app can speak — all
 * explanations × all feeding items × every discrete pool instance,
 * captions + gate prompts + handoffs, each rendered WHOLE (one audio
 * file per snippet; no sentence splitting — that was a relic of
 * streaming on-device synthesis and made playback piecewise). The
 * corpus renderer synthesizes this list and the coverage check compares
 * it to the published manifest; sharing the walk is what makes the
 * check a guarantee. */
import { createHash } from 'node:crypto'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadBundleDir } from '@openmastery/schema/load'
import { generateParams, type GeneratorSpec } from '@openmastery/schema'
import { buildIndex } from '../src/core/curriculum.ts'
import { practiceItems, poolSeeds } from '../src/core/select.ts'
import { feedableParams } from '../src/site/core.ts'
import { renderText } from '../src/client/app/render.ts'
import { mathToSpeech } from '../src/client/tts/speech.ts'
import { introSentences, problemLine, problemSpeak } from '../src/client/app/intro.ts'

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
  const bundle = {
    skills: [] as unknown[],
    items: [] as unknown[],
    explanations: [] as unknown[],
    representations: [] as unknown[],
  }
  for (const d of ['skills', 'items', 'explanations', 'representations'] as const) {
    const r = loadBundleDir(join(root, d))
    bundle.skills.push(...r.bundle.skills)
    bundle.items.push(...r.bundle.items)
    bundle.explanations.push(...r.bundle.explanations)
    bundle.representations.push(...(r.bundle.representations ?? []))
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cur = buildIndex(bundle as any)

  const sentences = new Set<string>()
  const add = (t: string) => {
    const snippet = mathToSpeech(t)
    if (snippet !== '') sentences.add(snippet)
  }
  // the intro beats: a skill's preamble line + one per vocabulary term,
  // and each representation's introduction — built by the SAME code the
  // player narrates from (src/client/app/intro.ts)
  for (const s of cur.skills.values()) for (const t of introSentences(s)) add(t)
  for (const r of cur.representations.values()) add(r.intro)
  for (const e of cur.explanations.values()) {
    const feeders = practiceItems(e.skill, cur).filter(
      (it) => feedableParams(e, [it.params]) !== null,
    )
    for (const item of feeders) {
      for (const params of poolInstances(item)) {
        // the intro's problem beat names this instance's opening equation
        const problem = problemLine(e.timeline, params)
        if (problem !== null) add(problemSpeak(problem))
        for (const st of e.timeline) {
          const texts: string[] = []
          if (st.caption !== undefined) texts.push(renderText(st.caption, params))
          if (st.expect?.prompt !== undefined) texts.push(renderText(st.expect.prompt, params))
          if (st.handoff?.prompt !== undefined) texts.push(renderText(st.handoff.prompt, params))
          for (const t of texts) {
            const snippet = mathToSpeech(t)
            if (snippet !== '') sentences.add(snippet)
          }
        }
      }
    }
  }
  return [...sentences].sort()
}

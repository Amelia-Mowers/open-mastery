/** Intro beats — the narrated frames a lesson plays BEFORE its first
 * content step, over the same stage and through the same transport.
 *
 * In order, each shown once per student and skipped afterwards (they stay
 * on the step track, so scrubbing back still reaches them):
 *   - SKILL beat (a skill's first lesson only): the child-facing name as
 *     the headline, the preamble's plain explanation as the line. Holds
 *     for a manual Continue.
 *   - VOCAB beats, one per term: the term as the headline, its meaning as
 *     the line. Hold for Continue.
 *   - PROBLEM beat: "Here's how it works on a problem like x + 8 = 21."
 *     — the first moment the lesson's equation is on screen.
 *   - REP beat (the first time this student meets a representation, in
 *     any skill): "This is a tape diagram…" over the widget's opening
 *     state.
 *
 * Each beat has what the caption box SHOWS and what the voice SAYS: the
 * headline is on screen already, so it is spoken but not repeated in
 * the box ("New skill: Find x when something was added. Sometimes…").
 * Both strings are built HERE and nowhere else: the voice corpus
 * enumerator (scripts/voice-sentences.ts) walks the same builder, which
 * is what makes coverage of the narrated intros a guarantee. */
import { renderText, type Params } from './render.ts'

export interface IntroSpec {
  /** the headline of the skill beat — the child-facing short name where
   * the skill has one, else the formal name */
  skillName: string
  /** the skill preamble: plain-words explanation + the vocabulary it uses */
  plain?: string | undefined
  vocab?: ReadonlyArray<{ term: string; meaning: string }> | undefined
  /** the lesson's opening equation, rendered ("x + 8 = 21") — the
   * problem beat; absent when the timeline has no equation banner */
  problem?: string | undefined
  /** the representation's one-sentence introduction */
  rep?: { name: string; intro: string } | undefined
  /** play the skill beats (skill, vocab, problem) now; false: on the
   * track, skipped */
  playSkill: boolean
  /** play the rep beat now (false: present on the track, skipped) */
  playRep: boolean
}

export interface IntroBeat {
  kind: 'skill' | 'vocab' | 'problem' | 'rep'
  /** what the stage shows large while the beat plays (skill name, the
   * term); the problem and rep beats show the board itself */
  headline?: string
  /** the caption box */
  caption: string
  /** the narration — headline included, so a listener hears the title */
  speak: string
  /** the clock holds at the end of this beat until Continue is pressed */
  manual: boolean
}

/** seconds each intro beat holds before the next (the narration hold
 * extends it, exactly as for content captions) */
export const INTRO_BEAT_SECONDS = 4

const closed = (s: string): string => {
  const t = s.trim()
  return /[.!?]$/.test(t) ? t : `${t}.`
}

export const skillSpeak = (name: string, plain: string): string =>
  `New skill: ${closed(name)} ${closed(plain)}`
export const vocabSpeak = (v: { term: string; meaning: string }): string =>
  `A word to know: ${closed(v.term)} ${closed(v.meaning)}`
export const problemSpeak = (equation: string): string =>
  `Here's how it works on a problem like ${equation}.`
export const problemCaption = problemSpeak

/** the lesson's opening equation as one string, from the first step that
 * sets the banner — null when the timeline never shows one */
export function problemLine(
  timeline: ReadonlyArray<{ patch?: Record<string, unknown> | undefined }>,
  params: Params,
): string | null {
  for (const st of timeline) {
    const eq = st.patch?.['equation']
    if (Array.isArray(eq)) return eq.map((seg) => renderText(String(seg), params)).join('')
  }
  // the whiteboard family has no equation banner — its problem is the
  // board's own opening line (`start`, else the first written `line`)
  for (const st of timeline) {
    const start = st.patch?.['start'] ?? st.patch?.['line']
    if (typeof start === 'string') return renderText(start, params)
  }
  return null
}

export function introBeats(spec: IntroSpec, params: Params): IntroBeat[] {
  const beats: IntroBeat[] = []
  // the child-facing short name may template the problem's own letter
  // ("Find {variable} when something was added" over y + 38 = 85)
  const skillName = renderText(spec.skillName, params)
  if (spec.plain !== undefined && spec.plain !== '')
    beats.push({
      kind: 'skill',
      headline: skillName,
      caption: spec.plain,
      speak: skillSpeak(skillName, spec.plain),
      manual: true,
    })
  for (const v of spec.vocab ?? [])
    beats.push({ kind: 'vocab', headline: v.term, caption: closed(v.meaning), speak: vocabSpeak(v), manual: true })
  // the problem bridge belongs to the skill's intro: it only makes sense
  // after "here's the idea", never on its own before a rep beat
  if (beats.length > 0 && spec.problem !== undefined && spec.problem !== '')
    beats.push({
      kind: 'problem',
      caption: problemCaption(spec.problem),
      speak: problemSpeak(spec.problem),
      manual: false,
    })
  if (spec.rep) beats.push({ kind: 'rep', caption: spec.rep.intro, speak: spec.rep.intro, manual: false })
  return beats
}

/** every line a skill's intro can speak (the problem beat is per
 * explanation instance — the enumerator adds it with `problemSpeak`).
 * The short name may template the problem's letter, so the enumerator
 * passes every instance's params and dedupes the variants. */
export function introSentences(
  skill: {
    name: string
    short?: string | undefined
    preamble?: { plain: string; vocab: Array<{ term: string; meaning: string }> } | undefined
  },
  paramsList: ReadonlyArray<Params>,
): string[] {
  const out = new Set<string>()
  for (const params of paramsList.length > 0 ? paramsList : [{}])
    for (const b of introBeats(
      {
        skillName: skill.short ?? skill.name,
        plain: skill.preamble?.plain,
        vocab: skill.preamble?.vocab,
        playSkill: true,
        playRep: false,
      },
      params as Params,
    ))
      out.add(b.speak)
  return [...out]
}

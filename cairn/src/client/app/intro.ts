/** Intro beats — the narrated frames a lesson plays BEFORE its first
 * content step, over the same stage and through the same transport.
 *
 * Two kinds, each shown once per student and skipped afterwards (they
 * stay on the step track, so scrubbing back still reaches them):
 *   - SKILL beats (a skill's first lesson only): the preamble's plain
 *     sentence, then one beat per vocabulary term;
 *   - the REP beat (the first time this student meets a representation,
 *     in any skill): "This is a tape diagram. A bar cut into pieces…".
 *
 * The caption strings are built HERE and nowhere else: the voice corpus
 * enumerator (scripts/voice-sentences.ts) walks the same builder, which
 * is what makes coverage of the narrated intros a guarantee rather than
 * a hope. */

export interface IntroSpec {
  /** the headline of the skill beat — the child-facing short name where
   * the skill has one, else the formal name */
  skillName: string
  /** the skill preamble: plain-words framing + the vocabulary it uses */
  plain?: string | undefined
  vocab?: ReadonlyArray<{ term: string; meaning: string }> | undefined
  /** the representation's one-sentence introduction */
  rep?: { name: string; intro: string } | undefined
  /** play the skill beats now (false: present on the track, skipped) */
  playSkill: boolean
  /** play the rep beat now (false: present on the track, skipped) */
  playRep: boolean
}

export interface IntroBeat {
  kind: 'skill' | 'vocab' | 'rep'
  /** what the stage shows large while the beat plays (skill name, the
   * term); the rep beat shows the widget itself */
  headline?: string
  /** the narrated line */
  caption: string
}

/** seconds each intro beat holds before the next (the narration hold
 * extends it, exactly as for content captions) */
export const INTRO_BEAT_SECONDS = 4

/** "term — meaning." — one spoken line per vocabulary entry */
export const vocabCaption = (v: { term: string; meaning: string }): string => {
  const meaning = v.meaning.trim()
  const closed = /[.!?]$/.test(meaning) ? meaning : `${meaning}.`
  return `${v.term} — ${closed}`
}

export function introBeats(spec: IntroSpec): IntroBeat[] {
  const beats: IntroBeat[] = []
  if (spec.plain !== undefined && spec.plain !== '')
    beats.push({ kind: 'skill', headline: spec.skillName, caption: spec.plain })
  for (const v of spec.vocab ?? [])
    beats.push({ kind: 'vocab', headline: v.term, caption: vocabCaption(v) })
  if (spec.rep) beats.push({ kind: 'rep', caption: spec.rep.intro })
  return beats
}

/** every line an intro can speak — for the corpus enumerator */
export function introSentences(skill: {
  name: string
  preamble?: { plain: string; vocab: Array<{ term: string; meaning: string }> } | undefined
}): string[] {
  return introBeats({
    skillName: skill.name,
    plain: skill.preamble?.plain,
    vocab: skill.preamble?.vocab,
    playSkill: true,
    playRep: false,
  }).map((b) => b.caption)
}

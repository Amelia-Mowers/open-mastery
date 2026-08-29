/** Event vocabulary (§4.7). The envelope is stamped by the site server at
 * ingest: siteSeq is the total order, (deviceId, deviceSeq) makes client
 * retries idempotent, t is SITE TIME. Folds read t and never query a clock. */

/** FROZEN at build step 2 (§11). Server-side flag vocabulary; extending it is
 * a coreVersion bump, never an edit. */
export const FLAG_REASONS = [
  'attempt_cap',
  'prereq_failure',
  'hint_rate_spike',
  'stuck_duration',
  'guess_speed',
] as const
export type FlagReason = (typeof FLAG_REASONS)[number]

export interface Envelope {
  siteSeq: number
  deviceId: string
  deviceSeq: number
  coreVersion: string
  bundleVersion: string
  studentId: string
  /** site time at ingest */
  t: number
}

/** What kind of serve produced an attempt. Server-stamped so the fold stays
 * curriculum-free. (Additive over §4.7, as are skillId/paramHash: the doc's
 * accounting rules — probe attempts scope to the prereq, assistance scopes to
 * (itemId, paramHash) — need them explicit on the event.) */
/** How a problem was served. There is no separate "worked example" kind:
 * stepwise made EVERY problem one the student works step by step, so the
 * lesson flows straight into ordinary practice. What varies is how much
 * scaffolding rides along, which is a matter of degree, not of category. */
export type AttemptItemKind = 'practice' | 'check' | 'probe' | 'review'

export type EventBody =
  | {
      kind: 'attempt'
      itemId: string
      paramHash: string
      /** the skill this attempt counts against (the prereq for probe attempts) */
      skillId: string
      itemKind: AttemptItemKind
      answer: unknown
      correct: boolean
      hintLevel: number
      latencyMs: number
      assisted: boolean
      /** review attempts only: the §5 BKT→FSRS rating, computed at emit time
       * so the fold replays FSRS deterministically */
      rating?: 'again' | 'hard' | 'good' | 'easy'
      trace?: unknown
    }
  | {
      kind: 'explanation_viewed'
      explanationId: string
      skillId: string
      completed: boolean
      representation: string
    }
  | { kind: 'hint'; itemId: string; level: number }
  /** marks the instance assisted; NO transcript in the student log */
  | { kind: 'llm_help'; itemId: string; paramHash: string; turnCount: number }
  /** explicit fact; survives model retuning */
  | { kind: 'mastery_granted'; skillId: string; checkItemIds: string[] }
  /** failed FSRS review */
  | { kind: 'mastery_lapsed'; skillId: string }
  /** raw, from client; the server combines these into guide_flags */
  | { kind: 'signal'; signal: 'idle' | 'focus_lost' | 'focus_gained' | 'pace'; value?: number }
  | { kind: 'guide_flag'; reason: FlagReason; skillId?: string }
  | { kind: 'guide_intervention'; note?: string }
  | { kind: 'session'; phase: 'start' | 'end' }
  /** One MOVE inside a stepwise problem: which gate, what they did, and
   * whether it was right. Without this the engine can only say a problem
   * was missed, never which step broke — which is the entire reason to
   * decompose a problem into steps, and what the guide view needs before
   * it can point at anything. Not a mastery signal in v1: the item's own
   * `attempt` still carries the BKT evidence, so replaying these changes
   * no estimate. */
  | {
      kind: 'step_attempt'
      itemId: string
      paramHash: string
      skillId: string
      explanationId: string
      /** index of the gated step within the explanation's timeline */
      stepIndex: number
      /** what the gate asked for (op | expr | numeric | pick) */
      expectType: string
      answer: unknown
      correct: boolean
      /** the student asked the gate to solve itself */
      revealed: boolean
      /** id of the misconception this miss matched, when one did */
      misconceptionId?: string
      latencyMs: number
    }
  /** The student declared a grade at sign-in, so everything below it is
   * assumed known. This is NOT mastery: it carries no check evidence and
   * must never be confused with it (mastery_granted asserts two clean
   * unassisted isomorphs; this asserts only that the student said so).
   * Placed skills are skipped, and a lapse or a failed probe can still
   * pull them back into practice like any other skill. */
  | { kind: 'placement'; grade: number; skillIds: string[] }
  /** site-time corrections; govern only future stamps (§7) */
  | { kind: 'clock_set'; wallclock: number; source: 'rtc' | 'ntp' | 'guide' }
  /** audit marker; rows removed locally and, on sync, at the replica */
  | { kind: 'student_deleted' }

export type CairnEvent = Envelope & EventBody
export type EventKind = EventBody['kind']

/** "Same item" everywhere means (itemId, paramHash). */
export const instanceKey = (itemId: string, paramHash: string): string =>
  `${itemId}#${paramHash}`

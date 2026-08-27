/** FSRS-4.5 spaced-repetition scheduler (§5, build step 8). Mastered skills
 * enter review; ratings come from the BKT→FSRS handoff (§5 table) and ride ON
 * the attempt event, so the fold replays deterministically. Like the BKT
 * formulas, the weights here are MODEL constants the fold applies on replay —
 * not policy (retuning them is a core release, §4.7).
 *
 * With requestRetention 0.9 the next interval is exactly `stability` days:
 * I = 9·S·(1/r − 1) = S.
 */

export type FsrsRating = 'again' | 'hard' | 'good' | 'easy'

export interface FsrsState {
  stability: number // days
  difficulty: number // 1..10
  due: number // site-time ms
  /** site time of the last review (or the grant) — retrievability needs it */
  last: number
}

/** FSRS-4.5 default weights. */
const W = [
  0.4872, 1.4003, 3.7145, 13.8206, 5.1618, 1.2298, 0.8975, 0.031, 1.6474,
  0.1367, 1.0461, 2.1072, 0.0793, 0.3246, 1.587, 0.2272, 2.8755,
] as const

const RETENTION = 0.9
export const DAY_MS = 86_400_000

const GRADE: Record<FsrsRating, number> = { again: 1, hard: 2, good: 3, easy: 4 }

const clampD = (d: number): number => Math.min(10, Math.max(1, d))

const initDifficulty = (g: number): number => clampD(W[4]! - (g - 3) * W[5]!)

/** Predicted recall probability after `elapsedMs` at stability S. */
export const retrievability = (elapsedMs: number, stability: number): number =>
  Math.pow(1 + Math.max(0, elapsedMs) / (9 * stability * DAY_MS), -1)

const intervalMs = (stability: number): number =>
  Math.max(DAY_MS, 9 * stability * (1 / RETENTION - 1) * DAY_MS)

/** A skill enters review at mastery: first state comes from the grant. */
export function fsrsInit(rating: FsrsRating, now: number): FsrsState {
  const g = GRADE[rating]
  const stability = W[g - 1]!
  return {
    stability,
    difficulty: initDifficulty(g),
    due: now + intervalMs(stability),
    last: now,
  }
}

/** One review outcome. Success grows stability (more for easy, less for hard,
 * less the more retrievable it still was); a lapse collapses it. */
export function fsrsReview(state: FsrsState, rating: FsrsRating, now: number): FsrsState {
  const g = GRADE[rating]
  const { stability: S, difficulty: D } = state
  const R = retrievability(now - state.last, S)

  const dPrime = D - W[6]! * (g - 3)
  const difficulty = clampD(W[7]! * initDifficulty(4) + (1 - W[7]!) * dPrime)

  const stability =
    rating === 'again'
      ? Math.min(S, W[11]! * Math.pow(D, -W[12]!) * (Math.pow(S + 1, W[13]!) - 1) * Math.exp(W[14]! * (1 - R)))
      : S *
        (1 +
          Math.exp(W[8]!) *
            (11 - D) *
            Math.pow(S, -W[9]!) *
            (Math.exp(W[10]! * (1 - R)) - 1) *
            (rating === 'hard' ? W[15]! : 1) *
            (rating === 'easy' ? W[16]! : 1))

  return { stability, difficulty, due: now + intervalMs(stability), last: now }
}

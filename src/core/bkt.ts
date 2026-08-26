/** BKT per skill with the branch-specific assistance discount (§5).
 *
 *   correct, hint level k:  post = p(1−S) / (p(1−S) + (1−p)·G_eff)
 *                           G_eff = 1 − (1−G)·0.5^k
 *   incorrect (any k):      post = pS / (pS + (1−p)(1−G))      — base G, base S
 *   then                    p' = post + (1−post)·T
 *
 * Correct-with-help carries reduced evidence; wrong-with-help is FULL negative
 * evidence (inflating G in both branches would weaken it). The 0.5 halving is
 * part of the model formula, not policy — the fold applies it on replay.
 */
export interface BktParams {
  L0: number
  T: number
  S: number
  G: number
}

export const gEff = (G: number, hintLevel: number): number =>
  1 - (1 - G) * Math.pow(0.5, hintLevel)

export function bktUpdate(
  p: number,
  correct: boolean,
  hintLevel: number,
  prm: BktParams,
): number {
  const { S, G, T } = prm
  const post = correct
    ? (p * (1 - S)) / (p * (1 - S) + (1 - p) * gEff(G, hintLevel))
    : (p * S) / (p * S + (1 - p) * (1 - G))
  return post + (1 - post) * T
}

/** v1 expected correctness is the per-skill BKT prediction; no per-item term
 * (difficulty only orders items within a skill). */
export const predictCorrect = (p: number, prm: BktParams): number =>
  p * (1 - prm.S) + (1 - p) * prm.G

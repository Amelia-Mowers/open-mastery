import type { Rational } from './rational.ts'

export type CmpOp = '==' | '!=' | '<' | '<=' | '>' | '>='
export type BinOp = '+' | '-' | '*' | '/'

export type Expr =
  | { k: 'num'; v: Rational }
  | { k: 'var'; name: string }
  | { k: 'neg'; e: Expr }
  | { k: 'bin'; op: BinOp; l: Expr; r: Expr }
  | { k: 'cmp'; op: CmpOp; l: Expr; r: Expr }
  | { k: 'call'; fn: string; args: Expr[] }

/** The fixed function set of cairn-expr (§4.3a). Closed by design; there is no
 * mechanism for user-defined or host-injected functions. */
export const FUNCTIONS = ['frac', 'gcd', 'round', 'abs', 'min', 'max'] as const
export type FunctionName = (typeof FUNCTIONS)[number]

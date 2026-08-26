/** Total-evaluation result type used across cairn-expr. Nothing in the
 * expression layer throws on bad input; errors are values. */
export type ExprErrorCode =
  | 'syntax'
  | 'unknown_var'
  | 'unknown_fn'
  | 'arity'
  | 'type_error'
  | 'div_zero'
  | 'not_integer'
  | 'unsatisfiable'
  | 'cycle'
  | 'bad_constraint'

export interface ExprError {
  code: ExprErrorCode
  message: string
  /** character offset into the source, when known */
  pos?: number
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: ExprError }

export const ok = <T>(value: T): Result<T> => ({ ok: true, value })
export const err = (code: ExprErrorCode, message: string, pos?: number): Result<never> => ({
  ok: false,
  error: pos === undefined ? { code, message } : { code, message, pos },
})

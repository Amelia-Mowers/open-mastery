import type { ReactElement } from 'react'

/** How a widget is being asked to draw itself. Note 'faded' here is a
 * RENDER mode — the partly-worked preview — not a life phase; the 'faded'
 * PHASE was removed when stepwise made every problem a worked lead. */
export type WidgetMode = 'lesson' | 'faded' | 'problem' | 'review'

export interface TraceEvent {
  seq: number
  type: string
  data?: unknown
}

export interface WidgetInstance<P, A, V> {
  render(params: P, mode: WidgetMode): ReactElement
  extract(): A
  trace(): TraceEvent[]
  applyPatch(patch: Partial<V>): void
  readonly a11y: { role: string; label(params: P): string }
}

export type WidgetFactory<P, A, V, C> = (config: C) => WidgetInstance<P, A, V>

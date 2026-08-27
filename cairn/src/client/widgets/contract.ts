import type { ReactElement } from 'react'

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

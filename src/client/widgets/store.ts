import type { TraceEvent } from './contract'

// Minimal external store so extract()/applyPatch() work from outside React;
// render() components subscribe via useSyncExternalStore.
export class WidgetStore<S> {
  private listeners = new Set<() => void>()
  private traceEvents: TraceEvent[] = []
  private seq = 0

  constructor(private state: S) {}

  getState = (): S => this.state

  setState(partial: Partial<S>): void {
    this.state = { ...this.state, ...partial }
    this.listeners.forEach((l) => l())
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  record(type: string, data?: unknown): void {
    this.seq += 1
    this.traceEvents.push(data === undefined ? { seq: this.seq, type } : { seq: this.seq, type, data })
  }

  trace(): TraceEvent[] {
    return [...this.traceEvents]
  }
}

/** The widget zoo (?view=zoo): every explanation animation and answer input
 * on one page, for testing and debugging. Demos are SINGLE-SOURCED from the
 * curriculum (/api/demos — one canonical explanation per widget type), plus
 * clearly-labeled fallbacks for widgets the curriculum hasn't adopted yet.
 * Each demo autoplays; the handoff button replays it. */
import { useEffect, useState } from 'react'
import { LessonPlayer } from './LessonPlayer'
import { createWidget, WIDGET_ROLES, type WidgetType } from '../widgets/registry'
import { FALLBACK_DEMOS, type ZooDemo } from './zoo-demos'
import type { SiteApi } from './api'
import type { Params } from './render'

function roleBadge(widget: string): string {
  const r = WIDGET_ROLES[widget as WidgetType]
  if (!r) return ''
  return r.input ? 'roles: lesson · input' : 'roles: lesson (input planned)'
}

function DemoCard({ demo }: { demo: ZooDemo }) {
  const [replay, setReplay] = useState(0)
  return (
    <section className="card zoo-card">
      <div className="card-kicker">
        <span className="kicker">{demo.title.toUpperCase()}</span>
        <span className="mono-chip">{roleBadge(demo.widget)}</span>
        <span className="mono-chip">{JSON.stringify(demo.params)}</span>
      </div>
      <LessonPlayer
        key={replay}
        explanation={demo.explanation}
        params={demo.params}
        kind="walkthrough"
        embedded
        onDone={() => setReplay((r) => r + 1)}
      />
    </section>
  )
}

function InputCard({ title, type, config }: { title: string; type: string; config: Record<string, unknown> }) {
  const [widget] = useState(() => createWidget(type, config))
  const [extracted, setExtracted] = useState<string>('')
  return (
    <section className="card zoo-card">
      <div className="card-kicker">
        <span className="kicker">{title.toUpperCase()}</span>
        <span className="mono-chip">{JSON.stringify(config)}</span>
      </div>
      <div className="answer-row">
        {widget.render({} as never, 'problem')}
        <button className="btn" onClick={() => setExtracted(JSON.stringify(widget.extract()))}>
          Extract
        </button>
      </div>
      {extracted && <p className="mono-chip zoo-extract">{extracted}</p>}
    </section>
  )
}

/** every input-capable widget appears here with a sample config */
const INPUT_SAMPLES: Array<{ title: string; type: WidgetType; config: Record<string, unknown> }> = [
  { title: 'number-line (answer input)', type: 'number-line', config: { min: -4, max: 4, step: 2 } },
  { title: 'opposite-flip (answer input)', type: 'opposite-flip', config: { value: 2 } },
  { title: 'tape-diagram (fill a part)', type: 'tape-diagram', config: { parts: 4, total: 28, fill: 'part' } },
  { title: 'tape-diagram (fill the total)', type: 'tape-diagram', config: { parts: 7, partLabel: 6, fill: 'total' } },
  {
    title: 'double-number-line (fill the missing value)',
    type: 'double-number-line',
    config: { topLabel: 'pounds', bottomLabel: 'dollars', top: [0, 3, 7], bottom: [0, 12, '?'] },
  },
  {
    title: 'ratio-table (fill the missing cell)',
    type: 'ratio-table',
    config: { cols: ['cups', 'muffins'], rows: [[2, 12], [5, '?']] },
  },
  { title: 'numeric-input', type: 'numeric-input', config: { units: 'cm' } },
  { title: 'expression-input', type: 'equation-input', config: { variable: 'x' } },
]

export function Zoo({ api }: { api: SiteApi }) {
  const [demos, setDemos] = useState<ZooDemo[] | null>(null)
  useEffect(() => {
    void api.demos().then(({ demos: fromCurriculum }) => {
      const covered = new Set(fromCurriculum.map((d) => d.widget))
      setDemos([
        ...fromCurriculum.map((d) => ({
          title: `${d.widget} — ${d.skillName}`,
          widget: d.widget,
          params: d.params as Params,
          explanation: d.explanation,
        })),
        ...FALLBACK_DEMOS.filter((f) => !covered.has(f.widget)),
      ])
    })
  }, [api])

  return (
    <div>
      <section className="card">
        <h1 className="dash-h">Widget zoo</h1>
        <p className="muted">
          One canonical demo per widget, single-sourced from the curriculum (fallbacks only for
          widgets no explanation uses yet), plus every answer input. Demos autoplay; the end button
          replays. Reach this page with <code>?view=zoo</code>.
        </p>
      </section>
      {demos === null ? (
        <p className="muted loading">Loading…</p>
      ) : (
        demos.map((d) => <DemoCard key={d.explanation.id} demo={d} />)
      )}
      {INPUT_SAMPLES.map((c) => (
        <InputCard key={c.title} title={c.title} type={c.type} config={c.config} />
      ))}
    </div>
  )
}

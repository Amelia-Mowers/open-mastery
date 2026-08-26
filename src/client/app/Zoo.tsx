/** The widget zoo (?view=zoo): every explanation animation and answer input
 * on one page, for testing and debugging. Each demo autoplays; the handoff
 * button replays it. */
import { useState } from 'react'
import { LessonPlayer } from './LessonPlayer'
import { createWidget } from '../widgets/registry'
import { ZOO_DEMOS, type ZooDemo } from './zoo-demos'

function DemoCard({ demo }: { demo: ZooDemo }) {
  const [replay, setReplay] = useState(0)
  return (
    <section className="card zoo-card">
      <div className="card-kicker">
        <span className="kicker">{demo.title.toUpperCase()}</span>
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

export function Zoo() {
  return (
    <div>
      <section className="card">
        <h1 className="dash-h">Widget zoo</h1>
        <p className="muted">
          Every explanation animation and answer input, for testing and debugging. Demos autoplay;
          the end button replays. Reach this page with <code>?view=zoo</code>.
        </p>
      </section>
      {ZOO_DEMOS.map((d) => (
        <DemoCard key={d.explanation.id} demo={d} />
      ))}
      <InputCard
        title="number-line (answer input)"
        type="number-line"
        config={{ min: -4, max: 4, step: 2 }}
      />
      <InputCard title="numeric-input" type="numeric-input" config={{ units: 'cm' }} />
      <InputCard title="expression-input" type="equation-input" config={{ variable: 'x' }} />
    </div>
  )
}

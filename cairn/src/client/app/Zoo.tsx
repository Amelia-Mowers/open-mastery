/** The widget zoo (?view=zoo): every explanation animation and answer input
 * on one page, for testing and debugging. Demos are SINGLE-SOURCED from the
 * curriculum (/api/demos — one canonical explanation per widget type), plus
 * clearly-labeled fallbacks for widgets the curriculum hasn't adopted yet.
 * Each demo autoplays; the handoff button replays it. */
import { useEffect, useState } from 'react'
import { LessonPlayer } from './LessonPlayer'
import { createWidget, WIDGET_ROLES, type WidgetType } from '../widgets/registry'
import { FALLBACK_DEMOS, type ZooDemo } from './zoo-demos'
import type { CairnApi } from './api'
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
        <span
          className={`mono-chip ${demo.explanation.review.status === 'vetted' ? 'vet-ok' : 'vet-draft'}`}
          title={demo.explanation.review.status === 'vetted' ? 'human-vetted' : 'draft — not yet human-reviewed'}
        >
          {demo.explanation.review.status === 'vetted' ? '✓ vetted' : '◌ draft'}
        </span>
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
  {
    title: 'ratio-table (click the row that breaks the pattern)',
    type: 'ratio-table',
    config: {
      select: true,
      noneLabel: 'All rows agree',
      cols: ['x', 'y'],
      rows: [[2, 6], [5, 17], [8, 24]],
    },
  },
  {
    title: 'choice (pick one — order shuffles per instance)',
    type: 'choice',
    config: {
      seed: 'zoo',
      options: [
        { key: 'a', label: '4 pencils for $2 — 50¢ each' },
        { key: 'b', label: '7 pencils for $4.20 — 60¢ each' },
      ],
    },
  },
  { title: 'numeric-input', type: 'numeric-input', config: { units: 'cm' } },
  { title: 'expression-input', type: 'equation-input', config: { variable: 'x' } },
]

export function Zoo({ api }: { api: CairnApi }) {
  const only = (() => {
    try {
      return new URLSearchParams(window.location.search).get('exp')
    } catch {
      return null
    }
  })()
  const [demos, setDemos] = useState<ZooDemo[] | null>(null)
  const [index, setIndex] = useState<Record<string, Array<{ id: string; skillName: string; vetted: boolean }>>>({})
  useEffect(() => {
    if (only) {
      void api.demoFor(only).then((d) =>
        setDemos([
          {
            title: `${d.widget} — ${d.skillName}`,
            widget: d.widget,
            params: d.params as Params,
            explanation: d.explanation,
          },
        ]),
      )
      return
    }
    void api.demos().then(({ demos: fromCurriculum, index: byWidget }) => {
      setIndex(byWidget ?? {})
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
  }, [api, only])

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
        demos.map((d) => (
          <div key={d.explanation.id}>
            <DemoCard demo={d} />
            {(index[d.widget] ?? []).length > 1 && (
              <p className="muted zoo-index">
                every {d.widget} timeline:{' '}
                {(index[d.widget] ?? []).map((e) => (
                  <a
                    key={e.id}
                    href={`?view=zoo&exp=${encodeURIComponent(e.id)}`}
                    title={`${e.skillName} — ${e.vetted ? 'vetted' : 'draft, not yet human-reviewed'}`}
                  >
                    <span aria-hidden className={e.vetted ? 'vet-ok' : 'vet-draft'}>
                      {e.vetted ? '✓' : '◌'}
                    </span>{' '}
                    {e.id.replace(/^.*\.(exp-)/, '$1')} · {e.skillName}
                  </a>
                ))}
              </p>
            )}
          </div>
        ))
      )}
      {!only && INPUT_SAMPLES.map((c) => (
        <InputCard key={c.title} title={c.title} type={c.type} config={c.config} />
      ))}
    </div>
  )
}

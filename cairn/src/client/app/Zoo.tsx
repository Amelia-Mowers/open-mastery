/** The widget zoo (?view=zoo): every explanation animation and answer input
 * on one page, for testing and debugging. Demos are SINGLE-SOURCED from the
 * curriculum (/api/demos — one canonical explanation per widget type), plus
 * clearly-labeled fallbacks for widgets the curriculum hasn't adopted yet.
 * Each demo autoplays; the handoff button replays it. */
import { useEffect, useState } from 'react'
import { LessonPlayer } from './LessonPlayer'
import { StepwisePlayer, hasExpects } from './StepwisePlayer'
import { createWidget, WIDGET_ROLES, type WidgetType } from '../widgets/registry'
import { FALLBACK_DEMOS, type ZooDemo } from './zoo-demos'
import type { CairnApi } from './api'
import { evalNumber, renderText, type Params } from './render'
import { gradeAnswer } from '../../core/graders'

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
        <span className={demo.title.includes(' ') ? 'kicker' : 'kicker kicker-id'}>
          {demo.title.includes(' ') ? demo.title.toUpperCase() : demo.title}
        </span>
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

/** evaluate templated widget config against instance params (zoo mirror of
 * ItemCard's recursion) */
function evalConfig(config: Record<string, unknown>, params: Params): Record<string, unknown> {
  const deep = (v: unknown): unknown => {
    if (typeof v === 'string' && v.includes('{')) {
      const n = evalNumber(v, params)
      return n !== null ? n : renderText(v, params)
    }
    if (Array.isArray(v)) return v.map(deep)
    if (v !== null && typeof v === 'object')
      return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, deep(x)]))
    return v
  }
  const { stem: _stem, ...rest } = config
  return Object.fromEntries(Object.entries(rest).map(([k, v]) => [k, deep(v)]))
}

/** single-timeline view: the trinity's other two faces — the faded
 * "finish this one" phase (truncated lead + faded answer space, the item's
 * numbers) and the raw answer input, both from the representation-matched
 * item the server sends (key stripped). */
function TrinityCards({ demo }: { demo: ZooDemo }) {
  const item = demo.item
  const [replay, setReplay] = useState(0)
  const [extracted, setExtracted] = useState('')
  const [fadedWidget] = useState(() =>
    item ? createWidget(item.widget.type, evalConfig(item.widget.config ?? {}, item.params as Params)) : null,
  )
  const [inputWidget] = useState(() =>
    item ? createWidget(item.widget.type, evalConfig(item.widget.config ?? {}, item.params as Params)) : null,
  )
  // same truncation as ItemCard's faded lead: content steps minus the
  // resolution — the answer space below IS the resolution
  const content = demo.explanation.timeline.filter(
    (st) => st.patch !== undefined || st.caption !== undefined,
  )
  const truncated =
    content.length >= 2 ? { ...demo.explanation, timeline: content.slice(0, -1) } : null
  const stepwise = truncated !== null && hasExpects(truncated.timeline)
  const fadedParams = (item?.fadedParams ?? demo.params) as Params
  const noItem = !item || !fadedWidget || !inputWidget
  // the stepwise preview needs only the timeline; the faded/input previews
  // need a representation-matched item — absence is visible debt
  const debtNote = noItem ? (
    <section className="card zoo-card">
      <p className="zoo-note">
        No representation-matched item yet — the {stepwise ? 'answer-input preview needs' : 'faded ("finish this one") and answer-input previews need'} an
        item with <code>representation: {demo.explanation.representation}</code>.
      </p>
    </section>
  ) : null
  if (noItem && !stepwise) return debtNote
  return (
    <>
      {truncated && (stepwise || !noItem) && (
        <section className="card zoo-card">
          <div className="card-kicker">
            <span className="kicker">
              {stepwise ? 'STEPWISE — WORK IT MOVE BY MOVE' : 'FINISH THIS ONE — FADED PHASE'}
            </span>
            <span className="mono-chip">{JSON.stringify(fadedParams)}</span>
          </div>
          {stepwise ? (
            <>
              <StepwisePlayer key={replay} explanation={truncated} params={fadedParams} />
              {/* the answer box a real practice serve puts below the lead —
                  without it the preview stops at the handoff and the whole
                  point (does the lesson set up the answer?) is untestable */}
              <ZooAnswer demo={demo} params={fadedParams} />
            </>
          ) : (
            <LessonPlayer
              key={replay}
              explanation={truncated}
              params={fadedParams}
              kind="walkthrough"
              embedded
              tail="none"
              onDone={() => setReplay((r) => r + 1)}
            />
          )}
          {!stepwise && fadedWidget && (
            <div className="viz-answer">{fadedWidget.render({} as never, 'faded')}</div>
          )}
        </section>
      )}
      {debtNote}
      {item && inputWidget && (
      <section className="card zoo-card">
        <div className="card-kicker">
          <span className="kicker">PRACTICE PROBLEM — {item.widget.type.toUpperCase()}</span>
          <span className="mono-chip">{item.id}</span>
        </div>
        {typeof item.widget.config?.['stem'] === 'string' && (
          <h2 className="stem">{renderText(item.widget.config['stem'] as string, item.params as Params)}</h2>
        )}
        <div className="answer-row">
          {inputWidget.render({} as never, 'problem')}
          <button className="btn" onClick={() => setExtracted(JSON.stringify(inputWidget.extract()))}>
            Extract
          </button>
        </div>
        {extracted && <p className="mono-chip zoo-extract">{extracted}</p>}
        <AlternateInputs item={item} />
      </section>
      )}
    </>
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
export const INPUT_SAMPLES: Array<{ title: string; type: WidgetType; config: Record<string, unknown> }> = [
  {
    title: 'term-input (structured [ ]x + [ ], easier tiers)',
    type: 'term-input',
    config: { variable: 'x', stem: 'Expand: 3(2x + 5).' },
  },
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
  {
    title: 'balance-scale (enter the move — mirrored on both pans)',
    type: 'balance-scale',
    config: { left: '4x + 5', right: '33', entry: true },
  },
  {
    title: 'hanger-diagram (enter the move — mirrored on both sides)',
    type: 'hanger-diagram',
    config: { copies: 3, shapeLabel: 'x', weight: '21', entry: true },
  },
  {
    title: 'worked-equation (write the next line)',
    type: 'worked-equation',
    config: { lines: ['3x + 5 = 17', '3x = 12'], next: true },
  },
  {
    title: 'envelope-model (share the counters)',
    type: 'envelope-model',
    config: { envelopes: 4, counters: 28 },
  },
  {
    title: 'area-model (fill the missing piece of area)',
    type: 'area-model',
    config: { height: '3', parts: ['x', '2'], products: ['3x', '?'] },
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
            title: d.explanation.id,
            widget: d.widget,
            params: d.params as Params,
            explanation: d.explanation,
            item: d.item ?? null,
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
            {only && <TrinityCards demo={d} />}
            {(index[d.widget] ?? []).length > 0 && (
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
                    {/* the full id, not the display name: this list is for
                        REFERENCE — it is what you paste into shoot-steps,
                        grep for in the curriculum, or quote in a review */}
                    {e.id}
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

/** A working answer box for the zoo, so a timeline can be reviewed end to
 * end: play the stepwise lead, take the handoff, then answer. It grades
 * locally against the item's key (served only to this page) and says what
 * it got — the point is checking that the LESSON sets the answer up, so a
 * wrong verdict here is a curriculum finding, not a student's problem. */
function ZooAnswer({ demo, params }: { demo: ZooDemo; params: Params }) {
  const item = demo.item ?? null
  const [raw, setRaw] = useState('')
  const [verdict, setVerdict] = useState<null | { ok: boolean; says: string }>(null)
  if (!item?.answer) return null
  const check = (): void => {
    if (raw.trim() === '') return
    const spec = item.answer as unknown as Parameters<typeof gradeAnswer>[0]
    const v = gradeAnswer(spec, params as never, raw)
    setVerdict(
      v.verdict === 'correct'
        ? { ok: true, says: 'Correct — the lead sets this answer up.' }
        : { ok: false, says: v.verdict === 'incorrect' && v.reason ? v.reason : 'Not accepted.' },
    )
  }
  const key = (() => {
    const r = renderText(String((item.answer as { value: unknown }).value), params)
    return r
  })()
  return (
    <div className="zoo-answer">
      <div className="answer-row">
        <input
          aria-label="Answer"
          value={raw}
          placeholder="your answer"
          onChange={(e) => {
            setRaw(e.target.value)
            setVerdict(null)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') check()
          }}
        />
        <button className="btn btn-primary" onClick={check}>
          Check answer
        </button>
        <span className="muted zoo-answer-key">key: {key}</span>
      </div>
      {verdict && (
        <p className={verdict.ok ? 'zoo-verdict ok' : 'zoo-verdict bad'} role="status">
          {verdict.says}
        </p>
      )}
    </div>
  )
}

/** The SAME problem in every answer space it could use.
 *
 * A skill fades its input as it climbs — structured boxes at the easier
 * tiers, a raw expression at the ceiling — so a reviewer needs to compare
 * them side by side on one problem. The item card alone shows only the
 * widget that item happens to declare, which is how a newly built input
 * can look absent from the zoo entirely.
 */
function AlternateInputs({ item }: { item: NonNullable<ZooDemo['item']> }) {
  const params = item.params as Params
  const variable = typeof params['variable'] === 'string' ? params['variable'] : 'x'
  // every input this problem's answer could reasonably be given in
  const alts = (
    [
      { type: 'term-input', config: { variable }, note: 'structured — easier tiers' },
      { type: 'expression-input', config: { variable }, note: 'raw — the ceiling' },
      { type: 'numeric-input', config: {}, note: 'raw number' },
    ] as Array<{ type: WidgetType; config: Record<string, unknown>; note: string }>
  ).filter((a) => a.type !== item.widget.type)
  const [built] = useState(() =>
    alts.map((a) => {
      try {
        return { ...a, w: createWidget(a.type, a.config) }
      } catch {
        return null
      }
    }),
  )
  const live = built.filter((b) => b !== null)
  if (live.length === 0) return null
  return (
    <div className="zoo-alt-inputs">
      <p className="muted">the same answer in the other input styles:</p>
      {live.map((b) => (
        <div key={b!.type} className="zoo-alt-row">
          <span className="mono-chip">{b!.type}</span>
          <span className="muted">{b!.note}</span>
          <div className="answer-row">{b!.w.render({} as never, 'problem')}</div>
        </div>
      ))}
    </div>
  )
}

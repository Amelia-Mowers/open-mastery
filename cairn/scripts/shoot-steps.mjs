/** Screenshot EVERY STEP of a lesson timeline, not just its final frame.
 *
 * scripts/shoot-widgets.sh captures one image per explanation — the resting
 * state — which is exactly why mid-animation faults (arcs adrift, strokes
 * too thin, a value that never appears) kept reaching the user. This drives
 * the real widget through its patches, dumps each state into the demo build
 * so the app's own stylesheet applies, and shoots them in one strip.
 *
 * Usage: node scripts/shoot-steps.mjs <explanation-id> [out.png] [port]
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync, existsSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const [id, out = '/tmp/steps.png', port = '4895'] = process.argv.slice(2)
if (!id) {
  console.error('usage: node scripts/shoot-steps.mjs <explanation-id> [out.png] [port]')
  process.exit(1)
}

const dist = join(root, 'dist-demo')
if (!existsSync(dist)) {
  console.error('build the demo first: npm run build:demo')
  process.exit(1)
}
const css = readdirSync(join(dist, 'assets')).find((f) => f.endsWith('.css'))

// render every step through vitest (jsdom has the widgets; node does not)
const tmp = mkdtempSync(join(tmpdir(), 'steps-'))
const testFile = join(root, 'test', 'client', '_steps.test.tsx')
writeFileSync(
  testFile,
  `// @vitest-environment jsdom
import { it } from 'vitest'
import { render } from '@testing-library/react'
import { writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadBundleDir } from '@openmastery/schema/load'
import { buildIndex } from '../../src/core/curriculum'
import { practiceItems } from '../../src/core/select'
import { feedableParams } from '../../src/site/core'
import { createLessonWidget } from '../../src/client/app/LessonPlayer'
import { renderTemplate } from '@openmastery/schema'
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'curriculum')
it('steps', () => {
  const b = { skills: [], items: [], explanations: [], representations: [] }
  for (const d of ['skills', 'items', 'explanations', 'representations']) {
    const r = loadBundleDir(join(root, d))
    b.skills.push(...r.bundle.skills); b.items.push(...r.bundle.items); b.explanations.push(...r.bundle.explanations)
    b.representations.push(...(r.bundle.representations ?? []))
  }
  const cur = buildIndex(b)
  const e = cur.explanations.get(${JSON.stringify(id)})
  if (!e) throw new Error('unknown explanation ' + ${JSON.stringify(id)})
  // FEEDABLE item only, and fail loudly: the first item may be a different
  // family, and rendering its params paints raw {a*b} braces that look like
  // a real strip (the silent-fallback class)
  const params = feedableParams(e, practiceItems(e.skill, cur).map((it) => it.params))
  if (params === null) throw new Error('no item can feed ' + ${JSON.stringify(id)})
  const w = createLessonWidget(e, params)
  if (!w) throw new Error('widget did not build')
  const { container, rerender } = render(<>{w.element}</>)
  const frames = []
  const rt = (raw) => {
    if (!raw) return ''
    const r = renderTemplate(String(raw), params, { numberStyle: 'fraction' })
    return r.ok ? r.value : String(raw)
  }
  // the equation banner is student-visible ABOVE the widget — sticky
  // segments + highlights, exactly as the player derives them
  let eq = null
  let eqHl = []
  for (const st of e.timeline) {
    if (!st.patch) continue
    w.apply(st.patch)
    rerender(<>{w.element}</>)
    if (Array.isArray(st.patch.equation)) eq = st.patch.equation.map((seg) => rt(seg))
    if (Array.isArray(st.patch.eqHighlight)) eqHl = st.patch.eqHighlight.map(Number)
    // captions MUST go through the template engine, exactly as
    // LessonPlayer does (renderText). Dumping them raw made correct
    // lessons read as broken ("{a}·1 + {b}") in every review strip, and
    // would equally have hidden a real templating fault.
    const gate = st.expect
      ? {
          type: st.expect.type,
          prompt: rt(st.expect.prompt) || '(default prompt)',
          hint: rt(st.expect.hint),
        }
      : null
    frames.push({
      t: st.t,
      html: container.innerHTML,
      caption: rt(st.caption),
      eq: eq ? eq.map((seg, i) => ({ seg, hl: eqHl.includes(i) })) : null,
      gate,
    })
  }
  writeFileSync(${JSON.stringify(join(tmp, 'frames.json'))}, JSON.stringify(frames))
})
`,
)
try {
  execFileSync('npx', ['vitest', 'run', 'test/client/_steps.test.tsx'], { cwd: root, stdio: 'pipe' })
} finally {
  rmSync(testFile, { force: true })
}

const frames = JSON.parse(
  execFileSync('cat', [join(tmp, 'frames.json')], { encoding: 'utf8' }),
)
const page = `<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="./assets/${css}">
<body style="background:#f2ede4;margin:0;padding:18px;font-family:'Nunito Sans',sans-serif">
${frames
  .map(
    (f) => `<div style="background:#fffdf9;border:1px solid #e6ddd0;border-radius:12px;padding:16px;margin-bottom:14px">
  <div style="font:700 11px sans-serif;letter-spacing:.08em;color:#b05f28;margin-bottom:10px">t=${f.t}${f.gate ? ' · GATE (' + f.gate.type + ')' : ''}</div>
  ${f.eq ? '<div class="lesson-equation" style="margin-bottom:8px">' + f.eq.map((p) => '<span class="eq-seg' + (p.hl ? ' eq-hl' : '') + '">' + p.seg + '</span>').join('') + '</div>' : ''}
  <div style="max-width:520px;margin:0 auto">${f.html}</div>
  <p style="font:600 14px 'Lora',Georgia,serif;color:#5c5245;text-align:center;margin:14px 0 0">${f.caption}</p>
  ${f.gate ? '<p style="font:600 13.5px \'Lora\',Georgia,serif;color:#8a4d1d;text-align:center;background:#faf3e8;border:1.5px dashed #d8cdbb;border-radius:10px;padding:8px 12px;margin:10px auto 0;max-width:480px">? ' + f.gate.prompt + (f.gate.hint ? '<br><span style="color:#8b8070;font-size:12.5px">hint: ' + f.gate.hint + '</span>' : '') + '</p>' : ''}
</div>`,
  )
  .join('')}
</body>`
const pagePath = join(dist, '_steps.html')
writeFileSync(pagePath, page)

// a pinned store path gets garbage-collected; resolve a live one
import { globSync } from 'node:fs'
const CHROMIUM =
  process.env.CHROMIUM ??
  globSync('/nix/store/*chromium-*/bin/chromium').sort().at(-1) ??
  'chromium'
try {
  execFileSync(
    CHROMIUM,
    [
      '--headless',
      '--disable-gpu',
      `--window-size=600,${Math.min(14000, 200 + frames.length * 560)}`,
      '--virtual-time-budget=25000',
      '--run-all-compositor-stages-before-draw',
      `--screenshot=${out}`,
      `http://127.0.0.1:${port}/_steps.html`,
    ],
    { stdio: 'pipe' },
  )
  console.log(`${frames.length} steps → ${out}`)
} finally {
  rmSync(pagePath, { force: true })
  rmSync(tmp, { recursive: true, force: true })
}

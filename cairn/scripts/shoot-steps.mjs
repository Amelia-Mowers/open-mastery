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
import { createLessonWidget } from '../../src/client/app/LessonPlayer'
import { renderTemplate } from '@openmastery/schema'
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'curriculum')
it('steps', () => {
  const b = { skills: [], items: [], explanations: [] }
  for (const d of ['skills', 'items', 'explanations']) {
    const r = loadBundleDir(join(root, d))
    b.skills.push(...r.bundle.skills); b.items.push(...r.bundle.items); b.explanations.push(...r.bundle.explanations)
  }
  const cur = buildIndex(b)
  const e = cur.explanations.get(${JSON.stringify(id)})
  if (!e) throw new Error('unknown explanation ' + ${JSON.stringify(id)})
  const params = practiceItems(e.skill, cur)[0]?.params ?? {}
  const w = createLessonWidget(e, params)
  if (!w) throw new Error('widget did not build')
  const { container, rerender } = render(<>{w.element}</>)
  const frames = []
  for (const st of e.timeline) {
    if (!st.patch) continue
    w.apply(st.patch)
    rerender(<>{w.element}</>)
    // captions MUST go through the template engine, exactly as
    // LessonPlayer does (renderText). Dumping them raw made correct
    // lessons read as broken ("{a}·1 + {b}") in every review strip, and
    // would equally have hidden a real templating fault.
    const raw = st.caption ?? ''
    const r = raw ? renderTemplate(raw, params, { numberStyle: 'fraction' }) : null
    frames.push({ t: st.t, html: container.innerHTML, caption: r?.ok ? r.value : raw })
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
  <div style="font:700 11px sans-serif;letter-spacing:.08em;color:#b05f28;margin-bottom:10px">t=${f.t}</div>
  <div style="max-width:520px;margin:0 auto">${f.html}</div>
  <p style="font:600 14px 'Lora',Georgia,serif;color:#5c5245;text-align:center;margin:14px 0 0">${f.caption}</p>
</div>`,
  )
  .join('')}
</body>`
const pagePath = join(dist, '_steps.html')
writeFileSync(pagePath, page)

const CHROMIUM =
  process.env.CHROMIUM ??
  '/nix/store/cyw9j7gm65p1768q6vhaax20jlkvpb27-chromium-149.0.7827.114/bin/chromium'
try {
  execFileSync(
    CHROMIUM,
    [
      '--headless',
      '--disable-gpu',
      `--window-size=600,${Math.min(4000, 150 + frames.length * 270)}`,
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

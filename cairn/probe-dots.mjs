import { WebSocket } from 'ws'
import { execFile } from 'node:child_process'
const chrome = (await import('node:child_process')).execSync("ls -d /nix/store/*chromium-*/bin/chromium | sort | tail -1").toString().trim()
const proc = execFile(chrome, ['--headless=new', '--disable-gpu', '--remote-debugging-port=9335', '--no-first-run', '--autoplay-policy=no-user-gesture-required', 'about:blank'])
await new Promise(r => setTimeout(r, 1500))
const list = await (await fetch('http://127.0.0.1:9335/json')).json()
const page = list.find(t => t.type === 'page' && !t.url.startsWith('chrome-extension'))
const ws = new WebSocket(page.webSocketDebuggerUrl, { perMessageDeflate: false })
await new Promise(r => ws.on('open', r))
let id = 0; const pend = new Map()
const send = (m, p = {}) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })) })
ws.on('message', d => { const m = JSON.parse(d.toString()); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id) } })
await send('Page.enable')
await send('Page.navigate', { url: 'http://localhost:4895/?student=dots&view=zoo&exp=g7.rp.constant-k.exp-worked' })
await new Promise(r => setTimeout(r, 3500))
const ev = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true })).result.value
console.log('dots:', await ev(`[...document.querySelectorAll('[aria-label^="Go to intro"]')].length`))
for (let i = 1; i <= 5; i++) {
  const r = await ev(`(() => { const b=[...document.querySelectorAll('[aria-label^="Go to intro ${i} of"]')][0]; if(!b) return null; b.click(); return true })()`)
  if (!r) break
  await new Promise(r2 => setTimeout(r2, 700))
  console.log(`dot ${i}:`, JSON.stringify(await ev(`document.querySelector('[data-testid="lesson-caption"]')?.textContent?.slice(0,90)`)))
}
proc.kill(); process.exit(0)

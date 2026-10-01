/* Screenshot pada tiap beat showcase + beberapa posisi scroll statis. */
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9382;
const OUT = new URL('./shots/beats/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const profile = mkdtempSync(join(tmpdir(), 'gcr-b-'));
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`, '--no-first-run', '--disable-gpu', '--hide-scrollbars',
  '--window-size=1440,900', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(2600);
const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const ws = new WebSocket(list.find((t) => t.type === 'page').webSocketDebuggerUrl);
let id = 0; const pend = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); } };
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
await new Promise((r) => (ws.onopen = r));
await send('Page.enable'); await send('Runtime.enable');
const ev = async (e) => (await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true })).result?.value;
const shot = async (name) => {
  const s = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(OUT, name + '.png'), Buffer.from(s.data, 'base64'));
};

await send('Page.navigate', { url: 'http://localhost:8899/index.html' });
await sleep(4000);

const st = await ev(`(()=>{const s=ScrollTrigger.getById('showcaseST');return {start:s.start,end:s.end};})()`);
console.log('showcase range:', st.start, '->', st.end);

// scroll ke tengah tiap beat
for (let i = 0; i < 5; i++) {
  const p = (i + 0.5) / 5;
  const y = Math.round(st.start + (st.end - st.start) * p);
  await ev(`window.scrollTo(0, ${y})`);
  await sleep(2200);
  const info = await ev(`
    (()=>({beat:document.querySelector('.beat.is-active')?.dataset.beat,
      phoneOp:getComputedStyle(document.getElementById('phone')).opacity,
      stars:document.querySelectorAll('#phStars .ph-star.is-lit').length,
      view:document.querySelector('.phone__view.is-active')?.dataset.view,
      lit:document.querySelectorAll('#showcaseTitle .word__i.is-lit').length}))()`);
  console.log('beat', i, JSON.stringify(info));
  await shot('beat-' + i);
}

// sekitar posisi statistik / harga
for (const [name, sel] of [['statistik', '.stats'], ['testimoni', '#testimoni'], ['harga', '#harga'], ['faq', '#faq'], ['closing', '.closing']]) {
  await ev(`document.querySelector('${sel}').scrollIntoView({block:'start'})`);
  await sleep(2400);
  await shot(name);
}
console.log('selesai');
chrome.kill(); process.exit(0);

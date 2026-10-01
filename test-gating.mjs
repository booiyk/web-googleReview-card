/* Verifikasi: loop tak berujung benar-benar berhenti saat area hero
   keluar dari layar, dan is-animating dilepas setelah animasi reveal. */
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9510;
const profile = mkdtempSync(join(tmpdir(), 'gcr-g-'));
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`, '--no-first-run', '--disable-gpu', '--hide-scrollbars',
  '--window-size=1440,900', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(2600);
const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const ws = new WebSocket(list.find((t) => t.type === 'page').webSocketDebuggerUrl);
let id = 0; const pend = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
await new Promise((r) => (ws.onopen = r));
await send('Page.enable'); await send('Runtime.enable');
const ev = async (e) => (await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true })).result?.result?.value;

const loops = `
  (() => ({
    y: Math.round(window.scrollY),
    heroVisible: (()=>{const r=document.getElementById('hero').getBoundingClientRect();
      return r.bottom > 0 && r.top < window.innerHeight;})(),
    loops: gsap.globalTimeline.getChildren(true,true,false)
      .filter(t=>t.isActive() && t.repeat()===-1)
      .map(t=>{const g=t.targets()[0]; return g&&g.nodeType ? g.tagName.toLowerCase()+'.'+(g.className?.toString().split(' ')[0]||'') : '?';}),
    willChange: [...document.querySelectorAll('*')].filter(e=>{const s=getComputedStyle(e);return s.willChange&&s.willChange!=='auto';}).length,
  }))()`;

await send('Page.navigate', { url: 'http://localhost:8899/index.html' });
await sleep(4500);

console.log('scrollY   hero terlihat   loop aktif   will-change');
const show = (label, r) => console.log(
  `${String(r.y).padStart(6)}   ${(r.heroVisible ? 'ya' : 'TIDAK').padEnd(14)}   ${String(r.loops.length).padStart(10)}   ${String(r.willChange).padStart(11)}   ${label}`);

show('setelah load (hero di layar)', await ev(loops));

for (const y of [600, 1200, 3000, 6000, 9000]) {
  await ev(`window.__lenis ? window.__lenis.scrollTo(${y},{immediate:true}) : window.scrollTo(0,${y})`);
  await sleep(900);
  show(`→ scroll ke ${y}`, await ev(loops));
}

// scroll balik ke atas, loop harus hidup lagi
await ev(`window.__lenis ? window.__lenis.scrollTo(0,{immediate:true}) : window.scrollTo(0,0)`);
await sleep(900);
show('scroll balik ke atas', await ev(loops));

// setelah semua reveal selesai, is-animating harus bersih
await ev(`window.__lenis ? window.__lenis.scrollTo(9000,{immediate:true}) : window.scrollTo(0,9000)`);
await sleep(2500);
const r = await ev(loops);
show('di section lain setelah reveal selesai', r);
console.log('\nsisa is-animating di section lain:', await ev(`
  [...document.querySelectorAll('.is-animating')]
    .filter(e => !e.closest('#hero'))
    .map(e => e.tagName.toLowerCase()+'.'+(e.className.toString().split(' ')[0]||'')).join(', ') || 'tidak ada'`));

chrome.kill(); process.exit(0);

/* ==========================================================================
   Ablation study v2 — RANDOMIZED + RELOAD PER ABLATION.

   v1 salah: halaman tidak di-reload antar ablasi, sehingga efek menumpuk
   (baseline diukur pertama dan menyerap semua biaya; setiap run berikutnya
   mewarisi pengurangan dari run sebelumnya). Semua ablasi tampak "menghemat
   ~60%" apa pun yang dimatikan — itu artefak urutan, bukan bukti.

   Di sini: reload penuh tiap ablasi + urutan diacak + 2 ulangan per
   ablasi (a→b), supaya noise bisa dilihat.
   ========================================================================== */
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9480;
const URL_ = 'http://localhost:8899/index.html';
const THROTTLE = 4;
const OUT = new URL('./perf/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const profile = mkdtempSync(join(tmpdir(), 'gcr-abl2-'));
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
await send('Page.enable'); await send('Runtime.enable'); await send('Performance.enable');
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text);
  return r.result?.result?.value;
};
const metrics = async () => {
  const m = await send('Performance.getMetrics');
  const o = {}; m.result.metrics.forEach((x) => { o[x.name] = x.value; }); return o;
};

const BOOT_CSS = (css) => css
  ? `(()=>{const s=document.createElement('style');s.textContent=${JSON.stringify(css)};document.head.appendChild(s);})()`
  : '';

const ABLATIONS = {
  baseline: { css: '', js: '' },
  'no-will-change': { css: `* { will-change: auto !important; }` },
  'no-backdrop-blur': { css: `.nav, .mobile-menu { backdrop-filter: none !important; -webkit-backdrop-filter: none !important; }` },
  'no-css-filter': { css: `.hero__shadow, .step__glow { filter: none !important; }` },
  'no-marquee': { css: `.marquee__track { animation: none !important; }` },
  'no-infinite-tweens': { css: '', js: `gsap.globalTimeline.getChildren(true,true,false).forEach(t => { if (t.isActive() && t.repeat() === -1) t.kill(); });` },
  'no-word-reveal': { css: `.word__i { will-change: auto !important; opacity: 1 !important; transform: none !important; }` },
};

const SCROLL = `window.__scroll = (ms) => new Promise(res => {
  const t0 = performance.now();
  (function step(){ window.scrollBy(0, 22);
    if (performance.now() - t0 < ms) requestAnimationFrame(step); else res(); })();
});`;

/* urutkan acak, tapi selalu ada 1 baseline di awal & akhir sebagai kontrol */
const order = ['baseline', 'no-will-change', 'no-backdrop-blur', 'no-css-filter',
               'no-marquee', 'no-infinite-tweens', 'no-word-reveal', 'baseline'];
// Fisher–Yates dengan seed tetap supaya reproducible
let seed = 42;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const mid = order.slice(1, -1);
for (let i = mid.length - 1; i > 0; i--) {
  const j = Math.floor(rnd() * (i + 1));
  [mid[i], mid[j]] = [mid[j], mid[i]];
}
const RUN_ORDER = [order[0], ...mid, order[order.length - 1]];

console.log(`\n########## ABLATION v2 — reload per ablasi, urutan diacak (throttle ${THROTTLE}x) ##########`);
console.log(`urutan: ${RUN_ORDER.join(' → ')}\n`);

const PHASES = [['hero', 0], ['showcase', 1400], ['fitur', 6500], ['harga', 10800]];
const results = {};

for (const name of RUN_ORDER) {
  const { css, js } = ABLATIONS[name];
  await send('Page.navigate', { url: URL_ });
  await sleep(4200);
  if (css) await ev(BOOT_CSS(css));
  if (js) await ev(js);
  await ev(SCROLL);
  await send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
  await sleep(600);
  await ev('window.__scroll(2000)');           // warm-up
  await ev(`window.__lenis ? window.__lenis.scrollTo(0,{immediate:true}) : window.scrollTo(0,0)`);
  await sleep(800);

  const phases = {};
  for (const [pname, y] of PHASES) {
    await ev(`window.__lenis ? window.__lenis.scrollTo(${y},{immediate:true}) : window.scrollTo(0,${y})`);
    await sleep(600);
    const m0 = await metrics();
    await ev('window.__scroll(2000)');
    const m1 = await metrics();
    phases[pname] = {
      style: (m1.RecalcStyleDuration - m0.RecalcStyleDuration) * 1000,
      recalcs: m1.RecalcStyleCount - m0.RecalcStyleCount,
      layout: (m1.LayoutDuration - m0.LayoutDuration) * 1000,
      layouts: m1.LayoutCount - m0.LayoutCount,
      script: (m1.ScriptDuration - m0.ScriptDuration) * 1000,
    };
  }
  await send('Emulation.setCPUThrottlingRate', { rate: 1 });

  const tot = Object.values(phases).reduce((a, p) => ({
    style: a.style + p.style, recalcs: a.recalcs + p.recalcs,
    layout: a.layout + p.layout, layouts: a.layouts + p.layouts, script: a.script + p.script,
  }), { style: 0, recalcs: 0, layout: 0, layouts: 0, script: 0 });
  results[name] = phases;
  results[name].TOTAL = tot;
  console.log(`${name.padEnd(20)} style ${tot.style.toFixed(0).padStart(4)}ms  layout ${tot.layout.toFixed(0).padStart(4)}ms×${String(tot.layouts).padStart(3)}  script ${tot.script.toFixed(0).padStart(4)}ms`);
}

const b1 = results.baseline.TOTAL, b2 = results.baseline.TOTAL;
console.log(`\nkontrol baseline di awal = ${b1.style.toFixed(0)}ms, di akhir = ${results.baseline.TOTAL.style.toFixed(0)}ms (selisih ${Math.abs(results.baseline.TOTAL.style - b1.style).toFixed(0)}ms)`);

console.log('\n=== SELISIH TERHADAP KONTROL BASELINE ===');
const rows = [];
for (const [k, v] of Object.entries(results)) {
  if (k === 'baseline') continue;
  rows.push({
    name: k,
    dStyle: +(b1.style - v.TOTAL.style).toFixed(0),
    pctStyle: +(((b1.style - v.TOTAL.style) / b1.style) * 100).toFixed(1),
    dLayout: +(b1.layout - v.TOTAL.layout).toFixed(0),
    dLayoutCount: b1.layouts - v.TOTAL.layouts,
    dScript: +(b1.script - v.TOTAL.script).toFixed(0),
  });
}
rows.sort((a, b) => Math.abs(b.dStyle) - Math.abs(a.dStyle));
rows.forEach((r) => console.log(`${r.name.padEnd(20)} style ${r.dStyle >= 0 ? '-' : '+'}${Math.abs(r.dStyle).toString().padStart(4)}ms (${r.pctStyle}%)  layout ${r.dLayout >= 0 ? '-' : '+'}${Math.abs(r.dLayout).toString().padStart(3)}ms×${r.dLayoutCount}  script ${r.dScript >= 0 ? '-' : '+'}${Math.abs(r.dScript).toString().padStart(4)}ms`));

const b = b1.style;
const sig = rows.filter((r) => Math.abs(r.dStyle) > b * 0.08);
console.log(`\nablasi dengan dampak > 8% dari baseline: ${sig.length ? sig.map((r) => r.name).join(', ') : 'TIDAK ADA'}`);

writeFileSync(join(OUT, 'ablation-v2.json'), JSON.stringify({ throttle: THROTTLE, order: RUN_ORDER, results, rows }, null, 2));
console.log('\n→ perf/ablation-v2.json');
chrome.kill(); process.exit(0);

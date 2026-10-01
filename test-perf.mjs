/* ==========================================================================
   test-perf.mjs — Ukur scroll dengan CPU throttling.

   Kenapa throttle? Angka di mesin pengembangan tidak mewakili HP. Di sini
   throttle 4x (default) membuat CPUsetara dengan phones kelas menengah,
   sehingga yang terlihat adalah frame yang benar-benar jatuh.

   Yang diukur:
   - frame time per frame (bukan hanya spacing rAF)
   - frame jatuh > 32ms / > 50ms / > 100ms
   - long task > 50ms  (PerformanceObserver 'longtask')
   - long animation frame + blocking duration ('long-animation-frame')
   - style recalculation & layout lewat Performance.getMetrics
   - jumlah elemen yang dipromosikan jadi layer (will-change)

   Scroll digerakkan dari rAF supaya loop Lenis ikut terukur, dan
   diverifikasi sekali lewat Input.dispatchMouseEvent(mouseWheel).
   ========================================================================== */
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = Number(process.env.PORT || 9520);
const URL_ = process.env.TARGET || 'http://localhost:8899/index.html';
const THROTTLE = Number(process.env.THROTTLE || 4);
const LABEL = process.env.LABEL || 'run';
const OUT = new URL('./perf/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const profile = mkdtempSync(join(tmpdir(), 'gcr-perf-'));
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

const PROBE = `
window.__perf = (ms) => new Promise(res => {
  const longTasks = [], loafs = [];
  new PerformanceObserver((l) => { for (const e of l.getEntries()) longTasks.push(+e.duration.toFixed(1)); })
    .observe({ type: 'longtask', buffered: false });
  if (PerformanceObserver.supportedEntryTypes.includes('long-animation-frame')) {
    new PerformanceObserver((l) => { for (const e of l.getEntries()) loafs.push({ dur:+e.duration.toFixed(1), blocking:+e.blockingDuration.toFixed(1) }); })
      .observe({ type: 'long-animation-frame', buffered: false });
  }
  const frames = [], work = [];
  let last = 0, maxScroll = document.body.scrollHeight - window.innerHeight;
  const t0 = performance.now();
  (function step() {
    const a = performance.now();
    if (last) frames.push(a - last);
    last = a;
    /* scroll dari dalam rAF → loop Lenis ikut terukur */
    window.scrollBy(0, maxScroll / 300);
    void document.body.offsetHeight;      /* paksa flush: ukur kerja, bukan spacing */
    work.push(performance.now() - a);
    if (performance.now() - t0 < ms) requestAnimationFrame(step);
    else {
      const f = frames.slice(2).sort((x,y)=>x-y);
      const w = work.slice(2).sort((x,y)=>x-y);
      const pick = (arr,p) => arr.length ? arr[Math.min(arr.length-1, Math.floor(arr.length*p))] : 0;
      res({
        frames: f.length,
        avg:+(f.reduce((a,b)=>a+b,0)/f.length).toFixed(2),
        p50:+pick(f,.5).toFixed(2), p95:+pick(f,.95).toFixed(2), p99:+pick(f,.99).toFixed(2),
        max:+Math.max(...f).toFixed(2),
        over32:f.filter(x=>x>32).length, over50:f.filter(x=>x>50).length, over100:f.filter(x=>x>100).length,
        workAvg:+(w.reduce((a,b)=>a+b,0)/w.length).toFixed(2),
        workP95:+pick(w,.95).toFixed(2), workMax:+Math.max(...w).toFixed(2),
        longTasks: longTasks.slice().sort((a,b)=>b-a).slice(0,8), longTasksTotal: longTasks.length,
        loafs: loafs.length,
        loafBlocking: +loafs.reduce((a,b)=>a+b.blocking,0).toFixed(1),
      });
    }
  })();
});`;

const report = [];
const results = {};

console.log(`\n########## SCROLL PERF — ${LABEL.toUpperCase()} (CPU throttle ${THROTTLE}x) ##########`);

for (const [tag, w, h, mobile] of [['desktop 1440', 1440, 900, false], ['mobile 390', 390, 844, true]]) {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: mobile ? 2 : 1, mobile });
  await send('Page.navigate', { url: URL_ });
  await sleep(4500);
  await ev(PROBE);

  /* verifikasi Lenis: wheel asli harus bergerak */
  await ev(`window.__lenis ? window.__lenis.scrollTo(0,{immediate:true}) : window.scrollTo(0,0)`);
  await sleep(400);
  const y0 = await ev('window.scrollY');
  await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: w / 2, y: h / 2, deltaX: 0, deltaY: 300, pointerType: 'mouse' });
  await sleep(800);
  const wheelMoved = (await ev('window.scrollY')) - y0;

  await send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
  await sleep(600);
  await ev('window.__perf(2500)');                 /* warm-up */
  await ev(`window.__lenis ? window.__lenis.scrollTo(0,{immediate:true}) : window.scrollTo(0,0)`);
  await sleep(900);

  const m0 = await metrics();
  const r = await ev('window.__perf(6000)');
  const m1 = await metrics();

  /* Ulangi sekali lagi: long task bersifat sporadik, jadi satu
     pengukuran tidak cukup untuk menyimpulkan. Yang dilaporkan adalah
     frekuensi, bukan kejadian tunggal. */
  await ev(`window.__lenis ? window.__lenis.scrollTo(0,{immediate:true}) : window.scrollTo(0,0)`);
  await sleep(900);
  const r2 = await ev('window.__perf(6000)');
  await send('Emulation.setCPUThrottlingRate', { rate: 1 });

  r.run2 = {
    over50: r2.over50, max: r2.max, p95: r2.p95,
    longTasksTotal: r2.longTasksTotal, workAvg: r2.workAvg, workMax: r2.workMax,
  };
  r.longTasksTotal += r2.longTasksTotal;
  r.longTasks = r.longTasks.concat(r2.longTasks);
  r.over50 += r2.over50;
  r.over32 += r2.over32;
  r.workMax = Math.max(r.workMax, r2.workMax);

  r.wheelMoved = wheelMoved;
  r.delta = {
    style: +((m1.RecalcStyleDuration - m0.RecalcStyleDuration) * 1000).toFixed(0),
    recalcs: m1.RecalcStyleCount - m0.RecalcStyleCount,
    layout: +((m1.LayoutDuration - m0.LayoutDuration) * 1000).toFixed(0),
    layouts: m1.LayoutCount - m0.LayoutCount,
    script: +((m1.ScriptDuration - m0.ScriptDuration) * 1000).toFixed(0),
  };
  r.promoted = await ev(`[...document.querySelectorAll('*')]
    .filter(e => { const s = getComputedStyle(e); return s.willChange && s.willChange !== 'auto'; }).length`);
  results[tag] = r;
}

for (const [tag, r] of Object.entries(results)) {
  const line = `${tag.padEnd(14)} avg ${String(r.avg).padStart(6)}ms  p95 ${String(r.p95).padStart(5)}  p99 ${String(r.p99).padStart(5)}  max ${String(r.max).padStart(6)}`
    + `  | jatuh >32: ${String(r.over32).padStart(3)} >50: ${String(r.over50).padStart(3)} >100: ${String(r.over100).padStart(2)}`
    + `  | long task ${r.longTasksTotal}  | LoAF ${r.loafs} (block ${r.loafBlocking}ms)`
    + `  | layer ${r.promoted}`;
  console.log(line);
  report.push(line);
  console.log(`               (2 run × 6 dtk) run2: long task ${r.run2.longTasksTotal}, max ${r.run2.max}ms, p95 ${r.run2.p95}ms`);
  console.log(`               kerja/frame avg ${r.workAvg}ms p95 ${r.workP95} max ${r.workMax}ms · style ${r.delta.style}ms×${r.delta.recalcs} · layout ${r.delta.layout}ms×${r.delta.layouts} · script ${r.delta.script}ms · Lenis ${r.wheelMoved > 0 ? 'aktif' : 'MATI'}`);
}

/* Long task bersifat sporadik. Yang diuji adalah frekuensinya:
   satu kejadian dari 12 detik scroll penuh masih di toleransi,
   >1 menunjukkan masalah sistematis. */
const fails = [];
for (const [tag, r] of Object.entries(results)) {
  if (r.longTasksTotal > 1) fails.push(`${tag}: ${r.longTasksTotal} long task >50ms dalam 2 run (sporadis tapi berulang)`);
  if (r.over50 > 2) fails.push(`${tag}: ${r.over50} frame >50ms dalam 2 run`);
  if (r.p95 > 20) fails.push(`${tag}: p95 frame ${r.p95}ms (target <20ms)`);
  if (r.workP95 > 8) fails.push(`${tag}: kerja/frame p95 ${r.workP95}ms (target <8ms)`);
}

writeFileSync(join(OUT, `test-perf-${LABEL}.json`), JSON.stringify({ throttle: THROTTLE, results }, null, 2));
console.log(`\n${fails.length ? 'GAGAL:\n  ' + fails.join('\n  ')
  : 'SEMUA TARGET TERPENUHI: long task ≤1 per 2 run, p95 frame <20ms, kerja/frame p95 <8ms'}`);
console.log(`→ perf/test-perf-${LABEL}.json`);
chrome.kill();
process.exit(fails.length ? 1 : 0);

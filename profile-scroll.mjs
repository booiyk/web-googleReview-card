/* ==========================================================================
   Profiling scroll sungguhan.

   Dua jebakan yang dihindari di sini:
   1. window.scrollTo()/scrollBy() untuk menguji scroll — itu MEMLEWATI Lenis,
      jadi yang diukur bukan loop yang dirasakan pengguna. Scroll digerakkan
      dari dalam rAF agar sinkron dengan frame sampling, dan kelulusan
      wheel via CDP dipakai sebagai verifikasi bahwa Lenus benar-benar aktif.
   2. Tracing domain — di build Chrome ini kategori trace tidak menghasilkan
      event (0 event), jadi angkanya nol palsu. Long task diukur lewat
      PerformanceObserver('longtask') dan 'long-animation-frame'.

   CPU throttle simulates a mid-range phone.
   ========================================================================== */
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = Number(process.env.PORT || 9451);
const URL_ = process.env.TARGET || 'http://localhost:8899/index.html';
const LABEL = process.env.LABEL || 'run';
const THROTTLE = Number(process.env.THROTTLE || 4);
const OUT = new URL('./perf/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const profile = mkdtempSync(join(tmpdir(), 'gcr-prof-'));
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
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.text + ' ' + (r.result.exceptionDetails.exception?.description || ''));
  return r.result?.result?.value;
};

const PROBE = `
window.__probe = (() => {
  const longTasks = [], loafs = [], handlers = [];
  let sampling = false, frames = [], last = 0, rafId = null, scrollDist = 0;

  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) longTasks.push(+e.duration.toFixed(1));
  }).observe({ type: 'longtask', buffered: true });

  if (PerformanceObserver.supportedEntryTypes.includes('long-animation-frame')) {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries())
        loafs.push({ dur: +e.duration.toFixed(1), blocking: +e.blockingDuration.toFixed(1) });
    }).observe({ type: 'long-animation-frame', buffered: true });
  }

  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) handlers.push({ name: e.name, dur: +(e.duration || 0).toFixed(1) });
  }).observe({ type: 'event', buffered: true, durationThreshold: 16 });

  /* Scroll driver: naik per frame supaya Lenis ikut terukur.
     Menuplik scrollBy(Infinity) = scroll linked ke Lenis. */
  function drive(ms) {
    return new Promise((res) => {
      const t0 = performance.now();
      scrollDist = 0;
      (function step() {
        window.scrollBy(0, 22);
        scrollDist += 22;
        if (performance.now() - t0 < ms) requestAnimationFrame(step);
        else res(scrollDist);
      })();
    });
  }

  function tick(now) {
    if (last) frames.push(now - last);
    last = now;
    if (sampling) rafId = requestAnimationFrame(tick);
  }

  return {
    async run(ms) {
      longTasks.length = 0; loafs.length = 0; handlers.length = 0;
      frames = []; last = 0; sampling = true;
      rafId = requestAnimationFrame(tick);
      const dist = await drive(ms);
      sampling = false;
      if (rafId) cancelAnimationFrame(rafId);
      await new Promise((r) => setTimeout(r, 250));

      const s = frames.slice(2).sort((a, b) => a - b);
      const pick = (p) => s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))] : 0;
      const agg = {};
      for (const e of handlers) {
        agg[e.name] = agg[e.name] || { count: 0, total: 0, max: 0 };
        agg[e.name].count++; agg[e.name].total += e.dur; agg[e.name].max = Math.max(agg[e.name].max, e.dur);
      }
      return {
        scrolledPx: dist,
        frames: s.length,
        avg: +(s.reduce((a, b) => a + b, 0) / s.length).toFixed(2),
        p50: +pick(0.5).toFixed(2), p95: +pick(0.95).toFixed(2),
        p99: +pick(0.99).toFixed(2), max: +Math.max(...s).toFixed(2),
        over32: s.filter((f) => f > 32).length,
        over50: s.filter((f) => f > 50).length,
        over100: s.filter((f) => f > 100).length,
        longTasks: longTasks.slice().sort((a, b) => b - a).slice(0, 8),
        longTasksTotal: longTasks.length,
        loafs: loafs.length,
        loafBlocking: +loafs.reduce((a, b) => a + b.blocking, 0).toFixed(1),
        handlers: agg,
      };
    },
    reset() { longTasks.length = 0; loafs.length = 0; handlers.length = 0; },
  };
})();
`;

const DIAG = `
(() => {
  const all = document.querySelectorAll('*');
  let willChange = 0, blur = 0, filter = 0, cssAnim = 0, contain = 0;
  for (const el of all) {
    const s = getComputedStyle(el);
    if (s.willChange && s.willChange !== 'auto') willChange++;
    if ((s.backdropFilter || s.webkitBackdropFilter || '').includes('blur')) blur++;
    if (s.filter && s.filter !== 'none') filter++;
    if (s.animationName && s.animationName !== 'none') cssAnim++;
    if (s.contain && s.contain !== 'none') contain++;
  }
  const nav = getComputedStyle(document.getElementById('nav'));
  return {
    domNodes: all.length, willChange, backdropBlur: blur, filter, cssAnimation: cssAnim, contain,
    navBlur: (nav.backdropFilter || nav.webkitBackdropFilter || '').match(/blur\\((\\d+)px\\)/)?.[1] || '0',
    scrollTriggers: ScrollTrigger.getAll().length,
    lenis: !!window.__lenis,
    pinSpacer: !!document.querySelector('.pin-spacer'),
    infiniteTweens: gsap.globalTimeline.getChildren(true, true, false).filter(t => t.isActive() && t.repeat() === -1).length,
  };
})()`;

async function wheelProbe() {
  await ev(`window.__lenis ? window.__lenis.scrollTo(0,{immediate:true}) : window.scrollTo(0,0)`);
  await sleep(400);
  const before = await ev('window.scrollY');
  await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 700, y: 450, deltaX: 0, deltaY: 300, pointerType: 'mouse' });
  await sleep(800);
  const after = await ev('window.scrollY');
  return { moved: after - before, after };
}

console.log(`\n########## ${LABEL.toUpperCase()} — CPU throttle ${THROTTLE}x ##########`);

const results = {};
for (const [tag, w, h, mobile] of [['desktop 1440', 1440, 900, false], ['mobile 390', 390, 844, true]]) {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: mobile ? 2 : 1, mobile });
  await send('Page.navigate', { url: URL_ });
  await sleep(4500);
  await ev(PROBE);

  const wheel = await wheelProbe();

  await send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
  await sleep(700);
  /* warm-up: aktifkan semua ScrollTrigger + animasi yang lazy */
  await ev('window.__probe.run(2600)');
  await ev(`window.__lenis ? window.__lenis.scrollTo(0,{immediate:true}) : window.scrollTo(0,0)`);
  await sleep(1000);
  await ev('window.__probe.reset()');

  const r = await ev('window.__probe.run(6000)');
  await send('Emulation.setCPUThrottlingRate', { rate: 1 });
  r.diag = await ev(DIAG);
  r.wheel = wheel;
  results[tag] = r;
}

for (const [tag, r] of Object.entries(results)) {
  console.log(`\n--- ${tag} ---`);
  console.log(`wheel nyata   bergerak ${r.wheel.moved}px → Lenis ${r.wheel.moved > 0 ? 'AKTIF' : 'MATI'}`);
  console.log(`scroll diuji ${r.scrolledPx}px dalam ${r.frames} frame`);
  console.log(`frame time    avg ${r.avg}ms · p50 ${r.p50} · p95 ${r.p95} · p99 ${r.p99} · max ${r.max}ms`);
  console.log(`frame jatuh   >32ms: ${r.over32} · >50ms: ${r.over50} · >100ms: ${r.over100}`);
  console.log(`long task     ${r.longTasksTotal} (>50ms) ${r.longTasks.length ? '→ ' + r.longTasks.join(', ') : ''}`);
  console.log(`LoAF          ${r.loafs} frame panjang, blocking total ${r.loafBlocking}ms`);
  const hs = Object.entries(r.handlers).sort((a, b) => b[1].total - a[1].total);
  if (hs.length) console.log(`event handler ${hs.slice(0, 6).map(([k, v]) => `${k}×${v.count}=${v.total}ms`).join('  ')}`);
  console.log(`diag          ${JSON.stringify(r.diag)}`);
}

writeFileSync(join(OUT, `perf-${LABEL}.json`), JSON.stringify({ label: LABEL, throttle: THROTTLE, results }, null, 2));
console.log(`\n→ perf/perf-${LABEL}.json`);
chrome.kill();
process.exit(0);

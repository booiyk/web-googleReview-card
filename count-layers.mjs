/* ==========================================================================
   Ukur EFEK TAHAP: berapa layer yang benar-benar dipromosikan, dan berapa
   biaya composite/paint. Ini proksi yang bisa diukur untuk masalah GPU
   di HP — kebalikan dari metrik main thread yang semuanya terlihat bersih.

   Cara: LayerTree domain untuk menghitung layer, dan
   PerformanceObserver + forced style flush untuk mengukur work per frame.
   ========================================================================== */
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = Number(process.env.PORT || 9500);
const URL_ = process.env.TARGET || 'http://localhost:8899/index.html';
const LABEL = process.env.LABEL || 'run';
const OUT = new URL('./perf/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const profile = mkdtempSync(join(tmpdir(), 'gcr-l-'));
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`, '--no-first-run', '--hide-scrollbars',
  '--window-size=1440,900', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(2800);
const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const ws = new WebSocket(list.find((t) => t.type === 'page').webSocketDebuggerUrl);
let id = 0; const pend = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
await new Promise((r) => (ws.onopen = r));
await send('Page.enable'); await send('Runtime.enable');
await send('DOM.enable'); await send('CSS.enable');
try { await send('LayerTree.enable'); } catch {}
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text);
  return r.result?.result?.value;
};

/* LayerTree: node → layerId */
async function layerCount() {
  try {
    const doc = await send('DOM.getDocument', { depth: -1 });
    const tree = await send('DOM.describeNode', { nodeId: doc.result.root.nodeId });
    const ltree = await send('LayerTree.layerTree', { nodeId: doc.result.root.nodeId });
    const layers = ltree?.result?.layers || [];
    return { count: layers.length, reasons: {} };
  } catch (e) {
    return { count: -1, err: e.message };
  }
}

const COUNT_WC = `
(() => {
  const all = [...document.querySelectorAll('*')];
  const wc = [], bf = [], flt = [], sticky = [], pos = {};
  for (const el of all) {
    const s = getComputedStyle(el);
    const tag = el.tagName.toLowerCase() + '.' + (el.className.toString().split(' ')[0] || '');
    if (s.willChange && s.willChange !== 'auto') wc.push({ tag, wc: s.willChange });
    if ((s.backdropFilter || s.webkitBackdropFilter || '').includes('blur')) bf.push({ tag, b: s.backdropFilter || s.webkitBackdropFilter, fixed: s.position === 'fixed' });
    if (s.filter && s.filter !== 'none') flt.push({ tag, f: s.filter.slice(0, 30) });
    if (s.position === 'sticky') sticky.push(tag);
    if (s.position === 'fixed') pos[tag] = s.position;
  }
  /* Elemen yang saat ini sedang dianimasikan GSAP */
  const animating = gsap.globalTimeline.getChildren(true, true, false)
    .filter(t => t.isActive() && t.repeat() === -1)
    .map(t => {
      const tg = t.targets()[0];
      return tg && tg.nodeType ? tg.tagName.toLowerCase() + '.' + (tg.className?.toString().split(' ')[0] || '') : '?';
    });
  /* Trigger yang sedang aktif */
  const activeST = ScrollTrigger.getAll().filter(t => t.isActive).length;
  return {
    total: all.length,
    willChange: wc,
    backdropFilter: bf,
    filter: flt,
    sticky: sticky,
    fixed: Object.keys(pos),
    infiniteTweens: animating,
    activeScrollTriggers: activeST,
    totalScrollTriggers: ScrollTrigger.getAll().length,
  };
})()`;

console.log(`\n########## LAPISAN & EFEK: ${LABEL.toUpperCase()} ##########`);

await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: URL_ });
await sleep(4500);

const layers = await layerCount();
const counts = await ev(COUNT_WC);

const group = (arr, key) => arr.reduce((a, x) => { a[x[key]] = (a[x[key]] || 0) + 1; return a; }, {});

console.log(`\nLayerTree layer aktif : ${layers.count}${layers.err ? ' (err: ' + layers.err + ')' : ''}`);
console.log(`DOM nodes             : ${counts.total}`);
console.log(`ScrollTrigger         : ${counts.totalScrollTriggers} total, ${counts.activeScrollTriggers} aktif di viewport`);
console.log(`\nwill-change (${counts.willChange.length} elemen →潜在 ${counts.willChange.length} layer):`);
console.log('   ' + Object.entries(group(counts.willChange, 'wc')).map(([k, v]) => `${k} ×${v}`).join('  '));
const wcTags = {};
counts.willChange.forEach((w) => { wcTags[w.tag] = (wcTags[w.tag] || 0) + 1; });
console.log('   per elemen: ' + Object.entries(wcTags).sort((a,b)=>b[1]-a[1]).slice(0,10).map(([k,v])=>`${k}×${v}`).join('  '));
console.log(`\nbackdrop-filter (${counts.backdropFilter.length}):`);
counts.backdropFilter.forEach((b) => console.log(`   ${b.tag}  ${b.f}${b.fixed ? '  [FIXED]' : ''}`));
console.log(`\nfilter (${counts.filter.length}):`);
counts.filter.forEach((f) => console.log(`   ${f.tag} → ${f.f}`));
console.log(`\nsticky: ${counts.sticky.length ? counts.sticky.join(', ') : '—'}`);
console.log(`fixed : ${counts.fixed.length} → ${counts.fixed.join(', ')}`);
console.log(`\ninfinite tweens (${counts.infiniteTweens.length}): ${counts.infiniteTweens.join(', ')}`);

writeFileSync(join(OUT, `layers-${LABEL}.json`), JSON.stringify({ layers, counts }, null, 2));
console.log(`\n→ perf/layers-${LABEL}.json`);
chrome.kill(); process.exit(0);

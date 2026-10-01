/* Uji runtime lewat Chrome DevTools Protocol.
   Menjalankan page di beberapa viewport, scroll, buka FAQ & modal, cek error. */
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9345;
const URL_ = process.env.TARGET || 'http://localhost:8899/index.html';

const profile = mkdtempSync(join(tmpdir(), 'gcr-test-'));
const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--disable-gpu',
  '--hide-scrollbars', 'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(2600);

const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const target = list.find((t) => t.type === 'page');
const ws = new WebSocket(target.webSocketDebuggerUrl);

let msgId = 0;
const pending = new Map();
const logs = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); }
  if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(m.params.type)) {
    logs.push(`[${m.params.type}] ` + m.params.args.map((a) => a.value ?? a.description ?? '?').join(' '));
  }
  if (m.method === 'Runtime.exceptionThrown') {
    const d = m.params.exceptionDetails;
    logs.push(`[EXCEPTION] ${d.exception?.description ?? d.text}`);
  }
  if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') {
    logs.push(`[NETWORK] ${m.params.entry.text} ${m.params.entry.url ?? ''}`);
  }
};
const send = (method, params = {}) => new Promise((res) => {
  const i = ++msgId; pending.set(i, res);
  ws.send(JSON.stringify({ id: i, method, params }));
});
await new Promise((r) => (ws.onopen = r));
await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable');

async function evaluate(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) return { __err: r.exceptionDetails.exception?.description ?? r.exceptionDetails.text };
  return r.result.value;
}
async function setViewport(width, height, mobile = false) {
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: mobile ? 2 : 1, mobile });
}
async function goto(url) {
  await send('Page.navigate', { url });
  await sleep(3200);
}

const report = [];
const ok = (label, cond, extra = '') => report.push(`${cond ? 'PASS' : 'FAIL'}  ${label}${extra ? ' — ' + extra : ''}`);

/* ---------------- DESKTOP 1440 ---------------- */
await setViewport(1440, 900);
await goto(URL_);

ok('GSAP termuat', await evaluate('typeof gsap !== "undefined" && gsap.version'));
ok('ScrollTrigger termuat', await evaluate('typeof ScrollTrigger !== "undefined"'));
ok('Lenis termuat', await evaluate('typeof Lenis !== "undefined"'));
ok('preloader dihapus setelah intro', await evaluate('!document.getElementById("preloader")'));
ok('body tidak terkunci scroll', await evaluate('!document.body.classList.contains("is-locked")'));

const heroSplit = await evaluate('document.querySelectorAll("#hero .word__i").length');
ok('headline hero di-split jadi kata', heroSplit > 4, heroSplit + ' kata');
ok('kata hero terlihat (opacity 1)', await evaluate(`
  (()=>{const w=[...document.querySelectorAll("#hero .word__i")];
  return w.length>0 && w.every(x=>parseFloat(getComputedStyle(x).opacity)>0.98);})()`));

ok('kartu 3D hero punya transform 3D', await evaluate(`
  (()=>{const t=getComputedStyle(document.getElementById("heroCard")).transform;
  return t && t!=="none";})()`), await evaluate('getComputedStyle(document.getElementById("heroCard")).transform'));

ok('garis split jadi span.word', await evaluate('document.querySelectorAll("#fiturTitle .word").length > 3'));
ok('bintang testimoni di-render SVG', await evaluate('document.querySelectorAll("#testimoni [data-stars] svg").length >= 18'));
ok('link WA diproses ke nomor', await evaluate('document.querySelector("a.fab").href.startsWith("https://wa.me/6288212725000")'));

/* scroll seluruh halaman, kumpulkan statistik */
await evaluate('window.scrollTo(0, 0)');
await sleep(400);
const maxScroll = await evaluate('document.body.scrollHeight - window.innerHeight');

const samples = [];
for (let i = 0; i <= 20; i++) {
  const y = Math.round((maxScroll * i) / 20);
  await evaluate(`window.scrollTo(0, ${y})`);
  await sleep(260);
  samples.push(await evaluate(`
    (()=>{
      const st = ScrollTrigger.getById('showcaseST');
      const doc = document.documentElement;
      return {
        y: Math.round(window.scrollY),
        xOverflow: doc.scrollWidth - doc.clientWidth,
        pinSpacer: !!document.querySelector('.pin-spacer'),
        beat: document.querySelector('.beat.is-active')?.dataset.beat ?? null,
        phoneVisible: (()=>{const p=document.getElementById('phone');
          return p?parseFloat(getComputedStyle(p).opacity)>0.2:false;})(),
        stars: document.querySelectorAll('#phStars .ph-star.is-lit').length,
      };
    })()`));
}

const overflow = Math.max(...samples.map((s) => s.xOverflow));
ok('tanpa horizontal overflow di semua posisi scroll', overflow <= 1, 'max ' + overflow + 'px');
ok('pin-spacer dibuat ScrollTrigger', samples.some((s) => s.pinSpacer));
const beatsSeen = [...new Set(samples.map((s) => s.beat).filter((v) => v !== null))];
ok('semua 5 beat terlewati saat scroll', beatsSeen.length === 5, 'beats: ' + beatsSeen.join(','));
ok('HP muncul di layar saat showcase', samples.some((s) => s.phoneVisible));
ok('bintang rating menyala', samples.some((s) => s.stars >= 5), 'maks ' + Math.max(...samples.map((s) => s.stars)) + '/5');

/* count-up — tunggu animasi 1.9s selesai */
await evaluate(`document.querySelector('#fitur').scrollIntoView()`);
await sleep(2800);
const statsSeen = await evaluate(`
  (()=>{ const el=document.querySelector('[data-count]');
    return el ? el.textContent : null; })()`);
ok('count-up statistic terisi (format id-ID)', statsSeen === '4,9', 'nilai: ' + statsSeen);

await evaluate(`document.getElementById('harga').scrollIntoView()`);
await sleep(2800);
const price = await evaluate(`document.querySelector('.plan--pro .plan__num')?.textContent`);
ok('harga Pro ter-count-up', price === '100.000', 'harga: ' + price);
const priceBasic = await evaluate(`document.querySelector('.plan:not(.plan--pro) .plan__num')?.textContent`);
ok('harga Basic ter-count-up', priceBasic === '50.000', 'harga: ' + priceBasic);

/* FAQ */
await evaluate(`document.getElementById('faq').scrollIntoView()`);
await sleep(900);
const faqClick = await evaluate(`
  (()=>{ const b=document.querySelectorAll('.faq__q')[0];
    b.click();
    return b.getAttribute('aria-expanded'); })()`);
await sleep(1000);
const faqH = await evaluate(`document.querySelector('.faq__a').getBoundingClientRect().height`);
ok('FAQ terbuka saat diklik', faqClick === 'true' && faqH > 40, 'tinggi ' + Math.round(faqH) + 'px');

const faqToggle = await evaluate(`
  (()=>{ const b=document.querySelectorAll('.faq__q')[0]; b.click(); return b.getAttribute('aria-expanded'); })()`);
await sleep(900);
const faqClosedH = await evaluate(`document.querySelector('.faq__a').getBoundingClientRect().height`);
ok('FAQ bisa ditutup lagi', faqToggle === 'false' && faqClosedH < 5, 'tinggi ' + Math.round(faqClosedH) + 'px');

await evaluate(`document.querySelectorAll('.faq__q')[1].click()`);
await sleep(800);
const faq2 = await evaluate(`
  (()=>{ const bs=document.querySelectorAll('.faq__q');
    return { open:[...bs].filter(b=>b.getAttribute('aria-expanded')==='true').length,
             firstClosed: bs[0].getAttribute('aria-expanded') }; })()`);
ok('FAQ bersifat akordeon (satu terbuka)', faq2.open === 1 && faq2.firstClosed === 'false');

/* modal pesanan -> WA */
const modalRes = await evaluate(`
  (()=>{ document.querySelector('[data-order]').click();
    const m=document.getElementById('orderModal');
    return { open:m.open }; })()`);
ok('modal pesanan terbuka', modalRes.open === true);
const formMsg = await evaluate(`
  (()=>{ let captured=null;
    const orig=window.open;
    window.open=(u)=>{captured=u;return null;};
    document.getElementById('ofName').value='Rani';
    document.getElementById('ofBiz').value='Kafe Rindu Pagi';
    document.getElementById('orderForm').requestSubmit();
    window.open=orig;
    return captured; })()`);
ok('form pesanan membuka wa.me dengan pesan terisi',
  !!formMsg && formMsg.startsWith('https://wa.me/6288212725000?text=')
  && decodeURIComponent(formMsg).includes('Kafe Rindu Pagi'),
  formMsg ? decodeURIComponent(formMsg).split('?')[0] : 'null');

/* marquee */
const mq = await evaluate(`
  (()=>{ const rows=document.querySelectorAll('.marquee__row');
    return { rows:rows.length, tracks:document.querySelectorAll('[data-track]').length }; })()`);
ok('marquee punya 2 baris dan tiap baris diduplikasi', mq.rows === 2 && mq.tracks === 4,
  mq.rows + ' baris / ' + mq.tracks + ' track');

/* ---------------- TABLET 834 ---------------- */
await goto(URL_);
await setViewport(834, 1112, true);
await sleep(1200);
ok('tablet: tidak ada pinned showcase', await evaluate(`!ScrollTrigger.getById('showcaseST')`));
ok('tablet: semua beat terlihat', await evaluate(`document.querySelectorAll('.beat.is-active').length === 5`));
ok('tablet: HP tampil', await evaluate(`parseFloat(getComputedStyle(document.getElementById('phone')).opacity) > 0.5`));
const tabOverflow = await evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth');
ok('tablet: tanpa horizontal overflow', tabOverflow <= 1, 'max ' + tabOverflow + 'px');

/* ---------------- MOBILE 360 ---------------- */
await goto(URL_);
await setViewport(360, 740, true);
await sleep(1200);
ok('mobile: tidak ada pinned showcase', await evaluate(`!ScrollTrigger.getById('showcaseST')`));
const mOver = await evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth');
ok('mobile 360: tanpa horizontal overflow', mOver <= 1, 'max ' + mOver + 'px');
ok('mobile: nav link desktop disembunyikan', await evaluate(`getComputedStyle(document.querySelector('.nav__links')).display === 'none'`));
ok('mobile: burger tampil', await evaluate(`getComputedStyle(document.getElementById('burger')).display !== 'none'`));

const menu = await evaluate(`
  (()=>{ document.getElementById('burger').click();
    return { exp:document.getElementById('burger').getAttribute('aria-expanded') }; })()`);
await sleep(600);
const menuState = await evaluate(`
  (()=>{ const m=document.getElementById('mobileMenu');
    return { open:m.classList.contains('is-open'), hidden:m.hidden,
             opacity:parseFloat(getComputedStyle(m).opacity),
             label:document.querySelector('.nav__burger').getAttribute('aria-label') }; })()`);
ok('mobile: menu terbuka dari burger',
  menu.exp === 'true' && menuState.open && !menuState.hidden && menuState.opacity > 0.9,
  'aria-label: ' + menuState.label);
ok('mobile: tombol burger berubah jadi "Tutup menu"', menuState.label === 'Tutup menu');

const menuClose = await evaluate(`
  (()=>{ document.querySelector('.mobile-menu__nav a').click();
    return document.getElementById('burger').getAttribute('aria-expanded'); })()`);
await sleep(600);
ok('mobile: menu tertutup setelah link diklik', menuClose === 'false'
  && await evaluate(`document.getElementById('mobileMenu').hidden === true`));

await sleep(400);
await evaluate('window.scrollTo(0, document.body.scrollHeight)');
await sleep(1500);
const mOver2 = await evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth');
ok('mobile: overflow tetap aman setelah scroll', mOver2 <= 1, 'max ' + mOver2 + 'px');
const footerVisible = await evaluate(`document.querySelector('.footer').getBoundingClientRect().height > 100`);
ok('mobile: footer ter-render', footerVisible);

/* ---------------- 1920 ---------------- */
await goto(URL_);
await setViewport(1920, 1080);
await sleep(1000);
const wOver = await evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth');
ok('1920: tanpa horizontal overflow', wOver <= 1, 'max ' + wOver + 'px');
ok('1920: wrap tidak melebihi 1180px', await evaluate(`document.querySelector('.wrap').getBoundingClientRect().width <= 1180`));

/* ---------------- REDUCED MOTION ---------------- */
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
await goto(URL_);
await sleep(1500);
ok('reduced-motion: preloader dilewati', await evaluate('!document.getElementById("preloader")'));
ok('reduced-motion: konten tetap terlihat', await evaluate(`
  (()=>{ const els=[...document.querySelectorAll('[data-anim],[data-bento],[data-step],[data-plan]')];
    return els.every(e=>parseFloat(getComputedStyle(e).opacity)>0.9); })()`));
ok('reduced-motion: tidak ada pinned showcase', await evaluate(`!ScrollTrigger.getById('showcaseST')`));
ok('reduced-motion: marquee tidak berjalan', await evaluate(`
  getComputedStyle(document.querySelector('.marquee__track')).animationName === 'none'`));

console.log('\n================ HASIL ================');
report.forEach((r) => console.log(r));
const fails = report.filter((r) => r.startsWith('FAIL'));
console.log(`\n${report.length - fails.length}/${report.length} PASS, ${fails.length} FAIL`);

console.log('\n================ CONSOLE (error/warning) ================');
console.log(logs.length ? logs.join('\n') : 'bersih — tidak ada error atau warning');

chrome.kill();
process.exit(fails.length ? 1 : 0);

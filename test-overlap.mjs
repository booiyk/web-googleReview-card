/* Cek tabrakan FAB WhatsApp dengan elemen interaktif lain. */
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9402;
const profile = mkdtempSync(join(tmpdir(), 'gcr-fab-'));
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`, '--no-first-run', '--disable-gpu', '--hide-scrollbars',
  'about:blank'], { stdio: 'ignore' });
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

const VPS = [{ n: 'mobile-390', w: 390, h: 844, m: true }, { n: 'mobile-360', w: 360, h: 740, m: true }, { n: 'tablet-834', w: 834, h: 1112, m: true }, { n: 'desktop-1440', w: 1440, h: 900, m: false }];
const TARGETS = ['.plan .btn', '.plan', '.fab', '.modal__close', '.faq__q', '.hero__cta .btn', '.closing__contact a', '.btn--primary'];

/* FAB bersifat fixed, jadi PASTI melewati konten saat scroll — itu normal.
   Yang penting: di posisi scroll paling bawah, FAB tidak boleh menutupi
   elemen yang bisa diklik. */
const checkAtBottom = async (label) => {
  const r = await ev(`
    window.scrollTo(0, document.body.scrollHeight);
    new Promise(res => setTimeout(() => {
      const fab=document.querySelector('.fab').getBoundingClientRect();
      const out=[];
      document.querySelectorAll('${TARGETS.join(',')}').forEach(el=>{
        if(el.closest('.fab'))return;
        const cs=getComputedStyle(el);
        if(cs.display==='none'||cs.visibility==='hidden'||+cs.opacity<0.3)return;
        const b=el.getBoundingClientRect();
        if(b.width===0||b.height===0)return;
        if(!(b.right<fab.left||b.left>fab.right||b.bottom<fab.top||b.top>fab.bottom))
          out.push(el.tagName.toLowerCase()+'.'+(el.className.toString().split(' ')[0]||''));
      });
      res([...new Set(out)]);
    }, 700))`);
  console.log(`${label.padEnd(14)} ${r?.length ? 'TABRAKAN → ' + r.join(', ') : 'bersih'}`);
  return !r?.length;
};

let allOk = true;
for (const vp of VPS) {
  await send('Emulation.setDeviceMetricsOverride', { width: vp.w, height: vp.h, deviceScaleFactor: vp.m ? 2 : 1, mobile: vp.m });
  await send('Page.navigate', { url: 'http://localhost:8899/index.html' });
  await sleep(3400);
  console.log(`\n=== ${vp.n} ===`);
  allOk = (await checkAtBottom('scroll bawah')) && allOk;
  /* modal pesan: FAB harus hilang di belakang dialog */
  await ev(`document.querySelector('[data-order]').click()`);
  await sleep(700);
  /* <dialog> showModal() masuk top layer, jadi selalu di atas z-index biasa.
     Yang diuji: elemen yang benar-benar obtainable di titik tengah FAB. */
  const fabBehind = await ev(`
    (()=>{
      const m=document.getElementById('orderModal');
      const r=document.querySelector('.fab').getBoundingClientRect();
      const hit=document.elementFromPoint(r.left+r.width/2, r.top+r.height/2);
      return { modalOpen:m.open,
               topEl: hit ? hit.tagName.toLowerCase()+'.'+(hit.className.toString().split(' ')[0]||'') : null,
               insideFab: !!(hit && hit.closest('.fab')),
               insideDialog: !!(hit && hit.closest('#orderModal')) };
    })()`);
  console.log(`modal terbuka   ${fabBehind.modalOpen ? 'ya' : 'TIDAK'} · elemen teratas di titik FAB: ${fabBehind.topEl} (di dialog: ${fabBehind.insideDialog}, di FAB: ${fabBehind.insideFab})`);
  if (!fabBehind.modalOpen || fabBehind.insideFab) allOk = false;
  await ev(`document.getElementById('orderModal').close()`);
  await sleep(400);
}
console.log(`\nHASIL: ${allOk ? 'PASS' : 'FAIL'}`);
chrome.kill(); process.exit(0);

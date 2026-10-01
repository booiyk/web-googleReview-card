/* Screenshot multi-viewport + deteksi elemen yang meluber / tertimpa. */
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9360;
const OUT = new URL('./shots/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const profile = mkdtempSync(join(tmpdir(), 'gcr-shot-'));
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
const ev = async (e) => {
  const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true });
  if (r?.exceptionDetails) {
    // Surfacing the page-side error beats silently returning undefined,
    // which previously turned a broken audit into a false "clean" pass.
    const d = r.exceptionDetails;
    throw new Error('evaluate gagal: ' + (d.exception?.description || d.text));
  }
  return r?.result?.value;
};

const VIEWPORTS = [
  { name: 'desktop-1920', w: 1920, h: 1080, mobile: false },
  { name: 'desktop-1440', w: 1440, h: 900, mobile: false },
  { name: 'desktop-1280', w: 1280, h: 800, mobile: false },
  { name: 'desktop-1024', w: 1024, h: 768, mobile: false },
  { name: 'tablet-834', w: 834, h: 1112, mobile: true },
  { name: 'mobile-390', w: 390, h: 844, mobile: true },
  { name: 'mobile-360', w: 360, h: 740, mobile: true },
];

const SECTIONS = ['#hero', '#fitur', '#langkah', '#testimoni', '#harga', '#faq', '.closing', '.footer'];
const findings = [];

/* Screenshot tiap langkah showcase disimpan di folder screenshots/ */
const SHOTS = new URL('./screenshots/', import.meta.url).pathname;
mkdirSync(SHOTS, { recursive: true });
const SHOT_VIEWPORTS = new Set(['desktop-1440', 'mobile-390']);

/* ==========================================================================
   Audit tumpang tindih & teks terpotong.
   Dipakai untuk (a) tiap section, (b) tiap langkah showcase 01–05.

   Dua jebakan yang harus dihindari supaya tes tidak salah:
   1) BoundING box elemen yang berotasi lebih besar dari isinya, sehingga
      dua saudara yang tidak benar-benar menimpa akan terbaca overlap.
      Solusi: samakan transform ke identity SEBELUM mengukur.
   2) Elemen dekoratif (glow, sheen, marquee track) memang keluar
      container secara sengaja — hanya elemen TEKS yang dinilai.
   ========================================================================== */
const AUDIT_OVERLAP = `
(() => {
  const TOL = 2;                       // toleransi 2px untuk subpixel
  const out = { overlaps: [], clipped: [], overflow: [], empty: [] };

  /* --- normalisasi transform (NON-DESTRUKTIF) ---
     Elemen yang diputar (kartu 3D ±26°, HP -5°) punya bounding box anak
     yang lebih besar dari aslinya, sehingga anak yang tidak benar-benar
     menimpa terbaca overlap.

     PENTING: normalisasi harus lewat stylesheet "!important", BUKAN
     el.style.transform = 'none'. Menulis inline style pada elemen yang
     sedang dianimasikan GSAP merusak state transform internal GSAP —
     setelah dikembalikan, elemen tidak lagi me-render transform yang
     sama, dan pengukuran berikutnya (termasuk cek HP-vs-teks-kartu)
     jadi membaca angka salah. Stylesheet dihapus bersih di akhir. */
  const NORMALIZE = '.phone,.phone__screen,.card-scene,.card-3d,.card-3d__face,.showcase__stage,.beats,.plan,.faq__item,.step,.bento__card,.tcard,.split__side,.stat{transform:none !important}';
  const styleTag = document.createElement('style');
  styleTag.textContent = NORMALIZE;
  document.head.appendChild(styleTag);
  void document.body.offsetHeight;

  const measureRoots = [...document.querySelectorAll(
    '.phone__screen, .showcase__stage, .beats, .plan, .faq__item, .step, .bento__card, .tcard, .split__side, .stat')];

  /* Visibilitas AKTUAL, bukan sekadar computed style.
     elementFromPoint adalah satu-satunya cara yang benar untuk
     memperhitungkan: backface-visibility (face belakang kartu terbalik
     dan tidak terlihat meski computed style-nya opacity 1), serta oklusi
     oleh elemen lain di atasnya. Tanpa ini, faces depan/belakang kartu
     dilaporkan saling menimpa padahal hanya satu yang terlihat. */
  const reallyVisible = (el) => {
    const b = el.getBoundingClientRect();
    if (b.width <= 1 || b.height <= 1) return false;
    if (b.right < 0 || b.left > innerWidth || b.bottom < 0 || b.top > innerHeight) return false;
    // 5 titik sampel: 4 sudut dalam + tengah
    const pts = [[0.5, 0.5], [0.5, 0.15], [0.5, 0.85], [0.15, 0.5], [0.85, 0.5]];
    for (const [fx, fy] of pts) {
      const hit = document.elementFromPoint(b.left + b.width * fx, b.top + b.height * fy);
      if (hit && (hit === el || el.contains(hit) || hit.contains(el))) return true;
    }
    return false;
  };

  const textNodes = (root) => [...root.querySelectorAll('*')].filter((e) => {
    if (e.children.length) return false;                   // hanya daun
    if (!e.textContent.trim()) return false;
    const cs = getComputedStyle(e);
    if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    if (parseFloat(cs.opacity) < 0.05) return false;
    if (e.closest('.sprite, .marquee__track, [aria-hidden="true"]')) return false;
    return reallyVisible(e);
  });

  for (const root of measureRoots) {
    const nodes = textNodes(root).map((e) => ({ e, b: e.getBoundingClientRect(), t: e.textContent.trim().slice(0, 30) }));
    for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
      const A = nodes[i], B = nodes[j];
      // lewati pasangan yang satu menjadi ancestor-owned (indent/label)
      if (A.e.contains(B.e) || B.e.contains(A.e)) continue;
      const ox = Math.min(A.b.right, B.b.right) - Math.max(A.b.left, B.b.left);
      const oy = Math.min(A.b.bottom, B.b.bottom) - Math.max(A.b.top, B.b.top);
      if (ox > TOL && oy > TOL) {
        out.overlaps.push({ root: root.className.split(' ')[0] || root.tagName.toLowerCase(),
                            a: A.t, b: B.t, area: Math.round(ox * oy) });
      }
    }
    // --- 2. teks terpotong / meluber keluar containernya ---
    for (const x of nodes) {
      if (x.e.scrollWidth > x.e.clientWidth + TOL) {
        const cs = getComputedStyle(x.e);
        // ellipsis yang disengaja bukan bug
        if (cs.textOverflow === 'ellipsis' || cs.overflowX === 'hidden') continue;
        out.clipped.push({ root: root.className.split(' ')[0], t: x.t,
                           scrollW: x.e.scrollWidth, clientW: x.e.clientWidth });
      }
    }
    // --- 3. container yang overflow horizontal ---
    if (root.scrollWidth > root.clientWidth + TOL) {
      const cs = getComputedStyle(root);
      if (cs.overflowX === 'visible' || cs.overflowX === 'clip') {
        out.overflow.push({ root: root.className.split(' ')[0],
                           scrollW: root.scrollWidth, clientW: root.clientWidth });
      }
    }
  }
  styleTag.remove();
  out.overlaps = out.overlaps.slice(0, 12);
  out.clipped = out.clipped.slice(0, 8);
  out.overflow = out.overflow.slice(0, 8);
  return out;
})()`;

for (const vp of VIEWPORTS) {
  await send('Emulation.setDeviceMetricsOverride', { width: vp.w, height: vp.h, deviceScaleFactor: vp.mobile ? 2 : 1, mobile: vp.mobile });
  await send('Page.navigate', { url: 'http://localhost:8899/index.html' });
  await sleep(3400);

  for (const sel of SECTIONS) {
    await ev(`(document.querySelector('${sel}')||{}).scrollIntoView?.({block:'start'})`);
    await sleep(1400);
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(OUT, `${vp.name}__${sel.replace(/[#.]/g, '')}.png`), Buffer.from(shot.data, 'base64'));

    const audit = await ev(`
      (()=>{
        const vw = document.documentElement.clientWidth;
        const vh = document.documentElement.clientHeight;
        const sec = document.querySelector('${sel}');
        const secRect = sec ? sec.getBoundingClientRect() : null;
        const out = { vw, vh, overX: document.documentElement.scrollWidth - vw, bleed: [], tinyText: [], clipped: [] };

        // Elemen yang benar-benar terlihat meluber: harus TIDAK punya ancestor
        // yang meng-clip (overflow hidden/clip/auto) — kalau tidak, glow,
        // sheen, dan marquee track akan dilaporkan sebagai false positive.
        const isClipped = (el) => {
          for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
            const o = getComputedStyle(p).overflowX;
            if (o === 'hidden' || o === 'clip' || o === 'auto' || o === 'scroll') return true;
          }
          return false;
        };
        // mockup HP adalah ilustrasi perangkat, bukan UI situs
        const isMockup = (el) => !!el.closest('.phone');

        document.querySelectorAll('body *').forEach(el => {
          const cs = getComputedStyle(el);
          if (cs.position === 'fixed' || cs.display === 'none' || cs.visibility === 'hidden') return;
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) return;
          if ((r.right > vw + 2 || r.left < -2) && !isClipped(el)) {
            out.bleed.push(el.tagName.toLowerCase() + '.' + (el.className?.toString().split(' ')[0] || '')
              + ' [' + Math.round(r.left) + '..' + Math.round(r.right) + ']');
          }
          const fs = parseFloat(cs.fontSize);
          if (fs && fs < 10 && el.textContent.trim() && el.children.length === 0 && !isMockup(el))
            out.tinyText.push(el.tagName.toLowerCase() + ' ' + fs + 'px "' + el.textContent.trim().slice(0,24) + '"');
        });
        // section lebih pendek dari viewport
        if (secRect) out.h = Math.round(secRect.height);
        out.bleed = [...new Set(out.bleed)].slice(0, 8);
        out.tinyText = [...new Set(out.tinyText)].slice(0, 5);
        return out;
      })()`);

    if (audit.overX > 1) findings.push(`${vp.name} ${sel}: horizontal overflow ${audit.overX}px`);
    if (audit.bleed?.length) findings.push(`${vp.name} ${sel}: meluber → ${audit.bleed.join(' | ')}`);
    if (audit.tinyText?.length) findings.push(`${vp.name} ${sel}: teks kecil → ${audit.tinyText.join(' | ')}`);

    const ov = await ev(AUDIT_OVERLAP);
    if (ov.overlaps.length) {
      findings.push(`${vp.name} ${sel}: TUMPANG TINDIH → ` +
        ov.overlaps.map((o) => `"${o.a}"×"${o.b}" (${o.area}px² @${o.root})`).join(' | '));
    }
    if (ov.clipped.length) {
      findings.push(`${vp.name} ${sel}: TEKS TERPOTONG → ` +
        ov.clipped.map((c) => `"${c.t}" ${c.scrollW}>${c.clientW}px`).join(' | '));
    }
    if (ov.overflow.length) {
      findings.push(`${vp.name} ${sel}: CONTAINER OVERFLOW → ` +
        ov.overflow.map((c) => `${c.root} ${c.scrollW}>${c.clientW}px`).join(' | '));
    }
  }

  /* ---------- tiap langkah showcase 01–05 ----------
     Di desktop showcase di-pin, jadi tiap langkah bisa dipatok.
     Di bawah 941px tidak ada pin (5 beat tampil sebagai daftar statis),
     jadi yang difoto adalah section showcase utuhnya. */
  const st = await ev(`(()=>{const s=ScrollTrigger.getById('showcaseST');return s?{start:s.start,end:s.end}:null})()`);
  if (!st) {
    if (SHOT_VIEWPORTS.has(vp.name)) {
      await ev(`document.querySelector('#cara-kerja')?.scrollIntoView({block:'start'})`);
      await sleep(1800);
      const shot = await send('Page.captureScreenshot', { format: 'png' });
      writeFileSync(join(SHOTS, `showcase-static-${vp.name}.png`), Buffer.from(shot.data, 'base64'));
    }
    /* tetap audit isi section showcase (HP + kartu) di layout tanpa pin */
    await ev(`document.querySelector('#cara-kerja')?.scrollIntoView({block:'start'})`);
    await sleep(1600);
    const ovStatic = await ev(AUDIT_OVERLAP);
    if (ovStatic.overlaps.length) {
      findings.push(`${vp.name} showcase (tanpa pin): TUMPANG TINDIH → ` +
        ovStatic.overlaps.map((o) => `"${o.a}"×"${o.b}" (${o.area}px² @${o.root})`).join(' | '));
    }
    if (ovStatic.clipped.length) {
      findings.push(`${vp.name} showcase (tanpa pin): TEKS TERPOTONG → ` +
        ovStatic.clipped.map((c) => `"${c.t}" ${c.scrollW}>${c.clientW}px`).join(' | '));
    }
    /* hanya satu view layar HP yang boleh terlihat */
    const vStatic = await ev(`[...document.querySelectorAll('.phone__view')]
      .filter(v => { const cs = getComputedStyle(v);
        return cs.visibility !== 'hidden' && parseFloat(cs.opacity) > 0.05; })
      .map(v => v.dataset.view)`);
    if (vStatic.length > 1) {
      findings.push(`${vp.name} showcase (tanpa pin): ${vStatic.length} view HP tampil bersamaan → ${vStatic.join(', ')}`);
    }
    /* konten tidak boleh masuk ke area notch */
    const notchStatic = await ev(`
      (()=>{
        const isl = document.querySelector('.phone__island');
        if (!isl) return null;
        const ir = isl.getBoundingClientRect();
        const v = [...document.querySelectorAll('.phone__view')]
          .filter(x => { const cs = getComputedStyle(x);
            return cs.visibility !== 'hidden' && parseFloat(cs.opacity) > 0.05; })[0];
        if (!v || !v.children[0]) return null;
        const b = v.children[0].getBoundingClientRect();
        const oy = Math.min(b.bottom, ir.bottom) - Math.max(b.top, ir.top);
        const ox = Math.min(b.right, ir.right) - Math.max(b.left, ir.left);
        return (ox > 1 && oy > 1)
          ? v.children[0].className.split(' ')[0] + ' menabrak notch ' + Math.round(ox) + 'x' + Math.round(oy) + 'px'
          : null;
      })()`);
    if (notchStatic) findings.push(`${vp.name} showcase (tanpa pin): ISI LAYAR MENABRAK NOTCH → ${notchStatic}`);
  } else {
    for (let b = 0; b < 5; b++) {
      const y = Math.round(st.start + (st.end - st.start) * ((b + 0.5) / 5));
      await ev(`window.__lenis ? window.__lenis.scrollTo(${y},{immediate:true}) : window.scrollTo(0,${y})`);
      await sleep(2000);

      if (SHOT_VIEWPORTS.has(vp.name)) {
        const shot = await send('Page.captureScreenshot', { format: 'png' });
        writeFileSync(join(SHOTS, `beat${b + 1}-${vp.name}.png`), Buffer.from(shot.data, 'base64'));
      }

      const ov = await ev(AUDIT_OVERLAP);
      if (ov.overlaps.length) {
        findings.push(`${vp.name} showcase langkah ${b + 1}: TUMPANG TINDIH → ` +
          ov.overlaps.map((o) => `"${o.a}"×"${o.b}" (${o.area}px² @${o.root})`).join(' | '));
      }
      if (ov.clipped.length) {
        findings.push(`${vp.name} showcase langkah ${b + 1}: TEKS TERPOTONG → ` +
          ov.clipped.map((c) => `"${c.t}" ${c.scrollW}>${c.clientW}px`).join(' | '));
      }
      if (ov.overflow.length) {
        findings.push(`${vp.name} showcase langkah ${b + 1}: CONTAINER OVERFLOW → ` +
          ov.overflow.map((c) => `${c.root} ${c.scrollW}>${c.clientW}px`).join(' | '));
      }

      /* HP tidak boleh menutupi teks kartu, dan hanya satu view layar
         yang boleh terlihat pada satu waktu.

         Cek oklusi memakai HIT-TEST (elementFromPoint), bukan
         perpotongan bounding box: kartu berputar ±26° dan HP -5°, jadi
         perbandingan rect yang keduanya diputar menghasilkan
         false-positive. Hit-test menjawab pertanyaan sebenarnya:
         apakah titik pada teks kartu benar-benar tertutup HP, atau
         teksnya masih yang tampil di atas. */
      const phone = await ev(`
        (()=>{
          const p = document.getElementById('phone');
          const ph = p.getBoundingClientRect();
          const pr = document.getElementById('showcaseCard').getBoundingClientRect();
          const covered = [];
          /* Hanya face DEPAN. Face belakang dirotasi 180° dengan
             backface-visibility:hidden, jadi elemennya tidak terlihat
             tetapi bounding box-nya terproyeksi ke sisi yang salah. */
          const front = document.querySelector("#showcaseCard .card-3d__face--front");
          const phoneVisible = parseFloat(getComputedStyle(p).opacity) > 0.05;

          /* Ukur di ruang TANPA rotasi. Dua alasan:
             - bounding box elemen yang diputar lebih besar dari isinya,
               sehingga perpotongan rect bisa menimpa halo kosong;
             - kartu memakai transform-style: preserve-3d, jadi urutan
               cat (dan elementFromPoint) mengikuti posisi 3D, bukan
               z-index. Jadi hit-test tidak bisa dipakai sebagai penentu
               "teks tertutup atau tidak".
             Geometri tanpa rotasi menjawab pertanyaan yang sama secara
             deterministik: apakah HP menyentuh area teks kartu. */
          const flat = document.createElement("style");
          flat.textContent = "#showcaseCard,#showcaseCard .card-3d,#showcaseCard .card-3d__face,.phone{transform:none !important}";
          document.head.appendChild(flat);
          void document.body.offsetHeight;
          const phFlat = p.getBoundingClientRect();

          (front ? front.querySelectorAll(".card__title, .card__label, .card__brand, .card__sub, .card__qr, .card__g, .card__nfc") : [])
            .forEach(e => {
              const b = e.getBoundingClientRect();
              if (b.width === 0) return;
              const ox = Math.min(b.right, phFlat.right) - Math.max(b.left, phFlat.left);
              const oy = Math.min(b.bottom, phFlat.bottom) - Math.max(b.top, phFlat.top);
              if (ox > 1 && oy > 1) {
                const cn = (e.className && e.className.baseVal !== undefined)
                  ? e.className.baseVal : String(e.className || "");
                covered.push("." + (cn.split(" ")[0] || e.tagName.toLowerCase())
                  + " " + e.textContent.trim().slice(0, 16) + " tumpang " + Math.round(ox) + "x" + Math.round(oy) + "px");
              }
            });
          flat.remove();
          void document.body.offsetHeight;
          const activeViews = [...document.querySelectorAll('.phone__view')]
            .filter(v => { const cs = getComputedStyle(v);
              return cs.visibility !== 'hidden' && parseFloat(cs.opacity) > 0.05; })
            .map(v => v.dataset.view);

          /* Distribusi isi: konten harus memenuhi sebagian besar tinggi
             layar, bukan menumpuk di atas dengan bagian bawah kosong. */
          const screen = p.querySelector('.phone__screen');
          const sr = screen.getBoundingClientRect();
          const v = [...document.querySelectorAll('.phone__view')]
            .filter(x => { const cs = getComputedStyle(x);
              return cs.visibility !== 'hidden' && parseFloat(cs.opacity) > 0.05; })[0];
          let distribution = null;
          if (v) {
            const kids = [...v.children].filter(c => {
              const b = c.getBoundingClientRect();
              return b.height > 1;
            });
            if (kids.length) {
              const top = Math.min(...kids.map(c => c.getBoundingClientRect().top));
              const bot = Math.max(...kids.map(c => c.getBoundingClientRect().bottom));
              const ratio = (bot - top) / sr.height;
              const topGap = (top - sr.top) / sr.height;
              const botGap = (sr.bottom - bot) / sr.height;
              distribution = { ratio: +ratio.toFixed(2), topGap: +topGap.toFixed(2), botGap: +botGap.toFixed(2) };
            }
          }
          return { covered, activeViews, distribution, phoneVisible,
                   cardRight: Math.round(pr.right), phoneLeft: Math.round(ph.left) };
        })()`);
      if (phone.covered.length) {
        findings.push(`${vp.name} showcase langkah ${b + 1}: HP MENUTUHI TEKS KARTU → ` + phone.covered.join(' | '));
      }
      if (phone.activeViews.length > 1) {
        findings.push(`${vp.name} showcase langkah ${b + 1}: ${phone.activeViews.length} view HP tampil bersamaan → ${phone.activeViews.join(', ')}`);
      }
      /* konten layar HP harus tersebar, bukan menumpuk di atas */
      const d = phone.distribution;
      if (d && (d.ratio < 0.55 || d.topGap > 0.3 || d.botGap > 0.3)) {
        findings.push(`${vp.name} showcase langkah ${b + 1}: ISI LAYAR HP TIDAK TERSEBAR → ` +
          `tinggi isi ${Math.round(d.ratio * 100)}% layar, jarak atas ${Math.round(d.topGap * 100)}%, jarak bawah ${Math.round(d.botGap * 100)}%`);
      }

      /* konten tidak boleh masuk ke area notch (island) */
      const notch = await ev(`
        (()=>{
          const isl = document.querySelector('.phone__island');
          if (!isl) return null;
          const ir = isl.getBoundingClientRect();
          const v = [...document.querySelectorAll('.phone__view')]
            .filter(x => { const cs = getComputedStyle(x);
              return cs.visibility !== 'hidden' && parseFloat(cs.opacity) > 0.05; })[0];
          if (!v) return null;
          const first = v.children[0];
          if (!first) return null;
          const b = first.getBoundingClientRect();
          const oy = Math.min(b.bottom, ir.bottom) - Math.max(b.top, ir.top);
          const ox = Math.min(b.right, ir.right) - Math.max(b.left, ir.left);
          return (ox > 1 && oy > 1)
            ? first.className.split(' ')[0] + ' menabrak notch ' + Math.round(ox) + 'x' + Math.round(oy) + 'px'
            : null;
        })()`);
      if (notch) findings.push(`${vp.name} showcase langkah ${b + 1}: ISI LAYAR MENABRAK NOTCH → ${notch}`);
    }
  }
  console.log(`✓ ${vp.name} selesai`);
}

// tinggi tiap section per viewport
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: 'http://localhost:8899/index.html' });
await sleep(3200);
const heights = await ev(`
  [...document.querySelectorAll('main > section, footer')].map(s =>
    (s.id || s.className.split(' ')[0]) + '=' + Math.round(s.getBoundingClientRect().height) + 'px').join('  ')`);
console.log('\nTinggi section @1440x900:\n' + heights);

console.log('\n================ TEMUAN ================');
console.log(findings.length ? findings.join('\n')
  : 'bersih — tidak ada tumpang tindih, teks terpotong, container overflow, elemen meluber, atau teks < 10px');
console.log(`\nTotal temuan: ${findings.length}`);
console.log(`Screenshot: ${SHOT_VIEWPORTS.size} viewport → screenshots/ (desktop: beat1–beat5, mobile: showcase static)`);
chrome.kill();
process.exit(findings.length ? 1 : 0);

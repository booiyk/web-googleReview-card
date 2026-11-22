# Google Card Review — Landing Page

Landing page premium bergaya Apple untuk produk **Google Card Review**: kartu NFC + QR code
yang mengubah pelanggan menjadi ulasan Google secara otomatis.

## Isi

```
google-card-review/
├── index.html          # seluruh markup (semantik, SEO, Open Graph, JSON-LD)
├── style.css           # token desain + layout + animasi CSS (marquee, ripple, FAB)
├── script.js           # GSAP + ScrollTrigger + Lenis, interaksi, form WhatsApp
├── assets/
│   ├── favicon.svg
│   └── og-cover.svg        # gambar Open Graph
├── check.mjs           # validator HTML (nesting, alt, aria, id duplikat)
├── serve.mjs           # server statis untuk A/B dua versi
├── test-runtime.mjs    # uji fungsi via Chrome DevTools Protocol
├── test-visual.mjs     # overlap/terpotong di 7 viewport × 5 langkah showcase
├── test-beats.mjs      # screenshot tiap tahap showcase
├── test-overlap.mjs    # cek FAB tidak menutupi elemen interaktif
├── test-gating.mjs     # cek loop tak berujung berhenti saat di luar layar
├── test-perf.mjs       # ukur scroll + CPU throttle 4x
├── count-layers.mjs    # audit elemen yang dipromosikan jadi layer
├── ablate.mjs          # ablation study (reload per varian, urutan diacak)
├── profile-scroll.mjs  # frame time + long task + LoAF
├── perf/               # hasil pengukuran (JSON) dari test-perf.mjs
├── screenshots/        # screenshot tiap langkah showcase (desktop + mobile)
└── shots/              # screenshot tiap section di 7 viewport
```

Tanpa build step, tanpa framework. Buka `index.html` langsung, atau jalankan server statis:

```bash
cd google-card-review
python3 -m http.server 8899
# buka http://localhost:8899
```

> Pakai server statis (bukan `file://`) supaya `<dialog>`, `backdrop-filter`,
> dan pemuatan SVG berjalan konsisten di semua browser.

## Yang perlu diganti sebelum publish

Semua nilai ini terpusat agar mudah diganti:

| Yang | Lokasi | Nilai sekarang |
|---|---|---|
| Nomor WhatsApp | `script.js` → `CONFIG.waNumber` | `6288212725000` |
| Nomor WA di HTML | `index.html`, semua `href="https://wa.me/…"` | `6288212725000` |
| Nomor tampil di halaman | `index.html` → CTA penutup | `0882-1272-5000` |
| Domain | `index.html` → `<link rel="canonical">`, `og:url` | `https://web-card-iota.vercel.app` (sudah diganti dari `example.com`) |
| Gambar Open Graph | `index.html` → `og:image` | `https://web-card-iota.vercel.app/assets/og-cover.png` (1200×630, dari crop hero — bukan render `og-cover.svg`) |
| Statistik bisnis | `index.html` → `data-count` | 4,9 / 3 dtk / 90% / 2 hari — **CONTOH, wajib ganti data asli** |
| Testimoni | `index.html` → `.tcard` | 7 testimoni — **CONTOH, wajib ganti testimoni asli** |

Nomor WhatsApp diubah di dua tempat: `CONFIG.waNumber` di `script.js` (dipakai JS) dan
atribut `href` di HTML (supaya tetap berfungsi tanpa JS). Setelah ganti nomor,
jalankan `test-runtime.mjs` untuk memastikan tautannya benar.

Kontak hanya lewat WhatsApp — tidak ada email di halaman.

> **Catatan jujur sebelum publish:** angka statistik (4,9 / 3 detik / 90% / 2 hari)
> dan ketujuh testimoni di halaman ini masih **contoh karangan**, bukan data
> bisnis nyata — ganti dengan data asli sebelum dipakai untuk menjual.
> Domain di `canonical` dan `og:url` sudah `https://web-card-iota.vercel.app`, dan `og:image` sudah URL absolut ke `assets/og-cover.png`. Nomor WhatsApp
> yang dipakai di seluruh halaman adalah `6288212725000` (`CONFIG.waNumber`
> di `script.js` dan semua `href="https://wa.me/6288212725000"` di HTML).

## Sistem desain

**Palet** — putih `#fff`, abu terang `#f5f5f7`, hitam `#000`, teks abu `#6e6e73`,
aksen tunggal biru `#0b57d0` (varian gelap `#0842a0`, varian terang `#1a73e8`).
Hijau `#25d366` hanya untuk tombol WhatsApp. Biru `#1a73e8` yang dulu jadi aksen
utama kini hanya dipakai sebagai `--blue-l` (varian terang).

**Tipografi** — `-apple-system` / `SF Pro Display` / `Inter`. Headline `clamp(40px → 84px)`
weight 700 `letter-spacing -0.028em`. Sub-headline 17–24px warna abu.

**Bentuk** — radius 32px (kartu besar), 24px (kartu sedang), 16px (kecil),
980px (pil). Bayangan lembut berlapis.

**Layout** — lebar konten maks. 1180px, padding `clamp(20px, 5vw, 40px)`,
setiap section minimal 100vh dengan selang-seling terang/gelap.

## Peta animasi

| Section | Animasi | Trigger |
|---|---|---|
| Preloader | wordmark + progress bar, tirai atas | sekali muat |
| Navbar | glass blur, hide/show saat scroll, progress bar | scroll |
| Hero | headline stagger per kata, kartu 3D masuk dari bawah, float loop, mouse tilt, glow parallax | load + scroll |
| Showcase | kartu ter-pin, berayun ±26°, zoom, HP mendekat, gelombang NFC, garis scan QR, bintang menyala, routing 4★/1★ | scroll (desktop) |
| Fitur | bento grid fade-up stagger, hover scale + glow yang mengikuti kursor | scroll |
| Cara kerja | 3 langkah stagger, garis konektor `scaleX` | scroll |
| Statistik | count-up angka, garis pemisah tumbuh, panel routing | scroll |
| Testimoni | marquee 2 baris, opposite direction, pause saat hover | otomatis |
| Harga | count-up harga, kartu stagger, glow pada paket Pro | scroll |
| FAQ | accordion tinggi halus + ikon berputar | klik |
| CTA penutup | scroll-linked, kata menyala berurutan | scroll |
| Global | Lenis smooth scroll, magnetic hover, ripple, FAB, modal form | interaksi |

## Catatan teknis

**Hanya transform & opacity** yang dianimasikan. `will-change` tidak lagi permanen —
dipasang hanya saat elemen benar-benar bergerak (kelas `.is-animating`), lalu dilepas.
Perubahan layout (tinggi FAQ) memakai GSAP height, satu-satunya property layout yang
dianimasikan, dan hanya saat pengguna menekan tombol.

**Pinned storytelling hanya di desktop** (≥941px). Di bawah itu, ScrollTrigger dimatikan
dan lima tahap ditampilkan sebagai daftar statis. Bobotnya tidak seberat animasi 3D,
dan tidak ada pin yang menyembunyikan konten saat JS gagal.

**`prefers-reduced-motion`** mematikan: preloader dilewati, semua elemen langsung tampil,
marquee berhenti, pulse FAB berhenti, pin tidak aktif. Konten tetap 100% terbaca.

**Tanpa JavaScript** — masih bermasalah di salinan ini: aturan `.no-js` ada di
`style.css` (termasuk `.no-js .preloader { display: none; }`), tapi kelas
`no-js` tidak pernah dipasang di `<html>` (`index.html` baris 2 polos), sehingga
preloader menutupi halaman selamanya kalau JS mati. Perbaiki dulu sebelum
mengklaim halaman utuh tanpa JS. Semua CTA tetap berupa tautan `wa.me` yang
berfungsi tanpa JS.

**Parallax dihindari di section yang di-pin** — posisi `fixed` dari ScrollTrigger akan
berebut dengan transform berbasis scroll.

## Catatan performa

Pengukuran dilakukan dengan Chrome DevTools Protocol, scroll didorong dari dalam
`requestAnimationFrame` (supaya loop Lenis ikut terukur) dan diverifikasi sekali lewat
`Input.dispatchMouseEvent(mouseWheel)`. CPU di-throttle 4x agar meniru HP kelas menengah.

**Cara mengukur yang benar.** `Tracing` domain tidak menghasilkan event di build Chrome
yang dipakai di sini (nol event, baik dengan maupun tanpa GPU), sehingga metrik
paint/composite dari tracing tidak bisa dipercaya. rAF spacing juga tidak cukup: nilainya
16,7 ms walau thread utama sibuk. Yang dipakai: `Performance.getMetrics` (akumulasi
style/layout/script), `PerformanceObserver('longtask')`, `'long-animation-frame'`, dan
penghitungan elemen ber-`will-change` sebagai proksi layer GPU.

**Before → after** (throttle 4x, 2 run × 6 detik per viewport):

| Metrik | Sebelum | Sesudah |
|---|---|---|
| Elemen dipromosikan jadi layer | 118 | 0 (hanya saat aktif) |
| `will-change` pada `.word__i` | 57 (permanen) | 0 |
| Loop tak berujung saat hero off-screen | 4 aktif | 0 |
| `backdrop-filter` | 2 elemen | 1 (hanya navbar, 20px → 10px) |
| `filter: blur()` | 2 elemen | 0 (diganti gradient) |
| Frame time p95 mobile | 18,1 ms | 17,5 ms |
| Frame terparah mobile | 49,8 ms | 19,5 ms |
| Kerja/frame mobile (p95) | 2,0 ms | 1,7 ms |
| Kerja/frame mobile (max) | 35,6 ms | 2,7 ms |

Yang bisa diklaim: jejak layer dan efek turun drastis, dan tidak ada regresi di thread
utama. Yang **tidak** bisa diklaim dari lingkungan ini: perbaikan jank GPU yang dirasakan
di perangkat asli. Headless M1 jauh lebih cepat dari HP yang dipakai pengujian, dan
`--disable-gpu` menyembunyikan kompositor sepenuhnya. Verifikasi akhir tetap harus di
perangkat nyata.

**Cara menjaga ini.** `will-change` dipasang lewat kelas `.is-animating` yang ditambahkan
JS pada `onStart` tween dan dilepas pada `onComplete` — bukan pada saat tween dibuat.
Kalau dipasang saat pembuatan, elemen yang masih menunggu ScrollTrigger ikut mendapat
layer. Reveal bento/plan/step sengaja **tidak** dipromosikan: 8 kartu sekaligus
justru memicu long task 53 ms, dan slide 34 px selama 0,9 s lebih murah dipaint langsung.

Loop tak berujung dijaga `IntersectionObserver` (`gateOnVisibility`): saat hero keluar
layar, keempat loop dihentikan; saat kembali, dibuat ulang. `test-gating.mjs` menjaga
perilaku ini.

## Mockup HP di section showcase

Isi layar HP adalah mockup perangkat, bukan UI situs. Tiga aturan yang dipegang:

- **Satu kolom flex, tanpa absolute.** Tiap `.phone__view` adalah
  `display:flex; flex-direction:column`. Konten flowed, bukan ditumpuk — judul di
  atas, blok tengah (bintang / kartu routing) dengan `margin-block:auto` supaya
  terpusat, kaki layar dengan `margin-top:auto` supaya menempel di bawah.
- **Ukuran relatif.** Semua font memakai `cqw` (container query unit) terhadap
  lebar `.phone__screen` yang punya `container-type: inline-size`. Mockup ikut
  berskala di viewport mana pun tanpa media query.
- **Hanya satu view terlihat.** `showView()` hanya menukar kelas `.is-active`
  antar `.phone__view` (CSS yang mengatur opacity/visibility). View yang
  ditinggalkan tidak lagi dipaksa lewat tween — pergantiannya kini terjadi di
  dalam timeline scrub showcase (lihat "Perubahan terakhir"), jadi posisi
  scroll yang sama selalu menampilkan view yang sama.

Kartu produk diberi "zona aman": `padding-right: 42%` membuat semua teks terkumpul
di kolom kiri, sehingga HP yang menumpuk di kanan hanya menutupi area kosong.
Dinormalkan lewat `#showcaseCard .card-3d__face`.

## Cara menguji layout

`test-visual.mjs` memindai **7 viewport** (1920, 1440, 1280, 1024, 834, 390, 360)
dan **5 langkah showcase** di desktop (showcase tidak di-pin di bawah 941px, jadi
di sana section utuh yang dipindai). Yang diperiksa:

| Cek | Cara |
|---|---|
| Tumpang tindih teks | perpotongan bounding box antar elemen teks daun |
| Teks terpotong | `scrollWidth > clientWidth` pada elemen yang bukan ellipsis |
| Container overflow | `scrollWidth > clientWidth` pada container ber-`overflow: visible` |
| HP menutupi teks kartu | perpotongan rect **setelah transform dipaksa `none`** |
| Dua view HP terlihat | semua `.phone__view` dengan `opacity > 0.05` |
| Isi layar tidak tersebar | rasio tinggi isi / tinggi layar < 55% |
| Isi menabrak notch | anak pertama vs `.phone__island` |

Dua jebakan yang membuat tes ini mudah berbohong, dan cara mengatasinya:

1. **Backface.** `.card-3d__face--back` dirotasi 180° dengan
   `backface-visibility:hidden` — computed style-nya `opacity: 1` tapi tidak
   terlihat. Visibilitas diuji dengan `elementFromPoint` (5 titik sampel),
   bukan dari gaya komputasi..
2. **Rotasi & 3D.** Bounding box elemen yang diputar lebih besar dari isinya, dan
   kartu memakai `transform-style: preserve-3d` sehingga urutan cat mengikuti
   posisi 3D — `elementFromPoint` tidak bisa dipakai sebagai penentu "tertutup
   atau tidak". Pengukuran geometris dinormalkan lewat stylesheet `!important`
   yang disuntik lalu dihapus, **bukan** `el.style.transform = 'none'` yang
   merusak state transform internal GSAP.
3. **Backtick di dalam template literal** dan `ev()` yang mengembalikan
   `undefined` saat halaman melempar error membuat audit yang gagal diam-diam
   terlihat "bersih". Sekarang `ev()` melempar exception.

> Catatan: file `verify-test-catches-bug.mjs` yang dulu membuktikan
> sensitivitas tes ini **tidak ada di repo** (tidak ada di `ls *.mjs`),
> jadi klaim bukti sensitivitas di bawah ini sudah dihapus — jangan
> mengandalkannya sampai skrip pembuktiannya ditulis ulang dan
> benar-benar dijalankan.

## Hasil pengujian

```
check.mjs           OK semua tag seimbang; alt/label/aria/id valid
test-runtime.mjs    44/44 PASS, console bersih (tanpa error/warning)
test-visual.mjs     0 temuan di 7 viewport × 5 langkah showcase
test-overlap.mjs    PASS — FAB tidak menutupi CTA, tetap di bawah dialog
test-gating.mjs     loop 4 → 0 saat hero off-screen, 0 sisa is-animating
test-perf.mjs       SEMUA TARGET: p95 < 20 ms, kerja/frame p95 < 8 ms
```

Rincian: 5 tahap showcase terlewati berurutan saat scroll, bintang menyala 5/5,
count-up menghasilkan format Indonesia (`4,9`, `100.000`), form pesanan membuka
`wa.me` dengan pesan terisi, FAQ bersifat akordeon, tidak ada horizontal overflow
di posisi scroll mana pun.

Jalankan ulang:

```bash
python3 -m http.server 8899 &   # atau: node serve.mjs . 8899
node check.mjs
node test-runtime.mjs
node test-visual.mjs
node test-perf.mjs             # CPU throttle 4x
```

Untuk membandingkan dua versi, jalankan server untuk masing-masing lalu arahkan
`TARGET` ke URL yang mau diukur:

```bash
node serve.mjs /path/ke/versi/lama 8907 &
TARGET=http://localhost:8907/index.html LABEL=before node test-perf.mjs
TARGET=http://localhost:8899/index.html LABEL=after  node test-perf.mjs
```

Screenshot tiap langkah showcase ada di `screenshots/`, screenshot section di
`shots/`, hasil pengukuran di `perf/`.

## Perubahan terakhir (2026-11-22)

Yang sudah terverifikasi di salinan repo ini:

- **Warna biru digelapkan** — aksen utama `--blue` di `style.css` dari
  `#1a73e8` menjadi `#0b57d0` (hover `--blue-d` `#0842a0`, varian terang
  `--blue-l` kini `#1a73e8`), termasuk glow, avatar testimoni, dan
  `assets/og-cover.svg`. Biru terang `#7aa9ff` di section gelap sengaja
  dipertahankan supaya teks tetap terbaca di atas hitam.
- **Showcase dirombak jadi fully scroll-linked** (`script.js`, commit
  `88c95ca`) — array `beatFx` dan `basePhone` yang lama (tween berbasis
  waktu yang dipicu `onUpdate`) dihapus. Semua efek per beat — HP masuk,
  gelombang NFC, scan QR, bintang menyala, routing, teks beat, ganti view —
  kini adalah tween di dalam timeline scrub di `initShowcase`: 1 unit waktu
  = 1 beat, `scrub: 0.15`, Lenis `duration: 0.7`. `setBeat()`/`showView()`
  sekarang hanya menukar kelas; posisi scroll yang sama = frame yang sama.
  Ikut diperbaiki: zoom kartu yang dulu salah posisi (baru ~13–17% timeline)
  kini benar di beat bintang/routing, dan scale kartu dibuat berurutan supaya
  tidak lompat saat zoom selesai.

> Audit 2026-11-22 menemukan bug lain (preloader tanpa JS, beat 1 hilang saat masuk pin, teks beat hilang di mobile, kontras rendah, FAQ race, dll.) — semuanya sudah diperbaiki di commit perbaikan bug yang sama dengan perubahan ini. Kelas `.no-js` kini dipasang di `<html>` dan diganti jadi `js` oleh `script.js`.

## Menyesuaikan

**Warna aksen** — ubah `--blue` di `:root` (`style.css`). Semua biru di halaman
mengikuti variabel itu; `--blue-d` untuk hover, `--blue-l` untuk varian terang.
Isi SVG di `assets/` (mis. `og-cover.svg`) memakai warna hardcode dan harus
diubah manual kalau aksen diganti.

**Jumlah paket** — tambah/hapus `<article class="plan">`. Badge "Paling populer"
pakai kelas `.plan--pro`.

**Tahap showcase** — tambah `<article class="beat">`, sesuaikan `data-dot` di
`#showcaseDots`. Jumlah tahap ikut terbaca otomatis dari banyaknya `.beat`.
Efek per beat **bukan** lagi array `beatFx` (sudah dihapus di commit `88c95ca`) —
tambah efek baru sebagai tween di dalam timeline scrub di `initShowcase`
(`script.js`), di posisi beat yang bersangkutan, misalnya
`tl.fromTo(phone, {...}, {...}, 1)` untuk beat 1 atau
`tl.fromTo(qrScan, {...}, {...}, 2.1)` untuk beat 2. Satu unit waktu timeline
= satu beat, jadi posisi `0` = beat 0, `1` = beat 1, dan seterusnya.
`setBeat()`/`showView()` hanya menukar kelas dan jangan dipakai untuk
animasi berbasis waktu — itu yang dulu bikin scroll terasa tidak smooth.

/* ==========================================================================
   Google Card Review — script.js
   GSAP + ScrollTrigger + Lenis
   Semua animasi hormati prefers-reduced-motion.
   Hanya transform & opacity yang dianimasikan (60fps).
   ========================================================================== */
(() => {
  'use strict';

  /* ---------- KONFIGURASI (GANTI NILAI INI) ---------- */
  const CONFIG = {
    waNumber: '6288212725000',        // GANTI: nomor WhatsApp tanpa "+" / spasi
    brand: 'Google Card Review',
    waDefaultMsg: 'Halo Google Card Review, saya mau tanya soal kartu NFC + QR untuk ulasan Google.',
  };

  const doc = document;
  const root = doc.documentElement;
  const $ = (s, c = doc) => c.querySelector(s);
  const $$ = (s, c = doc) => Array.from(c.querySelectorAll(s));

  const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const hasGSAP = typeof window.gsap !== 'undefined' && typeof window.ScrollTrigger !== 'undefined';
  const hasLenis = typeof window.Lenis !== 'undefined';

  doc.documentElement.classList.add('js');

  /* ---------- UTILITAS ---------- */
  const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
  const lerp = (a, b, t) => a + (b - a) * t;
  const fmtIDR = (n) => 'Rp ' + n.toLocaleString('id-ID');

  /* tinggi navbar di-cache; di-refresh dari handler resize */
  let navHeight = 0;

  const waLink = (msg) =>
    `https://wa.me/${CONFIG.waNumber}?text=${encodeURIComponent(msg || CONFIG.waDefaultMsg)}`;

  /* Pecah teks jadi kata yang bisa dianimasikan satu per satu.
     Kata setelah `mutedFrom` diberi kelas .word--muted supaya pembedaan
     visual (mis. dua warna di headline) tetap terjaga. */
  function splitWords(el, mutedFrom = Infinity) {
    if (el.dataset.splitDone) return $$('.word__i', el);
    const words = el.textContent.trim().split(/\s+/);
    el.textContent = '';
    const spans = [];
    words.forEach((w, i) => {
      const wrap = doc.createElement('span');
      wrap.className = 'word';
      if (i >= mutedFrom) wrap.classList.add('word--muted');
      const inner = doc.createElement('span');
      inner.className = 'word__i';
      inner.textContent = w;
      wrap.appendChild(inner);
      el.appendChild(wrap);
      spans.push(inner);
      if (i < words.length - 1) el.appendChild(doc.createTextNode(' '));
    });
    el.dataset.splitDone = '1';
    return spans;
  }

  /* =======================================================================
     0. DATA DINAMIS: BINTANG, TAHUN, WHATSAPP
     ======================================================================= */
  function buildStars() {
    $$('[data-stars]').forEach((el) => {
      const n = Number(el.dataset.stars) || 5;
      el.textContent = '';
      for (let i = 0; i < n; i++) {
        const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('aria-hidden', 'true');
        const use = doc.createElementNS('http://www.w3.org/2000/svg', 'use');
        use.setAttribute('href', '#i-star');
        svg.appendChild(use);
        el.appendChild(svg);
      }
    });
  }

  function bindWaLinks() {
    $$('[data-wa]').forEach((a) => {
      const msg = a.dataset.msg || a.closest('[data-plan]')?.querySelector('.plan__name')?.textContent;
      a.href = waLink(msg);
      a.target = '_blank';
      a.rel = 'noopener';
    });
  }

  buildStars();
  bindWaLinks();

  const yearEl = $('#year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  /* =======================================================================
     1. NAVBAR: glass, hide/show saat scroll, progress bar, mobile menu
     ======================================================================= */
  function initNav() {
    const nav = $('#nav');
    const burger = $('#burger');
    const menu = $('#mobileMenu');
    const progress = $('#navProgress');
    if (!nav) return;

    let lastY = window.scrollY;
    let ticking = false;
    /* doc.body.scrollHeight dipanggil tiap frame = layout read berulang.
       Nilainya hanya berubah saat resize atau ada konten yang mengubah
       tinggi halaman, jadi cukup di-cache dan di-update dari resize handler. */
    let maxScroll = Math.max(1, doc.body.scrollHeight - window.innerHeight);

    const onScroll = () => {
      const y = window.scrollY;
      const scrolled = y > 8;
      /* hindari tulis class kalau nilainya tidak berubah — class toggle
         memicu style recalculation untuk seluruh subtree */
      if (nav.classList.contains('is-scrolled') !== scrolled) nav.classList.toggle('is-scrolled', scrolled);

      if (y > 220 && y > lastY + 4) nav.classList.add('is-hidden');
      else if (y < lastY - 4 || y < 80) nav.classList.remove('is-hidden');
      lastY = y;

      if (progress) {
        const p = clamp(y / maxScroll, 0, 1);
        progress.style.transform = `scaleX(${p.toFixed(4)})`;
      }
      ticking = false;
    };

    window.addEventListener('scroll', () => {
      if (!ticking) { ticking = true; requestAnimationFrame(onScroll); }
    }, { passive: true });
    onScroll();

    const refreshMaxScroll = () => {
      maxScroll = Math.max(1, doc.body.scrollHeight - window.innerHeight);
      navHeight = $('#nav')?.offsetHeight || 48;
    };
    window.addEventListener('resize', refreshMaxScroll, { passive: true });
    window.addEventListener('orientationchange', refreshMaxScroll, { passive: true });
    if ('ResizeObserver' in window) {
      /* konten dinamis (gambar lazy-load) juga mengubah tinggi halaman */
      new ResizeObserver(refreshMaxScroll).observe(doc.body);
    }

    /* burger */
    if (burger && menu) {
      const setOpen = (open) => {
        burger.setAttribute('aria-expanded', String(open));
        burger.setAttribute('aria-label', open ? 'Tutup menu' : 'Buka menu');
        if (open) {
          menu.hidden = false;
          requestAnimationFrame(() => menu.classList.add('is-open'));
          menu.dispatchEvent(new CustomEvent('menu:open'));
        } else {
          menu.classList.remove('is-open');
          menu.dispatchEvent(new CustomEvent('menu:close'));
          setTimeout(() => { if (burger.getAttribute('aria-expanded') === 'false') menu.hidden = true; }, 320);
        }
      };

      burger.addEventListener('click', () => {
        setOpen(burger.getAttribute('aria-expanded') !== 'true');
      });

      $$('a, button', menu).forEach((el) => el.addEventListener('click', () => setOpen(false)));
      doc.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && burger.getAttribute('aria-expanded') === 'true') { setOpen(false); burger.focus(); }
      });

      /* Stagger isi menu saat dibuka. Opacity panel dipakai CSS transition,
         jadi GSAP hanya menyentuh anak-anaknya — menghindari inline style
         yang menimpa class .is-open. */
      if (hasGSAP && !REDUCED) {
        let menuTl = null;
        const items = [...$$('.mobile-menu__nav a'), ...$$('.mobile-menu .btn, .mobile-menu__wa')];
        menu.addEventListener('menu:open', () => {
          menuTl?.kill();
          menuTl = gsap.timeline()
            .fromTo(items, { y: 26, opacity: 0 },
              { y: 0, opacity: 1, duration: 0.5, stagger: 0.055, ease: 'power3.out', clearProps: 'transform' });
        });
        menu.addEventListener('menu:close', () => {
          menuTl?.kill();
          gsap.to(items, { y: 0, opacity: 0, duration: 0.18, ease: 'power2.in' });
        });
      }
    }

    /* smooth scroll untuk link anchor */
    if (!REDUCED) {
      $$('a[href^="#"]').forEach((a) => {
        a.addEventListener('click', (e) => {
          const id = a.getAttribute('href');
          if (!id || id === '#') return;
          const t = $(id);
          if (!t) return;
          e.preventDefault();
          scrollToEl(t);
        });
      });
    }
  }

  function scrollToEl(target) {
    /* navH di-cache: offsetHeight adalah layout read, dan nilainya tetap
       (navbar fixed 48px) kecuali layar berubah ukuran */
    const navH = navHeight || (navHeight = $('#nav')?.offsetHeight || 48);
    const y = target.getBoundingClientRect().top + window.scrollY - navH - 8;
    if (window.__lenis) window.__lenis.scrollTo(y, { duration: 1.15 });
    else window.scrollTo({ top: y, behavior: 'smooth' });
  }

  /* =======================================================================
     2. LENIS SMOOTH SCROLL
     ======================================================================= */
  function initLenis() {
    if (REDUCED || !hasLenis) return;
    const lenis = new Lenis({
      duration: 1.05,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      touchMultiplier: 1.6,
    });
    window.__lenis = lenis;

    if (hasGSAP) {
      lenis.on('scroll', ScrollTrigger.update);
      gsap.ticker.add((time) => lenis.raf(time * 1000));
      gsap.ticker.lagSmoothing(0);
    } else {
      const raf = (t) => { lenis.raf(t); requestAnimationFrame(raf); };
      requestAnimationFrame(raf);
    }
  }

  /* =======================================================================
     3. PRELOADER
     ======================================================================= */
  function initPreloader() {
    const pre = $('#preloader');
    if (!pre) return Promise.resolve();

    const done = () => { pre.remove(); };

    if (REDUCED || !hasGSAP) { done(); return Promise.resolve(); }

    doc.body.classList.add('is-locked');

    return new Promise((resolve) => {
      const bar = $('#preloaderBar');
      const word = $('#preloaderWord');
      const mark = $('.preloader__mark');
      const curtain = $('.preloader__curtain');

      const tl = gsap.timeline({ onComplete: () => { done(); resolve(); } });
      tl.set(pre, { autoAlpha: 1 })
        .fromTo(mark, { scale: 0.6, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.6, ease: 'back.out(2)' })
        .fromTo(word, { y: 18, opacity: 0 }, { y: 0, opacity: 1, duration: 0.55, ease: 'power3.out' }, 0.15)
        .fromTo(bar, { scaleX: 0 }, { scaleX: 1, duration: 0.85, ease: 'power2.inOut' }, 0.2)
        .to('.preloader__inner', { y: -18, opacity: 0, duration: 0.4, ease: 'power2.in' }, 0.95)
        .to(curtain, { scaleY: 0, duration: 0.75, ease: 'power4.inOut', transformOrigin: 'top' }, 1.02)
        .to(pre, { autoAlpha: 0, duration: 0.01 }, 1.74)
        .add(() => doc.body.classList.remove('is-locked'), 1.2);
    });
  }

  /* =======================================================================
     4. HERO: split headline, kartu 3D, tilt mouse, parallax
     ======================================================================= */
  function initHero() {
    const hero = $('#hero');
    if (!hero) return;

    /* "Satu tap." (2 kata) hitam, sisanya abu — satu headline, dua nada */
    const titleEl = $('.hero__title');
    const titleWords = titleEl ? splitWords(titleEl, 2) : [];
    const anims = $$('[data-anim]', hero);

    if (REDUCED || !hasGSAP) {
      titleWords.forEach((w) => { w.style.opacity = 1; });
      anims.forEach((a) => { a.style.opacity = 1; a.style.transform = 'none'; });
      return;
    }

    /* state awal kata: digeser keluar dari mask .word lalu naik kembali */
    gsap.set(titleWords, { yPercent: 108, opacity: 0 });

    const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
    tl.to(titleWords, {
      yPercent: 0, opacity: 1, duration: 0.9, stagger: 0.045,
    })
    .to(anims, {
      y: 0, opacity: 1, duration: 0.85, stagger: 0.09,
    }, 0.25);

    /* --- kartu 3D --- */
    const card = $('#heroCard');
    const stage = $('.hero__stage');
    const shadow = $('.hero__shadow');
    if (card) {
      const sheen = $('.card__sheen');

      gsap.set(card, { rotateX: 46, rotateY: 22, yPercent: 42, scale: 0.86, transformPerspective: 1200 });

      tl.to(card, {
        rotateX: 13, rotateY: -16, yPercent: 0, scale: 1,
        duration: 1.5, ease: 'power4.out',
      }, 0.1);

      /* Loop tak berujung: dulu 4 tween berjalan terus meski hero di luar
         layar. Sekarang hanya jalan saat hero benar-benar terlihat. */
      gateOnVisibility(hero, () => {
        card.classList.add('is-animating');
        shadow?.classList.add('is-animating');
        sheen?.classList.add('is-animating');

        const loops = [
          gsap.to(card, {
            rotateY: '+=6', rotateX: '+=2.5', y: '-=16',
            duration: 3.6, ease: 'sine.inOut', yoyo: true, repeat: -1, delay: 1.7,
          }),
          shadow && gsap.to(shadow, {
            scaleX: 0.82, opacity: 0.55, duration: 3.6, ease: 'sine.inOut', yoyo: true, repeat: -1, delay: 1.7,
          }),
          sheen && gsap.fromTo(sheen, { xPercent: -60 },
            { xPercent: 60, duration: 2.4, ease: 'power2.inOut', delay: 1.9, repeat: -1, repeatDelay: 3.4 }),
        ].filter(Boolean);
        return { kill: () => { loops.forEach((l) => l.kill()); [card, shadow, sheen].forEach((e) => e?.classList.remove('is-animating')); } };
      });
    }

    /* --- tilt mouse ---
       getBoundingClientRect() dipanggil di dalam mousemove = layout read
       di setiap event mouse. Di-cache, dan hanya di-refresh saat pointer
       masuk atau layout berubah. */
    if (stage && card && !window.matchMedia('(hover: none)').matches) {
      const qx = gsap.quickTo(card, 'rotationX', { duration: 0.7, ease: 'power3.out' });
      const qy = gsap.quickTo(card, 'rotationY', { duration: 0.7, ease: 'power3.out' });
      const qy2 = gsap.quickTo(card, 'y', { duration: 0.9, ease: 'power3.out' });

      let rect = null;
      const cacheRect = () => { rect = stage.getBoundingClientRect(); };
      cacheRect();
      stage.addEventListener('mouseenter', cacheRect, { passive: true });

      stage.addEventListener('mousemove', (e) => {
        if (!rect) cacheRect();
        const px = (e.clientX - rect.left) / rect.width - 0.5;
        const py = (e.clientY - rect.top) / rect.height - 0.5;
        qx(13 + py * -16);
        qy(-16 + px * 22);
        qy2(py * -14);
      });
      stage.addEventListener('mouseleave', () => {
        rect = null;
        qx(13); qy(-16); qy2(0);
      });
    }

    /* scroll cue — juga hanya hidup saat hero terlihat */
    const scrollCue = $('.hero__scroll i');
    if (scrollCue) {
      gateOnVisibility($('.hero__scroll'), () => {
        scrollCue.classList.add('is-animating');
        const t = gsap.fromTo(scrollCue, { scaleY: 0.2, transformOrigin: 'top' },
          { scaleY: 1, duration: 1.1, ease: 'power2.inOut', repeat: -1, yoyo: true });
        return { kill: () => { t.kill(); scrollCue.classList.remove('is-animating'); } };
      });
      gsap.to('.hero__scroll', { opacity: 0, scrollTrigger: { trigger: hero, start: 'top top', end: '+=200', scrub: 0.5 } });
    }
  }

  /* =======================================================================
     5. SCROLL-PINNED SHOWCASE
     ======================================================================= */
  function initShowcase() {
    const section = $('#cara-kerja');
    const pin = $('#showcasePin');
    if (!section || !pin) return;

    const card = $('#showcaseCard');
    const phone = $('#phone');
    const beats = $$('.beat');
    const dots = $$('#showcaseDots button');
    const waves = $$('#nfcWaves i');
    const qrScan = $('#qrScan');
    const phStars = $$('#phStars .ph-star');
    const phHint = $('#phHint');
    const views = $$('.phone__view');
    const titleWords = splitWords($('#showcaseTitle'));

    const nBeats = beats.length;

    /* dot click -> scroll ke posisi beat */
    dots.forEach((d, i) => {
      d.addEventListener('click', () => {
        if (!hasGSAP) return;
        const st = ScrollTrigger.getById('showcaseST');
        if (!st) return;
        const p = (i + 0.5) / nBeats;
        const top = st.start + (st.end - st.start) * p;
        if (window.__lenis) window.__lenis.scrollTo(top, { duration: 0.8 });
        else window.scrollTo({ top, behavior: 'smooth' });
      });
    });

    /* keyboard: kiri/kanan pindah beat saat showcase di viewport */
    section.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const st = ScrollTrigger.getById('showcaseST');
      if (!st || !st.isActive) return;
      e.preventDefault();
      const dir = e.key === 'ArrowRight' ? 1 : -1;
      const cur = Math.floor(st.progress * nBeats);
      const next = clamp(cur + dir, 0, nBeats - 1);
      const top = st.start + (st.end - st.start) * ((next + 0.5) / nBeats);
      if (window.__lenis) window.__lenis.scrollTo(top, { duration: 0.7 });
      else window.scrollTo({ top, behavior: 'smooth' });
    });

    if (REDUCED || !hasGSAP) {
      beats.forEach((b) => b.classList.add('is-active'));
      titleWords.forEach((w) => w.classList.add('is-lit'));
      if (card) card.style.transform = 'perspective(1200px) rotateX(8deg) rotateY(-14deg)';
      if (phone) phone.style.opacity = 1;
      views.forEach((v) => v.classList.add('is-active'));
      phStars.forEach((s) => s.classList.add('is-lit'));
      return;
    }

    /* set state awal — properties headline diatur lewat kelas .is-lit,
       sehingga transisinya berupa perubahan warna, bukan opacity whole-word */
    titleWords[0]?.classList.add('is-lit');
    gsap.set(beats, { autoAlpha: 0 });
    gsap.set(beats[0], { autoAlpha: 1 });
    gsap.set(phStars, { scale: 0.4, opacity: 0.35 });

    const setBeat = (i) => {
      beats.forEach((b, bi) => b.classList.toggle('is-active', bi === i));
      dots.forEach((d, di) => d.setAttribute('aria-selected', String(di === i)));
      const lit = Math.max(1, Math.round(((i + 1) / nBeats) * titleWords.length));
      titleWords.forEach((w, wi) => w.classList.toggle('is-lit', wi < lit));

      /* teks beat: slide + fade, hanya dua beat terakhir yang terlihat */
      beats.forEach((b, bi) => {
        if (bi === i) {
          gsap.fromTo(b, { autoAlpha: 0, y: 24 },
            { autoAlpha: 1, y: 0, duration: 0.5, ease: 'power3.out', overwrite: true });
        } else if (bi === i - 1) {
          gsap.to(b, { autoAlpha: 0, y: -16, duration: 0.32, ease: 'power2.in', overwrite: 'auto' });
        } else {
          gsap.set(b, { autoAlpha: 0 });
        }
      });
    };

    /* Hanya satu view layar yang boleh terlihat pada satu waktu.
       Sebelumnya view lama ikut terlihat selama transisi, sehingga
       "Seberapa puas pengalaman Anda?" dan label "4-5 ★ / Ke Google
       Review" tampil bersamaan dan saling menimpa. Sekarang view yang
       ditinggalkan langsung dipaksa autoAlpha 0 (tween-nya dibunuh
       dulu) sebelum view baru ditampilkan. */
    const showView = (name) => {
      views.forEach((v) => {
        if (v.dataset.view === name) return;
        v.classList.remove('is-active');
        gsap.killTweensOf(v);
        gsap.set(v, { autoAlpha: 0, scale: 1 });
      });
      const next = views.find((v) => v.dataset.view === name);
      if (next) {
        next.classList.add('is-active');
        gsap.set(next, { autoAlpha: 1 });
      }
    };

    /* Pose dasar HP. Effect tiap beat boleh menimpa, tapi state dasar
       ini dipasang ulang setiap beat supaya deep-link atau scroll cepat
       tidak meninggalkan HP dalam kondisi tak terlihat. */
    const basePhone = (visible) => {
      if (visible) {
        gsap.set(phone, { autoAlpha: 1, scale: 1, y: 0, rotate: -5 });
      } else {
        gsap.set(phone, { autoAlpha: 0, scale: 0.85, y: 0, rotate: 0 });
      }
    };

    /* efek per beat */
    const beatFx = [
      /* 01 — kartu di meja, HP belum muncul */
      () => {
        basePhone(false);
        showView('google');
        gsap.set(waves, { scale: 0.3, opacity: 0 });
      },

      /* 02 — HP mendekat, gelombang NFC berdenyut */
      () => {
        showView('google');
        gsap.fromTo(phone,
          { autoAlpha: 0, y: 90, rotate: 10, scale: 0.82 },
          { autoAlpha: 1, y: 0, rotate: -5, scale: 1, duration: 1.1, ease: 'power3.out', overwrite: 'auto' });
        waves.forEach((w, i) => {
          gsap.fromTo(w,
            { scale: 0.3, opacity: 0.9 },
            { scale: 5.4, opacity: 0, duration: 1.6, ease: 'power2.out', repeat: 3, delay: i * 0.28, overwrite: true });
        });
        gsap.to($('#showcaseCard .card__nfc'), { opacity: 0.2, duration: 0.6, yoyo: true, repeat: 3, overwrite: 'auto' });
      },

      /* 03 — scan QR, garis cahaya melintas */
      () => {
        showView('google');
        gsap.set(phone, { rotate: 4, overwrite: 'auto' });
        gsap.set(waves, { scale: 0.3, opacity: 0 });
        gsap.fromTo(qrScan,
          { opacity: 0, y: 0 },
          { opacity: 1, y: 250, duration: 1.05, ease: 'power1.inOut', repeat: 1, overwrite: true });
        gsap.to(qrScan, { opacity: 0, duration: 0.3, delay: 2.1, overwrite: false });
      },

      /* 04 — layar rating, bintang menyala satu per satu */
      () => {
        showView('rating');
        gsap.set(phone, { rotate: -4, overwrite: 'auto' });
        phStars.forEach((s, i) => {
          s.classList.add('is-lit');
          /* beat 05 menulis colorAbu secara INLINE; inline mengalahkan
             kelas .is-lit, jadi harus dibersihkan di sini supaya
             bintang benar-benar menyala lagi saat user scroll balik. */
          gsap.set(s, { clearProps: 'color' });
          gsap.fromTo(s, { scale: 0.45 },
            { scale: 1, duration: 0.32, delay: 0.1 + i * 0.15, ease: 'back.out(3)', overwrite: 'auto' });
        });
        gsap.fromTo(phHint, { opacity: 0.4 }, { opacity: 1, duration: 0.6, delay: 1.05, overwrite: 'auto' });
      },

      /* 05 — routing: 4–5 bintang ke Google, 1–3 ke WhatsApp */
      () => {
        showView('route');
        const routeView = views.find((v) => v.dataset.view === 'route');
        if (routeView) {
          gsap.fromTo(routeView,
            { scale: 0.94 }, { scale: 1, duration: 0.55, ease: 'back.out(1.4)', overwrite: true });
        }
        phStars.forEach((s, i) => {
          if (i < 2) s.classList.remove('is-lit');
          gsap.to(s, { scale: 0.72, color: '#d2d2d7', duration: 0.3, delay: i * 0.08, overwrite: 'auto' });
        });
        gsap.set(phone, { rotate: 0, overwrite: 'auto' });
      },
    ];

    /* =============================================================
       DESKTOP: timeline ter-pin. Kartu berputar 360°, zoom, ganti
       sudut; teks fitur berganti mengikuti scroll.
       MOBILE: pin dimatikan, semua beat ditampilkan sebagai daftar
       statis agar tidak boros frame di HP.
       ============================================================= */
    const mq = gsap.matchMedia();

    mq.add('(min-width: 941px)', () => {
      gsap.set(card, { transformPerspective: 1200, transformOrigin: '50% 50%' });

      const state = { i: 0 };
      const step = 1 / nBeats;

      const tl = gsap.timeline({
        scrollTrigger: {
          id: 'showcaseST',
          trigger: section,
          start: 'top top',
          end: `+=${nBeats * 95}%`,
          pin,
          pinSpacing: true,
          scrub: 0.8,
          anticipatePin: 1,
          invalidateOnRefresh: true,
          onUpdate: (self) => {
            const i = clamp(Math.floor(self.progress * nBeats), 0, nBeats - 1);
            if (i !== state.i) { state.i = i; setBeat(i); beatFx[i](); }
          },
        },
      });

      /* Kartu berayun ±26° (bukan 360°) supaya QR dan teks kartu selalu
         menghadap pembaca di setiap beat — 360° membuat kartu(edge-on)
         menghilang beberapa saat. */
      tl.fromTo(card,
        { rotateY: -26, rotateX: 9, scale: 0.95 },
        { rotateY: 26, scale: 1.05, duration: nBeats, ease: 'sine.inOut' }, 0);
      tl.fromTo(card, { rotateX: 9 }, { rotateX: 4, duration: nBeats, ease: 'sine.inOut' }, 0);
      tl.to(card, { rotateY: -12, duration: 1.1, ease: 'sine.inOut' }, 4 / nBeats + 0.4);
      /* zoom saat beat bintang (3) lalu kembali saat routing (4) */
      tl.to(card, { scale: 1.24, duration: 0.9, ease: 'power2.inOut' }, 3 * step + 0.05);
      tl.to(card, { scale: 1.04, duration: 0.9, ease: 'power2.inOut' }, 4 * step + 0.05);

      return () => {
        tl.scrollTrigger?.kill();
        tl.kill();
        gsap.set([card, phone], { clearProps: 'all' });
        beats.forEach((b) => gsap.set(b, { clearProps: 'all' }));
        views.forEach((v) => { v.classList.remove('is-active'); gsap.set(v, { clearProps: 'all' }); });
        waves.forEach((w) => gsap.set(w, { clearProps: 'all' }));
        phStars.forEach((s) => { s.classList.remove('is-lit'); gsap.set(s, { clearProps: 'all' }); });
        gsap.set(titleWords, { clearProps: 'all' });
      };
    });

    mq.add('(max-width: 940px)', () => {
      /* semua beat tampil, kartu & HP statis dengan sudut ringan */
      beats.forEach((b) => b.classList.add('is-active'));
      titleWords.forEach((w) => w.classList.add('is-lit'));
      gsap.set(beats, { clearProps: 'all' });
      gsap.set(card, {
        clearProps: 'transform',
        transform: 'perspective(1200px) rotateX(8deg) rotateY(-12deg) scale(1)',
      });
      gsap.set(phone, { autoAlpha: 1, scale: 1, rotate: 0, y: 0 });
      views[0]?.classList.add('is-active');
      phStars.forEach((s) => { s.classList.add('is-lit'); gsap.set(s, { scale: 1, opacity: 1 }); });

      return () => {
        beats.forEach((b) => b.classList.remove('is-active'));
        views.forEach((v) => v.classList.remove('is-active'));
        phStars.forEach((s) => s.classList.remove('is-lit'));
        titleWords.forEach((w) => w.classList.remove('is-lit'));
        gsap.set([card, phone], { clearProps: 'all' });
      };
    });
  }

  /* =======================================================================
     6a. LAYER HANYA SAAT BERGERAK
     will-change permanen promoting 115 elemen jadi layer (terukur), 57
     di antaranya span.word__i yang hanya bergerak sekali. Sekarang
     will-change dipasang hanya selama elemen benar-benar dianimasikan,
     lalu dilepas. Layer yang menganggur hanya memakan memori GPU.
     ======================================================================= */
  function promoteDuring(targets, tween, variant) {
    const els = (Array.isArray(targets) ? targets : [targets]).filter((e) => e && e.nodeType);
    if (!els.length || !tween) return tween;
    const cls = variant === 'color' ? 'is-animating--color' : 'is-animating';
    const release = () => els.forEach((e) => e.classList.remove(cls));
    /* PENTING: kelas dipasang saat tween benar-benar START, bukan saat
       dibuat. Kalau dipasang saat pembuatan, elemen yang tween-nya masih
       menunggu ScrollTrigger ikut mendapat will-change — persis masalah
       yang seharusnya dihilangkan. */
    tween.eventCallback('onStart', () => els.forEach((e) => e.classList.add(cls)));
    tween.eventCallback('onComplete', release);
    tween.eventCallback('onInterrupt', release);
    return tween;
  }

  /* Loop tak berujung hanya boleh jalan saat elemennya terlihat di layar.
     4 loop yang sebelumnya berjalan terus (card float, shadow, sheen,
     scroll cue) semuanya di area hero yang MOST of the time off-screen. */
  function gateOnVisibility(el, build) {
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') { build(); return; }
    let handle = null;
    const io = new IntersectionObserver((entries) => {
      const visible = entries.some((e) => e.isIntersecting);
      if (visible && !handle) handle = build();
      else if (!visible && handle) { handle.kill?.(); handle = null; }
    }, { rootMargin: '120px' });
    io.observe(el);
  }

  /* =======================================================================
     6b. REVEAL GENERIK: [data-anim], bento, step, plan, split
     ======================================================================= */
  function initReveals() {
    if (REDUCED || !hasGSAP) {
      $$('[data-anim], [data-bento], [data-step], [data-plan], [data-split-card]').forEach((el) => {
        el.style.opacity = 1; el.style.transform = 'none';
      });
      $$('[data-split]').forEach((el) => splitWords(el).forEach((w) => {
        w.style.opacity = 1; w.style.transform = 'none';
      }));
      const line = $('#stepsLine');
      if (line) line.style.transform = 'scaleX(1)';
      return;
    }

    /* Hero sudah dianimasikan oleh initHero(), jadi jangan dianimasikan dua kali. */
    const inHero = (el) => !!el.closest('#hero');

    /* [data-anim] */
    $$('[data-anim]').filter((el) => !inHero(el)).forEach((el) => {
      promoteDuring(el, gsap.to(el, {
        y: 0, opacity: 1, duration: 0.9, ease: 'power3.out',
        delay: parseFloat(el.dataset.delay || 0),
        scrollTrigger: { trigger: el, start: 'top 88%', once: true },
      }));
    });

    /* headline: split kata, stagger. will-change hanya selama animasi. */
    $$('[data-split]').filter((el) => !inHero(el)).forEach((el) => {
      const words = splitWords(el);
      gsap.set(words, { yPercent: 108, opacity: 0 });
      const tw = gsap.to(words, {
        yPercent: 0, opacity: 1, duration: 0.85, stagger: 0.035, ease: 'power3.out',
        scrollTrigger: { trigger: el, start: 'top 86%', once: true },
      });
      promoteDuring(words, tw);
    });

    /* bento — TIDAK dipromosikan ke layer.
       8 kartu masuk sekaligus dalam satu frame; promoting 8 elemen
       sekaligus justru MEMBUAT long task 53ms (terukur) karena 8 layer
       baru dibuat bersamaan. Reveal ini hanya slide 34px selama 0,9s —
       jauh lebih murah untuk dipaint langsung tanpa layer. */
    ScrollTrigger.batch('[data-bento]', {
      start: 'top 88%',
      once: true,
      onEnter: (batch) => gsap.to(batch, {
        y: 0, opacity: 1, duration: 0.9, stagger: 0.08, ease: 'power3.out', overwrite: true,
      }),
    });
    gsap.set('[data-bento]', { y: 34 });

    /* blok statistik: stagger per kolom + garis pemisah ikut tumbuh */
    ScrollTrigger.batch('[data-stat]', {
      start: 'top 88%',
      once: true,
      onEnter: (batch) => {
        gsap.to(batch, {
          y: 0, opacity: 1, duration: 0.9, stagger: 0.1, ease: 'power3.out', overwrite: true,
        });
        gsap.fromTo(batch.map((b) => $('.stat', b) || b),
          { scaleX: 0, transformOrigin: 'left' },
          { scaleX: 1, duration: 0.9, stagger: 0.1, ease: 'power2.out' });
      },
    });
    gsap.set('[data-stat]', { y: 30 });

    /* langkah — juga tanpa promosi layer (3 elemen sekaligus) */
    ScrollTrigger.batch('[data-step]', {
      start: 'top 85%',
      once: true,
      onEnter: (batch) => {
        gsap.to(batch, { y: 0, opacity: 1, duration: 0.9, stagger: 0.14, ease: 'power3.out', overwrite: true });
        const line = $('#stepsLine');
        if (line) {
          gsap.to(line, { scaleX: 1, duration: 1.5, ease: 'power2.inOut',
            scrollTrigger: { trigger: '.steps__grid', start: 'top 78%', once: true } });
        }
      },
    });
    gsap.set('[data-step]', { y: 40 });

    /* plan — tanpa promosi layer, alasan sama seperti bento */
    ScrollTrigger.batch('[data-plan]', {
      start: 'top 85%',
      once: true,
      onEnter: (batch) => gsap.to(batch, {
        y: 0, opacity: 1, duration: 0.9, stagger: 0.1, ease: 'power3.out', overwrite: true,
      }),
    });
    gsap.set('[data-plan]', { y: 44 });

    /* glow bento mengikuti kursor; rect di-cache per card (bukan tiap event) */
    $$('[data-bento]').forEach((card) => {
      let rect = null;
      const cache = () => { rect = card.getBoundingClientRect(); };
      card.addEventListener('mouseenter', cache, { passive: true });
      card.addEventListener('mousemove', (e) => {
        if (!rect) cache();
        card.style.setProperty('--mx', `${(((e.clientX - rect.left) / rect.width) * 100).toFixed(1)}%`);
        card.style.setProperty('--my', `${(((e.clientY - rect.top) / rect.height) * 100).toFixed(1)}%`);
      });
      card.addEventListener('mouseleave', () => { rect = null; });
    });

    /* split card */
    const sc = $('[data-split-card]');
    if (sc) {
      gsap.to(sc, {
        y: 0, opacity: 1, duration: 1, ease: 'power3.out',
        scrollTrigger: { trigger: sc, start: 'top 82%', once: true },
      });
      gsap.set(sc, { y: 40 });
    }

    /* ---------- Parallax ----------
       Hanya section yang TIDAK di-pin. Section showcase menjadi position
       fixed saat di-pin, sehingga parallax di dalamnya akan berebut dengan
       positioning ScrollTrigger. */
    const PINNED = '#cara-kerja';

    const makeParallax = (el, fromY, toY, trigger) => {
      if (!el || el.closest(PINNED)) return;
      gsap.fromTo(el, { yPercent: fromY }, {
        yPercent: toY, ease: 'none',
        scrollTrigger: {
          trigger: trigger || el.closest('.section') || el,
          start: 'top bottom', end: 'bottom top',
          scrub: 0.6, invalidateOnRefresh: true,
        },
      });
    };

    makeParallax($('.hero__glow'), -18, 22);
    makeParallax($('.stats__bg'), -10, 10);
    makeParallax($('.pricing__bg'), -8, 8);

    /* closing__glow dipusatkan dengan translateX(-50%); biar tidak hilang,
       pusatnya dipindah ke xPercent supaya responsif */
    const closingGlow = $('.closing__glow');
    if (closingGlow) {
      gsap.set(closingGlow, { xPercent: -50, yPercent: -16 });
      gsap.to(closingGlow, {
        yPercent: 16, ease: 'none',
        scrollTrigger: {
          trigger: closingGlow.closest('.section'),
          start: 'top bottom', end: 'bottom top',
          scrub: 0.6, invalidateOnRefresh: true,
        },
      });
    }

    $$('[data-parallax]').forEach((el) => {
      const amt = parseFloat(el.dataset.parallax) || 0.12;
      makeParallax(el, -amt * 100, amt * 100);
    });
  }

  /* =======================================================================
     7. COUNT-UP
     ======================================================================= */
  function initCounters() {
    const items = $$('[data-count]');
    if (REDUCED || !hasGSAP) {
      items.forEach((el) => { el.textContent = formatValue(el, parseFloat(el.dataset.count)); });
      return;
    }
    items.forEach((el) => {
      const target = parseFloat(el.dataset.count);
      const obj = { v: 0 };
      ScrollTrigger.create({
        trigger: el, start: 'top 88%', once: true,
        onEnter: () => {
          gsap.to(obj, {
            v: target, duration: 1.9, ease: 'power2.out',
            onUpdate: () => { el.textContent = formatValue(el, obj.v); },
          });
        },
      });
    });
  }

  /* Angka ditampilkan dalam format Indonesia: pemisah ribuan titik,
     desimal koma (mis. 4,9). Prefix contoh: "Rp". */
  function formatValue(el, v) {
    const dec = Number(el.dataset.decimals || 0);
    const suffix = el.dataset.suffix || '';
    const prefix = el.dataset.prefix || '';
    const num = dec > 0
      ? v.toLocaleString('id-ID', { minimumFractionDigits: dec, maximumFractionDigits: dec })
      : Math.round(v).toLocaleString('id-ID');
    return prefix + num + suffix;
  }

  /* =======================================================================
     8. SCROLL-LINKED TEXT GLOW (CTA penutup)
     ======================================================================= */
  function initWordGlow() {
    const el = $('[data-words-glow]');
    if (!el) return;
    const words = splitWords(el);

    if (REDUCED || !hasGSAP) {
      words.forEach((w) => { w.style.opacity = 1; });
      return;
    }

    gsap.set(words, { opacity: 0.14 });
    gsap.to(words, {
      opacity: 1, ease: 'none', stagger: 0.4,
      scrollTrigger: { trigger: el, start: 'top 82%', end: 'bottom 62%', scrub: 0.5 },
    });
  }

  /* =======================================================================
     9. FAQ ACCORDION (tinggi halus)
     ======================================================================= */
  function initFaq() {
    const items = $$('[data-faq]');
    items.forEach((item) => {
      const btn = $('.faq__q', item);
      const panel = $('.faq__a', item);
      if (!btn || !panel) return;

      btn.addEventListener('click', () => {
        const isOpen = btn.getAttribute('aria-expanded') === 'true';
        items.forEach((other) => {
          if (other === item) return;
          const ob = $('.faq__q', other);
          const op = $('.faq__a', other);
          ob?.setAttribute('aria-expanded', 'false');
          if (op) closePanel(op);
        });
        btn.setAttribute('aria-expanded', String(!isOpen));
        if (isOpen) closePanel(panel);
        else openPanel(panel);
      });
    });

    function openPanel(panel) {
      if (REDUCED || !hasGSAP) { panel.style.height = 'auto'; return; }
      gsap.set(panel, { height: 'auto' });
      const h = panel.offsetHeight;
      gsap.fromTo(panel, { height: 0 }, { height: h, duration: 0.55, ease: 'power3.inOut',
        onComplete: () => { panel.style.height = 'auto'; } });
      gsap.fromTo($('.faq__a-inner', panel), { y: 14, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.5, ease: 'power2.out', delay: 0.08 });
    }
    function closePanel(panel) {
      if (REDUCED || !hasGSAP) { panel.style.height = '0px'; return; }
      gsap.to(panel, { height: 0, duration: 0.45, ease: 'power3.inOut' });
    }
  }

  /* =======================================================================
     10. MICRO-INTERACTION: ripple + magnetic
     ======================================================================= */
  function initMicroInteractions() {
    if (REDUCED) return;

    /* ripple — hanya bila koordinat-pointer tersedia (mouse), bukan ketukan sentuh */
    $$('[data-ripple]').forEach((el) => {
      el.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'touch') return;
        const r = el.getBoundingClientRect();
        const size = Math.max(r.width, r.height);
        const span = doc.createElement('span');
        span.className = 'btn__ripple';
        span.style.width = span.style.height = `${size}px`;
        span.style.left = `${e.clientX - r.left}px`;
        span.style.top = `${e.clientY - r.top}px`;
        el.appendChild(span);
        gsap.to(span, { scale: 2.6, opacity: 0, duration: 0.65, ease: 'power2.out',
          onComplete: () => span.remove() });
      });
    });

    /* magnetic */
    if (!window.matchMedia('(hover: none)').matches) {
      $$('[data-magnetic]').forEach((el) => {
        el.addEventListener('mousemove', (e) => {
          const r = el.getBoundingClientRect();
          const x = e.clientX - (r.left + r.width / 2);
          const y = e.clientY - (r.top + r.height / 2);
          gsap.to(el, { x: x * 0.3, y: y * 0.4, duration: 0.5, ease: 'power3.out' });
        });
        el.addEventListener('mouseleave', () => {
          gsap.to(el, { x: 0, y: 0, duration: 0.7, ease: 'elastic.out(1, 0.5)' });
        });
      });
    }
  }

  /* =======================================================================
     11. MODAL PESANAN -> WhatsApp
     ======================================================================= */
  function initOrderModal() {
    const modal = $('#orderModal');
    const form = $('#orderForm');
    const close = $('#orderClose');
    if (!modal || !form) return;

    const open = (planName) => {
      if (planName) {
        const sel = $('#ofPlan');
        const opt = $$('option', sel).find((o) => o.textContent.trim().startsWith(planName));
        if (opt) sel.value = opt.value;
      }
      modal.showModal();
      if (hasGSAP && !REDUCED) {
        gsap.fromTo($('.modal__panel'), { y: 30, opacity: 0, scale: 0.97 },
          { y: 0, opacity: 1, scale: 1, duration: 0.5, ease: 'power3.out' });
        gsap.fromTo('.modal__panel > *', { y: 14, opacity: 0 },
          { y: 0, opacity: 1, duration: 0.45, stagger: 0.05, ease: 'power2.out', delay: 0.1 });
      }
    };

    $$('[data-order]').forEach((b) => b.addEventListener('click', () => open(b.dataset.planName)));
    close?.addEventListener('click', () => modal.close());
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.close(); });

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = $('#ofName').value.trim();
      const biz = $('#ofBiz').value.trim();
      const plan = $('#ofPlan').value;
      const qty = $('#ofQty').value;
      const pay = $('#ofPay').value;
      const note = $('#ofNote').value.trim();

      const msg =
`Halo ${CONFIG.brand}, saya mau memesan kartu NFC + QR untuk ulasan Google.

Nama: ${name}
Nama usaha: ${biz}
Paket: ${plan}
Jumlah kartu: ${qty} pcs
Pembayaran: ${pay}${note ? `\nCatatan: ${note}` : ''}

Mohon info langkah pemesanannya. Terima kasih!`;

      modal.close();
      window.open(waLink(msg), '_blank', 'noopener');
    });
  }

  /* =======================================================================
     12. MARQUEE: duplikasi agar mulus + dukung resize
     ======================================================================= */
  function initMarquee() {
    $$('[data-track]').forEach((track) => {
      const clone = track.cloneNode(true);
      clone.setAttribute('aria-hidden', 'true');
      $$('a, button', clone).forEach((el) => el.setAttribute('tabindex', '-1'));
      track.parentElement.appendChild(clone);
    });
  }

  /* =======================================================================
     13. FOCUS/keyboard helpers
     ======================================================================= */
  function initA11yHelpers() {
    /* Tutup mobile menu bila layar membesar */
    window.addEventListener('resize', () => {
      if (window.innerWidth > 940) {
        const burger = $('#burger');
        if (burger?.getAttribute('aria-expanded') === 'true') burger.click();
      }
    });

    /* ScrollTrigger refresh setelah load gambar */
    window.addEventListener('load', () => { if (hasGSAP) ScrollTrigger.refresh(); });
  }

  /* =======================================================================
     BOOT
     ======================================================================= */
  function boot() {
    initNav();
    initMarquee();
    initFaq();
    initMicroInteractions();
    initOrderModal();
    initA11yHelpers();

    const start = () => {
      initLenis();
      if (hasGSAP) gsap.registerPlugin(ScrollTrigger);

      initPreloader().then(() => {
        initHero();
        initShowcase();
        initReveals();
        initCounters();
        initWordGlow();

        if (hasGSAP) {
          ScrollTrigger.refresh();
          /* refresh sekali setelah font & gambar siap */
          if (doc.fonts?.ready) doc.fonts.ready.then(() => ScrollTrigger.refresh());
          setTimeout(() => ScrollTrigger.refresh(), 600);
        }
      });

      /* tanpa GSAP: pastikan konten terlihat */
      if (!hasGSAP) {
        $$('[data-anim]').forEach((el) => { el.style.opacity = 1; el.style.transform = 'none'; });
      }
    };

    if (REDUCED) {
      $$('[data-split]').forEach((el) => splitWords(el).forEach((w) => { w.style.opacity = 1; }));
      start();
    } else {
      start();
    }
  }

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot);
  else boot();
})();

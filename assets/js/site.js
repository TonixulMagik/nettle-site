/* Nettle site: shared behaviour on every page.
   Navigation toggle, the global "Pause motion" preference, reveal-on-scroll, the ticket-flow
   demo, local launch time, table-of-contents highlight, print button and the raccoon easter egg.
   No cookies, no network calls, no third-party code. Everything degrades to plain HTML. */
(() => {
  'use strict';

  const doc = document.documentElement;
  const reduceMQ = window.matchMedia('(prefers-reduced-motion: reduce)');
  const MOTION_KEY = 'nettle-motion';

  // localStorage can be blocked (private mode, blocked site data): every access is guarded.
  const store = {
    get(key) { try { return window.localStorage.getItem(key); } catch (e) { return null; } },
    set(key, val) { try { window.localStorage.setItem(key, val); } catch (e) { /* not stored, still works */ } }
  };

  // ---------------------------------------------------------------- motion preference
  const Nettle = (window.Nettle = window.Nettle || {});
  // Romanian numerals: "19 fise", "20 de fise", "101 fise", "120 de fise", "0 fise" (same rule as the bot and build.py)
  Nettle.de = (n) => { const a = Math.abs(Math.round(Number(n) || 0)); const r = a % 100; return a !== 0 && (r === 0 || r >= 20) ? 'de ' : ''; };
  Nettle.reduced = () => reduceMQ.matches;
  Nettle.paused = () => doc.classList.contains('motion-paused');
  Nettle.motionOff = () => Nettle.reduced() || Nettle.paused();

  function syncToggles() {
    const reduced = Nettle.reduced();
    const off = Nettle.paused() || reduced;
    document.querySelectorAll('[data-motion-toggle]').forEach((btn) => {
      btn.setAttribute('aria-pressed', String(off));
      btn.disabled = reduced;
      if (reduced) btn.title = btn.dataset.reducedLabel || '';
      else btn.removeAttribute('title');
    });
  }

  function setPaused(paused, persist) {
    doc.classList.toggle('motion-paused', paused);
    if (persist) store.set(MOTION_KEY, paused ? 'paused' : 'on');
    syncToggles();
    document.dispatchEvent(new CustomEvent('nettle:motion'));
  }

  setPaused(store.get(MOTION_KEY) === 'paused', false);
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-motion-toggle]');
    if (btn && !btn.disabled) setPaused(!Nettle.paused(), true);
  });
  const onReduceChange = () => { syncToggles(); document.dispatchEvent(new CustomEvent('nettle:motion')); };
  if (reduceMQ.addEventListener) reduceMQ.addEventListener('change', onReduceChange);

  // ---------------------------------------------------------------- navigation (mobile)
  const toggle = document.querySelector('.nav-toggle');
  const panel = document.getElementById('nav-panel');
  if (toggle && panel) {
    toggle.hidden = false;
    const isOpen = () => panel.classList.contains('is-open');
    const setOpen = (open) => {
      panel.classList.toggle('is-open', open);
      toggle.setAttribute('aria-expanded', String(open));
    };
    toggle.addEventListener('click', () => setOpen(!isOpen()));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isOpen()) { setOpen(false); toggle.focus(); }
    });
    panel.addEventListener('click', (e) => { if (e.target.closest('a')) setOpen(false); });
    document.addEventListener('click', (e) => {
      if (isOpen() && !panel.contains(e.target) && !toggle.contains(e.target)) setOpen(false);
    });
    const wide = window.matchMedia('(min-width: 900px)');
    if (wide.addEventListener) wide.addEventListener('change', () => setOpen(false));
  }

  // ---------------------------------------------------------------- pixel bursts (shared, capped)
  let live = 0;
  const MAX_LIVE = 60;
  Nettle.burst = (x, y, n, colors) => {
    if (Nettle.motionOff() || !Number.isFinite(x) || !Number.isFinite(y)) return;
    const cols = colors && colors.length ? colors : ['#F2B84B', '#5AA9E6', '#5DBB4A', '#F28DB2'];
    const count = Math.min(n || 10, MAX_LIVE - live);
    for (let i = 0; i < count; i++) {
      const p = document.createElement('span');
      p.className = 'px-burst';
      const ang = Math.random() * Math.PI * 2;
      const dist = 30 + Math.random() * 70;
      const size = Math.random() < 0.3 ? 10 : 6;
      p.style.cssText = 'left:' + (x - size / 2) + 'px;top:' + (y - size / 2) + 'px;width:' + size + 'px;height:' + size + 'px;' +
        '--c:' + cols[i % cols.length] + ';--dx:' + Math.round(Math.cos(ang) * dist) + 'px;--dy:' + Math.round(Math.sin(ang) * dist + 40) + 'px;--r:' + Math.round(Math.random() * 180) + 'deg';
      document.body.appendChild(p);
      live++;
      window.setTimeout(() => { p.remove(); live--; }, 950);
    }
  };

  // ---------------------------------------------------------------- reveal on scroll (always visible)
  // Things that start below the screen get a small offset, then settle as they arrive. Nothing is ever
  // hidden while waiting; things already on screen are left alone.
  const revealEls = Array.from(document.querySelectorAll('.reveal, .div-wrap'));
  if ('IntersectionObserver' in window && revealEls.length) {
    const vh = window.innerHeight || doc.clientHeight;
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
    revealEls.forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.top < vh && r.bottom > 0) { el.classList.add('is-in'); return; }
      if (!Nettle.motionOff()) el.classList.add(el.classList.contains('div-wrap') ? 'div-arm' : 'is-armed');
      io.observe(el);
    });
    doc.classList.add('reveal-ready');
  }

  // ---------------------------------------------------------------- notes that end at the launch
  // Anything marked data-until (the launch moment, UTC) disappears once that moment has passed, so the
  // "Opening in steps" notes never outlive the launch even before the site is rebuilt.
  const untilEls = Array.from(document.querySelectorAll('[data-until]'));
  const expire = () => {
    const now = Date.now();
    untilEls.forEach((el) => { const t = Date.parse(el.dataset.until); if (!Number.isNaN(t) && now >= t) el.hidden = true; });
  };
  expire();
  const nextEnd = Math.min(...untilEls.map((el) => Date.parse(el.dataset.until)).filter((t) => t > Date.now()));
  if (Number.isFinite(nextEnd) && nextEnd - Date.now() < 864e5) window.setTimeout(expire, nextEnd - Date.now() + 500);

  // ---------------------------------------------------------------- launch time in the visitor's zone
  document.querySelectorAll('time[data-local-time]').forEach((el) => {
    try {
      const when = new Date(el.getAttribute('datetime'));
      if (Number.isNaN(when.getTime())) return;
      const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (zone === 'Europe/Bucharest') return; // the printed label already is Romania time
      const lang = el.dataset.lang || doc.lang || 'en';
      const fmtParts = (opts) => {
        const parts = new Intl.DateTimeFormat(lang, opts).formatToParts(when);
        return (t) => (parts.find((p) => p.type === t) || {}).value || '';
      };
      const get = fmtParts({ day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: lang !== 'ro' });
      const ro = fmtParts({ timeZone: 'Europe/Bucharest', day: 'numeric', month: 'long', year: 'numeric' });
      const sameDay = get('day') === ro('day') && get('month') === ro('month') && get('year') === ro('year');
      const mins = get('minute') === '00' ? '' : '.' + get('minute');
      // times without a colon (owner's rule); the date only when it differs from the Romanian date
      const hour = lang === 'ro' ? 'ora ' + get('hour') + mins : get('hour') + mins + ' ' + get('dayPeriod');
      const day = get('day') + ' ' + get('month') + (get('year') === ro('year') ? '' : ' ' + get('year'));
      const local = sameDay ? hour : (lang === 'ro' ? day + ', ' + hour : day + ' at ' + hour);
      const span = document.createElement('span');
      span.className = 'local-time';
      span.textContent = ' (' + (el.dataset.yourTime || '{time}').replace('{time}', local) + ')';
      el.after(span);
    } catch (e) { /* Intl missing: the Romania-time label stays */ }
  });

  // ---------------------------------------------------------------- table of contents highlight
  const tocLinks = Array.from(document.querySelectorAll('.toc a[href^="#"]'));
  if (tocLinks.length && 'IntersectionObserver' in window) {
    const byId = new Map();
    tocLinks.forEach((a) => {
      const el = document.getElementById(decodeURIComponent(a.getAttribute('href').slice(1)));
      if (el) byId.set(el, a);
    });
    const tio = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        tocLinks.forEach((a) => a.classList.remove('is-active'));
        const a = byId.get(en.target);
        if (a) a.classList.add('is-active');
      });
    }, { rootMargin: '-20% 0px -70% 0px' });
    byId.forEach((_, el) => tio.observe(el));
  }

  // ---------------------------------------------------------------- print (legal pages)
  document.querySelectorAll('[data-print]').forEach((btn) => {
    btn.hidden = false;
    btn.addEventListener('click', () => window.print());
  });

  // ---------------------------------------------------------------- the raccoon on night shift
  const egg = document.querySelector('[data-egg]');
  const peek = document.getElementById('peek');
  if (egg && peek) {
    let timer = 0;
    let gen = 0;
    const hide = (returnFocus) => {
      const my = ++gen;
      clearTimeout(timer);
      peek.classList.remove('is-on');
      egg.setAttribute('aria-expanded', 'false');
      const done = () => { if (my === gen) peek.hidden = true; };
      if (Nettle.motionOff()) done(); else window.setTimeout(done, 720);
      if (returnFocus) egg.focus();
    };
    const show = () => {
      const my = ++gen;
      peek.hidden = false;
      egg.setAttribute('aria-expanded', 'true');
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => { if (my === gen) peek.classList.add('is-on'); }));
      clearTimeout(timer);
      timer = window.setTimeout(() => hide(false), 9000);
    };
    egg.addEventListener('click', () => (peek.hidden || !peek.classList.contains('is-on') ? show() : hide(false)));
    const close = peek.querySelector('[data-egg-close]');
    if (close) close.addEventListener('click', () => hide(true));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !peek.hidden) hide(true); });
  }
})();

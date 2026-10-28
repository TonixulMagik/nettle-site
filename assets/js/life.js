/* Nettle page life: the pixel raccoon that walks along the grass in every page header.
   - ONE requestAnimationFrame clock for every walker on the page, with real frame timing (dt).
   - Speed eases in and out; position is kept in sub-pixels and snapped to device pixels only when drawn.
   - The 4-frame trot is driven by the distance walked, not by timers, so the feet never slide.
   - Moods: walk, stand, look at you (front sprite, blinks), sit. Turns around at the edges.
   - Runs only while the header is on screen, the tab is visible and motion is allowed. Under reduced
     motion (or "Pause motion") it simply stands still. Clouds, birds, butterflies and falling stars are
     CSS animations on the compositor. */
(() => {
  'use strict';

  const els = Array.from(document.querySelectorAll('[data-walker]'));
  if (!els.length) return;
  const N = window.Nettle || { motionOff: () => false };

  function rand(seed) { // small seeded generator, so each page has its own rhythm
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const snap = (v) => { const d = window.devicePixelRatio || 1; return Math.round(v * d) / d; };

  class Walker {
    constructor(el) {
      this.el = el;
      this.side = el.querySelector('.rw-side');
      this.host = el.parentElement;
      this.rng = rand(1300 + (Number(el.dataset.seed) || 0) * 97);
      this.dir = this.rng() < 0.5 ? 1 : -1;
      this.v = 0;
      this.speed = 44;
      this.pose = 'walk';
      this.timer = 2 + this.rng() * 3;
      this.phase = 0;
      this.frame = -1;
      this.measure();
      this.x = this.W * (0.5 + this.rng() * 0.3);
      this.clamp();
      this.el.dataset.pose = 'walk';
      this.el.dataset.dir = String(this.dir);
    }
    measure() { this.W = this.host.clientWidth; this.w = this.el.getBoundingClientRect().width || 80; }
    clamp() { this.x = Math.max(8, Math.min(this.W - this.w - 8, this.x)); }
    setPose(p) { if (p !== this.pose) { this.pose = p; this.el.dataset.pose = p; } }
    choose() {
      if (this.pose !== 'walk') {
        this.setPose('walk');
        this.timer = 2.5 + this.rng() * 4;
        if (this.rng() < 0.35) this.dir *= -1;
        return;
      }
      const r = this.rng();
      if (r < 0.38) { this.setPose('stand'); this.timer = 0.9 + this.rng() * 1.6; }
      else if (r < 0.68) { this.setPose('look'); this.timer = 1.6 + this.rng() * 2.2; }
      else if (r < 0.84) { this.setPose('sit'); this.timer = 2.4 + this.rng() * 2.8; }
      else { this.dir *= -1; this.timer = 2 + this.rng() * 3; }
    }
    update(dt) {
      this.timer -= dt;
      if (this.timer <= 0 && Math.abs(this.v) < this.speed * 1.01) this.choose();
      const target = this.pose === 'walk' ? this.speed : 0;
      this.v += (target - this.v) * Math.min(1, dt * 5);            // ease in and out of the walk
      if (this.v < 0.5 && target === 0) this.v = 0;
      this.x += this.v * this.dir * dt;
      const min = 8, max = this.W - this.w - 8;
      if (this.x <= min) { this.x = min; this.dir = 1; }
      else if (this.x >= max) { this.x = max; this.dir = -1; }
      this.phase += (this.v * dt) / 9;                                // one leg frame every 9 px walked
      const f = this.v > 6 ? Math.floor(this.phase) % 4 : 1;
      if (f !== this.frame) { this.frame = f; this.side.setAttribute('data-f', String(f)); }
    }
    render() {
      const step = this.v > 6 ? -Math.abs(Math.sin((this.phase * Math.PI) / 2)) * 2.2 * (this.v / this.speed) : 0;
      this.el.style.transform = 'translate3d(' + snap(this.x) + 'px,' + snap(step) + 'px,0)';
      const d = String(this.dir);
      if (this.el.dataset.dir !== d) this.el.dataset.dir = d;
    }
    rest() { this.v = 0; this.setPose('stand'); this.side.removeAttribute('data-f'); this.frame = -1; this.render(); }
  }

  const walkers = els.map((el) => new Walker(el));
  let raf = 0, last = 0, visible = false;
  const wants = () => visible && !document.hidden && !N.motionOff();

  function frame(now) {
    raf = 0;
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    for (const w of walkers) { w.update(dt); w.render(); }
    if (wants()) raf = window.requestAnimationFrame(frame);
  }
  function start() { if (raf || !wants()) return; last = performance.now(); raf = window.requestAnimationFrame(frame); }
  function stop() { if (raf) window.cancelAnimationFrame(raf); raf = 0; }

  if (N.motionOff()) walkers.forEach((w) => w.rest()); else walkers.forEach((w) => w.render());

  const io = 'IntersectionObserver' in window ? new IntersectionObserver((entries) => {
    visible = entries.some((e) => e.isIntersecting);
    if (visible) start(); else stop();
  }) : null;
  if (io) walkers.forEach((w) => io.observe(w.host)); else { visible = true; start(); }
  const ro = 'ResizeObserver' in window ? new ResizeObserver(() => walkers.forEach((w) => { w.measure(); w.clamp(); w.render(); })) : null;
  if (ro) walkers.forEach((w) => ro.observe(w.host));
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); else start(); });
  document.addEventListener('nettle:motion', () => {
    if (N.motionOff()) { stop(); walkers.forEach((w) => w.rest()); }
    else { walkers.forEach((w) => w.setPose('walk')); start(); }
  });
  window.addEventListener('pagehide', stop);
  window.addEventListener('pageshow', (e) => { if (e.persisted) start(); });
  // test hook: lets the QA script read the clock without touching the animation
  window.__nettleLife = { walkers, running: () => Boolean(raf) };
})();

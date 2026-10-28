/* Nettle world: the living pixel hero on the homepage.
   - Nettle Orbit: feature blocks orbit a pixel planet. The accessible source of truth is the tab list +
     panels in the console (real links without JS, an ARIA tablist with JS); the blocks are aria-hidden
     pointer shortcuts to the same tabs.
   - Parallax: sky layers move with scroll and (on a mouse) with the cursor.
   - Pixel bursts on click / tap in the hero, the raccoon reacts when pressed.
   - ONE requestAnimationFrame loop, transforms only. It stops when the hero is offscreen, the tab is
     hidden, motion is paused, or the device asks for reduced motion (then everything is static). */
(() => {
  'use strict';

  const hero = document.querySelector('[data-world]');
  const stage = document.querySelector('[data-orbit-stage]');
  const consoleEl = document.querySelector('[data-orbit-console]');
  const N = window.Nettle || { motionOff: () => false, reduced: () => false, burst: () => {} };
  const fine = window.matchMedia('(hover: hover) and (pointer: fine)');

  // ================================================================ the raccoon (hero, finale, anywhere)
  document.querySelectorAll('[data-raccoon]').forEach((btn) => {
    let lines = [];
    try { lines = JSON.parse(btn.dataset.lines || '[]'); } catch (e) { lines = []; }
    let clicks = [];
    let bubbleTimer = 0;
    let n = 0;
    const say = (text) => {
      let b = btn.querySelector('.bubble');
      if (!b) {
        b = document.createElement('span');
        b.className = 'bubble';
        b.setAttribute('role', 'status');
        btn.appendChild(b);
      }
      b.textContent = text;
      clearTimeout(bubbleTimer);
      bubbleTimer = window.setTimeout(() => b.remove(), 2600);
    };
    btn.addEventListener('click', (e) => {
      const now = Date.now();
      clicks = clicks.filter((t) => now - t < 3000);
      clicks.push(now);
      const r = btn.getBoundingClientRect();
      const x = e.clientX || r.left + r.width / 2;
      const y = e.clientY || r.top + r.height / 3;
      if (clicks.length >= 5) {
        clicks = [];
        say(btn.dataset.party || '!');
        if (!N.motionOff()) {
          btn.classList.add('is-party');
          N.burst(x, y, 28, ['#F2B84B', '#F28DB2', '#5AA9E6', '#5DBB4A', '#8E7CF0']);
          window.setTimeout(() => btn.classList.remove('is-party'), 3200);
        }
        return;
      }
      say(lines.length ? lines[n++ % lines.length] : '!');
      if (!N.motionOff()) {
        btn.classList.remove('is-hop');
        void btn.offsetWidth;
        btn.classList.add('is-hop');
        window.setTimeout(() => btn.classList.remove('is-hop'), 520);
        N.burst(x, y, 8, ['#F28DB2', '#FFF6E3']);
      }
      e.stopPropagation();
    });
    btn.addEventListener('mouseenter', () => btn.classList.add('is-hi'));
    btn.addEventListener('mouseleave', () => btn.classList.remove('is-hi'));
  });

  if (!hero || !stage || !consoleEl) return;

  // ================================================================ bursts on click / tap in the sky
  hero.addEventListener('pointerdown', (e) => {
    if (N.motionOff() || e.target.closest('a, button, input, .orbiter, [data-debris]')) return;
    N.burst(e.clientX, e.clientY, 12, ['#FFF6E3', '#F2B84B', '#9CCFF5', '#5DBB4A']);
  });

  // ================================================================ orbit tabs (enhance the no-JS links)
  const plane = stage.querySelector('.orbit-plane');
  const tether = stage.querySelector('.orbit-tether');
  const tabList = consoleEl.querySelector('.orbit-tabs');
  const tabs = Array.from(consoleEl.querySelectorAll('.orbit-tab'));
  const panels = Array.from(consoleEl.querySelectorAll('.orbit-panel'));
  if (!tabs.length) return;
  const rings = (stage.dataset.rings || '0.3,0.4,0.48').split(',').map(Number);
  const tilt = Number(stage.dataset.tilt || 0.4);
  const rot = (Number(stage.dataset.rot || 0) * Math.PI) / 180;
  const cosR = Math.cos(rot);
  const sinR = Math.sin(rot);
  const FRONT = Math.PI / 2 - 0.9;
  const TAU = Math.PI * 2;

  tabList.setAttribute('role', 'tablist');
  tabs.forEach((tab) => {
    tab.parentElement.setAttribute('role', 'presentation');
    tab.setAttribute('role', 'tab');
    const panel = document.getElementById(tab.getAttribute('href').slice(1));
    if (!panel) return;
    tab.setAttribute('aria-controls', panel.id);
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', tab.id);
    panel.tabIndex = 0;
  });

  // ================================================================ state
  const bodies = Array.from(stage.querySelectorAll('.orbiter')).map((el, i) => ({
    el, i, id: el.dataset.id, ring: Number(el.dataset.ring) || 0, phase: Number(el.dataset.phase) || 0,
    speed: Number(el.dataset.speed) || 0.1, x: 0, y: 0, px: 0, py: 0, back: el.classList.contains('is-back')
  }));
  const layers = Array.from(hero.querySelectorAll('.w-layer')).map((el) => ({ el, d: Number(el.dataset.depth) || 0 }));
  const ringOff = rings.map(() => 0);
  const ringTarget = rings.map(() => 0);
  let W = 0, H = 0, cx = 0, cy = 0;
  let t = 0, speedF = 1, hovering = false, picked = false;
  let tiltX = 0, tiltY = 0, aimX = 0, aimY = 0;
  let pointer = null;
  let selected = null;
  let scrollY = window.scrollY || 0;
  let heroTop = 0;
  let mx = 0, my = 0, aimMx = 0, aimMy = 0;
  let ringK = 1;
  const ringEls = Array.from(stage.querySelectorAll('.orbit-ring'));

  function measure() {
    const r = stage.getBoundingClientRect();
    W = r.width; H = r.height; cx = W / 2; cy = H / 2;
    heroTop = hero.getBoundingClientRect().top + window.scrollY;
    // fit the rings to the real stage: a block plus its label must never cross the edge, at any width
    const half = Math.max(bodies.length ? bodies[0].el.offsetWidth / 2 : 30, 40);
    const reach = rings[rings.length - 1] * W * (Math.abs(cosR) + tilt * Math.abs(sinR));
    ringK = Math.min(1, Math.max(0.4, (W / 2 - half - 6) / reach));
    ringEls.forEach((el, i) => {
      const rx = 1000 * rings[i] * ringK;
      el.setAttribute('rx', rx.toFixed(1));
      el.setAttribute('ry', (rx * tilt).toFixed(1));
    });
  }

  // ---------------------------------------------------------------- the intro (every visit, skippable)
  let introT0 = -1;
  const INTRO_MS = 1700;
  const introP = (b) => (introT0 < 0 ? 1 : Math.max(0, Math.min(1, ((performance.now() - introT0) / 1000 - b.i * 0.07) / 0.95)));
  const backOut = (p) => 1 + 2.70158 * Math.pow(p - 1, 3) + 1.70158 * Math.pow(p - 1, 2);
  function endIntro() {
    if (introT0 < 0) return;
    introT0 = -1;
    hero.classList.remove('is-intro');
    skipEvents.forEach((ev) => window.removeEventListener(ev, endIntro, true));
  }
  const skipEvents = ['pointerdown', 'keydown', 'wheel', 'touchstart'];
  function startIntro() {
    if (N.motionOff()) return;
    introT0 = performance.now();
    hero.classList.remove('is-intro');
    void hero.offsetWidth; // restart the CSS part
    hero.classList.add('is-intro');
    skipEvents.forEach((ev) => window.addEventListener(ev, endIntro, { capture: true, passive: true }));
  }
  const angleOf = (b) => b.phase + t * b.speed + ringOff[b.ring];
  const snap = (v) => { const d = window.devicePixelRatio || 1; return Math.round(v * d) / d; };

  function place() {
    if (introT0 >= 0 && performance.now() - introT0 > INTRO_MS) endIntro();
    for (const b of bodies) {
      const ip = introP(b);
      const k = ip >= 1 ? 1 : 0.18 + 0.82 * backOut(ip);
      const a = angleOf(b) - (1 - Math.min(1, k)) * 1.4;          // the blocks spiral out of the planet
      const rx = rings[b.ring] * W * ringK * k;
      const ry = rx * tilt;
      const lx = rx * Math.cos(a);
      const ly = ry * Math.sin(a);
      let x = cx + lx * cosR - ly * sinR;
      let y = cy + lx * sinR + ly * cosR;
      let gx = 0, gy = 0;
      if (pointer) {
        const dx = pointer.x - x, dy = pointer.y - y;
        const d = Math.hypot(dx, dy) || 1;
        const f = 12 * Math.exp(-d / 140);
        gx = (dx / d) * f; gy = (dy / d) * f;
      }
      b.px += (gx - b.px) * 0.12;
      b.py += (gy - b.py) * 0.12;
      x += b.px; y += b.py;
      // keep sub-pixels; snap only to the device pixel grid when drawn (smooth on phones, crisp edges)
      x = snap(x); y = snap(y);
      b.x = x; b.y = y;
      const depth = Math.sin(a);
      const scale = (0.8 + 0.1 * (depth + 1)) * (ip >= 1 ? 1 : 0.45 + 0.55 * Math.min(1, ip * 1.4));
      b.el.style.transform = 'translate3d(' + x + 'px,' + y + 'px,0) scale(' + scale.toFixed(3) + ')';
      const back = depth < 0;
      if (back !== b.back) { b.back = back; b.el.classList.toggle('is-back', back); }
    }
    const sel = selected && bodies.find((b) => b.id === selected);
    if (sel && tether) {
      const dx = sel.x - cx, dy = sel.y - cy;
      tether.style.transform = 'translate3d(' + cx.toFixed(1) + 'px,' + (cy - 2).toFixed(1) + 'px,0) rotate(' +
        Math.atan2(dy, dx).toFixed(4) + 'rad) scaleX(' + Math.hypot(dx, dy).toFixed(1) + ')';
      tether.classList.add('is-on');
    }
    plane.style.transform = (Math.abs(tiltX) > 0.01 || Math.abs(tiltY) > 0.01)
      ? 'rotateX(' + tiltX.toFixed(2) + 'deg) rotateY(' + tiltY.toFixed(2) + 'deg)' : '';
    const sc = Math.max(0, scrollY - heroTop);
    for (const l of layers) {
      const tx = snap(-mx * l.d * 40);
      const ty = snap(sc * l.d * 0.6 - my * l.d * 16);
      l.el.style.transform = (tx || ty) ? 'translate3d(' + tx + 'px,' + ty + 'px,0)' : '';
    }
  }

  // ================================================================ draggable bits that spring back
  const debris = Array.from(stage.querySelectorAll('[data-debris]')).map((el) => ({ el, x: 0, y: 0, vx: 0, vy: 0, drag: null }));
  const applyDebris = (d) => { d.el.style.transform = (d.x || d.y) ? 'translate3d(' + d.x.toFixed(2) + 'px,' + d.y.toFixed(2) + 'px,0)' : ''; };
  function stepDebris(dt) {
    for (const d of debris) {
      if (d.drag || (!d.x && !d.y && !d.vx && !d.vy)) continue;
      d.vx += (-70 * d.x - 9 * d.vx) * dt;
      d.vy += (-70 * d.y - 9 * d.vy) * dt;
      d.x += d.vx * dt; d.y += d.vy * dt;
      if (Math.abs(d.x) + Math.abs(d.y) < 0.3 && Math.abs(d.vx) + Math.abs(d.vy) < 0.8) { d.x = d.y = d.vx = d.vy = 0; }
      applyDebris(d);
    }
  }
  const debrisMoving = () => debris.some((d) => d.x || d.y || d.vx || d.vy);
  debris.forEach((d) => {
    d.el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      d.el.setPointerCapture(e.pointerId);
      d.drag = { id: e.pointerId, sx: e.clientX - d.x, sy: e.clientY - d.y };
    });
    d.el.addEventListener('pointermove', (e) => {
      if (!d.drag || d.drag.id !== e.pointerId) return;
      let nx = e.clientX - d.drag.sx, ny = e.clientY - d.drag.sy;
      const m = Math.hypot(nx, ny), lim = 110;
      if (m > lim) { const k = lim + (m - lim) * 0.25; nx = (nx / m) * k; ny = (ny / m) * k; }
      d.x = nx; d.y = ny; d.vx = 0; d.vy = 0;
      applyDebris(d);
    });
    const release = () => {
      if (!d.drag) return;
      d.drag = null;
      if (N.motionOff()) { d.x = d.y = 0; applyDebris(d); } else start(true);
    };
    d.el.addEventListener('pointerup', release);
    d.el.addEventListener('pointercancel', release);
    d.el.addEventListener('lostpointercapture', release);
  });

  // ================================================================ the loop
  let raf = 0, last = 0, visible = true;
  const wantsRun = () => visible && !document.hidden && !N.motionOff();
  function frame(now) {
    raf = 0;
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    if (!N.motionOff()) {
      const target = hovering ? 0.12 : (picked ? 0.4 : 1);
      speedF += (target - speedF) * Math.min(1, dt * 4);
      t += dt * speedF;
      for (let i = 0; i < ringOff.length; i++) ringOff[i] += (ringTarget[i] - ringOff[i]) * Math.min(1, dt * 3.2);
      tiltX += (aimX - tiltX) * Math.min(1, dt * 5);
      tiltY += (aimY - tiltY) * Math.min(1, dt * 5);
      mx += (aimMx - mx) * Math.min(1, dt * 4);
      my += (aimMy - my) * Math.min(1, dt * 4);
    }
    stepDebris(dt);
    place();
    if ((wantsRun() || debrisMoving()) && visible && !document.hidden) raf = window.requestAnimationFrame(frame);
  }
  function start(force) {
    if (raf || !visible || document.hidden) return;
    if (!force && !wantsRun()) return;
    last = performance.now();
    raf = window.requestAnimationFrame(frame);
  }
  function stop() { if (raf) window.cancelAnimationFrame(raf); raf = 0; }
  function still() {
    for (let i = 0; i < ringOff.length; i++) ringOff[i] = ringTarget[i];
    place();
  }

  // ================================================================ selection
  function select(id, opts) {
    opts = opts || {};
    const tab = tabs.find((x) => x.dataset.id === id);
    if (!tab) return;
    selected = id;
    tabs.forEach((x) => { const on = x === tab; x.setAttribute('aria-selected', String(on)); x.tabIndex = on ? 0 : -1; });
    panels.forEach((p) => {
      const on = p.dataset.id === id;
      p.hidden = !on;
      if (on && opts.user && !N.motionOff()) { p.classList.remove('orbit-panel-in'); void p.offsetWidth; p.classList.add('orbit-panel-in'); }
    });
    bodies.forEach((b) => b.el.classList.toggle('is-selected', b.id === id));
    if (opts.user) {
      picked = true;
      const b = bodies.find((x) => x.id === id);
      if (b) {
        let delta = (FRONT - angleOf(b)) % TAU;
        if (delta > Math.PI) delta -= TAU;
        if (delta < -Math.PI) delta += TAU;
        ringTarget[b.ring] = ringOff[b.ring] + delta;
      }
    }
    if (opts.focus) tab.focus();
    if (N.motionOff() || !raf) still();
  }
  tabs.forEach((tab) => {
    tab.addEventListener('click', (e) => { e.preventDefault(); select(tab.dataset.id, { user: true }); });
    tab.addEventListener('keydown', (e) => {
      const i = tabs.indexOf(tab);
      let j = null;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') j = (i + 1) % tabs.length;
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') j = (i - 1 + tabs.length) % tabs.length;
      else if (e.key === 'Home') j = 0;
      else if (e.key === 'End') j = tabs.length - 1;
      if (j !== null) { e.preventDefault(); select(tabs[j].dataset.id, { user: true, focus: true }); }
    });
  });
  // A planet click selects it in place. The page only moves when the panel can come into view gently, with the
  // planet you picked still on screen; otherwise it stays put (no more ~850 px jumps), and the panel waits below.
  function revealPanel(fromEl) {
    const p = consoleEl.querySelector('.orbit-panel:not([hidden])');
    if (!p || !fromEl) return;
    const vh = window.innerHeight;
    const r = p.getBoundingClientRect();
    if (r.top < vh - 40) return; // already on screen
    const header = document.querySelector('.site-header');
    const top = (header ? header.getBoundingClientRect().bottom : 0) + 12;
    const need = r.top - (vh - Math.min(r.height, vh * 0.4)); // shows the panel's first lines
    const room = fromEl.getBoundingClientRect().top - top;     // how far before the planet leaves the screen
    if (need > 0 && need <= room) window.scrollBy({ top: need, behavior: N.motionOff() ? 'auto' : 'smooth' });
  }
  bodies.forEach((b) => {
    b.el.addEventListener('click', (e) => {
      select(b.id, { user: true });
      revealPanel(b.el);
      if (!N.motionOff()) N.burst(e.clientX, e.clientY, 8, ['#F2B84B', '#FFF6E3']);
    });
    b.el.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') hovering = true; });
    b.el.addEventListener('pointerleave', () => { hovering = false; });
  });

  // ================================================================ cursor (desktop) and scroll
  function onMove(e) {
    if (e.pointerType !== 'mouse' || !fine.matches || N.motionOff()) return;
    const r = stage.getBoundingClientRect();
    pointer = { x: e.clientX - r.left, y: e.clientY - r.top };
    aimY = (pointer.x / r.width - 0.5) * 8;
    aimX = -(pointer.y / r.height - 0.5) * 6;
  }
  function onLeave() { pointer = null; aimX = 0; aimY = 0; hovering = false; }
  function onHeroMove(e) {
    if (e.pointerType !== 'mouse' || !fine.matches || N.motionOff()) return;
    aimMx = e.clientX / window.innerWidth - 0.5;
    aimMy = e.clientY / window.innerHeight - 0.5;
  }
  const onScroll = () => { scrollY = window.scrollY || 0; };
  stage.addEventListener('pointermove', onMove);
  stage.addEventListener('pointerleave', onLeave);
  hero.addEventListener('pointermove', onHeroMove);
  window.addEventListener('scroll', onScroll, { passive: true });

  // ================================================================ lifecycle
  measure();
  stage.classList.add('is-live');
  const initial = (location.hash.match(/^#orbit-p-(.+)$/) || [])[1];
  select(tabs.some((x) => x.dataset.id === initial) ? initial : tabs[0].dataset.id);
  place();
  const ro = 'ResizeObserver' in window ? new ResizeObserver(() => { measure(); place(); }) : null;
  if (ro) ro.observe(stage); else window.addEventListener('resize', () => { measure(); place(); });
  const io = 'IntersectionObserver' in window ? new IntersectionObserver((entries) => {
    visible = entries[0].isIntersecting;
    if (visible) start(); else stop();
  }, { threshold: 0 }) : null;
  if (io) io.observe(hero);
  const onVisibility = () => { if (document.hidden) stop(); else start(); };
  const onMotion = () => {
    if (N.motionOff()) {
      stop();
      pointer = null; aimX = aimY = tiltX = tiltY = 0; aimMx = aimMy = mx = my = 0;
      debris.forEach((d) => { d.x = d.y = d.vx = d.vy = 0; applyDebris(d); });
      still();
    } else start();
  };
  document.addEventListener('visibilitychange', onVisibility);
  document.addEventListener('nettle:motion', onMotion);
  window.addEventListener('pagehide', (e) => {
    stop();
    if (e.persisted) return;
    if (ro) ro.disconnect();
    if (io) io.disconnect();
    document.removeEventListener('visibilitychange', onVisibility);
    document.removeEventListener('nettle:motion', onMotion);
    window.removeEventListener('scroll', onScroll);
  });
  window.addEventListener('pageshow', (e) => { if (e.persisted) { measure(); startIntro(); start(); } });
  window.__nettleWorld = { stop, start, running: () => Boolean(raf) }; // test hook for the QA scripts
  if (N.motionOff()) still(); else { startIntro(); start(); }
})();

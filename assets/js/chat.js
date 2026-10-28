/* Nettle chat scenes: one small engine replays every "drawing of a chat" on the page.
   The HTML is the finished conversation (that is what you see without JavaScript and with reduced
   motion). When a scene is about to scroll into view, the engine hides the later steps, keeps the box
   at its final height (no layout jump), and plays them one by one when the scene is in view: typing
   dots, messages, button presses, counters, bars and pixel confetti. Offscreen it waits; "Play again"
   replays it. Also drives the "Watch Nettle work" carousel. */
(() => {
  'use strict';

  const N = window.Nettle || { motionOff: () => false, reduced: () => false, burst: () => {} };
  const roots = Array.from(document.querySelectorAll('[data-chat]'));
  if (!roots.length) return;
  const CANCEL = Symbol('cancel');

  function numberLike(finalText, value) {
    // keep the separator style of the final text ("1,450" / "1.450")
    const sep = /\d([.,])\d{3}/.exec(finalText);
    const s = String(Math.round(value));
    return sep ? s.replace(/\B(?=(\d{3})+(?!\d))/g, sep[1]) : s;
  }

  class Scene {
    constructor(root) {
      this.root = root;
      this.log = root.querySelector('.chat-log');
      this.replay = root.querySelector('.chat-replay');
      this.items = Array.from(root.querySelectorAll('[data-at]'));
      this.gones = Array.from(root.querySelectorAll('[data-gone]'));
      this.presses = Array.from(root.querySelectorAll('[data-press]'));
      this.counts = Array.from(root.querySelectorAll('[data-count]'));
      this.bars = Array.from(root.querySelectorAll('[data-bar]'));
      this.bursts = Array.from(root.querySelectorAll('[data-burst]'));
      const steps = [...this.items.map((e) => +e.dataset.at), ...this.gones.map((e) => +e.dataset.gone),
        ...this.presses.map((e) => +e.dataset.press), ...this.counts.map((e) => +e.dataset.count)];
      this.max = Math.max(0, ...steps);
      this.counts.forEach((c) => { c.dataset.final = c.textContent; });
      this.token = 0;
      this.state = 'final';
      this.visible = false;
      this.waiters = [];
      this.typingLabel = root.dataset.typingLabel || '{name}';
      if (this.replay) {
        this.replay.addEventListener('click', () => this.play(true));
        this.replay.hidden = N.reduced();
      }
    }
    setVisible(v) {
      this.visible = v;
      if (v) { this.waiters.splice(0).forEach((fn) => fn()); }
    }
    async wait(ms, my) {
      await new Promise((r) => window.setTimeout(r, ms));
      while (!this.visible || document.hidden) {
        if (my !== this.token) throw CANCEL;
        await new Promise((r) => { this.waiters.push(r); window.setTimeout(r, 500); });
      }
      if (my !== this.token) throw CANCEL;
    }
    crossfade() {
      // the finished conversation fades out on top while the new one starts: the box is never empty
      const ghost = this.log.cloneNode(true);
      ghost.classList.add('chat-ghost');
      ghost.setAttribute('aria-hidden', 'true');
      ghost.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'));
      ghost.style.top = this.log.offsetTop + 'px';
      ghost.style.height = this.log.offsetHeight + 'px';
      this.log.after(ghost);
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => ghost.classList.add('is-fading')));
      window.setTimeout(() => ghost.remove(), 1100);
    }
    lockHeight() {
      // reserve the final height so nothing below the scene moves while it plays
      this.log.style.minHeight = '';
      this.log.style.minHeight = this.log.getBoundingClientRect().height + 'px';
    }
    arm() {
      if (this.state === 'armed' || this.state === 'playing') return;
      this.lockHeight();
      this.root.classList.add('is-armed');
      this.items.forEach((e) => e.classList.add('is-waiting'));
      this.gones.forEach((e) => e.classList.remove('is-gone'));
      this.counts.forEach((c) => { c.textContent = numberLike(c.dataset.final, +c.dataset.from || 0); });
      this.bars.forEach((b) => b.classList.remove('is-on'));
      this.presses.forEach((p) => p.classList.remove('is-pressed'));
      this.state = 'armed';
    }
    finish() {
      this.token++;
      this.removeTyping();
      this.root.classList.remove('is-armed');
      this.items.forEach((e) => e.classList.remove('is-waiting'));
      this.counts.forEach((c) => { c.textContent = c.dataset.final; });
      this.bars.forEach((b) => b.classList.add('is-on'));
      this.presses.forEach((p) => p.classList.remove('is-pressed'));
      this.state = 'final';
      if (this.replay) this.replay.hidden = N.reduced();
      this.root.dispatchEvent(new CustomEvent('chat:done', { bubbles: true }));
    }
    showTyping(name) {
      this.removeTyping();
      const li = document.createElement('li');
      li.className = 'chat-typing';
      li.setAttribute('aria-hidden', 'true');
      const dots = document.createElement('span');
      dots.className = 'dots';
      dots.innerHTML = '<i></i><i></i><i></i>';
      li.appendChild(dots);
      li.appendChild(document.createTextNode(this.typingLabel.replace('{name}', name)));
      this.log.appendChild(li);
      this.typingEl = li;
    }
    removeTyping() { if (this.typingEl) { this.typingEl.remove(); this.typingEl = null; } }
    countUp(c, my) {
      const from = +c.dataset.from || 0;
      const to = Number(String(c.dataset.final).replace(/[^\d]/g, '')) || 0;
      const t0 = performance.now();
      const tick = (now) => {
        if (my !== this.token) return;
        const k = Math.min(1, (now - t0) / 1100);
        c.textContent = numberLike(c.dataset.final, from + (to - from) * (1 - Math.pow(1 - k, 3)));
        if (k < 1) window.requestAnimationFrame(tick); else c.textContent = c.dataset.final;
      };
      window.requestAnimationFrame(tick);
    }
    async play(user) {
      if (N.reduced()) { this.finish(); return; }
      if (!user && N.motionOff()) { this.finish(); return; }
      const replay = this.state === 'final' && user;
      if (replay) this.crossfade();
      if (this.state !== 'armed') { this.state = 'final'; this.arm(); }
      const my = ++this.token;
      this.state = 'playing';
      if (this.replay) this.replay.hidden = true;
      try {
        for (let s = 1; s <= this.max; s++) {
          const at = this.items.filter((e) => +e.dataset.at === s);
          const pause = Math.max(0, ...at.map((e) => +(e.dataset.pause || 0)));
          await this.wait((s === 1 && replay ? 120 : 650) + pause, my);
          const typer = at.find((e) => e.dataset.typing);
          if (typer) { this.showTyping(typer.dataset.typing); await this.wait(950, my); this.removeTyping(); }
          const pressed = this.presses.filter((p) => +p.dataset.press === s);
          if (pressed.length) {
            pressed.forEach((p) => p.classList.add('is-pressed'));
            await this.wait(320, my);
            pressed.forEach((p) => p.classList.remove('is-pressed'));
          }
          this.gones.filter((g) => +g.dataset.gone === s).forEach((g) => g.classList.add('is-gone'));
          at.forEach((e) => e.classList.remove('is-waiting'));
          this.counts.filter((c) => +c.dataset.count === s).forEach((c) => this.countUp(c, my));
          this.bars.filter((b) => +b.dataset.bar === s).forEach((b) => b.classList.add('is-on'));
          this.bursts.filter((b) => +b.dataset.burst === s).forEach((b) => {
            const r = b.closest('li') ? b.closest('li').getBoundingClientRect() : b.getBoundingClientRect();
            N.burst(r.left + Math.min(r.width, 300) / 2, r.top + 10, 18, ['#F2B84B', '#F28DB2', '#5AA9E6', '#5DBB4A']);
          });
        }
        await this.wait(400, my);
        this.finish();
      } catch (err) {
        if (err !== CANCEL) throw err;
      }
    }
  }

  const scenes = new Map(roots.map((r) => [r, new Scene(r)]));

  // ---------------------------------------------------------------- when to arm / play
  if ('IntersectionObserver' in window) {
    const vh = () => window.innerHeight || document.documentElement.clientHeight;
    const armIO = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        const sc = scenes.get(en.target);
        if (!en.isIntersecting || !sc || sc.state !== 'final' || sc.done || N.motionOff()) return;
        const r = en.target.getBoundingClientRect();
        if (r.top > vh() - 10) sc.arm(); // still below the screen: prepare it, the user never sees the jump
      });
    }, { rootMargin: '0px 0px 500px 0px' });
    const playIO = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        const sc = scenes.get(en.target);
        if (!sc) return;
        sc.setVisible(en.isIntersecting);
        if (en.isIntersecting && sc.state === 'armed') { sc.done = true; sc.play(false); }
      });
    }, { threshold: 0.3 });
    scenes.forEach((sc, root) => {
      if (root.closest('[data-watch-panels]')) return; // the carousel decides for its own scenes
      armIO.observe(root);
      playIO.observe(root);
    });
    // carousel scenes: only visibility, the carousel starts them
    scenes.forEach((sc, root) => { if (root.closest('[data-watch-panels]')) playIO.observe(root); });
  } else {
    scenes.forEach((sc) => sc.setVisible(true));
  }
  document.addEventListener('nettle:motion', () => {
    if (N.motionOff()) scenes.forEach((sc) => { if (sc.state !== 'final') sc.finish(); });
  });

  // ---------------------------------------------------------------- "Watch Nettle work" carousel
  const tabList = document.querySelector('[data-watch-tabs]');
  const panelsBox = document.querySelector('[data-watch-panels]');
  if (tabList && panelsBox) {
    const tabs = Array.from(tabList.querySelectorAll('.orbit-tab'));
    const panels = Array.from(panelsBox.querySelectorAll('.watch-panel'));
    let current = 0;
    let lastUser = 0;
    let advance = 0;
    let boxVisible = false;
    tabList.setAttribute('role', 'tablist');
    tabs.forEach((tab, i) => {
      tab.parentElement.setAttribute('role', 'presentation');
      tab.setAttribute('role', 'tab');
      const panel = panels[i];
      tab.setAttribute('aria-controls', panel.id);
      panel.setAttribute('role', 'tabpanel');
      panel.setAttribute('aria-labelledby', tab.id);
    });
    const sceneOf = (i) => scenes.get(panels[i].querySelector('[data-chat]'));
    function show(i, user) {
      current = (i + tabs.length) % tabs.length;
      clearTimeout(advance);
      tabs.forEach((tab, k) => { tab.setAttribute('aria-selected', String(k === current)); tab.tabIndex = k === current ? 0 : -1; });
      panels.forEach((p, k) => { p.hidden = k !== current; });
      const sc = sceneOf(current);
      if (!sc) return;
      if (N.motionOff() && !user) { sc.finish(); return; }
      sc.state = 'final';
      sc.arm();
      if (boxVisible || user) sc.play(Boolean(user));
    }
    tabs.forEach((tab, i) => {
      tab.addEventListener('click', (e) => { e.preventDefault(); lastUser = Date.now(); show(i, true); });
      tab.addEventListener('keydown', (e) => {
        let j = null;
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') j = i + 1;
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') j = i - 1;
        if (j !== null) { e.preventDefault(); lastUser = Date.now(); show(j, true); tabs[current].focus(); }
      });
    });
    panelsBox.addEventListener('chat:done', () => {
      clearTimeout(advance);
      if (N.motionOff() || Date.now() - lastUser < 15000) return;
      advance = window.setTimeout(() => { if (boxVisible && !document.hidden) show(current + 1, false); }, 2600);
    });
    panels.forEach((p, k) => { p.hidden = k !== 0; });
    tabs.forEach((tab, k) => { tab.setAttribute('aria-selected', String(k === 0)); tab.tabIndex = k === 0 ? 0 : -1; });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver((entries) => {
        boxVisible = entries[0].isIntersecting;
        const sc = sceneOf(current);
        if (boxVisible && sc && sc.state !== 'playing' && !sc.started && !N.motionOff()) { sc.started = true; show(current, false); }
      }, { threshold: 0.3 }).observe(panelsBox);
    }
  }
})();

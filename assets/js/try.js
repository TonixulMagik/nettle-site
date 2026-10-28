/* Try Nettle: a pretend Discord window that answers Nettle's commands, right in the browser.
   - The command list comes from data/commands.json (embedded at build time).
   - Nothing is sent anywhere and nothing typed is stored: no network calls, no storage.
   - Hand-made answers follow the real bot's behaviour in a short form (game rules from the bot's config:
     blackjack natural pays 3:2 and Nettle hits on soft 17; slots pay 5x a trio, 1.5x a pair, 50x the raccoon).
   - Accessible: the input is an ARIA combobox, the chat is a live log, every demo button is a real button. */
(() => {
  'use strict';

  const root = document.querySelector('[data-try]');
  if (!root) return;
  let data;
  try { data = JSON.parse(document.getElementById('try-data').textContent); } catch (e) { return; }
  const N = window.Nettle || { motionOff: () => false, reduced: () => false, burst: () => {} };
  const T = data.t;
  const lang = data.lang;
  const cmds = data.cmds;
  const byName = new Map(cmds.map((c) => [c.n, c]));
  const log = root.querySelector('.dw-log');
  const input = root.querySelector('#dw-input');
  const list = root.querySelector('#dw-list');
  const optsBox = root.querySelector('[data-opts]');
  const sendBtn = root.querySelector('[data-send]');
  const picker = root.querySelector('[data-picker]');
  const chName = root.querySelector('[data-ch-name]');
  const menuBtn = root.querySelector('.dw-menu');
  const avYou = document.getElementById('tpl-av-you');
  const avBot = document.getElementById('tpl-av-bot');
  const state = { chips: 1000, worked: false };
  const quiet = () => N.motionOff();

  // The placeholder must never be cut on a small phone: the long one when it fits the box, else the short one.
  const phLong = input.getAttribute('placeholder') || '';
  const phShort = input.dataset.placeholderShort || phLong;
  let phCtx = null;
  function fitPlaceholder() {
    try {
      const cs = window.getComputedStyle(input);
      phCtx = phCtx || document.createElement('canvas').getContext('2d');
      phCtx.font = cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
      const room = input.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 4;
      input.placeholder = phCtx.measureText(phLong).width <= room ? phLong : phShort;
    } catch (e) { input.placeholder = phShort; }
  }
  fitPlaceholder();
  if ('ResizeObserver' in window) new ResizeObserver(fitPlaceholder).observe(input);
  else window.addEventListener('resize', fitPlaceholder);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitPlaceholder);

  // ---------------------------------------------------------------- helpers
  const sleep = (ms) => new Promise((r) => window.setTimeout(r, ms));
  const tpl = (s, v) => String(s).replace(/\{(\w+)\}/g, (m, k) => (k in v ? v[k] : m));
  const num = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, lang === 'ro' ? '.' : ',');
  // a number before a noun: Romanian adds "de" from 20 on, except 101..119, 201..219 and so on ("100 de fise", "101 fise")
  const deRo = (n) => { const a = Math.abs(Math.round(n)); const r = a % 100; return a !== 0 && (r === 0 || r >= 20) ? ' de' : ''; };
  const qty = (n) => num(n) + (lang === 'ro' ? deRo(n) : '');
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v === false || v == null) continue;
        if (k === 'class') el.className = v;
        else if (k === 'text') el.textContent = v;
        else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
        else el.setAttribute(k, v === true ? '' : v);
      }
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
    return el;
  }
  const code = (s) => h('code', { class: 'notranslate', translate: 'no', text: s });
  const name = (s, c) => h('span', { class: 'msg-name notranslate', translate: 'no', style: '--c:' + c, text: s });
  const head = (who, bot, c) => h('p', { class: 'msg-head' }, name(who, c), bot ? h('span', { class: 'bot-tag', text: T.bot }) : null, h('span', { class: 'msg-time', text: T.time }));
  const avatar = (bot) => { const s = h('span', { class: 'msg-av', 'aria-hidden': 'true' }); s.append((bot ? avBot : avYou).content.cloneNode(true)); return s; };
  const text = (t) => h('p', { class: 'msg-text', text: t });
  const small = (t) => h('p', { class: 'msg-small', text: t });
  const embed = (title, body, color, ...extra) => h('div', { class: 'embed', style: '--ec:' + (color || '#5AA9E6') },
    title ? h('p', { class: 'embed-title', text: title }) : null, body ? h('p', { class: 'embed-text', text: body }) : null, ...extra);
  const field = (l, v) => h('div', { class: 'ef' }, h('span', { class: 'ef-l', text: l }), h('span', { class: 'ef-v', text: v }));
  const button = (label, kind, onclick) => h('button', { type: 'button', class: 'dbtn dw-card-btn dbtn--' + (kind || 'grey'), onclick }, label);
  const row = (...b) => h('div', { class: 'dbtns' }, ...b);
  function add(li) { log.append(li); log.scrollTop = log.scrollHeight; return li; }
  function botMsg(used, ...content) {
    return h('li', { class: 'msg msg--bot' },
      used ? h('p', { class: 'msg-used' }, name(T.you, '#F2B84B'), ' ' + T.used + ' ', code(used)) : null,
      h('div', { class: 'msg-row' }, avatar(true), h('div', { class: 'msg-main' }, head('Nettle', true, '#7CC6F2'), ...content)));
  }
  const userMsg = (t) => h('li', { class: 'msg' }, avatar(false), h('div', { class: 'msg-main' }, head(T.you, false, '#F2B84B'), text(t)));
  async function typing(ms) {
    if (quiet()) return;
    const li = add(h('li', { class: 'chat-typing', 'aria-hidden': 'true' }, h('span', { class: 'dots' }, h('i'), h('i'), h('i')), tpl(T.typing, { name: 'Nettle' })));
    await sleep(ms || 700);
    li.remove();
  }
  let toastTimer = 0;
  function toast(msg) {
    let t = root.querySelector('.dw-toast');
    if (!t) { t = h('div', { class: 'dw-toast', role: 'status' }); root.querySelector('.dw-compose').append(t); }
    t.textContent = msg;
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => t.remove(), 2600);
  }
  const demo = () => toast(T.toast);
  function burstAt(el) {
    if (quiet()) return;
    const r = el.getBoundingClientRect();
    N.burst(r.left + Math.min(r.width, 280) / 2, r.top + 20, 18, ['#F2B84B', '#F28DB2', '#5AA9E6', '#5DBB4A']);
  }
  function seeded(s) { let x = 2166136261; for (const ch of s) { x ^= ch.charCodeAt(0); x = Math.imul(x, 16777619); } return (x >>> 0); }
  function chipsLine() { return small(tpl(T.balance_line, { n: qty(state.chips) })); }
  function betOf(opts, def) {
    const m = Number(String(opts.miza || def).replace(/[^\d]/g, ''));
    return m >= 10 && m <= 10000 ? m : null;
  }
  function ensureChips() { if (state.chips < 10) { state.chips = 1000; return true; } return false; }

  // ---------------------------------------------------------------- cards
  const SUITS = ['♠', '♥', '♦', '♣'];
  const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  function deck() { const d = []; for (const s of SUITS) for (const r of RANKS) d.push({ r, s }); for (let i = d.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; } return d; }
  function value(hand) {
    let v = 0, aces = 0;
    for (const c of hand) { if (c.r === 'A') { v += 11; aces++; } else v += ['J', 'Q', 'K'].includes(c.r) ? 10 : Number(c.r); }
    while (v > 21 && aces) { v -= 10; aces--; }
    return { v, soft: aces > 0 };
  }
  const cardEl = (c, hidden) => hidden ? h('span', { class: 'pcard pcard--back', text: '?' })
    : h('span', { class: 'pcard' + (c.s === '♥' || c.s === '♦' ? ' pcard--red' : '') }, c.r, h('small', { text: c.s }));

  // ---------------------------------------------------------------- the answers
  const R = {};

  R['about'] = (o, used) => botMsg(used, embed(T.about.title, T.about.text, '#5AA9E6',
    field(T.about.f1, T.about.v1), field(T.about.f2, T.about.v2), field(T.about.f3, T.about.v3)),
    row(button(T.about.b1, 'green', demo), button(T.about.b2, 'grey', demo)));

  R['help'] = (o, used) => {
    const out = h('div');
    const counts = {};
    cmds.forEach((c) => { counts[c.c] = (counts[c.c] || 0) + 1; });
    const sel = h('select', { class: 'dselect', 'aria-label': T.help.menu, onchange: () => {
      out.replaceChildren();
      const items = cmds.filter((c) => c.c === sel.value);
      out.append(embed(data.cats[sel.value] || sel.value, '', '#8E7CF0',
        h('div', { class: 'dbtns' }, ...items.map((c) => h('button', { type: 'button', class: 'chip notranslate', translate: 'no', onclick: () => choose(c) }, '/' + c.n)))));
      log.scrollTop = log.scrollHeight;
    } }, h('option', { value: '', text: T.help.menu }), ...Object.keys(counts).map((k) => h('option', { value: k, text: (data.cats[k] || k) + ' (' + counts[k] + ')' })));
    return botMsg(used, embed(T.help.title, T.help.text, '#8E7CF0'), sel, out);
  };

  R['blackjack'] = (o, used) => {
    const B = T.blackjack;
    const bet = betOf(o, 100);
    if (!bet) return botMsg(used, text(B.bad_bet));
    const refill = ensureChips();
    const d = deck();
    const you = [d.pop(), d.pop()];
    const nettle = [d.pop(), d.pop()];
    const box = h('div');
    let done = false;
    function draw(final, msg) {
      const yv = value(you).v;
      box.replaceChildren(embed('🃏 ' + B.title, tpl(B.bet, { n: qty(bet) }), '#5DBB4A',
        h('div', { class: 'hand' }, h('span', { class: 'hand-l', text: B.you }), ...you.map((c) => cardEl(c)), h('span', { class: 'hand-t', text: String(yv) })),
        h('div', { class: 'hand' }, h('span', { class: 'hand-l', text: B.nettle }), cardEl(nettle[0]), ...nettle.slice(1).map((c) => cardEl(c, !final)),
          final ? h('span', { class: 'hand-t', text: String(value(nettle).v) }) : null)));
      if (msg) box.append(text(msg), chipsLine());
      if (!final) box.append(row(button(B.hit, 'blue', hit), button(B.stand, 'grey', stand)));
      else box.append(row(button(B.again, 'green', () => run('/blackjack miza:' + bet))));
      log.scrollTop = log.scrollHeight;
    }
    function settle(kind) {
      done = true;
      const map = { win: [bet, B.win], bj: [Math.round(bet * 1.5), B.bj], dealer_bust: [bet, B.dealer_bust], lose: [-bet, B.lose], bust: [-bet, B.bust], push: [0, B.push] };
      const [delta, line] = map[kind];
      state.chips += delta;
      draw(true, tpl(line, { n: qty(Math.abs(delta)) }));
      if (delta > 0) burstAt(box);
    }
    function dealerPlays() {
      let v = value(nettle);
      while (v.v < 17 || (v.v === 17 && v.soft)) { nettle.push(d.pop()); v = value(nettle); }
      return v.v;
    }
    function hit() { if (done) return; you.push(d.pop()); const v = value(you).v; if (v > 21) settle('bust'); else if (v === 21) stand(); else draw(false); }
    function stand() {
      if (done) return;
      const dn = value(nettle).v === 21 && nettle.length === 2;
      if (dn) return settle('lose');
      const dv = dealerPlays();
      const yv = value(you).v;
      if (dv > 21) settle('dealer_bust'); else if (yv > dv) settle('win'); else if (yv < dv) settle('lose'); else settle('push');
    }
    const yNat = value(you).v === 21;
    const dNat = value(nettle).v === 21;
    if (yNat && dNat) settle('push'); else if (yNat) settle('bj'); else draw(false);
    const li = botMsg(used, box);
    if (refill) li.querySelector('.msg-main').append(small(B.broke));
    return li;
  };

  R['pacanele'] = (o, used) => {
    const P = T.pacanele;
    const bet = betOf(o, 50);
    if (!bet) return botMsg(used, text(T.blackjack.bad_bet));
    ensureChips();
    const SYM = ['🍒', '🍋', '🍇', '🍊', '🔔', '💎'];
    const reel = h('div', { class: 'reel', 'aria-hidden': 'true' }, h('span', { text: '❔' }), h('span', { text: '❔' }), h('span', { text: '❔' }));
    const out = h('div');
    const box = h('div', null, embed('🎰 ' + P.title, tpl(P.bet, { n: qty(bet) }), '#F2B84B', reel), out);
    async function spin() {
      out.replaceChildren();
      const res = [0, 1, 2].map(() => (Math.random() < 0.12 ? '🦝' : pick(SYM)));
      if (!quiet()) { reel.classList.add('is-spin'); for (let i = 0; i < 8; i++) { [...reel.children].forEach((s) => { s.textContent = pick(SYM); }); await sleep(90); } reel.classList.remove('is-spin'); }
      [...reel.children].forEach((s, i) => { s.textContent = res[i]; });
      const same = (x) => res.filter((r) => r === x).length;
      let mult = 0, line;
      if (same('🦝') === 3) { mult = 50; line = P.jackpot; } else if (res[0] === res[1] && res[1] === res[2]) { mult = 5; line = P.trio; } else if (new Set(res).size === 2) { mult = 1.5; line = P.pair; } else { line = P.none; }
      const win = Math.round(bet * mult);
      state.chips += win - bet;
      out.append(text(tpl(line, { n: qty(mult ? win : bet) })), chipsLine(), row(button(P.spin, 'green', () => { ensureChips(); spin(); })));
      if (mult >= 5) burstAt(box);
      log.scrollTop = log.scrollHeight;
    }
    window.setTimeout(spin, 0);
    return botMsg(used, box);
  };

  R['xo'] = (o, used) => {
    const X = T.xo;
    const cells = Array(9).fill('');
    const status = text(X.turn);
    const grid = h('div', { class: 'xo', role: 'group', 'aria-label': X.title });
    const again = h('div');
    const lines = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
    const winner = () => { for (const [a, b, c] of lines) if (cells[a] && cells[a] === cells[b] && cells[b] === cells[c]) return cells[a]; return cells.every(Boolean) ? 'draw' : null; };
    function aiMove() {
      const free = cells.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);
      for (const who of ['O', 'X']) for (const i of free) { cells[i] = who; const w = winner(); cells[i] = ''; if (w === who) return i; }
      if (!cells[4]) return 4;
      return pick(free);
    }
    function paint() {
      grid.replaceChildren(...cells.map((v, i) => h('button', { type: 'button', class: v ? 'is-' + v.toLowerCase() : '', disabled: Boolean(v) || Boolean(winner()),
        'aria-label': String(i + 1) + (v ? ' ' + v : ''), onclick: () => play(i) }, v)));
    }
    function end(w) {
      status.textContent = w === 'X' ? X.win : w === 'O' ? X.lose : X.draw;
      if (w === 'X') burstAt(grid);
      again.replaceChildren(row(button(X.again, 'green', () => run('/xo'))));
    }
    function play(i) {
      if (cells[i] || winner()) return;
      cells[i] = 'X';
      let w = winner();
      if (!w) { cells[aiMove()] = 'O'; w = winner(); }
      paint();
      if (w) end(w);
    }
    paint();
    return botMsg(used, embed('#️⃣ ' + X.title, '', '#5AA9E6'), status, grid, again);
  };

  R['8ball'] = (o, used) => botMsg(used, embed('🎱 ' + T['8ball'].title, '', '#8E7CF0',
    h('p', { class: 'embed-text', text: T['8ball'].q + ' ' + (o.intrebare || '...') }), h('p', { class: 'embed-title', text: pick(T['8ball'].answers) })));

  R['ship'] = (o, used) => {
    const a = (o.cine1 || '@Ana').replace(/^@/, '');
    const b = (o.cine2 || T.ship.self).replace(/^@/, '');
    const p = seeded([a, b].sort().join('|').toLowerCase()) % 101;
    const level = T.ship.levels[Math.min(5, Math.floor(p / 17))];
    const bar = '█'.repeat(Math.round(p / 10)) + '░'.repeat(10 - Math.round(p / 10));
    const couple = a.slice(0, Math.ceil(a.length / 2)) + b.slice(Math.floor(b.length / 2));
    return botMsg(used, embed('💞 ' + T.ship.title, tpl(T.ship.result, { a, b, p }), '#F28DB2',
      h('p', { class: 'embed-text ship-bar', 'aria-hidden': 'true', text: bar }), h('p', { class: 'embed-text', text: level }), field(T.ship.name, couple)));
  };

  R['zar'] = (o, used) => {
    const f = Math.min(120, Math.max(2, parseInt(o.fete, 10) || 6));
    const n = Math.min(10, Math.max(1, parseInt(o.bucati, 10) || 1));
    const rolls = Array.from({ length: n }, () => 1 + Math.floor(Math.random() * f));
    return botMsg(used, embed('🎲 ' + T.zar.title, tpl(n === 1 && T.zar.text_one ? T.zar.text_one : T.zar.text, { n, f: qty(f) }), '#F2B84B',
      h('div', { class: 'dice-row' }, ...rolls.map((r) => h('span', { text: String(r) }))), n > 1 ? h('p', { class: 'embed-text', text: tpl(T.zar.total, { t: rolls.reduce((s, r) => s + r, 0) }) }) : null));
  };

  R['banut'] = (o, used) => botMsg(used, embed('🪙 ' + T.banut.title, '', '#F2B84B', h('p', { class: 'embed-title', text: Math.random() < 0.5 ? T.banut.heads : T.banut.tails })));

  R['alege'] = (o, used) => {
    const opts = String(o.optiuni || '').split(/\s*(?:,|\||\bsau\b|\bor\b)\s*/i).map((s) => s.trim()).filter(Boolean);
    if (opts.length < 2) return botMsg(used, text(T.alege.empty));
    return botMsg(used, text(tpl(T.alege.text, { x: pick(opts) })));
  };

  R['rate'] = (o, used) => {
    const x = o.ce || '?';
    const n = seeded(x.toLowerCase()) % 11;
    return botMsg(used, text(tpl(T.rate.text, { x, n, a: n === 8 ? 'an' : 'a' })));  // English: "an 8", "a 7"
  };

  R['calc'] = (o, used) => {
    const r = calc(String(o.expresie || ''));
    if (r === null) return botMsg(used, text(T.calc.err));
    const shown = Number.isInteger(r) ? num(r) : String(Math.round(r * 1e6) / 1e6).replace('.', lang === 'ro' ? ',' : '.');
    return botMsg(used, embed('🧮 ' + T.calc.title, o.expresie, '#46C2B4', h('p', { class: 'embed-title', text: '= ' + shown })));
  };

  R['profil'] = (o, used) => {
    const who = (o.cine || T.you).replace(/^@/, '');
    const card = h('div', { class: 'pcard-img', role: 'img', 'aria-label': T.profil.title },
      h('div', { class: 'pci-banner' }), (() => { const a = h('div', { class: 'pci-av' }); a.append(avYou.content.cloneNode(true)); return a; })(),
      h('p', { class: 'pci-name notranslate', translate: 'no', text: who }),
      h('div', { class: 'pci-badges' }, h('span'), h('span'), h('span')),
      h('div', { class: 'pci-roles' }, h('span', { style: '--c:#F2B84B', text: T.profil.r1 }), h('span', { style: '--c:#8E7CF0', text: T.profil.r2 })));
    return botMsg(used, card);
  };

  R['avatar'] = (o, used) => {
    const a = h('div', { class: 'pci-av', style: 'width:120px;height:120px;margin-top:6px' });
    a.append(avYou.content.cloneNode(true));
    return botMsg(used, text(T.avatar.text), a);
  };

  R['giveaway start'] = (o, used) => {
    const G = T.giveaway;
    const prize = o.premiu || EX.premiu;
    let joined = 0;
    let me = false;
    const count = h('b', { class: 'cnt', text: '0' });
    const joinBtn = button('', 'green', () => {
      me = !me; joined += me ? 1 : -1; count.textContent = String(joined);
      toast(me ? G.joined : G.left);
    });
    joinBtn.append(G.join + ' ', count);
    const others = window.setInterval(() => { if (joined < 40) { joined++; count.textContent = String(joined); } }, quiet() ? 99999 : 900);
    const box = h('div');
    const endBtn = button(G.end, 'red', () => {
      window.clearInterval(others);
      joinBtn.disabled = true; endBtn.disabled = true;
      const pool = ['Mara', 'Tudor', 'Ilinca', 'Radu', 'Sami', 'Bianca'];
      if (me) pool.push(T.you, T.you, T.you);
      const win = joined ? pick(pool) : null;
      box.append(embed('', win ? tpl(win === T.you && G.won_you ? G.won_you : G.won, { name: win, prize }) : G.nobody, '#F2B84B'));
      if (win) burstAt(box);
      log.scrollTop = log.scrollHeight;
    });
    return botMsg(used, embed('🎉 ' + G.title, '', '#F28DB2', field(G.prize, prize), field(G.winners, o.castigatori || '1'), field(G.ends, tpl(G.in, { d: o.durata || '12h' }))),
      row(joinBtn, endBtn), box);
  };

  R['sondaj'] = (o, used) => {
    const S = T.sondaj;
    const votes = [3, 2];
    const bars = h('div');
    let voted = false;
    function paint() {
      const total = votes[0] + votes[1];
      bars.replaceChildren(...[S.o1, S.o2].map((label, i) => {
        const p = Math.round((votes[i] / total) * 100);
        return h('div', { class: 'pbar' }, h('span', { class: 'pbar-l', text: label }), h('span', { class: 'pbar-t' }, h('span', { class: 'pbar-f', style: '--w:' + p + '%' })), h('span', { class: 'pbar-n', text: p + '%' }));
      }), small(qty(total) + ' ' + S.votes));
    }
    const vote = (i) => { if (voted) return; voted = true; votes[i]++; paint(); toast(S.voted); };
    paint();
    return botMsg(used, embed('📊 ' + S.q, '', '#8E7CF0', bars), row(button(S.o1, 'blue', () => vote(0)), button(S.o2, 'blue', () => vote(1))), small(S.note));
  };

  R['ticket setup'] = (o, used) => {
    const K = T.ticket;
    const out = h('div');
    const sel = h('select', { class: 'dselect', 'aria-label': K.title, onchange: () => {
      if (!sel.value) return;
      out.replaceChildren(h('p', { class: 'msg-sys' }, h('span', { class: 'sys-ic', 'aria-hidden': 'true' }), tpl(K.opened, { topic: sel.value })));
      log.scrollTop = log.scrollHeight;
    } }, h('option', { value: '', text: K.title }), ...K.topics.map((tp) => h('option', { value: tp, text: tp })));
    return botMsg(used, embed('🎫 ' + K.title, K.text, '#F2B84B'), sel, out, small(K.note));
  };

  function confirmFlow(M, used, who, d, r) {
    const box = h('div');
    const yes = button(M.yes, 'red', () => { yes.disabled = no.disabled = true; box.append(embed('', tpl(M.done, { who, d, r }), '#F2B84B')); log.scrollTop = log.scrollHeight; });
    const no = button(M.no, 'grey', () => { yes.disabled = no.disabled = true; box.append(text(M.cancelled)); });
    return botMsg(used, embed('', tpl(M.confirm, { who, d }), '#F07E5A'), row(yes, no), box);
  }
  R['timeout'] = (o, used) => confirmFlow(T.timeout, used, o.membru || '@Loud', o.durata || '10m', o.motiv || T.timeout.noreason);
  R['ban'] = (o, used) => confirmFlow(T.ban, used, o.membru || o.id_cont || '@Loud', '', o.motiv || T.timeout.noreason);

  R['convert'] = (o, used) => {
    const C = T.convert;
    const box = h('div');
    function ask(file) {
      box.replaceChildren(embed('🎞️ ' + tpl(C.ask, { file }), '', '#5AA9E6'),
        row(...['GIF', 'PNG', 'MP3', 'PDF'].map((fmt) => button(fmt, 'blue', () => go(file, fmt)))));
    }
    async function go(file, fmt) {
      box.querySelectorAll('button').forEach((b) => { b.disabled = true; });
      const bar = h('span', { class: 'pbar-f', style: '--w:0%' });
      box.append(text(C.working), h('div', { class: 'pbar pbar--solo' }, h('span', { class: 'pbar-t' }, bar)));
      for (let p = 0; p <= 100; p += 20) { bar.style.setProperty('--w', p + '%'); if (!quiet()) await sleep(160); }
      const out = file.replace(/\.[^.]+$/, '') + '.' + fmt.toLowerCase();
      box.append(text(tpl(C.done, { file: out })));
      log.scrollTop = log.scrollHeight;
    }
    if (o.fisier) ask(o.fisier);
    else box.append(text(C.nofile), row(...['dance.mp4', 'photo.png', 'song.wav'].map((f) => button(f, 'grey', () => ask(f)))));
    return botMsg(used, box);
  };

  R['ziua'] = (o, used) => {
    const Z = T.ziua;
    const day = h('select', { class: 'dselect', 'aria-label': Z.day }, ...Array.from({ length: 31 }, (_, i) => h('option', { value: i + 1, text: String(i + 1) })));
    const month = h('select', { class: 'dselect', 'aria-label': Z.month }, ...Z.months.map((m, i) => h('option', { value: i, text: m })));
    const out = h('div');
    const save = button(Z.save, 'green', () => {
      out.replaceChildren(text(tpl(Z.saved, { date: day.value + ' ' + Z.months[month.value] })));
      burstAt(out);
    });
    return botMsg(used, embed('🎂 ' + Z.title, Z.text, '#F28DB2'), h('div', { class: 'dbtns' }, day, month), row(save), out);
  };

  R['munca'] = (o, used) => {
    if (state.worked) return botMsg(used, text(T.munca.again));
    state.worked = true;
    const n = 100 + 10 * Math.floor(Math.random() * 11);  // like the bot: 100 to 200, in steps of 10 (JOCURI_PUBLIC_MUNCA_*)
    state.chips += n;
    return botMsg(used, embed('💼 ' + tpl(T.munca.text, { n: qty(n) }), '', '#F2B84B'), chipsLine());
  };
  R['banca'] = (o, used) => botMsg(used, embed('🪙 ' + T.banca.title, '', '#5AA9E6', field(T.banca.chips, num(state.chips)), field(T.banca.place, T.banca.placev)));

  R['compliment'] = (o, used) => botMsg(used, text(tpl(pick(T.compliment.list), { who: o.cine || '@' + T.you })));

  R['roleplay'] = (o, used) => botMsg(used, text(tpl(T.roleplay.text, { act: o.actiune || '🤗', a: T.you_from || T.you, b: o.cine || '@Ana' })), small(T.roleplay.nogif));

  R['ora'] = (o, used) => {
    const raw = String(o.oras || 'Tokyo').trim();
    const alias = { tokyo: 'Asia/Tokyo', londra: 'Europe/London', london: 'Europe/London', paris: 'Europe/Paris', 'new york': 'America/New_York',
      bucuresti: 'Europe/Bucharest', 'bucurești': 'Europe/Bucharest', bucharest: 'Europe/Bucharest', berlin: 'Europe/Berlin', madrid: 'Europe/Madrid', roma: 'Europe/Rome', rome: 'Europe/Rome', sydney: 'Australia/Sydney' };
    const zone = alias[raw.toLowerCase()] || raw;
    try {
      const parts = new Intl.DateTimeFormat(lang, { timeZone: zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
      const get = (t) => (parts.find((p) => p.type === t) || {}).value || '';
      return botMsg(used, text(tpl(T.ora.text, { city: raw, time: get('hour') + '.' + get('minute') })));
    } catch (e) {
      return botMsg(used, text(T.ora.err));
    }
  };

  R['emoji'] = (o, used) => botMsg(used, h('p', { class: 'big-emoji', text: (o.emoji || '🦝').trim() || '🦝' }));

  // ---------------------------------------------------------------- calculator (no eval: a small parser)
  function calc(src) {
    const s = src.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-').replace(/(\d),(\d)/g, '$1.$2').replace(/\s+/g, '');
    let i = 0;
    const peek = () => s[i];
    function num_() { const m = /^\d+(\.\d+)?/.exec(s.slice(i)); if (!m) throw 0; i += m[0].length; return parseFloat(m[0]); }
    function atom() {
      if (peek() === '(') { i++; const v = expr(); if (s[i++] !== ')') throw 0; return v; }
      if (peek() === '-') { i++; return -atom(); }
      let v = num_();
      if (peek() === '%') { i++; v /= 100; }
      return v;
    }
    function pow() { const b = atom(); if (peek() === '^') { i++; return Math.pow(b, pow()); } return b; }
    function term() { let v = pow(); while (peek() === '*' || peek() === '/') { const op = s[i++]; const r = pow(); v = op === '*' ? v * r : v / r; } return v; }
    function expr() { let v = term(); while (peek() === '+' || peek() === '-') { const op = s[i++]; const r = term(); v = op === '+' ? v + r : v - r; } return v; }
    try { const v = expr(); if (i !== s.length || !Number.isFinite(v)) return null; return v; } catch (e) { return null; }
  }

  // ---------------------------------------------------------------- defaults for the options
  const EX = lang === 'ro'
    ? { intrebare: 'Câștig azi?', optiuni: 'pizza, sushi sau ciorbă', ce: 'pizza cu ananas', premiu: 'un rol personalizat', actiune: 'Îmbrățișare' }
    : { intrebare: 'Will I win today?', optiuni: 'pizza, sushi or soup', ce: 'pizza with pineapple', premiu: 'a custom role', actiune: 'Hug' };
  const DEFAULTS = {
    'blackjack': 'miza:100', 'pacanele': 'miza:50', 'dinamite': 'miza:100', 'barbut': 'miza:100', 'razboi': 'miza:100',
    '8ball': 'intrebare:' + EX.intrebare, 'alege': 'optiuni:' + EX.optiuni, 'rate': 'ce:' + EX.ce, 'calc': 'expresie:(2 + 3) × 4',
    'ship': 'cine1:@Ana cine2:@Radu', 'zar': 'fete:6 bucati:2', 'ora': 'oras:Tokyo', 'roleplay': 'actiune:' + EX.actiune + ' cine:@Ana',
    'giveaway start': 'durata:12h castigatori:1 premiu:' + EX.premiu, 'timeout': 'membru:@Loud durata:10m motiv:Spam',
    'ban': 'membru:@Loud motiv:Spam', 'convert': 'fisier:dance.mp4', 'emoji': 'emoji:🦝', 'compliment': 'cine:@Ana'
  };

  // ---------------------------------------------------------------- parsing and running
  function parse(raw) {
    const s = raw.trim();
    if (!s.startsWith('/')) return { plain: s };
    const body = s.slice(1);
    let best = null;
    for (const c of cmds) if ((body === c.n || body.startsWith(c.n + ' ')) && (!best || c.n.length > best.n.length)) best = c;
    if (!best) return { unknown: body.split(/\s/)[0] };
    const rest = body.slice(best.n.length).trim();
    const opts = {};
    const re = /(?:^|\s)([a-z_0-9]+):/gi;
    const marks = [];
    let m;
    while ((m = re.exec(rest))) marks.push({ k: m[1].toLowerCase(), keyStart: m.index, start: m.index + m[0].length });
    marks.forEach((mk, i) => { opts[mk.k] = rest.slice(mk.start, i + 1 < marks.length ? marks[i + 1].keyStart : rest.length).trim(); });
    return { cmd: best, opts, raw: s };
  }

  let busy = false;
  async function run(raw) {
    if (busy) return;
    busy = true;
    try {
      const p = parse(raw);
      if (p.plain !== undefined) {
        if (!p.plain) return;
        add(userMsg(p.plain));
        await typing();
        add(botMsg(null, text(T.plain)));
        return;
      }
      if (p.unknown !== undefined) {
        await typing(400);
        add(botMsg(raw.trim(), text(T.unknown)));
        return;
      }
      await typing();
      const handler = R[p.cmd.n];
      const li = handler ? handler(p.opts, p.raw) : botMsg(p.raw, embed('', tpl(T.generic, { cmd: '/' + p.cmd.n }), '#5AA9E6', h('p', { class: 'embed-text', text: p.cmd.d })), small(T.generic_short));
      add(li);
    } finally {
      busy = false;
    }
  }

  // ---------------------------------------------------------------- autocomplete (ARIA combobox)
  let shown = [];
  let active = -1;
  function closeList() { list.hidden = true; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); active = -1; }
  function openList(items) {
    shown = items.slice(0, 120);
    list.replaceChildren();
    if (!shown.length) {
      list.append(h('li', { class: 'dw-empty', role: 'option', 'aria-disabled': 'true', text: T.no_match }));
    } else {
      shown.forEach((c, i) => {
        list.append(h('li', { id: 'dw-opt-' + i, role: 'option', 'aria-selected': 'false', onmousedown: (e) => { e.preventDefault(); choose(c); } },
          h('b', { class: 'notranslate', translate: 'no', text: '/' + c.n }), h('span', { text: c.d })));
      });
    }
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    setActive(shown.length ? 0 : -1);
  }
  function setActive(i) {
    active = i;
    [...list.children].forEach((li, k) => li.setAttribute('aria-selected', String(k === i)));
    if (i >= 0) { input.setAttribute('aria-activedescendant', 'dw-opt-' + i); const el = list.children[i]; if (el) el.scrollIntoView({ block: 'nearest' }); }
    else input.removeAttribute('aria-activedescendant');
  }
  function filter() {
    const v = input.value;
    if (!v.startsWith('/')) { closeList(); return; }
    const q = v.slice(1).toLowerCase();
    if (shown.length && byName.has(q.trim()) && v.endsWith(' ')) { closeList(); return; }
    if (/\s\S+:/.test(q)) { closeList(); return; } // options are being typed
    const starts = cmds.filter((c) => c.n.startsWith(q.trim()));
    const has = cmds.filter((c) => !c.n.startsWith(q.trim()) && c.n.includes(q.trim()));
    openList(starts.concat(has));
  }
  function showOpts(c) {
    optsBox.replaceChildren();
    if (!c || !c.p.length) { optsBox.hidden = true; return; }
    optsBox.append(h('span', { class: 'dw-opt' }, T.options));
    c.p.forEach((p) => optsBox.append(h('button', { type: 'button', class: 'dw-opt dw-card-btn', title: p.d, onclick: () => {
      if (!new RegExp('(^|\\s)' + p.n + ':').test(input.value)) input.value = input.value.replace(/\s*$/, ' ') + p.n + ':';
      input.focus();
    } }, h('b', { text: p.n }), p.r ? h('span', { class: 'req', text: ' ' + T.required }) : null)));
    optsBox.hidden = false;
  }
  function choose(c) {
    input.value = '/' + c.n + (DEFAULTS[c.n] ? ' ' + DEFAULTS[c.n] : (c.p.length ? ' ' : ''));
    closeList();
    showOpts(c);
    input.focus();
    try { input.setSelectionRange(input.value.length, input.value.length); } catch (e) { /* not supported */ }
  }
  function send() {
    const v = input.value;
    if (!v.trim()) return;
    input.value = '';
    closeList();
    showOpts(null);
    run(v);
  }

  input.addEventListener('input', () => { filter(); const p = parse(input.value); showOpts(p.cmd || null); });
  input.addEventListener('keydown', (e) => {
    if (!list.hidden && shown.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive((active + 1) % shown.length); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setActive((active - 1 + shown.length) % shown.length); return; }
      if ((e.key === 'Enter' || e.key === 'Tab') && active >= 0) {
        const typedExact = byName.has(input.value.slice(1).trim()) && shown[active].n === input.value.slice(1).trim();
        if (!(e.key === 'Enter' && typedExact)) { e.preventDefault(); choose(shown[active]); return; }
      }
    }
    if (e.key === 'Escape') { closeList(); return; }
    if (e.key === 'Enter') { e.preventDefault(); send(); }
  });
  input.addEventListener('blur', () => window.setTimeout(closeList, 150));
  sendBtn.addEventListener('click', send);
  picker.addEventListener('click', () => {
    if (!list.hidden) { closeList(); return; }
    if (!input.value.startsWith('/')) input.value = '/';
    input.focus();
    filter();
  });
  root.querySelectorAll('.dw-ch').forEach((b) => b.addEventListener('click', () => {
    root.querySelectorAll('.dw-ch').forEach((x) => x.setAttribute('aria-current', String(x === b)));
    chName.textContent = b.dataset.ch;
    root.classList.remove('show-channels');
    if (menuBtn) menuBtn.setAttribute('aria-expanded', 'false');
  }));
  if (menuBtn) menuBtn.addEventListener('click', () => {
    const open = !root.classList.contains('show-channels');
    root.classList.toggle('show-channels', open);
    menuBtn.setAttribute('aria-expanded', String(open));
  });
  // a gentle first suggestion, never auto-sent
  const q = new URLSearchParams(window.location.search).get('cmd');
  if (q && byName.has(q)) choose(byName.get(q));
})();

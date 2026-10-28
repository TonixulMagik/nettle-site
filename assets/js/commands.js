/* Nettle commands catalog: search, category filter, deep links (#cmd-name), copy buttons.
   The full list is server-rendered; this only hides and shows cards. State lives in the URL
   (?q=...&cat=...) so a filtered view can be shared. Press "/" to jump to the search box. */
(() => {
  'use strict';

  const root = document.getElementById('cmd-root');
  const input = document.getElementById('cmd-q');
  if (!root || !input) return;

  const clearBtn = document.querySelector('.clear-q');
  const filters = Array.from(document.querySelectorAll('.filter'));
  const count = document.getElementById('cmd-count');
  const empty = document.getElementById('cmd-empty');
  const emptyTitle = empty ? empty.querySelector('[data-template]') : null;
  const cards = Array.from(root.querySelectorAll('.cmd'));
  const groups = Array.from(root.querySelectorAll('.cmd-group'));
  const total = cards.length;
  const L = { copy: root.dataset.copy, copied: root.dataset.copied, failed: root.dataset.copyFailed };

  const live = document.createElement('p');
  live.className = 'visually-hidden';
  live.setAttribute('aria-live', 'polite');
  root.appendChild(live);

  const fold = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  let cat = 'all';
  let q = '';

  function syncUrl() {
    try {
      const url = new URL(window.location.href);
      if (q) url.searchParams.set('q', q); else url.searchParams.delete('q');
      if (cat !== 'all') url.searchParams.set('cat', cat); else url.searchParams.delete('cat');
      window.history.replaceState(null, '', url.pathname + url.search + url.hash);
    } catch (e) { /* history blocked: filtering still works */ }
  }

  function apply(updateUrl) {
    const tokens = fold(q).split(/\s+/).filter(Boolean).map((tk) => tk.replace(/^\/+/, '')).filter(Boolean);
    let shown = 0;
    for (const c of cards) {
      const on = (cat === 'all' || c.dataset.cat === cat) && tokens.every((tk) => c.dataset.search.includes(tk));
      c.hidden = !on;
      if (on) shown += 1;
    }
    for (const g of groups) g.hidden = !g.querySelector('.cmd:not([hidden])');
    if (count) {
      // "Se văd 74 din 74 de comenzi", "Se vede 1 din 74 de comenzi" (the Romanian "de" depends on the total)
      const tpl = (shown === 1 && count.dataset.templateOne) || count.dataset.template || '{n}/{total}';
      const r = total % 100;
      const de = document.documentElement.lang === 'ro' && total !== 0 && (r === 0 || r >= 20) ? 'de ' : '';
      count.textContent = tpl.replace('{n}', shown).replace('{total}', total).replace('{de}', de);
    }
    if (empty) {
      empty.hidden = shown !== 0;
      if (!shown && emptyTitle) emptyTitle.textContent = emptyTitle.dataset.template.replace('{q}', q.trim());
    }
    filters.forEach((f) => f.setAttribute('aria-pressed', String(f.dataset.cat === cat)));
    if (clearBtn) clearBtn.hidden = !q;
    if (updateUrl) syncUrl();
  }

  let debounce = 0;
  input.addEventListener('input', () => {
    window.clearTimeout(debounce);
    debounce = window.setTimeout(() => { q = input.value; apply(true); }, 70);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && input.value) { e.preventDefault(); input.value = ''; q = ''; apply(true); }
  });
  if (clearBtn) clearBtn.addEventListener('click', () => { input.value = ''; q = ''; apply(true); input.focus(); });
  filters.forEach((f) => f.addEventListener('click', () => { cat = f.dataset.cat; apply(true); }));
  document.querySelectorAll('[data-cmd-reset]').forEach((b) => b.addEventListener('click', () => {
    input.value = ''; q = ''; cat = 'all'; apply(true); input.focus();
  }));

  document.addEventListener('keydown', (e) => {
    if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
    const el = document.activeElement;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
    e.preventDefault();
    input.focus();
  });

  // ---------------------------------------------------------------- deep links
  function showTarget(scroll) {
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (!id.startsWith('cmd-')) return;
    const card = document.getElementById(id);
    if (!card || !card.classList.contains('cmd')) return;
    if (card.hidden) { input.value = ''; q = ''; cat = 'all'; apply(true); }
    cards.forEach((c) => c.classList.toggle('is-target', c === card));
    if (scroll) card.scrollIntoView({ block: 'start' });
  }
  window.addEventListener('hashchange', () => showTarget(true));

  // ---------------------------------------------------------------- copy
  function legacyCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    ta.remove();
    return ok;
  }
  function selectText(card) {
    const code = card.querySelector('.cmd-example code') || card.querySelector('.cmd-name code');
    if (!code) return;
    try {
      const range = document.createRange();
      range.selectNodeContents(code);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    } catch (e) { /* nothing to select */ }
  }
  root.querySelectorAll('.copy-btn').forEach((b) => { b.hidden = false; });
  root.addEventListener('click', async (e) => {
    const btn = e.target.closest('.copy-btn');
    if (!btn) return;
    const text = btn.dataset.copyText || '';
    btn.setAttribute('aria-busy', 'true');
    let ok = false;
    try {
      if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); ok = true; }
      else ok = legacyCopy(text);
    } catch (err) {
      ok = legacyCopy(text);
    }
    btn.removeAttribute('aria-busy');
    btn.classList.remove('is-success', 'is-error');
    btn.classList.add(ok ? 'is-success' : 'is-error');
    btn.textContent = ok ? L.copied : L.copy;
    live.textContent = ok ? L.copied + ': ' + text : L.failed;
    if (!ok) {
      const card = btn.closest('.cmd');
      if (card) {
        let note = card.querySelector('.copy-fail');
        if (!note) {
          note = document.createElement('p');
          note.className = 'cmd-note copy-fail';
          note.style.color = 'var(--err)';
          card.appendChild(note);
        }
        note.textContent = L.failed;
        selectText(card);
      }
    }
    window.clearTimeout(btn._reset);
    btn._reset = window.setTimeout(() => {
      btn.textContent = L.copy;
      btn.classList.remove('is-success', 'is-error');
    }, 2200);
  });

  // ---------------------------------------------------------------- initial state from the URL
  try {
    const params = new URLSearchParams(window.location.search);
    q = params.get('q') || '';
    const c = params.get('cat');
    if (c && filters.some((f) => f.dataset.cat === c)) cat = c;
    input.value = q;
  } catch (e) { /* old browser: start unfiltered */ }
  apply(false);
  showTarget(false);
})();

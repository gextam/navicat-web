/* Navicat Web - core: state, DOM helpers, API client, dialogs, menus, toasts, tabs, event bus */
(function () {
  'use strict';
  const NW = window.NW;

  NW.state = { connections: [], conns: {}, settings: {}, info: {} };

  /* ------------------------------------------------------------ DOM helpers */
  function h(tag, attrs) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const k in attrs) {
        const v = attrs[k];
        if (v === undefined || v === null || v === false) continue;
        if (k === 'class' || k === 'className') el.className = v;
        else if (k === 'style') { if (typeof v === 'string') el.style.cssText = v; else Object.assign(el.style, v); }
        else if (k === 'html') el.innerHTML = v;
        else if (k === 'text') el.textContent = v;
        else if (k === 'dataset') Object.assign(el.dataset, v);
        else if (k === 'for') el.htmlFor = v;
        else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
        else if (k in el && typeof v !== 'object') { try { el[k] = v; } catch (e) { el.setAttribute(k, v); } }
        else el.setAttribute(k, v === true ? '' : v);
      }
    }
    for (let i = 2; i < arguments.length; i++) append(el, arguments[i]);
    return el;
  }
  function append(el, c) {
    if (c === null || c === undefined || c === false) return;
    if (Array.isArray(c)) { c.forEach(x => append(el, x)); return; }
    if (c instanceof Node) el.appendChild(c);
    else el.appendChild(document.createTextNode(String(c)));
  }
  function esc(s) {
    return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  }
  function svg(name, size) { const s = h('span', { class: 'ico' }); s.innerHTML = NW.icon(name, size); return s; }
  NW.h = h; NW.append = append; NW.esc = esc; NW.svg = svg;
  NW.$ = (sel, root) => (root || document).querySelector(sel);
  NW.$$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  NW.fmt = {
    bytes(n) {
      n = Number(n) || 0;
      if (n < 1024) return n + ' B';
      if (n < 1048576) return (n / 1024).toFixed(n < 10240 ? 1 : 0) + ' KB';
      if (n < 1073741824) return (n / 1048576).toFixed(1) + ' MB';
      return (n / 1073741824).toFixed(2) + ' GB';
    },
    num(n) { if (n === null || n === undefined || n === '') return ''; return Number(n).toLocaleString('en-US'); },
    time(sec) { sec = Number(sec) || 0; return sec < 0.0005 ? '< 0.001s' : sec.toFixed(3) + 's'; },
    date(s) { if (!s) return ''; return String(s).replace('T', ' ').replace(/\.\d+.*$/, '').slice(0, 19); },
    plural(n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); },
  };
  NW.qi = name => '`' + String(name).replace(/`/g, '``') + '`';
  NW.qs = s => "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "''").replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\0/g, '\\0') + "'";
  NW.debounce = (fn, ms) => { let t; return function () { clearTimeout(t); const a = arguments, c = this; t = setTimeout(() => fn.apply(c, a), ms); }; };
  NW.uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  NW.copyText = async function (text) {
    try { await navigator.clipboard.writeText(text); return true; } catch (e) {
      const ta = h('textarea', { style: 'position:fixed;left:-9999px', value: text });
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch (e2) { }
      ta.remove();
      return true;
    }
  };
  NW.b64ToBytes = function (b64) { const bin = atob(b64); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; };
  NW.bytesToB64 = function (bytes) { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); };
  NW.bytesToHex = function (bytes, max) { let s = ''; const n = max ? Math.min(max, bytes.length) : bytes.length; for (let i = 0; i < n; i++) s += bytes[i].toString(16).padStart(2, '0'); return s; };

  /** Text and class for a grid cell. Values may be strings, null or {b,n} / {big,n,p} objects. */
  NW.cellText = function (v, col) {
    if (v === null || v === undefined) return { text: '(NULL)', cls: 'null' };
    if (typeof v === 'object') {
      if (v.big) return { text: (v.bin ? '(BLOB) ' : '(TEXT) ') + NW.fmt.bytes(v.n), cls: 'blob' };
      if (v.b !== undefined) {
        if (v.n <= 32) return { text: v.n === 0 ? '(empty binary)' : '0x' + NW.bytesToHex(NW.b64ToBytes(v.b)).toUpperCase(), cls: 'blob' };
        return { text: '(BLOB) ' + NW.fmt.bytes(v.n), cls: 'blob' };
      }
      return { text: JSON.stringify(v), cls: '' };
    }
    let s = String(v);
    if (s.length > 500) s = s.slice(0, 500) + '…';
    s = s.replace(/\r?\n/g, '↵');
    return { text: s, cls: col && col.num ? 'num' : '' };
  };

  /* ------------------------------------------------------------ SQL statement splitter (client side) */
  NW.splitSql = function (s) {
    const len = s.length; const out = []; let delim = ';'; let start = 0, i = 0, content = false, lineStart = true;
    const push = (end, withDelim) => { const sql = s.slice(start, end); if (content && sql.trim() !== '') out.push({ sql: sql.trim(), from: start + (sql.length - sql.trimStart().length), to: end, delim }); start = withDelim ? end + delim.length : end; content = false; };
    while (i < len) {
      const c = s[i];
      if (lineStart && !content && (c === 'd' || c === 'D') && s.substr(i, 9).toUpperCase() === 'DELIMITER' && (i + 9 >= len || /\s/.test(s[i + 9]))) {
        let eol = s.indexOf('\n', i); if (eol < 0) eol = len;
        const nd = s.slice(i + 9, eol).trim(); if (nd) delim = nd;
        i = eol + 1; start = Math.min(i, len); lineStart = true; continue;
      }
      if (c === '\n') { lineStart = true; i++; continue; }
      if (c === ' ' || c === '\t' || c === '\r') { i++; continue; }
      if (c === '-' && s[i + 1] === '-' && (i + 2 >= len || /[\s]/.test(s[i + 2]))) { let eol = s.indexOf('\n', i); i = eol < 0 ? len : eol; continue; }
      if (c === '#') { let eol = s.indexOf('\n', i); i = eol < 0 ? len : eol; continue; }
      if (c === '/' && s[i + 1] === '*') { const end = s.indexOf('*/', i + 2); if (s[i + 2] === '!') content = true; i = end < 0 ? len : end + 2; lineStart = false; continue; }
      if (c === "'" || c === '"' || c === '`') {
        const q = c; i++;
        while (i < len) { const d = s[i]; if (d === '\\' && q !== '`') { i += 2; continue; } if (d === q) { i++; break; } i++; }
        content = true; lineStart = false; continue;
      }
      if (c === delim[0] && s.substr(i, delim.length) === delim) { push(i, true); i += delim.length; lineStart = false; continue; }
      content = true; lineStart = false; i++;
    }
    if (content && s.slice(start).trim() !== '') push(len, false);
    return out;
  };

  /* ------------------------------------------------------------ API */
  NW.api = async function (action, params, opts) {
    params = params || {}; opts = opts || {};
    let res;
    try {
      res = await fetch('api.php', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': NW.csrf },
        body: JSON.stringify(Object.assign({ action: action }, params)),
        signal: opts.signal,
      });
    } catch (e) {
      if (e.name === 'AbortError') throw e;
      throw new Error('Cannot reach the server: ' + e.message);
    }
    if (res.status === 401) { location.href = 'login.php'; throw new Error('Not signed in'); }
    let data;
    const text = await res.text();
    try { data = JSON.parse(text); } catch (e) {
      throw new Error('The server returned an unreadable response (HTTP ' + res.status + '): ' + text.slice(0, 300));
    }
    if (!data.ok) { const err = new Error(data.error || 'Unknown error'); err.errno = data.errno; throw err; }
    return data;
  };
  NW.download = function (action, params) {
    const form = h('form', { method: 'post', action: 'api.php', target: 'nw-dl-frame', style: 'display:none' });
    const add = (k, v) => form.appendChild(h('input', { type: 'hidden', name: k, value: v }));
    add('action', action); add('csrf', NW.csrf);
    for (const k in params) { const v = params[k]; if (v === undefined || v === null) continue; add(k, typeof v === 'object' ? JSON.stringify(v) : String(v)); }
    document.body.appendChild(form); form.submit(); setTimeout(() => form.remove(), 2000);
  };
  NW.upload = async function (action, fields, blob, filename) {
    const fd = new FormData();
    fd.append('action', action); fd.append('csrf', NW.csrf);
    for (const k in fields) fd.append(k, fields[k]);
    if (blob) fd.append('chunk', blob, filename || 'chunk.bin');
    const res = await fetch('api.php', { method: 'POST', credentials: 'same-origin', body: fd, headers: { 'X-CSRF-Token': NW.csrf } });
    if (res.status === 401) { location.href = 'login.php'; throw new Error('Not signed in'); }
    const data = await res.json().catch(() => ({ ok: false, error: 'Unreadable response (HTTP ' + res.status + ')' }));
    if (!data.ok) throw new Error(data.error || 'Upload failed');
    return data;
  };

  /* ------------------------------------------------------------ event bus */
  const handlers = {};
  NW.bus = {
    on(ev, fn) { (handlers[ev] = handlers[ev] || []).push(fn); return () => NW.bus.off(ev, fn); },
    off(ev, fn) { if (handlers[ev]) handlers[ev] = handlers[ev].filter(f => f !== fn); },
    emit(ev, data) { (handlers[ev] || []).slice().forEach(fn => { try { fn(data); } catch (e) { console.error(e); } }); },
  };

  /* ------------------------------------------------------------ state helpers */
  NW.connById = id => NW.state.connections.find(c => c.id === id) || null;
  NW.connName = id => { const c = NW.connById(id); return c ? c.name : id; };
  NW.connState = id => NW.state.conns[id] || (NW.state.conns[id] = { open: false, databases: [], dbs: {} });
  NW.dbState = (conn, db) => { const cs = NW.connState(conn); return cs.dbs[db] || (cs.dbs[db] = { open: false, objects: null }); };
  NW.settings = {
    get(k, def) { const v = NW.state.settings[k]; return v === undefined || v === null ? def : v; },
    set(k, v) { NW.state.settings[k] = v; saveSettings(); NW.bus.emit('settings-changed', { key: k, value: v }); },
  };
  const saveSettings = NW.debounce(() => { NW.api('app.settings.save', { settings: NW.state.settings }).catch(() => { }); }, 500);
  NW.applyTheme = function () {
    document.documentElement.setAttribute('data-theme', NW.settings.get('theme', 'light'));
    document.documentElement.style.setProperty('--fs', (NW.settings.get('fontSize', 12)) + 'px');
  };

  /* ------------------------------------------------------------ status bar */
  NW.status = {
    left(t) { const el = NW.$('#status-left'); if (el) el.textContent = t || ''; },
    right(t) { const el = NW.$('#status-right'); if (el) el.textContent = t || ''; },
  };

  /* ------------------------------------------------------------ toasts */
  let toastRoot = null;
  NW.Toast = {
    show(msg, kind, ms) {
      if (!toastRoot) { toastRoot = h('div', { class: 'toasts' }); document.body.appendChild(toastRoot); }
      const t = h('div', { class: 'toast ' + (kind || '') , text: msg });
      toastRoot.appendChild(t);
      const kill = () => { t.style.opacity = '0'; t.style.transition = 'opacity .2s'; setTimeout(() => t.remove(), 220); };
      t.addEventListener('click', kill);
      setTimeout(kill, ms || (kind === 'err' ? 7000 : 3200));
    },
    ok(m) { NW.Toast.show(m, 'ok'); }, err(m) { NW.Toast.show(m, 'err'); }, warn(m) { NW.Toast.show(m, 'warn'); }, info(m) { NW.Toast.show(m, ''); },
  };

  /* ------------------------------------------------------------ busy overlay */
  NW.busy = async function (p, text) {
    const box = h('div', { class: 'busy' }, h('div', { class: 'busy-box' }, h('span', { class: 'spinner' }), h('span', { text: text || 'Working…' })));
    const t = setTimeout(() => document.body.appendChild(box), 150);
    try { return await (typeof p === 'function' ? p() : p); }
    finally { clearTimeout(t); box.remove(); }
  };

  /* ------------------------------------------------------------ dialogs */
  const dialogStack = [];
  NW.Dialog = {
    open(o) {
      const bd = h('div', { class: 'dlg-backdrop' });
      const dlg = h('div', { class: 'dlg ' + (o.cls || ''), style: o.width ? { width: typeof o.width === 'number' ? o.width + 'px' : o.width } : null, role: 'dialog' });
      const title = h('div', { class: 'dlg-title' }, o.icon ? svg(o.icon) : null, h('span', { text: o.title || NW.appName }), h('span', { class: 'spacer' }),
        h('span', { class: 'dlg-x', title: 'Close', html: NW.icon('close'), onclick: () => api.close(null) }));
      const body = h('div', { class: 'dlg-body' });
      if (typeof o.body === 'string') body.innerHTML = o.body; else append(body, o.body);
      const footer = h('div', { class: 'dlg-footer' });
      if (o.left) footer.appendChild(h('div', { class: 'left' }, o.left));
      const btnEls = [];
      (o.buttons || [{ label: 'OK', primary: true }]).forEach(b => {
        const btn = h('button', { class: 'btn' + (b.primary ? ' primary' : '') + (b.danger ? ' danger' : ''), text: b.label, type: 'button' });
        btn.addEventListener('click', async () => {
          if (!b.onClick) { api.close(b.value !== undefined ? b.value : b.label); return; }
          try {
            api.setBusy(true);
            const r = await b.onClick(api);
            if (r !== false && !b.keep) api.close(r === undefined ? true : r);
          } catch (e) { NW.Dialog.error(e.message); }
          finally { api.setBusy(false); }
        });
        btnEls.push(btn); footer.appendChild(btn);
      });
      dlg.appendChild(title); dlg.appendChild(body); if (o.buttons !== null) dlg.appendChild(footer);
      bd.appendChild(dlg);
      let resolved = false;
      const api = {
        el: dlg, body, buttons: btnEls, backdrop: bd,
        close(result) {
          if (resolved) return; resolved = true;
          bd.remove(); dialogStack.splice(dialogStack.indexOf(api), 1);
          document.removeEventListener('keydown', onKey, true);
          if (o.onClose) o.onClose(result);
          if (api._resolve) api._resolve(result);
          const prev = dialogStack[dialogStack.length - 1];
          if (prev) prev.focus(); else if (api._prevFocus && api._prevFocus.focus) try { api._prevFocus.focus(); } catch (e) { }
        },
        setBusy(b) { btnEls.forEach(x => x.disabled = b); },
        focus() { const f = dlg.querySelector('[autofocus], input:not([type=hidden]):not([disabled]), select, textarea, button.primary, button'); if (f) f.focus(); },
        setTitle(t) { title.children[o.icon ? 1 : 0].textContent = t; },
      };
      api.promise = new Promise(r => { api._resolve = r; });
      api._prevFocus = document.activeElement;
      const onKey = (e) => {
        if (dialogStack[dialogStack.length - 1] !== api) return;
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); api.close(null); }
        else if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !(e.target && (e.target.tagName === 'TEXTAREA' || e.target.classList.contains('CodeMirror-line') || e.target.closest('.CodeMirror'))) && !(e.target && e.target.tagName === 'BUTTON') && !(e.target && e.target.tagName === 'SELECT')) {
          const p = btnEls.find(b => b.classList.contains('primary'));
          if (p && !p.disabled && !o.noEnter) { e.preventDefault(); p.click(); }
        }
      };
      document.addEventListener('keydown', onKey, true);
      bd.addEventListener('mousedown', e => { if (e.target === bd && o.closeOnBackdrop) api.close(null); });
      document.body.appendChild(bd);
      dialogStack.push(api);
      setTimeout(() => api.focus(), 0);
      if (o.onOpen) o.onOpen(api);
      return api;
    },
    msg(icon, text, title, buttons) {
      const body = h('div', { class: 'msg-box' }, h('span', { class: 'msg-ico', html: NW.icon(icon) }), h('div', { class: 'msg-text', text: text }));
      return NW.Dialog.open({ title: title || NW.appName, body, buttons, width: 440 }).promise;
    },
    alert(text, title) { return NW.Dialog.msg('info', text, title, [{ label: 'OK', primary: true, value: true }]); },
    error(text, title) { return NW.Dialog.msg('error', text, title || 'Error', [{ label: 'OK', primary: true, value: true }]); },
    warn(text, title) { return NW.Dialog.msg('warning', text, title || 'Warning', [{ label: 'OK', primary: true, value: true }]); },
    async confirm(text, o) {
      o = o || {};
      const r = await NW.Dialog.msg(o.icon || 'question', text, o.title || 'Confirm', [
        { label: o.ok || 'OK', primary: !o.danger, danger: !!o.danger, value: true },
        { label: o.cancel || 'Cancel', value: false },
      ]);
      return r === true;
    },
    prompt(o) {
      o = o || {};
      const inp = h(o.multiline ? 'textarea' : 'input', { class: o.multiline ? 'ta' : 'inp', value: o.value || '', placeholder: o.placeholder || '', autofocus: true, rows: o.multiline ? 6 : null, spellcheck: false });
      const err = h('div', { class: 'err-text small', style: 'min-height:14px;margin-top:4px' });
      const body = h('div', null, o.label ? h('div', { style: 'margin-bottom:6px' }, o.label) : null, inp, err);
      const dlg = NW.Dialog.open({
        title: o.title || NW.appName, body, width: o.width || 420,
        buttons: [{ label: o.ok || 'OK', primary: true, onClick: () => { const v = inp.value; if (o.validate) { const m = o.validate(v); if (m) { err.textContent = m; return false; } } return v; } }, { label: 'Cancel', value: null }],
      });
      setTimeout(() => { inp.focus(); if (!o.multiline) inp.select(); }, 0);
      return dlg.promise.then(v => (typeof v === 'string' ? v : null));
    },
    top() { return dialogStack[dialogStack.length - 1] || null; },
  };

  /* ------------------------------------------------------------ context menus */
  let menuEls = [];
  function hideMenus() { menuEls.forEach(m => m.remove()); menuEls = []; document.removeEventListener('mousedown', onDocDown, true); document.removeEventListener('keydown', onMenuKey, true); window.removeEventListener('blur', hideMenus); }
  function onDocDown(e) { if (!menuEls.some(m => m.contains(e.target))) hideMenus(); }
  function onMenuKey(e) { if (e.key === 'Escape') { hideMenus(); e.preventDefault(); } }
  function buildMenu(items, x, y, level) {
    const m = h('div', { class: 'menu' });
    items.forEach(it => {
      if (it === '-' || it === null) { m.appendChild(h('div', { class: 'menu-sep' })); return; }
      if (!it || it.hidden) return;
      const row = h('div', { class: 'menu-item' + (it.disabled ? ' disabled' : '') });
      if (it.checked) row.appendChild(h('span', { class: 'mi-check', html: NW.icon('check') }));
      else if (it.icon) row.appendChild(h('span', { class: 'mi-ico', html: NW.icon(it.icon) }));
      row.appendChild(h('span', { text: it.label }));
      if (it.shortcut) row.appendChild(h('span', { class: 'mi-key', text: it.shortcut }));
      if (it.children) row.appendChild(h('span', { class: 'mi-sub', text: '▶' }));
      let subTimer;
      row.addEventListener('mouseenter', () => {
        menuEls.filter(mm => mm._level > level).forEach(mm => { mm.remove(); });
        menuEls = menuEls.filter(mm => mm._level <= level);
        if (it.children && !it.disabled) {
          subTimer = setTimeout(() => { const r = row.getBoundingClientRect(); buildMenu(it.children, r.right - 2, r.top - 4, level + 1); }, 120);
        }
      });
      row.addEventListener('mouseleave', () => clearTimeout(subTimer));
      row.addEventListener('click', e => {
        e.stopPropagation();
        if (it.disabled || it.children) return;
        hideMenus();
        if (it.onClick) { try { const r = it.onClick(); if (r && r.catch) r.catch(err => NW.Dialog.error(err.message)); } catch (err) { NW.Dialog.error(err.message); } }
      });
      m.appendChild(row);
    });
    m._level = level;
    m.style.left = '0px'; m.style.top = '0px'; m.style.visibility = 'hidden';
    document.body.appendChild(m);
    const w = m.offsetWidth, hh = m.offsetHeight;
    let left = x, top = y;
    if (left + w > window.innerWidth - 4) left = Math.max(4, (level ? x - w - 180 : window.innerWidth - w - 4));
    if (top + hh > window.innerHeight - 4) top = Math.max(4, window.innerHeight - hh - 4);
    m.style.left = left + 'px'; m.style.top = top + 'px'; m.style.visibility = '';
    menuEls.push(m);
    return m;
  }
  NW.Menu = {
    show(items, x, y) {
      hideMenus();
      if (x && typeof x === 'object' && x.getBoundingClientRect) { const r = x.getBoundingClientRect(); y = r.bottom + 2; x = r.left; }
      buildMenu(items, x, y, 0);
      setTimeout(() => { document.addEventListener('mousedown', onDocDown, true); document.addEventListener('keydown', onMenuKey, true); window.addEventListener('blur', hideMenus); }, 0);
    },
    hide: hideMenus,
  };

  /* ------------------------------------------------------------ tabs */
  const tabs = [];
  let activeTab = null;
  function renderTabs() {
    const bar = NW.$('#tabbar'); if (!bar) return;
    bar.innerHTML = '';
    tabs.forEach(t => {
      const el = h('div', { class: 'tab' + (t === activeTab ? ' active' : '') + (t.dirty ? ' dirty' : ''), title: t.tooltip || t.title },
        t.icon ? h('span', { class: 'ico', html: NW.icon(t.icon) }) : null,
        h('span', { class: 't-title', text: t.title }),
        t.closable !== false ? h('span', { class: 't-close', html: '×', title: 'Close', onclick: e => { e.stopPropagation(); NW.Tabs.close(t.id); } }) : null);
      el.addEventListener('mousedown', e => { if (e.button === 1) { e.preventDefault(); if (t.closable !== false) NW.Tabs.close(t.id); } else if (e.button === 0) NW.Tabs.activate(t.id); });
      el.addEventListener('contextmenu', e => {
        e.preventDefault();
        NW.Menu.show([
          { label: 'Close', disabled: t.closable === false, onClick: () => NW.Tabs.close(t.id) },
          { label: 'Close Others', onClick: () => NW.Tabs.closeOthers(t.id) },
          { label: 'Close All', onClick: () => NW.Tabs.closeAll() },
          { label: 'Close Tabs to the Right', onClick: () => NW.Tabs.closeRight(t.id) },
          '-',
          { label: 'Refresh', shortcut: 'F5', disabled: !(t.ctl && t.ctl.refresh), onClick: () => t.ctl.refresh() },
        ], e.clientX, e.clientY);
      });
      t.el = el;
      bar.appendChild(el);
    });
    if (activeTab && activeTab.el) activeTab.el.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  }
  NW.Tabs = {
    list: tabs,
    open(spec) {
      let t = tabs.find(x => x.id === spec.id);
      if (t) { NW.Tabs.activate(t.id); if (spec.onReopen && t.ctl) spec.onReopen(t.ctl); return t; }
      t = { id: spec.id, title: spec.title, icon: spec.icon, closable: spec.closable, kind: spec.kind, tooltip: spec.tooltip, dirty: false, ctx: spec.ctx || null };
      t.content = h('div', { class: 'tab-content hidden' });
      NW.$('#tab-contents').appendChild(t.content);
      tabs.push(t);
      try { t.ctl = spec.create(t.content, t) || {}; } catch (e) { console.error(e); t.ctl = {}; t.content.appendChild(h('div', { class: 'obj-empty err-text', text: 'Failed to open: ' + e.message })); }
      NW.Tabs.activate(t.id);
      return t;
    },
    get(id) { return tabs.find(x => x.id === id) || null; },
    active() { return activeTab; },
    activate(id) {
      const t = tabs.find(x => x.id === id); if (!t) return;
      if (activeTab && activeTab !== t) { activeTab.content.classList.add('hidden'); if (activeTab.ctl && activeTab.ctl.onDeactivate) activeTab.ctl.onDeactivate(); }
      activeTab = t; t.content.classList.remove('hidden');
      renderTabs();
      if (t.ctl && t.ctl.onActivate) t.ctl.onActivate();
      NW.bus.emit('tab-activated', t);
    },
    async close(id, force) {
      const t = tabs.find(x => x.id === id); if (!t) return true;
      if (!force && t.ctl && t.ctl.onClose) { const ok = await t.ctl.onClose(); if (ok === false) return false; }
      const idx = tabs.indexOf(t);
      tabs.splice(idx, 1);
      if (t.ctl && t.ctl.onDestroy) try { t.ctl.onDestroy(); } catch (e) { }
      t.content.remove();
      if (activeTab === t) { activeTab = null; const next = tabs[Math.min(idx, tabs.length - 1)]; if (next) NW.Tabs.activate(next.id); else renderTabs(); }
      else renderTabs();
      return true;
    },
    async closeOthers(id) { for (const t of tabs.slice()) if (t.id !== id && t.closable !== false) await NW.Tabs.close(t.id); },
    async closeAll() { for (const t of tabs.slice()) if (t.closable !== false) await NW.Tabs.close(t.id); },
    async closeRight(id) { const i = tabs.findIndex(t => t.id === id); for (const t of tabs.slice(i + 1)) if (t.closable !== false) await NW.Tabs.close(t.id); },
    setTitle(id, title, tooltip) { const t = NW.Tabs.get(id); if (t) { t.title = title; if (tooltip) t.tooltip = tooltip; renderTabs(); } },
    setDirty(id, d) { const t = NW.Tabs.get(id); if (t && t.dirty !== !!d) { t.dirty = !!d; renderTabs(); } },
    render: renderTabs,
    anyDirty() { return tabs.some(t => t.dirty); },
  };

  /* ------------------------------------------------------------ small widgets */
  /** Tab strip inside a panel: tabs = [{id,label}], returns {el, panels:{id:el}, show(id)} */
  NW.subTabs = function (defs, opts) {
    opts = opts || {};
    const strip = h('div', { class: opts.cls || 'dz-tabs' });
    const panels = {};
    const wrap = h('div', { class: 'dz', style: 'min-height:0' });
    wrap.appendChild(strip);
    let current = null;
    const api = {
      el: wrap, strip, panels,
      show(id) {
        current = id;
        NW.$$('.' + (opts.tabCls || 'dz-tab'), strip).forEach(t => t.classList.toggle('active', t.dataset.id === id));
        for (const k in panels) panels[k].classList.toggle('active', k === id);
        if (opts.onShow) opts.onShow(id);
      },
      current() { return current; },
    };
    defs.forEach(d => {
      strip.appendChild(h('div', { class: (opts.tabCls || 'dz-tab'), dataset: { id: d.id }, text: d.label, onclick: () => api.show(d.id) }));
      const p = h('div', { class: (opts.panelCls || 'dz-panel') });
      panels[d.id] = p; wrap.appendChild(p);
    });
    api.show(defs[0].id);
    return api;
  };

  /** Vertical/horizontal drag splitter between two flex siblings */
  NW.makeSplitter = function (splitterEl, firstEl, dir, onEnd) {
    let startPos = 0, startSize = 0;
    const vertical = dir === 'col';
    splitterEl.addEventListener('mousedown', e => {
      e.preventDefault();
      startPos = vertical ? e.clientX : e.clientY;
      startSize = vertical ? firstEl.getBoundingClientRect().width : firstEl.getBoundingClientRect().height;
      splitterEl.classList.add('active');
      document.body.style.cursor = vertical ? 'col-resize' : 'row-resize';
      document.body.style.userSelect = 'none';
      const move = ev => { const d = (vertical ? ev.clientX : ev.clientY) - startPos; const size = Math.max(60, startSize + d); if (vertical) firstEl.style.width = size + 'px'; else { firstEl.style.height = size + 'px'; firstEl.style.flex = 'none'; } };
      const up = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); splitterEl.classList.remove('active'); document.body.style.cursor = ''; document.body.style.userSelect = ''; if (onEnd) onEnd(vertical ? firstEl.offsetWidth : firstEl.offsetHeight); };
      document.addEventListener('mousemove', move); document.addEventListener('mouseup', up);
    });
  };

  /** Simple CodeMirror factory */
  NW.editor = function (el, opts) {
    opts = opts || {};
    const cm = CodeMirror(el, {
      value: opts.value || '', mode: 'text/x-mysql', lineNumbers: opts.lineNumbers !== false, matchBrackets: true, autoCloseBrackets: !opts.readOnly,
      styleActiveLine: !opts.readOnly, readOnly: opts.readOnly ? true : false, indentWithTabs: false, indentUnit: 2, tabSize: 2, lineWrapping: !!opts.wrap,
      placeholder: opts.placeholder || '', extraKeys: Object.assign({ 'Ctrl-/': 'toggleComment', 'Ctrl-Space': 'autocomplete', 'Ctrl-F': 'findPersistent' }, opts.extraKeys || {}),
      hintOptions: opts.hintOptions || undefined,
    });
    if (opts.readOnly) el.classList.add('cm-readonly');
    return cm;
  };

  NW.formRow = function (label, control, hint) {
    return [h('label', { class: 'l', text: label }), h('div', null, control, hint ? h('div', { class: 'muted small', text: hint }) : null)];
  };
  NW.select = function (options, value, attrs) {
    const s = h('select', Object.assign({ class: 'sel' }, attrs || {}));
    options.forEach(o => { const opt = typeof o === 'string' ? { value: o, label: o } : o; s.appendChild(h('option', { value: opt.value, text: opt.label !== undefined ? opt.label : opt.value, selected: String(opt.value) === String(value) })); });
    return s;
  };
  NW.contextOf = function () {
    const t = NW.Tabs.active();
    if (t && t.ctx && t.ctx.conn) return t.ctx;
    const n = NW.Tree && NW.Tree.getSelected();
    if (n && n.conn) return { conn: n.conn, db: n.db || null };
    const open = NW.state.connections.find(c => NW.connState(c.id).open);
    return open ? { conn: open.id, db: null } : { conn: null, db: null };
  };
})();

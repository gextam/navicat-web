/* Navicat Web - DataGrid: a spreadsheet-like grid with row numbers, selection, sorting hooks and in-place editing */
(function () {
  'use strict';
  const NW = window.NW, h = NW.h;

  class DataGrid {
    constructor(container, opts) {
      this.opts = Object.assign({ rowNumbers: true, editable: false, clientSort: false }, opts || {});
      this.container = container;
      this.el = h('div', { class: 'grid', tabindex: '0' });
      container.appendChild(this.el);
      this.cols = []; this.rows = []; this.widths = [];
      this.focus = null; this.selRows = new Set(); this.anchor = null;
      this.sort = []; this.editing = null;
      this._bind();
    }

    /* ---------------------------------------------------------- data */
    setData(cols, rows, keepWidths) {
      const oldWidths = {};
      if (keepWidths) this.cols.forEach((c, i) => oldWidths[c.name] = this.widths[i]);
      this.cols = cols || []; this.rows = rows || [];
      this.widths = this.cols.map(c => oldWidths[c.name] || c.width || this._defaultWidth(c));
      this.focus = null; this.selRows.clear(); this.anchor = null; this.editing = null;
      this.render();
    }
    _defaultWidth(c) {
      const t = (c.type || '').toLowerCase();
      let w = 120;
      if (/int|decimal|float|double|year|bit/.test(t)) w = 90;
      else if (/date|time/.test(t)) w = 150;
      else if (/text|blob|json/.test(t)) w = 220;
      else if (/char/.test(t)) w = Math.min(260, Math.max(90, (c.len || 60) * 2));
      w = Math.max(w, Math.min(300, c.name.length * 8 + 36));
      return w;
    }

    /* ---------------------------------------------------------- rendering */
    render() {
      const o = this.opts;
      if (!this.cols.length) { this.el.innerHTML = '<div class="grid-empty">' + NW.esc(o.emptyText || 'No data') + '</div>'; return; }
      let html = '<table><colgroup>';
      if (o.rowNumbers) html += '<col style="width:44px">';
      this.widths.forEach(w => html += '<col style="width:' + w + 'px">');
      html += '</colgroup><thead><tr>';
      if (o.rowNumbers) html += '<th class="rownum"></th>';
      this.cols.forEach((c, i) => {
        const s = this.sort.find(x => x.col === c.name);
        html += '<th class="' + (o.clientSort || o.onHeaderClick ? 'sortable' : '') + (c.pk ? ' pk' : '') + '" data-c="' + i + '" title="' + NW.esc(c.name + (c.type ? ' : ' + c.type + (c.len && /char|binary|bit/.test(c.type) ? '(' + c.len + ')' : '') : '') + (c.pk ? ' (primary key)' : '')) + '">'
          + '<div class="th-inner">' + (c.pk ? NW.icon('key') : '') + '<span class="th-name">' + NW.esc(c.name) + '</span>'
          + (s ? '<span class="th-sort">' + (s.dir === 'DESC' ? '▼' : '▲') + (this.sort.length > 1 ? (this.sort.indexOf(s) + 1) : '') + '</span>' : '')
          + '</div><div class="col-resizer" data-c="' + i + '"></div></th>';
      });
      html += '</tr></thead><tbody>';
      const parts = [];
      for (let r = 0; r < this.rows.length; r++) parts.push(this._rowHtml(r));
      html += parts.join('') + '</tbody></table>';
      if (!this.rows.length) html += '<div class="grid-empty">' + NW.esc(o.emptyText || '(no rows)') + '</div>';
      this.el.innerHTML = html;
      this.tbody = this.el.querySelector('tbody');
    }
    _rowHtml(r) {
      const o = this.opts, row = this.rows[r];
      const rc = (o.rowClass ? o.rowClass(r) : '') + (this.selRows.has(r) ? ' selected' : '');
      let s = '<tr data-r="' + r + '" class="' + rc.trim() + '">';
      if (o.rowNumbers) s += '<td class="rownum">' + (r + 1) + '</td>';
      for (let c = 0; c < this.cols.length; c++) s += this._cellHtml(r, c, row[c]);
      return s + '</tr>';
    }
    _cellHtml(r, c, v) {
      const ct = NW.cellText(v, this.cols[c]);
      let cls = ct.cls;
      if (this.opts.cellClass) cls += ' ' + (this.opts.cellClass(r, c) || '');
      if (this.focus && this.focus.r === r && this.focus.c === c) cls += ' focus';
      return '<td data-c="' + c + '" class="' + cls.trim() + '">' + NW.esc(ct.text) + '</td>';
    }
    renderRow(r) {
      const tr = this._tr(r); if (!tr) return;
      const tmp = document.createElement('tbody'); tmp.innerHTML = this._rowHtml(r);
      tr.replaceWith(tmp.firstElementChild);
    }
    renderCell(r, c) {
      const td = this._td(r, c); if (!td) return;
      const tmp = document.createElement('tr'); tmp.innerHTML = this._cellHtml(r, c, this.rows[r][c]);
      td.replaceWith(tmp.firstElementChild);
    }
    refreshClasses(r) { this.renderRow(r); }
    _tr(r) { return this.tbody ? this.tbody.querySelector('tr[data-r="' + r + '"]') : null; }
    _td(r, c) { const tr = this._tr(r); return tr ? tr.querySelector('td[data-c="' + c + '"]') : null; }
    setSortIndicator(sort) { this.sort = sort || []; this.render(); }

    /* ---------------------------------------------------------- rows */
    insertRow(values, at) {
      if (at === undefined || at > this.rows.length) at = this.rows.length;
      this.rows.splice(at, 0, values);
      this._renumber(at);
    }
    removeRow(r) { this.rows.splice(r, 1); this.selRows.delete(r); if (this.focus && this.focus.r >= this.rows.length) this.focus = this.rows.length ? { r: this.rows.length - 1, c: this.focus.c } : null; this._renumber(r); }
    _renumber() { const sel = new Set(); this.selRows.forEach(r => { if (r < this.rows.length) sel.add(r); }); this.selRows = sel; this.render(); }
    updateCell(r, c, v) { this.rows[r][c] = v; this.renderCell(r, c); }
    getCellValue(r, c) { return this.rows[r] ? this.rows[r][c] : undefined; }

    /* ---------------------------------------------------------- focus and selection */
    getFocus() { return this.focus; }
    setFocus(r, c, opts) {
      opts = opts || {};
      if (r < 0 || r >= this.rows.length || c < 0 || c >= this.cols.length) return;
      const prev = this.focus;
      if (prev) { const td = this._td(prev.r, prev.c); if (td) td.classList.remove('focus'); }
      this.focus = { r, c };
      const td = this._td(r, c);
      if (td) { td.classList.add('focus'); if (opts.scroll !== false) this._scrollIntoView(td); }
      if (!opts.keepSelection) this.selectRow(r, { add: opts.add, range: opts.range });
      if (this.opts.onFocusChange) this.opts.onFocusChange(this.focus, prev);
    }
    _scrollIntoView(td) {
      const er = this.el.getBoundingClientRect(), tr = td.getBoundingClientRect();
      const headH = this.el.querySelector('thead') ? this.el.querySelector('thead').offsetHeight : 24;
      const rowNumW = this.opts.rowNumbers ? 44 : 0;
      if (tr.top < er.top + headH) this.el.scrollTop -= (er.top + headH - tr.top);
      else if (tr.bottom > er.bottom) this.el.scrollTop += (tr.bottom - er.bottom);
      if (tr.left < er.left + rowNumW) this.el.scrollLeft -= (er.left + rowNumW - tr.left);
      else if (tr.right > er.right) this.el.scrollLeft += (tr.right - er.right);
    }
    selectRow(r, o) {
      o = o || {};
      const before = Array.from(this.selRows);
      if (o.range && this.anchor !== null) {
        this.selRows.clear();
        const a = Math.min(this.anchor, r), b = Math.max(this.anchor, r);
        for (let i = a; i <= b; i++) this.selRows.add(i);
      } else if (o.add) {
        if (this.selRows.has(r)) this.selRows.delete(r); else this.selRows.add(r);
        this.anchor = r;
      } else { this.selRows.clear(); this.selRows.add(r); this.anchor = r; }
      const after = Array.from(this.selRows);
      const touched = new Set(before.concat(after));
      touched.forEach(i => { const tr = this._tr(i); if (tr) tr.classList.toggle('selected', this.selRows.has(i)); });
      if (this.opts.onSelectionChange) this.opts.onSelectionChange(this.getSelectedRows());
    }
    selectAll() { this.selRows.clear(); for (let i = 0; i < this.rows.length; i++) this.selRows.add(i); this.el.querySelectorAll('tbody tr').forEach(tr => tr.classList.add('selected')); if (this.opts.onSelectionChange) this.opts.onSelectionChange(this.getSelectedRows()); }
    clearSelection() { const s = Array.from(this.selRows); this.selRows.clear(); s.forEach(i => { const tr = this._tr(i); if (tr) tr.classList.remove('selected'); }); }
    getSelectedRows() { return Array.from(this.selRows).sort((a, b) => a - b); }

    /* ---------------------------------------------------------- editing */
    isEditing() { return !!this.editing; }
    canEdit(r, c) { if (!this.opts.editable) return false; if (this.opts.canEdit && !this.opts.canEdit(r, c)) return false; return true; }
    beginEdit(r, c, initial) {
      if (this.editing) return;
      if (!this.canEdit(r, c)) return;
      const td = this._td(r, c); if (!td) return;
      this.setFocus(r, c, { keepSelection: true });
      const col = this.cols[c], cur = this.rows[r][c];
      if (cur && typeof cur === 'object' && cur.big) { NW.Toast.warn('This value is too large to edit in the grid.'); return; }
      const kind = this.opts.getEditorKind ? this.opts.getEditorKind(c) : 'text';
      let ed;
      if (kind === 'select') {
        ed = h('select', { class: 'cell-editor' });
        const options = this.opts.getSelectOptions(c) || [];
        if (!col.notNull) ed.appendChild(h('option', { value: '\u0000NULL', text: '(NULL)' }));
        options.forEach(v => ed.appendChild(h('option', { value: v, text: v })));
        const curText = cur === null ? '\u0000NULL' : (typeof cur === 'object' ? '' : String(cur));
        if (cur !== null && !options.includes(curText)) ed.appendChild(h('option', { value: curText, text: curText }));
        ed.value = curText;
      } else {
        const text = cur === null ? '' : (typeof cur === 'object' ? (cur.b !== undefined ? '0x' + NW.bytesToHex(NW.b64ToBytes(cur.b)) : '') : String(cur));
        const multi = /\n/.test(text) || /text|json|blob/.test((col.type || '').toLowerCase());
        ed = h(multi ? 'textarea' : 'input', { class: 'cell-editor', type: multi ? null : 'text', spellcheck: false });
        ed.value = initial !== undefined ? initial : text;
        if (multi) { ed.style.height = Math.min(180, Math.max(22, 18 * (text.split('\n').length + 1))) + 'px'; ed.style.position = 'relative'; ed.style.zIndex = '5'; }
      }
      td.classList.add('editing'); td.textContent = ''; td.appendChild(ed);
      this.editing = { r, c, ed, orig: cur, wasNull: cur === null };
      ed.focus();
      if (ed.tagName === 'INPUT' && initial === undefined) ed.select();
      else if (ed.setSelectionRange && initial !== undefined) ed.setSelectionRange(ed.value.length, ed.value.length);
      ed.addEventListener('keydown', e => this._editorKey(e));
      ed.addEventListener('blur', () => { if (this.editing && this.editing.ed === ed && !this._skipBlur) this.commitEdit(); });
      if (ed.tagName === 'SELECT') ed.addEventListener('change', () => this.commitEdit());
    }
    _editorKey(e) {
      if (!this.editing) return;
      const ed = this.editing.ed;
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.cancelEdit(); return; }
      if (e.key === 'Enter' && (ed.tagName !== 'TEXTAREA' || e.ctrlKey)) { e.preventDefault(); e.stopPropagation(); const { r, c } = this.editing; this.commitEdit().then(ok => { if (ok) { this.setFocus(r, c, { keepSelection: true }); this.el.focus(); } }); return; }
      if (e.key === 'Tab') { e.preventDefault(); e.stopPropagation(); const { r, c } = this.editing; const nc = e.shiftKey ? c - 1 : c + 1; this.commitEdit().then(ok => { if (ok) { this.el.focus(); if (nc >= 0 && nc < this.cols.length) this.setFocus(r, nc, { keepSelection: true }); } }); return; }
      if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && ed.tagName === 'INPUT') { e.preventDefault(); const { r, c } = this.editing; const nr = e.key === 'ArrowUp' ? r - 1 : r + 1; this.commitEdit().then(ok => { if (ok) { this.el.focus(); if (nr >= 0 && nr < this.rows.length) this.setFocus(nr, c); } }); return; }
      e.stopPropagation();
    }
    async commitEdit() {
      const ed = this.editing; if (!ed) return true;
      let val;
      if (ed.ed.tagName === 'SELECT') val = ed.ed.value === '\u0000NULL' ? null : ed.ed.value;
      else {
        val = ed.ed.value;
        if (ed.wasNull && val === '') val = null; /* untouched NULL stays NULL */
        if (ed.orig && typeof ed.orig === 'object' && ed.orig.b !== undefined) {
          if (/^0x[0-9a-f]*$/i.test(val)) { const hex = val.slice(2); const bytes = new Uint8Array(hex.length / 2); for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16); val = { b: NW.bytesToB64(bytes), n: bytes.length }; }
        }
      }
      const same = JSON.stringify(val) === JSON.stringify(ed.orig);
      this.editing = null;
      const td = this._td(ed.r, ed.c); if (td) td.classList.remove('editing');
      if (same) { this.renderCell(ed.r, ed.c); return true; }
      let ok = true;
      if (this.opts.onEditCommit) { try { const res = await this.opts.onEditCommit(ed.r, ed.c, val, ed.orig); ok = res !== false; } catch (e) { NW.Dialog.error(e.message); ok = false; } }
      if (ok) this.rows[ed.r][ed.c] = val;
      this.renderRow(ed.r);
      return ok;
    }
    cancelEdit() {
      const ed = this.editing; if (!ed) return;
      this.editing = null;
      const td = this._td(ed.r, ed.c); if (td) td.classList.remove('editing');
      this.renderCell(ed.r, ed.c);
      this.el.focus();
    }

    /* ---------------------------------------------------------- clipboard */
    copySelection(format) {
      const rows = this.getSelectedRows();
      const idx = rows.length ? rows : (this.focus ? [this.focus.r] : []);
      if (!idx.length) return '';
      const single = idx.length === 1 && this.focus && rows.length <= 1 && format !== 'rows';
      if (single && !format) { const v = this.rows[this.focus.r][this.focus.c]; return v === null ? '' : (typeof v === 'object' ? NW.cellText(v).text : String(v)); }
      const names = this.cols.map(c => c.name);
      const val = v => v === null ? 'NULL' : (typeof v === 'object' ? NW.cellText(v).text : String(v));
      if (format === 'csv') { const q = s => /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; return [names.map(q).join(',')].concat(idx.map(r => this.rows[r].map(v => v === null ? '' : q(val(v))).join(','))).join('\r\n'); }
      if (format === 'json') return JSON.stringify(idx.map(r => { const o = {}; this.cols.forEach((c, i) => { const v = this.rows[r][i]; o[c.name] = (v && typeof v === 'object') ? NW.cellText(v).text : v; }); return o; }), null, 2);
      if (format === 'sql') { const table = this.opts.tableName || 'table'; return idx.map(r => 'INSERT INTO ' + NW.qi(table) + ' (' + names.map(NW.qi).join(', ') + ') VALUES (' + this.rows[r].map((v, i) => v === null ? 'NULL' : (this.cols[i].num && /^-?\d+(\.\d+)?$/.test(String(v)) ? String(v) : NW.qs(val(v)))).join(', ') + ');').join('\n'); }
      const body = idx.map(r => this.rows[r].map(val).join('\t'));
      return (format === 'tsvh' ? [names.join('\t')].concat(body) : body).join('\n');
    }

    /* ---------------------------------------------------------- events */
    _bind() {
      const el = this.el;
      el.addEventListener('mousedown', e => {
        const td = e.target.closest('td'); if (!td) {
          const th = e.target.closest('th');
          if (th && e.target.classList.contains('col-resizer')) this._startResize(e, +e.target.dataset.c);
          return;
        }
        if (this.editing && td.classList.contains('editing')) return;
        const tr = td.parentElement, r = +tr.dataset.r;
        if (e.button === 2 && this.selRows.has(r)) { if (td.classList.contains('rownum')) return; const c = +td.dataset.c; this.setFocus(r, c, { keepSelection: true }); return; }
        if (td.classList.contains('rownum')) { if (this.editing) this.commitEdit(); this.selectRow(r, { add: e.ctrlKey || e.metaKey, range: e.shiftKey }); const c = this.focus ? this.focus.c : 0; this.setFocus(r, c, { keepSelection: true }); return; }
        const c = +td.dataset.c;
        if (this.editing) { if (this.editing.r === r && this.editing.c === c) return; this._skipBlur = true; this.commitEdit().then(() => { this._skipBlur = false; }); }
        this.setFocus(r, c, { add: e.ctrlKey || e.metaKey, range: e.shiftKey });
        if (e.detail === 1 && !e.shiftKey && !e.ctrlKey) this._clickTimer = Date.now();
      });
      el.addEventListener('dblclick', e => {
        const td = e.target.closest('td'); if (!td || td.classList.contains('rownum')) return;
        const r = +td.parentElement.dataset.r, c = +td.dataset.c;
        if (this.opts.onCellDblClick && this.opts.onCellDblClick(r, c, e) === true) return;
        if (this.canEdit(r, c)) this.beginEdit(r, c);
      });
      el.addEventListener('contextmenu', e => {
        const th = e.target.closest('th');
        if (th && th.dataset.c !== undefined && this.opts.onHeaderContext) { e.preventDefault(); this.opts.onHeaderContext(+th.dataset.c, e); return; }
        const td = e.target.closest('td'); if (!td) return;
        e.preventDefault();
        const r = +td.parentElement.dataset.r, c = td.classList.contains('rownum') ? (this.focus ? this.focus.c : 0) : +td.dataset.c;
        if (!this.selRows.has(r)) this.setFocus(r, c); else if (!td.classList.contains('rownum')) this.setFocus(r, c, { keepSelection: true });
        if (this.opts.onCellContext) this.opts.onCellContext(r, c, e);
      });
      el.addEventListener('click', e => {
        const th = e.target.closest('th');
        if (!th || th.dataset.c === undefined || e.target.classList.contains('col-resizer') || this._resized) { this._resized = false; return; }
        const c = +th.dataset.c;
        if (this.opts.onHeaderClick) this.opts.onHeaderClick(c, e);
        else if (this.opts.clientSort) this.clientSortBy(c, e.shiftKey);
      });
      el.addEventListener('keydown', e => this._key(e));
      el.addEventListener('paste', e => {
        if (this.editing || !this.focus || !this.opts.editable) return;
        const text = (e.clipboardData || window.clipboardData).getData('text');
        if (text === undefined) return;
        e.preventDefault();
        const { r, c } = this.focus;
        if (this.canEdit(r, c)) { this.beginEdit(r, c, text.replace(/\r?\n$/, '')); this.commitEdit().then(ok => { if (ok) { this.setFocus(r, c, { keepSelection: true }); this.el.focus(); } }); }
      });
    }
    _key(e) {
      if (this.editing) return;
      if (this.opts.onKey && this.opts.onKey(e) === true) return;
      const f = this.focus;
      const nav = (dr, dc) => { if (!f) { if (this.rows.length) this.setFocus(0, 0); return; } const r = Math.max(0, Math.min(this.rows.length - 1, f.r + dr)), c = Math.max(0, Math.min(this.cols.length - 1, f.c + dc)); this.setFocus(r, c, { range: e.shiftKey }); };
      const pageRows = Math.max(1, Math.floor((this.el.clientHeight - 24) / 22) - 1);
      switch (e.key) {
        case 'ArrowUp': e.preventDefault(); nav(-1, 0); break;
        case 'ArrowDown': e.preventDefault(); nav(1, 0); break;
        case 'ArrowLeft': e.preventDefault(); nav(0, -1); break;
        case 'ArrowRight': e.preventDefault(); nav(0, 1); break;
        case 'PageUp': e.preventDefault(); nav(-pageRows, 0); break;
        case 'PageDown': e.preventDefault(); nav(pageRows, 0); break;
        case 'Home': e.preventDefault(); if (e.ctrlKey) { if (this.rows.length) this.setFocus(0, 0); } else if (f) this.setFocus(f.r, 0); break;
        case 'End': e.preventDefault(); if (e.ctrlKey) { if (this.rows.length) this.setFocus(this.rows.length - 1, this.cols.length - 1); } else if (f) this.setFocus(f.r, this.cols.length - 1); break;
        case 'Tab': if (f) { e.preventDefault(); nav(0, e.shiftKey ? -1 : 1); } break;
        case 'Enter': case 'F2': if (f && this.canEdit(f.r, f.c)) { e.preventDefault(); this.beginEdit(f.r, f.c); } else if (f && this.opts.onCellDblClick) { e.preventDefault(); this.opts.onCellDblClick(f.r, f.c, e); } break;
        case 'a': case 'A': if (e.ctrlKey || e.metaKey) { e.preventDefault(); this.selectAll(); } break;
        case 'c': case 'C': if (e.ctrlKey || e.metaKey) { e.preventDefault(); NW.copyText(this.copySelection(e.shiftKey ? 'tsvh' : undefined)); NW.Toast.info('Copied'); } break;
        default:
          if (f && this.canEdit(f.r, f.c) && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); this.beginEdit(f.r, f.c, e.key); }
      }
    }
    _startResize(e, c) {
      e.preventDefault(); e.stopPropagation();
      const startX = e.clientX, startW = this.widths[c];
      const col = this.el.querySelectorAll('colgroup col')[c + (this.opts.rowNumbers ? 1 : 0)];
      const move = ev => { const w = Math.max(30, startW + ev.clientX - startX); this.widths[c] = w; col.style.width = w + 'px'; this._resized = true; };
      const up = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); document.body.style.cursor = ''; document.body.style.userSelect = ''; if (this.opts.onColumnResize) this.opts.onColumnResize(c, this.widths[c]); setTimeout(() => this._resized = false, 50); };
      document.body.style.cursor = 'col-resize'; document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', move); document.addEventListener('mouseup', up);
    }
    clientSortBy(c, additive) {
      const name = this.cols[c].name;
      const ex = this.sort.find(s => s.col === name);
      if (!additive) { this.sort = ex ? (ex.dir === 'ASC' ? [{ col: name, dir: 'DESC' }] : []) : [{ col: name, dir: 'ASC' }]; }
      else if (ex) ex.dir = ex.dir === 'ASC' ? 'DESC' : 'ASC'; else this.sort.push({ col: name, dir: 'ASC' });
      if (!this._origOrder) this._origOrder = this.rows.slice();
      if (!this.sort.length) this.rows = this._origOrder.slice();
      else {
        const keys = this.sort.map(s => ({ i: this.cols.findIndex(x => x.name === s.col), d: s.dir === 'DESC' ? -1 : 1, num: this.cols.find(x => x.name === s.col).num }));
        this.rows = this.rows.slice().sort((a, b) => {
          for (const k of keys) {
            const x = a[k.i], y = b[k.i];
            if (x === y) continue;
            if (x === null) return 1; if (y === null) return -1;
            let r;
            if (k.num) r = Number(x) - Number(y); else r = String(typeof x === 'object' ? '' : x).localeCompare(String(typeof y === 'object' ? '' : y), undefined, { numeric: true });
            if (r) return r * k.d;
          }
          return 0;
        });
      }
      this.focus = null; this.selRows.clear();
      this.render();
    }
    focusContainer() { this.el.focus(); }
  }
  NW.DataGrid = DataGrid;
})();

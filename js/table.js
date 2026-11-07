/* Navicat Web - table/view data tab: browse, filter, sort, page and edit records; cell viewer; export wizard */
(function () {
  'use strict';
  const NW = window.NW, h = NW.h;

  const OPS = ['=', '<>', '>', '>=', '<', '<=', 'contains', 'not contains', 'begins with', 'ends with', 'like', 'not like', 'in', 'not in', 'between', 'not between', 'is null', 'is not null', 'is empty', 'is not empty', 'regexp'];
  const NOVAL = ['is null', 'is not null', 'is empty', 'is not empty'];

  NW.TableTab = {
    open(o) {
      const id = 'table:' + o.conn + '/' + o.db + '/' + o.table;
      return NW.Tabs.open({
        id, title: o.table + ' @' + o.db + ' (' + NW.connName(o.conn) + ')', icon: o.isView ? 'view' : 'table', ctx: { conn: o.conn, db: o.db },
        tooltip: (o.isView ? 'View ' : 'Table ') + o.db + '.' + o.table,
        create: (el, tab) => new TableView(el, tab, o),
      });
    },
  };

  class TableView {
    constructor(el, tab, o) {
      this.el = el; this.tab = tab; this.conn = o.conn; this.db = o.db; this.table = o.table; this.isView = !!o.isView;
      this.offset = 0; this.limit = NW.settings.get('limit', 1000); this.useLimit = true;
      this.sort = []; this.filters = []; this.where = ''; this.data = null; this.meta = []; this.loading = false;
      this._build();
      this.load();
    }

    /* ---------------------------------------------------------- UI */
    _build() {
      const el = this.el;
      this.bar = h('div', { class: 'subbar' });
      const btn = (label, icon, fn, title) => h('button', { class: 'sb-btn', title: title || label, onclick: fn }, NW.svg(icon), label);
      this.btnFilter = btn('Filter', 'filter', () => this.toggleFilter());
      this.btnSort = btn('Sort', 'sort', () => this.toggleSort());
      this.bar.append(
        this.btnFilter, this.btnSort, h('div', { class: 'sb-sep' }),
        btn('Refresh', 'refresh', () => this.load(), 'Refresh (F5)'),
        h('div', { class: 'sb-sep' }),
        this.isView ? btn('Design View', 'design', () => NW.Tools.viewDesigner({ conn: this.conn, db: this.db, name: this.table })) : btn('Design Table', 'design', () => NW.Designer.open({ conn: this.conn, db: this.db, table: this.table })),
        btn('Export Wizard', 'export', () => NW.ExportWizard.open({ conn: this.conn, db: this.db, table: this.table, q: this._q(), total: this.data && this.data.total })),
        this.isView ? null : btn('Import Wizard', 'import', () => NW.Tools.importWizard({ conn: this.conn, db: this.db, table: this.table })),
        h('div', { class: 'sb-sep' }),
        btn('New Query', 'query', () => NW.Query.open({ conn: this.conn, db: this.db, sql: 'SELECT * FROM ' + NW.qi(this.table) + ' LIMIT 100;' })),
        h('div', { class: 'sb-spacer' }),
        this.isView ? h('span', { class: 'pill', text: 'Read-only (view)' }) : null,
      );
      el.appendChild(this.bar);
      this.filterBar = h('div', { class: 'fbar', style: 'display:none' }); el.appendChild(this.filterBar);
      this.sortBar = h('div', { class: 'fbar', style: 'display:none' }); el.appendChild(this.sortBar);
      const gridWrap = h('div', { style: 'flex:1;display:flex;flex-direction:column;min-height:0' });
      el.appendChild(gridWrap);
      this.grid = new NW.DataGrid(gridWrap, {
        editable: !this.isView, tableName: this.table,
        canEdit: (r, c) => this._canEdit(r, c),
        onEditCommit: (r, c, val) => this._onEdit(r, c, val),
        getEditorKind: c => { const ci = this._colInfo(c); return ci && ci.dataType === 'enum' ? 'select' : 'text'; },
        getSelectOptions: c => { const ci = this._colInfo(c); return ci ? parseEnumValues(ci.colType) : []; },
        rowClass: r => (this.meta[r] && this.meta[r].state) || '',
        cellClass: (r, c) => (this.meta[r] && this.meta[r].dirty.has(c)) ? 'dirty' : '',
        onHeaderClick: (c, e) => this._sortBy(c, e.shiftKey),
        onHeaderContext: (c, e) => this._headerMenu(c, e),
        onCellContext: (r, c, e) => this._cellMenu(r, c, e),
        onCellDblClick: (r, c) => { const v = this.grid.rows[r][c]; if (!this._canEdit(r, c) || (v && typeof v === 'object')) { this.viewCell(r, c); return true; } return false; },
        onFocusChange: (cur, prev) => this._onFocus(cur, prev),
        onSelectionChange: () => this._updateFoot(),
        onKey: e => this._gridKey(e),
      });
      this.foot = h('div', { class: 'grid-foot' });
      el.appendChild(this.foot);
      this._buildFoot();
    }
    _buildFoot() {
      const ib = (icon, title, fn) => h('button', { class: 'ib', title, onclick: fn }, NW.svg(icon));
      this.navBox = h('div', { class: 'rec-nav' });
      if (!this.isView) {
        this.btnAdd = ib('plus', 'Add record (Ctrl+Insert)', () => this.addRow());
        this.btnDel = ib('minus', 'Delete selected record(s) (Ctrl+Delete)', () => this.deleteRows());
        this.btnApply = ib('check', 'Apply changes (Ctrl+S)', () => this.saveAll());
        this.btnDiscard = ib('cross', 'Discard changes', () => this.discardAll());
        this.navBox.append(this.btnAdd, this.btnDel, this.btnApply, this.btnDiscard);
      }
      this.navBox.append(ib('refresh', 'Refresh (F5)', () => this.load()));
      this.sqlText = h('span', { class: 'sqltext' });
      this.pageBox = h('div', { class: 'rec-nav' });
      this.pageInp = h('input', { class: 'pg-inp', title: 'Page', onchange: e => this.goPage(parseInt(e.target.value, 10) || 1) });
      this.limitInp = h('input', { class: 'lim-inp', title: 'Rows per page', value: this.limit, onchange: e => { const v = parseInt(e.target.value, 10); if (v > 0) { this.limit = Math.min(v, 10000); NW.settings.set('limit', this.limit); this.offset = 0; this.load(); } } });
      this.limitChk = h('input', { type: 'checkbox', checked: true, title: 'Limit rows', onchange: e => { this.useLimit = e.target.checked; this.limitInp.disabled = !this.useLimit; this.offset = 0; this.load(); } });
      this.pageBox.append(
        ib('first', 'First page', () => this.goPage(1)), ib('prev', 'Previous page', () => this.goPage(this.page() - 1)),
        this.pageInp, h('span', { class: 'muted', text: '/' }), this.pageCount = h('span', { text: '1' }),
        ib('next', 'Next page', () => this.goPage(this.page() + 1)), ib('last', 'Last page', () => this.goPage(this.pages())),
        h('label', { class: 'chk', style: 'margin-left:8px' }, this.limitChk, 'Limit'), this.limitInp,
      );
      this.recInfo = h('span', { class: 'muted', style: 'margin-left:8px;white-space:nowrap' });
      this.timeInfo = h('span', { class: 'muted', style: 'white-space:nowrap' });
      this.foot.append(this.navBox, this.sqlText, this.recInfo, this.pageBox, this.timeInfo);
    }
    page() { return Math.floor(this.offset / this.limit) + 1; }
    pages() { if (!this.data || this.data.total === null || !this.useLimit) return 1; return Math.max(1, Math.ceil(this.data.total / this.limit)); }
    async goPage(p) {
      if (!(await this._confirmLeave())) return;
      p = Math.max(1, Math.min(this.pages(), p));
      this.offset = (p - 1) * this.limit; this.load();
    }
    _q() { return { filters: this.filters.filter(f => f.on && f.col), where: this.where, sort: this.sort }; }

    /* ---------------------------------------------------------- loading */
    async load(opts) {
      opts = opts || {};
      if (!opts.force && this._hasChanges() && !(await this._confirmLeave())) return;
      this.loading = true; this.timeInfo.textContent = 'Loading…';
      const scroll = this.grid.el.scrollTop, focus = this.grid.getFocus();
      try {
        const q = this._q();
        const d = await NW.api('data.select', { conn: this.conn, db: this.db, table: this.table, offset: this.offset, limit: this.useLimit ? this.limit : 0, filters: q.filters, where: q.where, sort: q.sort });
        this.data = d;
        this.readOnly = d.readOnly;
        this.cols = d.fields.map(f => Object.assign({}, f, { info: (d.columns || []).find(c => c.name === f.orgName || c.name === f.name) || null }));
        this.meta = d.rows.map(r => ({ state: '', orig: r.slice(), dirty: new Set() }));
        this.grid.opts.editable = !this.isView && !this.readOnly;
        this.grid.sort = this.sort.slice();
        this.grid.setData(this.cols, d.rows, true);
        this.sqlText.textContent = d.sql; this.sqlText.title = d.sql;
        this.timeInfo.textContent = 'Query time: ' + NW.fmt.time(d.time);
        if (!this.filterBar.hidden && this.filterBar.style.display !== 'none' && !this.filterBar.childElementCount) this._renderFilterBar();
        if (opts.keepPosition) { this.grid.el.scrollTop = scroll; if (focus && focus.r < d.rows.length) this.grid.setFocus(focus.r, focus.c, { scroll: false }); }
        this._updateFoot();
        if (d.readOnly && !this.isView) NW.status.left('Read-only: ' + (d.key.mode === 'view' ? 'this is a view' : 'no primary key'));
      } catch (e) {
        this.timeInfo.textContent = '';
        this.grid.setData([], []);
        this.grid.el.innerHTML = '<div class="grid-empty err-text">' + NW.esc(e.message) + '</div>';
      } finally { this.loading = false; }
    }
    _updateFoot() {
      const d = this.data; if (!d) return;
      const total = d.total === null ? null : d.total;
      this.pageInp.value = this.page(); this.pageCount.textContent = this.pages();
      const f = this.grid.getFocus();
      const recNo = f ? this.offset + f.r + 1 : (d.rows.length ? this.offset + 1 : 0);
      this.recInfo.textContent = total === null ? d.count + ' rows' : 'Record ' + NW.fmt.num(recNo) + ' of ' + (d.approx ? '~' : '') + NW.fmt.num(total);
      const changes = this.meta.filter(m => m.state === 'new' || m.state === 'modified').length;
      if (this.btnApply) { this.btnApply.disabled = !changes; this.btnDiscard.disabled = !changes; }
      NW.Tabs.setDirty(this.tab.id, changes > 0);
      const sel = this.grid.getSelectedRows().length;
      if (sel > 1) NW.status.left(sel + ' records selected');
    }

    /* ---------------------------------------------------------- filter / sort bars */
    toggleFilter() {
      const show = this.filterBar.style.display === 'none';
      this.filterBar.style.display = show ? '' : 'none';
      this.btnFilter.classList.toggle('on', show);
      if (show) { if (!this.filters.length) this.filters.push({ on: true, col: this.cols[0] ? this.cols[0].name : '', op: '=', val: '', val2: '' }); this._renderFilterBar(); }
    }
    toggleSort() {
      const show = this.sortBar.style.display === 'none';
      this.sortBar.style.display = show ? '' : 'none';
      this.btnSort.classList.toggle('on', show);
      if (show) this._renderSortBar();
    }
    _renderFilterBar() {
      const bar = this.filterBar; bar.innerHTML = '';
      const names = this.cols.map(c => c.name);
      this.filters.forEach((f, i) => {
        const row = h('div', { class: 'frow' });
        row.append(
          i === 0 ? h('span', { class: 'ftitle', text: 'Filter' }) : h('span', { class: 'ftitle', text: 'AND' }),
          h('input', { type: 'checkbox', checked: f.on, onchange: e => f.on = e.target.checked }),
          NW.select(names, f.col, { onchange: e => f.col = e.target.value }),
          NW.select(OPS, f.op, { class: 'sel op', onchange: e => { f.op = e.target.value; this._renderFilterBar(); } }),
          NOVAL.includes(f.op) ? null : h('input', { class: 'inp', value: f.val, placeholder: /in$/.test(f.op) ? 'a, b, c' : 'value', oninput: e => f.val = e.target.value, onkeydown: e => { if (e.key === 'Enter') this.applyFilter(); } }),
          /between/.test(f.op) ? h('input', { class: 'inp', value: f.val2, placeholder: 'and', oninput: e => f.val2 = e.target.value, onkeydown: e => { if (e.key === 'Enter') this.applyFilter(); } }) : null,
          h('button', { class: 'ib', title: 'Remove', onclick: () => { this.filters.splice(i, 1); this._renderFilterBar(); } }, NW.svg('close')),
        );
        bar.appendChild(row);
      });
      const whereRow = h('div', { class: 'frow' }, h('span', { class: 'ftitle', text: 'Where' }), h('input', { class: 'inp', style: 'width:520px', value: this.where, placeholder: 'custom condition, e.g. price > 100 AND status <> \'cancelled\'', oninput: e => this.where = e.target.value, onkeydown: e => { if (e.key === 'Enter') this.applyFilter(); } }));
      bar.appendChild(whereRow);
      bar.appendChild(h('div', { class: 'factions' },
        h('button', { class: 'btn link', onclick: () => { this.filters.push({ on: true, col: names[0] || '', op: '=', val: '', val2: '' }); this._renderFilterBar(); } }, '+ Add condition'),
        h('button', { class: 'btn primary', onclick: () => this.applyFilter() }, 'Apply'),
        h('button', { class: 'btn', onclick: () => { this.filters = []; this.where = ''; this._renderFilterBar(); this.offset = 0; this.load(); } }, 'Clear'),
      ));
    }
    applyFilter() { this.offset = 0; this.load(); }
    _renderSortBar() {
      const bar = this.sortBar; bar.innerHTML = '';
      const names = this.cols.map(c => c.name);
      if (!this.sort.length) this.sort.push({ col: names[0] || '', dir: 'ASC' });
      this.sort.forEach((s, i) => {
        bar.appendChild(h('div', { class: 'frow' },
          h('span', { class: 'ftitle', text: i === 0 ? 'Sort' : 'then' }),
          NW.select(names, s.col, { onchange: e => s.col = e.target.value }),
          NW.select([{ value: 'ASC', label: 'Ascending' }, { value: 'DESC', label: 'Descending' }], s.dir, { class: 'sel op', onchange: e => s.dir = e.target.value }),
          h('button', { class: 'ib', title: 'Remove', onclick: () => { this.sort.splice(i, 1); this._renderSortBar(); } }, NW.svg('close'))));
      });
      bar.appendChild(h('div', { class: 'factions' },
        h('button', { class: 'btn link', onclick: () => { this.sort.push({ col: names[0] || '', dir: 'ASC' }); this._renderSortBar(); } }, '+ Add sort'),
        h('button', { class: 'btn primary', onclick: () => { this.sort = this.sort.filter(s => s.col); this.offset = 0; this.load(); } }, 'Apply'),
        h('button', { class: 'btn', onclick: () => { this.sort = []; this._renderSortBar(); this.offset = 0; this.load(); } }, 'Clear')));
    }
    _sortBy(c, additive) {
      const name = this.cols[c].name;
      const ex = this.sort.find(s => s.col === name);
      if (!additive) this.sort = ex ? (ex.dir === 'ASC' ? [{ col: name, dir: 'DESC' }] : []) : [{ col: name, dir: 'ASC' }];
      else if (ex) ex.dir = ex.dir === 'ASC' ? 'DESC' : 'ASC'; else this.sort.push({ col: name, dir: 'ASC' });
      if (this.sortBar.style.display !== 'none') this._renderSortBar();
      this.offset = 0; this.load();
    }
    _headerMenu(c, e) {
      const name = this.cols[c].name;
      NW.Menu.show([
        { label: 'Sort Ascending', onClick: () => { this.sort = [{ col: name, dir: 'ASC' }]; this.offset = 0; this.load(); } },
        { label: 'Sort Descending', onClick: () => { this.sort = [{ col: name, dir: 'DESC' }]; this.offset = 0; this.load(); } },
        { label: 'Remove Sort', disabled: !this.sort.length, onClick: () => { this.sort = []; this.offset = 0; this.load(); } },
        '-',
        { label: 'Filter by this column...', icon: 'filter', onClick: () => { this.filters.push({ on: true, col: name, op: '=', val: '', val2: '' }); if (this.filterBar.style.display === 'none') this.toggleFilter(); else this._renderFilterBar(); } },
        '-',
        { label: 'Copy Column Name', icon: 'copy', onClick: () => NW.copyText(name) },
      ], e.clientX, e.clientY);
    }

    /* ---------------------------------------------------------- editing */
    _colInfo(c) { return this.cols[c] ? this.cols[c].info : null; }
    _canEdit(r, c) {
      if (this.isView || this.readOnly) return false;
      const m = this.meta[r]; if (!m || m.state === 'deleted') return false;
      const ci = this._colInfo(c);
      if (ci && /GENERATED/i.test(ci.extra || '') && !/DEFAULT_GENERATED/i.test(ci.extra || '')) return false;
      const col = this.cols[c];
      if (col.orgTable && col.orgTable !== this.table) return false;
      return true;
    }
    _onEdit(r, c, val) {
      const m = this.meta[r];
      m.dirty.add(c);
      if (m.state !== 'new') m.state = 'modified';
      this.grid.rows[r][c] = val;
      this._updateFoot();
      return true;
    }
    setCellValue(r, c, val) { if (!this._canEdit(r, c)) return; this._onEdit(r, c, val); this.grid.renderRow(r); }
    _onFocus(cur, prev) {
      this._updateFoot();
      if (prev && cur && prev.r !== cur.r && this.meta[prev.r] && (this.meta[prev.r].state === 'modified' || this.meta[prev.r].state === 'new') && !this.saving) {
        this.saveRow(prev.r).then(ok => { if (!ok) this.grid.setFocus(prev.r, prev.c); });
      }
    }
    _hasChanges() { return this.meta.some(m => m.state === 'new' || m.state === 'modified'); }
    async _confirmLeave() {
      if (!this._hasChanges()) return true;
      const r = await NW.Dialog.msg('question', 'There are unsaved changes in ' + this.table + '. Save them first?', 'Unsaved changes', [{ label: 'Save', primary: true, value: 'save' }, { label: 'Discard', value: 'discard' }, { label: 'Cancel', value: null }]);
      if (r === 'save') return this.saveAll();
      if (r === 'discard') { this.discardAll(); return true; }
      return false;
    }
    addRow() {
      if (this.isView || this.readOnly) return;
      const vals = this.cols.map(() => null);
      this.grid.insertRow(vals);
      const r = this.grid.rows.length - 1;
      this.meta.push({ state: 'new', orig: vals.slice(), dirty: new Set() });
      this.grid.renderRow(r);
      const c = this.cols.findIndex((col, i) => this._canEdit(r, i) && !col.autoInc);
      this.grid.setFocus(r, Math.max(0, c));
      this.grid.focusContainer();
      this._updateFoot();
    }
    async deleteRows() {
      const rows = this.grid.getSelectedRows().filter(r => this.meta[r] && this.meta[r].state !== 'deleted');
      if (!rows.length) { const f = this.grid.getFocus(); if (f) rows.push(f.r); }
      if (!rows.length) return;
      const real = rows.filter(r => this.meta[r].state !== 'new');
      if (real.length && !(await NW.Dialog.confirm('Delete ' + NW.fmt.plural(real.length, 'record') + ' from ' + this.table + '?\nThis cannot be undone.', { title: 'Confirm Delete', ok: 'Delete', danger: true }))) return;
      try {
        if (real.length) {
          const changes = real.map(r => ({ type: 'delete', key: this._keyFor(r) }));
          await NW.api('data.save', { conn: this.conn, db: this.db, table: this.table, changes });
        }
        rows.sort((a, b) => b - a).forEach(r => { this.grid.rows.splice(r, 1); this.meta.splice(r, 1); });
        this.grid.selRows.clear(); this.grid.focus = null; this.grid.render();
        if (this.data && this.data.total !== null) this.data.total -= real.length;
        this._updateFoot();
        NW.Toast.ok(NW.fmt.plural(rows.length, 'record') + ' deleted');
      } catch (e) { NW.Dialog.error(e.message, 'Delete failed'); }
    }
    _keyFor(r) {
      const m = this.meta[r], key = this.data.key, out = {};
      if (key.mode === 'all') { this.cols.forEach((c, i) => { const v = m.orig[i]; if (v && typeof v === 'object' && (v.big || v.b !== undefined)) return; if (c.binary) return; out[c.name] = v; }); }
      else key.cols.forEach(k => { const i = this.cols.findIndex(c => c.orgName === k || c.name === k); out[k] = m.orig[i]; });
      return out;
    }
    _changeFor(r) {
      const m = this.meta[r], values = {};
      m.dirty.forEach(c => { values[this.cols[c].orgName || this.cols[c].name] = this.grid.rows[r][c]; });
      if (m.state === 'new') return { type: 'insert', values };
      return { type: 'update', key: this._keyFor(r), values };
    }
    async saveRow(r) { return this._save([r]); }
    async saveAll() {
      const rows = []; this.meta.forEach((m, i) => { if (m.state === 'new' || m.state === 'modified') rows.push(i); });
      if (!rows.length) return true;
      return this._save(rows);
    }
    async _save(rows) {
      if (this.grid.isEditing()) await this.grid.commitEdit();
      rows = rows.filter(r => this.meta[r] && (this.meta[r].state === 'new' || this.meta[r].state === 'modified'));
      if (!rows.length) return true;
      this.saving = true;
      try {
        const changes = rows.map(r => this._changeFor(r));
        const res = await NW.api('data.save', { conn: this.conn, db: this.db, table: this.table, changes });
        let hadInsert = false;
        rows.forEach((r, i) => {
          const m = this.meta[r];
          if (m.state === 'new') hadInsert = true;
          m.state = ''; m.dirty.clear(); m.orig = this.grid.rows[r].slice();
          this.grid.renderRow(r);
          const rr = res.results[i];
          if (rr && rr.type === 'update' && rr.affected === 0) NW.Toast.warn('Record ' + (this.offset + r + 1) + ': no row matched (it may have been changed elsewhere).');
        });
        NW.Toast.ok(NW.fmt.plural(rows.length, 'record') + ' saved');
        this._updateFoot();
        if (hadInsert) await this.load({ force: true, keepPosition: true });
        return true;
      } catch (e) {
        NW.Dialog.error(e.message, 'Save failed');
        return false;
      } finally { this.saving = false; }
    }
    discardAll() {
      for (let r = this.meta.length - 1; r >= 0; r--) {
        const m = this.meta[r];
        if (m.state === 'new') { this.grid.rows.splice(r, 1); this.meta.splice(r, 1); }
        else if (m.state === 'modified') { this.grid.rows[r] = m.orig.slice(); m.state = ''; m.dirty.clear(); }
      }
      this.grid.focus = null; this.grid.selRows.clear(); this.grid.render(); this._updateFoot();
    }
    async duplicateRow() {
      const f = this.grid.getFocus(); if (!f || this.isView || this.readOnly) return;
      const src = this.grid.rows[f.r].slice();
      this.cols.forEach((c, i) => { if (c.autoInc) src[i] = null; });
      this.grid.insertRow(src);
      const r = this.grid.rows.length - 1;
      const dirty = new Set(); this.cols.forEach((c, i) => { if (src[i] !== null && this._canEdit(r, i)) dirty.add(i); });
      this.meta.push({ state: 'new', orig: this.cols.map(() => null), dirty });
      this.grid.renderRow(r); this.grid.setFocus(r, f.c); this._updateFoot();
    }

    /* ---------------------------------------------------------- menus and keys */
    _cellMenu(r, c, e) {
      const canEdit = this._canEdit(r, c);
      const v = this.grid.rows[r][c];
      const sel = this.grid.getSelectedRows();
      NW.Menu.show([
        { label: 'Set to NULL', icon: 'null', disabled: !canEdit || v === null, shortcut: 'Ctrl+0', onClick: () => this.setCellValue(r, c, null) },
        { label: 'Set to Empty String', disabled: !canEdit, onClick: () => this.setCellValue(r, c, '') },
        '-',
        { label: 'Edit Cell Value...', icon: 'edit', onClick: () => this.viewCell(r, c) },
        '-',
        { label: 'Copy', icon: 'copy', shortcut: 'Ctrl+C', onClick: () => { NW.copyText(this.grid.copySelection()); } },
        { label: 'Copy As', children: [
          { label: 'Tab Separated Values (Data)', onClick: () => NW.copyText(this.grid.copySelection('rows')) },
          { label: 'Tab Separated Values (Field names and data)', onClick: () => NW.copyText(this.grid.copySelection('tsvh')) },
          { label: 'CSV', onClick: () => NW.copyText(this.grid.copySelection('csv')) },
          { label: 'JSON', onClick: () => NW.copyText(this.grid.copySelection('json')) },
          { label: 'INSERT Statements', onClick: () => NW.copyText(this.grid.copySelection('sql')) },
        ] },
        { label: 'Paste', icon: 'paste', disabled: !canEdit, onClick: async () => { try { const t = await navigator.clipboard.readText(); this.setCellValue(r, c, t); } catch (err) { NW.Toast.warn('Clipboard access was denied. Use Ctrl+V on the cell instead.'); } } },
        '-',
        { label: 'Add Record', icon: 'plus', disabled: this.isView || this.readOnly, shortcut: 'Ctrl+Ins', onClick: () => this.addRow() },
        { label: 'Duplicate Record', disabled: this.isView || this.readOnly, onClick: () => this.duplicateRow() },
        { label: 'Delete Record' + (sel.length > 1 ? 's' : ''), icon: 'delete', disabled: this.isView || this.readOnly, shortcut: 'Ctrl+Del', onClick: () => this.deleteRows() },
        '-',
        { label: 'Filter by this value', icon: 'filter', disabled: v && typeof v === 'object', onClick: () => { this.filters.push({ on: true, col: this.cols[c].name, op: v === null ? 'is null' : '=', val: v === null ? '' : String(v), val2: '' }); if (this.filterBar.style.display === 'none') this.toggleFilter(); else this._renderFilterBar(); this.applyFilter(); } },
        { label: 'Refresh', icon: 'refresh', shortcut: 'F5', onClick: () => this.load() },
      ], e.clientX, e.clientY);
    }
    _gridKey(e) {
      const f = this.grid.getFocus();
      if ((e.ctrlKey || e.metaKey) && e.key === '0' && f) { e.preventDefault(); this.setCellValue(f.r, f.c, null); return true; }
      if ((e.ctrlKey || e.metaKey) && e.key === 'Insert') { e.preventDefault(); this.addRow(); return true; }
      if ((e.ctrlKey || e.metaKey) && e.key === 'Delete') { e.preventDefault(); this.deleteRows(); return true; }
      if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) { e.preventDefault(); this.saveAll(); return true; }
      if (e.key === 'F5') { e.preventDefault(); this.load(); return true; }
      if (e.key === 'F7' && f) { e.preventDefault(); this.viewCell(f.r, f.c); return true; }
      return false;
    }
    viewCell(r, c) {
      const col = this.cols[c], v = this.grid.rows[r][c];
      NW.CellViewer.open({ value: v, col, readOnly: !this._canEdit(r, c), onSave: nv => this.setCellValue(r, c, nv) });
    }

    /* ---------------------------------------------------------- tab controller */
    refresh() { this.load(); }
    onActivate() { this._updateFoot(); if (this.data && this.data.sql) NW.status.left(this.table + (this.data.total !== null ? ' • ' + NW.fmt.num(this.data.total) + ' records' : '')); }
    async onClose() { return this._confirmLeave(); }
  }

  function parseEnumValues(colType) {
    const m = /^(?:enum|set)\((.*)\)$/i.exec((colType || '').trim());
    if (!m) return [];
    const out = []; const re = /'((?:[^']|'')*)'/g; let x;
    while ((x = re.exec(m[1]))) out.push(x[1].replace(/''/g, "'"));
    return out;
  }
  NW.parseEnumValues = parseEnumValues;

  /* ============================================================ cell viewer / editor */
  NW.CellViewer = {
    open(o) {
      const v = o.value, col = o.col || {};
      const isBin = (v && typeof v === 'object' && (v.b !== undefined || v.bin)) || col.binary;
      let bytes = (v && typeof v === 'object' && v.b !== undefined) ? NW.b64ToBytes(v.b) : null;
      let text = (v === null || (v && typeof v === 'object')) ? '' : String(v);
      let isNull = v === null;
      let changed = false, newBytes = null;
      const big = v && typeof v === 'object' && v.big;
      const tabs = [{ id: 'text', label: 'Text' }];
      if (isBin) tabs.unshift({ id: 'hex', label: 'Hex' });
      if (bytes && imageMime(bytes)) tabs.push({ id: 'image', label: 'Image' });
      if (/json/i.test(col.type || '') || /^\s*[\[{]/.test(text)) tabs.push({ id: 'json', label: 'JSON' });
      const st = NW.subTabs(tabs, { cls: 'dtabs', tabCls: 'dtab', panelCls: 'dpanel' });
      const ta = h('textarea', { class: 'ta cell-editor-ta', spellcheck: false, readOnly: !!o.readOnly || isBin, value: isNull ? '' : text, oninput: () => { changed = true; isNull = false; } });
      const wrapChk = h('input', { type: 'checkbox', onchange: e => { ta.style.whiteSpace = e.target.checked ? 'pre-wrap' : 'pre'; } });
      st.panels.text.append(ta, h('div', { class: 'form-row small muted', style: 'margin-top:6px' }, h('label', { class: 'chk' }, wrapChk, 'Word wrap'), h('span', { text: isNull ? '(NULL)' : NW.fmt.num(text.length) + ' characters' }), big ? h('span', { class: 'err-text', text: 'Only a preview is shown (' + NW.fmt.bytes(v.n) + ' total).' }) : null));
      if (isBin) {
        const hex = h('div', { class: 'hexview', text: bytes ? hexDump(bytes) : (big ? 'Binary value of ' + NW.fmt.bytes(v.n) + ' (too large to display)' : '(NULL)') });
        const fileInp = h('input', { type: 'file', style: 'display:none', onchange: e => { const f = e.target.files[0]; if (!f) return; f.arrayBuffer().then(buf => { newBytes = new Uint8Array(buf); bytes = newBytes; hex.textContent = hexDump(bytes); changed = true; isNull = false; info.textContent = NW.fmt.bytes(bytes.length) + ' (from ' + f.name + ')'; }); } });
        const info = h('span', { class: 'muted small', text: bytes ? NW.fmt.bytes(bytes.length) : '' });
        st.panels.hex.append(hex, h('div', { class: 'form-row', style: 'margin-top:8px' },
          o.readOnly ? null : h('button', { class: 'btn', onclick: () => fileInp.click() }, 'Load from File...'),
          h('button', { class: 'btn', disabled: !bytes, onclick: () => { const blob = new Blob([bytes]); const a = h('a', { href: URL.createObjectURL(blob), download: (col.name || 'blob') + '.bin' }); document.body.appendChild(a); a.click(); a.remove(); } }, 'Save to File...'),
          info, fileInp));
      }
      if (st.panels.image) { const url = URL.createObjectURL(new Blob([bytes], { type: imageMime(bytes) })); st.panels.image.appendChild(h('img', { class: 'imgprev', src: url })); }
      if (st.panels.json) {
        const pre = h('pre', { class: 'hexview', style: 'max-height:46vh' });
        try { pre.textContent = JSON.stringify(JSON.parse(text), null, 2); } catch (e) { pre.textContent = 'Not valid JSON: ' + e.message; pre.classList.add('err-text'); }
        st.panels.json.append(pre, o.readOnly ? null : h('button', { class: 'btn', style: 'margin-top:8px', onclick: () => { try { ta.value = JSON.stringify(JSON.parse(ta.value || text), null, 2); changed = true; isNull = false; st.show('text'); } catch (e) { NW.Toast.err('Not valid JSON: ' + e.message); } } }, 'Format and edit'));
      }
      st.el.style.height = '440px';
      const buttons = o.readOnly ? [{ label: 'Close', value: null }] : [
        { label: 'OK', primary: true, onClick: () => { if (isNull) { o.onSave(null); return; } if (newBytes) { o.onSave({ b: NW.bytesToB64(newBytes), n: newBytes.length }); return; } if (isBin) { if (changed) o.onSave({ b: NW.bytesToB64(bytes), n: bytes.length }); return; } if (changed || ta.value !== text) o.onSave(ta.value); } },
        { label: 'Cancel', value: null }];
      NW.Dialog.open({ title: 'Edit Value - ' + (col.name || ''), icon: 'edit', body: st.el, width: 680, buttons, noEnter: true,
        left: o.readOnly ? null : h('button', { class: 'btn', onclick: () => { isNull = true; changed = true; ta.value = ''; newBytes = null; } }, 'Set to NULL') });
      setTimeout(() => ta.focus(), 50);
    },
  };
  function hexDump(bytes) {
    const n = Math.min(bytes.length, 65536); let out = '';
    for (let i = 0; i < n; i += 16) {
      let hex = '', asc = '';
      for (let j = 0; j < 16; j++) { if (i + j < n) { const b = bytes[i + j]; hex += b.toString(16).padStart(2, '0') + ' '; asc += b >= 32 && b < 127 ? String.fromCharCode(b) : '.'; } else hex += '   '; if (j === 7) hex += ' '; }
      out += i.toString(16).padStart(8, '0') + '  ' + hex + ' ' + asc + '\n';
    }
    if (bytes.length > n) out += '… (' + NW.fmt.bytes(bytes.length - n) + ' more)';
    return out;
  }
  function imageMime(b) {
    if (!b || b.length < 4) return null;
    if (b[0] === 0x89 && b[1] === 0x50) return 'image/png';
    if (b[0] === 0xFF && b[1] === 0xD8) return 'image/jpeg';
    if (b[0] === 0x47 && b[1] === 0x49) return 'image/gif';
    if (b[0] === 0x42 && b[1] === 0x4D) return 'image/bmp';
    if (b[0] === 0x52 && b[1] === 0x49 && b[8] === 0x57) return 'image/webp';
    return null;
  }

  /* ============================================================ export wizard */
  NW.ExportWizard = {
    open(o) {
      const formats = [['csv', 'CSV file (*.csv)'], ['txt', 'Text file, tab separated (*.txt)'], ['json', 'JSON file (*.json)'], ['sql', 'SQL script file (*.sql)'], ['html', 'HTML file (*.html)'], ['xml', 'XML file (*.xml)'], ['md', 'Markdown table (*.md)']];
      let format = 'csv';
      const radios = h('div', { style: 'display:grid;gap:6px' });
      formats.forEach(([v, l]) => radios.appendChild(h('label', { class: 'chk' }, h('input', { type: 'radio', name: 'fmt', value: v, checked: v === format, onchange: () => { format = v; optCsv.style.display = v === 'csv' ? '' : 'none'; } }), l)));
      const sep = NW.select([{ value: ',', label: 'Comma (,)' }, { value: ';', label: 'Semicolon (;)' }, { value: '|', label: 'Pipe (|)' }, { value: '\t', label: 'Tab' }], ',');
      const header = h('input', { type: 'checkbox', checked: true });
      const bom = h('input', { type: 'checkbox', checked: false });
      const optCsv = h('div', { class: 'form-grid', style: 'margin-top:10px' }, ...NW.formRow('Delimiter', sep));
      const body = h('div', null,
        h('p', null, 'Export ', h('b', { text: o.sql ? 'the query result' : (o.db + '.' + o.table) }), o.total !== undefined && o.total !== null ? ' (' + NW.fmt.num(o.total) + ' records' + (o.q && (o.q.filters && o.q.filters.length || o.q.where) ? ', with the current filter' : '') + ')' : '', ' as:'),
        radios, optCsv,
        h('div', { style: 'margin-top:10px;display:flex;gap:16px' }, h('label', { class: 'chk' }, header, 'Include column titles'), h('label', { class: 'chk' }, bom, 'Add UTF-8 BOM (Excel)')));
      NW.Dialog.open({ title: 'Export Wizard', icon: 'export', body, width: 480, buttons: [
        { label: 'Export', primary: true, onClick: () => {
          const params = { conn: o.conn, format, sep: sep.value, header: header.checked ? 1 : 0, bom: bom.checked ? 1 : 0 };
          if (o.sql) { params.sql = o.sql; params.name = o.name || 'query_result'; params.db = o.db; NW.download('export.query', params); }
          else { params.db = o.db; params.table = o.table; params.q = o.q || {}; NW.download('export.table', params); }
          NW.Toast.ok('Export started. The download will begin shortly.');
        } },
        { label: 'Cancel', value: null }] });
    },
  };
})();

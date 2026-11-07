/* Navicat Web - the "Objects" tab: lists for the selected tree node, with a sub-toolbar and an information pane */
(function () {
  'use strict';
  const NW = window.NW, h = NW.h;

  const Objects = {
    tabId: 'objects', currentNode: null, selected: new Set(), sortKey: null, sortDir: 1, search: '', infoTab: 'general', infoCollapsed: false,

    init() {
      NW.Tabs.open({
        id: this.tabId, title: 'Objects', icon: 'grid', closable: false,
        create: (el) => { this.root = el; this.render(); return { refresh: () => this.refresh(), onActivate: () => { } }; },
      });
    },
    show(node) {
      this.currentNode = node;
      this.selected.clear();
      this.render();
    },
    async refresh() {
      const n = this.currentNode;
      if (!n) { NW.App.reloadConnections(); return; }
      if (n.type === 'conn') { await NW.Tree.refreshConnection(n.conn); }
      else if (n.db) { await NW.Tree.refreshDatabase(n.conn, n.db); }
      const nn = NW.Tree.node(n.id); if (nn) this.show(nn);
    },
    ctx() { const n = this.currentNode; return n ? { conn: n.conn, db: n.db } : null; },

    /* ---------------------------------------------------------- rendering */
    render() {
      const root = this.root; if (!root) return;
      root.innerHTML = '';
      const n = this.currentNode;
      const wrap = h('div', { class: 'obj-wrap' });
      root.appendChild(wrap);
      if (!n) { this._renderConnections(wrap); return; }
      if (n.type === 'conn') { if (!NW.connState(n.conn).open) this._renderConnections(wrap, n.conn); else this._renderDatabases(wrap, n); return; }
      if (n.type === 'db') { if (!NW.dbState(n.conn, n.db).open) { this._renderClosedDb(wrap, n); return; } this._renderList(wrap, n, 'table'); return; }
      if (n.type === 'folder') { this._renderList(wrap, n, n.kind); return; }
      if (n.type === 'obj') { const folderKind = (n.kind === 'function' || n.kind === 'procedure') ? 'routine' : n.kind; const f = NW.Tree.node('f:' + n.conn + '|' + n.db + '|' + folderKind); this._renderList(wrap, f || n, folderKind, n.name); }
    },
    _toolbar(buttons) {
      const bar = h('div', { class: 'subbar' });
      buttons.forEach(b => {
        if (b === '-') { bar.appendChild(h('div', { class: 'sb-sep' })); return; }
        if (b === ' ') { bar.appendChild(h('div', { class: 'sb-spacer' })); return; }
        const btn = h('button', { class: 'sb-btn', title: b.title || b.label, disabled: b.disabled, onclick: b.onClick }, b.icon ? NW.svg(b.icon) : null, b.label);
        bar.appendChild(btn);
      });
      const search = h('input', { class: 'sb-search', type: 'search', placeholder: 'Search', value: this.search, oninput: NW.debounce(e => { this.search = e.target.value.toLowerCase(); this.render(); }, 150) });
      bar.appendChild(h('div', { class: 'sb-spacer' }));
      bar.appendChild(search);
      return bar;
    },
    _renderConnections(wrap, onlyConn) {
      wrap.appendChild(this._toolbar([
        { label: 'New Connection', icon: 'mysql', onClick: () => NW.Connection.dialog() },
        { label: 'Open Connection', icon: 'open', disabled: !onlyConn, onClick: () => NW.Tree.openConnection(onlyConn) },
        { label: 'Edit Connection', icon: 'design', disabled: !onlyConn, onClick: () => NW.Connection.dialog(NW.connById(onlyConn)) },
        { label: 'Delete Connection', icon: 'delete', disabled: !onlyConn, onClick: () => NW.Connection.remove(onlyConn) },
      ]));
      const cards = h('div', { class: 'conn-cards' });
      const list = NW.state.connections.filter(c => !onlyConn || c.id === onlyConn).filter(c => !this.search || c.name.toLowerCase().includes(this.search) || c.host.toLowerCase().includes(this.search));
      if (!list.length) cards.appendChild(h('div', { class: 'obj-empty', text: NW.state.connections.length ? 'No matching connection.' : 'No connections. Click "New Connection" to add a MySQL or MariaDB server.' }));
      list.forEach(c => {
        const cs = NW.connState(c.id);
        cards.appendChild(h('div', { class: 'conn-card', ondblclick: () => NW.Tree.openConnection(c.id), onclick: () => NW.Tree.select('c:' + c.id, { silent: true }),
          oncontextmenu: e => { e.preventDefault(); NW.Menu.show(NW.Tree.menuFor(NW.Tree.node('c:' + c.id)), e.clientX, e.clientY); } },
          h('span', { class: 'ico' + (cs.open ? '' : ' closed'), html: NW.icon('mysql'), style: cs.open ? '' : 'filter:grayscale(1);opacity:.6' }),
          h('div', null, h('div', { class: 'cc-name', text: c.name }), h('div', { class: 'cc-sub', text: c.user + '@' + c.host + ':' + c.port }), h('div', { class: 'cc-sub', text: cs.open ? 'Connected • ' + (cs.version || '') : 'Not connected' }))));
      });
      wrap.appendChild(cards);
      this._status(list.length + ' connection(s)');
    },
    _renderClosedDb(wrap, n) {
      wrap.appendChild(this._toolbar([{ label: 'Open Database', icon: 'open', onClick: () => NW.Tree.openDatabase(n.conn, n.db) }, { label: 'Edit Database', icon: 'design', onClick: () => NW.Tools.editDatabase(n.conn, n.db) }, { label: 'Delete Database', icon: 'delete', onClick: () => NW.Tools.dropDatabase(n.conn, n.db) }]));
      wrap.appendChild(h('div', { class: 'obj-empty' }, 'Database ', h('b', { text: n.db }), ' is closed. Double-click it in the navigation pane (or click Open Database) to list its objects.'));
    },
    _renderDatabases(wrap, n) {
      const cs = NW.connState(n.conn);
      wrap.appendChild(this._toolbar([
        { label: 'Open Database', icon: 'open', disabled: !this.selected.size, onClick: () => this._withSelected(db => NW.Tree.openDatabase(n.conn, db)) },
        { label: 'New Database', icon: 'database', onClick: () => NW.Tools.newDatabase(n.conn) },
        { label: 'Edit Database', icon: 'design', disabled: this.selected.size !== 1, onClick: () => this._withSelected(db => NW.Tools.editDatabase(n.conn, db)) },
        { label: 'Delete Database', icon: 'delete', disabled: this.selected.size !== 1, onClick: () => this._withSelected(db => NW.Tools.dropDatabase(n.conn, db)) },
        '-',
        { label: 'New Query', icon: 'query', onClick: () => NW.Query.open({ conn: n.conn, db: this.selected.size === 1 ? Array.from(this.selected)[0] : null }) },
        { label: 'Server Monitor', icon: 'monitor', onClick: () => NW.Tools.serverMonitor(n.conn) },
      ]));
      const rows = cs.databases.filter(d => !this.search || d.name.toLowerCase().includes(this.search)).map(d => ({ key: d.name, icon: 'database', closed: !NW.dbState(n.conn, d.name).open, cells: [d.name, d.charset || '', d.collation || ''] }));
      this._table(wrap, [{ k: 'Name' }, { k: 'Character Set' }, { k: 'Collation' }], rows, {
        dbl: key => NW.Tree.openDatabase(n.conn, key),
        menu: key => NW.Tree.menuFor(NW.Tree.node('d:' + n.conn + '|' + key)),
      });
      this._status(rows.length + ' database(s)');
    },
    _renderList(wrap, n, kind, highlight) {
      const conn = n.conn, db = n.db;
      const ds = NW.dbState(conn, db);
      const objects = ds.objects || {};
      const sel = Array.from(this.selected);
      const one = sel.length === 1 ? sel[0] : null;
      const nodeOf = name => NW.Tree.node('o:' + conn + '|' + db + '|' + (kind === 'routine' ? ((objects.routines || []).find(r => r.name === name) || {}).type === 'PROCEDURE' ? 'procedure' : (kind === 'routine' ? 'function' : kind) : kind) + '|' + name);
      let buttons = [], cols = [], rows = [];
      const nameCell = (name, icon) => ({ html: '<span class="name">' + NW.icon(icon) + NW.esc(name) + '</span>', sort: name });
      if (kind === 'table') {
        buttons = [
          { label: 'Open Table', icon: 'open', disabled: !one, onClick: () => NW.TableTab.open({ conn, db, table: one }) },
          { label: 'Design Table', icon: 'design', disabled: !one, onClick: () => NW.Designer.open({ conn, db, table: one }) },
          { label: 'New Table', icon: 'table', onClick: () => NW.Designer.open({ conn, db }) },
          { label: 'Delete Table', icon: 'delete', disabled: !sel.length, onClick: () => NW.Tools.dropObject(conn, db, 'table', sel) },
          '-',
          { label: 'Import Wizard', icon: 'import', onClick: () => NW.Tools.importWizard({ conn, db, table: one }) },
          { label: 'Export Wizard', icon: 'export', disabled: !one, onClick: () => NW.ExportWizard.open({ conn, db, table: one }) },
          '-',
          { label: 'Dump SQL', icon: 'backup', onClick: () => NW.Tools.dumpDialog({ conn, db, tables: sel.length ? sel : null, data: true }) },
        ];
        cols = [{ k: 'Name' }, { k: 'Rows', num: true }, { k: 'Data Length', num: true }, { k: 'Engine' }, { k: 'Auto Increment', num: true }, { k: 'Created Date' }, { k: 'Modified Date' }, { k: 'Collation' }, { k: 'Comment' }];
        rows = (objects.tables || []).map(t => ({ key: t.name, cells: [nameCell(t.name, 'table'), { text: t.rows === null ? '' : NW.fmt.num(t.rows), sort: t.rows || 0 }, { text: NW.fmt.bytes(t.dataLength + t.indexLength), sort: t.dataLength + t.indexLength }, t.engine || '', { text: t.autoInc || '', sort: +t.autoInc || 0 }, NW.fmt.date(t.created), NW.fmt.date(t.updated), t.collation || '', t.comment || ''] }));
      } else if (kind === 'view') {
        buttons = [
          { label: 'Open View', icon: 'open', disabled: !one, onClick: () => NW.TableTab.open({ conn, db, table: one, isView: true }) },
          { label: 'Design View', icon: 'design', disabled: !one, onClick: () => NW.Tools.viewDesigner({ conn, db, name: one }) },
          { label: 'New View', icon: 'view', onClick: () => NW.Tools.viewDesigner({ conn, db }) },
          { label: 'Delete View', icon: 'delete', disabled: !sel.length, onClick: () => NW.Tools.dropObject(conn, db, 'view', sel) },
          '-',
          { label: 'Export Wizard', icon: 'export', disabled: !one, onClick: () => NW.ExportWizard.open({ conn, db, table: one }) },
        ];
        cols = [{ k: 'Name' }, { k: 'Definer' }, { k: 'Updatable' }, { k: 'Security' }, { k: 'Check Option' }, { k: 'Created Date' }];
        rows = (objects.views || []).map(v => ({ key: v.name, cells: [nameCell(v.name, 'view'), v.definer || '', v.updatable || '', v.security || '', v.checkOption || '', NW.fmt.date(v.created)] }));
      } else if (kind === 'routine') {
        const r1 = one ? (objects.routines || []).find(r => r.name === one) : null;
        const t1 = r1 ? (r1.type === 'PROCEDURE' ? 'procedure' : 'function') : 'function';
        buttons = [
          { label: 'Design Function', icon: 'design', disabled: !one, onClick: () => NW.Tools.routineDesigner({ conn, db, name: one, type: t1 }) },
          { label: 'New Function', icon: 'function', onClick: () => NW.Tools.routineDesigner({ conn, db }) },
          { label: 'Delete Function', icon: 'delete', disabled: !sel.length, onClick: () => NW.Tools.dropObject(conn, db, 'routine', sel) },
          '-',
          { label: 'Run Function', icon: 'run', disabled: !one, onClick: () => NW.Tools.runRoutine({ conn, db, name: one, type: t1 }) },
        ];
        cols = [{ k: 'Name' }, { k: 'Type' }, { k: 'Returns' }, { k: 'Definer' }, { k: 'Created Date' }, { k: 'Modified Date' }, { k: 'Security' }, { k: 'Comment' }];
        rows = (objects.routines || []).map(r => ({ key: r.name, cells: [nameCell(r.name, r.type === 'PROCEDURE' ? 'procedure' : 'function'), r.type === 'PROCEDURE' ? 'Procedure' : 'Function', r.returns || '', r.definer || '', NW.fmt.date(r.created), NW.fmt.date(r.modified), r.security || '', r.comment || ''] }));
      } else if (kind === 'event') {
        buttons = [
          { label: 'Design Event', icon: 'design', disabled: !one, onClick: () => NW.Tools.eventDesigner({ conn, db, name: one }) },
          { label: 'New Event', icon: 'event', onClick: () => NW.Tools.eventDesigner({ conn, db }) },
          { label: 'Delete Event', icon: 'delete', disabled: !sel.length, onClick: () => NW.Tools.dropObject(conn, db, 'event', sel) },
        ];
        cols = [{ k: 'Name' }, { k: 'Status' }, { k: 'Type' }, { k: 'Schedule' }, { k: 'Starts' }, { k: 'Ends' }, { k: 'Last Executed' }, { k: 'Definer' }, { k: 'Comment' }];
        rows = (objects.events || []).map(e => ({ key: e.name, cells: [nameCell(e.name, 'event'), e.status || '', e.type || '', e.type === 'ONE TIME' ? 'AT ' + NW.fmt.date(e.executeAt) : 'EVERY ' + e.intervalValue + ' ' + e.intervalField, NW.fmt.date(e.starts), NW.fmt.date(e.ends), NW.fmt.date(e.lastExecuted), e.definer || '', e.comment || ''] }));
      } else if (kind === 'query') {
        const qs = (NW.connState(conn).queries || []).filter(q => !q.db || q.db === db);
        const q1 = one ? qs.find(q => q.name === one) : null;
        buttons = [
          { label: 'Open Query', icon: 'open', disabled: !q1, onClick: () => NW.Query.open({ conn, db: q1.db || db, sql: q1.sql, name: q1.name, savedId: q1.id }) },
          { label: 'New Query', icon: 'query', onClick: () => NW.Query.open({ conn, db }) },
          { label: 'Delete Query', icon: 'delete', disabled: !q1, onClick: () => NW.Tools.deleteQuery(q1) },
          { label: 'Rename', disabled: !q1, onClick: () => NW.Tools.renameQuery(q1) },
        ];
        cols = [{ k: 'Name' }, { k: 'Database' }, { k: 'Modified Date' }, { k: 'SQL' }];
        rows = qs.map(q => ({ key: q.name, cells: [nameCell(q.name, 'savedquery'), q.db || '', NW.fmt.date(q.updated), (q.sql || '').replace(/\s+/g, ' ').slice(0, 120)] }));
      }
      wrap.appendChild(this._toolbar(buttons));
      if (this.search) rows = rows.filter(r => r.key.toLowerCase().includes(this.search));
      const kindOf = name => { if (kind !== 'routine') return kind; const r = (objects.routines || []).find(x => x.name === name); return r && r.type === 'PROCEDURE' ? 'procedure' : 'function'; };
      this._table(wrap, cols, rows, {
        dbl: key => { const nd = NW.Tree.node('o:' + conn + '|' + db + '|' + kindOf(key) + '|' + key); if (nd) NW.Tree.openObject(nd); },
        menu: key => { const nd = NW.Tree.node('o:' + conn + '|' + db + '|' + kindOf(key) + '|' + key); return nd ? NW.Tree.menuFor(nd) : []; },
        onSelect: () => this._refreshToolbar(),
        highlight,
      });
      this._infoPane(wrap, n, kind, kindOf);
      const label = { table: 'table', view: 'view', routine: 'function', event: 'event', query: 'query' }[kind];
      this._status(rows.length + ' ' + label + (rows.length === 1 ? '' : 's') + (this.selected.size ? ' • ' + this.selected.size + ' selected' : ''));
    },
    _refreshToolbar() { this.render(); },
    _withSelected(fn) { const s = Array.from(this.selected); if (s.length) fn(s[0]); },
    _status(t) { NW.status.left(t); },

    /** Generic sortable, selectable list */
    _table(wrap, cols, rows, o) {
      const box = h('div', { class: 'obj-list' });
      if (this.sortKey !== null && cols[this.sortKey]) {
        const k = this.sortKey, d = this.sortDir;
        rows = rows.slice().sort((a, b) => { const x = a.cells[k], y = b.cells[k]; const xv = x && typeof x === 'object' ? (x.sort !== undefined ? x.sort : x.text) : x; const yv = y && typeof y === 'object' ? (y.sort !== undefined ? y.sort : y.text) : y; if (typeof xv === 'number' && typeof yv === 'number') return (xv - yv) * d; return String(xv).localeCompare(String(yv), undefined, { numeric: true, sensitivity: 'base' }) * d; });
      }
      const table = h('table');
      const thead = h('thead'); const trh = h('tr');
      cols.forEach((c, i) => trh.appendChild(h('th', { text: c.k + (this.sortKey === i ? (this.sortDir > 0 ? ' ▲' : ' ▼') : ''), onclick: () => { if (this.sortKey === i) { if (this.sortDir > 0) this.sortDir = -1; else { this.sortKey = null; this.sortDir = 1; } } else { this.sortKey = i; this.sortDir = 1; } this.render(); } })));
      thead.appendChild(trh); table.appendChild(thead);
      const tbody = h('tbody');
      if (o.highlight && !this.selected.size) this.selected.add(o.highlight);
      rows.forEach(r => {
        const tr = h('tr', { dataset: { key: r.key }, class: this.selected.has(r.key) ? 'selected' : '' });
        r.cells.forEach((c, i) => {
          const td = h('td', { class: cols[i].num ? 'num' : '' });
          if (c && typeof c === 'object') { if (c.html) td.innerHTML = c.html; else td.textContent = c.text; } else td.textContent = c;
          if (!(c && typeof c === 'object' && c.html)) td.title = td.textContent;
          tr.appendChild(td);
        });
        if (r.closed) tr.style.opacity = '.7';
        tbody.appendChild(tr);
      });
      table.appendChild(tbody); box.appendChild(table);
      if (!rows.length) box.appendChild(h('div', { class: 'obj-empty', text: 'Nothing to show.' }));
      let anchor = null;
      tbody.addEventListener('mousedown', e => {
        const tr = e.target.closest('tr'); if (!tr) return;
        const key = tr.dataset.key;
        if (e.button === 2 && this.selected.has(key)) return;
        if (e.shiftKey && anchor) { const keys = rows.map(r => r.key); const a = keys.indexOf(anchor), b = keys.indexOf(key); this.selected.clear(); for (let i = Math.min(a, b); i <= Math.max(a, b); i++) this.selected.add(keys[i]); }
        else if (e.ctrlKey || e.metaKey) { if (this.selected.has(key)) this.selected.delete(key); else this.selected.add(key); anchor = key; }
        else { this.selected.clear(); this.selected.add(key); anchor = key; }
        tbody.querySelectorAll('tr').forEach(x => x.classList.toggle('selected', this.selected.has(x.dataset.key)));
        if (o.onSelect) o.onSelect();
      });
      tbody.addEventListener('dblclick', e => { const tr = e.target.closest('tr'); if (tr && o.dbl) o.dbl(tr.dataset.key); });
      box.addEventListener('contextmenu', e => {
        e.preventDefault();
        const tr = e.target.closest('tr');
        if (tr && o.menu) { if (!this.selected.has(tr.dataset.key)) { this.selected.clear(); this.selected.add(tr.dataset.key); tbody.querySelectorAll('tr').forEach(x => x.classList.toggle('selected', this.selected.has(x.dataset.key))); if (o.onSelect) o.onSelect(); } NW.Menu.show(o.menu(tr.dataset.key), e.clientX, e.clientY); }
        else if (this.currentNode) NW.Menu.show(NW.Tree.menuFor(this.currentNode.type === 'obj' ? NW.Tree.node('f:' + this.currentNode.conn + '|' + this.currentNode.db + '|' + ((this.currentNode.kind === 'function' || this.currentNode.kind === 'procedure') ? 'routine' : this.currentNode.kind)) : this.currentNode), e.clientX, e.clientY);
      });
      wrap.appendChild(box);
      if (o.highlight) setTimeout(() => { const tr = tbody.querySelector('tr.selected'); if (tr) tr.scrollIntoView({ block: 'nearest' }); }, 0);
    },

    /* ---------------------------------------------------------- information pane */
    _infoPane(wrap, n, kind, kindOf) {
      const pane = h('div', { class: 'obj-info' + (this.infoCollapsed ? ' collapsed' : '') });
      const tabs = h('div', { class: 'oi-tabs' });
      const body = h('div', { class: 'oi-body' });
      const mk = (id, label) => h('span', { class: 'oi-tab' + (this.infoTab === id ? ' active' : ''), text: label, onclick: () => { this.infoTab = id; this.infoCollapsed = false; this.render(); } });
      tabs.appendChild(mk('general', 'General'));
      tabs.appendChild(mk('ddl', 'DDL'));
      tabs.appendChild(h('span', { class: 'sb-spacer' }));
      tabs.appendChild(h('span', { class: 'oi-tab', text: this.infoCollapsed ? '▲ Information' : '▼', title: 'Show/hide the information pane', onclick: () => { this.infoCollapsed = !this.infoCollapsed; this.render(); } }));
      pane.appendChild(tabs); pane.appendChild(body); wrap.appendChild(pane);
      if (this.infoCollapsed) return;
      const sel = Array.from(this.selected);
      if (sel.length !== 1) { body.appendChild(h('div', { class: 'muted', text: sel.length ? sel.length + ' objects selected' : 'Select an object to see its information.' })); return; }
      const name = sel[0];
      const objects = NW.dbState(n.conn, n.db).objects || {};
      if (this.infoTab === 'general') {
        const dl = h('dl', { class: 'kv' });
        const add = (k, v) => { if (v === null || v === undefined || v === '') return; dl.appendChild(h('dt', { text: k })); dl.appendChild(h('dd', { text: String(v) })); };
        if (kind === 'table') { const t = (objects.tables || []).find(x => x.name === name); if (t) { add('Name', t.name); add('Rows', NW.fmt.num(t.rows)); add('Engine', t.engine); add('Data Length', NW.fmt.bytes(t.dataLength)); add('Index Length', NW.fmt.bytes(t.indexLength)); add('Auto Increment', t.autoInc); add('Row Format', t.rowFormat); add('Collation', t.collation); add('Created Date', NW.fmt.date(t.created)); add('Modified Date', NW.fmt.date(t.updated)); add('Comment', t.comment); } }
        else if (kind === 'view') { const v = (objects.views || []).find(x => x.name === name); if (v) { add('Name', v.name); add('Definer', v.definer); add('Updatable', v.updatable); add('Security', v.security); add('Check Option', v.checkOption); } }
        else if (kind === 'routine') { const r = (objects.routines || []).find(x => x.name === name); if (r) { add('Name', r.name); add('Type', r.type); add('Returns', r.returns); add('Definer', r.definer); add('Deterministic', r.deterministic); add('Data Access', r.dataAccess); add('Security', r.security); add('Created', NW.fmt.date(r.created)); add('Modified', NW.fmt.date(r.modified)); add('Comment', r.comment); } }
        else if (kind === 'event') { const e = (objects.events || []).find(x => x.name === name); if (e) { add('Name', e.name); add('Status', e.status); add('Type', e.type); add('Execute At', NW.fmt.date(e.executeAt)); add('Interval', e.intervalValue ? e.intervalValue + ' ' + e.intervalField : ''); add('Starts', NW.fmt.date(e.starts)); add('Ends', NW.fmt.date(e.ends)); add('Last Executed', NW.fmt.date(e.lastExecuted)); add('On Completion', e.onCompletion); add('Definer', e.definer); add('Comment', e.comment); } }
        else if (kind === 'query') { const q = (NW.connState(n.conn).queries || []).find(x => x.name === name); if (q) { add('Name', q.name); add('Database', q.db); add('Modified', NW.fmt.date(q.updated)); add('Created', NW.fmt.date(q.created)); } }
        body.appendChild(dl);
      } else {
        if (kind === 'query') { const q = (NW.connState(n.conn).queries || []).find(x => x.name === name); body.appendChild(h('pre', { text: q ? q.sql : '' })); return; }
        const pre = h('pre', { text: 'Loading…' }); body.appendChild(pre);
        const type = kind === 'routine' ? kindOf(name) : kind;
        NW.api('obj.ddl', { conn: n.conn, db: n.db, type, name }).then(r => { pre.textContent = r.ddl; }).catch(e => { pre.textContent = e.message; pre.className = 'err-text'; });
      }
    },
  };
  NW.Objects = Objects;
})();

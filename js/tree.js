/* Navicat Web - navigation pane: connections > databases > object folders > objects */
(function () {
  'use strict';
  const NW = window.NW, h = NW.h;

  const FOLDERS = [
    { kind: 'table', label: 'Tables', icon: 'table' },
    { kind: 'view', label: 'Views', icon: 'view' },
    { kind: 'routine', label: 'Functions', icon: 'function' },
    { kind: 'event', label: 'Events', icon: 'event' },
    { kind: 'query', label: 'Queries', icon: 'savedquery' },
  ];

  const Tree = {
    el: null, roots: [], byId: {}, selectedId: null, filter: '', loading: {},

    init(el) {
      this.el = el;
      el.addEventListener('click', e => this._onClick(e));
      el.addEventListener('dblclick', e => this._onDblClick(e));
      el.addEventListener('contextmenu', e => this._onContext(e));
      el.addEventListener('keydown', e => this._onKey(e));
      NW.$('#tree-filter').addEventListener('input', NW.debounce(e => { this.filter = e.target.value.trim().toLowerCase(); this.render(); }, 150));
      NW.bus.on('connections-changed', () => this.rebuild());
      NW.bus.on('objects-changed', d => this.refreshDatabase(d.conn, d.db, true));
      NW.bus.on('queries-changed', d => this._reloadQueries(d.conn));
      this.rebuild();
    },

    /* ---------------------------------------------------------- model */
    rebuild() {
      const expanded = {};
      Object.values(this.byId).forEach(n => { if (n.expanded) expanded[n.id] = true; });
      this.byId = {};
      this.roots = NW.state.connections.map(c => {
        const cs = NW.connState(c.id);
        const node = this._mk({ id: 'c:' + c.id, type: 'conn', conn: c.id, label: c.name, icon: 'mysql', expanded: expanded['c:' + c.id] || false, open: cs.open });
        if (cs.open) node.children = cs.databases.map(d => this._mkDb(c.id, d.name, expanded));
        return node;
      });
      this.render();
    },
    _mk(n) { n.children = n.children || []; this.byId[n.id] = n; return n; },
    _mkDb(connId, db, expanded) {
      const ds = NW.dbState(connId, db);
      const node = this._mk({ id: 'd:' + connId + '|' + db, type: 'db', conn: connId, db, label: db, icon: 'database', expanded: expanded['d:' + connId + '|' + db] || false, open: ds.open });
      if (ds.open && ds.objects) node.children = this._dbChildren(connId, db, ds.objects, expanded);
      return node;
    },
    _dbChildren(connId, db, objects, expanded) {
      expanded = expanded || {};
      return FOLDERS.map(f => {
        const fid = 'f:' + connId + '|' + db + '|' + f.kind;
        const items = this._folderItems(connId, db, f.kind, objects);
        const folder = this._mk({ id: fid, type: 'folder', kind: f.kind, conn: connId, db, label: f.label, icon: 'folder', expanded: expanded[fid] !== undefined ? expanded[fid] : f.kind === 'table', count: items.length });
        folder.children = items.map(it => this._mk(Object.assign({ id: 'o:' + connId + '|' + db + '|' + it.kind + '|' + it.name, type: 'obj', conn: connId, db }, it)));
        return folder;
      });
    },
    _folderItems(connId, db, kind, objects) {
      switch (kind) {
        case 'table': return (objects.tables || []).map(t => ({ kind: 'table', name: t.name, label: t.name, icon: 'table', data: t }));
        case 'view': return (objects.views || []).map(v => ({ kind: 'view', name: v.name, label: v.name, icon: 'view', data: v }));
        case 'routine': return (objects.routines || []).map(r => ({ kind: r.type === 'PROCEDURE' ? 'procedure' : 'function', name: r.name, label: r.name, icon: r.type === 'PROCEDURE' ? 'procedure' : 'function', data: r }));
        case 'event': return (objects.events || []).map(e => ({ kind: 'event', name: e.name, label: e.name, icon: 'event', data: e }));
        case 'query': return (NW.connState(connId).queries || []).filter(q => !q.db || q.db === db).map(q => ({ kind: 'query', name: q.name, label: q.name, icon: 'savedquery', data: q }));
      }
      return [];
    },
    node(id) { return this.byId[id] || null; },
    getSelected() { return this.selectedId ? this.byId[this.selectedId] : null; },
    visible() {
      const out = [];
      const f = this.filter;
      const walk = (n, lvl) => {
        let match = !f || n.label.toLowerCase().includes(f);
        let kids = [];
        if (n.children.length && (n.expanded || f)) kids = n.children.map(c => walk(c, lvl + 1)).filter(Boolean);
        if (f && !match && !kids.length) return null;
        return { n, lvl, kids: (n.expanded || f) ? kids : [] };
      };
      const flat = (v) => { out.push(v); v.kids.forEach(flat); };
      this.roots.forEach(r => { const v = walk(r, 0); if (v) flat(v); });
      return out;
    },

    /* ---------------------------------------------------------- rendering */
    render() {
      const el = this.el; if (!el) return;
      const vis = this.visible();
      if (!this.roots.length) {
        el.innerHTML = '<div class="tree-empty">No connections yet.<br>Click <b>Connection</b> in the toolbar to add a MySQL or MariaDB server.</div>';
        return;
      }
      let html = '';
      vis.forEach(({ n, lvl }) => {
        const hasKids = n.type !== 'obj' && (n.children.length > 0 || (n.type !== 'folder' && !n.open));
        const arrow = hasKids ? (n.expanded ? '▼' : '▶') : '';
        const closed = (n.type === 'conn' || n.type === 'db') && !n.open;
        const c = n.type === 'conn' ? NW.connById(n.conn) : null;
        const color = c && c.color ? '<span class="conn-color" style="background:' + NW.esc(c.color) + '"></span>' : '';
        const icon = n.type === 'folder' ? (n.expanded ? 'folder-open' : 'folder') : n.icon;
        html += '<div class="tree-node' + (n.id === this.selectedId ? ' selected' : '') + (closed ? ' closed' : '') + '" data-id="' + NW.esc(n.id) + '" style="--lvl:' + lvl + '" title="' + NW.esc(this._tooltip(n)) + '">'
          + '<span class="tree-arrow' + (hasKids ? '' : ' leaf') + '">' + arrow + '</span>' + color + '<span class="ico">' + NW.icon(icon) + '</span><span class="lbl">' + NW.esc(n.label) + '</span>'
          + (n.type === 'folder' ? '<span class="cnt">(' + n.count + ')</span>' : '')
          + (this.loading[n.id] ? '<span class="spin spinner" style="width:10px;height:10px;margin-left:4px"></span>' : '')
          + '</div>';
      });
      el.innerHTML = html;
    },
    _tooltip(n) {
      if (n.type === 'conn') { const c = NW.connById(n.conn); const cs = NW.connState(n.conn); return c ? c.user + '@' + c.host + ':' + c.port + (cs.version ? '  (MySQL ' + cs.version + ')' : '') : ''; }
      if (n.type === 'db') return n.db;
      if (n.type === 'obj' && n.kind === 'table' && n.data) return n.name + (n.data.rows !== null && n.data.rows !== undefined ? '  ' + NW.fmt.num(n.data.rows) + ' rows' : '') + (n.data.engine ? ', ' + n.data.engine : '') + (n.data.comment ? '\n' + n.data.comment : '');
      return n.label;
    },
    _setLoading(id, on) { if (on) this.loading[id] = true; else delete this.loading[id]; this.render(); },

    /* ---------------------------------------------------------- selection and navigation */
    select(id, opts) {
      opts = opts || {};
      this.selectedId = id;
      this.render();
      const node = this.byId[id];
      if (node && !opts.silent) {
        const elN = this.el.querySelector('.tree-node.selected'); if (elN) elN.scrollIntoView({ block: 'nearest' });
        if (NW.Objects) NW.Objects.show(node);
        this._updateStatus(node);
      }
    },
    _updateStatus(n) {
      if (!n) { NW.status.right(''); return; }
      const c = NW.connById(n.conn);
      NW.status.right(c ? (c.user + '@' + c.host + (n.db ? ' • ' + n.db : '')) : '');
    },
    async toggle(id) {
      const n = this.byId[id]; if (!n) return;
      if (n.type === 'conn' && !n.open) { await this.openConnection(n.conn); return; }
      if (n.type === 'db' && !n.open) { await this.openDatabase(n.conn, n.db); return; }
      n.expanded = !n.expanded;
      this.render();
    },
    expand(id) { const n = this.byId[id]; if (n) { n.expanded = true; this.render(); } },
    _expandParents(id) { /* make a node visible by expanding its ancestors */
      const parts = id.split('|');
      const connId = parts[0].slice(2);
      const c = this.byId['c:' + connId]; if (c) c.expanded = true;
      if (parts.length > 1) { const d = this.byId['d:' + connId + '|' + parts[1]]; if (d) d.expanded = true; }
      if (parts.length > 2) { const f = this.byId['f:' + connId + '|' + parts[1] + '|' + (parts[2] === 'function' || parts[2] === 'procedure' ? 'routine' : parts[2])]; if (f) f.expanded = true; }
    },

    /* ---------------------------------------------------------- connection / database lifecycle */
    async openConnection(connId, opts) {
      opts = opts || {};
      const id = 'c:' + connId;
      this._setLoading(id, true);
      try {
        const r = await NW.api('conn.open', { conn: connId });
        const cs = NW.connState(connId);
        cs.open = true; cs.version = r.version; cs.server = r.server; cs.databases = r.databases;
        if (!cs.queries) await this._loadQueries(connId);
        this._setLoading(id, false);
        this.rebuild();
        const n = this.byId[id]; if (n) { n.expanded = true; }
        this.render();
        if (!opts.silent) this.select(id);
        const c = NW.connById(connId);
        if (c && c.initialDb && cs.databases.some(d => d.name === c.initialDb)) this.openDatabase(connId, c.initialDb, { silent: true });
        return true;
      } catch (e) {
        this._setLoading(id, false);
        if (!opts.silent) NW.Dialog.error(e.message, 'Cannot connect to ' + NW.connName(connId));
        return false;
      }
    },
    closeConnection(connId) {
      const cs = NW.connState(connId);
      cs.open = false; cs.databases = []; cs.dbs = {}; cs.version = null; cs.server = null;
      const prefix = ['table:' + connId, 'design:' + connId, 'query:' + connId, 'view:' + connId, 'routine:' + connId, 'event:' + connId, 'monitor:' + connId, 'users:' + connId];
      NW.Tabs.list.slice().forEach(t => { if (prefix.some(p => t.id.startsWith(p + '/') || t.id === p)) NW.Tabs.close(t.id, true); });
      this.rebuild();
      this.select('c:' + connId);
    },
    async refreshConnection(connId) {
      const cs = NW.connState(connId);
      if (!cs.open) return this.openConnection(connId);
      const r = await NW.api('conn.open', { conn: connId });
      cs.version = r.version; cs.server = r.server; cs.databases = r.databases;
      Object.keys(cs.dbs).forEach(db => { if (!cs.databases.some(d => d.name === db)) delete cs.dbs[db]; });
      this.rebuild();
      NW.bus.emit('db-list-changed', { conn: connId });
    },
    async openDatabase(connId, db, opts) {
      opts = opts || {};
      const id = 'd:' + connId + '|' + db;
      this._setLoading(id, true);
      try {
        const r = await NW.api('db.objects', { conn: connId, db });
        const ds = NW.dbState(connId, db);
        ds.open = true; ds.objects = r; ds.loadedAt = Date.now();
        this._setLoading(id, false);
        this.rebuild();
        const n = this.byId[id]; if (n) { n.expanded = true; const c = this.byId['c:' + connId]; if (c) c.expanded = true; }
        this.render();
        if (!opts.silent) this.select(id);
        return true;
      } catch (e) {
        this._setLoading(id, false);
        if (!opts.silent) NW.Dialog.error(e.message, 'Cannot open database ' + db);
        return false;
      }
    },
    closeDatabase(connId, db) {
      const ds = NW.dbState(connId, db);
      ds.open = false; ds.objects = null;
      const key = connId + '/' + db + '/';
      NW.Tabs.list.slice().forEach(t => { if (t.id.includes(':' + key)) NW.Tabs.close(t.id, true); });
      this.rebuild();
      this.select('d:' + connId + '|' + db);
    },
    async ensureDbOpen(connId, db) {
      const cs = NW.connState(connId);
      if (!cs.open) { const ok = await this.openConnection(connId, { silent: true }); if (!ok) throw new Error('Cannot connect'); }
      const ds = NW.dbState(connId, db);
      if (!ds.open || !ds.objects) { const ok = await this.openDatabase(connId, db, { silent: true }); if (!ok) throw new Error('Cannot open database ' + db); }
      return NW.dbState(connId, db).objects;
    },
    async refreshDatabase(connId, db, keepSelection) {
      const ds = NW.dbState(connId, db);
      if (!ds.open) return;
      try {
        const r = await NW.api('db.objects', { conn: connId, db });
        ds.objects = r; ds.loadedAt = Date.now();
        this.rebuild();
        if (NW.Objects && NW.Objects.currentNode && NW.Objects.currentNode.conn === connId && NW.Objects.currentNode.db === db) {
          const n = this.byId[NW.Objects.currentNode.id] || this.byId['d:' + connId + '|' + db];
          if (n) NW.Objects.show(n);
        }
      } catch (e) { NW.Toast.err(e.message); }
    },
    async _loadQueries(connId) {
      try { const r = await NW.api('query.saved.list', { conn: connId }); NW.connState(connId).queries = r.queries; } catch (e) { NW.connState(connId).queries = []; }
    },
    async _reloadQueries(connId) { await this._loadQueries(connId); this.rebuild(); const sel = this.getSelected(); if (sel && sel.type === 'folder' && sel.kind === 'query' && NW.Objects) NW.Objects.show(this.byId[sel.id] || sel); },

    /* ---------------------------------------------------------- events */
    _nodeFromEvent(e) { const el = e.target.closest('.tree-node'); return el ? this.byId[el.dataset.id] : null; },
    _onClick(e) {
      const n = this._nodeFromEvent(e); if (!n) return;
      if (e.target.classList.contains('tree-arrow')) { this.toggle(n.id); return; }
      this.select(n.id);
    },
    _onDblClick(e) {
      const n = this._nodeFromEvent(e); if (!n) return;
      if (n.type === 'obj') this.openObject(n);
      else this.toggle(n.id);
    },
    _onKey(e) {
      const n = this.getSelected();
      const vis = this.visible().map(v => v.n);
      const i = n ? vis.indexOf(n) : -1;
      if (e.key === 'ArrowDown') { e.preventDefault(); if (vis[i + 1]) this.select(vis[i + 1].id); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); if (vis[i - 1]) this.select(vis[i - 1].id); }
      else if (e.key === 'ArrowRight' && n) { e.preventDefault(); if (!n.expanded) this.toggle(n.id); }
      else if (e.key === 'ArrowLeft' && n) { e.preventDefault(); if (n.expanded) { n.expanded = false; this.render(); } }
      else if (e.key === 'Enter' && n) { e.preventDefault(); if (n.type === 'obj') this.openObject(n); else this.toggle(n.id); }
      else if (e.key === 'F5' && n) { e.preventDefault(); this.refreshNode(n); }
      else if (e.key === 'Delete' && n) { e.preventDefault(); this.deleteNode(n); }
    },
    _onContext(e) {
      e.preventDefault();
      const n = this._nodeFromEvent(e);
      if (n) this.select(n.id);
      NW.Menu.show(this.menuFor(n), e.clientX, e.clientY);
    },

    openObject(n) {
      switch (n.kind) {
        case 'table': return NW.TableTab.open({ conn: n.conn, db: n.db, table: n.name });
        case 'view': return NW.TableTab.open({ conn: n.conn, db: n.db, table: n.name, isView: true });
        case 'function': case 'procedure': return NW.Tools.routineDesigner({ conn: n.conn, db: n.db, name: n.name, type: n.kind });
        case 'event': return NW.Tools.eventDesigner({ conn: n.conn, db: n.db, name: n.name });
        case 'query': return NW.Query.open({ conn: n.conn, db: n.data.db || n.db, sql: n.data.sql, name: n.data.name, savedId: n.data.id });
      }
    },
    designObject(n) {
      switch (n.kind) {
        case 'table': return NW.Designer.open({ conn: n.conn, db: n.db, table: n.name });
        case 'view': return NW.Tools.viewDesigner({ conn: n.conn, db: n.db, name: n.name });
        default: return this.openObject(n);
      }
    },
    refreshNode(n) {
      if (!n) return;
      if (n.type === 'conn') return this.refreshConnection(n.conn);
      if (n.db) return this.refreshDatabase(n.conn, n.db);
    },
    async deleteNode(n) {
      if (!n) return;
      if (n.type === 'conn') return NW.Connection.remove(n.conn);
      if (n.type === 'db') return NW.Tools.dropDatabase(n.conn, n.db);
      if (n.type === 'obj') return NW.Tools.dropObject(n.conn, n.db, n.kind, [n.name], n.data);
    },

    /* ---------------------------------------------------------- context menus */
    menuFor(n) {
      if (!n) return [
        { label: 'New Connection...', icon: 'mysql', onClick: () => NW.Connection.dialog() },
        '-',
        { label: 'Refresh', icon: 'refresh', onClick: () => NW.App.reloadConnections() },
      ];
      const conn = n.conn, db = n.db;
      const cs = NW.connState(conn);
      if (n.type === 'conn') {
        return [
          cs.open ? { label: 'Close Connection', onClick: () => this.closeConnection(conn) } : { label: 'Open Connection', onClick: () => this.openConnection(conn) },
          { label: 'Edit Connection...', icon: 'design', onClick: () => NW.Connection.dialog(NW.connById(conn)) },
          { label: 'New Connection...', icon: 'mysql', onClick: () => NW.Connection.dialog() },
          { label: 'Duplicate Connection', onClick: () => NW.Connection.duplicate(conn) },
          { label: 'Delete Connection', icon: 'delete', onClick: () => NW.Connection.remove(conn) },
          '-',
          { label: 'New Database...', icon: 'database', disabled: !cs.open, onClick: () => NW.Tools.newDatabase(conn) },
          { label: 'New Query', icon: 'query', disabled: !cs.open, onClick: () => NW.Query.open({ conn, db: null }) },
          '-',
          { label: 'Execute SQL File...', icon: 'import', disabled: !cs.open, onClick: () => NW.Tools.executeSqlFile({ conn, db: null }) },
          { label: 'Dump SQL File...', icon: 'backup', disabled: !cs.open, onClick: () => NW.Tools.dumpDialog({ conn, db: null }) },
          '-',
          { label: 'Server Monitor', icon: 'monitor', disabled: !cs.open, onClick: () => NW.Tools.serverMonitor(conn) },
          { label: 'Manage Users', icon: 'users', disabled: !cs.open, onClick: () => NW.Tools.users(conn) },
          { label: 'Server Information', icon: 'info', disabled: !cs.open, onClick: () => NW.Tools.serverInfo(conn) },
          '-',
          { label: 'Refresh', icon: 'refresh', shortcut: 'F5', disabled: !cs.open, onClick: () => this.refreshConnection(conn) },
        ];
      }
      if (n.type === 'db') {
        const ds = NW.dbState(conn, db);
        return [
          ds.open ? { label: 'Close Database', onClick: () => this.closeDatabase(conn, db) } : { label: 'Open Database', onClick: () => this.openDatabase(conn, db) },
          { label: 'Edit Database...', icon: 'design', onClick: () => NW.Tools.editDatabase(conn, db) },
          { label: 'New Database...', icon: 'database', onClick: () => NW.Tools.newDatabase(conn) },
          { label: 'Delete Database', icon: 'delete', onClick: () => NW.Tools.dropDatabase(conn, db) },
          '-',
          { label: 'New Table', icon: 'table', onClick: () => NW.Designer.open({ conn, db }) },
          { label: 'New View', icon: 'view', onClick: () => NW.Tools.viewDesigner({ conn, db }) },
          { label: 'New Function', icon: 'function', onClick: () => NW.Tools.routineDesigner({ conn, db }) },
          { label: 'New Event', icon: 'event', onClick: () => NW.Tools.eventDesigner({ conn, db }) },
          { label: 'New Query', icon: 'query', onClick: () => NW.Query.open({ conn, db }) },
          '-',
          { label: 'Execute SQL File...', icon: 'import', onClick: () => NW.Tools.executeSqlFile({ conn, db }) },
          { label: 'Dump SQL File...', icon: 'backup', children: [
            { label: 'Structure and Data...', onClick: () => NW.Tools.dumpDialog({ conn, db, data: true }) },
            { label: 'Structure Only...', onClick: () => NW.Tools.dumpDialog({ conn, db, data: false }) },
          ] },
          '-',
          { label: 'Object Information', icon: 'info', onClick: () => NW.Tools.databaseInfo(conn, db) },
          { label: 'Refresh', icon: 'refresh', shortcut: 'F5', onClick: () => this.refreshDatabase(conn, db) },
        ];
      }
      if (n.type === 'folder') {
        const items = [];
        const newItem = { table: { label: 'New Table', icon: 'table', fn: () => NW.Designer.open({ conn, db }) }, view: { label: 'New View', icon: 'view', fn: () => NW.Tools.viewDesigner({ conn, db }) },
          routine: { label: 'New Function', icon: 'function', fn: () => NW.Tools.routineDesigner({ conn, db }) }, event: { label: 'New Event', icon: 'event', fn: () => NW.Tools.eventDesigner({ conn, db }) }, query: { label: 'New Query', icon: 'query', fn: () => NW.Query.open({ conn, db }) } }[n.kind];
        items.push({ label: newItem.label, icon: newItem.icon, onClick: newItem.fn });
        if (n.kind === 'table') { items.push('-'); items.push({ label: 'Import Wizard...', icon: 'import', onClick: () => NW.Tools.importWizard({ conn, db }) }); items.push({ label: 'Export Wizard...', icon: 'export', onClick: () => NW.Tools.dumpDialog({ conn, db, data: true }) }); items.push({ label: 'Execute SQL File...', onClick: () => NW.Tools.executeSqlFile({ conn, db }) }); }
        items.push('-');
        items.push({ label: 'Refresh', icon: 'refresh', shortcut: 'F5', onClick: () => n.kind === 'query' ? this._reloadQueries(conn) : this.refreshDatabase(conn, db) });
        return items;
      }
      /* objects */
      const name = n.name;
      const base = [];
      if (n.kind === 'table') {
        base.push({ label: 'Open Table', icon: 'open', onClick: () => this.openObject(n) });
        base.push({ label: 'Design Table', icon: 'design', onClick: () => this.designObject(n) });
        base.push({ label: 'New Table', icon: 'table', onClick: () => NW.Designer.open({ conn, db }) });
        base.push({ label: 'Delete Table', icon: 'delete', onClick: () => this.deleteNode(n) });
        base.push({ label: 'Empty Table', onClick: () => NW.Tools.emptyTable(conn, db, name, false) });
        base.push({ label: 'Truncate Table', onClick: () => NW.Tools.emptyTable(conn, db, name, true) });
        base.push({ label: 'Duplicate Table...', children: [
          { label: 'Structure and Data', onClick: () => NW.Tools.duplicateTable(conn, db, name, true) },
          { label: 'Structure Only', onClick: () => NW.Tools.duplicateTable(conn, db, name, false) },
        ] });
        base.push({ label: 'Rename', onClick: () => NW.Tools.renameTable(conn, db, name) });
        base.push('-');
        base.push({ label: 'Import Wizard...', icon: 'import', onClick: () => NW.Tools.importWizard({ conn, db, table: name }) });
        base.push({ label: 'Export Wizard...', icon: 'export', onClick: () => NW.ExportWizard.open({ conn, db, table: name }) });
        base.push({ label: 'Dump SQL File', icon: 'backup', children: [
          { label: 'Structure and Data...', onClick: () => NW.Tools.dumpDialog({ conn, db, tables: [name], data: true }) },
          { label: 'Structure Only...', onClick: () => NW.Tools.dumpDialog({ conn, db, tables: [name], data: false }) },
        ] });
        base.push('-');
        base.push({ label: 'Maintain', children: ['ANALYZE', 'CHECK', 'OPTIMIZE', 'REPAIR', 'CHECKSUM'].map(op => ({ label: op.charAt(0) + op.slice(1).toLowerCase() + ' Table', onClick: () => NW.Tools.maintain({ conn, db, tables: [name], op }) })) });
        base.push({ label: 'Copy Name', icon: 'copy', onClick: () => NW.copyText(name) });
        base.push({ label: 'Object Information', icon: 'info', onClick: () => NW.Tools.objectInfo({ conn, db, type: 'table', name }) });
      } else if (n.kind === 'view') {
        base.push({ label: 'Open View', icon: 'open', onClick: () => this.openObject(n) });
        base.push({ label: 'Design View', icon: 'design', onClick: () => this.designObject(n) });
        base.push({ label: 'New View', icon: 'view', onClick: () => NW.Tools.viewDesigner({ conn, db }) });
        base.push({ label: 'Delete View', icon: 'delete', onClick: () => this.deleteNode(n) });
        base.push('-');
        base.push({ label: 'Export Wizard...', icon: 'export', onClick: () => NW.ExportWizard.open({ conn, db, table: name }) });
        base.push({ label: 'Dump SQL File...', icon: 'backup', onClick: () => NW.Tools.dumpDialog({ conn, db, views: [name], tables: [], data: false }) });
        base.push({ label: 'Copy Name', icon: 'copy', onClick: () => NW.copyText(name) });
        base.push({ label: 'Object Information', icon: 'info', onClick: () => NW.Tools.objectInfo({ conn, db, type: 'view', name }) });
      } else if (n.kind === 'function' || n.kind === 'procedure') {
        base.push({ label: 'Design ' + (n.kind === 'procedure' ? 'Procedure' : 'Function'), icon: 'design', onClick: () => this.openObject(n) });
        base.push({ label: 'Run ' + (n.kind === 'procedure' ? 'Procedure' : 'Function') + '...', icon: 'run', onClick: () => NW.Tools.runRoutine({ conn, db, name, type: n.kind }) });
        base.push({ label: 'New Function', icon: 'function', onClick: () => NW.Tools.routineDesigner({ conn, db }) });
        base.push({ label: 'Delete ' + (n.kind === 'procedure' ? 'Procedure' : 'Function'), icon: 'delete', onClick: () => this.deleteNode(n) });
        base.push('-');
        base.push({ label: 'Dump SQL File...', icon: 'backup', onClick: () => NW.Tools.dumpDialog({ conn, db, tables: [], [n.kind === 'procedure' ? 'procedures' : 'functions']: [name], data: false }) });
        base.push({ label: 'Copy Name', icon: 'copy', onClick: () => NW.copyText(name) });
        base.push({ label: 'Object Information', icon: 'info', onClick: () => NW.Tools.objectInfo({ conn, db, type: n.kind, name }) });
      } else if (n.kind === 'event') {
        base.push({ label: 'Design Event', icon: 'design', onClick: () => this.openObject(n) });
        base.push({ label: 'New Event', icon: 'event', onClick: () => NW.Tools.eventDesigner({ conn, db }) });
        base.push({ label: 'Delete Event', icon: 'delete', onClick: () => this.deleteNode(n) });
        base.push('-');
        base.push({ label: n.data && n.data.status === 'ENABLED' ? 'Disable Event' : 'Enable Event', onClick: () => NW.Tools.toggleEvent(conn, db, name, !(n.data && n.data.status === 'ENABLED')) });
        base.push({ label: 'Copy Name', icon: 'copy', onClick: () => NW.copyText(name) });
        base.push({ label: 'Object Information', icon: 'info', onClick: () => NW.Tools.objectInfo({ conn, db, type: 'event', name }) });
      } else if (n.kind === 'query') {
        base.push({ label: 'Open Query', icon: 'open', onClick: () => this.openObject(n) });
        base.push({ label: 'New Query', icon: 'query', onClick: () => NW.Query.open({ conn, db }) });
        base.push({ label: 'Rename', onClick: () => NW.Tools.renameQuery(n.data) });
        base.push({ label: 'Delete Query', icon: 'delete', onClick: () => NW.Tools.deleteQuery(n.data) });
      }
      base.push('-');
      base.push({ label: 'Refresh', icon: 'refresh', shortcut: 'F5', onClick: () => n.kind === 'query' ? this._reloadQueries(conn) : this.refreshDatabase(conn, db) });
      return base;
    },
  };
  NW.Tree = Tree;
})();

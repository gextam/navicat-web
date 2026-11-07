/* Navicat Web - tools: database dialogs, object actions, server monitor, users, dump, execute SQL file,
   import wizard, view / function / event designers, options */
(function () {
  'use strict';
  const NW = window.NW, h = NW.h;
  const cache = { charsets: {}, columns: {} };

  async function runDdl(conn, db, statements, busyText) {
    const r = await NW.busy(NW.api('ddl.run', { conn, db: db || '', statements }), busyText || 'Executing…');
    if (r.failedIndex !== null && r.failedIndex !== undefined) {
      const err = r.results.find(x => x.type === 'error');
      throw new Error((err ? err.error : 'Unknown error') + '\n\nStatement:\n' + statements[r.failedIndex]);
    }
    return r;
  }
  const userLit = (u, hst) => NW.qs(u) + '@' + NW.qs(hst || '%');
  const definerLit = d => { if (!d) return ''; const m = /^`?([^`@]*)`?@`?([^`]*)`?$/.exec(d.trim()); return m ? NW.qi(m[1]) + '@' + NW.qi(m[2]) : d; };
  const fmtUptime = s => { s = +s || 0; const d = Math.floor(s / 86400), hh = Math.floor(s % 86400 / 3600), mm = Math.floor(s % 3600 / 60); return (d ? d + 'd ' : '') + hh + 'h ' + mm + 'm'; };
  function resultGrid(container, result, opts) {
    const grid = new NW.DataGrid(container, Object.assign({ clientSort: true }, opts || {}));
    if (result && result.type === 'rows') grid.setData(result.fields, result.rows); else grid.setData([], []);
    return grid;
  }
  function panelTab(id, title, icon, ctx, build) {
    return NW.Tabs.open({ id, title, icon, ctx, create: (el, tab) => { const box = h('div', { class: 'panel' }); el.appendChild(box); return build(box, tab) || {}; } });
  }

  const Tools = {
    /* ---------------------------------------------------------- cached metadata */
    async charsets(conn) {
      if (!cache.charsets[conn]) cache.charsets[conn] = NW.api('db.charsets', { conn }).catch(() => ({ charsets: [], collations: [], engines: [] }));
      return cache.charsets[conn];
    },
    async columnsOf(conn, db) {
      const k = conn + '|' + db;
      if (!cache.columns[k] || Date.now() - cache.columns[k].at > 60000) cache.columns[k] = { at: Date.now(), p: NW.api('db.columns', { conn, db }).then(r => r.tables).catch(() => ({})) };
      return cache.columns[k].p;
    },

    /* ---------------------------------------------------------- databases */
    async newDatabase(conn) {
      const cs = await this.charsets(conn);
      const name = h('input', { class: 'inp', autofocus: true });
      const coll = NW.select([''].concat(cs.collations.filter(x => x.Charset === 'utf8mb4').map(x => x.Collation)), '');
      const chs = NW.select([''].concat(cs.charsets.map(x => x.Charset)), 'utf8mb4', { onchange: () => { coll.innerHTML = ''; [''].concat(cs.collations.filter(x => x.Charset === chs.value).map(x => x.Collation)).forEach(c => coll.appendChild(h('option', { value: c, text: c || '(default)' }))); } });
      const r = await NW.Dialog.open({ title: 'New Database', icon: 'database', width: 460, body: h('div', { class: 'form-grid' }, ...NW.formRow('Database Name:', name), ...NW.formRow('Character set:', chs), ...NW.formRow('Collation:', coll)),
        buttons: [{ label: 'OK', primary: true, onClick: async () => { if (!name.value.trim()) throw new Error('Enter a database name.'); await NW.api('db.create', { conn, name: name.value.trim(), charset: chs.value, collation: coll.value }); return name.value.trim(); } }, { label: 'Cancel', value: null }] }).promise;
      if (typeof r === 'string') { NW.Toast.ok('Database ' + r + ' created'); await NW.Tree.refreshConnection(conn); NW.Tree.openDatabase(conn, r); }
    },
    async editDatabase(conn, db) {
      const cs = await this.charsets(conn);
      const info = (NW.connState(conn).databases || []).find(d => d.name === db) || {};
      const coll = NW.select(cs.collations.filter(x => x.Charset === (info.charset || 'utf8mb4')).map(x => x.Collation), info.collation || '');
      const chs = NW.select(cs.charsets.map(x => x.Charset), info.charset || 'utf8mb4', { onchange: () => { coll.innerHTML = ''; cs.collations.filter(x => x.Charset === chs.value).forEach(c => coll.appendChild(h('option', { value: c.Collation, text: c.Collation, selected: c.Default === 'Yes' }))); } });
      const r = await NW.Dialog.open({ title: 'Edit Database - ' + db, icon: 'database', width: 460, body: h('div', { class: 'form-grid' }, ...NW.formRow('Database Name:', h('input', { class: 'inp', value: db, disabled: true })), ...NW.formRow('Character set:', chs), ...NW.formRow('Collation:', coll)),
        buttons: [{ label: 'OK', primary: true, onClick: async () => { await NW.api('db.alter', { conn, name: db, charset: chs.value, collation: coll.value }); return true; } }, { label: 'Cancel', value: null }] }).promise;
      if (r === true) { NW.Toast.ok('Database updated'); NW.Tree.refreshConnection(conn); }
    },
    async dropDatabase(conn, db) {
      const typed = await NW.Dialog.prompt({ title: 'Delete Database', label: 'This permanently deletes the database "' + db + '" and ALL of its tables. Type the database name to confirm:', validate: v => v === db ? '' : 'Type exactly: ' + db, ok: 'Delete' });
      if (typed !== db) return;
      try { await NW.busy(NW.api('db.drop', { conn, name: db }), 'Dropping database…'); NW.Tree.closeDatabase(conn, db); await NW.Tree.refreshConnection(conn); NW.Tree.select('c:' + conn); NW.Toast.ok('Database ' + db + ' deleted'); }
      catch (e) { NW.Dialog.error(e.message, 'Delete Database'); }
    },
    async databaseInfo(conn, db) {
      const objects = await NW.Tree.ensureDbOpen(conn, db);
      const info = (NW.connState(conn).databases || []).find(d => d.name === db) || {};
      const size = objects.tables.reduce((a, t) => a + t.dataLength + t.indexLength, 0);
      const rows = objects.tables.reduce((a, t) => a + (t.rows || 0), 0);
      const dl = h('dl', { class: 'kv' });
      [['Name', db], ['Character set', info.charset], ['Collation', info.collation], ['Tables', objects.tables.length], ['Views', objects.views.length], ['Functions / Procedures', objects.routines.length], ['Events', objects.events.length], ['Triggers', objects.triggers.length], ['Estimated rows', NW.fmt.num(rows)], ['Size (data + index)', NW.fmt.bytes(size)]].forEach(([k, v]) => { dl.append(h('dt', { text: k }), h('dd', { text: v === undefined || v === null ? '' : String(v) })); });
      NW.Dialog.open({ title: 'Database Information - ' + db, icon: 'info', body: dl, width: 420, buttons: [{ label: 'Close', value: null }] });
    },

    /* ---------------------------------------------------------- object actions */
    async dropObject(conn, db, kind, names) {
      if (!names || !names.length) return;
      const objects = NW.dbState(conn, db).objects || {};
      const typeOf = n => { if (kind === 'routine' || kind === 'function' || kind === 'procedure') { const r = (objects.routines || []).find(x => x.name === n); return r && r.type === 'PROCEDURE' ? 'procedure' : (kind === 'routine' ? 'function' : kind); } return kind; };
      const label = names.length === 1 ? typeOf(names[0]) + ' "' + names[0] + '"' : names.length + ' objects';
      if (!(await NW.Dialog.confirm('Delete ' + label + '?' + (kind === 'table' ? '\nAll data in the table will be lost.' : ''), { title: 'Confirm Delete', ok: 'Delete', danger: true }))) return;
      try {
        for (const n of names) {
          const type = typeOf(n);
          await NW.api('obj.drop', { conn, db, type, name: n });
          NW.Tabs.close('table:' + conn + '/' + db + '/' + n, true);
          NW.Tabs.close('design:' + conn + '/' + db + '/' + n, true);
          NW.Tabs.close('view:' + conn + '/' + db + '/' + n, true);
          NW.Tabs.close('routine:' + conn + '/' + db + '/' + n, true);
          NW.Tabs.close('event:' + conn + '/' + db + '/' + n, true);
        }
        NW.Toast.ok(label + ' deleted');
        NW.bus.emit('objects-changed', { conn, db });
      } catch (e) { NW.Dialog.error(e.message, 'Delete failed'); NW.bus.emit('objects-changed', { conn, db }); }
    },
    async emptyTable(conn, db, name, truncate) {
      if (!(await NW.Dialog.confirm((truncate ? 'Truncate' : 'Empty') + ' table "' + name + '"?\nAll records will be deleted.' + (truncate ? ' The auto-increment counter is reset.' : ''), { title: 'Confirm', ok: truncate ? 'Truncate' : 'Empty', danger: true }))) return;
      try {
        await NW.busy(NW.api(truncate ? 'table.truncate' : 'table.empty', { conn, db, table: name }), 'Deleting records…');
        NW.Toast.ok('Table ' + name + ' emptied');
        const t = NW.Tabs.get('table:' + conn + '/' + db + '/' + name); if (t && t.ctl.load) t.ctl.load({ force: true });
        NW.bus.emit('objects-changed', { conn, db });
      } catch (e) { NW.Dialog.error(e.message); }
    },
    async duplicateTable(conn, db, name, withData) {
      const n = await NW.Dialog.prompt({ title: 'Duplicate Table', label: 'Name of the new table:', value: name + '_copy', validate: v => v.trim() ? '' : 'Required' });
      if (!n) return;
      try { await NW.busy(NW.api('table.duplicate', { conn, db, table: name, newName: n.trim(), withData }), 'Copying table…'); NW.Toast.ok('Table ' + n + ' created'); NW.bus.emit('objects-changed', { conn, db }); }
      catch (e) { NW.Dialog.error(e.message); }
    },
    async renameTable(conn, db, name) {
      const n = await NW.Dialog.prompt({ title: 'Rename Table', label: 'New name:', value: name, validate: v => v.trim() ? '' : 'Required' });
      if (!n || n.trim() === name) return;
      try { await NW.api('table.rename', { conn, db, table: name, newName: n.trim() }); NW.Tabs.close('table:' + conn + '/' + db + '/' + name, true); NW.Tabs.close('design:' + conn + '/' + db + '/' + name, true); NW.Toast.ok('Renamed to ' + n); NW.bus.emit('objects-changed', { conn, db }); }
      catch (e) { NW.Dialog.error(e.message); }
    },
    async maintain(o) {
      try {
        const r = await NW.busy(NW.api('table.maintain', { conn: o.conn, db: o.db, tables: o.tables, op: o.op }), o.op + ' running…');
        const box = h('div', { style: 'height:260px;display:flex;flex-direction:column' });
        const dlg = NW.Dialog.open({ title: o.op.charAt(0) + o.op.slice(1).toLowerCase() + ' Table', icon: 'info', body: box, width: 700, buttons: [{ label: 'Close', value: null }] });
        resultGrid(box, r.results.find(x => x.type === 'rows') || r.results[0]);
        if (o.op === 'OPTIMIZE' || o.op === 'REPAIR') NW.bus.emit('objects-changed', { conn: o.conn, db: o.db });
        return dlg;
      } catch (e) { NW.Dialog.error(e.message); }
    },
    async objectInfo(o) {
      const objects = NW.dbState(o.conn, o.db).objects || {};
      const dl = h('dl', { class: 'kv' });
      const add = (k, v) => { if (v === null || v === undefined || v === '') return; dl.append(h('dt', { text: k }), h('dd', { text: String(v) })); };
      let src = null;
      if (o.type === 'table') src = (objects.tables || []).find(x => x.name === o.name);
      else if (o.type === 'view') src = (objects.views || []).find(x => x.name === o.name);
      else if (o.type === 'event') src = (objects.events || []).find(x => x.name === o.name);
      else src = (objects.routines || []).find(x => x.name === o.name);
      if (src) Object.keys(src).forEach(k => add(k.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase()), /Length/i.test(k) ? NW.fmt.bytes(src[k]) : src[k]));
      const tabs = NW.subTabs([{ id: 'general', label: 'General' }, { id: 'ddl', label: 'DDL' }], { cls: 'dtabs', tabCls: 'dtab', panelCls: 'dpanel' });
      tabs.panels.general.appendChild(dl);
      const pre = h('pre', { class: 'hexview', style: 'max-height:50vh', text: 'Loading…' });
      tabs.panels.ddl.appendChild(pre);
      tabs.el.style.minHeight = '300px';
      NW.api('obj.ddl', { conn: o.conn, db: o.db, type: o.type, name: o.name }).then(r => pre.textContent = r.ddl).catch(e => pre.textContent = e.message);
      NW.Dialog.open({ title: 'Object Information - ' + o.name, icon: 'info', body: tabs.el, width: 640, buttons: [{ label: 'Close', value: null }] });
    },
    async toggleEvent(conn, db, name, enable) {
      try { await runDdl(conn, db, ['ALTER EVENT ' + NW.qname(db, name) + (enable ? ' ENABLE' : ' DISABLE')]); NW.Toast.ok('Event ' + (enable ? 'enabled' : 'disabled')); NW.bus.emit('objects-changed', { conn, db }); }
      catch (e) { NW.Dialog.error(e.message); }
    },
    async runRoutine(o) {
      try {
        const r = await NW.api('obj.ddl', { conn: o.conn, db: o.db, type: o.type, name: o.name });
        const params = ((r.info && r.info.params) || []).filter(p => p.name && p.mode !== 'OUT');
        const inputs = params.map(p => h('input', { class: 'inp', placeholder: p.type }));
        const sqlFor = () => { const args = inputs.map((inp, i) => { const v = inp.value; if (v === '') return 'NULL'; if (/^-?\d+(\.\d+)?$/.test(v) || /^(NULL|TRUE|FALSE|NOW\(\)|CURDATE\(\))$/i.test(v)) return v; return NW.qs(v); }).join(', '); return o.type === 'procedure' ? 'CALL ' + NW.qname(o.db, o.name) + '(' + args + ');' : 'SELECT ' + NW.qname(o.db, o.name) + '(' + args + ') AS result;'; };
        const go = () => NW.Query.open({ conn: o.conn, db: o.db, sql: sqlFor(), autoRun: true });
        if (!params.length) { go(); return; }
        const g = h('div', { class: 'form-grid' });
        params.forEach((p, i) => g.append(...NW.formRow(p.name + ' (' + p.mode + '):', inputs[i], p.type)));
        NW.Dialog.open({ title: 'Run ' + o.name, icon: 'run', body: h('div', null, h('p', { class: 'muted small', text: 'Enter the parameter values. Numbers and NULL are used as typed; other values are quoted.' }), g), width: 480, buttons: [{ label: 'Run', primary: true, onClick: () => { go(); } }, { label: 'Cancel', value: null }] });
      } catch (e) { NW.Dialog.error(e.message); }
    },
    async renameQuery(q) {
      const n = await NW.Dialog.prompt({ title: 'Rename Query', label: 'New name:', value: q.name, validate: v => v.trim() ? '' : 'Required' });
      if (!n || n.trim() === q.name) return;
      try { await NW.api('query.saved.save', { id: q.id, conn: q.conn, db: q.db || '', name: n.trim(), sql: q.sql }); NW.bus.emit('queries-changed', { conn: q.conn }); const t = NW.Tabs.get('query:' + q.conn + '/saved/' + q.id); if (t) { t.ctl.name = n.trim(); t.ctl._updateTitle(); } }
      catch (e) { NW.Dialog.error(e.message); }
    },
    async deleteQuery(q) {
      if (!(await NW.Dialog.confirm('Delete saved query "' + q.name + '"?', { title: 'Delete Query', ok: 'Delete', danger: true }))) return;
      await NW.api('query.saved.delete', { id: q.id });
      NW.Tabs.close('query:' + q.conn + '/saved/' + q.id, true);
      NW.bus.emit('queries-changed', { conn: q.conn });
    },
    async savedQueries(conn) {
      const r = await NW.api('query.saved.list', { conn });
      const list = h('div', { class: 'listbox', style: 'height:320px' });
      let sel = null;
      const render = () => { list.innerHTML = ''; if (!r.queries.length) list.appendChild(h('div', { class: 'obj-empty muted', text: 'No saved queries for this connection. Use Save in a query tab.' })); r.queries.forEach(q => list.appendChild(h('div', { class: 'li' + (sel === q ? ' selected' : ''), onclick: () => { sel = q; render(); }, ondblclick: () => { open(q); dlg.close(); } }, NW.svg('savedquery'), h('span', { style: 'flex:1', text: q.name }), h('span', { class: 'muted small', text: (q.db || '') + '  ' + NW.fmt.date(q.updated) })))); };
      const open = q => NW.Query.open({ conn, db: q.db || null, sql: q.sql, name: q.name, savedId: q.id });
      render();
      const dlg = NW.Dialog.open({ title: 'Saved Queries - ' + NW.connName(conn), icon: 'savedquery', body: list, width: 560, buttons: [{ label: 'Open', primary: true, onClick: () => { if (!sel) throw new Error('Select a query.'); open(sel); } }, { label: 'Delete', onClick: async () => { if (!sel) throw new Error('Select a query.'); await this.deleteQuery(sel); r.queries = r.queries.filter(x => x !== sel); sel = null; render(); return false; }, keep: true }, { label: 'Close', value: null }] });
    },

    /* ---------------------------------------------------------- server */
    async serverInfo(conn) {
      try {
        const r = await NW.api('server.info', { conn }); const i = r.info;
        const dl = h('dl', { class: 'info-grid' });
        [['Server version', i.version + (i.comment ? ' (' + i.comment + ')' : '')], ['Host name', i.hostname], ['Port', i.port], ['Connected via', i.hostInfo], ['Protocol version', i.protocol], ['Client library', i.clientInfo], ['Uptime', i.uptime !== null && i.uptime !== undefined ? fmtUptime(i.uptime) : ''], ['Threads connected', i.threads], ['Questions', i.questions !== null ? NW.fmt.num(i.questions) : ''], ['Server character set', i.charset], ['Server collation', i.collation], ['lower_case_table_names', i.lctn], ['max_allowed_packet', NW.fmt.bytes(i.maxPacket)], ['Event scheduler', i.eventScheduler], ['sql_mode', i.sqlMode]].forEach(([k, v]) => dl.append(h('dt', { text: k }), h('dd', { text: v === null || v === undefined ? '' : String(v) })));
        NW.Dialog.open({ title: 'Server Information - ' + NW.connName(conn), icon: 'server', body: dl, width: 640, buttons: [{ label: 'Close', value: null }] });
      } catch (e) { NW.Dialog.error(e.message); }
    },
    serverMonitor(conn) {
      return panelTab('monitor:' + conn, 'Server Monitor (' + NW.connName(conn) + ')', 'monitor', { conn, db: null }, (box) => {
        let show = () => { };
        const tabs = NW.subTabs([{ id: 'proc', label: 'Process List' }, { id: 'vars', label: 'Variables' }, { id: 'status', label: 'Status' }, { id: 'info', label: 'Information' }], { onShow: id => show(id) });
        box.appendChild(tabs.el);
        const state = { timer: null, grids: {} };
        /* process list */
        const pp = tabs.panels.proc;
        const auto = h('input', { type: 'checkbox', onchange: () => { clearInterval(state.timer); state.timer = null; if (auto.checked) state.timer = setInterval(() => loadProc(), 5000); } });
        const procBar = h('div', { class: 'subbar' }, h('button', { class: 'sb-btn', onclick: () => loadProc() }, NW.svg('refresh'), 'Refresh'), h('button', { class: 'sb-btn', onclick: () => kill() }, NW.svg('kill'), 'Kill Process'), h('div', { class: 'sb-sep' }), h('label', { class: 'chk' }, auto, 'Auto refresh (5 s)'), h('div', { class: 'sb-spacer' }), state.procInfo = h('span', { class: 'sb-label' }));
        const procGrid = h('div', { style: 'flex:1;display:flex;flex-direction:column;min-height:0' });
        pp.append(procBar, procGrid);
        const pg = new NW.DataGrid(procGrid, { clientSort: true, onCellContext: (r, c, e) => NW.Menu.show([{ label: 'Kill Process', icon: 'kill', onClick: () => kill() }, { label: 'Copy', icon: 'copy', onClick: () => NW.copyText(pg.copySelection()) }, { label: 'View Cell Value...', onClick: () => NW.CellViewer.open({ value: pg.rows[r][c], col: pg.cols[c], readOnly: true }) }], e.clientX, e.clientY), onCellDblClick: (r, c) => { NW.CellViewer.open({ value: pg.rows[r][c], col: pg.cols[c], readOnly: true }); return true; } });
        const loadProc = async () => { try { const r = await NW.api('server.processes', { conn }); const res = r.results[0]; if (res.type === 'rows') { pg.setData(res.fields, res.rows, true); state.procInfo.textContent = res.count + ' process(es) • ' + new Date().toLocaleTimeString(); } } catch (e) { state.procInfo.textContent = e.message; } };
        const kill = async () => { const rows = pg.getSelectedRows(); if (!rows.length) { NW.Toast.warn('Select a process first.'); return; } const idIdx = pg.cols.findIndex(c => c.name.toLowerCase() === 'id'); const ids = rows.map(r => pg.rows[r][idIdx]); if (!(await NW.Dialog.confirm('Kill process ' + ids.join(', ') + '?', { ok: 'Kill', danger: true }))) return; for (const id of ids) { try { await NW.api('server.kill', { conn, id }); } catch (e) { NW.Toast.err(e.message); } } loadProc(); };
        /* variables & status */
        const mkList = (panel, action) => {
          const scope = NW.select([{ value: '1', label: 'Global' }, { value: '0', label: 'Session' }], '1', { style: 'width:110px', onchange: () => load() });
          const filter = h('input', { class: 'sb-search', placeholder: 'Filter by name', oninput: NW.debounce(() => load(), 300), onkeydown: e => { if (e.key === 'Enter') load(); } });
          const info = h('span', { class: 'sb-label' });
          panel.append(h('div', { class: 'subbar' }, h('span', { class: 'sb-label', text: 'Scope:' }), scope, filter, h('button', { class: 'sb-btn', onclick: () => load() }, NW.svg('refresh'), 'Refresh'), h('div', { class: 'sb-spacer' }), info));
          const gw = h('div', { style: 'flex:1;display:flex;flex-direction:column;min-height:0' }); panel.appendChild(gw);
          const grid = new NW.DataGrid(gw, { clientSort: true, onCellDblClick: (r, c) => { if (action === 'server.variables' && scope.value === '1') { setVar(grid.rows[r][0], grid.rows[r][1]); return true; } NW.CellViewer.open({ value: grid.rows[r][c], col: grid.cols[c], readOnly: true }); return true; },
            onCellContext: (r, c, e) => NW.Menu.show([{ label: 'Copy', icon: 'copy', onClick: () => NW.copyText(grid.copySelection()) }, { label: 'Set Global Value...', hidden: action !== 'server.variables', onClick: () => setVar(grid.rows[r][0], grid.rows[r][1]) }], e.clientX, e.clientY) });
          const load = async () => { try { const r = await NW.api(action, { conn, global: scope.value === '1', filter: filter.value.trim() }); const res = r.results[0]; if (res.type === 'rows') { grid.setData(res.fields, res.rows, true); info.textContent = res.count + ' entries'; } else info.textContent = res.error || ''; } catch (e) { info.textContent = e.message; } };
          const setVar = async (name, value) => { const v = await NW.Dialog.prompt({ title: 'Set Global Variable', label: 'SET GLOBAL ' + name + ' =', value: value === null ? '' : String(value) }); if (v === null) return; try { await NW.api('server.setVariable', { conn, name, value: v }); NW.Toast.ok(name + ' updated'); load(); } catch (e) { NW.Dialog.error(e.message); } };
          return { load };
        };
        const vars = mkList(tabs.panels.vars, 'server.variables');
        const stat = mkList(tabs.panels.status, 'server.status');
        /* info */
        const infoBody = h('div', { class: 'panel-body' }); tabs.panels.info.appendChild(infoBody);
        const loadInfo = async () => { try { const r = await NW.api('server.info', { conn }); const i = r.info; const dl = h('dl', { class: 'info-grid' }); [['Server version', i.version + (i.comment ? ' (' + i.comment + ')' : '')], ['Host name', i.hostname], ['Port', i.port], ['Connected via', i.hostInfo], ['Uptime', fmtUptime(i.uptime)], ['Threads connected', i.threads], ['Questions', NW.fmt.num(i.questions)], ['Character set', i.charset], ['Collation', i.collation], ['max_allowed_packet', NW.fmt.bytes(i.maxPacket)], ['Event scheduler', i.eventScheduler], ['sql_mode', i.sqlMode]].forEach(([k, v]) => dl.append(h('dt', { text: k }), h('dd', { text: v === null || v === undefined ? '' : String(v) }))); infoBody.innerHTML = ''; infoBody.appendChild(dl); } catch (e) { infoBody.textContent = e.message; } };
        const loaded = {};
        show = id => { if (loaded[id]) return; loaded[id] = true; if (id === 'proc') loadProc(); if (id === 'vars') vars.load(); if (id === 'status') stat.load(); if (id === 'info') loadInfo(); };
        show('proc');
        return { refresh: () => { const id = tabs.current(); loaded[id] = false; show(id); }, onDestroy: () => clearInterval(state.timer) };
      });
    },

    /* ---------------------------------------------------------- users */
    users(conn) {
      const PRIVS = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'DROP', 'RELOAD', 'SHUTDOWN', 'PROCESS', 'FILE', 'REFERENCES', 'INDEX', 'ALTER', 'SHOW DATABASES', 'SUPER', 'CREATE TEMPORARY TABLES', 'LOCK TABLES', 'EXECUTE', 'REPLICATION SLAVE', 'REPLICATION CLIENT', 'CREATE VIEW', 'SHOW VIEW', 'CREATE ROUTINE', 'ALTER ROUTINE', 'CREATE USER', 'EVENT', 'TRIGGER', 'CREATE TABLESPACE', 'CREATE ROLE', 'DROP ROLE'];
      const DB_PRIVS = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'DROP', 'REFERENCES', 'INDEX', 'ALTER', 'CREATE TEMPORARY TABLES', 'LOCK TABLES', 'EXECUTE', 'CREATE VIEW', 'SHOW VIEW', 'CREATE ROUTINE', 'ALTER ROUTINE', 'EVENT', 'TRIGGER'];
      return panelTab('users:' + conn, 'Users (' + NW.connName(conn) + ')', 'users', { conn, db: null }, (box) => {
        let users = [];
        const info = h('span', { class: 'sb-label' });
        const bar = h('div', { class: 'subbar' },
          h('button', { class: 'sb-btn', onclick: () => edit(null) }, NW.svg('user'), 'New User'),
          h('button', { class: 'sb-btn', onclick: () => withSel(u => edit(u)) }, NW.svg('design'), 'Edit User'),
          h('button', { class: 'sb-btn', onclick: () => withSel(u => del(u)) }, NW.svg('delete'), 'Delete User'),
          h('div', { class: 'sb-sep' }),
          h('button', { class: 'sb-btn', onclick: () => withSel(u => grants(u)) }, NW.svg('key'), 'Show Grants'),
          h('button', { class: 'sb-btn', onclick: () => load() }, NW.svg('refresh'), 'Refresh'),
          h('div', { class: 'sb-spacer' }), info);
        const gw = h('div', { style: 'flex:1;display:flex;flex-direction:column;min-height:0' });
        box.append(bar, gw);
        const grid = new NW.DataGrid(gw, { clientSort: true, onCellDblClick: r => { edit(users[r]); return true; }, onCellContext: (r, c, e) => NW.Menu.show([{ label: 'Edit User', icon: 'design', onClick: () => edit(users[r]) }, { label: 'Show Grants', icon: 'key', onClick: () => grants(users[r]) }, { label: 'Delete User', icon: 'delete', onClick: () => del(users[r]) }], e.clientX, e.clientY) });
        const withSel = fn => { const rows = grid.getSelectedRows(); if (!rows.length) { NW.Toast.warn('Select a user first.'); return; } fn(users[rows[0]]); };
        const load = async () => {
          try {
            const r = await NW.api('users.list', { conn }); users = r.users;
            grid.setData([{ name: 'User', type: 'varchar' }, { name: 'Host', type: 'varchar' }, { name: 'Plugin', type: 'varchar' }, { name: 'Locked', type: 'varchar' }, { name: 'Expired', type: 'varchar' }, { name: 'Max Queries/h', type: 'int', num: true }, { name: 'Max Connections', type: 'int', num: true }, { name: 'SSL', type: 'varchar' }, { name: 'Password Changed', type: 'datetime' }],
              users.map(u => [u.user, u.host, u.plugin, u.locked ? 'Yes' : 'No', u.expired ? 'Yes' : 'No', u.maxQueries, u.maxUserConnections, u.ssl, u.passwordChanged]), true);
            info.textContent = users.length + ' user(s)';
          } catch (e) { info.textContent = ''; gw.innerHTML = ''; gw.appendChild(h('div', { class: 'obj-empty err-text', text: 'Cannot list users: ' + e.message + '\nThe connection user needs SELECT on mysql.user (usually root).' })); }
        };
        const grants = async u => { try { const r = await NW.api('users.grants', { conn, user: u.user, host: u.host }); NW.Dialog.open({ title: 'Grants for ' + u.user + '@' + u.host, icon: 'key', body: h('pre', { class: 'hexview', style: 'max-height:60vh;white-space:pre-wrap', text: r.grants.join(';\n') + ';' }), width: 720, buttons: [{ label: 'Copy', onClick: () => { NW.copyText(r.grants.join(';\n') + ';'); return false; }, keep: true }, { label: 'Close', value: null }] }); } catch (e) { NW.Dialog.error(e.message); } };
        const del = async u => { if (!(await NW.Dialog.confirm('Drop user ' + u.user + '@' + u.host + '?', { title: 'Delete User', ok: 'Drop', danger: true }))) return; try { await runDdl(conn, null, ['DROP USER ' + userLit(u.user, u.host)]); NW.Toast.ok('User dropped'); load(); } catch (e) { NW.Dialog.error(e.message); } };
        const parseGrants = lines => {
          const st = { global: new Set(), grantOption: false, dbs: {}, dynamic: [], other: [] };
          lines.forEach(line => {
            const m = /^GRANT (.+?) ON (.+?) TO .+?(?: WITH GRANT OPTION)?$/i.exec(line.trim());
            if (!m) { if (!/^GRANT (USAGE|PROXY)/i.test(line) && /^GRANT /i.test(line)) st.other.push(line); return; }
            const privs = m[1].split(',').map(s => s.trim().toUpperCase()); const on = m[2].trim(); const wgo = / WITH GRANT OPTION$/i.test(line);
            if (on === '*.*') { privs.forEach(p => { if (p === 'USAGE') return; if (p === 'ALL PRIVILEGES' || p === 'ALL') { PRIVS.forEach(x => st.global.add(x)); return; } if (PRIVS.includes(p)) st.global.add(p); else if (/^[A-Z_]+$/.test(p)) st.dynamic.push(p); }); if (wgo) st.grantOption = true; }
            else { const dm = /^`?([^`.]+)`?\.\*$/.exec(on); if (dm) { const db = dm[1].replace(/\\_/g, '_'); st.dbs[db] = st.dbs[db] || new Set(); privs.forEach(p => { if (p === 'ALL PRIVILEGES' || p === 'ALL') DB_PRIVS.forEach(x => st.dbs[db].add(x)); else if (p !== 'USAGE') st.dbs[db].add(p); }); } else st.other.push(line); }
          });
          return st;
        };
        const edit = async u => {
          let cur = { global: new Set(), grantOption: false, dbs: {}, dynamic: [], other: [] };
          if (u) { try { const r = await NW.api('users.grants', { conn, user: u.user, host: u.host }); cur = parseGrants(r.grants); } catch (e) { NW.Toast.warn('Cannot read current grants: ' + e.message); } }
          const f = {};
          f.user = h('input', { class: 'inp', value: u ? u.user : '', autofocus: true }); f.host = h('input', { class: 'inp', value: u ? u.host : '%' });
          f.pw = h('input', { class: 'inp', type: 'password', placeholder: u ? '(unchanged)' : '', autocomplete: 'new-password' }); f.pw2 = h('input', { class: 'inp', type: 'password', autocomplete: 'new-password' });
          f.plugin = NW.select([{ value: '', label: '(default)' }, 'caching_sha2_password', 'mysql_native_password', 'sha256_password'], u ? (u.plugin || '') : '');
          f.locked = h('input', { type: 'checkbox', checked: !!(u && u.locked) });
          f.maxQ = h('input', { class: 'inp', type: 'number', value: u ? u.maxQueries || 0 : 0 }); f.maxU = h('input', { class: 'inp', type: 'number', value: u ? u.maxUpdates || 0 : 0 }); f.maxC = h('input', { class: 'inp', type: 'number', value: u ? u.maxConnections || 0 : 0 }); f.maxUC = h('input', { class: 'inp', type: 'number', value: u ? u.maxUserConnections || 0 : 0 });
          const globalBox = h('div', { class: 'privs' });
          const allChk = h('input', { type: 'checkbox', checked: PRIVS.every(p => cur.global.has(p)), onchange: () => globalBox.querySelectorAll('input').forEach(i => i.checked = allChk.checked) });
          PRIVS.forEach(p => globalBox.appendChild(h('label', { class: 'chk' }, h('input', { type: 'checkbox', value: p, checked: cur.global.has(p) }), p)));
          const wgo = h('input', { type: 'checkbox', checked: cur.grantOption });
          const dbRows = Object.keys(cur.dbs).map(db => ({ db, privs: Array.from(cur.dbs[db]) }));
          const dbs = (NW.connState(conn).databases || []).map(d => d.name);
          const dbTable = h('div');
          const renderDb = () => {
            dbTable.innerHTML = '';
            const t = h('table', { class: 'dtable' }, h('thead', null, h('tr', null, h('th', { text: 'Database', style: 'width:200px' }), h('th', { text: 'Privileges' }), h('th', { style: 'width:30px' }))));
            const tb = h('tbody');
            dbRows.forEach((row, i) => tb.appendChild(h('tr', null,
              h('td', null, NW.select(dbs.includes(row.db) ? dbs : dbs.concat([row.db]), row.db, { class: 'cell', onchange: e => row.db = e.target.value })),
              h('td', null, h('span', { class: 'fieldpick', text: row.privs.length === DB_PRIVS.length ? 'ALL PRIVILEGES' : (row.privs.join(', ') || '(choose)'), onclick: () => pickPrivs(row) })),
              h('td', null, h('button', { class: 'ib', onclick: () => { dbRows.splice(i, 1); renderDb(); } }, NW.svg('close'))))));
            t.appendChild(tb); dbTable.appendChild(t);
            dbTable.appendChild(h('button', { class: 'btn link', onclick: () => { dbRows.push({ db: dbs[0] || '', privs: DB_PRIVS.slice() }); renderDb(); } }, '+ Add database privileges'));
          };
          const pickPrivs = row => { const box = h('div', { class: 'privs' }); const all = h('input', { type: 'checkbox', checked: row.privs.length === DB_PRIVS.length, onchange: () => box.querySelectorAll('input').forEach(i => i.checked = all.checked) }); DB_PRIVS.forEach(p => box.appendChild(h('label', { class: 'chk' }, h('input', { type: 'checkbox', value: p, checked: row.privs.includes(p) }), p))); NW.Dialog.open({ title: 'Privileges on ' + row.db, body: h('div', null, h('label', { class: 'chk', style: 'margin-bottom:8px' }, all, h('b', null, 'ALL PRIVILEGES')), box), width: 640, buttons: [{ label: 'OK', primary: true, onClick: () => { row.privs = Array.from(box.querySelectorAll('input:checked')).map(i => i.value); renderDb(); } }, { label: 'Cancel', value: null }] }); };
          renderDb();
          const tabs = NW.subTabs([{ id: 'general', label: 'General' }, { id: 'limits', label: 'Advanced' }, { id: 'global', label: 'Server Privileges' }, { id: 'dbp', label: 'Database Privileges' }], { cls: 'dtabs', tabCls: 'dtab', panelCls: 'dpanel' });
          tabs.panels.general.appendChild(h('div', { class: 'form-grid' }, ...NW.formRow('User Name:', f.user), ...NW.formRow('Host:', f.host, '% = any host'), ...NW.formRow('Plugin:', f.plugin), ...NW.formRow('Password:', f.pw), ...NW.formRow('Confirm Password:', f.pw2), h('span'), h('label', { class: 'chk' }, f.locked, 'Account locked')));
          tabs.panels.limits.appendChild(h('div', { class: 'form-grid' }, ...NW.formRow('Max queries per hour:', f.maxQ, '0 = unlimited'), ...NW.formRow('Max updates per hour:', f.maxU), ...NW.formRow('Max connections per hour:', f.maxC), ...NW.formRow('Max user connections:', f.maxUC)));
          tabs.panels.global.append(h('label', { class: 'chk', style: 'margin-bottom:8px' }, allChk, h('b', null, 'ALL PRIVILEGES')), globalBox, h('label', { class: 'chk', style: 'margin-top:10px' }, wgo, 'WITH GRANT OPTION'), cur.dynamic.length ? h('div', { class: 'muted small', style: 'margin-top:8px', text: 'Dynamic privileges kept: ' + cur.dynamic.join(', ') }) : null, cur.other.length ? h('div', { class: 'muted small', style: 'margin-top:4px', text: 'Object-level grants kept: ' + cur.other.length }) : null);
          tabs.panels.dbp.appendChild(dbTable);
          tabs.el.style.minHeight = '380px';
          NW.Dialog.open({ title: u ? 'Edit User - ' + u.user + '@' + u.host : 'New User', icon: 'user', body: tabs.el, width: 720, buttons: [{ label: 'Save', primary: true, onClick: async () => {
            const name = f.user.value.trim(), host = f.host.value.trim() || '%';
            if (!name) throw new Error('Enter a user name.');
            if (f.pw.value !== f.pw2.value) throw new Error('The passwords do not match.');
            if (!u && !f.pw.value) throw new Error('Enter a password for the new user.');
            const st = [];
            let lit = userLit(name, host);
            const ident = f.pw.value ? ' IDENTIFIED' + (f.plugin.value ? ' WITH ' + NW.qs(f.plugin.value) : '') + ' BY ' + NW.qs(f.pw.value) : '';
            const limits = ' WITH MAX_QUERIES_PER_HOUR ' + (+f.maxQ.value || 0) + ' MAX_UPDATES_PER_HOUR ' + (+f.maxU.value || 0) + ' MAX_CONNECTIONS_PER_HOUR ' + (+f.maxC.value || 0) + ' MAX_USER_CONNECTIONS ' + (+f.maxUC.value || 0);
            if (!u) st.push('CREATE USER ' + lit + ident + limits + (f.locked.checked ? ' ACCOUNT LOCK' : ''));
            else {
              const oldLit = userLit(u.user, u.host);
              if (name !== u.user || host !== u.host) st.push('RENAME USER ' + oldLit + ' TO ' + lit);
              if (ident) st.push('ALTER USER ' + lit + ident);
              else if (f.plugin.value && f.plugin.value !== (u.plugin || '')) NW.Toast.warn('Changing the plugin requires entering a password; plugin left unchanged.');
              st.push('ALTER USER ' + lit + limits + (f.locked.checked ? ' ACCOUNT LOCK' : ' ACCOUNT UNLOCK'));
              st.push('REVOKE ALL PRIVILEGES, GRANT OPTION FROM ' + lit);
            }
            const g = Array.from(globalBox.querySelectorAll('input:checked')).map(i => i.value);
            if (g.length) st.push('GRANT ' + (g.length === PRIVS.length ? 'ALL PRIVILEGES' : g.join(', ')) + ' ON *.* TO ' + lit + (wgo.checked ? ' WITH GRANT OPTION' : ''));
            else if (wgo.checked) st.push('GRANT USAGE ON *.* TO ' + lit + ' WITH GRANT OPTION');
            if (cur.dynamic.length) st.push('GRANT ' + cur.dynamic.join(', ') + ' ON *.* TO ' + lit);
            dbRows.forEach(row => { if (row.db && row.privs.length) st.push('GRANT ' + (row.privs.length === DB_PRIVS.length ? 'ALL PRIVILEGES' : row.privs.join(', ')) + ' ON ' + NW.qi(row.db) + '.* TO ' + lit); });
            cur.other.forEach(line => st.push(line.replace(/ TO .*$/i, ' TO ' + lit)));
            st.push('FLUSH PRIVILEGES');
            await runDdl(conn, null, st, 'Saving user…');
            NW.Toast.ok('User saved'); load();
          } }, { label: 'Cancel', value: null }] });
        };
        load();
        return { refresh: load };
      });
    },

    /* ---------------------------------------------------------- dump SQL file */
    async dumpDialog(o) {
      const conn = o.conn; let db = o.db;
      const dbs = (NW.connState(conn).databases || []).map(d => d.name);
      if (!db) db = dbs[0];
      if (!db) { NW.Toast.warn('No database to dump.'); return; }
      const lists = {}; const groups = [['tables', 'Tables'], ['views', 'Views'], ['functions', 'Functions'], ['procedures', 'Procedures'], ['events', 'Events']];
      const listsBox = h('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:10px' });
      const dbSel = NW.select(dbs, db, { onchange: () => { db = dbSel.value; fill(); fname.value = db + '.sql'; } });
      const fill = async () => {
        listsBox.innerHTML = '';
        let objects; try { objects = await NW.Tree.ensureDbOpen(conn, db); } catch (e) { listsBox.textContent = e.message; return; }
        const src = { tables: objects.tables.map(t => t.name), views: objects.views.map(v => v.name), functions: objects.routines.filter(r => r.type === 'FUNCTION').map(r => r.name), procedures: objects.routines.filter(r => r.type === 'PROCEDURE').map(r => r.name), events: objects.events.map(e => e.name) };
        const explicit = o.tables || o.views || o.functions || o.procedures || o.events;
        groups.forEach(([k, label]) => {
          const pre = explicit ? (o[k] || []) : src[k];
          const box = h('div', { class: 'listbox', style: 'height:130px' });
          const all = h('input', { type: 'checkbox', checked: src[k].length > 0 && pre.length === src[k].length, onchange: () => box.querySelectorAll('input').forEach(i => i.checked = all.checked) });
          src[k].forEach(n => box.appendChild(h('label', { class: 'li chk' }, h('input', { type: 'checkbox', value: n, checked: pre.includes(n) }), n)));
          if (!src[k].length) box.appendChild(h('div', { class: 'muted small', style: 'padding:6px', text: '(none)' }));
          lists[k] = box;
          listsBox.appendChild(h('div', null, h('label', { class: 'chk', style: 'margin-bottom:4px' }, all, h('b', null, label + ' (' + src[k].length + ')')), box));
        });
      };
      const structure = h('input', { type: 'checkbox', checked: true }), data = h('input', { type: 'checkbox', checked: o.data !== false }), drop = h('input', { type: 'checkbox', checked: true }), trig = h('input', { type: 'checkbox', checked: true }), createDb = h('input', { type: 'checkbox' });
      const fname = h('input', { class: 'inp', value: (o.tables && o.tables.length === 1 ? db + '_' + o.tables[0] : db) + '.sql' });
      const body = h('div', null, h('div', { class: 'form-grid', style: 'margin-bottom:10px' }, ...NW.formRow('Database:', dbSel), ...NW.formRow('File name:', fname)), listsBox,
        h('div', { style: 'display:flex;gap:16px;flex-wrap:wrap;margin-top:12px' }, h('label', { class: 'chk' }, structure, 'Structure'), h('label', { class: 'chk' }, data, 'Data (records)'), h('label', { class: 'chk' }, drop, 'Add DROP ... IF EXISTS'), h('label', { class: 'chk' }, trig, 'Include triggers'), h('label', { class: 'chk' }, createDb, 'Include CREATE DATABASE')));
      await fill();
      NW.Dialog.open({ title: 'Dump SQL File', icon: 'backup', body, width: 760, buttons: [{ label: 'Save', primary: true, onClick: () => {
        const sel = {}; groups.forEach(([k]) => sel[k] = Array.from(lists[k].querySelectorAll('input:checked')).map(i => i.value));
        if (!Object.values(sel).some(a => a.length)) throw new Error('Select at least one object.');
        NW.download('dump.sql', { conn, db, sel, opt: { structure: structure.checked, data: data.checked, drop: drop.checked, triggers: trig.checked, createDb: createDb.checked }, filename: fname.value.trim() || db + '.sql' });
        NW.Toast.ok('Dump started. The download will begin shortly.');
      } }, { label: 'Cancel', value: null }] });
    },

    /* ---------------------------------------------------------- execute SQL file */
    executeSqlFile(o) {
      const conn = o.conn;
      const dbs = (NW.connState(conn).databases || []).map(d => d.name);
      const dbSel = NW.select([{ value: '', label: '(none)' }].concat(dbs), o.db || '');
      const file = h('input', { type: 'file', accept: '.sql,.txt,.dump,.ddl' });
      const text = h('textarea', { class: 'ta', rows: 10, placeholder: 'Paste SQL statements here…', spellcheck: false });
      const tabs = NW.subTabs([{ id: 'file', label: 'From File' }, { id: 'text', label: 'From Text' }], { cls: 'dtabs', tabCls: 'dtab', panelCls: 'dpanel' });
      tabs.panels.file.appendChild(h('div', { class: 'form-grid' }, ...NW.formRow('SQL file:', file, 'Files of any size: uploaded in pieces and executed in slices.')));
      tabs.panels.text.appendChild(text);
      const cont = h('input', { type: 'checkbox', checked: true }), fk = h('input', { type: 'checkbox', checked: true });
      const bar = h('div', { class: 'progress' }, h('div')), status = h('div', { class: 'small muted', style: 'margin:6px 0' }), log = h('div', { class: 'loglist' });
      const body = h('div', null, tabs.el, h('div', { class: 'form-grid', style: 'margin-top:10px' }, ...NW.formRow('Target database:', dbSel)),
        h('div', { style: 'display:flex;gap:16px;margin:10px 0' }, h('label', { class: 'chk' }, cont, 'Continue on error'), h('label', { class: 'chk' }, fk, 'Disable foreign key checks')), bar, status, log);
      let running = false, cancelled = false;
      const logLine = (s, cls) => { log.appendChild(h('div', { class: cls || '', text: s })); log.scrollTop = log.scrollHeight; };
      const dlg = NW.Dialog.open({ title: 'Execute SQL File', icon: 'import', body, width: 680, noEnter: true, buttons: [
        { label: 'Start', primary: true, keep: true, onClick: async (d) => {
          if (running) return false;
          const f = file.files[0]; const sql = text.value;
          if (tabs.current() === 'file' && !f) throw new Error('Choose a file.');
          if (tabs.current() === 'text' && !sql.trim()) throw new Error('Enter some SQL.');
          running = true; cancelled = false; log.innerHTML = ''; d.buttons[0].disabled = true;
          let id = null;
          try {
            if (tabs.current() === 'file') {
              const CH = 1024 * 1024; const n = Math.ceil(f.size / CH);
              for (let i = 0; i < n; i++) { if (cancelled) throw new Error('Cancelled'); const r = await NW.upload('import.upload', { id: id || '', index: i }, f.slice(i * CH, (i + 1) * CH), 'chunk.sql'); id = r.id; bar.firstChild.style.width = Math.round((i + 1) / n * 30) + '%'; status.textContent = 'Uploading… ' + NW.fmt.bytes(Math.min(f.size, (i + 1) * CH)) + ' of ' + NW.fmt.bytes(f.size); }
            } else { const r = await NW.api('import.text', { sql }); id = r.id; bar.firstChild.style.width = '30%'; }
            let pos = 0, delim = ';', executed = 0, errorCount = 0, db = dbSel.value, res;
            const t0 = Date.now();
            do {
              if (cancelled) throw new Error('Cancelled');
              res = await NW.api('import.run', { conn, db, id, pos, delim, executed, errorCount, continueOnError: cont.checked, disableFk: fk.checked });
              pos = res.pos; delim = res.delim; executed = res.executed; errorCount = res.errorCount; db = res.db || db;
              (res.errors || []).forEach(e => logLine('[Err] at byte ' + e.pos + ': ' + e.error + '\n      ' + e.sql.replace(/\s+/g, ' ').slice(0, 160), 'err-text'));
              bar.firstChild.style.width = (30 + Math.round(pos / Math.max(1, res.size) * 70)) + '%';
              status.textContent = 'Executed ' + NW.fmt.num(executed) + ' statement(s), ' + errorCount + ' error(s) — ' + NW.fmt.bytes(pos) + ' of ' + NW.fmt.bytes(res.size) + ' — ' + ((Date.now() - t0) / 1000).toFixed(1) + 's';
            } while (!res.done);
            logLine((res.stopped ? 'Stopped at the first error. ' : 'Finished. ') + NW.fmt.num(executed) + ' statement(s) executed, ' + errorCount + ' error(s).', errorCount ? 'err-text' : 'ok-text');
            NW.Toast[errorCount ? 'warn' : 'ok']('SQL file executed: ' + executed + ' statements, ' + errorCount + ' errors');
            if (o.db || dbSel.value) NW.bus.emit('objects-changed', { conn, db: o.db || dbSel.value });
            NW.Tree.refreshConnection(conn);
          } catch (e) { logLine('[Err] ' + e.message, 'err-text'); status.textContent = 'Failed.'; }
          finally { running = false; d.buttons[0].disabled = false; if (id) NW.api('import.discard', { id }).catch(() => { }); }
          return false;
        } },
        { label: 'Close', onClick: () => { if (running) { cancelled = true; return false; } return null; } }] });
      return dlg;
    },

    /* ---------------------------------------------------------- import wizard (CSV / JSON) */
    async importWizard(o) {
      const conn = o.conn, db = o.db;
      const objects = await NW.Tree.ensureDbOpen(conn, db);
      const tables = objects.tables.map(t => t.name);
      const file = h('input', { type: 'file', accept: '.csv,.txt,.tsv,.json' });
      const fmt = NW.select([{ value: 'csv', label: 'CSV / text file' }, { value: 'json', label: 'JSON file (array of objects)' }], 'csv');
      const delim = NW.select([{ value: 'auto', label: 'Auto detect' }, { value: ',', label: 'Comma (,)' }, { value: ';', label: 'Semicolon (;)' }, { value: '\t', label: 'Tab' }, { value: '|', label: 'Pipe (|)' }], 'auto');
      const header = h('input', { type: 'checkbox', checked: true }), emptyNull = h('input', { type: 'checkbox', checked: true });
      const target = NW.select([{ value: '', label: '(create new table)' }].concat(tables), o.table || (tables[0] || ''));
      const newName = h('input', { class: 'inp', placeholder: 'new table name', style: 'display:' + (target.value ? 'none' : '') });
      const mode = NW.select([{ value: 'insert', label: 'Append: add records to the destination table' }, { value: 'replace', label: 'Update: REPLACE INTO (by primary key)' }, { value: 'upsert', label: 'Append or Update: INSERT … ON DUPLICATE KEY UPDATE' }, { value: 'truncate', label: 'Delete and Append: truncate the table first' }], 'insert');
      const mapBox = h('div', { style: 'margin-top:8px' }); const preview = h('div', { class: 'listbox', style: 'height:120px;overflow:auto;font-family:var(--mono);font-size:11px;white-space:pre;padding:4px' });
      const bar = h('div', { class: 'progress' }, h('div')), status = h('div', { class: 'small muted', style: 'margin:6px 0' });
      let parsed = null, mapping = [], targetCols = [];
      const parseCsv = (txt, sep) => {
        const rows = []; let row = [], cell = '', q = false, i = 0;
        while (i < txt.length) { const c = txt[i]; if (q) { if (c === '"') { if (txt[i + 1] === '"') { cell += '"'; i += 2; continue; } q = false; i++; continue; } cell += c; i++; continue; } if (c === '"') { q = true; i++; continue; } if (c === sep) { row.push(cell); cell = ''; i++; continue; } if (c === '\r') { i++; continue; } if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; i++; continue; } cell += c; i++; }
        if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
        return rows.filter(r => r.length > 1 || (r.length === 1 && r[0] !== ''));
      };
      const detect = txt => { const line = txt.split(/\r?\n/)[0] || ''; const cands = [',', ';', '\t', '|']; let best = ',', bn = -1; cands.forEach(c => { const n = line.split(c).length; if (n > bn) { bn = n; best = c; } }); return best; };
      const loadTargetCols = async () => { if (!target.value) { targetCols = []; return; } const cols = await this.columnsOf(conn, db); targetCols = cols[target.value] || []; };
      const renderMap = () => {
        mapBox.innerHTML = '';
        if (!parsed) return;
        const t = h('table', { class: 'dtable' }, h('thead', null, h('tr', null, h('th', { text: 'Source field' }), h('th', { text: 'Target field' }))));
        const tb = h('tbody');
        mapping = parsed.fields.map(f => { if (!target.value) return { src: f, dst: f }; const m = targetCols.find(c => c.toLowerCase() === f.toLowerCase().trim()); return { src: f, dst: m || '' }; });
        mapping.forEach(m => tb.appendChild(h('tr', null, h('td', { text: m.src }), h('td', null, target.value ? NW.select([{ value: '', label: '(skip)' }].concat(targetCols), m.dst, { class: 'cell', onchange: e => m.dst = e.target.value }) : h('input', { class: 'cell', value: m.dst, onchange: e => m.dst = e.target.value })))));
        t.appendChild(tb); mapBox.appendChild(t);
      };
      const parseFile = async () => {
        const f = file.files[0]; if (!f) return;
        if (/\.json$/i.test(f.name)) fmt.value = 'json';
        const txt = (await f.text()).replace(/^﻿/, '');
        if (fmt.value === 'json') { let arr = JSON.parse(txt); if (!Array.isArray(arr)) { const k = Object.keys(arr).find(x => Array.isArray(arr[x])); arr = k ? arr[k] : [arr]; } const fields = []; arr.forEach(r => Object.keys(r).forEach(k => { if (!fields.includes(k)) fields.push(k); })); parsed = { fields, rows: arr.map(r => fields.map(k => r[k] === undefined || r[k] === null ? null : (typeof r[k] === 'object' ? JSON.stringify(r[k]) : String(r[k])))) }; }
        else { const sep = delim.value === 'auto' ? detect(txt) : delim.value; const rows = parseCsv(txt, sep); const fields = header.checked ? (rows.shift() || []).map((x, i) => x.trim() || 'field' + (i + 1)) : (rows[0] || []).map((x, i) => 'field' + (i + 1)); parsed = { fields, rows }; }
        preview.textContent = [parsed.fields.join(' | ')].concat(parsed.rows.slice(0, 5).map(r => r.join(' | '))).join('\n') + '\n… ' + NW.fmt.num(parsed.rows.length) + ' records';
        if (!newName.value && !target.value) newName.value = f.name.replace(/\.[^.]+$/, '').replace(/\W+/g, '_');
        await loadTargetCols(); renderMap();
      };
      file.addEventListener('change', () => parseFile().catch(e => NW.Dialog.error(e.message)));
      [fmt, delim, header].forEach(el => el.addEventListener('change', () => parseFile().catch(e => NW.Dialog.error(e.message))));
      target.addEventListener('change', async () => { newName.style.display = target.value ? 'none' : ''; await loadTargetCols(); renderMap(); });
      await loadTargetCols();
      const body = h('div', null,
        h('div', { class: 'form-grid' }, ...NW.formRow('Source file:', file), ...NW.formRow('Format:', fmt), ...NW.formRow('Delimiter:', delim), h('span'), h('div', { style: 'display:flex;gap:16px' }, h('label', { class: 'chk' }, header, 'First row contains field names'), h('label', { class: 'chk' }, emptyNull, 'Empty values as NULL')),
          ...NW.formRow('Target table:', h('div', { class: 'form-row' }, target, newName)), ...NW.formRow('Import mode:', mode)),
        h('div', { class: 'muted small', style: 'margin:8px 0 4px', text: 'Preview' }), preview, h('div', { class: 'muted small', style: 'margin:8px 0 4px', text: 'Field mapping' }), mapBox, bar, status);
      let running = false;
      NW.Dialog.open({ title: 'Import Wizard - ' + db, icon: 'import', body, width: 760, noEnter: true, buttons: [{ label: 'Start Import', primary: true, keep: true, onClick: async (d) => {
        if (running) return false;
        if (!parsed) throw new Error('Choose a file first.');
        const tbl = target.value || newName.value.trim();
        if (!tbl) throw new Error('Enter a name for the new table.');
        const pairs = mapping.filter(m => m.dst);
        if (!pairs.length) throw new Error('Map at least one field.');
        running = true; d.buttons[0].disabled = true;
        try {
          const stmts = [];
          if (!target.value) stmts.push('CREATE TABLE ' + NW.qname(db, tbl) + ' (\n' + pairs.map(p => '  ' + NW.qi(p.dst) + ' VARCHAR(255) NULL').join(',\n') + '\n)');
          if (mode.value === 'truncate') stmts.push('TRUNCATE TABLE ' + NW.qname(db, tbl));
          const cols = pairs.map(p => NW.qi(p.dst)).join(', ');
          const idx = pairs.map(p => parsed.fields.indexOf(p.src));
          const lit = v => (v === null || v === undefined || (emptyNull.checked && (v === '' || v === 'NULL'))) ? 'NULL' : NW.qs(v);
          const verb = mode.value === 'replace' ? 'REPLACE INTO ' : 'INSERT INTO ';
          const upd = mode.value === 'upsert' ? ' ON DUPLICATE KEY UPDATE ' + pairs.map(p => NW.qi(p.dst) + ' = VALUES(' + NW.qi(p.dst) + ')').join(', ') : '';
          for (let i = 0; i < parsed.rows.length; i += 200) {
            const chunk = parsed.rows.slice(i, i + 200).map(r => '(' + idx.map(k => lit(r[k])).join(', ') + ')');
            stmts.push(verb + NW.qname(db, tbl) + ' (' + cols + ') VALUES\n' + chunk.join(',\n') + upd);
          }
          const sql = stmts.map(s => s + ';').join('\n');
          const r0 = await NW.api('import.text', { sql });
          let pos = 0, delim2 = ';', executed = 0, errorCount = 0, res, errs = [];
          do {
            res = await NW.api('import.run', { conn, db, id: r0.id, pos, delim: delim2, executed, errorCount, continueOnError: true, disableFk: true });
            pos = res.pos; delim2 = res.delim; executed = res.executed; errorCount = res.errorCount; errs = errs.concat(res.errors || []);
            bar.firstChild.style.width = Math.round(pos / Math.max(1, res.size) * 100) + '%'; status.textContent = 'Executed ' + executed + ' statement(s), ' + errorCount + ' error(s)';
          } while (!res.done);
          NW.api('import.discard', { id: r0.id }).catch(() => { });
          NW.bus.emit('objects-changed', { conn, db });
          const t = NW.Tabs.get('table:' + conn + '/' + db + '/' + tbl); if (t && t.ctl.load) t.ctl.load({ force: true });
          if (errorCount) await NW.Dialog.error(errs.slice(0, 5).map(e => e.error).join('\n'), errorCount + ' error(s) during import');
          else { NW.Toast.ok('Imported ' + NW.fmt.num(parsed.rows.length) + ' records into ' + tbl); return true; }
        } finally { running = false; d.buttons[0].disabled = false; }
        return false;
      } }, { label: 'Close', value: null }] });
    },

    /* ---------------------------------------------------------- view designer */
    viewDesigner(o) {
      const conn = o.conn, db = o.db;
      const id = 'view:' + conn + '/' + db + '/' + (o.name || 'new-' + NW.uid());
      return NW.Tabs.open({ id, title: (o.name || 'Untitled') + ' @' + db + ' (' + NW.connName(conn) + ') - View', icon: 'view', ctx: { conn, db }, create: (el, tab) => {
        let name = o.name || null, saved = '', origDefiner = '';
        const f = { algorithm: NW.select(['UNDEFINED', 'MERGE', 'TEMPTABLE'], 'UNDEFINED'), definer: h('input', { class: 'inp', placeholder: 'current user (leave as is unless you have SET_USER_ID / SUPER)' }), security: NW.select(['DEFINER', 'INVOKER'], 'DEFINER'), check: NW.select(['NONE', 'CASCADED', 'LOCAL'], 'NONE') };
        const definerClause = () => { const v = f.definer.value.trim(); return v && v !== origDefiner ? 'DEFINER=' + definerLit(v) + ' ' : ''; };
        const bar = h('div', { class: 'subbar' }, h('button', { class: 'sb-btn', onclick: () => save() }, NW.svg('save'), 'Save'), h('button', { class: 'sb-btn', onclick: () => save(true) }, NW.svg('save'), 'Save As'), h('div', { class: 'sb-sep' }), h('button', { class: 'sb-btn', onclick: () => preview() }, NW.svg('run'), 'Preview'), h('div', { class: 'sb-spacer' }), h('span', { class: 'muted', text: db }));
        el.appendChild(bar);
        const tabs = NW.subTabs([{ id: 'def', label: 'Definition' }, { id: 'adv', label: 'Advanced' }, { id: 'sql', label: 'SQL Preview' }], { onShow: tid => { if (tid === 'sql') { sqlCm.setValue(build()); setTimeout(() => sqlCm.refresh(), 0); } if (tid === 'def') setTimeout(() => cm.refresh(), 0); } });
        el.appendChild(tabs.el);
        const edBox = h('div', { class: 'dz-sql' }); tabs.panels.def.appendChild(edBox);
        const cm = NW.editor(edBox, { value: '', placeholder: 'SELECT … (the SELECT statement of the view)' });
        cm.on('change', () => NW.Tabs.setDirty(tab.id, cm.getValue() !== saved));
        tabs.panels.adv.appendChild(h('div', { class: 'dz-options' }, h('div', { class: 'form-grid' }, ...NW.formRow('Algorithm:', f.algorithm), ...NW.formRow('Definer:', f.definer, 'user@host'), ...NW.formRow('Security:', f.security), ...NW.formRow('Check option:', f.check))));
        const sqlBox = h('div', { class: 'dz-sql' }); tabs.panels.sql.appendChild(sqlBox);
        const sqlCm = NW.editor(sqlBox, { value: '', readOnly: true });
        NW.Query.hints(conn, db).then(t => cm.setOption('hintOptions', { completeSingle: false, tables: t }));
        const build = (n) => 'CREATE OR REPLACE ' + (f.algorithm.value !== 'UNDEFINED' ? 'ALGORITHM=' + f.algorithm.value + ' ' : '') + definerClause() + 'SQL SECURITY ' + f.security.value + ' VIEW ' + NW.qname(db, n || name || 'view_name') + ' AS\n' + cm.getValue().trim().replace(/;\s*$/, '') + (f.check.value !== 'NONE' ? '\nWITH ' + f.check.value + ' CHECK OPTION' : '');
        const load = async () => {
          if (!name) return;
          try {
            const r = await NW.api('obj.ddl', { conn, db, type: 'view', name });
            const m = /\bVIEW\s+`[^`]*`(?:\.`[^`]*`)?\s*(?:\([^)]*\)\s*)?AS\s+([\s\S]*?)(\s+WITH\s+(CASCADED|LOCAL)\s+CHECK\s+OPTION)?\s*$/i.exec(r.ddl);
            const body = m ? m[1] : ((r.info && r.info.body) || '');
            cm.setValue(body); saved = body;
            if (r.info) { if (r.info.algorithm) f.algorithm.value = r.info.algorithm; origDefiner = r.info.definer || ''; f.definer.value = origDefiner; f.security.value = r.info.security || 'DEFINER'; f.check.value = (r.info.checkOption || 'NONE').toUpperCase(); }
            NW.Tabs.setDirty(tab.id, false);
          } catch (e) { NW.Dialog.error(e.message); }
        };
        const save = async (as) => {
          let n = name;
          if (as || !n) { n = await NW.Dialog.prompt({ title: 'View Name', label: 'Name of the view:', value: n || '', validate: v => v.trim() ? '' : 'Required' }); if (!n) return false; n = n.trim(); }
          if (!cm.getValue().trim()) { NW.Dialog.warn('Enter the SELECT statement of the view.'); return false; }
          try {
            await runDdl(conn, db, [build(n)], 'Saving view…');
            const renamed = name && name !== n;
            name = n; saved = cm.getValue(); NW.Tabs.setDirty(tab.id, false);
            NW.Tabs.setTitle(tab.id, name + ' @' + db + ' (' + NW.connName(conn) + ') - View');
            NW.Toast.ok('View ' + name + ' saved'); NW.bus.emit('objects-changed', { conn, db });
            if (!renamed) { const t = NW.Tabs.get('table:' + conn + '/' + db + '/' + name); if (t && t.ctl.load) t.ctl.load({ force: true }); }
            return true;
          } catch (e) { NW.Dialog.error(e.message, 'Save failed'); return false; }
        };
        const preview = () => { const sel = cm.getValue().trim().replace(/;\s*$/, ''); if (!sel) return; NW.Query.open({ conn, db, sql: 'SELECT * FROM (' + sel + ') AS `preview` LIMIT 100;', autoRun: true, name: (name || 'view') + ' preview' }); };
        load();
        setTimeout(() => cm.refresh(), 0);
        return { save, refresh: load, onActivate: () => setTimeout(() => cm.refresh(), 0), onClose: async () => { if (cm.getValue() === saved) return true; const r = await NW.Dialog.msg('question', 'Save changes to view ' + (name || 'Untitled') + '?', 'View', [{ label: 'Save', primary: true, value: 'save' }, { label: "Don't Save", value: 'no' }, { label: 'Cancel', value: null }]); if (r === 'save') return save(); return r === 'no'; } };
      } });
    },

    /* ---------------------------------------------------------- function / procedure designer */
    routineDesigner(o) {
      const conn = o.conn, db = o.db;
      const id = 'routine:' + conn + '/' + db + '/' + (o.name || 'new-' + NW.uid());
      return NW.Tabs.open({ id, title: (o.name || 'Untitled') + ' @' + db + ' (' + NW.connName(conn) + ') - ' + (o.type === 'procedure' ? 'Procedure' : 'Function'), icon: o.type === 'procedure' ? 'procedure' : 'function', ctx: { conn, db }, create: (el, tab) => {
        let name = o.name || null, savedKey = '', origDefiner = '';
        const params = [];
        const definerClause = () => { const v = f.definer.value.trim(); return v && v !== origDefiner ? 'DEFINER=' + definerLit(v) + ' ' : ''; };
        const f = { type: NW.select([{ value: 'function', label: 'Function' }, { value: 'procedure', label: 'Procedure' }], o.type || 'function', { style: 'width:130px', disabled: !!name, onchange: () => { renderParams(); toggleReturns(); } }),
          name: h('input', { class: 'inp', value: name || '', style: 'width:220px', disabled: !!name, placeholder: 'name' }), returns: h('input', { class: 'inp', style: 'width:200px', placeholder: 'e.g. DECIMAL(12,2)' }),
          det: h('input', { type: 'checkbox' }), access: NW.select(['CONTAINS SQL', 'NO SQL', 'READS SQL DATA', 'MODIFIES SQL DATA'], 'CONTAINS SQL', { style: 'width:170px' }), security: NW.select(['DEFINER', 'INVOKER'], 'DEFINER', { style: 'width:110px' }), definer: h('input', { class: 'inp', style: 'width:180px', placeholder: 'current user' }), comment: h('input', { class: 'inp', style: 'width:260px' }) };
        const bar = h('div', { class: 'subbar' }, h('button', { class: 'sb-btn', onclick: () => save() }, NW.svg('save'), 'Save'), h('div', { class: 'sb-sep' }), h('button', { class: 'sb-btn', onclick: () => { if (name) Tools.runRoutine({ conn, db, name, type: f.type.value }); else NW.Toast.warn('Save the routine first.'); } }, NW.svg('run'), 'Run'), h('div', { class: 'sb-spacer' }), h('span', { class: 'muted', text: db }));
        el.appendChild(bar);
        const retRow = h('div', { class: 'form-row' }, h('span', { class: 'sb-label', text: 'Returns:' }), f.returns);
        const head = h('div', { style: 'padding:8px 12px;border-bottom:1px solid var(--border);display:flex;flex-direction:column;gap:8px;background:var(--bg2)' },
          h('div', { class: 'form-row' }, h('span', { class: 'sb-label', text: 'Type:' }), f.type, h('span', { class: 'sb-label', text: 'Name:' }), f.name, retRow),
          h('div', { class: 'form-row', style: 'flex-wrap:wrap' }, h('label', { class: 'chk' }, f.det, 'Deterministic'), h('span', { class: 'sb-label', text: 'Data access:' }), f.access, h('span', { class: 'sb-label', text: 'Security:' }), f.security, h('span', { class: 'sb-label', text: 'Definer:' }), f.definer, h('span', { class: 'sb-label', text: 'Comment:' }), f.comment));
        el.appendChild(head);
        const tabs = NW.subTabs([{ id: 'def', label: 'Definition' }, { id: 'params', label: 'Parameters' }, { id: 'sql', label: 'SQL Preview' }], { onShow: tid => { if (tid === 'sql') { sqlCm.setValue(build().join(';\n\n') + ';'); setTimeout(() => sqlCm.refresh(), 0); } if (tid === 'def') setTimeout(() => cm.refresh(), 0); } });
        el.appendChild(tabs.el);
        const edBox = h('div', { class: 'dz-sql' }); tabs.panels.def.appendChild(edBox);
        const cm = NW.editor(edBox, { value: 'BEGIN\n\t\nEND', placeholder: 'BEGIN … END' });
        cm.on('change', () => NW.Tabs.setDirty(tab.id, key() !== savedKey));
        const pBox = h('div', { class: 'dtable-wrap' }); tabs.panels.params.appendChild(h('div', { class: 'subbar' }, h('button', { class: 'sb-btn', onclick: () => { params.push({ mode: 'IN', name: 'p' + (params.length + 1), type: 'INT' }); renderParams(); } }, NW.svg('plus'), 'Add Parameter'), h('button', { class: 'sb-btn', onclick: () => { params.pop(); renderParams(); } }, NW.svg('minus'), 'Delete Last'))); tabs.panels.params.appendChild(pBox);
        const sqlBox = h('div', { class: 'dz-sql' }); tabs.panels.sql.appendChild(sqlBox);
        const sqlCm = NW.editor(sqlBox, { value: '', readOnly: true });
        const toggleReturns = () => { retRow.style.display = f.type.value === 'function' ? '' : 'none'; };
        const renderParams = () => {
          pBox.innerHTML = '';
          const t = h('table', { class: 'dtable' }, h('thead', null, h('tr', null, h('th', { text: 'Mode', style: 'width:100px' }), h('th', { text: 'Name', style: 'width:220px' }), h('th', { text: 'Type' }))));
          const tb = h('tbody');
          params.forEach(p => tb.appendChild(h('tr', null, h('td', null, f.type.value === 'procedure' ? NW.select(['IN', 'OUT', 'INOUT'], p.mode, { class: 'cell', onchange: e => { p.mode = e.target.value; NW.Tabs.setDirty(tab.id, true); } }) : h('span', { class: 'muted', text: 'IN' })), h('td', null, h('input', { class: 'cell', value: p.name, onchange: e => { p.name = e.target.value.trim(); NW.Tabs.setDirty(tab.id, true); } })), h('td', null, h('input', { class: 'cell', value: p.type, onchange: e => { p.type = e.target.value.trim(); NW.Tabs.setDirty(tab.id, true); } })))));
          t.appendChild(tb); pBox.appendChild(t);
          if (!params.length) pBox.appendChild(h('div', { class: 'obj-empty muted', text: 'No parameters.' }));
        };
        const key = () => JSON.stringify([f.type.value, params, f.returns.value, f.det.checked, f.access.value, f.security.value, f.definer.value, f.comment.value, cm.getValue()]);
        const build = () => {
          const kind = f.type.value === 'procedure' ? 'PROCEDURE' : 'FUNCTION';
          const n = name || f.name.value.trim() || 'routine_name';
          const plist = params.map(p => (kind === 'PROCEDURE' ? p.mode + ' ' : '') + NW.qi(p.name) + ' ' + p.type).join(', ');
          let s = 'CREATE ' + definerClause() + kind + ' ' + NW.qname(db, n) + '(' + plist + ')';
          if (kind === 'FUNCTION') s += '\n  RETURNS ' + (f.returns.value.trim() || 'INT');
          s += (f.det.checked ? '\n  DETERMINISTIC' : '\n  NOT DETERMINISTIC') + '\n  ' + f.access.value + '\n  SQL SECURITY ' + f.security.value + (f.comment.value ? '\n  COMMENT ' + NW.qs(f.comment.value) : '') + '\n' + cm.getValue().trim();
          return [].concat(name ? ['DROP ' + kind + ' IF EXISTS ' + NW.qname(db, n)] : [], [s]);
        };
        const load = async () => {
          if (!name) { toggleReturns(); renderParams(); savedKey = key(); return; }
          try {
            const r = await NW.api('obj.ddl', { conn, db, type: f.type.value, name });
            const i = r.info || {};
            params.length = 0; (i.params || []).filter(p => p.name).forEach(p => params.push({ mode: p.mode || 'IN', name: p.name, type: p.type }));
            f.returns.value = i.returns || ''; f.det.checked = i.deterministic === 'YES'; f.access.value = i.dataAccess || 'CONTAINS SQL'; f.security.value = i.security || 'DEFINER'; origDefiner = i.definer || ''; f.definer.value = origDefiner; f.comment.value = i.comment || '';
            let body = i.body;
            if (!body) { const m = /\)\s*(RETURNS[^\n]*\n)?([\s\S]*?)(BEGIN[\s\S]*|RETURN[\s\S]*|[A-Z]+[\s\S]*)$/i.exec(r.ddl); body = m ? m[3] : r.ddl; }
            cm.setValue(body); toggleReturns(); renderParams(); savedKey = key(); NW.Tabs.setDirty(tab.id, false);
          } catch (e) { NW.Dialog.error(e.message); }
        };
        const save = async () => {
          const n = name || f.name.value.trim();
          if (!n) { NW.Dialog.warn('Enter a name.'); f.name.focus(); return false; }
          if (params.some(p => !p.name || !p.type)) { NW.Dialog.warn('Every parameter needs a name and a type.'); return false; }
          try {
            await runDdl(conn, db, build(), 'Saving…');
            name = n; f.name.disabled = true; f.type.disabled = true; savedKey = key(); NW.Tabs.setDirty(tab.id, false);
            NW.Tabs.setTitle(tab.id, name + ' @' + db + ' (' + NW.connName(conn) + ') - ' + (f.type.value === 'procedure' ? 'Procedure' : 'Function'));
            NW.Toast.ok((f.type.value === 'procedure' ? 'Procedure ' : 'Function ') + name + ' saved'); NW.bus.emit('objects-changed', { conn, db });
            return true;
          } catch (e) { NW.Dialog.error(e.message, 'Save failed'); return false; }
        };
        load();
        setTimeout(() => cm.refresh(), 0);
        return { save, refresh: load, onActivate: () => setTimeout(() => cm.refresh(), 0), onClose: async () => { if (key() === savedKey) return true; const r = await NW.Dialog.msg('question', 'Save changes to ' + (name || f.name.value || 'Untitled') + '?', 'Routine', [{ label: 'Save', primary: true, value: 'save' }, { label: "Don't Save", value: 'no' }, { label: 'Cancel', value: null }]); if (r === 'save') return save(); return r === 'no'; } };
      } });
    },

    /* ---------------------------------------------------------- event designer */
    eventDesigner(o) {
      const conn = o.conn, db = o.db;
      const id = 'event:' + conn + '/' + db + '/' + (o.name || 'new-' + NW.uid());
      return NW.Tabs.open({ id, title: (o.name || 'Untitled') + ' @' + db + ' (' + NW.connName(conn) + ') - Event', icon: 'event', ctx: { conn, db }, create: (el, tab) => {
        let name = o.name || null, savedKey = '', origDefiner = '';
        const f = { name: h('input', { class: 'inp', value: name || '', style: 'width:220px' }), status: NW.select(['ENABLE', 'DISABLE', 'DISABLE ON SLAVE'], 'ENABLE', { style: 'width:150px' }),
          kind: NW.select([{ value: 'AT', label: 'AT (one time)' }, { value: 'EVERY', label: 'EVERY (recurring)' }], 'EVERY', { style: 'width:150px', onchange: () => toggle() }),
          at: h('input', { class: 'inp', style: 'width:170px', placeholder: 'YYYY-MM-DD HH:MM:SS' }), every: h('input', { class: 'inp', type: 'number', style: 'width:70px', value: 1 }), unit: NW.select(['SECOND', 'MINUTE', 'HOUR', 'DAY', 'WEEK', 'MONTH', 'QUARTER', 'YEAR'], 'DAY', { style: 'width:110px' }),
          starts: h('input', { class: 'inp', style: 'width:170px', placeholder: 'optional' }), ends: h('input', { class: 'inp', style: 'width:170px', placeholder: 'optional' }), preserve: h('input', { type: 'checkbox', checked: true }), definer: h('input', { class: 'inp', style: 'width:180px', placeholder: 'current user' }), comment: h('input', { class: 'inp', style: 'width:260px' }) };
        const bar = h('div', { class: 'subbar' }, h('button', { class: 'sb-btn', onclick: () => save() }, NW.svg('save'), 'Save'), h('div', { class: 'sb-spacer' }), h('span', { class: 'muted', text: db }));
        el.appendChild(bar);
        const atRow = h('span', { class: 'form-row' }, h('span', { class: 'sb-label', text: 'At:' }), f.at);
        const everyRow = h('span', { class: 'form-row' }, h('span', { class: 'sb-label', text: 'Every:' }), f.every, f.unit, h('span', { class: 'sb-label', text: 'Starts:' }), f.starts, h('span', { class: 'sb-label', text: 'Ends:' }), f.ends);
        const toggle = () => { atRow.style.display = f.kind.value === 'AT' ? '' : 'none'; everyRow.style.display = f.kind.value === 'AT' ? 'none' : ''; };
        el.appendChild(h('div', { style: 'padding:8px 12px;border-bottom:1px solid var(--border);display:flex;flex-direction:column;gap:8px;background:var(--bg2)' },
          h('div', { class: 'form-row' }, h('span', { class: 'sb-label', text: 'Name:' }), f.name, h('span', { class: 'sb-label', text: 'Status:' }), f.status, h('label', { class: 'chk' }, f.preserve, 'Preserve on completion')),
          h('div', { class: 'form-row', style: 'flex-wrap:wrap' }, h('span', { class: 'sb-label', text: 'Schedule:' }), f.kind, atRow, everyRow),
          h('div', { class: 'form-row' }, h('span', { class: 'sb-label', text: 'Definer:' }), f.definer, h('span', { class: 'sb-label', text: 'Comment:' }), f.comment)));
        const tabs = NW.subTabs([{ id: 'def', label: 'Definition' }, { id: 'sql', label: 'SQL Preview' }], { onShow: tid => { if (tid === 'sql') { sqlCm.setValue(build() + ';'); setTimeout(() => sqlCm.refresh(), 0); } if (tid === 'def') setTimeout(() => cm.refresh(), 0); } });
        el.appendChild(tabs.el);
        const edBox = h('div', { class: 'dz-sql' }); tabs.panels.def.appendChild(edBox);
        const cm = NW.editor(edBox, { value: '', placeholder: 'The statement(s) to run, e.g. DELETE FROM log WHERE created < NOW() - INTERVAL 30 DAY' });
        cm.on('change', () => NW.Tabs.setDirty(tab.id, key() !== savedKey));
        const sqlBox = h('div', { class: 'dz-sql' }); tabs.panels.sql.appendChild(sqlBox);
        const sqlCm = NW.editor(sqlBox, { value: '', readOnly: true });
        const key = () => JSON.stringify([f.name.value, f.status.value, f.kind.value, f.at.value, f.every.value, f.unit.value, f.starts.value, f.ends.value, f.preserve.checked, f.definer.value, f.comment.value, cm.getValue()]);
        const build = () => {
          const n = f.name.value.trim() || name || 'event_name';
          let sched = f.kind.value === 'AT' ? 'AT ' + NW.qs(f.at.value.trim()) : 'EVERY ' + (+f.every.value || 1) + ' ' + f.unit.value + (f.starts.value.trim() ? ' STARTS ' + NW.qs(f.starts.value.trim()) : '') + (f.ends.value.trim() ? ' ENDS ' + NW.qs(f.ends.value.trim()) : '');
          let body = cm.getValue().trim().replace(/;\s*$/, '');
          if (/;/.test(body) && !/^begin\b/i.test(body)) body = 'BEGIN\n' + body + ';\nEND';
          const dv = f.definer.value.trim();
          const def = dv && dv !== origDefiner ? 'DEFINER=' + definerLit(dv) + ' ' : '';
          if (!name) return 'CREATE ' + def + 'EVENT ' + NW.qname(db, n) + '\n  ON SCHEDULE ' + sched + '\n  ON COMPLETION ' + (f.preserve.checked ? 'PRESERVE' : 'NOT PRESERVE') + '\n  ' + f.status.value + (f.comment.value ? '\n  COMMENT ' + NW.qs(f.comment.value) : '') + '\n  DO ' + body;
          return 'ALTER ' + def + 'EVENT ' + NW.qname(db, name) + '\n  ON SCHEDULE ' + sched + '\n  ON COMPLETION ' + (f.preserve.checked ? 'PRESERVE' : 'NOT PRESERVE') + (n !== name ? '\n  RENAME TO ' + NW.qname(db, n) : '') + '\n  ' + f.status.value + (f.comment.value ? '\n  COMMENT ' + NW.qs(f.comment.value) : '') + '\n  DO ' + body;
        };
        const load = async () => {
          toggle();
          if (!name) { savedKey = key(); return; }
          try {
            const r = await NW.api('obj.ddl', { conn, db, type: 'event', name }); const i = r.info || {};
            f.kind.value = i.type === 'ONE TIME' ? 'AT' : 'EVERY'; f.at.value = NW.fmt.date(i.executeAt); f.every.value = i.intervalValue || 1; if (i.intervalField) f.unit.value = i.intervalField; f.starts.value = NW.fmt.date(i.starts); f.ends.value = NW.fmt.date(i.ends);
            f.status.value = i.status === 'ENABLED' ? 'ENABLE' : (i.status === 'SLAVESIDE_DISABLED' ? 'DISABLE ON SLAVE' : 'DISABLE'); f.preserve.checked = (i.onCompletion || '') === 'PRESERVE'; origDefiner = i.definer || ''; f.definer.value = origDefiner; f.comment.value = i.comment || '';
            cm.setValue(i.body || ''); toggle(); savedKey = key(); NW.Tabs.setDirty(tab.id, false);
          } catch (e) { NW.Dialog.error(e.message); }
        };
        const save = async () => {
          const n = f.name.value.trim();
          if (!n) { NW.Dialog.warn('Enter a name.'); f.name.focus(); return false; }
          if (!cm.getValue().trim()) { NW.Dialog.warn('Enter the statement the event runs.'); return false; }
          try {
            await runDdl(conn, db, [build()], 'Saving event…');
            name = n; savedKey = key(); NW.Tabs.setDirty(tab.id, false);
            NW.Tabs.setTitle(tab.id, name + ' @' + db + ' (' + NW.connName(conn) + ') - Event');
            NW.Toast.ok('Event ' + name + ' saved'); NW.bus.emit('objects-changed', { conn, db });
            return true;
          } catch (e) { NW.Dialog.error(e.message, 'Save failed'); return false; }
        };
        load();
        setTimeout(() => cm.refresh(), 0);
        return { save, refresh: load, onActivate: () => setTimeout(() => cm.refresh(), 0), onClose: async () => { if (key() === savedKey) return true; const r = await NW.Dialog.msg('question', 'Save changes to event ' + (name || f.name.value || 'Untitled') + '?', 'Event', [{ label: 'Save', primary: true, value: 'save' }, { label: "Don't Save", value: 'no' }, { label: 'Cancel', value: null }]); if (r === 'save') return save(); return r === 'no'; } };
      } });
    },

    /* ---------------------------------------------------------- options */
    options() {
      const theme = NW.select([{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }], NW.settings.get('theme', 'light'));
      const fs = NW.select(['11', '12', '13', '14', '15', '16'], String(NW.settings.get('fontSize', 12)));
      const limit = h('input', { class: 'inp', type: 'number', min: 10, max: 10000, value: NW.settings.get('limit', 1000) });
      const old = h('input', { class: 'inp', type: 'password', autocomplete: 'current-password' }), nw1 = h('input', { class: 'inp', type: 'password', autocomplete: 'new-password' }), nw2 = h('input', { class: 'inp', type: 'password', autocomplete: 'new-password' });
      const tabs = NW.subTabs([{ id: 'general', label: 'General' }, { id: 'security', label: 'Password' }, { id: 'about', label: 'About' }], { cls: 'dtabs', tabCls: 'dtab', panelCls: 'dpanel' });
      tabs.panels.general.appendChild(h('div', { class: 'form-grid' }, ...NW.formRow('Theme:', theme), ...NW.formRow('Font size:', fs), ...NW.formRow('Rows per page:', limit, 'Default LIMIT for table data and query results')));
      tabs.panels.security.appendChild(h('div', { class: 'form-grid' }, ...NW.formRow('Current password:', old), ...NW.formRow('New password:', nw1), ...NW.formRow('Confirm new password:', nw2), h('span'), h('div', { class: 'muted small', text: 'Leave empty to keep the current password.' })));
      tabs.panels.about.appendChild(h('div', null, h('div', { class: 'login-brand', style: 'margin:0 0 10px' }, h('img', { src: 'img/logo.svg', width: 48, height: 48 }), h('div', null, h('div', { style: 'font-size:16px;font-weight:600', text: NW.appName + ' for MySQL' }), h('div', { class: 'muted', text: 'Version ' + NW.version + ' • PHP ' + (NW.state.info.php || '') }))),
        h('p', { class: 'small', text: 'A browser-based database manager for MySQL and MariaDB in the style of Navicat: connections, object browser, table data editing, table designer, query editor, views, functions, events, users, server monitor, dumps and imports.' }),
        h('p', { class: 'small muted', text: 'Open source (MIT). Not affiliated with PremiumSoft CyberTech Ltd. Navicat is a trademark of its owner.' })));
      tabs.el.style.minHeight = '260px';
      NW.Dialog.open({ title: 'Options', icon: 'settings', body: tabs.el, width: 520, buttons: [{ label: 'OK', primary: true, onClick: async () => {
        NW.settings.set('theme', theme.value); NW.settings.set('fontSize', +fs.value); NW.settings.set('limit', Math.max(10, +limit.value || 1000)); NW.applyTheme();
        if (nw1.value || nw2.value || old.value) { if (nw1.value !== nw2.value) throw new Error('The new passwords do not match.'); await NW.api('app.password.change', { old: old.value, new: nw1.value }); NW.Toast.ok('Password changed'); }
      } }, { label: 'Cancel', value: null }] });
    },
  };
  NW.Tools = Tools;
})();

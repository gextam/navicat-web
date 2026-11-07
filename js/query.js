/* Navicat Web - query editor tab with results, messages, explain, history, saved queries */
(function () {
  'use strict';
  const NW = window.NW, h = NW.h;
  const hintCache = {};

  NW.Query = {
    open(o) {
      o = o || {};
      const id = o.savedId ? 'query:' + o.conn + '/saved/' + o.savedId : 'query:' + o.conn + '/' + NW.uid();
      return NW.Tabs.open({ id, title: (o.name || 'Untitled') + (o.db ? ' @' + o.db : '') + ' (' + NW.connName(o.conn) + ') - Query', icon: 'query', ctx: { conn: o.conn, db: o.db || null },
        create: (el, tab) => new QueryTab(el, tab, o) });
    },
    async hints(conn, db) {
      if (!db) return {};
      const key = conn + '|' + db;
      if (!hintCache[key] || Date.now() - hintCache[key].at > 120000) {
        hintCache[key] = { at: Date.now(), p: NW.api('db.columns', { conn, db }).then(r => r.tables).catch(() => ({})) };
      }
      return hintCache[key].p;
    },
    invalidateHints(conn, db) { delete hintCache[conn + '|' + db]; },
  };
  NW.bus.on('objects-changed', d => NW.Query.invalidateHints(d.conn, d.db));

  const KEYWORDS = 'SELECT FROM WHERE AND OR NOT IN IS NULL LIKE BETWEEN JOIN INNER LEFT RIGHT OUTER CROSS ON AS GROUP BY ORDER HAVING LIMIT OFFSET UNION ALL DISTINCT INSERT INTO VALUES UPDATE SET DELETE CREATE TABLE ALTER DROP INDEX VIEW TRIGGER PROCEDURE FUNCTION IF EXISTS PRIMARY KEY FOREIGN REFERENCES DEFAULT AUTO_INCREMENT UNSIGNED CHARACTER COLLATE ENGINE CASE WHEN THEN ELSE END ASC DESC COUNT SUM AVG MIN MAX SHOW DESCRIBE EXPLAIN USE DATABASE TRUNCATE REPLACE WITH RECURSIVE CALL BEGIN COMMIT ROLLBACK START TRANSACTION GRANT REVOKE TO IDENTIFIED'.split(' ');
  const NEWLINE_BEFORE = /^(SELECT|FROM|WHERE|GROUP BY|ORDER BY|HAVING|LIMIT|UNION( ALL)?|INSERT INTO|VALUES|UPDATE|SET|DELETE FROM|(INNER |LEFT( OUTER)? |RIGHT( OUTER)? |CROSS |FULL )?JOIN|ON)$/i;

  function beautify(sql) {
    const out = [];
    NW.splitSql(sql).forEach(st => {
      const s = st.sql;
      const toks = []; let i = 0, depth = 0;
      while (i < s.length) {
        const c = s[i];
        if (/\s/.test(c)) { i++; continue; }
        if (c === "'" || c === '"' || c === '`') { let j = i + 1; while (j < s.length && s[j] !== c) { if (s[j] === '\\' && c !== '`') j++; j++; } toks.push({ t: s.slice(i, j + 1), k: 'str' }); i = j + 1; continue; }
        if (c === '-' && s[i + 1] === '-') { let j = s.indexOf('\n', i); if (j < 0) j = s.length; toks.push({ t: s.slice(i, j), k: 'cmt' }); i = j; continue; }
        if (c === '/' && s[i + 1] === '*') { let j = s.indexOf('*/', i + 2); j = j < 0 ? s.length : j + 2; toks.push({ t: s.slice(i, j), k: 'cmt' }); i = j; continue; }
        if (/[(),;]/.test(c)) { toks.push({ t: c, k: 'p' }); i++; continue; }
        let j = i; while (j < s.length && !/[\s(),;'"`]/.test(s[j])) j++;
        const w = s.slice(i, j);
        toks.push({ t: KEYWORDS.includes(w.toUpperCase()) ? w.toUpperCase() : w, k: 'w' }); i = j;
      }
      let res = '', line = '';
      const flush = () => { if (line.trim()) res += (res ? '\n' : '') + line.replace(/\s+$/, ''); line = ''; };
      for (let k = 0; k < toks.length; k++) {
        const tk = toks[k];
        let phrase = tk.t;
        if (tk.k === 'w') { /* merge two-word clauses */
          const nxt = toks[k + 1];
          if (nxt && nxt.k === 'w') { const two = (tk.t + ' ' + nxt.t).toUpperCase(); if (/^(GROUP BY|ORDER BY|INSERT INTO|DELETE FROM|UNION ALL|LEFT JOIN|RIGHT JOIN|INNER JOIN|CROSS JOIN|FULL JOIN|OUTER JOIN|LEFT OUTER|RIGHT OUTER|NOT IN|IS NOT|NOT LIKE|NOT EXISTS)$/.test(two)) { phrase = two; k++; } }
          if (depth === 0 && NEWLINE_BEFORE.test(phrase)) { flush(); line = '  '.repeat(0) + phrase + ' '; continue; }
          if (depth === 0 && /^(AND|OR)$/i.test(phrase)) { flush(); line = '  ' + phrase + ' '; continue; }
        }
        if (tk.t === '(') { depth++; line += '('; continue; }
        if (tk.t === ')') { depth = Math.max(0, depth - 1); line = line.replace(/\s+$/, '') + ') '; continue; }
        if (tk.t === ',') { line = line.replace(/\s+$/, '') + ','; if (depth === 0) { flush(); line = '       '; } else line += ' '; continue; }
        line += phrase + ' ';
      }
      flush();
      out.push(res.replace(/\n\s*\n/g, '\n') + ';');
    });
    return out.join('\n\n');
  }
  NW.beautifySql = beautify;

  class QueryTab {
    constructor(el, tab, o) {
      this.el = el; this.tab = tab; this.conn = o.conn; this.db = o.db || null; this.name = o.name || null; this.savedId = o.savedId || null;
      this.savedSql = o.sql || ''; this.running = false; this.results = []; this.limit = NW.settings.get('limit', 1000); this.useLimit = true;
      this._build(o.sql || '');
      if (o.autoRun && o.sql) setTimeout(() => this.run('all'), 50);
    }
    _build(sql) {
      const el = this.el;
      const btn = (label, icon, fn, title) => h('button', { class: 'sb-btn', title: title || label, onclick: fn }, NW.svg(icon), label);
      this.btnRun = btn('Run', 'run', () => this.run('auto'), 'Run (Ctrl+R / F9). Runs the selection if there is one.');
      this.btnRun.appendChild(h('span', { class: 'caret', text: '▾', onclick: e => { e.stopPropagation(); NW.Menu.show([{ label: 'Run', shortcut: 'Ctrl+R', onClick: () => this.run('all') }, { label: 'Run Selected', shortcut: 'Ctrl+Shift+R', onClick: () => this.run('selected') }, { label: 'Run Current Statement', shortcut: 'Ctrl+Enter', onClick: () => this.run('current') }], e.target); } }));
      this.btnStop = btn('Stop', 'stop', () => this.stop()); this.btnStop.disabled = true;
      this.connSel = NW.select(NW.state.connections.filter(c => NW.connState(c.id).open).map(c => ({ value: c.id, label: c.name })), this.conn, { style: 'width:150px', onchange: e => { this.conn = e.target.value; this.db = null; this._fillDbs(); this._updateTitle(); } });
      this.dbSel = NW.select([], this.db, { style: 'width:150px', onchange: e => { this.db = e.target.value || null; this.tab.ctx = { conn: this.conn, db: this.db }; this._updateTitle(); this._loadHints(); } });
      this._fillDbs();
      this.limitChk = h('input', { type: 'checkbox', checked: true, onchange: e => this.useLimit = e.target.checked });
      this.limitInp = h('input', { class: 'lim-inp', value: this.limit, style: 'width:60px;height:22px', onchange: e => { const v = parseInt(e.target.value, 10); if (v > 0) this.limit = v; } });
      this.bar = h('div', { class: 'subbar' },
        this.btnRun, this.btnStop, btn('Explain', 'explain', () => this.explain()),
        h('div', { class: 'sb-sep' }),
        btn('Save', 'save', () => this.save(), 'Save (Ctrl+S)'), btn('Save As', 'save', () => this.save(true)),
        h('div', { class: 'sb-sep' }),
        btn('Beautify', 'beautify', () => this.beautify()), btn('History', 'history', () => this.history()),
        h('div', { class: 'sb-sep' }),
        btn('Export Result', 'export', () => this.exportResult()),
        h('div', { class: 'sb-spacer' }),
        h('span', { class: 'sb-label', text: 'Connection:' }), this.connSel, h('span', { class: 'sb-label', text: 'Database:' }), this.dbSel,
        h('label', { class: 'chk', style: 'margin-left:8px' }, this.limitChk, 'Limit'), this.limitInp);
      el.appendChild(this.bar);
      this.edBox = h('div', { class: 'qe-editor' });
      el.appendChild(this.edBox);
      this.cm = NW.editor(this.edBox, {
        value: sql, placeholder: 'Type SQL here. Ctrl+R runs everything, Ctrl+Enter runs the statement under the cursor, Ctrl+Space completes names.',
        extraKeys: { 'Ctrl-R': () => this.run('auto'), 'F9': () => this.run('auto'), 'Ctrl-Enter': () => this.run('current'), 'Shift-Ctrl-R': () => this.run('selected'), 'Ctrl-S': () => this.save(), 'F5': () => this.run('auto') },
        hintOptions: { completeSingle: false, tables: {} },
      });
      this.cm.on('change', () => { NW.Tabs.setDirty(this.tab.id, this.cm.getValue() !== this.savedSql); });
      this.cm.on('inputRead', (cm, ch) => { if (ch.origin !== '+input') return; const t = ch.text[0]; if (/[\w.`]/.test(t) && !cm.state.completionActive) { const tok = cm.getTokenAt(cm.getCursor()); if (tok.string.length >= 2 || t === '.') cm.showHint({ completeSingle: false }); } });
      const split = h('div', { class: 'hsplitter' }); el.appendChild(split);
      this.resBox = h('div', { class: 'qe-results' }); el.appendChild(this.resBox);
      NW.makeSplitter(split, this.edBox, 'row');
      this.rtabs = h('div', { class: 'qe-rtabs' }); this.resBox.appendChild(this.rtabs);
      this.rpanels = h('div', { style: 'flex:1;display:flex;flex-direction:column;min-height:0' }); this.resBox.appendChild(this.rpanels);
      this._renderResults();
      this._loadHints();
      setTimeout(() => { this.cm.refresh(); this.cm.focus(); }, 0);
    }
    _fillDbs() {
      const dbs = (NW.connState(this.conn).databases || []).map(d => d.name);
      this.dbSel.innerHTML = '';
      this.dbSel.appendChild(h('option', { value: '', text: '(none)' }));
      dbs.forEach(d => this.dbSel.appendChild(h('option', { value: d, text: d, selected: d === this.db })));
      if (this.db && !dbs.includes(this.db)) this.dbSel.appendChild(h('option', { value: this.db, text: this.db, selected: true }));
    }
    _updateTitle() { NW.Tabs.setTitle(this.tab.id, (this.name || 'Untitled') + (this.db ? ' @' + this.db : '') + ' (' + NW.connName(this.conn) + ') - Query'); this.tab.ctx = { conn: this.conn, db: this.db }; }
    async _loadHints() {
      const tables = await NW.Query.hints(this.conn, this.db);
      const map = {}; Object.keys(tables).forEach(t => { map[t] = tables[t]; });
      this.cm.setOption('hintOptions', { completeSingle: false, tables: map, defaultTable: null });
    }

    /* ---------------------------------------------------------- running */
    _sqlFor(mode) {
      if (mode === 'selected' || (mode === 'auto' && this.cm.somethingSelected())) return this.cm.getSelection();
      if (mode === 'current') {
        const text = this.cm.getValue(); const pos = this.cm.indexFromPos(this.cm.getCursor());
        const parts = NW.splitSql(text);
        let st = parts.find(p => pos >= p.from && pos <= p.to + 1);
        if (!st) st = parts.filter(p => p.from <= pos).pop() || parts[0];
        if (st) { this.cm.setSelection(this.cm.posFromIndex(st.from), this.cm.posFromIndex(st.to)); return st.sql; }
        return text;
      }
      return this.cm.getValue();
    }
    async run(mode) {
      if (this.running) return;
      const sql = this._sqlFor(mode || 'all');
      if (!sql.trim()) { NW.Toast.warn('Nothing to run.'); return; }
      this.running = true; this.runId = NW.uid(); this.btnRun.disabled = true; this.btnStop.disabled = false;
      NW.status.right('Running…');
      const t0 = performance.now();
      try {
        const r = await NW.api('query.run', { conn: this.conn, db: this.db || '', sql, limit: this.useLimit ? this.limit : 0, runId: this.runId, stopOnError: true });
        this.results = r.results; this.totalTime = r.time;
        this._renderResults(sql);
        const errors = r.results.filter(x => x.type === 'error').length;
        NW.status.right((errors ? errors + ' error(s) • ' : '') + r.statements + ' statement(s) • ' + NW.fmt.time(r.time));
        this._maybeRefreshTree(sql);
      } catch (e) {
        this.results = [{ type: 'error', error: e.message, sql, time: (performance.now() - t0) / 1000 }];
        this._renderResults(sql);
      } finally { this.running = false; this.btnRun.disabled = false; this.btnStop.disabled = true; }
    }
    _maybeRefreshTree(sql) {
      if (/\b(CREATE|DROP|ALTER|RENAME)\s+(TABLE|VIEW|FUNCTION|PROCEDURE|EVENT|TRIGGER|INDEX)\b/i.test(sql) && this.db) NW.bus.emit('objects-changed', { conn: this.conn, db: this.db });
      if (/\b(CREATE|DROP)\s+(DATABASE|SCHEMA)\b/i.test(sql)) NW.Tree.refreshConnection(this.conn);
    }
    async stop() {
      if (!this.running) return;
      try { await NW.api('query.kill', { conn: this.conn, runId: this.runId }); NW.Toast.info('Stop requested'); } catch (e) { NW.Toast.warn(e.message); }
    }
    async explain() {
      const sql = this._sqlFor('auto');
      if (!sql.trim()) return;
      try {
        const r = await NW.api('query.explain', { conn: this.conn, db: this.db || '', sql });
        this.results = r.results.map(x => Object.assign(x, { explain: true })); this.totalTime = r.results.reduce((a, b) => a + (b.time || 0), 0);
        this._renderResults(sql);
      } catch (e) { NW.Dialog.error(e.message, 'Explain'); }
    }

    /* ---------------------------------------------------------- results */
    _renderResults(sql) {
      this.rtabs.innerHTML = ''; this.rpanels.innerHTML = '';
      const panels = [];
      let n = 0;
      const rowResults = this.results.filter(r => r.type === 'rows');
      rowResults.forEach(r => {
        n++;
        const p = h('div', { class: 'qe-rpanel' });
        const gridWrap = h('div', { style: 'flex:1;display:flex;flex-direction:column;min-height:0' });
        p.appendChild(gridWrap);
        const cols = r.fields.map(f => Object.assign({}, f));
        const grid = new NW.DataGrid(gridWrap, { clientSort: true, tableName: (r.fields[0] && r.fields[0].orgTable) || 'table',
          onCellContext: (ri, ci, e) => NW.Menu.show([
            { label: 'Copy', icon: 'copy', shortcut: 'Ctrl+C', onClick: () => NW.copyText(grid.copySelection()) },
            { label: 'Copy As', children: [
              { label: 'Tab Separated Values (Data)', onClick: () => NW.copyText(grid.copySelection('rows')) },
              { label: 'Tab Separated Values (Field names and data)', onClick: () => NW.copyText(grid.copySelection('tsvh')) },
              { label: 'CSV', onClick: () => NW.copyText(grid.copySelection('csv')) },
              { label: 'JSON', onClick: () => NW.copyText(grid.copySelection('json')) },
              { label: 'INSERT Statements', onClick: () => NW.copyText(grid.copySelection('sql')) }] },
            '-',
            { label: 'View Cell Value...', icon: 'edit', onClick: () => NW.CellViewer.open({ value: grid.rows[ri][ci], col: cols[ci], readOnly: true }) },
            '-',
            { label: 'Export Result...', icon: 'export', onClick: () => this.exportResult(r) },
            { label: 'Open Table ' + (cols[ci].orgTable || ''), hidden: !cols[ci].orgTable, onClick: () => NW.TableTab.open({ conn: this.conn, db: cols[ci].db || this.db, table: cols[ci].orgTable }) },
          ], e.clientX, e.clientY),
          onCellDblClick: (ri, ci) => { NW.CellViewer.open({ value: grid.rows[ri][ci], col: cols[ci], readOnly: true }); return true; } });
        grid.setData(cols, r.rows);
        const foot = h('div', { class: 'grid-foot' }, h('span', { class: 'sqltext', text: r.sql.replace(/\s+/g, ' ').slice(0, 300), title: r.sql }),
          h('span', { class: 'muted', text: NW.fmt.num(r.count) + ' row' + (r.count === 1 ? '' : 's') + (r.truncated ? ' (limited to ' + NW.fmt.num(r.count) + ', more available)' : '') }),
          h('span', { class: 'muted', text: 'Query time: ' + NW.fmt.time(r.time) }));
        p.appendChild(foot);
        panels.push({ id: 'r' + n, label: r.explain ? 'Explain ' + n : 'Result ' + n, el: p, result: r });
      });
      const msgPanel = h('div', { class: 'qe-rpanel' });
      const msg = h('div', { class: 'qe-msg' });
      if (!this.results.length) msg.appendChild(h('span', { class: 'm-dim', text: 'Results and messages appear here after you run a statement.' }));
      let lastIdx = null;
      this.results.forEach(r => {
        if (r.index === undefined || r.index !== lastIdx) msg.appendChild(h('div', { class: 'm-sql', text: '[SQL] ' + (r.sql || '').trim() }));
        lastIdx = r.index;
        if (r.type === 'error') msg.appendChild(h('div', { class: 'm-err', text: '[Err] ' + (r.errno ? r.errno + ' - ' : '') + r.error }));
        else if (r.type === 'rows') msg.appendChild(h('div', { class: 'm-ok', text: 'OK, ' + NW.fmt.num(r.count) + ' row' + (r.count === 1 ? '' : 's') + (r.truncated ? ' (limited)' : '') + ' returned' }));
        else {
          msg.appendChild(h('div', { class: 'm-ok', text: 'OK' + (r.affected >= 0 ? ', affected rows: ' + r.affected : '') + (r.insertId ? ', last insert id: ' + r.insertId : '') + (r.info ? ' - ' + r.info : '') }));
          (r.warningList || []).forEach(w => msg.appendChild(h('div', { class: 'm-err', text: '[' + w.Level + '] ' + w.Code + ' - ' + w.Message })));
        }
        msg.appendChild(h('div', { class: 'm-dim', text: 'Time: ' + NW.fmt.time(r.time) + '\n' }));
      });
      if (this.results.length) msg.appendChild(h('div', { class: 'm-dim', text: 'Total time: ' + NW.fmt.time(this.totalTime || 0) }));
      msgPanel.appendChild(msg);
      const hasErr = this.results.some(r => r.type === 'error');
      panels.push({ id: 'msg', label: 'Message', el: msgPanel, err: hasErr });
      panels.forEach(p => {
        this.rtabs.appendChild(h('div', { class: 'qe-rtab' + (p.err ? ' err' : ''), dataset: { id: p.id }, text: p.label, onclick: () => this._showResult(p.id) }));
        this.rpanels.appendChild(p.el);
      });
      this.panels = panels;
      this._showResult(hasErr || !rowResults.length ? 'msg' : 'r1');
    }
    _showResult(id) {
      this.panels.forEach(p => p.el.classList.toggle('active', p.id === id));
      NW.$$('.qe-rtab', this.rtabs).forEach(t => t.classList.toggle('active', t.dataset.id === id));
      this.activeResult = id;
    }
    exportResult(r) {
      if (!r) { const p = (this.panels || []).find(x => x.id === this.activeResult && x.result); r = p ? p.result : (this.results.find(x => x.type === 'rows')); }
      if (!r) { NW.Toast.warn('Run a query that returns rows first.'); return; }
      NW.ExportWizard.open({ conn: this.conn, db: this.db, sql: r.sql, name: (this.name || 'query_result').replace(/\W+/g, '_'), total: r.truncated ? null : r.count });
    }

    /* ---------------------------------------------------------- save / history / beautify */
    async save(as) {
      const sql = this.cm.getValue();
      let name = this.name;
      if (as || !this.savedId) {
        name = await NW.Dialog.prompt({ title: as ? 'Save Query As' : 'Save Query', label: 'Query name:', value: name || '', validate: v => v.trim() ? '' : 'A name is required' });
        if (name === null) return false;
      }
      try {
        const r = await NW.api('query.saved.save', { id: as ? '' : (this.savedId || ''), conn: this.conn, db: this.db || '', name: name.trim(), sql });
        this.savedId = r.query.id; this.name = r.query.name; this.savedSql = sql;
        this._updateTitle(); NW.Tabs.setDirty(this.tab.id, false);
        NW.Toast.ok('Query saved');
        NW.bus.emit('queries-changed', { conn: this.conn });
        return true;
      } catch (e) { NW.Dialog.error(e.message, 'Save failed'); return false; }
    }
    async history() {
      try {
        const r = await NW.api('query.history.list', { conn: this.conn, limit: 200 });
        const list = h('div', { class: 'listbox', style: 'height:360px' });
        if (!r.history.length) list.appendChild(h('div', { class: 'obj-empty muted', text: 'No history yet.' }));
        r.history.forEach(e => {
          const row = h('div', { class: 'li', style: 'flex-direction:column;align-items:stretch;border-bottom:1px solid var(--border2)', title: 'Click to insert into the editor' },
            h('div', { class: 'small muted' }, NW.fmt.date(e.at) + ' • ' + (e.db || '') + ' • ' + e.ms + ' ms • ' + (e.ok ? 'OK' : 'Error: ' + (e.error || ''))),
            h('div', { class: 'history-sql', text: e.sql }));
          row.addEventListener('click', () => { this.cm.replaceSelection(e.sql + '\n'); dlg.close(); this.cm.focus(); });
          list.appendChild(row);
        });
        const dlg = NW.Dialog.open({ title: 'Query History - ' + NW.connName(this.conn), icon: 'history', body: list, width: 720, buttons: [{ label: 'Close', value: null }],
          left: h('button', { class: 'btn', onclick: async () => { if (await NW.Dialog.confirm('Clear the whole history of this connection?')) { await NW.api('query.history.clear', { conn: this.conn }); dlg.close(); } } }, 'Clear History') });
      } catch (e) { NW.Dialog.error(e.message); }
    }
    beautify() {
      const sel = this.cm.somethingSelected();
      const src = sel ? this.cm.getSelection() : this.cm.getValue();
      const out = beautify(src);
      if (sel) this.cm.replaceSelection(out); else this.cm.setValue(out);
    }
    refresh() { this.run('all'); }
    onActivate() { setTimeout(() => this.cm.refresh(), 0); }
    async onClose() {
      if (this.cm.getValue() === this.savedSql || !this.cm.getValue().trim()) return true;
      const r = await NW.Dialog.msg('question', 'Save changes to query ' + (this.name || 'Untitled') + '?', 'Query', [{ label: 'Save', primary: true, value: 'save' }, { label: "Don't Save", value: 'no' }, { label: 'Cancel', value: null }]);
      if (r === 'save') return this.save();
      return r === 'no';
    }
  }
})();

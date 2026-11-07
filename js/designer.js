/* Navicat Web - table designer: Fields, Indexes, Foreign Keys, Triggers, Options, Comment, SQL Preview */
(function () {
  'use strict';
  const NW = window.NW, h = NW.h;

  const TYPES = ['tinyint', 'smallint', 'mediumint', 'int', 'bigint', 'decimal', 'float', 'double', 'bit', 'boolean',
    'char', 'varchar', 'tinytext', 'text', 'mediumtext', 'longtext', 'binary', 'varbinary', 'tinyblob', 'blob', 'mediumblob', 'longblob',
    'enum', 'set', 'json', 'date', 'datetime', 'timestamp', 'time', 'year',
    'geometry', 'point', 'linestring', 'polygon', 'multipoint', 'multilinestring', 'multipolygon', 'geometrycollection'];
  const T = {
    isInt: t => /^(tinyint|smallint|mediumint|int|integer|bigint)$/.test(t),
    isNum: t => /^(tinyint|smallint|mediumint|int|integer|bigint|decimal|numeric|float|double|real|bit|boolean|bool)$/.test(t),
    hasLen: t => /^(tinyint|smallint|mediumint|int|integer|bigint|decimal|numeric|float|double|real|bit|char|varchar|binary|varbinary|datetime|timestamp|time)$/.test(t),
    hasDec: t => /^(decimal|numeric|float|double|real)$/.test(t),
    isString: t => /^(char|varchar|tinytext|text|mediumtext|longtext|enum|set)$/.test(t),
    hasValues: t => /^(enum|set)$/.test(t),
    isTime: t => /^(timestamp|datetime)$/.test(t),
    noDefault: t => /^(tinytext|text|mediumtext|longtext|tinyblob|blob|mediumblob|longblob|json|geometry|point|linestring|polygon|multipoint|multilinestring|multipolygon|geometrycollection)$/.test(t),
  };
  const FK_ACTIONS = ['RESTRICT', 'CASCADE', 'SET NULL', 'NO ACTION'];

  NW.Designer = {
    open(o) {
      const id = 'design:' + o.conn + '/' + o.db + '/' + (o.table || ('new-' + NW.uid()));
      return NW.Tabs.open({ id, title: (o.table || 'Untitled') + ' @' + o.db + ' (' + NW.connName(o.conn) + ') - Table', icon: 'design', ctx: { conn: o.conn, db: o.db },
        create: (el, tab) => new TableDesigner(el, tab, o) });
    },
  };

  /* ---------------------------------------------------------- model helpers */
  function parseColType(colType) {
    const m = /^(\w+)(?:\((.*)\))?(.*)$/s.exec((colType || '').trim());
    const r = { type: m ? m[1].toLowerCase() : 'varchar', length: '', decimals: '', values: [], unsigned: false, zerofill: false };
    if (!m) return r;
    const args = m[2] || '', rest = m[3] || '';
    r.unsigned = /unsigned/i.test(rest); r.zerofill = /zerofill/i.test(rest);
    if (T.hasValues(r.type)) r.values = NW.parseEnumValues(r.type + '(' + args + ')');
    else if (args) { const p = args.split(',').map(s => s.trim()); r.length = p[0] || ''; r.decimals = p[1] || ''; }
    if (r.type === 'integer') r.type = 'int';
    if (r.type === 'bool') r.type = 'boolean';
    return r;
  }
  function defaultFrom(row) {
    const d = row.dflt, extra = (row.extra || '').toUpperCase(), type = (row.dataType || '').toLowerCase();
    if (d === null || d === undefined) return { kind: 'none', value: '' };
    if (typeof d === 'string' && d.toUpperCase() === 'NULL' && !/DEFAULT_GENERATED/.test(extra)) return { kind: 'null', value: '' };
    if (/DEFAULT_GENERATED/.test(extra)) return { kind: 'expr', value: d };
    if (/^current_timestamp(\(\d*\))?$/i.test(d) || /^now\(\)$/i.test(d)) return { kind: 'expr', value: d };
    let v = d;
    if (/^'.*'$/s.test(v) && !T.isNum(type)) v = v.slice(1, -1).replace(/''/g, "'").replace(/\\'/g, "'"); /* MariaDB quotes literals */
    else if (/^[a-z_]+\(.*\)$/i.test(v)) return { kind: 'expr', value: v };
    if (v === '') return { kind: 'empty', value: '' };
    return { kind: 'literal', value: v };
  }
  function colFromRow(row) {
    const p = parseColType(row.colType);
    const extra = row.extra || '';
    return {
      name: row.name, origName: row.name, type: p.type, length: p.length, decimals: p.decimals, values: p.values,
      unsigned: p.unsigned, zerofill: p.zerofill, notNull: row.nullable === 'NO', pk: row.colKey === 'PRI', pkOrder: 0,
      autoInc: /auto_increment/i.test(extra), onUpdate: /on update current_timestamp/i.test(extra),
      virtual: /GENERATED/i.test(extra) && !/DEFAULT_GENERATED/i.test(extra), virtualStored: /STORED GENERATED/i.test(extra), virtualExpr: row.genExpr || '',
      charset: row.charset || '', collation: row.collation || '', comment: row.comment || '', dflt: defaultFrom(row),
    };
  }
  function typeSpec(c) {
    let t = c.type.toUpperCase();
    if (T.hasValues(c.type)) t += '(' + (c.values || []).map(v => NW.qs(v)).join(',') + ')';
    else if (c.type === 'boolean') t = 'TINYINT(1)';
    else if (T.hasLen(c.type) && c.length !== '' && c.length !== null && c.length !== undefined) {
      t += '(' + c.length + (T.hasDec(c.type) && c.decimals !== '' && c.decimals !== null && c.decimals !== undefined ? ',' + c.decimals : '') + ')';
    }
    if (c.unsigned && T.isNum(c.type)) t += ' UNSIGNED';
    if (c.zerofill && T.isNum(c.type)) t += ' ZEROFILL';
    return t;
  }
  function defaultClause(c) {
    const d = c.dflt || { kind: 'none' };
    if (c.virtual || c.autoInc) return '';
    switch (d.kind) {
      case 'null': return ' DEFAULT NULL';
      case 'empty': return " DEFAULT ''";
      case 'expr': { let v = String(d.value || '').trim(); if (!v) return ''; if (!/^current_timestamp(\(\d*\))?$/i.test(v) && !/^now\(\)$/i.test(v) && !/^\(.*\)$/s.test(v)) v = '(' + v + ')'; return ' DEFAULT ' + v; }
      case 'literal': { const v = String(d.value); if (T.isNum(c.type) && /^-?\d+(\.\d+)?$/.test(v)) return ' DEFAULT ' + v; if (c.type === 'bit' && /^b'[01]+'$/i.test(v)) return ' DEFAULT ' + v; return ' DEFAULT ' + NW.qs(v); }
    }
    return '';
  }
  function colDef(c, tableCollation) {
    let s = NW.qi(c.name) + ' ' + typeSpec(c);
    if (T.isString(c.type) && c.charset && c.collation && c.collation !== tableCollation) s += ' CHARACTER SET ' + c.charset + ' COLLATE ' + c.collation;
    else if (T.isString(c.type) && c.collation && c.collation !== tableCollation) s += ' COLLATE ' + c.collation;
    if (c.virtual && c.virtualExpr) s += ' GENERATED ALWAYS AS (' + c.virtualExpr + ') ' + (c.virtualStored ? 'STORED' : 'VIRTUAL');
    s += c.notNull ? ' NOT NULL' : ' NULL';
    s += defaultClause(c);
    if (c.onUpdate && T.isTime(c.type)) s += ' ON UPDATE CURRENT_TIMESTAMP' + (c.length ? '(' + c.length + ')' : '');
    if (c.autoInc) s += ' AUTO_INCREMENT';
    if (c.comment) s += ' COMMENT ' + NW.qs(c.comment);
    return s;
  }
  function indexDef(ix) {
    const cols = ix.columns.map(c => c.expr ? '(' + c.expr + ')' : NW.qi(c.name) + (c.sub ? '(' + c.sub + ')' : '') + (c.order === 'DESC' ? ' DESC' : '')).join(', ');
    let s = (ix.kind === 'UNIQUE' ? 'UNIQUE ' : ix.kind === 'FULLTEXT' ? 'FULLTEXT ' : ix.kind === 'SPATIAL' ? 'SPATIAL ' : '') + 'INDEX ' + NW.qi(ix.name) + ' (' + cols + ')';
    if (ix.method && (ix.kind === 'NORMAL' || ix.kind === 'UNIQUE')) s += ' USING ' + ix.method;
    if (ix.comment) s += ' COMMENT ' + NW.qs(ix.comment);
    return s;
  }
  function fkDef(fk, db) {
    return 'CONSTRAINT ' + NW.qi(fk.name) + ' FOREIGN KEY (' + fk.columns.map(NW.qi).join(', ') + ') REFERENCES ' + (fk.refDb && fk.refDb !== db ? NW.qi(fk.refDb) + '.' : '') + NW.qi(fk.refTable) + ' (' + fk.refColumns.map(NW.qi).join(', ') + ')'
      + (fk.onDelete && fk.onDelete !== 'NO ACTION' ? ' ON DELETE ' + fk.onDelete : '') + (fk.onUpdate && fk.onUpdate !== 'NO ACTION' ? ' ON UPDATE ' + fk.onUpdate : '');
  }
  function triggerDef(tr, db, table) {
    let body = (tr.body || '').trim();
    if (!/^begin\b/i.test(body) && !/;\s*$/.test(body) && !/^(insert|update|delete|set|call|signal)\b/i.test(body)) body = 'BEGIN\n' + body + '\nEND';
    return 'CREATE TRIGGER ' + NW.qi(tr.name) + ' ' + tr.timing + ' ' + tr.event + ' ON ' + NW.qname(db, table) + ' FOR EACH ROW\n' + body;
  }
  NW.qname = (db, t) => NW.qi(db) + '.' + NW.qi(t);
  const clone = o => JSON.parse(JSON.stringify(o));
  const emptyCol = () => ({ name: '', origName: null, type: 'varchar', length: '255', decimals: '', values: [], unsigned: false, zerofill: false, notNull: false, pk: false, pkOrder: 0, autoInc: false, onUpdate: false, virtual: false, virtualStored: false, virtualExpr: '', charset: '', collation: '', comment: '', dflt: { kind: 'none', value: '' } });

  /* ---------------------------------------------------------- designer */
  class TableDesigner {
    constructor(el, tab, o) {
      this.el = el; this.tab = tab; this.conn = o.conn; this.db = o.db; this.table = o.table || null; this.isNew = !o.table;
      this.model = null; this.orig = null; this.sel = 0; this.selIx = 0; this.selFk = 0; this.selTr = 0;
      this.charsets = null;
      this._build();
      this.load();
    }
    _build() {
      const el = this.el;
      const btn = (label, icon, fn, title) => h('button', { class: 'sb-btn', title: title || label, onclick: fn }, NW.svg(icon), label);
      this.bar = h('div', { class: 'subbar' },
        btn('Save', 'save', () => this.save(), 'Save (Ctrl+S)'), h('div', { class: 'sb-sep' }),
        btn('Add Field', 'plus', () => this.addField()), btn('Insert Field', 'plus', () => this.addField(true)), btn('Delete Field', 'minus', () => this.deleteField()),
        h('div', { class: 'sb-sep' }), btn('Primary Key', 'key', () => this.togglePk()),
        h('div', { class: 'sb-sep' }), btn('Move Up', 'up', () => this.move(-1)), btn('Move Down', 'down', () => this.move(1)),
        h('div', { class: 'sb-spacer' }), this.titleEl = h('span', { class: 'muted' }));
      el.appendChild(this.bar);
      this.tabs = NW.subTabs([{ id: 'fields', label: 'Fields' }, { id: 'indexes', label: 'Indexes' }, { id: 'fks', label: 'Foreign Keys' }, { id: 'triggers', label: 'Triggers' }, { id: 'options', label: 'Options' }, { id: 'comment', label: 'Comment' }, { id: 'sql', label: 'SQL Preview' }],
        { onShow: id => this._onTab(id) });
      el.appendChild(this.tabs.el);
      el.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) { e.preventDefault(); this.save(); } });
    }
    async load() {
      try {
        if (!this.charsets) this.charsets = await NW.Tools.charsets(this.conn);
        if (this.table) {
          const d = await NW.api('table.design', { conn: this.conn, db: this.db, table: this.table });
          const pk = d.indexes.find(i => i.primary);
          const cols = d.columns.map(colFromRow);
          if (pk) pk.columns.forEach((pc, i) => { const c = cols.find(x => x.name === pc.name); if (c) { c.pk = true; c.pkOrder = i + 1; } });
          const st = d.status || {};
          this.model = {
            name: this.table, columns: cols,
            indexes: d.indexes.filter(i => !i.primary).map(i => ({ name: i.name, kind: i.kind, method: i.method, columns: i.columns.map(c => ({ name: c.name, sub: c.sub, order: c.order, expr: c.expr })), comment: i.comment })),
            fks: d.foreignKeys.map(f => ({ name: f.name, columns: f.columns.slice(), refDb: f.refDb, refTable: f.refTable, refColumns: f.refColumns.slice(), onDelete: f.onDelete, onUpdate: f.onUpdate })),
            triggers: d.triggers.map(t => ({ name: t.name, timing: t.timing, event: t.event, body: t.statement })),
            options: { engine: st.Engine || '', autoInc: st.Auto_increment || '', charset: (st.Collation || '').split('_')[0] || '', collation: st.Collation || '', rowFormat: st.Row_format || '', checksum: st.Checksum || '' },
            comment: st.Comment || '',
          };
          this.ddl = d.ddl;
        } else {
          const dbInfo = (NW.connState(this.conn).databases || []).find(x => x.name === this.db) || {};
          this.model = { name: '', columns: [Object.assign(emptyCol(), { name: 'id', type: 'int', length: '', unsigned: true, notNull: true, pk: true, pkOrder: 1, autoInc: true })], indexes: [], fks: [], triggers: [],
            options: { engine: 'InnoDB', autoInc: '', charset: dbInfo.charset || 'utf8mb4', collation: dbInfo.collation || '', rowFormat: '', checksum: '' }, comment: '' };
        }
        this.orig = this.isNew ? null : clone(this.model);
        this._refreshTitle();
        this.renderAll();
      } catch (e) { this.el.appendChild(h('div', { class: 'obj-empty err-text', text: e.message })); }
    }
    _refreshTitle() { this.titleEl.textContent = (this.model.name || 'Untitled') + '  •  ' + this.db; }
    markDirty() { NW.Tabs.setDirty(this.tab.id, this.isDirty()); }
    isDirty() { return this.isNew ? true : JSON.stringify(this.model) !== JSON.stringify(this.orig); }
    _onTab(id) { if (!this.model) return; if (id === 'sql') this.renderSql(); if (id === 'fks') this.renderFks(); if (id === 'indexes') this.renderIndexes(); if (id === 'triggers') this.renderTriggers(); if (id === 'options') this.renderOptions(); if (id === 'comment') this.renderComment(); }
    renderAll() { this.renderFields(); this._onTab(this.tabs.current()); }

    /* ---------------------------------------------------------- fields */
    renderFields() {
      const p = this.tabs.panels.fields; p.innerHTML = '';
      const wrap = h('div', { class: 'dtable-wrap' });
      const table = h('table', { class: 'dtable' });
      table.appendChild(h('thead', null, h('tr', null, h('th', { style: 'width:20px' }), h('th', { text: 'Name', style: 'min-width:180px' }), h('th', { text: 'Type', style: 'width:130px' }), h('th', { text: 'Length', style: 'width:80px' }), h('th', { text: 'Decimals', style: 'width:70px' }), h('th', { text: 'Not null', style: 'width:60px' }), h('th', { text: 'Virtual', style: 'width:56px' }), h('th', { text: 'Key', style: 'width:50px' }), h('th', { text: 'Comment' }))));
      const tb = h('tbody');
      this.model.columns.forEach((c, i) => {
        const tr = h('tr', { class: i === this.sel ? 'selected' : '', dataset: { i } });
        const inp = (val, fn, attrs) => h('input', Object.assign({ class: 'cell', value: val, onfocus: () => this.selectField(i, false), onchange: e => { fn(e.target.value); this.markDirty(); } }, attrs || {}));
        tr.append(
          h('td', { class: 'rowmark', text: i === this.sel ? '▶' : '' }),
          h('td', null, inp(c.name, v => { c.name = v.trim(); this.renderProps(); })),
          h('td', null, (() => { const s = NW.select(TYPES.includes(c.type) ? TYPES : TYPES.concat([c.type]), c.type, { class: 'cell', onfocus: () => this.selectField(i, false), onchange: e => { c.type = e.target.value; if (c.type === 'varchar' && !c.length) c.length = '255'; if (!T.hasLen(c.type)) { c.length = ''; c.decimals = ''; } if (T.hasValues(c.type) && !c.values.length) c.values = []; this.markDirty(); this.renderFields(); this.renderProps(); } }); return s; })()),
          h('td', null, T.hasLen(c.type) ? inp(c.length, v => c.length = v.trim()) : ''),
          h('td', null, T.hasDec(c.type) ? inp(c.decimals, v => c.decimals = v.trim()) : ''),
          h('td', { class: 'c' }, h('input', { type: 'checkbox', checked: c.notNull, onfocus: () => this.selectField(i, false), onchange: e => { c.notNull = e.target.checked; this.markDirty(); } })),
          h('td', { class: 'c' }, h('input', { type: 'checkbox', checked: c.virtual, onfocus: () => this.selectField(i, false), onchange: e => { c.virtual = e.target.checked; this.markDirty(); this.renderProps(); } })),
          h('td', { class: 'keycell', html: c.pk ? NW.icon('key') + (this.model.columns.filter(x => x.pk).length > 1 ? '<span class="korder">' + c.pkOrder + '</span>' : '') : '', title: 'Click to toggle the primary key', onclick: () => { this.selectField(i); this.togglePk(); } }),
          h('td', null, inp(c.comment, v => c.comment = v)),
        );
        tr.addEventListener('mousedown', e => { if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'SELECT') this.selectField(i); });
        tb.appendChild(tr);
      });
      table.appendChild(tb); wrap.appendChild(table); p.appendChild(wrap);
      this.props = h('div', { class: 'dz-props' }); p.appendChild(this.props);
      this.renderProps();
    }
    selectField(i, rerender) {
      if (this.sel === i && rerender === false) return;
      this.sel = i;
      if (rerender === false) { NW.$$('tbody tr', this.tabs.panels.fields).forEach(tr => { tr.classList.toggle('selected', +tr.dataset.i === i); tr.firstChild.textContent = +tr.dataset.i === i ? '▶' : ''; }); this.renderProps(); }
      else { this.renderFields(); }
    }
    renderProps() {
      const c = this.model.columns[this.sel]; const p = this.props; if (!p) return; p.innerHTML = '';
      if (!c) return;
      const g = h('div', { class: 'form-grid' });
      const upd = () => this.markDirty();
      const dkind = NW.select([{ value: 'none', label: '(no default)' }, { value: 'null', label: 'NULL' }, { value: 'empty', label: 'EMPTY STRING' }, { value: 'literal', label: 'Value:' }, { value: 'expr', label: 'Expression:' }].concat(T.isTime(c.type) ? [{ value: 'ct', label: 'CURRENT_TIMESTAMP' }] : []), c.dflt.kind === 'expr' && /^current_timestamp/i.test(c.dflt.value) ? 'ct' : c.dflt.kind, { style: 'width:150px', onchange: e => { const k = e.target.value; if (k === 'ct') c.dflt = { kind: 'expr', value: 'CURRENT_TIMESTAMP' + (c.length ? '(' + c.length + ')' : '') }; else c.dflt = { kind: k, value: k === 'literal' || k === 'expr' ? c.dflt.value : '' }; upd(); this.renderProps(); } });
      const dval = h('input', { class: 'inp', style: 'width:220px', value: c.dflt.kind === 'literal' || c.dflt.kind === 'expr' ? (c.dflt.value || '') : '', disabled: !(c.dflt.kind === 'literal' || c.dflt.kind === 'expr'), placeholder: c.dflt.kind === 'expr' ? 'e.g. (uuid())' : '', oninput: e => { c.dflt.value = e.target.value; upd(); } });
      g.append(...NW.formRow('Default:', h('div', { class: 'form-row' }, dkind, dval)));
      if (T.isNum(c.type)) {
        g.append(...NW.formRow('Auto Increment:', h('input', { type: 'checkbox', checked: c.autoInc, onchange: e => { c.autoInc = e.target.checked; if (c.autoInc) { c.notNull = true; } upd(); this.renderFields(); } })));
        g.append(...NW.formRow('Unsigned:', h('input', { type: 'checkbox', checked: c.unsigned, onchange: e => { c.unsigned = e.target.checked; upd(); } })));
        g.append(...NW.formRow('Zerofill:', h('input', { type: 'checkbox', checked: c.zerofill, onchange: e => { c.zerofill = e.target.checked; upd(); } })));
      }
      if (T.isString(c.type)) {
        const cs = this.charsets || { charsets: [], collations: [] };
        const csSel = NW.select([{ value: '', label: '(table default)' }].concat(cs.charsets.map(x => x.Charset)), c.charset, { style: 'width:150px', onchange: e => { c.charset = e.target.value; c.collation = c.charset ? (cs.collations.find(x => x.Charset === c.charset && x.Default === 'Yes') || {}).Collation || '' : ''; upd(); this.renderProps(); } });
        const coSel = NW.select([{ value: '', label: '(default)' }].concat(cs.collations.filter(x => !c.charset || x.Charset === c.charset).map(x => x.Collation)), c.collation, { style: 'width:220px', onchange: e => { c.collation = e.target.value; upd(); } });
        g.append(...NW.formRow('Character set:', csSel)); g.append(...NW.formRow('Collation:', coSel));
      }
      if (T.hasValues(c.type)) {
        g.append(...NW.formRow('Values:', h('textarea', { class: 'ta', rows: 3, style: 'width:320px', value: c.values.join('\n'), placeholder: 'one value per line', oninput: e => { c.values = e.target.value.split('\n').map(s => s.trim()).filter(Boolean); upd(); } }), 'One value per line'));
      }
      if (T.isTime(c.type)) g.append(...NW.formRow('On Update Current_Timestamp:', h('input', { type: 'checkbox', checked: c.onUpdate, onchange: e => { c.onUpdate = e.target.checked; upd(); } })));
      if (c.virtual) {
        g.append(...NW.formRow('Expression:', h('input', { class: 'inp', style: 'width:320px', value: c.virtualExpr, placeholder: 'e.g. qty * unit_price', oninput: e => { c.virtualExpr = e.target.value; upd(); } })));
        g.append(...NW.formRow('Stored:', h('input', { type: 'checkbox', checked: c.virtualStored, onchange: e => { c.virtualStored = e.target.checked; upd(); } })));
      }
      p.append(h('div', { class: 'title', text: 'Field properties: ' + (c.name || '(unnamed)') }), g);
    }
    addField(insert) {
      const c = emptyCol();
      if (insert && this.model.columns.length) { this.model.columns.splice(this.sel, 0, c); } else { this.model.columns.push(c); this.sel = this.model.columns.length - 1; }
      this.markDirty(); this.renderFields();
      setTimeout(() => { const tr = NW.$$('tbody tr', this.tabs.panels.fields)[this.sel]; if (tr) { const inp = tr.querySelector('input'); if (inp) inp.focus(); } }, 0);
    }
    deleteField() {
      if (!this.model.columns.length) return;
      const c = this.model.columns[this.sel];
      this.model.columns.splice(this.sel, 1);
      this.model.indexes.forEach(ix => ix.columns = ix.columns.filter(x => x.name !== c.name));
      this.model.indexes = this.model.indexes.filter(ix => ix.columns.length);
      this.model.fks = this.model.fks.filter(fk => !fk.columns.includes(c.name));
      this.sel = Math.max(0, Math.min(this.sel, this.model.columns.length - 1));
      this._renumberPk(); this.markDirty(); this.renderFields();
    }
    togglePk() {
      const c = this.model.columns[this.sel]; if (!c) return;
      c.pk = !c.pk; if (c.pk) c.notNull = true;
      this._renumberPk(); this.markDirty(); this.renderFields();
    }
    _renumberPk() { let n = 0; this.model.columns.forEach(c => { c.pkOrder = c.pk ? ++n : 0; }); }
    move(d) {
      const i = this.sel, j = i + d; const cols = this.model.columns;
      if (j < 0 || j >= cols.length) return;
      [cols[i], cols[j]] = [cols[j], cols[i]]; this.sel = j; this.markDirty(); this.renderFields();
    }

    /* ---------------------------------------------------------- indexes */
    renderIndexes() {
      const p = this.tabs.panels.indexes; p.innerHTML = '';
      const bar = h('div', { class: 'subbar' }, h('button', { class: 'sb-btn', onclick: () => { this.model.indexes.push({ name: 'idx_' + (this.model.indexes.length + 1), kind: 'NORMAL', method: 'BTREE', columns: [], comment: '' }); this.selIx = this.model.indexes.length - 1; this.markDirty(); this.renderIndexes(); } }, NW.svg('plus'), 'Add Index'),
        h('button', { class: 'sb-btn', onclick: () => { if (this.model.indexes[this.selIx]) { this.model.indexes.splice(this.selIx, 1); this.selIx = Math.max(0, this.selIx - 1); this.markDirty(); this.renderIndexes(); } } }, NW.svg('minus'), 'Delete Index'));
      p.appendChild(bar);
      const wrap = h('div', { class: 'dtable-wrap' });
      const table = h('table', { class: 'dtable' });
      table.appendChild(h('thead', null, h('tr', null, h('th', { style: 'width:20px' }), h('th', { text: 'Name', style: 'width:200px' }), h('th', { text: 'Fields' }), h('th', { text: 'Index Type', style: 'width:120px' }), h('th', { text: 'Index Method', style: 'width:110px' }), h('th', { text: 'Comment', style: 'width:200px' }))));
      const tb = h('tbody');
      this.model.indexes.forEach((ix, i) => {
        const tr = h('tr', { class: i === this.selIx ? 'selected' : '' });
        tr.append(h('td', { class: 'rowmark', text: i === this.selIx ? '▶' : '' }),
          h('td', null, h('input', { class: 'cell', value: ix.name, onchange: e => { ix.name = e.target.value.trim(); this.markDirty(); } })),
          h('td', null, h('span', { class: 'fieldpick', text: ix.columns.length ? ix.columns.map(c => c.expr ? '(' + c.expr + ')' : c.name + (c.sub ? '(' + c.sub + ')' : '') + (c.order === 'DESC' ? ' DESC' : '')).join(', ') : '(click to choose fields)', onclick: () => this.pickFields(ix.columns, true).then(cols => { if (cols) { ix.columns = cols; this.markDirty(); this.renderIndexes(); } }) })),
          h('td', null, NW.select(['NORMAL', 'UNIQUE', 'FULLTEXT', 'SPATIAL'], ix.kind, { class: 'cell', onchange: e => { ix.kind = e.target.value; this.markDirty(); } })),
          h('td', null, NW.select(['BTREE', 'HASH', ''], ix.method, { class: 'cell', onchange: e => { ix.method = e.target.value; this.markDirty(); } })),
          h('td', null, h('input', { class: 'cell', value: ix.comment || '', onchange: e => { ix.comment = e.target.value; this.markDirty(); } })));
        tr.addEventListener('mousedown', () => { if (this.selIx !== i) { this.selIx = i; this.renderIndexes(); } });
        tb.appendChild(tr);
      });
      table.appendChild(tb); wrap.appendChild(table); p.appendChild(wrap);
      if (!this.model.indexes.length) wrap.appendChild(h('div', { class: 'obj-empty muted', text: 'No indexes (the primary key is defined in the Fields tab).' }));
    }
    pickFields(current, withOptions, columnNames) {
      const names = columnNames || this.model.columns.map(c => c.name).filter(Boolean);
      const chosen = current.map(c => Object.assign({}, c));
      const list = h('div', { class: 'listbox', style: 'height:260px' });
      const render = () => {
        list.innerHTML = '';
        names.forEach(n => {
          const sel = chosen.find(c => c.name === n);
          const row = h('div', { class: 'li' + (sel ? ' selected' : '') });
          row.append(h('input', { type: 'checkbox', checked: !!sel, onchange: e => { if (e.target.checked) chosen.push({ name: n, sub: null, order: 'ASC' }); else { const k = chosen.findIndex(c => c.name === n); if (k >= 0) chosen.splice(k, 1); } render(); } }),
            h('span', { style: 'flex:1', text: n }), sel ? h('span', { class: 'muted small', text: '#' + (chosen.indexOf(sel) + 1) }) : null);
          if (withOptions && sel) row.append(h('input', { class: 'inp', style: 'width:70px', placeholder: 'sub part', value: sel.sub || '', oninput: e => sel.sub = e.target.value ? +e.target.value : null }), NW.select(['ASC', 'DESC'], sel.order || 'ASC', { style: 'width:80px', onchange: e => sel.order = e.target.value }));
          list.appendChild(row);
        });
      };
      render();
      return NW.Dialog.open({ title: 'Choose Fields', body: h('div', null, h('p', { class: 'muted small', text: 'Tick the fields in the order they should appear in the key.' }), list), width: 460, buttons: [{ label: 'OK', primary: true, onClick: () => chosen.filter(c => names.includes(c.name)) }, { label: 'Cancel', value: null }] }).promise.then(v => Array.isArray(v) ? v : null);
    }

    /* ---------------------------------------------------------- foreign keys */
    async renderFks() {
      const p = this.tabs.panels.fks; p.innerHTML = '';
      const bar = h('div', { class: 'subbar' }, h('button', { class: 'sb-btn', onclick: () => { this.model.fks.push({ name: 'fk_' + (this.model.name || 'table') + '_' + (this.model.fks.length + 1), columns: [], refDb: this.db, refTable: '', refColumns: [], onDelete: 'RESTRICT', onUpdate: 'RESTRICT' }); this.selFk = this.model.fks.length - 1; this.markDirty(); this.renderFks(); } }, NW.svg('plus'), 'Add Foreign Key'),
        h('button', { class: 'sb-btn', onclick: () => { if (this.model.fks[this.selFk]) { this.model.fks.splice(this.selFk, 1); this.selFk = Math.max(0, this.selFk - 1); this.markDirty(); this.renderFks(); } } }, NW.svg('minus'), 'Delete Foreign Key'));
      p.appendChild(bar);
      const dbs = (NW.connState(this.conn).databases || []).map(d => d.name);
      const wrap = h('div', { class: 'dtable-wrap' });
      const table = h('table', { class: 'dtable' });
      table.appendChild(h('thead', null, h('tr', null, h('th', { style: 'width:20px' }), h('th', { text: 'Name', style: 'width:180px' }), h('th', { text: 'Fields', style: 'width:160px' }), h('th', { text: 'Referenced Schema', style: 'width:150px' }), h('th', { text: 'Referenced Table', style: 'width:170px' }), h('th', { text: 'Referenced Fields', style: 'width:160px' }), h('th', { text: 'On Delete', style: 'width:110px' }), h('th', { text: 'On Update', style: 'width:110px' }))));
      const tb = h('tbody');
      for (const [i, fk] of this.model.fks.entries()) {
        const tr = h('tr', { class: i === this.selFk ? 'selected' : '' });
        const refCols = fk.refTable ? await NW.Tools.columnsOf(this.conn, fk.refDb || this.db) : {};
        const tables = fk.refDb ? Object.keys(await NW.Tools.columnsOf(this.conn, fk.refDb)) : [];
        tr.append(h('td', { class: 'rowmark', text: i === this.selFk ? '▶' : '' }),
          h('td', null, h('input', { class: 'cell', value: fk.name, onchange: e => { fk.name = e.target.value.trim(); this.markDirty(); } })),
          h('td', null, h('span', { class: 'fieldpick', text: fk.columns.length ? fk.columns.join(', ') : '(choose)', onclick: () => this.pickFields(fk.columns.map(n => ({ name: n })), false).then(c => { if (c) { fk.columns = c.map(x => x.name); this.markDirty(); this.renderFks(); } }) })),
          h('td', null, NW.select(dbs, fk.refDb || this.db, { class: 'cell', onchange: e => { fk.refDb = e.target.value; fk.refTable = ''; fk.refColumns = []; this.markDirty(); this.renderFks(); } })),
          h('td', null, NW.select([''].concat(tables), fk.refTable, { class: 'cell', onchange: e => { fk.refTable = e.target.value; fk.refColumns = []; this.markDirty(); this.renderFks(); } })),
          h('td', null, h('span', { class: 'fieldpick', text: fk.refColumns.length ? fk.refColumns.join(', ') : '(choose)', onclick: () => { if (!fk.refTable) { NW.Toast.warn('Choose the referenced table first.'); return; } this.pickFields(fk.refColumns.map(n => ({ name: n })), false, refCols[fk.refTable] || []).then(c => { if (c) { fk.refColumns = c.map(x => x.name); this.markDirty(); this.renderFks(); } }); } })),
          h('td', null, NW.select(FK_ACTIONS, fk.onDelete, { class: 'cell', onchange: e => { fk.onDelete = e.target.value; this.markDirty(); } })),
          h('td', null, NW.select(FK_ACTIONS, fk.onUpdate, { class: 'cell', onchange: e => { fk.onUpdate = e.target.value; this.markDirty(); } })));
        tr.addEventListener('mousedown', () => { if (this.selFk !== i) { this.selFk = i; this.renderFks(); } });
        tb.appendChild(tr);
      }
      table.appendChild(tb); wrap.appendChild(table); p.appendChild(wrap);
      if (!this.model.fks.length) wrap.appendChild(h('div', { class: 'obj-empty muted', text: 'No foreign keys.' }));
    }

    /* ---------------------------------------------------------- triggers */
    renderTriggers() {
      const p = this.tabs.panels.triggers; p.innerHTML = '';
      const bar = h('div', { class: 'subbar' }, h('button', { class: 'sb-btn', onclick: () => { this.model.triggers.push({ name: 'trg_' + (this.model.name || 'table') + '_' + (this.model.triggers.length + 1), timing: 'BEFORE', event: 'INSERT', body: 'BEGIN\n\nEND' }); this.selTr = this.model.triggers.length - 1; this.markDirty(); this.renderTriggers(); } }, NW.svg('plus'), 'Add Trigger'),
        h('button', { class: 'sb-btn', onclick: () => { if (this.model.triggers[this.selTr]) { this.model.triggers.splice(this.selTr, 1); this.selTr = Math.max(0, this.selTr - 1); this.markDirty(); this.renderTriggers(); } } }, NW.svg('minus'), 'Delete Trigger'));
      p.appendChild(bar);
      const wrap = h('div', { class: 'dtable-wrap', style: 'flex:none;max-height:200px' });
      const table = h('table', { class: 'dtable' });
      table.appendChild(h('thead', null, h('tr', null, h('th', { style: 'width:20px' }), h('th', { text: 'Name', style: 'width:240px' }), h('th', { text: 'Fires', style: 'width:110px' }), h('th', { text: 'Event', style: 'width:110px' }), h('th'))));
      const tb = h('tbody');
      this.model.triggers.forEach((t, i) => {
        const tr = h('tr', { class: i === this.selTr ? 'selected' : '' });
        tr.append(h('td', { class: 'rowmark', text: i === this.selTr ? '▶' : '' }),
          h('td', null, h('input', { class: 'cell', value: t.name, onchange: e => { t.name = e.target.value.trim(); this.markDirty(); } })),
          h('td', null, NW.select(['BEFORE', 'AFTER'], t.timing, { class: 'cell', onchange: e => { t.timing = e.target.value; this.markDirty(); } })),
          h('td', null, NW.select(['INSERT', 'UPDATE', 'DELETE'], t.event, { class: 'cell', onchange: e => { t.event = e.target.value; this.markDirty(); } })),
          h('td'));
        tr.addEventListener('mousedown', () => { if (this.selTr !== i) { this.selTr = i; this.renderTriggers(); } });
        tb.appendChild(tr);
      });
      table.appendChild(tb); wrap.appendChild(table); p.appendChild(wrap);
      const t = this.model.triggers[this.selTr];
      const bodyWrap = h('div', { class: 'dz-trigger-body' });
      p.appendChild(bodyWrap);
      if (t) {
        bodyWrap.appendChild(h('div', { class: 'subbar', style: 'height:26px' }, h('span', { class: 'sb-label', text: 'Definition of ' + t.name + ' (statement or BEGIN … END block)' })));
        const cm = NW.editor(bodyWrap, { value: t.body || '', lineNumbers: true });
        cm.on('change', () => { t.body = cm.getValue(); this.markDirty(); });
        setTimeout(() => cm.refresh(), 0);
      } else bodyWrap.appendChild(h('div', { class: 'obj-empty muted', text: 'No triggers.' }));
    }

    /* ---------------------------------------------------------- options / comment / sql */
    renderOptions() {
      const p = this.tabs.panels.options; p.innerHTML = '';
      const o = this.model.options; const cs = this.charsets || { charsets: [], collations: [], engines: [] };
      const g = h('div', { class: 'form-grid' });
      const upd = () => this.markDirty();
      const engines = (cs.engines || []).filter(e => e.Support !== 'NO').map(e => e.Engine);
      g.append(...NW.formRow('Engine:', NW.select([''].concat(engines.includes(o.engine) || !o.engine ? engines : engines.concat([o.engine])), o.engine, { onchange: e => { o.engine = e.target.value; upd(); } })));
      g.append(...NW.formRow('Auto Increment:', h('input', { class: 'inp', value: o.autoInc || '', oninput: e => { o.autoInc = e.target.value.trim(); upd(); } })));
      const coSel = NW.select([''].concat(cs.collations.filter(x => !o.charset || x.Charset === o.charset).map(x => x.Collation)), o.collation, { onchange: e => { o.collation = e.target.value; upd(); } });
      g.append(...NW.formRow('Character set:', NW.select([''].concat(cs.charsets.map(x => x.Charset)), o.charset, { onchange: e => { o.charset = e.target.value; o.collation = (cs.collations.find(x => x.Charset === o.charset && x.Default === 'Yes') || {}).Collation || ''; upd(); this.renderOptions(); } })));
      g.append(...NW.formRow('Collation:', coSel));
      g.append(...NW.formRow('Row format:', NW.select(['', 'DEFAULT', 'DYNAMIC', 'FIXED', 'COMPRESSED', 'REDUNDANT', 'COMPACT'], (o.rowFormat || '').toUpperCase(), { onchange: e => { o.rowFormat = e.target.value; upd(); } })));
      g.append(...NW.formRow('Checksum:', h('input', { type: 'checkbox', checked: o.checksum === '1' || o.checksum === 1, onchange: e => { o.checksum = e.target.checked ? '1' : ''; upd(); } })));
      p.appendChild(h('div', { class: 'dz-options' }, g));
    }
    renderComment() {
      const p = this.tabs.panels.comment; p.innerHTML = '';
      p.appendChild(h('div', { style: 'padding:12px;flex:1;display:flex' }, h('textarea', { class: 'ta', style: 'flex:1;min-height:200px;font-family:inherit', value: this.model.comment, oninput: e => { this.model.comment = e.target.value; this.markDirty(); } })));
    }
    renderSql() {
      const p = this.tabs.panels.sql; p.innerHTML = '';
      let sql;
      try { const st = this.generate(); sql = st.length ? st.map(s => s + ';').join('\n\n') : '-- No changes.'; } catch (e) { sql = '-- ' + e.message; }
      const box = h('div', { class: 'dz-sql' }); p.appendChild(box);
      const cm = NW.editor(box, { value: sql, readOnly: true });
      setTimeout(() => cm.refresh(), 0);
    }

    /* ---------------------------------------------------------- DDL generation */
    validate() {
      const m = this.model;
      if (!m.columns.length) throw new Error('The table needs at least one field.');
      const seen = new Set();
      m.columns.forEach(c => { if (!c.name) throw new Error('Every field needs a name.'); if (seen.has(c.name.toLowerCase())) throw new Error('Duplicate field name: ' + c.name); seen.add(c.name.toLowerCase()); if (c.type === 'varchar' && !c.length) throw new Error('Field ' + c.name + ' (varchar) needs a length.'); if (T.hasValues(c.type) && !c.values.length) throw new Error('Field ' + c.name + ' (' + c.type + ') needs at least one value.'); });
      if (m.columns.filter(c => c.autoInc).length > 1) throw new Error('Only one field can be AUTO_INCREMENT.');
      m.indexes.forEach(ix => { if (!ix.name) throw new Error('Every index needs a name.'); if (!ix.columns.length) throw new Error('Index ' + ix.name + ' has no fields.'); });
      m.fks.forEach(fk => { if (!fk.name) throw new Error('Every foreign key needs a name.'); if (!fk.columns.length || !fk.refTable || fk.refColumns.length !== fk.columns.length) throw new Error('Foreign key ' + fk.name + ' is incomplete.'); });
      m.triggers.forEach(t => { if (!t.name) throw new Error('Every trigger needs a name.'); });
    }
    generate() {
      this.validate();
      const m = this.model, db = this.db, coll = m.options.collation;
      const out = [];
      const pkCols = m.columns.filter(c => c.pk).sort((a, b) => a.pkOrder - b.pkOrder).map(c => c.name);
      const optionClauses = (o, all) => {
        const parts = [];
        if (o.engine && (all || o.engine !== this.orig.options.engine)) parts.push('ENGINE=' + o.engine);
        if (o.autoInc && (all || String(o.autoInc) !== String(this.orig.options.autoInc))) parts.push('AUTO_INCREMENT=' + o.autoInc);
        if (o.charset && (all || o.charset !== this.orig.options.charset)) parts.push('DEFAULT CHARACTER SET=' + o.charset);
        if (o.collation && (all || o.collation !== this.orig.options.collation)) parts.push('COLLATE=' + o.collation);
        if (o.rowFormat && o.rowFormat !== 'DEFAULT' && (all || o.rowFormat.toUpperCase() !== (this.orig.options.rowFormat || '').toUpperCase())) parts.push('ROW_FORMAT=' + o.rowFormat.toUpperCase());
        if ((o.checksum === '1') !== (all ? false : (this.orig.options.checksum === '1' || this.orig.options.checksum === 1))) parts.push('CHECKSUM=' + (o.checksum === '1' ? 1 : 0));
        if (all ? m.comment : m.comment !== this.orig.comment) parts.push('COMMENT=' + NW.qs(m.comment));
        return parts;
      };
      if (this.isNew) {
        if (!m.name) throw new Error('The table needs a name.');
        const lines = m.columns.map(c => '  ' + colDef(c, coll));
        if (pkCols.length) lines.push('  PRIMARY KEY (' + pkCols.map(NW.qi).join(', ') + ')');
        m.indexes.forEach(ix => lines.push('  ' + indexDef(ix)));
        m.fks.forEach(fk => lines.push('  ' + fkDef(fk, db)));
        out.push('CREATE TABLE ' + NW.qname(db, m.name) + ' (\n' + lines.join(',\n') + '\n)' + (optionClauses(m.options, true).length ? ' ' + optionClauses(m.options, true).join(' ') : ''));
        m.triggers.forEach(t => out.push(triggerDef(t, db, m.name)));
        return out;
      }
      const o = this.orig, tname = NW.qname(db, o.name);
      const clauses = [], fkAdds = [];
      const origByName = {}; o.columns.forEach(c => origByName[c.name] = c);
      const keptOrig = new Set(m.columns.map(c => c.origName).filter(Boolean));
      o.columns.forEach(c => { if (!keptOrig.has(c.name)) clauses.push('DROP COLUMN ' + NW.qi(c.name)); });
      const origOrder = o.columns.map(c => c.name);
      m.columns.forEach((c, i) => {
        const prev = i > 0 ? (m.columns[i - 1].origName || m.columns[i - 1].name) : null;
        const pos = i === 0 ? ' FIRST' : ' AFTER ' + NW.qi(m.columns[i - 1].name);
        if (!c.origName || !origByName[c.origName]) { clauses.push('ADD COLUMN ' + colDef(c, coll) + pos); return; }
        const oc = origByName[c.origName];
        const origPrev = origOrder[origOrder.indexOf(c.origName) - 1] || null;
        const moved = (origPrev || null) !== (prev || null);
        const ocDef = colDef(oc, o.options.collation), ncDef = colDef(c, coll);
        if (c.name !== oc.name || ocDef !== ncDef || moved) clauses.push('CHANGE COLUMN ' + NW.qi(c.origName) + ' ' + ncDef + (moved ? pos : ''));
      });
      const origPk = o.columns.filter(c => c.pk).sort((a, b) => a.pkOrder - b.pkOrder).map(c => c.name);
      const newPkOrigNames = m.columns.filter(c => c.pk).sort((a, b) => a.pkOrder - b.pkOrder).map(c => c.origName || c.name);
      if (JSON.stringify(origPk) !== JSON.stringify(newPkOrigNames)) {
        if (origPk.length) clauses.push('DROP PRIMARY KEY');
        if (pkCols.length) clauses.push('ADD PRIMARY KEY (' + pkCols.map(NW.qi).join(', ') + ')');
      }
      const ixKey = ix => JSON.stringify([ix.kind, ix.method, ix.columns, ix.comment]);
      const origIx = {}; o.indexes.forEach(ix => origIx[ix.name] = ix);
      const newIx = {}; m.indexes.forEach(ix => newIx[ix.name] = ix);
      Object.keys(origIx).forEach(n => { if (!newIx[n] || ixKey(newIx[n]) !== ixKey(origIx[n])) clauses.push('DROP INDEX ' + NW.qi(n)); });
      Object.keys(newIx).forEach(n => { if (!origIx[n] || ixKey(newIx[n]) !== ixKey(origIx[n])) clauses.push('ADD ' + indexDef(newIx[n])); });
      const fkKey = fk => JSON.stringify([fk.columns, fk.refDb, fk.refTable, fk.refColumns, fk.onDelete, fk.onUpdate]);
      const origFk = {}; o.fks.forEach(f => origFk[f.name] = f);
      const newFk = {}; m.fks.forEach(f => newFk[f.name] = f);
      Object.keys(origFk).forEach(n => { if (!newFk[n] || fkKey(newFk[n]) !== fkKey(origFk[n])) clauses.push('DROP FOREIGN KEY ' + NW.qi(n)); });
      Object.keys(newFk).forEach(n => { if (!origFk[n] || fkKey(newFk[n]) !== fkKey(origFk[n])) fkAdds.push('ADD ' + fkDef(newFk[n], db)); });
      clauses.push(...optionClauses(m.options, false));
      if (clauses.length) out.push('ALTER TABLE ' + tname + '\n  ' + clauses.join(',\n  '));
      if (fkAdds.length) out.push('ALTER TABLE ' + tname + '\n  ' + fkAdds.join(',\n  '));
      const trKey = t => JSON.stringify([t.timing, t.event, (t.body || '').trim()]);
      const origTr = {}; o.triggers.forEach(t => origTr[t.name] = t);
      const newTr = {}; m.triggers.forEach(t => newTr[t.name] = t);
      Object.keys(origTr).forEach(n => { if (!newTr[n] || trKey(newTr[n]) !== trKey(origTr[n])) out.push('DROP TRIGGER ' + NW.qname(db, n)); });
      Object.keys(newTr).forEach(n => { if (!origTr[n] || trKey(newTr[n]) !== trKey(origTr[n])) out.push(triggerDef(newTr[n], db, o.name)); });
      if (m.name && m.name !== o.name) out.push('ALTER TABLE ' + tname + ' RENAME TO ' + NW.qname(db, m.name));
      return out;
    }

    /* ---------------------------------------------------------- save */
    async save() {
      try {
        if (this.isNew && !this.model.name) {
          const name = await NW.Dialog.prompt({ title: 'Table Name', label: 'Enter the name of the new table:', validate: v => v.trim() ? '' : 'A name is required' });
          if (name === null) return false;
          this.model.name = name.trim();
        }
        const stmts = this.generate();
        if (!stmts.length) { NW.Toast.info('No changes to save.'); return true; }
        const r = await NW.busy(NW.api('ddl.run', { conn: this.conn, db: this.db, statements: stmts }), 'Saving table…');
        if (r.failedIndex !== null && r.failedIndex !== undefined) {
          const err = r.results.find(x => x.type === 'error');
          await NW.Dialog.error((err ? err.error : 'Unknown error') + '\n\nStatement:\n' + stmts[r.failedIndex], 'Save failed');
          return false;
        }
        const newName = this.model.name;
        const wasNew = this.isNew;
        this.isNew = false; this.table = newName;
        NW.Toast.ok('Table ' + newName + ' saved');
        NW.bus.emit('objects-changed', { conn: this.conn, db: this.db });
        const oldId = this.tab.id, newId = 'design:' + this.conn + '/' + this.db + '/' + newName;
        if (oldId !== newId && !NW.Tabs.get(newId)) { this.tab.id = newId; }
        NW.Tabs.setTitle(this.tab.id, newName + ' @' + this.db + ' (' + NW.connName(this.conn) + ') - Table');
        if (!wasNew && this.orig.name !== newName) NW.Tabs.close('table:' + this.conn + '/' + this.db + '/' + this.orig.name, true);
        await this.load();
        NW.Tabs.setDirty(this.tab.id, false);
        return true;
      } catch (e) { NW.Dialog.error(e.message, 'Cannot save'); return false; }
    }
    async onClose() {
      if (!this.model || !this.isDirty()) return true;
      if (this.isNew && this.model.columns.length === 1 && this.model.columns[0].name === 'id' && !this.model.name) return true;
      const r = await NW.Dialog.msg('question', 'Save changes to table ' + (this.model.name || 'Untitled') + '?', 'Table Designer', [{ label: 'Save', primary: true, value: 'save' }, { label: "Don't Save", value: 'no' }, { label: 'Cancel', value: null }]);
      if (r === 'save') return this.save();
      return r === 'no';
    }
    refresh() { if (!this.isNew) this.load(); }
  }
  NW.ddl = { colDef, indexDef, fkDef, triggerDef, parseColType, defaultFrom, TYPES };
})();

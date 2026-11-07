/* Navicat Web - application boot, main toolbar, shortcuts */
(function () {
  'use strict';
  const NW = window.NW, h = NW.h;

  NW.App = {
    async init() {
      NW.applyTheme();
      try {
        const info = await NW.api('app.info');
        NW.state.info = info; NW.state.settings = info.settings || {};
        if (info.csrf) NW.csrf = info.csrf;
      } catch (e) { NW.Toast.err(e.message); }
      NW.applyTheme();
      const navW = NW.settings.get('navWidth', 0); if (navW > 100) NW.$('#nav-pane').style.width = navW + 'px';
      NW.makeSplitter(NW.$('#nav-splitter'), NW.$('#nav-pane'), 'col', w => NW.settings.set('navWidth', w));
      NW.Objects.init();
      await this.reloadConnections();
      NW.Tree.init(NW.$('#tree'));
      NW.Objects.show(null);
      this._toolbar();
      this._shortcuts();
      window.addEventListener('beforeunload', e => { if (NW.Tabs.anyDirty()) { e.preventDefault(); e.returnValue = ''; } });
      NW.status.left(NW.appName + ' ' + NW.version + ' — ' + NW.state.connections.length + ' connection(s)');
      if (!NW.state.connections.length) setTimeout(() => NW.Connection.dialog(), 300);
    },
    async reloadConnections() {
      const r = await NW.api('conn.list');
      NW.state.connections = r.connections;
      NW.bus.emit('connections-changed');
    },
    ctxOrWarn(needDb) {
      const ctx = NW.contextOf();
      if (!ctx.conn || !NW.connState(ctx.conn).open) {
        const anyOpen = NW.state.connections.find(c => NW.connState(c.id).open);
        if (anyOpen) ctx.conn = anyOpen.id; else { NW.Toast.warn('Open a connection first (double-click it in the navigation pane).'); return null; }
      }
      if (needDb && !ctx.db) return this.pickDb(ctx.conn).then(db => db ? { conn: ctx.conn, db } : null);
      return Promise.resolve(ctx);
    },
    pickDb(conn) {
      const dbs = (NW.connState(conn).databases || []).map(d => d.name);
      const sel = NW.select(dbs, dbs[0], { autofocus: true });
      return NW.Dialog.open({ title: 'Choose Database', body: h('div', { class: 'form-grid' }, ...NW.formRow('Database:', sel)), width: 400, buttons: [{ label: 'OK', primary: true, onClick: () => sel.value }, { label: 'Cancel', value: null }] }).promise.then(v => typeof v === 'string' ? v : null);
    },
    _toolbar() {
      const run = async (cmd, btn) => {
        switch (cmd) {
          case 'connection': NW.Menu.show([{ label: 'MySQL...', icon: 'mysql', onClick: () => NW.Connection.dialog() }, { label: 'MariaDB...', icon: 'mysql', onClick: () => NW.Connection.dialog({ name: '', port: 3306 }) }], btn); break;
          case 'new-query': { const c = await this.ctxOrWarn(false); if (c) NW.Query.open({ conn: c.conn, db: c.db }); break; }
          case 'new-table': { const c = await this.ctxOrWarn(true); if (c) NW.Designer.open({ conn: c.conn, db: c.db }); break; }
          case 'new-view': { const c = await this.ctxOrWarn(true); if (c) NW.Tools.viewDesigner({ conn: c.conn, db: c.db }); break; }
          case 'new-function': { const c = await this.ctxOrWarn(true); if (c) NW.Tools.routineDesigner({ conn: c.conn, db: c.db }); break; }
          case 'new-event': { const c = await this.ctxOrWarn(true); if (c) NW.Tools.eventDesigner({ conn: c.conn, db: c.db }); break; }
          case 'users': { const c = await this.ctxOrWarn(false); if (c) NW.Tools.users(c.conn); break; }
          case 'saved-queries': { const c = await this.ctxOrWarn(false); if (c) NW.Tools.savedQueries(c.conn, c.db); break; }
          case 'backup': { const c = await this.ctxOrWarn(true); if (c) NW.Tools.dumpDialog({ conn: c.conn, db: c.db, data: true }); break; }
          case 'monitor': { const c = await this.ctxOrWarn(false); if (c) NW.Tools.serverMonitor(c.conn); break; }
          case 'settings': NW.Tools.options(); break;
        }
      };
      NW.$$('#main-toolbar [data-cmd]').forEach(btn => btn.addEventListener('click', e => { e.preventDefault(); run(btn.dataset.cmd, btn).catch(err => NW.Dialog.error(err.message)); }));
    },
    _shortcuts() {
      document.addEventListener('keydown', e => {
        const inEditor = e.target && (e.target.closest('.CodeMirror') || e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT');
        if (e.key === 'F5') { e.preventDefault(); const t = NW.Tabs.active(); if (t && t.ctl && t.ctl.refresh) t.ctl.refresh(); return; }
        if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 'q' || e.key === 'Q')) { e.preventDefault(); this.ctxOrWarn(false).then(c => { if (c) NW.Query.open({ conn: c.conn, db: c.db }); }); return; }
        if ((e.ctrlKey || e.metaKey) && e.key === 'F4') { e.preventDefault(); const t = NW.Tabs.active(); if (t && t.closable !== false) NW.Tabs.close(t.id); return; }
        if (e.ctrlKey && e.key === 'Tab') { e.preventDefault(); const l = NW.Tabs.list; const i = l.indexOf(NW.Tabs.active()); const n = l[(i + (e.shiftKey ? l.length - 1 : 1)) % l.length]; if (n) NW.Tabs.activate(n.id); return; }
        if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S') && !inEditor) { const t = NW.Tabs.active(); if (t && t.ctl && (t.ctl.save || t.ctl.saveAll)) { e.preventDefault(); (t.ctl.save || t.ctl.saveAll).call(t.ctl); } }
      });
    },
  };
  document.addEventListener('DOMContentLoaded', () => NW.App.init().catch(e => { console.error(e); NW.Toast.err('Startup failed: ' + e.message); }));
})();

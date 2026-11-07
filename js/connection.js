/* Navicat Web - connection dialog (New / Edit Connection) */
(function () {
  'use strict';
  const NW = window.NW, h = NW.h;
  const COLORS = ['', '#e53935', '#fb8c00', '#fdd835', '#43a047', '#1e88e5', '#8e24aa', '#757575'];

  NW.Connection = {
    dialog(existing, asCopy) {
      const c = Object.assign({ name: '', host: 'localhost', port: 3306, user: 'root', savePassword: true, ssl: false, sslVerify: false, sslCa: '', compress: false, timeout: 10, color: '', initialDb: '', charset: 'utf8mb4', note: '' }, existing || {});
      if (asCopy) { c.name = c.name + ' (copy)'; delete c.id; }
      const f = {};
      const inp = (k, attrs) => f[k] = h('input', Object.assign({ class: 'inp', value: c[k] === undefined || c[k] === null ? '' : c[k] }, attrs || {}));
      const chk = (k) => f[k] = h('input', { type: 'checkbox', checked: !!c[k] });
      inp('name', { autofocus: true, placeholder: 'e.g. Production' }); inp('host'); inp('port', { type: 'number', min: 1, max: 65535 }); inp('user'); inp('password', { type: 'password', value: '', placeholder: existing && existing.hasPassword && !asCopy ? '(unchanged)' : '', autocomplete: 'new-password' });
      chk('savePassword'); inp('initialDb', { placeholder: 'optional' });
      chk('ssl'); chk('sslVerify'); inp('sslCa', { placeholder: 'path on the web server, e.g. /etc/ssl/certs/ca.pem' });
      f.charset = NW.select(['utf8mb4', 'utf8', 'latin1', 'ascii', 'binary', 'gbk', 'big5', 'cp1251', 'sjis', 'euckr'], c.charset); chk('compress'); inp('timeout', { type: 'number', min: 1, max: 300 });
      f.note = h('textarea', { class: 'ta', rows: 3, value: c.note || '', style: 'font-family:inherit' });
      let color = c.color || '';
      const swatches = h('div', { class: 'form-row' });
      const renderSw = () => { swatches.innerHTML = ''; COLORS.forEach(col => swatches.appendChild(h('span', { title: col || 'None', style: { width: '22px', height: '22px', borderRadius: '4px', border: (color === col ? '2px solid var(--accent)' : '1px solid var(--border)'), background: col || 'transparent', cursor: 'pointer', display: 'inline-block', position: 'relative' }, html: col ? '' : '<span style="position:absolute;left:4px;top:1px;color:#999">✕</span>', onclick: () => { color = col; renderSw(); } }))); };
      renderSw();
      const tabs = NW.subTabs([{ id: 'general', label: 'General' }, { id: 'ssl', label: 'SSL' }, { id: 'advanced', label: 'Advanced' }], { cls: 'dtabs', tabCls: 'dtab', panelCls: 'dpanel' });
      tabs.panels.general.appendChild(h('div', { class: 'form-grid' },
        ...NW.formRow('Connection Name:', f.name), ...NW.formRow('Host:', f.host, 'Host name, IP address, or a Unix socket path'), ...NW.formRow('Port:', f.port),
        ...NW.formRow('User Name:', f.user), ...NW.formRow('Password:', f.password), h('span'), h('label', { class: 'chk' }, f.savePassword, 'Save password'),
        ...NW.formRow('Initial Database:', f.initialDb), ...NW.formRow('Color:', swatches)));
      tabs.panels.ssl.appendChild(h('div', { class: 'form-grid' }, h('span'), h('label', { class: 'chk' }, f.ssl, 'Use SSL'), h('span'), h('label', { class: 'chk' }, f.sslVerify, 'Verify the server certificate'), ...NW.formRow('CA Certificate:', f.sslCa)));
      tabs.panels.advanced.appendChild(h('div', { class: 'form-grid' }, ...NW.formRow('Encoding:', f.charset), h('span'), h('label', { class: 'chk' }, f.compress, 'Use compression'), ...NW.formRow('Connect Timeout:', f.timeout, 'seconds'), ...NW.formRow('Notes:', f.note)));
      tabs.el.style.minHeight = '340px';
      const collect = () => ({
        id: (existing && !asCopy) ? existing.id : '', name: f.name.value.trim(), host: f.host.value.trim(), port: parseInt(f.port.value, 10) || 3306, user: f.user.value,
        password: f.password.value !== '' ? f.password.value : (existing && !asCopy ? null : ''), savePassword: f.savePassword.checked,
        ssl: f.ssl.checked, sslVerify: f.sslVerify.checked, sslCa: f.sslCa.value.trim(), charset: f.charset.value, compress: f.compress.checked,
        timeout: parseInt(f.timeout.value, 10) || 10, color, initialDb: f.initialDb.value.trim(), note: f.note.value,
      });
      const testBtn = h('button', { class: 'btn', onclick: async () => {
        const d = collect(); if (!d.name) d.name = 'test';
        testBtn.disabled = true;
        try { const r = await NW.api('conn.test', d); await NW.Dialog.msg('success', 'Connection Successful\n\nServer version: ' + r.version, 'Test Connection', [{ label: 'OK', primary: true, value: true }]); }
        catch (e) { NW.Dialog.error(e.message, 'Test Connection'); }
        finally { testBtn.disabled = false; }
      } }, 'Test Connection');
      const dlg = NW.Dialog.open({
        title: existing && !asCopy ? 'Edit Connection - ' + existing.name : 'New Connection (MySQL)', icon: 'mysql', body: tabs.el, width: 560, left: testBtn,
        buttons: [{ label: 'OK', primary: true, onClick: async () => {
          const d = collect();
          if (!d.name) { tabs.show('general'); f.name.focus(); throw new Error('Please enter a connection name.'); }
          const r = await NW.api('conn.save', d);
          await NW.App.reloadConnections();
          NW.Tree.select('c:' + r.connection.id);
          NW.Toast.ok('Connection saved');
          return r.connection;
        } }, { label: 'Cancel', value: null }],
      });
      return dlg.promise;
    },
    async remove(id) {
      const c = NW.connById(id); if (!c) return;
      if (!(await NW.Dialog.confirm('Delete connection "' + c.name + '"?\nSaved queries and history of this connection are deleted too.', { title: 'Delete Connection', ok: 'Delete', danger: true }))) return;
      NW.Tree.closeConnection(id);
      await NW.api('conn.delete', { id });
      await NW.App.reloadConnections();
      NW.Tree.select(null);
      NW.Objects.show(null);
    },
    duplicate(id) { const c = NW.connById(id); if (c) return NW.Connection.dialog(c, true); },
  };
})();

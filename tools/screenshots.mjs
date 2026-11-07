// Captures the README / docs screenshots from a running copy of Navicat Web with headless Chrome
// over the DevTools protocol. No dependencies: Node 22+ has a built-in WebSocket client.
//
//   php -S 127.0.0.1:8089                              # in the project folder, in one terminal
//   APP_PASSWORD=... DB_PASSWORD=... node tools/screenshots.mjs   # writes docs/screenshots/*.png
//
// Environment:
//   APP_URL       where the app runs (default http://127.0.0.1:8089/)
//   APP_PASSWORD  the application password (set on the first visit; required)
//   DB_HOST / DB_PORT / DB_USER / DB_PASSWORD / DB_NAME   the MySQL server and database shown in the
//                 pictures (defaults 127.0.0.1 / 3306 / root / '' / navicat_demo - load tests/demo_schema.sql)
//   CONN_NAME     the connection name shown in the tree (default "MySQL 8 (local)")
//   CHROME        path to chrome.exe / msedge.exe if it is not in a standard location
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'docs', 'screenshots');
const URL_ = (process.env.APP_URL || 'http://127.0.0.1:8089/').replace(/\/?$/, '/');
const APP_PASSWORD = process.env.APP_PASSWORD;
const DB = { host: process.env.DB_HOST || '127.0.0.1', port: +(process.env.DB_PORT || 3306), user: process.env.DB_USER || 'root', password: process.env.DB_PASSWORD || '', name: process.env.DB_NAME || 'navicat_demo', label: process.env.CONN_NAME || 'MySQL 8 (local)' };
const CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];
const CHROME = process.env.CHROME || CANDIDATES.find(p => fs.existsSync(p));
const W = 1600, H = 1000, PORT = 9334;
if (!APP_PASSWORD) { console.error('Set APP_PASSWORD to the application password.'); process.exit(1); }
if (!CHROME) { console.error('No Chrome/Edge found - set CHROME=<path>'); process.exit(1); }
if (typeof WebSocket === 'undefined') { console.error('Node 22 or newer is required (built-in WebSocket).'); process.exit(1); }
fs.mkdirSync(OUT, { recursive: true });

const profile = path.join(os.tmpdir(), 'navicat_web_shots');
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--window-size=${W},${H}`, '--hide-scrollbars', '--disable-gpu',
  '--no-first-run', '--no-default-browser-check', '--force-device-scale-factor=1', `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let target = null;
for (let i = 0; i < 50 && !target; i++) {
  await sleep(200);
  try { const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); target = list.find(t => t.type === 'page'); } catch (e) { /* not up yet */ }
}
if (!target) { chrome.kill(); throw new Error('Chrome did not expose a page target'); }

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const pending = new Map();
ws.onmessage = (ev) => {
  const msg = JSON.parse(typeof ev.data === 'string' ? ev.data : ev.data.toString());
  if (msg.id && pending.has(msg.id)) { const { res, rej } = pending.get(msg.id); pending.delete(msg.id); msg.error ? rej(new Error(msg.error.message)) : res(msg.result); }
};
const cdp = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
const evalJs = async (expr) => {
  const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text || 'eval failed');
  return r.result.value;
};
const waitFor = async (expr, ms = 90000, label = expr) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { try { if (await evalJs(expr)) return true; } catch (e) { /* page still loading */ } await sleep(200); }
  throw new Error('Timed out waiting for: ' + label);
};
const settle = async () => { await evalJs('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))'); await sleep(300); };
const shot = async (name) => {
  await settle();
  const r = await cdp('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(OUT, name), Buffer.from(r.data, 'base64'));
  console.log('wrote', name);
};
// Detail shots: an element (or a region) rendered at 2x for crisp close-ups.
const rect = async (selector, pad = 0) => {
  const r = await evalJs(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return null; const b = el.getBoundingClientRect(); return { x: b.left, y: b.top, width: b.width, height: b.height }; })()`);
  if (!r) throw new Error('No element for ' + selector);
  return { x: Math.max(0, r.x - pad), y: Math.max(0, r.y - pad), width: Math.min(W, r.width + pad * 2), height: Math.min(H, r.height + pad * 2) };
};
const shotClip = async (name, clip, scale = 2) => {
  await settle();
  const r = await cdp('Page.captureScreenshot', { format: 'png', clip: { ...clip, scale } });
  fs.writeFileSync(path.join(OUT, name), Buffer.from(r.data, 'base64'));
  console.log('wrote', name);
};
const quiet = "document.querySelectorAll('.toast').forEach(e => e.remove()); 1";
const closeDialogs = async () => { await evalJs("(() => { const d = (window.NW && NW.Dialog.top()); if (d) d.close(null); document.querySelectorAll('.dlg-backdrop').forEach(b => b.remove()); return 1; })()"); };

try {
  await cdp('Page.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });

  /* ---- sign in (sets the password on a fresh installation) ---- */
  await cdp('Page.navigate', { url: URL_ + 'login.php' });
  await waitFor("!!document.querySelector('input[name=password]') || !!document.getElementById('app')", 30000, 'sign-in page');
  if (await evalJs("!!document.querySelector('input[name=password]')")) {
    await shotClip('sign-in.png', await rect('.login-card', 28));
    await evalJs(`(() => { const f = document.querySelector('form'); f.password.value = ${JSON.stringify(APP_PASSWORD)}; if (f.password2) f.password2.value = ${JSON.stringify(APP_PASSWORD)}; f.submit(); return 1; })()`);
  }
  await waitFor("!!(window.NW && NW.Tree && NW.Tree.el && NW.state && NW.state.connections)", 30000, 'application');
  await sleep(500);
  await closeDialogs();
  /* the pictures are taken in the light theme at the default font size (saved directly, not debounced) */
  const setTheme = (theme) => evalJs(`(async () => { NW.state.settings.theme = ${JSON.stringify(theme)}; NW.state.settings.fontSize = 12; NW.applyTheme(); await NW.api('app.settings.save', { settings: { theme: ${JSON.stringify(theme)}, fontSize: 12 } }); return 1; })()`);
  await setTheme('light');

  /* ---- connections: the one we show open, plus a closed one for the tree ---- */
  const connId = await evalJs(`(async () => {
    const list = (await NW.api('conn.list')).connections;
    let c = list.find(x => x.name === ${JSON.stringify(DB.label)});
    if (!c) c = (await NW.api('conn.save', { name: ${JSON.stringify(DB.label)}, host: ${JSON.stringify(DB.host)}, port: ${DB.port}, user: ${JSON.stringify(DB.user)}, password: ${JSON.stringify(DB.password)}, savePassword: true, color: '#1e88e5', initialDb: ${JSON.stringify(DB.name)} })).connection;
    if (!list.find(x => x.name === 'Staging (MariaDB)')) await NW.api('conn.save', { name: 'Staging (MariaDB)', host: 'staging.internal', port: 3306, user: 'app', password: '', savePassword: false, color: '#fb8c00' });
    await NW.App.reloadConnections();
    return c.id;
  })()`);
  const db = DB.name;
  const openDb = `(async () => { if (!NW.connState(${JSON.stringify(connId)}).open) { const ok = await NW.Tree.openConnection(${JSON.stringify(connId)}, { silent: true }); if (!ok) throw new Error('cannot connect'); } await NW.Tree.ensureDbOpen(${JSON.stringify(connId)}, ${JSON.stringify(db)}); return true; })()`;
  await evalJs(openDb);
  const C = JSON.stringify(connId), D = JSON.stringify(db);

  /* ---- 1. Objects view (hero) ---- */
  await evalJs(`(() => { NW.Tree.expand('c:' + ${C}); NW.Tree.expand('d:' + ${C} + '|' + ${D}); NW.Tree.expand('f:' + ${C} + '|' + ${D} + '|table'); NW.Tree.select('f:' + ${C} + '|' + ${D} + '|table'); NW.Objects.selected.clear(); NW.Objects.selected.add('orders'); NW.Objects.render(); return 1; })()`);
  await sleep(2500); await evalJs(quiet);
  await shot('objects-view.png');
  await shotClip('navigation-pane.png', { x: 0, y: 67, width: 272, height: 520 });

  /* ---- 2. Table data ---- */
  await evalJs(`NW.TableTab.open({ conn: ${C}, db: ${D}, table: 'customers' }) && 1`);
  await waitFor(`(() => { const t = NW.Tabs.get('table:' + ${C} + '/' + ${D} + '/customers'); return !!(t && t.ctl && t.ctl.data && !t.ctl.loading); })()`, 90000, 'customers table');
  await evalJs(`(() => { const t = NW.Tabs.get('table:' + ${C} + '/' + ${D} + '/customers').ctl; const ci = t.cols.findIndex(c => c.name === 'city'); t.grid.setFocus(2, ci); t.setCellValue(2, ci, 'Barcelona'); t.grid.setFocus(2, ci, { keepSelection: true }); return 1; })()`);
  await sleep(400); await evalJs(quiet);
  await shot('table-data.png');
  await shotClip('record-navigator.png', await rect('.tab-content:not(.hidden) .grid-foot'));
  await evalJs(`(() => { const t = NW.Tabs.get('table:' + ${C} + '/' + ${D} + '/customers').ctl; t.discardAll(); t.filters = [{ on: true, col: 'country', op: '=', val: 'US', val2: '' }, { on: true, col: 'credit_limit', op: '>=', val: '1000', val2: '' }]; t.sort = [{ col: 'last_name', dir: 'ASC' }]; t.toggleFilter(); t.toggleSort(); return 1; })()`);
  await sleep(300);
  {
    const f = await rect('.tab-content:not(.hidden) .subbar');
    const s = await rect('.tab-content:not(.hidden) .fbar:nth-of-type(3)');
    await shotClip('filter-sort.png', { x: f.x, y: f.y, width: Math.min(W - f.x, 1180), height: (s.y + s.height) - f.y + 2 });
  }
  await evalJs(`(() => { const t = NW.Tabs.get('table:' + ${C} + '/' + ${D} + '/customers').ctl; t.toggleFilter(); t.toggleSort(); t.filters = []; t.sort = []; return 1; })()`);

  /* ---- 3. Cell viewer ---- */
  await evalJs(`(() => { NW.CellViewer.open({ value: JSON.stringify({ cpu: 'i7', ram_gb: 16, ssd_gb: 512, ports: ['USB-C', 'HDMI'] }), col: { name: 'attributes', type: 'json' }, readOnly: false, onSave() {} }); return 1; })()`);
  await sleep(400);
  await evalJs("(() => { const d = NW.Dialog.top(); const t = d.el.querySelector('.dtab[data-id=json]'); if (t) t.click(); return 1; })()");
  await sleep(200);
  await shotClip('cell-viewer.png', await rect('.dlg', 6));
  await closeDialogs();

  /* ---- 4. Table designer ---- */
  await evalJs(`NW.Designer.open({ conn: ${C}, db: ${D}, table: 'products' }) && 1`);
  await waitFor(`(() => { const t = NW.Tabs.get('design:' + ${C} + '/' + ${D} + '/products'); return !!(t && t.ctl && t.ctl.model); })()`, 120000, 'designer');
  await evalJs(`(() => { const d = NW.Tabs.get('design:' + ${C} + '/' + ${D} + '/products').ctl; d.selectField(4); return 1; })()`);
  await sleep(400); await evalJs(quiet);
  await shot('table-designer.png');
  await evalJs(`(() => { const d = NW.Tabs.get('design:' + ${C} + '/' + ${D} + '/products').ctl; d.tabs.show('fks'); return 1; })()`);
  await sleep(1500);
  await shotClip('designer-foreign-keys.png', await rect('.tab-content:not(.hidden) .dz-panel.active'));
  await evalJs(`(() => { const d = NW.Tabs.get('design:' + ${C} + '/' + ${D} + '/products').ctl; d.tabs.show('indexes'); return 1; })()`);
  await sleep(500);
  await shotClip('designer-indexes.png', await rect('.tab-content:not(.hidden) .dz-panel.active'));
  await evalJs(`(() => { const d = NW.Tabs.get('design:' + ${C} + '/' + ${D} + '/products').ctl; const c = JSON.parse(JSON.stringify(d.model.columns[1])); Object.assign(c, { name: 'barcode', origName: null, type: 'varchar', length: '32', notNull: false, comment: 'EAN-13', dflt: { kind: 'none', value: '' } }); d.model.columns.splice(2, 0, c); d.model.columns.find(x => x.name === 'stock').notNull = true; d.model.columns.find(x => x.name === 'stock').dflt = { kind: 'literal', value: '0' }; d.model.indexes.push({ name: 'idx_barcode', kind: 'UNIQUE', method: 'BTREE', columns: [{ name: 'barcode', sub: null, order: 'ASC' }], comment: '' }); d.tabs.show('sql'); return 1; })()`);
  await sleep(500);
  await shotClip('designer-sql-preview.png', await rect('.tab-content:not(.hidden) .dz-panel.active'));
  await evalJs(`NW.Tabs.close('design:' + ${C} + '/' + ${D} + '/products', true) && 1`);

  /* ---- 5. Query editor ---- */
  const sql = "SELECT c.country, COUNT(DISTINCT o.id) AS orders, SUM(i.line_total) AS revenue,\n       ROUND(AVG(i.unit_price), 2) AS avg_price\nFROM orders o\nJOIN customers c ON c.id = o.customer_id\nJOIN order_items i ON i.order_id = o.id\nWHERE o.status IN ('paid', 'shipped', 'delivered')\nGROUP BY c.country\nHAVING revenue > 500\nORDER BY revenue DESC;\n\nSELECT * FROM v_low_stock;";
  await evalJs(`(async () => { const t = NW.Query.open({ conn: ${C}, db: ${D}, sql: ${JSON.stringify(sql)}, name: 'Revenue by country' }); await new Promise(r => setTimeout(r, 400)); await t.ctl.run('all'); return 1; })()`);
  await sleep(800); await evalJs(quiet);
  await shot('query-editor.png');
  await evalJs("(() => { const tab = document.querySelector('.tab-content:not(.hidden) .qe-rtab[data-id=msg]'); if (tab) tab.click(); return 1; })()");
  await sleep(300);
  await shotClip('query-message.png', await rect('.tab-content:not(.hidden) .qe-results'));

  /* ---- 6. Dialogs ---- */
  await evalJs(`(() => { NW.Connection.dialog(); return 1; })()`);
  await sleep(400);
  await evalJs(`(() => { const d = NW.Dialog.top().el; const i = d.querySelectorAll('input'); i[0].value = 'Production'; i[1].value = 'db.example.com'; i[2].value = '3306'; i[3].value = 'app_user'; i[4].value = 'secret-password'; i[6].value = 'shop'; return 1; })()`);
  await shotClip('connection-dialog.png', await rect('.dlg', 6));
  await closeDialogs();

  await evalJs(`(() => { NW.Tools.dumpDialog({ conn: ${C}, db: ${D}, data: true }); return 1; })()`);
  await waitFor("!!(NW.Dialog.top() && NW.Dialog.top().el.querySelector('.listbox input'))", 60000, 'dump dialog');
  await sleep(300);
  await shotClip('dump-dialog.png', await rect('.dlg', 6));
  await closeDialogs();

  await evalJs(`(() => { NW.ExportWizard.open({ conn: ${C}, db: ${D}, table: 'customers', total: 24 }); return 1; })()`);
  await sleep(300);
  await shotClip('export-wizard.png', await rect('.dlg', 6));
  await closeDialogs();

  await evalJs(`(() => { NW.Tools.executeSqlFile({ conn: ${C}, db: ${D} }); return 1; })()`);
  await sleep(300);
  await shotClip('execute-sql-file.png', await rect('.dlg', 6));
  await closeDialogs();

  /* ---- 7. Server monitor ---- */
  await evalJs(`NW.Tools.serverMonitor(${C}) && 1`);
  await waitFor("!!document.querySelector('.tab-content:not(.hidden) .dz-panel.active tbody tr')", 60000, 'process list');
  await evalJs("(() => { document.querySelector('.tab-content:not(.hidden) .dz-tab[data-id=vars]').click(); return 1; })()");
  await waitFor("document.querySelectorAll('.tab-content:not(.hidden) .dz-panel.active tbody tr').length > 50", 60000, 'variables');
  await evalJs("(() => { const f = document.querySelector('.tab-content:not(.hidden) .dz-panel.active .sb-search'); f.value = 'innodb_buffer'; f.dispatchEvent(new Event('input')); return 1; })()");
  await sleep(2500); await evalJs(quiet);
  await shot('server-monitor.png');

  /* ---- 8. Function designer ---- */
  await evalJs(`NW.Tools.routineDesigner({ conn: ${C}, db: ${D}, name: 'fn_order_total', type: 'function' }) && 1`);
  await waitFor("(() => { const el = document.querySelector('.tab-content:not(.hidden) .CodeMirror'); return !!(el && el.CodeMirror && el.CodeMirror.getValue().length > 20); })()", 60000, 'function body');
  await sleep(300); await evalJs(quiet);
  await shot('function-designer.png');

  /* ---- 9. Dark theme ---- */
  await setTheme('dark');
  await evalJs(`(() => { NW.Tabs.activate('table:' + ${C} + '/' + ${D} + '/customers'); return 1; })()`);
  await sleep(500); await evalJs(quiet);
  await shot('dark-theme.png');
  await setTheme('light');

  console.log('done ->', OUT);
} catch (e) {
  console.error('FAILED:', e.message);
  process.exitCode = 1;
} finally {
  try { ws.close(); } catch (e) { /* ignore */ }
  chrome.kill();
}

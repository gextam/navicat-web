/* Navicat Web - inline SVG icon set (16x16 view box, scaled where needed) */
(function () {
  'use strict';
  const P = {
    // navigation / objects
    connection: '<rect x="2" y="2" width="12" height="5" rx="1" fill="#6f8aa6"/><rect x="2" y="9" width="12" height="5" rx="1" fill="#6f8aa6"/><circle cx="4.5" cy="4.5" r="1" fill="#b9f0a6"/><circle cx="4.5" cy="11.5" r="1" fill="#b9f0a6"/><rect x="7" y="4" width="5" height="1" fill="#dfe8f2"/><rect x="7" y="11" width="5" height="1" fill="#dfe8f2"/>',
    mysql: '<path d="M2 11.5c1.2-3.8 3.6-6.4 7.2-6.4 1.3 0 2.4.4 3.3 1.1L14 7.4c-.4.6-1.2.5-1.5 1.3-.6 1.6-1.2 2.6-2.8 3.2-.4.2-1.1.1-1.5.4l1.1 1.2c-2.2.4-4.5-.3-7.3-2z" fill="#2d6fb6"/><circle cx="10.2" cy="7.3" r=".7" fill="#fff"/><path d="M1.5 12.5c1.7-.5 3.3-.3 4.8.6" stroke="#e7962e" stroke-width="1.4" fill="none" stroke-linecap="round"/>',
    database: '<ellipse cx="8" cy="3.5" rx="5.5" ry="2.2" fill="#8fd18f"/><path d="M2.5 3.5v9c0 1.2 2.5 2.2 5.5 2.2s5.5-1 5.5-2.2v-9" fill="#5cb85c"/><path d="M2.5 7.5c0 1.2 2.5 2.2 5.5 2.2s5.5-1 5.5-2.2M2.5 11c0 1.2 2.5 2.2 5.5 2.2s5.5-1 5.5-2.2" stroke="#3f9a3f" stroke-width=".8" fill="none"/><ellipse cx="8" cy="3.5" rx="5.5" ry="2.2" fill="none" stroke="#3f9a3f" stroke-width=".8"/>',
    folder: '<path d="M1.5 3.5h4.3l1.4 1.5h7.3v8h-13z" fill="#f6c343"/><path d="M1.5 6h13v7h-13z" fill="#fbd96b"/>',
    'folder-open': '<path d="M1.5 3.5h4.3l1.4 1.5h7.3v2h-13z" fill="#e5b43a"/><path d="M2.5 7h12.5l-1.6 6H1.5z" fill="#fbd96b"/>',
    table: '<rect x="1.5" y="2.5" width="13" height="11" rx="1" fill="#fff" stroke="#5a7fb2"/><rect x="1.5" y="2.5" width="13" height="3" fill="#5a7fb2"/><path d="M1.5 8.5h13M1.5 11h13M6 5.5v8M10.5 5.5v8" stroke="#9fb6d4" stroke-width=".8"/>',
    view: '<rect x="1.5" y="2.5" width="13" height="11" rx="1" fill="#fff" stroke="#7d6bb5"/><rect x="1.5" y="2.5" width="13" height="3" fill="#7d6bb5"/><path d="M1.5 8.5h13M6 5.5v8M10.5 5.5v8" stroke="#c4bbe0" stroke-width=".8"/><circle cx="11.5" cy="11" r="2.6" fill="#fff" stroke="#7d6bb5"/><circle cx="11.5" cy="11" r="1" fill="#7d6bb5"/>',
    function: '<rect x="1.5" y="1.5" width="13" height="13" rx="2" fill="#fde7c8" stroke="#d9862a"/><text x="8" y="11.6" font-size="9.5" font-family="Georgia,serif" font-style="italic" font-weight="bold" text-anchor="middle" fill="#b5651d">fx</text>',
    procedure: '<rect x="1.5" y="1.5" width="13" height="13" rx="2" fill="#dcebfb" stroke="#2f7de1"/><text x="8" y="12" font-size="10" font-family="Segoe UI,Arial" font-weight="bold" text-anchor="middle" fill="#1a5fb4">P</text>',
    event: '<circle cx="8" cy="8" r="6.3" fill="#fff" stroke="#c97b1a" stroke-width="1.2"/><path d="M8 4v4.3l2.8 1.6" stroke="#c97b1a" stroke-width="1.3" fill="none" stroke-linecap="round"/>',
    trigger: '<path d="M9 1.5 3.5 9h4l-1 5.5L13 7H9z" fill="#f2b705" stroke="#b58400" stroke-width=".7" stroke-linejoin="round"/>',
    query: '<path d="M3 1.5h7l3 3v10H3z" fill="#fff" stroke="#6b7a8a"/><path d="M10 1.5v3h3" fill="#e4e9ef" stroke="#6b7a8a"/><text x="8" y="11.5" font-size="5.5" font-family="Segoe UI,Arial" font-weight="bold" text-anchor="middle" fill="#2d6fb6">SQL</text>',
    savedquery: '<path d="M3 1.5h7l3 3v10H3z" fill="#fff8d6" stroke="#b08a00"/><path d="M10 1.5v3h3" fill="#f3e4a3" stroke="#b08a00"/><text x="8" y="11.5" font-size="5.5" font-family="Segoe UI,Arial" font-weight="bold" text-anchor="middle" fill="#8a6d00">SQL</text>',
    key: '<circle cx="5.5" cy="6" r="3.4" fill="#f5c542" stroke="#b08a00"/><circle cx="5.5" cy="6" r="1.2" fill="#fff"/><path d="M8 8.3l6 6M11.5 11.8l1.4-1.4M13 13.3l1.4-1.4" stroke="#b08a00" stroke-width="1.6" stroke-linecap="round"/>',
    index: '<rect x="2" y="2.5" width="12" height="2.2" rx=".6" fill="#7a8fa6"/><rect x="2" y="6.9" width="12" height="2.2" rx=".6" fill="#7a8fa6"/><rect x="2" y="11.3" width="12" height="2.2" rx=".6" fill="#7a8fa6"/>',
    column: '<rect x="5" y="1.5" width="6" height="13" rx="1" fill="#dcebfb" stroke="#5a7fb2"/><path d="M5 4.5h6M5 7.5h6M5 10.5h6" stroke="#5a7fb2" stroke-width=".8"/>',
    user: '<circle cx="8" cy="5" r="3.2" fill="#f0b27a" stroke="#b9713a"/><path d="M2.5 14.5c.6-3.5 2.6-5 5.5-5s4.9 1.5 5.5 5z" fill="#4a90e2" stroke="#2b67b0"/>',
    users: '<circle cx="6" cy="5" r="2.8" fill="#f0b27a" stroke="#b9713a"/><path d="M1.5 14c.5-3 2.2-4.5 4.5-4.5S10 11 10.5 14z" fill="#4a90e2" stroke="#2b67b0"/><circle cx="11.5" cy="5.5" r="2.3" fill="#f0b27a" stroke="#b9713a"/><path d="M10 9.4c.5-.2 1-.3 1.5-.3 2 0 3.2 1.3 3.5 4.2h-3" fill="#7fb0ec" stroke="#2b67b0"/>',
    server: '<rect x="1.5" y="1.5" width="13" height="4" rx="1" fill="#8aa0b8"/><rect x="1.5" y="6.5" width="13" height="4" rx="1" fill="#8aa0b8"/><rect x="1.5" y="11.5" width="13" height="3" rx="1" fill="#8aa0b8"/><circle cx="4" cy="3.5" r=".9" fill="#b9f0a6"/><circle cx="4" cy="8.5" r=".9" fill="#b9f0a6"/><circle cx="4" cy="13" r=".9" fill="#f7d774"/>',
    // actions
    run: '<path d="M4 2.5v11l9-5.5z" fill="#2eaa4a"/>',
    stop: '<rect x="3" y="3" width="10" height="10" rx="1" fill="#d9342b"/>',
    refresh: '<path d="M12.5 6.5A5 5 0 1 0 13 9.5" stroke="#2f7de1" stroke-width="1.6" fill="none" stroke-linecap="round"/><path d="M13.5 2.5v4h-4" stroke="#2f7de1" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    plus: '<path d="M8 3v10M3 8h10" stroke="#2eaa4a" stroke-width="2" stroke-linecap="round"/>',
    minus: '<path d="M3 8h10" stroke="#d9342b" stroke-width="2" stroke-linecap="round"/>',
    check: '<path d="M3 8.5l3.2 3L13 4.5" stroke="#2eaa4a" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    cross: '<path d="M4 4l8 8M12 4l-8 8" stroke="#d9342b" stroke-width="2" stroke-linecap="round"/>',
    close: '<path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
    first: '<path d="M4 3v10M13 3L7 8l6 5z" stroke="currentColor" stroke-width="1.4" fill="currentColor" stroke-linejoin="round"/>',
    prev: '<path d="M10.5 3l-5.5 5 5.5 5z" fill="currentColor"/>',
    next: '<path d="M5.5 3l5.5 5-5.5 5z" fill="currentColor"/>',
    last: '<path d="M12 3v10M3 3l6 5-6 5z" stroke="currentColor" stroke-width="1.4" fill="currentColor" stroke-linejoin="round"/>',
    filter: '<path d="M2 3h12l-4.5 5.5V13l-3 1V8.5z" fill="#6b7a8a"/>',
    sort: '<path d="M5 2.5v11M2.5 11L5 13.5 7.5 11M11 13.5v-11M8.5 5 11 2.5 13.5 5" stroke="#6b7a8a" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    export: '<path d="M2.5 9v4h11V9" stroke="#2f7de1" stroke-width="1.5" fill="none" stroke-linecap="round"/><path d="M8 2v8M5 5l3-3 3 3" stroke="#2f7de1" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    import: '<path d="M2.5 9v4h11V9" stroke="#2f7de1" stroke-width="1.5" fill="none" stroke-linecap="round"/><path d="M8 10V2M5 7l3 3 3-3" stroke="#2f7de1" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    save: '<path d="M2.5 2.5h9l2 2v9h-11z" fill="#2f7de1"/><rect x="4.5" y="2.5" width="6" height="3.5" fill="#dcebfb"/><rect x="4.5" y="9" width="7" height="4.5" fill="#fff"/>',
    design: '<path d="M2.5 11.5 10.5 3.5l2 2-8 8-3 1z" fill="#f6c343" stroke="#b08a00" stroke-width=".8" stroke-linejoin="round"/><path d="M9.5 4.5l2 2" stroke="#b08a00" stroke-width=".8"/>',
    open: '<path d="M1.5 3.5h4.3l1.4 1.5h7.3v2h-13z" fill="#e5b43a"/><path d="M2.5 7h12.5l-1.6 6H1.5z" fill="#fbd96b"/>',
    delete: '<path d="M3 4h10M6 4V2.5h4V4M4 4l.8 9.5h6.4L12 4" stroke="#d9342b" stroke-width="1.3" fill="none" stroke-linejoin="round"/>',
    search: '<circle cx="7" cy="7" r="4.3" stroke="#6b7a8a" stroke-width="1.5" fill="none"/><path d="M10.2 10.2 14 14" stroke="#6b7a8a" stroke-width="1.8" stroke-linecap="round"/>',
    settings: '<circle cx="8" cy="8" r="2.3" fill="none" stroke="#6b7a8a" stroke-width="1.5"/><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4" stroke="#6b7a8a" stroke-width="1.5" stroke-linecap="round"/>',
    signout: '<path d="M6 2.5H3v11h3" stroke="#6b7a8a" stroke-width="1.5" fill="none" stroke-linecap="round"/><path d="M7 8h7M11 5l3 3-3 3" stroke="#d9342b" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    monitor: '<rect x="1.5" y="2.5" width="13" height="9" rx="1" fill="#fff" stroke="#6b7a8a"/><path d="M3 8h2.5l1.5-3 2 6 1.5-4.5 1 1.5H13" stroke="#2eaa4a" stroke-width="1.3" fill="none" stroke-linejoin="round"/><path d="M5.5 14h5" stroke="#6b7a8a" stroke-width="1.5" stroke-linecap="round"/>',
    backup: '<rect x="2" y="3" width="12" height="10" rx="1" fill="#fff" stroke="#6b7a8a"/><rect x="2" y="3" width="12" height="2.5" fill="#6b7a8a"/><path d="M8 7.5v3M6.5 9.5 8 11l1.5-1.5" stroke="#2f7de1" stroke-width="1.3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    info: '<circle cx="8" cy="8" r="6.5" fill="#2f7de1"/><path d="M8 7v4.5" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/><circle cx="8" cy="4.6" r="1" fill="#fff"/>',
    warning: '<path d="M8 1.5 15 14H1z" fill="#f2b705"/><path d="M8 6v4" stroke="#333" stroke-width="1.6" stroke-linecap="round"/><circle cx="8" cy="12" r=".9" fill="#333"/>',
    error: '<circle cx="8" cy="8" r="6.5" fill="#d9342b"/><path d="M5.3 5.3l5.4 5.4M10.7 5.3l-5.4 5.4" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/>',
    question: '<circle cx="8" cy="8" r="6.5" fill="#2f7de1"/><path d="M6 6.2a2 2 0 1 1 3 1.7c-.7.4-1 .8-1 1.6" stroke="#fff" stroke-width="1.5" fill="none" stroke-linecap="round"/><circle cx="8" cy="12" r=".9" fill="#fff"/>',
    success: '<circle cx="8" cy="8" r="6.5" fill="#2eaa4a"/><path d="M4.5 8.3l2.4 2.4L11.5 6" stroke="#fff" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    copy: '<rect x="5" y="5" width="8.5" height="9.5" rx="1" fill="#fff" stroke="#6b7a8a"/><path d="M3 11V2.5h7" stroke="#6b7a8a" fill="none" stroke-width="1.2"/>',
    paste: '<rect x="3" y="3" width="10" height="11.5" rx="1" fill="#fff8d6" stroke="#b08a00"/><rect x="5.5" y="1.5" width="5" height="3" rx=".8" fill="#6b7a8a"/>',
    edit: '<path d="M2.5 11.5 10.5 3.5l2 2-8 8-3 1z" fill="#6b7a8a"/>',
    up: '<path d="M8 13V3M4 7l4-4 4 4" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    down: '<path d="M8 3v10M4 9l4 4 4-4" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    explain: '<rect x="2" y="2.5" width="12" height="11" rx="1" fill="#fff" stroke="#6b7a8a"/><path d="M4 6h8M4 8.5h5M4 11h6" stroke="#2f7de1" stroke-width="1.3" stroke-linecap="round"/>',
    beautify: '<path d="M3 4h10M3 8h6M3 12h8" stroke="#6b7a8a" stroke-width="1.6" stroke-linecap="round"/><path d="M12 9.5l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6z" fill="#f2b705"/>',
    history: '<circle cx="8.5" cy="8" r="5.5" fill="none" stroke="#6b7a8a" stroke-width="1.4"/><path d="M8.5 5v3.2l2.2 1.3" stroke="#6b7a8a" stroke-width="1.3" fill="none" stroke-linecap="round"/><path d="M3 8H1.5M3.8 4.5l-1.2-1" stroke="#6b7a8a" stroke-width="1.3" stroke-linecap="round"/>',
    lock: '<rect x="3.5" y="7" width="9" height="7" rx="1" fill="#f6c343" stroke="#b08a00"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" stroke="#6b7a8a" stroke-width="1.4" fill="none"/>',
    kill: '<circle cx="8" cy="8" r="6" fill="none" stroke="#d9342b" stroke-width="1.6"/><path d="M4 4l8 8" stroke="#d9342b" stroke-width="1.6"/>',
    null: '<text x="8" y="11.5" font-size="8" font-family="Segoe UI,Arial" font-style="italic" text-anchor="middle" fill="#9aa0a6">NULL</text>',
    dropdown: '<path d="M4 6.5l4 4 4-4" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    arrowright: '<path d="M3 8h9M8.5 4.5 12 8l-3.5 3.5" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    file: '<path d="M3 1.5h7l3 3v10H3z" fill="#fff" stroke="#6b7a8a"/><path d="M10 1.5v3h3" fill="#e4e9ef" stroke="#6b7a8a"/>',
    form: '<rect x="1.5" y="2.5" width="13" height="11" rx="1" fill="#fff" stroke="#5a7fb2"/><path d="M4 6h3M8.5 6h4M4 9h3M8.5 9h4M4 12h3M8.5 12h4" stroke="#9fb6d4" stroke-width="1.2" stroke-linecap="round"/>',
    grid: '<rect x="1.5" y="2.5" width="13" height="11" rx="1" fill="#fff" stroke="#5a7fb2"/><path d="M1.5 6h13M1.5 9.5h13M6 2.5v11M10.5 2.5v11" stroke="#9fb6d4" stroke-width=".9"/>',
  };
  // bigger toolbar variants map to the same drawings
  const BIG = { 'connection-big': 'mysql', 'query-big': 'query', 'table-big': 'table', 'view-big': 'view', 'function-big': 'function', 'event-big': 'event', 'user-big': 'users', 'savedquery-big': 'savedquery', 'backup-big': 'backup', 'monitor-big': 'monitor', 'settings-big': 'settings', 'signout-big': 'signout' };

  function icon(name, size) {
    const n = BIG[name] || name;
    const body = P[n] || P.file;
    const s = size ? ' width="' + size + '" height="' + size + '"' : '';
    return '<svg class="ico ico-' + n + '" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"' + s + ' aria-hidden="true">' + body + '</svg>';
  }
  window.NW = window.NW || {};
  window.NW.icon = icon;
  window.NW.icons = P;
  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('[data-ico]').forEach(function (el) {
      el.innerHTML = icon(el.getAttribute('data-ico'));
    });
  });
})();

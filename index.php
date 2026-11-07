<?php
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/auth.php';
nw_require_login_page();
$v = NW_VERSION;
?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title><?= htmlspecialchars(NW_NAME) ?> for MySQL</title>
<link rel="icon" href="img/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="vendor/codemirror/codemirror.css">
<link rel="stylesheet" href="vendor/codemirror/show-hint.css">
<link rel="stylesheet" href="vendor/codemirror/dialog.css">
<link rel="stylesheet" href="css/app.css?v=<?= $v ?>">
</head>
<body>
<div id="app" class="app">
  <div class="toolbar" id="main-toolbar">
    <button class="tb-btn" data-cmd="connection" title="New Connection (MySQL / MariaDB)"><span class="tb-ico" data-ico="connection-big"></span><span class="tb-label">Connection <span class="tb-caret">&#9662;</span></span></button>
    <button class="tb-btn" data-cmd="new-query" title="New Query (Ctrl+Q)"><span class="tb-ico" data-ico="query-big"></span><span class="tb-label">New Query</span></button>
    <div class="tb-sep"></div>
    <button class="tb-btn" data-cmd="new-table" title="New Table"><span class="tb-ico" data-ico="table-big"></span><span class="tb-label">Table</span></button>
    <button class="tb-btn" data-cmd="new-view" title="New View"><span class="tb-ico" data-ico="view-big"></span><span class="tb-label">View</span></button>
    <button class="tb-btn" data-cmd="new-function" title="New Function / Procedure"><span class="tb-ico" data-ico="function-big"></span><span class="tb-label">Function</span></button>
    <button class="tb-btn" data-cmd="new-event" title="New Event"><span class="tb-ico" data-ico="event-big"></span><span class="tb-label">Event</span></button>
    <button class="tb-btn" data-cmd="users" title="Manage Users"><span class="tb-ico" data-ico="user-big"></span><span class="tb-label">User</span></button>
    <button class="tb-btn" data-cmd="saved-queries" title="Saved Queries"><span class="tb-ico" data-ico="savedquery-big"></span><span class="tb-label">Query</span></button>
    <button class="tb-btn" data-cmd="backup" title="Dump SQL File"><span class="tb-ico" data-ico="backup-big"></span><span class="tb-label">Backup</span></button>
    <button class="tb-btn" data-cmd="monitor" title="Server Monitor"><span class="tb-ico" data-ico="monitor-big"></span><span class="tb-label">Monitor</span></button>
    <div class="tb-spacer"></div>
    <button class="tb-btn small" data-cmd="settings" title="Options"><span class="tb-ico" data-ico="settings-big"></span><span class="tb-label">Options</span></button>
    <a class="tb-btn small" href="logout.php" title="Sign out"><span class="tb-ico" data-ico="signout-big"></span><span class="tb-label">Sign Out</span></a>
  </div>
  <div class="body">
    <aside class="nav-pane" id="nav-pane">
      <div class="nav-filter"><span class="ico" data-ico="search"></span><input id="tree-filter" type="search" placeholder="Filter objects" spellcheck="false"></div>
      <div class="tree" id="tree" tabindex="0"></div>
    </aside>
    <div class="splitter" id="nav-splitter"></div>
    <main class="main-pane">
      <div class="tabbar" id="tabbar"></div>
      <div class="tab-contents" id="tab-contents"></div>
    </main>
  </div>
  <div class="statusbar" id="statusbar">
    <span id="status-left"></span>
    <span id="status-right"></span>
  </div>
</div>
<div id="overlay-root"></div>
<iframe name="nw-dl-frame" id="nw-dl-frame" style="display:none" title="download"></iframe>
<script>
window.NW = { csrf: <?= json_encode(nw_csrf()) ?>, version: <?= json_encode(NW_VERSION) ?>, appName: <?= json_encode(NW_NAME) ?> };
</script>
<script src="vendor/codemirror/codemirror.js"></script>
<script src="vendor/codemirror/sql.js"></script>
<script src="vendor/codemirror/show-hint.js"></script>
<script src="vendor/codemirror/sql-hint.js"></script>
<script src="vendor/codemirror/matchbrackets.js"></script>
<script src="vendor/codemirror/closebrackets.js"></script>
<script src="vendor/codemirror/active-line.js"></script>
<script src="vendor/codemirror/searchcursor.js"></script>
<script src="vendor/codemirror/dialog.js"></script>
<script src="vendor/codemirror/search.js"></script>
<script src="vendor/codemirror/comment.js"></script>
<script src="vendor/codemirror/placeholder.js"></script>
<script src="js/icons.js?v=<?= $v ?>"></script>
<script src="js/core.js?v=<?= $v ?>"></script>
<script src="js/grid.js?v=<?= $v ?>"></script>
<script src="js/tree.js?v=<?= $v ?>"></script>
<script src="js/objects.js?v=<?= $v ?>"></script>
<script src="js/table.js?v=<?= $v ?>"></script>
<script src="js/designer.js?v=<?= $v ?>"></script>
<script src="js/query.js?v=<?= $v ?>"></script>
<script src="js/connection.js?v=<?= $v ?>"></script>
<script src="js/tools.js?v=<?= $v ?>"></script>
<script src="js/app.js?v=<?= $v ?>"></script>
</body>
</html>

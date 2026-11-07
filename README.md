# Navicat Web for MySQL

A browser-based database manager for **MySQL** and **MariaDB** that follows the layout and workflows of
Navicat for MySQL: a connection tree on the left, an Objects list with its own toolbar, tabbed documents
for table data, table design and queries, a record navigator at the bottom of every grid, and the usual
dialogs (New Connection, Dump SQL File, Execute SQL File, Import Wizard, Export Wizard, Server Monitor,
Manage Users, Options).

It is a plain PHP application with no framework and no build step: copy the folder to any PHP host,
open it in a browser, set the application password and add a connection.

> Not affiliated with PremiumSoft CyberTech Ltd. "Navicat" is a trademark of its owner; this is an
> independent open-source project that imitates the user experience.

## What it does

**Connections and navigation**
- Any number of saved connections (host/port/user, SSL, compression, connection colour, initial
  database). Passwords are stored encrypted (AES-256-GCM) in the application's data folder.
- Navigation pane: connections → databases → Tables, Views, Functions (functions and procedures),
  Events, Queries (saved queries). Double-click opens; right-click gives the Navicat context menus
  (Open, Design, New, Delete, Empty, Truncate, Duplicate, Rename, Import/Export Wizard, Dump SQL File,
  Maintain, Object Information, Refresh…).
- Objects tab with the sub-toolbar (Open Table, Design Table, New Table, Delete Table, Import Wizard,
  Export Wizard, Dump SQL), sortable detail columns and a collapsible information pane (General / DDL).

**Table data**
- Grid with row numbers, resizable columns, keyboard navigation, multi-row selection, server-side paging
  (`LIMIT` toggle and page size), server-side sort (click a header, Shift-click for multi-column), a
  Filter bar (=, <>, contains, begins with, between, in, is null, regexp… plus a custom WHERE) and a
  Sort bar, the SQL readout and query time in the footer.
- In-place editing: type into a cell, Enter/Tab/arrows commit, Esc cancels; changes are posted when
  you leave the record or press ✓; ✗ discards. Add (+), Duplicate and Delete (−) records. Set to NULL
  (Ctrl+0), Set to Empty String, Copy / Copy As (TSV, CSV, JSON, INSERT statements), Paste, Filter by
  this value. ENUM cells edit with a drop-down. Rows are identified by the primary key, or by a NOT NULL
  unique key, or by all columns (`LIMIT 1`) when the table has no key. Views are read-only.
- Cell viewer/editor (F7 or double-click a BLOB cell): Text, Hex (with load/save file), Image preview,
  JSON formatting, Set to NULL.
- Export Wizard: CSV, TXT (tab), JSON, SQL (INSERTs), HTML, XML, Markdown — with the current filter and
  sort. Import Wizard: CSV/TXT and JSON into an existing or a new table, with field mapping and the
  Append / Update (REPLACE) / Append-or-Update / Delete-and-Append modes.

**Table designer**
- Fields (name, type, length, decimals, not null, virtual, key, comment) with the field-properties
  panel (default value / NULL / empty string / expression / CURRENT_TIMESTAMP, auto increment,
  unsigned, zerofill, character set, collation, ENUM/SET values, ON UPDATE CURRENT_TIMESTAMP, generated
  column expression and STORED), Indexes (normal / unique / fulltext / spatial, BTREE / HASH, sub parts,
  order), Foreign Keys (referenced schema / table / fields, ON DELETE / ON UPDATE), Triggers, Options
  (engine, auto increment, charset, collation, row format, checksum), Comment and an always-current
  **SQL Preview**. Saving generates `CREATE TABLE` or a minimal `ALTER TABLE` diff (`ADD/CHANGE/DROP
  COLUMN` with positions, primary key, index and foreign-key changes, options, trigger changes, rename).

**Queries**
- Query editor (CodeMirror) with syntax highlighting, autocompletion of table and column names,
  Run / Run Selected / Run Current Statement (Ctrl+R, Ctrl+Enter), Stop (`KILL QUERY`), Explain,
  Beautify, Save / Save As (saved queries appear under Queries in the tree), History, Export Result.
- Multiple statements per run, a Result tab per result set (stored-procedure result sets included),
  and a Navicat-style Message pane (`[SQL] …`, affected rows, errors, time per statement).

**Other objects and tools**
- View designer (definition + algorithm / definer / security / check option, preview), Function and
  Procedure designer (parameters, returns, deterministic, data access, security, comment, body, Run),
  Event designer (AT / EVERY schedule, starts / ends, status, preserve, body).
- Dump SQL File (Navicat-style `.sql` with structure and/or data, triggers, views, routines, events)
  and Execute SQL File (files of any size: uploaded in 1 MB pieces, parsed with `DELIMITER` support
  and executed in time slices with progress and error log).
- Server Monitor (process list with Kill, global/session variables with Set, status, server
  information) and Manage Users (create / edit / drop users, server privileges, database privileges,
  resource limits, account lock, Show Grants).
- New / Edit / Delete Database, Object Information, Maintain (analyze / check / optimize / repair /
  checksum), light and dark theme, adjustable font size, application password.

## Requirements

- PHP 8.0 or later with `mysqli`, `openssl` and `mbstring` (all standard; `fileinfo` recommended).
- Any web server that runs PHP (Apache, nginx + php-fpm, IIS, or `php -S` for a quick look).
- MySQL 5.7 / 8.x or MariaDB 10.x reachable from the web server.

## Install

1. Copy the folder to your web server, for example to `public_html/mysql/`.
2. Make `data/` writable by the web server. It holds the application store (connections with
   encrypted passwords, saved queries, history, settings), the encryption key and temporary import
   files. It must not be served to the web: `data/.htaccess` takes care of Apache; on nginx deny the
   folder or point `NW_DATA_DIR` in `config.php` somewhere outside the document root.
3. Open the folder's URL. The first visit asks you to choose the application password.
4. Click **Connection** and add a MySQL or MariaDB server (Test Connection, then OK), then double-click
   it in the navigation pane.

`.user.ini` raises the PHP upload/time limits for this folder; adjust it (or your php.ini) if your host
ignores it. `config.php` has a few knobs: default row limit, session length, an optional IP allow-list
for the sign-in page.

### Quick look without a web server

```bash
php -S localhost:8080
```

then open <http://localhost:8080/>.

### Demo database

`tests/demo_schema.sql` creates a small `navicat_demo` database (tables with foreign keys, a generated
column, ENUM/SET/JSON columns, views, a function, a procedure, triggers and an event):

```bash
mysql -u root -p < tests/demo_schema.sql
```

## Security notes

- Everyone who knows the application password can run any SQL the saved MySQL accounts allow. Use a
  strong password, serve the application over HTTPS and prefer MySQL accounts with the least privilege.
- Sign-in attempts are throttled per address; sessions expire after 12 hours (configurable).
- All API requests carry a CSRF token; the `data/` folder is denied to the web; library files are not
  directly requestable on Apache.

## Layout of the code

```
index.php        the application shell          js/core.js       helpers, API client, dialogs, menus, tabs
login.php        sign-in / first-run password   js/grid.js       the data grid
api.php          JSON API (all actions)         js/tree.js       navigation pane
db.php           MySQL access, SQL splitter,    js/objects.js    Objects tab
                 exports, dumps                 js/table.js      table data tab, cell viewer, export wizard
auth.php         sessions, password, throttle   js/designer.js   table designer and DDL generation
storage.php      JSON store, encryption         js/query.js      query editor
config.php       settings                       js/connection.js connection dialog
css/app.css      styles (light/dark themes)     js/tools.js      monitor, users, dump, import, designers
vendor/codemirror  CodeMirror 5 (MIT)           js/app.js        boot, toolbar, shortcuts
```

## License

MIT — see `LICENSE`. CodeMirror is © Marijn Haverbeke and contributors, MIT licensed.

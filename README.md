<h1 align="center">Navicat Web for MySQL</h1>

<p align="center">
  A browser-based re-creation of <b>Navicat for MySQL</b> — the connection tree, the Objects list,<br>
  tabbed table data, table designer and query editor, views, functions, events, users, server monitor,<br>
  SQL dumps and imports — as a plain PHP application you drop onto any web host.
</p>

<p align="center">
  <img alt="PHP" src="https://img.shields.io/badge/PHP-%E2%89%A5%208.0-777bb4">
  <img alt="Database" src="https://img.shields.io/badge/database-MySQL%205.7%20%7C%208%20%C2%B7%20MariaDB%2010-4479a1">
  <img alt="No build step" src="https://img.shields.io/badge/build%20step-none-lightgrey">
  <img alt="Dependencies" src="https://img.shields.io/badge/dependencies-none%20(CodeMirror%20vendored)-34a853">
  <img alt="License" src="https://img.shields.io/badge/license-MIT-blue">
</p>

<p align="center">
  <b>Project page:</b> <a href="https://gextam.github.io/navicat-web/">gextam.github.io/navicat-web</a>
</p>

<div align="center">

![The Objects view: connection tree, the tables of a database and the information pane](https://gextam.github.io/navicat-web/screenshots/objects-view.png)

</div>

> Not affiliated with PremiumSoft CyberTech Ltd. "Navicat" is a trademark of its owner. This is an independent
> open-source project that imitates the user experience; it contains no Navicat code or assets.

---

## ✨ Features

**Connections and navigation**
- 🔌 **Any number of connections** — host / port / user / password, SSL (with or without certificate verification), compression, connect timeout, a connection colour, an initial database and notes. Passwords are stored encrypted (AES-256-GCM) in the application's data folder, never in the browser.
- 🌳 **Navigation pane** — connections → databases → *Tables*, *Views*, *Functions* (functions and procedures), *Events*, *Queries* (saved queries). Closed connections and databases are greyed out exactly as in Navicat; double-click opens, right-click gives the Navicat context menus (Open, Design, New, Delete, Empty, Truncate, Duplicate, Rename, Import / Export Wizard, Dump SQL File, Maintain, Object Information, Refresh …). A filter box narrows the tree.
- 🗂️ **Objects tab** — the list for whatever is selected in the tree (connections, databases, tables with rows / size / engine / dates / collation / comment, views, routines, events, saved queries) with the sub-toolbar (*Open Table, Design Table, New Table, Delete Table, Import Wizard, Export Wizard, Dump SQL*), sortable columns, search, multi-selection and a collapsible information pane with *General* and *DDL* tabs.

**Table data**
- ▦ **Grid** with row numbers, resizable columns, keyboard navigation, multi-row selection, server-side paging (page size and a *Limit* toggle), server-side sort (click a header, Shift+click for several columns), the SQL readout and query time in the footer and *Record n of total*.
- 🔍 **Filter** and **Sort** bars — `=`, `<>`, `>`, `>=`, `<`, `<=`, *contains*, *begins with*, *ends with*, *like*, *in*, *between*, *is null*, *is empty*, *regexp* … plus a free-form `WHERE` condition; *Filter by this value* from the context menu.
- ✏️ **Editing like Navicat** — type into a cell, Enter / Tab / arrows commit, Esc cancels; a record is posted when you leave it or press ✓, ✗ discards. Add (+), Duplicate and Delete (−) records, *Set to NULL* (Ctrl+0), *Set to Empty String*, *Copy* / *Copy As* (tab-separated with or without field names, CSV, JSON, INSERT statements), *Paste*. ENUM cells edit with a drop-down; generated columns are protected. Rows are identified by the primary key, by a NOT NULL unique key, or — for keyless tables — by all columns with `LIMIT 1`. Views are read-only.
- 🧾 **Cell viewer / editor** (F7 or double-click a BLOB) — *Text*, *Hex* (load from / save to file), *Image* preview (PNG, JPEG, GIF, BMP, WebP), *JSON* formatting, *Set to NULL*.
- 📤 **Export Wizard** — CSV, TXT (tab), JSON, SQL (INSERTs), HTML, XML or Markdown, with the current filter and sort; column titles, delimiter and BOM options. 📥 **Import Wizard** — CSV / TXT (auto-detected delimiter) and JSON into an existing or a new table, with a preview, field mapping and the *Append*, *Update (REPLACE)*, *Append or Update* and *Delete and Append* modes.

**Table designer**
- 🧱 **Fields** — name, type, length, decimals, not null, virtual, key, comment; the properties panel edits default value (none / NULL / empty string / value / expression / `CURRENT_TIMESTAMP`), auto increment, unsigned, zerofill, character set, collation, ENUM / SET values, `ON UPDATE CURRENT_TIMESTAMP` and generated-column expressions (VIRTUAL / STORED). Add, insert, delete and reorder fields; toggle the primary key (composite keys show their order).
- 🗝️ **Indexes** (normal / unique / fulltext / spatial, BTREE / HASH, sub parts, ASC / DESC), **Foreign Keys** (referenced schema, table and fields from live lists, `ON DELETE` / `ON UPDATE`), **Triggers** (timing, event, body), **Options** (engine, auto increment, charset, collation, row format, checksum), **Comment**.
- 👁️ **SQL Preview** — always shows exactly what *Save* will run: `CREATE TABLE` for a new table, otherwise a minimal `ALTER TABLE` (add / change / drop columns with their positions, primary-key, index and foreign-key changes, options), trigger statements and a rename.

**Queries**
- 📝 **Query editor** (CodeMirror) with syntax highlighting, autocompletion of table and column names, *Run* / *Run Selected* / *Run Current Statement*, *Stop* (`KILL QUERY`), *Explain*, *Beautify*, *History*, *Save* / *Save As* (saved queries appear under *Queries* in the tree), *Export Result*, a row *Limit* and connection / database selectors.
- 📊 Several statements per run, a **Result** tab per result set (stored procedures with several result sets included) with client-side sorting, *Copy As* and the cell viewer, and a Navicat-style **Message** pane: `[SQL] …`, rows returned or affected, `[Err] 1146 - …`, time per statement and in total.

**Views, functions, procedures, events**
- 🪟 **View designer** — definition, algorithm, definer, security, check option, *Preview*, SQL preview.
- ƒ **Function / procedure designer** — parameters (mode, name, type), return type, deterministic, data access, security, comment, body, *Run* (asks for the arguments and opens the call in a query tab).
- ⏰ **Event designer** — `AT` or `EVERY n unit` schedule with *Starts* / *Ends*, status, preserve on completion, comment, body; enable / disable from the tree.

**Transfer and maintenance**
- 💾 **Dump SQL File** — a Navicat-style `.sql` with the objects you tick (tables, views, functions, procedures, events), structure and / or data, `DROP … IF EXISTS`, triggers and an optional `CREATE DATABASE`.
- ▶️ **Execute SQL File** — files of any size: uploaded in 1 MB pieces, split with full `DELIMITER` support and executed in time slices with a progress bar, an error log and *Continue on error*. Paste SQL instead of a file if you prefer.
- 🧰 *Empty*, *Truncate*, *Duplicate* (structure, or structure and data), *Rename*, *Maintain* (analyze / check / optimize / repair / checksum), *Object Information*, *New / Edit / Delete Database*.

**Server and users**
- 📈 **Server Monitor** — process list with *Kill* and auto-refresh, global / session variables with inline *Set*, status counters, server information.
- 👤 **Manage Users** — create / edit / drop users, authentication plugin, account lock, resource limits, server privileges, per-database privileges, *Show Grants*.

**Built for the web**
- 🎨 Light and dark themes, adjustable font size, settings stored with the application so they follow you between browsers. One application password, CSRF tokens on every request, sign-in throttling, an optional IP allow-list, and a data folder that is never served to the web.

---

## 🖥️ Platforms

| | Supported | Notes |
| --- | --- | --- |
| **Web server** | Apache ✅ tested (cPanel, PHP-FPM) · nginx + php-fpm · IIS · `php -S` | Any server that runs PHP. On Apache the shipped `.htaccess` files deny the library files and the `data/` folder; on nginx deny `data/` yourself. |
| **PHP** | 8.0 or newer (8.3 tested) | Extensions: `mysqli`, `openssl`, `mbstring` (standard everywhere); `fileinfo` recommended. No Composer packages. |
| **Database** | MySQL 5.7 / 8.x ✅ tested (8.0) · MariaDB 10.x | Over TCP or a Unix socket (type the socket path in the *Host* field). SSL supported. |
| **Browser** | Chrome / Edge ✅ tested · Firefox · Safari | A current browser; no plug-ins. |
| **Hosting** | Shared hosting ✅ · VPS · Docker | Only PHP and write access to `data/` are needed; the shipped `.user.ini` raises the PHP upload and time limits for the folder. |

---

## 🚀 Installation

### 1. Prerequisites

- A web server with **PHP 8.0 or newer** and the `mysqli` extension (on cPanel: any *ea-php8x*; on Debian / Ubuntu: `apt install php php-mysql`).
- A **MySQL or MariaDB** server the web server can reach.
- **Git** (to clone) — or download the ZIP from GitHub.

### 2. Get the code

```bash
git clone https://github.com/gextam/navicat-web.git
```

or download <https://github.com/gextam/navicat-web/archive/refs/heads/main.zip> and unpack it.

### 3. Put it on your web server

Copy the folder into the document root (or a sub-folder — the app does not care where it lives):

```
public_html/
└── mysql/                 ← https://your-host/mysql/
    ├── index.php  login.php  api.php  …
    ├── css/  js/  img/  vendor/codemirror/
    ├── data/              ← must be writable by the web server, never served (data/.htaccess)
    ├── .htaccess          ← Apache: denies config.php, auth.php, storage.php, db.php
    └── .user.ini          ← PHP limits for this folder (upload 64 MB, 600 s)
```

Make `data/` writable by the web-server user (`chown www-data data` or `chmod 775 data`, depending on your host). It holds the application store (connections with encrypted passwords, saved queries, history, settings), the encryption key and temporary import files.

> **nginx**: add `location ~ ^/mysql/(data|config\.php|auth\.php|storage\.php|db\.php) { deny all; }` (adjust the path), or point `NW_DATA_DIR` in `config.php` to a folder outside the document root.

### 4. First run

Open the folder's URL. The first visit asks you to **choose the application password** — you enter it every time you open the app. Sign-in attempts are throttled per address, and the session lasts 12 hours by default.

### 5. Add a connection

Click **Connection** in the toolbar (or right-click the empty navigation pane): enter a name, host, port, user and password, optionally an initial database and a colour, press **Test Connection**, then **OK**. Double-click the connection in the navigation pane to open it; double-click a database to list its objects.

### Optional: the demo database

`tests/demo_schema.sql` creates a small `navicat_demo` database with tables, foreign keys, a generated column, ENUM / SET / JSON columns, views, a function, a procedure, triggers and an event — handy for a first look:

```bash
mysql -u root -p < tests/demo_schema.sql
```

### Quick look without a web server

```bash
cd navicat-web
php -S localhost:8080
```

then open <http://localhost:8080/>.

### Configuration reference (`config.php`)

| Constant | Meaning |
| --- | --- |
| `NW_DATA_DIR` | Where the store, the key and temporary files live (default `data/` inside the app). Point it outside the document root on servers that cannot deny the folder. |
| `NW_DEFAULT_LIMIT`, `NW_MAX_LIMIT` | Rows per page for table data and query results (default 1000) and the hard cap (10 000). The per-user default is changeable in *Options*. |
| `NW_SESSION_HOURS` | How long a sign-in lasts (12). |
| `NW_CONNECT_TIMEOUT` | Seconds to wait for a MySQL server (10). |
| `NW_MAX_CELL_BYTES`, `NW_MAX_BLOB_BYTES` | Larger cells are sent to the browser as previews only (1 MB text, 64 KB binary). |
| `NW_HISTORY_MAX` | Query-history entries kept per connection (500). |
| `NW_IMPORT_SLICE_SECONDS`, `NW_IMPORT_WINDOW` | How long one *Execute SQL File* request runs before the browser asks for the next slice (12 s), and how many bytes are parsed at a time (8 MB). |
| `NW_LOGIN_MAX_FAILS`, `NW_LOGIN_LOCK_MINUTES` | Sign-in throttling (8 failures → 15 minutes). |
| `$NW_ALLOWED_IPS` | Optional allow-list of client addresses or CIDR ranges for the whole application. |

`.user.ini` sets `upload_max_filesize`, `post_max_size`, `max_execution_time`, `max_input_time` and `memory_limit` for the folder; adjust it (or your php.ini) if your host ignores it. Uploads for *Execute SQL File* are sent in 1 MB pieces, so even the default PHP limits work.

---

## 📖 User guide

### The window

<div align="center">

![Table data in the main area](https://gextam.github.io/navicat-web/screenshots/table-data.png)

</div>

1. **Toolbar** — *Connection*, *New Query*, *Table*, *View*, *Function*, *Event*, *User*, *Query*, *Backup* (Dump SQL File), *Monitor*, *Options*, *Sign Out*. The object buttons act on the connection / database selected in the navigation pane (or ask you to pick one).
2. **Navigation pane** (left) — connections, databases and object folders; the filter box narrows it. Drag the splitter to resize; the width is remembered.
3. **Document tabs** — the **Objects** tab is always first; tables, designers, queries, monitors open as further tabs (middle-click or × closes, Ctrl+Tab cycles, right-click for *Close Others* / *Close All*). A `*` marks unsaved changes.
4. **Status bar** — object counts and the current user@host · database on the right.

<div align="center">

![Navigation pane](https://gextam.github.io/navicat-web/screenshots/navigation-pane.png)

</div>

### Connections

<div align="center">

![New Connection dialog](https://gextam.github.io/navicat-web/screenshots/connection-dialog.png)

</div>

*Connection* → **MySQL…** / **MariaDB…** opens the dialog: **General** (name, host, port, user name, password, *Save password*, initial database, colour), **SSL** (use SSL, verify the server certificate, CA certificate path on the web server), **Advanced** (encoding, compression, connect timeout, notes). **Test Connection** reports the server version. Right-click a connection for *Open* / *Close*, *Edit*, *Duplicate*, *Delete*, *New Database*, *New Query*, *Execute SQL File*, *Dump SQL File*, *Server Monitor*, *Manage Users*, *Server Information* and *Refresh*. Closing a connection closes all of its documents.

Passwords are encrypted with a key that lives in `data/.key`; a connection saved without *Save password* asks for the password on every use.

### Navigation pane and Objects

Double-click a database to open it (its icon turns green); its folders show counts. Select a folder to see the list in the Objects tab: tables with **Name, Rows, Data Length, Engine, Auto Increment, Created / Modified Date, Collation, Comment**; views with definer / updatable / security; functions with type / returns / definer; events with status / schedule / last executed; saved queries with database and date. Click a header to sort, type in *Search* to filter, Ctrl / Shift-click for multi-selection (*Delete* and *Dump SQL* act on the selection). The information pane below shows **General** facts or the **DDL** of the selected object; collapse it with ▼.

### Table data

<div align="center">

![Record navigator](https://gextam.github.io/navicat-web/screenshots/record-navigator.png)

</div>

Double-click a table (or *Open Table*). The footer is Navicat's record navigator: **+** adds a record, **−** deletes the selected ones, **✓** posts pending changes, **✗** discards them, **↻** refreshes; then the SQL that produced the page, *Record n of total*, the pager with page number, **Limit** switch and page size, and the query time.

- **Navigate** with the arrow keys, Tab, Home / End, Page Up / Down; click a row number to select the row, Shift / Ctrl-click for ranges and sets, Ctrl+A for all.
- **Edit** by typing, Enter or F2 (ENUM columns open a drop-down; long text opens a multi-line editor). Changed cells turn yellow and the tab shows `*`. Moving to another record posts the change; **Ctrl+S** / ✓ posts everything; ✗ reverts. Errors from MySQL come back in a dialog and the record stays editable.
- **Context menu**: *Set to NULL* (Ctrl+0), *Set to Empty String*, *Edit Cell Value…* (F7), *Copy*, *Copy As* ▸ tab-separated / CSV / JSON / INSERT statements, *Paste*, *Add Record* (Ctrl+Insert), *Duplicate Record*, *Delete Record* (Ctrl+Delete), *Filter by this value*, *Refresh* (F5).
- **Header click** sorts (Shift+click adds a second key); the header menu has *Sort Ascending / Descending*, *Remove Sort*, *Filter by this column…*, *Copy Column Name*.

<div align="center">

![Filter and sort bars](https://gextam.github.io/navicat-web/screenshots/filter-sort.png)

</div>

**Filter** and **Sort** in the toolbar open their bars: add any number of conditions (column, operator, value — *between* takes two, *in* a comma-separated list), a free-form **Where** expression, and the sort keys; **Apply** reloads from the server, **Clear** removes everything. The generated SQL is shown in the footer.

<div align="center">

![Cell viewer with JSON formatting](https://gextam.github.io/navicat-web/screenshots/cell-viewer.png)

</div>

**Edit Cell Value** opens the viewer: *Text* with word wrap and a character count, *Hex* with load / save file for binary columns, *Image* when the bytes are a picture, *JSON* with formatting, and *Set to NULL*. Values that are too large for the grid (over 1 MB text, 64 KB binary) are shown as previews and cannot be edited in place.

### Table designer

<div align="center">

![Table designer, Fields tab](https://gextam.github.io/navicat-web/screenshots/table-designer.png)

</div>

*Design Table* (or *Table* in the toolbar for a new one) opens the designer with **Save, Add Field, Insert Field, Delete Field, Primary Key, Move Up, Move Down** and the tabs **Fields · Indexes · Foreign Keys · Triggers · Options · Comment · SQL Preview**.

- **Fields**: edit directly in the grid; the properties panel below the grid changes with the selected field — *Default* (none, NULL, empty string, a value, an expression, or `CURRENT_TIMESTAMP` for timestamps), *Auto Increment*, *Unsigned*, *Zerofill*, *Character set* and *Collation* (only when different from the table's), *Values* for ENUM / SET (one per line), *On Update Current_Timestamp*, and *Expression* / *Stored* for virtual fields. The key column toggles the primary key; composite keys show their order.

<div align="center">

![Indexes tab](https://gextam.github.io/navicat-web/screenshots/designer-indexes.png)

</div>

- **Indexes**: name, fields (click to tick fields in order, with sub part and ASC / DESC), index type (NORMAL, UNIQUE, FULLTEXT, SPATIAL), index method (BTREE, HASH), comment. The primary key is managed in *Fields*.

<div align="center">

![Foreign Keys tab](https://gextam.github.io/navicat-web/screenshots/designer-foreign-keys.png)

</div>

- **Foreign Keys**: name, fields, referenced schema / table / fields (lists come from the server), *On Delete* and *On Update* (RESTRICT, CASCADE, SET NULL, NO ACTION).
- **Triggers**: name, *Fires* (BEFORE / AFTER), event (INSERT / UPDATE / DELETE) and the body in an editor; a plain statement is wrapped in `BEGIN … END` for you.
- **Options**: engine, auto increment, character set, collation, row format, checksum. **Comment**: the table comment.

<div align="center">

![SQL Preview of a pending change](https://gextam.github.io/navicat-web/screenshots/designer-sql-preview.png)

</div>

- **SQL Preview** shows exactly what **Save** will execute. For an existing table that is a minimal `ALTER TABLE`: `ADD` / `CHANGE` / `DROP COLUMN` with `FIRST` / `AFTER` positions, `DROP` / `ADD PRIMARY KEY`, `DROP` / `ADD INDEX`, foreign-key drops before adds, option changes, then trigger `DROP` / `CREATE` statements and a `RENAME`. A new table produces one `CREATE TABLE`. Saving a new table asks for its name. Errors stop at the failing statement, which is shown with MySQL's message.

### Queries

<div align="center">

![Query editor with results](https://gextam.github.io/navicat-web/screenshots/query-editor.png)

</div>

*New Query* (Ctrl+Q) opens an editor bound to the connection and database shown at the right of its toolbar (change them there).

- **Run** (Ctrl+R, F9) runs the selection if there is one, otherwise everything; **Run Current Statement** (Ctrl+Enter) runs the statement under the cursor and selects it; **Run Selected** (Ctrl+Shift+R). **Stop** sends `KILL QUERY` to the running statement.
- Statements are split like the `mysql` client does (quotes, comments, `/*! … */` and `DELIMITER` lines are understood), so pasted dumps and `CREATE PROCEDURE … END;;` blocks run as they are.
- Every result set gets a **Result n** tab — sort by clicking headers, right-click for *Copy* / *Copy As* / *View Cell Value* / *Export Result* / *Open Table*; the footer shows the row count (and whether the *Limit* cut it) and the time.

<div align="center">

![Message pane](https://gextam.github.io/navicat-web/screenshots/query-message.png)

</div>

- The **Message** tab lists every statement: `[SQL]`, `OK, n rows returned` or `affected rows: n` (with `Rows matched` info for updates), warnings, `[Err] code - message`, and the time; a failing statement stops the run and the tab turns red.
- **Explain** runs `EXPLAIN` on the SELECT / INSERT / UPDATE / DELETE statements; **Beautify** reformats the SQL (or the selection); **Ctrl+Space** completes table and column names (they also pop up while typing); **Ctrl+/** toggles comments; **Ctrl+F** finds.
- **Save** (Ctrl+S) / **Save As** store the query under *Queries* in the tree for that connection and database; **History** shows the last 500 runs of the connection with their time and result (click one to insert it); **Export Result** writes the active result set in any export format by re-running its statement.

### Views, functions and events

<div align="center">

![Function designer](https://gextam.github.io/navicat-web/screenshots/function-designer.png)

</div>

- **View designer** (*Design View* / *View*): the `SELECT` in an editor with autocompletion, **Advanced** (algorithm, definer, security, check option), **SQL Preview** and **Preview** (runs the SELECT in a query tab). Saving uses `CREATE OR REPLACE VIEW`; the definer is only changed when you edit it.
- **Function / procedure designer**: type and name (fixed once saved), the parameter grid (mode for procedures, name, type), *Returns* for functions, *Deterministic*, *Data access*, *Security*, *Definer*, *Comment*, and the body. Saving drops and recreates the routine. **Run** asks for the IN arguments and opens `CALL …` / `SELECT fn(…)` in a query tab.
- **Event designer**: name, status (ENABLE / DISABLE / DISABLE ON SLAVE), *Preserve on completion*, schedule (`AT` a time, or `EVERY n SECOND … YEAR` with *Starts* / *Ends*), definer, comment, body. Existing events are altered in place (including rename); *Enable / Disable Event* is also in the tree's context menu.

### Dump SQL File and Execute SQL File

<div align="center">

![Dump SQL File dialog](https://gextam.github.io/navicat-web/screenshots/dump-dialog.png)

</div>

**Dump SQL File** (toolbar *Backup*, or the context menus — *Structure and Data* / *Structure Only*): choose the database and tick tables, views, functions, procedures and events (everything is pre-selected when you start from a database, just the object when you start from one); options for *Structure*, *Data*, `DROP … IF EXISTS`, triggers and `CREATE DATABASE`. The file streams to the browser as a download in Navicat's dump layout (`SET FOREIGN_KEY_CHECKS`, per-table sections, batched `INSERT`s, `delimiter ;;` around routines and triggers).

<div align="center">

![Execute SQL File dialog](https://gextam.github.io/navicat-web/screenshots/execute-sql-file.png)

</div>

**Execute SQL File** (*Run SQL File* in the menus): pick a file — or paste SQL in the *From Text* tab — choose the target database and whether to *Continue on error* and *Disable foreign key checks*, then **Start**. The file is uploaded in pieces and executed in slices of about 12 seconds; the progress bar, counts and error log update as it goes, and the tree refreshes when it is done. Statements such as `USE other_db` are honoured across slices.

### Import and Export wizards

<div align="center">

![Export Wizard](https://gextam.github.io/navicat-web/screenshots/export-wizard.png)

</div>

**Export Wizard** (table context menu, Objects toolbar or table toolbar) writes the table — with the current filter and sort — as CSV, TXT (tab-separated), JSON, SQL `INSERT` statements, HTML, XML or Markdown; options for column titles, delimiter and a UTF-8 BOM for Excel. Query results use the same dialog through *Export Result*.

**Import Wizard** reads CSV / TXT (delimiter auto-detected, header row optional, empty values as NULL) or JSON (an array of objects) into an existing table or a new one (text columns from the headers), shows a preview and a field mapping, and imports in *Append*, *Update (REPLACE)*, *Append or Update (ON DUPLICATE KEY UPDATE)* or *Delete and Append* mode, in batches with progress.

### Server Monitor and Manage Users

<div align="center">

![Server Monitor](https://gextam.github.io/navicat-web/screenshots/server-monitor.png)

</div>

**Server Monitor** (toolbar *Monitor*, or the connection menu) has four tabs: **Process List** (refresh, auto-refresh every 5 s, *Kill Process*), **Variables** (global or session, filter, double-click a global variable to *Set* it), **Status** (global or session counters with a filter) and **Information** (version, host, uptime, threads, questions, character set, `sql_mode` …).

**Manage Users** (toolbar *User*) lists the accounts of `mysql.user` with plugin, lock state, limits and password date. *New User* / *Edit User* open a dialog with **General** (user, host, plugin, password, account locked), **Advanced** (per-hour limits, max user connections), **Server Privileges** (the global privileges, `WITH GRANT OPTION`) and **Database Privileges** (one row per database with its own privilege set). Saving generates the `CREATE USER` / `ALTER USER` / `RENAME USER` / `REVOKE` / `GRANT` statements; dynamic and object-level grants that the dialog does not edit are kept. *Show Grants* prints `SHOW GRANTS`. The connection's account needs `SELECT` on `mysql.user` to list users.

### Options

*Options* in the toolbar: **General** (light / dark theme, font size, default rows per page), **Password** (change the application password), **About**. Settings are stored with the application, so they apply in every browser you sign in from.

<div align="center">

![Dark theme](https://gextam.github.io/navicat-web/screenshots/dark-theme.png)

</div>

### Keyboard shortcuts

<details>
<summary><b>Full list</b></summary>

| Keys | Where | Action |
| --- | --- | --- |
| Ctrl+Q | anywhere | New query for the selected connection / database |
| F5 | anywhere | Refresh the active tab (table, designer, monitor, objects) |
| Ctrl+Tab / Ctrl+Shift+Tab | anywhere | Next / previous document tab |
| Ctrl+F4 | anywhere | Close the active tab |
| Ctrl+S | table, designer, query, view / routine / event | Post changes / save |
| ↑ ↓ ← → · Tab / Shift+Tab · Home / End · Page Up / Down · Ctrl+Home / Ctrl+End | grid | Move the focus |
| Enter / F2 · any character | grid | Edit the cell (typing replaces the value) |
| Enter · Tab · ↑ ↓ | cell editor | Commit (Ctrl+Enter in multi-line editors) |
| Esc | cell editor, dialogs, menus | Cancel / close |
| Ctrl+0 | grid | Set to NULL |
| Ctrl+Insert / Ctrl+Delete | grid | Add record / delete selected records |
| F7 | grid | Edit Cell Value… |
| Ctrl+C / Ctrl+Shift+C · Ctrl+V · Ctrl+A | grid | Copy cell or rows (with field names) · paste into the cell · select all |
| Shift+click · Ctrl+click | grid headers / rows | Add a sort key · add a row to the selection |
| Ctrl+R / F9 · Ctrl+Enter · Ctrl+Shift+R | query | Run (selection or all) · run current statement · run selected |
| Ctrl+Space · Ctrl+/ · Ctrl+F | query | Autocomplete · toggle comment · find |
| ↑ ↓ ← → · Enter · F5 · Delete | navigation pane | Move · open / toggle · refresh · delete |

</details>

---

## ⚠️ Known limitations

- **MySQL and MariaDB only.** No PostgreSQL, SQLite, Oracle, SQL Server or MongoDB.
- **No SSH / HTTP tunnelling** — the web server itself must be able to reach the database (SSL connections are supported).
- **Query results are read-only**; edit data in the table's own tab. Views are read-only as well.
- No Query Builder, Data Modeler, Data Synchronisation, Structure Synchronisation, scheduled jobs, charts, Navicat Cloud or `.ncx` import.
- The Import Wizard reads CSV / TXT and JSON (no Excel, XML, Access, ODBC); the table designer does not edit partitions, check constraints or column-level privileges.
- Routines are saved with `DROP` + `CREATE` (MySQL has no `ALTER` for bodies), so a failing `CREATE` leaves the routine dropped — the error dialog shows the statement so you can fix and re-run it. Manage Users needs `SELECT` on `mysql.user`; MySQL 8 only lets accounts with `SYSTEM_USER` alter objects whose definer is `root`.
- Everything the signed-in person can do is bounded by the saved MySQL accounts — there is one application password, not per-user accounts or roles.

---

## 🔒 Security notes

- Serve the application over **HTTPS** and use a strong application password: whoever knows it can run any SQL the saved MySQL accounts allow. Prefer least-privilege MySQL accounts and `$NW_ALLOWED_IPS` where possible.
- Connection passwords are encrypted with AES-256-GCM using `data/.key`; the key and the store are created with `0600` permissions and the folder is denied to the web. Back up `data/` together (the store is useless without the key).
- Every API request carries a CSRF token; sessions are cookie-based with `HttpOnly`, `SameSite=Lax` and `Secure` on HTTPS; sign-in is throttled per address; library files cannot be requested directly on Apache.

---

## 🗂️ Project layout

```
index.php          the application shell (loads the scripts below)
login.php          sign-in and first-run password      logout.php
api.php            the JSON API: one action per request (connections, databases, tables, data,
                   queries, objects, exports, dumps, imports, server, users)
db.php             MySQL access (mysqli), result encoding, the SQL statement splitter, exports, dumps
auth.php           sessions, application password, sign-in throttling, IP allow-list
storage.php        JSON store with file locking, AES-256-GCM secret handling
config.php         settings (see the configuration reference)
css/app.css        the look (light and dark themes, Navicat-style grids, dialogs, menus)
js/core.js         DOM helpers, API client, dialogs, context menus, toasts, tabs, settings
js/grid.js         the data grid (selection, keyboard, in-place editing, clipboard, sorting)
js/tree.js         navigation pane and its context menus
js/objects.js      the Objects tab and information pane
js/table.js        table data tab, cell viewer, Export Wizard
js/designer.js     table designer and DDL generation (CREATE / ALTER diff)
js/query.js        query editor, results, message pane, beautifier, history, saved queries
js/connection.js   New / Edit Connection dialog
js/tools.js        database dialogs, Dump SQL File, Execute SQL File, Import Wizard, Server Monitor,
                   Manage Users, view / routine / event designers, Options
js/app.js          start-up, toolbar commands, global shortcuts
js/icons.js        the inline SVG icon set
vendor/codemirror  CodeMirror 5 (MIT) — editor, SQL mode, hints, search
img/               logo and favicon           data/   store, key, temp files (git-ignored, denied to the web)
tests/demo_schema.sql   demo database         tools/screenshots.mjs   regenerates docs/screenshots
docs/              project page (GitHub Pages) and screenshots
```

## 🧪 Development

```bash
php -S 127.0.0.1:8089                       # run from the project folder; data/ is created on first use
mysql -u root -p < tests/demo_schema.sql    # demo database used by the screenshots and the manual tests
php -l api.php && node --check js/*.js      # syntax checks (no test framework is needed)
APP_PASSWORD=… DB_PASSWORD=… node tools/screenshots.mjs   # regenerates docs/screenshots/*.png with headless Chrome
```

- The API is a single `switch` in `api.php`; every action returns `{ok: true, …}` or `{ok: false, error}`. Statements are run through `nw_exec()` in `db.php`, which never throws for SQL errors but returns `{type: 'error'}` results, so multi-statement runs can continue or stop as requested.
- The browser never builds SQL for data edits: it sends typed values and the original key values, and `api.php` quotes everything. DDL for the designers is generated in the browser (so it can be previewed) and executed statement by statement through `ddl.run`.
- `tools/screenshots.mjs` needs Node 22+ (built-in WebSocket) and a local Chrome or Edge; it signs in, creates the connection it needs, drives the UI through the app's own JavaScript objects and writes 1600 × 1000 pictures plus 2× close-ups.

## License

MIT — see `LICENSE`. CodeMirror is © Marijn Haverbeke and contributors, MIT licensed.

<?php
/**
 * Navicat Web - JSON API. Every request carries an action; POST bodies are JSON (or a form for
 * downloads and uploads). All responses are {ok:true, ...} or {ok:false, error}.
 */
declare(strict_types=1);

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/storage.php';
require_once __DIR__ . '/db.php';

ini_set('display_errors', '0');
error_reporting(E_ALL);
set_error_handler(function ($no, $str, $file, $line) {
    if (!(error_reporting() & $no)) return false;
    throw new ErrorException($str, 0, $no, $file, $line);
});
@ini_set('memory_limit', '512M');
@set_time_limit(0);
ignore_user_abort(false);

header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');

$isGet = ($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'GET';
if ($isGet) {
    $in = $_GET;
} else {
    $ct = (string)($_SERVER['CONTENT_TYPE'] ?? '');
    if (stripos($ct, 'application/json') !== false) {
        $in = json_decode((string)file_get_contents('php://input'), true);
        if (!is_array($in)) $in = array();
    } else {
        $in = $_POST;
    }
}
$action = (string)($in['action'] ?? ($_GET['action'] ?? ''));

function out($data): void
{
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE | JSON_PRESERVE_ZERO_FRACTION);
    exit;
}

function fail(string $msg, int $code = 400, array $extra = array()): void
{
    http_response_code($code);
    out(array('ok' => false, 'error' => $msg) + $extra);
}

function p(array $in, string $k, $default = null)
{
    return array_key_exists($k, $in) ? $in[$k] : $default;
}

function need(array $in, string $k): string
{
    $v = $in[$k] ?? null;
    if ($v === null || $v === '') throw new NwError("Missing parameter: $k");
    return (string)$v;
}

function pbool(array $in, string $k, bool $default = false): bool
{
    $v = $in[$k] ?? null;
    if ($v === null) return $default;
    if (is_bool($v)) return $v;
    $s = strtolower((string)$v);
    return !($s === '' || $s === '0' || $s === 'false' || $s === 'no' || $s === 'off');
}

function pjson(array $in, string $k, $default = array())
{
    $v = $in[$k] ?? null;
    if ($v === null) return $default;
    if (is_string($v)) {
        $d = json_decode($v, true);
        return $d === null ? $default : $d;
    }
    return $v;
}

/** Connection + optional database from the request. */
function open_conn(array $in, bool $withDb = true): array
{
    $c = nw_conn_get(need($in, 'conn'));
    $db = $withDb ? (string)p($in, 'db', '') : '';
    $m = nw_connect($c, $db !== '' ? $db : null);
    return array($m, $c);
}

function conn_from_input(array $in): array
{
    $name = trim((string)p($in, 'name', ''));
    if ($name === '') throw new NwError('The connection needs a name.');
    $port = (int)p($in, 'port', 3306);
    return array(
        'name' => $name,
        'host' => trim((string)p($in, 'host', 'localhost')),
        'port' => $port > 0 ? $port : 3306,
        'user' => (string)p($in, 'user', 'root'),
        'savePassword' => pbool($in, 'savePassword', true),
        'ssl' => pbool($in, 'ssl'),
        'sslVerify' => pbool($in, 'sslVerify'),
        'sslCa' => trim((string)p($in, 'sslCa', '')),
        'compress' => pbool($in, 'compress'),
        'timeout' => max(1, (int)p($in, 'timeout', NW_CONNECT_TIMEOUT)),
        'color' => preg_replace('/[^#A-Za-z0-9]/', '', (string)p($in, 'color', '')),
        'initialDb' => trim((string)p($in, 'initialDb', '')),
        'charset' => preg_replace('/[^A-Za-z0-9_]/', '', (string)p($in, 'charset', 'utf8mb4')) ?: 'utf8mb4',
        'group' => trim((string)p($in, 'group', '')),
        'note' => (string)p($in, 'note', ''),
    );
}

function list_dbs(mysqli $m): array
{
    try {
        $rows = nw_rows($m, 'SELECT SCHEMA_NAME name, DEFAULT_CHARACTER_SET_NAME charset, DEFAULT_COLLATION_NAME collation FROM information_schema.SCHEMATA ORDER BY SCHEMA_NAME');
        if ($rows) return $rows;
    } catch (Throwable $e) {
    }
    $out = array();
    foreach (nw_rows($m, 'SHOW DATABASES') as $r) $out[] = array('name' => reset($r), 'charset' => null, 'collation' => null);
    return $out;
}

function server_basics(mysqli $m): array
{
    $r = nw_row($m, 'SELECT @@version version, @@version_comment comment, @@hostname hostname, @@port port, @@character_set_server charset, @@collation_server collation, @@lower_case_table_names lctn, @@sql_mode sqlMode, @@max_allowed_packet maxPacket, @@event_scheduler eventScheduler');
    $r = $r ?: array();
    $r['hostInfo'] = $m->host_info;
    $r['protocol'] = $m->protocol_version;
    $r['clientInfo'] = $m->client_info;
    return $r;
}

function db_objects(mysqli $m, string $db): array
{
    $tables = array();
    $views = array();
    foreach (nw_rows($m, 'SHOW TABLE STATUS FROM ' . nw_ident($db)) as $r) {
        $isView = ($r['Comment'] ?? '') === 'VIEW' && ($r['Engine'] ?? null) === null;
        $row = array(
            'name' => $r['Name'], 'engine' => $r['Engine'], 'rows' => $r['Rows'] !== null ? (int)$r['Rows'] : null,
            'dataLength' => (int)($r['Data_length'] ?? 0), 'indexLength' => (int)($r['Index_length'] ?? 0), 'dataFree' => (int)($r['Data_free'] ?? 0),
            'autoInc' => $r['Auto_increment'] ?? null, 'created' => $r['Create_time'] ?? null, 'updated' => $r['Update_time'] ?? null,
            'collation' => $r['Collation'] ?? null, 'comment' => $r['Comment'] ?? '', 'rowFormat' => $r['Row_format'] ?? null,
            'avgRowLength' => (int)($r['Avg_row_length'] ?? 0), 'checksum' => $r['Checksum'] ?? null, 'createOptions' => $r['Create_options'] ?? '',
        );
        if ($isView) $views[$r['Name']] = array('name' => $r['Name'], 'created' => $r['Create_time'] ?? null);
        else $tables[] = $row;
    }
    try {
        foreach (nw_rows($m, 'SELECT TABLE_NAME name, DEFINER definer, SECURITY_TYPE security, IS_UPDATABLE updatable, CHECK_OPTION checkOption FROM information_schema.VIEWS WHERE TABLE_SCHEMA=? ORDER BY TABLE_NAME', array($db)) as $v) {
            $views[$v['name']] = array_merge($views[$v['name']] ?? array('name' => $v['name'], 'created' => null), $v);
        }
    } catch (Throwable $e) {
    }
    $routines = array();
    try {
        $routines = nw_rows($m, 'SELECT ROUTINE_NAME `name`, ROUTINE_TYPE `type`, DEFINER `definer`, CREATED `created`, LAST_ALTERED `modified`, DTD_IDENTIFIER `returns`, ROUTINE_COMMENT `comment`, SECURITY_TYPE `security`, IS_DETERMINISTIC `deterministic`, SQL_DATA_ACCESS `dataAccess` FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA=? ORDER BY ROUTINE_NAME', array($db));
    } catch (Throwable $e) {
    }
    $events = array();
    try {
        $events = nw_rows($m, "SELECT EVENT_NAME name, STATUS status, EVENT_TYPE type, EXECUTE_AT executeAt, INTERVAL_VALUE intervalValue, INTERVAL_FIELD intervalField, STARTS starts, ENDS ends, LAST_EXECUTED lastExecuted, DEFINER definer, EVENT_COMMENT comment, ON_COMPLETION onCompletion, CREATED created, LAST_ALTERED modified FROM information_schema.EVENTS WHERE EVENT_SCHEMA=? ORDER BY EVENT_NAME", array($db));
    } catch (Throwable $e) {
    }
    $triggers = array();
    try {
        $triggers = nw_rows($m, 'SELECT TRIGGER_NAME name, EVENT_OBJECT_TABLE tbl, EVENT_MANIPULATION event, ACTION_TIMING timing, DEFINER definer, CREATED created FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=? ORDER BY EVENT_OBJECT_TABLE, TRIGGER_NAME', array($db));
    } catch (Throwable $e) {
    }
    return array('tables' => $tables, 'views' => array_values($views), 'routines' => $routines, 'events' => $events, 'triggers' => $triggers);
}

function show_create(mysqli $m, string $kind, string $db, string $name): string
{
    $kw = strtoupper($kind);
    $row = nw_row($m, "SHOW CREATE $kw " . nw_qname($db, $name));
    if (!$row) throw new NwError("$kind $name not found");
    foreach ($row as $k => $v) {
        if ((stripos($k, 'Create') === 0 && $k !== 'Create Options') || $k === 'SQL Original Statement') {
            if ($v === null || $v === '') throw new NwError("MySQL does not show the definition of $kind $name to this user. The account needs the SHOW_ROUTINE privilege (MySQL 8.0.20+), the global SELECT privilege, or to be the definer.");
            return (string)$v;
        }
    }
    return '';
}

function key_where(mysqli $m, array $keyVals, array $key): string
{
    $parts = array();
    if ($key['mode'] !== 'all') {
        foreach ($key['cols'] as $col) {
            if (!array_key_exists($col, $keyVals)) throw new NwError("The key column '$col' is missing from the row (reload the table).");
            $parts[] = nw_ident($col) . ' <=> ' . nw_q($m, $keyVals[$col]);
        }
    } else {
        foreach ($keyVals as $col => $v) {
            if (is_array($v) && isset($v['big'])) continue;
            $parts[] = nw_ident((string)$col) . ' <=> ' . nw_q($m, $v);
        }
    }
    if (!$parts) throw new NwError('Cannot identify the row to change (the table has no usable key).');
    return implode(' AND ', $parts);
}

function history_add(string $connId, string $db, string $sql, float $secs, bool $ok, ?string $error): void
{
    $entry = array('sql' => strlen($sql) > 20000 ? substr($sql, 0, 20000) . "\n-- (truncated)" : $sql, 'db' => $db, 'at' => date('c'),
        'ms' => (int)round($secs * 1000), 'ok' => $ok, 'error' => $error);
    nw_store_update(function (&$d) use ($connId, $entry) {
        $h = $d['history'][$connId] ?? array();
        array_unshift($h, $entry);
        if (count($h) > NW_HISTORY_MAX) $h = array_slice($h, 0, NW_HISTORY_MAX);
        $d['history'][$connId] = $h;
    });
}

function import_path(string $id): string
{
    if (!preg_match('/^[a-f0-9]{16}$/', $id)) throw new NwError('Bad import id');
    return NW_DATA_DIR . '/tmp/imp_' . $id . '.sql';
}

/** WHERE / ORDER BY fragments from the browser's filter, custom condition and sort. */
function select_parts(mysqli $m, array $q): array
{
    $where = '';
    $filters = $q['filters'] ?? array();
    if (is_array($filters) && $filters) $where = nw_filter_sql($m, $filters);
    $raw = trim((string)($q['where'] ?? ''));
    if ($raw !== '') $where = $where !== '' ? "($where) AND ($raw)" : $raw;
    $order = '';
    foreach ((array)($q['sort'] ?? array()) as $s) {
        if (empty($s['col'])) continue;
        $order .= ($order ? ', ' : '') . nw_ident((string)$s['col']) . (strtoupper((string)($s['dir'] ?? 'ASC')) === 'DESC' ? ' DESC' : ' ASC');
    }
    return array('where' => $where, 'order' => $order);
}

function build_select(mysqli $m, string $db, string $table, array $q, int $offset, int $limit): string
{
    $p = select_parts($m, $q);
    $cols = '*';
    if (!empty($q['columns']) && is_array($q['columns'])) $cols = implode(', ', array_map('nw_ident', $q['columns']));
    return "SELECT $cols FROM " . nw_qname($db, $table) . ($p['where'] !== '' ? ' WHERE ' . $p['where'] : '') . ($p['order'] !== '' ? ' ORDER BY ' . $p['order'] : '')
        . ($limit > 0 ? " LIMIT $offset, $limit" : '');
}

function nw_api(string $action, array $in): array
{
    switch ($action) {

        /* ---------------------------------------------------------------- application */
        case 'app.info': {
            $s = nw_store_read();
            return array('name' => NW_NAME, 'version' => NW_VERSION, 'csrf' => nw_csrf(), 'settings' => (object)$s['settings'],
                'php' => PHP_VERSION, 'defaultLimit' => NW_DEFAULT_LIMIT, 'maxLimit' => NW_MAX_LIMIT);
        }
        case 'app.settings.save': {
            $settings = p($in, 'settings', array());
            if (!is_array($settings)) $settings = array();
            $out = nw_store_update(function (&$d) use ($settings) {
                $d['settings'] = array_merge($d['settings'], $settings);
                return $d['settings'];
            });
            return array('settings' => (object)$out);
        }
        case 'app.password.change': {
            $old = (string)p($in, 'old', '');
            $new = (string)p($in, 'new', '');
            if (!nw_check_password($old)) throw new NwError('The current password is not correct.');
            if (strlen($new) < 6) throw new NwError('The new password must have at least 6 characters.');
            nw_set_password($new);
            return array();
        }

        /* ---------------------------------------------------------------- connections */
        case 'conn.list': {
            $s = nw_store_read();
            return array('connections' => array_map('nw_conn_public', $s['connections']));
        }
        case 'conn.save': {
            $c = conn_from_input($in);
            $id = (string)p($in, 'id', '');
            $pwGiven = array_key_exists('password', $in) && $in['password'] !== null;
            $pw = $pwGiven ? (string)$in['password'] : '';
            $saved = nw_store_update(function (&$d) use ($c, $id, $pwGiven, $pw) {
                $idx = null;
                foreach ($d['connections'] as $i => $x) if (($x['id'] ?? '') === $id) $idx = $i;
                if ($idx === null) {
                    $c['id'] = nw_id();
                    $c['created'] = date('c');
                    if ($pwGiven && $c['savePassword'] && $pw !== '') $c['passwordEnc'] = nw_encrypt($pw);
                    $d['connections'][] = $c;
                    return $c;
                }
                $old = $d['connections'][$idx];
                $c['id'] = $id;
                $c['created'] = $old['created'] ?? date('c');
                if ($c['savePassword']) {
                    if ($pwGiven) {
                        if ($pw !== '') $c['passwordEnc'] = nw_encrypt($pw);
                    } elseif (!empty($old['passwordEnc'])) {
                        $c['passwordEnc'] = $old['passwordEnc'];
                    }
                }
                $d['connections'][$idx] = $c;
                return $c;
            });
            return array('connection' => nw_conn_public($saved));
        }
        case 'conn.delete': {
            $id = need($in, 'id');
            nw_store_update(function (&$d) use ($id) {
                $d['connections'] = array_values(array_filter($d['connections'], function ($x) use ($id) { return ($x['id'] ?? '') !== $id; }));
                $d['queries'] = array_values(array_filter($d['queries'], function ($x) use ($id) { return ($x['conn'] ?? '') !== $id; }));
                unset($d['history'][$id]);
            });
            return array();
        }
        case 'conn.test': {
            $c = conn_from_input($in);
            if (array_key_exists('password', $in) && $in['password'] !== null && $in['password'] !== '') {
                $c['password'] = (string)$in['password'];
            } elseif (($id = (string)p($in, 'id', '')) !== '') {
                $old = nw_conn_get($id);
                $c['passwordEnc'] = $old['passwordEnc'] ?? '';
            }
            $m = nw_connect($c);
            $v = $m->server_info;
            $m->close();
            return array('version' => $v);
        }
        case 'conn.open': {
            list($m, $c) = open_conn($in, false);
            return array('version' => $m->server_info, 'databases' => list_dbs($m), 'server' => server_basics($m));
        }

        /* ---------------------------------------------------------------- databases */
        case 'db.list': {
            list($m) = open_conn($in, false);
            return array('databases' => list_dbs($m));
        }
        case 'db.create': {
            list($m) = open_conn($in, false);
            $name = need($in, 'name');
            $sql = 'CREATE DATABASE ' . nw_ident($name);
            if (($cs = (string)p($in, 'charset', '')) !== '') $sql .= ' CHARACTER SET ' . nw_ident($cs);
            if (($co = (string)p($in, 'collation', '')) !== '') $sql .= ' COLLATE ' . nw_ident($co);
            $m->query($sql);
            return array('sql' => $sql);
        }
        case 'db.alter': {
            list($m) = open_conn($in, false);
            $name = need($in, 'name');
            $sql = 'ALTER DATABASE ' . nw_ident($name);
            if (($cs = (string)p($in, 'charset', '')) !== '') $sql .= ' CHARACTER SET ' . nw_ident($cs);
            if (($co = (string)p($in, 'collation', '')) !== '') $sql .= ' COLLATE ' . nw_ident($co);
            $m->query($sql);
            return array('sql' => $sql);
        }
        case 'db.drop': {
            list($m) = open_conn($in, false);
            $sql = 'DROP DATABASE ' . nw_ident(need($in, 'name'));
            $m->query($sql);
            return array('sql' => $sql);
        }
        case 'db.objects': {
            list($m) = open_conn($in, false);
            return db_objects($m, need($in, 'db'));
        }
        case 'db.charsets': {
            list($m) = open_conn($in, false);
            return array('charsets' => nw_rows($m, 'SHOW CHARACTER SET'), 'collations' => nw_rows($m, 'SHOW COLLATION'), 'engines' => nw_rows($m, 'SHOW ENGINES'));
        }
        case 'db.columns': { /* every column of a database, for autocompletion */
            list($m) = open_conn($in, false);
            $rows = nw_rows($m, 'SELECT TABLE_NAME t, COLUMN_NAME c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? ORDER BY TABLE_NAME, ORDINAL_POSITION', array(need($in, 'db')));
            $map = array();
            foreach ($rows as $r) $map[$r['t']][] = $r['c'];
            return array('tables' => (object)$map);
        }

        /* ---------------------------------------------------------------- tables */
        case 'table.design': {
            list($m) = open_conn($in);
            $db = need($in, 'db');
            $t = need($in, 'table');
            $isView = nw_is_view($m, $db, $t);
            return array(
                'columns' => nw_table_columns($m, $db, $t),
                'indexes' => $isView ? array() : nw_table_indexes($m, $db, $t),
                'foreignKeys' => $isView ? array() : nw_table_fks($m, $db, $t),
                'triggers' => $isView ? array() : nw_table_triggers($m, $db, $t),
                'status' => nw_table_status($m, $db, $t),
                'ddl' => show_create($m, $isView ? 'VIEW' : 'TABLE', $db, $t),
                'isView' => $isView,
            );
        }
        case 'table.ddl': {
            list($m) = open_conn($in);
            $db = need($in, 'db');
            $t = need($in, 'table');
            return array('ddl' => show_create($m, nw_is_view($m, $db, $t) ? 'VIEW' : 'TABLE', $db, $t));
        }
        case 'table.rename': {
            list($m) = open_conn($in);
            $db = need($in, 'db');
            $sql = 'RENAME TABLE ' . nw_qname($db, need($in, 'table')) . ' TO ' . nw_qname($db, need($in, 'newName'));
            $m->query($sql);
            return array('sql' => $sql);
        }
        case 'table.truncate': {
            list($m) = open_conn($in);
            $sql = 'TRUNCATE TABLE ' . nw_qname(need($in, 'db'), need($in, 'table'));
            $m->query($sql);
            return array('sql' => $sql);
        }
        case 'table.empty': {
            list($m) = open_conn($in);
            $sql = 'DELETE FROM ' . nw_qname(need($in, 'db'), need($in, 'table'));
            $m->query($sql);
            return array('sql' => $sql, 'affected' => $m->affected_rows);
        }
        case 'table.drop': {
            list($m) = open_conn($in);
            $db = need($in, 'db');
            $t = need($in, 'table');
            $sql = (nw_is_view($m, $db, $t) ? 'DROP VIEW ' : 'DROP TABLE ') . nw_qname($db, $t);
            $m->query($sql);
            return array('sql' => $sql);
        }
        case 'table.duplicate': {
            list($m) = open_conn($in);
            $db = need($in, 'db');
            $t = need($in, 'table');
            $n = need($in, 'newName');
            $sqls = array('CREATE TABLE ' . nw_qname($db, $n) . ' LIKE ' . nw_qname($db, $t));
            if (pbool($in, 'withData', true)) $sqls[] = 'INSERT INTO ' . nw_qname($db, $n) . ' SELECT * FROM ' . nw_qname($db, $t);
            foreach ($sqls as $s) $m->query($s);
            return array('sql' => implode(";\n", $sqls));
        }
        case 'table.maintain': {
            list($m) = open_conn($in);
            $op = strtoupper((string)p($in, 'op', 'CHECK'));
            if (!in_array($op, array('ANALYZE', 'CHECK', 'OPTIMIZE', 'REPAIR', 'CHECKSUM', 'FLUSH'), true)) throw new NwError('Unknown operation');
            $db = need($in, 'db');
            $tables = pjson($in, 'tables', array());
            if (!$tables) $tables = array(need($in, 'table'));
            $names = implode(', ', array_map(function ($t) use ($db) { return nw_qname($db, (string)$t); }, $tables));
            $sql = $op === 'FLUSH' ? "FLUSH TABLES $names" : "$op TABLE $names";
            return array('sql' => $sql, 'results' => nw_exec($m, $sql, 0));
        }

        /* ---------------------------------------------------------------- table data */
        case 'data.select': {
            list($m) = open_conn($in);
            $db = need($in, 'db');
            $t = need($in, 'table');
            $limit = min(NW_MAX_LIMIT, max(0, (int)p($in, 'limit', NW_DEFAULT_LIMIT)));
            $offset = max(0, (int)p($in, 'offset', 0));
            $isView = nw_is_view($m, $db, $t);
            $key = $isView ? array('cols' => array(), 'mode' => 'view') : nw_key_columns($m, $db, $t);
            $q = array('filters' => p($in, 'filters', array()), 'where' => p($in, 'where', ''), 'sort' => p($in, 'sort', array()));
            $sql = build_select($m, $db, $t, $q, $offset, $limit);
            $res = nw_exec($m, $sql, 0);
            $res = $res[0];
            if ($res['type'] === 'error') throw new NwError($res['error'], $res['errno']);
            $total = null;
            $approx = false;
            $parts = select_parts($m, $q);
            $countSql = 'SELECT COUNT(*) FROM ' . nw_qname($db, $t) . ($parts['where'] !== '' ? ' WHERE ' . $parts['where'] : '');
            $est = null;
            if (!$isView) {
                try {
                    $est = nw_scalar($m, 'SELECT TABLE_ROWS FROM information_schema.TABLES WHERE TABLE_SCHEMA=? AND TABLE_NAME=?', array($db, $t));
                } catch (Throwable $e) {
                }
            }
            if ($parts['where'] === '' && $est !== null && (int)$est > 2000000 && !pbool($in, 'exactCount')) {
                $total = (int)$est;
                $approx = true;
            } else {
                $cr = nw_exec($m, $countSql, 0);
                if ($cr[0]['type'] === 'rows') $total = (int)$cr[0]['rows'][0][0];
            }
            return array('fields' => $res['fields'], 'rows' => $res['rows'], 'count' => $res['count'], 'total' => $total, 'approx' => $approx,
                'key' => $key, 'readOnly' => $isView, 'sql' => $sql, 'time' => $res['time'], 'offset' => $offset, 'limit' => $limit,
                'columns' => nw_table_columns($m, $db, $t));
        }
        case 'data.save': {
            list($m) = open_conn($in);
            $db = need($in, 'db');
            $t = need($in, 'table');
            $changes = p($in, 'changes', array());
            if (!is_array($changes) || !$changes) throw new NwError('Nothing to save.');
            $key = nw_key_columns($m, $db, $t);
            $qn = nw_qname($db, $t);
            $m->begin_transaction();
            $results = array();
            $i = 0;
            try {
                foreach ($changes as $i => $ch) {
                    $type = (string)($ch['type'] ?? '');
                    if ($type === 'insert') {
                        $vals = $ch['values'] ?? array();
                        if (!is_array($vals) || !$vals) {
                            $m->query("INSERT INTO $qn () VALUES ()");
                        } else {
                            $cols = array();
                            $vs = array();
                            foreach ($vals as $k => $v) {
                                $cols[] = nw_ident((string)$k);
                                $vs[] = nw_q($m, $v);
                            }
                            $m->query("INSERT INTO $qn (" . implode(', ', $cols) . ') VALUES (' . implode(', ', $vs) . ')');
                        }
                        $results[] = array('type' => 'insert', 'insertId' => $m->insert_id, 'affected' => $m->affected_rows);
                    } elseif ($type === 'update') {
                        $set = array();
                        foreach ((array)($ch['values'] ?? array()) as $k => $v) $set[] = nw_ident((string)$k) . ' = ' . nw_q($m, $v);
                        if (!$set) continue;
                        $w = key_where($m, (array)($ch['key'] ?? array()), $key);
                        $m->query("UPDATE $qn SET " . implode(', ', $set) . " WHERE $w" . ($key['mode'] === 'all' ? ' LIMIT 1' : ''));
                        $results[] = array('type' => 'update', 'affected' => $m->affected_rows);
                    } elseif ($type === 'delete') {
                        $w = key_where($m, (array)($ch['key'] ?? array()), $key);
                        $m->query("DELETE FROM $qn WHERE $w" . ($key['mode'] === 'all' ? ' LIMIT 1' : ''));
                        $results[] = array('type' => 'delete', 'affected' => $m->affected_rows);
                    }
                }
                $m->commit();
            } catch (mysqli_sql_exception $e) {
                $m->rollback();
                throw new NwError('Change #' . ($i + 1) . ' failed: ' . $e->getMessage(), $e->getCode());
            } catch (NwError $e) {
                $m->rollback();
                throw $e;
            }
            return array('results' => $results);
        }

        /* ---------------------------------------------------------------- queries */
        case 'query.run': {
            list($m, $c) = open_conn($in);
            $sql = (string)p($in, 'sql', '');
            $stmts = nw_statements($sql);
            if (!$stmts) throw new NwError('Nothing to run.');
            $limit = min(NW_MAX_LIMIT, max(0, (int)p($in, 'limit', NW_DEFAULT_LIMIT)));
            $stop = pbool($in, 'stopOnError', true);
            $runId = preg_replace('/[^A-Za-z0-9_\-]/', '', (string)p($in, 'runId', ''));
            if ($runId !== '') {
                $runs = $_SESSION['nw_runs'] ?? array();
                $runs[$runId] = $m->thread_id;
                if (count($runs) > 30) $runs = array_slice($runs, -30, null, true);
                $_SESSION['nw_runs'] = $runs;
            }
            session_write_close();
            $results = array();
            $t0 = hrtime(true);
            $firstError = null;
            foreach ($stmts as $i => $st) {
                foreach (nw_exec($m, $st, $limit) as $r) {
                    $r['index'] = $i;
                    $results[] = $r;
                    if ($r['type'] === 'error' && $firstError === null) $firstError = $r['error'];
                }
                if ($firstError !== null && $stop) break;
            }
            $total = (hrtime(true) - $t0) / 1e9;
            try {
                history_add($c['id'], (string)p($in, 'db', ''), $sql, $total, $firstError === null, $firstError);
            } catch (Throwable $e) {
            }
            return array('results' => $results, 'time' => $total, 'statements' => count($stmts));
        }
        case 'query.kill': {
            $runId = preg_replace('/[^A-Za-z0-9_\-]/', '', (string)p($in, 'runId', ''));
            $tid = $_SESSION['nw_runs'][$runId] ?? null;
            session_write_close();
            if (!$tid) throw new NwError('That query is not running (or has already finished).');
            list($m) = open_conn($in, false);
            $m->query('KILL QUERY ' . (int)$tid);
            return array('killed' => (int)$tid);
        }
        case 'query.explain': {
            list($m) = open_conn($in);
            $sql = trim((string)p($in, 'sql', ''));
            $stmts = nw_statements($sql);
            if (!$stmts) throw new NwError('Nothing to explain.');
            $results = array();
            foreach ($stmts as $st) {
                if (!preg_match('/^\s*(SELECT|INSERT|UPDATE|DELETE|REPLACE|TABLE|WITH)\b/i', $st)) continue;
                foreach (nw_exec($m, 'EXPLAIN ' . $st, 0) as $r) $results[] = $r;
            }
            if (!$results) throw new NwError('Only SELECT, INSERT, UPDATE, DELETE and REPLACE statements can be explained.');
            return array('results' => $results);
        }
        case 'ddl.run': {
            list($m) = open_conn($in);
            $stmts = p($in, 'statements', array());
            if (is_string($stmts)) $stmts = nw_statements($stmts);
            if (!is_array($stmts) || !$stmts) throw new NwError('Nothing to run.');
            $results = array();
            $failed = null;
            foreach ($stmts as $i => $st) {
                $rs = nw_exec($m, (string)$st, 0);
                foreach ($rs as $r) {
                    $r['index'] = $i;
                    $results[] = $r;
                    if ($r['type'] === 'error' && $failed === null) $failed = $i;
                }
                if ($failed !== null) break;
            }
            return array('results' => $results, 'failedIndex' => $failed);
        }
        case 'query.saved.list': {
            $s = nw_store_read();
            $conn = (string)p($in, 'conn', '');
            $list = array_values(array_filter($s['queries'], function ($q) use ($conn) { return $conn === '' || ($q['conn'] ?? '') === $conn; }));
            usort($list, function ($a, $b) { return strcasecmp($a['name'], $b['name']); });
            return array('queries' => $list);
        }
        case 'query.saved.save': {
            $q = array('id' => (string)p($in, 'id', ''), 'conn' => need($in, 'conn'), 'db' => (string)p($in, 'db', ''),
                'name' => trim((string)p($in, 'name', '')), 'sql' => (string)p($in, 'sql', ''), 'updated' => date('c'));
            if ($q['name'] === '') throw new NwError('The query needs a name.');
            $saved = nw_store_update(function (&$d) use ($q) {
                foreach ($d['queries'] as $i => $x) {
                    if ($q['id'] !== '' && ($x['id'] ?? '') === $q['id']) {
                        $q['created'] = $x['created'] ?? $q['updated'];
                        $d['queries'][$i] = $q;
                        return $q;
                    }
                    if ($q['id'] === '' && ($x['conn'] ?? '') === $q['conn'] && ($x['db'] ?? '') === $q['db'] && strcasecmp($x['name'], $q['name']) === 0) {
                        $q['id'] = $x['id'];
                        $q['created'] = $x['created'] ?? $q['updated'];
                        $d['queries'][$i] = $q;
                        return $q;
                    }
                }
                $q['id'] = nw_id();
                $q['created'] = $q['updated'];
                $d['queries'][] = $q;
                return $q;
            });
            return array('query' => $saved);
        }
        case 'query.saved.delete': {
            $id = need($in, 'id');
            nw_store_update(function (&$d) use ($id) {
                $d['queries'] = array_values(array_filter($d['queries'], function ($x) use ($id) { return ($x['id'] ?? '') !== $id; }));
            });
            return array();
        }
        case 'query.history.list': {
            $s = nw_store_read();
            $conn = need($in, 'conn');
            $h = $s['history'][$conn] ?? array();
            $n = max(1, min(NW_HISTORY_MAX, (int)p($in, 'limit', 200)));
            return array('history' => array_slice($h, 0, $n));
        }
        case 'query.history.clear': {
            $conn = need($in, 'conn');
            nw_store_update(function (&$d) use ($conn) { unset($d['history'][$conn]); });
            return array();
        }

        /* ---------------------------------------------------------------- views, routines, events, triggers */
        case 'obj.ddl': {
            list($m) = open_conn($in);
            $db = need($in, 'db');
            $type = strtolower(need($in, 'type'));
            $name = need($in, 'name');
            if (!in_array($type, array('table', 'view', 'function', 'procedure', 'event', 'trigger'), true)) throw new NwError('Unknown object type');
            $ddl = show_create($m, $type, $db, $name);
            $info = null;
            try {
                if ($type === 'view') {
                    $info = nw_row($m, 'SELECT VIEW_DEFINITION body, CHECK_OPTION checkOption, IS_UPDATABLE updatable, DEFINER definer, SECURITY_TYPE security FROM information_schema.VIEWS WHERE TABLE_SCHEMA=? AND TABLE_NAME=?', array($db, $name));
                    if ($info && preg_match('/ALGORITHM=(\w+)/i', $ddl, $mm)) $info['algorithm'] = strtoupper($mm[1]);
                } elseif ($type === 'function' || $type === 'procedure') {
                    $info = nw_row($m, 'SELECT ROUTINE_DEFINITION `body`, DTD_IDENTIFIER `returns`, IS_DETERMINISTIC `deterministic`, SQL_DATA_ACCESS `dataAccess`, SECURITY_TYPE `security`, ROUTINE_COMMENT `comment`, DEFINER `definer`, SQL_MODE `sqlMode` FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA=? AND ROUTINE_NAME=? AND ROUTINE_TYPE=?', array($db, $name, strtoupper($type)));
                    if ($info) $info['params'] = nw_rows($m, 'SELECT ORDINAL_POSITION `pos`, PARAMETER_MODE `mode`, PARAMETER_NAME `name`, DTD_IDENTIFIER `type` FROM information_schema.PARAMETERS WHERE SPECIFIC_SCHEMA=? AND SPECIFIC_NAME=? AND ROUTINE_TYPE=? ORDER BY ORDINAL_POSITION', array($db, $name, strtoupper($type)));
                } elseif ($type === 'event') {
                    $info = nw_row($m, 'SELECT EVENT_DEFINITION body, EVENT_TYPE type, EXECUTE_AT executeAt, INTERVAL_VALUE intervalValue, INTERVAL_FIELD intervalField, STARTS starts, ENDS ends, STATUS status, ON_COMPLETION onCompletion, EVENT_COMMENT comment, DEFINER definer FROM information_schema.EVENTS WHERE EVENT_SCHEMA=? AND EVENT_NAME=?', array($db, $name));
                } elseif ($type === 'trigger') {
                    $info = nw_row($m, 'SELECT ACTION_STATEMENT body, EVENT_MANIPULATION event, ACTION_TIMING timing, EVENT_OBJECT_TABLE tbl, DEFINER definer FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=? AND TRIGGER_NAME=?', array($db, $name));
                }
            } catch (Throwable $e) {
            }
            return array('ddl' => $ddl, 'info' => $info);
        }
        case 'obj.drop': {
            list($m) = open_conn($in);
            $db = need($in, 'db');
            $type = strtoupper(need($in, 'type'));
            if (!in_array($type, array('TABLE', 'VIEW', 'FUNCTION', 'PROCEDURE', 'EVENT', 'TRIGGER'), true)) throw new NwError('Unknown object type');
            $sql = "DROP $type " . nw_qname($db, need($in, 'name'));
            $m->query($sql);
            return array('sql' => $sql);
        }

        /* ---------------------------------------------------------------- export / dump (downloads) */
        case 'export.table': {
            list($m) = open_conn($in);
            $db = need($in, 'db');
            $t = need($in, 'table');
            $q = pjson($in, 'q', array());
            $sql = build_select($m, $db, $t, is_array($q) ? $q : array(), 0, 0);
            nw_export_stream($m, $sql, array('format' => p($in, 'format', 'csv'), 'name' => $t, 'insertTable' => $t,
                'sep' => p($in, 'sep', ','), 'header' => pbool($in, 'header', true), 'bom' => pbool($in, 'bom')));
            exit;
        }
        case 'export.query': {
            list($m) = open_conn($in);
            $sql = trim((string)p($in, 'sql', ''));
            $stmts = nw_statements($sql);
            if (!$stmts) throw new NwError('Nothing to export.');
            nw_export_stream($m, $stmts[0], array('format' => p($in, 'format', 'csv'), 'name' => (string)p($in, 'name', 'query_result'),
                'insertTable' => (string)p($in, 'name', 'query_result'), 'sep' => p($in, 'sep', ','), 'header' => pbool($in, 'header', true), 'bom' => pbool($in, 'bom')));
            exit;
        }
        case 'dump.sql': {
            list($m, $c) = open_conn($in);
            $db = need($in, 'db');
            $sel = pjson($in, 'sel', array());
            $opt = pjson($in, 'opt', array());
            if (!is_array($sel)) $sel = array();
            if (!is_array($opt)) $opt = array();
            $fn = (string)p($in, 'filename', '');
            if ($fn === '') $fn = $db . (count($sel['tables'] ?? array()) === 1 && empty($sel['views']) ? '_' . $sel['tables'][0] : '') . '.sql';
            nw_download_headers($fn, 'application/sql; charset=utf-8');
            nw_dump($m, $db, $sel, $opt, (string)$c['name']);
            exit;
        }

        /* ---------------------------------------------------------------- import (Execute SQL File) */
        case 'import.upload': {
            if (empty($_FILES['chunk']) || !is_uploaded_file($_FILES['chunk']['tmp_name'])) throw new NwError('No data received (the upload may exceed the server limit).');
            $id = (string)p($in, 'id', '');
            if (!preg_match('/^[a-f0-9]{16}$/', $id)) $id = nw_id();
            $path = import_path($id);
            if ((int)p($in, 'index', 0) === 0 && is_file($path)) unlink($path);
            $data = file_get_contents($_FILES['chunk']['tmp_name']);
            if ((int)p($in, 'index', 0) === 0 && substr($data, 0, 3) === "\xEF\xBB\xBF") $data = substr($data, 3);
            file_put_contents($path, $data, FILE_APPEND | LOCK_EX);
            return array('id' => $id, 'size' => filesize($path));
        }
        case 'import.text': {
            $id = nw_id();
            $path = import_path($id);
            file_put_contents($path, (string)p($in, 'sql', ''), LOCK_EX);
            return array('id' => $id, 'size' => filesize($path));
        }
        case 'import.discard': {
            $path = import_path(need($in, 'id'));
            if (is_file($path)) unlink($path);
            return array();
        }
        case 'import.run': {
            $path = import_path(need($in, 'id'));
            if (!is_file($path)) throw new NwError('The uploaded file is gone. Start the import again.');
            $size = filesize($path);
            $pos = max(0, (int)p($in, 'pos', 0));
            $delim = (string)p($in, 'delim', ';');
            if ($delim === '') $delim = ';';
            $executed = (int)p($in, 'executed', 0);
            $errorCount = (int)p($in, 'errorCount', 0);
            $continue = pbool($in, 'continueOnError', true);
            $db = (string)p($in, 'db', '');
            list($m) = open_conn($in);
            if (pbool($in, 'disableFk', true)) {
                try {
                    $m->query('SET FOREIGN_KEY_CHECKS=0, UNIQUE_CHECKS=0');
                } catch (Throwable $e) {
                }
            }
            $deadline = microtime(true) + NW_IMPORT_SLICE_SECONDS;
            $errors = array();
            $window = NW_IMPORT_WINDOW;
            $stopped = false;
            $t0 = microtime(true);
            while ($pos < $size && microtime(true) < $deadline && !$stopped) {
                $len = min($window, $size - $pos);
                $chunk = file_get_contents($path, false, null, $pos, $len);
                if ($chunk === false) throw new NwError('Cannot read the uploaded file.');
                $atEof = ($pos + $len >= $size);
                $sp = nw_split_sql($chunk, 0, $delim, $deadline, 0);
                $list = $sp['statements'];
                if ($sp['done'] && $atEof && $sp['tail']) $list[] = $sp['tail'];
                if (!$list) {
                    if ($atEof) {
                        $pos = $size;
                        break;
                    }
                    if ($sp['done']) {
                        /* a single statement bigger than the window: widen it */
                        $window *= 2;
                        if ($window > 512 * 1024 * 1024) throw new NwError('A statement in the file is larger than 512 MB.');
                        continue;
                    }
                    /* deadline hit before any statement completed: give up for this slice */
                    break;
                }
                foreach ($list as $st) {
                    try {
                        $m->query($st['sql']);
                        while ($m->more_results() && $m->next_result()) {
                            $r = $m->store_result();
                            if ($r instanceof mysqli_result) $r->free();
                        }
                    } catch (mysqli_sql_exception $e) {
                        $errorCount++;
                        if (count($errors) < 20) $errors[] = array('pos' => $pos + $st['start'], 'error' => $e->getMessage(), 'sql' => mb_strcut($st['sql'], 0, 300, 'UTF-8'));
                        if (!$continue) {
                            $executed++;
                            $pos = $pos + $st['end'];
                            $delim = $st['delim'];
                            $stopped = true;
                            break;
                        }
                    }
                    $executed++;
                    if (preg_match('/^\s*USE\s+`?([^`;\s]+)`?\s*$/i', $st['sql'], $mm)) $db = $mm[1];
                    $delim = $st['delim'];
                    $pos = $pos + $st['end'];
                    if (microtime(true) > $deadline) break;
                }
                if ($pos >= $size) break;
                if (!$sp['done'] || !$atEof) continue;
                /* done with this window and at EOF */
                $pos = $size;
            }
            return array('done' => $pos >= $size || $stopped, 'stopped' => $stopped, 'pos' => $pos, 'size' => $size, 'delim' => $delim,
                'executed' => $executed, 'errorCount' => $errorCount, 'errors' => $errors, 'db' => $db, 'sliceTime' => microtime(true) - $t0);
        }

        /* ---------------------------------------------------------------- server */
        case 'server.info': {
            list($m) = open_conn($in, false);
            $info = server_basics($m);
            try {
                $up = nw_row($m, "SHOW GLOBAL STATUS LIKE 'Uptime'");
                $info['uptime'] = $up ? (int)$up['Value'] : null;
                $th = nw_row($m, "SHOW GLOBAL STATUS LIKE 'Threads_connected'");
                $info['threads'] = $th ? (int)$th['Value'] : null;
                $qs = nw_row($m, "SHOW GLOBAL STATUS LIKE 'Questions'");
                $info['questions'] = $qs ? (int)$qs['Value'] : null;
            } catch (Throwable $e) {
            }
            return array('info' => $info);
        }
        case 'server.processes': {
            list($m) = open_conn($in, false);
            return array('results' => nw_exec($m, 'SHOW FULL PROCESSLIST', 0));
        }
        case 'server.kill': {
            list($m) = open_conn($in, false);
            $id = (int)need($in, 'id');
            $sql = (pbool($in, 'queryOnly') ? 'KILL QUERY ' : 'KILL ') . $id;
            $m->query($sql);
            return array('sql' => $sql);
        }
        case 'server.variables': {
            list($m) = open_conn($in, false);
            $like = trim((string)p($in, 'filter', ''));
            $sql = (pbool($in, 'global', true) ? 'SHOW GLOBAL VARIABLES' : 'SHOW SESSION VARIABLES') . ($like !== '' ? ' LIKE ' . nw_q($m, '%' . $like . '%') : '');
            return array('results' => nw_exec($m, $sql, 0));
        }
        case 'server.status': {
            list($m) = open_conn($in, false);
            $like = trim((string)p($in, 'filter', ''));
            $sql = (pbool($in, 'global', true) ? 'SHOW GLOBAL STATUS' : 'SHOW SESSION STATUS') . ($like !== '' ? ' LIKE ' . nw_q($m, '%' . $like . '%') : '');
            return array('results' => nw_exec($m, $sql, 0));
        }
        case 'server.setVariable': {
            list($m) = open_conn($in, false);
            $name = need($in, 'name');
            if (!preg_match('/^[A-Za-z0-9_]+$/', $name)) throw new NwError('Bad variable name');
            $sql = 'SET GLOBAL ' . $name . ' = ' . nw_q($m, p($in, 'value'));
            $m->query($sql);
            return array('sql' => $sql);
        }

        /* ---------------------------------------------------------------- users */
        case 'users.list': {
            list($m) = open_conn($in, false);
            $rows = nw_rows($m, 'SELECT * FROM mysql.user ORDER BY User, Host');
            $out = array();
            foreach ($rows as $r) {
                $out[] = array('user' => $r['User'], 'host' => $r['Host'], 'plugin' => $r['plugin'] ?? null,
                    'locked' => ($r['account_locked'] ?? 'N') === 'Y', 'expired' => ($r['password_expired'] ?? 'N') === 'Y',
                    'maxQueries' => $r['max_questions'] ?? null, 'maxUpdates' => $r['max_updates'] ?? null,
                    'maxConnections' => $r['max_connections'] ?? null, 'maxUserConnections' => $r['max_user_connections'] ?? null,
                    'ssl' => $r['ssl_type'] ?? null, 'passwordChanged' => $r['password_last_changed'] ?? null);
            }
            return array('users' => $out);
        }
        case 'users.grants': {
            list($m) = open_conn($in, false);
            $u = need($in, 'user');
            $h = (string)p($in, 'host', '%');
            $rows = nw_rows($m, 'SHOW GRANTS FOR ' . nw_q($m, $u) . '@' . nw_q($m, $h));
            $list = array();
            foreach ($rows as $r) $list[] = reset($r);
            return array('grants' => $list);
        }
        case 'users.privileges': {
            list($m) = open_conn($in, false);
            $rows = nw_rows($m, 'SHOW PRIVILEGES');
            return array('privileges' => $rows);
        }

        default:
            throw new NwError('Unknown action: ' . $action);
    }
}

try {
    if (!nw_ip_allowed()) fail('Forbidden', 403);
    if (!nw_is_setup() || !nw_is_logged_in()) fail('Not signed in', 401);
    $tok = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? ($in['csrf'] ?? null);
    if (!nw_csrf_ok(is_string($tok) ? $tok : null)) fail('Your session has expired. Reload the page.', 403);
    if ($action !== 'query.run' && $action !== 'query.kill') session_write_close();
    $res = nw_api($action, $in);
    out(array('ok' => true) + $res);
} catch (NwError $e) {
    fail($e->getMessage(), 400, array('errno' => $e->errno));
} catch (mysqli_sql_exception $e) {
    fail($e->getMessage(), 400, array('errno' => $e->getCode()));
} catch (Throwable $e) {
    fail('Server error: ' . $e->getMessage(), 500);
}

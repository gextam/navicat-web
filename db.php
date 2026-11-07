<?php
/**
 * Navicat Web - MySQL access: connections, quoting, result encoding, statement splitting,
 * exports and SQL dumps.
 */
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/storage.php';

mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);

class NwError extends Exception
{
    public $errno;
    public function __construct($msg, $errno = 0)
    {
        parent::__construct((string)$msg);
        $this->errno = (int)$errno;
    }
}

/* ------------------------------------------------------------------ connections */

function nw_conn_get(string $id): array
{
    $s = nw_store_read();
    foreach ($s['connections'] as $c) {
        if (($c['id'] ?? '') === $id) return $c;
    }
    throw new NwError('Connection not found. It may have been deleted.');
}

/** Open a mysqli connection from a connection record (stored, or as typed in the dialog). */
function nw_connect(array $c, ?string $db = null): mysqli
{
    $m = mysqli_init();
    $m->options(MYSQLI_OPT_CONNECT_TIMEOUT, max(1, (int)($c['timeout'] ?? NW_CONNECT_TIMEOUT)));
    if (defined('MYSQLI_OPT_LOCAL_INFILE')) $m->options(MYSQLI_OPT_LOCAL_INFILE, 0);
    $flags = 0;
    if (!empty($c['ssl'])) {
        $ca = !empty($c['sslCa']) ? (string)$c['sslCa'] : null;
        $m->ssl_set(null, null, $ca, null, null);
        $flags |= MYSQLI_CLIENT_SSL;
        if (empty($c['sslVerify']) && defined('MYSQLI_CLIENT_SSL_DONT_VERIFY_SERVER_CERT')) {
            $flags |= MYSQLI_CLIENT_SSL_DONT_VERIFY_SERVER_CERT;
        }
    }
    if (!empty($c['compress'])) $flags |= MYSQLI_CLIENT_COMPRESS;

    $pw = (string)($c['password'] ?? '');
    if ($pw === '' && !empty($c['passwordEnc'])) $pw = nw_decrypt((string)$c['passwordEnc']);

    $host = trim((string)($c['host'] ?? ''));
    if ($host === '') $host = '127.0.0.1';
    $port = (int)($c['port'] ?? 3306);
    if ($port <= 0) $port = 3306;
    $socket = null;
    if ($host[0] === '/') {
        $socket = $host;
        $host = 'localhost';
    }
    try {
        $m->real_connect($host, (string)($c['user'] ?? ''), $pw, $db !== '' ? $db : null, $port, $socket, $flags);
    } catch (mysqli_sql_exception $e) {
        throw new NwError($e->getMessage(), $e->getCode());
    }
    $cs = (string)($c['charset'] ?? 'utf8mb4');
    try {
        $m->set_charset($cs !== '' ? $cs : 'utf8mb4');
    } catch (mysqli_sql_exception $e) {
        $m->set_charset('utf8');
    }
    return $m;
}

/* ------------------------------------------------------------------ quoting */

function nw_ident(string $s): string
{
    return '`' . str_replace('`', '``', $s) . '`';
}

function nw_qname(string $db, string $t): string
{
    return nw_ident($db) . '.' . nw_ident($t);
}

/** Quote a value coming from the browser as an SQL literal. */
function nw_q(mysqli $m, $v): string
{
    if ($v === null) return 'NULL';
    if (is_bool($v)) return $v ? '1' : '0';
    if (is_int($v)) return (string)$v;
    if (is_float($v)) return is_finite($v) ? var_export($v, true) : 'NULL';
    if (is_array($v)) {
        if (isset($v['b'])) {
            $bin = base64_decode((string)$v['b'], true);
            if ($bin === false) $bin = '';
            return $bin === '' ? "''" : '0x' . bin2hex($bin);
        }
        if (isset($v['expr']) && is_string($v['expr'])) return $v['expr'];
        if (isset($v['big'])) throw new NwError('A value that was only loaded as a preview cannot be written back.');
        $v = json_encode($v);
    }
    return "'" . $m->real_escape_string((string)$v) . "'";
}

/** LIKE pattern escaping for SHOW ... LIKE 'name'. */
function nw_like_literal(mysqli $m, string $s): string
{
    return "'" . $m->real_escape_string(addcslashes($s, '_%')) . "'";
}

/* ------------------------------------------------------------------ result metadata and values */

function nw_type_name(int $t): string
{
    static $map = array(
        0 => 'decimal', 1 => 'tinyint', 2 => 'smallint', 3 => 'int', 4 => 'float', 5 => 'double', 6 => 'null',
        7 => 'timestamp', 8 => 'bigint', 9 => 'mediumint', 10 => 'date', 11 => 'time', 12 => 'datetime', 13 => 'year',
        14 => 'date', 15 => 'varchar', 16 => 'bit', 245 => 'json', 246 => 'decimal', 247 => 'enum', 248 => 'set',
        249 => 'tinyblob', 250 => 'mediumblob', 251 => 'longblob', 252 => 'blob', 253 => 'varchar', 254 => 'char',
        255 => 'geometry',
    );
    return $map[$t] ?? 'unknown';
}

function nw_fields(mysqli_result $r): array
{
    $out = array();
    foreach ($r->fetch_fields() as $i => $f) {
        $t = (int)$f->type;
        $flags = (int)$f->flags;
        $binCs = ((int)$f->charsetnr === 63);
        $tn = nw_type_name($t);
        $isBlob = in_array($t, array(249, 250, 251, 252), true);
        if ($flags & 256) $tn = 'enum';
        elseif ($flags & 2048) $tn = 'set';
        elseif ($isBlob && !$binCs) $tn = str_replace('blob', 'text', $tn);
        elseif (($t === 253 || $t === 254) && $binCs) $tn = $t === 253 ? 'varbinary' : 'binary';
        $binary = $binCs && ($isBlob || $t === 253 || $t === 254 || $t === 255 || $t === 16) && !($flags & (256 | 2048));
        $out[] = array(
            'name' => $f->name,
            'orgName' => $f->orgname,
            'table' => $f->table,
            'orgTable' => $f->orgtable,
            'db' => $f->db,
            'type' => $tn,
            'typeId' => $t,
            'len' => (int)$f->length,
            'dec' => (int)$f->decimals,
            'binary' => $binary,
            'blob' => $isBlob,
            'notNull' => (bool)($flags & 1),
            'pk' => (bool)($flags & 2),
            'unique' => (bool)($flags & 4),
            'mkey' => (bool)($flags & 8),
            'unsigned' => (bool)($flags & 32),
            'autoInc' => (bool)($flags & 512),
            'num' => (bool)($flags & 32768),
        );
    }
    return $out;
}

/** Encode one cell for JSON. Binary and oversized values become small objects the grid understands. */
function nw_val($v, array $f)
{
    if ($v === null) return null;
    if ($f['typeId'] === 16) { /* BIT: mysqli returns the raw bytes */
        $hex = bin2hex($v);
        if (strlen($v) <= 7) return (string)hexdec($hex === '' ? '0' : $hex);
        return '0x' . $hex;
    }
    if (!empty($f['binary'])) {
        $n = strlen($v);
        if ($n > NW_MAX_BLOB_BYTES) return array('big' => true, 'n' => $n, 'p' => bin2hex(substr($v, 0, 64)), 'bin' => true);
        return array('b' => base64_encode($v), 'n' => $n);
    }
    $n = strlen($v);
    if ($n > NW_MAX_CELL_BYTES) {
        $p = mb_strcut($v, 0, 4000, 'UTF-8');
        if (!mb_check_encoding($p, 'UTF-8')) $p = bin2hex(substr($v, 0, 64));
        return array('big' => true, 'n' => $n, 'p' => $p);
    }
    if (!mb_check_encoding($v, 'UTF-8')) return array('b' => base64_encode($v), 'n' => $n);
    return $v;
}

/* ------------------------------------------------------------------ executing statements */

function nw_warnings(mysqli $m): array
{
    try {
        $w = $m->query('SHOW WARNINGS');
        $rows = $w->fetch_all(MYSQLI_ASSOC);
        $w->free();
        return $rows;
    } catch (Throwable $e) {
        return array();
    }
}

/** Collect one result set into our JSON shape. */
function nw_collect(mysqli_result $r, int $limit): array
{
    $fields = nw_fields($r);
    $rows = array();
    $n = 0;
    $truncated = false;
    while (($row = $r->fetch_row()) !== null && $row !== false) {
        if ($limit > 0 && $n >= $limit) {
            $truncated = true;
            break;
        }
        foreach ($row as $i => $v) $row[$i] = nw_val($v, $fields[$i]);
        $rows[] = $row;
        $n++;
    }
    $r->free();
    return array('type' => 'rows', 'fields' => $fields, 'rows' => $rows, 'count' => $n, 'truncated' => $truncated);
}

/**
 * Execute ONE statement. Returns a list of results (a CALL may yield several result sets).
 * Never throws for SQL errors: they come back as {type:'error'}.
 */
function nw_exec(mysqli $m, string $sql, int $limit = 0): array
{
    $t0 = hrtime(true);
    $out = array();
    try {
        $r = $m->query($sql, $limit > 0 ? MYSQLI_USE_RESULT : MYSQLI_STORE_RESULT);
    } catch (mysqli_sql_exception $e) {
        return array(array('type' => 'error', 'error' => $e->getMessage(), 'errno' => $e->getCode(),
            'time' => (hrtime(true) - $t0) / 1e9, 'sql' => $sql));
    }
    if ($r instanceof mysqli_result) {
        $res = nw_collect($r, $limit);
        $res['time'] = (hrtime(true) - $t0) / 1e9;
        $res['sql'] = $sql;
        $out[] = $res;
    } else {
        $res = array('type' => 'ok', 'affected' => $m->affected_rows, 'insertId' => $m->insert_id, 'info' => (string)$m->info,
            'warnings' => $m->warning_count, 'time' => (hrtime(true) - $t0) / 1e9, 'sql' => $sql);
        if ($m->warning_count) $res['warningList'] = nw_warnings($m);
        $out[] = $res;
    }
    /* more result sets (stored procedures) */
    try {
        while ($m->more_results() && $m->next_result()) {
            $r2 = $m->store_result();
            if ($r2 instanceof mysqli_result) {
                $res = nw_collect($r2, $limit);
                $res['time'] = (hrtime(true) - $t0) / 1e9;
                $res['sql'] = $sql;
                $out[] = $res;
            } elseif ($m->affected_rows > 0 && $m->field_count === 0) {
                /* final status of a CALL; nothing to add */
            }
        }
    } catch (mysqli_sql_exception $e) {
        $out[] = array('type' => 'error', 'error' => $e->getMessage(), 'errno' => $e->getCode(),
            'time' => (hrtime(true) - $t0) / 1e9, 'sql' => $sql);
    }
    return $out;
}

/**
 * Run a statement that must succeed; returns all rows as assoc arrays.
 * "?" placeholders are replaced by quoted literals rather than bound: information_schema queries
 * on MySQL 8 only use the data-dictionary fast path when TABLE_SCHEMA / TABLE_NAME are constants,
 * and with bound parameters the same lookups can take many seconds on servers with many tables.
 */
function nw_rows(mysqli $m, string $sql, array $params = array()): array
{
    if ($params) {
        $i = 0;
        $sql = preg_replace_callback('/\?/', function () use ($m, $params, &$i) { return nw_q($m, $params[$i++] ?? null); }, $sql);
    }
    $r = $m->query($sql);
    if (!($r instanceof mysqli_result)) return array();
    $rows = $r->fetch_all(MYSQLI_ASSOC);
    $r->free();
    return $rows;
}

function nw_row(mysqli $m, string $sql, array $params = array()): ?array
{
    $rows = nw_rows($m, $sql, $params);
    return $rows ? $rows[0] : null;
}

function nw_scalar(mysqli $m, string $sql, array $params = array())
{
    $row = nw_row($m, $sql, $params);
    if (!$row) return null;
    return reset($row);
}

/* ------------------------------------------------------------------ statement splitting */

/**
 * Split SQL text into statements, honouring quotes, comments and DELIMITER directives.
 * Resumable: returns the byte position reached and the delimiter in effect. Each statement carries
 * 'start' and 'end' (byte offsets within $s) and the delimiter in effect after it.
 */
function nw_split_sql(string $s, int $pos = 0, string $delim = ';', ?float $deadline = null, int $max = 0): array
{
    $len = strlen($s);
    $stmts = array();
    $start = $pos;
    $i = $pos;
    $content = false;
    $lineStart = true;
    $dl = strlen($delim);
    while ($i < $len) {
        $c = $s[$i];
        if ($lineStart && !$content && ($c === 'd' || $c === 'D') && strncasecmp(substr($s, $i, 9), 'DELIMITER', 9) === 0
            && ($i + 9 >= $len || ctype_space($s[$i + 9]))) {
            $eol = strpos($s, "\n", $i);
            if ($eol === false) $eol = $len;
            $nd = trim(substr($s, $i + 9, $eol - $i - 9));
            if ($nd !== '') {
                $delim = $nd;
                $dl = strlen($delim);
            }
            $i = $eol + 1;
            $start = min($i, $len);
            $lineStart = true;
            continue;
        }
        if ($c === "\n") {
            $lineStart = true;
            $i++;
            continue;
        }
        if ($c === ' ' || $c === "\t" || $c === "\r") {
            $i++;
            continue;
        }
        if ($c === '-' && $i + 1 < $len && $s[$i + 1] === '-'
            && ($i + 2 >= $len || $s[$i + 2] === ' ' || $s[$i + 2] === "\t" || $s[$i + 2] === "\n" || $s[$i + 2] === "\r")) {
            $eol = strpos($s, "\n", $i);
            $i = $eol === false ? $len : $eol;
            continue;
        }
        if ($c === '#') {
            $eol = strpos($s, "\n", $i);
            $i = $eol === false ? $len : $eol;
            continue;
        }
        if ($c === '/' && $i + 1 < $len && $s[$i + 1] === '*') {
            $end = strpos($s, '*/', $i + 2);
            if ($i + 2 < $len && $s[$i + 2] === '!') $content = true; /* executable comment */
            $i = $end === false ? $len : $end + 2;
            $lineStart = false;
            continue;
        }
        if ($c === "'" || $c === '"' || $c === '`') {
            $q = $c;
            $i++;
            while ($i < $len) {
                $d = $s[$i];
                if ($d === '\\' && $q !== '`') {
                    $i += 2;
                    continue;
                }
                if ($d === $q) {
                    $i++;
                    break;
                }
                $i++;
            }
            $content = true;
            $lineStart = false;
            continue;
        }
        if ($c === $delim[0] && substr_compare($s, $delim, $i, $dl) === 0) {
            $sql = trim(substr($s, $start, $i - $start));
            if ($content && $sql !== '') {
                $stmts[] = array('sql' => $sql, 'start' => $start, 'end' => $i + $dl, 'delim' => $delim);
            }
            $i += $dl;
            $start = $i;
            $content = false;
            $lineStart = false;
            if (($max && count($stmts) >= $max) || ($deadline !== null && microtime(true) > $deadline)) {
                return array('statements' => $stmts, 'pos' => $i, 'delim' => $delim, 'done' => false, 'tail' => null);
            }
            continue;
        }
        $content = true;
        $lineStart = false;
        $i++;
    }
    $tail = trim(substr($s, $start));
    return array(
        'statements' => $stmts,
        'pos' => $len,
        'delim' => $delim,
        'done' => true,
        'tail' => ($content && $tail !== '') ? array('sql' => $tail, 'start' => $start, 'end' => $len, 'delim' => $delim) : null,
    );
}

/** All statements of a text (tail included). */
function nw_statements(string $sql): array
{
    $sp = nw_split_sql($sql);
    $list = array();
    foreach ($sp['statements'] as $st) $list[] = $st['sql'];
    if ($sp['tail']) $list[] = $sp['tail']['sql'];
    return $list;
}

/* ------------------------------------------------------------------ schema helpers */

function nw_table_columns(mysqli $m, string $db, string $table): array
{
    return nw_rows($m, 'SELECT COLUMN_NAME name, ORDINAL_POSITION pos, COLUMN_DEFAULT dflt, IS_NULLABLE nullable, DATA_TYPE dataType,
        CHARACTER_MAXIMUM_LENGTH charLen, NUMERIC_PRECISION numPrec, NUMERIC_SCALE numScale, DATETIME_PRECISION dtPrec,
        CHARACTER_SET_NAME charset, COLLATION_NAME collation, COLUMN_TYPE colType, COLUMN_KEY colKey, EXTRA extra,
        COLUMN_COMMENT comment, GENERATION_EXPRESSION genExpr
        FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME=? ORDER BY ORDINAL_POSITION', array($db, $table));
}

function nw_table_indexes(mysqli $m, string $db, string $table): array
{
    $rows = nw_rows($m, 'SHOW INDEX FROM ' . nw_qname($db, $table));
    $idx = array();
    foreach ($rows as $r) {
        $k = $r['Key_name'];
        if (!isset($idx[$k])) {
            $type = strtoupper((string)$r['Index_type']);
            $idx[$k] = array(
                'name' => $k,
                'unique' => !(int)$r['Non_unique'],
                'primary' => $k === 'PRIMARY',
                'kind' => ($type === 'FULLTEXT' || $type === 'SPATIAL') ? $type : (!(int)$r['Non_unique'] ? 'UNIQUE' : 'NORMAL'),
                'method' => ($type === 'FULLTEXT' || $type === 'SPATIAL') ? '' : $type,
                'comment' => (string)($r['Index_comment'] ?? ''),
                'visible' => !isset($r['Visible']) || $r['Visible'] !== 'NO',
                'columns' => array(),
            );
        }
        $idx[$k]['columns'][] = array(
            'name' => $r['Column_name'],
            'sub' => $r['Sub_part'] !== null ? (int)$r['Sub_part'] : null,
            'order' => ($r['Collation'] ?? 'A') === 'D' ? 'DESC' : 'ASC',
            'expr' => $r['Expression'] ?? null,
            'nullable' => ($r['Null'] ?? '') === 'YES',
        );
    }
    return array_values($idx);
}

function nw_table_fks(mysqli $m, string $db, string $table): array
{
    $rows = nw_rows($m, 'SELECT k.CONSTRAINT_NAME name, k.COLUMN_NAME col, k.REFERENCED_TABLE_SCHEMA refDb, k.REFERENCED_TABLE_NAME refTable,
        k.REFERENCED_COLUMN_NAME refCol, k.ORDINAL_POSITION pos, r.UPDATE_RULE onUpdate, r.DELETE_RULE onDelete
        FROM information_schema.KEY_COLUMN_USAGE k
        JOIN information_schema.REFERENTIAL_CONSTRAINTS r ON r.CONSTRAINT_SCHEMA=k.CONSTRAINT_SCHEMA AND r.CONSTRAINT_NAME=k.CONSTRAINT_NAME AND r.TABLE_NAME=k.TABLE_NAME
        WHERE k.TABLE_SCHEMA=? AND k.TABLE_NAME=? AND k.REFERENCED_TABLE_NAME IS NOT NULL
        ORDER BY k.CONSTRAINT_NAME, k.ORDINAL_POSITION', array($db, $table));
    $fks = array();
    foreach ($rows as $r) {
        $k = $r['name'];
        if (!isset($fks[$k])) {
            $fks[$k] = array('name' => $k, 'columns' => array(), 'refDb' => $r['refDb'], 'refTable' => $r['refTable'],
                'refColumns' => array(), 'onUpdate' => $r['onUpdate'], 'onDelete' => $r['onDelete']);
        }
        $fks[$k]['columns'][] = $r['col'];
        $fks[$k]['refColumns'][] = $r['refCol'];
    }
    return array_values($fks);
}

function nw_table_triggers(mysqli $m, string $db, string $table): array
{
    return nw_rows($m, 'SELECT TRIGGER_NAME name, EVENT_MANIPULATION event, ACTION_TIMING timing, ACTION_STATEMENT statement,
        DEFINER definer, ACTION_ORDER ord, CREATED created
        FROM information_schema.TRIGGERS WHERE EVENT_OBJECT_SCHEMA=? AND EVENT_OBJECT_TABLE=? ORDER BY ACTION_TIMING, EVENT_MANIPULATION, ACTION_ORDER',
        array($db, $table));
}

function nw_table_status(mysqli $m, string $db, string $table): ?array
{
    $rows = nw_rows($m, 'SHOW TABLE STATUS FROM ' . nw_ident($db) . ' LIKE ' . nw_like_literal($m, $table));
    foreach ($rows as $r) if ($r['Name'] === $table) return $r;
    return $rows ? $rows[0] : null;
}

/** Columns used to identify a row for editing: PK, else a NOT NULL unique index, else [] (all columns). */
function nw_key_columns(mysqli $m, string $db, string $table): array
{
    $idx = nw_table_indexes($m, $db, $table);
    foreach ($idx as $i) if ($i['primary']) return array('cols' => array_column($i['columns'], 'name'), 'mode' => 'pk');
    foreach ($idx as $i) {
        if (!$i['unique']) continue;
        $ok = true;
        foreach ($i['columns'] as $c) if ($c['nullable'] || $c['expr'] !== null || $c['sub'] !== null) $ok = false;
        if ($ok) return array('cols' => array_column($i['columns'], 'name'), 'mode' => 'unique');
    }
    return array('cols' => array(), 'mode' => 'all');
}

function nw_is_view(mysqli $m, string $db, string $table): bool
{
    $t = nw_scalar($m, 'SELECT TABLE_TYPE FROM information_schema.TABLES WHERE TABLE_SCHEMA=? AND TABLE_NAME=?', array($db, $table));
    return $t !== null && stripos((string)$t, 'VIEW') !== false;
}

/* ------------------------------------------------------------------ filters (table data) */

function nw_filter_sql(mysqli $m, array $filters): string
{
    $parts = array();
    foreach ($filters as $f) {
        $col = (string)($f['col'] ?? '');
        if ($col === '') continue;
        $op = strtolower(trim((string)($f['op'] ?? '=')));
        $v = $f['val'] ?? '';
        $v2 = $f['val2'] ?? '';
        $c = nw_ident($col);
        switch ($op) {
            case '=': case '<>': case '!=': case '>': case '>=': case '<': case '<=':
                $parts[] = "$c $op " . nw_q($m, $v);
                break;
            case 'like':
            case 'not like':
                $parts[] = "$c " . strtoupper($op) . ' ' . nw_q($m, $v);
                break;
            case 'contains':
                $parts[] = "$c LIKE " . nw_q($m, '%' . $v . '%');
                break;
            case 'not contains':
                $parts[] = "$c NOT LIKE " . nw_q($m, '%' . $v . '%');
                break;
            case 'begins with':
                $parts[] = "$c LIKE " . nw_q($m, $v . '%');
                break;
            case 'ends with':
                $parts[] = "$c LIKE " . nw_q($m, '%' . $v);
                break;
            case 'is null':
                $parts[] = "$c IS NULL";
                break;
            case 'is not null':
                $parts[] = "$c IS NOT NULL";
                break;
            case 'is empty':
                $parts[] = "$c = ''";
                break;
            case 'is not empty':
                $parts[] = "$c <> ''";
                break;
            case 'in':
            case 'not in':
                $vals = array_map('trim', explode(',', (string)$v));
                $q = array();
                foreach ($vals as $x) $q[] = nw_q($m, $x);
                if ($q) $parts[] = "$c " . strtoupper($op) . ' (' . implode(', ', $q) . ')';
                break;
            case 'between':
            case 'not between':
                $parts[] = "$c " . strtoupper($op) . ' ' . nw_q($m, $v) . ' AND ' . nw_q($m, $v2);
                break;
            case 'regexp':
                $parts[] = "$c REGEXP " . nw_q($m, $v);
                break;
        }
    }
    return implode(' AND ', $parts);
}

/* ------------------------------------------------------------------ exports */

function nw_download_headers(string $filename, string $mime): void
{
    if (function_exists('apache_setenv')) @apache_setenv('no-gzip', '1');
    @ini_set('zlib.output_compression', '0');
    header('Content-Type: ' . $mime);
    header('Content-Disposition: attachment; filename="' . str_replace('"', '', $filename) . '"');
    header('X-Content-Type-Options: nosniff');
    header('Cache-Control: no-store');
    while (ob_get_level()) ob_end_flush();
}

function nw_csv_cell($v, string $sep): string
{
    if ($v === null) return '';
    $s = (string)$v;
    if ($s === '') return '';
    if (strpbrk($s, "\"\r\n" . $sep) !== false) return '"' . str_replace('"', '""', $s) . '"';
    return $s;
}

function nw_xml_esc($s): string
{
    return htmlspecialchars((string)$s, ENT_XML1 | ENT_QUOTES, 'UTF-8');
}

function nw_sql_literal(mysqli $m, $v, array $f): string
{
    if ($v === null) return 'NULL';
    if (!empty($f['binary'])) return $v === '' ? "''" : '0x' . bin2hex($v);
    if ($f['typeId'] === 16) return "b'" . (strlen($v) ? decbin(hexdec(bin2hex($v))) : '0') . "'";
    if (!empty($f['num']) && $v !== '' && is_numeric($v)) return (string)$v;
    return "'" . $m->real_escape_string((string)$v) . "'";
}

/**
 * Stream the rows of $sql to the browser in the chosen format.
 * $opt: name (table/base name), format, sep, header, bom, insertTable (for sql), db
 */
function nw_export_stream(mysqli $m, string $sql, array $opt): void
{
    $format = strtolower((string)($opt['format'] ?? 'csv'));
    $name = preg_replace('/[^A-Za-z0-9_.\-]+/', '_', (string)($opt['name'] ?? 'export')) ?: 'export';
    $ext = array('csv' => 'csv', 'tsv' => 'txt', 'txt' => 'txt', 'json' => 'json', 'sql' => 'sql', 'html' => 'html', 'xml' => 'xml', 'md' => 'md');
    $mime = array('csv' => 'text/csv; charset=utf-8', 'tsv' => 'text/plain; charset=utf-8', 'txt' => 'text/plain; charset=utf-8',
        'json' => 'application/json; charset=utf-8', 'sql' => 'application/sql; charset=utf-8', 'html' => 'text/html; charset=utf-8',
        'xml' => 'application/xml; charset=utf-8', 'md' => 'text/markdown; charset=utf-8');
    if (!isset($ext[$format])) $format = 'csv';
    $r = $m->query($sql, MYSQLI_USE_RESULT);
    if (!($r instanceof mysqli_result)) throw new NwError('The statement did not return rows.');
    $fields = nw_fields($r);
    $names = array_column($fields, 'name');
    nw_download_headers($name . '.' . $ext[$format], $mime[$format]);
    $sep = $format === 'csv' ? (string)($opt['sep'] ?? ',') : "\t";
    if ($sep === '') $sep = ',';
    $header = !isset($opt['header']) || (bool)$opt['header'];
    $table = (string)($opt['insertTable'] ?? $opt['name'] ?? 'table');
    $out = fopen('php://output', 'w');
    $n = 0;
    $batch = array();
    switch ($format) {
        case 'csv':
        case 'tsv':
        case 'txt':
            if (!empty($opt['bom'])) fwrite($out, "\xEF\xBB\xBF");
            if ($header) fwrite($out, implode($sep, array_map(function ($x) use ($sep) { return nw_csv_cell($x, $sep); }, $names)) . "\r\n");
            while (($row = $r->fetch_row()) !== null && $row !== false) {
                $cells = array();
                foreach ($row as $i => $v) $cells[] = nw_csv_cell(!empty($fields[$i]['binary']) && $v !== null ? '0x' . bin2hex($v) : $v, $sep);
                fwrite($out, implode($sep, $cells) . "\r\n");
                if ((++$n % 500) === 0) flush();
            }
            break;
        case 'json':
            fwrite($out, "[\n");
            while (($row = $r->fetch_row()) !== null && $row !== false) {
                $obj = array();
                foreach ($row as $i => $v) {
                    $f = $fields[$i];
                    if ($v !== null && !empty($f['binary'])) $v = '0x' . bin2hex($v);
                    elseif ($v !== null && !empty($f['num']) && is_numeric($v) && strlen($v) < 16) $v = $v + 0;
                    elseif ($v !== null && !mb_check_encoding($v, 'UTF-8')) $v = '0x' . bin2hex($v);
                    $obj[$names[$i]] = $v;
                }
                fwrite($out, ($n ? ",\n" : '') . json_encode($obj, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE));
                if ((++$n % 500) === 0) flush();
            }
            fwrite($out, "\n]\n");
            break;
        case 'sql':
            $cols = implode(', ', array_map('nw_ident', $names));
            fwrite($out, "-- " . NW_NAME . " export of " . $table . "\n-- " . date('Y-m-d H:i:s') . "\n\n");
            while (($row = $r->fetch_row()) !== null && $row !== false) {
                $vals = array();
                foreach ($row as $i => $v) $vals[] = nw_sql_literal($m, $v, $fields[$i]);
                $batch[] = '(' . implode(', ', $vals) . ')';
                if (count($batch) >= 200) {
                    fwrite($out, 'INSERT INTO ' . nw_ident($table) . " ($cols) VALUES\n" . implode(",\n", $batch) . ";\n");
                    $batch = array();
                    flush();
                }
                $n++;
            }
            if ($batch) fwrite($out, 'INSERT INTO ' . nw_ident($table) . " ($cols) VALUES\n" . implode(",\n", $batch) . ";\n");
            break;
        case 'html':
            fwrite($out, "<!DOCTYPE html>\n<html><head><meta charset=\"utf-8\"><title>" . nw_xml_esc($table) . "</title>\n<style>body{font:13px Segoe UI,Arial,sans-serif}table{border-collapse:collapse}th,td{border:1px solid #ccc;padding:3px 8px;white-space:nowrap}th{background:#eef}td.n{color:#999;font-style:italic}</style></head><body>\n<h3>" . nw_xml_esc($table) . "</h3>\n<table>\n<tr>");
            foreach ($names as $c) fwrite($out, '<th>' . nw_xml_esc($c) . '</th>');
            fwrite($out, "</tr>\n");
            while (($row = $r->fetch_row()) !== null && $row !== false) {
                $cells = '';
                foreach ($row as $i => $v) {
                    if ($v === null) $cells .= '<td class="n">(NULL)</td>';
                    elseif (!empty($fields[$i]['binary'])) $cells .= '<td>0x' . bin2hex($v) . '</td>';
                    else $cells .= '<td>' . nw_xml_esc($v) . '</td>';
                }
                fwrite($out, "<tr>$cells</tr>\n");
                if ((++$n % 500) === 0) flush();
            }
            fwrite($out, "</table>\n</body></html>\n");
            break;
        case 'xml':
            fwrite($out, "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<RECORDS>\n");
            while (($row = $r->fetch_row()) !== null && $row !== false) {
                fwrite($out, "  <RECORD>\n");
                foreach ($row as $i => $v) {
                    $tag = preg_replace('/[^A-Za-z0-9_]/', '_', $names[$i]);
                    if ($v === null) fwrite($out, "    <$tag/>\n");
                    else fwrite($out, "    <$tag>" . nw_xml_esc(!empty($fields[$i]['binary']) ? '0x' . bin2hex($v) : $v) . "</$tag>\n");
                }
                fwrite($out, "  </RECORD>\n");
                if ((++$n % 500) === 0) flush();
            }
            fwrite($out, "</RECORDS>\n");
            break;
        case 'md':
            fwrite($out, '| ' . implode(' | ', array_map(function ($x) { return str_replace('|', '\\|', $x); }, $names)) . " |\n");
            fwrite($out, '|' . str_repeat(' --- |', count($names)) . "\n");
            while (($row = $r->fetch_row()) !== null && $row !== false) {
                $cells = array();
                foreach ($row as $i => $v) {
                    if ($v === null) $v = 'NULL';
                    elseif (!empty($fields[$i]['binary'])) $v = '0x' . bin2hex($v);
                    $cells[] = str_replace(array('|', "\r\n", "\n"), array('\\|', ' ', ' '), (string)$v);
                }
                fwrite($out, '| ' . implode(' | ', $cells) . " |\n");
                if ((++$n % 500) === 0) flush();
            }
            break;
    }
    $r->free();
    fclose($out);
}

/* ------------------------------------------------------------------ SQL dump */

function nw_dump_routine_body(mysqli $m, string $kind, string $db, string $name): ?string
{
    $kw = strtoupper($kind);
    $row = nw_row($m, "SHOW CREATE $kw " . nw_qname($db, $name));
    if (!$row) return null;
    foreach ($row as $k => $v) {
        if ((stripos($k, 'Create') === 0 && $k !== 'Create Options') || $k === 'SQL Original Statement') return $v === null ? '' : (string)$v;
    }
    return null;
}

/** Text written into a dump when MySQL hides a definition from the current user. */
function nw_dump_hidden(string $kind, string $name): string
{
    return "-- The definition of $kind `$name` is not visible to this MySQL user\n-- (it needs the SHOW_ROUTINE privilege, global SELECT, or to be the definer).\n\n";
}

/**
 * Write a Navicat-style SQL dump to the output stream.
 * $sel: tables[], views[], functions[], procedures[], events[]; $opt: structure, data, drop, createDb, triggers
 */
function nw_dump(mysqli $m, string $db, array $sel, array $opt, string $connName = ''): void
{
    $structure = !isset($opt['structure']) || (bool)$opt['structure'];
    $data = !isset($opt['data']) || (bool)$opt['data'];
    $drop = !isset($opt['drop']) || (bool)$opt['drop'];
    $withTriggers = !isset($opt['triggers']) || (bool)$opt['triggers'];
    $out = fopen('php://output', 'w');
    $w = function (string $s) use ($out) { fwrite($out, $s); };

    $ver = (string)$m->server_info;
    $w("/*\n " . NW_NAME . " MySQL Data Transfer\n\n Source Server         : " . $connName . "\n Source Server Type    : MySQL\n Source Server Version : " . $ver
        . "\n Source Host           : " . $m->host_info . "\n Source Schema         : " . $db . "\n\n Target Server Type    : MySQL\n Target Server Version : " . $ver
        . "\n File Encoding         : 65001\n\n Date: " . date('d/m/Y H:i:s') . "\n*/\n\n");
    $w("SET NAMES utf8mb4;\nSET FOREIGN_KEY_CHECKS = 0;\n\n");
    if (!empty($opt['createDb'])) {
        $row = nw_row($m, 'SELECT DEFAULT_CHARACTER_SET_NAME cs, DEFAULT_COLLATION_NAME co FROM information_schema.SCHEMATA WHERE SCHEMA_NAME=?', array($db));
        $w('CREATE DATABASE IF NOT EXISTS ' . nw_ident($db) . ($row ? ' DEFAULT CHARACTER SET ' . $row['cs'] . ' COLLATE ' . $row['co'] : '') . ";\nUSE " . nw_ident($db) . ";\n\n");
    }

    foreach ($sel['tables'] ?? array() as $t) {
        $qn = nw_ident($t);
        if ($structure) {
            $row = nw_row($m, 'SHOW CREATE TABLE ' . nw_qname($db, $t));
            $ddl = $row ? (string)($row['Create Table'] ?? reset($row)) : '';
            $w("-- ----------------------------\n-- Table structure for $t\n-- ----------------------------\n");
            if ($drop) $w("DROP TABLE IF EXISTS $qn;\n");
            $w($ddl . ";\n\n");
        }
        if ($data) {
            $w("-- ----------------------------\n-- Records of $t\n-- ----------------------------\nBEGIN;\n");
            $r = $m->query('SELECT * FROM ' . nw_qname($db, $t), MYSQLI_USE_RESULT);
            $fields = nw_fields($r);
            $cols = implode(', ', array_map(function ($f) { return nw_ident($f['name']); }, $fields));
            $batch = array();
            $bytes = 0;
            $flushBatch = function () use (&$batch, &$bytes, $w, $qn, $cols) {
                if (!$batch) return;
                $w("INSERT INTO $qn ($cols) VALUES " . implode(", ", $batch) . ";\n");
                $batch = array();
                $bytes = 0;
                flush();
            };
            while (($row = $r->fetch_row()) !== null && $row !== false) {
                $vals = array();
                foreach ($row as $i => $v) $vals[] = nw_sql_literal($m, $v, $fields[$i]);
                $s = '(' . implode(', ', $vals) . ')';
                $batch[] = $s;
                $bytes += strlen($s);
                if (count($batch) >= 500 || $bytes > 900000) $flushBatch();
            }
            $r->free();
            $flushBatch();
            $w("COMMIT;\n\n");
        }
        if ($structure && $withTriggers) {
            foreach (nw_table_triggers($m, $db, $t) as $tr) {
                $ddl = nw_dump_routine_body($m, 'TRIGGER', $db, $tr['name']);
                if ($ddl === null) continue;
                $w("-- ----------------------------\n-- Triggers structure for table $t\n-- ----------------------------\n");
                if ($ddl === '') { $w(nw_dump_hidden('trigger', $tr['name'])); continue; }
                if ($drop) $w('DROP TRIGGER IF EXISTS ' . nw_ident($tr['name']) . ";\n");
                $w("delimiter ;;\n" . $ddl . "\n;;\ndelimiter ;\n\n");
            }
        }
    }
    foreach ($sel['views'] ?? array() as $v) {
        $ddl = nw_dump_routine_body($m, 'VIEW', $db, $v);
        if ($ddl === null) continue;
        $w("-- ----------------------------\n-- View structure for $v\n-- ----------------------------\n");
        if ($ddl === '') { $w(nw_dump_hidden('view', $v)); continue; }
        if ($drop) $w('DROP VIEW IF EXISTS ' . nw_ident($v) . ";\n");
        $w($ddl . ";\n\n");
    }
    foreach (array('functions' => 'FUNCTION', 'procedures' => 'PROCEDURE', 'events' => 'EVENT') as $key => $kw) {
        foreach ($sel[$key] ?? array() as $name) {
            $ddl = nw_dump_routine_body($m, $kw, $db, $name);
            if ($ddl === null) continue;
            $w("-- ----------------------------\n-- " . ucfirst(strtolower($kw)) . " structure for $name\n-- ----------------------------\n");
            if ($ddl === '') { $w(nw_dump_hidden(strtolower($kw), $name)); continue; }
            if ($drop) $w("DROP $kw IF EXISTS " . nw_ident($name) . ";\n");
            $w("delimiter ;;\n" . $ddl . "\n;;\ndelimiter ;\n\n");
        }
    }
    $w("SET FOREIGN_KEY_CHECKS = 1;\n");
    fclose($out);
}

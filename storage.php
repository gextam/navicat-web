<?php
/**
 * Navicat Web - application store (JSON file) and secret handling.
 */
require_once __DIR__ . '/config.php';

function nw_data_init(): void
{
    static $done = false;
    if ($done) return;
    $done = true;
    if (!is_dir(NW_DATA_DIR)) @mkdir(NW_DATA_DIR, 0750, true);
    if (!is_dir(NW_DATA_DIR . '/tmp')) @mkdir(NW_DATA_DIR . '/tmp', 0750, true);
    if (!is_file(NW_DATA_DIR . '/.htaccess')) {
        file_put_contents(NW_DATA_DIR . '/.htaccess',
            "<IfModule mod_authz_core.c>\n    Require all denied\n</IfModule>\n<IfModule !mod_authz_core.c>\n    Deny from all\n</IfModule>\n");
    }
    if (!is_file(NW_DATA_DIR . '/index.html')) file_put_contents(NW_DATA_DIR . '/index.html', '');
    if (!is_file(NW_DATA_DIR . '/.key')) {
        file_put_contents(NW_DATA_DIR . '/.key', bin2hex(random_bytes(32)), LOCK_EX);
        @chmod(NW_DATA_DIR . '/.key', 0600);
    }
    /* purge abandoned import uploads */
    foreach (glob(NW_DATA_DIR . '/tmp/imp_*') ?: array() as $f) {
        if (filemtime($f) < time() - 86400) @unlink($f);
    }
}

function nw_key(): string
{
    nw_data_init();
    $hex = trim((string)file_get_contents(NW_DATA_DIR . '/.key'));
    return hex2bin($hex);
}

function nw_encrypt(string $plain): string
{
    $iv = random_bytes(12);
    $tag = '';
    $c = openssl_encrypt($plain, 'aes-256-gcm', nw_key(), OPENSSL_RAW_DATA, $iv, $tag);
    return base64_encode($iv . $tag . $c);
}

function nw_decrypt(string $enc): string
{
    $raw = base64_decode($enc, true);
    if ($raw === false || strlen($raw) < 28) return '';
    $iv = substr($raw, 0, 12);
    $tag = substr($raw, 12, 16);
    $c = substr($raw, 28);
    $p = openssl_decrypt($c, 'aes-256-gcm', nw_key(), OPENSSL_RAW_DATA, $iv, $tag);
    return $p === false ? '' : $p;
}

function nw_store_file(): string
{
    return NW_DATA_DIR . '/store.json';
}

function nw_store_default(): array
{
    return array('connections' => array(), 'queries' => array(), 'history' => array(), 'settings' => array());
}

function nw_store_read(): array
{
    nw_data_init();
    $f = nw_store_file();
    if (!is_file($f)) return nw_store_default();
    $fh = fopen($f, 'r');
    if (!$fh) return nw_store_default();
    flock($fh, LOCK_SH);
    $s = stream_get_contents($fh);
    flock($fh, LOCK_UN);
    fclose($fh);
    $d = json_decode((string)$s, true);
    return is_array($d) ? array_merge(nw_store_default(), $d) : nw_store_default();
}

/** Read-modify-write under an exclusive lock. $fn receives the store by reference. */
function nw_store_update(callable $fn)
{
    nw_data_init();
    $f = nw_store_file();
    $fh = fopen($f, 'c+');
    if (!$fh) throw new RuntimeException('Cannot open the store (' . NW_DATA_DIR . ' must be writable by the web server)');
    flock($fh, LOCK_EX);
    $s = stream_get_contents($fh);
    $d = json_decode((string)$s, true);
    if (!is_array($d)) $d = nw_store_default();
    $d = array_merge(nw_store_default(), $d);
    $ret = $fn($d);
    ftruncate($fh, 0);
    rewind($fh);
    fwrite($fh, json_encode($d, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
    fflush($fh);
    flock($fh, LOCK_UN);
    fclose($fh);
    return $ret;
}

function nw_id(): string
{
    return bin2hex(random_bytes(8));
}

/** A connection record without its secret, for the browser. */
function nw_conn_public(array $c): array
{
    $out = $c;
    unset($out['passwordEnc']);
    $out['hasPassword'] = !empty($c['passwordEnc']);
    return $out;
}

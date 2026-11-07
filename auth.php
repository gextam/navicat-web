<?php
/**
 * Navicat Web - application sign-in (one password for the application, set on first visit).
 */
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/storage.php';

function nw_base_path(): string
{
    $dir = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '/')), '/');
    return $dir === '' ? '/' : $dir;
}

function nw_is_https(): bool
{
    if (!empty($_SERVER['HTTPS']) && strtolower($_SERVER['HTTPS']) !== 'off') return true;
    if (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https') return true;
    return (int)($_SERVER['SERVER_PORT'] ?? 0) === 443;
}

function nw_session_start(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) return;
    session_name('nwsess');
    session_set_cookie_params(array(
        'lifetime' => 0,
        'path' => nw_base_path(),
        'secure' => nw_is_https(),
        'httponly' => true,
        'samesite' => 'Lax',
    ));
    session_start();
}

function nw_auth_file(): string
{
    return NW_DATA_DIR . '/auth.json';
}

function nw_is_setup(): bool
{
    return is_file(nw_auth_file());
}

function nw_set_password(string $pw): void
{
    nw_data_init();
    file_put_contents(nw_auth_file(), json_encode(array(
        'hash' => password_hash($pw, PASSWORD_DEFAULT),
        'updated' => date('c'),
    )), LOCK_EX);
    @chmod(nw_auth_file(), 0600);
}

function nw_check_password(string $pw): bool
{
    $a = json_decode((string)@file_get_contents(nw_auth_file()), true);
    return is_array($a) && !empty($a['hash']) && password_verify($pw, $a['hash']);
}

function nw_is_logged_in(): bool
{
    nw_session_start();
    if (empty($_SESSION['nw_auth'])) return false;
    if ((int)($_SESSION['nw_auth_at'] ?? 0) + NW_SESSION_HOURS * 3600 < time()) {
        nw_logout();
        return false;
    }
    return true;
}

function nw_login(): void
{
    nw_session_start();
    session_regenerate_id(true);
    $_SESSION['nw_auth'] = true;
    $_SESSION['nw_auth_at'] = time();
    $_SESSION['nw_csrf'] = bin2hex(random_bytes(16));
}

function nw_logout(): void
{
    nw_session_start();
    $_SESSION = array();
    if (ini_get('session.use_cookies')) {
        $p = session_get_cookie_params();
        setcookie(session_name(), '', time() - 42000, $p['path'], $p['domain'], $p['secure'], $p['httponly']);
    }
    session_destroy();
}

function nw_csrf(): string
{
    nw_session_start();
    if (empty($_SESSION['nw_csrf'])) $_SESSION['nw_csrf'] = bin2hex(random_bytes(16));
    return $_SESSION['nw_csrf'];
}

function nw_csrf_ok($t): bool
{
    return is_string($t) && $t !== '' && hash_equals(nw_csrf(), $t);
}

function nw_client_ip(): string
{
    return (string)($_SERVER['REMOTE_ADDR'] ?? '0.0.0.0');
}

function nw_ip_allowed(): bool
{
    global $NW_ALLOWED_IPS;
    if (empty($NW_ALLOWED_IPS)) return true;
    $ip = nw_client_ip();
    foreach ($NW_ALLOWED_IPS as $rule) {
        if ($rule === $ip) return true;
        if (strpos($rule, '/') !== false) {
            list($net, $bits) = explode('/', $rule, 2);
            $ipL = ip2long($ip);
            $netL = ip2long($net);
            if ($ipL !== false && $netL !== false) {
                $mask = -1 << (32 - (int)$bits);
                if (($ipL & $mask) === ($netL & $mask)) return true;
            }
        }
    }
    return false;
}

/* ---- sign-in throttling (per client address, file based) ---- */

function nw_throttle_file(): string
{
    return NW_DATA_DIR . '/login_attempts.json';
}

function nw_throttle_read(): array
{
    $d = json_decode((string)@file_get_contents(nw_throttle_file()), true);
    return is_array($d) ? $d : array();
}

/** Seconds left in a lockout for this address, or 0. */
function nw_throttle_locked(): int
{
    $d = nw_throttle_read();
    $e = $d[nw_client_ip()] ?? null;
    if (!$e) return 0;
    if ($e['n'] >= NW_LOGIN_MAX_FAILS) {
        $left = $e['at'] + NW_LOGIN_LOCK_MINUTES * 60 - time();
        if ($left > 0) return $left;
    }
    return 0;
}

function nw_throttle_fail(): void
{
    nw_data_init();
    $d = nw_throttle_read();
    $ip = nw_client_ip();
    $e = $d[$ip] ?? array('n' => 0, 'at' => 0);
    if ($e['at'] < time() - NW_LOGIN_LOCK_MINUTES * 60) $e = array('n' => 0, 'at' => 0);
    $e['n']++;
    $e['at'] = time();
    $d[$ip] = $e;
    foreach ($d as $k => $v) if ($v['at'] < time() - 86400) unset($d[$k]);
    file_put_contents(nw_throttle_file(), json_encode($d), LOCK_EX);
}

function nw_throttle_clear(): void
{
    $d = nw_throttle_read();
    unset($d[nw_client_ip()]);
    @file_put_contents(nw_throttle_file(), json_encode($d), LOCK_EX);
}

function nw_require_login_page(): void
{
    if (!nw_ip_allowed()) {
        http_response_code(403);
        exit('Forbidden');
    }
    if (!nw_is_setup() || !nw_is_logged_in()) {
        header('Location: login.php');
        exit;
    }
}

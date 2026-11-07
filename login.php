<?php
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/auth.php';

if (!nw_ip_allowed()) {
    http_response_code(403);
    exit('Forbidden');
}
nw_session_start();
$setup = !nw_is_setup();
$error = '';
$locked = nw_throttle_locked();

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $pw = (string)($_POST['password'] ?? '');
    if ($setup) {
        $pw2 = (string)($_POST['password2'] ?? '');
        if (strlen($pw) < 6) $error = 'Choose a password of at least 6 characters.';
        elseif ($pw !== $pw2) $error = 'The two passwords do not match.';
        else {
            try {
                nw_set_password($pw);
                nw_login();
                header('Location: index.php');
                exit;
            } catch (Throwable $e) {
                $error = 'Cannot write to the data folder: ' . $e->getMessage();
            }
        }
    } elseif ($locked) {
        $error = 'Too many failed attempts. Try again in ' . ceil($locked / 60) . ' minute(s).';
    } elseif (nw_check_password($pw)) {
        nw_throttle_clear();
        nw_login();
        header('Location: index.php');
        exit;
    } else {
        nw_throttle_fail();
        $error = 'The password is not correct.';
        $locked = nw_throttle_locked();
    }
} elseif (!$setup && nw_is_logged_in()) {
    header('Location: index.php');
    exit;
}
$writable = is_dir(NW_DATA_DIR) ? is_writable(NW_DATA_DIR) : is_writable(dirname(NW_DATA_DIR));
?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title><?= htmlspecialchars(NW_NAME) ?> for MySQL</title>
<link rel="icon" href="img/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="css/app.css?v=<?= NW_VERSION ?>">
</head>
<body class="login-body">
<div class="login-card">
  <div class="login-brand">
    <img src="img/logo.svg" alt="" width="56" height="56">
    <div>
      <div class="login-title"><?= htmlspecialchars(NW_NAME) ?></div>
      <div class="login-sub">for MySQL &middot; <?= NW_VERSION ?></div>
    </div>
  </div>
  <?php if ($setup): ?>
    <p class="login-text">Welcome. Choose the password that protects this installation. You will enter it each time you open the application.</p>
    <?php if (!$writable): ?>
      <div class="login-error">The folder <code><?= htmlspecialchars(NW_DATA_DIR) ?></code> is not writable by the web server. Fix its permissions, then reload this page.</div>
    <?php endif; ?>
  <?php else: ?>
    <p class="login-text">Enter the application password to continue.</p>
  <?php endif; ?>
  <?php if ($error): ?><div class="login-error"><?= htmlspecialchars($error) ?></div><?php endif; ?>
  <form method="post" autocomplete="off">
    <label class="login-label">Password
      <input class="login-input" type="password" name="password" autofocus required <?= $locked && !$setup ? 'disabled' : '' ?>>
    </label>
    <?php if ($setup): ?>
    <label class="login-label">Confirm password
      <input class="login-input" type="password" name="password2" required>
    </label>
    <?php endif; ?>
    <button class="login-btn" type="submit" <?= $locked && !$setup ? 'disabled' : '' ?>><?= $setup ? 'Set Password and Sign In' : 'Sign In' ?></button>
  </form>
</div>
</body>
</html>

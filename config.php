<?php
/**
 * Navicat Web for MySQL - settings.
 *
 * There are no secrets in this file. Database connections (with their passwords, encrypted) are
 * created from the application itself and kept in data/store.json, next to the saved queries,
 * query history and settings.
 */
define('NW_NAME', 'Navicat Web');
define('NW_VERSION', '1.0.0');

/* Where the store, the encryption key and temporary import files live. It must be writable by the
   web server and must NOT be served to the web: data/.htaccess covers Apache; on nginx deny the
   folder, or point this somewhere outside the document root. */
define('NW_DATA_DIR', __DIR__ . '/data');

define('NW_DEFAULT_LIMIT', 1000);      /* rows per page in table data and query results */
define('NW_MAX_LIMIT', 10000);         /* hard cap for one page */
define('NW_CONNECT_TIMEOUT', 10);      /* seconds to wait for a MySQL server */
define('NW_SESSION_HOURS', 12);        /* how long a sign-in lasts */
define('NW_MAX_CELL_BYTES', 1048576);  /* bigger cell values are sent as a preview only */
define('NW_MAX_BLOB_BYTES', 65536);    /* binary values up to this size are sent in full (base64) */
define('NW_HISTORY_MAX', 500);         /* query history entries kept per connection */
define('NW_IMPORT_SLICE_SECONDS', 12); /* an "Execute SQL File" request runs this long, then the browser asks for more */
define('NW_IMPORT_WINDOW', 8388608);   /* bytes of an SQL file parsed at a time (grows for giant statements) */
define('NW_LOGIN_MAX_FAILS', 8);       /* failed sign-ins per address before a lockout */
define('NW_LOGIN_LOCK_MINUTES', 15);

/* Optional allow-list of client addresses (exact or CIDR). Empty = everyone may reach the sign-in page. */
$NW_ALLOWED_IPS = array();

<?php
require __DIR__ . '/private/secrets.php';

// Emails must not trust HTTP_HOST (www, internal names, host-header spoofing).
if (!defined('CANONICAL_ORIGIN')) {
    define('CANONICAL_ORIGIN', 'https://horarium.us');
}

function getDB() {
    static $pdo;
    if (!$pdo) {
        $pdo = new PDO(
            'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4',
            DB_USER,
            DB_PASS,
            [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
        );
    }
    return $pdo;
}

function cors() {
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Headers: Content-Type, Authorization');
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
        http_response_code(204);
        exit;
    }
}

function jsonResponse($data, $code = 200) {
    http_response_code($code);
    header('Content-Type: application/json');
    echo json_encode($data);
    exit;
}

function jsonInput() {
    return json_decode(file_get_contents('php://input'), true) ?: [];
}

function requireAuth() {
    $header = $_SERVER['HTTP_AUTHORIZATION']
        ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION']
        ?? '';
    if ($header === '' && function_exists('apache_request_headers')) {
        $all = apache_request_headers();
        $header = $all['Authorization'] ?? $all['authorization'] ?? '';
    }
    if (!preg_match('/^Bearer\s+([a-f0-9]{64})$/', $header, $m)) {
        jsonResponse(['error' => 'Unauthorized'], 401);
    }
    $token = $m[1];
    $db = getDB();
    $stmt = $db->prepare('SELECT user_id FROM tokens WHERE token = ?');
    $stmt->execute([$token]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row) {
        jsonResponse(['error' => 'Unauthorized'], 401);
    }
    return (int) $row['user_id'];
}

function ensureUserPrefsTable() {
    static $ready = false;
    if ($ready) return;

    $db = getDB();
    $db->exec(
        'CREATE TABLE IF NOT EXISTS user_prefs (
            user_id INT UNSIGNED NOT NULL PRIMARY KEY,
            prefs_json TEXT NOT NULL,
            updated_at BIGINT NOT NULL DEFAULT 0,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB'
    );

    $ready = true;
}

function ensureAnchorTables() {
    static $ready = false;
    if ($ready) return;

    $db = getDB();
    $db->exec(
        'CREATE TABLE IF NOT EXISTS anchor_invites (
            id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            from_user_id INT UNSIGNED NOT NULL,
            to_user_id INT UNSIGNED NOT NULL,
            status ENUM("pending","accepted") NOT NULL DEFAULT "pending",
            created_at BIGINT NOT NULL DEFAULT 0,
            responded_at BIGINT NULL DEFAULT NULL,
            UNIQUE KEY uniq_directed_pair (from_user_id, to_user_id),
            KEY idx_to_status (to_user_id, status),
            KEY idx_from_status (from_user_id, status),
            FOREIGN KEY (from_user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (to_user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB'
    );

    $ready = true;
}

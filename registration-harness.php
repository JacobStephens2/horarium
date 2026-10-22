<?php
require __DIR__ . '/api/registration.php';

$payload = json_decode(stream_get_contents(STDIN), true);
if (!is_array($payload) || !isset($payload['steps']) || !is_array($payload['steps'])) {
    fwrite(STDERR, "expected a steps array\n");
    exit(1);
}

$db = new PDO('sqlite::memory:', null, null, [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
]);
$db->exec('CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL
)');
$db->exec('CREATE TABLE tokens (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL
)');
$db->exec('CREATE TABLE user_data (
    user_id INTEGER NOT NULL,
    date_str TEXT NOT NULL,
    items_json TEXT NOT NULL,
    note TEXT NOT NULL,
    updated_at INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, date_str)
)');
$db->exec('CREATE TABLE user_prefs (
    user_id INTEGER PRIMARY KEY,
    prefs_json TEXT NOT NULL,
    updated_at INTEGER NOT NULL DEFAULT 0
)');

$results = [];
foreach ($payload['steps'] as $step) {
    if (!is_array($step) || ($step['op'] ?? '') !== 'create') {
        fwrite(STDERR, "unknown step\n");
        exit(1);
    }
    $results[] = createAccount($db, $step['input'] ?? []);
}

$accounts = [];
$users = $db->query('SELECT id, username FROM users ORDER BY id');
foreach ($users->fetchAll(PDO::FETCH_ASSOC) as $user) {
    $rows = $db->prepare(
        'SELECT date_str, items_json, note FROM user_data WHERE user_id = ? ORDER BY date_str'
    );
    $rows->execute([(int) $user['id']]);
    $dates = new stdClass();
    foreach ($rows->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $dates->{$row['date_str']} = [
            'items' => json_decode($row['items_json']),
            'note' => $row['note'],
        ];
    }
    $prefs = $db->prepare('SELECT prefs_json, updated_at FROM user_prefs WHERE user_id = ?');
    $prefs->execute([(int) $user['id']]);
    $prefsRow = $prefs->fetch(PDO::FETCH_ASSOC);
    $accounts[] = [
        'username' => $user['username'],
        'dates' => $dates,
        'prefs' => $prefsRow ? json_decode($prefsRow['prefs_json'], true) : null,
        'prefs_updated_at' => $prefsRow ? (int) $prefsRow['updated_at'] : null,
    ];
}

echo json_encode([
    'results' => $results,
    'accounts' => $accounts,
]);

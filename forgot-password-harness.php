<?php
require __DIR__ . '/api/forgot-password.php';

// Stands in for MySQL's case-insensitive username comparison. Not the
// production username column: account creation and that column stay as they are.
class RecordingMailer
{
    public $recipients = [];
    public $Subject = '';
    public $Body = '';
    public $AltBody = '';
    public $ErrorInfo = '';

    public function addAddress($address, $name = '')
    {
        $this->recipients[] = $address;
        return true;
    }

    public function isHTML($isHtml = true)
    {
        return true;
    }

    public function send()
    {
        return true;
    }
}

$payload = json_decode(stream_get_contents(STDIN), true);
if (!is_array($payload) || !isset($payload['stored_username'], $payload['requested_username'])) {
    fwrite(STDERR, "expected stored_username and requested_username\n");
    exit(1);
}

$db = new PDO('sqlite::memory:', null, null, [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
]);
$db->exec('CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL
)');
$db->exec('CREATE TABLE password_resets (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    expires_at TEXT NOT NULL
)');
$db->prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)')->execute([
    $payload['stored_username'],
    'not-a-real-hash',
]);

$mail = new RecordingMailer();
sendPasswordResetMail($db, $payload['requested_username'], 'https://horarium.us', function () use ($mail) {
    return $mail;
});

echo json_encode([
    'recipients' => $mail->recipients,
]);

<?php
require __DIR__ . '/config.php';
require __DIR__ . '/../vendor/autoload.php';

use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\SMTP;

cors();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonResponse(['error' => 'Method not allowed'], 405);
}

$input = jsonInput();
$username = trim($input['username'] ?? '');

if (!filter_var($username, FILTER_VALIDATE_EMAIL)) {
    jsonResponse(['error' => 'Please enter a valid email address.'], 400);
}

$db = getDB();

// Always return success to avoid leaking whether an account exists
$stmt = $db->prepare('SELECT id FROM users WHERE username = ?');
$stmt->execute([$username]);
$user = $stmt->fetch(PDO::FETCH_ASSOC);

if ($user) {
    // Delete any existing reset tokens for this user
    $db->prepare('DELETE FROM password_resets WHERE user_id = ?')->execute([(int) $user['id']]);

    // Generate a new reset token (64-char hex, 1 hour expiry)
    $token = bin2hex(random_bytes(32));
    $expires = date('Y-m-d H:i:s', time() + 3600);
    $db->prepare(
        'INSERT INTO password_resets (token, user_id, expires_at) VALUES (?, ?, ?)'
    )->execute([$token, (int) $user['id'], $expires]);

    $resetUrl = CANONICAL_ORIGIN . '/?reset=' . $token;

    // Send email via SMTP
    $mail = new PHPMailer(true);
    try {
        $mail->isSMTP();
        $mail->Host       = SMTP_HOST;
        $mail->SMTPAuth   = true;
        $mail->Username   = SMTP_USER;
        $mail->Password   = SMTP_PASS;
        $mail->SMTPSecure = PHPMailer::ENCRYPTION_STARTTLS;
        $mail->Port       = SMTP_PORT;

        $mail->setFrom(SMTP_FROM_EMAIL, SMTP_FROM_NAME);
        $mail->addAddress($username);

        $mail->isHTML(true);
        $mail->Subject = 'Horarium - Password Reset';
        $mail->Body    = '<p>Hi,</p>'
            . '<p>You requested a password reset for your Horarium account.</p>'
            . '<p>Click the link below to set a new password (expires in 1 hour):</p>'
            . '<p><a href="' . htmlspecialchars($resetUrl) . '">' . htmlspecialchars($resetUrl) . '</a></p>'
            . '<p>If you didn\'t request this, you can safely ignore this email.</p>';
        $mail->AltBody = "Hi,\r\n\r\n"
            . "You requested a password reset for your Horarium account.\r\n\r\n"
            . "Click the link below to set a new password (expires in 1 hour):\r\n"
            . $resetUrl . "\r\n\r\n"
            . "If you didn't request this, you can safely ignore this email.\r\n";

        $mail->send();
    } catch (\Exception $e) {
        error_log('Password reset email failed: ' . $mail->ErrorInfo);
    }
}

jsonResponse(['ok' => true]);

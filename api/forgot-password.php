<?php
require __DIR__ . '/config.php';
require __DIR__ . '/password-reset-mail.php';
require __DIR__ . '/../vendor/autoload.php';

use PHPMailer\PHPMailer\PHPMailer;

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

sendPasswordResetMail($db, $username, CANONICAL_ORIGIN, function () {
    $mail = new PHPMailer(true);
    $mail->isSMTP();
    $mail->Host       = SMTP_HOST;
    $mail->SMTPAuth   = true;
    $mail->Username   = SMTP_USER;
    $mail->Password   = SMTP_PASS;
    $mail->SMTPSecure = PHPMailer::ENCRYPTION_STARTTLS;
    $mail->Port       = SMTP_PORT;
    $mail->setFrom(SMTP_FROM_EMAIL, SMTP_FROM_NAME);
    return $mail;
});

// Always return success to avoid leaking whether an account exists
jsonResponse(['ok' => true]);

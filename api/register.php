<?php
require __DIR__ . '/config.php';
require __DIR__ . '/registration.php';
require __DIR__ . '/../vendor/autoload.php';

use PHPMailer\PHPMailer\PHPMailer;

cors();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonResponse(['error' => 'Method not allowed'], 405);
}

$input = jsonInput();
$refusal = accountCreationRefusal($input);
if ($refusal !== null) {
    jsonResponse($refusal['body'], $refusal['code']);
}

$db = getDB();
ensureUserPrefsTable();
$result = createAccount($db, $input);

if ($result['code'] === 200) {
    $username = $result['body']['username'];
    try {
        $mail = new PHPMailer(true);
        $mail->CharSet    = 'UTF-8';
        $mail->isSMTP();
        $mail->Host       = SMTP_HOST;
        $mail->SMTPAuth   = true;
        $mail->Username   = SMTP_USER;
        $mail->Password   = SMTP_PASS;
        $mail->SMTPSecure = PHPMailer::ENCRYPTION_STARTTLS;
        $mail->Port       = SMTP_PORT;
        $mail->setFrom(SMTP_FROM_EMAIL, SMTP_FROM_NAME);
        $mail->addAddress('jacob@stephens.page');
        $mail->Subject = 'Horarium — New Account Created';
        $ua = substr($_SERVER['HTTP_USER_AGENT'] ?? 'unknown', 0, 1024);
        $mail->Body = "A new account was created on Horarium.\n\n"
            . "Email: " . $username . "\n"
            . "Date: " . gmdate('c') . "\n"
            . "Device: " . $ua;
        $mail->send();
    } catch (\Throwable $e) {
        error_log('Failed to send admin signup notification: ' . $e->getMessage());
    }
}

jsonResponse($result['body'], $result['code']);

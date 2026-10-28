<?php

function sendPasswordResetMail(PDO $db, string $requestedUsername, string $origin, callable $openMailer): void
{
    $stmt = $db->prepare('SELECT id, username FROM users WHERE username = ?');
    $stmt->execute([$requestedUsername]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$user) {
        return;
    }

    // Delete any existing reset tokens for this user
    $db->prepare('DELETE FROM password_resets WHERE user_id = ?')->execute([(int) $user['id']]);

    // Generate a new reset token (64-char hex, 1 hour expiry)
    $token = bin2hex(random_bytes(32));
    $expires = date('Y-m-d H:i:s', time() + 3600);
    $db->prepare(
        'INSERT INTO password_resets (token, user_id, expires_at) VALUES (?, ?, ?)'
    )->execute([$token, (int) $user['id'], $expires]);

    $resetUrl = $origin . '/?reset=' . $token;

    $mail = null;
    try {
        $mail = $openMailer();
        $mail->addAddress($user['username']);

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
        $detail = is_object($mail) ? $mail->ErrorInfo : $e->getMessage();
        error_log('Password reset email failed: ' . $detail);
    }
}

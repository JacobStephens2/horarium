<?php

// Inclusive day count of 30 November 2025 through 10 January 2027.
const ACCOUNT_MIGRATION_DATE_LIMIT = 407;

function migrationDateNames($checklist, $notes): array
{
    return array_unique(array_merge(array_keys($checklist), array_keys($notes)));
}

function registrationFields(array $input): array
{
    return [
        'username' => trim($input['username'] ?? ''),
        'password' => $input['password'] ?? '',
        'checklist' => $input['checklist'] ?? [],
        'notes' => $input['notes'] ?? [],
        'prefs' => $input['prefs'] ?? new stdClass(),
        'prefs_updated_at' => (int) ($input['prefs_updated_at'] ?? 0),
    ];
}

function accountCreationRefusal(array $fields): ?array
{
    if (!filter_var($fields['username'], FILTER_VALIDATE_EMAIL)) {
        return ['code' => 400, 'body' => ['error' => 'Please enter a valid email address.']];
    }
    if (strlen($fields['password']) < 6) {
        return ['code' => 400, 'body' => ['error' => 'Password must be at least 6 characters.']];
    }

    $named = migrationDateNames($fields['checklist'], $fields['notes']);
    if (count($named) > ACCOUNT_MIGRATION_DATE_LIMIT) {
        return ['code' => 400, 'body' => [
            'error' => 'Checklist and notes name more than ' . ACCOUNT_MIGRATION_DATE_LIMIT . ' dates.',
        ]];
    }

    return null;
}

function createAccount(PDO $db, array $input): array
{
    $fields = registrationFields($input);
    $refusal = accountCreationRefusal($fields);
    if ($refusal !== null) {
        return $refusal;
    }

    $username = $fields['username'];
    $password = $fields['password'];

    $exists = $db->prepare('SELECT 1 FROM users WHERE username = ?');
    $exists->execute([$username]);
    if ($exists->fetch()) {
        return ['code' => 409, 'body' => ['error' => 'An account with this email already exists.']];
    }

    $hash = password_hash($password, PASSWORD_DEFAULT);
    $db->prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)')->execute([$username, $hash]);
    $userId = (int) $db->lastInsertId();

    $token = bin2hex(random_bytes(32));
    $db->prepare('INSERT INTO tokens (token, user_id) VALUES (?, ?)')->execute([$token, $userId]);

    $now = round(microtime(true) * 1000);

    $checklist = $fields['checklist'];
    $notes = $fields['notes'];
    $prefs = $fields['prefs'];
    $prefsUpdatedAt = $fields['prefs_updated_at'];
    $allDates = migrationDateNames($checklist, $notes);

    if (count($allDates) > 0) {
        $stmt = $db->prepare(
            'INSERT INTO user_data (user_id, date_str, items_json, note, updated_at) VALUES (?, ?, ?, ?, ?)'
        );
        foreach ($allDates as $dateStr) {
            if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $dateStr)) continue;
            $items = isset($checklist[$dateStr]) ? json_encode($checklist[$dateStr]) : '{}';
            $note = $notes[$dateStr] ?? '';
            $stmt->execute([$userId, $dateStr, $items, $note, $now]);
        }
    }

    $prefsJson = json_encode($prefs);
    if ($prefsJson !== false) {
        $stmt = $db->prepare(
            'INSERT INTO user_prefs (user_id, prefs_json, updated_at) VALUES (?, ?, ?)'
        );
        $stmt->execute([$userId, $prefsJson, $prefsUpdatedAt]);
    }

    return ['code' => 200, 'body' => ['token' => $token, 'username' => $username]];
}

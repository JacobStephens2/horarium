const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

function requestReset(storedUsername, requestedUsername) {
  const result = spawnSync('php', [path.join(__dirname, 'forgot-password-harness.php')], {
    input: JSON.stringify({
      stored_username: storedUsername,
      requested_username: requestedUsername
    }),
    encoding: 'utf8'
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || 'forgot-password harness failed');
  }
  return JSON.parse(result.stdout);
}

describe('password reset mail', function () {
  it('sends the reset mail to the account\'s stored username when the request matches a different spelling', function () {
    const sent = requestReset('Ada@Example.com', 'ada@example.com');

    assert.deepEqual(sent.recipients, ['Ada@Example.com']);
  });
});

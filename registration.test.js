const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const SPAN_START = '2025-11-30';
const SPAN_END = '2027-01-10';
const DAY_MS = 86400000;

function inclusiveDates(start, end) {
  const dates = [];
  const last = Date.parse(end + 'T00:00:00Z');
  for (let t = Date.parse(start + 'T00:00:00Z'); t <= last; t += DAY_MS) {
    dates.push(new Date(t).toISOString().slice(0, 10));
  }
  return dates;
}

function checklistFor(dates) {
  const checklist = {};
  for (const date of dates) checklist[date] = { 'prayer-readings': true };
  return checklist;
}

function notesFor(dates, text) {
  const notes = {};
  for (const date of dates) notes[date] = text;
  return notes;
}

function createAccounts(steps) {
  const result = spawnSync('php', [path.join(__dirname, 'registration-harness.php')], {
    input: JSON.stringify({ steps: steps }),
    encoding: 'utf8'
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || 'registration harness failed');
  }
  return JSON.parse(result.stdout);
}

describe('account creation migration', function () {
  it('refuses when checklist and notes together name more than 407 dates, and does not store the account', function () {
    const span = inclusiveDates(SPAN_START, SPAN_END);
    assert.equal(span.length, 407);
    const named = span.concat(['2027-01-11']);
    const email = 'ada@example.com';
    const created = createAccounts([
      {
        op: 'create',
        input: {
          username: email,
          password: 'secret1',
          checklist: checklistFor(named.slice(0, 200)),
          notes: notesFor(named.slice(200), 'kept')
        }
      },
      {
        op: 'create',
        input: {
          username: email,
          password: 'secret1',
          checklist: checklistFor(['2026-06-15']),
          notes: {}
        }
      }
    ]);

    assert.equal(created.results[0].code, 400);
    assert.equal(created.results[0].body.error, 'Checklist and notes name more than 407 dates.');
    assert.equal(created.results[0].body.token, undefined);
    assert.equal(created.results[1].code, 200);
    assert.equal(created.results[1].body.username, email);
    assert.equal(created.accounts.length, 1);
    assert.equal(created.accounts[0].username, email);
    assert.deepEqual(Object.keys(created.accounts[0].dates), ['2026-06-15']);
  });

  it('stores every day of 30 November 2025 through 10 January 2027 when checklist and notes both name that span', function () {
    const span = inclusiveDates(SPAN_START, SPAN_END);
    assert.equal(span.length, 407);
    const created = createAccounts([
      {
        op: 'create',
        input: {
          username: 'bea@example.com',
          password: 'secret1',
          checklist: checklistFor(span),
          notes: notesFor(span, 'office')
        }
      }
    ]);

    assert.equal(created.results[0].code, 200);
    assert.equal(created.results[0].body.username, 'bea@example.com');
    assert.equal(created.accounts.length, 1);
    assert.deepEqual(Object.keys(created.accounts[0].dates), span);
    assert.deepEqual(created.accounts[0].dates[SPAN_START].items, { 'prayer-readings': true });
    assert.equal(created.accounts[0].dates[SPAN_START].note, 'office');
    assert.equal(created.accounts[0].dates[SPAN_END].note, 'office');
  });

  it('stores fewer dates, including a checklist day and a different note day', function () {
    const created = createAccounts([
      {
        op: 'create',
        input: {
          username: 'cy@example.com',
          password: 'secret1',
          checklist: { '2026-06-15': { 'prayer-holyhour': true } },
          notes: { '2026-06-16': 'kept' },
          prefs: { 'asceticism-alcohol': false },
          prefs_updated_at: 40
        }
      }
    ]);

    assert.equal(created.results[0].code, 200);
    assert.deepEqual(created.accounts[0].dates['2026-06-15'], {
      items: { 'prayer-holyhour': true },
      note: ''
    });
    assert.deepEqual(created.accounts[0].dates['2026-06-16'], {
      items: {},
      note: 'kept'
    });
    assert.deepEqual(created.accounts[0].prefs, { 'asceticism-alcohol': false });
    assert.equal(created.accounts[0].prefs_updated_at, 40);
  });

  it('does not store an account when checklist is not a date map', function () {
    const created = createAccounts([
      {
        op: 'create',
        input: {
          username: 'eve@example.com',
          password: 'secret1',
          checklist: 'nope',
          notes: {}
        }
      }
    ]);

    assert.notEqual(created.results[0].code, 200);
    assert.equal(created.results[0].body.token, undefined);
    assert.deepEqual(created.accounts, []);
  });

  it('creates an account when checklist and notes name no dates', function () {
    const created = createAccounts([
      {
        op: 'create',
        input: {
          username: 'dee@example.com',
          password: 'secret1'
        }
      }
    ]);

    assert.equal(created.results[0].code, 200);
    assert.equal(created.results[0].body.username, 'dee@example.com');
    assert.equal(typeof created.results[0].body.token, 'string');
    assert.equal(created.results[0].body.token.length, 64);
    assert.deepEqual(created.accounts[0].dates, {});
  });
});

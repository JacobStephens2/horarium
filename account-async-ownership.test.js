const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createDeviceRows } = require('./device-rows');
const { memoryStorage } = require('./memory-storage');
const { todayStr, loadPage, button, flush, jsonResponse } = require('./page-harness');

describe('account isolation after async work', function () {
  it('does not merge an in-flight sync into unbound rows after sign-out', async function () {
    const today = todayStr();
    const storage = memoryStorage();
    const rows = createDeviceRows(storage);
    rows.assignExistingRows(null);
    rows.write(null, { notes: { [today]: 'local note' } });
    rows.write('ada@example.com', {
      checklist: { [today]: { 'prayer-readings': true } },
      notes: { [today]: 'private note' },
      timestamps: { [today]: 1000 }
    });
    storage.setItem('horarium-token', 'token-ada');
    storage.setItem('horarium-username', 'ada@example.com');
    let release;
    const gate = new Promise(function (resolve) { release = resolve; });
    const document = loadPage(storage, [], {
      before(request) {
        if (request.url.indexOf('data.php') !== -1 && request.method === 'GET') {
          return gate.then(function () {
            return jsonResponse({
              data: [{ date_str: today, items: { 'prayer-holyhour': true }, note: 'from server', updated_at: 9000 }]
            });
          });
        }
      }
    });
    await flush();
    button(document, 'Sign out').click();
    release();
    await flush();
    assert.equal(rows.read(null).notes[today], 'local note');
    assert.deepEqual(rows.read(null).checklist, {});
    assert.equal(rows.read('ada@example.com').notes[today], 'private note');
  });

  it('keeps a note typed while signed in on that account after sign-out', async function () {
    const today = todayStr();
    const storage = memoryStorage();
    const rows = createDeviceRows(storage);
    rows.assignExistingRows(null);
    rows.write(null, { notes: { [today]: 'local note' } });
    rows.write('ada@example.com', { notes: { [today]: 'private note' }, timestamps: { [today]: 1000 } });
    storage.setItem('horarium-token', 'token-ada');
    storage.setItem('horarium-username', 'ada@example.com');
    const document = loadPage(storage, []);
    await flush();
    const notes = document.getElementById('daily-notes');
    notes.value = 'private note revised';
    (notes.listeners.input || []).forEach(function (fn) { fn(); });
    button(document, 'Sign out').click();
    await new Promise(function (resolve) { setTimeout(resolve, 500); });
    assert.equal(rows.read('ada@example.com').notes[today], 'private note revised');
    assert.equal(rows.read(null).notes[today], 'local note');
  });

  it('a stale unauthorized reply does not sign out the account that just signed in', async function () {
    const today = todayStr();
    const storage = memoryStorage();
    const rows = createDeviceRows(storage);
    rows.assignExistingRows(null);
    rows.write('ada@example.com', {
      notes: { [today]: 'ada note' },
      timestamps: { [today]: 1000 }
    });
    rows.write('bea@example.com', {
      notes: { [today]: 'bea local' },
      timestamps: { [today]: 1000 }
    });
    storage.setItem('horarium-token', 'token-ada');
    storage.setItem('horarium-username', 'ada@example.com');
    let releaseAda;
    let releaseBea;
    const adaGate = new Promise(function (resolve) { releaseAda = resolve; });
    const beaGate = new Promise(function (resolve) { releaseBea = resolve; });
    const document = loadPage(storage, [], {
      before(request) {
        if (request.url.indexOf('data.php') !== -1 && request.method === 'GET' && request.authorization === 'Bearer token-ada') {
          return adaGate.then(function () {
            return jsonResponse({ error: 'Unauthorized' }, 401);
          });
        }
        if (request.url.indexOf('data.php') !== -1 && request.method === 'GET' && request.authorization === 'Bearer token-for-bea@example.com') {
          return beaGate.then(function () {
            return jsonResponse({
              data: [{
                date_str: today,
                items: { 'prayer-holyhour': true },
                note: 'from bea server',
                updated_at: 9000
              }]
            });
          });
        }
      }
    });
    await flush();
    button(document, 'Sign out').click();
    button(document, 'Sign in to sync across devices').click();
    const inputs = document.walk().filter(function (el) { return el.tagName === 'INPUT'; });
    inputs.find(function (el) { return el.getAttribute('type') === 'email'; }).value = 'bea@example.com';
    inputs.find(function (el) { return el.getAttribute('type') === 'password'; }).value = 'secret-password';
    button(document, 'Sign in').click();
    await flush();
    assert.equal(storage.getItem('horarium-token'), 'token-for-bea@example.com');
    releaseAda();
    await flush();
    releaseBea();
    await flush();
    assert.equal(storage.getItem('horarium-token'), 'token-for-bea@example.com');
    assert.equal(rows.read('bea@example.com').notes[today], 'from bea server');
    assert.equal(rows.read('ada@example.com').notes[today], 'ada note');
  });
});

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createDeviceRows } = require('./device-rows');

function memoryStorage() {
  const items = new Map();
  return {
    getItem(key) {
      return items.has(key) ? items.get(key) : null;
    },
    setItem(key, value) {
      items.set(String(key), String(value));
    },
    removeItem(key) {
      items.delete(key);
    }
  };
}

describe('device rows', function () {
  it('stores a signed-in account apart from unbound rows and finds that account again', function () {
    const rows = createDeviceRows(memoryStorage());

    rows.write(null, {
      checklist: { '2026-03-02': { 'prayer-holyhour': true } },
      notes: { '2026-03-02': 'unbound note' },
      timestamps: { '2026-03-02': 2 },
      disciplineSettings: { 'asceticism-alcohol': false },
      disciplineSettingsUpdatedAt: 2
    });
    rows.write('ada@example.com', {
      checklist: { '2026-03-01': { 'prayer-readings': true } },
      notes: { '2026-03-01': 'account note' },
      timestamps: { '2026-03-01': 1 },
      disciplineSettings: { 'fasting-fast': false },
      disciplineSettingsUpdatedAt: 11
    });
    rows.write('ada@example.com', {
      notes: { '2026-03-01': 'revised note' }
    });

    const account = rows.read('ada@example.com');
    assert.deepEqual(account.checklist, { '2026-03-01': { 'prayer-readings': true } });
    assert.deepEqual(account.notes, { '2026-03-01': 'revised note' });
    assert.deepEqual(account.timestamps, { '2026-03-01': 1 });
    assert.deepEqual(account.disciplineSettings, { 'fasting-fast': false });
    assert.equal(account.disciplineSettingsUpdatedAt, 11);

    const unbound = rows.read(null);
    assert.deepEqual(unbound.checklist, { '2026-03-02': { 'prayer-holyhour': true } });
    assert.deepEqual(unbound.notes, { '2026-03-02': 'unbound note' });
    assert.deepEqual(unbound.timestamps, { '2026-03-02': 2 });
    assert.deepEqual(unbound.disciplineSettings, { 'asceticism-alcohol': false });
    assert.equal(unbound.disciplineSettingsUpdatedAt, 2);

    const other = rows.read('bea@example.com');
    assert.deepEqual(other.checklist, {});
    assert.deepEqual(other.notes, {});
    assert.deepEqual(other.timestamps, {});
    assert.deepEqual(other.disciplineSettings, {});
    assert.equal(other.disciplineSettingsUpdatedAt, 0);
  });

  it('keeps the account rows on sign-out and shows the unbound rows', function () {
    const rows = createDeviceRows(memoryStorage());
    rows.write('ada@example.com', {
      checklist: { '2026-04-01': { 'fasting-fast': true } },
      notes: { '2026-04-01': 'private note' },
      timestamps: { '2026-04-01': 50 },
      disciplineSettings: { 'asceticism-soda': false },
      disciplineSettingsUpdatedAt: 50
    });
    rows.write(null, {
      checklist: { '2026-04-02': { 'prayer-readings': true } },
      notes: { '2026-04-02': 'local note' },
      timestamps: { '2026-04-02': 60 },
      disciplineSettings: { 'prayer-holyhour': true },
      disciplineSettingsUpdatedAt: 60
    });

    const signedOut = rows.read(null);
    assert.deepEqual(signedOut.checklist, { '2026-04-02': { 'prayer-readings': true } });
    assert.deepEqual(signedOut.notes, { '2026-04-02': 'local note' });
    assert.deepEqual(signedOut.timestamps, { '2026-04-02': 60 });
    assert.deepEqual(signedOut.disciplineSettings, { 'prayer-holyhour': true });
    assert.equal(signedOut.disciplineSettingsUpdatedAt, 60);

    const signedInAgain = rows.read('ada@example.com');
    assert.deepEqual(signedInAgain.checklist, { '2026-04-01': { 'fasting-fast': true } });
    assert.deepEqual(signedInAgain.notes, { '2026-04-01': 'private note' });
    assert.deepEqual(signedInAgain.timestamps, { '2026-04-01': 50 });
    assert.deepEqual(signedInAgain.disciplineSettings, { 'asceticism-soda': false });
    assert.equal(signedInAgain.disciplineSettingsUpdatedAt, 50);
  });

  it('on the first run gives rows already on the device to the signed-in account', function () {
    const storage = memoryStorage();
    storage.setItem('horarium-data', JSON.stringify({ '2026-05-01': { 'prayer-readings': true } }));
    storage.setItem('horarium-notes', JSON.stringify({ '2026-05-01': 'already here' }));
    storage.setItem('horarium-timestamps', JSON.stringify({ '2026-05-01': 70 }));
    storage.setItem('horarium-prefs', JSON.stringify({ 'asceticism-snacking': false }));
    storage.setItem('horarium-prefs-updated-at', '70');
    storage.setItem('exodus40lite-data', JSON.stringify({ '2026-05-01': { 'prayer-readings': true } }));

    const rows = createDeviceRows(storage);
    rows.assignExistingRows('ada@example.com');

    const account = rows.read('ada@example.com');
    assert.deepEqual(account.checklist, { '2026-05-01': { 'prayer-readings': true } });
    assert.equal(account.notes['2026-05-01'], 'already here');
    assert.equal(account.timestamps['2026-05-01'], 70);
    assert.equal(account.disciplineSettings['asceticism-snacking'], false);
    assert.equal(account.disciplineSettingsUpdatedAt, 70);

    const unbound = rows.read(null);
    assert.deepEqual(unbound.checklist, {});
    assert.deepEqual(unbound.notes, {});
    assert.deepEqual(unbound.timestamps, {});
    assert.deepEqual(unbound.disciplineSettings, {});
    assert.equal(unbound.disciplineSettingsUpdatedAt, 0);

    const reopened = createDeviceRows(storage);
    reopened.assignExistingRows(null);
    assert.deepEqual(reopened.read(null).checklist, {});
    assert.deepEqual(reopened.read('ada@example.com').checklist, { '2026-05-01': { 'prayer-readings': true } });
  });

  it('on the first run leaves rows with the unbound store when nobody is signed in', function () {
    const storage = memoryStorage();
    storage.setItem('exodus40lite-notes', JSON.stringify({ '2026-06-01': 'legacy note' }));
    storage.setItem('horarium-data', JSON.stringify({ '2026-06-01': { 'almsgiving-alms': true } }));
    storage.setItem('horarium-timestamps', JSON.stringify({ '2026-06-01': 80 }));
    storage.setItem('horarium-prefs', JSON.stringify({ 'stewardship-exercise': false }));
    storage.setItem('horarium-prefs-updated-at', '80');

    const rows = createDeviceRows(storage);
    rows.assignExistingRows(null);

    const unbound = rows.read(null);
    assert.deepEqual(unbound.checklist, { '2026-06-01': { 'almsgiving-alms': true } });
    assert.equal(unbound.notes['2026-06-01'], 'legacy note');
    assert.equal(unbound.timestamps['2026-06-01'], 80);
    assert.equal(unbound.disciplineSettings['stewardship-exercise'], false);
    assert.equal(unbound.disciplineSettingsUpdatedAt, 80);
    assert.deepEqual(rows.read('ada@example.com').checklist, {});
    assert.deepEqual(rows.read('ada@example.com').notes, {});

    rows.write(null, {
      notes: { '2026-06-01': 'legacy note', '2026-06-02': 'still unbound' }
    });
    rows.assignExistingRows('ada@example.com');
    assert.equal(rows.read(null).notes['2026-06-02'], 'still unbound');
    assert.equal(rows.read(null).notes['2026-06-01'], 'legacy note');
    assert.deepEqual(rows.read('ada@example.com').checklist, {});
    assert.deepEqual(rows.read('ada@example.com').notes, {});
  });
});

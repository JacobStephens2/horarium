const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createDeviceRows } = require('./device-rows');
const { memoryStorage } = require('./memory-storage');
const { todayStr, loadPage, button, checklistBox, fireChange, noteValue, disciplineBox, alcoholEnabled, flush } = require('./page-harness');

function typeNote(field, value) {
  field.value = value;
  const fns = field.listeners.input || [];
  for (let i = 0; i < fns.length; i++) fns[i].call(field);
}

function storageChanged(document, key, oldValue, newValue) {
  document.defaultView.dispatchEvent({
    type: 'storage',
    key: key,
    oldValue: oldValue,
    newValue: newValue
  });
}

describe('session changes from another document', function () {
  it('rebuilds when another document changes the session token and drops edits rendered for the previous account', async function () {
    const today = todayStr();
    const storage = memoryStorage();
    const rows = createDeviceRows(storage);
    rows.assignExistingRows(null);
    rows.write(null, { notes: { [today]: 'local note' } });
    rows.write('ada@example.com', {
      checklist: { [today]: { 'prayer-readings': true } },
      notes: { [today]: 'private note' },
      timestamps: { [today]: 1000 },
      disciplineSettings: { 'asceticism-alcohol': false },
      disciplineSettingsUpdatedAt: 1000
    });
    rows.write('bea@example.com', {
      checklist: { [today]: { 'prayer-holyhour': true } },
      notes: { [today]: 'bea note' },
      timestamps: { [today]: 2000 },
      disciplineSettings: { 'asceticism-soda': false },
      disciplineSettingsUpdatedAt: 2000
    });
    storage.setItem('horarium-token', 'token-ada');
    storage.setItem('horarium-username', 'ada@example.com');

    const requests = [];
    const document = loadPage(storage, requests);
    await flush();
    assert.equal(noteValue(document), 'private note');

    const renderedNotes = document.getElementById('daily-notes');
    const renderedReading = checklistBox(document, 'Read Mass readings');
    const renderedAlcohol = disciplineBox(document, 'No alcohol');
    const requestsBeforeUnrelated = requests.length;
    storageChanged(document, 'horarium-notes', null, '{}');
    await flush();
    assert.equal(requests.length, requestsBeforeUnrelated);
    assert.equal(noteValue(document), 'private note');

    typeNote(renderedNotes, 'private note revised');
    storage.setItem('horarium-token', 'token-bea');
    storage.setItem('horarium-username', 'bea@example.com');
    storageChanged(document, 'horarium-token', 'token-ada', 'token-bea');
    await flush();

    assert.equal(noteValue(document), 'bea note');
    assert.equal(checklistBox(document, 'Read Mass readings').checked, false);
    assert.equal(checklistBox(document, 'Make a holy half hour').checked, true);
    assert.equal(alcoholEnabled(document), true);
    assert.ok(document.walk().find(function (el) {
      return el.tagName === 'STRONG' && el.textContent === 'bea@example.com';
    }));

    typeNote(renderedNotes, 'stolen note');
    fireChange(renderedReading);
    renderedAlcohol.checked = true;
    fireChange(renderedAlcohol);
    await new Promise(function (resolve) { setTimeout(resolve, 500); });

    assert.equal(rows.read('ada@example.com').notes[today], 'private note');
    assert.deepEqual(rows.read('ada@example.com').checklist, { [today]: { 'prayer-readings': true } });
    assert.equal(rows.read('ada@example.com').disciplineSettings['asceticism-alcohol'], false);
    assert.equal(rows.read('ada@example.com').disciplineSettingsUpdatedAt, 1000);
    assert.equal(rows.read('bea@example.com').notes[today], 'bea note');
    assert.deepEqual(rows.read('bea@example.com').checklist, { [today]: { 'prayer-holyhour': true } });
    assert.deepEqual(rows.read('bea@example.com').disciplineSettings, { 'asceticism-soda': false });
    assert.equal(rows.read('bea@example.com').disciplineSettingsUpdatedAt, 2000);
    assert.equal(rows.read(null).notes[today], 'local note');
    assert.deepEqual(rows.read(null).checklist, {});
    assert.deepEqual(rows.read(null).disciplineSettings, {});
    const leaked = requests.filter(function (req) {
      const body = JSON.stringify(req.body || {});
      return body.indexOf('private note revised') !== -1 || body.indexOf('stolen note') !== -1;
    });
    assert.deepEqual(leaked, []);
  });

  it('rebuilds onto the unbound rows when another document changes the username and drops a stale checklist toggle', async function () {
    const today = todayStr();
    const storage = memoryStorage();
    const rows = createDeviceRows(storage);
    rows.assignExistingRows(null);
    rows.write(null, { notes: { [today]: 'local note' } });
    rows.write('ada@example.com', {
      checklist: { [today]: { 'prayer-readings': true } },
      notes: { [today]: 'private note' },
      timestamps: { [today]: 1000 },
      disciplineSettings: { 'asceticism-alcohol': false },
      disciplineSettingsUpdatedAt: 1000
    });
    storage.setItem('horarium-token', 'token-ada');
    storage.setItem('horarium-username', 'ada@example.com');

    const document = loadPage(storage, []);
    await flush();
    const renderedReading = checklistBox(document, 'Read Mass readings');
    const renderedAlcohol = disciplineBox(document, 'No alcohol');

    storage.removeItem('horarium-token');
    storage.removeItem('horarium-username');
    storageChanged(document, 'horarium-username', 'ada@example.com', null);
    await flush();

    assert.equal(noteValue(document), 'local note');
    assert.equal(alcoholEnabled(document), true);
    assert.ok(button(document, 'Sign in to sync across devices'));
    assert.equal(rows.read('ada@example.com').notes[today], 'private note');

    fireChange(renderedReading);
    renderedAlcohol.checked = true;
    fireChange(renderedAlcohol);
    await flush();

    assert.deepEqual(rows.read(null).checklist, {});
    assert.deepEqual(rows.read(null).disciplineSettings, {});
    assert.equal(rows.read(null).notes[today], 'local note');
    assert.deepEqual(rows.read('ada@example.com').checklist, { [today]: { 'prayer-readings': true } });
    assert.equal(rows.read('ada@example.com').disciplineSettings['asceticism-alcohol'], false);
    assert.equal(rows.read('ada@example.com').disciplineSettingsUpdatedAt, 1000);
  });
});

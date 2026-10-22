const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createDeviceRows } = require('./device-rows');
const { memoryStorage } = require('./memory-storage');
const {
  todayStr,
  jsonResponse,
  loadPage,
  button,
  checklistBox,
  fireChange,
  signIn,
  noteValue,
  alcoholEnabled,
  flush
} = require('./page-harness');

describe('account rows on the page', function () {
  it('shows the signed-in account rows, and sign-out shows unbound rows without dropping the account', async function () {
    const today = todayStr();
    const storage = memoryStorage();
    const rows = createDeviceRows(storage);
    rows.assignExistingRows(null);
    rows.write(null, {
      notes: { [today]: 'local note' },
      disciplineSettings: {},
      disciplineSettingsUpdatedAt: 0
    });
    rows.write('ada@example.com', {
      checklist: { [today]: { 'prayer-readings': true } },
      notes: { [today]: 'private note' },
      timestamps: { [today]: 1000 },
      disciplineSettings: { 'asceticism-alcohol': false },
      disciplineSettingsUpdatedAt: 1000
    });
    storage.setItem('horarium-token', 'token-ada');
    storage.setItem('horarium-username', 'ada@example.com');

    const requests = [];
    const document = loadPage(storage, requests);
    await flush();

    assert.equal(noteValue(document), 'private note');
    assert.equal(alcoholEnabled(document), false);

    const signOut = button(document, 'Sign out');
    assert.ok(signOut, 'sign out button');
    signOut.click();

    assert.equal(noteValue(document), 'local note');
    assert.equal(alcoholEnabled(document), true);
    assert.equal(storage.getItem('horarium-token'), null);
    assert.equal(rows.read('ada@example.com').notes[today], 'private note');
    assert.equal(rows.read('ada@example.com').disciplineSettings['asceticism-alcohol'], false);
    assert.equal(rows.read(null).notes[today], 'local note');

    const mark = requests.length;
    await signIn(document, 'bea@example.com', 'secret-password');

    assert.equal(noteValue(document), '');
    assert.equal(rows.read('ada@example.com').notes[today], 'private note');
    assert.deepEqual(rows.read('bea@example.com').notes, {});
    const leaked = requests.slice(mark).filter(function (req) {
      return req.url.indexOf('data.php') !== -1 && req.method === 'POST' && req.body && req.body.note === 'private note';
    });
    assert.deepEqual(leaked, []);
  });

  it('shows and edits the same account rows on the next sign-in', async function () {
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

    const document = loadPage(storage, []);
    await flush();
    button(document, 'Sign out').click();
    assert.equal(noteValue(document), 'local note');

    await signIn(document, 'ada@example.com', 'secret-password');
    assert.equal(noteValue(document), 'private note');

    fireChange(checklistBox(document, 'Read Mass readings'));
    assert.equal(rows.read('ada@example.com').checklist[today], undefined);
    assert.equal(rows.read('ada@example.com').notes[today], 'private note');
    assert.deepEqual(rows.read(null).checklist, {});
    assert.equal(rows.read(null).notes[today], 'local note');
  });

  it('registers from the unbound rows and does not send another account\'s notes', async function () {
    const today = todayStr();
    const storage = memoryStorage();
    const rows = createDeviceRows(storage);
    rows.assignExistingRows(null);
    rows.write(null, {
      checklist: { [today]: { 'prayer-holyhour': true } },
      notes: { [today]: 'local note' },
      disciplineSettings: { 'asceticism-alcohol': false },
      disciplineSettingsUpdatedAt: 40
    });
    rows.write('ada@example.com', {
      notes: { [today]: 'private note' },
      timestamps: { [today]: 1000 },
      disciplineSettings: { 'asceticism-soda': false },
      disciplineSettingsUpdatedAt: 90
    });
    storage.setItem('horarium-token', 'token-ada');
    storage.setItem('horarium-username', 'ada@example.com');

    const requests = [];
    const document = loadPage(storage, requests);
    await flush();
    button(document, 'Sign out').click();

    const mark = requests.length;
    await signIn(document, 'cy@example.com', 'secret-password', 'Create account');

    const register = requests.slice(mark).find(function (req) {
      return req.url.indexOf('register.php') !== -1;
    });
    assert.equal(register.body.notes[today], 'local note');
    assert.equal(register.body.checklist[today]['prayer-holyhour'], true);
    assert.deepEqual(register.body.prefs, { 'asceticism-alcohol': false });
    assert.equal(register.body.prefs_updated_at, 40);
    assert.equal(JSON.stringify(register.body).indexOf('private note'), -1);
    assert.equal(JSON.stringify(register.body).indexOf('asceticism-soda'), -1);
    assert.equal(noteValue(document), 'local note');
    assert.equal(alcoholEnabled(document), false);
    assert.equal(rows.read('ada@example.com').notes[today], 'private note');
    assert.equal(rows.read('ada@example.com').disciplineSettings['asceticism-soda'], false);
    assert.equal(rows.read('ada@example.com').disciplineSettingsUpdatedAt, 90);
    assert.equal(rows.read('cy@example.com').notes[today], 'local note');
    assert.equal(rows.read('cy@example.com').disciplineSettings['asceticism-alcohol'], false);
    assert.equal(rows.read(null).notes[today], undefined);
    assert.equal(rows.read(null).disciplineSettings['asceticism-alcohol'], undefined);
  });

  it('registers unbound checklist, notes, and discipline settings when another account is still named', async function () {
    const today = todayStr();
    const storage = memoryStorage();
    const rows = createDeviceRows(storage);
    rows.assignExistingRows(null);
    rows.write(null, {
      checklist: { [today]: { 'prayer-holyhour': true } },
      notes: { [today]: 'local note' },
      disciplineSettings: { 'asceticism-alcohol': false },
      disciplineSettingsUpdatedAt: 40
    });
    rows.write('ada@example.com', {
      checklist: { [today]: { 'prayer-readings': true } },
      notes: { [today]: 'private note' },
      timestamps: { [today]: 1000 },
      disciplineSettings: { 'asceticism-soda': false },
      disciplineSettingsUpdatedAt: 90
    });
    storage.setItem('horarium-username', 'ada@example.com');

    const requests = [];
    const document = loadPage(storage, requests);
    await flush();

    const mark = requests.length;
    await signIn(document, 'cy@example.com', 'secret-password', 'Create account');

    const register = requests.slice(mark).find(function (req) {
      return req.url.indexOf('register.php') !== -1;
    });
    assert.deepEqual(register.body.checklist, { [today]: { 'prayer-holyhour': true } });
    assert.deepEqual(register.body.notes, { [today]: 'local note' });
    assert.deepEqual(register.body.prefs, { 'asceticism-alcohol': false });
    assert.equal(register.body.prefs_updated_at, 40);
    const sent = JSON.stringify(register.body);
    assert.equal(sent.indexOf('private note'), -1);
    assert.equal(sent.indexOf('prayer-readings'), -1);
    assert.equal(sent.indexOf('asceticism-soda'), -1);

    assert.equal(noteValue(document), 'local note');
    assert.equal(checklistBox(document, 'Make a holy half hour').checked, true);
    assert.equal(checklistBox(document, 'Read Mass readings').checked, false);
    assert.equal(alcoholEnabled(document), false);

    assert.deepEqual(rows.read('ada@example.com').checklist, { [today]: { 'prayer-readings': true } });
    assert.deepEqual(rows.read('ada@example.com').notes, { [today]: 'private note' });
    assert.equal(rows.read('ada@example.com').timestamps[today], 1000);
    assert.deepEqual(rows.read('ada@example.com').disciplineSettings, { 'asceticism-soda': false });
    assert.equal(rows.read('ada@example.com').disciplineSettingsUpdatedAt, 90);

    assert.deepEqual(rows.read('cy@example.com').checklist, { [today]: { 'prayer-holyhour': true } });
    assert.deepEqual(rows.read('cy@example.com').notes, { [today]: 'local note' });
    assert.deepEqual(rows.read('cy@example.com').disciplineSettings, { 'asceticism-alcohol': false });
    assert.equal(rows.read('cy@example.com').disciplineSettingsUpdatedAt, 40);
    assert.equal(rows.read(null).notes[today], undefined);
    assert.equal(rows.read(null).checklist[today], undefined);
    assert.equal(rows.read(null).disciplineSettings['asceticism-alcohol'], undefined);

    const leaked = requests.slice(mark).filter(function (req) {
      const body = JSON.stringify(req.body || {});
      return body.indexOf('private note') !== -1
        || body.indexOf('prayer-readings') !== -1
        || body.indexOf('asceticism-soda') !== -1;
    });
    assert.deepEqual(leaked, []);
  });

  it('stamps unbound discipline settings when creating an account, not the named account', async function () {
    const today = todayStr();
    const storage = memoryStorage();
    const rows = createDeviceRows(storage);
    rows.assignExistingRows(null);
    rows.write(null, {
      notes: { [today]: 'local note' },
      disciplineSettings: { 'asceticism-alcohol': false },
      disciplineSettingsUpdatedAt: 0
    });
    rows.write('ada@example.com', {
      notes: { [today]: 'private note' },
      disciplineSettings: { 'asceticism-soda': false },
      disciplineSettingsUpdatedAt: 0
    });
    storage.setItem('horarium-username', 'ada@example.com');

    const requests = [];
    const document = loadPage(storage, requests);
    await flush();
    const before = Date.now();
    await signIn(document, 'cy@example.com', 'secret-password', 'Create account');

    const register = requests.find(function (req) {
      return req.url.indexOf('register.php') !== -1;
    });
    const stamped = register.body.prefs_updated_at;
    assert.equal(typeof stamped, 'number');
    assert.ok(stamped >= before);
    assert.deepEqual(register.body.prefs, { 'asceticism-alcohol': false });
    const sentClock = register.body.timestamps.find(function (entry) {
      return entry.date_str === today;
    });
    assert.equal(sentClock.updated_at, stamped);
    assert.equal(JSON.stringify(register.body).indexOf('private note'), -1);
    assert.equal(JSON.stringify(register.body).indexOf('asceticism-soda'), -1);
    assert.equal(rows.read(null).disciplineSettingsUpdatedAt, 0);
    assert.equal(rows.read('cy@example.com').disciplineSettingsUpdatedAt, stamped);
    assert.equal(rows.read('cy@example.com').timestamps[today], stamped);
    assert.equal(rows.read('ada@example.com').disciplineSettingsUpdatedAt, 0);
    assert.deepEqual(rows.read('ada@example.com').disciplineSettings, { 'asceticism-soda': false });
    assert.equal(rows.read('ada@example.com').notes[today], 'private note');
  });

  it('leaves the stamped clocks on the unbound rows when create fails', async function () {
    const today = todayStr();
    const storage = memoryStorage();
    const rows = createDeviceRows(storage);
    rows.assignExistingRows(null);
    rows.write(null, {
      notes: { [today]: 'local note' },
      disciplineSettings: { 'asceticism-alcohol': false },
      disciplineSettingsUpdatedAt: 0
    });
    const requests = [];
    const document = loadPage(storage, requests, {
      before(request) {
        if (request.url.indexOf('register.php') !== -1) {
          return Promise.resolve(jsonResponse({
            error: 'An account with this email already exists.'
          }, 409));
        }
      }
    });
    await flush();
    const before = Date.now();
    await signIn(document, 'cy@example.com', 'secret-password', 'Create account');

    const register = requests.find(function (req) {
      return req.url.indexOf('register.php') !== -1;
    });
    const stamped = register.body.prefs_updated_at;
    assert.ok(stamped >= before);
    const sentClock = register.body.timestamps.find(function (entry) {
      return entry.date_str === today;
    });
    assert.equal(sentClock.updated_at, stamped);
    assert.equal(rows.read(null).notes[today], 'local note');
    assert.equal(rows.read(null).timestamps[today], stamped);
    assert.equal(rows.read(null).disciplineSettingsUpdatedAt, stamped);
    assert.deepEqual(rows.read(null).disciplineSettings, { 'asceticism-alcohol': false });
    assert.equal(rows.read('cy@example.com').notes[today], undefined);
    assert.equal(rows.read('cy@example.com').timestamps[today], undefined);
    assert.equal(rows.read('cy@example.com').disciplineSettingsUpdatedAt, 0);
  });

  it('a rejected session shows unbound rows and keeps the account rows', async function () {
    const today = todayStr();
    const storage = memoryStorage();
    const rows = createDeviceRows(storage);
    rows.assignExistingRows(null);
    rows.write(null, { notes: { [today]: 'local note' } });
    rows.write('ada@example.com', {
      notes: { [today]: 'private note' },
      timestamps: { [today]: 1000 }
    });
    storage.setItem('horarium-token', 'token-ada');
    storage.setItem('horarium-username', 'ada@example.com');

    const document = loadPage(storage, [], {
      before(request) {
        if (request.url.indexOf('data.php') !== -1) {
          return Promise.resolve(jsonResponse({ error: 'Unauthorized' }, 401));
        }
      }
    });
    await flush();

    assert.equal(noteValue(document), 'local note');
    assert.equal(storage.getItem('horarium-token'), null);
    assert.equal(rows.read('ada@example.com').notes[today], 'private note');
    assert.equal(button(document, 'Sign out'), undefined);
  });

  it('on the first run gives rows already on the device to the signed-in account', async function () {
    const today = todayStr();
    const storage = memoryStorage();
    storage.setItem('exodus40lite-notes', JSON.stringify({ [today]: 'legacy note' }));
    storage.setItem('horarium-data', JSON.stringify({ [today]: { 'prayer-readings': true } }));
    storage.setItem('horarium-prefs', JSON.stringify({ 'asceticism-alcohol': false }));
    storage.setItem('horarium-token', 'token-ada');
    storage.setItem('horarium-username', 'ada@example.com');

    const document = loadPage(storage, []);
    await flush();
    assert.equal(noteValue(document), 'legacy note');
    assert.equal(alcoholEnabled(document), false);
    assert.equal(checklistBox(document, 'Read Mass readings').checked, true);

    button(document, 'Sign out').click();
    assert.equal(noteValue(document), '');
    assert.equal(alcoholEnabled(document), true);
    assert.equal(checklistBox(document, 'Read Mass readings').checked, false);

    const rows = createDeviceRows(storage);
    assert.equal(rows.read('ada@example.com').notes[today], 'legacy note');
    assert.equal(rows.read('ada@example.com').checklist[today]['prayer-readings'], true);
    assert.equal(rows.read('ada@example.com').disciplineSettings['asceticism-alcohol'], false);
    assert.equal(rows.read(null).notes[today], undefined);
    assert.deepEqual(rows.read(null).checklist, {});
    assert.equal(storage.getItem('exodus40lite-notes'), null);
  });

  it('pushes and merges only the signed-in account rows, including a date not yet on the server', async function () {
    const storage = memoryStorage();
    const rows = createDeviceRows(storage);
    rows.assignExistingRows(null);
    rows.write(null, {
      checklist: { '2026-03-02': { 'almsgiving-alms': true } },
      notes: { '2026-03-02': 'unbound same day', '2026-03-04': 'local note' },
      timestamps: { '2026-03-02': 1500, '2026-03-04': 1000 },
      disciplineSettings: { 'stewardship-exercise': false },
      disciplineSettingsUpdatedAt: 1000
    });
    rows.write('ada@example.com', {
      checklist: {
        '2026-03-02': { 'prayer-readings': true },
        '2026-03-05': { 'prayer-holyhour': true }
      },
      notes: {
        '2026-03-02': 'ada local',
        '2026-03-05': 'ada newer'
      },
      timestamps: {
        '2026-03-02': 3000,
        '2026-03-05': 9500
      },
      disciplineSettings: {},
      disciplineSettingsUpdatedAt: 0
    });
    rows.write('bea@example.com', {
      checklist: {
        '2026-03-03': { 'fasting-fast': true },
        '2026-03-05': { 'fasting-fast': true }
      },
      notes: {
        '2026-03-03': 'bea secret',
        '2026-03-05': 'bea same day'
      },
      timestamps: {
        '2026-03-03': 8000,
        '2026-03-05': 7000
      },
      disciplineSettings: { 'asceticism-soda': false },
      disciplineSettingsUpdatedAt: 8000
    });
    storage.setItem('horarium-token', 'token-ada');
    storage.setItem('horarium-username', 'ada@example.com');

    const requests = [];
    loadPage(storage, requests, {
      before(request) {
        if (request.url.indexOf('data.php') !== -1 && request.method === 'GET') {
          return Promise.resolve(jsonResponse({
            data: [
              {
                date_str: '2026-03-01',
                items: { 'prayer-holyhour': true },
                note: 'server note',
                updated_at: 9000
              },
              {
                date_str: '2026-03-05',
                items: { 'prayer-readings': true },
                note: 'old server',
                updated_at: 1000
              }
            ]
          }));
        }
      }
    });
    await flush();

    const ada = rows.read('ada@example.com');
    assert.deepEqual(ada.checklist, {
      '2026-03-01': { 'prayer-holyhour': true },
      '2026-03-02': { 'prayer-readings': true },
      '2026-03-05': { 'prayer-holyhour': true }
    });
    assert.deepEqual(ada.notes, {
      '2026-03-01': 'server note',
      '2026-03-02': 'ada local',
      '2026-03-05': 'ada newer'
    });
    assert.deepEqual(ada.timestamps, {
      '2026-03-01': 9000,
      '2026-03-02': 3000,
      '2026-03-05': 9500
    });

    const posts = requests.filter(function (req) {
      return req.url.indexOf('data.php') !== -1 && req.method === 'POST';
    }).map(function (req) { return req.body; });
    posts.sort(function (a, b) {
      return a.date_str < b.date_str ? -1 : a.date_str > b.date_str ? 1 : 0;
    });
    assert.deepEqual(posts, [
      {
        date_str: '2026-03-02',
        items: { 'prayer-readings': true },
        note: 'ada local',
        updated_at: 3000
      },
      {
        date_str: '2026-03-05',
        items: { 'prayer-holyhour': true },
        note: 'ada newer',
        updated_at: 9500
      }
    ]);

    assert.deepEqual(rows.read('bea@example.com'), {
      checklist: {
        '2026-03-03': { 'fasting-fast': true },
        '2026-03-05': { 'fasting-fast': true }
      },
      notes: {
        '2026-03-03': 'bea secret',
        '2026-03-05': 'bea same day'
      },
      timestamps: {
        '2026-03-03': 8000,
        '2026-03-05': 7000
      },
      disciplineSettings: { 'asceticism-soda': false },
      disciplineSettingsUpdatedAt: 8000
    });
    assert.deepEqual(rows.read(null), {
      checklist: { '2026-03-02': { 'almsgiving-alms': true } },
      notes: { '2026-03-02': 'unbound same day', '2026-03-04': 'local note' },
      timestamps: { '2026-03-02': 1500, '2026-03-04': 1000 },
      disciplineSettings: { 'stewardship-exercise': false },
      disciplineSettingsUpdatedAt: 1000
    });
    const prefsPosts = requests.filter(function (req) {
      return req.url.indexOf('prefs.php') !== -1 && req.method === 'POST';
    });
    assert.deepEqual(prefsPosts, []);
  });

  it('merges newer discipline settings into the signed-in account only', async function () {
    const storage = memoryStorage();
    const rows = createDeviceRows(storage);
    rows.assignExistingRows(null);
    rows.write(null, {
      disciplineSettings: { 'stewardship-exercise': false },
      disciplineSettingsUpdatedAt: 1000
    });
    rows.write('ada@example.com', {
      checklist: { '2026-03-02': { 'prayer-readings': true } },
      notes: { '2026-03-02': 'ada local' },
      timestamps: { '2026-03-02': 3000 },
      disciplineSettings: { 'asceticism-alcohol': false },
      disciplineSettingsUpdatedAt: 100
    });
    rows.write('bea@example.com', {
      disciplineSettings: { 'asceticism-soda': false },
      disciplineSettingsUpdatedAt: 8000
    });
    storage.setItem('horarium-token', 'token-ada');
    storage.setItem('horarium-username', 'ada@example.com');

    const requests = [];
    loadPage(storage, requests, {
      before(request) {
        if (request.url.indexOf('data.php') !== -1 && request.method === 'GET') {
          return Promise.resolve(jsonResponse({ data: [] }));
        }
        if (request.url.indexOf('prefs.php') !== -1 && request.method === 'GET') {
          return Promise.resolve(jsonResponse({
            prefs: { 'fasting-fast': false },
            updated_at: 5000
          }));
        }
      }
    });
    await flush();

    const ada = rows.read('ada@example.com');
    assert.deepEqual(ada.disciplineSettings, { 'fasting-fast': false });
    assert.equal(ada.disciplineSettingsUpdatedAt, 5000);
    assert.equal(ada.notes['2026-03-02'], 'ada local');
    assert.deepEqual(rows.read('bea@example.com').disciplineSettings, { 'asceticism-soda': false });
    assert.equal(rows.read('bea@example.com').disciplineSettingsUpdatedAt, 8000);
    assert.deepEqual(rows.read(null).disciplineSettings, { 'stewardship-exercise': false });
    assert.equal(rows.read(null).disciplineSettingsUpdatedAt, 1000);

    const prefsPosts = requests.filter(function (req) {
      return req.url.indexOf('prefs.php') !== -1 && req.method === 'POST';
    });
    assert.deepEqual(prefsPosts, []);
    const dataPosts = requests.filter(function (req) {
      return req.url.indexOf('data.php') !== -1 && req.method === 'POST';
    }).map(function (req) { return req.body; });
    assert.deepEqual(dataPosts, [
      {
        date_str: '2026-03-02',
        items: { 'prayer-readings': true },
        note: 'ada local',
        updated_at: 3000
      }
    ]);
  });

  it('pushes newer discipline settings for the signed-in account only', async function () {
    const storage = memoryStorage();
    const rows = createDeviceRows(storage);
    rows.assignExistingRows(null);
    rows.write(null, {
      disciplineSettings: { 'stewardship-exercise': false },
      disciplineSettingsUpdatedAt: 1000
    });
    rows.write('ada@example.com', {
      disciplineSettings: { 'asceticism-alcohol': false },
      disciplineSettingsUpdatedAt: 4000
    });
    rows.write('bea@example.com', {
      disciplineSettings: { 'asceticism-soda': false },
      disciplineSettingsUpdatedAt: 8000
    });
    storage.setItem('horarium-token', 'token-ada');
    storage.setItem('horarium-username', 'ada@example.com');

    const requests = [];
    loadPage(storage, requests, {
      before(request) {
        if (request.url.indexOf('prefs.php') !== -1 && request.method === 'GET') {
          return Promise.resolve(jsonResponse({
            prefs: { 'fasting-fast': false },
            updated_at: 100
          }));
        }
      }
    });
    await flush();

    const prefsPosts = requests.filter(function (req) {
      return req.url.indexOf('prefs.php') !== -1 && req.method === 'POST';
    }).map(function (req) { return req.body; });
    assert.deepEqual(prefsPosts, [
      {
        prefs: { 'asceticism-alcohol': false },
        updated_at: 4000
      }
    ]);
    assert.deepEqual(rows.read('ada@example.com').disciplineSettings, { 'asceticism-alcohol': false });
    assert.equal(rows.read('ada@example.com').disciplineSettingsUpdatedAt, 4000);
    assert.deepEqual(rows.read('bea@example.com').disciplineSettings, { 'asceticism-soda': false });
    assert.equal(rows.read('bea@example.com').disciplineSettingsUpdatedAt, 8000);
    assert.deepEqual(rows.read(null).disciplineSettings, { 'stewardship-exercise': false });
    assert.equal(rows.read(null).disciplineSettingsUpdatedAt, 1000);
  });

  it('gives the unbound rows to the new account and leaves them out of the next create', async function () {
    const today = todayStr();
    const storage = memoryStorage();
    const rows = createDeviceRows(storage);
    rows.assignExistingRows(null);
    rows.write(null, {
      checklist: { [today]: { 'prayer-holyhour': true } },
      notes: { [today]: 'local note' },
      timestamps: { [today]: 40 },
      disciplineSettings: { 'asceticism-alcohol': false },
      disciplineSettingsUpdatedAt: 40
    });
    const requests = [];
    const document = loadPage(storage, requests);
    await flush();
    await signIn(document, 'cy@example.com', 'secret-password', 'Create account');

    assert.equal(rows.read('cy@example.com').notes[today], 'local note');
    assert.equal(rows.read('cy@example.com').checklist[today]['prayer-holyhour'], true);
    assert.equal(rows.read('cy@example.com').disciplineSettings['asceticism-alcohol'], false);
    assert.equal(rows.read(null).notes[today], undefined);
    assert.equal(rows.read(null).checklist[today], undefined);
    assert.equal(rows.read(null).disciplineSettings['asceticism-alcohol'], undefined);

    button(document, 'Sign out').click();
    const mark = requests.length;
    await signIn(document, 'dee@example.com', 'secret-password', 'Create account');
    const second = requests.slice(mark).find(function (req) {
      return req.url.indexOf('register.php') !== -1;
    });
    assert.equal(second.body.notes[today], undefined);
    assert.equal(second.body.checklist[today], undefined);
    assert.equal(rows.read('cy@example.com').notes[today], 'local note');
  });

  it('sends a note still in the signed-out field when creating an account', async function () {
    const today = todayStr();
    const storage = memoryStorage();
    const rows = createDeviceRows(storage);
    rows.assignExistingRows(null);
    rows.write(null, { notes: { [today]: 'saved note' } });
    const requests = [];
    const document = loadPage(storage, requests);
    await flush();
    const notes = document.getElementById('daily-notes');
    notes.value = 'typed but not flushed';
    (notes.listeners.input || []).forEach(function (fn) { fn(); });
    await signIn(document, 'cy@example.com', 'secret-password', 'Create account');

    const register = requests.find(function (req) {
      return req.url.indexOf('register.php') !== -1;
    });
    assert.equal(register.body.notes[today], 'typed but not flushed');
    await new Promise(function (resolve) { setTimeout(resolve, 500); });
    assert.equal(rows.read('cy@example.com').notes[today], 'typed but not flushed');
  });
});

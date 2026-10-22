const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const vm = require('vm');
const { createDeviceRows } = require('./device-rows');
const { memoryStorage } = require('./memory-storage');

function todayStr() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
}

function createDocument() {
  function classNames(el) {
    return String(el.className || '').split(/\s+/).filter(Boolean);
  }

  function makeElement(tag) {
    const el = {
      tagName: String(tag).toUpperCase(),
      id: '',
      className: '',
      textContent: '',
      hidden: false,
      value: '',
      checked: false,
      disabled: false,
      style: {},
      children: [],
      parentNode: null,
      listeners: {},
      attributes: {}
    };
    el.classList = {
      add(name) {
        const names = classNames(el);
        if (names.indexOf(name) === -1) names.push(name);
        el.className = names.join(' ');
      },
      remove(name) {
        el.className = classNames(el).filter(function (n) { return n !== name; }).join(' ');
      },
      toggle(name, force) {
        const has = classNames(el).indexOf(name) !== -1;
        const next = force === undefined ? !has : !!force;
        if (next) this.add(name);
        else this.remove(name);
        return next;
      }
    };
    el.setAttribute = function (name, value) {
      el.attributes[name] = String(value);
      if (name === 'id') el.id = String(value);
      if (name === 'class') el.className = String(value);
      if (name === 'type') el.type = String(value);
    };
    el.getAttribute = function (name) {
      return Object.prototype.hasOwnProperty.call(el.attributes, name) ? el.attributes[name] : null;
    };
    el.appendChild = function (child) {
      if (!child || typeof child !== 'object') return child;
      child.parentNode = el;
      el.children.push(child);
      return child;
    };
    el.removeChild = function (child) {
      el.children = el.children.filter(function (c) { return c !== child; });
      if (child) child.parentNode = null;
      return child;
    };
    el.addEventListener = function (type, fn) {
      if (!el.listeners[type]) el.listeners[type] = [];
      el.listeners[type].push(fn);
    };
    el.click = function () {
      const fns = el.listeners.click || [];
      for (let i = 0; i < fns.length; i++) fns[i]({ preventDefault() {}, stopPropagation() {} });
    };
    el.focus = function () {};
    el.remove = function () {
      if (el.parentNode) el.parentNode.removeChild(el);
    };
    Object.defineProperty(el, 'innerHTML', {
      get() { return el._html || ''; },
      set(value) {
        el._html = String(value);
        el.children.length = 0;
      }
    });
    return el;
  }

  function walk(el, acc) {
    acc.push(el);
    const children = el.children || [];
    for (let i = 0; i < children.length; i++) walk(children[i], acc);
    return acc;
  }

  const document = {
    body: makeElement('body'),
    createElement: makeElement,
    createTextNode(text) {
      return { tagName: '#text', textContent: String(text), children: [] };
    }
  };
  document.getElementById = function (id) {
    return walk(document.body, []).find(function (el) { return el.id === id; }) || null;
  };
  document.querySelector = function (selector) {
    const found = document.querySelectorAll(selector);
    return found[0] || null;
  };
  document.querySelectorAll = function (selector) {
    const all = walk(document.body, []);
    if (selector === '.all-done') {
      return all.filter(function (el) { return classNames(el).indexOf('all-done') !== -1; });
    }
    if (selector === '#checklist input[type="checkbox"]') {
      const checklist = document.getElementById('checklist');
      return walk(checklist, []).filter(function (el) {
        return el.tagName === 'INPUT' && el.getAttribute('type') === 'checkbox';
      });
    }
    return [];
  };

  const ids = [
    'checklist', 'current-date', 'lent-day', 'today-btn', 'prev-day', 'next-day',
    'today-indicator', 'progress-fill', 'progress-text', 'settings-section',
    'anchors-section', 'account-section'
  ];
  for (let i = 0; i < ids.length; i++) {
    const el = makeElement('div');
    el.id = ids[i];
    document.body.appendChild(el);
  }
  document.walk = function () { return walk(document.body, []); };
  return document;
}

function jsonResponse(body, status) {
  return {
    status: status || 200,
    json() { return Promise.resolve(body); }
  };
}

function loadPage(storage, requests, routes) {
  const document = createDocument();
  const context = {
    console,
    setTimeout,
    clearTimeout,
    URLSearchParams,
    Intl,
    Date,
    Math,
    JSON,
    Object,
    Array,
    String,
    Number,
    parseInt,
    parseFloat,
    encodeURIComponent,
    decodeURIComponent,
    Promise,
    Error,
    RegExp,
    isNaN,
    localStorage: storage,
    document,
    navigator: {
      serviceWorker: {
        register() { return Promise.resolve(); },
        addEventListener() {}
      }
    },
    history: { replaceState() {} },
    location: { search: '', pathname: '/', reload() {} },
    confirm() { return true; },
    fetch(url, options) {
      const method = (options && options.method) || 'GET';
      let body = null;
      if (options && options.body) {
        try { body = JSON.parse(options.body); } catch (e) { body = options.body; }
      }
      const headers = (options && options.headers) || {};
      const request = {
        url: String(url),
        method: method,
        body: body,
        authorization: headers.Authorization || headers.authorization || null
      };
      requests.push(request);
      if (routes && routes.before) {
        const custom = routes.before(request);
        if (custom) return custom;
      }
      if (String(url).indexOf('login.php') !== -1 || String(url).indexOf('register.php') !== -1) {
        return Promise.resolve(jsonResponse({
          token: 'token-for-' + (body && body.username),
          username: body && body.username
        }));
      }
      if (String(url).indexOf('data.php') !== -1 && method === 'GET') {
        return Promise.resolve(jsonResponse({ data: [] }));
      }
      if (String(url).indexOf('prefs.php') !== -1 && method === 'GET') {
        return Promise.resolve(jsonResponse({ prefs: {}, updated_at: 0 }));
      }
      if (String(url).indexOf('anchors.php') !== -1) {
        return Promise.resolve(jsonResponse({ incoming: [], outgoing: [], pairs: [] }));
      }
      return Promise.resolve(jsonResponse({ ok: true }));
    }
  };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(require.resolve('./device-rows.js'), 'utf8'), context, { filename: 'device-rows.js' });
  vm.runInContext(fs.readFileSync(require.resolve('./app.js'), 'utf8'), context, { filename: 'app.js' });
  return document;
}

function button(document, text) {
  return document.walk().find(function (el) {
    return el.tagName === 'BUTTON' && el.textContent === text;
  });
}

function checklistBox(document, labelText) {
  const label = document.walk().find(function (el) {
    return el.className === 'item-label' && el.textContent === labelText;
  });
  if (!label) throw new Error('missing checklist row ' + labelText);
  return label.parentNode.parentNode.children.find(function (el) {
    return el.tagName === 'INPUT';
  });
}

function fireChange(input) {
  const fns = input.listeners.change || [];
  for (let i = 0; i < fns.length; i++) fns[i].call(input);
}

async function signIn(document, email, password, submitText) {
  const toggle = button(document, 'Sign in to sync across devices');
  if (toggle) toggle.click();
  if (submitText === 'Create account') {
    button(document, 'Don\u2019t have an account? Register').click();
  }
  const account = document.getElementById('account-section');
  const inputs = document.walk().filter(function (el) {
    return el.tagName === 'INPUT' && el.parentNode && accountContains(account, el);
  });
  const emailInput = inputs.find(function (el) {
    return el.getAttribute('type') === 'email' && el.getAttribute('placeholder') === 'Email address';
  });
  const passwordInput = inputs.find(function (el) { return el.getAttribute('type') === 'password'; });
  emailInput.value = email;
  passwordInput.value = password;
  const submit = button(document, submitText || 'Sign in');
  submit.click();
  await flush();
}

function accountContains(account, el) {
  let current = el;
  while (current) {
    if (current === account) return true;
    current = current.parentNode;
  }
  return false;
}

function noteValue(document) {
  const notes = document.getElementById('daily-notes');
  if (!notes) throw new Error('daily notes field is missing');
  return notes.value;
}

function alcoholEnabled(document) {
  const label = document.walk().find(function (el) {
    return el.className === 'settings-item-label' && el.textContent === 'No alcohol';
  });
  if (!label || !label.parentNode) throw new Error('alcohol discipline setting is missing');
  const input = label.parentNode.children.find(function (el) { return el.tagName === 'INPUT'; });
  if (!input) throw new Error('alcohol discipline checkbox is missing');
  return input.checked;
}

async function flush() {
  for (let i = 0; i < 30; i++) await Promise.resolve();
}

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
      notes: { [today]: 'local note' }
    });
    rows.write('ada@example.com', {
      notes: { [today]: 'private note' },
      timestamps: { [today]: 1000 }
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
    assert.equal(JSON.stringify(register.body).indexOf('private note'), -1);
    assert.equal(noteValue(document), 'local note');
    assert.equal(rows.read('ada@example.com').notes[today], 'private note');
    assert.equal(rows.read('cy@example.com').notes[today], 'local note');
    assert.equal(rows.read(null).notes[today], 'local note');
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
});

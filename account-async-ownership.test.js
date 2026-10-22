const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const vm = require('vm');
const { createDeviceRows } = require('./device-rows');

function memoryStorage() {
  const items = new Map();
  return {
    getItem(key) { return items.has(key) ? items.get(key) : null; },
    setItem(key, value) { items.set(String(key), String(value)); },
    removeItem(key) { items.delete(key); }
  };
}
function todayStr() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
}
function createDocument() {
  function classNames(el) { return String(el.className || '').split(/\s+/).filter(Boolean); }
  function makeElement(tag) {
    const el = {
      tagName: String(tag).toUpperCase(), id: '', className: '', textContent: '',
      hidden: false, value: '', checked: false, disabled: false, style: {},
      children: [], parentNode: null, listeners: {}, attributes: {}
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
      child.parentNode = el; el.children.push(child); return child;
    };
    el.removeChild = function (child) {
      el.children = el.children.filter(function (c) { return c !== child; });
      return child;
    };
    el.addEventListener = function (type, fn) {
      (el.listeners[type] || (el.listeners[type] = [])).push(fn);
    };
    el.click = function () {
      (el.listeners.click || []).forEach(function (fn) { fn({ preventDefault() {}, stopPropagation() {} }); });
    };
    el.classList = { add() {}, remove() {}, toggle() { return false; } };
    el.focus = function () {};
    el.remove = function () { if (el.parentNode) el.parentNode.removeChild(el); };
    Object.defineProperty(el, 'innerHTML', {
      get() { return ''; },
      set() { el.children.length = 0; }
    });
    return el;
  }
  function walk(el, acc) {
    acc.push(el);
    (el.children || []).forEach(function (child) { walk(child, acc); });
    return acc;
  }
  const document = {
    body: makeElement('body'),
    createElement: makeElement,
    createTextNode(text) { return { tagName: '#text', textContent: String(text), children: [] }; }
  };
  document.getElementById = function (id) {
    return walk(document.body, []).find(function (el) { return el.id === id; }) || null;
  };
  document.querySelectorAll = function () { return []; };
  document.querySelector = function () { return null; };
  ['checklist', 'current-date', 'lent-day', 'today-btn', 'prev-day', 'next-day', 'today-indicator', 'progress-fill', 'progress-text', 'settings-section', 'anchors-section', 'account-section'].forEach(function (id) {
    const el = makeElement('div');
    el.id = id;
    document.body.appendChild(el);
  });
  document.walk = function () { return walk(document.body, []); };
  return document;
}
function jsonResponse(body, status) {
  return { status: status || 200, json() { return Promise.resolve(body); } };
}
function loadPage(storage, fetchImpl) {
  const document = createDocument();
  const context = {
    console, setTimeout, clearTimeout, URLSearchParams, Intl, Date, Math, JSON, Object, Array, String, Number,
    parseInt, parseFloat, encodeURIComponent, decodeURIComponent, Promise, Error, RegExp, isNaN,
    localStorage: storage, document,
    navigator: { serviceWorker: { register() { return Promise.resolve(); }, addEventListener() {} } },
    history: { replaceState() {} },
    location: { search: '', pathname: '/', reload() {} },
    confirm() { return true; },
    fetch: fetchImpl
  };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(require.resolve('./device-rows.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(require.resolve('./app.js'), 'utf8'), context);
  return document;
}
function button(document, text) {
  return document.walk().find(function (el) { return el.tagName === 'BUTTON' && el.textContent === text; });
}
function flush() { return new Promise(function (resolve) { setTimeout(resolve, 20); }); }

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
    const document = loadPage(storage, function (url, options) {
      const method = (options && options.method) || 'GET';
      if (String(url).indexOf('data.php') !== -1 && method === 'GET') {
        return gate.then(function () {
          return jsonResponse({
            data: [{ date_str: today, items: { 'prayer-holyhour': true }, note: 'from server', updated_at: 9000 }]
          });
        });
      }
      if (String(url).indexOf('prefs.php') !== -1) {
        return Promise.resolve(jsonResponse({ prefs: {}, updated_at: 0 }));
      }
      return Promise.resolve(jsonResponse({ ok: true }));
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
    const document = loadPage(storage, function (url) {
      if (String(url).indexOf('data.php') !== -1) return Promise.resolve(jsonResponse({ data: [] }));
      if (String(url).indexOf('prefs.php') !== -1) return Promise.resolve(jsonResponse({ prefs: {}, updated_at: 0 }));
      return Promise.resolve(jsonResponse({ ok: true }));
    });
    await flush();
    const notes = document.getElementById('daily-notes');
    notes.value = 'private note revised';
    (notes.listeners.input || []).forEach(function (fn) { fn(); });
    button(document, 'Sign out').click();
    await new Promise(function (resolve) { setTimeout(resolve, 500); });
    assert.equal(rows.read('ada@example.com').notes[today], 'private note revised');
    assert.equal(rows.read(null).notes[today], 'local note');
  });
});

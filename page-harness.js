const fs = require('fs');
const vm = require('vm');

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

  document.walk = function () { return walk(document.body, []); };
  mountShell(document);
  return document;
}

const PAGE_IDS = [
  'checklist', 'current-date', 'lent-day', 'today-btn', 'prev-day', 'next-day',
  'today-indicator', 'progress-fill', 'progress-text', 'settings-section',
  'anchors-section', 'account-section'
];

function mountShell(document) {
  document.body.children.length = 0;
  for (let i = 0; i < PAGE_IDS.length; i++) {
    const el = document.createElement('div');
    el.id = PAGE_IDS[i];
    document.body.appendChild(el);
  }
}

function jsonResponse(body, status) {
  return {
    status: status || 200,
    json() { return Promise.resolve(body); }
  };
}

function loadPage(storage, requests, routes) {
  const document = createDocument();
  let windowListeners = {};
  const location = {
    search: '',
    pathname: '/',
    reload() { mount(); }
  };
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
    location,
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
  document.defaultView = context;
  context.addEventListener = function (type, fn) {
    if (!windowListeners[type]) windowListeners[type] = [];
    windowListeners[type].push(fn);
  };
  context.removeEventListener = function (type, fn) {
    const list = windowListeners[type] || [];
    windowListeners[type] = list.filter(function (item) { return item !== fn; });
  };
  context.dispatchEvent = function (event) {
    const list = (windowListeners[event.type] || []).slice();
    for (let i = 0; i < list.length; i++) list[i].call(context, event);
  };
  const deviceRowsSource = fs.readFileSync(require.resolve('./device-rows.js'), 'utf8');
  const appSource = fs.readFileSync(require.resolve('./app.js'), 'utf8');
  function mount() {
    mountShell(document);
    windowListeners = {};
    vm.runInContext(deviceRowsSource, context, { filename: 'device-rows.js' });
    vm.runInContext(appSource, context, { filename: 'app.js' });
  }
  vm.createContext(context);
  mount();
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

function disciplineBox(document, labelText) {
  const label = document.walk().find(function (el) {
    return el.className === 'settings-item-label' && el.textContent === labelText;
  });
  if (!label || !label.parentNode) throw new Error('missing discipline setting ' + labelText);
  const input = label.parentNode.children.find(function (el) { return el.tagName === 'INPUT'; });
  if (!input) throw new Error('missing discipline checkbox ' + labelText);
  return input;
}

function alcoholEnabled(document) {
  return disciplineBox(document, 'No alcohol').checked;
}

async function flush() {
  for (let i = 0; i < 30; i++) await Promise.resolve();
}


module.exports = {
  todayStr,
  jsonResponse,
  loadPage,
  button,
  checklistBox,
  fireChange,
  signIn,
  noteValue,
  disciplineBox,
  alcoholEnabled,
  flush
};

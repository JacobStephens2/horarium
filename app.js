(function () {
  'use strict';

  var STORAGE_KEY = 'horarium-data';
  var NOTES_KEY = 'horarium-notes';
  var TIMESTAMPS_KEY = 'horarium-timestamps';
  var TOKEN_KEY = 'horarium-token';
  var USERNAME_KEY = 'horarium-username';
  var PREFS_KEY = 'horarium-prefs';
  var PREFS_UPDATED_KEY = 'horarium-prefs-updated-at';
  var API_BASE = './api';

  // One-time migration from pre-rename (Exodus 40 Lite) localStorage keys
  (function migrateStorageKeys() {
    var legacy = [
      ['exodus40lite-data', STORAGE_KEY],
      ['exodus40lite-notes', NOTES_KEY],
      ['exodus40lite-timestamps', TIMESTAMPS_KEY],
      ['exodus40lite-token', TOKEN_KEY],
      ['exodus40lite-username', USERNAME_KEY],
      ['exodus40lite-prefs', PREFS_KEY],
      ['exodus40lite-prefs-updated-at', PREFS_UPDATED_KEY]
    ];
    for (var i = 0; i < legacy.length; i++) {
      var oldKey = legacy[i][0];
      var newKey = legacy[i][1];
      if (localStorage.getItem(newKey) === null) {
        var val = localStorage.getItem(oldKey);
        if (val !== null) localStorage.setItem(newKey, val);
      }
    }
  })();

  var Cal = window.HorariumCalendar;

  var CATEGORIES = [
    {
      id: 'prayer',
      name: 'Prayer',
      icon: '\u{1F64F}',
      items: [
        { id: 'prayer-readings', label: 'Read Mass readings', freq: 'daily' },
        { id: 'prayer-holyhour', label: 'Make a holy half hour', freq: 'daily' },
        { id: 'prayer-lordsday', label: "Celebrate the Lord\u2019s Day by relaxing one discipline", freq: 'sunday' }
      ]
    },
    {
      id: 'fasting',
      name: 'Fasting',
      icon: '\u{1F35E}',
      items: [
        { id: 'fasting-fast', label: 'Fast', freq: 'fasting' },
        { id: 'fasting-abstain', label: 'Abstain from meat', freq: 'abstinence' }
      ]
    },
    {
      id: 'almsgiving',
      name: 'Almsgiving & Works of Charity',
      icon: '\u{1FAF4}',
      items: [
        { id: 'almsgiving-alms', label: 'Give alms', freq: 'weekly' },
        {
          id: 'charity-work',
          label: 'Perform one work of charity',
          freq: 'daily',
          expandable: true,
          details: [
            { heading: 'Corporal', list: 'Feed the hungry, give drink to the thirsty, clothe the naked, shelter the homeless, visit the sick, visit the imprisoned, bury the dead' },
            { heading: 'Spiritual', list: 'Instruct the ignorant, counsel the doubtful, admonish the sinner, bear wrongs patiently, forgive offenses willingly, comfort the afflicted, pray for the living and the dead' }
          ]
        }
      ]
    },
    {
      id: 'fraternity',
      name: 'Fraternity',
      icon: '\u{1FAC2}',
      items: [
        { id: 'fraternity-anchor', label: 'Brother check-in', freq: 'daily' },
        { id: 'fraternity-meeting', label: 'Fraternity meeting with the group', freq: 'sunday' }
      ]
    },
    {
      id: 'stewardship',
      name: 'Stewardship',
      icon: '\u{1F3DB}\uFE0F',
      items: [
        { id: 'stewardship-sleep', label: 'Full night\u2019s sleep (7+ hours)', freq: 'daily' },
        { id: 'stewardship-exercise', label: 'Exercise', freq: 'weekly', weeklyGoal: 3 }
      ]
    },
    {
      id: 'asceticism',
      name: 'Asceticism',
      icon: '\u{1F4AA}',
      items: [
        { id: 'asceticism-screentime', label: 'No unnecessary screen time', freq: 'daily' },
        { id: 'asceticism-alcohol', label: 'No alcohol', freq: 'daily' },
        { id: 'asceticism-soda', label: 'No soda or sweet drinks', freq: 'daily' },
        { id: 'asceticism-snacking', label: 'No snacking between meals', freq: 'daily' },
        { id: 'asceticism-desserts', label: 'No desserts or sweets', freq: 'daily' },
        { id: 'asceticism-music', label: 'Only music that lifts the soul to God', freq: 'daily' },
        { id: 'asceticism-purchases', label: 'No unnecessary purchases', freq: 'daily' },
        { id: 'asceticism-coldshower', label: 'Take a cold shower', freq: 'daily' }
      ]
    }
  ];

  // ========== DATE HELPERS ==========

  var currentDate;

  function todayStr() {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
  }

  function parseDate(str) {
    var parts = str.split('-');
    return new Date(+parts[0], +parts[1] - 1, +parts[2], 12, 0, 0);
  }

  function formatDate(str) {
    return parseDate(str).toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric'
    });
  }

  function readingsUrl(dateStr) {
    var p = dateStr.split('-');
    return 'https://bible.usccb.org/bible/readings/' + p[1] + p[2] + p[0].slice(2) + '.cfm';
  }

  // ========== PREFERENCES ==========

  function loadPrefs() {
    try { return JSON.parse(localStorage.getItem(PREFS_KEY)) || {}; }
    catch (e) { return {}; }
  }

  function loadPrefsUpdatedAt() {
    return parseInt(localStorage.getItem(PREFS_UPDATED_KEY) || '0', 10) || 0;
  }

  function savePrefsUpdatedAt(updatedAt) {
    localStorage.setItem(PREFS_UPDATED_KEY, String(updatedAt || 0));
  }

  function savePrefs(prefs, updatedAt) {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    if (typeof updatedAt === 'number') {
      savePrefsUpdatedAt(updatedAt);
    }
  }

  function setPrefsAndSync(prefs) {
    var updatedAt = Date.now();
    savePrefs(prefs, updatedAt);
    syncPrefsToServer(updatedAt);
  }

  function isItemEnabledFor(prefs, item) {
    if (prefs.hasOwnProperty(item.id)) return prefs[item.id];
    return !item.optional;
  }

  function isItemEnabled(itemId, item) {
    return isItemEnabledFor(loadPrefs(), item);
  }

  // ========== ITEM VISIBILITY ==========

  function shouldShow(item, dateStr) {
    return isItemEnabled(item.id, item) && Cal.applies(item.freq, dateStr);
  }

  // ========== AUTH ==========

  function getToken() { return localStorage.getItem(TOKEN_KEY); }
  function getUsername() { return localStorage.getItem(USERNAME_KEY); }
  function isLoggedIn() { return !!getToken(); }

  function setAuth(token, username) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USERNAME_KEY, username);
  }

  function clearAuth() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USERNAME_KEY);
  }

  // ========== LOCALSTORAGE ==========

  function loadData() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; }
    catch (e) { return {}; }
  }

  function saveData(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  function loadNotes() {
    try { return JSON.parse(localStorage.getItem(NOTES_KEY)) || {}; }
    catch (e) { return {}; }
  }

  function loadTimestamps() {
    try { return JSON.parse(localStorage.getItem(TIMESTAMPS_KEY)) || {}; }
    catch (e) { return {}; }
  }

  function saveTimestamps(ts) {
    localStorage.setItem(TIMESTAMPS_KEY, JSON.stringify(ts));
  }

  function touchTimestamp(dateStr) {
    var ts = loadTimestamps();
    ts[dateStr] = Date.now();
    saveTimestamps(ts);
    return ts[dateStr];
  }

  function isChecked(dateStr, itemId) {
    var data = loadData();
    return !!(data[dateStr] && data[dateStr][itemId]);
  }

  function toggleItem(dateStr, itemId) {
    var data = loadData();
    if (!data[dateStr]) data[dateStr] = {};
    data[dateStr][itemId] = !data[dateStr][itemId];
    if (!data[dateStr][itemId]) delete data[dateStr][itemId];
    if (Object.keys(data[dateStr]).length === 0) delete data[dateStr];
    saveData(data);
    var updatedAt = touchTimestamp(dateStr);
    syncDateToServer(dateStr, updatedAt);
    return !!(data[dateStr] && data[dateStr][itemId]);
  }

  function weeklyCount(itemId, dateStr) {
    var dates = Cal.weekOf(dateStr);
    var data = loadData();
    var count = 0;
    for (var i = 0; i < dates.length; i++) {
      if (data[dates[i]] && data[dates[i]][itemId]) count++;
    }
    return count;
  }

  function getNote(dateStr) {
    return loadNotes()[dateStr] || '';
  }

  function saveNote(dateStr, text) {
    var notes = loadNotes();
    if (text) {
      notes[dateStr] = text;
    } else {
      delete notes[dateStr];
    }
    localStorage.setItem(NOTES_KEY, JSON.stringify(notes));
    var updatedAt = touchTimestamp(dateStr);
    syncDateToServer(dateStr, updatedAt);
  }

  // ========== SERVER SYNC ==========

  function apiRequest(endpoint, options) {
    var token = getToken();
    if (!token) return Promise.resolve(null);
    var opts = options || {};
    if (!opts.headers) opts.headers = {};
    opts.headers['Authorization'] = 'Bearer ' + token;
    if (opts.body && !opts.headers['Content-Type']) {
      opts.headers['Content-Type'] = 'application/json';
    }
    return fetch(API_BASE + '/' + endpoint, opts)
      .then(function (r) {
        if (r.status === 401) {
          clearAuth();
          renderAccountUI();
          return null;
        }
        return r.json();
      })
      .catch(function () { return null; });
  }

  function syncDateToServer(dateStr, updatedAt) {
    if (!isLoggedIn()) return;
    var data = loadData();
    var notes = loadNotes();
    apiRequest('data.php', {
      method: 'POST',
      body: JSON.stringify({
        date_str: dateStr,
        items: data[dateStr] || {},
        note: notes[dateStr] || '',
        updated_at: updatedAt
      })
    });
  }

  function syncPrefsToServer(updatedAt) {
    if (!isLoggedIn()) return;
    apiRequest('prefs.php', {
      method: 'POST',
      body: JSON.stringify({
        prefs: loadPrefs(),
        updated_at: updatedAt || loadPrefsUpdatedAt()
      })
    });
  }

  function syncPrefsFromServer() {
    if (!isLoggedIn()) return Promise.resolve();
    return apiRequest('prefs.php', { method: 'GET' })
      .then(function (result) {
        if (!result) return;
        var localPrefs = loadPrefs();
        var localUpdated = loadPrefsUpdatedAt();
        var serverUpdated = typeof result.updated_at === 'number' ? result.updated_at : 0;
        var serverPrefs = (result.prefs && typeof result.prefs === 'object') ? result.prefs : {};

        if (!localUpdated && Object.keys(localPrefs).length > 0 && !serverUpdated) {
          localUpdated = Date.now();
          savePrefs(localPrefs, localUpdated);
        }

        if (serverUpdated > localUpdated) {
          savePrefs(serverPrefs, serverUpdated);
          render();
          renderSettingsUI();
        } else if (localUpdated > serverUpdated) {
          syncPrefsToServer(localUpdated);
        }
      });
  }

  function syncFromServer() {
    if (!isLoggedIn()) return Promise.resolve();
    return apiRequest('data.php', { method: 'GET' })
      .then(function (result) {
        if (!result || !result.data) return;
        var localData = loadData();
        var localNotes = loadNotes();
        var localTs = loadTimestamps();
        var serverRows = result.data;
        var pushDates = [];

        for (var i = 0; i < serverRows.length; i++) {
          var row = serverRows[i];
          var ds = row.date_str;
          var serverUpdated = row.updated_at;
          var localUpdated = localTs[ds] || 0;

          if (serverUpdated > localUpdated) {
            if (row.items && typeof row.items === 'object' && Object.keys(row.items).length > 0) {
              localData[ds] = row.items;
            } else {
              delete localData[ds];
            }
            if (row.note) {
              localNotes[ds] = row.note;
            } else {
              delete localNotes[ds];
            }
            localTs[ds] = serverUpdated;
          } else if (localUpdated > serverUpdated) {
            pushDates.push(ds);
          }
        }

        var serverDateSet = {};
        for (var j = 0; j < serverRows.length; j++) {
          serverDateSet[serverRows[j].date_str] = true;
        }
        var allLocalDates = Object.keys(localTs);
        for (var k = 0; k < allLocalDates.length; k++) {
          if (!serverDateSet[allLocalDates[k]]) {
            pushDates.push(allLocalDates[k]);
          }
        }

        saveData(localData);
        localStorage.setItem(NOTES_KEY, JSON.stringify(localNotes));
        saveTimestamps(localTs);

        for (var p = 0; p < pushDates.length; p++) {
          syncDateToServer(pushDates[p], localTs[pushDates[p]]);
        }
      })
      .then(function () {
        return syncPrefsFromServer();
      });
  }

  // ========== DOM HELPERS ==========

  function el(tag, attrs, children) {
    var e = document.createElement(tag);
    if (attrs) {
      for (var k in attrs) {
        if (k === 'className') e.className = attrs[k];
        else if (k === 'textContent') e.textContent = attrs[k];
        else if (k === 'innerHTML') e.innerHTML = attrs[k];
        else if (k === 'hidden') e.hidden = attrs[k];
        else e.setAttribute(k, attrs[k]);
      }
    }
    if (children) {
      for (var i = 0; i < children.length; i++) {
        if (typeof children[i] === 'string') e.appendChild(document.createTextNode(children[i]));
        else if (children[i]) e.appendChild(children[i]);
      }
    }
    return e;
  }

  // ========== RENDERING ==========

  function render() {
    var main = document.getElementById('checklist');
    var dateEl = document.getElementById('current-date');
    var dayEl = document.getElementById('lent-day');
    var todayBtn = document.getElementById('today-btn');
    var prevBtn = document.getElementById('prev-day');

    var isToday = (currentDate === todayStr());

    dateEl.textContent = formatDate(currentDate);
    var season = Cal.season(currentDate);
    dayEl.textContent = season.name + ' \u2013 Day ' + season.day + ' of ' + season.length;

    var todayIndicator = document.getElementById('today-indicator');
    todayIndicator.hidden = !isToday;
    todayBtn.hidden = isToday;
    prevBtn.disabled = (currentDate <= Cal.EPOCH);

    main.innerHTML = '';
    var totalItems = 0;
    var checkedItems = 0;

    for (var c = 0; c < CATEGORIES.length; c++) {
      var cat = CATEGORIES[c];
      var visible = [];
      for (var j = 0; j < cat.items.length; j++) {
        if (shouldShow(cat.items[j], currentDate)) visible.push(cat.items[j]);
      }
      if (visible.length === 0) continue;

      var section = el('section', { className: 'category' });
      var hdr = el('div', { className: 'category-header' }, [
        el('span', { className: 'category-icon', textContent: cat.icon }),
        el('div', { className: 'category-heading' }, [
          el('h2', { textContent: cat.name }),
          el('span', { className: 'category-meta', textContent: visible.length + ' disciplines' })
        ])
      ]);
      section.appendChild(hdr);

      for (var k = 0; k < visible.length; k++) {
        var item = visible[k];
        var checked = isChecked(currentDate, item.id);
        if (checked) checkedItems++;
        totalItems++;
        section.appendChild(buildItemRow(item, checked));
      }

      main.appendChild(section);
    }

    updateProgress(checkedItems, totalItems);

    if (totalItems > 0 && checkedItems === totalItems) {
      main.appendChild(el('div', { className: 'all-done', textContent: 'All disciplines kept today. Well done.' }));
    }

    var notesSection = el('section', { className: 'notes-section' });
    var notesLabel = el('label', { className: 'notes-label', textContent: 'Notes' });
    notesLabel.setAttribute('for', 'daily-notes');
    var textarea = el('textarea', {
      id: 'daily-notes',
      className: 'notes-textarea',
      placeholder: 'Add a note about your day\u2026'
    });
    textarea.value = getNote(currentDate);
    var debounceTimer;
    textarea.addEventListener('input', function () {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(function () {
        saveNote(currentDate, textarea.value);
      }, 400);
    });
    notesSection.appendChild(notesLabel);
    notesSection.appendChild(textarea);
    main.appendChild(notesSection);

  }

  function buildItemRow(item, checked) {
    var row = el('label', { className: 'item' + (checked ? ' checked' : '') });

    var cb = el('input', { type: 'checkbox' });
    cb.checked = checked;
    cb.addEventListener('change', function () {
      var newState = toggleItem(currentDate, item.id);
      row.classList.toggle('checked', newState);
      recalcProgress();
      if (item.freq === 'weekly') {
        var count = weeklyCount(item.id, currentDate);
        var goal = item.weeklyGoal || 1;
        badge.textContent = item.weeklyGoal
          ? count + '/' + goal + ' this week'
          : (count > 0 ? '\u2713 this week' : 'this week');
        badge.className = 'weekly-badge' + (count >= goal ? ' complete' : '');
      }
    });

    var textDiv = el('div', { className: 'item-text' });
    textDiv.appendChild(el('span', { className: 'item-label', textContent: item.label }));

    var hintText = item.hint || defaultItemHint(item);
    if (hintText) {
      textDiv.appendChild(el('span', { className: 'item-hint', textContent: hintText }));
    }

    if (item.id === 'prayer-readings') {
      var link = el('a', {
        className: 'readings-link',
        href: readingsUrl(currentDate),
        textContent: 'Open today\u2019s readings \u2197',
        target: '_blank',
        rel: 'noopener'
      });
      textDiv.appendChild(link);
    }

    if (item.freq === 'weekly') {
      var count = weeklyCount(item.id, currentDate);
      var goal = item.weeklyGoal || 1;
      var badgeText = item.weeklyGoal
        ? count + '/' + goal + ' this week'
        : (count > 0 ? '\u2713 this week' : 'this week');
      var badge = el('span', {
        className: 'weekly-badge' + (count >= goal ? ' complete' : ''),
        textContent: badgeText
      });
      textDiv.appendChild(badge);
    }

    if (item.expandable && item.details) {
      var detailsDiv = el('div', { className: 'item-details', hidden: true });
      for (var i = 0; i < item.details.length; i++) {
        detailsDiv.appendChild(el('p', {
          innerHTML: '<strong>' + item.details[i].heading + ':</strong> ' + item.details[i].list
        }));
      }

      var toggle = el('button', {
        className: 'details-toggle',
        textContent: 'Show examples',
        type: 'button'
      });
      toggle.addEventListener('click', (function (dDiv, tBtn) {
        return function (e) {
          e.preventDefault();
          e.stopPropagation();
          dDiv.hidden = !dDiv.hidden;
          tBtn.textContent = dDiv.hidden ? 'Show examples' : 'Hide examples';
        };
      })(detailsDiv, toggle));

      textDiv.appendChild(toggle);
      textDiv.appendChild(detailsDiv);
    }

    row.appendChild(cb);
    row.appendChild(textDiv);
    return row;
  }

  function updateProgress(checked, total) {
    var fill = document.getElementById('progress-fill');
    var text = document.getElementById('progress-text');
    var pct = total > 0 ? checked / total : 0;
    var circumference = 2 * Math.PI * 15.5;
    fill.style.strokeDasharray = circumference;
    fill.style.strokeDashoffset = circumference * (1 - pct);
    text.textContent = checked + ' / ' + total + ' disciplines';
  }

  function defaultItemHint(item) {
    switch (item.freq) {
      case 'weekly':
        return item.weeklyGoal ? item.weeklyGoal + ' times this week' : 'Weekly discipline';
      case 'sunday':
        return 'Sunday discipline';
      case 'fasting':
        return 'Friday fast';
      case 'abstinence':
        return 'Friday abstinence';
      default:
        return '';
    }
  }

  function recalcProgress() {
    var boxes = document.querySelectorAll('#checklist input[type="checkbox"]');
    var total = boxes.length;
    var checked = 0;
    for (var i = 0; i < boxes.length; i++) {
      if (boxes[i].checked) checked++;
    }
    updateProgress(checked, total);

    var allDone = document.querySelector('.all-done');
    if (checked === total && total > 0) {
      if (!allDone) {
        document.getElementById('checklist').appendChild(
          el('div', { className: 'all-done', textContent: 'All disciplines kept today. Well done.' })
        );
      }
    } else if (allDone) {
      allDone.remove();
    }
  }

  // ========== ACCOUNT UI ==========

  function renderAccountUI() {
    var container = document.getElementById('account-section');
    container.innerHTML = '';

    if (isLoggedIn()) {
      var info = el('div', { className: 'account-info' }, [
        el('span', { textContent: 'Signed in as ' }),
        el('strong', { textContent: getUsername() })
      ]);
      var signOutBtn = el('button', {
        className: 'account-btn sign-out-btn',
        textContent: 'Sign out',
        type: 'button'
      });
      signOutBtn.addEventListener('click', function () {
        apiRequest('logout.php', { method: 'POST' });
        clearAuth();
        renderAccountUI();
        renderAnchorsUI();
      });
      container.appendChild(info);
      container.appendChild(signOutBtn);
    } else {
      var toggleLink = el('button', {
        className: 'account-toggle',
        textContent: 'Sign in to sync across devices',
        type: 'button'
      });
      var formContainer = el('div', { className: 'account-form-container', hidden: true });

      toggleLink.addEventListener('click', function () {
        formContainer.hidden = !formContainer.hidden;
        toggleLink.textContent = formContainer.hidden
          ? 'Sign in to sync across devices'
          : 'Cancel';
      });

      var isRegister = false;
      var errorMsg = el('div', { className: 'account-error', hidden: true });
      var usernameInput = el('input', {
        type: 'email',
        className: 'account-input',
        placeholder: 'Email address',
        autocomplete: 'email'
      });
      var passwordInput = el('input', {
        type: 'password',
        className: 'account-input',
        placeholder: 'Password',
        autocomplete: 'current-password'
      });
      var submitBtn = el('button', {
        className: 'account-btn',
        textContent: 'Sign in',
        type: 'button'
      });
      var switchLink = el('button', {
        className: 'account-switch',
        textContent: "Don\u2019t have an account? Register",
        type: 'button'
      });

      switchLink.addEventListener('click', function () {
        isRegister = !isRegister;
        submitBtn.textContent = isRegister ? 'Create account' : 'Sign in';
        switchLink.textContent = isRegister
          ? 'Already have an account? Sign in'
          : "Don\u2019t have an account? Register";
        passwordInput.setAttribute('autocomplete', isRegister ? 'new-password' : 'current-password');
        errorMsg.hidden = true;
        if (forgotLink) forgotLink.style.display = isRegister ? 'none' : '';
      });

      function doSubmit() {
        var username = usernameInput.value.trim();
        var password = passwordInput.value;
        if (!username || !password) {
          errorMsg.textContent = 'Email and password are required.';
          errorMsg.hidden = false;
          return;
        }
        if (username.indexOf('@') === -1) {
          errorMsg.textContent = 'Please enter a valid email address.';
          errorMsg.hidden = false;
          return;
        }
        if (isRegister && password.length < 6) {
          errorMsg.textContent = 'Password must be at least 6 characters.';
          errorMsg.hidden = false;
          return;
        }
        submitBtn.disabled = true;
        submitBtn.textContent = isRegister ? 'Creating\u2026' : 'Signing in\u2026';
        errorMsg.hidden = true;

        var endpoint = isRegister ? 'register.php' : 'login.php';
        var body = { username: username, password: password };

        if (isRegister) {
          var prefs = loadPrefs();
          var prefsUpdatedAt = loadPrefsUpdatedAt();
          if (Object.keys(prefs).length > 0 && !prefsUpdatedAt) {
            prefsUpdatedAt = Date.now();
            savePrefs(prefs, prefsUpdatedAt);
          }
          body.checklist = loadData();
          body.notes = loadNotes();
          body.prefs = prefs;
          body.prefs_updated_at = prefsUpdatedAt;
        }

        fetch(API_BASE + '/' + endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        })
        .then(function (r) { return r.json(); })
        .then(function (result) {
          if (result.error) {
            errorMsg.textContent = result.error;
            errorMsg.hidden = false;
            submitBtn.disabled = false;
            submitBtn.textContent = isRegister ? 'Create account' : 'Sign in';
            return;
          }
          setAuth(result.token, result.username);

          if (isRegister) {
            var ts = loadTimestamps();
            var now = Date.now();
            var data = loadData();
            var notes = loadNotes();
            var prefs = loadPrefs();
            var allDates = Object.keys(data).concat(Object.keys(notes));
            for (var i = 0; i < allDates.length; i++) {
              if (!ts[allDates[i]]) ts[allDates[i]] = now;
            }
            saveTimestamps(ts);
            if (Object.keys(prefs).length > 0 && !loadPrefsUpdatedAt()) {
              savePrefsUpdatedAt(now);
            }
          }

          syncFromServer().then(function () {
            render();
            renderAccountUI();
            renderAnchorsUI();
          });
        })
        .catch(function () {
          errorMsg.textContent = 'Connection failed. Try again.';
          errorMsg.hidden = false;
          submitBtn.disabled = false;
          submitBtn.textContent = isRegister ? 'Create account' : 'Sign in';
        });
      }

      // Forgot password link
      var forgotLink = el('button', {
        className: 'account-switch',
        textContent: 'Forgot password?',
        type: 'button'
      });
      var forgotContainer = el('div', { className: 'forgot-container', hidden: true });
      var forgotError = el('div', { className: 'account-error', hidden: true });
      var forgotSuccess = el('div', { className: 'account-success', hidden: true });
      var forgotEmail = el('input', {
        type: 'email',
        className: 'account-input',
        placeholder: 'Email address',
        autocomplete: 'email'
      });
      var forgotBtn = el('button', {
        className: 'account-btn',
        textContent: 'Send reset link',
        type: 'button'
      });
      var forgotBack = el('button', {
        className: 'account-switch',
        textContent: 'Back to sign in',
        type: 'button'
      });

      forgotLink.addEventListener('click', function () {
        forgotContainer.hidden = false;
        errorMsg.hidden = true;
        usernameInput.style.display = 'none';
        passwordInput.style.display = 'none';
        submitBtn.style.display = 'none';
        switchLink.style.display = 'none';
        forgotLink.style.display = 'none';
      });

      forgotBack.addEventListener('click', function () {
        forgotContainer.hidden = true;
        forgotError.hidden = true;
        forgotSuccess.hidden = true;
        usernameInput.style.display = '';
        passwordInput.style.display = '';
        submitBtn.style.display = '';
        switchLink.style.display = '';
        forgotLink.style.display = '';
      });

      function doForgot() {
        var email = forgotEmail.value.trim();
        if (!email || email.indexOf('@') === -1) {
          forgotError.textContent = 'Please enter a valid email address.';
          forgotError.hidden = false;
          forgotSuccess.hidden = true;
          return;
        }
        forgotBtn.disabled = true;
        forgotBtn.textContent = 'Sending\u2026';
        forgotError.hidden = true;
        forgotSuccess.hidden = true;

        fetch(API_BASE + '/forgot-password.php', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: email })
        })
        .then(function (r) { return r.json(); })
        .then(function () {
          forgotSuccess.textContent = 'If an account exists with that email, a reset link has been sent. Check your inbox.';
          forgotSuccess.hidden = false;
          forgotBtn.disabled = false;
          forgotBtn.textContent = 'Send reset link';
        })
        .catch(function () {
          forgotError.textContent = 'Connection failed. Try again.';
          forgotError.hidden = false;
          forgotBtn.disabled = false;
          forgotBtn.textContent = 'Send reset link';
        });
      }

      forgotBtn.addEventListener('click', doForgot);
      forgotEmail.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') doForgot();
      });

      forgotContainer.appendChild(forgotError);
      forgotContainer.appendChild(forgotSuccess);
      forgotContainer.appendChild(forgotEmail);
      forgotContainer.appendChild(forgotBtn);
      forgotContainer.appendChild(forgotBack);

      submitBtn.addEventListener('click', doSubmit);
      passwordInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') doSubmit();
      });
      usernameInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') passwordInput.focus();
      });

      formContainer.appendChild(errorMsg);
      formContainer.appendChild(usernameInput);
      formContainer.appendChild(passwordInput);
      formContainer.appendChild(submitBtn);
      formContainer.appendChild(forgotLink);
      formContainer.appendChild(switchLink);
      formContainer.appendChild(forgotContainer);

      container.appendChild(toggleLink);
      container.appendChild(formContainer);
    }
  }

  // ========== RESET PASSWORD UI ==========

  function checkResetToken() {
    var params = new URLSearchParams(window.location.search);
    var token = params.get('reset');
    if (!token) return;

    // Clean the URL
    history.replaceState(null, '', window.location.pathname);

    document.body.classList.add('modal-open');

    var overlay = el('div', { className: 'modal-overlay reset-modal-overlay' });
    var modal = el('div', { className: 'modal-card account-form-container', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'reset-modal-title' });
    var modalIntro = el('p', {
      className: 'modal-kicker',
      textContent: 'Password Recovery'
    });
    var heading = el('div', { className: 'reset-heading', textContent: 'Set a new password' });
    heading.id = 'reset-modal-title';
    var errorMsg = el('div', { className: 'account-error', hidden: true });
    var successMsg = el('div', { className: 'account-success', hidden: true });
    var passwordInput = el('input', {
      type: 'password',
      className: 'account-input',
      placeholder: 'New password (6+ characters)',
      autocomplete: 'new-password'
    });
    var confirmInput = el('input', {
      type: 'password',
      className: 'account-input',
      placeholder: 'Confirm new password',
      autocomplete: 'new-password'
    });
    var submitBtn = el('button', {
      className: 'account-btn',
      textContent: 'Reset password',
      type: 'button'
    });

    function closeResetModal() {
      document.body.classList.remove('modal-open');
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    }

    function doReset() {
      var password = passwordInput.value;
      var confirm = confirmInput.value;
      if (password.length < 6) {
        errorMsg.textContent = 'Password must be at least 6 characters.';
        errorMsg.hidden = false;
        return;
      }
      if (password !== confirm) {
        errorMsg.textContent = 'Passwords do not match.';
        errorMsg.hidden = false;
        return;
      }
      submitBtn.disabled = true;
      submitBtn.textContent = 'Resetting\u2026';
      errorMsg.hidden = true;

      fetch(API_BASE + '/reset-password.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token, password: password })
      })
      .then(function (r) { return r.json(); })
      .then(function (result) {
        if (result.error) {
          errorMsg.textContent = result.error;
          errorMsg.hidden = false;
          submitBtn.disabled = false;
          submitBtn.textContent = 'Reset password';
          return;
        }
        successMsg.textContent = 'Password reset successfully. You can now sign in.';
        successMsg.hidden = false;
        passwordInput.style.display = 'none';
        confirmInput.style.display = 'none';
        submitBtn.style.display = 'none';

        // Show a link back to sign-in
        var signInBtn = el('button', {
          className: 'account-btn',
          textContent: 'Sign in',
          type: 'button'
        });
        signInBtn.addEventListener('click', function () {
          closeResetModal();
          renderAccountUI();
          var container = document.getElementById('account-section');
          var toggle = container.querySelector('.account-toggle');
          if (toggle) toggle.click();
        });
        modal.appendChild(signInBtn);
      })
      .catch(function () {
        errorMsg.textContent = 'Connection failed. Try again.';
        errorMsg.hidden = false;
        submitBtn.disabled = false;
        submitBtn.textContent = 'Reset password';
      });
    }

    submitBtn.addEventListener('click', doReset);
    confirmInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') doReset();
    });
    passwordInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') confirmInput.focus();
    });

    modal.appendChild(modalIntro);
    modal.appendChild(heading);
    modal.appendChild(errorMsg);
    modal.appendChild(successMsg);
    modal.appendChild(passwordInput);
    modal.appendChild(confirmInput);
    modal.appendChild(submitBtn);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    passwordInput.focus();
  }

  // ========== SETTINGS UI ==========

  function renderSettingsUI() {
    var container = document.getElementById('settings-section');
    container.innerHTML = '';

    var toggleLink = el('button', {
      className: 'settings-toggle',
      textContent: 'Customize your disciplines',
      type: 'button'
    });
    var panel = el('div', { className: 'settings-panel', hidden: true });

    toggleLink.addEventListener('click', function () {
      panel.hidden = !panel.hidden;
      toggleLink.textContent = panel.hidden
        ? 'Customize your disciplines'
        : 'Done customizing';
    });

    var prefs = loadPrefs();

    for (var c = 0; c < CATEGORIES.length; c++) {
      var cat = CATEGORIES[c];
      var catSection = el('div', { className: 'settings-category' });
      catSection.appendChild(el('div', { className: 'settings-category-header' }, [
        el('span', { textContent: cat.icon + ' ' }),
        el('strong', { textContent: cat.name })
      ]));

      for (var j = 0; j < cat.items.length; j++) {
        var item = cat.items[j];
        var enabled = prefs.hasOwnProperty(item.id) ? prefs[item.id] : !item.optional;

        var row = el('label', { className: 'settings-item' });
        var toggle = el('input', { type: 'checkbox' });
        toggle.checked = enabled;

        (function (itemId) {
          toggle.addEventListener('change', function () {
            var p = loadPrefs();
            p[itemId] = this.checked;
            setPrefsAndSync(p);
            render();
          });
        })(item.id);

        var labelSpan = el('span', { className: 'settings-item-label', textContent: item.label });
        if (item.optional) {
          labelSpan.appendChild(el('span', { className: 'settings-optional-badge', textContent: ' optional' }));
        }

        row.appendChild(toggle);
        row.appendChild(labelSpan);
        catSection.appendChild(row);
      }

      panel.appendChild(catSection);
    }

    container.appendChild(toggleLink);
    container.appendChild(panel);
  }

  // ========== ANCHORS UI ==========

  function renderAnchorsUI() {
    var container = document.getElementById('anchors-section');
    if (!container) return;
    container.innerHTML = '';

    if (!isLoggedIn()) {
      return;
    }

    var toggleLink = el('button', {
      className: 'settings-toggle anchors-toggle',
      type: 'button'
    });
    var toggleLabel = el('span', { textContent: 'Brother accountability' });
    var badge = el('span', { className: 'anchors-badge', hidden: true });
    toggleLink.appendChild(toggleLabel);
    toggleLink.appendChild(badge);

    var panel = el('div', { className: 'settings-panel anchors-panel', hidden: true });

    toggleLink.addEventListener('click', function () {
      panel.hidden = !panel.hidden;
      toggleLabel.textContent = panel.hidden ? 'Brother accountability' : 'Done';
      if (!panel.hidden) {
        refreshAnchors(panel, badge, toggleLabel);
      }
    });

    container.appendChild(toggleLink);
    container.appendChild(panel);

    // Always fetch once on render so the badge reflects pending invites
    // even before the user opens the panel.
    fetchAnchors().then(function (result) {
      updateBadge(badge, result);
    });
  }

  function updateBadge(badge, result) {
    if (!badge) return;
    var incoming = (result && result.incoming) ? result.incoming.length : 0;
    if (incoming > 0) {
      badge.textContent = String(incoming);
      badge.hidden = false;
    } else {
      badge.textContent = '';
      badge.hidden = true;
    }
  }

  function fetchAnchors() {
    return apiRequest('anchors.php', { method: 'GET' });
  }

  function refreshAnchors(panel, badge, toggleLabel) {
    panel.innerHTML = '';
    panel.appendChild(el('div', { className: 'anchors-loading', textContent: 'Loading…' }));

    fetchAnchors().then(function (result) {
      panel.innerHTML = '';
      if (!result) {
        panel.appendChild(el('div', { className: 'account-error', textContent: 'Could not load brothers.' }));
        return;
      }
      updateBadge(badge, result);

      if (result.incoming && result.incoming.length > 0) {
        var incSection = el('div', { className: 'anchors-section-block' });
        incSection.appendChild(el('div', { className: 'settings-category-header', textContent: 'Invites for you' }));
        for (var i = 0; i < result.incoming.length; i++) {
          incSection.appendChild(buildIncomingRow(result.incoming[i], panel, badge, toggleLabel));
        }
        panel.appendChild(incSection);
      }

      if (result.pairs && result.pairs.length > 0) {
        var pairsSection = el('div', { className: 'anchors-section-block' });
        pairsSection.appendChild(el('div', { className: 'settings-category-header', textContent: 'Your brothers' }));
        for (var j = 0; j < result.pairs.length; j++) {
          pairsSection.appendChild(buildAnchorCard(result.pairs[j], panel, badge, toggleLabel));
        }
        panel.appendChild(pairsSection);
      } else if (!result.incoming || result.incoming.length === 0) {
        panel.appendChild(el('p', {
          className: 'anchors-empty',
          textContent: 'You don’t have any brothers yet. Invite a brother below.'
        }));
      }

      if (result.outgoing && result.outgoing.length > 0) {
        var outSection = el('div', { className: 'anchors-section-block' });
        outSection.appendChild(el('div', { className: 'settings-category-header', textContent: 'Pending invites you sent' }));
        for (var k = 0; k < result.outgoing.length; k++) {
          outSection.appendChild(buildOutgoingRow(result.outgoing[k], panel, badge, toggleLabel));
        }
        panel.appendChild(outSection);
      }

      panel.appendChild(buildInviteForm(panel, badge, toggleLabel));
    });
  }

  function buildAnchorCard(pair, panel, badge, toggleLabel) {
    var card = el('div', { className: 'anchor-card' });

    var prefs = (pair.prefs && typeof pair.prefs === 'object') ? pair.prefs : {};
    var dateStr = pair.today.date_str;
    var anchorItems = (pair.today.items && typeof pair.today.items === 'object') ? pair.today.items : {};

    var totalItems = 0;
    var checkedItems = 0;
    var categoryNodes = [];

    for (var c = 0; c < CATEGORIES.length; c++) {
      var cat = CATEGORIES[c];
      var visible = [];
      for (var j = 0; j < cat.items.length; j++) {
        var item = cat.items[j];
        if (!isItemEnabledFor(prefs, item)) continue;
        if (!Cal.applies(item.freq, dateStr)) continue;
        visible.push(item);
      }
      if (visible.length === 0) continue;

      var catSection = el('div', { className: 'anchor-category' });
      catSection.appendChild(el('div', { className: 'anchor-category-header' }, [
        el('span', { className: 'anchor-category-icon', textContent: cat.icon }),
        el('span', { className: 'anchor-category-name', textContent: cat.name })
      ]));

      for (var k = 0; k < visible.length; k++) {
        var it = visible[k];
        var checked = !!anchorItems[it.id];
        if (checked) checkedItems++;
        totalItems++;
        var row = el('div', { className: 'anchor-item' + (checked ? ' checked' : '') }, [
          el('span', { className: 'anchor-check', textContent: checked ? '✓' : '·' }),
          el('span', { className: 'anchor-item-label', textContent: it.label })
        ]);
        catSection.appendChild(row);
      }
      categoryNodes.push(catSection);
    }

    var header = el('div', { className: 'anchor-card-header' }, [
      el('strong', { className: 'anchor-username', textContent: pair.username }),
      el('span', { className: 'anchor-card-meta', textContent: checkedItems + ' / ' + totalItems + ' today' })
    ]);
    card.appendChild(header);

    var subHeader = el('div', { className: 'anchor-card-subheader', textContent: formatDate(dateStr) });
    card.appendChild(subHeader);

    if (totalItems === 0) {
      card.appendChild(el('p', { className: 'anchors-empty', textContent: 'No disciplines configured for today.' }));
    } else {
      for (var n = 0; n < categoryNodes.length; n++) {
        card.appendChild(categoryNodes[n]);
      }
    }

    var actions = el('div', { className: 'anchor-card-actions' });
    var refreshBtn = el('button', { className: 'account-switch', type: 'button', textContent: 'Refresh' });
    refreshBtn.addEventListener('click', function () { refreshAnchors(panel, badge, toggleLabel); });
    var removeBtn = el('button', { className: 'account-switch anchor-remove-btn', type: 'button', textContent: 'Remove' });
    removeBtn.addEventListener('click', function () {
      if (!confirm('Remove ' + pair.username + ' as a brother? Neither of you will see each other’s progress anymore.')) return;
      apiRequest('anchors.php', {
        method: 'POST',
        body: JSON.stringify({ action: 'remove', pair_id: pair.pair_id })
      }).then(function () { refreshAnchors(panel, badge, toggleLabel); });
    });
    actions.appendChild(refreshBtn);
    actions.appendChild(removeBtn);
    card.appendChild(actions);

    return card;
  }

  function buildIncomingRow(inv, panel, badge, toggleLabel) {
    var row = el('div', { className: 'anchor-invite-row' });
    row.appendChild(el('div', { className: 'anchor-invite-label' }, [
      el('strong', { textContent: inv.from_username }),
      el('span', { className: 'anchor-invite-sub', textContent: 'wants you as a brother' })
    ]));
    var actions = el('div', { className: 'anchor-invite-actions' });
    var acceptBtn = el('button', { className: 'account-btn anchor-mini-btn', type: 'button', textContent: 'Accept' });
    var declineBtn = el('button', { className: 'account-switch', type: 'button', textContent: 'Decline' });
    acceptBtn.addEventListener('click', function () {
      acceptBtn.disabled = true;
      apiRequest('anchors.php', {
        method: 'POST',
        body: JSON.stringify({ action: 'accept', invite_id: inv.id })
      }).then(function () { refreshAnchors(panel, badge, toggleLabel); });
    });
    declineBtn.addEventListener('click', function () {
      declineBtn.disabled = true;
      apiRequest('anchors.php', {
        method: 'POST',
        body: JSON.stringify({ action: 'decline', invite_id: inv.id })
      }).then(function () { refreshAnchors(panel, badge, toggleLabel); });
    });
    actions.appendChild(acceptBtn);
    actions.appendChild(declineBtn);
    row.appendChild(actions);
    return row;
  }

  function buildOutgoingRow(inv, panel, badge, toggleLabel) {
    var row = el('div', { className: 'anchor-invite-row' });
    row.appendChild(el('div', { className: 'anchor-invite-label' }, [
      el('strong', { textContent: inv.to_username }),
      el('span', { className: 'anchor-invite-sub', textContent: 'awaiting their acceptance' })
    ]));
    var cancelBtn = el('button', { className: 'account-switch', type: 'button', textContent: 'Cancel' });
    cancelBtn.addEventListener('click', function () {
      cancelBtn.disabled = true;
      apiRequest('anchors.php', {
        method: 'POST',
        body: JSON.stringify({ action: 'cancel', invite_id: inv.id })
      }).then(function () { refreshAnchors(panel, badge, toggleLabel); });
    });
    row.appendChild(cancelBtn);
    return row;
  }

  function buildInviteForm(panel, badge, toggleLabel) {
    var wrapper = el('div', { className: 'anchor-invite-form' });
    wrapper.appendChild(el('div', { className: 'settings-category-header', textContent: 'Invite someone' }));
    var errorMsg = el('div', { className: 'account-error', hidden: true });
    var successMsg = el('div', { className: 'account-success', hidden: true });
    var emailInput = el('input', {
      type: 'email',
      className: 'account-input',
      placeholder: 'Their email address',
      autocomplete: 'email'
    });
    var submitBtn = el('button', { className: 'account-btn', type: 'button', textContent: 'Send invite' });

    function send() {
      var email = emailInput.value.trim();
      errorMsg.hidden = true;
      successMsg.hidden = true;
      if (!email || email.indexOf('@') === -1) {
        errorMsg.textContent = 'Enter a valid email address.';
        errorMsg.hidden = false;
        return;
      }
      submitBtn.disabled = true;
      submitBtn.textContent = 'Sending…';
      apiRequest('anchors.php', {
        method: 'POST',
        body: JSON.stringify({ action: 'invite', to_email: email })
      }).then(function (r) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Send invite';
        if (!r) {
          errorMsg.textContent = 'Network error. Try again.';
          errorMsg.hidden = false;
          return;
        }
        if (r.error) {
          errorMsg.textContent = r.error;
          errorMsg.hidden = false;
          return;
        }
        emailInput.value = '';
        successMsg.textContent = r.accepted_existing
          ? 'Brother added — they had already invited you.'
          : 'Invite sent. They’ll see it next time they open the app.';
        successMsg.hidden = false;
        refreshAnchors(panel, badge, toggleLabel);
      });
    }

    submitBtn.addEventListener('click', send);
    emailInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') send();
    });

    wrapper.appendChild(errorMsg);
    wrapper.appendChild(successMsg);
    wrapper.appendChild(emailInput);
    wrapper.appendChild(submitBtn);
    return wrapper;
  }

  // ========== EVENT HANDLERS ==========

  document.getElementById('prev-day').addEventListener('click', function () {
    if (currentDate > Cal.EPOCH) {
      currentDate = Cal.addDays(currentDate, -1);
      render();
    }
  });

  document.getElementById('next-day').addEventListener('click', function () {
    currentDate = Cal.addDays(currentDate, 1);
    render();
  });

  document.getElementById('today-btn').addEventListener('click', function () {
    currentDate = clampToEpoch(todayStr());
    render();
  });

  // ========== SERVICE WORKER ==========

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js');
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      location.reload();
    });
  }

  // ========== INIT ==========

  function clampToEpoch(dateStr) {
    return dateStr < Cal.EPOCH ? Cal.EPOCH : dateStr;
  }

  currentDate = clampToEpoch(todayStr());
  render();
  renderSettingsUI();
  renderAccountUI();
  renderAnchorsUI();
  checkResetToken();

  if (isLoggedIn()) {
    syncFromServer().then(function () {
      render();
    });
  }
})();

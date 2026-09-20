(function () {
  'use strict';

  // Only runs under the Capacitor Android shell.
  if (!window.Capacitor || !window.Capacitor.isNativePlatform || !window.Capacitor.isNativePlatform()) {
    return;
  }

  var PREF_ENABLED = 'horarium-notif-enabled';
  var PREF_TIME = 'horarium-notif-time';
  var DEFAULT_TIME = '07:00';
  var NOTIFICATION_ID = 1;

  // One-time migration from pre-rename localStorage keys
  (function migrateNotifPrefs() {
    if (localStorage.getItem(PREF_ENABLED) === null) {
      var old = localStorage.getItem('exodus40lite-notif-enabled');
      if (old !== null) localStorage.setItem(PREF_ENABLED, old);
    }
    if (localStorage.getItem(PREF_TIME) === null) {
      var oldT = localStorage.getItem('exodus40lite-notif-time');
      if (oldT !== null) localStorage.setItem(PREF_TIME, oldT);
    }
  })();

  function getLN() {
    return window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.LocalNotifications;
  }

  function loadPref(key, fallback) {
    var v = localStorage.getItem(key);
    return v === null ? fallback : v;
  }

  function parseTime(value) {
    var m = /^([0-2]?\d):([0-5]\d)$/.exec(value || '');
    if (!m) return { hour: 7, minute: 0 };
    return { hour: parseInt(m[1], 10), minute: parseInt(m[2], 10) };
  }

  async function cancelAll() {
    var LN = getLN();
    if (!LN) return;
    try {
      var pending = await LN.getPending();
      if (pending && pending.notifications && pending.notifications.length) {
        await LN.cancel({ notifications: pending.notifications.map(function (n) { return { id: n.id }; }) });
      }
    } catch (e) { /* ignore */ }
  }

  async function scheduleDaily(timeStr) {
    var LN = getLN();
    if (!LN) return false;
    var t = parseTime(timeStr);
    await cancelAll();
    await LN.schedule({
      notifications: [{
        id: NOTIFICATION_ID,
        title: 'Horarium',
        body: 'Time for your rule of life today.',
        schedule: { on: { hour: t.hour, minute: t.minute }, allowWhileIdle: true },
        smallIcon: 'ic_stat_icon',
        extra: { source: 'daily-reminder' }
      }]
    });
    return true;
  }

  async function ensurePermission() {
    var LN = getLN();
    if (!LN) return false;
    var status = await LN.checkPermissions();
    if (status.display === 'granted') return true;
    var req = await LN.requestPermissions();
    return req.display === 'granted';
  }

  function render() {
    var host = document.getElementById('settings-section');
    if (!host) return;
    if (document.getElementById('notifications-panel')) return;

    var wrap = document.createElement('div');
    wrap.id = 'notifications-panel';
    wrap.className = 'settings-panel notifications-panel';

    var header = document.createElement('div');
    header.className = 'settings-category-header';
    var headerStrong = document.createElement('strong');
    headerStrong.textContent = 'Daily reminder';
    header.appendChild(document.createTextNode('🔔 '));
    header.appendChild(headerStrong);
    wrap.appendChild(header);

    var row = document.createElement('label');
    row.className = 'settings-item';
    var toggle = document.createElement('input');
    toggle.type = 'checkbox';
    toggle.checked = loadPref(PREF_ENABLED, 'false') === 'true';
    var labelSpan = document.createElement('span');
    labelSpan.className = 'settings-item-label';
    labelSpan.textContent = 'Remind me at';
    row.appendChild(toggle);
    row.appendChild(labelSpan);

    var timeInput = document.createElement('input');
    timeInput.type = 'time';
    timeInput.value = loadPref(PREF_TIME, DEFAULT_TIME);
    timeInput.className = 'notifications-time';
    row.appendChild(timeInput);

    wrap.appendChild(row);

    var note = document.createElement('p');
    note.className = 'notifications-note';
    note.textContent = '';
    wrap.appendChild(note);

    host.appendChild(wrap);

    async function apply() {
      if (toggle.checked) {
        var ok = await ensurePermission();
        if (!ok) {
          toggle.checked = false;
          localStorage.setItem(PREF_ENABLED, 'false');
          note.textContent = 'Notification permission denied. Enable it in system settings.';
          return;
        }
        localStorage.setItem(PREF_ENABLED, 'true');
        localStorage.setItem(PREF_TIME, timeInput.value);
        await scheduleDaily(timeInput.value);
        note.textContent = 'Scheduled for ' + timeInput.value + ' every day.';
      } else {
        localStorage.setItem(PREF_ENABLED, 'false');
        await cancelAll();
        note.textContent = '';
      }
    }

    toggle.addEventListener('change', apply);
    timeInput.addEventListener('change', function () {
      if (toggle.checked) apply();
      else localStorage.setItem(PREF_TIME, timeInput.value);
    });

    // OS alarms outlive WebView origin; clear them when the toggle is off.
    if (toggle.checked) {
      scheduleDaily(timeInput.value).catch(function () { /* ignore */ });
      note.textContent = 'Scheduled for ' + timeInput.value + ' every day.';
    } else {
      cancelAll().catch(function () { /* ignore */ });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', render);
  } else {
    // settings-section is populated by app.js's renderSettingsUI; defer a tick
    // so we append after it has mounted.
    setTimeout(render, 0);
  }
})();

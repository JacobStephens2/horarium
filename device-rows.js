(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else if (root) {
    root.HorariumDeviceRows = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  var FIELDS = [
    'checklist',
    'notes',
    'timestamps',
    'disciplineSettings',
    'disciplineSettingsUpdatedAt'
  ];

  var UNBOUND_KEYS = {
    checklist: 'horarium-data',
    notes: 'horarium-notes',
    timestamps: 'horarium-timestamps',
    disciplineSettings: 'horarium-prefs',
    disciplineSettingsUpdatedAt: 'horarium-prefs-updated-at'
  };

  var LEGACY_KEYS = {
    checklist: 'exodus40lite-data',
    notes: 'exodus40lite-notes',
    timestamps: 'exodus40lite-timestamps',
    disciplineSettings: 'exodus40lite-prefs',
    disciplineSettingsUpdatedAt: 'exodus40lite-prefs-updated-at'
  };

  var ASSIGNED_KEY = 'horarium-rows-assigned';

  function emptyRows() {
    return {
      checklist: {},
      notes: {},
      timestamps: {},
      disciplineSettings: {},
      disciplineSettingsUpdatedAt: 0
    };
  }

  function isObjectField(field) {
    return field !== 'disciplineSettingsUpdatedAt';
  }

  function accountKey(account, field) {
    return 'horarium-account:' + encodeURIComponent(account) + ':' + UNBOUND_KEYS[field];
  }

  function storageKey(account, field) {
    if (!account) return UNBOUND_KEYS[field];
    return accountKey(account, field);
  }

  function parseObject(raw) {
    if (raw === null) return {};
    try {
      var value = JSON.parse(raw);
      return value || {};
    } catch (e) {
      return {};
    }
  }

  function createDeviceRows(storage) {
    function read(account) {
      var rows = emptyRows();
      for (var i = 0; i < FIELDS.length; i++) {
        var field = FIELDS[i];
        var raw = storage.getItem(storageKey(account, field));
        if (isObjectField(field)) {
          rows[field] = parseObject(raw);
        } else {
          rows[field] = parseInt(raw || '0', 10) || 0;
        }
      }
      return rows;
    }

    function write(account, patch) {
      for (var i = 0; i < FIELDS.length; i++) {
        var field = FIELDS[i];
        if (!Object.prototype.hasOwnProperty.call(patch, field)) continue;
        var key = storageKey(account, field);
        if (isObjectField(field)) {
          storage.setItem(key, JSON.stringify(patch[field]));
        } else {
          storage.setItem(key, String(patch[field] || 0));
        }
      }
    }

    function migrateLegacyRows() {
      for (var i = 0; i < FIELDS.length; i++) {
        var field = FIELDS[i];
        var unboundKey = UNBOUND_KEYS[field];
        if (storage.getItem(unboundKey) !== null) continue;
        var legacy = storage.getItem(LEGACY_KEYS[field]);
        if (legacy !== null) storage.setItem(unboundKey, legacy);
      }
    }

    function moveUnboundRowsTo(account) {
      for (var i = 0; i < FIELDS.length; i++) {
        var field = FIELDS[i];
        var from = UNBOUND_KEYS[field];
        var to = accountKey(account, field);
        if (storage.getItem(to) === null) {
          var value = storage.getItem(from);
          if (value !== null) storage.setItem(to, value);
        }
        storage.removeItem(from);
        storage.removeItem(LEGACY_KEYS[field]);
      }
    }

    // First run only. Rows already stored under the shared keys belong to
    // `account` when one is signed in, and stay unbound when it is null.
    function assignExistingRows(account) {
      migrateLegacyRows();
      if (storage.getItem(ASSIGNED_KEY) !== null) return;
      if (account) moveUnboundRowsTo(account);
      storage.setItem(ASSIGNED_KEY, '1');
    }

    return {
      assignExistingRows: assignExistingRows,
      read: read,
      write: write
    };
  }

  return { createDeviceRows: createDeviceRows };
});

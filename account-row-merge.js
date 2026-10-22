(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else if (root) {
    root.HorariumAccountRowMerge = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function copyMap(source) {
    var out = {};
    if (!source || typeof source !== 'object') return out;
    var keys = Object.keys(source);
    for (var i = 0; i < keys.length; i++) out[keys[i]] = source[keys[i]];
    return out;
  }

  function hasItems(items) {
    return !!(items && typeof items === 'object' && Object.keys(items).length > 0);
  }

  function uploadBody(dateStr, checklist, notes, timestamps) {
    return {
      date_str: dateStr,
      items: checklist[dateStr] || {},
      note: notes[dateStr] || '',
      updated_at: timestamps[dateStr]
    };
  }

  // Date clocks use JavaScript >, including a numeric string. Discipline
  // settings are the path that counts only a number.
  function mergeDates(local, serverRows) {
    var checklist = copyMap(local && local.checklist);
    var notes = copyMap(local && local.notes);
    var timestamps = copyMap(local && local.timestamps);
    var rows = serverRows || [];
    var push = [];
    var serverDates = {};

    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var dateStr = row.date_str;
      var serverClock = row.updated_at;
      var deviceClock = timestamps[dateStr] || 0;
      serverDates[dateStr] = true;

      if (serverClock > deviceClock) {
        if (hasItems(row.items)) checklist[dateStr] = row.items;
        else delete checklist[dateStr];
        if (row.note) notes[dateStr] = row.note;
        else delete notes[dateStr];
        timestamps[dateStr] = serverClock;
      } else if (deviceClock > serverClock) {
        push.push(uploadBody(dateStr, checklist, notes, timestamps));
      }
    }

    var deviceDates = Object.keys(timestamps);
    for (var k = 0; k < deviceDates.length; k++) {
      if (!serverDates[deviceDates[k]]) {
        push.push(uploadBody(deviceDates[k], checklist, notes, timestamps));
      }
    }

    return {
      checklist: checklist,
      notes: notes,
      timestamps: timestamps,
      push: push
    };
  }

  function numberClock(value) {
    return typeof value === 'number' ? value : 0;
  }

  function mergeDisciplineSettings(localPrefs, localUpdated, server, now) {
    var prefs = copyMap(localPrefs);
    var deviceClock = numberClock(localUpdated);
    var serverClock = server ? numberClock(server.updated_at) : 0;
    var write = false;
    var push = false;

    if (!deviceClock && Object.keys(prefs).length > 0 && !serverClock) {
      deviceClock = now;
      write = true;
    }

    if (serverClock > deviceClock) {
      var serverPrefs = server && server.prefs && typeof server.prefs === 'object' ? server.prefs : {};
      prefs = copyMap(serverPrefs);
      deviceClock = serverClock;
      write = true;
      push = false;
    } else if (deviceClock > serverClock) {
      push = true;
    }

    return {
      disciplineSettings: prefs,
      disciplineSettingsUpdatedAt: deviceClock,
      write: write,
      push: push
    };
  }

  function stampMissingClocks(rows, now) {
    var checklist = copyMap(rows && rows.checklist);
    var notes = copyMap(rows && rows.notes);
    var timestamps = copyMap(rows && rows.timestamps);
    var disciplineSettings = copyMap(rows && rows.disciplineSettings);
    var disciplineSettingsUpdatedAt = (rows && rows.disciplineSettingsUpdatedAt) || 0;
    var named = {};
    var checklistDates = Object.keys(checklist);
    var noteDates = Object.keys(notes);
    var i;

    for (i = 0; i < checklistDates.length; i++) named[checklistDates[i]] = true;
    for (i = 0; i < noteDates.length; i++) named[noteDates[i]] = true;
    var dates = Object.keys(named);
    for (i = 0; i < dates.length; i++) {
      if (!timestamps[dates[i]]) timestamps[dates[i]] = now;
    }
    if (Object.keys(disciplineSettings).length > 0 && !disciplineSettingsUpdatedAt) {
      disciplineSettingsUpdatedAt = now;
    }

    return {
      checklist: checklist,
      notes: notes,
      timestamps: timestamps,
      disciplineSettings: disciplineSettings,
      disciplineSettingsUpdatedAt: disciplineSettingsUpdatedAt
    };
  }

  return {
    mergeDates: mergeDates,
    mergeDisciplineSettings: mergeDisciplineSettings,
    stampMissingClocks: stampMissingClocks
  };
});

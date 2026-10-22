const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  mergeDates,
  mergeDisciplineSettings,
  stampMissingClocks
} = require('./account-row-merge');

describe('dated row merge', function () {
  it('replaces a date when the server clock is greater and does not upload it', function () {
    const local = {
      checklist: { '2026-03-01': { 'prayer-readings': true, 'prayer-holyhour': true } },
      notes: { '2026-03-01': 'device note' },
      timestamps: { '2026-03-01': 100 }
    };
    const serverItems = { 'fasting-fast': true };
    const serverRows = [{
      date_str: '2026-03-01',
      items: serverItems,
      note: 'server note',
      updated_at: 200
    }];

    const merged = mergeDates(local, serverRows);

    assert.deepEqual(merged.checklist, { '2026-03-01': { 'fasting-fast': true } });
    assert.deepEqual(merged.notes, { '2026-03-01': 'server note' });
    assert.deepEqual(merged.timestamps, { '2026-03-01': 200 });
    assert.deepEqual(merged.push, []);
    assert.deepEqual(local.checklist, {
      '2026-03-01': { 'prayer-readings': true, 'prayer-holyhour': true }
    });
    assert.deepEqual(local.notes, { '2026-03-01': 'device note' });
    assert.deepEqual(local.timestamps, { '2026-03-01': 100 });
    assert.notEqual(merged.checklist, local.checklist);
  });

  it('keeps and uploads a date when the device clock is greater', function () {
    const local = {
      checklist: { '2026-03-02': { 'prayer-readings': true } },
      notes: { '2026-03-02': 'ada local' },
      timestamps: { '2026-03-02': 3000 }
    };
    const serverRows = [{
      date_str: '2026-03-02',
      items: { 'prayer-holyhour': true },
      note: 'old server',
      updated_at: 1000
    }];

    const merged = mergeDates(local, serverRows);

    assert.deepEqual(merged.checklist, { '2026-03-02': { 'prayer-readings': true } });
    assert.deepEqual(merged.notes, { '2026-03-02': 'ada local' });
    assert.deepEqual(merged.timestamps, { '2026-03-02': 3000 });
    assert.deepEqual(merged.push, [{
      date_str: '2026-03-02',
      items: { 'prayer-readings': true },
      note: 'ada local',
      updated_at: 3000
    }]);
  });

  it('keeps the device copy and does not upload it when the clocks are equal and the text differs', function () {
    const local = {
      checklist: { '2026-03-01': { 'prayer-readings': true } },
      notes: { '2026-03-01': 'device note' },
      timestamps: { '2026-03-01': 100 }
    };
    const serverRows = [{
      date_str: '2026-03-01',
      items: { 'prayer-holyhour': true },
      note: 'server note',
      updated_at: 100
    }];

    const merged = mergeDates(local, serverRows);

    assert.deepEqual(merged.checklist, { '2026-03-01': { 'prayer-readings': true } });
    assert.deepEqual(merged.notes, { '2026-03-01': 'device note' });
    assert.deepEqual(merged.timestamps, { '2026-03-01': 100 });
    assert.deepEqual(merged.push, []);
  });

  it('treats a numeric string server clock with JavaScript greater-than', function () {
    const local = {
      checklist: {
        '2026-03-01': { 'prayer-readings': true },
        '2026-03-02': { 'prayer-readings': true }
      },
      notes: { '2026-03-01': 'device note', '2026-03-02': 'second device' },
      timestamps: { '2026-03-01': 100, '2026-03-02': 150 }
    };
    const serverRows = [
      {
        date_str: '2026-03-01',
        items: { 'fasting-fast': true },
        note: 'from server',
        updated_at: '150'
      },
      {
        date_str: '2026-03-02',
        items: { 'fasting-fast': true },
        note: 'other server',
        updated_at: '150'
      }
    ];

    const merged = mergeDates(local, serverRows);

    assert.deepEqual(merged.checklist['2026-03-01'], { 'fasting-fast': true });
    assert.equal(merged.notes['2026-03-01'], 'from server');
    assert.equal(merged.timestamps['2026-03-01'], '150');
    assert.deepEqual(merged.checklist['2026-03-02'], { 'prayer-readings': true });
    assert.equal(merged.notes['2026-03-02'], 'second device');
    assert.equal(merged.timestamps['2026-03-02'], 150);
    assert.deepEqual(merged.push, []);
  });

  it('deletes the checklist entry when the winning server items are empty and keeps the server clock', function () {
    const local = {
      checklist: { '2026-03-01': { 'prayer-readings': true } },
      notes: { '2026-03-01': 'device note' },
      timestamps: { '2026-03-01': 100 }
    };
    const serverRows = [{
      date_str: '2026-03-01',
      items: {},
      note: 'server note',
      updated_at: 200
    }];

    const merged = mergeDates(local, serverRows);

    assert.equal(merged.checklist['2026-03-01'], undefined);
    assert.equal(merged.notes['2026-03-01'], 'server note');
    assert.equal(merged.timestamps['2026-03-01'], 200);
    assert.deepEqual(merged.push, []);
  });

  it('deletes the note when the winning server note is falsy and keeps the server clock', function () {
    const local = {
      checklist: { '2026-03-01': { 'prayer-readings': true } },
      notes: { '2026-03-01': 'device note' },
      timestamps: { '2026-03-01': 100 }
    };
    const serverRows = [{
      date_str: '2026-03-01',
      items: { 'fasting-fast': true },
      note: '',
      updated_at: 200
    }];

    const merged = mergeDates(local, serverRows);

    assert.deepEqual(merged.checklist['2026-03-01'], { 'fasting-fast': true });
    assert.equal(merged.notes['2026-03-01'], undefined);
    assert.equal(merged.timestamps['2026-03-01'], 200);
    assert.deepEqual(merged.push, []);
  });

  it('uploads a device timestamp the server did not return, even with no checklist entry and no note', function () {
    const local = {
      checklist: {},
      notes: {},
      timestamps: { '2026-03-04': 1000 }
    };

    const merged = mergeDates(local, []);

    assert.deepEqual(merged.checklist, {});
    assert.deepEqual(merged.notes, {});
    assert.deepEqual(merged.timestamps, { '2026-03-04': 1000 });
    assert.deepEqual(merged.push, [{
      date_str: '2026-03-04',
      items: {},
      note: '',
      updated_at: 1000
    }]);
  });

  it('leaves a checklist or note key with no timestamp alone and does not upload it', function () {
    const local = {
      checklist: { '2026-03-06': { 'prayer-holyhour': true } },
      notes: { '2026-03-07': 'unsent note' },
      timestamps: {}
    };
    const serverRows = [{
      date_str: '2026-03-01',
      items: { 'prayer-readings': true },
      note: 'server note',
      updated_at: 50
    }];

    const merged = mergeDates(local, serverRows);

    assert.deepEqual(merged.checklist['2026-03-06'], { 'prayer-holyhour': true });
    assert.equal(merged.notes['2026-03-07'], 'unsent note');
    assert.equal(merged.timestamps['2026-03-06'], undefined);
    assert.equal(merged.timestamps['2026-03-07'], undefined);
    assert.deepEqual(merged.push, []);
  });

  it('keeps the device copy when the server clock is 0 and the device clock is missing', function () {
    const local = {
      checklist: { '2026-03-01': { 'prayer-readings': true } },
      notes: { '2026-03-01': 'device note' },
      timestamps: {}
    };
    const serverRows = [{
      date_str: '2026-03-01',
      items: { 'prayer-holyhour': true },
      note: 'server note',
      updated_at: 0
    }];

    const merged = mergeDates(local, serverRows);

    assert.deepEqual(merged.checklist, { '2026-03-01': { 'prayer-readings': true } });
    assert.deepEqual(merged.notes, { '2026-03-01': 'device note' });
    assert.deepEqual(merged.timestamps, {});
    assert.deepEqual(merged.push, []);
  });
});

describe('discipline settings merge', function () {
  it('writes the server settings and does not upload when the server clock is greater', function () {
    const merged = mergeDisciplineSettings(
      { 'asceticism-alcohol': false },
      100,
      { prefs: { 'fasting-fast': false }, updated_at: 5000 },
      9000
    );

    assert.deepEqual(merged.disciplineSettings, { 'fasting-fast': false });
    assert.equal(merged.disciplineSettingsUpdatedAt, 5000);
    assert.equal(merged.write, true);
    assert.equal(merged.push, false);
  });

  it('uploads the device settings and does not write when the device clock is greater', function () {
    const local = { 'asceticism-alcohol': false };
    const merged = mergeDisciplineSettings(
      local,
      5000,
      { prefs: { 'fasting-fast': false }, updated_at: 100 },
      9000
    );

    assert.deepEqual(merged.disciplineSettings, { 'asceticism-alcohol': false });
    assert.equal(merged.disciplineSettingsUpdatedAt, 5000);
    assert.equal(merged.write, false);
    assert.equal(merged.push, true);
    assert.deepEqual(local, { 'asceticism-alcohol': false });
  });

  it('does not write or upload when the clocks are equal', function () {
    const merged = mergeDisciplineSettings(
      { 'asceticism-alcohol': false },
      100,
      { prefs: { 'fasting-fast': false }, updated_at: 100 },
      9000
    );

    assert.deepEqual(merged.disciplineSettings, { 'asceticism-alcohol': false });
    assert.equal(merged.disciplineSettingsUpdatedAt, 100);
    assert.equal(merged.write, false);
    assert.equal(merged.push, false);
  });

  it('stamps the passed now, keeps the device settings, and uploads when both clocks are missing and a setting exists', function () {
    const merged = mergeDisciplineSettings(
      { 'asceticism-alcohol': false },
      0,
      { prefs: { 'fasting-fast': false }, updated_at: 0 },
      5000
    );

    assert.deepEqual(merged.disciplineSettings, { 'asceticism-alcohol': false });
    assert.equal(merged.disciplineSettingsUpdatedAt, 5000);
    assert.equal(merged.write, true);
    assert.equal(merged.push, true);
  });

  it('ties when both clocks are missing and the device settings are empty', function () {
    const merged = mergeDisciplineSettings(
      {},
      0,
      { prefs: { 'fasting-fast': false }, updated_at: 0 },
      5000
    );

    assert.deepEqual(merged.disciplineSettings, {});
    assert.equal(merged.disciplineSettingsUpdatedAt, 0);
    assert.equal(merged.write, false);
    assert.equal(merged.push, false);
  });

  it('counts a non-number server clock as 0', function () {
    const stamped = mergeDisciplineSettings(
      { 'asceticism-alcohol': false },
      0,
      { prefs: { 'fasting-fast': false }, updated_at: '9000' },
      5000
    );
    assert.deepEqual(stamped.disciplineSettings, { 'asceticism-alcohol': false });
    assert.equal(stamped.disciplineSettingsUpdatedAt, 5000);
    assert.equal(stamped.write, true);
    assert.equal(stamped.push, true);

    const kept = mergeDisciplineSettings(
      { 'asceticism-alcohol': false },
      100,
      { prefs: { 'fasting-fast': false }, updated_at: '9000' },
      5000
    );
    assert.deepEqual(kept.disciplineSettings, { 'asceticism-alcohol': false });
    assert.equal(kept.disciplineSettingsUpdatedAt, 100);
    assert.equal(kept.write, false);
    assert.equal(kept.push, true);
  });
});

describe('account creation stamp', function () {
  it('fills a missing date clock and a missing settings clock, leaves an existing clock, and does not stamp a timestamp-only date', function () {
    const rows = {
      checklist: { '2026-03-01': { 'prayer-readings': true } },
      notes: { '2026-03-02': 'kept' },
      timestamps: { '2026-03-01': 40, '2026-03-04': 70 },
      disciplineSettings: { 'asceticism-alcohol': false },
      disciplineSettingsUpdatedAt: 0
    };

    const stamped = stampMissingClocks(rows, 5000);

    assert.equal(stamped.timestamps['2026-03-01'], 40);
    assert.equal(stamped.timestamps['2026-03-02'], 5000);
    assert.equal(stamped.timestamps['2026-03-04'], 70);
    assert.equal(stamped.disciplineSettingsUpdatedAt, 5000);
    assert.deepEqual(stamped.disciplineSettings, { 'asceticism-alcohol': false });
    assert.deepEqual(stamped.checklist, { '2026-03-01': { 'prayer-readings': true } });
    assert.deepEqual(stamped.notes, { '2026-03-02': 'kept' });
    assert.equal(rows.timestamps['2026-03-02'], undefined);
    assert.equal(rows.disciplineSettingsUpdatedAt, 0);
    assert.notEqual(stamped.timestamps, rows.timestamps);

    const already = stampMissingClocks({
      checklist: {},
      notes: {},
      timestamps: {},
      disciplineSettings: { 'asceticism-soda': false },
      disciplineSettingsUpdatedAt: 80
    }, 5000);
    assert.equal(already.disciplineSettingsUpdatedAt, 80);

    const empty = stampMissingClocks({
      checklist: {},
      notes: {},
      timestamps: { '2026-03-09': 12 },
      disciplineSettings: {},
      disciplineSettingsUpdatedAt: 0
    }, 5000);
    assert.equal(empty.disciplineSettingsUpdatedAt, 0);
    assert.equal(empty.timestamps['2026-03-09'], 12);
  });
});

'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var Cal = require('../calendar.js');

// ========== FIXTURE: the hand-written table and rules this module replaced ==========

var OLD_SEASONS = [
  { id: 'advent',    name: 'Advent',        start: '2025-11-30', end: '2025-12-24' },
  { id: 'christmas', name: 'Christmas',     start: '2025-12-25', end: '2026-01-11' },
  { id: 'ordinary',  name: 'Ordinary Time', start: '2026-01-12', end: '2026-02-17' },
  { id: 'lent',      name: 'Lent',          start: '2026-02-18', end: '2026-04-01' },
  { id: 'triduum',   name: 'Triduum',       start: '2026-04-02', end: '2026-04-04' },
  { id: 'easter',    name: 'Easter',        start: '2026-04-05', end: '2026-05-24' },
  { id: 'ordinary',  name: 'Ordinary Time', start: '2026-05-25', end: '2026-11-28' },
  { id: 'advent',    name: 'Advent',        start: '2026-11-29', end: '2026-12-24' },
  { id: 'christmas', name: 'Christmas',     start: '2026-12-25', end: '2027-01-10' }
];

function parseDate(str) {
  var parts = str.split('-');
  return new Date(+parts[0], +parts[1] - 1, +parts[2], 12, 0, 0);
}

function oldSeason(dateStr) {
  for (var i = 0; i < OLD_SEASONS.length; i++) {
    if (dateStr >= OLD_SEASONS[i].start && dateStr <= OLD_SEASONS[i].end) return OLD_SEASONS[i];
  }
  return null;
}

function oldDays(from, to) {
  return Math.round((parseDate(to) - parseDate(from)) / 864e5) + 1;
}

function oldApplies(freq, dateStr) {
  var s = oldSeason(dateStr);
  var lentOrTriduum = s && (s.id === 'lent' || s.id === 'triduum');
  var dow = parseDate(dateStr).getDay();
  switch (freq) {
    case 'daily':
      return true;
    case 'sunday':
      return dow === 0;
    case 'weekly':
      return true;
    case 'fasting':
      if (!lentOrTriduum) return false;
      if (dateStr === '2026-02-18') return true;
      if (dow !== 5) return false;
      if (dateStr === '2026-02-20') return false;
      return true;
    case 'abstinence':
      if (!lentOrTriduum) return false;
      if (dateStr === '2026-02-18') return true;
      return dow === 5;
    default:
      return true;
  }
}

var FREQS = ['daily', 'sunday', 'weekly', 'fasting', 'abstinence'];

// ========== TESTS ==========

test('EPOCH is the first date the app tracked', function () {
  assert.equal(Cal.EPOCH, '2025-11-30');
});

test('matches the old table on every date from 2025-11-30 to 2027-01-10', function () {
  for (var d = '2025-11-30'; d <= '2027-01-10'; d = Cal.addDays(d, 1)) {
    var old = oldSeason(d);
    assert.deepEqual(Cal.season(d), {
      id: old.id,
      name: old.name,
      start: old.start,
      end: old.end,
      day: oldDays(old.start, d),
      length: oldDays(old.start, old.end)
    }, d);
    for (var i = 0; i < FREQS.length; i++) {
      assert.equal(Cal.applies(FREQS[i], d), oldApplies(FREQS[i], d), FREQS[i] + ' on ' + d);
    }
  }
});

test('Easter Sunday for known years starts the Easter Season', function () {
  var easters = ['2026-04-05', '2027-03-28', '2028-04-16', '2029-04-01', '2030-04-21', '2038-04-25'];
  for (var i = 0; i < easters.length; i++) {
    var s = Cal.season(easters[i]);
    assert.equal(s.id, 'easter', easters[i]);
    assert.equal(s.start, easters[i]);
    assert.equal(s.end, Cal.addDays(easters[i], 49));
  }
});

test('Baptism moves to Monday when Epiphany is Jan 7 (2029)', function () {
  // Epiphany is Sunday 2029-01-07, so Baptism is Monday 2029-01-08.
  var s = Cal.season('2029-01-08');
  assert.equal(s.id, 'christmas');
  assert.equal(s.end, '2029-01-08');
  assert.equal(Cal.season('2029-01-09').id, 'ordinary');
  assert.equal(Cal.season('2029-01-09').start, '2029-01-09');
});

test('every date from 2025-11-30 through 2100-12-31 has a contiguous Season', function () {
  var prev = null;
  for (var d = '2025-11-30'; d <= '2100-12-31'; d = Cal.addDays(d, 1)) {
    var s = Cal.season(d);
    assert.ok(s && s.start <= d && d <= s.end, d);
    assert.equal(s.day, oldDays(s.start, d), d);
    assert.equal(s.length, oldDays(s.start, s.end), d);
    if (prev && prev.end !== s.end) {
      assert.equal(Cal.addDays(prev.end, 1), s.start, d);
    }
    prev = s;
  }
});

test('Lent 2027 Fast and Abstinence days', function () {
  assert.equal(Cal.season('2027-02-10').id, 'lent');
  assert.equal(Cal.applies('fasting', '2027-02-10'), true);
  assert.equal(Cal.applies('abstinence', '2027-02-10'), true);
  assert.equal(Cal.applies('fasting', '2027-02-12'), false);
  assert.equal(Cal.applies('abstinence', '2027-02-12'), true);
  assert.equal(Cal.applies('fasting', '2027-03-26'), true);
  assert.equal(Cal.applies('abstinence', '2027-03-26'), true);
  assert.equal(Cal.applies('abstinence', '2027-02-09'), false);
});

test('weekOf returns Sunday through Saturday, unclipped', function () {
  assert.deepEqual(Cal.weekOf('2025-12-03'), [
    '2025-11-30', '2025-12-01', '2025-12-02', '2025-12-03', '2025-12-04', '2025-12-05', '2025-12-06'
  ]);
  assert.deepEqual(Cal.weekOf('2025-11-29'), [
    '2025-11-23', '2025-11-24', '2025-11-25', '2025-11-26', '2025-11-27', '2025-11-28', '2025-11-29'
  ]);
  assert.deepEqual(Cal.weekOf('2027-01-10'), [
    '2027-01-10', '2027-01-11', '2027-01-12', '2027-01-13', '2027-01-14', '2027-01-15', '2027-01-16'
  ]);
});

test('addDays crosses month, year and leap-day boundaries', function () {
  assert.equal(Cal.addDays('2027-12-31', 1), '2028-01-01');
  assert.equal(Cal.addDays('2028-02-28', 1), '2028-02-29');
  assert.equal(Cal.addDays('2028-03-01', -1), '2028-02-29');
  assert.equal(Cal.addDays('2026-03-08', 1), '2026-03-09');
});

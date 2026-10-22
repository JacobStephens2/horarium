'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var Disciplines = require('../disciplines.js');

var CORPORAL = 'Feed the hungry, give drink to the thirsty, clothe the naked, shelter the homeless, visit the sick, visit the imprisoned, bury the dead';
var SPIRITUAL = 'Instruct the ignorant, counsel the doubtful, admonish the sinner, bear wrongs patiently, forgive offenses willingly, comfort the afflicted, pray for the living and the dead';

var CATALOG = [
  {
    id: 'prayer',
    name: 'Prayer',
    icon: '\u{1F64F}',
    items: [
      ['prayer-readings', 'Read Mass readings'],
      ['prayer-holyhour', 'Make a holy half hour'],
      ['prayer-lordsday', 'Celebrate the Lord\u2019s Day by relaxing one discipline']
    ]
  },
  {
    id: 'fasting',
    name: 'Fasting',
    icon: '\u{1F35E}',
    items: [
      ['fasting-fast', 'Fast'],
      ['fasting-abstain', 'Abstain from meat']
    ]
  },
  {
    id: 'almsgiving',
    name: 'Almsgiving & Works of Charity',
    icon: '\u{1FAF4}',
    items: [
      ['almsgiving-alms', 'Give alms'],
      ['charity-work', 'Perform one work of charity']
    ]
  },
  {
    id: 'fraternity',
    name: 'Fraternity',
    icon: '\u{1FAC2}',
    items: [
      ['fraternity-anchor', 'Brother check-in'],
      ['fraternity-meeting', 'Fraternity meeting with the group']
    ]
  },
  {
    id: 'stewardship',
    name: 'Stewardship',
    icon: '\u{1F3DB}\uFE0F',
    items: [
      ['stewardship-sleep', 'Full night\u2019s sleep (7+ hours)'],
      ['stewardship-exercise', 'Exercise']
    ]
  },
  {
    id: 'asceticism',
    name: 'Asceticism',
    icon: '\u{1F4AA}',
    items: [
      ['asceticism-screentime', 'No unnecessary screen time'],
      ['asceticism-alcohol', 'No alcohol'],
      ['asceticism-soda', 'No soda or sweet drinks'],
      ['asceticism-snacking', 'No snacking between meals'],
      ['asceticism-desserts', 'No desserts or sweets'],
      ['asceticism-music', 'Only music that lifts the soul to God'],
      ['asceticism-purchases', 'No unnecessary purchases'],
      ['asceticism-coldshower', 'Take a cold shower']
    ]
  }
];

function item(day, id) {
  for (var c = 0; c < day.categories.length; c++) {
    var items = day.categories[c].items;
    for (var i = 0; i < items.length; i++) {
      if (items[i].id === id) return items[i];
    }
  }
  return null;
}

function catalogItem(catalog, id) {
  for (var c = 0; c < catalog.categories.length; c++) {
    var items = catalog.categories[c].items;
    for (var i = 0; i < items.length; i++) {
      if (items[i].id === id) return items[i];
    }
  }
  return null;
}

function categoryIds(result) {
  return result.categories.map(function (cat) { return cat.id; });
}

function shows(date, id, prefs, checks) {
  return item(Disciplines.forDate(date, prefs, checks), id);
}

test('the interface is forDate and catalog', function () {
  assert.deepEqual(Object.keys(Disciplines).sort(), ['catalog', 'forDate']);
});

test('catalog keeps the 19 practices in 6 categories, in order', function () {
  var catalog = Disciplines.catalog(null);
  assert.equal(catalog.categories.length, 6);
  var count = 0;
  for (var c = 0; c < CATALOG.length; c++) {
    var expected = CATALOG[c];
    var got = catalog.categories[c];
    assert.equal(got.id, expected.id);
    assert.equal(got.name, expected.name);
    assert.equal(got.icon, expected.icon);
    assert.equal(got.items.length, expected.items.length);
    for (var i = 0; i < expected.items.length; i++) {
      assert.deepEqual(got.items[i], {
        id: expected.items[i][0],
        label: expected.items[i][1],
        optional: false,
        enabled: true
      });
      count++;
    }
  }
  assert.equal(count, 19);
});

test('an ordinary day shows no Fast, no Abstinence, and no Sunday disciplines', function () {
  var day = Disciplines.forDate('2026-01-15', null, null);
  assert.equal(item(day, 'fasting-fast'), null);
  assert.equal(item(day, 'fasting-abstain'), null);
  assert.equal(item(day, 'prayer-lordsday'), null);
  assert.equal(item(day, 'fraternity-meeting'), null);
  assert.equal(categoryIds(day).indexOf('fasting'), -1);
  assert.equal(item(day, 'prayer-readings').hint, '');
  assert.equal(item(day, 'prayer-readings').weekly, null);
  assert.equal(item(day, 'prayer-readings').details, null);
  assert.equal(item(day, 'prayer-readings').checked, false);
  assert.equal(day.checked, 0);
  assert.equal(day.total, 15);
});

test('Ash Wednesday shows Fast and Abstinence, and Fast still says Friday fast', function () {
  var day = Disciplines.forDate('2026-02-18', null, null);
  assert.equal(item(day, 'fasting-fast').hint, 'Friday fast');
  assert.equal(item(day, 'fasting-abstain').hint, 'Friday abstinence');
  assert.equal(item(day, 'prayer-lordsday'), null);
  assert.equal(day.total, 17);
});

test('the Friday after Ash Wednesday shows Abstinence and not Fast', function () {
  var day = Disciplines.forDate('2026-02-20', null, null);
  assert.equal(item(day, 'fasting-fast'), null);
  assert.equal(item(day, 'fasting-abstain').hint, 'Friday abstinence');
  assert.equal(item(day, 'prayer-lordsday'), null);
  assert.equal(item(day, 'fraternity-meeting'), null);
  assert.equal(day.total, 16);
});

test('a later Lent Friday shows Fast and Abstinence', function () {
  var day = Disciplines.forDate('2026-02-27', null, null);
  assert.ok(item(day, 'fasting-fast'));
  assert.equal(item(day, 'fasting-fast').hint, 'Friday fast');
  assert.ok(item(day, 'fasting-abstain'));
  assert.equal(day.total, 17);
});

test('Sunday shows the Sunday disciplines and not Fast', function () {
  var day = Disciplines.forDate('2026-02-22', null, null);
  assert.equal(item(day, 'prayer-lordsday').hint, 'Sunday discipline');
  assert.equal(item(day, 'fraternity-meeting').hint, 'Sunday discipline');
  assert.equal(item(day, 'fasting-fast'), null);
  assert.equal(item(day, 'fasting-abstain'), null);
  assert.equal(categoryIds(day).indexOf('fasting'), -1);
  assert.equal(day.total, 17);
});

test('catalog still lists Fast when an ordinary day hides it', function () {
  var catalog = Disciplines.catalog({});
  assert.equal(catalogItem(catalog, 'fasting-fast').label, 'Fast');
  assert.equal(catalogItem(catalog, 'fasting-fast').enabled, true);
  assert.equal(categoryIds(catalog).indexOf('fasting') !== -1, true);
  assert.equal(item(Disciplines.forDate('2026-01-15', {}, null), 'fasting-fast'), null);
});

test('a false No alcohol setting hides it on the day and marks it off in the catalog', function () {
  var prefs = { 'asceticism-alcohol': false };
  var day = Disciplines.forDate('2026-01-15', prefs, {
    '2026-01-15': { 'asceticism-alcohol': true, 'prayer-readings': true }
  });
  assert.equal(item(day, 'asceticism-alcohol'), null);
  assert.equal(item(day, 'prayer-readings').checked, true);
  assert.equal(day.checked, 1);
  assert.equal(day.total, 14);
  var listed = catalogItem(Disciplines.catalog(prefs), 'asceticism-alcohol');
  assert.deepEqual(listed, {
    id: 'asceticism-alcohol',
    label: 'No alcohol',
    optional: false,
    enabled: false
  });
});

test('an own property wins by truthiness, including when hasOwnProperty is replaced', function () {
  var hidden = {
    hasOwnProperty: function () { return false; },
    'asceticism-alcohol': false
  };
  assert.equal(shows('2026-01-15', 'asceticism-alcohol', hidden, null), null);
  assert.equal(catalogItem(Disciplines.catalog(hidden), 'asceticism-alcohol').enabled, false);

  var zero = { 'asceticism-alcohol': 0 };
  assert.equal(shows('2026-01-15', 'asceticism-alcohol', zero, null), null);
  assert.equal(catalogItem(Disciplines.catalog(zero), 'asceticism-alcohol').enabled, false);

  var one = Object.create(null);
  one['asceticism-alcohol'] = 1;
  assert.equal(catalogItem(Disciplines.catalog(one), 'asceticism-alcohol').enabled, true);
  assert.ok(shows('2026-01-15', 'asceticism-alcohol', one, null));

  var sneaky = Object.create({ hasOwnProperty: function () { return true; } });
  assert.equal(catalogItem(Disciplines.catalog(sneaky), 'asceticism-soda').enabled, true);
  assert.ok(shows('2026-01-15', 'asceticism-soda', sneaky, null));
});

test('null, undefined, and arrays for settings or checks count as empty', function () {
  var dates = [null, undefined, []];
  for (var i = 0; i < dates.length; i++) {
    var day = Disciplines.forDate('2026-01-15', dates[i], dates[i]);
    assert.equal(day.checked, 0, String(dates[i]));
    assert.equal(day.total, 15, String(dates[i]));
    assert.ok(item(day, 'asceticism-alcohol'), String(dates[i]));
    assert.equal(catalogItem(Disciplines.catalog(dates[i]), 'fasting-fast').enabled, true);
  }
});

test('a date bucket that is not a plain object counts as no marks', function () {
  var day = Disciplines.forDate('2026-01-15', null, {
    '2026-01-15': ['prayer-readings'],
    '2026-01-14': 'stewardship-exercise',
    '2026-01-13': null
  });
  assert.equal(item(day, 'prayer-readings').checked, false);
  assert.equal(item(day, 'stewardship-exercise').weekly.count, 0);
  assert.equal(day.checked, 0);
});

test('a truthy mark counts, and a hidden discipline does not', function () {
  var day = Disciplines.forDate('2026-01-15', null, {
    '2026-01-15': {
      'prayer-readings': 1,
      'prayer-holyhour': 'yes',
      'fasting-fast': true
    }
  });
  assert.equal(item(day, 'prayer-readings').checked, true);
  assert.equal(item(day, 'prayer-holyhour').checked, true);
  assert.equal(item(day, 'fasting-fast'), null);
  assert.equal(day.checked, 2);
  assert.equal(day.total, 15);
});

test('Exercise is n/3 this week and completes at 3', function () {
  var none = Disciplines.forDate('2026-01-15', null, null);
  assert.deepEqual(item(none, 'stewardship-exercise'), {
    id: 'stewardship-exercise',
    label: 'Exercise',
    checked: false,
    hint: '3 times this week',
    details: null,
    weekly: { count: 0, text: '0/3 this week', complete: false }
  });

  var partial = Disciplines.forDate('2026-01-15', null, {
    '2026-01-11': { 'stewardship-exercise': true },
    '2026-01-17': { 'stewardship-exercise': true },
    '2026-01-10': { 'stewardship-exercise': true }
  });
  assert.deepEqual(item(partial, 'stewardship-exercise').weekly, {
    count: 2,
    text: '2/3 this week',
    complete: false
  });
  assert.equal(item(partial, 'stewardship-exercise').checked, false);

  var done = Disciplines.forDate('2026-01-15', null, {
    '2026-01-11': { 'stewardship-exercise': true },
    '2026-01-14': { 'stewardship-exercise': true },
    '2026-01-17': { 'stewardship-exercise': true },
    '2026-01-10': { 'stewardship-exercise': true }
  });
  assert.deepEqual(item(done, 'stewardship-exercise').weekly, {
    count: 3,
    text: '3/3 this week',
    complete: true
  });
  assert.equal(Object.prototype.hasOwnProperty.call(item(done, 'stewardship-exercise').weekly, 'goal'), false);
});

test('a one-date map counts only that date', function () {
  var day = Disciplines.forDate('2026-01-15', null, {
    '2026-01-15': { 'stewardship-exercise': true, 'almsgiving-alms': true }
  });
  assert.deepEqual(item(day, 'stewardship-exercise').weekly, {
    count: 1,
    text: '1/3 this week',
    complete: false
  });
  assert.equal(item(day, 'stewardship-exercise').checked, true);
  assert.deepEqual(item(day, 'almsgiving-alms').weekly, {
    count: 1,
    text: '\u2713 this week',
    complete: true
  });
});

test('Give alms has no numeric goal', function () {
  var none = Disciplines.forDate('2026-01-15', null, {});
  assert.deepEqual(item(none, 'almsgiving-alms'), {
    id: 'almsgiving-alms',
    label: 'Give alms',
    checked: false,
    hint: 'Weekly discipline',
    details: null,
    weekly: { count: 0, text: 'this week', complete: false }
  });

  var once = Disciplines.forDate('2026-01-15', null, {
    '2026-01-12': { 'almsgiving-alms': true }
  });
  assert.deepEqual(item(once, 'almsgiving-alms').weekly, {
    count: 1,
    text: '\u2713 this week',
    complete: true
  });

  var twice = Disciplines.forDate('2026-01-15', null, {
    '2026-01-12': { 'almsgiving-alms': true },
    '2026-01-15': { 'almsgiving-alms': true }
  });
  assert.deepEqual(item(twice, 'almsgiving-alms').weekly, {
    count: 2,
    text: '\u2713 this week',
    complete: true
  });
  assert.equal(Object.prototype.hasOwnProperty.call(item(twice, 'almsgiving-alms'), 'freq'), false);
});

test('charity details are copies, and a previous result does not change the next call', function () {
  var prefs = { 'asceticism-alcohol': false };
  var checks = { '2026-01-15': { 'prayer-readings': true } };
  var first = Disciplines.forDate('2026-01-15', prefs, checks);
  var charity = item(first, 'charity-work');
  assert.deepEqual(charity.details, [
    { heading: 'Corporal', list: CORPORAL },
    { heading: 'Spiritual', list: SPIRITUAL }
  ]);
  charity.details.push({ heading: 'Extra', list: 'nope' });
  charity.details[0].heading = 'Changed';
  charity.details[0].list = 'changed';
  first.categories[0].name = 'Nope';
  first.categories[0].items[0].label = 'Nope';
  first.checked = 99;

  var second = Disciplines.forDate('2026-01-15', prefs, checks);
  assert.deepEqual(item(second, 'charity-work').details, [
    { heading: 'Corporal', list: CORPORAL },
    { heading: 'Spiritual', list: SPIRITUAL }
  ]);
  assert.notEqual(item(second, 'charity-work').details, charity.details);
  assert.notEqual(item(second, 'charity-work').details[0], charity.details[0]);
  assert.equal(second.categories[0].name, 'Prayer');
  assert.equal(second.categories[0].items[0].label, 'Read Mass readings');
  assert.equal(second.checked, 1);
  assert.notEqual(second, first);
  assert.notEqual(second.categories[0], first.categories[0]);
  assert.deepEqual(prefs, { 'asceticism-alcohol': false });
  assert.deepEqual(checks, { '2026-01-15': { 'prayer-readings': true } });

  var listed = Disciplines.catalog(prefs);
  listed.categories[0].items[0].label = 'Nope';
  listed.categories[0].items[0].enabled = true;
  var again = Disciplines.catalog(prefs);
  assert.equal(again.categories[0].items[0].label, 'Read Mass readings');
  assert.equal(catalogItem(again, 'asceticism-alcohol').enabled, false);
  assert.notEqual(again.categories[0], listed.categories[0]);
});

test('a category with nothing showing is omitted from the day and kept in the catalog', function () {
  var prefs = { 'fasting-fast': false, 'fasting-abstain': false };
  var day = Disciplines.forDate('2026-02-18', prefs, null);
  assert.equal(categoryIds(day).indexOf('fasting'), -1);
  var catalog = Disciplines.catalog(prefs);
  assert.deepEqual(categoryIds(catalog), [
    'prayer', 'fasting', 'almsgiving', 'fraternity', 'stewardship', 'asceticism'
  ]);
  assert.equal(catalogItem(catalog, 'fasting-fast').enabled, false);
  assert.equal(catalogItem(catalog, 'fasting-abstain').enabled, false);
});

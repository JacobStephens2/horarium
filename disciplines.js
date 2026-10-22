// Which disciplines show on a date, and whether each one is on.
// Callers pass the date, the discipline settings, and the checklist map.
// The liturgical calendar answers whether a Frequency applies. This module
// does not decide today, read storage, or name the Season.
(function (root) {
  'use strict';

  var Cal = (typeof module !== 'undefined' && module.exports)
    ? require('./calendar.js')
    : root.HorariumCalendar;

  var CATEGORIES = [
    {
      id: 'prayer',
      name: 'Prayer',
      icon: '\u{1F64F}',
      items: [
        { id: 'prayer-readings', label: 'Read Mass readings', freq: 'daily' },
        { id: 'prayer-holyhour', label: 'Make a holy half hour', freq: 'daily' },
        { id: 'prayer-lordsday', label: 'Celebrate the Lord\u2019s Day by relaxing one discipline', freq: 'sunday' }
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

  function isPlainObject(value) {
    if (value === null || typeof value !== 'object') return false;
    if (Object.prototype.toString.call(value) !== '[object Object]') return false;
    var proto = Object.getPrototypeOf(value);
    if (proto === null || proto === Object.prototype) return true;
    // A plain object from another realm has that realm's Object.prototype.
    return Object.getPrototypeOf(proto) === null;
  }

  function asMap(value) {
    return isPlainObject(value) ? value : {};
  }

  function enabled(prefs, item) {
    if (Object.prototype.hasOwnProperty.call(prefs, item.id)) return !!prefs[item.id];
    return !item.optional;
  }

  function hint(item) {
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

  function copyDetails(details) {
    if (!details) return null;
    var copy = [];
    for (var i = 0; i < details.length; i++) {
      copy.push({ heading: details[i].heading, list: details[i].list });
    }
    return copy;
  }

  function marked(checks, date, itemId) {
    var bucket = checks[date];
    if (!isPlainObject(bucket)) return false;
    return !!bucket[itemId];
  }

  function weeklyCount(checks, date, itemId) {
    var dates = Cal.weekOf(date);
    var count = 0;
    for (var i = 0; i < dates.length; i++) {
      if (marked(checks, dates[i], itemId)) count++;
    }
    return count;
  }

  function weeklyLine(item, checks, date) {
    if (item.freq !== 'weekly') return null;
    var count = weeklyCount(checks, date, item.id);
    var goal = item.weeklyGoal || 1;
    var text = item.weeklyGoal
      ? count + '/' + item.weeklyGoal + ' this week'
      : (count > 0 ? '\u2713 this week' : 'this week');
    return { count: count, text: text, complete: count >= goal };
  }

  function forDate(date, prefs, checks) {
    prefs = asMap(prefs);
    checks = asMap(checks);
    var categories = [];
    var checked = 0;
    var total = 0;
    for (var c = 0; c < CATEGORIES.length; c++) {
      var cat = CATEGORIES[c];
      var items = [];
      for (var j = 0; j < cat.items.length; j++) {
        var entry = cat.items[j];
        if (!enabled(prefs, entry)) continue;
        if (!Cal.applies(entry.freq, date)) continue;
        var on = marked(checks, date, entry.id);
        if (on) checked++;
        total++;
        items.push({
          id: entry.id,
          label: entry.label,
          checked: on,
          hint: hint(entry),
          details: copyDetails(entry.details),
          weekly: weeklyLine(entry, checks, date)
        });
      }
      if (items.length === 0) continue;
      categories.push({
        id: cat.id,
        name: cat.name,
        icon: cat.icon,
        items: items
      });
    }
    return { checked: checked, total: total, categories: categories };
  }

  function catalog(prefs) {
    prefs = asMap(prefs);
    var categories = [];
    for (var c = 0; c < CATEGORIES.length; c++) {
      var cat = CATEGORIES[c];
      var items = [];
      for (var j = 0; j < cat.items.length; j++) {
        var entry = cat.items[j];
        items.push({
          id: entry.id,
          label: entry.label,
          optional: !!entry.optional,
          enabled: enabled(prefs, entry)
        });
      }
      categories.push({
        id: cat.id,
        name: cat.name,
        icon: cat.icon,
        items: items
      });
    }
    return { categories: categories };
  }

  var HorariumDisciplines = {
    forDate: forDate,
    catalog: catalog
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = HorariumDisciplines;
  } else {
    root.HorariumDisciplines = HorariumDisciplines;
  }
})(this);

// Liturgical calendar: Seasons and Fast/Abstinence days for any date,
// computed from Easter and the US (USCCB) norms. Dates are 'YYYY-MM-DD'
// strings; arithmetic is done in UTC so the device timezone never matters.
(function (root) {
  'use strict';

  var EPOCH = '2025-11-30';
  var DAY_MS = 864e5;

  // ========== DATE ARITHMETIC ==========

  function toDays(str) {
    var p = str.split('-');
    return Date.UTC(+p[0], +p[1] - 1, +p[2]) / DAY_MS;
  }

  function fromDays(n) {
    return new Date(n * DAY_MS).toISOString().slice(0, 10);
  }

  function weekday(n) {
    return new Date(n * DAY_MS).getUTCDay();
  }

  function daysFrom(year, month, day) {
    return Date.UTC(year, month - 1, day) / DAY_MS;
  }

  function addDays(str, n) {
    return fromDays(toDays(str) + n);
  }

  function weekOf(str) {
    var n = toDays(str);
    var sunday = n - weekday(n);
    var dates = [];
    for (var i = 0; i < 7; i++) dates.push(fromDays(sunday + i));
    return dates;
  }

  // ========== SEASON RULES ==========

  // Gregorian computus (anonymous algorithm).
  function easter(year) {
    var a = year % 19;
    var b = Math.floor(year / 100);
    var c = year % 100;
    var d = Math.floor(b / 4);
    var e = b % 4;
    var f = Math.floor((b + 8) / 25);
    var g = Math.floor((b - f + 1) / 3);
    var h = (19 * a + b - d - g + 15) % 30;
    var i = Math.floor(c / 4);
    var k = c % 4;
    var l = (32 + 2 * e + 2 * i - h - k) % 7;
    var m = Math.floor((a + 11 * h + 22 * l) / 451);
    var month = Math.floor((h + l - 7 * m + 114) / 31);
    var day = ((h + l - 7 * m + 114) % 31) + 1;
    return daysFrom(year, month, day);
  }

  // US: Epiphany is the Sunday from Jan 2 to 8. Baptism of the Lord is the
  // following Sunday, or the Monday after Epiphany when Epiphany is Jan 7 or 8.
  function baptism(year) {
    var jan8 = daysFrom(year, 1, 8);
    var epiphany = jan8 - weekday(jan8);
    return epiphany >= daysFrom(year, 1, 7) ? epiphany + 1 : epiphany + 7;
  }

  // First Sunday of Advent: the fourth Sunday before Christmas (Nov 27 to Dec 3).
  function adventStart(year) {
    var dec3 = daysFrom(year, 12, 3);
    return dec3 - weekday(dec3);
  }

  function ashWednesday(year) {
    return easter(year) - 46;
  }

  // The Seasons from Christmas of year - 1 through Christmas Eve of year, in
  // order; each ends the day before the next starts, and the last ends Dec 24.
  function liturgicalYear(year) {
    var e = easter(year);
    return [
      { id: 'christmas', name: 'Christmas', start: daysFrom(year - 1, 12, 25) },
      { id: 'ordinary', name: 'Ordinary Time', start: baptism(year) + 1 },
      { id: 'lent', name: 'Lent', start: ashWednesday(year) },
      { id: 'triduum', name: 'Triduum', start: e - 3 },
      { id: 'easter', name: 'Easter', start: e },
      { id: 'ordinary', name: 'Ordinary Time', start: e + 50 },
      { id: 'advent', name: 'Advent', start: adventStart(year) }
    ];
  }

  function season(str) {
    var n = toDays(str);
    var year = +str.slice(0, 4);
    if (n >= daysFrom(year, 12, 25)) year++;
    var seasons = liturgicalYear(year);
    var i = 0;
    while (i + 1 < seasons.length && n >= seasons[i + 1].start) i++;
    var start = seasons[i].start;
    var end = i + 1 < seasons.length ? seasons[i + 1].start - 1 : daysFrom(year, 12, 24);
    return {
      id: seasons[i].id,
      name: seasons[i].name,
      start: fromDays(start),
      end: fromDays(end),
      day: n - start + 1,
      length: end - start + 1
    };
  }

  // ========== FAST AND ABSTINENCE ==========

  function isLentOrTriduum(str) {
    var id = season(str).id;
    return id === 'lent' || id === 'triduum';
  }

  function applies(freq, str) {
    var n = toDays(str);
    switch (freq) {
      case 'sunday':
        return weekday(n) === 0;
      case 'fasting':
      case 'abstinence':
        if (!isLentOrTriduum(str)) return false;
        // Lent never crosses a year boundary, so its year is the date's year.
        var ash = ashWednesday(+str.slice(0, 4));
        if (n === ash) return true;
        if (weekday(n) !== 5) return false;
        return freq === 'abstinence' || n !== ash + 2;
      default:
        return true;
    }
  }

  var HorariumCalendar = {
    EPOCH: EPOCH,
    season: season,
    applies: applies,
    weekOf: weekOf,
    addDays: addDays
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = HorariumCalendar;
  } else {
    root.HorariumCalendar = HorariumCalendar;
  }
})(this);

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

  function ymd(year, month, day) {
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
    return ymd(year, month, day);
  }

  // US: Epiphany is the Sunday from Jan 2 to 8. Baptism of the Lord is the
  // following Sunday, or the Monday after Epiphany when Epiphany is Jan 7 or 8.
  function baptism(year) {
    var jan8 = ymd(year, 1, 8);
    var epiphany = jan8 - weekday(jan8);
    return epiphany >= ymd(year, 1, 7) ? epiphany + 1 : epiphany + 7;
  }

  // First Sunday of Advent: the fourth Sunday before Christmas (Nov 27 to Dec 3).
  function adventStart(year) {
    var dec3 = ymd(year, 12, 3);
    return dec3 - weekday(dec3);
  }

  // The Seasons from Christmas of year - 1 through Christmas Eve of year,
  // as [id, name, startDay] in order; each ends the day before the next starts.
  function liturgicalYear(year) {
    var e = easter(year);
    return [
      ['christmas', 'Christmas', ymd(year - 1, 12, 25)],
      ['ordinary', 'Ordinary Time', baptism(year) + 1],
      ['lent', 'Lent', e - 46],
      ['triduum', 'Triduum', e - 3],
      ['easter', 'Easter', e],
      ['ordinary', 'Ordinary Time', e + 50],
      ['advent', 'Advent', adventStart(year)],
      [null, null, ymd(year, 12, 25)]
    ];
  }

  function season(str) {
    var n = toDays(str);
    var year = +str.slice(0, 4);
    if (n >= ymd(year, 12, 25)) year++;
    var seasons = liturgicalYear(year);
    var i = 0;
    while (n >= seasons[i + 1][2]) i++;
    var start = seasons[i][2];
    var end = seasons[i + 1][2] - 1;
    return {
      id: seasons[i][0],
      name: seasons[i][1],
      start: fromDays(start),
      end: fromDays(end),
      day: n - start + 1,
      length: end - start + 1
    };
  }

  // ========== FAST AND ABSTINENCE ==========

  function isPenitential(str) {
    var id = season(str).id;
    return id === 'lent' || id === 'triduum';
  }

  // Ash Wednesday (E - 46) of the liturgical year containing str.
  function ashWednesday(str) {
    return easter(+str.slice(0, 4)) - 46;
  }

  function applies(freq, str) {
    var n = toDays(str);
    switch (freq) {
      case 'sunday':
        return weekday(n) === 0;
      case 'fasting':
        if (!isPenitential(str)) return false;
        if (n === ashWednesday(str)) return true;
        return weekday(n) === 5 && n !== ashWednesday(str) + 2;
      case 'abstinence':
        if (!isPenitential(str)) return false;
        return n === ashWednesday(str) || weekday(n) === 5;
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

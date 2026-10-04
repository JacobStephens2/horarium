# Horarium domain glossary

**Liturgical calendar** - The module (`calendar.js`, exposed as `HorariumCalendar`) that answers which Season a date falls in and whether a Frequency applies on it. It computes everything from Easter Sunday (the Gregorian computus) and the US (USCCB) calendar norms, so it works for any year. It has no DOM, `localStorage` or network access. Deciding what "today" is belongs to the app, not to the calendar.

**EPOCH** - 2025-11-30, the first date the app ever tracked. Back navigation stops there, and "today" is never earlier than it.

**Season** - A contiguous run of days in the liturgical year: Advent, Christmas, Ordinary Time, Lent, Triduum or Easter. With E as Easter Sunday, and each Season ending the day before the next one starts:

| Season | Starts |
|---|---|
| Christmas | Dec 25 |
| Ordinary Time | The day after the Baptism of the Lord (US: the Sunday after Epiphany, or the Monday after Epiphany when Epiphany falls on Jan 7 or 8) |
| Lent | E - 46 (Ash Wednesday) |
| Triduum | E - 3 |
| Easter | E, running through Pentecost (E + 49) |
| Ordinary Time | E + 50 |
| Advent | The fourth Sunday before Christmas |

The header shows the Season as "Season - Day N of M".

**Fast day** - Ash Wednesday, or any Friday in Lent or the Triduum except the Friday right after Ash Wednesday (E - 44). Items with the `fasting` Frequency show only on Fast days.

**Abstinence day** - Ash Wednesday, or any Friday in Lent or the Triduum. Items with the `abstinence` Frequency show only on Abstinence days.

**Frequency** - An item's `freq`, which decides the dates the item shows on:

- `daily` - every day
- `sunday` - Sundays only
- `weekly` - every day, counted toward a weekly goal over the Sunday-to-Saturday week
- `fasting` - Fast days only
- `abstinence` - Abstinence days only

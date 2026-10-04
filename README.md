# Horarium — Rule of Life Tracker

Live at https://horarium.us

A Progressive Web App for a small men’s group at St. Agatha St. James parish (West Philadelphia) to track a shared rule of life across the liturgical year — prayer, fasting, almsgiving, fraternity, stewardship, and asceticism.

**Tagline:** *A faithful rhythm for every season.*

## Features

- **Daily checklist** across six categories: Prayer, Fasting, Almsgiving & Works of Charity, Fraternity, Stewardship, and Asceticism
- **Progress tracking** with a visual progress bar and day counter
- **Daily notes** with auto-save
- **Date navigation** across the liturgical year, with Seasons computed for any date, and a “Go to Today” shortcut
- **Weekly item tracking** (e.g., 2/3 exercise sessions completed this week)
- **Offline support** via Service Worker with cache-first strategy
- **Optional user accounts** for syncing data across multiple devices
- **Brother accountability** — invite a brother to see each other’s progress
- **Installable** as a standalone app on mobile (PWA) or via the Android TWA wrapper

## Tech Stack

- **Frontend:** Vanilla HTML, CSS, and JavaScript (no frameworks, no build step)
- **Backend:** PHP + MySQL
- **Auth:** Token-based (64-character hex Bearer tokens)
- **Hosting:** Apache with HTTPS

## Project Structure

```
/                        Root (single-page app)
├── index.html           App entry point
├── calendar.js          Liturgical calendar (Seasons, Fast/Abstinence days)
├── app.js               Application logic
├── style.css            Styling (CSS custom properties, mobile-first)
├── sw.js                Service Worker
├── manifest.json        PWA manifest
├── HORARIUM-NAME.md     Naming decision record
├── CONTEXT.md           Domain glossary
├── .htaccess            Apache rewrites & SW cache control
├── test/                Liturgical calendar tests (npm test)
├── api/                 PHP API endpoints
│   ├── config.php       DB connection, CORS, auth helpers
│   ├── login.php        Authentication
│   ├── register.php     Account creation
│   ├── data.php         Checklist data sync (GET/POST)
│   ├── logout.php       Token invalidation
│   └── private/         Credentials & schema (not served by HTTP)
├── android-twa/         Android Trusted Web Activity wrapper
├── documents/           Planning docs & specs
├── favicon_io/          Icons and favicons
└── .well-known/         Digital Asset Links for Android app verification
```

## Data Sync

Checklist data is stored in `localStorage` for offline use. Users who create an account get automatic server sync with timestamp-based conflict resolution (most recent change wins).

## Setup

1. Serve the project root with Apache (HTTPS recommended). Canonical host: `horarium.us`.
2. Copy `api/private/secrets.example.php` to `api/private/secrets.php` and fill in your MySQL credentials.
3. Run the SQL scripts in `api/private/` to create the database tables.

Run the Liturgical calendar tests with `npm test` (Node's built-in `node --test`, no dependencies).
4. Visit the app in a browser and optionally install it to your home screen.

## Non-affiliation

Horarium is an independent, open-source project built by and for a parish men’s group. It is not affiliated with, endorsed by, sponsored by, or connected to XDS, Inc., Exodus, Inc., or the Exodus 90 or Exodus 40 programs. “Exodus 90” and “Exodus 40” are referenced here only descriptively, to acknowledge an influence on this project’s approach to fraternity-based ascetical practice. All trademarks are the property of their respective owners.

See [HORARIUM-NAME.md](./HORARIUM-NAME.md) for the full naming decision record.

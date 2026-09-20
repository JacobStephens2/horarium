#!/usr/bin/env node
// Build the www/ directory Capacitor syncs. Rewrite API_BASE so fetch()
// works when the WebView origin is not horarium.us.

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'www');
const REMOTE_API = 'https://horarium.us/api';

function rmrf(target) {
  if (!fs.existsSync(target)) return;
  for (const entry of fs.readdirSync(target)) {
    const full = path.join(target, entry);
    const stat = fs.lstatSync(full);
    if (stat.isDirectory()) rmrf(full);
    else fs.unlinkSync(full);
  }
  fs.rmdirSync(target);
}

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src)) {
    const s = path.join(src, entry);
    const d = path.join(dst, entry);
    const stat = fs.lstatSync(s);
    if (stat.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

rmrf(OUT);
fs.mkdirSync(OUT, { recursive: true });

// Top-level files
for (const file of ['index.html', 'app.js', 'style.css', 'manifest.json']) {
  fs.copyFileSync(path.join(ROOT, file), path.join(OUT, file));
}

// Icons
copyDir(path.join(ROOT, 'favicon_io'), path.join(OUT, 'favicon_io'));

// Rewrite API_BASE in app.js to hit the remote origin
const appJsPath = path.join(OUT, 'app.js');
let appJs = fs.readFileSync(appJsPath, 'utf8');
const before = appJs;
appJs = appJs.replace(
  /var API_BASE = '\.\/api';/,
  `var API_BASE = '${REMOTE_API}';`
);
if (appJs === before) {
  console.error('build-www: failed to rewrite API_BASE in app.js');
  process.exit(1);
}
fs.writeFileSync(appJsPath, appJs);

fs.mkdirSync(path.join(OUT, 'scripts'), { recursive: true });
fs.copyFileSync(
  path.join(ROOT, 'scripts', 'capacitor-native.js'),
  path.join(OUT, 'scripts', 'capacitor-native.js')
);

// Live origin registers its own SW; don't ship one in the bundled copy.
let appJs2 = fs.readFileSync(appJsPath, 'utf8');
appJs2 = appJs2.replace(
  /if \('serviceWorker' in navigator\) \{[\s\S]*?\n  \}/,
  '// service worker disabled in native build'
);
fs.writeFileSync(appJsPath, appJs2);

console.log('build-www: wrote', OUT);

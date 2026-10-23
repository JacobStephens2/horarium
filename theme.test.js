const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { memoryStorage } = require('./memory-storage');
const { loadPage, button, flush } = require('./page-harness');

function theme(document) {
  return document.documentElement.getAttribute('data-theme');
}

function pressed(document, label) {
  const btn = button(document, label);
  assert.ok(btn, 'theme option ' + label + ' exists');
  return btn.getAttribute('aria-pressed') === 'true';
}

describe('appearance mode', function () {
  it('follows the OS in System mode and persists an explicit choice', async function () {
    const storage = memoryStorage();
    const document = loadPage(storage, [], {});
    await flush();

    assert.equal(theme(document), 'light');
    assert.equal(pressed(document, 'System'), true);

    button(document, 'Dark').click();
    assert.equal(theme(document), 'dark');
    assert.equal(storage.getItem('horarium-theme'), 'dark');
    assert.equal(pressed(document, 'Dark'), true);

    const reloaded = loadPage(storage, [], {});
    await flush();
    assert.equal(theme(reloaded), 'dark');
    assert.equal(pressed(reloaded, 'Dark'), true);
  });

  it('resolves System to dark on a dark OS and tracks OS changes', async function () {
    const storage = memoryStorage();
    const document = loadPage(storage, [], { osDark: true });
    await flush();

    assert.equal(theme(document), 'dark');

    document.__setOsDark(false);
    assert.equal(theme(document), 'light');
    assert.equal(storage.getItem('horarium-theme'), null);

    button(document, 'Light').click();
    document.__setOsDark(true);
    assert.equal(theme(document), 'light');
    assert.equal(storage.getItem('horarium-theme'), 'light');
  });

  it('falls back to System for an unknown stored value', async function () {
    const storage = memoryStorage([['horarium-theme', 'midnight']]);
    const document = loadPage(storage, [], {});
    await flush();

    assert.equal(theme(document), 'light');
    assert.equal(pressed(document, 'System'), true);
  });
});

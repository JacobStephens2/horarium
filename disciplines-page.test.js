const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createDeviceRows } = require('./device-rows');
const { memoryStorage } = require('./memory-storage');
const {
  todayStr,
  jsonResponse,
  loadPage,
  button,
  checklistBox,
  fireChange,
  disciplineBox,
  alcoholEnabled,
  flush
} = require('./page-harness');

function checklistLabel(document, labelText) {
  return document.walk().find(function (el) {
    return el.className === 'item-label' && el.textContent === labelText;
  }) || null;
}

function hintFor(document, labelText) {
  const label = checklistLabel(document, labelText);
  const hint = label.parentNode.children.find(function (el) {
    return el.className === 'item-hint';
  });
  return hint ? hint.textContent : '';
}

function badgeFor(document, labelText) {
  const label = checklistLabel(document, labelText);
  return label.parentNode.children.find(function (el) {
    return String(el.className).indexOf('weekly-badge') !== -1;
  });
}

function anchorLabel(document, labelText) {
  return document.walk().find(function (el) {
    return el.className === 'anchor-item-label' && el.textContent === labelText;
  }) || null;
}

function descendants(el) {
  const acc = [];
  (function visit(node) {
    acc.push(node);
    const children = node.children || [];
    for (let i = 0; i < children.length; i++) visit(children[i]);
  })(el);
  return acc;
}

describe('disciplines on the page', function () {
  it('shows a brother card from the brother\'s settings and items, not this device\'s checklist', async function () {
    const today = todayStr();
    const storage = memoryStorage();
    const rows = createDeviceRows(storage);
    rows.assignExistingRows(null);
    rows.write('ada@example.com', {
      checklist: { [today]: { 'prayer-readings': true } },
      disciplineSettings: {},
      disciplineSettingsUpdatedAt: 1000
    });
    storage.setItem('horarium-token', 'token-ada');
    storage.setItem('horarium-username', 'ada@example.com');

    const document = loadPage(storage, [], {
      before(request) {
        if (request.url.indexOf('anchors.php') !== -1 && request.method === 'GET') {
          return Promise.resolve(jsonResponse({
            incoming: [],
            outgoing: [],
            pairs: [{
              pair_id: 7,
              username: 'bea@example.com',
              prefs: { 'asceticism-alcohol': false },
              today: {
                date_str: '2026-01-15',
                items: { 'prayer-holyhour': true }
              }
            }]
          }));
        }
      }
    });
    await flush();

    const toggle = document.walk().find(function (el) {
      return el.tagName === 'BUTTON' && String(el.className).indexOf('anchors-toggle') !== -1;
    });
    toggle.click();
    await flush();

    const holyHour = anchorLabel(document, 'Make a holy half hour');
    assert.ok(holyHour, 'brother card shows the holy half hour');
    assert.notEqual(String(holyHour.parentNode.className).indexOf('checked'), -1);
    assert.equal(anchorLabel(document, 'No alcohol'), null);
    const card = document.walk().find(function (el) { return el.className === 'anchor-card'; });
    assert.equal(descendants(card).some(function (el) {
      return String(el.className).indexOf('weekly-badge') !== -1;
    }), false);
    const subheader = descendants(card).find(function (el) {
      return el.className === 'anchor-card-subheader';
    });
    assert.equal(subheader.textContent, 'Thursday, January 15');
    assert.notEqual(document.getElementById('current-date').textContent, subheader.textContent);
    const meta = descendants(card).find(function (el) {
      return el.className === 'anchor-card-meta';
    });
    assert.equal(meta.textContent, '1 / 14 today');
    const username = descendants(card).find(function (el) {
      return el.className === 'anchor-username';
    });
    assert.equal(username.textContent, 'bea@example.com');

    assert.equal(checklistBox(document, 'Read Mass readings').checked, true);
    assert.equal(checklistBox(document, 'Make a holy half hour').checked, false);
    assert.ok(checklistLabel(document, 'No alcohol'));
    assert.equal(alcoholEnabled(document), true);
    assert.deepEqual(rows.read('ada@example.com').checklist, {
      [today]: { 'prayer-readings': true }
    });
    assert.deepEqual(rows.read('ada@example.com').disciplineSettings, {});
  });

  it('removes No alcohol from the checklist when it is turned off', async function () {
    const storage = memoryStorage();
    const document = loadPage(storage, []);
    await flush();

    const today = todayStr();
    const parts = today.split('-');
    const readings = document.walk().find(function (el) { return el.className === 'readings-link'; });
    assert.equal(
      readings.getAttribute('href'),
      'https://bible.usccb.org/bible/readings/' + parts[1] + parts[2] + parts[0].slice(2) + '.cfm'
    );
    assert.equal(readings.parentNode.children.find(function (el) {
      return el.className === 'item-label';
    }).textContent, 'Read Mass readings');

    const examples = button(document, 'Show examples');
    const details = examples.parentNode.children.find(function (el) {
      return el.className === 'item-details';
    });
    assert.equal(examples.parentNode.children.find(function (el) {
      return el.className === 'item-label';
    }).textContent, 'Perform one work of charity');
    assert.match(details.children[0].innerHTML, /<strong>Corporal:<\/strong> Feed the hungry/);
    assert.match(details.children[1].innerHTML, /<strong>Spiritual:<\/strong> Instruct the ignorant/);

    assert.equal(hintFor(document, 'Exercise'), '3 times this week');
    assert.equal(hintFor(document, 'Give alms'), 'Weekly discipline');
    assert.equal(hintFor(document, 'Read Mass readings'), '');
    assert.equal(badgeFor(document, 'Exercise').textContent, '0/3 this week');
    assert.equal(badgeFor(document, 'Give alms').textContent, 'this week');
    assert.equal(disciplineBox(document, 'Fast').checked, true);

    const before = document.getElementById('progress-text').textContent;
    const match = before.match(/^0 \/ (\d+) disciplines$/);
    assert.ok(match, before);
    const total = Number(match[1]);
    assert.ok(checklistLabel(document, 'No alcohol'));

    const setting = disciplineBox(document, 'No alcohol');
    setting.checked = false;
    fireChange(setting);

    assert.equal(checklistLabel(document, 'No alcohol'), null);
    assert.equal(disciplineBox(document, 'No alcohol').checked, false);
    assert.equal(disciplineBox(document, 'Fast').checked, true);
    assert.ok(checklistLabel(document, 'Make a holy half hour'));
    assert.equal(
      document.getElementById('progress-text').textContent,
      '0 / ' + (total - 1) + ' disciplines'
    );
    assert.equal(createDeviceRows(storage).read(null).disciplineSettings['asceticism-alcohol'], false);

    const notes = document.getElementById('daily-notes');
    notes.value = 'still typing';
    const extra = document.createElement('input');
    extra.setAttribute('type', 'checkbox');
    extra.checked = true;
    document.getElementById('checklist').appendChild(extra);
    const alms = checklistBox(document, 'Give alms');
    alms.checked = true;
    fireChange(alms);

    assert.equal(document.getElementById('daily-notes'), notes);
    assert.equal(notes.value, 'still typing');
    assert.equal(badgeFor(document, 'Give alms').textContent, '\u2713 this week');
    assert.notEqual(String(badgeFor(document, 'Give alms').className).indexOf('complete'), -1);
    assert.equal(badgeFor(document, 'Exercise').textContent, '0/3 this week');
    assert.equal(
      document.getElementById('progress-text').textContent,
      '1 / ' + (total - 1) + ' disciplines'
    );
    assert.equal(document.querySelector('.all-done'), null);
  });
});

const fs = require('fs');
const path = require('path');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const STYLE_MOCK = path.join(__dirname, 'style', 'code.html');

function scriptOpenTags(html) {
  const tags = [];
  const re = /<script\b[^>]*>/gi;
  let match;
  while ((match = re.exec(html)) !== null) tags.push(match[0]);
  return tags;
}

function scriptSrc(tag) {
  const match = tag.match(/\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/i);
  if (!match) return null;
  return (match[1] || match[2] || match[3] || '').trim();
}

function isRemoteScript(src) {
  return /^https?:/i.test(src) || src.slice(0, 2) === '//';
}

describe('style mock page', function () {
  it('loads no remote script', function () {
    const html = fs.readFileSync(STYLE_MOCK, 'utf8').replace(/<!--[\s\S]*?-->/g, '');
    const remote = scriptOpenTags(html).map(scriptSrc).filter(function (src) {
      return src && isRemoteScript(src);
    });
    assert.deepEqual(remote, []);
  });
});

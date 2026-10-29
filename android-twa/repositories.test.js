const fs = require('fs');
const path = require('path');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const TWA_BUILD = path.join(__dirname, 'build.gradle');

function balancedBody(source, openBrace) {
  let depth = 0;
  for (let i = openBrace; i < source.length; i++) {
    const ch = source[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(openBrace + 1, i);
    }
  }
  throw new Error('unbalanced braces in ' + TWA_BUILD);
}

function namedBlock(source, name) {
  const re = new RegExp('(?:^|\\n)\\s*' + name + '\\s*\\{');
  const match = re.exec(source);
  if (!match) throw new Error('missing ' + name + ' block in ' + TWA_BUILD);
  const open = match.index + match[0].lastIndexOf('{');
  return balancedBody(source, open);
}

function repositoryCalls(block) {
  const body = namedBlock(block, 'repositories');
  const calls = [];
  const re = /([A-Za-z_][A-Za-z0-9_]*)\s*\(\s*\)/g;
  let match;
  while ((match = re.exec(body)) !== null) calls.push(match[1]);
  return calls;
}

function centralOrJcenter(calls) {
  return calls.filter(function (name) {
    return name === 'mavenCentral' || name === 'jcenter';
  });
}

describe('Trusted Web Activity Gradle repositories', function () {
  const gradle = fs.readFileSync(TWA_BUILD, 'utf8');

  it('resolves the buildscript classpath from Maven Central, not JCenter', function () {
    const calls = repositoryCalls(namedBlock(gradle, 'buildscript'));
    assert.deepEqual(centralOrJcenter(calls), ['mavenCentral']);
  });

  it('resolves project dependencies from Maven Central, not JCenter', function () {
    const calls = repositoryCalls(namedBlock(gradle, 'allprojects'));
    assert.deepEqual(centralOrJcenter(calls), ['mavenCentral']);
  });
});

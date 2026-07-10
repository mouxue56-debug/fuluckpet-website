'use strict';

const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');

test('every tracked iframe has an accessible title', () => {
  const files = childProcess.execFileSync('git', ['ls-files', '*.html'], {
    cwd: root,
    encoding: 'utf8',
  }).trim().split('\n').filter(Boolean);

  for (const file of files) {
    const html = fs.readFileSync(path.join(root, file), 'utf8');
    for (const match of html.matchAll(/<iframe\b[^>]*>/gi)) {
      const priorOpen = html.lastIndexOf('<', match.index - 1);
      const priorClose = html.lastIndexOf('>', match.index - 1);
      if (priorOpen > priorClose) continue; // literal example inside an attribute
      assert.match(match[0], /\btitle=["'][^"']+["']/i, `${file}: iframe needs a title`);
    }
  }
});

'use strict';

const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const ORIGIN = 'https://fuluckpet.com';

test('same-origin Open Graph and Twitter images exist in the static site', () => {
  const files = childProcess.execFileSync('git', ['ls-files', '*.html'], {
    cwd: ROOT,
    encoding: 'utf8',
  }).trim().split('\n').filter(Boolean);
  const missing = [];

  for (const relative of files) {
    const html = fs.readFileSync(path.join(ROOT, relative), 'utf8');
    const base = new URL(relative, `${ORIGIN}/`);
    const pattern = /<meta\b[^>]*(?:property|name)=["'](?:og:image|twitter:image)["'][^>]*content=["']([^"']+)["'][^>]*>/gi;
    for (const match of html.matchAll(pattern)) {
      let url;
      try {
        url = new URL(match[1], base);
      } catch (_) {
        missing.push(`${relative} -> invalid ${match[1]}`);
        continue;
      }
      if (url.origin !== ORIGIN) continue;
      const local = decodeURIComponent(url.pathname).replace(/^\/+/, '');
      if (!local || !fs.existsSync(path.join(ROOT, local))) {
        missing.push(`${relative} -> ${url.pathname}`);
      }
    }
  }

  assert.deepEqual(missing, [], `missing social preview images:\n${missing.join('\n')}`);
});

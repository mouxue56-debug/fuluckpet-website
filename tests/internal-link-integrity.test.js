'use strict';

const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const ORIGIN = 'https://fuluckpet.com';

function trackedHtml() {
  return childProcess.execFileSync('git', ['ls-files', '*.html'], {
    cwd: ROOT,
    encoding: 'utf8',
  }).trim().split('\n').filter(Boolean);
}

function localCandidates(pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch (_) {
    return [];
  }
  const relative = decoded.replace(/^\/+/, '');
  if (!relative) return ['index.html'];
  if (relative.endsWith('/')) return [relative + 'index.html'];
  if (path.extname(relative)) return [relative];
  return [relative, `${relative}.html`, path.join(relative, 'index.html')];
}

test('tracked HTML does not link visitors to missing same-origin pages or assets', () => {
  const broken = [];

  for (const relative of trackedHtml()) {
    const html = fs.readFileSync(path.join(ROOT, relative), 'utf8')
      .replace(/<!--[\s\S]*?-->/g, '');
    const base = new URL(relative, `${ORIGIN}/`);
    for (const match of html.matchAll(/\b(?:href|src)\s*=\s*["']([^"']+)["']/gi)) {
      const raw = match[1].trim();
      if (!raw || raw.startsWith('#') || raw.includes('${') || raw.includes('{{')) continue;
      if (/^(?:data|mailto|tel|javascript|blob):/i.test(raw)) continue;

      let resolved;
      try {
        resolved = new URL(raw, base);
      } catch (_) {
        broken.push(`${relative} -> invalid URL ${raw}`);
        continue;
      }
      if (resolved.origin !== ORIGIN || resolved.pathname.startsWith('/api/')) continue;

      const candidates = localCandidates(resolved.pathname);
      if (!candidates.some((candidate) => fs.existsSync(path.join(ROOT, candidate)))) {
        broken.push(`${relative} -> ${resolved.pathname}`);
      }
    }
  }

  assert.deepEqual(broken, [], `broken local references:\n${broken.join('\n')}`);
});

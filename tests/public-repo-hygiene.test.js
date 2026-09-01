const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');
const { readFileSync } = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

function git(args) {
  return execFileSync('git', args, {
    cwd: ROOT,
    encoding: 'utf8',
  });
}

test('public repository tracks no root Markdown manuals except README', () => {
  const trackedRootMarkdown = git(['ls-files', '*.md'])
    .split('\n')
    .filter(Boolean)
    .filter((file) => !file.includes('/'))
    .filter((file) => file !== 'README.md');

  assert.deepEqual(
    trackedRootMarkdown,
    [],
    `internal root manuals would be published by Pages: ${trackedRootMarkdown.join(', ')}`,
  );
});

test('gitignore blocks internal root manuals while keeping README publishable', () => {
  const internal = spawnSync(
    'git',
    ['check-ignore', '--no-index', '--quiet', 'HANDOVER-CODEX.md'],
    { cwd: ROOT },
  );
  const readme = spawnSync(
    'git',
    ['check-ignore', '--no-index', '--quiet', 'README.md'],
    { cwd: ROOT },
  );

  assert.equal(internal.status, 0, 'internal root manuals must be ignored');
  assert.equal(readme.status, 1, 'README.md must remain publishable');
});

test('public repository tracks no local superpowers review artifacts', () => {
  const tracked = git(['ls-files', '.superpowers/**'])
    .split('\n')
    .filter(Boolean);

  assert.deepEqual(
    tracked,
    [],
    `local .superpowers artifacts would be published by Pages: ${tracked.join(', ')}`,
  );
});

test('future Koneko snapshots and backups are ignored while sync has no tracked-snapshot default', () => {
  const snapshot = spawnSync(
    'git',
    ['check-ignore', '--no-index', '--quiet', 'tools/koneko-snapshot.json'],
    { cwd: ROOT },
  );
  const backup = spawnSync(
    'git',
    ['check-ignore', '--no-index', '--quiet', '_backups/kittens-test.json'],
    { cwd: ROOT },
  );
  const syncSource = readFileSync(path.join(ROOT, 'tools/sync-koneko.js'), 'utf8');

  assert.equal(snapshot.status, 0, 'future private snapshots must be ignored even while the current file stays tracked');
  assert.equal(backup.status, 0, 'repository-local backups must be ignored');
  assert.doesNotMatch(syncSource, /koneko-snapshot\.json/, 'sync must require an explicit external snapshot');
});

const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');
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

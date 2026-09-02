import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const PREFLIGHT = fileURLToPath(new URL('../tools/preflight.js', import.meta.url));

function gitStatus() {
  return execFileSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' });
}

test('release state accepts an up-to-date feature branch and rejects unsafe refs or trees', async () => {
  const { classifyReleaseState } = await import('../tools/preflight.js');

  assert.equal(classifyReleaseState({ branch: 'feature/trust', originAvailable: true, behind: 0, ahead: 3, dirty: false }).status, 'GREEN');
  assert.equal(classifyReleaseState({ branch: 'feature/trust', originAvailable: true, behind: 1, ahead: 3, dirty: false }).status, 'RED');
  assert.equal(classifyReleaseState({ branch: 'feature/trust', originAvailable: true, behind: 0, ahead: 3, dirty: true }).status, 'RED');
  assert.equal(classifyReleaseState({ branch: 'HEAD', originAvailable: true, behind: 0, ahead: 0, dirty: false }).status, 'RED');
  assert.equal(classifyReleaseState({ branch: 'main', originAvailable: true, behind: 0, ahead: 1, dirty: false }).status, 'RED');
  assert.equal(classifyReleaseState({ branch: 'feature/trust', originAvailable: false, behind: 0, ahead: 0, dirty: false }).status, 'RED');
});

test('node pin must be one valid major and must match the running major', async () => {
  const { classifyNode } = await import('../tools/preflight.js');

  assert.equal(classifyNode('24\n', '24.3.0').status, 'GREEN');
  assert.equal(classifyNode('v24', '24.0.0').status, 'GREEN');
  assert.equal(classifyNode('24\n', '22.22.3').status, 'RED');
  assert.equal(classifyNode('0', '0.0.0').status, 'RED');
  assert.equal(classifyNode('', '24.0.0').status, 'RED');
  assert.equal(classifyNode('24\n25\n', '24.0.0').status, 'RED');
  assert.equal(classifyNode('latest', '24.0.0').status, 'RED');
});

test('required entries must be tracked non-symlink regular files', async () => {
  const { classifyRequiredPathEntry } = await import('../tools/preflight.js');

  assert.equal(classifyRequiredPathEntry({ exists: true, isFile: true, isSymbolicLink: false, headMode: '100644' }).status, 'GREEN');
  assert.equal(classifyRequiredPathEntry({ exists: true, isFile: true, isSymbolicLink: false, headMode: '100755' }).status, 'GREEN');
  assert.equal(classifyRequiredPathEntry({ exists: false }).status, 'RED');
  assert.equal(classifyRequiredPathEntry({ exists: true, isFile: false, isSymbolicLink: false, headMode: '100644' }).status, 'RED');
  assert.equal(classifyRequiredPathEntry({ exists: true, isFile: true, isSymbolicLink: true, headMode: '100644' }).status, 'RED');
  assert.equal(classifyRequiredPathEntry({ exists: true, isFile: true, isSymbolicLink: false, headMode: '' }).status, 'RED');
  assert.equal(classifyRequiredPathEntry({ exists: true, isFile: true, isSymbolicLink: false, headMode: '120000' }).status, 'RED');
  assert.equal(classifyRequiredPathEntry({ exists: true, isFile: true, isSymbolicLink: false, headMode: '040000' }).status, 'RED');
});

test('required-path check reports every missing workflow or safety module', async () => {
  const { missingRequiredPaths, REQUIRED_PATHS } = await import('../tools/preflight.js');
  const present = new Set(REQUIRED_PATHS.filter((path) => !path.includes('seo-geo') && !path.includes('active-mirror')));

  assert.deepEqual(
    missingRequiredPaths(REQUIRED_PATHS, present),
    ['.github/workflows/seo-geo-quality.yml', 'tools/lib/koneko-active-mirror.js'],
  );
  assert.deepEqual(missingRequiredPaths(REQUIRED_PATHS, new Set(REQUIRED_PATHS)), []);
});

test('backup-ignore verdict blocks a checkout that could track private backups', async () => {
  const { classifyBackupsIgnored } = await import('../tools/preflight.js');

  assert.equal(classifyBackupsIgnored(true).status, 'GREEN');
  assert.equal(classifyBackupsIgnored(false).status, 'RED');
});

test('preflight source stays read-only, local-only, and outside the catalogue snapshot boundary', () => {
  const source = readFileSync(PREFLIGHT, 'utf8');

  for (const forbidden of [
    'writeFileSync', 'appendFileSync', 'mkdirSync', 'rmSync', 'unlinkSync', 'renameSync',
    'copyFileSync', 'chmodSync', 'JSON.parse', 'fetch(', 'http:', 'https:',
    'FULUCK_ADMIN_PASS', '--apply', '--deploy', 'koneko-snapshot.json',
  ]) {
    assert.equal(source.includes(forbidden), false, `preflight must not contain ${forbidden}`);
  }
  for (const forbidden of ['fetch', 'checkout', 'merge', 'stash', 'pull', 'push', 'reset']) {
    assert.equal(new RegExp(`['\"]${forbidden}['\"]`).test(source), false, `preflight must not run git ${forbidden}`);
  }
});

test('CLI reports its read-only verdict and leaves the worktree unchanged', () => {
  const before = gitStatus();
  const run = spawnSync(process.execPath, [PREFLIGHT], { cwd: ROOT, encoding: 'utf8' });

  assert.equal(run.error, undefined, `preflight failed to start: ${run.error?.message}`);
  assert.match(run.stdout, /preflight \(read-only\)/);
  assert.equal(
    run.status,
    /blocking static release check\(s\) failed/.test(run.stdout) ? 1 : 0,
    'preflight exit code must match its reported blocking verdict',
  );
  assert.equal(gitStatus(), before, 'preflight must not change the working tree');
});

test('CLI resolves its repository root independently of the caller cwd', () => {
  const run = spawnSync(process.execPath, [PREFLIGHT], { cwd: tmpdir(), encoding: 'utf8' });

  assert.equal(run.error, undefined, `preflight failed to start: ${run.error?.message}`);
  assert.equal(run.stdout.includes(resolve(ROOT)), true);
});

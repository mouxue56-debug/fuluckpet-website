import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  assertFreshKonekoSnapshot,
  MAX_SNAPSHOT_AGE_MS,
} from '../tools/lib/koneko-snapshot-freshness.js';

const SYNC_SOURCE = readFileSync(new URL('../tools/sync-koneko.js', import.meta.url), 'utf8');

test('requires a strict RFC3339 timestamp and rejects stale, invalid, or future snapshots', () => {
  const now = Date.parse('2026-08-11T14:00:00.000Z');

  assert.doesNotThrow(() => assertFreshKonekoSnapshot({
    capturedAt: new Date(now - MAX_SNAPSHOT_AGE_MS + 1).toISOString(),
  }, now));
  assert.throws(() => assertFreshKonekoSnapshot({
    capturedAt: new Date(now - MAX_SNAPSHOT_AGE_MS - 1).toISOString(),
  }, now), /古すぎます/);
  assert.throws(() => assertFreshKonekoSnapshot({ capturedAt: 'not-a-date' }, now), /RFC3339/);
  assert.throws(() => assertFreshKonekoSnapshot({ capturedAt: '2026-08-11' }, now), /RFC3339/);
  assert.throws(() => assertFreshKonekoSnapshot({ capturedAt: '2026-08-11T22:30:00' }, now), /RFC3339/);
  assert.throws(() => assertFreshKonekoSnapshot({ capturedAt: '2026-02-30T12:00:00+09:00' }, now), /capturedAt.*不正/);
  assert.throws(() => assertFreshKonekoSnapshot({
    capturedAt: new Date(now + 5 * 60 * 1000 + 1).toISOString(),
  }, now), /未来/);
});

test('accepts the exact age and clock-skew boundaries', () => {
  const now = Date.parse('2026-08-11T14:00:00.000Z');
  assert.doesNotThrow(() => assertFreshKonekoSnapshot({
    capturedAt: new Date(now - MAX_SNAPSHOT_AGE_MS).toISOString(),
  }, now));
  assert.doesNotThrow(() => assertFreshKonekoSnapshot({
    capturedAt: new Date(now + 5 * 60 * 1000).toISOString(),
  }, now));
});

test('sync checks snapshot freshness before credentials or any remote read and force cannot bypass it', () => {
  const guard = SYNC_SOURCE.indexOf('assertFreshKonekoSnapshot(SNAP)');
  const credential = SYNC_SOURCE.indexOf("if (!PASS) die(");
  const firstRemoteRead = SYNC_SOURCE.indexOf('await fetch(`${WORKER}/api/admin/kittens`');

  assert.ok(guard > -1, 'sync must invoke the freshness guard');
  assert.ok(guard < credential, 'stale snapshots must fail before credentials are considered');
  assert.ok(guard < firstRemoteRead, 'stale snapshots must fail before any remote catalogue read');
  assert.doesNotMatch(SYNC_SOURCE, /if\s*\(\s*!?FORCE[^)]*\)\s*assertFreshKonekoSnapshot/);
});

test('a stale fixture fails locally even with force and emits a concise operator message', (t) => {
  const syncPath = fileURLToPath(new URL('../tools/sync-koneko.js', import.meta.url));
  const fixtureDir = mkdtempSync(join(tmpdir(), 'fuluck-stale-koneko-'));
  t.after(() => rmSync(fixtureDir, { recursive: true, force: true }));
  const fixturePath = join(fixtureDir, 'snapshot.json');
  writeFileSync(fixturePath, JSON.stringify({
    capturedAt: '2026-01-01T00:00:00+09:00',
    accounts: {},
    reservedIds: [],
    kittens: [],
  }), { mode: 0o600 });
  const result = spawnSync(process.execPath, [syncPath, '--force', '--snapshot', fixturePath], {
    encoding: 'utf8',
    env: { ...process.env, FULUCK_ADMIN_PASS: 'test-only-pass' },
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /スナップショットが古すぎます.*2026-01-01/);
  assert.doesNotMatch(result.stderr, /\n\s+at /);
});

test('snapshot treats a following option as a missing path and stays concise', () => {
  const syncPath = fileURLToPath(new URL('../tools/sync-koneko.js', import.meta.url));
  const result = spawnSync(process.execPath, [syncPath, '--snapshot', '--force'], {
    encoding: 'utf8',
    env: { ...process.env, FULUCK_ADMIN_PASS: 'test-only-pass' },
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /--snapshot の後に JSON ファイル/);
  assert.doesNotMatch(result.stderr, /ENOENT|\n\s+at /);
});

test('sync rejects a non-file snapshot and a path replaced while it is being validated', (t) => {
  const syncPath = fileURLToPath(new URL('../tools/sync-koneko.js', import.meta.url));
  const fixtureDir = mkdtempSync(join(tmpdir(), 'fuluck-snapshot-race-'));
  t.after(() => rmSync(fixtureDir, { recursive: true, force: true }));
  const directoryPath = join(fixtureDir, 'not-a-file');
  const snapshotPath = join(fixtureDir, 'snapshot.json');
  const replacementPath = join(fixtureDir, 'replacement.json');
  const preloadPath = join(fixtureDir, 'swap-after-open.mjs');
  const snapshot = JSON.stringify({
    capturedAt: new Date().toISOString(),
    accounts: { test: 'test account' },
    reservedIds: [],
    kittens: [{ breederId: 'test-001', group: 'test', status: 'available' }],
  });
  mkdirSync(directoryPath, { mode: 0o700 });
  writeFileSync(snapshotPath, snapshot, { mode: 0o600 });
  writeFileSync(replacementPath, snapshot, { mode: 0o600 });
  writeFileSync(preloadPath, `
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
const originalRealpathSync = fs.realpathSync.bind(fs);
let swapped = false;
fs.realpathSync = (path, options) => {
  const result = originalRealpathSync(path, options);
  if (!swapped && path === process.env.FULUCK_TEST_SNAPSHOT_PATH) {
    fs.renameSync(path, path + '.opened');
    fs.copyFileSync(process.env.FULUCK_TEST_SNAPSHOT_REPLACEMENT, path);
    fs.chmodSync(path, 0o600);
    swapped = true;
  }
  return result;
};
syncBuiltinESMExports();
`, { mode: 0o600 });

  const directory = spawnSync(process.execPath, [syncPath, '--snapshot', directoryPath], {
    encoding: 'utf8',
    env: { ...process.env, FULUCK_ADMIN_PASS: '' },
  });
  assert.equal(directory.status, 1);
  assert.match(directory.stderr, /--snapshot.*通常の JSON ファイル/);
  assert.doesNotMatch(directory.stderr, /FULUCK_ADMIN_PASS|fetch failed|ENOTFOUND|ECONN/);

  const replaced = spawnSync(process.execPath, [
    '--import', preloadPath,
    syncPath,
    '--snapshot', snapshotPath,
  ], {
    encoding: 'utf8',
    env: {
      ...process.env,
      FULUCK_ADMIN_PASS: '',
      FULUCK_TEST_SNAPSHOT_PATH: snapshotPath,
      FULUCK_TEST_SNAPSHOT_REPLACEMENT: replacementPath,
    },
  });
  assert.equal(replaced.status, 1);
  assert.match(replaced.stderr, /--snapshot.*検証中に置き換え/);
  assert.doesNotMatch(replaced.stderr, /FULUCK_ADMIN_PASS|fetch failed|ENOTFOUND|ECONN/);
});

test('--apply rejects repository-local, symlinked, missing, or loosely permissioned backup directories before credentials', (t) => {
  const syncPath = fileURLToPath(new URL('../tools/sync-koneko.js', import.meta.url));
  const repoRoot = fileURLToPath(new URL('../', import.meta.url));
  const fixtureDir = mkdtempSync(join(tmpdir(), 'fuluck-backup-boundary-'));
  t.after(() => rmSync(fixtureDir, { recursive: true, force: true }));
  const snapshotPath = join(fixtureDir, 'snapshot.json');
  const backupTarget = join(fixtureDir, 'backup-target');
  const backupLink = join(fixtureDir, 'backup-link');
  const looseParent = join(fixtureDir, 'loose-parent');
  const looseBackup = join(looseParent, 'private-backups');
  const missingBackup = join(fixtureDir, 'missing-backup');
  writeFileSync(snapshotPath, JSON.stringify({
    capturedAt: new Date().toISOString(),
    accounts: { test: 'test account' },
    reservedIds: [],
    kittens: [{ breederId: 'test-001', group: 'test', status: 'available' }],
  }), { mode: 0o600 });
  mkdirSync(backupTarget, { mode: 0o700 });
  symlinkSync(backupTarget, backupLink, 'dir');
  mkdirSync(looseParent, { mode: 0o700 });
  mkdirSync(looseBackup, { mode: 0o700 });
  chmodSync(looseBackup, 0o770);

  const cases = [
    { path: join(repoRoot, '_backups'), error: /FULUCK_KONEKO_BACKUP_DIR.*リポジトリ外/ },
    { path: backupLink, error: /FULUCK_KONEKO_BACKUP_DIR.*シンボリックリンク/ },
    { path: missingBackup, error: /FULUCK_KONEKO_BACKUP_DIR.*既存/ },
    { path: looseBackup, error: /FULUCK_KONEKO_BACKUP_DIR.*0700/ },
  ];

  for (const backupCase of cases) {
    const result = spawnSync(process.execPath, [syncPath, '--apply', '--snapshot', snapshotPath], {
      encoding: 'utf8',
      env: {
        ...process.env,
        FULUCK_ADMIN_PASS: '',
        FULUCK_KONEKO_BACKUP_DIR: backupCase.path,
      },
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, backupCase.error);
    assert.doesNotMatch(result.stderr, /FULUCK_ADMIN_PASS|fetch failed|ENOTFOUND|ECONN/);
  }

  assert.equal(statSync(repoRoot).isDirectory(), true);
});

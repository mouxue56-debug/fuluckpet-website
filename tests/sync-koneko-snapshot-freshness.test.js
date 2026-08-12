import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
  }));
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

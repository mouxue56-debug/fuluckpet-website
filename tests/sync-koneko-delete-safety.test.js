import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const SYNC_PATH = fileURLToPath(new URL('../tools/sync-koneko.js', import.meta.url));

const unsafeCases = [
  { args: [], error: /--snapshot.*必須/ },
  { args: ['--snapshot', 'relative.json'], error: /絶対パス/ },
  { snapshotInsideRepo: true, error: /リポジトリ外/ },
  { snapshotMode: 0o644, error: /0600/ },
  { snapshotSymlink: true, error: /シンボリックリンク/ },
  { deleteRecordIds: [{ id: 'live-1', breederId: '2608-00001' }], error: /deleteRecordIds.*禁止/ },
];

function sourceKitten() {
  return {
    breederId: '2608-00001',
    group: 'c995680',
    status: 'available',
    breed: 'サイベリアン',
    color: 'blue',
    gender: 'female',
    price: 180000,
    birthday: '2026-06-01',
    photos: [],
    video: '',
    papa: '',
    mama: '',
    notes: {},
  };
}

function liveKitten(id = 'live-1', price = 180000) {
  return {
    id,
    breederId: '2608-00001',
    status: 'available',
    price,
    birthday: '2026-06-01',
    photos: [],
    coverIndex: 0,
    video: '',
    papa: '',
    mama: '',
    note: '',
    noteZh: '',
    noteEn: '',
  };
}

function writeSnapshot(path, deleteRecordIds = [], mode = 0o600) {
  writeFileSync(path, JSON.stringify({
    capturedAt: new Date().toISOString(),
    accounts: { c995680: 'public source account' },
    reservedIds: [],
    kittens: [sourceKitten()],
    parentsToCreate: [],
    deleteRecordIds,
  }), { mode });
  chmodSync(path, mode);
}

function writeNetworkGuard(path) {
  writeFileSync(path, `
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { syncBuiltinESMExports } from 'node:module';

const repo = path.resolve(process.env.FULUCK_TEST_REPO_ROOT);
const insideRepo = (value) => {
  if (typeof value === 'number') return false;
  const raw = value instanceof URL ? fileURLToPath(value) : String(value);
  const resolved = path.resolve(raw);
  return resolved === repo || resolved.startsWith(repo + path.sep);
};
const failRepoWrite = (name, value) => {
  if (!insideRepo(value)) return;
  fs.appendFileSync(process.env.FULUCK_TEST_REPO_WRITE_AUDIT, name + ':' + String(value) + '\\n');
  throw new Error('test blocked repository write: ' + name);
};
const wrapPathWrite = (name) => {
  const original = fs[name].bind(fs);
  fs[name] = (value, ...args) => {
    failRepoWrite(name, value);
    return original(value, ...args);
  };
};
for (const name of ['mkdirSync', 'writeFileSync', 'renameSync', 'rmSync', 'unlinkSync', 'copyFileSync']) {
  wrapPathWrite(name);
}
const originalOpenSync = fs.openSync.bind(fs);
fs.openSync = (value, flags, ...args) => {
  const writes = typeof flags === 'string'
    ? /[wax+]/.test(flags)
    : Boolean(flags & (fs.constants.O_WRONLY | fs.constants.O_RDWR | fs.constants.O_CREAT | fs.constants.O_TRUNC | fs.constants.O_APPEND));
  if (writes) failRepoWrite('openSync', value);
  return originalOpenSync(value, flags, ...args);
};
syncBuiltinESMExports();

const originalFsyncSync = fs.fsyncSync.bind(fs);
fs.fsyncSync = (fd) => {
  if (process.env.FULUCK_TEST_FAIL_FSYNC === '1') {
    fs.appendFileSync(process.env.FULUCK_TEST_FSYNC_AUDIT, 'failed\\n');
    throw new Error('test forced fsync failure');
  }
  const result = originalFsyncSync(fd);
  fs.appendFileSync(process.env.FULUCK_TEST_FSYNC_AUDIT, 'synced\\n');
  return result;
};
syncBuiltinESMExports();

const originalFetch = globalThis.fetch;
globalThis.fetch = (input, init = {}) => {
  const source = new URL(String(input));
  const target = new URL(source.pathname + source.search, process.env.FULUCK_TEST_TRAP_URL);
  return originalFetch(target, init);
};
`, { mode: 0o600 });
}

async function startTrap(t, live = [liveKitten()]) {
  const requests = [];
  const server = createServer((request, response) => {
    const method = request.method || 'GET';
    requests.push({ method, pathname: request.url });
    request.resume();
    request.on('end', () => {
      response.setHeader('Content-Type', 'application/json');
      if (method === 'GET' && request.url === '/api/admin/kittens') {
        response.end(JSON.stringify(live));
      } else if (method === 'GET' && request.url === '/api/parents') {
        response.end('[]');
      } else {
        response.end('{}');
      }
    });
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const address = server.address();
  return { requests, url: `http://127.0.0.1:${address.port}` };
}

function runSync(args, options) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['--import', options.guardPath, SYNC_PATH, ...args], {
      cwd: ROOT,
      env: {
        ...process.env,
        FULUCK_ADMIN_PASS: 'test-only-pass',
        FULUCK_TEST_TRAP_URL: options.trapUrl,
        FULUCK_TEST_REPO_ROOT: ROOT,
        FULUCK_TEST_REPO_WRITE_AUDIT: options.repoWriteAudit,
        FULUCK_TEST_FSYNC_AUDIT: options.fsyncAudit,
        ...(options.failFsync ? { FULUCK_TEST_FAIL_FSYNC: '1' } : {}),
        ...(options.backupDir ? { FULUCK_KONEKO_BACKUP_DIR: options.backupDir } : {}),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('close', (status) => resolve({ status, stderr, stdout }));
  });
}

function newFixture(t, prefix) {
  const fixtureDir = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  t.after(() => rmSync(fixtureDir, { recursive: true, force: true }));
  const guardPath = join(fixtureDir, 'network-guard.mjs');
  const repoWriteAudit = join(fixtureDir, 'repo-write-audit.txt');
  const fsyncAudit = join(fixtureDir, 'fsync-audit.txt');
  writeNetworkGuard(guardPath);
  return { fixtureDir, fsyncAudit, guardPath, repoWriteAudit };
}

test('unsafe snapshots and requested deletes fail before credentials, network, or writes', async (t) => {
  const fixture = newFixture(t, 'fuluck-zero-delete-boundary-');
  const trap = await startTrap(t);

  for (const unsafeCase of unsafeCases) {
    const snapshotPath = join(fixture.fixtureDir, `snapshot-${unsafeCases.indexOf(unsafeCase)}.json`);
    let args = unsafeCase.args || ['--snapshot', snapshotPath];

    if (unsafeCase.snapshotInsideRepo) {
      args = ['--snapshot', join(ROOT, '.nonexistent-private-snapshot.json')];
    } else if (unsafeCase.snapshotSymlink) {
      const targetPath = join(fixture.fixtureDir, 'private-snapshot-target.json');
      writeSnapshot(targetPath);
      symlinkSync(targetPath, snapshotPath);
    } else if (unsafeCase.snapshotMode) {
      writeSnapshot(snapshotPath, [], unsafeCase.snapshotMode);
    } else if (unsafeCase.deleteRecordIds) {
      writeSnapshot(snapshotPath, unsafeCase.deleteRecordIds);
      args = ['--apply', '--snapshot', snapshotPath];
    }

    const requestCountBefore = trap.requests.length;
    const result = await runSync(args, {
      ...fixture,
      trapUrl: trap.url,
      backupDir: join(fixture.fixtureDir, 'private-backups'),
    });

    assert.equal(result.status, 1, `${unsafeCase.error}: ${result.stderr}`);
    assert.match(result.stderr, unsafeCase.error);
    assert.equal(trap.requests.length, requestCountBefore, `${unsafeCase.error} must fail before network access`);
  }

  assert.equal(existsSync(fixture.repoWriteAudit), false, 'rejected cases must not attempt repository writes');
});

test('a safe dry-run uses only non-deleting methods against the local trap', async (t) => {
  const fixture = newFixture(t, 'fuluck-zero-delete-dry-run-');
  const snapshotPath = join(fixture.fixtureDir, 'snapshot.json');
  writeSnapshot(snapshotPath);
  const trap = await startTrap(t);

  const result = await runSync(['--snapshot', snapshotPath], {
    ...fixture,
    trapUrl: trap.url,
  });

  assert.equal(result.status, 0, result.stderr);
  assert.ok(trap.requests.length > 0);
  assert.ok(trap.requests.every(({ method }) => ['GET', 'POST', 'PUT'].includes(method)));
  assert.equal(trap.requests.some(({ method }) => method === 'DELETE'), false);
  assert.equal(existsSync(fixture.repoWriteAudit), false);
});

test('apply creates one durable mode-0600 backup before its first write request and never sends DELETE', async (t) => {
  const fixture = newFixture(t, 'fuluck-zero-delete-apply-');
  const snapshotPath = join(fixture.fixtureDir, 'snapshot.json');
  const backupDir = join(fixture.fixtureDir, 'private-backups');
  writeSnapshot(snapshotPath);
  mkdirSync(backupDir, { mode: 0o700 });
  chmodSync(backupDir, 0o700);

  const requestStates = [];
  const live = [liveKitten('live-1', 170000)];
  const server = createServer((request, response) => {
    const method = request.method || 'GET';
    const names = readdirSync(backupDir);
    const backupReady = names.length === 1
      && (statSync(join(backupDir, names[0])).mode & 0o777) === 0o600;
    const fsyncCount = existsSync(fixture.fsyncAudit)
      ? readFileSync(fixture.fsyncAudit, 'utf8').trim().split('\n').filter(Boolean).length
      : 0;
    requestStates.push({ method, pathname: request.url, backupReady, fsyncCount });
    request.resume();
    request.on('end', () => {
      response.setHeader('Content-Type', 'application/json');
      if (method === 'GET' && request.url === '/api/admin/kittens') response.end(JSON.stringify(live));
      else if (method === 'GET' && request.url === '/api/parents') response.end('[]');
      else response.end('{}');
    });
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const address = server.address();

  const result = await runSync(['--apply', '--snapshot', snapshotPath], {
    ...fixture,
    trapUrl: `http://127.0.0.1:${address.port}`,
    backupDir,
  });

  assert.equal(result.status, 0, result.stderr);
  const writeRequests = requestStates.filter(({ method }) => method === 'POST' || method === 'PUT');
  assert.ok(writeRequests.length > 0, 'fixture must exercise a remote write');
  assert.ok(writeRequests.every(({ backupReady }) => backupReady), 'request log must not begin a write before backup exists');
  assert.ok(writeRequests.every(({ fsyncCount }) => fsyncCount >= 2), 'backup file and directory fsyncs must precede writes');
  assert.equal(requestStates.some(({ method }) => method === 'DELETE'), false);
  assert.equal(statSync(backupDir).mode & 0o777, 0o700);
  const backupFiles = readdirSync(backupDir);
  assert.equal(backupFiles.length, 1);
  const backupPath = join(backupDir, backupFiles[0]);
  assert.equal(statSync(backupPath).mode & 0o777, 0o600);
  assert.deepEqual(JSON.parse(readFileSync(backupPath, 'utf8')), live);
  assert.equal(existsSync(fixture.repoWriteAudit), false, 'apply must never attempt a repository backup');
  assert.equal(existsSync(join(ROOT, '_backups')), false, 'apply must not create a repository backup directory');
});

test('apply revalidates backup directory privacy after remote reads and before opening a backup file', async (t) => {
  const fixture = newFixture(t, 'fuluck-backup-mode-race-');
  const snapshotPath = join(fixture.fixtureDir, 'snapshot.json');
  const backupDir = join(fixture.fixtureDir, 'private-backups');
  writeSnapshot(snapshotPath);
  mkdirSync(backupDir, { mode: 0o700 });
  chmodSync(backupDir, 0o700);

  const requests = [];
  const live = [liveKitten('live-1', 170000)];
  const server = createServer((request, response) => {
    const method = request.method || 'GET';
    requests.push({ method, pathname: request.url });
    request.resume();
    request.on('end', () => {
      response.setHeader('Content-Type', 'application/json');
      if (method === 'GET' && request.url === '/api/admin/kittens') {
        response.end(JSON.stringify(live));
      } else if (method === 'GET' && request.url === '/api/parents') {
        chmodSync(backupDir, 0o770);
        response.end('[]');
      } else {
        response.end('{}');
      }
    });
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const address = server.address();

  const result = await runSync(['--apply', '--snapshot', snapshotPath], {
    ...fixture,
    trapUrl: `http://127.0.0.1:${address.port}`,
    backupDir,
  });

  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /バックアップディレクトリ.*0700|バックアップディレクトリ.*権限|バックアップディレクトリ.*所有/);
  assert.equal(requests.some(({ method }) => method === 'POST' || method === 'PUT'), false);
  assert.deepEqual(readdirSync(backupDir), [], 'privacy change must be caught before backup-file creation');
  assert.equal(existsSync(fixture.repoWriteAudit), false);
});

test('a backup durability failure aborts before any POST or PUT', async (t) => {
  const fixture = newFixture(t, 'fuluck-zero-delete-fsync-failure-');
  const snapshotPath = join(fixture.fixtureDir, 'snapshot.json');
  const backupDir = join(fixture.fixtureDir, 'private-backups');
  writeSnapshot(snapshotPath);
  mkdirSync(backupDir, { mode: 0o700 });
  chmodSync(backupDir, 0o700);
  const trap = await startTrap(t, [liveKitten('live-1', 170000)]);

  const result = await runSync(['--apply', '--snapshot', snapshotPath], {
    ...fixture,
    backupDir,
    failFsync: true,
    trapUrl: trap.url,
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /test forced fsync failure/);
  assert.equal(trap.requests.some(({ method }) => method === 'POST' || method === 'PUT'), false);
  assert.equal(trap.requests.some(({ method }) => method === 'DELETE'), false);
  assert.equal(existsSync(fixture.repoWriteAudit), false);
});

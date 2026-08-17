import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';

const PROJECT = resolve(dirname(new URL(import.meta.url).pathname), '..');
const CLI = join(PROJECT, 'tools/audit-koneko-catalog.js');

const fixtureSource = String.raw`
import { writeFileSync } from 'node:fs';

if (process.env.AUDIT_FIXTURE_IMPORT_MARKER) {
  writeFileSync(process.env.AUDIT_FIXTURE_IMPORT_MARKER, 'imported', 'utf8');
}

const ids = new Map([
  ['c995680', '2608-00001'],
  ['d696506', '2608-00002'],
]);

function response(url, body, contentType) {
  return {
    status: 200,
    url,
    headers: { get(name) { return name.toLowerCase() === 'content-type' ? contentType : null; } },
    async text() { return body; },
  };
}

function listPage(accountId, breederId) {
  return '<html><body><div class="pagenation"><div>全<span class="totalNum">1</span>件中 1～1件を表示</div></div>' +
    '<ul><li class="Min_d-flex box02Inner"><div class="listLmtInfStt"><span class="sold">販売終了</span></div>' +
    '<a href="cat' + breederId + '.html"><img id="src_' + breederId + '"></a></li></ul></body></html>';
}

export default async function fixtureFetch(url, options) {
  const secret = process.env.AUDIT_TEST_SECRET || 'fixture-secret';
  if (process.env.AUDIT_FIXTURE_MODE === 'blocked') {
    throw new Error('Authorization: Bearer ' + secret);
  }
  if (options?.method !== 'GET' || options?.credentials !== 'omit' || options?.headers?.authorization) {
    throw new Error('credentialed request: ' + secret);
  }
  const parsed = new URL(url);
  if (parsed.hostname === 'www.koneko-breeder.com' && parsed.pathname === '/breederDetail.php') {
    const accountId = parsed.searchParams.get('breeder_id');
    const breederId = ids.get(accountId);
    if (!breederId) throw new Error('unexpected account: ' + secret);
    return response(url, listPage(accountId, breederId), 'text/html; charset=utf-8');
  }
  if (url === 'https://fuluck-api.mouxue56.workers.dev/api/kittens') {
    const records = process.env.AUDIT_FIXTURE_MODE === 'drift'
      ? [{ breederId: '2608-00001', status: 'available' }]
      : [];
    return response(url, JSON.stringify(records), 'application/json; charset=utf-8');
  }
  throw new Error('unexpected public URL: ' + secret);
}
`;

function workspace(t) {
  const root = mkdtempSync(join(tmpdir(), 'fuluck-koneko-audit-cli-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const fixture = join(root, 'fixture.mjs');
  writeFileSync(fixture, fixtureSource, { encoding: 'utf8', mode: 0o600 });
  return {
    root,
    fixture,
    json: join(root, 'audit.json'),
    markdown: join(root, 'audit.md'),
  };
}

function run(paths, { mode = 'exact', nodeEnv = 'test', args = [], env = {} } = {}) {
  return spawnSync(process.execPath, [
    CLI,
    '--json', paths.json,
    '--markdown', paths.markdown,
    '--fixture', paths.fixture,
    ...args,
  ], {
    cwd: PROJECT,
    encoding: 'utf8',
    env: {
      ...process.env,
      NODE_ENV: nodeEnv,
      AUDIT_FIXTURE_MODE: mode,
      ...env,
    },
  });
}

function readReports(paths) {
  return {
    json: JSON.parse(readFileSync(paths.json, 'utf8')),
    markdown: readFileSync(paths.markdown, 'utf8'),
  };
}

test('CLI exits zero and writes private JSON and Markdown receipts for an exact audit', (t) => {
  const paths = workspace(t);
  const result = run(paths);
  const reports = readReports(paths);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(reports.json.result, 'EXACT');
  assert.equal(reports.json.exitCode, 0);
  assert.equal(reports.json.noWritePerformed, true);
  assert.match(reports.markdown, /Result: EXACT/);
  assert.match(reports.markdown, /NO WRITE PERFORMED/);
  assert.equal(lstatSync(paths.json).mode & 0o777, 0o600);
  assert.equal(lstatSync(paths.markdown).mode & 0o777, 0o600);
});

test('CLI exits two and preserves both reports when public catalogues drift', (t) => {
  const paths = workspace(t);
  const result = run(paths, { mode: 'drift' });
  const reports = readReports(paths);

  assert.equal(result.status, 2, result.stderr);
  assert.equal(reports.json.result, 'DRIFT');
  assert.equal(reports.json.exitCode, 2);
  assert.match(reports.markdown, /source_inactive_target_active: c995680 2608-00001/);
});

test('CLI exits three and writes redacted BLOCKED receipts after an audit exception', (t) => {
  const paths = workspace(t);
  const secret = 'private-fixture-credential';
  const result = run(paths, { mode: 'blocked', env: { AUDIT_TEST_SECRET: secret } });
  const reports = readReports(paths);
  const emitted = `${result.stdout}\n${result.stderr}\n${JSON.stringify(reports.json)}\n${reports.markdown}`;

  assert.equal(result.status, 3);
  assert.equal(reports.json.result, 'BLOCKED');
  assert.equal(reports.json.exitCode, 3);
  assert.ok(reports.json.blocks.length > 0);
  assert.match(reports.markdown, /BLOCKED/);
  assert.doesNotMatch(emitted, new RegExp(secret));
  assert.doesNotMatch(emitted, /authorization|bearer/i);
});

test('CLI atomically replaces old reports with mode 0600 files', (t) => {
  const paths = workspace(t);
  writeFileSync(paths.json, 'old-json', 'utf8');
  writeFileSync(paths.markdown, 'old-markdown', 'utf8');
  chmodSync(paths.json, 0o644);
  chmodSync(paths.markdown, 0o644);
  const before = [lstatSync(paths.json).ino, lstatSync(paths.markdown).ino];

  const result = run(paths);

  assert.equal(result.status, 0, result.stderr);
  assert.notEqual(lstatSync(paths.json).ino, before[0]);
  assert.notEqual(lstatSync(paths.markdown).ino, before[1]);
  assert.equal(lstatSync(paths.json).mode & 0o777, 0o600);
  assert.equal(lstatSync(paths.markdown).mode & 0o777, 0o600);
  assert.deepEqual(readdirSync(paths.root).sort(), ['audit.json', 'audit.md', 'fixture.mjs']);
});

test('CLI refuses to replace a report path that is a symbolic link', (t) => {
  const paths = workspace(t);
  const target = join(paths.root, 'protected.txt');
  writeFileSync(target, 'do-not-replace', 'utf8');
  symlinkSync(target, paths.json);

  const result = run(paths);

  assert.equal(result.status, 3);
  assert.equal(readFileSync(target, 'utf8'), 'do-not-replace');
  assert.equal(lstatSync(paths.json).isSymbolicLink(), true);
  assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, new RegExp(paths.root));
});

test('CLI rejects invalid arguments with BLOCKED receipts when both output paths are valid', (t) => {
  const paths = workspace(t);
  const result = run(paths, { args: ['--unknown'] });
  const reports = readReports(paths);

  assert.equal(result.status, 3);
  assert.equal(reports.json.result, 'BLOCKED');
  assert.equal(reports.json.exitCode, 3);
  assert.match(reports.markdown, /BLOCKED/);
});

test('CLI does not load the fixture flag unless NODE_ENV is test', (t) => {
  const paths = workspace(t);
  const marker = join(paths.root, 'fixture-imported');
  const result = run(paths, {
    nodeEnv: 'production',
    env: { AUDIT_FIXTURE_IMPORT_MARKER: marker },
  });
  const reports = readReports(paths);

  assert.equal(result.status, 3);
  assert.equal(reports.json.result, 'BLOCKED');
  assert.equal(reports.json.exitCode, 3);
  assert.equal(readdirSync(paths.root).includes('fixture-imported'), false);
});

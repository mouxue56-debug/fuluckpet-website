import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import test from 'node:test';

const PROJECT = resolve(dirname(new URL(import.meta.url).pathname), '..');
const CLI = join(PROJECT, 'tools/audit-koneko-catalog.js');
const DEPENDENCY_BLOCK = join(PROJECT, 'tools/write-koneko-dependency-block.js');
const AUDIT_TIMEOUT_BLOCK = join(PROJECT, 'tools/write-koneko-timeout-block.js');

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
  if (process.env.AUDIT_FIXTURE_MODE === 'malicious') {
    throw new Error('Authorization: Bearer ' + secret + '\\npassword=hunter2 owner@example.com https://evil.example/?token=query-secret\\nsecond-line');
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
      ? [{
          breederId: '2608-00001', status: 'available', breed: 'サイベリアン',
          color: 'シルバータビー', gender: '男の子', price: 220000,
          birthday: '2026-08-01', photos: ['https://fuluckpet.com/images/fixture.webp'],
          coverIndex: 0, video: '', note: '公開中',
        }]
      : [];
    return response(
      url,
      process.env.AUDIT_FIXTURE_MODE === 'diagnostic' ? '{}' : JSON.stringify(records),
      process.env.AUDIT_FIXTURE_MODE === 'diagnostic' ? 'text/html; charset=utf-8' : 'application/json; charset=utf-8',
    );
  }
  throw new Error('unexpected public URL: ' + secret);
}
`;

function workspace(t) {
  const root = mkdtempSync(join(realpathSync(tmpdir()), 'fuluck-koneko-audit-cli-'));
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

function runBootstrapBlocked(paths, reason = 'focused_tests_failed', { cli = CLI } = {}) {
  return spawnSync(process.execPath, [
    cli,
    '--json', paths.json,
    '--markdown', paths.markdown,
    '--blocked', reason,
  ], {
    cwd: dirname(cli),
    encoding: 'utf8',
    env: { ...process.env, NODE_ENV: 'production' },
  });
}

function runDependencyBlock(paths, { cli = DEPENDENCY_BLOCK, env = {} } = {}) {
  return spawnSync(process.execPath, [
    cli,
    '--json', paths.json,
    '--markdown', paths.markdown,
  ], {
    cwd: dirname(cli),
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
}

function runAuditTimeoutBlock(paths, { cli = AUDIT_TIMEOUT_BLOCK, env = {} } = {}) {
  return spawnSync(process.execPath, [
    cli,
    '--json', paths.json,
    '--markdown', paths.markdown,
  ], {
    cwd: dirname(cli),
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
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

test('CLI writes a fixed dependency-install BLOCKED receipt without echoing environment data', (t) => {
  const paths = workspace(t);
  const secret = 'must-not-enter-bootstrap-reports';
  const result = runDependencyBlock(paths, {
    env: { PRIVATE_BOOTSTRAP_VALUE: secret },
  });
  const reports = readReports(paths);
  const emitted = `${result.stdout}\n${result.stderr}\n${JSON.stringify(reports.json)}\n${reports.markdown}`;

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(reports.json.blocks, [
    'Public catalogue audit blocked: stage=bootstrap; reason=dependency_install_failed',
  ]);
  assert.equal(reports.json.result, 'BLOCKED');
  assert.equal(reports.json.exitCode, 3);
  assert.equal(reports.json.noWritePerformed, true);
  assert.deepEqual(reports.json.accounts, []);
  assert.deepEqual(reports.json.fuluck, {
    apiRecordCount: 0,
    renderedPageCounts: { ja: 0, en: 0, zh: 0 },
    checkedUrls: [],
  });
  assert.deepEqual(reports.json.diffs, []);
  assert.match(reports.markdown, /Result: BLOCKED/);
  assert.match(reports.markdown, /NO WRITE PERFORMED/);
  assert.doesNotMatch(emitted, new RegExp(secret));
  for (const forbidden of [
    'npm ERR', 'registry.npmjs.org', 'authorization', 'bearer', 'password',
    'stack', paths.root,
  ]) assert.equal(emitted.toLowerCase().includes(forbidden.toLowerCase()), false, forbidden);
  assert.equal(lstatSync(paths.json).mode & 0o777, 0o600);
  assert.equal(lstatSync(paths.markdown).mode & 0o777, 0o600);
});

test('independent audit-timeout writer emits a fixed private BLOCKED receipt', (t) => {
  const paths = workspace(t);
  const secret = 'must-not-enter-timeout-reports';
  const result = runAuditTimeoutBlock(paths, {
    env: { PRIVATE_TIMEOUT_VALUE: secret },
  });

  assert.equal(result.status, 0, result.stderr);
  const reports = readReports(paths);
  const emitted = `${result.stdout}\n${result.stderr}\n${JSON.stringify(reports.json)}\n${reports.markdown}`;
  assert.deepEqual(reports.json.blocks, [
    'Public catalogue audit blocked: stage=audit; reason=audit_timeout',
  ]);
  assert.equal(reports.json.result, 'BLOCKED');
  assert.equal(reports.json.exitCode, 3);
  assert.equal(reports.json.noWritePerformed, true);
  assert.match(reports.markdown, /Result: BLOCKED/);
  assert.match(reports.markdown, /audit_timeout/);
  assert.doesNotMatch(emitted, new RegExp(secret));
  assert.equal(lstatSync(paths.json).mode & 0o777, 0o600);
  assert.equal(lstatSync(paths.markdown).mode & 0o777, 0o600);
});

test('CLI writes the fixed focused-test BLOCKED receipt used by the nightly workflow', (t) => {
  const paths = workspace(t);
  const result = runBootstrapBlocked(paths, 'focused_tests_failed');
  const reports = readReports(paths);

  assert.equal(result.status, 3, result.stderr);
  assert.deepEqual(reports.json.blocks, [
    'Public catalogue audit blocked: stage=bootstrap; reason=focused_tests_failed',
  ]);
  assert.equal(reports.json.result, 'BLOCKED');
  assert.equal(reports.json.exitCode, 3);
  assert.match(reports.markdown, /focused_tests_failed/);
});

test('dependency-install BLOCKED reporting runs from an isolated copy with only its output boundary', (t) => {
  const paths = workspace(t);
  const isolated = join(paths.root, 'isolated');
  const isolatedTools = join(isolated, 'tools');
  const isolatedLib = join(isolatedTools, 'lib');
  mkdirSync(isolatedLib, { recursive: true });
  const isolatedCli = join(isolatedTools, 'write-koneko-dependency-block.js');
  copyFileSync(DEPENDENCY_BLOCK, isolatedCli);
  copyFileSync(
    join(PROJECT, 'tools/lib/koneko-audit-output.js'),
    join(isolatedLib, 'koneko-audit-output.js'),
  );
  paths.json = join(paths.root, 'isolated-audit.json');
  paths.markdown = join(paths.root, 'isolated-audit.md');

  const result = runDependencyBlock(paths, { cli: isolatedCli });
  const reports = readReports(paths);

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(reports.json.blocks, [
    'Public catalogue audit blocked: stage=bootstrap; reason=dependency_install_failed',
  ]);
  assert.match(reports.markdown, /BLOCKED/);
  assert.deepEqual(readdirSync(isolatedLib), ['koneko-audit-output.js']);
});

test('dependency-install BLOCKED reporting refuses symbolic-link destinations', (t) => {
  const paths = workspace(t);
  const target = join(paths.root, 'dependency-protected.txt');
  writeFileSync(target, 'keep-me', 'utf8');
  symlinkSync(target, paths.json);

  const result = runDependencyBlock(paths);

  assert.equal(result.status, 3);
  assert.equal(readFileSync(target, 'utf8'), 'keep-me');
  assert.equal(existsSync(paths.markdown), false);
  assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, new RegExp(paths.root));
});

test('dependency-install BLOCKED reporting atomically replaces both receipts as mode 0600', (t) => {
  const paths = workspace(t);
  writeFileSync(paths.json, 'old-json', 'utf8');
  writeFileSync(paths.markdown, 'old-markdown', 'utf8');
  chmodSync(paths.json, 0o644);
  chmodSync(paths.markdown, 0o644);
  const before = [lstatSync(paths.json).ino, lstatSync(paths.markdown).ino];

  const result = runDependencyBlock(paths);

  assert.equal(result.status, 0, result.stderr);
  assert.notEqual(lstatSync(paths.json).ino, before[0]);
  assert.notEqual(lstatSync(paths.markdown).ino, before[1]);
  assert.equal(lstatSync(paths.json).mode & 0o777, 0o600);
  assert.equal(lstatSync(paths.markdown).mode & 0o777, 0o600);
});

test('CLI rejects unknown bootstrap reasons without reflecting them into reports', (t) => {
  const paths = workspace(t);
  const unsafeReason = 'dependency_install_failed password=hunter2';
  const result = runBootstrapBlocked(paths, unsafeReason);
  const reports = readReports(paths);
  const emitted = `${result.stdout}\n${result.stderr}\n${JSON.stringify(reports.json)}\n${reports.markdown}`;

  assert.equal(result.status, 3);
  assert.deepEqual(reports.json.blocks, ['The audit invocation was invalid.']);
  assert.doesNotMatch(emitted, /hunter2/);
});

test('CLI BLOCKED receipts preserve a closed Fuluck API diagnostic', (t) => {
  const paths = workspace(t);
  const result = run(paths, { mode: 'diagnostic' });
  const reports = readReports(paths);
  const expected = 'Public catalogue audit blocked: stage=fuluck_api; reason=content_type; url=https://fuluck-api.mouxue56.workers.dev/api/kittens';

  assert.equal(result.status, 3);
  assert.deepEqual(reports.json.blocks, [expected]);
  assert.match(reports.markdown, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('CLI never emits a malicious public failure cause in stdout, stderr, JSON, or Markdown', (t) => {
  const paths = workspace(t);
  const secret = 'private-fixture-credential';
  const result = run(paths, { mode: 'malicious', env: { AUDIT_TEST_SECRET: secret } });
  const reports = readReports(paths);
  const emitted = `${result.stdout}\n${result.stderr}\n${JSON.stringify(reports.json)}\n${reports.markdown}`;

  assert.equal(result.status, 3);
  assert.deepEqual(reports.json.blocks, [
    'Public catalogue audit blocked: stage=koneko_list; reason=public_request_failed; account=c995680; url=https://www.koneko-breeder.com/breederDetail.php?breeder_id=c995680',
  ]);
  for (const forbidden of [
    secret, 'Authorization', 'Bearer', 'password', 'hunter2', 'owner@example.com',
    'evil.example', 'query-secret', 'second-line',
  ]) assert.equal(emitted.includes(forbidden), false, forbidden);
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

for (const report of ['json', 'markdown']) {
  for (const depth of ['immediate', 'higher']) {
    test(`CLI refuses a ${report} path with a symlink in its ${depth} ancestor`, (t) => {
      const paths = workspace(t);
      const realParent = join(paths.root, 'real-parent');
      const linkedParent = join(paths.root, 'linked-parent');
      mkdirSync(join(realParent, 'nested'), { recursive: true });
      symlinkSync(realParent, linkedParent, 'dir');
      const relativeParent = depth === 'immediate' ? linkedParent : join(linkedParent, 'nested');
      const fileName = report === 'json' ? 'linked-audit.json' : 'linked-audit.md';
      paths[report] = join(relativeParent, fileName);

      const result = run(paths);

      assert.equal(result.status, 3);
      assert.equal(readdirSync(depth === 'immediate' ? realParent : join(realParent, 'nested')).includes(fileName), false);
      const safePeer = report === 'json' ? paths.markdown : paths.json;
      assert.equal(readdirSync(dirname(safePeer)).includes(basename(safePeer)), false);
    });
  }
}

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

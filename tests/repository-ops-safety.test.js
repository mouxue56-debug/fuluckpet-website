'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const UPLOAD = path.join(ROOT, 'tools/upload-blog-bulk.sh');
const uploadSource = fs.readFileSync(UPLOAD, 'utf8');
const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
const seedKb = fs.readFileSync(path.join(ROOT, 'tools/seed-kb.js'), 'utf8');

test('blog bulk tool defaults to an offline dry run', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fuluck-blog-dry-run-'));
  const input = path.join(dir, 'articles.json');
  fs.writeFileSync(input, JSON.stringify([
    { id: 'article-1', slug: 'safe-article', title: { ja: '記事' }, content: { ja: '<p>本文</p>' } },
  ]));

  const result = spawnSync('bash', [UPLOAD, '--file', input], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, PATH: '/usr/bin:/bin:/usr/sbin:/sbin' },
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /DRY RUN/i);
  assert.match(result.stdout, /sha256/i);
  assert.doesNotMatch(result.stdout + result.stderr, /wrangler/i);
});

test('blog bulk tool rejects duplicate IDs before any remote command', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fuluck-blog-invalid-'));
  const input = path.join(dir, 'articles.json');
  fs.writeFileSync(input, JSON.stringify([
    { id: 'same', slug: 'first' },
    { id: 'same', slug: 'second' },
  ]));

  const result = spawnSync('bash', [UPLOAD, '--file', input], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, PATH: '/usr/bin:/bin:/usr/sbin:/sbin' },
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /duplicate.*id/i);
  assert.doesNotMatch(result.stdout + result.stderr, /wrangler/i);
});

test('blog apply path snapshots and diffs before write, with hash confirmation and restore', () => {
  const snapshotIndex = uploadSource.indexOf('kv key get');
  const diffIndex = uploadSource.indexOf('DIFF SUMMARY');
  const putIndex = uploadSource.indexOf('kv key put');
  assert.ok(snapshotIndex >= 0 && diffIndex > snapshotIndex && putIndex > diffIndex);
  assert.match(uploadSource, /apply/);
  assert.match(uploadSource, /restore/);
  assert.match(uploadSource, /--confirm-sha/);
  assert.match(uploadSource, /sha256/i);
  assert.match(uploadSource, /umask\s+077/);
  assert.match(uploadSource, /Remote articles changed after the snapshot/);
  assert.match(uploadSource, /No automatic overwrite was attempted/);
});

test('blog apply pins diff and put to one private copy when the source path changes mid-run', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fuluck-blog-toctou-'));
  const binDir = path.join(dir, 'bin');
  const backupDir = path.join(dir, 'backups');
  const input = path.join(dir, 'articles.json');
  const replacement = path.join(dir, 'replacement.json');
  const remote = path.join(dir, 'remote.json');
  const written = path.join(dir, 'written.json');
  const putPath = path.join(dir, 'put-path.txt');
  const putMode = path.join(dir, 'put-mode.txt');
  const callCount = path.join(dir, 'get-count.txt');
  fs.mkdirSync(binDir);

  const approvedArticles = [
    { id: 'approved', slug: 'approved-article', title: { ja: '承認済み' }, content: { ja: '<p>approved</p>' } },
  ];
  const swappedArticles = [
    { id: 'swapped', slug: 'swapped-article', title: { ja: '差し替え' }, content: { ja: '<p>swapped</p>' } },
  ];
  const remoteArticles = [
    { id: 'remote-old', slug: 'remote-old', title: { ja: '旧版' }, content: { ja: '<p>old</p>' } },
  ];
  const approvedBytes = JSON.stringify(approvedArticles);
  fs.writeFileSync(input, approvedBytes);
  fs.writeFileSync(replacement, JSON.stringify(swappedArticles));
  fs.writeFileSync(remote, JSON.stringify(remoteArticles));

  const fakeNpx = path.join(binDir, 'npx');
  fs.writeFileSync(fakeNpx, `#!/usr/bin/env bash
set -euo pipefail

case " $* " in
  *" kv key get articles "*)
    count=0
    if [ -f "$FAKE_CALL_COUNT" ]; then count="$(cat "$FAKE_CALL_COUNT")"; fi
    count=$((count + 1))
    printf '%s' "$count" > "$FAKE_CALL_COUNT"
    if [ "$count" -eq 1 ]; then
      cp "$TOCTOU_REPLACEMENT" "$TOCTOU_INPUT"
    fi
    cat "$FAKE_REMOTE"
    ;;
  *" kv key put articles "*)
    source=''
    for arg in "$@"; do
      case "$arg" in --path=*) source="\${arg#--path=}" ;; esac
    done
    [ -n "$source" ]
    printf '%s' "$source" > "$FAKE_PUT_PATH"
    python3 -c 'import os,sys; print(f"{os.stat(sys.argv[1]).st_mode & 0o777:03o}")' "$source" > "$FAKE_PUT_MODE"
    cp "$source" "$FAKE_WRITTEN"
    cp "$source" "$FAKE_REMOTE"
    ;;
  *)
    echo "unexpected fake npx invocation: $*" >&2
    exit 70
    ;;
esac
`);
  fs.chmodSync(fakeNpx, 0o700);

  const confirmedSha = crypto.createHash('sha256').update(approvedBytes).digest('hex');
  const result = spawnSync('bash', [
    UPLOAD,
    'apply',
    '--file', input,
    '--confirm-sha', confirmedSha,
    '--allow-removals',
  ], {
    cwd: ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${binDir}:/usr/bin:/bin:/usr/sbin:/sbin`,
      FULUCK_KV_BACKUP_DIR: backupDir,
      FAKE_CALL_COUNT: callCount,
      FAKE_PUT_MODE: putMode,
      FAKE_PUT_PATH: putPath,
      FAKE_REMOTE: remote,
      FAKE_WRITTEN: written,
      TOCTOU_INPUT: input,
      TOCTOU_REPLACEMENT: replacement,
    },
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.deepEqual(JSON.parse(fs.readFileSync(input, 'utf8')), swappedArticles, 'the source replacement must really happen');
  assert.match(result.stdout, /added: approved/);
  assert.doesNotMatch(result.stdout, /swapped/);
  assert.deepEqual(JSON.parse(fs.readFileSync(written, 'utf8')), approvedArticles);

  const actualPutPath = fs.readFileSync(putPath, 'utf8');
  assert.notEqual(actualPutPath, input, 'wrangler must never reopen the mutable source path');
  assert.equal(fs.readFileSync(putMode, 'utf8').trim(), '600');
  assert.equal(fs.existsSync(actualPutPath), false, 'the one-use private copy must be removed by the exit trap');
  assert.equal(fs.readFileSync(callCount, 'utf8'), '3');
});

test('production data tooling pins Wrangler 4.70.0 instead of following latest', () => {
  assert.match(uploadSource, /WRANGLER_VERSION=["']4\.70\.0["']/);
  assert.match(uploadSource, /WRANGLER=\(npx --yes ["']wrangler@\$WRANGLER_VERSION["']\)/);
  assert.doesNotMatch(uploadSource, /\bnpx\s+wrangler\b/);
  assert.match(seedKb, /npx --yes wrangler@4\.70\.0 kv key put/);
  assert.doesNotMatch(seedKb, /wrangler kv:key put/);
});

test('public operator README uses the pinned Wrangler and preserves dashboard vars', () => {
  assert.match(readme, /npx --yes wrangler@4\.70\.0 deploy --strict --dry-run --keep-vars/);
  assert.doesNotMatch(readme, /\bnpx\s+wrangler\b/);
});

test('generated Python caches are ignored and untracked', () => {
  const ignore = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8');
  assert.match(ignore, /__pycache__\//);
  assert.match(ignore, /\*\.pyc/);
  const tracked = execFileSync('git', ['ls-files', '*__pycache__*', '*.pyc'], {
    cwd: ROOT,
    encoding: 'utf8',
  }).trim();
  assert.equal(tracked, '');
});

test('image migration has a non-mutating help default', () => {
  const source = fs.readFileSync(path.join(ROOT, 'tools/migrate-images.js'), 'utf8');
  assert.match(source, /process\.argv\[2\]\s*\|\|\s*['"]help['"]/);
  assert.match(source, /cmd === ['"]help['"]/);
});

test('one-off tools derive repository paths instead of hard-coding an old home', () => {
  const files = [
    'tools/inject-edu-figures.mjs',
    'tools/gen-blog-edu-articles.mjs',
    'tools/gen-blog-edu-pages.mjs',
    'tools/inject-figures-static.mjs',
    'tools/gen-blog-static-pages.mjs',
  ];
  for (const file of files) {
    const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
    assert.doesNotMatch(source, /\/Users\/lauralyu\/projects\/fuluckpet-website/);
  }
});

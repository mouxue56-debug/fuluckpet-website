'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const SCRIPT_PATH = path.join(ROOT, 'scripts/deploy-and-smoke-worker.sh');
const SCRIPT = fs.readFileSync(SCRIPT_PATH, 'utf8');

test('worker deploy smoke script is valid Bash', () => {
  const result = spawnSync('bash', ['-n', SCRIPT_PATH], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
});

test('worker smoke covers the small-animal public and private contracts', () => {
  assert.match(SCRIPT, /\/api\/small-animals/);
  assert.match(SCRIPT, /\/api\/admin\/small-animals/);
  assert.match(SCRIPT, /FULUCK_ADMIN_PASS/);
});

test('destructive rate-limit saturation is opt-in and catalogue count is not hard-coded', () => {
  assert.match(SCRIPT, /RUN_RATE_LIMIT_SMOKE/);
  assert.doesNotMatch(SCRIPT, /count"\s*=\s*"38"/);
});

test('a warm EDGE response is accepted on the first image request', () => {
  assert.match(SCRIPT, /x1"\s+in\s+ORIGIN\|R2\|EDGE|ORIGIN\|R2\|EDGE\)/);
});

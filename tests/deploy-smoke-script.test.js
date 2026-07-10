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
  assert.match(SCRIPT, /small-animals-launch\.json/);
  assert.match(SCRIPT, /dark launch.*empty|expected 200 \/ empty/i);
});

test('destructive rate-limit saturation is opt-in and catalogue count is not hard-coded', () => {
  assert.match(SCRIPT, /RUN_RATE_LIMIT_SMOKE/);
  assert.doesNotMatch(SCRIPT, /count"\s*=\s*"38"/);
});

test('a warm EDGE response is accepted on the first image request', () => {
  assert.match(SCRIPT, /x1"\s+in\s+ORIGIN\|R2\|EDGE|ORIGIN\|R2\|EDGE\)/);
});

test('worker smoke locks chat preflight and POST to the site origin', () => {
  assert.match(SCRIPT, /\/api\/chat/);
  assert.match(SCRIPT, /chat CORS lock/i);
  assert.match(SCRIPT, /chat.*OPTIONS.*foreign-origin/i);
  assert.match(SCRIPT, /chat.*POST.*foreign-origin/i);
  assert.match(SCRIPT, /chat.*same-origin/i);
});

test('worker smoke proves foreign story requests are rejected before paid work', () => {
  assert.match(SCRIPT, /story CORS lock/i);
  assert.match(SCRIPT, /story.*OPTIONS.*foreign-origin.*403/i);
  assert.match(SCRIPT, /story.*POST.*foreign-origin.*403/i);
  assert.match(SCRIPT, /story.*POST.*same-origin.*400/i);
});

test('opt-in story throttle smoke sends a valid payload after bounded validation', () => {
  assert.match(SCRIPT, /RUN_RATE_LIMIT_SMOKE/);
  assert.match(SCRIPT, /--data '\{"name":"Smoke test"\}'/);
});

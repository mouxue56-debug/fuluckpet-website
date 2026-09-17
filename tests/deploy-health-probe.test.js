'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const source = fs.readFileSync(path.join(__dirname, '../scripts/deploy-and-smoke-worker.sh'), 'utf8');
const start = source.indexOf('# 2. Read-only notification health:');
const end = source.indexOf('# 3. GET /api/kittens', start);
assert.ok(start > 0 && end > start);
const probe = source.slice(start, end);

function scenario({ mode = 'deploy', stale = 1, invalid = false } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fuluck-health-probe-'));
  const countFile = path.join(dir, 'calls');
  fs.writeFileSync(countFile, '0');
  // Only the health section runs. No network or deployment tools are available
  // through this mock; every curl call returns headers and body from one version.
  const script = `
set -u -o pipefail
MODE="$TEST_MODE"; RELEASE_SHA=new; API_BASE=https://example.test
pass_count=0; fail_count=0
pass() { pass_count=$((pass_count+1)); }
fail() { fail_count=$((fail_count+1)); }
sleep() { :; }
curl() {
  local count header_file='' status_suffix=0
  count=$(cat "$TEST_COUNT"); count=$((count+1)); printf '%s' "$count" > "$TEST_COUNT"
  local release=new
  if [ "$count" -le "$TEST_STALE" ]; then release=old; fi
  while [ "$#" -gt 0 ]; do
    case "$1" in
      -D) header_file="$2"; shift 2 ;;
      -w) status_suffix=1; shift 2 ;;
      *) shift ;;
    esac
  done
  if [ "$header_file" = '-' ]; then
    printf 'HTTP/2 200\r\nX-Fuluck-Release: %s\r\n\r\n' "$release"
    return
  fi
  if [ -n "$header_file" ]; then
    printf 'HTTP/2 200\r\nX-Fuluck-Release: %s\r\n\r\n' "$release" > "$header_file"
  fi
  printf '{"release":"%s","email_binding":%s,"telegram_config":true,"cron_version":true}' "$release" "$TEST_CONFIG"
  if [ "$status_suffix" = 1 ]; then printf '\n200'; fi
}
${probe}
printf 'RESULT %s %s %s' "$pass_count" "$fail_count" "$(cat "$TEST_COUNT")"
`;
  const result = spawnSync('bash', ['-c', script], {
    encoding: 'utf8',
    env: { ...process.env, TEST_MODE: mode, TEST_COUNT: countFile, TEST_STALE: String(stale), TEST_CONFIG: invalid ? 'false' : 'true' },
  });
  fs.rmSync(dir, { recursive: true, force: true });
  assert.equal(result.status, 0, result.stderr);
  const match = result.stdout.match(/RESULT (\d+) (\d+) (\d+)/);
  assert.ok(match, result.stdout);
  return { pass: Number(match[1]), fail: Number(match[2]), calls: Number(match[3]) };
}

test('health smoke compares a single response even if the next request would reach a newer edge', () => {
  assert.deepEqual(scenario({ mode: 'smoke', stale: 1 }), { pass: 2, fail: 0, calls: 1 });
});
test('deploy health waits for the matching new release without mixing responses', () => {
  assert.deepEqual(scenario(), { pass: 2, fail: 0, calls: 2 });
});
test('deploy health fails closed after a bounded number of old-version responses', () => {
  const result = scenario({ stale: 100 });
  assert.equal(result.calls, 10);
  assert.ok(result.fail > 0);
});
test('the expected SHA never hides broken notification configuration', () => {
  const result = scenario({ stale: 0, invalid: true });
  assert.equal(result.calls, 10);
  assert.equal(result.fail, 2);
});

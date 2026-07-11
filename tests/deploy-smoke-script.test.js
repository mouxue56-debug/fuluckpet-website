'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const SCRIPT_PATH = path.join(ROOT, 'scripts/deploy-and-smoke-worker.sh');
const SCRIPT = fs.readFileSync(SCRIPT_PATH, 'utf8');
const LEGACY_DEPLOY = fs.readFileSync(path.join(ROOT, 'api/deploy.sh'), 'utf8');

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

test('worker smoke proves the legacy boarding price URL stays tombstoned', () => {
  assert.match(SCRIPT, /boarding-config\.js/);
  assert.match(SCRIPT, /legacy boarding pricing.*404|404.*legacy boarding pricing/i);
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

test('post-deploy waits for the exact release header before smoke', () => {
  assert.match(SCRIPT, /wait_for_worker_release/);
  assert.match(SCRIPT, /\/api\/chat%2Fdiagnostic/);
  assert.match(SCRIPT, /X-Fuluck-Release/i);
  assert.match(SCRIPT, /RELEASE_SHA/);
  assert.match(SCRIPT, /for attempt in 1 2 3 4 5 6 7 8 9 10/);
  assert.match(SCRIPT, /sleep 2/);
  assert.match(SCRIPT, /propagation timeout/i);
});

test('worker deploy is explicit and default execution is smoke-only', () => {
  assert.match(SCRIPT, /--deploy/);
  assert.match(SCRIPT, /default.*smoke[- ]only|smoke[- ]only.*default/i);
  assert.doesNotMatch(SCRIPT, /SKIP_DEPLOY/);
  assert.match(SCRIPT, /MODE=["']smoke["']/);
});

test('deploy mode runs every local and git gate before Wrangler deploy', () => {
  const deployIndex = SCRIPT.lastIndexOf('"${WRANGLER[@]}" deploy --strict');
  assert.notEqual(deployIndex, -1, 'script must have one guarded real deploy');
  const beforeDeploy = SCRIPT.slice(0, deployIndex);
  assert.match(beforeDeploy, /node --test tests\/\*\.test\.js/);
  assert.match(beforeDeploy, /node tools\/verify-generated\.js/);
  assert.match(beforeDeploy, /git (?:-C [^\n]+ )?diff --quiet/);
  assert.match(beforeDeploy, /git (?:-C [^\n]+ )?diff --cached --quiet/);
  assert.match(beforeDeploy, /git (?:-C [^\n]+ )?fetch --quiet origin main/);
  assert.match(beforeDeploy, /origin\/main/);
  assert.match(beforeDeploy, /"\$\{WRANGLER\[@\]\}" deploy --strict --dry-run/);
});

test('deploy records exact Git provenance and rolls back a failed smoke', () => {
  assert.match(SCRIPT, /RELEASE_SHA=.*git (?:-C [^\n]+ )?rev-parse HEAD/);
  assert.match(SCRIPT, /--message.*RELEASE_SHA/);
  assert.match(SCRIPT, /--var.*RELEASE_SHA/);
  assert.match(SCRIPT, /deployments status --json/);
  assert.match(SCRIPT, /versions view.*--json/);
  assert.match(SCRIPT, /active version metadata does not match/);
  assert.match(SCRIPT, /workers\/tag/);
  assert.match(SCRIPT, /workers\/message/);
  assert.match(SCRIPT, /"\$\{WRANGLER\[@\]\}" rollback.*PREVIOUS_VERSION_ID/);
  assert.match(SCRIPT, /rollback.*smoke|smoke.*rollback/i);
});

test('rollback ownership starts false and is granted only after provenance verification', () => {
  assert.match(SCRIPT, /ROLLBACK_OWNED=0/);
  const realDeploy = SCRIPT.lastIndexOf('"${WRANGLER[@]}" deploy --strict');
  const provenance = SCRIPT.indexOf('verify_version_provenance "$DEPLOYED_VERSION_ID"', realDeploy);
  const ownership = SCRIPT.indexOf('ROLLBACK_OWNED=1', realDeploy);
  assert.ok(realDeploy >= 0 && provenance > realDeploy && ownership > provenance);
  assert.doesNotMatch(SCRIPT.slice(realDeploy, provenance), /ROLLBACK_OWNED=1/);
});

test('rollback re-reads the unique active version before any production mutation', () => {
  const start = SCRIPT.indexOf('rollback_previous()');
  const end = SCRIPT.indexOf('\n}', start);
  const rollbackBody = SCRIPT.slice(start, end);
  const reread = rollbackBody.indexOf('current_single_version_id');
  const ownershipCheck = rollbackBody.indexOf('DEPLOYED_VERSION_ID');
  const mutation = rollbackBody.indexOf('"${WRANGLER[@]}" rollback');
  assert.ok(reread >= 0 && ownershipCheck > reread && mutation > ownershipCheck);
  assert.match(rollbackBody, /MANUAL INTERVENTION/i);
});

function runGuardedDeployScenario({ activeAtRollback, provenanceOk = true }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fuluck-deploy-race-'));
  const bin = path.join(dir, 'bin');
  const operations = path.join(dir, 'operations.log');
  const statusCount = path.join(dir, 'status-count');
  fs.mkdirSync(bin);

  const releaseSha = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const previous = 'version-previous';
  const deployed = 'version-deployed';

  fs.writeFileSync(path.join(bin, 'git'), `#!/usr/bin/env bash
case " $* " in
  *" branch --show-current "*) echo main ;;
  *" diff "*|*" status "*|*" fetch "*) exit 0 ;;
  *" rev-parse HEAD "*|*" rev-parse origin/main "*) echo '${releaseSha}' ;;
  *) echo "unexpected fake git: $*" >&2; exit 70 ;;
esac
`);
  fs.writeFileSync(path.join(bin, 'node'), `#!/usr/bin/env bash
case "\${1:-}" in
  --test|tools/verify-generated.js) exit 0 ;;
  *) exec "$REAL_NODE" "$@" ;;
esac
`);
  fs.writeFileSync(path.join(bin, 'npx'), `#!/usr/bin/env bash
set -euo pipefail
case " $* " in
  *" deployments status --json "*)
    count=0
    [ ! -f "$FAKE_STATUS_COUNT" ] || count="$(cat "$FAKE_STATUS_COUNT")"
    count=$((count + 1))
    printf '%s' "$count" > "$FAKE_STATUS_COUNT"
    if [ "$count" -eq 1 ]; then active='${previous}'
    elif [ "$count" -eq 2 ]; then active='${deployed}'
    else active="$FAKE_ACTIVE_AT_ROLLBACK"
    fi
    printf '{"versions":[{"version_id":"%s","percentage":100}]}' "$active"
    ;;
  *" versions view ${deployed} --json "*)
    if [ "$FAKE_PROVENANCE_OK" = "1" ]; then tag='git-${releaseSha}'; message='git=${releaseSha}'
    else tag='git-someone-else'; message='git=someone-else'
    fi
    printf '{"id":"${deployed}","annotations":{"workers/tag":"%s","workers/message":"%s"}}' "$tag" "$message"
    ;;
  *" deploy --strict --dry-run "*) printf '%s\n' dry-run >> "$FAKE_OPERATIONS" ;;
  *" deploy --strict "*) printf '%s\n' deploy >> "$FAKE_OPERATIONS" ;;
  *" rollback ${previous} "*) printf '%s\n' rollback >> "$FAKE_OPERATIONS" ;;
  *) echo "unexpected fake npx: $*" >&2; exit 70 ;;
esac
`);
  fs.writeFileSync(path.join(bin, 'curl'), `#!/usr/bin/env bash
printf 'HTTP/2 403\r\nX-Fuluck-Release: not-ready\r\nCODE 403'
`);
  fs.writeFileSync(path.join(bin, 'sleep'), '#!/usr/bin/env bash\nexit 0\n');
  for (const name of ['git', 'node', 'npx', 'curl', 'sleep']) fs.chmodSync(path.join(bin, name), 0o700);

  const result = spawnSync('bash', [SCRIPT_PATH, '--deploy'], {
    cwd: ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${bin}:/usr/bin:/bin:/usr/sbin:/sbin`,
      REAL_NODE: process.execPath,
      FAKE_ACTIVE_AT_ROLLBACK: activeAtRollback,
      FAKE_OPERATIONS: operations,
      FAKE_PROVENANCE_OK: provenanceOk ? '1' : '0',
      FAKE_STATUS_COUNT: statusCount,
    },
  });
  const operationLog = fs.existsSync(operations) ? fs.readFileSync(operations, 'utf8') : '';
  fs.rmSync(dir, { recursive: true, force: true });
  return { result, operations: operationLog };
}

test('failed smoke never rolls back over a concurrent deployment', () => {
  const { result, operations } = runGuardedDeployScenario({ activeAtRollback: 'version-concurrent' });
  assert.notEqual(result.status, 0);
  assert.doesNotMatch(operations, /^rollback$/m);
  assert.match(result.stderr, /MANUAL INTERVENTION/i);
});

test('failed smoke rolls back only while the verified release remains active', () => {
  const { result, operations } = runGuardedDeployScenario({ activeAtRollback: 'version-deployed' });
  assert.notEqual(result.status, 0);
  assert.match(operations, /^rollback$/m);
});

test('failed provenance never grants rollback ownership', () => {
  const { result, operations } = runGuardedDeployScenario({
    activeAtRollback: 'version-deployed',
    provenanceOk: false,
  });
  assert.notEqual(result.status, 0);
  assert.doesNotMatch(operations, /^rollback$/m);
  assert.match(result.stderr, /MANUAL INTERVENTION/i);
});

test('every Wrangler operation uses the verified 4.70.0 CLI', () => {
  assert.match(SCRIPT, /WRANGLER_VERSION=["']4\.70\.0["']/);
  assert.match(SCRIPT, /WRANGLER=\(npx --yes ["']wrangler@\$WRANGLER_VERSION["']\)/);
  assert.doesNotMatch(SCRIPT, /\bnpx\s+wrangler\b/);

  const operationLines = SCRIPT.split('\n').filter((line) =>
    line.includes('"${WRANGLER[@]}"')
  );
  assert.ok(operationLines.length >= 5);
  for (const line of operationLines) {
    assert.match(line, /"\$\{WRANGLER\[@\]\}"/);
  }
});

test('both dry-run and real Worker deploy preserve dashboard variables', () => {
  assert.match(SCRIPT, /deploy --strict --dry-run[\s\S]{0,160}--keep-vars/);
  assert.match(SCRIPT, /deploy --strict\s*\\\n\s*--keep-vars[\s\S]{0,160}--var ["']RELEASE_SHA:/);
});

test('all live smoke requests are time-bounded and never automatically replay POST', () => {
  assert.match(SCRIPT, /command curl --connect-timeout/);
  assert.match(SCRIPT, /--max-time/);
  assert.doesNotMatch(SCRIPT, /--retry(?:-all-errors)?/);
});

test('deploy preflight rechecks cleanliness after tests and dry-run', () => {
  const testIndex = SCRIPT.indexOf('node --test tests/*.test.js');
  const actualDeployIndex = SCRIPT.lastIndexOf('"${WRANGLER[@]}" deploy --strict');
  const afterTests = SCRIPT.slice(testIndex, actualDeployIndex);
  assert.match(afterTests, /quality gates changed tracked files/);
  assert.match(afterTests, /quality gates changed the index/);
  assert.match(afterTests, /quality gates left the worktree dirty/);
  assert.match(afterTests, /HEAD changed during preflight/);
});

test('legacy deploy helper is quarantined and cannot mutate Cloudflare', () => {
  assert.match(LEGACY_DEPLOY, /retired|quarantined|disabled/i);
  assert.match(LEGACY_DEPLOY, /exit\s+(64|1)/);
  assert.doesNotMatch(LEGACY_DEPLOY, /wrangler\s+(deploy|login|r2 bucket create|kv namespace create|secret put)/);
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

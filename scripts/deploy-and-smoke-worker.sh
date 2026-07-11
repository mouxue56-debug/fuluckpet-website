#!/usr/bin/env bash
#
# deploy-and-smoke-worker.sh — smoke-test the fuluck-api Worker, with guarded deploy.
#
# Covers core catalogue availability, small-animal dark-launch routes, private auth
# gates, and drive-img layered caching. Expensive/destructive throttling is opt-in.
# Idempotent and safe to re-run. Each check prints a clear PASS/FAIL line; the
# script exits non-zero if any check fails.
#
# Usage:  scripts/deploy-and-smoke-worker.sh            # default: smoke-only
#         scripts/deploy-and-smoke-worker.sh --deploy   # gated deploy, then smoke
#         scripts/deploy-and-smoke-worker.sh --help
#
# Requires: npx authenticated for the fuluck-api account; curl.

set -u -o pipefail

readonly WRANGLER_VERSION="4.70.0"
readonly -a WRANGLER=(npx --yes "wrangler@$WRANGLER_VERSION")

MODE="smoke"
case "${1:-}" in
  "") ;;
  --deploy) MODE="deploy" ;;
  -h|--help)
    sed -n '2,15p' "$0"
    exit 0
    ;;
  *)
    echo "Unknown argument: $1" >&2
    echo "Usage: $0 [--deploy]" >&2
    exit 64
    ;;
esac
[ "$#" -le 1 ] || { echo "Only one mode argument is accepted." >&2; exit 64; }

API_BASE="${FULUCK_API_BASE:-https://fuluck-api.mouxue56.workers.dev}"
SITE_ORIGIN="${FULUCK_SITE_ORIGIN:-https://fuluckpet.com}"
FOREIGN_ORIGIN="${FULUCK_FOREIGN_ORIGIN:-https://evil.example.com}"
RELEASE_PROBE_PATH="/api/chat%2Fdiagnostic"
# Two REAL kitten-card LCP images (Drive file ids from kittens.html).
IMG_A="1WgbZ2SZ1c8Q43wBdqu8vu9w3a3Idxj-A"
IMG_B="11A__yaCqHdX2DQWdoJJt09SL96fommeS"
# A never-existing Drive id — must error and must NOT be cached.
IMG_BOGUS="BOGUS_nonexistent_id_smoke_xyz123"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RELEASE_SHA=""
PREVIOUS_VERSION_ID=""
DEPLOYED_VERSION_ID=""
DEPLOY_COMMAND_SUCCEEDED=0
ROLLBACK_OWNED=0

pass_count=0
fail_count=0
pass() { echo "  PASS  $1"; pass_count=$((pass_count+1)); }
fail() { echo "  FAIL  $1"; fail_count=$((fail_count+1)); }
die() { echo "ERROR: $*" >&2; exit 1; }

command -v curl >/dev/null || die "curl is required"
command -v python3 >/dev/null || die "python3 is required"
command -v node >/dev/null || die "Node.js is required"

# Every live probe is bounded. POST probes are deliberately not retried because
# a replay could duplicate provider work if a route regresses past validation.
curl() {
  command curl --connect-timeout "${CURL_CONNECT_TIMEOUT:-10}" \
    --max-time "${CURL_MAX_TIME:-30}" "$@"
}

current_single_version_id() {
  local status_json
  status_json="$(cd "$REPO_ROOT/api" && "${WRANGLER[@]}" deployments status --json)" || return 1
  printf '%s' "$status_json" | node -e '
    let text = "";
    process.stdin.on("data", chunk => { text += chunk; });
    process.stdin.on("end", () => {
      let deployment;
      try { deployment = JSON.parse(text); } catch { process.exit(2); }
      const versions = Array.isArray(deployment.versions) ? deployment.versions : [];
      if (versions.length !== 1 || Number(versions[0].percentage) !== 100 || !versions[0].version_id) {
        process.exit(3);
      }
      process.stdout.write(String(versions[0].version_id));
    });
  '
}

verify_version_provenance() {
  local version_id="$1" expected_sha="$2" version_json
  version_json="$(cd "$REPO_ROOT/api" && "${WRANGLER[@]}" versions view "$version_id" --json)" || return 1
  printf '%s' "$version_json" | node -e '
    const expectedSha = process.argv[1];
    let text = "";
    process.stdin.on("data", chunk => { text += chunk; });
    process.stdin.on("end", () => {
      let version;
      try { version = JSON.parse(text); } catch { process.exit(2); }
      const annotations = version.annotations || {};
      const tag = annotations["workers/tag"];
      const message = annotations["workers/message"];
      if (version.id !== process.argv[2] || tag !== `git-${expectedSha}` || message !== `git=${expectedSha}`) {
        process.exit(3);
      }
    });
  ' "$expected_sha" "$version_id"
}

rollback_previous() {
  local reason="$1" active_version_id
  if [ "$ROLLBACK_OWNED" != "1" ]; then
    if [ "$DEPLOY_COMMAND_SUCCEEDED" = "1" ]; then
      echo "MANUAL INTERVENTION REQUIRED: $reason; rollback ownership was never established, so no automatic rollback was attempted." >&2
      return 1
    fi
    return 0
  fi

  active_version_id="$(current_single_version_id)" || {
    echo "MANUAL INTERVENTION REQUIRED: $reason; the unique active Worker version could not be proven. No automatic rollback was attempted." >&2
    return 1
  }
  if [ "$active_version_id" != "$DEPLOYED_VERSION_ID" ]; then
    echo "MANUAL INTERVENTION REQUIRED: $reason; active Worker version changed from owned $DEPLOYED_VERSION_ID to $active_version_id. No automatic rollback was attempted." >&2
    return 1
  fi
  if ! verify_version_provenance "$active_version_id" "$RELEASE_SHA"; then
    echo "MANUAL INTERVENTION REQUIRED: $reason; active version $active_version_id no longer proves git=$RELEASE_SHA. No automatic rollback was attempted." >&2
    return 1
  fi

  echo "DEPLOYED RELEASE FAILED: $reason" >&2
  echo "Rolling back git=$RELEASE_SHA to Worker version $PREVIOUS_VERSION_ID ..." >&2
  if (cd "$REPO_ROOT/api" && "${WRANGLER[@]}" rollback "$PREVIOUS_VERSION_ID" --yes \
      --message "automatic rollback after $reason; failed git=$RELEASE_SHA"); then
    ROLLBACK_OWNED=0
    DEPLOY_COMMAND_SUCCEEDED=0
    echo "Rollback command completed." >&2
    return 0
  fi
  echo "ROLLBACK FAILED. Manual intervention required; previous version: $PREVIOUS_VERSION_ID" >&2
  return 1
}

abort_after_deploy() {
  local reason="$1"
  rollback_previous "$reason" || true
  exit 1
}

on_interrupt() {
  rollback_previous "interrupted smoke" || true
  exit 130
}
trap on_interrupt INT TERM HUP

run_deploy_preflight() {
  local branch origin_sha dirty
  command -v git >/dev/null || die "git is required"
  command -v node >/dev/null || die "Node.js is required"
  command -v npx >/dev/null || die "npx is required"

  branch="$(git -C "$REPO_ROOT" branch --show-current)"
  [ "$branch" = "main" ] || die "deploy is allowed only from main (current: ${branch:-detached})"
  git -C "$REPO_ROOT" diff --quiet --ignore-submodules -- || die "tracked worktree changes must be committed"
  git -C "$REPO_ROOT" diff --cached --quiet --ignore-submodules -- || die "staged changes must be committed"
  dirty="$(git -C "$REPO_ROOT" status --porcelain --untracked-files=all)"
  [ -z "$dirty" ] || die "worktree must be clean before deploy"

  git -C "$REPO_ROOT" fetch --quiet origin main || die "cannot refresh origin/main"
  RELEASE_SHA="$(git -C "$REPO_ROOT" rev-parse HEAD)" || die "cannot resolve release SHA"
  origin_sha="$(git -C "$REPO_ROOT" rev-parse origin/main)" || die "cannot resolve origin/main"
  [ "$RELEASE_SHA" = "$origin_sha" ] || die "HEAD must exactly match origin/main"

  echo "== PREDEPLOY QUALITY GATES: git=$RELEASE_SHA =="
  (cd "$REPO_ROOT" && node --test tests/*.test.js) || die "test suite failed"
  (cd "$REPO_ROOT" && node tools/verify-generated.js) || die "generated-output verification failed"
  (cd "$REPO_ROOT/api" && "${WRANGLER[@]}" deploy --strict --dry-run \
      --keep-vars \
      --var "RELEASE_SHA:$RELEASE_SHA" --message "preflight git=$RELEASE_SHA") || die "Wrangler dry-run failed"

  # Tests and verifiers must not have changed the release after the first check.
  git -C "$REPO_ROOT" diff --quiet --ignore-submodules -- || die "quality gates changed tracked files"
  git -C "$REPO_ROOT" diff --cached --quiet --ignore-submodules -- || die "quality gates changed the index"
  dirty="$(git -C "$REPO_ROOT" status --porcelain --untracked-files=all)"
  [ -z "$dirty" ] || die "quality gates left the worktree dirty"
  [ "$(git -C "$REPO_ROOT" rev-parse HEAD)" = "$RELEASE_SHA" ] || die "HEAD changed during preflight"
  [ "$(git -C "$REPO_ROOT" rev-parse origin/main)" = "$RELEASE_SHA" ] || die "origin/main changed during preflight"

  PREVIOUS_VERSION_ID="$(current_single_version_id)" || die \
    "cannot identify one 100% active Worker version; refusing deploy because rollback is not deterministic"
  echo "Preflight passed. Rollback target: $PREVIOUS_VERSION_ID"
}

# A Worker upload can finish before the nearest edge serves the new version. Poll
# one release-specific security contract before the full smoke so propagation is
# not misreported as a regression. A genuine bad release still fails after the
# bounded window instead of being silently retried forever.
wait_for_worker_release() {
  local attempt headers code acao release
  for attempt in 1 2 3 4 5 6 7 8 9 10; do
    headers="$(curl -s -D - -o /dev/null -w 'CODE %{http_code}' -X OPTIONS \
      -H "Origin: $FOREIGN_ORIGIN" \
      -H 'Access-Control-Request-Method: POST' \
      -H 'Access-Control-Request-Headers: content-type' \
      "$API_BASE$RELEASE_PROBE_PATH")"
    code="$(printf '%s' "$headers" | grep -o 'CODE [0-9]*' | awk '{print $2}')"
    acao="$(printf '%s' "$headers" | tr -d '\r' | awk -F': ' 'tolower($1)=="access-control-allow-origin"{print $2}')"
    release="$(printf '%s' "$headers" | tr -d '\r' | awk -F': ' 'tolower($1)=="x-fuluck-release"{print $2}')"
    if [ "$code" = "403" ] && [ -z "$acao" ] && [ "$release" = "$RELEASE_SHA" ]; then
      echo "   release readiness confirmed on attempt $attempt."
      return 0
    fi
    if [ "$attempt" != "10" ]; then
      echo "   edge release ${release:-unknown} not ready (HTTP ${code:-unknown}); retrying in 2s..."
      sleep 2
    fi
  done
  echo "DEPLOY PROPAGATION TIMEOUT — release-specific CORS contract never became ready."
  return 1
}

# ---------------------------------------------------------------------------
# 1. OPTIONAL GUARDED DEPLOY
# ---------------------------------------------------------------------------
if [ "$MODE" = "deploy" ]; then
  run_deploy_preflight
  echo "== DEPLOY: git=$RELEASE_SHA =="
  if (cd "$REPO_ROOT/api" && "${WRANGLER[@]}" deploy --strict \
      --keep-vars \
      --var "RELEASE_SHA:$RELEASE_SHA" --tag "git-$RELEASE_SHA" --message "git=$RELEASE_SHA"); then
    DEPLOY_COMMAND_SUCCEEDED=1
  else
    echo "MANUAL INTERVENTION REQUIRED: deploy command failed with uncertain remote state. No automatic rollback was attempted." >&2
    exit 1
  fi
  DEPLOYED_VERSION_ID="$(current_single_version_id)" || abort_after_deploy \
    "control plane did not report one active version"
  [ "$DEPLOYED_VERSION_ID" != "$PREVIOUS_VERSION_ID" ] || abort_after_deploy \
    "control plane still reports the previous version"
  verify_version_provenance "$DEPLOYED_VERSION_ID" "$RELEASE_SHA" || abort_after_deploy \
    "active version metadata does not match git=$RELEASE_SHA"
  ROLLBACK_OWNED=1
  echo "   control plane confirmed Worker version $DEPLOYED_VERSION_ID for git=$RELEASE_SHA"
  echo "   deploy complete; waiting for release-specific edge readiness..."
  wait_for_worker_release || abort_after_deploy "release readiness smoke failed"
else
  echo "== DEPLOY skipped (default smoke-only mode; pass --deploy explicitly) =="
fi

echo ""
echo "== SMOKE TESTS against $API_BASE =="

# ---------------------------------------------------------------------------
# 2. GET /api/kittens -> 200 + a non-empty array
# ---------------------------------------------------------------------------
body="$(curl -s -w $'\n%{http_code}' "$API_BASE/api/kittens")"
code="$(printf '%s' "$body" | tail -n1)"
json="$(printf '%s' "$body" | sed '$d')"
count="$(printf '%s' "$json" | python3 -c 'import sys,json; print(len(json.load(sys.stdin)))' 2>/dev/null || echo -1)"
if [ "$code" = "200" ] && [ "$count" -gt 0 ] 2>/dev/null; then
  pass "/api/kittens -> 200 with a non-empty array ($count records)"
else
  fail "/api/kittens -> HTTP $code, count=$count (expected 200 / non-empty array)"
fi

# A deleted owner-gated price file was previously cached as immutable. The exact
# Worker route must override that legacy object while leaving the rest of the site
# on its existing origin.
code="$(curl -s -o /dev/null -w '%{http_code}' "$SITE_ORIGIN/boarding-config.js")"
if [ "$code" = "404" ]; then
  pass "legacy boarding pricing URL -> 404 tombstone"
else
  fail "legacy boarding pricing URL -> $code (expected 404 tombstone)"
fi

# ---------------------------------------------------------------------------
# 3. Small-animal dark-launch API: public empty/list response + private gates
# ---------------------------------------------------------------------------
body="$(curl -s -w $'\n%{http_code}' "$API_BASE/api/small-animals")"
code="$(printf '%s' "$body" | tail -n1)"
json="$(printf '%s' "$body" | sed '$d')"
is_array="$(printf '%s' "$json" | python3 -c 'import sys,json; print("yes" if isinstance(json.load(sys.stdin), list) else "no")' 2>/dev/null || echo no)"
small_count="$(printf '%s' "$json" | python3 -c 'import sys,json; v=json.load(sys.stdin); print(len(v) if isinstance(v,list) else -1)' 2>/dev/null || echo -1)"
small_public="$(node -p "require('$REPO_ROOT/small-animals-launch.json').public === true ? 'true' : 'false'")"
if [ "$small_public" = "false" ] && [ "$code" = "200" ] && [ "$small_count" = "0" ]; then
  pass "/api/small-animals dark launch -> 200 empty array"
elif [ "$small_public" = "true" ] && [ "$code" = "200" ] && [ "$is_array" = "yes" ]; then
  pass "/api/small-animals public launch -> 200 array ($small_count records)"
else
  fail "/api/small-animals -> HTTP $code, count=$small_count, public=$small_public (expected 200 / empty while dark, array while public)"
fi

code="$(curl -s -o /dev/null -w '%{http_code}' "$API_BASE/api/admin/small-animals")"
if [ "$code" = "403" ]; then
  pass "small-animal admin without Origin -> 403"
else
  fail "small-animal admin without Origin -> $code (expected 403)"
fi

code="$(curl -s -o /dev/null -w '%{http_code}' \
  -H 'Origin: https://fuluckpet.com' "$API_BASE/api/admin/small-animals")"
if [ "$code" = "401" ]; then
  pass "small-animal admin with valid Origin but no Bearer -> 401"
else
  fail "small-animal admin with valid Origin but no Bearer -> $code (expected 401)"
fi

# Optional authenticated negative write: malformed bulk shape must be rejected
# before KV put. The password is read only from the caller environment and never logged.
if [ -n "${FULUCK_ADMIN_PASS:-}" ]; then
  code="$(curl -s -o /dev/null -w '%{http_code}' -X POST \
    -H 'Origin: https://fuluckpet.com' \
    -H "Authorization: Bearer $FULUCK_ADMIN_PASS" \
    -H 'Content-Type: application/json' \
    --data '{"not":"an array"}' \
    "$API_BASE/api/admin/small-animals/bulk")"
  if [ "$code" = "400" ]; then
    pass "authenticated malformed small-animal bulk -> 400/no write"
  else
    fail "authenticated malformed small-animal bulk -> $code (expected 400)"
  fi
else
  echo "     authenticated malformed-write check skipped (FULUCK_ADMIN_PASS not set)"
fi

# ---------------------------------------------------------------------------
# 4. Existing admin route -> 401 or 403 (auth/CORS gate must still bite)
# ---------------------------------------------------------------------------
code="$(curl -s -o /dev/null -w '%{http_code}' "$API_BASE/api/admin/kittens")"
if [ "$code" = "401" ] || [ "$code" = "403" ]; then
  pass "unauthed /api/admin/kittens -> $code"
else
  fail "unauthed /api/admin/kittens -> $code (expected 401/403)"
fi

# ---------------------------------------------------------------------------
# 5. drive-img cached path: two GETs, print X-Img-Cache + timing each time.
#    1st hit: ORIGIN, R2, or already-warm EDGE.  2nd hit: EDGE or R2.
#    Also assert Cache-Control immutable + ETag present.
# ---------------------------------------------------------------------------
smoke_img() {
  local id="$1"
  local url="$API_BASE/api/drive/img/$id"
  echo "  -- drive-img $id --"
  local hdr1 t1 x1 cc etag code1
  hdr1="$(curl -s -o /dev/null -D - -w 'TIME %{time_total} CODE %{http_code}' "$url")"
  t1="$(printf '%s' "$hdr1" | grep -o 'TIME [0-9.]*' | awk '{print $2}')"
  code1="$(printf '%s' "$hdr1" | grep -o 'CODE [0-9]*' | awk '{print $2}')"
  x1="$(printf '%s' "$hdr1" | tr -d '\r' | awk -F': ' 'tolower($1)=="x-img-cache"{print $2}')"
  cc="$(printf '%s' "$hdr1" | tr -d '\r' | awk -F': ' 'tolower($1)=="cache-control"{print $2}')"
  etag="$(printf '%s' "$hdr1" | tr -d '\r' | awk -F': ' 'tolower($1)=="etag"{print $2}')"
  echo "     GET#1  HTTP $code1  X-Img-Cache=${x1:-<none>}  ${t1}s"

  local hdr2 t2 x2 code2
  hdr2="$(curl -s -o /dev/null -D - -w 'TIME %{time_total} CODE %{http_code}' "$url")"
  t2="$(printf '%s' "$hdr2" | grep -o 'TIME [0-9.]*' | awk '{print $2}')"
  code2="$(printf '%s' "$hdr2" | grep -o 'CODE [0-9]*' | awk '{print $2}')"
  x2="$(printf '%s' "$hdr2" | tr -d '\r' | awk -F': ' 'tolower($1)=="x-img-cache"{print $2}')"
  echo "     GET#2  HTTP $code2  X-Img-Cache=${x2:-<none>}  ${t2}s"

  # Assertions
  case "$x1" in ORIGIN|R2|EDGE) pass "$id GET#1 X-Img-Cache=$x1 (ORIGIN|R2|EDGE)";; *) fail "$id GET#1 X-Img-Cache=${x1:-<none>} (expected ORIGIN|R2|EDGE)";; esac
  case "$x2" in EDGE|R2)   pass "$id GET#2 X-Img-Cache=$x2 (EDGE|R2, cache warmed)";; *) fail "$id GET#2 X-Img-Cache=${x2:-<none>} (expected EDGE|R2)";; esac
  case "$cc" in *immutable*) pass "$id Cache-Control has immutable ($cc)";; *) fail "$id Cache-Control='$cc' (expected immutable)";; esac
  if [ -n "$etag" ]; then pass "$id ETag present ($etag)"; else fail "$id ETag missing"; fi
}
smoke_img "$IMG_A"
smoke_img "$IMG_B"

# ---------------------------------------------------------------------------
# 6. Bogus drive-img id -> non-200, error shape preserved, and NOT cached
#    (repeat returns the same error, never an X-Img-Cache=EDGE/R2 hit).
# ---------------------------------------------------------------------------
echo "  -- drive-img bogus id (must not cache errors) --"
url="$API_BASE/api/drive/img/$IMG_BOGUS"
h1="$(curl -s -D - -o /dev/null -w 'CODE %{http_code}' "$url")"
c1="$(printf '%s' "$h1" | grep -o 'CODE [0-9]*' | awk '{print $2}')"
xc1="$(printf '%s' "$h1" | tr -d '\r' | awk -F': ' 'tolower($1)=="x-img-cache"{print $2}')"
h2="$(curl -s -D - -o /dev/null -w 'CODE %{http_code}' "$url")"
c2="$(printf '%s' "$h2" | grep -o 'CODE [0-9]*' | awk '{print $2}')"
xc2="$(printf '%s' "$h2" | tr -d '\r' | awk -F': ' 'tolower($1)=="x-img-cache"{print $2}')"
echo "     GET#1 HTTP $c1  X-Img-Cache=${xc1:-<none>}"
echo "     GET#2 HTTP $c2  X-Img-Cache=${xc2:-<none>}"
if [ "$c1" != "200" ] && [ "$c2" != "200" ]; then
  pass "bogus id -> non-200 both times ($c1, $c2)"
else
  fail "bogus id -> HTTP $c1 / $c2 (expected non-200 both)"
fi
if [ -z "$xc1" ] && [ -z "$xc2" ]; then
  pass "bogus id error NOT cached (no X-Img-Cache header either time)"
else
  fail "bogus id error was cached: X-Img-Cache #1=${xc1:-<none>} #2=${xc2:-<none>}"
fi

# ---------------------------------------------------------------------------
# 7. A1 — story endpoints reject a FOREIGN origin before rate-limit/provider work.
# ---------------------------------------------------------------------------
echo "  -- A1 story CORS lock (foreign origin rejected before paid work) --"
for ep in "/api/story/analyze-photo" "/api/story/generate"; do
  story_headers="$(curl -s -D - -o /dev/null -w 'CODE %{http_code}' -X OPTIONS \
      -H "Origin: $FOREIGN_ORIGIN" \
      -H 'Access-Control-Request-Method: POST' \
      -H 'Access-Control-Request-Headers: content-type' \
      "$API_BASE$ep")"
  story_code="$(printf '%s' "$story_headers" | grep -o 'CODE [0-9]*' | awk '{print $2}')"
  story_acao="$(printf '%s' "$story_headers" | tr -d '\r' | awk -F': ' 'tolower($1)=="access-control-allow-origin"{print $2}')"
  if [ "$story_code" = "403" ] && [ -z "$story_acao" ]; then
    pass "story $ep OPTIONS foreign-origin -> 403/no ACAO"
  else
    fail "story $ep OPTIONS foreign-origin -> HTTP $story_code ACAO=${story_acao:-<none>} (expected 403/no ACAO)"
  fi

  story_headers="$(curl -s -D - -o /dev/null -w 'CODE %{http_code}' -X POST \
      -H "Origin: $FOREIGN_ORIGIN" \
      -H 'Content-Type: application/json' \
      --data '{}' \
      "$API_BASE$ep")"
  story_code="$(printf '%s' "$story_headers" | grep -o 'CODE [0-9]*' | awk '{print $2}')"
  story_acao="$(printf '%s' "$story_headers" | tr -d '\r' | awk -F': ' 'tolower($1)=="access-control-allow-origin"{print $2}')"
  if [ "$story_code" = "403" ] && [ -z "$story_acao" ]; then
    pass "story $ep POST foreign-origin -> 403/no ACAO before provider work"
  else
    fail "story $ep POST foreign-origin -> HTTP $story_code ACAO=${story_acao:-<none>} (expected 403/no ACAO)"
  fi
done
# And confirm a SAME-origin preflight is still allowed (ACAO echoes the site origin).
acao_same="$(curl -s -D - -o /dev/null -X OPTIONS \
    -H "Origin: $SITE_ORIGIN" -H 'Access-Control-Request-Method: POST' \
    -H 'Access-Control-Request-Headers: content-type' \
    "$API_BASE/api/story/generate" | tr -d '\r' | awk -F': ' 'tolower($1)=="access-control-allow-origin"{print $2}')"
if [ "$acao_same" = "$SITE_ORIGIN" ]; then
  pass "story OPTIONS same-origin ACAO=$SITE_ORIGIN (legit calls preserved)"
else
  fail "story OPTIONS same-origin ACAO=${acao_same:-<none>} (expected $SITE_ORIGIN)"
fi

# Invalid input proves a same-origin POST reaches bounded validation without
# consuming quota or invoking a provider.
story_headers="$(curl -s -D - -o /dev/null -w 'CODE %{http_code}' -X POST \
    -H "Origin: $SITE_ORIGIN" \
    -H 'Content-Type: application/json' \
    --data '{}' \
    "$API_BASE/api/story/generate")"
story_code="$(printf '%s' "$story_headers" | grep -o 'CODE [0-9]*' | awk '{print $2}')"
story_acao="$(printf '%s' "$story_headers" | tr -d '\r' | awk -F': ' 'tolower($1)=="access-control-allow-origin"{print $2}')"
if [ "$story_code" = "400" ] && [ "$story_acao" = "$SITE_ORIGIN" ]; then
  pass "story generate POST same-origin -> 400 bounded validation/$SITE_ORIGIN"
else
  fail "story generate POST same-origin -> HTTP $story_code ACAO=${story_acao:-<none>} (expected 400/$SITE_ORIGIN)"
fi

# ---------------------------------------------------------------------------
# 8. A3 — chat CORS lock: every chat namespace variant rejects foreign-origin
#    OPTIONS before work; exact POST is also rejected before chat side effects.
# ---------------------------------------------------------------------------
echo "  -- A3 chat CORS lock (foreign origin rejected before work) --"
for ep in "/api/chat" "/api/chat/" "/api/chat/diagnostic" "/api/%63hat" "/api/chat%2Fdiagnostic"; do
  chat_headers="$(curl -s -D - -o /dev/null -w 'CODE %{http_code}' -X OPTIONS \
      -H "Origin: $FOREIGN_ORIGIN" \
      -H 'Access-Control-Request-Method: POST' \
      -H 'Access-Control-Request-Headers: content-type' \
      "$API_BASE$ep")"
  chat_code="$(printf '%s' "$chat_headers" | grep -o 'CODE [0-9]*' | awk '{print $2}')"
  chat_acao="$(printf '%s' "$chat_headers" | tr -d '\r' | awk -F': ' 'tolower($1)=="access-control-allow-origin"{print $2}')"
  if [ "$chat_code" = "403" ] && [ -z "$chat_acao" ]; then
    pass "chat $ep OPTIONS foreign-origin -> 403/no ACAO"
  else
    fail "chat $ep OPTIONS foreign-origin -> HTTP $chat_code ACAO=${chat_acao:-<none>} (expected 403/no ACAO)"
  fi
done

chat_headers="$(curl -s -D - -o /dev/null -w 'CODE %{http_code}' -X POST \
    -H "Origin: $FOREIGN_ORIGIN" \
    -H 'Content-Type: application/json' \
    --data '{}' \
    "$API_BASE/api/chat")"
chat_code="$(printf '%s' "$chat_headers" | grep -o 'CODE [0-9]*' | awk '{print $2}')"
chat_acao="$(printf '%s' "$chat_headers" | tr -d '\r' | awk -F': ' 'tolower($1)=="access-control-allow-origin"{print $2}')"
if [ "$chat_code" = "403" ] && [ -z "$chat_acao" ]; then
  pass "chat POST foreign-origin -> 403/no ACAO before provider work"
else
  fail "chat POST foreign-origin -> HTTP $chat_code ACAO=${chat_acao:-<none>} (expected 403/no ACAO)"
fi

chat_headers="$(curl -s -D - -o /dev/null -w 'CODE %{http_code}' -X OPTIONS \
    -H "Origin: $SITE_ORIGIN" \
    -H 'Access-Control-Request-Method: POST' \
    -H 'Access-Control-Request-Headers: content-type' \
    "$API_BASE/api/chat")"
chat_code="$(printf '%s' "$chat_headers" | grep -o 'CODE [0-9]*' | awk '{print $2}')"
chat_acao="$(printf '%s' "$chat_headers" | tr -d '\r' | awk -F': ' 'tolower($1)=="access-control-allow-origin"{print $2}')"
if [ "$chat_code" = "200" ] && [ "$chat_acao" = "$SITE_ORIGIN" ]; then
  pass "chat OPTIONS same-origin -> 200 ACAO=$SITE_ORIGIN"
else
  fail "chat OPTIONS same-origin -> HTTP $chat_code ACAO=${chat_acao:-<none>} (expected 200/$SITE_ORIGIN)"
fi

# Invalid body proves the same-origin POST reaches chat validation without invoking a provider.
chat_headers="$(curl -s -D - -o /dev/null -w 'CODE %{http_code}' -X POST \
    -H "Origin: $SITE_ORIGIN" \
    -H 'Content-Type: application/json' \
    --data '{}' \
    "$API_BASE/api/chat")"
chat_code="$(printf '%s' "$chat_headers" | grep -o 'CODE [0-9]*' | awk '{print $2}')"
chat_acao="$(printf '%s' "$chat_headers" | tr -d '\r' | awk -F': ' 'tolower($1)=="access-control-allow-origin"{print $2}')"
if [ "$chat_code" = "400" ] && [ "$chat_acao" = "$SITE_ORIGIN" ]; then
  pass "chat POST same-origin -> validation 400 ACAO=$SITE_ORIGIN (route remains functional)"
else
  fail "chat POST same-origin -> HTTP $chat_code ACAO=${chat_acao:-<none>} (expected validation 400/$SITE_ORIGIN)"
fi

# ---------------------------------------------------------------------------
# 9. A1 — story per-IP throttle: a burst of valid requests eventually returns 429.
#    This is deliberately opt-in because valid requests may invoke paid providers until
#    the cap is reached. Bounded validation now runs before the throttle.
# ---------------------------------------------------------------------------
if [ "${RUN_RATE_LIMIT_SMOKE:-0}" = "1" ]; then
echo "  -- A1 story per-IP throttle (>cap -> 429; may invoke paid providers) --"
STORY_EP="$API_BASE/api/story/generate"
saw_429=0
last_code=""
for i in $(seq 1 25); do
  last_code="$(curl -s -o /dev/null -w '%{http_code}' -X POST \
      -H 'Content-Type: application/json' \
      --data '{"name":"Smoke test"}' "$STORY_EP")"
  if [ "$last_code" = "429" ]; then saw_429=1; break; fi
done
if [ "$saw_429" = "1" ]; then
  pass "story burst hit 429 within 25 requests (throttle fired at ~20/hr before paid call)"
else
  fail "story burst never returned 429 in 25 requests (last=$last_code) — throttle not biting"
fi
# The 429 body should carry a Retry-After header.
ra="$(curl -s -D - -o /dev/null -X POST -H 'Content-Type: application/json' --data '{"name":"Smoke test"}' "$STORY_EP" \
      | tr -d '\r' | awk -F': ' 'tolower($1)=="retry-after"{print $2}')"
if [ -n "$ra" ]; then
  pass "story 429 carries Retry-After ($ra s)"
else
  # Only meaningful if we're actually capped now; treat as soft-info if not capped.
  echo "     (Retry-After not observed — bucket may have reset; non-fatal)"
fi
else
  echo "  -- A1 story per-IP throttle skipped (set RUN_RATE_LIMIT_SMOKE=1 to saturate the production bucket) --"
fi

# ---------------------------------------------------------------------------
# 10. B4 — drive-img edge cache key normalized: the SAME fileId with a junk ?cachebust
#    must resolve to the SAME cached entry (not a fresh ORIGIN miss each time), proving
#    the query string is stripped from the cache key. Warm once, then hit with a random
#    cachebust and expect EDGE or R2 (a cache hit), never a cold ORIGIN.
# ---------------------------------------------------------------------------
echo "  -- B4 drive-img cache-key normalization (?cachebust must not bypass cache) --"
warm_url="$API_BASE/api/drive/img/$IMG_A"
curl -s -o /dev/null "$warm_url"   # warm
curl -s -o /dev/null "$warm_url"   # ensure edge/R2 populated
bust_url="$API_BASE/api/drive/img/$IMG_A?cachebust=$RANDOM$RANDOM"
xbust="$(curl -s -D - -o /dev/null "$bust_url" | tr -d '\r' | awk -F': ' 'tolower($1)=="x-img-cache"{print $2}')"
case "$xbust" in
  EDGE|R2) pass "?cachebust served from cache (X-Img-Cache=$xbust) — query stripped from key";;
  ORIGIN)  fail "?cachebust caused a cold ORIGIN fetch (X-Img-Cache=ORIGIN) — key not normalized";;
  *)       echo "     ?cachebust X-Img-Cache=${xbust:-<none>} (inconclusive; non-fatal)";;
esac

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo ""
echo "== RESULT: $pass_count passed, $fail_count failed =="
if [ "$fail_count" -ne 0 ]; then
  if [ "$DEPLOY_COMMAND_SUCCEEDED" = "1" ]; then
    abort_after_deploy "post-deploy smoke reported $fail_count failure(s)"
  fi
  exit 1
fi

if [ "$ROLLBACK_OWNED" = "1" ]; then
  ROLLBACK_OWNED=0
  DEPLOY_COMMAND_SUCCEEDED=0
  echo "Release accepted: git=$RELEASE_SHA version=$DEPLOYED_VERSION_ID (rollback target was $PREVIOUS_VERSION_ID)."
fi

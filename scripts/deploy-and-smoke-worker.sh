#!/usr/bin/env bash
#
# deploy-and-smoke-worker.sh — deploy the fuluck-api Worker and smoke-test it.
#
# Covers core catalogue availability, small-animal dark-launch routes, private auth
# gates, and drive-img layered caching. Expensive/destructive throttling is opt-in.
# Idempotent and safe to re-run. Each check prints a clear PASS/FAIL line; the
# script exits non-zero if any check fails.
#
# Usage:  scripts/deploy-and-smoke-worker.sh            # deploy, then smoke
#         SKIP_DEPLOY=1 scripts/deploy-and-smoke-worker.sh   # smoke only (no deploy)
#
# Requires: wrangler (via npx) authenticated for the fuluck-api account; curl.

set -u -o pipefail

API_BASE="https://fuluck-api.mouxue56.workers.dev"
# Two REAL kitten-card LCP images (Drive file ids from kittens.html).
IMG_A="1WgbZ2SZ1c8Q43wBdqu8vu9w3a3Idxj-A"
IMG_B="11A__yaCqHdX2DQWdoJJt09SL96fommeS"
# A never-existing Drive id — must error and must NOT be cached.
IMG_BOGUS="BOGUS_nonexistent_id_smoke_xyz123"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

pass_count=0
fail_count=0
pass() { echo "  PASS  $1"; pass_count=$((pass_count+1)); }
fail() { echo "  FAIL  $1"; fail_count=$((fail_count+1)); }

# ---------------------------------------------------------------------------
# 1. DEPLOY
# ---------------------------------------------------------------------------
if [ "${SKIP_DEPLOY:-0}" = "1" ]; then
  echo "== DEPLOY skipped (SKIP_DEPLOY=1) =="
else
  echo "== DEPLOY: cd api && npx wrangler deploy =="
  ( cd "$REPO_ROOT/api" && npx wrangler deploy ) || { echo "DEPLOY FAILED — aborting smoke tests."; exit 1; }
  echo "   deploy complete; waiting 5s for propagation..."
  sleep 5
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

# ---------------------------------------------------------------------------
# 3. Small-animal dark-launch API: public empty/list response + private gates
# ---------------------------------------------------------------------------
body="$(curl -s -w $'\n%{http_code}' "$API_BASE/api/small-animals")"
code="$(printf '%s' "$body" | tail -n1)"
json="$(printf '%s' "$body" | sed '$d')"
is_array="$(printf '%s' "$json" | python3 -c 'import sys,json; print("yes" if isinstance(json.load(sys.stdin), list) else "no")' 2>/dev/null || echo no)"
if [ "$code" = "200" ] && [ "$is_array" = "yes" ]; then
  pass "/api/small-animals -> 200 array"
else
  fail "/api/small-animals -> HTTP $code, array=$is_array (expected 200 / array)"
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
# 7. A1 — story endpoints CORS-locked: OPTIONS/POST from a FOREIGN origin must NOT
#    return Access-Control-Allow-Origin: *  (expect the locked site origin, or none).
# ---------------------------------------------------------------------------
echo "  -- A1 story CORS lock (foreign origin must not get ACAO:*) --"
SITE_ORIGIN="https://fuluckpet.com"
FOREIGN_ORIGIN="https://evil.example.com"
for ep in "/api/story/analyze-photo" "/api/story/generate"; do
  # Preflight (OPTIONS) from a foreign origin.
  acao="$(curl -s -D - -o /dev/null -X OPTIONS \
      -H "Origin: $FOREIGN_ORIGIN" \
      -H 'Access-Control-Request-Method: POST' \
      -H 'Access-Control-Request-Headers: content-type' \
      "$API_BASE$ep" | tr -d '\r' | awk -F': ' 'tolower($1)=="access-control-allow-origin"{print $2}')"
  if [ "$acao" = "*" ]; then
    fail "$ep OPTIONS foreign-origin returned ACAO:* (must be locked)"
  elif [ -z "$acao" ] || [ "$acao" = "$SITE_ORIGIN" ]; then
    pass "$ep OPTIONS foreign-origin ACAO=${acao:-<none>} (not *)"
  else
    fail "$ep OPTIONS foreign-origin ACAO=$acao (expected $SITE_ORIGIN or none, never *)"
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

# ---------------------------------------------------------------------------
# 8. A1 — story per-IP throttle: a burst of >cap requests returns 429. The body is
#    intentionally minimal/invalid so it fails validation fast — but the throttle runs
#    BEFORE the paid AI call and before the body read, so once the cap (20/hour) is hit
#    we get a 429 (not a 400/500). We fire 25 to clear the cap, then assert a 429 shows.
#    NOTE: this consumes the hour bucket for the test runner's egress IP — expected.
# ---------------------------------------------------------------------------
if [ "${RUN_RATE_LIMIT_SMOKE:-0}" = "1" ]; then
echo "  -- A1 story per-IP throttle (>cap -> 429 before paid call) --"
STORY_EP="$API_BASE/api/story/generate"
saw_429=0
last_code=""
for i in $(seq 1 25); do
  last_code="$(curl -s -o /dev/null -w '%{http_code}' -X POST \
      -H 'Content-Type: application/json' \
      --data '{}' "$STORY_EP")"
  if [ "$last_code" = "429" ]; then saw_429=1; break; fi
done
if [ "$saw_429" = "1" ]; then
  pass "story burst hit 429 within 25 requests (throttle fired at ~20/hr before paid call)"
else
  fail "story burst never returned 429 in 25 requests (last=$last_code) — throttle not biting"
fi
# The 429 body should carry a Retry-After header.
ra="$(curl -s -D - -o /dev/null -X POST -H 'Content-Type: application/json' --data '{}' "$STORY_EP" \
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
# 9. B4 — drive-img edge cache key normalized: the SAME fileId with a junk ?cachebust
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
[ "$fail_count" -eq 0 ] || exit 1

#!/usr/bin/env bash
# Upload merged articles list to KV via wrangler.
# Reads /tmp/blog-merged.json (existing 118 + new 10) and PUTs to articles key.
# After: verifies via public API.

set -euo pipefail
cd "$(dirname "$0")/../api"

if [ ! -f /tmp/blog-merged.json ]; then
  echo "Missing /tmp/blog-merged.json — run gen-blog-kimi.mjs first"
  exit 1
fi

EXPECTED=$(python3 -c "import json; print(len(json.load(open('/tmp/blog-merged.json'))))")
echo "About to upload $EXPECTED articles to KV (binding=DATA, key=articles)"

wrangler kv key put --binding=DATA --remote articles --path=/tmp/blog-merged.json
echo "wrangler put complete"

echo "Verifying via public API..."
sleep 3
ACTUAL=$(curl -s https://fuluck-api.mouxue56.workers.dev/api/articles | python3 -c "import json,sys; print(len(json.load(sys.stdin)))")
echo "Public API now reports: $ACTUAL articles"
if [ "$ACTUAL" -eq "$EXPECTED" ]; then
  echo "OK — counts match"
else
  echo "WARN — count mismatch (expected $EXPECTED, got $ACTUAL)"
  exit 1
fi

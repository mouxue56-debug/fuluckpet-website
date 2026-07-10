#!/usr/bin/env bash
# Safely inspect or replace the complete production `articles` KV value.
# Default is an offline dry run. Remote writes require an explicit mode and the
# SHA-256 of the exact file being written.

set -euo pipefail
umask 077

readonly WRANGLER_VERSION="4.70.0"
readonly -a WRANGLER=(npx --yes "wrangler@$WRANGLER_VERSION")

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_DIR="$REPO_ROOT/api"
MODE="dry-run"
INPUT="/tmp/blog-merged.json"
CONFIRM_SHA=""
ALLOW_REMOVALS=0
BACKUP_DIR="${FULUCK_KV_BACKUP_DIR:-${TMPDIR:-/tmp}/fuluckpet-kv-backups}"

usage() {
  cat <<'EOF'
Usage:
  tools/upload-blog-bulk.sh [dry-run] [--file PATH]
  tools/upload-blog-bulk.sh apply --file PATH --confirm-sha SHA256 [--allow-removals]
  tools/upload-blog-bulk.sh restore --file SNAPSHOT --confirm-sha SHA256 [--allow-removals]

dry-run is offline: it validates the article array and prints its count/hash.
apply/restore snapshot the current remote value, show an ID-level diff, then write.
Backups default to a private directory under $TMPDIR, outside the repository.
EOF
}

case "${1:-}" in
  dry-run|apply|restore) MODE="$1"; shift ;;
  -h|--help) usage; exit 0 ;;
esac

while [ "$#" -gt 0 ]; do
  case "$1" in
    --file)
      [ "$#" -ge 2 ] || { echo "--file requires a path" >&2; exit 64; }
      INPUT="$2"
      shift 2
      ;;
    --confirm-sha)
      [ "$#" -ge 2 ] || { echo "--confirm-sha requires a value" >&2; exit 64; }
      CONFIRM_SHA="$2"
      shift 2
      ;;
    --allow-removals)
      ALLOW_REMOVALS=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 64
      ;;
  esac
done

[ -f "$INPUT" ] || { echo "Input file not found: $INPUT" >&2; exit 1; }

PINNED_INPUT=""
cleanup_pinned_input() {
  if [ -n "$PINNED_INPUT" ]; then
    rm -f -- "$PINNED_INPUT"
  fi
}
trap cleanup_pinned_input EXIT

sha256_file() {
  shasum -a 256 "$1" | awk '{print $1}'
}

validate_articles() {
  python3 - "$1" <<'PY'
import json
import re
import sys

path = sys.argv[1]
try:
    with open(path, "r", encoding="utf-8") as handle:
        articles = json.load(handle)
except Exception as exc:
    print(f"invalid JSON: {exc}", file=sys.stderr)
    raise SystemExit(1)

if not isinstance(articles, list):
    print("schema error: root must be an article array", file=sys.stderr)
    raise SystemExit(1)

seen_ids = set()
seen_slugs = set()
for index, article in enumerate(articles):
    if not isinstance(article, dict):
        print(f"schema error: item {index} must be an object", file=sys.stderr)
        raise SystemExit(1)
    article_id = article.get("id")
    slug = article.get("slug")
    if not isinstance(article_id, str) or not article_id.strip():
        print(f"schema error: item {index} has no non-empty string id", file=sys.stderr)
        raise SystemExit(1)
    if article_id in seen_ids:
        print(f"duplicate article id: {article_id}", file=sys.stderr)
        raise SystemExit(1)
    seen_ids.add(article_id)
    if not isinstance(slug, str) or not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", slug):
        print(f"schema error: item {index} has an unsafe slug", file=sys.stderr)
        raise SystemExit(1)
    if slug in seen_slugs:
        print(f"duplicate article slug: {slug}", file=sys.stderr)
        raise SystemExit(1)
    seen_slugs.add(slug)
    for field in ("title", "excerpt", "content"):
        if field in article and not isinstance(article[field], dict):
            print(f"schema error: item {index} field {field} must be an object", file=sys.stderr)
            raise SystemExit(1)
    if "published" in article and not isinstance(article["published"], bool):
        print(f"schema error: item {index} published must be boolean", file=sys.stderr)
        raise SystemExit(1)

print(len(articles))
PY
}

snapshot_remote() {
  local label="$1" timestamp partial snapshot
  mkdir -p "$BACKUP_DIR"
  timestamp="$(date -u '+%Y%m%dT%H%M%SZ')"
  partial="$BACKUP_DIR/articles-${timestamp}-${label}-$$.json.partial"
  snapshot="${partial%.partial}"
  (cd "$API_DIR" && "${WRANGLER[@]}" kv key get articles --binding=DATA --remote --text) > "$partial"
  validate_articles "$partial" >/dev/null
  mv "$partial" "$snapshot"
  chmod 600 "$snapshot"
  printf '%s' "$snapshot"
}

diff_summary() {
  echo "DIFF SUMMARY (article IDs only)"
  python3 - "$1" "$2" <<'PY'
import json
import sys

with open(sys.argv[1], encoding="utf-8") as handle:
    old = json.load(handle)
with open(sys.argv[2], encoding="utf-8") as handle:
    new = json.load(handle)

old_by_id = {item["id"]: item for item in old}
new_by_id = {item["id"]: item for item in new}
added = sorted(new_by_id.keys() - old_by_id.keys())
removed = sorted(old_by_id.keys() - new_by_id.keys())
changed = sorted(key for key in old_by_id.keys() & new_by_id.keys() if old_by_id[key] != new_by_id[key])
print(f"  old={len(old)} new={len(new)} added={len(added)} removed={len(removed)} changed={len(changed)}")
for label, values in (("added", added), ("removed", removed), ("changed", changed)):
    preview = ", ".join(values[:20]) if values else "none"
    suffix = " ..." if len(values) > 20 else ""
    print(f"  {label}: {preview}{suffix}")
print(f"REMOVED_COUNT={len(removed)}")
PY
}

remote_put() {
  local source="$1"
  (cd "$API_DIR" && "${WRANGLER[@]}" kv key put articles --binding=DATA --remote --path="$source")
}

VERIFIED_INPUT="$INPUT"
if [ "$MODE" != "dry-run" ]; then
  mkdir -p "$BACKUP_DIR"
  PINNED_INPUT="$(mktemp "$BACKUP_DIR/.articles-${MODE}-input.XXXXXX")"
  cp -- "$INPUT" "$PINNED_INPUT"
  chmod 600 "$PINNED_INPUT"
  VERIFIED_INPUT="$PINNED_INPUT"
fi

INPUT_COUNT="$(validate_articles "$VERIFIED_INPUT")"
INPUT_SHA="$(sha256_file "$VERIFIED_INPUT")"

if [ "$MODE" = "dry-run" ]; then
  echo "DRY RUN — no network and no write"
  echo "  file: $INPUT"
  echo "  articles: $INPUT_COUNT"
  echo "  sha256: $INPUT_SHA"
  echo "To write, use: $0 apply --file '$INPUT' --confirm-sha $INPUT_SHA"
  exit 0
fi

case "$CONFIRM_SHA" in
  [0-9a-f][0-9a-f]*) ;;
  *) echo "apply/restore requires --confirm-sha with the exact lowercase SHA-256" >&2; exit 64 ;;
esac
[ "${#CONFIRM_SHA}" -eq 64 ] || { echo "--confirm-sha must contain 64 hex characters" >&2; exit 64; }
[ "$CONFIRM_SHA" = "$INPUT_SHA" ] || {
  echo "hash confirmation mismatch: expected $INPUT_SHA" >&2
  exit 1
}

SNAPSHOT="$(snapshot_remote "before-${MODE}")"
SNAPSHOT_SHA="$(sha256_file "$SNAPSHOT")"
echo "Remote snapshot: $SNAPSHOT"
echo "Remote snapshot sha256: $SNAPSHOT_SHA"
DIFF="$(diff_summary "$SNAPSHOT" "$VERIFIED_INPUT")"
printf '%s\n' "$DIFF"
REMOVED_COUNT="$(printf '%s\n' "$DIFF" | awk -F= '/^REMOVED_COUNT=/{print $2}')"
if [ "${REMOVED_COUNT:-0}" -gt 0 ] && [ "$ALLOW_REMOVALS" != "1" ]; then
  echo "Refusing to remove $REMOVED_COUNT article(s); inspect the diff and pass --allow-removals deliberately." >&2
  exit 1
fi

echo "Writing exact sha256 $INPUT_SHA in explicit $MODE mode..."

# Refuse if another operator changed the collection after our snapshot/diff.
PREWRITE_FILE="$BACKUP_DIR/articles-prewrite-${MODE}-$$.json"
if ! (cd "$API_DIR" && "${WRANGLER[@]}" kv key get articles --binding=DATA --remote --text) > "$PREWRITE_FILE" \
    || ! validate_articles "$PREWRITE_FILE" >/dev/null \
    || [ "$(sha256_file "$PREWRITE_FILE")" != "$SNAPSHOT_SHA" ]; then
  rm -f "$PREWRITE_FILE"
  echo "Remote articles changed after the snapshot; refusing a stale whole-collection write." >&2
  exit 1
fi
rm -f "$PREWRITE_FILE"
remote_put "$VERIFIED_INPUT"

VERIFY_FILE="$BACKUP_DIR/articles-verify-${MODE}-$$.json"
if (cd "$API_DIR" && "${WRANGLER[@]}" kv key get articles --binding=DATA --remote --text) > "$VERIFY_FILE" \
    && validate_articles "$VERIFY_FILE" >/dev/null \
    && [ "$(sha256_file "$VERIFY_FILE")" = "$INPUT_SHA" ]; then
  rm -f "$VERIFY_FILE"
  echo "Verified remote bytes and schema. Snapshot retained at: $SNAPSHOT"
  exit 0
fi

rm -f "$VERIFY_FILE"
echo "Post-write verification failed. No automatic overwrite was attempted because another writer may be active." >&2
echo "Review first; explicit restore command:" >&2
echo "  $0 restore --file '$SNAPSHOT' --confirm-sha $SNAPSHOT_SHA --allow-removals" >&2
exit 1

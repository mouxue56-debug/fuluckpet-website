# Task 1 report — deterministic notification ledger primitives

## Implementation

- Added `api/notify.js` with deterministic item/due key builders, 90-day TTL constants, JST daily references, bounded item serialization, input validation, idempotent intent creation, item reads, sent marking, and retry/failure scheduling.
- `createNotifyIntent` writes exactly one item, due reference, and daily reference for a new logical intent; existing items are returned unchanged.
- Retry failures use the prescribed `[5m, 30m, 6h, 24h]` delays and terminally mark the item failed after the final retry.

## Tests / RED and GREEN evidence

- RED: `node --test tests/notify-ledger.test.js` failed with `ERR_MODULE_NOT_FOUND` for the intentionally absent `api/notify.js`.
- GREEN: focused ledger suite passed: 5 tests, 5 passed.
- Full suite passed: `node --test tests/*.test.js` — 713 tests, 713 passed.

## Files changed

- `api/notify.js`
- `tests/notify-ledger.test.js`

## Self-review / concerns

- `git diff --check` is clean; writes are preceded by spec/time/result validation and all ledger writes use the 90-day TTL.
- KV read-before-write is idempotent for sequential retries; Cloudflare KV has no compare-and-swap primitive, so cross-request race protection remains an integration concern for a later worker dispatch layer.

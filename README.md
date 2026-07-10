# Fuluck Pet Website

Public website and operational tooling for Fuluck Pet. The repository intentionally contains only publishable source and generated pages; credentials, private launch routes, internal handover notes, and production data do not belong here.

## Architecture

- Static multilingual pages are served from this repository.
- `tools/generate-site.js` and `tools/generate-diary.js` build tracked pages from the public API.
- `api/worker.js` is the Cloudflare Worker API, backed by configured KV and R2 bindings.
- `admin/` is the browser admin client. Authentication values must never be committed.
- `tests/` contains Node's dependency-free regression suite; `tools/verify-generated.js` checks generated-page integrity.

Private or regulated offerings remain fail-closed until their owner-controlled legal, data, and launch gates are complete. Never publish a private preview route or replace production catalogue data as part of ordinary maintenance.

## Local verification

Use Node 24 (see `.node-version`). No package install is required for the repository test suite.

```bash
node --test tests/*.test.js
node tools/verify-generated.js
```

To verify the Worker bundle without deploying it:

```bash
cd api
npx --yes wrangler@4.70.0 deploy --strict --dry-run --keep-vars
```

## Generated pages

Generation reads public catalogue endpoints and rewrites tracked output. Review the complete diff before committing.

```bash
node tools/generate-site.js
node tools/generate-diary.js
node --test tests/*.test.js
node tools/verify-generated.js
git diff --check
```

The scheduled regeneration workflow runs the same quality gates before it can commit. Pushes and pull requests also run a read-only quality workflow.

## Worker releases

The release helper is smoke-only by default:

```bash
scripts/deploy-and-smoke-worker.sh
```

A real Worker release requires the explicit `--deploy` flag. That mode refuses anything except a clean `main` exactly matching `origin/main`, runs the full tests and generated-output verifier, performs a Wrangler dry run, records the exact Git SHA in the Worker version metadata, and keeps a deterministic rollback target for failed smoke tests.

```bash
scripts/deploy-and-smoke-worker.sh --deploy
```

Do not bypass this helper with `api/deploy.sh`; the legacy bootstrap script is quarantined.

## Production data safety

`tools/upload-blog-bulk.sh` is offline and read-only by default. Its `apply` and `restore` modes require the exact input SHA-256, snapshot the current remote value before writing, validate IDs and schema, and show an ID-level diff. Production writes require owner authorization and must never use unreviewed generated content.

```bash
tools/upload-blog-bulk.sh --file /path/to/articles.json
```

Keep secrets outside Git and pass only the required environment variables at runtime. Do not paste credentials into commands, logs, issues, commits, or generated pages.

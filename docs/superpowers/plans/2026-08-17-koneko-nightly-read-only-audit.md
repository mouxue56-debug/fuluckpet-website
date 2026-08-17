# Koneko Nightly Read-Only Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run a deterministic, public, GET-only comparison of both Koneko breeder catalogues against Fuluck every day at 20:00 JST and preserve an exact approval report without any production write or language-model call.

**Architecture:** Pure HTML parsers normalize Koneko list/detail pages. A guarded crawl layer proves full pagination for both fixed accounts. For Fuluck HTTP `200` details, it removes only the proven Cloudflare tail, requires byte equality with the same-id/locale controlled generated checkout file, then parses only that in-memory controlled string. A pure comparator emits `EXACT`, `DRIFT`, or `BLOCKED`; and a CLI writes JSON and Markdown receipts. A read-only GitHub Actions workflow runs at `0 11 * * *` UTC, preserves evidence, then re-emits the audit exit code.

**Tech Stack:** Node.js 24 ESM, built-in `fetch`, `node:test`, GitHub Actions, public Koneko HTML, Fuluck public API and static detail pages.

## Global Constraints

- Direction is fixed: Koneko accounts `c995680` and `d696506` to Fuluck.
- All remote traffic is anonymous GET-only. No credential, cookie, admin route, write route, customer message, deployment, regeneration, or repository write is allowed.
- Nightly execution uses zero Codex, Grok, Cursor, or other model calls.
- Both accounts require complete pagination receipts. Missing or ambiguous evidence is `BLOCKED`, never equality.
- Exact breeder ID is the only join key.
- Phase one reports drift but never updates Fuluck.
- A Fuluck `200` is evidence only when its cleaned bytes exactly equal the fixed mapped generated file; no arbitrary remote HTML semantic proof is accepted.
- Controlled-page files are module-relative, regular non-symlinks below 2 MiB. Missing, unsafe, unreadable, or unequal content is `BLOCKED`; only an exact rendered `404` is drift.
- Workflow permissions are exactly `contents: read`, with 14-day artifacts and no workflow commit.
- Record actual observation time in JST; do not hide GitHub scheduling delay.

---

### Task 1: Pure public HTML parsers

**Files:**
- Create: `tools/lib/koneko-public-html.js`
- Create: `tests/koneko-public-html.test.js`

**Interfaces:**
- `parseKonekoListPage(html, { accountId, pageUrl }) -> ListPageReceipt`
- `parseKonekoDetailPage(html, { expectedAccountId, expectedBreederId, pageUrl }) -> SourceActiveKitten`
- `parseVerifiedFuluckDetailPage(controlledHtml, { expectedBreederId, locale, pageUrl }) -> RenderedKittenPage` — callable only after the crawl layer has proven controlled-render byte equality.
- `decodeHtmlText(html, { preserveBreaks }) -> string`

- [ ] **Step 1: Read the test-quality rules**

```bash
sed -n '1,260p' /Users/willma/.codex/plugins/cache/openai-curated-remote/superpowers/6.2.0/skills/test-driven-development/writing-good-tests.md
```

Expected: the complete checklist is reviewed before changing tests.

- [ ] **Step 2: Write failing list-parser tests**

Create a fixture builder using the real outer card boundary, status classes, identity link/image, range receipt, and next-page link. Assert:

```js
const page = parseKonekoListPage(listHtml, {
  accountId: 'c995680',
  pageUrl: 'https://www.koneko-breeder.com/breederDetail.php?breeder_id=c995680',
});
assert.deepEqual(page.cards.map(({ breederId, status }) => ({ breederId, status })), [
  { breederId: '2608-00001', status: 'available' },
  { breederId: '2608-00002', status: 'reserved' },
  { breederId: '2608-00003', status: 'sold' },
]);
assert.equal(page.declaredTotal, 4);
assert.deepEqual([page.rangeStart, page.rangeEnd], [1, 3]);
assert.equal(
  page.nextPageUrl,
  'https://www.koneko-breeder.com/breederDetail.php?pageNum=2&breeder_id=c995680#cat_list',
);
```

Add separate cases for `事前成約申請`, `販売終了`, unknown status markup, link/image ID disagreement, duplicate card IDs, range/card mismatch, unrelated parent-list `totalNum` markup, and challenge/interstitial HTML.

- [ ] **Step 3: Verify RED**

Run `node --test tests/koneko-public-html.test.js`.

Expected: FAIL because the parser module does not exist.

- [ ] **Step 4: Implement the minimal list parser**

Split only on `<li class="Min_d-flex box02Inner"`. Require one `catNNNN-NNNNN.html` and one matching `id="src_NNNN-NNNNN"`. Parse the closed status map:

```js
const STATUS_TEXT = new Map([
  ['販売中', 'available'],
  ['商談中', 'reserved'],
  ['事前成約申請', 'reserved'],
  ['成約済み', 'sold'],
  ['販売終了', 'sold'],
]);
```

A card without a business/closed label is `available` only when it contains the expected live-list structure and no unknown status. Parse `totalNum`, `X～Y件を表示`, same-host next URL, and a SHA-256 receipt. Require `cards.length === rangeEnd - rangeStart + 1`.

- [ ] **Step 5: Write failing detail-page tests**

Use minimal realistic Koneko Product JSON-LD, fact rows, parent sections, YouTube iframe, and `<br>` introduction. Assert this normalized record:

```js
{
  breederId: '2608-00001',
  accountId: 'c995680',
  breed: 'サイベリアン',
  color: 'シルバータビー&ホワイト（トリプルコート）',
  gender: '♂',
  price: 230000,
  birthday: '2026-05-09',
  photos: [
    'https://www.koneko-breeder.com/breeder/data/c995680/child_img_1_hash.jpg.webp',
    'https://www.koneko-breeder.com/breeder/data/c995680/child_img_2_hash.jpg.webp',
  ],
  videoId: 'AbCdEfGhI12',
  papa: '父猫',
  mama: '母猫',
  note: '短い紹介',
  description: '一段落\n\n二段落',
  detailUrl: 'https://www.koneko-breeder.com/cat2608-00001.html',
}
```

Add Fuluck JA/EN/ZH fixtures and assert exact breeder identity, locale, ordered Product images, canonical video ID, short note, and long introduction. Add failures for malformed JSON-LD, zero Koneko source photos, and mismatched SKU/account. Fuluck localized short/long text may parse as blank so the comparator can emit `translation_missing` instead of hiding drift as a parser error.

- [ ] **Step 6: Verify detail RED**

Run the same focused test and confirm the new cases fail because detail functions are absent.

- [ ] **Step 7: Implement detail parsers and verify GREEN**

Parse Koneko Product JSON-LD for SKU/images/price; labelled table rows for facts; `.petDtlInt .gnrCnt` for long text; father/mother sections; and YouTube by canonical 11-character ID. Parse Fuluck Product JSON-LD plus fixed `kitten-detail-*` sections. Normalize CRLF, entities, non-breaking spaces, padded dates, and `<br>` without executing HTML.

Run `node --test tests/koneko-public-html.test.js`; expected all pass.

- [ ] **Step 8: Commit Task 1**

```bash
git add tools/lib/koneko-public-html.js tests/koneko-public-html.test.js
git commit -m "feat: parse public Koneko and Fuluck catalog pages"
```

---

### Task 2: Guarded full-pagination crawler

**Files:**
- Create: `tools/lib/koneko-public-crawl.js`
- Create: `tests/koneko-public-crawl.test.js`

**Interfaces:**
- `fetchPublicText(url, options) -> { url, text, status, contentType, sha256 }`
- `crawlKonekoAccount({ accountId, fetchImpl, delayMs }) -> AccountSnapshot`
- `createControlledFuluckPageLoader({ root? }) -> ({ breederId, locale }) => Promise<string>` — production default has a fixed module-relative checkout root; the optional root is test injection only.
- `readFuluckPublicTarget({ activeIds, fetchImpl, controlledPageLoader? }) -> { apiRecords, renderedPages, checkedUrls }` — each non-404 rendered page carries the common verified `sha256`.

- [ ] **Step 1: Write failing guarded-fetch tests**

Inject fake responses and prove only HTTPS GET responses from `www.koneko-breeder.com`, `fuluck-api.mouxue56.workers.dev`, and `fuluckpet.com` are accepted. Reject cross-host redirects, wrong content types, bodies over 2 MiB, challenge markers, timeout/abort, and non-2xx responses.

```js
await assert.rejects(
  fetchPublicText('https://www.koneko-breeder.com/breederDetail.php?breeder_id=c995680', {
    fetchImpl: async () => response({ url: 'https://evil.example/redirected' }),
  }),
  /redirect host/,
);
```

- [ ] **Step 2: Verify guarded-fetch RED**

Run `node --test tests/koneko-public-crawl.test.js`; expected missing-module failure.

- [ ] **Step 3: Implement bounded GET transport**

Use `method: 'GET'`, `redirect: 'follow'`, `AbortSignal.timeout(15000)`, user agent `FuluckKonekoReadOnlyAudit/1.0`, 2 MiB streamed ceiling, and at most two retries for network errors or 429/502/503/504. Send no body or authorization header. Revalidate the final URL.

- [ ] **Step 4: Write failing pagination and target-reader tests**

Prove contiguous ranges, one stable declared total, unique cross-page IDs, final count equality, and detail fetches only for active/reserved kittens:

```js
const result = await crawlKonekoAccount({ accountId: 'c995680', fetchImpl, delayMs: 0 });
assert.deepEqual(result.receipts.map((r) => [r.rangeStart, r.rangeEnd]), [[1, 2], [3, 3]]);
assert.equal(result.declaredTotal, 3);
assert.deepEqual(result.kittens.map((k) => k.breederId), [
  '2608-00001', '2608-00002', '2608-00003',
]);
assert.deepEqual(result.activeDetails.map((k) => k.breederId), [
  '2608-00001', '2608-00002',
]);
```

Add repeated next URL, range gap, changing totals, duplicate IDs, wrong account, and detail mismatch failures. Prove Fuluck reading fetches the API and exactly three public locale pages per source-active target ID, with no admin or mutation interface. For each non-404 Fuluck page, prove the cleaned remote bytes equal the mapped checked-out generated file before any parser runs; save the shared SHA-256 only. An authoritative target-page 404 becomes a `rendered_page_missing` input; timeouts, challenges, missing/unsafe controlled files, byte mismatches, and malformed controlled pages throw and make the run `BLOCKED`.

- [ ] **Step 5: Verify crawl RED**

Run the focused test; expected missing crawl/target functions.

- [ ] **Step 6: Implement full crawl and public target reads**

Start from each fixed breeder page, follow only parser-returned next links, require ranges 1 through declared total, then sequentially fetch active details with a configurable delay. Validate the Fuluck API as a unique breeder-ID array, then read JA/EN/ZH pages for every source-active ID present in Fuluck.

- [ ] **Step 7: Verify GREEN and commit**

```bash
node --test tests/koneko-public-html.test.js tests/koneko-public-crawl.test.js
git add tools/lib/koneko-public-crawl.js tests/koneko-public-crawl.test.js
git commit -m "feat: crawl complete Koneko catalogues read only"
```

---

### Task 3: Pure comparator and safe receipts

**Files:**
- Create: `tools/lib/koneko-catalog-audit.js`
- Create: `tests/koneko-catalog-audit.test.js`

**Interfaces:**
- `compareKonekoToFuluck(input) -> AuditResult`
- `renderAuditMarkdown(result) -> string`
- Exit mapping: `EXACT=0`, `DRIFT=2`, `BLOCKED=3`.

- [ ] **Step 1: Write failing comparator tests**

Create exact factories and one test for each drift class: source active missing; source active target inactive; source inactive target active; status; facts; ordered photos; video ID; Japanese short/long text; missing rendered page; missing EN/ZH short/long text. Exact case:

```js
const result = compareKonekoToFuluck(exactInput());
assert.equal(result.result, 'EXACT');
assert.deepEqual(result.diffs, []);
assert.deepEqual(result.accounts.map((a) => a.accountId), ['c995680', 'd696506']);
```

Missing account receipts, incomplete pagination, duplicate target IDs, or missing required evidence must produce `BLOCKED`. A Japanese text change must add `translation_review_required` for EN and ZH.

- [ ] **Step 2: Verify comparator RED**

Run `node --test tests/koneko-catalog-audit.test.js`; expected missing-module failure.

- [ ] **Step 3: Implement deterministic comparison**

Sort by fixed account order, breeder ID, type, and field. Compare API facts; compare JA rendered photos/video/short/long text; require non-empty EN/ZH short and long text. Do not claim EN/ZH wording equals Koneko. Use a closed field mismatch shape:

```js
{
  type: 'fact_mismatch',
  breederId: '2608-00001',
  field: 'price',
  source: 230000,
  target: 220000,
}
```

- [ ] **Step 4: Write failing Markdown tests**

Require JST timestamp, result, both account receipts, Fuluck counts, every exact ID/field, checked URLs, and `NO WRITE PERFORMED`. Forbid full introductions and supplied credential markers.

- [ ] **Step 5: Implement bounded receipts and verify GREEN**

Hash long Japanese text in JSON and show only a bounded first-line preview in Markdown. Run the focused test; expected all pass.

- [ ] **Step 6: Commit Task 3**

```bash
git add tools/lib/koneko-catalog-audit.js tests/koneko-catalog-audit.test.js
git commit -m "feat: report exact Koneko catalogue drift"
```

---

### Task 4: CLI and 20:00 JST workflow

**Files:**
- Create: `tools/audit-koneko-catalog.js`
- Create: `tests/koneko-audit-cli.test.js`
- Create: `.github/workflows/koneko-nightly-audit.yml`
- Modify: `tests/workflow-integrity.test.js`

**Interfaces:**
- CLI: `node tools/audit-koneko-catalog.js --json <path> --markdown <path>`
- Exit codes: `0=EXACT`, `2=DRIFT`, `3=BLOCKED/invalid invocation`.
- Workflow outputs: `$RUNNER_TEMP/koneko-nightly-audit/audit.json` and `audit.md`.

- [ ] **Step 1: Write failing CLI tests**

Use a subprocess and a test-only fixture module to inject deterministic fetch data. Assert all three exit codes, both outputs on every terminal result, mode 0600, symlink refusal, atomic replacement, invalid-argument rejection, and no credential leakage. The fixture flag is accepted only when `NODE_ENV=test`.

- [ ] **Step 2: Verify CLI RED**

Run `node --test tests/koneko-audit-cli.test.js`; expected missing-CLI failure.

- [ ] **Step 3: Implement fail-closed CLI**

Crawl both fixed accounts, read the public target, compare, then write JSON/Markdown via sibling mode-0600 temporary files and atomic rename. A top-level catch constructs a `BLOCKED` receipt and still writes both valid output paths.

- [ ] **Step 4: Write failing workflow contract tests**

Extend `tests/workflow-integrity.test.js`:

```js
assert.match(source, /cron:\s*['"]0 11 \* \* \*['"]/);
assert.match(source, /workflow_dispatch:/);
assert.match(source, /permissions:\s*\n\s*contents:\s*read/);
assert.match(source, /retention-days:\s*14/);
for (const forbidden of [
  'secrets.', 'FULUCK_ADMIN', 'cursor-agent', 'grok',
  'codex exec', 'wrangler', 'repository_dispatch',
]) {
  assert.equal(source.includes(forbidden), false);
}
```

Also require `timeout-minutes: 15`, fixed concurrency with `cancel-in-progress: false`, reviewed immutable checkout/setup/upload SHAs, focused tests, `if: always()` summary/artifact steps, and a final re-emission of the captured audit status.

- [ ] **Step 5: Verify workflow RED**

Run `node --test tests/workflow-integrity.test.js tests/koneko-audit-cli.test.js`; expected missing behavior.

- [ ] **Step 6: Implement workflow skeleton**

```yaml
name: Koneko Nightly Read-Only Audit
on:
  workflow_dispatch:
  schedule:
    - cron: '0 11 * * *'
permissions:
  contents: read
concurrency:
  group: koneko-nightly-read-only-audit
  cancel-in-progress: false
```

Use Node 24. Run focused tests, create the runner-temp directory, capture the CLI status in `$GITHUB_OUTPUT`, append Markdown to `$GITHUB_STEP_SUMMARY`, upload both files for 14 days, and finally exit with the captured code. No secrets or write requests.

- [ ] **Step 7: Run focused and full verification**

```bash
node --test tests/koneko-public-html.test.js tests/koneko-public-crawl.test.js tests/koneko-catalog-audit.test.js tests/koneko-audit-cli.test.js tests/workflow-integrity.test.js
node --test tests/*.test.js
node tools/seo-geo-audit.js
node tools/verify-generated.js
git diff --check
```

Expected: all focused/full tests, SEO/GEO audit, generated verification, and whitespace checks pass.

- [ ] **Step 8: Commit Task 4**

```bash
git add tools/audit-koneko-catalog.js tests/koneko-audit-cli.test.js .github/workflows/koneko-nightly-audit.yml tests/workflow-integrity.test.js
git commit -m "ci: schedule nightly Koneko read-only audit"
```

---

### Task 4a: Fuluck controlled-render contract correction

**Files:**
- Modify: `tools/lib/koneko-public-crawl.js`, `tools/lib/koneko-public-html.js`, and `tools/lib/koneko-catalog-audit.js`
- Modify: their focused public-crawl, public-HTML, and catalogue-audit tests

**Decision:** Do not authenticate arbitrary Fuluck `200` HTML with a partial tokenizer. After the already restricted Cloudflare-tail cleanup, compare the resulting bytes with the matching checked-out generated page, then parse that one controlled in-memory string only. This is a deterministic trust boundary, not a browser/HTML-parser replacement.

- [ ] **Step 1: Write RED contract tests**

  Inject a controlled-page loader and prove a clean exact page and exactly one permitted tail both pass, while any changed text, photo, video, canonical, Product, Offer, whitespace, entity, or markup byte yields typed `render_contract` `BLOCKED`. Cover exact `404` as `rendered_page_missing`; wrong locale/ID, missing, directory, symlink, unreadable, and over-2-MiB controlled files as fail-closed; and prove the one loaded string supplies comparison, parser input, and SHA-256.

- [ ] **Step 2: Implement the bounded controlled loader**

  Map only audited `ja`, `en`, and `zh` locales to `kittens/{id}.html`, `en/kittens/{id}.html`, and `zh/kittens/{id}.html` below the module-relative checkout root. Use strict breeder-ID/locale validation, containment checks, `lstat` rejection of symlinks/non-regular files, an `O_NOFOLLOW` read, a 2 MiB bound, and generic external diagnostics. Keep `root` injection test-only; production code receives no configurable path.

- [ ] **Step 3: Narrow the Fuluck parser boundary**

  Rename the Fuluck parser to make the verified/tracked-file precondition explicit. Remove the arbitrary-remote canonical/Product/Offer no-SKU identity scanner. Preserve Koneko SKU/account extraction and list pagination behavior unchanged. Do not extend the shared walker to solve CDATA, entity, SVG, or other general HTML semantics for remote identity.

- [ ] **Step 4: Add receipt evidence and verify GREEN**

  Require a 64-character SHA-256 for each non-404 rendered page and publish only its locale, safe URL, and shared controlled-render hash. Never retain HTML. Run all 66 checked-out detail pages offline (including normal inline SVG) and the Koneko focused regression suite.

- [ ] **Step 5: Update the design and run verification**

  Document that a fixed `parse5` dependency is considered only if a stable CDN response rewrite becomes a separately measured requirement. Run parser/crawl/catalogue/CLI/workflow focused tests, generator-contract tests, the full Node suite, SEO/GEO audit, generated-file verification, and both unstaged/staged whitespace checks. No live fetch, workflow dispatch, regeneration, production write, credential read, push, merge, or deploy is part of this task.

---

### Task 5: Live acceptance and enablement

**Files:**
- No production catalogue files.
- Audit outputs: private temporary directory outside Git.
- Knowledge-base closeout only after verified enablement.

**Interfaces:**
- Consumes: completed CLI and workflow plus public Koneko/Fuluck pages.
- Produces: local live receipt, reviewed PR, merged schedule, and first hosted receipt.

- [ ] **Step 1: Run a local live read-only audit**

Create a private `mktemp -d` directory, chmod 0700, and run the CLI. Accept exit 0 (`EXACT`) or 2 (`DRIFT`) only; exit 3 (`BLOCKED`) prevents enablement. Validate JSON with `jq`, both declared totals, exact-ID diffs, and `NO WRITE PERFORMED`.

- [ ] **Step 2: Audit the live request surface**

Record method/host/path only and prove every request is GET to the three allowed public hosts. Search source, workflow, receipts, and Git diff for `Authorization`, `FULUCK_ADMIN_PASS`, account emails, mutation methods, model CLIs, and deployment commands. Any credential or write path blocks publication.

- [ ] **Step 3: Request independent code review**

Use `superpowers:requesting-code-review`. Resolve every P0/P1 and re-run focused/full verification after changes.

- [ ] **Step 4: Publish branch and open PR**

Use the GitHub publishing skill to push `codex/koneko-nightly-audit-20260817` and open a scoped PR containing the live receipt summary, permissions, exit semantics, and explicit no-production-write statement.

- [ ] **Step 5: Merge only after required checks pass**

Verify required checks, merge to `main`, and confirm default-branch workflow has `cron: '0 11 * * *'` and `contents: read`. No Worker deploy or Fuluck data change occurs.

- [ ] **Step 6: Dispatch and verify the first hosted run**

Trigger the workflow once. Download and validate its artifact and summary. A `DRIFT` result may intentionally make the run red; `BLOCKED` means the detector is not operational.

- [ ] **Step 7: Record the durable operating fact**

After merge and hosted verification, use the knowledge-base owner closeout to record the schedule, workflow path, zero-model/zero-secret boundary, result semantics, artifact location, and separate approval requirement for every Fuluck update.

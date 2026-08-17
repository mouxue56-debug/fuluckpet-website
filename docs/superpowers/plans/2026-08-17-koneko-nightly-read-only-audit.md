# Koneko Nightly Read-Only Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run a deterministic, public, GET-only comparison of both Koneko breeder catalogues against Fuluck every day at 20:00 JST and preserve an exact approval report without any production write or language-model call.

**Architecture:** A locked WHATWG parser normalizes Koneko list/detail pages once, then a target-local evidence layer applies exact HTML-namespace selectors, source-location integrity, visibility, uniqueness, identity, and field contracts. Required facts fail closed, while observed optional parent/note/description/video strings may be empty only after the standard DOM proves actual absence. A guarded crawl layer proves full pagination for both fixed accounts. For Fuluck HTTP `200` details, it removes only the proven Cloudflare tail, requires byte equality with the same-id/locale controlled generated checkout file, then parses only that in-memory controlled string; this gate is unchanged by the Koneko parser migration. A pure comparator emits `EXACT`, `DRIFT`, or `BLOCKED`; and a dependency-free report bootstrap preserves JSON and Markdown `BLOCKED` receipts even when parser installation fails. A read-only GitHub Actions workflow runs at `0 11 * * *` UTC, preserves evidence, then re-emits the audit exit code.

**Tech Stack:** Node.js 24 mixed ESM/CommonJS, exact `parse5` `8.0.1` with a committed npm lockfile, built-in `fetch`, `node:test`, GitHub Actions, public Koneko HTML, Fuluck public API and static detail pages.

## Global Constraints

- Direction is fixed: Koneko accounts `c995680` and `d696506` to Fuluck.
- All remote traffic is anonymous GET-only. No credential, cookie, admin route, write route, customer message, deployment, regeneration, or repository write is allowed.
- Nightly execution uses zero Codex, Grok, Cursor, or other model calls.
- Both accounts require complete pagination receipts. Missing or ambiguous evidence is `BLOCKED`, never equality.
- Exact breeder ID is the only join key.
- Phase one reports drift but never updates Fuluck.
- A Fuluck `200` is evidence only when its cleaned bytes exactly equal the fixed mapped generated file; no arbitrary remote HTML semantic proof is accepted.
- Controlled-page files are module-relative, regular non-symlinks below 2 MiB. Missing, unsafe, unreadable, or unequal content is `BLOCKED`; only an exact rendered `404` is drift.
- Root `package.json` is private, pins exactly `"parse5": "8.0.1"`, and has no `type` field; root `package-lock.json` is the only dependency-resolution authority.
- No Koneko runtime path may fall back from `parse5` to the retired scanner, regex-only parsing, system Chrome, an older snapshot, or a model.
- Nightly parser-install failure must still write schema-valid JSON and Markdown `BLOCKED` artifacts through a Node-built-in-only bootstrap; it must not crawl with partial dependencies.
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

Parse Koneko Product JSON-LD for SKU/images/price; one visible, non-footer balanced `.petDtlData table.gnrTbl` for the live labelled facts; `#parentInfo` for father/mother; `.movieGalleryCnt.youtube` for a canonical 11-character ID; and `.petDtlInt .gnrCnt` for long text. Outer evidence selectors match exact ID/class semantics independently of tag name, with both class tokens required for the video region. Tokenize each opening tag once into first values, all occurrences, and malformed state: strict generic consumers reject malformed attributes, while Koneko candidate selectors record any recoverable matching ID/class occurrence and make it invalid. Record every target candidate from opening through matching close: unclosed, mismatched, self-closing, duplicate, or otherwise malformed candidates block even if a valid candidate also exists, while unrelated outer-document imbalance remains tolerated. Derive hidden state only from parsed boolean `hidden`, decoded/trimmed exact `aria-hidden=true`, and every decoded quoted/unquoted inline-style declaration for `display:none` or `visibility:hidden`; never from words in unrelated attributes. Well-formed hidden/footer candidates are ignored rather than treated as conflicts, while a recoverable target selector already marked malformed remains blocked before that exclusion. Require one non-empty breed/colour/gender/birthday row, but record absent/empty appeal, parent, introduction, and video containers as observed empty strings where their contracts permit. Parse YouTube URLs with URL-origin/path/query validation (HTTPS, allowlisted host, one 11-character `watch?v`/`embed`/`shorts`/short-link ID), not substring matching. Do not fall back to whole-page labels, scripts, or footer markup. Parse Fuluck Product JSON-LD plus fixed `kitten-detail-*` sections using the same canonical video extractor. Normalize CRLF, entities, non-breaking spaces, padded dates, and `<br>` without executing HTML.

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

Missing account receipts, incomplete pagination, duplicate target IDs, or missing required evidence must produce `BLOCKED`. A Japanese text change with a non-empty Koneko source must add `translation_review_required` for EN and ZH; target-only text must not.

- [ ] **Step 2: Verify comparator RED**

Run `node --test tests/koneko-catalog-audit.test.js`; expected missing-module failure.

- [ ] **Step 3: Implement deterministic comparison**

Sort by fixed account order, breeder ID, type, and field. Require non-empty breed/colour/gender/price/birthday and ordered photos; require `papa`, `mama`, `note`, `description`, and `videoId` to be strings but allow `''` as observed evidence. Compare JA photos/video/parents/short/long text even when one side is empty. Require EN/ZH short/long text only when the corresponding Japanese source field is non-empty, including `translation_review_required`; do not claim EN/ZH wording equals Koneko. Keep safe per-account unique-ID/status/ambiguous-status/active aggregates in terminal `BLOCKED` receipts without restoring unverified checked URLs: group records by valid breeder ID and count a status only when all records for that ID share the same known status. Use a closed field mismatch shape:

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

### Task 5f: Migrate Koneko evidence to the standard HTML parser

**Files:**
- Create: `package.json`
- Create: `package-lock.json`
- Create: `tools/lib/koneko-standard-html.js`
- Create: `tools/lib/koneko-audit-output.js`
- Create: `tools/write-koneko-dependency-block.js`
- Modify: `tools/lib/koneko-public-html.js`
- Modify: `tools/lib/koneko-public-crawl.js`
- Modify: `tools/audit-koneko-catalog.js`
- Modify: `tests/koneko-public-html.test.js`
- Modify: `tests/koneko-public-crawl.test.js`
- Modify: `tests/koneko-audit-cli.test.js`
- Modify: `tests/workflow-integrity.test.js`
- Modify: `.github/workflows/koneko-nightly-audit.yml`
- Modify: `.github/workflows/quality.yml`
- Modify: `.github/workflows/regenerate-site.yml`
- Modify: `scripts/deploy-and-smoke-worker.sh`
- Modify: `README.md`

**Interfaces:**
- Preserve: `parseKonekoListPage(html, { accountId, pageUrl }) -> ListPageReceipt`
- Preserve: `parseKonekoDetailPage(html, { expectedAccountId, expectedBreederId, pageUrl }) -> SourceActiveKitten`
- Preserve: `parseVerifiedFuluckDetailPage(controlledHtml, options) -> RenderedKittenPage`, callable only after the existing controlled-byte equality gate.
- Add: `writeAuditReports({ jsonPath, markdownPath }, result) -> void`, a Node-built-in-only, atomic mode-0600 writer shared by the main CLI and dependency-failure bootstrap.
- Add CLI: `node tools/write-koneko-dependency-block.js --json <path> --markdown <path>`; it writes the one closed `bootstrap/dependency_install` `BLOCKED` result and performs no import from the Koneko parser/crawler graph.

**Decision:** Stop extending the hand-written Koneko scanner. Use exactly `parse5` `8.0.1` for HTML tokenization, complete character-reference decoding, namespace assignment, template/raw-text handling, and tree construction. Keep the strict Koneko evidence policy above the parsed tree, and keep the Fuluck controlled-render byte gate exactly as it is. Parser absence or failure has no runtime fallback.

- [ ] **Step 1: Read the test rules and establish the clean baseline**

```bash
sed -n '1,260p' /Users/willma/.codex/plugins/cache/openai-curated-remote/superpowers/6.2.0/skills/test-driven-development/writing-good-tests.md
git status --short
node --test tests/koneko-public-html.test.js tests/koneko-public-crawl.test.js tests/koneko-audit-cli.test.js tests/workflow-integrity.test.js
```

Expected: the complete test-quality checklist is read, the worktree is clean, and the existing focused suite passes before new RED cases are added.

- [ ] **Step 2: Add the complete standards-parser RED matrix**

Exercise only the public list/detail parser APIs with synthetic fixtures; do not duplicate a tokenizer inside tests. Add explicit assertions for every row below:

| Area | Required fixtures and expected result |
| --- | --- |
| EOF/opening states | `<section id="parentInfo" data-x="` alone and after a valid parent; equivalent facts/video/introduction and inner selectors; every recognisable incomplete candidate is `BLOCKED` |
| Attribute names | `=class`, `=id`, `<class`, and backtick-prefixed near selectors do not invent selectors; malformed tags with a separate real exact selector are target candidates and `BLOCKED`; duplicate target attributes are `BLOCKED` |
| Attribute values | quoted/unquoted values, CR/LF/FF/TAB separators, null replacement, and first duplicate value follow browser DOM semantics |
| References | `you&#116;ube`, `petDtl&#73;nt`, `parent&#73nfo`, named references, decimal/hex references with and without semicolons, ambiguous ampersands, and encoded URLs match the parsed DOM; `&amp;colon;` and `&amp;#116;` prove values are decoded exactly once |
| Text contexts | fake candidates in comments, bogus comments, script, style, title, textarea, xmp, iframe, noembed, noframes, noscript, and plaintext never become evidence |
| Tree contexts | template content is inert; SVG/MathML/CDATA nodes are excluded unless the HTML integration-point rules produce an actual HTML node; mismatched/implied closing, nested candidates, and table foster parenting follow the DOM while malformed source-backed targets still block |
| Visibility | boolean `hidden`, exact trimmed lower-case `aria-hidden=true`, `&Tab;true&Tab;`, `display&colon;none`, `display&#58none`, hexadecimal colon, `visibility:hidden`, `!important`, and multiple declarations hide evidence; uppercase `TRUE`, `title`, and `data-*` lookalikes remain visible |
| Scope/cardinality | hidden/footer plus visible candidates, valid plus malformed candidates, outer and inner facts/parents/video/introduction selectors, cards, status nodes, pagination, and canonical links preserve exact uniqueness and source scope |
| Structured/media identity | only actual HTML-namespace `script[type="application/ld+json"]` Product nodes count; malformed, duplicate, or conflicting Products block; SKU/account/photo order and strict YouTube host/path/query rules remain exact |
| Resource behavior | a 2 MiB page remains bounded; no script or subresource executes; an unavailable parser cannot fall back to the retired scanner |

The named EOF, entity-encoded selector, encoded hidden-state, and `=class` examples are mandatory direct regressions rather than being implied by a broad property test.

- [ ] **Step 3: Verify the new matrix is RED for the architectural reasons**

```bash
node --test tests/koneko-public-html.test.js
```

Expected: failures reproduce incomplete-target disappearance, invented illegal-attribute selectors, entity-encoded ID/class absence, named/semicolon-less hidden-state exposure, and the absent locked dependency contract. Do not accept failures caused only by broken fixture construction.

- [ ] **Step 4: Add the exact root dependency contract**

Create a private root `package.json` containing exactly `"dependencies": { "parse5": "8.0.1" }` and no `type` field or version range. Generate and verify the root lockfile:

```bash
npm install --package-lock-only --ignore-scripts --no-audit --no-fund
npm ci --ignore-scripts --no-audit --no-fund
node -e "const p=require('./package.json'); if ('type' in p || p.dependencies?.parse5 !== '8.0.1') process.exit(1)"
npm ls parse5 entities --depth=1
git diff -- package.json package-lock.json
```

Expected: `parse5` is exactly `8.0.1`, its transitive `entities` resolution and integrity are fixed by `package-lock.json`, no lifecycle script runs, and no `node_modules` file is tracked.

- [ ] **Step 5: Implement one standards-based Koneko DOM boundary**

In `tools/lib/koneko-standard-html.js`, import `parse` from `parse5` and parse each complete response once with `scriptingEnabled: true`, `sourceCodeLocationInfo: true`, and an `onParseError` collector that retains only code/start/end offsets.

Traverse `childNodes` iteratively, do not enter a template element's separate `content`, and require `namespaceURI === 'http://www.w3.org/1999/xhtml'` for every evidence selector. Use parse5's already-decoded `attrs` and text nodes exactly once. Do not call `decodeEntities()` on parsed values.

Recognise a target from its actual decoded DOM attributes first. Then reject that candidate when its own start/end tag or required structural span lacks explicit source location, intersects a collected parse error, is improperly source-nested, or contains an incomplete/mismatched/self-closing/duplicate required target. A valid candidate plus an invalid exact candidate is `BLOCKED`, including when the invalid one is hidden/footer. A parse error on a non-candidate such as `<aside =class=petDtlData>` does not become a class selector and does not globally invalidate a valid target.

- [ ] **Step 6: Move every Koneko structural extractor onto the parsed tree**

Implement list cards, exact status nodes, pagination/range/Next, Product JSON-LD, facts rows, parents, video, introduction, canonical URL, and photo/account identity from node relationships and parsed attributes. Preserve all public return shapes and closed status/URL rules. JSON-LD must come from an actual HTML script node and its script text; structural regexes may not search comments, templates, raw-text contents, foreign nodes, or the original Koneko HTML string.

Re-export the two public Koneko functions from `tools/lib/koneko-public-html.js` for compatibility, but make `tools/lib/koneko-public-crawl.js` import them directly from `koneko-standard-html.js`. Delete or isolate every old helper so no Koneko runtime branch can reach `htmlTagAt`, `parseHtmlAttributes`, `walkHtml`, `balancedElements`, raw card/status/pagination regexes, or the incomplete entity decoder. Pure URL/date/status normalization may remain shared.

Do not change the Fuluck trust order: clean at most the one proven Cloudflare tail, load the fixed controlled file, require exact byte equality and common SHA-256, and only then call `parseVerifiedFuluckDetailPage()` on the controlled string. Do not parse arbitrary remote Fuluck `200` HTML with parse5 before equality.

- [ ] **Step 7: Verify the parser matrix and existing crawl contracts are GREEN**

```bash
node --test tests/koneko-public-html.test.js tests/koneko-public-crawl.test.js tests/koneko-catalog-audit.test.js
rg -n "parseKoneko(List|Detail)Page" tools/lib/koneko-public-crawl.js tools/lib/koneko-standard-html.js tools/lib/koneko-public-html.js
rg -n "htmlTagAt|parseHtmlAttributes|walkHtml|balancedElements" tools/lib/koneko-standard-html.js
```

Expected: all parser/crawl/comparator tests pass; the crawler's Koneko imports resolve to the standards module; the final search returns no old scanner reference in that module. Fuluck controlled-render tests remain unchanged and green.

- [ ] **Step 8: Write RED tests for dependency-install `BLOCKED` artifacts**

Extend CLI and workflow tests to require:

- an isolated copy of `tools/write-koneko-dependency-block.js` plus its output module runs from a temporary directory with no `package.json`, `node_modules`, parser, crawler, or network access;
- it atomically writes different JSON/Markdown destinations with mode 0600 and refuses symlink destinations/ancestors;
- JSON contains `result: "BLOCKED"`, `exitCode: 3`, empty account/Fuluck evidence, `noWritePerformed: true`, and only `stage=bootstrap; reason=dependency_install`;
- Markdown contains `BLOCKED` and `NO WRITE PERFORMED`, but no npm stderr, registry URL, environment value, credential marker, stack, or filesystem path;
- nightly dependency installation is `continue-on-error`, successful parser tests/audit are conditional on install success, the failure writer is conditional on install failure, summary/upload remain `always()`, and the final step exits 3 for dependency failure.

Run:

```bash
node --test tests/koneko-audit-cli.test.js tests/workflow-integrity.test.js
```

Expected: RED because the dependency-free output boundary and workflow branches do not exist.

- [ ] **Step 9: Extract the dependency-free writer and implement the nightly failure branch**

Move destination validation, mode-0600 atomic writes, bounded `blockedReceipt`, and Markdown rendering access behind `writeAuditReports()` without importing `koneko-public-crawl.js` or `koneko-standard-html.js`. The main CLI continues to use that writer. The dependency-block entry accepts only `--json` and `--markdown`, constructs the closed bootstrap receipt, writes both files, and exits successfully so the workflow can preserve them before deliberately re-emitting status 3.

In the nightly workflow, give the exact `npm ci` step `id: dependencies` and `continue-on-error: true`. When `steps.dependencies.outcome != 'success'`, create the runner-temp directory, call the fixed dependency-block writer, and set a closed status output of 3. Run focused tests and the normal audit only when installation succeeded. Never run the audit against partial/cached dependencies after failure. Keep summary and artifact upload under `if: always()`; the final always-run shell exits 3 for dependency failure and otherwise re-emits the audit status.

- [ ] **Step 10: Add every locked-install execution chain**

- In `.github/workflows/koneko-nightly-audit.yml`, enable `setup-node` npm caching against `package-lock.json` and use the guarded flow above.
- In `.github/workflows/quality.yml`, run the exact `npm ci` command immediately after Node setup and before any test/audit.
- In `.github/workflows/regenerate-site.yml`, run it before the first generator. After every successful `git pull --rebase origin main`, run it again before the retry's generators/tests because the lockfile may have changed. Any failure stops before generation/commit/push.
- In `scripts/deploy-and-smoke-worker.sh`, require `npm` and run the exact install before the full suite and before any Wrangler dry run/deploy. Install failure calls `die` and leaves production untouched.
- In `README.md`, replace the dependency-free/no-install claim and put the exact `npm ci` command before local tests, generated-page verification, regeneration checks, and deploy helper prerequisites.
- In `tests/workflow-integrity.test.js`, assert install command spelling and ordering, the regenerate rebase retry installation, the nightly failure artifact branch, and the absence of `npm install`, floating versions, secrets, model calls, browser commands, or parser fallback.

- [ ] **Step 11: Run clean-install, focused, full, and repository verification**

```bash
npm ci --ignore-scripts --no-audit --no-fund
node --test tests/koneko-public-html.test.js tests/koneko-public-crawl.test.js tests/koneko-catalog-audit.test.js tests/koneko-audit-cli.test.js tests/workflow-integrity.test.js
node --test tests/*.test.js
node tools/seo-geo-audit.js
node tools/verify-generated.js
git diff --check
git status --short
```

Expected: the exact install and every focused/full/static gate pass; only the reviewed Task 5f files are changed; no captured Koneko HTML, report artifact, credential, `node_modules`, generated page, or production data is staged.

- [ ] **Step 12: Prove both real accounts through one local read-only run**

Create a mode-0700 `mktemp -d`, run the CLI with JSON/Markdown paths inside it, accept only exit 0 or 2, use `jq` to require `EXACT|DRIFT` and account order `c995680,d696506`, and require `NO WRITE PERFORMED` in Markdown.

Expected: both fixed accounts have complete, contiguous pagination and active-detail receipts; result is `EXACT` or `DRIFT`; every request remains anonymous public GET; JSON/Markdown contain no raw HTML or secret. `BLOCKED` prevents merge and hosted enablement.

- [ ] **Step 13: Review and commit the migration**

Use `superpowers:requesting-code-review` against the complete Task 5f range. Resolve every P0/P1, rerun Steps 11 and 12, stage exactly the files declared by Task 5f, and commit with `git commit -m "refactor: parse Koneko HTML with parse5"`.

Expected: one reviewable migration commit. Task 5f is not operationally complete until Task 5's exact-default-branch hosted workflow gate succeeds; no local green run substitutes for that gate.

---

### Task 5: Live acceptance and enablement

**Files:**
- No production catalogue files.
- Audit outputs: private temporary directory outside Git.
- Knowledge-base closeout only after verified enablement.

**Interfaces:**
- Consumes: completed Task 5f locked parser, CLI, workflow, and public Koneko/Fuluck pages.
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

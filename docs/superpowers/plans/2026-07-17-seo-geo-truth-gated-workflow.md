# Fuluck SEO/GEO Truth-Gated Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace category-page Merchant Product markup with truthful entity markup, remove obsolete crawl noise and drifting GEO claims, and make those rules a deterministic scheduled release gate.

**Architecture:** `tools/generate-site.js` remains the only writer of kitten list/detail output. List pages expose navigation-only `ItemList`; detail pages expose one stable Product entity. A dependency-free `tools/seo-geo-audit.js` checks tracked static output and feeds the existing quality/regeneration gates plus a new read-only scheduled workflow.

**Tech Stack:** Node.js 24 CommonJS, `node:test`, static HTML/JSON-LD, GitHub Actions, GitHub Pages, Playwright browser inspection, Frozen Heisei Editorial Grid 1.0 report renderer.

## Global Constraints

- Never invent or infer shipping costs, delivery timing, return windows, return fees, policy URLs, `priceValidUntil`, exact review totals, health guarantees, temperament, prices, awards or legal commitments.
- The three kitten list pages contain one `ItemList` and zero Product/Offer entities.
- Each kitten `ListItem` has exactly `@type`, `position`, `url`, `name` and `image`; it intentionally has no nested `item`/Product reference, and positions are contiguous from 1.
- A priced public kitten detail contains exactly one Product with stable `@id` `https://fuluckpet.com/kittens/<breederId>.html#product`.
- Detail Product `seller` is exactly `{"@id":"https://fuluckpet.com/#cattery"}`; Offer URL remains the current-language detail URL.
- Unpriced detail pages contain no Product/Offer.
- `SearchAction` and `{search_term_string}` are absent from public HTML.
- `llms.txt` and `llms-full.txt` use stable `100+` wording, no exact `113` review claim, no concrete ephemeral kitten example, and no claim that a count is indexed.
- GitHub workflows use Node 24, least privilege, immutable action SHAs, and no credentials or paid APIs.
- Only static-site files may be released. No Worker, KV, R2, Admin, DNS, production business data or outbound messages.
- Search Console validation is limited to already-fixed duplicate-brand and invalid-availability historical items; recommended missing-policy fields remain unvalidated.
- Laura's current “全自动推进 2 小时” instruction authorizes this run's reviewed static-site commit/push, Pages/live smoke and the bounded Search Console validation above; it does not authorize any other production mutation.

---

## File Map

- `tools/generate-site.js`: generates trilingual kitten ItemList and detail Product entities.
- `kittens.html`, `en/kittens.html`, `zh/kittens.html`: generated list output.
- `kittens/*.html`, `en/kittens/*.html`, `zh/kittens/*.html`: generated detail output.
- `index.html`, `blog.html`: tracked WebSite/CollectionPage JSON-LD with obsolete SearchAction removed.
- `llms.txt`, `llms-full.txt`: factual machine-readable summaries.
- `tools/seo-geo-audit.js`: reusable audit module and CLI.
- `tests/seo-geo-structured-data.test.js`: generated entity contract.
- `tests/seo-geo-content-contract.test.js`: SearchAction and GEO text contract.
- `tests/seo-geo-content-opportunities.test.js`: Osaka runtime navigation and cost-article fact alignment.
- `tests/seo-geo-audit.test.js`: audit API/CLI red-green tests.
- `tests/generate-site-release-safety.test.js`: synthetic generator truth tests moved from list Product to list ItemList/detail Product.
- `tests/workflow-integrity.test.js`: release-order and immutable-action contract.
- `.github/workflows/quality.yml`: every push/PR audit gate.
- `.github/workflows/regenerate-site.yml`: pre-commit and post-rebase audit gates.
- `.github/workflows/seo-geo-quality.yml`: push/PR/manual/weekly read-only audit artifact.

### Task 1: Replace list Product markup with stable detail Product entities

**Files:**
- Create: `tests/seo-geo-structured-data.test.js`
- Modify: `tests/generate-site-release-safety.test.js`
- Modify: `tests/kitten-path-safety.test.js`
- Modify: `tests/json-script-escaping.test.js`
- Modify: `tests/verify-generated-sitemap-coverage.test.js`
- Modify: `tools/generate-site.js`
- Modify: `tools/verify-generated.js`
- Regenerate: `tools/sitemap-lastmod.json`
- Regenerate: `kittens.html`, `en/kittens.html`, `zh/kittens.html`
- Regenerate: `kittens/*.html`, `en/kittens/*.html`, `zh/kittens/*.html`

**Interfaces:**
- Consumes: `generateKittens(kittens, lang)`, `generateKittenDetailPages(kittens, parents, lang)`, `safeJsonForHtmlScript`.
- Produces: one list `ItemList`; detail Product `@id`; seller entity reference; no unverified merchant-policy fields.

- [ ] **Step 1: Write the failing tracked-output contract**

Create a JSON-LD extractor that parses every `application/ld+json` script and flattens top-level arrays:

```js
function jsonLd(relative) {
  const html = fs.readFileSync(path.join(ROOT, relative), 'utf8');
  return [...html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
    .flatMap((match) => {
      const parsed = JSON.parse(match[1]);
      return Array.isArray(parsed) ? parsed : [parsed];
    });
}

for (const relative of ['kittens.html', 'en/kittens.html', 'zh/kittens.html']) {
  const entities = jsonLd(relative);
  assert.equal(entities.filter((item) => item['@type'] === 'ItemList').length, 1);
  assert.equal(entities.filter((item) => item['@type'] === 'Product').length, 0);
}
```

Discover breeder IDs dynamically from the tracked ja/en/zh detail-page intersection; never pin a currently listed animal ID in a durable test. Validate every priced Product in that trilingual set with its exact stable identity and language-local Offer URLs. An honest empty or all-unpriced catalog remains valid and is covered by synthetic fixtures:

```js
const breederIds = pricedTrilingualBreederIds();
for (const breederId of breederIds) {
  for (const [lang, prefix] of [['ja', ''], ['en', 'en/'], ['zh', 'zh/']]) {
    const product = jsonLd(`${prefix}kittens/${breederId}.html`)
      .find((item) => item['@type'] === 'Product');
    assert.equal(product['@id'], `https://fuluckpet.com/kittens/${breederId}.html#product`);
    assert.deepEqual(product.offers.seller, { '@id': 'https://fuluckpet.com/#cattery' });
    assert.equal(product.offers.url, `https://fuluckpet.com/${prefix}kittens/${breederId}.html`);
    assert.equal('shippingDetails' in product.offers, false);
    assert.equal('hasMerchantReturnPolicy' in product.offers, false);
    assert.equal('priceValidUntil' in product.offers, false);
  }
}
```

- [ ] **Step 2: Verify RED**

Run:

```bash
node --test tests/seo-geo-structured-data.test.js
```

Expected: FAIL because current lists contain Product arrays and current details lack stable `@id` and seller references.

- [ ] **Step 3: Move synthetic safety tests to the new entity boundaries**

Replace `listingProducts` with helpers that read the generated ItemList and each generated detail Product. Preserve every existing truth assertion:

```js
function listingItemList(html) {
  const match = html.match(/<!-- Generated kitten ItemList -->\s*<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/);
  assert.ok(match, 'generated listing must contain one ItemList block');
  return JSON.parse(match[1]);
}

function detailProduct(html) {
  const scripts = [...html.matchAll(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/g)]
    .map((match) => JSON.parse(match[1]));
  return scripts.find((item) => item['@type'] === 'Product') || null;
}
```

The available/reserved/sold test must preserve the current eligibility boundary: assert two ListItems for priced available/reserved kittens, no sold or unpriced URL, and one truthful detail Product for each included kitten. Move the old list-description truth assertions onto the detail Product. The missing-price test must assert the unpriced detail has no Product and no `¥0`; it must not expect list Offers.

Update the adjacent regression gates in the same RED phase:

- `kitten-path-safety.test.js` must require the stable detail Product `@id` and `#cattery` seller reference.
- `json-script-escaping.test.js` must parse the generated ItemList block instead of the removed Product array.
- `verify-generated.js` must require exactly one generated ItemList and zero Product/Offer on list pages, plus one correctly identified Product on every priced detail and no Product on an unpriced detail.
- `verify-generated-sitemap-coverage.test.js` must prove the verifier rejects a list Product and a malformed detail Product ID/seller reference.

- [ ] **Step 4: Implement the ItemList and stable Product**

In `generateKittens`, preserve the current schema eligibility rule—`available` or `reserved`, existing cover image and a valid sale price—and build `itemListElement` only for those public details:

```js
const itemListJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'ItemList',
  '@id': `${listPageUrl}#kitten-list`,
  name: catalogCopy.title,
  numberOfItems: listItems.length,
  itemListElement: listItems.map((item, index) => ({
    '@type': 'ListItem',
    position: index + 1,
    url: item.url,
    name: item.name,
    image: item.image,
  })),
};
```

Use the comment `<!-- Generated kitten ItemList -->`. Strip both the old Product marker and the new ItemList marker before reinserting, so regeneration is idempotent across the migration.

In `generateKittenDetailPages`, add:

```js
'@id': `${BASE_URL}/kittens/${fileId}.html#product`,
```

and replace the seller object with:

```js
'seller': { '@id': `${BASE_URL}/#cattery` }
```

- [ ] **Step 5: Verify GREEN on synthetic contracts before network regeneration**

Run:

```bash
node --test tests/generate-site-release-safety.test.js tests/json-script-escaping.test.js tests/kitten-path-safety.test.js tests/verify-generated-sitemap-coverage.test.js
```

Expected: synthetic generator and verifier mutation tests PASS. The tracked-output contract intentionally remains RED until Step 6 regenerates the repository output.

- [ ] **Step 6: Regenerate twice and prove idempotency**

Run:

```bash
node tools/generate-site.js
git add -N -- tools/generate-site.js tools/verify-generated.js tools/sitemap-lastmod.json tests/seo-geo-structured-data.test.js kittens.html en/kittens.html zh/kittens.html kittens en/kittens zh/kittens sitemap.xml
git diff --binary --output=/tmp/fuluck-seo-first.diff
node tools/generate-site.js
git add -N -- tools/generate-site.js tools/verify-generated.js tools/sitemap-lastmod.json tests/seo-geo-structured-data.test.js kittens.html en/kittens.html zh/kittens.html kittens en/kittens zh/kittens sitemap.xml
git diff --binary --output=/tmp/fuluck-seo-second.diff
cmp -s /tmp/fuluck-seo-first.diff /tmp/fuluck-seo-second.diff
git diff --check
```

`git add -N` makes untracked generated details visible to the binary diff without staging their content. The second generation must produce the byte-identical complete diff: no added/removed file, additional schema block or output change solely because it ran again.

Before staging, inspect `git status --porcelain=v1 --untracked-files=all`. Besides this task's source/tests, the only permitted generated paths are the three kitten list pages, the three kitten detail directories, `sitemap.xml` and its required tracked hash store `tools/sitemap-lastmod.json`. If homepage, parents, reviews, feed, cat-care, dog-service, catalog, Worker/API or any other output changed because live public data drifted, stop and report `DONE_WITH_CONCERNS`; do not silently bundle that expansion into the SEO/GEO commit.

- [ ] **Step 7: Verify GREEN on tracked output and the real verifier**

Run:

```bash
node --test tests/seo-geo-structured-data.test.js tests/generate-site-release-safety.test.js tests/json-script-escaping.test.js tests/kitten-path-safety.test.js tests/verify-generated-sitemap-coverage.test.js
node tools/verify-generated.js
```

Expected: all tests PASS and `verify-generated` reports a clean generated site.

- [ ] **Step 8: Commit Task 1**

```bash
git add tools/generate-site.js tools/verify-generated.js tools/sitemap-lastmod.json tests/generate-site-release-safety.test.js tests/seo-geo-structured-data.test.js tests/kitten-path-safety.test.js tests/json-script-escaping.test.js tests/verify-generated-sitemap-coverage.test.js kittens.html en/kittens.html zh/kittens.html kittens en/kittens zh/kittens sitemap.xml
git commit -m "fix: move kitten product schema to detail pages"
```

### Task 2: Remove obsolete SearchAction and repair GEO fact drift

**Files:**
- Create: `tests/seo-geo-content-contract.test.js`
- Modify: `index.html`
- Modify: `blog.html`
- Modify: `llms.txt`
- Modify: `llms-full.txt`

**Interfaces:**
- Consumes: current tracked public HTML and machine-readable summaries.
- Produces: WebSite/CollectionPage entities without SearchAction; stable review wording; no ephemeral kitten example; no unverifiable index-count claim.

- [ ] **Step 1: Write the failing content contract**

```js
for (const relative of ['index.html', 'blog.html']) {
  const source = read(relative);
  assert.doesNotMatch(source, /SearchAction|search_term_string/);
}

for (const relative of ['llms.txt', 'llms-full.txt']) {
  const source = read(relative);
  assert.doesNotMatch(source, /(?:5\.0★\s*\/\s*)?113(?:\s*(?:レビュー|reviews?))?/i);
  assert.match(source, /100\+|100件以上/);
}
assert.doesNotMatch(read('llms.txt'), /\/kittens\/\d{4}-\d{5}\.html/);
assert.doesNotMatch(read('llms-full.txt'), /\b\d+\+\s+articles indexed\b/i);
assert.doesNotMatch(read('llms.txt'), /毎日再生成|日次で更新|170本以上/);
assert.doesNotMatch(read('llms-full.txt'), /営業中/);
```

Also extract every `https://fuluckpet.com/...` URL from the two files, strip query/hash, map `/` and trailing-slash paths to `index.html`, and assert each concrete internal page exists. Skip the documented placeholder pattern `/kittens/<breederId>.html` because it is not a concrete URL.

- [ ] **Step 2: Verify RED**

Run:

```bash
node --test tests/seo-geo-content-contract.test.js
```

Expected: FAIL on both SearchAction blocks, exact `113` claims, the concrete obsolete kitten example, and the “articles indexed” claim.

- [ ] **Step 3: Make the minimal factual edits**

- Remove only the structured-data `potentialAction` from the homepage WebSite JSON-LD.
- Remove only the structured-data `potentialAction` from the blog CollectionPage JSON-LD; retain the working visible `q` search UI and its runtime behavior.
- Change exact review totals to the already used stable `100+` / `100件以上` wording.
- Replace the concrete kitten example with the literal pattern `/kittens/<breederId>.html` outside a Markdown link.
- Replace “100+ articles indexed” with “Cat knowledge library: https://fuluckpet.com/blog.html”.
- Replace daily-refresh claims with “the public list and detail pages are the current reference”; remove the exact article count and live `営業中` status.
- Do not edit prices, health statements, shipping, returns, awards, licenses or contact routes.

- [ ] **Step 4: Verify GREEN and existing trust contracts**

Run:

```bash
node --test tests/seo-geo-content-contract.test.js tests/whole-site-trust-contract.test.js tests/internal-link-integrity.test.js
```

Expected: all tests PASS.

- [ ] **Step 5: Commit Task 2**

```bash
git add index.html blog.html llms.txt llms-full.txt tests/seo-geo-content-contract.test.js
git commit -m "fix: remove obsolete search markup and GEO drift"
```

### Task 3: Repair runtime Osaka discovery and cost-article fact alignment

**Files:**
- Create: `tests/seo-geo-content-opportunities.test.js`
- Modify: `nav.js`
- Modify: `en/siberian-breeder-osaka.html`
- Modify: `blog/siberian-cost-breakdown.html`
- Modify: `blog.html`
- Modify: `blog-search-index.json`
- Modify: `blog/siberian-price-guide.html`
- Modify: `blog/cat-cost-monthly.html`

**Interfaces:**
- Consumes: existing `nav.osakaAdoption` translations, existing Osaka route, and cost values already present in the article tables.
- Produces: an Osaka link that survives JS navigation enhancement; one consistent cost answer across metadata, visible copy, BlogPosting, blog card and search index.

- [ ] **Step 1: Write the failing runtime-navigation and content tests**

Assert the enhanced navigation contains the existing localized route:

```js
const nav = read('nav.js');
assert.match(nav, /href:\s*['"]\/siberian-breeder-osaka\.html['"]/);
assert.match(nav, /key:\s*['"]nav\.osakaAdoption['"]/);
assert.match(nav, /match:\s*\[['"]\/siberian-breeder-osaka\.html['"]\]/);
for (const locale of ['ja', 'en', 'zh']) {
  assert.match(read('i18n.js'), new RegExp(`'nav\\.osakaAdoption':`));
}
```

Parse `blog/siberian-cost-breakdown.html` and assert the exact accepted answer is present in title, meta description, OG description, BlogPosting description, H1 and the first answer paragraph:

```js
const accepted = {
  title: 'サイベリアンの飼育費はいくら？初期費用・月額・年間費用｜福楽キャッテリー',
  description: 'サイベリアンの生体代を除く初期準備費は約2.4万〜6.75万円、月々の飼育費は約6,000〜13,500円。フード・猫砂・保険・健診などの内訳と年間目安を表で解説します。',
  answer: '生体代を除く初期準備費は約2.4万〜6.75万円、毎月は約6,000〜13,500円、年間は約8.8万〜20.7万円',
};
assert.match(article, new RegExp(escapeRegExp(accepted.title)));
assert.match(article, new RegExp(escapeRegExp(accepted.description)));
assert.match(article, new RegExp(escapeRegExp(accepted.answer)));
assert.doesNotMatch(article, /10万〜15万円|8,000〜15,000円|\*\*合計\*\*|from 113/);
```

Do not trust the accepted strings alone. Parse the three cost tables, exclude each total row, parse every `min〜max円` item range and calculate the initial/monthly/annual sums. Assert the calculated totals equal `[24000, 67500]`, `[6000, 13500]`, `[88000, 207000]`, equal the visible total rows, and format back to the ranges used by meta/OG/BlogPosting/answer. A future table edit must make stale summaries fail.

Parse the BlogPosting JSON-LD and assert `image` equals the existing OG image and `inLanguage === 'ja'`. Assert the `blog.html` card and the single `blog-search-index.json` record use the same source-backed short title and description derived from the accepted article copy. Assert both related articles contain `/blog/siberian-cost-breakdown.html`. Assert `en/siberian-breeder-osaka.html` contains no exact `113` and retains `100+ reviews`.

- [ ] **Step 2: Verify RED**

Run:

```bash
node --test tests/seo-geo-content-opportunities.test.js
```

Expected: FAIL because runtime navigation lacks the route, the article head disagrees with its tables, BlogPosting lacks image/language, related links are absent, and the English Osaka page still exposes `113`.

- [ ] **Step 3: Make only source-backed content changes**

Add this existing route to the `お迎え` navigation group:

```js
{
  href: '/siberian-breeder-osaka.html',
  key: 'nav.osakaAdoption',
  icon: 'map-pin',
  localized: true,
  match: ['/siberian-breeder-osaka.html'],
}
```

Use the accepted title/description/answer above in the cost article. Add the existing OG image as BlogPosting `image` and set `inLanguage` to `ja`. Convert the three literal Markdown total markers into `<strong>` elements. Replace the duplicated `30,000円` surgery statement with a link to `/guide/price.html` and text instructing readers to verify the current price there.

Synchronize the blog card and the single `blog-search-index.json` record. Add one related link from each of `blog/siberian-price-guide.html` and `blog/cat-cost-monthly.html`. In the English Osaka page, change every exact `113` review phrase to `100+ reviews` without changing rating, award, service-area or health copy.

- [ ] **Step 4: Verify GREEN with adjacent contracts**

Run:

```bash
node --test tests/seo-geo-content-opportunities.test.js tests/i18n-key-parity.test.js tests/internal-link-integrity.test.js tests/localized-blog-seo.test.js tests/whole-site-trust-contract.test.js
```

Expected: all tests PASS.

- [ ] **Step 5: Commit Task 3**

```bash
git add nav.js en/siberian-breeder-osaka.html blog/siberian-cost-breakdown.html blog.html blog-search-index.json blog/siberian-price-guide.html blog/cat-cost-monthly.html tests/seo-geo-content-opportunities.test.js
git commit -m "fix: align Osaka discovery and cost content"
```

### Task 4: Add a deterministic SEO/GEO audit API and CLI

**Files:**
- Create: `tools/seo-geo-audit.js`
- Create: `tests/seo-geo-audit.test.js`

**Interfaces:**
- Produces: `auditSite(options) -> { schemaVersion, sourceTimestamp, baseCommit, inputDigest, status, summary, errors, warnings, checks }`.
- CLI: `node tools/seo-geo-audit.js [--root DIR] [--json FILE] [--markdown FILE]`.
- Exit: `0` when `errors.length === 0`; `1` after writing reports when errors exist; `2` for invalid CLI arguments or unreadable root.

- [ ] **Step 1: Write failing module tests with isolated fixtures**

Create one valid fixture with index/blog, three list ItemLists, priced and unpriced trilingual kitten details, one unrelated public HTML page, stable llms files and a sitemap. Call:

```js
const result = auditSite({
  root: fixture,
  sourceTimestamp: '2026-07-17T00:00:00.000Z',
  baseCommit: '0123456789abcdef',
});
assert.equal(result.status, 'pass');
assert.deepEqual(result.errors, []);
assert.equal(result.schemaVersion, '1.0');
```

Create a failing fixture with a list Product, duplicate `brand`, invalid availability, unverified shipping/return fields, SearchAction, exact `113` claim and a broken internal URL. Assert stable error codes:

```js
assert.deepEqual(
  new Set(result.errors.map((error) => error.code)),
  new Set([
    'LIST_PRODUCT_FORBIDDEN', 'DETAIL_PRODUCT_ID_INVALID',
    'SELLER_ENTITY_INVALID', 'BRAND_DUPLICATE', 'AVAILABILITY_INVALID',
    'MERCHANT_POLICY_UNVERIFIED', 'SEARCH_ACTION_OBSOLETE',
    'EXACT_REVIEW_COUNT', 'LLMS_INTERNAL_URL_MISSING',
  ]),
);
```

Run the valid fixture twice with identical injected source metadata and assert byte-identical JSON plus Markdown. Change one uncommitted fixture byte and assert `inputDigest` changes while `baseCommit` does not. Exercise `runCli` against a failing fixture and assert it writes both parseable reports before returning exit code `1`.

Mutation fixtures must independently prove detection of duplicate ItemLists, any Product/Offer nested on a list, a missing Product on a visibly priced detail, a Product on a visibly unpriced detail, malformed JSON-LD, SearchAction on an arbitrary public page, Merchant policy fields on an arbitrary Product/Offer, invalid brand cardinality/availability and a broken llms URL.

`BRAND_DUPLICATE` has an exact meaning: the same Product object contains a repeated raw JSON `brand` key or its parsed `brand` value is an array with more than one entry. Because `JSON.parse` silently collapses duplicate object keys, add a dependency-free JSON token walk that tracks keys per object; a regex over the whole script is insufficient when a graph legitimately contains multiple Products. Kitten Products additionally require one valid Brand object; arbitrary future Products may omit brand but may never publish more than one.

- [ ] **Step 2: Verify RED**

Run:

```bash
node --test tests/seo-geo-audit.test.js
```

Expected: FAIL because `tools/seo-geo-audit.js` does not exist.

- [ ] **Step 3: Implement the minimal audit module**

Use only `node:fs`, `node:path`, `node:crypto`, `node:child_process` and existing static files. Export:

```js
module.exports = {
  auditSite,
  parseJsonLdScripts,
  renderMarkdown,
  runCli,
};
```

`parseJsonLdScripts` must JSON-parse every JSON-LD script, flatten arrays, recursively discover nested Product/Offer entities, and record a `JSON_LD_INVALID` error without discarding the remaining page. Enumerate every tracked/public HTML input, not a hand-maintained page allowlist. Apply list/detail rules to all three localized kitten route families; infer priced versus unpriced details from the generated visible price landmark, while fixtures cover both states. Apply SearchAction and Merchant-policy prohibitions to every scanned HTML page and every Product/Offer, including future animal types.

Default `sourceTimestamp` and `baseCommit` come from the current baseline commit (`git show -s --format=%cI HEAD` and `git rev-parse HEAD`), but provenance is completed by a SHA-256 `inputDigest` over a stably sorted sequence of relative path plus exact bytes for every audited input. This digest must change when an uncommitted candidate page changes, so a pre-commit or post-rebase gate cannot attribute candidate bytes to the old HEAD. Tests inject fixed commit metadata. Never emit wall-clock time, runner name, absolute paths, temporary paths or random IDs. Sort paths, checks and findings before rendering so two runs against the same input set are byte-identical.

The CLI must create parent directories for requested output files, write JSON with two-space indentation and a final newline, write Markdown from the same result, then set `process.exitCode`.

- [ ] **Step 4: Verify RED-GREEN and real repository audit**

Run:

```bash
node --test tests/seo-geo-audit.test.js
node tools/seo-geo-audit.js --json /tmp/fuluck-seo-geo-audit.json --markdown /tmp/fuluck-seo-geo-audit.md
```

Expected: tests PASS; repository audit exits 0 and reports zero errors.

- [ ] **Step 5: Commit Task 4**

```bash
git add tools/seo-geo-audit.js tests/seo-geo-audit.test.js
git commit -m "feat: add deterministic SEO GEO audit"
```

### Task 5: Wire the audit into push, regeneration and weekly workflows

**Files:**
- Modify: `tests/workflow-integrity.test.js`
- Modify: `.github/workflows/quality.yml`
- Modify: `.github/workflows/regenerate-site.yml`
- Create: `.github/workflows/seo-geo-quality.yml`

**Interfaces:**
- Consumes: Task 4 CLI.
- Produces: read-only scheduled artifact and two release gates around generated commits/rebase retries.

- [ ] **Step 1: Write failing workflow assertions**

Read the new workflow and assert:

```js
assert.match(seoGeoWorkflow, /workflow_dispatch:/);
assert.match(seoGeoWorkflow, /cron:\s*['"]17 19 \* \* 0['"]/);
assert.match(seoGeoWorkflow, /push:/);
assert.match(seoGeoWorkflow, /pull_request:/);
assert.match(seoGeoWorkflow, /permissions:\s*\n\s+contents:\s*read/);
assert.match(seoGeoWorkflow, /node-version-file:\s*['"]?\.node-version['"]?/);
assert.match(seoGeoWorkflow, /node tools\/seo-geo-audit\.js[\s\S]*--json[\s\S]*seo-geo-audit\.json[\s\S]*--markdown[\s\S]*seo-geo-audit\.md/);
assert.match(seoGeoWorkflow, /actions\/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02\s+#\s+v4\.6\.2/);
assert.doesNotMatch(seoGeoWorkflow, /contents:\s*write|secrets\./);
```

Define exact reviewed action constants and require every occurrence across `quality.yml`, `regenerate-site.yml` and `seo-geo-quality.yml` to match them—an arbitrary 40-hex SHA is not sufficient:

```js
const CHECKOUT = 'actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5';
const SETUP_NODE = 'actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020';
const UPLOAD = 'actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02';
```

Assert `quality.yml` contains the audit command. Assert the first pre-commit section and the post-rebase retry tail of `regenerate-site.yml` each contain the audit command before their next commit/push attempt. For the read-only SEO GEO workflow, reject global or job-level `contents: write`, `pages: write`, `id-token: write`, secrets, `git push`, `deploy`, `wrangler`, Cloudflare, IndexNow or Search Console/GSC calls.

- [ ] **Step 2: Verify RED**

Run:

```bash
node --test tests/workflow-integrity.test.js
```

Expected: FAIL because the new workflow and audit steps do not exist.

- [ ] **Step 3: Create `SEO GEO Quality`**

Use immutable SHAs already present for checkout/setup-node and `ea165f8d65b6e75b540449e92b4886f43607fa02` for upload-artifact v4.6.2. The job steps are:

```yaml
- name: Run SEO GEO contract tests
  run: node --test tests/seo-geo-structured-data.test.js tests/seo-geo-content-contract.test.js tests/seo-geo-audit.test.js tests/workflow-integrity.test.js
- name: Generate SEO GEO audit
  run: |
    mkdir -p "$RUNNER_TEMP/seo-geo-audit"
    node tools/seo-geo-audit.js \
      --json "$RUNNER_TEMP/seo-geo-audit/seo-geo-audit.json" \
      --markdown "$RUNNER_TEMP/seo-geo-audit/seo-geo-audit.md"
- name: Verify generated output
  if: always()
  run: node tools/verify-generated.js
- name: Upload SEO GEO audit
  if: always()
  uses: actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02 # v4.6.2
  with:
    name: seo-geo-audit-${{ github.sha }}
    path: ${{ runner.temp }}/seo-geo-audit/
    if-no-files-found: error
    retention-days: 30
```

Set global `permissions: contents: read`, `timeout-minutes: 10`, Node from `.node-version`, and concurrency keyed by workflow/ref. Upload uses `if: always()`, but the audit command itself remains a blocking step; it must write both reports before returning nonzero on findings.

- [ ] **Step 4: Add hard gates to existing workflows**

In `quality.yml`, run `node tools/seo-geo-audit.js` after the complete regression suite and before `verify-generated`.

In `regenerate-site.yml`, use `$RUNNER_TEMP` outputs and run the audit after the complete regression suite and before `verify-generated`. Inside the `git pull --rebase` retry block, run it after both generators and the complete test suite, again before `verify-generated` and staging. Reports must stay outside the repository so `git add -A` cannot publish them.

- [ ] **Step 5: Verify GREEN**

Run:

```bash
node --test tests/workflow-integrity.test.js tests/seo-geo-audit.test.js
node tools/seo-geo-audit.js
```

Expected: all tests PASS and the repository audit exits 0.

- [ ] **Step 6: Commit Task 5**

```bash
git add .github/workflows/quality.yml .github/workflows/regenerate-site.yml .github/workflows/seo-geo-quality.yml tests/workflow-integrity.test.js
git commit -m "ci: gate releases with SEO GEO audit"
```

### Task 6: Full verification, static release, GSC validation and durable closeout

**Files:**
- Create outside worktree: `/Users/willma/Documents/猫舍/报告/Fuluck-SEO-GEO-质量与发布审计-2026-07-17/` fixed report bundle.
- Modify in knowledge base: `NEXT.md`.
- Create in knowledge base: `50-工作日志/session-logs/2026-07-17-M4-fuluckpet-SEO-GEO真实门控发布.md`.
- Modify in knowledge base: `runbooks/fuluckpet-全站生成与Worker安全发布.md`.

**Interfaces:**
- Consumes: all Task 1–5 commits and current `origin/main`.
- Produces: verified main SHA, live static output, GSC validation state, frozen investigation report and KB handoff.

- [ ] **Step 1: Run fresh full verification**

```bash
node tools/generate-site.js
node tools/generate-diary.js
node --test tests/*.test.js
node tools/verify-generated.js
node tools/seo-geo-audit.js --json /tmp/fuluck-seo-geo-final.json --markdown /tmp/fuluck-seo-geo-final.md
git diff --check
git diff --exit-code
git status --porcelain=v1 --untracked-files=all
test -z "$(git status --porcelain=v1 --untracked-files=all)"
```

Run the full Node suite outside the filesystem sandbox if the existing loopback preview tests receive `listen EPERM`; the accepted result is `563 + newly added tests`, zero failures. The porcelain output must be empty; `git diff --exit-code` alone is insufficient because it ignores untracked generated details.

- [ ] **Step 2: Review the complete branch diff**

Generate a review package from merge base to HEAD. A fresh reviewer must return both spec compliance and code-quality verdicts with no open Critical/Important finding. Resolve findings with covering tests and re-review.

- [ ] **Step 3: Inspect local desktop/mobile output**

Serve only the worktree on loopback. Inspect at 1440×1000 and 390×844. Discover a current ja/en/zh detail triad at runtime; prefer the lexicographically first priced detail, otherwise use the first unpriced detail and verify that Product/Offer are absent. If the catalog is honestly empty, inspect the three empty list states and skip the detail route. Never pin an inventory ID:

```text
/
/blog.html
/kittens.html
/en/kittens.html
/zh/kittens.html
/<runtime ja kitten detail, when present>
/en/<same runtime kitten detail, when present>
/zh/<same runtime kitten detail, when present>
/siberian-breeder-osaka.html
/blog/siberian-cost-breakdown.html
```

Confirm zero console errors, no body horizontal overflow, one ItemList on list pages, one stable Product on priced details and no SearchAction.

- [ ] **Step 4: Rebase safely and re-run all gates**

```bash
git fetch --prune origin
git rebase origin/main
node tools/generate-site.js
node tools/generate-diary.js
node --test tests/*.test.js
node tools/verify-generated.js
node tools/seo-geo-audit.js
git diff --check
git diff --exit-code
git status --porcelain=v1 --untracked-files=all
test -z "$(git status --porcelain=v1 --untracked-files=all)"
```

If origin/main is unchanged, rebase is a no-op. If it advanced, the second full run is mandatory. The final porcelain output must be empty. Any generator drift leaves the tree unclean and blocks publishing until it is reviewed, tested and committed; the SHA pushed must be the exact clean tree that passed the gates.

- [ ] **Step 5: Publish static main only**

Under the current explicit two-hour full-auto authorization, record `RELEASE_SHA=$(git rev-parse HEAD)`, require `git status --porcelain=v1 --untracked-files=all` to be empty, and push exactly `RELEASE_SHA:main`. Do not deploy Worker, write KV/R2, change DNS or use Admin. Record the exact pushed SHA. Wait for Quality, SEO GEO Quality and Pages runs tied to that same SHA; a push is not “live” until Pages and production smoke agree.

- [ ] **Step 6: Production smoke and GSC validation**

Inspect the same production routes and parse their live JSON-LD. Confirm llms and SearchAction changes are live. Only after live content, Quality, SEO GEO Quality and Pages all prove the same `RELEASE_SHA`, use Laura's logged-in browser without reading/exporting cookies or OAuth material. Click “验证修正情况” only for the historical duplicate-brand and invalid-availability issue groups. Do not validate missing `hasMerchantReturnPolicy`, `shippingDetails` or `validFrom`.

- [ ] **Step 7: Build the frozen investigation report**

Author canonical `report.json` with `mode: investigation`, render and capture using the installed `fable-html-report` scripts, then require:

```text
report.json
report.md
report.html
review.json
qa.json
screenshots/desktop-1440.png
screenshots/mobile-390.png
screenshots/print-a4.png
```

The report must separate verified GSC/live facts, inferences, unknown policy fields, risks, released actions and source boundaries. It must include a content opportunity queue that leaves the already-complete Osaka landing rewrite and the high-CTR homepage title unchanged until new page-query evidence exists. Final verification is `report_tool.py verify ... --require-screenshots`.

- [ ] **Step 8: Close the knowledge base**

Rewrite NEXT to at most three active items while preserving unrelated priorities. Log the exact production SHA, test counts, CI/Pages state, GSC validation actions, report path and remaining owner/legal policy gate. Update the Fuluck runbook with the new audit commands and Merchant-policy prohibition, then commit and push the knowledge base.

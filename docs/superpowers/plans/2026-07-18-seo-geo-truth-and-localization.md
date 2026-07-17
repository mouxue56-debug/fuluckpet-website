# SEO/GEO Truth and Localization Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove verified SEO/GEO truth drift, repair localized legal/schema semantics, and make the weekly quality workflow enforce those contracts.

**Architecture:** Tests parse the real static HTML, JSON-LD, translation payloads, and workflow YAML instead of testing mocks. Source pages and translation JSON are corrected first, then existing deterministic generators refresh derived listing/translation files. The quality workflow remains read-only and gains the new contract tests; it does not receive GSC secrets or publishing permissions.

**Tech Stack:** Node.js 24 `node:test`, static HTML/JSON-LD, JSON translation payloads, GitHub Actions YAML.

## Global Constraints

- Use CFA’s current Siberian profile as the breed-weight source: male 12–18 lb (about 5.4–8.2 kg), female 8–12 lb (about 3.6–5.4 kg).
- Never claim every kitten receives a genetic test; the verified Fuluck statement is that parent cats receive the relevant testing.
- Do not add or refresh an unsupported market-price number.
- Preserve the mandatory in-person pre-contract inspection and face-to-face explanation in Japanese, English, and Chinese.
- Do not touch Worker, KV, R2, Admin, DNS, booking records, animal records, or production API data.
- Do not commit raw GSC query exports.

---

### Task 1: Lock business-truth copy and localized waitlist law

**Files:**
- Modify: `tests/whole-site-trust-contract.test.js`
- Modify: `tests/seo-geo-content-opportunities.test.js`
- Modify: `blog/siberian-price-guide.html`
- Modify: `tools/blog-translations/siberian-price-guide.json`
- Modify: `blog.html`
- Modify: `blog-search-index.json`
- Modify: `blog/siberian-osaka-guide.html`
- Modify: `blog/kansai-breeder-guide.html`
- Modify: `en/waitlist.html`
- Modify: `zh/waitlist.html`
- Regenerate: `blog-listing-i18n.js`

**Interfaces:**
- Consumes: existing Japanese FAQ/parents testing statement and Japanese waitlist legal wording.
- Produces: a test-enforced, language-consistent trust contract and current, non-year-stamped price guide metadata.

- [ ] **Step 1: Write failing trust tests**

Add assertions that all waitlist locales require in-person inspection and face-to-face explanation before contract, EN/ZH links target their localized healthy-kitten articles, no page claims every kitten is genetically tested, both Osaka support articles link to `/siberian-breeder-osaka.html`, and every visible/structured/listing price-guide title omits `2025`.

- [ ] **Step 2: Verify RED**

Run: `node --test tests/whole-site-trust-contract.test.js tests/seo-geo-content-opportunities.test.js`

Expected: failures naming the localized LINE-video wording, all-kitten testing claims, missing Osaka links, and stale 2025 title surfaces.

- [ ] **Step 3: Apply minimal copy fixes**

Change the price guide to timeless wording and current-page guidance; say parent-cat testing plus kitten-specific vaccination/microchip/health records; correct the two Osaka articles and add contextual links; preserve the Japanese legal rule in EN/ZH waitlist text and localized article links. Update the price translation JSON and regenerate derived listing i18n/search/card surfaces deterministically.

- [ ] **Step 4: Verify GREEN**

Run: `node --test tests/whole-site-trust-contract.test.js tests/seo-geo-content-opportunities.test.js`

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add tests/whole-site-trust-contract.test.js tests/seo-geo-content-opportunities.test.js blog/siberian-price-guide.html tools/blog-translations/siberian-price-guide.json blog.html blog-search-index.json blog-listing-i18n.js blog/siberian-osaka-guide.html blog/kansai-breeder-guide.html en/waitlist.html zh/waitlist.html
git commit -m "fix: align price and localized trust copy"
```

### Task 2: Unify the Siberian weight fact graph

**Files:**
- Create: `tests/siberian-weight-truth.test.js`
- Modify: `blog/siberian-weight-size.html`
- Modify: `blog/siberian-character.html`
- Modify: `blog/large-cat-breeds.html`
- Modify: `blog/siberian-vs-mainecoon.html`
- Modify: `blog/siberian-vs-norwegian.html`
- Modify: matching `tools/blog-translations/*.json`
- Modify: `siberian.html`
- Modify: `blog/siberian-cat-characteristics.html`
- Modify: `llms-full.txt`

**Interfaces:**
- Consumes: CFA breed profile URL and the conversion fixed in the design.
- Produces: one male/female range across Japanese copy, EN/ZH translation payloads, and LLM discovery text.

- [ ] **Step 1: Write failing weight-truth test**

Scan public HTML, translation JSON, and `llms-full.txt` for legacy Siberian `6–10/4–7` variants; assert the primary guide contains the CFA URL, the pound source values, the approximate kg conversions, and an individual-variation/BCS/veterinary disclaimer.

- [ ] **Step 2: Verify RED**

Run: `node --test tests/siberian-weight-truth.test.js`

Expected: failure listing legacy ranges and the missing direct CFA citation.

- [ ] **Step 3: Apply minimal factual correction**

Replace only Siberian ranges with the cited CFA ranges, leave comparison-breed values unchanged, add the source/disclaimer to the main guide, and update all affected EN/ZH translation JSON blocks without changing the successful title/H1.

- [ ] **Step 4: Verify GREEN and translation integrity**

Run: `node --test tests/siberian-weight-truth.test.js tests/blog-translation-integrity.test.js tests/safe-json-script.test.js`

Expected: all tests pass and translation scripts parse.

- [ ] **Step 5: Commit**

```bash
git add tests/siberian-weight-truth.test.js blog/siberian-weight-size.html blog/siberian-character.html blog/large-cat-breeds.html blog/siberian-vs-mainecoon.html blog/siberian-vs-norwegian.html tools/blog-translations siberian.html blog/siberian-cat-characteristics.html llms-full.txt
git commit -m "fix: unify cited Siberian weight facts"
```

### Task 3: Repair localized healthy-kitten semantics

**Files:**
- Modify: `tests/localized-blog-seo.test.js`
- Modify: `en/blog/choose-healthy-kitten-checklist.html`
- Modify: `zh/blog/choose-healthy-kitten-checklist.html`

**Interfaces:**
- Consumes: existing localized visible content and self URLs.
- Produces: localized BlogPosting/Breadcrumb JSON-LD, `inLanguage`, localized visible breadcrumbs, and localized calls to action.

- [ ] **Step 1: Write failing localized-semantic tests**

For the EN/ZH healthy-kitten pages assert `html lang`, `BlogPosting.inLanguage`, localized schema headline/description, and non-Japanese breadcrumb item names. Add focused assertions for visible breadcrumb/related/CTA language.

- [ ] **Step 2: Verify RED**

Run: `node --test tests/localized-blog-seo.test.js`

Expected: failures on missing `inLanguage` and Japanese schema/breadcrumb text.

- [ ] **Step 3: Apply the smallest complete localization repair**

Correct the healthy-kitten EN/ZH schema and visible navigation/related/CTA copy. Do not weaken language checks for the target pair.

- [ ] **Step 4: Verify GREEN**

Run: `node --test tests/localized-blog-seo.test.js tests/whole-site-trust-contract.test.js`

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add tests/localized-blog-seo.test.js en/blog/choose-healthy-kitten-checklist.html zh/blog/choose-healthy-kitten-checklist.html
git commit -m "fix: localize healthy kitten semantics"
```

### Task 4: Put the new contracts into the weekly read-only workflow

**Files:**
- Modify: `tests/workflow-integrity.test.js`
- Modify: `.github/workflows/seo-geo-quality.yml`

**Interfaces:**
- Consumes: the three new/expanded contract test files from Tasks 1–3.
- Produces: a read-only weekly/PR/push workflow that blocks on those contracts before audit and verification.

- [ ] **Step 1: Write a failing workflow-integrity assertion**

Require the SEO/GEO workflow test command to include `tests/seo-geo-content-opportunities.test.js`, `tests/siberian-weight-truth.test.js`, `tests/localized-blog-seo.test.js`, and `tests/whole-site-trust-contract.test.js` before `seo-geo-audit.js`.

- [ ] **Step 2: Verify RED**

Run: `node --test tests/workflow-integrity.test.js`

Expected: failure showing the workflow omits the new contract tests.

- [ ] **Step 3: Update the read-only workflow command**

Add the exact test files to the existing Node test command. Do not add secrets, write permissions, GSC access, push, deployment, IndexNow, or production data access.

- [ ] **Step 4: Verify GREEN and full release gates**

Run:

```bash
node --test tests/*.test.js
node tools/seo-geo-audit.js
node tools/verify-generated.js
git diff --check
```

Expected: all tests pass; audit has zero errors; generated output verifies; diff check is clean.

- [ ] **Step 5: Commit**

```bash
git add tests/workflow-integrity.test.js .github/workflows/seo-geo-quality.yml
git commit -m "ci: enforce SEO GEO truth contracts"
```


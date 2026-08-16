# Boarding Transport Pricing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish the owner-approved dog boarding planned prices and boarding/care pet-transport tiers from one canonical configuration across the public pages, estimator, generated projection, and customer-service knowledge without opening dog bookings.

**Architecture:** `boarding-public-config.js` remains the only manually maintained price source. A focused static renderer projects the transport contract into both service pages and the customer-service knowledge formatter, while `boarding-public-calc.js` provides a fail-closed pure transport quote used by the existing estimator. Existing deterministic generation and verification gates own all derived artifacts.

**Tech Stack:** Dependency-free Node.js 24 tests, browser-compatible ES5-style JavaScript, static HTML/CSS, deterministic Node generators, GitHub Actions quality/regeneration workflow.

## Global Constraints

- Dog boarding planned prices are exactly small ¥5,000, medium ¥7,500, large ¥9,500 per night.
- Dog services remain `public:false`, `preparing:true`, and `accepting:false`; no dog booking CTA, LINE action, Offer schema, or calendar write may appear.
- Transport tiers are exactly: within 3km ¥1,650/¥3,300; over 3km through 5km ¥2,200/¥4,400; over 5km through 10km ¥3,300/¥6,600; over 10km through 20km LINE quote; over 20km unavailable.
- Transport fees never receive long-stay, graduated-cat, or other discounts.
- The transport service is named `お預かり・ケア利用時のペット送迎` and remains separate from kitten delivery and visitor station guidance.
- Do not modify kitten delivery prices, cat/small-animal boarding prices, existing care prices, dog location, or dog start timing.
- Public script changes must use one new coherent asset release stamp.

---

### Task 1: Lock and update dog planned boarding prices

**Files:**
- Modify: `tests/boarding-dog-gate.test.js`
- Modify: `tests/dog-services-public-pipeline.test.js`
- Modify: `tests/care-catalog-static.test.js`
- Modify: `boarding-public-config.js`
- Generated: `dog-services-preparing.json`

**Interfaces:**
- Consumes: `CONFIG.dogServices.boardingBasePrice` and the existing dog projection gate.
- Produces: `{ small: 5000, medium: 7500, large: 9500 }` in the canonical config and preparing projection; launch projection remains `{"public":false}`.

- [ ] **Step 1: Change exact price assertions before production code**

Update expected config/projection/UI/schema arrays to `5000, 7500, 9500`, and update the 30-night expected totals to `120000, 180000, 228000`. Keep every stopped-state and no-CTA assertion intact.

- [ ] **Step 2: Run the focused tests and confirm price failures**

Run:

```bash
node --test tests/boarding-dog-gate.test.js tests/dog-services-public-pipeline.test.js tests/care-catalog-static.test.js
```

Expected: FAIL only where the canonical config and derived artifact still contain the old medium/large prices.

- [ ] **Step 3: Update the canonical dog prices**

In `CONFIG.dogServices` use:

```js
boardingBasePrice: { small: 5000, medium: 7500, large: 9500 },
```

Do not change `public`, `preparingVisible`, `locationNotice`, or `weightBands`.

- [ ] **Step 4: Regenerate and retest the dog projection**

Run:

```bash
node tools/generate-site.js
node --test tests/boarding-dog-gate.test.js tests/dog-services-public-pipeline.test.js tests/care-catalog-static.test.js
```

Expected: PASS; `dog-services-preparing.json` contains the three new prices and `dog-services-launch.json` remains exactly `{"public":false}`.

- [ ] **Step 5: Commit the dog price slice**

```bash
git add boarding-public-config.js dog-services-preparing.json tests/boarding-dog-gate.test.js tests/dog-services-public-pipeline.test.js tests/care-catalog-static.test.js
git commit -m "feat: update planned dog boarding prices"
```

### Task 2: Add the canonical transport contract and deterministic page renderer

**Files:**
- Create: `tools/transport-service-static.js`
- Create: `tests/transport-service-static.test.js`
- Modify: `boarding-public-config.js`
- Modify: `boarding/index.html`
- Modify: `grooming/index.html`
- Modify: `tools/generate-site.js`
- Modify: `tools/verify-generated.js`
- Modify: `tools/care-catalog-static.js`
- Modify: `tests/care-catalog-static.test.js`

**Interfaces:**
- Consumes: `CONFIG.petTransport`.
- Produces: `assertTransportConfig(config)`, `renderTransportSection(config)`, `buildTransportPage(source, config)`, `writeTransportPage(file, config)`, `isTransportPageFresh(source, config)`, and `formatTransportKnowledge(config)`.

- [ ] **Step 1: Write failing contract and renderer tests**

Define the canonical shape in the test:

```js
assert.deepEqual(CONFIG.petTransport, {
  discountEligible: false,
  tiers: [
    { id: 'within3', label: '3km以内', maxKmInclusive: 3, status: 'priced', oneWayPrice: 1650, roundTripPrice: 3300 },
    { id: 'over3to5', label: '3kmを超え5km以内', minKmExclusive: 3, maxKmInclusive: 5, status: 'priced', oneWayPrice: 2200, roundTripPrice: 4400 },
    { id: 'over5to10', label: '5kmを超え10km以内', minKmExclusive: 5, maxKmInclusive: 10, status: 'priced', oneWayPrice: 3300, roundTripPrice: 6600 },
    { id: 'over10to20', label: '10kmを超え20km以内', minKmExclusive: 10, maxKmInclusive: 20, status: 'quote', oneWayPrice: null, roundTripPrice: null },
    { id: 'over20', label: '20km超', minKmExclusive: 20, maxKmInclusive: null, status: 'unavailable', oneWayPrice: null, roundTripPrice: null },
  ],
});
```

Assert that rendering produces one accessible table with `片道1回`, `お迎え＋お送り`, all five rows, `LINEでお見積り`, `送迎対応なし`, `割引対象外`, and `子猫のお届けとは別料金`. Assert malformed/missing markers and invalid tier arithmetic fail before writing.

- [ ] **Step 2: Run the new static-renderer test and confirm failure**

Run:

```bash
node --test tests/transport-service-static.test.js tests/care-catalog-static.test.js
```

Expected: FAIL because `CONFIG.petTransport` and `tools/transport-service-static.js` do not exist.

- [ ] **Step 3: Add the config and focused renderer**

Implement exact config validation, HTML escaping, yen formatting, the generated markers below, and a byte-stable section renderer:

```js
const TRANSPORT_START = '<!-- BEGIN GENERATED PET TRANSPORT -->';
const TRANSPORT_END = '<!-- END GENERATED PET TRANSPORT -->';
```

The rendered heading is `お預かり・ケア利用時のペット送迎`. The table appears once in each page and contains no booking promise beyond the existing LINE consultation link.

- [ ] **Step 4: Wire both pages and the generator**

Add one empty generated marker pair to `boarding/index.html` after the dog boarding surface and to `grooming/index.html` after the dog care surface. Add `writeTransportPages()` to `tools/generate-site.js` after the API snapshot gates and before the catalogue page writes. Extend `tools/verify-generated.js` to require both pages to be fresh against `CONFIG.petTransport`.

- [ ] **Step 5: Add transport facts to customer-service knowledge**

Append `formatTransportKnowledge(config.petTransport)` inside `formatCareKnowledge`. Lock the three exact numeric rows, the 10–20km LINE quote, over-20km refusal, discount exclusion, and kitten-delivery separation in `tests/care-catalog-static.test.js`.

- [ ] **Step 6: Generate twice and run focused tests**

Run:

```bash
node tools/generate-site.js
git diff -- boarding/index.html grooming/index.html
node tools/generate-site.js
node --test tests/transport-service-static.test.js tests/care-catalog-static.test.js tests/boarding-public-launch.test.js
node tools/verify-generated.js
```

Expected: second generation adds no new diff; tests and verifier PASS.

- [ ] **Step 7: Commit the transport source and page projection**

```bash
git add boarding-public-config.js boarding/index.html grooming/index.html tools/transport-service-static.js tools/care-catalog-static.js tools/generate-site.js tools/verify-generated.js tests/transport-service-static.test.js tests/care-catalog-static.test.js
git commit -m "feat: publish boarding and care transport tiers"
```

### Task 3: Add fail-closed transport calculation and estimator controls

**Files:**
- Modify: `boarding-public-calc.js`
- Modify: `boarding/estimate.html`
- Modify: `boarding/boarding-public-estimate.js`
- Modify: `services.css`
- Modify: `tests/boarding-public-calc.test.js`
- Modify: `tests/boarding-estimate-care-ui.test.js`

**Interfaces:**
- Consumes: `CONFIG.petTransport`, `tierId`, and `tripType` (`oneWay` or `roundTrip`).
- Produces: `calculatePetTransport({ tierId, tripType })` returning one of:

```js
{ status: 'none', subtotal: 0, needsQuote: false }
{ status: 'priced', tierId, tripType, label, subtotal, needsQuote: false, discountEligible: false }
{ status: 'quote', tierId, tripType, label, subtotal: 0, needsQuote: true, discountEligible: false }
{ status: 'unavailable', tierId, tripType, label, subtotal: 0, needsQuote: false, error: 'transport_unavailable' }
```

- [ ] **Step 1: Write failing pure-calculation tests**

Assert no-selection returns `none`; the six priced combinations return exactly 1650/3300, 2200/4400, and 3300/6600; 10–20km returns `quote` without a zero-yen display contract; over20 returns `transport_unavailable`; unknown tier/trip inputs return explicit errors.

- [ ] **Step 2: Write failing estimator contract tests**

Require `select#transportDistance`, `select#transportTrip`, configuration-driven option building, change listeners, a separate `送迎` result line, transport subtotal added after all discounted service totals, LINE quote copy, and a no-service message for over20km. Require DOM writes through `textContent`, not `innerHTML`.

- [ ] **Step 3: Run focused tests and confirm failure**

Run:

```bash
node --test tests/boarding-public-calc.test.js tests/boarding-estimate-care-ui.test.js
```

Expected: FAIL because the transport calculator and controls are absent.

- [ ] **Step 4: Implement the pure calculator**

Validate both identifiers against the canonical tiers. For `priced`, select `oneWayPrice` or `roundTripPrice`; never apply `roundYen100` or a customer discount to transport. Return quote/unavailable states before reading a price.

- [ ] **Step 5: Implement the estimator UI**

Add a fourth card with distance and trip selects. Populate distance options from `Config.petTransport.tiers`; keep `transportTrip` disabled until a tier is chosen. During computation:

```js
var transport = Calc.calculatePetTransport({
  tierId: elements.transportDistance.value,
  tripType: elements.transportTrip.value,
});
```

For `priced`, append `送迎` and add only `transport.subtotal`. For `quote`, append a `LINE見積り` line, retain the numeric service subtotal, add a review message, and copy the chosen distance/trip into the LINE text. For `unavailable`, show `20kmを超える住所への送迎は承っていません。` without presenting the selection as ¥0. Dog results remain planned and copy-only.

- [ ] **Step 6: Add responsive styling and run focused tests**

Reuse `.estimate-fields` and existing 44px form-control conventions. Add only the selectors' disabled/help styles needed on 600px screens.

Run:

```bash
node --test tests/boarding-public-calc.test.js tests/boarding-estimate-care-ui.test.js tests/dog-services-private-preview.test.js
```

Expected: PASS.

- [ ] **Step 7: Commit the estimator slice**

```bash
git add boarding-public-calc.js boarding/estimate.html boarding/boarding-public-estimate.js services.css tests/boarding-public-calc.test.js tests/boarding-estimate-care-ui.test.js
git commit -m "feat: include transport in boarding estimates"
```

### Task 4: Stamp assets, regenerate all derived output, and run Workflow gates

**Files:**
- Modify: `tests/asset-version-coherence.test.js`
- Modify: every tracked HTML reference to changed service assets as reported by the version test
- Generated: `dog-services-preparing.json`, `boarding/index.html`, `grooming/index.html`, and any deterministic generator output changed by the current API snapshot

**Interfaces:**
- Consumes: all code from Tasks 1–3.
- Produces: one cache-coherent tracked release that passes the same commands as `.github/workflows/quality.yml` and `.github/workflows/regenerate-site.yml`.

- [ ] **Step 1: Raise the service release stamp in the version contract first**

Set `SERVICE_STYLE_RELEASE`, `SERVICE_RELEASE`, `DOG_UI_RELEASE`, and `ESTIMATE_RELEASE` to one new stamp, `20260816a`, only for assets whose bytes or transitive data contract changed.

- [ ] **Step 2: Run the version test and use its failures as the exact reference list**

Run:

```bash
node --test tests/asset-version-coherence.test.js
```

Expected: FAIL listing every stale tracked HTML reference.

- [ ] **Step 3: Update only the reported service-asset references**

Replace the stale `?v=` values with `20260816a`. Do not touch unrelated global asset versions.

- [ ] **Step 4: Run deterministic regeneration and the complete local Workflow**

Run:

```bash
node tools/generate-site.js
node tools/generate-site.js
node --test tests/*.test.js
node tools/seo-geo-audit.js --json /tmp/fuluck-boarding-transport-seo.json --markdown /tmp/fuluck-boarding-transport-seo.md
node tools/verify-generated.js
git diff --check
```

Expected: all tests PASS, SEO/GEO audit exits 0, verifier reports clean, and the second generator run introduces no additional diff.

- [ ] **Step 5: Verify the production safety invariants**

Run:

```bash
test "$(cat dog-services-launch.json)" = '{"public":false}'
rg -n "5,500|6,500|10km 内.*3,300|10km以内.*一律" boarding grooming dog-services-preparing.json tools tests
```

Expected: launch gate check succeeds; no customer-facing old dog price or superseded flat transport rule remains. Historical specs/plans may retain old numbers as dated records.

- [ ] **Step 6: Commit the coherent generated release**

```bash
git add tests/asset-version-coherence.test.js boarding grooming services.css boarding-public-config.js boarding-public-calc.js dog-services-preparing.json tools tests
git commit -m "chore: finalize boarding transport release"
```

### Task 5: Independent review and controlled publication

**Files:**
- Review: all commits after `origin/main`
- Update after acceptance: knowledge-base runbook, `NEXT.md`, and session log

**Interfaces:**
- Consumes: the complete verified branch.
- Produces: review findings, a clean branch ready for the existing GitHub quality/regeneration workflow, and a truthful operational handoff.

- [ ] **Step 1: Run a spec-compliance review**

Check every requirement in `docs/superpowers/specs/2026-08-16-boarding-transport-pricing-design.md` against the diff. Reject any dog public-gate change, kitten-delivery change, hidden discount, hand-copied tier drift, or missing quote/unavailable state.

- [ ] **Step 2: Run a code-quality review**

Inspect validation boundaries, DOM safety, generated-marker safety, accessibility, mobile layout, cache stamps, and test quality. Fix all blocking findings and rerun the full Workflow gates.

- [ ] **Step 3: Inspect the three pages locally**

Check `/boarding/`, `/grooming/`, and `/boarding/estimate.html` at desktop and narrow mobile widths. Verify five transport rows, new dog prices, calculator priced/quote/unavailable cases, copy text, keyboard operation, and no console errors.

- [ ] **Step 4: Publish only through the existing gated path**

Push the reviewed branch, require GitHub quality checks, and use the repository's approved merge/regeneration route. Do not directly edit production files or bulk-write Worker KV. If `kb:boarding` publication is authorized in the release step, update only that key and re-read it for equality.

- [ ] **Step 5: Close the knowledge-base Workflow**

Append a new owner correction to `runbooks/Fuluck寄养洗护接送定价-大阪市场锚点.md` stating that the five-tier table supersedes the temporary flat ¥3,300 decision. Update `NEXT.md` to at most three current items, add a session log with test/deployment evidence, and close out through `bin/kb-sync.sh --closeout` with the exact changed paths.

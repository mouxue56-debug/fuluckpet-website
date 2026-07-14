# Unified Boarding Pricing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish one simple boarding price policy for cats, stopped dog previews and small animals, with graduated cats at 30%OFF and no member or date surcharge concepts.

**Architecture:** `boarding-public-config.js` remains the single hand-maintained price contract. Pure calculators consume a shared long-stay tier list, static projections generate the public pages and chat knowledge, and the existing dog gate remains fail-closed. All changed behavior is locked by tests before implementation.

**Tech Stack:** Browser-compatible JavaScript, Node.js `node:test`, static HTML generation, GitHub Pages, Cloudflare KV/Worker release tooling.

## Global Constraints

- Cat boarding is ¥4,000 per night.
- Dog preview prices are small ¥5,000, medium ¥5,500 and large ¥6,500.
- Dog weight bands are `<10kg`, `10kg–<20kg`, and `>=20kg`.
- All boarding types use 1–6 nights 100%, 7–13 95%, 14–20 90%, 21–29 85%, 30+ 80%.
- Graduated cats receive 70% for both boarding and eligible cat care; discounts never stack.
- Remove public and computational member discounts and all date surcharges.
- Dog services remain `public:false`, preparing-only, with no booking CTA, Offer schema or calendar write.
- Rabbit and hamster base prices remain ¥1,500 and ¥500.
- Final boarding totals round with `Math.round(total / 100) * 100`.

---

## File Map

- `boarding-public-config.js`: sole prices, weight bands and discount policy.
- `boarding-public-calc.js`: pure boarding and care calculations.
- `dog-services-projection.js`: validated preparing/public dog projection.
- `boarding/boarding-public-estimate.js`: estimate controls and result copy.
- `boarding/estimate.html`: estimate form markup and asset versions.
- `tools/care-catalog-static.js`: generated grooming blocks and chat knowledge.
- `boarding/index.html`, `grooming/index.html`, `dog-services-preparing.json`: generated/public projections.
- `tests/boarding-public-calc.test.js`: numerical and boundary behavior.
- `tests/boarding-price-display.test.js`: single-source public price contract.
- `tests/boarding-dog-gate.test.js`, `tests/dog-services-public-pipeline.test.js`: stopped-dog safety.
- `tests/boarding-estimate-care-ui.test.js`: estimate UI semantics.
- `tests/care-catalog-static.test.js`, `tests/boarding-public-launch.test.js`: generated copy, Schema and knowledge.

### Task 1: Lock the unified price policy with failing tests

**Files:**
- Modify: `tests/boarding-public-calc.test.js`
- Modify: `tests/boarding-price-display.test.js`
- Modify: `tests/boarding-dog-gate.test.js`
- Modify: `tests/dog-services-public-pipeline.test.js`

**Interfaces:**
- Consumes: current `CONFIG`, `calculateBoarding`, `calculateSmallPetBoarding`, `calculateDogBoarding`.
- Produces: expected contract `CONFIG.longStayDiscount`, `CONFIG.graduatedCatDiscount`, `CONFIG.dogServices.weightBands`, and total-based boarding results.

- [ ] **Step 1: Write failing configuration assertions**

```js
assert.equal(CONFIG.boardingBasePrice.cat, 4000);
assert.deepEqual(CONFIG.longStayDiscount, [
  { minNights: 30, rate: 0.80 },
  { minNights: 21, rate: 0.85 },
  { minNights: 14, rate: 0.90 },
  { minNights: 7, rate: 0.95 },
]);
assert.equal(CONFIG.graduatedCatDiscount, 0.70);
assert.deepEqual(CONFIG.dogServices.boardingBasePrice, { small: 5000, medium: 5500, large: 6500 });
assert.deepEqual(CONFIG.dogServices.weightBands, {
  small: { minKg: 0, maxKgExclusive: 10 },
  medium: { minKg: 10, maxKgExclusive: 20 },
  large: { minKg: 20, maxKgExclusive: null },
});
assert.equal('customerDiscount' in CONFIG, false);
assert.equal('dateSurcharge' in CONFIG, false);
```

- [ ] **Step 2: Write failing numerical boundary tests**

```js
for (const [nights, rate] of [[1,1],[6,1],[7,.95],[13,.95],[14,.9],[20,.9],[21,.85],[29,.85],[30,.8]]) {
  const result = calculateBoarding({ animalType: 'cat', checkInDate: '2026-09-01', checkOutDate: addDays('2026-09-01', nights) });
  assert.equal(result.rate, rate);
  assert.equal(result.boardingTotal, Math.round((4000 * nights * rate) / 100) * 100);
}
const graduated = calculateBoarding({ animalType: 'cat', checkInDate: '2026-09-01', checkOutDate: '2026-10-01', isGraduatedCat: true });
assert.equal(graduated.rate, 0.70);
assert.equal(graduated.boardingTotal, 84000);
```

- [ ] **Step 3: Verify RED**

Run:

```bash
node --test tests/boarding-public-calc.test.js tests/boarding-price-display.test.js tests/boarding-dog-gate.test.js
```

Expected: FAIL on old ¥4,800/¥7,400 prices, missing weight bands, old discount tiers, member fields and date surcharges. The dog public-pipeline tests join Task 3 because they also exercise rendered UI.

### Task 2: Implement the single price and calculation contract

**Files:**
- Modify: `boarding-public-config.js`
- Modify: `boarding-public-calc.js`
- Modify: `dog-services-projection.js`

**Interfaces:**
- Consumes: the assertions from Task 1.
- Produces: `getLongStayRate(nights) -> number`, total-based cat/small-pet/dog calculation results, validated dog `weightBands`.

- [ ] **Step 1: Replace duplicated price structures with one policy**

```js
var CONFIG = {
  currency: 'JPY', taxIncluded: true, roundUnit: 100,
  boardingBasePrice: { cat: 4000 },
  longStayDiscount: [
    { minNights: 30, rate: 0.80 },
    { minNights: 21, rate: 0.85 },
    { minNights: 14, rate: 0.90 },
    { minNights: 7, rate: 0.95 },
  ],
  graduatedCatDiscount: 0.70,
  smallPetBoarding: {
    rabbit_cage: { basePrice: 1500 },
    hamster_cage: { basePrice: 500 },
  },
  dogServices: {
    public: false,
    preparingVisible: true,
    boardingBasePrice: { small: 5000, medium: 5500, large: 6500 },
    weightBands: {
      small: { minKg: 0, maxKgExclusive: 10 },
      medium: { minKg: 10, maxKgExclusive: 20 },
      large: { minKg: 20, maxKgExclusive: null },
    },
  },
};
```

- [ ] **Step 2: Calculate one discounted total, never per-date surcharges**

```js
function getLongStayRate(nights) {
  for (var index = 0; index < CONFIG.longStayDiscount.length; index += 1) {
    if (nights >= CONFIG.longStayDiscount[index].minNights) return CONFIG.longStayDiscount[index].rate;
  }
  return 1;
}
function getBoardingRate(input, nights) {
  if (input.animalType === 'cat' && input.isGraduatedCat) return CONFIG.graduatedCatDiscount;
  return getLongStayRate(nights);
}
function totalFor(basePrice, nights, rate) {
  return roundYen100(basePrice * nights * rate);
}
```

- [ ] **Step 3: Remove member and post-boarding care discounts**

`getCatGroomingRate` accepts only `isGraduatedCat`; it returns `0.70` for graduated cats and `1` otherwise. Unknown or non-boolean values return `null`. `calculateCatCare` keeps non-discountable matting at rate `1`.

- [ ] **Step 4: Update and validate dog projection**

Dog projection contains `sizes`, `weightBands`, shared `longStayDiscount`, `care`, `public`, `preparing`, and `accepting`; it contains no `memberDiscountRate` or `dateSurcharge`.

- [ ] **Step 5: Verify GREEN**

Run the Task 1 command. Expected: all four files PASS.

- [ ] **Step 6: Commit**

```bash
git add boarding-public-config.js boarding-public-calc.js dog-services-projection.js tests/boarding-public-calc.test.js tests/boarding-price-display.test.js tests/boarding-dog-gate.test.js tests/dog-services-public-pipeline.test.js
git commit -m "feat: unify boarding price policy"
```

### Task 3: Lock and update public UI, Schema and knowledge projections

**Files:**
- Modify: `tests/boarding-estimate-care-ui.test.js`
- Modify: `tests/care-catalog-static.test.js`
- Modify: `tests/boarding-public-launch.test.js`
- Modify: `boarding/boarding-public-estimate.js`
- Modify: `boarding/estimate.html`
- Modify: `tools/care-catalog-static.js`
- Regenerate: `boarding/index.html`
- Regenerate: `grooming/index.html`
- Regenerate: `dog-services-preparing.json`

**Interfaces:**
- Consumes: Task 2 config and calculators.
- Produces: member-free estimate UI, graduated-cat non-stacking labels, config-derived public HTML and chat knowledge.

- [ ] **Step 1: Write failing UI and static-copy tests**

```js
assert.doesNotMatch(read('boarding/estimate.html'), /isMember|会員/);
assert.doesNotMatch(read('boarding/boarding-public-estimate.js'), /isMember|会員|surchargeLabels/);
assert.match(read('boarding/index.html'), /¥4,000/);
assert.match(read('boarding/index.html'), /7泊以上5%OFF/);
assert.match(read('boarding/index.html'), /30泊以上20%OFF/);
assert.match(read('boarding/index.html'), /卒業猫[^<]{0,80}30%OFF/);
assert.match(formatCareKnowledge(CONFIG), /猫は1泊4,000円/);
assert.match(formatCareKnowledge(CONFIG), /小型犬[^。]*5,000円[^。]*10kg未満/);
```

- [ ] **Step 2: Verify RED**

Run:

```bash
node --test tests/boarding-estimate-care-ui.test.js tests/care-catalog-static.test.js tests/boarding-public-launch.test.js tests/dog-services-public-pipeline.test.js
```

Expected: FAIL on member controls, old prices and old static knowledge.

- [ ] **Step 3: Remove stale controls and copy**

Delete the member checkbox and result branches. Render one discount line: graduated cat 30%OFF when selected, otherwise the applicable long-stay tier. Remove date-category groups and surcharge line items.

- [ ] **Step 4: Generate all price text from config**

`formatCareKnowledge(CONFIG)` must state cat ¥4,000, dog preview ¥5,000/¥5,500/¥6,500 with weight bands, unified long-stay tiers, no member/date surcharge, graduated-cat boarding and care 30%OFF, and dog `現在受付停止`.

- [ ] **Step 5: Regenerate static outputs**

Run:

```bash
node tools/generate-site.js
node tools/verify-generated.js
```

Expected: generator exits 0 and verifier reports every generated page clean.

- [ ] **Step 6: Verify GREEN**

Run the Task 3 test command. Expected: all three files PASS.

- [ ] **Step 7: Commit**

```bash
git add boarding/ boarding-public-config.js boarding-public-calc.js dog-services-projection.js dog-services-preparing.json grooming/index.html tools/care-catalog-static.js tests/
git commit -m "feat: publish simplified boarding prices"
```

### Task 4: Full verification, browser inspection and guarded release

**Files:**
- Modify only if verification exposes a regression: the failing source plus its new regression test.
- Generate: `/tmp/fuluck-pricing-20260714/` screenshots and logs; do not commit them.

**Interfaces:**
- Consumes: complete implementation.
- Produces: verified commit, Pages release, production KV knowledge, and a written release record.

- [ ] **Step 1: Run full local verification**

```bash
node --test tests/*.test.js
node tools/verify-generated.js
git diff --check
git status --short
```

Expected: zero failed tests, generated pages clean, no whitespace errors, only intentional files changed.

- [ ] **Step 2: Inspect representative desktop and mobile routes**

Serve the repository locally and inspect `/boarding/`, `/boarding/estimate.html`, and `/grooming/` at 1440×1000 and 390×844. Verify console has no errors, dog status is `現在受付停止`, no member control or surcharge copy remains, and no dog submission action exists.

- [ ] **Step 3: Generate and review the exact knowledge write commands**

```bash
node tools/seed-kb.js > /tmp/fuluck-pricing-kv-20260714.sh
rg -c -- '--remote' /tmp/fuluck-pricing-kv-20260714.sh
```

Read the Cloudflare/Wrangler skill before executing the generated fixed-version commands. Write only config-derived static knowledge keys and read every changed key back remotely.

- [ ] **Step 4: Commit any final verification fixes, then push**

```bash
git add -u
git commit -m "fix: close boarding pricing release gaps"
git push origin main
```

If Step 1 required no extra changes, push the existing implementation commit without creating an empty commit.

- [ ] **Step 5: Separate release states**

Wait for GitHub Quality and Pages jobs for the exact pushed SHA. Confirm production HTML, JS and JSON carry that SHA's prices. Do not report `git push` as live before Pages is verified. Deploy Worker code only if Worker source changed; otherwise update only the approved KV knowledge commands.

- [ ] **Step 6: Production smoke**

Verify `/boarding/`, `/boarding/estimate.html`, `/grooming/`, `dog-services-launch.json`, and `dog-services-preparing.json`. Confirm old prices and member/date surcharge copy are absent, new prices are present, dog `public:false`, and no dog booking/Schema/calendar capability is exposed.

- [ ] **Step 7: Close out the knowledge base**

Rewrite `NEXT.md` to retain at most three active items, create one `50-工作日志/session-logs/2026-07-14-M4-fuluckpet统一寄养价格发布.md`, append any new failure/recovery evidence to the existing Fuluck release runbook, then commit and push the knowledge base.

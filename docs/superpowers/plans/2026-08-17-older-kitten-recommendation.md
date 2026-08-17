# Older Kitten Recommendation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace stale `NEW` presentation for the selected older active cats with a truthful multilingual recommendation treatment on Fuluck, without changing Koneko or its mirrored source copy.

**Architecture:** Reuse the existing `promotionTag="featured"` catalogue contract for list/home/carousel ordering and labels. Add only the two missing presentation surfaces: a localized featured context block on generated detail pages and a featured chip in the card-backed modal. After code is released, update exactly nine website API records with individual `PUT` requests and regenerate static pages.

**Tech Stack:** Node.js 24, dependency-free `node:test`, static HTML generator, browser JavaScript, Cloudflare Worker KV API, GitHub Pages generation workflow.

## Global Constraints

- Koneko is read-only: do not log in to an edit page, submit a form, or change source listings.
- Do not modify `note/noteZh/noteEn` or `description/descriptionZh/descriptionEn`.
- Do not infer adult status, health, vaccination, microchip, temperament, or sterilization from age.
- Only `2604-02563` retains its existing source-backed `去勢済み / 已绝育 / Neutered` wording; do not generate sterilization labels for the other cats.
- Production catalogue changes use individual `PUT` requests only; `/bulk` is forbidden.
- Preserve `breederId`, `status`, `birthday`, `price`, photos, parents, and descriptions byte-for-byte across the data update.
- `featured` copy is exactly `おすすめ / Featured / 推荐` through `kitten-catalog.js`.
- The website-owned recommendation explanation appears only for `promotionTag === "featured"`.

---

### Task 1: Generate the featured detail treatment

**Files:**
- Modify: `tests/generate-site-release-safety.test.js`
- Modify: `tools/generate-site.js`

**Interfaces:**
- Consumes: `KittenCatalog.normalizePromotionTag(record.promotionTag)` and `KittenCatalog.promotionLabel(tag, lang)`.
- Produces: `featuredDetailHtml(kitten, lang) -> string`; generated detail pages with one localized `kitten-detail-featured` section and one `kitten-promotion-chip` in the status row.

- [ ] **Step 1: Write the failing generated-page behavior test**

Add this test beside the existing localized detail-introduction test:

```js
test('featured kitten details show localized recommendation context and suppress NEW', (t) => {
  const siteDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fuluck-featured-detail-'));
  copyFile(path.join(ROOT, 'kittens.html'), path.join(siteDir, 'kittens.html'));
  const generator = loadGeneratorForSite(t, siteDir);
  const kitten = {
    id: 'row-featured',
    breederId: 'featured-detail',
    breed: 'サイベリアン',
    color: 'ブルー',
    gender: '♂',
    birthday: '2025-03-09',
    price: 100000,
    status: 'available',
    photos: ['https://images.example.test/featured.jpg'],
    isNew: false,
    promotionTag: 'featured',
    promotionPriority: 0,
    papa: 'Papa',
    mama: 'Mama',
  };
  const expected = {
    ja: ['おすすめ', '月齢を重ねた子の魅力', 'ご家庭との相性をゆっくり確かめていただけます'],
    en: ['Featured', 'Why an older kitten can be a great fit', 'giving families more time to consider the fit'],
    zh: ['推荐', '月龄较大猫咪的优势', '更从容地确认它与家庭生活是否合适'],
  };

  for (const lang of ['ja', 'en', 'zh']) {
    generator.generateKittenDetailPages([kitten], [], lang);
    const prefix = lang === 'ja' ? '' : `${lang}/`;
    const detail = fs.readFileSync(path.join(siteDir, prefix, 'kittens/featured-detail.html'), 'utf8');
    assert.equal((detail.match(/class="kitten-detail-featured"/g) || []).length, 1);
    assert.match(detail, /kitten-promotion-chip[^>]*data-promotion-tag="featured"/);
    for (const literal of expected[lang]) assert.ok(detail.includes(literal), `${lang}: ${literal}`);
    assert.doesNotMatch(detail, /kit-badge-new[^>]*>NEW</);
    assert.ok(detail.indexOf('kitten-detail-table') < detail.indexOf('kitten-detail-featured'));
    assert.ok(detail.indexOf('kitten-detail-featured') < detail.indexOf('<!-- Parents -->'));
  }

  generator.generateKittenDetailPages([{ ...kitten, breederId: 'plain-detail', promotionTag: '' }], [], 'ja');
  const plain = fs.readFileSync(path.join(siteDir, 'kittens/plain-detail.html'), 'utf8');
  assert.doesNotMatch(plain, /kitten-detail-featured|data-promotion-tag="featured"/);
});
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run:

```bash
node --test --test-name-pattern="featured kitten details" tests/generate-site-release-safety.test.js
```

Expected: FAIL because generated detail HTML has neither `kitten-detail-featured` nor a detail-page promotion chip.

- [ ] **Step 3: Add the localized helper and status chip**

Add near `descriptionHtml()`:

```js
const FEATURED_DETAIL_COPY = Object.freeze({
  ja: {
    title: '月齢を重ねた子の魅力',
    body: '月齢を重ねた子は、体格や日々の過ごし方を実際に見ながら、ご家庭との相性をゆっくり確かめていただけます。現在の性格や生活リズムは、下の個体紹介をご覧ください。',
  },
  en: {
    title: 'Why an older kitten can be a great fit',
    body: 'With an older kitten, their build and daily routines are easier to observe, giving families more time to consider the fit. See the individual profile below for current details.',
  },
  zh: {
    title: '月龄较大猫咪的优势',
    body: '月龄较大的猫，体型和日常习惯更容易通过实际观察来了解，您可以更从容地确认它与家庭生活是否合适。每只猫当前的性格与生活节奏，请查看下方个体介绍。',
  },
});

function featuredDetailHtml(kitten, lang) {
  if (KittenCatalog.normalizePromotionTag(kitten && kitten.promotionTag) !== 'featured') return '';
  const selectedLang = lang === 'en' || lang === 'zh' ? lang : 'ja';
  const copy = FEATURED_DETAIL_COPY[selectedLang];
  return `
      <section class="kitten-detail-featured">
        <h2>${escapeHtml(copy.title)}</h2>
        <p>${escapeHtml(copy.body)}</p>
      </section>`;
}
```

Inside `buildKittenDetailHtml()`, normalize the promotion tag once and build the chip:

```js
const promotionTag = KittenCatalog.normalizePromotionTag(kitten.promotionTag);
const promotionChip = promotionTag
  ? ` <span class="kitten-promotion-chip usp-chip usp-chip--card" data-promotion-tag="${escapeHtml(promotionTag)}">${escapeHtml(KittenCatalog.promotionLabel(promotionTag, lang))}</span>`
  : '';
```

Append `${promotionChip}` after `${newBadge}` in `.kitten-detail-status`, and insert `${featuredDetailHtml(kitten, lang)}` after the detail table and before `${descriptionHtml(kitten, lang)}`.

Add inline detail CSS:

```css
.kitten-detail-featured {
  margin: 0 0 24px;
  padding: 18px 20px;
  border: 1px solid rgba(125, 211, 192, 0.42);
  border-radius: var(--radius-sm);
  background: rgba(240, 255, 250, 0.72);
}
.kitten-detail-featured h2 {
  margin: 0 0 8px;
  color: var(--text-main);
  font-size: 1.05rem;
}
.kitten-detail-featured p {
  margin: 0;
  color: var(--text-note-strong);
  line-height: 1.8;
}
```

- [ ] **Step 4: Run the focused test and confirm GREEN**

Run the same focused command. Expected: PASS with zero failures.

- [ ] **Step 5: Commit the generated-detail change**

```bash
git add tests/generate-site-release-safety.test.js tools/generate-site.js
git commit -m "feat: explain featured older kittens on detail pages"
```

---

### Task 2: Preserve recommendation context in the card modal

**Files:**
- Modify: `tests/public-modal-security.test.js`
- Modify: `script.js`

**Interfaces:**
- Consumes: card `data-promotion-tag`, `window.FuluckKittenCatalog.normalizePromotionTag()`, and `promotionLabel()`.
- Produces: a text-node-built `kitten-promotion-chip` in `.modal-status-row`; featured takes precedence over stale `NEW` when both are present.

- [ ] **Step 1: Extend the real modal fixture and add the failing test**

In `runMainScript()`, make the fixture carry the requested promotion and new state:

```js
promotionTag: options.promotionTag || '',
new: options.isNew === false ? 'false' : 'true',
```

Add:

```js
test('featured kitten modal shows localized recommendation instead of NEW', () => {
  for (const [lang, expected] of [['ja', 'おすすめ'], ['en', 'Featured'], ['zh', '推荐']]) {
    const result = runMainScript({ lang, promotionTag: 'featured', isNew: true });
    result.kittenCard.click();
    const status = result.kittenModal.querySelector('.modal-status-row');
    const promotion = status.querySelector('.kitten-promotion-chip');
    assert.ok(promotion, lang);
    assert.equal(promotion.textContent, expected, lang);
    assert.equal(promotion.getAttribute('data-promotion-tag'), 'featured', lang);
    assert.equal(status.querySelector('.kit-badge-new'), null, lang);
  }
});
```

This test names the break: a featured card must not reopen a modal that contradicts it with `NEW`.

- [ ] **Step 2: Run the focused modal test and confirm RED**

```bash
node --test --test-name-pattern="featured kitten modal" tests/public-modal-security.test.js
```

Expected: FAIL because `populateModalInfo()` currently ignores `data-promotion-tag` and renders `NEW`.

- [ ] **Step 3: Implement the minimal safe modal rendering**

In `populateModalInfo()` derive the locale and normalized promotion tag:

```js
const documentLang = String(document.documentElement?.lang || 'ja').toLowerCase();
const catalogLang = documentLang.startsWith('en') ? 'en' : documentLang.startsWith('zh') ? 'zh' : 'ja';
const catalog = window.FuluckKittenCatalog;
const promotionTag = catalog ? catalog.normalizePromotionTag(card.dataset.promotionTag) : '';
```

Replace the unconditional `isNew` append with featured-first behavior:

```js
if (promotionTag) {
  const promotion = createModalNode(
    'span',
    'kitten-promotion-chip usp-chip usp-chip--card',
    catalog.promotionLabel(promotionTag, catalogLang),
  );
  promotion.setAttribute('data-promotion-tag', promotionTag);
  statusRow.appendChild(promotion);
} else if (isNew) {
  statusRow.appendChild(createModalNode('span', 'kit-badge-new', 'NEW'));
}
```

All label text remains a text node; no API value enters `innerHTML`.

- [ ] **Step 4: Run the focused test and confirm GREEN**

Run the focused modal command. Expected: PASS.

- [ ] **Step 5: Commit the modal change**

```bash
git add tests/public-modal-security.test.js script.js
git commit -m "feat: keep featured status in kitten modal"
```

---

### Task 3: Verify and release the website code

**Files:**
- Verify: all tracked files
- Publish: branch `codex/older-kitten-recommendation-20260817`

**Interfaces:**
- Consumes: the two green feature commits.
- Produces: a main-branch website release containing the detail and modal treatment before production catalogue data is changed.

- [ ] **Step 1: Run the complete local quality gate**

```bash
node --test tests/*.test.js
node tools/verify-generated.js
git diff --check
```

Expected: all tests pass, verifier reports clean, diff check exits 0.

- [ ] **Step 2: Dry-run the Worker bundle**

```bash
cd api
npx --yes wrangler@4.70.0 deploy --strict --dry-run --keep-vars
```

Expected: bundle succeeds without a production deployment.

- [ ] **Step 3: Push the feature branch and open a PR**

```bash
git push -u origin codex/older-kitten-recommendation-20260817
gh pr create --base main --head codex/older-kitten-recommendation-20260817 --title "Feature older kittens without stale NEW labels" --body-file /tmp/fuluck-older-kitten-pr.md
```

The PR body must list: seven featured IDs, two reserved IDs with NEW removed, no Koneko mutation, tests run, and rollback fields.

- [ ] **Step 4: Merge only after required checks pass**

```bash
gh pr checks --watch
gh pr merge --squash --delete-branch
```

Expected: main contains the code before any website API record is changed.

---

### Task 4: Update exactly nine website catalogue records

**Files:**
- Create outside Git: timestamped production API backup in a `mktemp -d` directory
- Modify externally: Fuluck website API records only

**Interfaces:**
- Consumes: current public API, existing admin credential from `/Users/willma/.secrets/`, fresh read-only Koneko status check, and deployed featured display code.
- Produces: seven `available` records with `isNew=false`, `promotionTag=featured`, `promotionPriority=0`; two `reserved` records with `isNew=false` only.

- [ ] **Step 1: Reconcile current target status without writing Koneko**

Read the public Koneko pages or a fresh two-account snapshot and confirm the nine IDs still have the statuses frozen in the design. If any status differs, exclude that ID and record the reason; do not force the website to contradict Koneko.

- [ ] **Step 2: Create and validate a local backup**

```bash
FULUCK_BACKUP_DIR="$(mktemp -d)"
curl -fsS https://fuluck-api.mouxue56.workers.dev/api/kittens > "$FULUCK_BACKUP_DIR/kittens-before.json"
jq -e 'type == "array" and length > 0' "$FULUCK_BACKUP_DIR/kittens-before.json"
shasum -a 256 "$FULUCK_BACKUP_DIR/kittens-before.json" > "$FULUCK_BACKUP_DIR/SHA256SUMS"
```

Extract the nine targets and verify their `breederId/status/birthday/price/isNew/promotionTag/promotionPriority` values before any write.

- [ ] **Step 3: Apply individual website API updates**

Use the existing authenticated admin endpoint `PUT /api/admin/kittens/<record-id>` and send only the three approved fields for available cats:

```json
{"isNew":false,"promotionTag":"featured","promotionPriority":0}
```

Send only this field for the two reserved cats:

```json
{"isNew":false}
```

After each `PUT`, refetch `/api/kittens`, compare the target to the backup, and require all non-target fields to remain identical before continuing to the next ID.

- [ ] **Step 4: Verify the complete production data result**

Require these seven IDs to be `available + isNew=false + featured + priority 0`:

```text
2605-02526
2604-02563
2605-03613
2607-02164
2607-02167
2608-51174
2603-02736
```

Require these two IDs to retain `reserved` and have `isNew=false`:

```text
2604-03519
2603-02684
```

Require no other record to have changed.

- [ ] **Step 5: Regenerate static pages from the accepted API state**

Dispatch `.github/workflows/regenerate-site.yml` on main, wait for success, and confirm the resulting commit changes generated catalogue/detail pages only as expected.

---

### Task 5: Live multilingual acceptance and knowledge-base closeout

**Files:**
- Modify: `/Users/willma/knowledge-base/NEXT.md`
- Create: `/Users/willma/knowledge-base/50-工作日志/session-logs/2026-08-17-willbook-Fuluck较大月龄猫推荐标签上线.md`

**Interfaces:**
- Consumes: deployed main SHA, final API snapshot, generated-site workflow result, and live pages.
- Produces: evidence-backed acceptance record and rollback pointer.

- [ ] **Step 1: Verify representative live pages in three languages**

Check `2605-02526`, `2604-02563`, and `2603-02736` on Japanese, English, and Chinese detail routes. Require:

- visible recommendation chip in the correct language;
- one localized featured explanation;
- no `NEW` badge;
- unchanged price/status/birthday and source introduction;
- `2604-02563` still contains its existing neutered wording;
- other sampled cats do not gain a sterilization claim.

- [ ] **Step 2: Verify list, homepage, and modal behavior**

Confirm the seven featured cats sort into the recommendation group, the two reserved older cats show no `NEW`, and the modal shows recommendation instead of `NEW` for a featured card.

- [ ] **Step 3: Write the knowledge-base result**

Record exact IDs, deployed SHA, data backup checksum/location, workflow run, test counts, live URLs, fields changed, fields proven unchanged, and the explicit statement “Koneko 0 writes.” Update `NEXT.md` to remove this action from pending work.

- [ ] **Step 4: Close out the exact knowledge-base files**

```bash
KB_SYNC_COMMIT_MESSAGE="willbook: 上线Fuluck较大月龄猫推荐标签" \
  "/Users/willma/knowledge-base/bin/kb-agent" --owner codex closeout \
  NEXT.md \
  "50-工作日志/session-logs/2026-08-17-willbook-Fuluck较大月龄猫推荐标签上线.md"
```

Expected: knowledge-base closeout reports a pushed commit; unrelated dirty files remain untouched.

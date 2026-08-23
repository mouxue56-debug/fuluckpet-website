'use strict';

// COPY-SPEC (2026-08-23) contract. The copy rules in that spec are the kind that decay
// silently: a stale campaign line comes back through the owner's note field, a mixed
// kitten sneaks a hypoallergenic claim, a sold card keeps a NEW badge. These tests pin
// the rules to the generator's real output and to the tracked pages, so a regression
// fails here instead of shipping.

const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const Module = require('node:module');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const GENERATOR = path.join(ROOT, 'tools/generate-site.js');

// ── Sandbox ──────────────────────────────────────────────────────────────────

function loadGenerator(t, siteDir) {
  let source = fs.readFileSync(GENERATOR, 'utf8').replace(
    "const SITE_DIR = path.resolve(__dirname, '..');",
    `const SITE_DIR = ${JSON.stringify(siteDir)};`,
  );
  const mainCall = source.lastIndexOf('\nmain().catch(');
  assert.notEqual(mainCall, -1, 'generate-site.js main call boundary changed');
  source = source.slice(0, mainCall)
    + '\nmodule.exports = { generateKittens, generateKittenDetailPages };\n';
  const loaded = new Module(GENERATOR, module);
  loaded.filename = GENERATOR;
  loaded.paths = Module._nodeModulePaths(path.dirname(GENERATOR));
  loaded._compile(source, GENERATOR);
  t.after(() => fs.rmSync(siteDir, { recursive: true, force: true }));
  return loaded.exports;
}

function kitten(breederId, overrides = {}) {
  return {
    breederId,
    breed: 'サイベリアン',
    color: 'ブルー',
    gender: '♂',
    birthday: '2026-05-01',
    price: 180000,
    status: 'available',
    photos: [`https://images.example.test/${breederId}.jpg`],
    ...overrides,
  };
}

// One snapshot that exercises every branch the spec cares about.
const SNAPSHOT = [
  kitten('spec-available'),
  kitten('spec-reserved', { status: 'reserved' }),
  kitten('spec-sold', { status: 'sold', isNew: true }),
  kitten('spec-mix', { breed: 'サイベリアン&ブリティッシュショートヘア', price: 100000 }),
  kitten('spec-adult', { birthday: '2024-01-05', note: '去勢済みです。' }),
  kitten('spec-campaign', {
    note: '夏キャンペーン中につき値下げしました。人懐こい子です。\n年末年始の見学もok',
    color: 'ブラウンタビー',
  }),
];

function buildSite(t) {
  const siteDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fuluck-copy-contract-'));
  for (const relative of ['index.html', 'kittens.html']) {
    fs.copyFileSync(path.join(ROOT, relative), path.join(siteDir, relative));
  }
  const generator = loadGenerator(t, siteDir);
  for (const lang of ['ja', 'en', 'zh']) {
    generator.generateKittens(SNAPSHOT, lang);
    generator.generateKittenDetailPages(SNAPSHOT, [], lang);
  }
  const read = (relative) => fs.readFileSync(path.join(siteDir, relative), 'utf8');
  return { siteDir, read };
}

function listPath(lang) {
  return lang === 'ja' ? 'kittens.html' : `${lang}/kittens.html`;
}

function detailPath(lang, id) {
  return lang === 'ja' ? `kittens/${id}.html` : `${lang}/kittens/${id}.html`;
}

// Split a generated grid into per-card HTML. Cards with a detail page are anchors; a
// sold card has no detail page and stays a div that opens the modal.
function cards(html) {
  return html
    .split(/(?=<(?:a|div) class="kitten-card")/)
    .filter((chunk) => chunk.startsWith('<a class="kitten-card') || chunk.startsWith('<div class="kitten-card'));
}

function cardFor(html, breederId) {
  const match = cards(html).find((card) => card.includes(`data-breeder-id="${breederId}"`));
  assert.ok(match, `card for ${breederId} not found`);
  return match;
}

// ── Generated output ─────────────────────────────────────────────────────────

test('owner campaign and price-cut clauses never reach a generated page', (t) => {
  const { read } = buildSite(t);
  const banned = ['夏キャンペーン', 'キャンペーン中', '値下げ', 'セール', '年末年始の見学も'];
  for (const lang of ['ja', 'en', 'zh']) {
    for (const relative of [listPath(lang), detailPath(lang, 'spec-campaign')]) {
      const html = read(relative);
      for (const word of banned) {
        assert.ok(!html.includes(word), `${relative} still ships "${word}"`);
      }
      // The individual sentence around the stripped clause has to survive.
      assert.ok(html.includes('人懐こい子です') || lang !== 'ja', `${relative} lost the individual note`);
    }
  }
});

test('a mixed kitten never carries the hypoallergenic claim, and always gets the mix badge', (t) => {
  const { read } = buildSite(t);
  for (const lang of ['ja', 'en', 'zh']) {
    const html = read(listPath(lang));
    const mix = cardFor(html, 'spec-mix');
    assert.ok(!mix.includes('chip.hypoallergenic'), `${lang}: mix card claims lower-allergen`);
    assert.match(mix, /data-chip="mix"/, `${lang}: mix card lost its badge`);
    // A pure Siberian still gets the chip — this test must not pass by removing it.
    assert.ok(cardFor(html, 'spec-available').includes('chip.hypoallergenic'), `${lang}: pure Siberian lost the chip`);
    // §5.1 block on the mixed kitten's own page.
    assert.match(read(detailPath(lang, 'spec-mix')), /data-usp="mix"/);
    assert.ok(!read(detailPath(lang, 'spec-available')).includes('data-usp="mix"'));
  }
});

test('a cat aged 12 months or over is packaged as an adult, younger ones are not', (t) => {
  const { read } = buildSite(t);
  for (const lang of ['ja', 'en', 'zh']) {
    const html = read(listPath(lang));
    assert.match(cardFor(html, 'spec-adult'), /data-chip="adult"/, lang);
    assert.match(cardFor(html, 'spec-adult'), /data-chip="neutered"/, lang);
    assert.ok(!cardFor(html, 'spec-available').includes('data-chip="adult"'), lang);
    assert.match(read(detailPath(lang, 'spec-adult')), /data-usp="adult"/, lang);
    assert.ok(!read(detailPath(lang, 'spec-available')).includes('data-usp="adult"'), lang);
  }
});

test('a sold card shows the adoption label and never a NEW badge', (t) => {
  const { read } = buildSite(t);
  const expected = { ja: 'ご家族決定', en: 'Adopted', zh: '已找到家庭' };
  for (const lang of ['ja', 'en', 'zh']) {
    const sold = cardFor(read(listPath(lang)), 'spec-sold');
    assert.ok(!sold.includes('kit-badge-new'), `${lang}: sold card still advertises NEW`);
    assert.ok(sold.includes(expected[lang]), `${lang}: sold card lost the adoption label`);
    // A sold kitten has no detail page, so its card must not link anywhere.
    assert.ok(sold.startsWith('<div class="kitten-card'), `${lang}: sold card links to a page that is not generated`);
  }
});

test('a reserved kitten routes to the available list instead of a booking form', (t) => {
  const { read } = buildSite(t);
  const expected = {
    ja: '販売中の子猫を見る',
    en: 'See available kittens',
    zh: '查看在售猫咪',
  };
  for (const lang of ['ja', 'en', 'zh']) {
    const reserved = read(detailPath(lang, 'spec-reserved'));
    assert.ok(reserved.includes(expected[lang]), `${lang}: reserved page lost the redirect CTA`);
    assert.ok(!/booking\.html\?kitten=spec-reserved/.test(reserved), `${lang}: reserved page still offers a visit booking`);
    // The available kitten keeps its booking CTA — the assertion above must not pass
    // because booking links were removed everywhere.
    assert.match(read(detailPath(lang, 'spec-available')), /booking\.html\?kitten=spec-available/, lang);
  }
});

test('the vaccination fee is disclosed on every list and detail page', (t) => {
  const { read } = buildSite(t);
  const detail = {
    ja: '3種混合ワクチン（1回目）の接種費用として、別途10,000円（税込）を申し受けます',
    en: 'The first FVRCP (3-in-1) vaccination is charged separately at \u00a510,000 (tax included)',
    zh: '首针三联疫苗费用另计 10,000 日元（含税）',
  };
  for (const lang of ['ja', 'en', 'zh']) {
    assert.match(read(listPath(lang)), /class="kit-vaccine-note"/, `${lang}: list page lost the vaccine note`);
    for (const id of ['spec-available', 'spec-reserved', 'spec-mix']) {
      assert.ok(
        read(detailPath(lang, id)).includes(detail[lang]),
        `${lang}/${id}: detail page lost the vaccination-fee sentence`,
      );
    }
  }
});

test('generated pages publish the viewing address instead of withholding it', (t) => {
  const { read } = buildSite(t);
  for (const lang of ['ja', 'en', 'zh']) {
    const html = read(detailPath(lang, 'spec-available'));
    assert.ok(html.includes('2-6-23'), `${lang}: detail page lost the public viewing address`);
    for (const withheld of ['詳細な住所', '詳細住所', '11:00~16:00']) {
      assert.ok(!html.includes(withheld), `${lang}: detail page still says "${withheld}"`);
    }
  }
});

// ── Tracked pages ────────────────────────────────────────────────────────────

function tracked(...globs) {
  return childProcess.execFileSync('git', ['ls-files', ...globs], {
    cwd: ROOT,
    encoding: 'utf8',
  }).trim().split('\n').filter(Boolean);
}

function trackedHtml() {
  return tracked('*.html', '*.txt', '*.xml');
}

test('no tracked page uses the retired Siberian spelling or the old allergen claim', () => {
  // 'サイベリアン' does not contain the retired spelling, so this scan stays exact. The
  // retired spelling and the retired allergen claims are built from escapes on purpose:
  // this file is tracked too, and a literal here would make the scan flag itself.
  const RETIRED = String.fromCharCode(0x30b7, 0x30d9, 0x30ea, 0x30a2, 0x30f3);
  const banned = [
    RETIRED,
    `${String.fromCharCode(0x4f4e)}${String.fromCharCode(0x30a2, 0x30ec, 0x30eb, 0x30b2, 0x30f3)}${String.fromCharCode(0x306e)}${RETIRED}`,
    `Hypoallergenic${String.fromCharCode(0x20)}Siberian`,
    String.fromCharCode(0x4f4e, 0x81f4, 0x654f, 0x897f, 0x4f2f, 0x5229, 0x4e9a, 0x732b),
    String.fromCharCode(0x30a2, 0x30ec, 0x30eb, 0x30ae, 0x306b, 0x3064, 0x3044, 0x3066),
  ];
  const offenders = [];
  // Dictionaries and generator tables can reintroduce the old spelling just as easily as
  // a page can, so the scan covers tracked scripts and data too.
  for (const relative of tracked('*.html', '*.txt', '*.xml', '*.js', '*.json')) {
    const source = fs.readFileSync(path.join(ROOT, relative), 'utf8');
    for (const word of banned) {
      if (source.includes(word)) offenders.push(`${relative}: ${word}`);
    }
  }
  assert.deepEqual(offenders, []);
});

test('Ragdoll appears on merchandising surfaces only as a past record', () => {
  // Breed-encyclopedia articles under /blog/ are editorial content about the breed and
  // are out of scope; this guards the pages that sell, list or describe the cattery.
  const surfaces = trackedHtml().filter((relative) => (
    !relative.startsWith('blog/')
    && !relative.startsWith('en/blog/')
    && !relative.startsWith('zh/blog/')
    && !relative.startsWith('admin/')
    && relative !== 'blog.html'
    && relative !== 'feed.xml'
  ));
  // Wording that presents the breed as something a visitor can buy today.
  const OFFERS = [
    /ラグドール[^。\n]{0,12}(?:も)?(?:取り扱|販売|お迎えいただけ|ご用意)/,
    /ラグドールの子猫/,
    /布偶猫[^。\n]{0,12}(?:在售|出售|可预订)/,
    /Ragdolls?[^.\n]{0,40}(?:available|for sale|we breed)/i,
  ];
  const PAST = /過去|過往|已不再繁育|no longer breed|past breeding/;
  const offenders = [];
  for (const relative of surfaces) {
    const source = fs.readFileSync(path.join(ROOT, relative), 'utf8');
    if (!/ラグドール|布偶|Ragdoll/i.test(source)) continue;
    for (const offer of OFFERS) {
      const hit = source.match(offer);
      if (hit) offenders.push(`${relative}: offers the breed — ${hit[0].slice(0, 80)}`);
    }
    // A surface that names the breed at all has to say somewhere that it is history.
    if (/ラグドール|布偶猫/.test(source) && !PAST.test(source)) {
      offenders.push(`${relative}: names the breed with no past-record framing`);
    }
    // §1 — never in the indexable summary of a page.
    const head = source.slice(0, source.indexOf('</head>') + 1 || source.length);
    for (const tag of head.match(/<title>[^<]*<\/title>|<meta\b[^>]*>/gi) || []) {
      if (!/ラグドール|布偶猫|Ragdoll/i.test(tag)) continue;
      if (!/name=["'](?:keywords)["']/i.test(tag) && PAST.test(tag)) continue;
      offenders.push(`${relative}: head tag names the breed — ${tag.slice(0, 90)}`);
    }
  }
  assert.deepEqual(offenders, []);
});

test('every public footer carries the six-item animal-handling display', () => {
  const required = [
    '登録番号: 販売 220012A／保管 220012B／貸出し 220012C／展示 220012E',
    '登録年月日: 2022年4月27日',
    '有効期間の末日: 2027年4月26日',
    '動物取扱責任者: 羅 方遠',
    '登録番号: 販売 240051A',
    '有効期間の末日: 2029年7月16日',
    '動物取扱責任者: 刘 暁棉',
    '/about.html#registration',
  ];
  const offenders = [];
  for (const relative of trackedHtml().filter((name) => name.endsWith('.html'))) {
    const source = fs.readFileSync(path.join(ROOT, relative), 'utf8');
    if (!source.includes('class="footer-legal"')) continue;
    for (const line of required) {
      if (!source.includes(line)) offenders.push(`${relative}: missing ${line}`);
    }
    // The superseded shape must not survive anywhere.
    if (source.includes('有効期限: ~')) offenders.push(`${relative}: legacy 有効期限 line`);
    if (source.includes('代表: 刘 暁棉')) offenders.push(`${relative}: 代表 instead of 動物取扱責任者`);
  }
  assert.deepEqual(offenders, []);
});

test('the client renderer mirrors the generator card and heading contract', () => {
  // card-loader.js repaints the same grid the generator baked. When the two drift, the
  // §6.3 filter bar silently stops matching cards and the §11 heading changes shape on
  // hydration — both are invisible in a screenshot and obvious to a shopper.
  const loader = fs.readFileSync(path.join(ROOT, 'card-loader.js'), 'utf8');
  const generator = fs.readFileSync(GENERATOR, 'utf8');
  assert.match(loader, /function listEntryGroup\(/);
  assert.match(loader, /data-entry-group="/);
  assert.match(generator, /data-entry-group="\$\{entryGroup\}"/);
  assert.match(loader, /cardTag = cardRole === 'link' \? 'a' : 'div'/);
  assert.match(generator, /const cardTag = detailEligible \? 'a' : 'div'/);
  for (const phrase of ['販売中 ', '匹（全 ', 'Available ', ' (of ', '在售 ', ' 只（共 ']) {
    assert.ok(loader.includes(phrase), `card-loader.js heading lost "${phrase}"`);
    assert.ok(generator.includes(phrase), `generate-site.js heading lost "${phrase}"`);
  }
});

test('an anchor catalogue card is left to the browser instead of navigated twice', () => {
  // Cards with a detail page are <a href>. Re-navigating from JS breaks ⌘-click and
  // middle-click; preventing the default Enter would break the keyboard path entirely.
  const runtime = fs.readFileSync(path.join(ROOT, 'script.js'), 'utf8');
  assert.match(runtime, /function isNativeLinkCard\(/);
  assert.match(runtime, /if \(isNativeLinkCard\(card\)\) return;/);
  assert.match(runtime, /if \(nativeLink && event\.key === 'Enter'\) return;/);
});

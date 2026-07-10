const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');

const ROOT = path.resolve(__dirname, '..');
const GENERATOR_PATH = path.join(ROOT, 'tools', 'generate-site.js');
const LAUNCH_CONFIG_PATH = path.join(ROOT, 'small-animals-launch.json');
const DARK_SLUG = 'test-dark-preview';
const ROBOTS_SHA256 = 'ebdbec23936ea4c17e7082b72a975b74725046199452805d13ae3ca8084eeac0';

function loadGeneratorInternals({ publicLaunch = false, siteDir = null, darkSlug = DARK_SLUG } = {}) {
  let source = fs.readFileSync(GENERATOR_PATH, 'utf8');
  if (publicLaunch) {
    source = source.replace(
      '  public: launchConfig.public === true,',
      '  public: true,',
    );
  }
  if (siteDir) {
    source = source.replace(
      "const SITE_DIR = path.resolve(__dirname, '..');",
      `const SITE_DIR = ${JSON.stringify(siteDir)};`,
    );
  }
  const mainCall = source.lastIndexOf('\nmain().catch(');
  assert.notEqual(mainCall, -1, 'generator main call boundary must remain discoverable');

  const instrumented = `${source.slice(0, mainCall)}
module.exports = {
  SMALL_ANIMALS_LAUNCH,
  SPECIES_CONFIG,
  SPECIES_MAP,
  SMALL_ANIMAL_BREED_MAP,
  SMALL_ANIMAL_COLOR_MAP,
  buildSmallAnimalListHtml,
  buildSmallAnimalDetailHtml,
  requireSmallAnimalDataForLaunch,
  removePublicSmallAnimalOutput: typeof removePublicSmallAnimalOutput === 'function'
    ? removePublicSmallAnimalOutput
    : undefined,
  generateSmallAnimals,
  generateSmallAnimalDetailPages,
  updateSitemap,
};
`;
  const loaded = new Module(GENERATOR_PATH, module);
  loaded.filename = GENERATOR_PATH;
  loaded.paths = Module._nodeModulePaths(path.dirname(GENERATOR_PATH));
  const previousSlug = process.env.SMALL_ANIMALS_DARK_SLUG;
  if (darkSlug) process.env.SMALL_ANIMALS_DARK_SLUG = darkSlug;
  else delete process.env.SMALL_ANIMALS_DARK_SLUG;
  try {
    loaded._compile(instrumented, GENERATOR_PATH);
  } finally {
    if (previousSlug === undefined) delete process.env.SMALL_ANIMALS_DARK_SLUG;
    else process.env.SMALL_ANIMALS_DARK_SLUG = previousSlug;
  }
  return loaded.exports;
}

function listHtmlTree(absDir = ROOT, relDir = '') {
  const skipDirs = new Set(['.git', '.private-preview', '.superpowers', 'node_modules']);
  const pages = [];
  for (const entry of fs.readdirSync(absDir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!skipDirs.has(entry.name)) {
        pages.push(...listHtmlTree(path.join(absDir, entry.name), path.join(relDir, entry.name)));
      }
    } else if (entry.isFile() && entry.name.endsWith('.html')) {
      pages.push(path.join(relDir, entry.name).split(path.sep).join('/'));
    }
  }
  return pages;
}

function isSmallAnimalPage(rel) {
  return rel === `${DARK_SLUG}.html`
    || rel === `en/${DARK_SLUG}.html`
    || rel === `zh/${DARK_SLUG}.html`
    || rel.startsWith(`${DARK_SLUG}/`)
    || rel.startsWith(`en/${DARK_SLUG}/`)
    || rel.startsWith(`zh/${DARK_SLUG}/`);
}

function assertDarkHead(html, lang, detailId = '') {
  const page = detailId ? `${DARK_SLUG}/${detailId}.html` : `${DARK_SLUG}.html`;
  const selfPrefix = lang === 'ja' ? '' : `${lang}/`;
  const rel = `.private-preview/${selfPrefix}${page}`;
  const jaRel = `.private-preview/${page}`;
  assert.match(html, new RegExp(`<html lang="${lang}">`));
  assert.match(html, /<meta name="robots" content="noindex,nofollow">/);
  assert.match(html, new RegExp(`rel="canonical" href="https://fuluckpet\\.com/${rel.replaceAll('.', '\\.')}`));
  assert.match(html, new RegExp(`hreflang="ja" href="https://fuluckpet\\.com/${jaRel.replaceAll('.', '\\.')}`));
  assert.match(html, new RegExp(`hreflang="en" href="https://fuluckpet\\.com/.private-preview/en/${page.replaceAll('.', '\\.')}`));
  assert.match(html, new RegExp(`hreflang="zh" href="https://fuluckpet\\.com/.private-preview/zh/${page.replaceAll('.', '\\.')}`));
  assert.match(html, new RegExp(`hreflang="x-default" href="https://fuluckpet\\.com/${jaRel.replaceAll('.', '\\.')}`));
  assert.doesNotMatch(html, /"@type"\s*:\s*"(?:Product|BreadcrumbList)"/);
}

test('launch config and dictionaries are the bound dark-launch values', () => {
  const source = fs.readFileSync(GENERATOR_PATH, 'utf8');
  const launchConfig = JSON.parse(fs.readFileSync(LAUNCH_CONFIG_PATH, 'utf8'));
  const generator = loadGeneratorInternals();
  assert.deepEqual(launchConfig, { public: false, slugPublic: 'small-animals' });
  assert.match(source, /process\.env\.SMALL_ANIMALS_DARK_SLUG/);
  assert.doesNotMatch(source, /slugDark\s*:\s*['"]/);
  assert.deepEqual(
    JSON.parse(JSON.stringify(generator.SMALL_ANIMALS_LAUNCH)),
    { public: false, slugDark: DARK_SLUG, slugPublic: 'small-animals' },
  );
  assert.equal(generator.SPECIES_CONFIG.length, 1);
  assert.equal(generator.SPECIES_CONFIG[0].species, 'rabbit');
  assert.deepEqual(
    JSON.parse(JSON.stringify(generator.SPECIES_MAP)),
    { 'ウサギ': { en: 'Rabbit', zh: '兔' } },
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(generator.SMALL_ANIMAL_BREED_MAP)),
    { 'ネザーランドドワーフ': { en: 'Netherland Dwarf', zh: '荷兰侏儒兔' } },
  );
  assert.deepEqual(JSON.parse(JSON.stringify(generator.SMALL_ANIMAL_COLOR_MAP)), {});
});

test('private preview rejects an unsafe environment slug before any path use', () => {
  assert.throws(
    () => loadGeneratorInternals({ darkSlug: '../escape' }),
    /single URL-safe segment/,
  );
});

test('public generation fails closed when its catalogue fetch is unavailable', () => {
  const publicGenerator = loadGeneratorInternals({ publicLaunch: true, darkSlug: '' });
  assert.throws(
    () => publicGenerator.requireSmallAnimalDataForLaunch(null),
    /public launch requires a valid small-animal array/,
  );

  const darkGenerator = loadGeneratorInternals();
  assert.doesNotThrow(() => darkGenerator.requireSmallAnimalDataForLaunch(null));
});

test('empty list builder emits an honest trilingual dark page', () => {
  const generator = loadGeneratorInternals();
  const emptyCopy = {
    ja: '現在、掲載中の小動物はいません。',
    en: 'There are currently no small animals listed.',
    zh: '目前没有在售小动物。',
  };

  for (const lang of ['ja', 'en', 'zh']) {
    const html = generator.buildSmallAnimalListHtml([], '<header>safe chrome</header>', '<footer>safe chrome</footer>', lang);
    assertDarkHead(html, lang);
    assert.match(html, new RegExp(emptyCopy[lang].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.match(html, /<header>safe chrome<\/header>/);
    assert.match(html, /<footer>safe chrome<\/footer>/);
    assert.doesNotMatch(html, /TODO\(owner\)|&yen;0|NaN/);
  }
});

test('detail builder keeps dark policy and omits cat-parent fields', () => {
  const generator = loadGeneratorInternals();
  const animal = {
    breederId: 'TEST-SA-000',
    species: 'rabbit',
    breed: 'ネザーランドドワーフ',
    color: '',
    gender: '♀',
    price: 180000,
    status: 'available',
    birthday: '2026-05',
    photos: ['https://example.invalid/rabbit.jpg'],
    coverIndex: 0,
    papa: 'must never render',
    mama: 'must never render',
  };

  const expectedBreed = {
    ja: 'ネザーランドドワーフ',
    en: 'Netherland Dwarf',
    zh: '荷兰侏儒兔',
  };
  const expectedSpecies = { ja: 'ウサギ', en: 'Rabbit', zh: '兔' };

  for (const lang of ['ja', 'en', 'zh']) {
    const html = generator.buildSmallAnimalDetailHtml(animal, '<header>safe chrome</header>', '<footer>safe chrome</footer>', lang);
    assertDarkHead(html, lang, animal.breederId);
    assert.match(html, new RegExp(expectedBreed[lang]));
    assert.match(html, new RegExp(expectedSpecies[lang]));
    assert.doesNotMatch(html, /must never render|data-papa|data-mama/);
    assert.match(html, /loading="eager" fetchpriority="high"/);
  }
});

test('unconfirmed small-animal gender stays valid and is rendered honestly in every language', () => {
  const generator = loadGeneratorInternals();
  const animal = {
    breederId: 'TEST-SA-UNKNOWN',
    species: 'rabbit',
    breed: 'ネザーランドドワーフ',
    gender: 'unknown',
    status: 'available',
    photos: ['https://example.invalid/rabbit.jpg'],
  };
  const labels = { ja: '未確認', en: 'Not confirmed', zh: '未确认' };
  for (const lang of ['ja', 'en', 'zh']) {
    const html = generator.buildSmallAnimalDetailHtml(animal, '<header></header>', '<footer></footer>', lang);
    assert.match(html, new RegExp(labels[lang]));
    assert.doesNotMatch(html, />unknown</);
  }
});

test('zero or fractional small-animal prices never become free-sale UI or Product offers', () => {
  const generator = loadGeneratorInternals({ publicLaunch: true, darkSlug: '' });
  for (const [index, price] of [0, 1.5, true, [88000], {}].entries()) {
    const animal = {
      breederId: `TEST-SA-PRICE-${index}`,
      species: 'rabbit',
      breed: 'ネザーランドドワーフ',
      gender: 'unknown',
      status: 'available',
      price,
      photos: ['https://example.invalid/rabbit.jpg'],
    };
    const list = generator.buildSmallAnimalListHtml([animal], '<header></header>', '<footer></footer>', 'ja');
    const detail = generator.buildSmallAnimalDetailHtml(animal, '<header></header>', '<footer></footer>', 'ja');
    assert.doesNotMatch(list, /&yen;/);
    assert.doesNotMatch(detail, /&yen;/);
    assert.doesNotMatch(detail, /"@type"\s*:\s*"Offer"/);
  }
});

test('fake dark token is absent from sitemap and every tracked site HTML page', () => {
  const sitemap = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
  assert.doesNotMatch(sitemap, new RegExp(DARK_SLUG));

  const leaks = [];
  for (const rel of listHtmlTree()) {
    if (isSmallAnimalPage(rel)) continue;
    const html = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    if (html.includes(DARK_SLUG)) leaks.push(rel);
  }
  assert.deepEqual(leaks, []);
});

test('robots.txt remains byte-policy locked and does not disclose the dark slug', () => {
  const robots = fs.readFileSync(path.join(ROOT, 'robots.txt'));
  assert.equal(crypto.createHash('sha256').update(robots).digest('hex'), ROBOTS_SHA256);
  assert.doesNotMatch(robots.toString('utf8'), new RegExp(DARK_SLUG));
});

test('the single public flag enables navigation and structured data while removing noindex', () => {
  const generator = loadGeneratorInternals({ publicLaunch: true, darkSlug: '' });
  const animal = {
    breederId: 'TEST-SA-000',
    species: 'rabbit',
    breed: 'ネザーランドドワーフ',
    color: '',
    gender: '♀',
    price: 180000,
    status: 'available',
    birthday: '2026-05',
    photos: ['https://example.invalid/rabbit.jpg'],
  };
  const sharedHeader = `<header>
    <nav class="nav-links"><a href="/kittens.html">子猫一覧</a></nav>
    <nav class="mobile-nav"><a href="/kittens.html">子猫一覧</a></nav>
  </header>`;

  const listHtml = generator.buildSmallAnimalListHtml([], sharedHeader, '<footer></footer>', 'ja');
  assert.doesNotMatch(listHtml, /noindex/);
  assert.equal((listHtml.match(/href="\/small-animals\.html"/g) || []).length, 2);
  assert.match(listHtml, />小動物一覧<\/a>/);

  const detailHtml = generator.buildSmallAnimalDetailHtml(animal, sharedHeader, '<footer></footer>', 'ja');
  assert.doesNotMatch(detailHtml, /noindex/);
  assert.match(detailHtml, /"@type"\s*:\s*"Product"/);
  assert.match(detailHtml, /"@type"\s*:\s*"BreadcrumbList"/);
  assert.match(detailHtml, /https:\/\/fuluckpet\.com\/small-animals\/TEST-SA-000\.html/);
});

test('public generation without a private env slug cannot delete the site root', (t) => {
  const siteDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fuluck-small-animal-safe-root-'));
  t.after(() => fs.rmSync(siteDir, { recursive: true, force: true }));
  fs.copyFileSync(path.join(ROOT, 'kittens.html'), path.join(siteDir, 'kittens.html'));
  fs.writeFileSync(path.join(siteDir, 'sentinel.txt'), 'must survive\n', 'utf8');

  const generator = loadGeneratorInternals({ publicLaunch: true, siteDir, darkSlug: '' });
  generator.generateSmallAnimals([], 'ja');
  generator.generateSmallAnimalDetailPages([], 'ja');

  assert.equal(fs.readFileSync(path.join(siteDir, 'sentinel.txt'), 'utf8'), 'must survive\n');
  assert.equal(fs.existsSync(path.join(siteDir, 'small-animals.html')), true);
  assert.equal(fs.existsSync(path.join(siteDir, 'small-animals')), true);
});

test('private generation stays under the ignored preview root and never logs its token', (t) => {
  const siteDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fuluck-small-animal-private-root-'));
  t.after(() => fs.rmSync(siteDir, { recursive: true, force: true }));
  fs.copyFileSync(path.join(ROOT, 'kittens.html'), path.join(siteDir, 'kittens.html'));
  for (const rel of [
    'small-animals.html',
    'small-animals/STALE.html',
    'en/small-animals.html',
    'en/small-animals/STALE.html',
    'zh/small-animals.html',
    'zh/small-animals/STALE.html',
  ]) {
    const target = path.join(siteDir, rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, 'stale public output\n', 'utf8');
  }
  const animal = {
    breederId: 'TEST-SA-PRIVATE',
    species: 'rabbit',
    breed: 'ネザーランドドワーフ',
    gender: '♀',
    status: 'available',
    photos: ['https://example.invalid/rabbit.jpg'],
  };
  const generator = loadGeneratorInternals({ siteDir });
  const logs = [];
  const originalLog = console.log;
  console.log = (...args) => logs.push(args.join(' '));
  try {
    for (const lang of ['ja', 'en', 'zh']) {
      generator.generateSmallAnimals([animal], lang);
      generator.generateSmallAnimalDetailPages([animal], lang);
    }
  } finally {
    console.log = originalLog;
  }

  for (const prefix of ['', 'en/', 'zh/']) {
    assert.equal(fs.existsSync(path.join(siteDir, '.private-preview', prefix, `${DARK_SLUG}.html`)), true);
    assert.equal(fs.existsSync(path.join(siteDir, '.private-preview', prefix, DARK_SLUG, `${animal.breederId}.html`)), true);
    assert.equal(fs.existsSync(path.join(siteDir, prefix, 'small-animals.html')), false, 'dark rollback removes the public list');
    assert.equal(fs.existsSync(path.join(siteDir, prefix, 'small-animals')), false, 'dark rollback removes public details');
    assert.equal(fs.existsSync(path.join(siteDir, prefix, `${DARK_SLUG}.html`)), false, 'token output never lands in the tracked tree');
  }
  assert.match(logs.join('\n'), /\[private preview\]/);
  assert.doesNotMatch(logs.join('\n'), new RegExp(DARK_SLUG));
  assert.match(fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8'), /^\.private-preview\/$/m);
});

test('public launch removes stale private-preview and known legacy dark paths', (t) => {
  const siteDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fuluck-small-animal-public-rollback-'));
  t.after(() => fs.rmSync(siteDir, { recursive: true, force: true }));
  fs.copyFileSync(path.join(ROOT, 'kittens.html'), path.join(siteDir, 'kittens.html'));
  for (const rel of [
    `.private-preview/${DARK_SLUG}.html`,
    `.private-preview/${DARK_SLUG}/STALE.html`,
    `.private-preview/en/${DARK_SLUG}.html`,
    `.private-preview/zh/${DARK_SLUG}.html`,
    `${DARK_SLUG}.html`,
    `${DARK_SLUG}/STALE.html`,
    `en/${DARK_SLUG}.html`,
    `en/${DARK_SLUG}/STALE.html`,
    `zh/${DARK_SLUG}.html`,
    `zh/${DARK_SLUG}/STALE.html`,
  ]) {
    const target = path.join(siteDir, rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, 'stale private output\n', 'utf8');
  }
  const generator = loadGeneratorInternals({ publicLaunch: true, siteDir, darkSlug: DARK_SLUG });
  for (const lang of ['ja', 'en', 'zh']) {
    generator.generateSmallAnimals([], lang);
    generator.generateSmallAnimalDetailPages([], lang);
  }

  assert.equal(fs.existsSync(path.join(siteDir, '.private-preview')), false);
  for (const prefix of ['', 'en/', 'zh/']) {
    assert.equal(fs.existsSync(path.join(siteDir, prefix, `${DARK_SLUG}.html`)), false);
    assert.equal(fs.existsSync(path.join(siteDir, prefix, DARK_SLUG)), false);
    assert.equal(fs.existsSync(path.join(siteDir, prefix, 'small-animals.html')), true);
    assert.equal(fs.existsSync(path.join(siteDir, prefix, 'small-animals')), true);
  }
});

test('private rollback without a secret still removes every formal public output', (t) => {
  const siteDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fuluck-small-animal-no-secret-rollback-'));
  t.after(() => fs.rmSync(siteDir, { recursive: true, force: true }));
  for (const rel of [
    'small-animals.html',
    'small-animals/STALE.html',
    'en/small-animals.html',
    'en/small-animals/STALE.html',
    'zh/small-animals.html',
    'zh/small-animals/STALE.html',
    '.private-preview/keep-local.html',
  ]) {
    const target = path.join(siteDir, rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, 'stale output\n', 'utf8');
  }
  const generator = loadGeneratorInternals({ siteDir, darkSlug: '' });

  assert.equal(typeof generator.removePublicSmallAnimalOutput, 'function', 'rollback cleanup must be available without a secret slug');
  generator.removePublicSmallAnimalOutput();

  for (const prefix of ['', 'en/', 'zh/']) {
    assert.equal(fs.existsSync(path.join(siteDir, prefix, 'small-animals.html')), false);
    assert.equal(fs.existsSync(path.join(siteDir, prefix, 'small-animals')), false);
  }
  assert.equal(fs.existsSync(path.join(siteDir, '.private-preview/keep-local.html')), true);
  assert.match(
    fs.readFileSync(GENERATOR_PATH, 'utf8'),
    /else if \(!SMALL_ANIMALS_LAUNCH\.public && !SMALL_ANIMALS_LAUNCH\.slugDark\) \{\s*removePublicSmallAnimalOutput\(\)/,
  );
});

test('public JSON-LD cannot be terminated by stored catalogue strings', () => {
  const generator = loadGeneratorInternals({ publicLaunch: true, darkSlug: '' });
  const payload = '</script><script>globalThis.pwned=true</script>';
  const html = generator.buildSmallAnimalDetailHtml({
    breederId: 'TEST-SA-XSS',
    species: 'rabbit',
    breed: payload,
    gender: '♀',
    status: 'available',
    photos: [`https://example.invalid/${payload}`],
  }, '<header></header>', '<footer></footer>', 'ja');

  assert.doesNotMatch(html, /<\/script><script>globalThis\.pwned=true<\/script>/);
  assert.match(html, /\\u003c\/script\\u003e\\u003cscript\\u003eglobalThis\.pwned=true\\u003c\/script\\u003e/);
});

test('navigation injection replaces stale language links and dark rollback removes them', () => {
  const stalePublicHeader = `<header>
    <nav class="nav-links"><a href="/small-animals.html" class="nav-link" data-small-animal-nav>小動物一覧</a></nav>
    <nav class="mobile-nav"><a href="/small-animals.html" class="mobile-nav-link" data-small-animal-nav>小動物一覧</a></nav>
  </header>`;

  const publicGenerator = loadGeneratorInternals({ publicLaunch: true, darkSlug: '' });
  const publicEn = publicGenerator.buildSmallAnimalListHtml([], stalePublicHeader, '<footer></footer>', 'en');
  assert.equal((publicEn.match(/href="\/en\/small-animals\.html"/g) || []).length, 2);
  assert.doesNotMatch(publicEn, /href="\/small-animals\.html"/);

  const darkGenerator = loadGeneratorInternals();
  const rolledBack = darkGenerator.buildSmallAnimalListHtml([], stalePublicHeader, '<footer></footer>', 'ja');
  assert.doesNotMatch(rolledBack, /small-animals\.html|data-small-animal-nav/);
});

test('the single public flag registers trilingual list and eligible detail URLs in sitemap', (t) => {
  const siteDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fuluck-small-animal-public-'));
  t.after(() => fs.rmSync(siteDir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(siteDir, 'en'), { recursive: true });
  fs.mkdirSync(path.join(siteDir, 'zh'), { recursive: true });
  for (const rel of ['small-animals.html', 'en/small-animals.html', 'zh/small-animals.html']) {
    fs.writeFileSync(path.join(siteDir, rel), '<!doctype html>\n', 'utf8');
  }
  fs.writeFileSync(path.join(siteDir, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <!-- 成長日記 -->
  <!-- /成長日記 -->
  <!-- 子猫詳細ページ -->
  <!-- ブログ記事 -->
</urlset>
`, 'utf8');

  const generator = loadGeneratorInternals({ publicLaunch: true, siteDir, darkSlug: '' });
  const animal = {
    breederId: 'TEST-SA-000',
    species: 'rabbit',
    breed: 'ネザーランドドワーフ',
    gender: '♀',
    price: 180000,
    status: 'available',
    photos: ['https://example.invalid/rabbit.jpg'],
  };
  const store = { lastmodForUrl: () => '2026-07-10', save: () => {} };
  generator.updateSitemap([], [], store, [animal]);

  const sitemap = fs.readFileSync(path.join(siteDir, 'sitemap.xml'), 'utf8');
  const expected = [
    'https://fuluckpet.com/small-animals.html',
    'https://fuluckpet.com/en/small-animals.html',
    'https://fuluckpet.com/zh/small-animals.html',
    'https://fuluckpet.com/small-animals/TEST-SA-000.html',
    'https://fuluckpet.com/en/small-animals/TEST-SA-000.html',
    'https://fuluckpet.com/zh/small-animals/TEST-SA-000.html',
  ];
  for (const loc of expected) assert.match(sitemap, new RegExp(`<loc>${loc.replaceAll('.', '\\.')}</loc>`));
  assert.match(sitemap, /<!-- 小動物一覧ページ \(ja\/en\/zh\) -->/);
  assert.match(sitemap, /<!-- 小動物詳細ページ -->/);
  assert.doesNotMatch(sitemap, /^\s*小動物(?:一覧|詳細)ページ/m);
});

test('public sitemap preserves its last good small-animal section when the API is unavailable', (t) => {
  const siteDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fuluck-small-animal-preserve-'));
  t.after(() => fs.rmSync(siteDir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(siteDir, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <!-- 子猫詳細ページ -->
  <!-- 小動物一覧ページ (ja/en/zh) -->
  <url><loc>https://fuluckpet.com/small-animals.html</loc></url>
  <!-- 小動物詳細ページ -->
  <url><loc>https://fuluckpet.com/small-animals/LAST-GOOD.html</loc></url>
  <!-- ブログ記事 -->
</urlset>
`, 'utf8');

  const generator = loadGeneratorInternals({ publicLaunch: true, siteDir, darkSlug: '' });
  const store = { lastmodForUrl: () => '2026-07-10', save: () => {} };
  generator.updateSitemap([], [], store, null);

  const sitemap = fs.readFileSync(path.join(siteDir, 'sitemap.xml'), 'utf8');
  assert.match(sitemap, /https:\/\/fuluckpet\.com\/small-animals\.html/);
  assert.match(sitemap, /https:\/\/fuluckpet\.com\/small-animals\/LAST-GOOD\.html/);
});

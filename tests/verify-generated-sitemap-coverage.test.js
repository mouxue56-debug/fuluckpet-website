'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const PROJECT = path.resolve(__dirname, '..');

function createVerifierSite(t) {
  const siteDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fuluck-verify-sitemap-'));
  t.after(() => fs.rmSync(siteDir, { recursive: true, force: true }));

  fs.mkdirSync(path.join(siteDir, 'tools'), { recursive: true });
  fs.copyFileSync(
    path.join(PROJECT, 'tools/verify-generated.js'),
    path.join(siteDir, 'tools/verify-generated.js'),
  );
  const robotsMeta = path.join(PROJECT, 'tools/robots-meta.js');
  if (fs.existsSync(robotsMeta)) {
    fs.copyFileSync(robotsMeta, path.join(siteDir, 'tools/robots-meta.js'));
  }

  fs.writeFileSync(path.join(siteDir, 'kittens.html'), `<!doctype html>
<link rel="stylesheet" href="/style.css?v=test">
<link rel="stylesheet" href="/nav.css?v=test">
<script src="/i18n.js?v=test"></script>
<script src="/nav.js?v=test"></script>
<a class="skip-link" href="#main">Skip</a><main id="main"></main>
<!-- Generated kitten ItemList -->
<script type="application/ld+json">{"@context":"https://schema.org","@type":"ItemList","@id":"https://fuluckpet.com/kittens.html#kitten-list","name":"Kittens","numberOfItems":0,"itemListElement":[]}</script>
`, 'utf8');
  return siteDir;
}

function write(siteDir, rel, content) {
  const target = path.join(siteDir, rel);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, 'utf8');
}

function runVerifier(siteDir) {
  return spawnSync(process.execPath, [path.join(siteDir, 'tools/verify-generated.js')], {
    encoding: 'utf8',
  });
}

function validOffer(relative) {
  return {
    '@type': 'Offer',
    url: `https://fuluckpet.com/${relative}`,
    seller: { '@id': 'https://fuluckpet.com/#cattery' },
  };
}

function validProduct(relative) {
  return {
    '@type': 'Product',
    '@id': `https://fuluckpet.com/kittens/${path.basename(relative)}#product`,
    offers: validOffer(relative),
  };
}

function runDetailSchemaMutation(t, relative, { priced = true, entities }) {
  const siteDir = createVerifierSite(t);
  const scripts = entities.map((entity) =>
    `<script type="application/ld+json">${JSON.stringify(entity)}</script>`).join('\n');
  write(siteDir, relative, `<!doctype html>
<link rel="canonical" href="https://fuluckpet.com/${relative}">
<link rel="stylesheet" href="/style.css?v=test"><link rel="stylesheet" href="/nav.css?v=test">
<script src="/i18n.js?v=test"></script><script src="/nav.js?v=test"></script>
<a class="skip-link" href="#main">Skip</a><main id="main">
<p class="kitten-detail-price">${priced ? '&yen;180,000' : '価格はお問い合わせください'}</p>
${scripts}
</main>
`);
  write(siteDir, 'sitemap.xml', `<?xml version="1.0"?>
<urlset>
  <url><loc>https://fuluckpet.com/kittens.html</loc></url>
  <url><loc>https://fuluckpet.com/${relative}</loc></url>
${ALL_MARKERS}
</urlset>
`);
  return runVerifier(siteDir);
}

const ALL_MARKERS = `  <!-- 成長日記 -->
  <!-- /成長日記 -->
  <!-- 子猫詳細ページ -->
  <!-- ブログ記事 -->`;

test('verify-generated rejects a sitemap that lost generated sections and disk pages', (t) => {
  const siteDir = createVerifierSite(t);
  write(siteDir, 'blog/health.html', '<!doctype html><title>Health</title>\n');
  fs.writeFileSync(path.join(siteDir, 'sitemap.xml'), `<?xml version="1.0"?>
<urlset>
  <url><loc>https://fuluckpet.com/</loc></url>
  <!-- 成長日記 -->
  <url><loc>https://fuluckpet.com/diary/</loc></url>
</urlset>
`, 'utf8');

  const result = runVerifier(siteDir);

  assert.equal(result.status, 1, `expected integrity failure, got stdout: ${result.stdout}`);
  assert.match(result.stderr, /missing required marker: <!-- ブログ記事 -->/);
  assert.match(result.stderr, /missing <loc>: https:\/\/fuluckpet\.com\/blog\/health\.html/);
});

test('verify-generated requires the public root pages emitted by generate-site', (t) => {
  const siteDir = createVerifierSite(t);
  const sharedAssetPage = fs.readFileSync(path.join(siteDir, 'kittens.html'), 'utf8');
  write(siteDir, 'parents.html', sharedAssetPage);
  write(siteDir, 'reviews.html', sharedAssetPage);
  write(siteDir, 'sitemap.xml', `<?xml version="1.0"?>
<urlset>
  <url><loc>https://fuluckpet.com/</loc></url>
${ALL_MARKERS}
</urlset>
`);

  const result = runVerifier(siteDir);

  assert.equal(result.status, 1, `expected missing-root failure, got stdout: ${result.stdout}`);
  assert.match(result.stderr, /missing <loc>: https:\/\/fuluckpet\.com\/kittens\.html/);
  assert.match(result.stderr, /missing <loc>: https:\/\/fuluckpet\.com\/parents\.html/);
  assert.match(result.stderr, /missing <loc>: https:\/\/fuluckpet\.com\/reviews\.html/);
});

test('verify-generated requires guide pages but does not require noncanonical blog aliases', (t) => {
  const siteDir = createVerifierSite(t);
  write(siteDir, 'guide/behavior.html', '<!doctype html><link rel="canonical" href="https://fuluckpet.com/guide/behavior.html"><title>Guide</title>\n');
  write(siteDir, 'blog/alias.html', '<!doctype html><link rel="canonical" href="https://fuluckpet.com/blog/destination.html"><title>Alias</title>\n');
  write(siteDir, 'sitemap.xml', `<?xml version="1.0"?>
<urlset>
  <url><loc>https://fuluckpet.com/kittens.html</loc></url>
${ALL_MARKERS}
</urlset>
`);

  const result = runVerifier(siteDir);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /missing <loc>: https:\/\/fuluckpet\.com\/guide\/behavior\.html/);
  assert.doesNotMatch(result.stderr, /missing <loc>: https:\/\/fuluckpet\.com\/blog\/alias\.html/);
});

test('verify-generated does not force a noindex generated page into sitemap', (t) => {
  const siteDir = createVerifierSite(t);
  write(siteDir, 'blog/dark.html', `<!doctype html>
<meta name="robots" content="noindex,nofollow">
<title>Dark preview</title>
`);
  write(siteDir, 'sitemap.xml', `<?xml version="1.0"?>
<urlset>
  <url><loc>https://fuluckpet.com/kittens.html</loc></url>
${ALL_MARKERS}
</urlset>
`);

  const result = runVerifier(siteDir);

  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stderr, /blog\/dark\.html/);
});

test('verify-generated rejects a noindex generated page that leaked into sitemap', (t) => {
  const siteDir = createVerifierSite(t);
  write(siteDir, 'blog/dark.html', `<!doctype html>
<meta content="nofollow, noindex" name="robots">
<title>Dark preview</title>
`);
  write(siteDir, 'sitemap.xml', `<?xml version="1.0"?>
<urlset>
  <url><loc>https://fuluckpet.com/kittens.html</loc></url>
  <url><loc>https://fuluckpet.com/blog/dark.html</loc></url>
${ALL_MARKERS}
</urlset>
`);

  const result = runVerifier(siteDir);

  assert.equal(result.status, 1, `expected noindex leak failure, got stdout: ${result.stdout}`);
  assert.match(result.stderr, /noindex page has <loc>: https:\/\/fuluckpet\.com\/blog\/dark\.html/);
});

test('verify-generated rejects an unquoted noindex page outside generated coverage when it leaks', (t) => {
  const siteDir = createVerifierSite(t);
  write(siteDir, 'boarding/index.html', `<!doctype html>
<meta content=noindex,nofollow name=robots>
<title>Owner-gated boarding</title>
`);
  write(siteDir, 'sitemap.xml', `<?xml version="1.0"?>
<urlset>
  <url><loc>https://fuluckpet.com/kittens.html</loc></url>
  <url><loc>https://fuluckpet.com/boarding/</loc></url>
${ALL_MARKERS}
</urlset>
`);

  const result = runVerifier(siteDir);

  assert.equal(result.status, 1, `expected noindex leak failure, got stdout: ${result.stdout}`);
  assert.match(result.stderr, /noindex page has <loc>: https:\/\/fuluckpet\.com\/boarding\//);
});

test('verify-generated also rejects the explicit index.html URL for a noindex directory page', (t) => {
  const siteDir = createVerifierSite(t);
  write(siteDir, 'boarding/index.html', `<!doctype html>
<meta name="robots" content="noindex,nofollow">
<title>Owner-gated boarding</title>
`);
  write(siteDir, 'sitemap.xml', `<?xml version="1.0"?>
<urlset>
  <url><loc>https://fuluckpet.com/kittens.html</loc></url>
  <url><loc>https://fuluckpet.com/boarding/index.html</loc></url>
${ALL_MARKERS}
</urlset>
`);

  const result = runVerifier(siteDir);

  assert.equal(result.status, 1, `expected explicit-index noindex failure, got stdout: ${result.stdout}`);
  assert.match(result.stderr, /noindex page has <loc>: https:\/\/fuluckpet\.com\/boarding\/index\.html/);
});

test('verify-generated rejects Product schema on a kitten list page', (t) => {
  const siteDir = createVerifierSite(t);
  const listingPath = path.join(siteDir, 'kittens.html');
  fs.appendFileSync(
    listingPath,
    '<script type="application/ld+json">{"@type":"Product","offers":{"@type":"Offer"}}</script>\n',
    'utf8',
  );
  write(siteDir, 'sitemap.xml', `<?xml version="1.0"?>
<urlset>
  <url><loc>https://fuluckpet.com/kittens.html</loc></url>
${ALL_MARKERS}
</urlset>
`);

  const result = runVerifier(siteDir);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /schema.*kittens\.html.*Product/i);
  assert.match(result.stderr, /schema.*kittens\.html.*Offer/i);
});

test('verify-generated rejects malformed detail Product ID and seller reference', (t) => {
  const siteDir = createVerifierSite(t);
  write(siteDir, 'kittens/schema-broken.html', `<!doctype html>
<link rel="canonical" href="https://fuluckpet.com/kittens/schema-broken.html">
<link rel="stylesheet" href="/style.css?v=test">
<link rel="stylesheet" href="/nav.css?v=test">
<script src="/i18n.js?v=test"></script>
<script src="/nav.js?v=test"></script>
<a class="skip-link" href="#main">Skip</a>
<main id="main">
  <p class="kitten-detail-price">&yen;180,000</p>
  <script type="application/ld+json">{"@type":"Product","@id":"https://fuluckpet.com/kittens.html#schema-broken","offers":{"@type":"Offer","url":"https://fuluckpet.com/kittens/schema-broken.html","seller":{"@type":"Organization","name":"Fuluck"}}}</script>
</main>
`);
  write(siteDir, 'sitemap.xml', `<?xml version="1.0"?>
<urlset>
  <url><loc>https://fuluckpet.com/kittens.html</loc></url>
  <url><loc>https://fuluckpet.com/kittens/schema-broken.html</loc></url>
${ALL_MARKERS}
</urlset>
`);

  const result = runVerifier(siteDir);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /schema.*schema-broken\.html.*Product @id/i);
  assert.match(result.stderr, /schema.*schema-broken\.html.*seller/i);
});

test('verify-generated enforces Product cardinality at the visible detail-price boundary', (t) => {
  const siteDir = createVerifierSite(t);
  write(siteDir, 'kittens/priced-missing.html', `<!doctype html>
<link rel="canonical" href="https://fuluckpet.com/kittens/priced-missing.html">
<link rel="stylesheet" href="/style.css?v=test"><link rel="stylesheet" href="/nav.css?v=test">
<script src="/i18n.js?v=test"></script><script src="/nav.js?v=test"></script>
<a class="skip-link" href="#main">Skip</a><main id="main"><p class="kitten-detail-price">&yen;180,000</p></main>
`);
  write(siteDir, 'kittens/unpriced-product.html', `<!doctype html>
<link rel="canonical" href="https://fuluckpet.com/kittens/unpriced-product.html">
<link rel="stylesheet" href="/style.css?v=test"><link rel="stylesheet" href="/nav.css?v=test">
<script src="/i18n.js?v=test"></script><script src="/nav.js?v=test"></script>
<a class="skip-link" href="#main">Skip</a><main id="main">
<p class="kitten-detail-price">価格はお問い合わせください</p>
<script type="application/ld+json">{"@type":"Product","@id":"https://fuluckpet.com/kittens/unpriced-product.html#product","offers":{"@type":"Offer","url":"https://fuluckpet.com/kittens/unpriced-product.html","seller":{"@id":"https://fuluckpet.com/#cattery"}}}</script>
</main>
`);
  write(siteDir, 'sitemap.xml', `<?xml version="1.0"?>
<urlset>
  <url><loc>https://fuluckpet.com/kittens.html</loc></url>
  <url><loc>https://fuluckpet.com/kittens/priced-missing.html</loc></url>
  <url><loc>https://fuluckpet.com/kittens/unpriced-product.html</loc></url>
${ALL_MARKERS}
</urlset>
`);

  const result = runVerifier(siteDir);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /schema.*priced-missing\.html.*priced.*one Product/i);
  assert.match(result.stderr, /schema.*unpriced-product\.html.*unpriced.*Product/i);
});

for (const scenario of [
  {
    label: 'a second Product inside @graph',
    relative: 'kittens/priced-graph-product.html',
    entities: (relative) => [validProduct(relative), { '@graph': [{ '@type': 'Product' }] }],
    error: /schema.*priced-graph-product\.html.*priced detail.*one Product.*found 2/i,
  },
  {
    label: 'a second Product inside an arbitrary nested object',
    relative: 'kittens/priced-nested-product.html',
    entities: (relative) => [validProduct(relative), { related: { item: { '@type': 'Product' } } }],
    error: /schema.*priced-nested-product\.html.*priced detail.*one Product.*found 2/i,
  },
]) {
  test(`verify-generated rejects ${scenario.label} on a priced detail`, (t) => {
    const result = runDetailSchemaMutation(t, scenario.relative, {
      entities: scenario.entities(scenario.relative),
    });

    assert.equal(result.status, 1, `mutation escaped verifier:\n${result.stdout}\n${result.stderr}`);
    assert.match(result.stderr, scenario.error);
  });
}

test('verify-generated rejects a Product nested below a wrapper on an unpriced detail', (t) => {
  const relative = 'kittens/unpriced-nested-product.html';
  const result = runDetailSchemaMutation(t, relative, {
    priced: false,
    entities: [{ data: { item: { '@type': 'Product' } } }],
  });

  assert.equal(result.status, 1, `mutation escaped verifier:\n${result.stdout}\n${result.stderr}`);
  assert.match(result.stderr, /schema.*unpriced-nested-product\.html.*unpriced detail.*no Product or Offer.*1 Product.*0 Offer/i);
});

for (const scenario of [
  {
    label: 'an independent Offer entity',
    relative: 'kittens/priced-independent-offer.html',
    extra: (relative) => validOffer(relative),
  },
  {
    label: 'an Offer nested below a wrapper',
    relative: 'kittens/priced-nested-offer.html',
    extra: (relative) => ({ data: { offer: validOffer(relative) } }),
  },
]) {
  test(`verify-generated rejects ${scenario.label} beside a priced Product`, (t) => {
    const result = runDetailSchemaMutation(t, scenario.relative, {
      entities: [validProduct(scenario.relative), scenario.extra(scenario.relative)],
    });

    assert.equal(result.status, 1, `mutation escaped verifier:\n${result.stdout}\n${result.stderr}`);
    assert.match(result.stderr, new RegExp(`schema.*${path.basename(scenario.relative, '.html')}\\.html.*one typed Offer.*found 2 Offer`, 'i'));
  });
}

test('verify-generated rejects a nested Offer on an unpriced detail', (t) => {
  const relative = 'kittens/unpriced-nested-offer.html';
  const result = runDetailSchemaMutation(t, relative, {
    priced: false,
    entities: [{ data: { offer: validOffer(relative) } }],
  });

  assert.equal(result.status, 1, `mutation escaped verifier:\n${result.stdout}\n${result.stderr}`);
  assert.match(result.stderr, /schema.*unpriced-nested-offer\.html.*unpriced detail.*no Product or Offer.*0 Product.*1 Offer/i);
});

test('verify-generated rejects Product offers without the Offer type', (t) => {
  const relative = 'kittens/priced-untyped-offer.html';
  const product = validProduct(relative);
  delete product.offers['@type'];
  const result = runDetailSchemaMutation(t, relative, { entities: [product] });

  assert.equal(result.status, 1, `mutation escaped verifier:\n${result.stdout}\n${result.stderr}`);
  assert.match(result.stderr, /schema.*priced-untyped-offer\.html.*one typed Offer.*found 0 Offer/i);
});

test('verify-generated rejects broken kitten detail landmarks and duplicate Product schema', (t) => {
  const siteDir = createVerifierSite(t);
  write(siteDir, 'kittens/broken.html', `<!doctype html>
<link rel="stylesheet" href="/style.css?v=test">
<link rel="stylesheet" href="/nav.css?v=test">
<script src="/i18n.js?v=test"></script>
<script src="/nav.js?v=test"></script>
<main id="main">
<script type="application/ld+json">{"@type":"Product"}</script>
<script type="application/ld+json">{"@type":"Product"}</script>
<!-- ========== FOOTER ========== -->
`);
  write(siteDir, 'sitemap.xml', `<?xml version="1.0"?>
<urlset>
  <url><loc>https://fuluckpet.com/kittens.html</loc></url>
  <url><loc>https://fuluckpet.com/kittens/broken.html</loc></url>
${ALL_MARKERS}
</urlset>
`);

  const result = runVerifier(siteDir);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /landmark.*kittens\/broken\.html.*main/i);
  assert.match(result.stderr, /landmark.*kittens\/broken\.html.*skip/i);
  assert.match(result.stderr, /schema.*kittens\/broken\.html.*Product/i);
});

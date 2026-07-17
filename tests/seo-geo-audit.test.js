'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  auditSite,
  parseJsonLdScripts,
  renderMarkdown,
  runCli,
} = require('../tools/seo-geo-audit.js');

const FIXED_SOURCE_TIMESTAMP = '2026-07-17T00:00:00.000Z';
const FIXED_BASE_COMMIT = '0123456789abcdef';
const ORIGIN = 'https://fuluckpet.com';
const PROJECT = path.resolve(__dirname, '..');
const EXACT_REVIEW_CLAIM = ['113', 'reviews'].join(' ');

function write(root, relative, content) {
  const target = path.join(root, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, 'utf8');
}

function itemListPage(language) {
  return `<!doctype html>
<html lang="${language}"><head><title>Kittens</title>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"ItemList","itemListElement":[]}</script>
</head><body><main>Kitten list</main></body></html>\n`;
}

function productFor(relative) {
  const breederId = path.basename(relative, '.html');
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    '@id': `${ORIGIN}/kittens/${breederId}.html#product`,
    name: `Kitten ${breederId}`,
    brand: { '@type': 'Brand', name: 'Fuluck Cattery' },
    offers: {
      '@type': 'Offer',
      price: '220000',
      priceCurrency: 'JPY',
      availability: 'https://schema.org/InStock',
      url: `${ORIGIN}/${relative}`,
      seller: { '@id': `${ORIGIN}/#cattery` },
    },
  };
}

function detailPage(relative, { priced = true, product = priced } = {}) {
  const schema = product
    ? `<script type="application/ld+json">${JSON.stringify(productFor(relative))}</script>`
    : '';
  const price = priced ? '&yen;220,000' : 'Price on request';
  return `<!doctype html>
<html><head><title>Kitten detail</title>${schema}</head>
<body><main><p class="kitten-detail-price">${price}</p></main></body></html>\n`;
}

function detailPageWithRawSchema(rawSchema, { priced = true } = {}) {
  const price = priced ? '&yen;220,000' : 'Price on request';
  return `<!doctype html>
<html><head><title>Kitten detail</title>
<script type="application/ld+json">${rawSchema}</script></head>
<body><main><p class="kitten-detail-price">${price}</p></main></body></html>\n`;
}

function appendJsonLd(root, relative, value) {
  fs.appendFileSync(
    path.join(root, relative),
    `<script type="application/ld+json">${JSON.stringify(value)}</script>\n`,
    'utf8',
  );
}

function appendRawJsonLd(root, relative, source) {
  fs.appendFileSync(
    path.join(root, relative),
    `<script type="application/ld+json">${source}</script>\n`,
    'utf8',
  );
}

function createValidFixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fuluck-seo-geo-audit-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  write(root, 'index.html', '<!doctype html><html><head><title>Fuluck</title></head><body>Home</body></html>\n');
  write(root, 'blog.html', '<!doctype html><html><head><title>Blog</title></head><body>Blog index</body></html>\n');
  write(root, 'blog/article.html', '<!doctype html><html><head><title>Article</title></head><body>Stable article</body></html>\n');
  write(root, 'kittens.html', itemListPage('ja'));
  write(root, 'en/kittens.html', itemListPage('en'));
  write(root, 'zh/kittens.html', itemListPage('zh'));

  for (const breederId of ['2607-00585', '2607-00594']) {
    for (const prefix of ['', 'en/', 'zh/']) {
      const relative = `${prefix}kittens/${breederId}.html`;
      const priced = breederId === '2607-00585';
      write(root, relative, detailPage(relative, { priced }));
    }
  }

  write(root, 'llms.txt', `# Fuluck\n\n- Home: ${ORIGIN}/\n- Reviews: 100+ reviews\n`);
  write(root, 'llms-full.txt', `# Fuluck full\n\n- Kittens: ${ORIGIN}/kittens.html\n- Reviews: 100+ reviews\n`);
  write(root, 'sitemap.xml', `<?xml version="1.0"?><urlset><url><loc>${ORIGIN}/</loc></url></urlset>\n`);
  return root;
}

function audit(root) {
  return auditSite({
    root,
    sourceTimestamp: FIXED_SOURCE_TIMESTAMP,
    baseCommit: FIXED_BASE_COMMIT,
  });
}

function errorCodes(result) {
  return result.errors.map((error) => error.code);
}

function assertHasOnlyCode(result, code) {
  assert.deepEqual(new Set(errorCodes(result)), new Set([code]));
}

test('valid trilingual fixture passes with deterministic JSON and Markdown', (t) => {
  const root = createValidFixture(t);
  const first = audit(root);
  const second = audit(root);

  assert.equal(first.status, 'pass');
  assert.deepEqual(first.errors, []);
  assert.equal(first.schemaVersion, '1.0');
  assert.equal(JSON.stringify(first, null, 2), JSON.stringify(second, null, 2));
  assert.equal(renderMarkdown(first), renderMarkdown(second));
});

test('combined invalid fixture emits the stable hard-gate error codes', (t) => {
  const root = createValidFixture(t);
  appendJsonLd(root, 'kittens.html', { wrapper: { '@type': 'Product' } });

  const rawProduct = `{
    "@context":"https://schema.org",
    "@type":"Product",
    "@id":"https://fuluckpet.com/kittens.html#wrong",
    "brand":{"@type":"Brand","name":"First"},
    "brand":{"@type":"Brand","name":"Second"},
    "offers":{
      "@type":"Offer",
      "price":"220000",
      "priceCurrency":"JPY",
      "availability":"https://schema.org/BackOrder",
      "url":"https://fuluckpet.com/kittens/2607-00585.html",
      "seller":{"@type":"Organization","name":"Fuluck"},
      "shippingDetails":{},
      "hasMerchantReturnPolicy":{}
    }
  }`;
  write(root, 'kittens/2607-00585.html', detailPageWithRawSchema(rawProduct));
  appendJsonLd(root, 'index.html', {
    '@type': 'WebSite',
    potentialAction: { '@type': 'SearchAction' },
  });
  write(
    root,
    'llms.txt',
    `# Fuluck\n\n- Reviews: 5.00 / ${EXACT_REVIEW_CLAIM}\n- Broken: ${ORIGIN}/missing.html\n`,
  );

  const result = audit(root);
  const repeated = audit(root);

  assert.deepEqual(
    new Set(errorCodes(result)),
    new Set([
      'LIST_PRODUCT_FORBIDDEN', 'DETAIL_PRODUCT_ID_INVALID',
      'SELLER_ENTITY_INVALID', 'BRAND_DUPLICATE', 'AVAILABILITY_INVALID',
      'MERCHANT_POLICY_UNVERIFIED', 'SEARCH_ACTION_OBSOLETE',
      'EXACT_REVIEW_COUNT', 'LLMS_INTERNAL_URL_MISSING',
    ]),
  );
  assert.equal(result.status, 'fail');
  const findingOrder = result.errors.map((error) => `${error.code}\0${error.path}\0${error.message}`);
  assert.deepEqual(findingOrder, [...findingOrder].sort());
  assert.equal(JSON.stringify(result, null, 2), JSON.stringify(repeated, null, 2));
  assert.equal(renderMarkdown(result), renderMarkdown(repeated));
});

test('inputDigest tracks uncommitted bytes without changing baseCommit', (t) => {
  const root = createValidFixture(t);
  const before = audit(root);
  fs.appendFileSync(path.join(root, 'blog/article.html'), ' ', 'utf8');
  const after = audit(root);

  assert.notEqual(after.inputDigest, before.inputDigest);
  assert.equal(after.baseCommit, before.baseCommit);
  assert.equal(after.baseCommit, FIXED_BASE_COMMIT);
});

test('runCli writes parseable JSON and Markdown before returning one', (t) => {
  const root = createValidFixture(t);
  appendJsonLd(root, 'blog/article.html', { '@type': 'SearchAction' });
  const jsonPath = path.join(root, 'reports', 'audit.json');
  const markdownPath = path.join(root, 'reports', 'audit.md');

  const exitCode = runCli(
    ['--root', root, '--json', jsonPath, '--markdown', markdownPath],
    { sourceTimestamp: FIXED_SOURCE_TIMESTAMP, baseCommit: FIXED_BASE_COMMIT },
  );

  assert.equal(exitCode, 1);
  const jsonSource = fs.readFileSync(jsonPath, 'utf8');
  const markdownSource = fs.readFileSync(markdownPath, 'utf8');
  const parsed = JSON.parse(jsonSource);
  assert.equal(parsed.status, 'fail');
  assert.ok(parsed.errors.some((error) => error.code === 'SEARCH_ACTION_OBSOLETE'));
  assert.match(jsonSource, /\n$/);
  assert.match(markdownSource, /\n$/);
  assert.match(markdownSource, /^# SEO\/GEO Audit/m);
  assert.ok(markdownSource.includes(parsed.inputDigest));
});

test('duplicate ItemList nested in a graph is rejected on every localized list route', (t) => {
  const root = createValidFixture(t);
  appendJsonLd(root, 'en/kittens.html', { '@graph': [{ '@type': 'ItemList' }] });

  assertHasOnlyCode(audit(root), 'LIST_ITEMLIST_CARDINALITY');
});

test('top-level JSON-LD arrays are flattened before list cardinality checks', (t) => {
  const root = createValidFixture(t);
  appendJsonLd(root, 'zh/kittens.html', [
    { '@type': 'Thing' },
    { '@type': 'ItemList' },
  ]);

  assertHasOnlyCode(audit(root), 'LIST_ITEMLIST_CARDINALITY');
});

test('localized list page cannot escape schema checks by becoming noindex', (t) => {
  const root = createValidFixture(t);
  write(
    root,
    'en/kittens.html',
    itemListPage('en').replace('<head>', '<head><meta name="robots" content="noindex">'),
  );

  assertHasOnlyCode(audit(root), 'LIST_PAGE_NOT_PUBLIC');
});

for (const mutation of [
  { label: 'Product', value: { data: { item: { '@type': 'Product' } } }, code: 'LIST_PRODUCT_FORBIDDEN' },
  { label: 'Offer', value: { data: { offer: { '@type': 'Offer' } } }, code: 'LIST_OFFER_FORBIDDEN' },
]) {
  test(`nested ${mutation.label} on a list page is rejected`, (t) => {
    const root = createValidFixture(t);
    appendJsonLd(root, 'zh/kittens.html', mutation.value);

    assertHasOnlyCode(audit(root), mutation.code);
  });
}

test('visibly priced localized detail requires exactly one Product', (t) => {
  const root = createValidFixture(t);
  write(
    root,
    'zh/kittens/2607-00585.html',
    detailPage('zh/kittens/2607-00585.html', { priced: true, product: false }),
  );

  assertHasOnlyCode(audit(root), 'DETAIL_PRODUCT_CARDINALITY');
});

for (const mutation of [
  {
    label: 'HTML comment',
    priceMarkup: '<!-- <p class="kitten-detail-price">&yen;220,000</p> -->',
  },
  {
    label: 'script text',
    priceMarkup: '<script>const fake = `<p class="kitten-detail-price">&yen;220,000</p>`;</script>',
  },
]) {
  test(`inactive price landmark inside ${mutation.label} is not visible`, (t) => {
    const root = createValidFixture(t);
    const relative = 'kittens/2607-00585.html';
    write(root, relative, `<!doctype html><title>Kitten</title>
<script type="application/ld+json">${JSON.stringify(productFor(relative))}</script>
${mutation.priceMarkup}\n`);

    assertHasOnlyCode(audit(root), 'DETAIL_PRICE_LANDMARK_MISSING');
  });
}

test('visibly priced detail rejects a second nested Product', (t) => {
  const root = createValidFixture(t);
  appendJsonLd(
    root,
    'kittens/2607-00585.html',
    { '@graph': [{ '@type': 'Product' }] },
  );

  assertHasOnlyCode(audit(root), 'DETAIL_PRODUCT_CARDINALITY');
});

test('visibly unpriced detail rejects Product schema', (t) => {
  const root = createValidFixture(t);
  const relative = 'en/kittens/2607-00594.html';
  write(root, relative, detailPage(relative, { priced: false, product: true }));

  assertHasOnlyCode(audit(root), 'DETAIL_UNPRICED_SCHEMA');
});

test('priced detail requires one owned typed Offer', (t) => {
  const root = createValidFixture(t);
  appendJsonLd(root, 'kittens/2607-00585.html', { '@type': 'Offer' });

  assertHasOnlyCode(audit(root), 'DETAIL_OFFER_CARDINALITY');
});

test('all three localized detail siblings are required', (t) => {
  const root = createValidFixture(t);
  fs.unlinkSync(path.join(root, 'zh/kittens/2607-00585.html'));

  assertHasOnlyCode(audit(root), 'DETAIL_LANGUAGE_CARDINALITY');
});

test('kittens directory index is not treated as a kitten detail route', (t) => {
  const root = createValidFixture(t);
  write(root, 'kittens/index.html', '<!doctype html><title>Kitten directory redirect</title>\n');

  assert.equal(audit(root).status, 'pass');
});

test('malformed JSON-LD is reported while later scripts on the page are retained', (t) => {
  const root = createValidFixture(t);
  const relative = 'blog/malformed.html';
  const html = `<!doctype html><title>Malformed</title>
<script type="application/ld+json">{"@type":</script>
<script type="application/ld+json">{"@type":"Organization","name":"Fuluck"}</script>\n`;
  write(root, relative, html);
  const findings = [];

  const entities = parseJsonLdScripts(html, relative, findings);

  assert.ok(entities.some((entity) => entity['@type'] === 'Organization'));
  assert.deepEqual(findings.map((finding) => finding.code), ['JSON_LD_INVALID']);
  assertHasOnlyCode(audit(root), 'JSON_LD_INVALID');
});

test('data-type is not JSON-LD while an exact type attribute is still parsed', () => {
  const html = `<!doctype html><title>Attribute boundary</title>
<script data-type="application/ld+json">{"@type":"SearchAction"}</script>
<script type="application/ld+json">{"@type":"Organization","name":"Fuluck"}</script>\n`;
  const findings = [];
  const metadata = {};

  const entities = parseJsonLdScripts(html, 'blog/attribute-boundary.html', findings, metadata);

  assert.deepEqual(findings, []);
  assert.equal(metadata.scriptCount, 1);
  assert.deepEqual(entities, [{ '@type': 'Organization', name: 'Fuluck' }]);
});

test('unclosed JSON-LD script is not silently omitted', (t) => {
  const root = createValidFixture(t);
  const relative = 'blog/unclosed-json-ld.html';
  const html = '<!doctype html><title>Broken</title><script type="application/ld+json">{"@type":"Product"';
  write(root, relative, html);
  const findings = [];

  parseJsonLdScripts(html, relative, findings);

  assert.deepEqual(findings.map((finding) => finding.code), ['JSON_LD_INVALID']);
  assertHasOnlyCode(audit(root), 'JSON_LD_INVALID');
});

test('SearchAction is rejected on an arbitrary public page', (t) => {
  const root = createValidFixture(t);
  appendJsonLd(root, 'blog/article.html', { data: { '@type': 'SearchAction' } });

  assertHasOnlyCode(audit(root), 'SEARCH_ACTION_OBSOLETE');
});

test('commented JSON-LD is not treated as a published SearchAction', (t) => {
  const root = createValidFixture(t);
  fs.appendFileSync(
    path.join(root, 'blog/article.html'),
    '<!-- <script type="application/ld+json">{"@type":"SearchAction"}</script> -->\n',
    'utf8',
  );

  assert.equal(audit(root).status, 'pass');
});

test('commented noindex cannot hide an active SearchAction', (t) => {
  const root = createValidFixture(t);
  write(root, 'blog/article.html', `<!doctype html><title>Public</title>
<!-- <meta name="robots" content="noindex"> -->
<script type="application/ld+json">{"@type":"SearchAction"}</script>\n`);

  assertHasOnlyCode(audit(root), 'SEARCH_ACTION_OBSOLETE');
});

test('data-name and data-content cannot hide an active SearchAction', (t) => {
  const root = createValidFixture(t);
  write(root, 'blog/article.html', `<!doctype html><html><head><title>Public</title>
<meta data-name="robots" data-content="noindex">
<script type="application/ld+json">{"@type":"SearchAction"}</script></head><body></body></html>\n`);

  const result = audit(root);

  assert.equal(result.summary.noindexHtmlCount, 0);
  assertHasOnlyCode(result, 'SEARCH_ACTION_OBSOLETE');
});

test('robots-looking text inside a script cannot hide an active SearchAction', (t) => {
  const root = createValidFixture(t);
  write(root, 'blog/article.html', `<!doctype html><html><head><title>Public</title>
<script>const fake = '<meta name="robots" content="noindex">';</script></head>
<body><script type="application/ld+json">{"@type":"SearchAction"}</script></body></html>\n`);

  assertHasOnlyCode(audit(root), 'SEARCH_ACTION_OBSOLETE');
});

test('robots meta outside the document head cannot hide an active SearchAction', (t) => {
  const root = createValidFixture(t);
  write(root, 'blog/article.html', `<!doctype html><html><head><title>Public</title></head><body>
<meta name="robots" content="noindex">
<script type="application/ld+json">{"@type":"SearchAction"}</script></body></html>\n`);

  assertHasOnlyCode(audit(root), 'SEARCH_ACTION_OBSOLETE');
});

test('noindex page is audited as input but excluded from public schema rules', (t) => {
  const root = createValidFixture(t);
  write(root, 'private.html', `<!doctype html><meta content="noindex,nofollow" name="robots">
<script type="application/ld+json">{"@type":"SearchAction"}</script>\n`);

  const result = audit(root);

  assert.equal(result.status, 'pass');
  assert.deepEqual(result.errors, []);
  assert.equal(result.summary.noindexHtmlCount, 1);
});

test('robots none is treated as noindex and nofollow', (t) => {
  const root = createValidFixture(t);
  write(root, 'private-none.html', `<!doctype html><meta name="robots" content="none">
<script type="application/ld+json">{"@type":"SearchAction"}</script>\n`);

  const result = audit(root);

  assert.equal(result.status, 'pass');
  assert.equal(result.summary.noindexHtmlCount, 1);
});

for (const mutation of [
  {
    label: 'Product return policy',
    value: { '@type': 'Product', hasMerchantReturnPolicy: {} },
  },
  {
    label: 'Offer shipping details',
    value: { '@type': 'Offer', shippingDetails: {} },
  },
]) {
  test(`${mutation.label} is forbidden on an arbitrary public entity`, (t) => {
    const root = createValidFixture(t);
    appendJsonLd(root, 'blog/article.html', mutation.value);

    assertHasOnlyCode(audit(root), 'MERCHANT_POLICY_UNVERIFIED');
  });
}

test('raw duplicate brand keys in the same Product are detected by object scope', (t) => {
  const root = createValidFixture(t);
  const relative = 'kittens/2607-00585.html';
  const product = productFor(relative);
  const raw = JSON.stringify(product).replace(
    '"brand":',
    '"brand":{"@type":"Brand","name":"First"},"brand":',
  );
  write(root, relative, detailPageWithRawSchema(raw));

  assertHasOnlyCode(audit(root), 'BRAND_DUPLICATE');
});

test('brand array with more than one entry is duplicate brand publication', (t) => {
  const root = createValidFixture(t);
  const relative = 'kittens/2607-00585.html';
  const product = productFor(relative);
  product.brand = [
    { '@type': 'Brand', name: 'First' },
    { '@type': 'Brand', name: 'Second' },
  ];
  write(root, relative, detailPageWithRawSchema(JSON.stringify(product)));

  assertHasOnlyCode(audit(root), 'BRAND_DUPLICATE');
});

test('arbitrary Product with repeated raw brand keys is rejected', (t) => {
  const root = createValidFixture(t);
  appendRawJsonLd(root, 'blog/article.html', `{
    "@type":"Product",
    "brand":{"@type":"Brand","name":"First"},
    "brand":{"@type":"Brand","name":"Second"}
  }`);

  assertHasOnlyCode(audit(root), 'BRAND_DUPLICATE');
});

test('arbitrary Product with a multi-entry brand array is rejected', (t) => {
  const root = createValidFixture(t);
  appendJsonLd(root, 'blog/article.html', {
    '@type': 'Product',
    brand: [
      { '@type': 'Brand', name: 'First' },
      { '@type': 'Brand', name: 'Second' },
    ],
  });

  assertHasOnlyCode(audit(root), 'BRAND_DUPLICATE');
});

for (const mutation of [
  {
    label: 'nested Product',
    raw: '{"@graph":[{"@type":"Product","brand":{},"brand":{}}]}',
  },
  {
    label: 'top-level array Product',
    raw: '[{"@type":"Thing"},{"@type":"Product","brand":{},"brand":{}}]',
  },
  {
    label: 'escaped brand key',
    raw: '{"@type":"Product","br\\u0061nd":{},"brand":{}}',
  },
]) {
  test(`raw token walk catches duplicate brand on a ${mutation.label}`, (t) => {
    const root = createValidFixture(t);
    appendRawJsonLd(root, 'blog/article.html', mutation.raw);

    assertHasOnlyCode(audit(root), 'BRAND_DUPLICATE');
  });
}

test('child object brand key does not duplicate its parent Product brand', (t) => {
  const root = createValidFixture(t);
  appendRawJsonLd(root, 'blog/article.html', `{
    "@type":"Product",
    "brand":{"@type":"Brand","name":"Parent"},
    "metadata":{"brand":{"name":"Child metadata"}}
  }`);

  assert.equal(audit(root).status, 'pass');
});

test('separate Products may each carry one brand without a false duplicate', (t) => {
  const root = createValidFixture(t);
  appendJsonLd(root, 'blog/article.html', {
    '@graph': [
      { '@type': 'Product', brand: { '@type': 'Brand', name: 'First' } },
      { '@type': 'Product', brand: { '@type': 'Brand', name: 'Second' } },
    ],
  });

  assert.equal(audit(root).status, 'pass');
});

test('kitten Product requires exactly one valid Brand object', (t) => {
  const root = createValidFixture(t);
  const relative = 'kittens/2607-00585.html';
  const product = productFor(relative);
  delete product.brand;
  write(root, relative, detailPageWithRawSchema(JSON.stringify(product)));

  assertHasOnlyCode(audit(root), 'BRAND_INVALID');
});

test('arbitrary future Product may omit brand', (t) => {
  const root = createValidFixture(t);
  appendJsonLd(root, 'blog/article.html', { '@type': 'Product', name: 'Future animal' });

  assert.equal(audit(root).status, 'pass');
});

test('availability outside the site allowlist is rejected', (t) => {
  const root = createValidFixture(t);
  const relative = 'zh/kittens/2607-00585.html';
  const product = productFor(relative);
  product.offers.availability = 'https://schema.org/BackOrder';
  write(root, relative, detailPageWithRawSchema(JSON.stringify(product)));

  assertHasOnlyCode(audit(root), 'AVAILABILITY_INVALID');
});

for (const mutation of [
  {
    label: 'broken concrete internal URL',
    line: `- Missing: ${ORIGIN}/does-not-exist.html`,
    code: 'LLMS_INTERNAL_URL_MISSING',
  },
  {
    label: 'exact review count',
    line: `- Rating: 5.00 / ${EXACT_REVIEW_CLAIM}`,
    code: 'EXACT_REVIEW_COUNT',
  },
  {
    label: 'volatile kitten ID',
    line: `- Kitten: ${ORIGIN}/kittens/2607-00585.html`,
    code: 'LLMS_VOLATILE_ID',
  },
]) {
  test(`llms files reject ${mutation.label}`, (t) => {
    const root = createValidFixture(t);
    write(root, 'llms.txt', `# Fuluck\n\n${mutation.line}\n`);

    assertHasOnlyCode(audit(root), mutation.code);
  });
}

test('llms Markdown link punctuation is not part of an internal URL', (t) => {
  const root = createValidFixture(t);
  write(root, 'llms.txt', `# Fuluck\n\n- [Home](${ORIGIN}/)\n- [Blog](${ORIGIN}/blog/article.html)\n`);

  assert.equal(audit(root).status, 'pass');
});

test('llms sentence punctuation is not part of an internal URL', (t) => {
  const root = createValidFixture(t);
  write(root, 'llms.txt', `# Fuluck\n\nRead ${ORIGIN}/blog.html. Then browse ${ORIGIN}/kittens.html,\n`);

  assert.equal(audit(root).status, 'pass');
});

test('unrelated number 113 is not treated as an exact review claim', (t) => {
  const root = createValidFixture(t);
  write(root, 'llms.txt', '# Fuluck\n\n- Room reference: 113\n- Reviews: 100+ reviews\n');

  assert.equal(audit(root).status, 'pass');
});

test('invalid CLI arguments and unreadable roots return exit code two', (t) => {
  const root = createValidFixture(t);
  assert.equal(runCli(['--unknown'], { writeStderr: false }), 2);
  assert.equal(
    runCli(
      ['--root', path.join(root, 'missing')],
      {
        sourceTimestamp: FIXED_SOURCE_TIMESTAMP,
        baseCommit: FIXED_BASE_COMMIT,
        writeStderr: false,
      },
    ),
    2,
  );
});

test('CLI root errors do not emit absolute or temporary paths', (t) => {
  const root = createValidFixture(t);
  const missing = path.join(root, 'private-missing-root');

  const result = spawnSync(process.execPath, [
    path.join(PROJECT, 'tools/seo-geo-audit.js'),
    '--root',
    missing,
  ], { encoding: 'utf8' });

  assert.equal(result.status, 2);
  assert.doesNotMatch(result.stderr, new RegExp(missing.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('CLI report-write errors do not emit absolute or temporary paths', (t) => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'fuluck-seo-geo-output-error-'));
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  const blockedParent = path.join(temporary, 'not-a-directory');
  fs.writeFileSync(blockedParent, 'file', 'utf8');
  const output = path.join(blockedParent, 'audit.json');

  const result = spawnSync(process.execPath, [
    path.join(PROJECT, 'tools/seo-geo-audit.js'),
    '--root',
    PROJECT,
    '--json',
    output,
    '--markdown',
    path.join(temporary, 'audit.md'),
  ], { encoding: 'utf8' });

  assert.equal(result.status, 2);
  assert.doesNotMatch(result.stderr, new RegExp(temporary.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

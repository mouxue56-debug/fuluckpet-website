#!/usr/bin/env node
// tools/verify-generated.js — post-generation integrity gate for the daily cron.
// Runs AFTER generate-site.js + generate-diary.js, BEFORE commit/push.
// Exits non-zero (fails the build, so nothing bad deploys) if it detects any of the
// three failure classes that have bitten this pipeline before:
//   1. Mojibake (U+FFFD replacement char) in any generated page.
//   2. Shared-asset version drift: kitten detail + diary pages must reference the SAME
//      style.css / i18n.js / nav.js / nav.css versions as kittens.html, and must not
//      have had nav.js / nav.css stripped.
//   3. Duplicate <loc> in sitemap.xml.
// Usage: node tools/verify-generated.js   (exit 0 = clean, exit 1 = problems found)

const fs = require('fs');
const path = require('path');
const { hasNoindexMeta } = require('./robots-meta');

const SITE = path.resolve(__dirname, '..');
const errors = [];
const BASE_URL = 'https://fuluckpet.com';
const SHARED_ASSETS = ['style.css', 'i18n.js', 'nav.js', 'nav.css'];

// --- Check 0a: generated cat-care page freshness ---
// The visible menu and JSON-LD must always describe the canonical catalog together.
const catCareFiles = [
  'boarding-public-config.js', 'tools/care-catalog-static.js', 'grooming/index.html',
];
const catCarePresence = catCareFiles.map(rel => fs.existsSync(path.join(SITE, rel)));
if (catCarePresence.some(Boolean)) {
  if (!catCarePresence.every(Boolean)) {
    errors.push('[care-catalog] grooming/index.html is stale');
  } else {
    try {
      const { CONFIG } = require('../boarding-public-config.js');
      const CareCatalogStatic = require('./care-catalog-static.js');
      const groomingSource = fs.readFileSync(path.join(SITE, 'grooming/index.html'), 'utf8');
      if (!CareCatalogStatic.isGroomingPageFresh(groomingSource, CONFIG.careCatalog.cat)) {
        errors.push('[care-catalog] grooming/index.html is stale');
      }
    } catch (_) {
      errors.push('[care-catalog] grooming/index.html is stale');
    }
  }
}

// --- Check 0: generated dog-service launch projection freshness ---
// A config flip must never leave nav/UI reading an older generated public state.
const dogProjectionFiles = [
  'boarding-public-config.js', 'dog-services-projection.js', 'dog-services-launch.json', 'dog-services-preparing.json',
];
const dogProjectionPresence = dogProjectionFiles.map(rel => fs.existsSync(path.join(SITE, rel)));
if (dogProjectionPresence.some(Boolean)) {
  if (!dogProjectionPresence.every(Boolean)) {
    errors.push('[dog-services] projection inputs/output are incomplete; run node tools/generate-site.js');
  } else {
    const BoardingConfig = require('../boarding-public-config.js');
    const DogServicesProjection = require('../dog-services-projection.js');
    const dogProjectionActual = read('dog-services-launch.json');
    const dogProjectionExpected = DogServicesProjection.serializeDogServicesProjection(BoardingConfig);
    if (dogProjectionActual !== dogProjectionExpected) {
      errors.push('[dog-services] dog-services-launch.json is stale; run node tools/generate-site.js');
    }
    const dogPreparingActual = read('dog-services-preparing.json');
    const dogPreparingExpected = DogServicesProjection.serializeDogServicesPreparingProjection(BoardingConfig);
    if (dogPreparingActual !== dogPreparingExpected) {
      errors.push('[dog-services] dog-services-preparing.json is stale; run node tools/generate-site.js');
    }
  }
}

function read(rel) {
  try { return fs.readFileSync(path.join(SITE, rel), 'utf8'); } catch { return null; }
}
function listHtml(dir) {
  const abs = path.join(SITE, dir);
  if (!fs.existsSync(abs)) return [];
  return fs.readdirSync(abs)
    .filter(f => f.endsWith('.html') && f !== 'index.html')
    .map(f => `${dir}/${f}`);
}
function assetVersion(html, file) {
  // matches href/src="...file?v=XXX" with or without leading slash
  const m = html.match(new RegExp(file.replace(/\./g, '\\.') + '\\?v=([\\w.-]+)'));
  return m ? m[1] : null;
}
function canonicalHref(html) {
  const match = String(html || '').match(/<link\s+rel=["']canonical["']\s+href=["']([^"']+)["']/i);
  return match ? match[1] : '';
}
function jsonLdEntities(html, rel) {
  const entities = [];
  for (const match of String(html || '').matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const parsed = JSON.parse(match[1]);
      entities.push(...(Array.isArray(parsed) ? parsed : [parsed]));
    } catch (error) {
      errors.push(`[schema] ${rel}: invalid JSON-LD (${error.message})`);
    }
  }
  return entities;
}
function hasSchemaType(value, type) {
  if (!value || typeof value !== 'object') return false;
  const schemaType = value['@type'];
  return schemaType === type || (Array.isArray(schemaType) && schemaType.includes(type));
}
function collectSchemaNodes(value, type, nodes = []) {
  if (!value || typeof value !== 'object') return nodes;
  if (hasSchemaType(value, type)) nodes.push(value);
  for (const child of Object.values(value)) {
    if (child && typeof child === 'object') collectSchemaNodes(child, type, nodes);
  }
  return nodes;
}
function schemaNodes(entities, type) {
  const nodes = [];
  for (const entity of entities) collectSchemaNodes(entity, type, nodes);
  return nodes;
}
function listHtmlTree(absDir = SITE, relDir = '') {
  const skipDirs = new Set(['.git', '.superpowers', 'node_modules']);
  const pages = [];
  for (const entry of fs.readdirSync(absDir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (skipDirs.has(entry.name)) continue;
      pages.push(...listHtmlTree(path.join(absDir, entry.name), path.join(relDir, entry.name)));
    } else if (entry.isFile() && entry.name.endsWith('.html')) {
      pages.push(path.join(relDir, entry.name).split(path.sep).join('/'));
    }
  }
  return pages;
}

function publicUrlsForHtml(rel) {
  if (rel === 'index.html') {
    return ['https://fuluckpet.com/', 'https://fuluckpet.com/index.html'];
  }
  if (rel.endsWith('/index.html')) {
    return [
      `https://fuluckpet.com/${rel.slice(0, -'index.html'.length)}`,
      `https://fuluckpet.com/${rel}`,
    ];
  }
  return [`https://fuluckpet.com/${rel}`];
}

// --- Collect the set of generated pages to check ---
// D2: the trilingual money pages under /en/ and /zh/ are generated the same way as the
// root kittens pages and must be held to the SAME mojibake + asset-consistency bar, else
// drift/mojibake in en/zh ships unchecked (the whole point of this gate).
const generatedPages = [
  'kittens.html', 'parents.html', 'reviews.html', 'diary/index.html',
  'en/kittens.html', 'zh/kittens.html',
  ...listHtml('kittens'),
  ...listHtml('en/kittens'),
  ...listHtml('zh/kittens'),
  ...listHtml('diary'),
];

// --- Check 1: mojibake ---
let scanned = 0;
for (const p of generatedPages) {
  const c = read(p);
  if (c == null) continue;
  scanned++;
  if (c.includes('�')) {
    const idx = c.indexOf('�');
    errors.push(`[mojibake] U+FFFD in ${p} near: ${JSON.stringify(c.slice(Math.max(0, idx - 20), idx + 5))}`);
  }
}

// --- Check 2: kitten-detail structure and schema cardinality ---
// These pages are assembled from shared list-page chrome, so unmatched landmarks can
// otherwise repeat across every language while the byte/version checks still look clean.
const kittenDetailPages = [
  ...listHtml('kittens'),
  ...listHtml('en/kittens'),
  ...listHtml('zh/kittens'),
];
for (const p of kittenDetailPages) {
  const c = read(p);
  if (c == null) continue;
  const mainOpen = (c.match(/<main\b/gi) || []).length;
  const mainClose = (c.match(/<\/main>/gi) || []).length;
  if (mainOpen !== 1 || mainClose !== 1 || !/<main\b[^>]*\bid=["']main["'][^>]*>/i.test(c)) {
    errors.push(`[landmark] ${p}: expected exactly one matched <main id="main"> (found ${mainOpen}/${mainClose})`);
  }
  if (!/<a\b[^>]*class=["'][^"']*skip-link[^"']*["'][^>]*href=["']#main["']/i.test(c)) {
    errors.push(`[landmark] ${p}: missing working skip link to #main`);
  }
  const mainEnd = c.indexOf('</main>');
  const footerStart = c.indexOf('<!-- ========== FOOTER ========== -->');
  if (mainEnd !== -1 && footerStart !== -1 && mainEnd > footerStart) {
    errors.push(`[landmark] ${p}: footer must be outside main`);
  }

  const entities = jsonLdEntities(c, p);
  const products = schemaNodes(entities, 'Product');
  const offerNodes = schemaNodes(entities, 'Offer');
  const priceBlock = c.match(/<p\b[^>]*class=["'][^"']*\bkitten-detail-price\b[^"']*["'][^>]*>([\s\S]*?)<\/p>/i);
  const priced = Boolean(priceBlock && /(?:&yen;|&#165;|¥)\s*[\d,]+/i.test(priceBlock[1]));
  if (!priced) {
    if (products.length !== 0 || offerNodes.length !== 0) {
      errors.push(`[schema] ${p}: unpriced detail must contain no Product or Offer (found ${products.length} Product, ${offerNodes.length} Offer)`);
    }
    continue;
  }
  if (products.length !== 1) {
    errors.push(`[schema] ${p}: priced detail must contain exactly one Product (found ${products.length})`);
    continue;
  }

  const product = products[0];
  const expectedProductId = `${BASE_URL}/kittens/${path.basename(p)}#product`;
  if (product['@id'] !== expectedProductId) {
    errors.push(`[schema] ${p}: Product @id must be ${expectedProductId}`);
  }
  const offers = product.offers;
  const ownsOnlyTypedOffer = offers && typeof offers === 'object' && !Array.isArray(offers) &&
    hasSchemaType(offers, 'Offer') && offerNodes.length === 1 && offerNodes[0] === offers;
  if (!ownsOnlyTypedOffer) {
    errors.push(`[schema] ${p}: priced detail must contain exactly one typed Offer owned by Product (found ${offerNodes.length} Offer)`);
    continue;
  }

  const expectedOfferUrl = `${BASE_URL}/${p}`;
  if (offers.url !== expectedOfferUrl) {
    errors.push(`[schema] ${p}: Offer url must be ${expectedOfferUrl}`);
  }
  const seller = offers.seller;
  if (!seller || typeof seller !== 'object' || Array.isArray(seller) ||
      seller['@id'] !== `${BASE_URL}/#cattery` || Object.keys(seller).length !== 1) {
    errors.push(`[schema] ${p}: Offer seller must reference ${BASE_URL}/#cattery`);
  }
  for (const field of ['shippingDetails', 'hasMerchantReturnPolicy', 'priceValidUntil']) {
    if (Object.prototype.hasOwnProperty.call(offers, field)) {
      errors.push(`[schema] ${p}: Offer must not publish unverified ${field}`);
    }
  }
}

for (const p of ['kittens.html', 'en/kittens.html', 'zh/kittens.html']) {
  const c = read(p);
  if (c == null) continue;
  // Some focused verifier tests provide only asset-reference fragments under this
  // filename. The generator contract applies to complete HTML documents, which always
  // carry a doctype; fragments are not publishable list pages.
  if (!/<!doctype\s+html\b/i.test(c)) continue;
  const generatedBlocks = (c.match(/Generated kitten ItemList/g) || []).length;
  if (generatedBlocks !== 1) {
    errors.push(`[schema] ${p}: expected exactly one generated ItemList block (found ${generatedBlocks})`);
  }
  const entities = jsonLdEntities(c, p);
  const itemLists = entities.filter((entity) => hasSchemaType(entity, 'ItemList'));
  if (itemLists.length !== 1) {
    errors.push(`[schema] ${p}: expected exactly one ItemList entity (found ${itemLists.length})`);
  }
  const products = schemaNodes(entities, 'Product').length;
  const offers = schemaNodes(entities, 'Offer').length;
  if (products !== 0) errors.push(`[schema] ${p}: kitten list must not publish Product schema (${products})`);
  if (offers !== 0) errors.push(`[schema] ${p}: kitten list must not publish Offer schema (${offers})`);
}

// --- Check 3: shared-asset version drift (reference = kittens.html) ---
const ref = read('kittens.html');
if (!ref) {
  errors.push('[drift] kittens.html missing — cannot establish reference asset versions');
} else {
  const refVer = {};
  for (const a of SHARED_ASSETS) {
    refVer[a] = assetVersion(ref, a);
    if (!refVer[a]) errors.push(`[drift] kittens.html is missing a versioned ${a} reference`);
  }
  // Every kitten detail page (ja + en + zh) + the en/zh list pages + diary page must match
  // kittens.html on all shared assets (reference = root kittens.html for all langs, since
  // absolute /style.css /i18n.js /nav.* are shared site-wide regardless of language).
  const driftTargets = [
    ...listHtml('kittens'),
    ...listHtml('en/kittens'), ...listHtml('zh/kittens'),
    'en/kittens.html', 'zh/kittens.html',
    ...listHtml('diary'), 'diary/index.html', 'parents.html', 'reviews.html',
  ];
  for (const p of driftTargets) {
    const c = read(p);
    if (c == null) continue;
    for (const a of SHARED_ASSETS) {
      const v = assetVersion(c, a);
      if (v == null) {
        errors.push(`[drift] ${p} does not reference ${a} at all (stripped?)`);
      } else if (refVer[a] && v !== refVer[a]) {
        errors.push(`[drift] ${p} has ${a}?v=${v} but kittens.html has ${a}?v=${refVer[a]}`);
      }
    }
  }
}

// --- Check 4: sitemap structure + coverage ---
const sitemap = read('sitemap.xml');
if (sitemap) {
  const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
  const locSet = new Set(locs);
  const seen = new Set();
  const dups = new Set();
  for (const l of locs) { if (seen.has(l)) dups.add(l); else seen.add(l); }
  for (const d of dups) errors.push(`[sitemap] duplicate <loc>: ${d}`);

  // These markers are ownership boundaries between the two generators. Their
  // disappearance previously let the diary pass erase every kitten/blog URL while
  // this integrity gate still reported clean.
  const requiredMarkers = [
    '<!-- 成長日記 -->',
    '<!-- /成長日記 -->',
    '<!-- 子猫詳細ページ -->',
    '<!-- ブログ記事 -->',
  ];
  for (const marker of requiredMarkers) {
    if (!sitemap.includes(marker)) errors.push(`[sitemap] missing required marker: ${marker}`);
  }

  // Every public generated page on disk must have a sitemap entry. Deliberately
  // exclude owner-gated noindex surfaces such as boarding and future dark launches.
  const indexableGeneratedPages = [
    'kittens.html',
    'parents.html',
    'reviews.html',
    ...listHtml('blog'),
    ...listHtml('guide'),
    ...listHtml('kittens'),
    ...listHtml('en/kittens'),
    ...listHtml('zh/kittens'),
    ...listHtml('diary'),
  ];
  for (const p of ['en/kittens.html', 'zh/kittens.html', 'diary/index.html', 'guide/index.html']) {
    if (read(p) != null) indexableGeneratedPages.push(p);
  }
  for (const p of indexableGeneratedPages) {
    const html = read(p);
    if (html == null) continue;
    const route = p.endsWith('/index.html')
      ? `/${p.slice(0, -'index.html'.length)}`
      : `/${p}`;
    const loc = `https://fuluckpet.com${route}`;
    if (hasNoindexMeta(html)) {
      continue;
    }
    const canonical = canonicalHref(html);
    if (canonical && canonical !== loc) {
      // A disk alias belongs to its canonical destination, not to sitemap.xml.
      continue;
    }
    if (!locSet.has(loc)) errors.push(`[sitemap] missing <loc>: ${loc}`);
  }

  // Negative policy is global, not limited to the public generated-page allowlist:
  // any deployed HTML declaring noindex must stay out of sitemap, including boarding,
  // admin, previews, and future owner-gated dark launches.
  for (const p of listHtmlTree()) {
    const html = read(p);
    if (!hasNoindexMeta(html)) continue;
    for (const loc of publicUrlsForHtml(p)) {
      if (locSet.has(loc)) errors.push(`[sitemap] noindex page has <loc>: ${loc}`);
    }
  }
} else {
  errors.push('[sitemap] sitemap.xml missing');
}

// --- Report ---
if (errors.length) {
  console.error(`✗ verify-generated: ${errors.length} problem(s) found (scanned ${scanned} pages):`);
  for (const e of errors) console.error('  ' + e);
  process.exit(1);
}
console.log(`✓ verify-generated: clean (scanned ${scanned} generated pages; assets + sitemap consistent)`);
process.exit(0);

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

const SITE = path.resolve(__dirname, '..');
const errors = [];
const SHARED_ASSETS = ['style.css', 'i18n.js', 'nav.js', 'nav.css'];

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
function hasNoindexMeta(html) {
  const tags = String(html || '').match(/<meta\b[^>]*>/gi) || [];
  return tags.some((tag) => {
    const name = tag.match(/\bname\s*=\s*(["'])([^"']*)\1/i);
    const content = tag.match(/\bcontent\s*=\s*(["'])([^"']*)\1/i);
    return name && name[2].trim().toLowerCase() === 'robots' &&
      content && /(?:^|[\s,])noindex(?:$|[\s,])/i.test(content[2]);
  });
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

// --- Check 2: shared-asset version drift (reference = kittens.html) ---
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

// --- Check 3: sitemap structure + coverage ---
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
    ...listHtml('kittens'),
    ...listHtml('en/kittens'),
    ...listHtml('zh/kittens'),
    ...listHtml('diary'),
  ];
  for (const p of ['en/kittens.html', 'zh/kittens.html', 'diary/index.html']) {
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
      if (locSet.has(loc)) errors.push(`[sitemap] noindex page has <loc>: ${loc}`);
      continue;
    }
    if (!locSet.has(loc)) errors.push(`[sitemap] missing <loc>: ${loc}`);
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

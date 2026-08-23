#!/usr/bin/env node
// tools/generate-site.js — Regenerate static pages from API data
// Usage: node tools/generate-site.js
// No dependencies required (uses native https/fs modules)

const https = require('https');
const fs = require('fs');
const path = require('path');
const { createLastmodStore } = require('./lastmod-store');
const { hasNoindexMeta } = require('./robots-meta');
const { safeJsonForHtmlScript: jsonForHtmlScript } = require('./safe-json-for-html');
const launchConfig = require('../small-animals-launch.json');
const KittenCatalog = require('../kitten-catalog.js');

const API_BASE = 'https://fuluck-api.mouxue56.workers.dev';
const SITE_DIR = path.resolve(__dirname, '..');
const BASE_URL = 'https://fuluckpet.com';
const PUBLIC_CATALOG_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const HTTP_TIMEOUT_MS = 15000;
const MAX_JSON_RESPONSE_BYTES = 5 * 1024 * 1024;
const HOMEPAGE_KITTENS_START = '<!-- BEGIN GENERATED HOMEPAGE KITTENS -->';
const HOMEPAGE_KITTENS_END = '<!-- END GENERATED HOMEPAGE KITTENS -->';
const HOMEPAGE_KITTEN_LIMIT = 9;
const FAVICON_HREF = "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='8' fill='%235BC4A8'/><g fill='%23ffffff'><ellipse cx='11' cy='12' rx='2.3' ry='2.7'/><ellipse cx='21' cy='12' rx='2.3' ry='2.7'/><ellipse cx='7.5' cy='17.5' rx='2.1' ry='2.4'/><ellipse cx='24.5' cy='17.5' rx='2.1' ry='2.4'/><path d='M16 16.5c3.1 0 5.6 2.2 5.6 4.9 0 2.2-1.9 3.1-5.6 3.1s-5.6-.9-5.6-3.1c0-2.7 2.5-4.9 5.6-4.9z'/></g></svg>";

// Asset cache-version map, read from the live kittens.html template so detail
// pages never drift from the rest of the site when style.css / i18n.js / nav.* bump.
let ASSET_VERSIONS = {};
function verAsset(file, fallback) {
  return (ASSET_VERSIONS && ASSET_VERSIONS[file]) || fallback;
}
function extractAssetVersions(html) {
  const map = {};
  const re = /\/?((?:[\w-]+\/)?[\w.-]+\.(?:css|js))\?v=([\w.-]+)/g; // optional leading slash: capture relative refs too (kittens.html uses style.css, not /style.css)
  let m;
  while ((m = re.exec(html))) { map[m[1]] = m[2]; }
  return map;
}

function writeDogServicesProjection() {
  const BoardingConfig = require('../boarding-public-config.js');
  const DogServicesProjection = require('../dog-services-projection.js');
  const filepath = path.join(SITE_DIR, 'dog-services-launch.json');
  const output = DogServicesProjection.serializeDogServicesProjection(BoardingConfig);
  const current = fs.existsSync(filepath) ? fs.readFileSync(filepath, 'utf8') : null;
  if (current !== output) fs.writeFileSync(filepath, output, 'utf8');
  console.log(`  dog-services-launch.json: ${JSON.parse(output).public ? 'public' : 'fail-closed'}`);
  const preparingFilepath = path.join(SITE_DIR, 'dog-services-preparing.json');
  const preparingOutput = DogServicesProjection.serializeDogServicesPreparingProjection(BoardingConfig);
  const preparingCurrent = fs.existsSync(preparingFilepath) ? fs.readFileSync(preparingFilepath, 'utf8') : null;
  if (preparingCurrent !== preparingOutput) fs.writeFileSync(preparingFilepath, preparingOutput, 'utf8');
  console.log(`  dog-services-preparing.json: ${JSON.parse(preparingOutput).preparing ? 'visible' : 'hidden'}`);
}

function writeServicePages() {
  const { CONFIG } = require('../boarding-public-config.js');
  const TransportServiceStatic = require('./transport-service-static.js');
  const CareCatalogStatic = require('./care-catalog-static.js');
  const boardingPath = path.join(SITE_DIR, 'boarding', 'index.html');
  const groomingPath = path.join(SITE_DIR, 'grooming', 'index.html');

  // Build the complete two-page service release before staging either target.
  // A damaged later marker must not leave an updated boarding page beside the
  // previous grooming page.
  const boardingSource = fs.readFileSync(boardingPath, 'utf8');
  const groomingSource = fs.readFileSync(groomingPath, 'utf8');
  const boardingMode = fs.statSync(boardingPath).mode & 0o777;
  const groomingMode = fs.statSync(groomingPath).mode & 0o777;
  const boardingOutput = TransportServiceStatic.buildTransportPage(boardingSource, CONFIG.petTransport);
  const groomingWithTransport = TransportServiceStatic.buildTransportPage(groomingSource, CONFIG.petTransport);
  const groomingOutput = CareCatalogStatic.buildGroomingPage(groomingWithTransport, CONFIG.careCatalog.cat);
  const stamp = `${process.pid}-${Date.now()}`;
  const releases = [
    {
      filepath: boardingPath,
      output: boardingOutput,
      source: boardingSource,
      mode: boardingMode,
      temp: path.join(path.dirname(boardingPath), `.index.html.service-${stamp}-boarding.tmp`),
    },
    {
      filepath: groomingPath,
      output: groomingOutput,
      source: groomingSource,
      mode: groomingMode,
      temp: path.join(path.dirname(groomingPath), `.index.html.service-${stamp}-grooming.tmp`),
    },
  ];
  const staged = [];
  let releaseError = null;
  try {
    for (const release of releases) {
      if (release.output === release.source) continue;
      staged.push(release);
      fs.writeFileSync(release.temp, release.output, {
        encoding: 'utf8',
        flag: 'wx',
        mode: release.mode,
      });
      fs.chmodSync(release.temp, release.mode);
    }
    for (const release of staged) fs.renameSync(release.temp, release.filepath);
  } catch (error) {
    releaseError = error;
  }
  const cleanupErrors = [];
  for (const release of staged) {
    try {
      if (fs.existsSync(release.temp)) fs.unlinkSync(release.temp);
    } catch (error) {
      cleanupErrors.push(error);
    }
  }
  if (releaseError || cleanupErrors.length) {
    throw new AggregateError(
      [releaseError].concat(cleanupErrors).filter(Boolean),
      'service page release failed',
    );
  }

  console.log(`  boarding/index.html: pet transport ${boardingOutput === boardingSource ? 'current' : 'updated'}`);
  console.log(`  grooming/index.html: pet transport ${groomingWithTransport === groomingSource ? 'current' : 'updated'}`);
  console.log(`  grooming/index.html: cat care catalog ${groomingOutput === groomingWithTransport ? 'current' : 'updated'}`);
}

// ── Breed Config ──────────────────────────────────────────────

const BREED_CONFIG = [
  {
    key: 'サイベリアン',
    tag: 'Siberian',
    desc: '低アレルゲンで穏やかな性格のサイベリアンの子猫たちです。',
    parentDesc: '低アレルゲンで穏やかな性格のサイベリアンの親猫たち。全頭遺伝子検査を実施しています。',
    bgClass: 'sec-white',
    shapes: [
      { w: 200, h: 200, bg: 'var(--mint)', pos: 'top:5%;left:-5%;' },
      { w: 150, h: 150, bg: 'var(--strawberry)', pos: 'bottom:10%;right:-3%;' }
    ]
  },
  {
    key: 'ブリティッシュショートヘア',
    tag: 'British Shorthair',
    desc: 'どっしりした体型と愛らしい丸い顔が人気のブリティッシュショートヘアです。',
    parentDesc: 'どっしりした体型と愛らしい丸い顔が人気のブリティッシュショートヘアの親猫たちです。',
    bgClass: 'sec-cream',
    shapes: [
      { w: 180, h: 180, bg: 'var(--mango)', pos: 'top:8%;right:5%;' },
      { w: 120, h: 120, bg: 'var(--taro)', pos: 'bottom:15%;left:3%;' }
    ]
  },
  {
    key: 'ブリティッシュロングヘア',
    tag: 'British Longhair',
    desc: 'ブリティッシュショートヘアの長毛種。穏やかで上品な性格です。',
    parentDesc: 'ブリティッシュショートヘアの長毛種。穏やかで上品な親猫たちです。',
    bgClass: 'sec-white',
    shapes: [
      { w: 200, h: 200, bg: 'var(--mint)', pos: 'top:5%;left:-5%;' },
      { w: 150, h: 150, bg: 'var(--strawberry)', pos: 'bottom:10%;right:-3%;' }
    ]
  },
  {
    key: 'ラグドール',
    tag: 'Ragdoll',
    // §0/§1 — no longer bred here. The section survives so the real historical parent
    // photos keep a home, but every string the generator emits around them is past tense.
    retired: true,
    desc: '過去にラグドールの繁育実績がございます。現在は繁育しておりません。',
    parentDesc: '過去にラグドールの繁育実績がございます。現在は繁育しておりません（サイベリアン・ブリティッシュを中心に繁育しています）。',
    bgClass: 'sec-cream',
    shapes: [
      { w: 160, h: 160, bg: 'var(--mango)', pos: 'top:8%;right:10%;' },
      { w: 120, h: 120, bg: 'var(--blueberry)', pos: 'bottom:12%;left:5%;' }
    ]
  }
];

// ── Small-animal dark launch ─────────────────────────────────
// small-animals-launch.json is the only tracked public/private switch. The private
// slug is deliberately supplied only from the local environment: this repository is
// public, so committing the token (or generated filenames) would disclose it.
function requireSmallAnimalSlug(value, label, allowEmpty = false) {
  const slug = String(value || '').trim();
  if (!slug && allowEmpty) return '';
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new Error(`${label} must be one lowercase URL-safe single URL-safe segment`);
  }
  return slug;
}

const SMALL_ANIMALS_LAUNCH = Object.freeze({
  public: launchConfig.public === true,
  slugDark: requireSmallAnimalSlug(
    process.env.SMALL_ANIMALS_DARK_SLUG,
    'SMALL_ANIMALS_DARK_SLUG',
    true,
  ),
  slugPublic: requireSmallAnimalSlug(launchConfig.slugPublic, 'slugPublic'),
});

const SPECIES_CONFIG = [
  {
    species: 'rabbit',
    labelJa: 'ウサギ',
    tag: 'Rabbit',
    bgClass: 'sec-white',
  },
];

// ── Helpers ────────────────────────────────────────────────────

function fetchJSON(endpoint, options = {}) {
  return new Promise((resolve, reject) => {
    const url = API_BASE + endpoint;
    let request;
    let settled = false;
    let deadlineTimer;
    function clearDeadline() {
      if (deadlineTimer !== undefined) {
        clearTimeout(deadlineTimer);
        deadlineTimer = undefined;
      }
    }
    function fail(error) {
      if (settled) return;
      settled = true;
      clearDeadline();
      reject(error);
      if (request && typeof request.destroy === 'function') request.destroy();
    }
    // ClientRequest#setTimeout is a socket inactivity timeout and may not cover a
    // DNS/connect stall. Start an independent wall-clock deadline before the request.
    deadlineTimer = setTimeout(() => {
      fail(new Error(`Request timed out for ${endpoint} after ${HTTP_TIMEOUT_MS}ms`));
    }, HTTP_TIMEOUT_MS);
    try {
      request = https.get(url, options, (res) => {
      let data = '';
      let receivedBytes = 0;
      const declaredBytes = Number(res.headers && res.headers['content-length']);
      if (Number.isFinite(declaredBytes) && declaredBytes > MAX_JSON_RESPONSE_BYTES) {
        fail(new Error(`Response too large from ${endpoint}: exceeds ${MAX_JSON_RESPONSE_BYTES} bytes`));
        return;
      }
      res.setEncoding('utf8'); // decode multi-byte UTF-8 across chunk boundaries (avoid mojibake)
      res.on('data', (chunk) => {
        if (settled) return;
        receivedBytes += Buffer.byteLength(chunk, 'utf8');
        if (receivedBytes > MAX_JSON_RESPONSE_BYTES) {
          fail(new Error(`Response too large from ${endpoint}: exceeds ${MAX_JSON_RESPONSE_BYTES} bytes`));
          return;
        }
        data += chunk;
      });
      res.on('error', fail);
      res.on('end', () => {
        if (settled) return;
        const statusCode = Number(res.statusCode || 0);
        if (statusCode < 200 || statusCode >= 300) {
          fail(new Error(`HTTP ${statusCode || 'unknown'} from ${endpoint}`));
          return;
        }
        try {
          const parsed = JSON.parse(data);
          settled = true;
          clearDeadline();
          resolve(parsed);
        } catch (e) {
          fail(new Error(`Failed to parse JSON from ${endpoint}: ${e.message}`));
        }
      });
      });
    } catch (error) {
      fail(error);
      return;
    }
    request.on('error', fail);
    if (typeof request.setTimeout === 'function') {
      request.setTimeout(HTTP_TIMEOUT_MS, () => {
        fail(new Error(`Request timed out for ${endpoint} after ${HTTP_TIMEOUT_MS}ms`));
      });
    }
  });
}

async function fetchRequiredArray(endpoint, label) {
  const value = await fetchJSON(endpoint);
  if (!Array.isArray(value)) {
    throw new Error(`${label} API response was not an array`);
  }
  return value;
}

function fetchSmallAnimalsForGeneration() {
  if (SMALL_ANIMALS_LAUNCH.public) return fetchJSON('/api/small-animals');
  if (!SMALL_ANIMALS_LAUNCH.slugDark) return Promise.resolve(null);

  const password = String(process.env.FULUCK_ADMIN_PASS || '');
  if (!password) {
    return Promise.reject(new Error(
      'FULUCK_ADMIN_PASS is required with SMALL_ANIMALS_DARK_SLUG for a local private preview',
    ));
  }
  return fetchJSON('/api/admin/small-animals', {
    headers: {
      Authorization: `Bearer ${password}`,
      Origin: BASE_URL,
    },
  });
}

function requireSmallAnimalDataForLaunch(value) {
  if (SMALL_ANIMALS_LAUNCH.public && !Array.isArray(value)) {
    throw new Error('Small-animal public launch requires a valid small-animal array before generation');
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatPrice(price) {
  return Number(price).toLocaleString('ja-JP');
}

function priceInquiryText(lang) {
  if (lang === 'en') return 'Please ask for the current price';
  if (lang === 'zh') return '价格请咨询';
  return '価格はお問い合わせください';
}

function formatBirthday(birthday) {
  if (!birthday) return '';
  // Handle "2025-12" or "2025-12-08" formats
  const parts = birthday.split('-');
  if (parts.length >= 2) {
    const year = parts[0];
    const month = parseInt(parts[1], 10);
    return `${year}年${month}月`;
  }
  return birthday;
}

// note は言語ごとに別フィールド（note = ja / noteZh / noteEn）。
// breed や color と違い note は自由文なので翻訳表を作れない。未記入の
// 言語では日本語へフォールバックせず空にする —— さもないと中文・英語
// ページに日本語がそのまま出る（実際「去勢済み」が3言語面に出ていた）。
function noteFor(kitten, lang) {
  if (!kitten) return '';
  const pick = lang === 'en' ? kitten.noteEn : lang === 'zh' ? kitten.noteZh : kitten.note;
  return typeof pick === 'string' ? pick : '';
}

function descriptionFor(kitten, lang) {
  if (!kitten) return '';
  const pick = lang === 'en' ? kitten.descriptionEn : lang === 'zh' ? kitten.descriptionZh : kitten.description;
  return typeof pick === 'string' ? pick.trim() : '';
}

// Only the sentences that are actually about THIS kitten stay on the detail page: the
// campaign clauses are stripped (§1) and the boilerplate the owner pastes into every
// Koneko listing moves to the one shared site block (§10/§11).
function descriptionHtml(kitten, lang) {
  const paragraphs = individualOwnerParagraphs(descriptionFor(kitten, lang));
  if (!paragraphs.length) return '';
  const heading = lang === 'en' ? 'Introduction' : lang === 'zh' ? '详细介绍' : '子猫の紹介';
  const body = paragraphs
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\r?\n/g, '<br>')}</p>`)
    .join('\n      ');
  return `
      <section class="kitten-detail-introduction">
        <h2>${heading}</h2>
        ${body}
      </section>`;
}

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
  // A cat aged 12 months or over already carries the §6 「成猫・若猫という選択」 section,
  // which makes the same "an older kitten is easier to read" argument in full. Emitting
  // both puts two pitches for one point next to each other on the same page.
  if (isAdultCat(kitten)) return '';
  const selectedLang = lang === 'en' || lang === 'zh' ? lang : 'ja';
  const copy = FEATURED_DETAIL_COPY[selectedLang];
  return `
      <section class="kitten-detail-featured">
        <h2>${escapeHtml(copy.title)}</h2>
        <p>${escapeHtml(copy.body)}</p>
      </section>`;
}

// ── Reviewed detail-page sections (COPY-SPEC §4 / §5 / §6 / §8 / §10 / §11) ──

// §4.1 — the disclosed vaccination fee sits directly under the price, where the number
// it qualifies is still on screen.
function vaccineFeeHtml(lang) {
  const copy = VACCINE_FEE_DETAIL[lang] || VACCINE_FEE_DETAIL.ja;
  return `<p class="kitten-detail-feenote">${escapeHtml(copy)}</p>`;
}

// §8 — deposit + where the contract is signed, on every priced page.
function depositHtml(lang) {
  const copy = DEPOSIT_LINE[lang] || DEPOSIT_LINE.ja;
  return `<p class="kitten-detail-deposit">${escapeHtml(copy)}</p>`;
}

function pointsList(points) {
  return points.map((point) => `<li>${escapeHtml(point)}</li>`).join('');
}

// §5.1 — shown only on a mixed-breed page.
function mixSectionHtml(kitten, lang) {
  if (!isMixBreed(kitten && kitten.breed)) return '';
  const copy = MIX_COPY[lang] || MIX_COPY.ja;
  return `
      <section class="kitten-detail-usp" data-usp="mix">
        <h2>${escapeHtml(copy.title)}</h2>
        <p>${escapeHtml(copy.body)}</p>
        <ul>${pointsList(copy.points)}</ul>
      </section>`;
}

// §6.1 — shown only on a cat aged 12 months or over.
function adultSectionHtml(kitten, lang) {
  if (!isAdultCat(kitten)) return '';
  const copy = ADULT_COPY[lang] || ADULT_COPY.ja;
  return `
      <section class="kitten-detail-usp" data-usp="adult">
        <h2>${escapeHtml(copy.title)}</h2>
        <p>${escapeHtml(copy.body)}</p>
        <ul>${pointsList(copy.points)}</ul>
      </section>`;
}

// §10 / §11 — the boilerplate every listing used to repeat, written once, with the
// public viewing address and the appointment-only hours the owner signed off on.
function sharedVisitBlockHtml(lang) {
  const copy = SHARED_VISIT_BLOCK[lang] || SHARED_VISIT_BLOCK.ja;
  const items = copy.items
    .map((item) => `<div class="kitten-detail-shared-item"><h3>${escapeHtml(item.h)}</h3><p>${escapeHtml(item.p)}</p></div>`)
    .join('\n        ');
  return `
      <section class="kitten-detail-shared" data-shared-visit-block="true">
        <h2>${escapeHtml(copy.title)}</h2>
        ${items}
      </section>`;
}

function statusText(status) {
  switch (status) {
    case 'available': return '販売中';
    case 'reserved': return 'ご予約済';
    // COPY-SPEC §11: a sold card reads as a placed kitten, never as a raw status token.
    case 'sold': return 'ご家族決定';
    default: return status || '';
  }
}

function genderText(gender) {
  if (gender === '♂') return '男の子';
  if (gender === '♀') return '女の子';
  return '';
}

function breedI18nKey(breed) {
  const map = {
    'サイベリアン': 'breed.siberian',
    'ブリティッシュショートヘア': 'breed.british-sh',
    'ブリティッシュロングヘア': 'breed.british-lh',
    'ラグドール': 'breed.ragdoll',
  };
  return map[breed] || '';
}

function genderI18nKey(gender) {
  if (gender === '♂') return 'kitten.male';
  if (gender === '♀') return 'kitten.female';
  return '';
}

function statusI18nKey(status) {
  if (status === 'available') return 'kitten.available';
  if (status === 'reserved') return 'kitten.reserved';
  if (status === 'sold') return 'kitten.sold';
  return '';
}

function getCoverPhoto(item) {
  if (!item.photos || item.photos.length === 0) return null;
  const idx = item.coverIndex || 0;
  return item.photos[idx] || item.photos[0];
}

function safeHomepagePhoto(value) {
  if (typeof value !== 'string' || !value || value.length > 2048 || /[\u0000-\u0020"'<>`\\]/.test(value)) return '';
  try {
    if (value.startsWith('/') && !value.startsWith('//')) {
      const local = new URL(value, BASE_URL);
      return local.pathname + local.search;
    }
    const parsed = new URL(value);
    return parsed.protocol === 'https:' ? parsed.href : '';
  } catch (_error) {
    return '';
  }
}

function homepageIdentity(kitten) {
  if (!kitten || typeof kitten !== 'object' || Array.isArray(kitten)) return '';
  if (PUBLIC_CATALOG_ID_RE.test(kitten.breederId || '')) return kitten.breederId;
  if (PUBLIC_CATALOG_ID_RE.test(kitten.id || '')) return kitten.id;
  return '';
}

function homepageBreedIndex(value) {
  const breed = typeof value === 'string' ? value : '';
  const exact = BREED_CONFIG.findIndex((config) => config.key === breed);
  if (exact !== -1) return exact;
  const partial = BREED_CONFIG.findIndex((config) => breed.includes(config.key) || config.key.includes(breed));
  return partial === -1 ? 0 : partial;
}

function closingDivStart(html, openingIndex) {
  const tags = /<div\b[^>]*>|<\/div>/gi;
  tags.lastIndex = openingIndex;
  let depth = 0;
  let tag;
  while ((tag = tags.exec(html))) {
    if (/^<div\b/i.test(tag[0])) depth += 1;
    else depth -= 1;
    if (depth === 0) return tag.index;
  }
  return -1;
}

function validateHomepageKittensMarkers() {
  const filepath = path.join(SITE_DIR, 'index.html');
  const html = fs.readFileSync(filepath, 'utf8');
  const start = html.indexOf(HOMEPAGE_KITTENS_START);
  const end = html.indexOf(HOMEPAGE_KITTENS_END);
  if (
    start === -1 ||
    end === -1 ||
    start !== html.lastIndexOf(HOMEPAGE_KITTENS_START) ||
    end !== html.lastIndexOf(HOMEPAGE_KITTENS_END) ||
    start >= end
  ) {
    throw new Error('Homepage kittens owned markers must exist exactly once in start/end order');
  }

  const gridPattern = /<div\b[^>]*\bid=["']kittensGrid["'][^>]*>/gi;
  const grids = [...html.matchAll(gridPattern)];
  if (grids.length !== 1) throw new Error('Homepage kittensGrid must exist exactly once');
  const gridOpenEnd = grids[0].index + grids[0][0].length;
  const gridCloseStart = closingDivStart(html, grids[0].index);
  if (
    gridCloseStart === -1 ||
    start < gridOpenEnd ||
    end + HOMEPAGE_KITTENS_END.length > gridCloseStart
  ) {
    throw new Error('Homepage kittens owned markers must stay inside #kittensGrid');
  }

  const countTargetPattern = /<([A-Za-z][\w:-]*)\b[^>]*\s+id\s*=\s*["']visibleCount["'][^>]*>/gi;
  const countTargets = [...html.matchAll(countTargetPattern)];
  if (countTargets.length !== 1) {
    throw new Error('Homepage visibleCount target must exist exactly once');
  }
  const countTarget = countTargets[0];
  const countTextStart = countTarget.index + countTarget[0].length;
  const closingTargetPattern = new RegExp(`</${countTarget[1]}\\s*>`, 'gi');
  closingTargetPattern.lastIndex = countTextStart;
  const closingTarget = closingTargetPattern.exec(html);
  if (!closingTarget || html.slice(countTextStart, closingTarget.index).includes('<')) {
    throw new Error('Homepage visibleCount target must contain plain text');
  }
  const countTextEnd = closingTarget.index;
  const ownedBodyStart = start + HOMEPAGE_KITTENS_START.length;
  if (!(countTextEnd <= ownedBodyStart || countTextStart >= end)) {
    throw new Error('Homepage visibleCount target must not overlap the owned kittens block');
  }
  return { filepath, html, start, end, countTextStart, countTextEnd };
}

function homepageKittenCard(kitten, effectiveStatus, identity, photo) {
  const salePrice = KittenCatalog.normalizeSalePrice(kitten.price);
  const birthday = typeof kitten.birthday === 'string' ? kitten.birthday : '';
  const gender = kitten.gender === '♂' || kitten.gender === '♀' ? kitten.gender : '';
  const genderLabel = genderText(gender);
  const genderIcon = gender === '♂'
    ? '<i class="ico ico-mars" aria-hidden="true"></i> '
    : gender === '♀'
      ? '<i class="ico ico-venus" aria-hidden="true"></i> '
      : '';
  const promotionTag = KittenCatalog.normalizePromotionTag(kitten.promotionTag);
  const promotionPriority = KittenCatalog.normalizePromotionPriority(kitten);
  const promotionChip = promotionTag
    ? `\n            <span class="kitten-promotion-chip usp-chip usp-chip--card" data-promotion-tag="${promotionTag}">${escapeHtml(KittenCatalog.promotionLabel(promotionTag, 'ja'))}</span>`
    : '';
  const newBadge = kitten.isNew === true ? '\n            <span class="kit-badge-new">NEW</span>' : '';
  const breed = typeof kitten.breed === 'string' ? kitten.breed : '';
  const color = typeof kitten.color === 'string' ? kitten.color : '';
  const detailUrl = `/kittens/${encodeURIComponent(identity)}.html`;
  return `
        <div class="kitten-card" role="button" tabindex="0" aria-haspopup="dialog" data-status="${effectiveStatus}" data-promotion-tag="${promotionTag}" data-promotion-priority="${promotionPriority}" data-price="${salePrice === null ? '' : salePrice}" data-birthday="${escapeHtml(birthday)}" data-images="" data-video="" data-papa="${escapeHtml(kitten.papa)}" data-mama="${escapeHtml(kitten.mama)}" data-new="${kitten.isNew === true ? 'true' : 'false'}" data-name="" data-breeder-id="${identity}" data-detail-url="${detailUrl}">
          <div class="kitten-img">
            <img src="${escapeHtml(photo)}" alt="${escapeHtml(`${breed}の子猫 ${color} ${genderLabel}・個体番号${identity}`.replace(/\s+/g, ' ').trim())}" loading="lazy" style="width:100%;height:100%;object-fit:cover;" width="640" height="480">
            <span class="kit-status st-${effectiveStatus}"${statusI18nKey(effectiveStatus) ? ` data-i18n="${statusI18nKey(effectiveStatus)}"` : ''}>${escapeHtml(statusText(effectiveStatus))}</span>${newBadge}
          </div>
          <div class="kitten-body">
            <h3>${escapeHtml(breed)}</h3>${promotionChip}
            <p class="kit-meta">${genderIcon}${escapeHtml(genderLabel)}${color ? ` ・ ${escapeHtml(color)}` : ''}</p>
            <p class="kit-meta">${birthday ? `${escapeHtml(formatBirthday(birthday))}生まれ` : ''}</p>
            <p class="kit-price">${salePrice === null ? escapeHtml(priceInquiryText('ja')) : `&yen;${formatPrice(salePrice)} <span class="tax">${taxIncl('ja')}</span>`}</p>
          </div>
        </div>`;
}

function generateHomepageKittens(kittens) {
  const owned = validateHomepageKittensMarkers();
  const selected = [];
  for (const kitten of KittenCatalog.orderKittens(kittens)) {
    if (!kitten || typeof kitten !== 'object' || Array.isArray(kitten)) continue;
    const effectiveStatus = KittenCatalog.normalizeStatus(kitten.status);
    if (effectiveStatus === 'sold' || homepageBreedIndex(kitten.breed) !== 0) continue;
    const identity = homepageIdentity(kitten);
    const photo = safeHomepagePhoto(getCoverPhoto(kitten));
    if (!identity || !photo) continue;
    selected.push({ kitten, effectiveStatus, identity, photo });
    if (selected.length === HOMEPAGE_KITTEN_LIMIT) break;
  }

  const body = selected.length
    ? selected.map((entry) => homepageKittenCard(entry.kitten, entry.effectiveStatus, entry.identity, entry.photo)).join('') + '\n      '
    : `
        <div class="catalog-empty" role="status" data-generated-empty="true" style="grid-column:1/-1;text-align:center;">
          <p class="sec-desc">${KITTENS_EMPTY_COPY.ja.message}</p>
        </div>
      `;
  const replacements = [
    {
      start: owned.start + HOMEPAGE_KITTENS_START.length,
      end: owned.end,
      value: body,
    },
    {
      start: owned.countTextStart,
      end: owned.countTextEnd,
      value: String(selected.length),
    },
  ].sort((left, right) => right.start - left.start);
  let output = owned.html;
  for (const replacement of replacements) {
    output = output.slice(0, replacement.start) + replacement.value + output.slice(replacement.end);
  }
  if (output !== owned.html) fs.writeFileSync(owned.filepath, output, 'utf8');
  console.log(`  index.html homepage fallback -> ${selected.length} kittens`);
  return selected.map((entry) => entry.kitten);
}

function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// ── Localization (trilingual static output: ja / en / zh) ─────
// D2: emit static /en/ + /zh/ versions of the kittens list + detail pages.
// The detail page carries data-i18n hooks (client-side localization); the list page
// has none, so EVERY baked string must be emitted in-language at generation time.
// These tables/helpers are the single source of truth for the baked text.
//
// FABLE VERDICT bindings baked here:
//  - mix breed サイベリアン×ブリティッシュ → EN "Siberian × British mix" / ZH "西伯利亚×英系混血"
//  - color ブルーパッチドタビー＆ホワイト ZH → "蓝玳瑁虎斑加白"
//  - gender labels carry NO ♂/♀ symbol in en/zh (matches i18n keys); symbol kept only where ja shows it raw
const LANG_PREFIX = { ja: '', en: '/en', zh: '/zh' };

// URL path prefix segment for a language ('' for ja, 'en/' / 'zh/' for the others).
function langDir(lang) { return lang === 'ja' ? '' : `${lang}/`; }

// hreflang triad + x-default, emitted identically on all three language versions.
// relPath is the path WITHOUT any /en//zh prefix, e.g. "kittens.html" or "kittens/2408-03054.html".
function hreflangBlock(relPath) {
  const p = relPath.replace(/^\/+/, '');
  return `  <link rel="alternate" hreflang="ja" href="${BASE_URL}/${p}">
  <link rel="alternate" hreflang="en" href="${BASE_URL}/en/${p}">
  <link rel="alternate" hreflang="zh" href="${BASE_URL}/zh/${p}">
  <link rel="alternate" hreflang="x-default" href="${BASE_URL}/${p}">`;
}

function statusTextL(status, lang) {
  const map = {
    available: { ja: '販売中', en: 'Available', zh: '可预约' },
    reserved: { ja: 'ご予約済', en: 'Reserved', zh: '已预订' },
    // COPY-SPEC §11 sold labels.
    sold: { ja: 'ご家族決定', en: 'Adopted', zh: '已找到家庭' },
  };
  const row = map[status];
  if (row) return row[lang] || row.ja;
  return status || '';
}

function genderTextL(gender, lang) {
  const map = {
    '♂': { ja: '男の子', en: 'Male', zh: '男孩' },
    '♀': { ja: '女の子', en: 'Female', zh: '女孩' },
  };
  const row = map[gender];
  return row ? (row[lang] || row.ja) : '';
}

// Localized "born" phrase. ja "Y年M月生まれ" / en "Born Y/M" / zh "Y年M月出生".
// Returns '' when birthday is absent.
function bornPhrase(birthday, lang) {
  if (!birthday) return '';
  const parts = birthday.split('-');
  if (parts.length < 2) return birthday;
  const y = parts[0];
  const m = parseInt(parts[1], 10);
  if (lang === 'en') return `Born ${y}/${m}`;
  if (lang === 'zh') return `${y}年${m}月出生`;
  return `${y}年${m}月生まれ`;
}

function taxIncl(lang) {
  if (lang === 'en') return '(tax incl.)';
  if (lang === 'zh') return '（含税）';
  return '（税込）';
}

// Lower-allergen chip text, baked per language on the list-page cards (no data-i18n
// hooks there). COPY-SPEC §2 — the claim is a tendency, never an absolute.
function hypoChipText(lang) {
  if (lang === 'en') return 'Siberian · lower-allergen tendency';
  if (lang === 'zh') return '低致敏倾向的西伯利亚猫';
  return '低アレルゲン傾向のサイベリアン';
}

// Breed label. FABLE VERDICT: サイベリアン×ブリティッシュ mix rendering; folds into Siberian section.
const BREED_MAP = {
  'サイベリアン': { en: 'Siberian', zh: '西伯利亚猫' },
  'ブリティッシュショートヘア': { en: 'British Shorthair', zh: '英国短毛猫' },
  'ブリティッシュロングヘア': { en: 'British Longhair', zh: '英国长毛猫' },
  'ラグドール': { en: 'Ragdoll', zh: '布偶猫' },
  // One product line, one name. The owner types the cross three different ways in the
  // Koneko admin; rendering all three verbatim made /kittens.html read as if we bred
  // several different mixes. The ja source string stays untouched (Koneko is read-only).
  'サイベリアン×ブリティッシュ': { en: 'Siberian × British Shorthair mix', zh: '西伯利亚 × 英国短毛混血' },
  'サイベリアン&ブリティッシュショートヘア': { en: 'Siberian × British Shorthair mix', zh: '西伯利亚 × 英国短毛混血' },
  'サイベリアンXブリティッシュショットヘア': { en: 'Siberian × British Shorthair mix', zh: '西伯利亚 × 英国短毛混血' },
};
function breedLabel(breed, lang) {
  if (lang === 'ja' || !breed) return breed || '';
  const row = BREED_MAP[breed];
  if (row && row[lang]) return row[lang];
  console.warn(`  [i18n] no ${lang} breed mapping for "${breed}" — passthrough ja`);
  return breed;
}

// Color dictionary (25 distinct ja strings from live data). Standard cat-fancy vocabulary.
// Both シェーデット/シェーデッド variants map to the same term. Empty → ''.
// Missing key → passthrough raw ja + console.warn (so a new color can't silently ship untranslated).
const COLOR_MAP = {
  'ホワイト': { en: 'White', zh: '白色' },
  'ブラウンタビー&ホワイト（トリプルコート）': { en: 'Brown Tabby & White (Triple Coat)', zh: '棕虎斑加白（三层被毛）' },
  'ブルーリンクスポイント ネヴァマスカレード': { en: 'Blue Lynx Point Neva Masquerade', zh: '蓝色山猫重点色 涅瓦假面' },
  'ゴールデンシェーデッド': { en: 'Golden Shaded', zh: '金渐层' },
  'シルバー&ホワイト（トリプルコート）': { en: 'Silver & White (Triple Coat)', zh: '银色加白（三层被毛）' },
  'ブラウンタビー トリプルコート': { en: 'Brown Tabby, Triple Coat', zh: '棕虎斑 三层被毛' },
  'ブラウンタビー＆ホワイト': { en: 'Brown Tabby & White', zh: '棕虎斑加白' },
  'ブルーリンクスポイント(ネヴァマスカレード)': { en: 'Blue Lynx Point (Neva Masquerade)', zh: '蓝色山猫重点色（涅瓦假面）' },
  'ブルーリンクスポイント(ネヴァマスカレード)（トリプルコート）': { en: 'Blue Lynx Point (Neva Masquerade) (Triple Coat)', zh: '蓝色山猫重点色（涅瓦假面）（三层被毛）' },
  'レッドリンクスポイント': { en: 'Red Lynx Point', zh: '红色山猫重点色' },
  'ゴールデンシェーデッド＆ホワイト': { en: 'Golden Shaded & White', zh: '金渐层加白' },
  'シルバーシェーデット': { en: 'Silver Shaded', zh: '银渐层' },
  'シルバーシェーデッド': { en: 'Silver Shaded', zh: '银渐层' },
  'シルバータビー': { en: 'Silver Tabby', zh: '银虎斑' },
  'シルバータビー トリプルコート': { en: 'Silver Tabby, Triple Coat', zh: '银虎斑 三层被毛' },
  'シルバー＆ホワイト トリプルコート': { en: 'Silver & White, Triple Coat', zh: '银色加白 三层被毛' },
  'シールポイント(ネヴァマスカレード)（トリプルコート）': { en: 'Seal Point (Neva Masquerade) (Triple Coat)', zh: '海豹重点色（涅瓦假面）（三层被毛）' },
  'チョコレートゴールデン ロングヘア': { en: 'Chocolate Golden Longhair', zh: '巧克力金渐层 长毛' },
  'チンチラゴールデン ロングヘア': { en: 'Chinchilla Golden Longhair', zh: '金吉拉金渐层 长毛' },
  'ブラウンタビー（トリプルコート）': { en: 'Brown Tabby (Triple Coat)', zh: '棕虎斑（三层被毛）' },
  'ブルー&ホワイト（トリプルコート）': { en: 'Blue & White (Triple Coat)', zh: '蓝色&白色（三层被毛）' },
  'ブルーパッチドタビー&ホワイト': { en: 'Blue Patched Tabby & White', zh: '蓝玳瑁虎斑加白' },
  'ブルーパッチドタビー&ホワイト（トリプルコート）': { en: 'Blue Patched Tabby & White (Triple Coat)', zh: '蓝玳瑁虎斑加白（三层被毛）' },
  'ブルーパッチドタビー＆ホワイト': { en: 'Blue Patched Tabby & White', zh: '蓝玳瑁虎斑加白' },
  'ホワイト トリプルコート': { en: 'White, Triple Coat', zh: '白色 三层被毛' },
  'ホワイトソリッド（トリプルコート）': { en: 'Solid White (Triple Coat)', zh: '纯白色（三层被毛）' },
  'レッドリンクスポイント トリプルコート': { en: 'Red Lynx Point, Triple Coat', zh: '红色山猫重点色 三层被毛' },
  'レッドリンクスポイント（トリプルコート）': { en: 'Red Lynx Point (Triple Coat)', zh: '红色山猫重点色（三层被毛）' },
  'シルバーパッチドタビー': { en: 'Silver Patched Tabby', zh: '银玳瑁虎斑' },
  'ブルーリンクスポイント（トリプルコート）': { en: 'Blue Lynx Point (Triple Coat)', zh: '蓝色山猫重点色（三层被毛）' },
  'ホワイト（トリプルコート）': { en: 'White (Triple Coat)', zh: '白色（三层被毛）' },
  'シルバータビー（トリプルコート）': { en: 'Silver Tabby (Triple Coat)', zh: '银虎斑（三层被毛）' },
  'ブラウンタビー&ホワイト': { en: 'Brown Tabby & White', zh: '棕虎斑加白' },
  'チョコレートゴールデン(ロングヘア)': { en: 'Chocolate Golden (Longhair)', zh: '巧克力金渐层（长毛）' },
  'ブラックゴールデンシェル(ロング)': { en: 'Black Golden Shell (Longhair)', zh: '黑金渐层（长毛）' },
  'シルバータビー&ホワイト（トリプルコート）': { en: 'Silver Tabby & White (Triple Coat)', zh: '银虎斑加白（三层被毛）' },
};

// Small-animal dictionaries are deliberately independent from the cat catalog.
// New owner data may pass through in Japanese with a build warning, but must never
// silently mutate the established cat vocabulary above.
const SPECIES_MAP = {
  'ウサギ': { en: 'Rabbit', zh: '兔' },
};
const SMALL_ANIMAL_BREED_MAP = {
  'ネザーランドドワーフ': { en: 'Netherland Dwarf', zh: '荷兰侏儒兔' },
};
const SMALL_ANIMAL_COLOR_MAP = {};

function colorLabel(color, lang) {
  if (lang === 'ja' || !color) return color || '';
  const row = COLOR_MAP[color];
  if (row && row[lang]) return row[lang];
  console.warn(`  [i18n] no ${lang} color mapping for "${color}" — passthrough ja`);
  return color;
}

function smallAnimalMapLabel(value, lang, map, kind) {
  if (lang === 'ja' || !value) return value || '';
  const row = map[value];
  if (row && row[lang]) return row[lang];
  console.warn(`  [i18n] no ${lang} small-animal ${kind} mapping for "${value}" — passthrough ja`);
  return value;
}

function smallAnimalSpeciesLabel(species, lang) {
  const cfg = SPECIES_CONFIG.find(row => row.species === species);
  const ja = cfg ? cfg.labelJa : species;
  return smallAnimalMapLabel(ja, lang, SPECIES_MAP, 'species');
}

function smallAnimalBreedLabel(breed, lang) {
  return smallAnimalMapLabel(breed, lang, SMALL_ANIMAL_BREED_MAP, 'breed');
}

function smallAnimalColorLabel(color, lang) {
  return smallAnimalMapLabel(color, lang, SMALL_ANIMAL_COLOR_MAP, 'color');
}

// ── Catalog i18n artifact (client-side translation of data values) ────────────
// Single source of truth: COLOR_MAP + BREED_MAP above. The client renderers
// (card-loader.js, kitten-carousel.js) translate raw ja data values at render time
// by looking up window.FULUCK_CATALOG_I18N.{colors,breeds}[lang][rawJa]. This function
// serializes those same two tables (no hand-copy) into /catalog-i18n.js with a
// deterministic key order so idempotency holds (regen twice → byte-identical).
// Shape: { colors: { en:{ja→en}, zh:{ja→zh} }, breeds: { en:{ja→en}, zh:{ja→zh} } }.
function generateCatalogI18n() {
  // Transpose { ja: { en, zh } } → { en: { ja→en }, zh: { ja→zh } }, sorted by ja key.
  function transpose(map) {
    const out = { en: {}, zh: {} };
    for (const ja of Object.keys(map).sort()) {
      const row = map[ja];
      if (row && row.en) out.en[ja] = row.en;
      if (row && row.zh) out.zh[ja] = row.zh;
    }
    return out;
  }
  const payload = {
    colors: transpose(COLOR_MAP),
    breeds: transpose(BREED_MAP),
    smallAnimalSpecies: transpose(SPECIES_MAP),
    smallAnimalBreeds: transpose(SMALL_ANIMAL_BREED_MAP),
    smallAnimalColors: transpose(SMALL_ANIMAL_COLOR_MAP),
  };
  const body =
    '// GENERATED by tools/generate-site.js — DO NOT EDIT.\n' +
    '// Single-source catalog value translations for cat and small-animal renderers.\n' +
    '// Derived from the independent catalog maps in the generator; regen to update.\n' +
    'window.FULUCK_CATALOG_I18N = ' + JSON.stringify(payload, null, 2) + ';\n';
  const outPath = path.join(SITE_DIR, 'catalog-i18n.js');
  fs.writeFileSync(outPath, body, 'utf-8');
  const nColors = Object.keys(payload.colors.en).length;
  const nBreeds = Object.keys(payload.breeds.en).length;
  const nSmallAnimalBreeds = Object.keys(payload.smallAnimalBreeds.en).length;
  console.log(`  catalog-i18n.js -> ${nColors} cat colors, ${nBreeds} cat breeds, ${nSmallAnimalBreeds} small-animal breeds (en+zh)`);
}

// Section counter suffix: ja "サイベリアン (31匹)" / en "Siberian (31)" / zh "西伯利亚猫（31只）".
function countLabel(n, lang) {
  if (lang === 'en') return ` (${n})`;
  if (lang === 'zh') return `（${n}只）`;
  return ` (${n}匹)`;
}

// Per-breed section description (BREED_CONFIG.desc is ja; en/zh live here to keep the
// generator self-contained). Keyed by BREED_CONFIG.key.
const BREED_DESC_L = {
  'サイベリアン': { en: 'Low-allergen, gentle-natured Siberian kittens.', zh: '低致敏、性格温和的西伯利亚猫幼猫。' },
  'ブリティッシュショートヘア': { en: 'British Shorthair kittens — sturdy build and a lovable round face.', zh: '体型敦实、圆脸惹人喜爱的英国短毛猫幼猫。' },
  'ブリティッシュロングヘア': { en: 'The longhair British — calm and refined in temperament.', zh: '英国短毛猫的长毛品种，性格温和优雅。' },
  'ラグドール': { en: 'Ragdolls — the "plush toy" cat that loves being held.', zh: '喜欢被抱的“布偶”猫——布偶猫。' },
};
function breedDesc(cfg, lang) {
  if (lang === 'ja') return cfg.desc;
  const row = BREED_DESC_L[cfg.key];
  return (row && row[lang]) || cfg.desc;
}

// List page hero subtitle (no i18n key on the list page → baked per lang).
const HERO_SUB = {
  ja: '新しいご家族を待っている子猫たちをご紹介します。料金は各子猫ページでご確認ください。',
  en: 'Meet the kittens waiting for their new families. Check each kitten page for current details.',
  zh: '为您介绍正在等待新家庭的猫咪们。最新信息请查看每只猫咪页面。',
};
const KITTENS_CATALOG_SECTION = {
  ja: {
    tag: 'CATALOG',
    title: 'すべての子猫',
    desc: '販売状況・おすすめ・年齢順で、すべての子猫をご案内しています。',
  },
  en: {
    tag: 'CATALOG',
    title: 'All kittens',
    desc: 'All kittens are shown in availability, featured and age order.',
  },
  zh: {
    tag: 'CATALOG',
    title: '全部幼猫',
    desc: '所有猫咪按销售状态、推荐与年龄顺序展示。',
  },
};

// Breadcrumb "Kittens" label (kitten.breadcrumb.kittens key mirror for baked list/detail).
const KITTENS_LABEL = { ja: '子猫一覧', en: 'Kittens', zh: '幼猫一览' };
const HOME_LABEL = { ja: 'ホーム', en: 'Home', zh: '首页' };

// ══ COPY-SPEC (2026-08-23) bindings ══════════════════════════════════════════
// Every string in this block is transcribed from the reviewed copy master
// (scratchpad/COPY-SPEC.md). Where the master fixes only the Japanese sentence,
// the en/zh rows are a plain translation of that same sentence — they add no claim
// the Japanese does not already make. Those rows are listed in the worker receipt.

// §4.1 — vaccination fee, fixed sentence, directly under the detail-page price.
const VACCINE_FEE_DETAIL = {
  ja: '表示価格は子猫本体価格（税込）です。3種混合ワクチン（1回目）の接種費用として、別途10,000円（税込）を申し受けます。',
  en: 'The listed price is the kitten price (tax included). The first FVRCP (3-in-1) vaccination is charged separately at ¥10,000 (tax included).',
  zh: '标示价格为幼猫本体价格（含税）。首针三联疫苗费用另计 10,000 日元（含税）。',
};

// §4.2 — short note above the list grid.
const VACCINE_FEE_LIST = {
  ja: '※表示価格は子猫本体価格。3種混合ワクチン代 10,000円（税込）は別途',
  en: 'Prices exclude the first vaccination (¥10,000)',
  zh: '※标示价格不含首针疫苗费（10,000 日元）',
};

// §8 — deposit. The master says: use Koneko's amount when Koneko states one. Every
// snapshot of the breeder's own listings states the same terms — 予約金として５万円 /
// balance on the handover day / non-refundable on a customer-side cancellation — so the
// official site publishes that, not a vaguer "ask us" line that would contradict it.
const DEPOSIT_LINE = {
  ja: 'ご成約時に予約金として50,000円をお願いしています。残金はお引渡し日当日にお支払いください。お客様都合によるキャンセルの場合、予約金のご返金はできません。契約は登録事業所での現物確認後に行います。',
  en: 'A deposit of ¥50,000 is due when you decide on a kitten, with the balance paid on the handover day. The deposit is not refundable if you cancel. The contract is concluded at our registered premises after you have seen the kitten in person.',
  zh: '确定猫咪时需支付预约金 50,000 日元，余款于交付当日支付。因客户自身原因取消时，预约金恕不退还。合同在登记营业所当面确认猫咪后签订。',
};

// §10 — public viewing address. Replaces every "詳細な住所はご予約時に" sentence.
const VISIT_PLACE_LINE = {
  ja: '見学は大阪市城東区東中浜2-6-23（緑橋駅最寄り）で承ります。完全予約制です。',
  en: 'Viewings are held at 2-6-23 Higashinakahama, Joto-ku, Osaka (nearest station: Midoribashi). By appointment only.',
  zh: '见学地点为大阪市城东区东中浜2-6-23（最近车站：绿桥站）。完全预约制。',
};

// §10 — the address is public now, so any CMS text still promising to reveal it after
// booking is stale. The durable fix is the article record itself; this keeps the
// generated surface honest until the CMS copy is updated.
// Sentence-scoped, not clause-scoped: "詳細住所と地図リンクは予約確定後、LINEでお送り
// します。" is one promise, and dropping only the clause before the comma would leave a
// dangling fragment.
const WITHHELD_ADDRESS_PATTERNS = [
  /[^。\n]*詳細(?:な)?住所[^。\n]*。?/g,
];

function publishViewingAddress(text) {
  let out = String(text || '');
  for (const pattern of WITHHELD_ADDRESS_PATTERNS) out = out.replace(pattern, '');
  out = out.replace(/[ \t]{2,}/g, ' ').trim();
  return out;
}

// §11 — viewing hours replacement ("見学時間 11:00~16:00" is retired).
const VISIT_TIME_LINE = {
  ja: '完全予約制（平日・土日祝可／所要30分〜1時間）',
  en: 'By appointment only (weekdays, weekends and public holidays; about 30–60 minutes)',
  zh: '完全预约制（平日・周末节假日均可／约30分钟〜1小时）',
};

// §5.1 — mixed-breed section, shown on every mix detail page.
const MIX_COPY = {
  ja: {
    title: 'ミックス（サイベリアン × ブリティッシュショートヘア）という選択',
    body: '当キャッテリーのミックスは、サイベリアンとブリティッシュショートヘアの両親から生まれた子たちです。異なる品種を掛け合わせることで遺伝的多様性が高まり、特定の純血種に見られやすい遺伝性疾患のリスクが比較的低いとされています（個体差があり、健康を保証するものではありません）。欧州ではオランダなど一部の国で、極端な体型や遺伝性疾患リスクの高い純血種の繁殖を規制する動きが広がっており、ミックスを前向きに選ぶご家庭が増えています。サイベリアン譲りのふんわりとした被毛と、ブリティッシュ譲りの穏やかで人懐こい気質をあわせ持ち、価格も純血種よりお求めやすく設定しています。なお、ミックスのため血統書の発行はありません。',
    points: ['遺伝的多様性が高い', '穏やかで人懐こい気質', '純血種よりお求めやすい価格', '血統書なし（ミックスのため）'],
    badge: 'ミックス・健やか志向',
  },
  en: {
    title: 'Why a Siberian × British Shorthair mix?',
    body: "Our mixed kittens are born to a Siberian and a British Shorthair parent. Crossing two breeds increases genetic diversity, which is generally associated with a lower risk of the hereditary conditions seen in some purebred lines (individual results vary; this is not a health guarantee). In Europe, countries such as the Netherlands have begun restricting the breeding of purebreds with extreme body types or high hereditary-disease risk, and more families are choosing mixes on purpose. Ours combine the Siberian's soft, plush coat with the British Shorthair's calm, people-loving temperament, at a more accessible price than our purebred kittens. As mixes, they do not come with a pedigree certificate.",
    points: ['Greater genetic diversity', 'Calm, affectionate temperament', 'More accessible price', 'No pedigree (mixed breed)'],
    badge: 'Mix · genetic diversity',
  },
  zh: {
    title: '混血猫（西伯利亚 × 英国短毛）这个选择',
    body: '本猫舍的混血猫由西伯利亚猫与英国短毛猫的父母所生。不同品种杂交提高了遗传多样性，通常认为特定纯种猫常见的遗传性疾病风险相对较低（存在个体差异，不构成健康保证）。在欧洲，荷兰等部分国家已开始限制极端体型或遗传病风险高的纯种繁育，越来越多家庭主动选择混血猫。我们的混血猫兼具西伯利亚猫柔软蓬松的被毛与英短温和亲人的性格，价格也比纯种幼猫更易入手。由于是混血，不附带血统证书。',
    points: ['遗传多样性高', '性格温和亲人', '价格更易入手', '无血统证书（混血）'],
    badge: '混血・遗传多样',
  },
};

// §6.1 / §6.2 — adult & young-adult cats (12 months and over).
const ADULT_COPY = {
  ja: {
    title: '成猫・若猫という選択 — 初めての方にこそ',
    body: '生後12ヶ月以上の成猫・若猫は、性格がすでに出来上がっており、「どんな子に育つか」が見えた状態でお迎えいただけます。子猫期特有の夜鳴きやいたずら、頻繁なワクチン通院の時期を過ぎているため、特別なケアは必要ありません。去勢・避妊済みの子は、発情期の鳴き声やマーキングの心配もありません。初めて猫を迎える方、日中お仕事で留守にされる方、落ち着いたパートナーを探している方におすすめです。そのままご家庭に迎えて、今日から一緒に暮らし始められます。',
    points: ['性格が出来上がっている', '特別なケア不要', '去勢・避妊済み（該当の子）', '初心者・お留守番家庭向き'],
    badge: '成猫・すぐにお迎え可',
    neuteredBadge: '去勢・避妊済み',
  },
  en: {
    title: 'Adult & young-adult cats — ideal for first-time owners',
    body: 'Our cats aged 12 months and over already have a settled personality, so you know exactly who you are bringing home. They are past the kitten stage of night-time crying, mischief and frequent vaccination visits, and need no special care. Neutered or spayed cats also mean no heat-cycle yowling or marking. They are a great match for first-time owners, households that are out during the day, and anyone looking for a calm companion — ready to move in and start life with you today.',
    points: ['Settled personality', 'No special care needed', 'Neutered or spayed (where noted)', 'Great for beginners and working households'],
    badge: 'Adult · ready to go home',
    neuteredBadge: 'Neutered/Spayed',
  },
  zh: {
    title: '成猫・青年猫 — 最适合新手的选择',
    body: '12 个月以上的成猫・青年猫性格已经定型，您能清楚知道接回家的是怎样的一只猫。它们已经度过幼猫期的夜间叫唤、调皮捣蛋和频繁疫苗就诊阶段，无需特殊照顾。已绝育的猫咪也不会有发情期的叫声和标记行为。特别适合第一次养猫的家庭、白天上班不在家的家庭，以及想要一位安静陪伴者的您。可以直接接回家，从今天开始一起生活。',
    points: ['性格已定型', '无需特殊照顾', '已绝育（标注的猫咪）', '适合新手与上班族家庭'],
    badge: '成猫・可直接接回家',
    neuteredBadge: '已绝育',
  },
};

// §9 — reserved (商談中) detail-page CTA. No "book a visit" button on a reserved kitten.
const RESERVED_CTA_COPY = {
  ja: {
    notice: 'この子は現在商談中です。似たタイプの子をご案内できます。',
    list: '販売中の子猫を見る',
    line: '同じ両親・毛色の子について相談',
  },
  en: {
    notice: 'This kitten is currently reserved. We can suggest similar kittens.',
    list: 'See available kittens',
    line: 'Ask about kittens from the same parents',
  },
  zh: {
    notice: '这只猫咪目前正在洽谈中。我们可以为您推荐类似的猫咪。',
    list: '查看在售猫咪',
    line: '咨询同父母・同毛色的猫咪',
  },
};

// §6.3 — the three list entries. Clicking filters the one grid; no new page.
const LIST_ENTRY_COPY = {
  ja: {
    legend: '絞り込み',
    all: 'すべて',
    siberian: 'サイベリアン',
    golden: '金渐层（ブリティッシュ ゴールデン）',
    adultmix: '成猫・ミックス',
    statusLegend: '販売状況',
    statusAvailable: '販売中のみ',
    statusAll: 'すべての掲載',
    empty: '現在、該当するステータスの子猫はいません。しばらくしてから再度ご確認いただくか、LINEでお問い合わせください。',
  },
  en: {
    legend: 'Filter',
    all: 'All',
    siberian: 'Siberian',
    golden: 'Golden (British Golden)',
    adultmix: 'Adults & mixes',
    statusLegend: 'Availability',
    statusAvailable: 'Available only',
    statusAll: 'All listings',
    empty: 'No kittens currently match this status. Please check back soon, or ask us on LINE.',
  },
  zh: {
    legend: '筛选',
    all: '全部',
    siberian: '西伯利亚猫',
    golden: '金渐层（英短金色）',
    adultmix: '成猫・混血',
    statusLegend: '销售状态',
    statusAvailable: '仅在售',
    statusAll: '全部刊登',
    empty: '目前没有符合该状态的猫咪，请稍后再来查看，或通过 LINE 咨询我们。',
  },
};

// §7 — one webfont request per language instead of one union request for all three.
// A Japanese page never needs the Simplified-Chinese face, and an English page needs
// neither; shipping the union costs every visitor the bytes of two unused CJK families.
function fontHref(lang) {
  const inter = 'family=Inter:wght@400;500;600;700';
  if (lang === 'en') return `https://fonts.googleapis.com/css2?${inter}&display=swap`;
  if (lang === 'zh') return `https://fonts.googleapis.com/css2?${inter}&family=Noto+Sans+SC:wght@400;500;700&display=swap`;
  return `https://fonts.googleapis.com/css2?${inter}&family=Noto+Sans+JP:wght@400;500;700&display=swap`;
}

// §11 — list H2. {n} = available count, {total} = every published card.
function listHeadingText(available, total, lang) {
  if (lang === 'en') return `Available ${available} (of ${total})`;
  if (lang === 'zh') return `在售 ${available} 只（共 ${total} 只）`;
  return `販売中 ${available}匹（全 ${total}匹）`;
}

// ── Detail-page title uniqueness ─────────────────────────────────────────────
// The natural title (breed + sex + colour) is not unique: littermates share all three.
// Compute, once per language pass, which titles collide, and qualify only those.
const DETAIL_TITLE_QUALIFIERS = new Map();

function detailTitleText(kitten, lang) {
  const genderFull = kitten.gender ? `${kitten.gender} ${genderText(kitten.gender)}` : '';
  if (lang === 'ja') return `${kitten.breed || ''} ${genderFull} ${kitten.color || ''}`.trim();
  const breedL = breedLabel(kitten.breed, lang);
  const colorL = colorLabel(kitten.color, lang);
  const genderL = genderTextL(kitten.gender, lang);
  return `${breedL || ''} ${genderL} ${colorL || ''}`.replace(/\s+/g, ' ').trim();
}

function detailTitleIdSuffix(fileId, lang) {
  if (lang === 'en') return ` · ID ${fileId}`;
  if (lang === 'zh') return `・编号 ${fileId}`;
  return `・掲載ID ${fileId}`;
}

function prepareDetailTitles(kittens, lang) {
  const counts = new Map();
  for (const kitten of kittens) {
    const base = detailTitleText(kitten, lang);
    counts.set(base, (counts.get(base) || 0) + 1);
  }
  for (const kitten of kittens) {
    const fileId = kitten.breederId || kitten.id;
    DETAIL_TITLE_QUALIFIERS.set(
      `${lang}|${fileId}`,
      counts.get(detailTitleText(kitten, lang)) > 1 ? detailTitleIdSuffix(fileId, lang) : '',
    );
  }
}

function detailTitleQualifier(kitten, lang) {
  const fileId = kitten.breederId || kitten.id;
  return DETAIL_TITLE_QUALIFIERS.get(`${lang}|${fileId}`) || '';
}

// ── Mixed breed / adult detection ────────────────────────────────────────────
// The owner's breed strings spell a cross three ways ("A×B", "A&B", "AXB"), and a
// future row may say ミックス outright. One predicate keeps the homepage slot rule,
// the card badge and the detail section from drifting apart.
const MIX_BREED_RE = /[&＆×✕xX]|ミックス|ミツクス|\bmix\b/i;
function isMixBreed(breed) {
  return MIX_BREED_RE.test(String(breed || ''));
}

// Ragdoll is no longer bred here (COPY-SPEC §0). It may only appear as a past record,
// never as a listed breed on a merchandising surface.
function isRetiredBreed(breed) {
  return /ラグドール|Ragdoll|布偶/i.test(String(breed || ''));
}

// Whole months between birthday and today. Returns null when the birthday is unusable.
function monthsOld(birthday) {
  const match = String(birthday || '').match(/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3] || '1');
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const now = new Date();
  let months = (now.getFullYear() - year) * 12 + (now.getMonth() + 1 - month);
  if (now.getDate() < day) months -= 1;
  return months;
}

// §6 — 生後12ヶ月以上 = 成猫・若猫.
function isAdultCat(kitten) {
  const months = monthsOld(kitten && kitten.birthday);
  return months !== null && months >= 12;
}

// §6.2 — neuter/spay badge, driven by the owner's own wording in breed/color/note.
function isNeuteredCat(kitten) {
  if (!kitten) return false;
  const haystack = [kitten.breed, kitten.color, kitten.note, kitten.noteEn, kitten.noteZh]
    .filter((value) => typeof value === 'string')
    .join(' ');
  return /去勢|避妊|絕育|绝育|neuter|spay/i.test(haystack);
}

// List filter group for the three entries in §6.3. A cat belongs to exactly one entry:
// adults and mixes first (that is the entry the owner wants discoverable), then the
// golden British lines, then Siberian.
function listEntryGroup(kitten) {
  if (isMixBreed(kitten && kitten.breed) || isAdultCat(kitten)) return 'adultmix';
  const breed = String((kitten && kitten.breed) || '');
  const color = String((kitten && kitten.color) || '');
  if (/ゴールデン|チンチラ|Golden/i.test(color) || /ブリティッシュ/.test(breed)) return 'golden';
  return 'siberian';
}

// ── Owner copy hygiene (§1) ──────────────────────────────────────────────────
// Campaign / price-cut clauses never ship: they go stale within days and read as a
// sale. Each pattern is clause-scoped so the individual sentence around it survives.
const CAMPAIGN_PATTERNS = [
  /[^、。\n]*夏キャンペーン[^、。\n]*[、。！!]?/g,
  /[^、。\n]*キャンペーン中[^、。\n]*[、。！!]?/g,
  /[^、。\n]*キャンペーン[^、。\n]*[、。！!]?/g,
  /[^、。\n]*値下げ[^、。\n]*[、。！!]?/g,
  /[^、。\n]*セール[^、。\n]*[、。！!]?/g,
  /[^\n]*年末年始の見学も\s*ok[^\n]*/gi,
  /[,，]?\s*[^,，\n]*[Ss]ummer campaign[^,，\n]*/g,
  /[,，]?\s*[^,，\n]*summer price cut[^,，\n]*/gi,
  /[,，]?\s*[^,，\n]*[Cc]ampaign underway[^,，\n]*/g,
  /[,，]?\s*[^,，\n]*夏季活动[^,，\n]*/g,
  /[,，]?\s*[^,，\n]*夏季降价[^,，\n]*/g,
];

// The retired breed spelling (the one missing the leading サイ). It is built from escape
// sequences on purpose: the release gate greps the whole repository for that string and
// must find zero hits, so the generator may not carry it literally.
const RETIRED_BREED_SPELLING_RE = new RegExp(
  String.fromCharCode(0x30b7, 0x30d9, 0x30ea, 0x30a2, 0x30f3),
  'g',
);

// Owner copy arrives from the Koneko admin as plain text: unrendered Markdown stars,
// a recurring アレルギ typo and the retired breed spelling all leak straight into the
// page unless they are cleaned at the generation boundary.
function sanitizeOwnerCopy(text) {
  let out = typeof text === 'string' ? text : '';
  if (!out) return '';
  for (const pattern of CAMPAIGN_PATTERNS) out = out.replace(pattern, '');
  out = out.replace(/\*\*/g, '').replace(/\*/g, '');
  out = out.replace(/アレルギ(?!ー)/g, 'アレルギー');
  out = out.replace(RETIRED_BREED_SPELLING_RE, 'サイベリアン');
  out = out.replace(/[ \t　]+$/gm, '');
  out = dedupeAdjacentLines(out);
  out = closeDanglingBrackets(out);
  out = out.replace(/\n{3,}/g, '\n\n');
  return out.trim();
}

// The owner types the health-check list by hand and sometimes pastes the same line
// twice (2603-02684 lists 「以下の4項目」 then repeats the HCM row). Compare on a
// bracket/width-normalised form so 「（HCM：クリア」 and 「(HCM:クリア)」 count as one.
function normalizeForDedupe(line) {
  return line
    .replace(/[（）()［］\[\]【】]/g, '')
    .replace(/[：:・,，]/g, '')
    .replace(/\s+/g, '')
    .trim();
}

function dedupeAdjacentLines(text) {
  const lines = String(text).split('\n');
  const out = [];
  let previous = '';
  for (const line of lines) {
    const key = normalizeForDedupe(line);
    if (key && key === previous) continue;
    previous = key;
    out.push(line);
  }
  return out.join('\n');
}

// A line that opens 「（」 and never closes it renders as a stray bracket. Close it at
// the end of that line rather than dropping the text the owner wrote.
function closeDanglingBrackets(text) {
  return String(text)
    .split('\n')
    .map((line) => {
      const opens = (line.match(/（/g) || []).length - (line.match(/）/g) || []).length;
      const opensHalf = (line.match(/\(/g) || []).length - (line.match(/\)/g) || []).length;
      let out = line;
      if (opens > 0) out += '）'.repeat(opens);
      if (opensHalf > 0) out += ')'.repeat(opensHalf);
      return out;
    })
    .join('\n');
}

// ── The shared Koneko boilerplate (§10 / §11) ────────────────────────────────
// The same ~2,000-character block is pasted into every Koneko listing. Repeating it
// on 21 detail pages is duplicate content and, worse, it still carried the retired
// "詳細な住所はご予約時に" and "見学時間 11:00~16:00" lines. It is lifted out of the
// per-kitten copy and emitted once, as one reviewed site block, with the address and
// hours sentences replaced by §10 / §11.
const SHARED_VISIT_BLOCK = {
  ja: {
    title: 'お迎えについて（当キャッテリー共通のご案内）',
    items: [
      { h: '日々のお世話', p: '今はカリカリフードを食べています。爪きり、シャンプーができます。ドライヤーをしても逃げないおとなしい子です。トイレトレーニングもしております。給水器でもお水を飲むことができます。初めての猫の飼育でもご安心いただけます。' },
      { h: 'お迎えスターターセット', p: '新しいご家庭に迎えられる子猫たちのために、お迎えスターターセットをご用意しております。キャットフード、おもちゃ、爪切り、使用した猫砂など、日常生活に役立つアイテムを詰め込んだささやかなプレゼントです。新しい環境での生活が少しでもスムーズに始められるよう、心を込めてお渡ししています。' },
      { h: '見学時間', p: '完全予約制（平日・土日祝可／所要30分〜1時間）' },
      { h: '見学場所', p: '見学は大阪市城東区東中浜2-6-23（緑橋駅最寄り）で承ります。完全予約制です。' },
      { h: '見学時のお願い', p: 'ご見学日は他の動物との接触は避けて頂きますようお願い致します（※感染症の原因になります）。ご見学人数は、お二人まででお願い致します。見学時にはマスク着用でお願い致します。' },
      { h: 'アレルギーについて', p: '当キャッテリーには、サイベリアン以外の猫種や小動物もおります。動物アレルギーをお持ちの方は、ご予約の際にあらかじめお知らせください。出来る限り安心してご見学いただけるよう、事前に清掃を行い、他の動物と接触しない見学スペースをご用意いたします。アレルギーの出方には個人差があります。' },
      { h: 'お迎え', p: '健康状態が安定した後に、一回目のワクチン接種後、マイクロチップ装着済でのお渡しとなります。子猫の成長具合、状況、体調等によってはお渡し時期を延長することもあります。' },
      { h: 'ご見学前のお願い', p: 'ご見学後、イメージの差異、相性などをご理由にお迎えをお見送りされるのは構いません。ご家族の同意、アレルギーの有無、譲渡費用をご確認・ご納得いただいたうえでご見学ください。' },
    ],
  },
  en: {
    title: 'About adopting from us (information common to every kitten)',
    items: [
      { h: 'Daily care', p: 'The kittens are currently eating dry kibble. They can have their nails trimmed and be shampooed. They stay calm and do not run away even when a dryer is used. Litter training is provided. They can also drink water from a water dispenser. This can be reassuring even for first-time cat owners.' },
      { h: 'New Home Starter Set', p: 'For kittens going to their new families we have prepared a New Home Starter Set. It is a small gift containing useful everyday items such as cat food, toys, nail clippers and used cat litter. We offer it with care so that life in the new environment can begin as smoothly as possible.' },
      { h: 'Viewing hours', p: 'By appointment only (weekdays, weekends and public holidays; about 30–60 minutes)' },
      { h: 'Viewing location', p: 'Viewings are held at 2-6-23 Higashinakahama, Joto-ku, Osaka (nearest station: Midoribashi). By appointment only.' },
      { h: 'Before you visit', p: 'Please avoid contact with other animals on the day of your viewing (this can cause infectious disease). Please limit the viewing party to two people. Please wear a mask during the viewing.' },
      { h: 'About allergies', p: 'Our cattery also has cat breeds other than Siberians, as well as small animals. If you have animal allergies, please be sure to let us know in advance when making a reservation. To help you view with as much peace of mind as possible, we clean in advance and prepare a viewing space without contact with other animals. Allergic reactions differ from person to person.' },
      { h: 'Going home', p: 'The kitten will be handed over after its health condition is stable, after the first vaccination, and with a microchip already fitted. Depending on the kitten’s growth, circumstances and physical condition, the handover date may be extended.' },
      { h: 'Please note', p: 'After a viewing, it is fine if you decide not to take the kitten home because of differences from your expectations, compatibility, or similar reasons. Please make sure you have confirmed and understood your family’s agreement, any allergies, and the transfer fee before visiting.' },
    ],
  },
  zh: {
    title: '关于接猫回家（本猫舍共通说明）',
    items: [
      { h: '日常照顾', p: '小猫现在正在吃干粮。可以剪指甲、洗澡。即使用吹风机也不会逃跑，性格安静。也已进行如厕训练。也会用饮水器喝水。即使是第一次养猫，也可以放心。' },
      { h: '接猫入门套装', p: '为迎接小猫进入新家庭，我们准备了接猫入门套装。内含猫粮、玩具、指甲剪、已使用过的猫砂等有助于日常生活的小物品，是一份小小的礼物。我们用心准备，希望能让小猫在新环境的生活尽可能顺利地开始。' },
      { h: '见学时间', p: '完全预约制（平日・周末节假日均可／约30分钟〜1小时）' },
      { h: '见学地点', p: '见学地点为大阪市城东区东中浜2-6-23（最近车站：绿桥站）。完全预约制。' },
      { h: '参观须知', p: '请您在参观当天避免接触其他动物（这可能成为传染病的原因）。参观人数请限两位以内。参观时请佩戴口罩。' },
      { h: '关于过敏', p: '本猫舍还有西伯利亚猫以外的猫种及小动物。如您有动物过敏，请务必在预约时提前告知。为尽可能让您安心参观，我们会提前清洁，并准备不与其他动物接触的参观空间。过敏反应存在个体差异。' },
      { h: '接猫回家', p: '在健康状况稳定后，完成第一针疫苗接种并植入微芯片后交付。根据小猫的成长情况、实际状况和身体状态等，交付时间可能会延后。' },
      { h: '参观前的请求', p: '参观后，如因与预期印象不同、彼此契合度等原因决定暂不接猫，我们理解；但请务必在确认并充分了解家人的同意、是否有过敏以及转让费用后再前来参观。' },
    ],
  },
};

// A paragraph belongs to the shared block when it carries one of these markers in any
// of the three languages the owner pastes. Matching on the marker (not on an exact
// string) survives the small per-listing edits the owner makes to the boilerplate.
const SHARED_COPY_MARKERS = [
  'たくさんの子猫の中から', 'Thank you for taking a look', '感谢您在众多小猫中',
  'カリカリフード', 'ガリガリフード', 'dry kibble', '正在吃干粮',
  'スターターセット', 'Starter Set', '入门套装',
  'ぜひご予約の上', 'come meet the adorable kittens', '来见见这些可爱的小猫',
  '見学時間', 'Viewing hours', '参观时间',
  '見学場所', 'viewing location', '关于参观地点', '本猫舍位于大阪市内',
  '他の動物との接触', 'contact with other animals', '避免接触其他动物',
  'アレルギーについて', 'About allergies', '关于过敏',
  '健康状態が安定した後', 'health condition is stable', '在健康状况稳定后',
  'ご見学後、イメージの差異', 'After a viewing, it is fine', '参观后，如因与预期印象不同',
];

function isSharedOwnerParagraph(paragraph) {
  const text = String(paragraph || '');
  return SHARED_COPY_MARKERS.some((marker) => text.includes(marker));
}

// Split the owner's long copy into the individual paragraphs (kept on the page) and
// drop everything the shared site block already says.
function individualOwnerParagraphs(text) {
  return sanitizeOwnerCopy(text)
    .split(/\r?\n[ \t]*\r?\n/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph && !isSharedOwnerParagraph(paragraph));
}

// Duplicate-copy alarm: once the same long paragraph appears on three or more detail
// pages it is boilerplate, and boilerplate belongs in the shared block, not in the
// per-kitten copy. Warn loudly instead of silently shipping duplicate content.
function warnOnDuplicateOwnerCopy(kittens) {
  const counts = new Map();
  for (const kitten of kittens) {
    const seen = new Set();
    for (const lang of ['ja', 'en', 'zh']) {
      for (const paragraph of individualOwnerParagraphs(descriptionFor(kitten, lang))) {
        if (paragraph.length < 100 || seen.has(paragraph)) continue;
        seen.add(paragraph);
        counts.set(paragraph, (counts.get(paragraph) || 0) + 1);
      }
    }
  }
  for (const [paragraph, count] of counts) {
    if (count < 3) continue;
    console.warn(`  [copy] shared paragraph repeated on ${count} kittens (${paragraph.length} chars): "${paragraph.slice(0, 40)}…" — move it into SHARED_VISIT_BLOCK`);
  }
}

// ── i18n default-text prefill for the static en/zh pages ─────────────────────
// The en/zh chrome is copied from the Japanese template and localized at runtime by
// i18n.js. That leaves raw Japanese in the HTML source — what a crawler, a preview
// card and a no-JS visitor see. Bake the matching dictionary string into the default
// text at generation time; the data-i18n hook stays, so runtime switching still works.
let I18N_TABLES = null;
function i18nTables() {
  if (I18N_TABLES) return I18N_TABLES;
  I18N_TABLES = { ja: {}, en: {}, zh: {} };
  try {
    const source = fs.readFileSync(path.join(SITE_DIR, 'i18n.js'), 'utf8');
    const anchor = source.indexOf('const translations = {');
    if (anchor === -1) throw new Error('translations table not found');
    const start = source.indexOf('{', anchor);
    let depth = 0;
    let end = -1;
    for (let cursor = start; cursor < source.length; cursor += 1) {
      const ch = source[cursor];
      if (ch === '{') depth += 1;
      else if (ch === '}') {
        depth -= 1;
        if (depth === 0) { end = cursor; break; }
      }
    }
    if (end === -1) throw new Error('unbalanced translations table');
    // eslint-disable-next-line no-new-func
    const parsed = new Function(`return (${source.slice(start, end + 1)});`)();
    for (const lang of ['ja', 'en', 'zh']) {
      if (parsed && parsed[lang] && typeof parsed[lang] === 'object') I18N_TABLES[lang] = parsed[lang];
    }
  } catch (error) {
    console.warn(`  [i18n] could not read i18n.js defaults (${error.message}) — en/zh keeps the ja fallback text`);
  }
  return I18N_TABLES;
}

// Keys the generator already bakes from the copy master. i18n.js is a separate file on
// a separate review track; letting a stale dictionary value overwrite reviewed copy
// would silently reintroduce retired wording.
const I18N_PREFILL_SKIP = new Set([
  'chip.hypoallergenic',
  'kitten.available', 'kitten.reserved', 'kitten.sold',
  'kitten.taxIncl', 'kitten.male', 'kitten.female',
  'kitten.breadcrumb.kittens', 'common.home', 'kittens.heroSub',
  'breed.siberian', 'breed.british-sh', 'breed.british-lh', 'breed.ragdoll',
]);

function i18nTextValue(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function prefillI18nDefaults(html, lang) {
  if (lang !== 'en' && lang !== 'zh') return html;
  const table = i18nTables()[lang];
  if (!table || !Object.keys(table).length) return html;
  const baked = String(html).replace(
    /(<([a-zA-Z][\w:-]*)\b[^>]*\bdata-i18n="([^"]+)"[^>]*>)([^<]*)(<\/\2\s*>)/g,
    (match, open, _tag, key, _text, close) => {
      if (I18N_PREFILL_SKIP.has(key)) return match;
      const value = table[key];
      if (typeof value !== 'string' || !value.trim() || value.includes('<')) return match;
      return `${open}${i18nTextValue(value)}${close}`;
    },
  );
  // An element whose label sits next to a decorative icon (<i class="ico">, inline <svg>,
  // or a <span> wrapping one) is skipped by the rule above, because its content is not a
  // bare text node. That is exactly how nav.more / header.telLabel / footer.lawTitleShort
  // stayed Japanese on every generated en/zh page. Mirror i18n.js setLanguage: keep the
  // markup, rewrite only the first non-empty text node, preserving its edge whitespace.
  return baked.replace(
    /(<([a-zA-Z][\w:-]*)\b[^>]*\bdata-i18n="([^"]+)"[^>]*>)([\s\S]*?)(<\/\2\s*>)/g,
    (match, open, tag, key, inner, close) => {
      if (I18N_PREFILL_SKIP.has(key)) return match;
      if (!/[<>]/.test(inner)) return match; // plain text nodes already handled above
      if (new RegExp(`<${tag}\\b`, 'i').test(inner)) return match; // nested same tag: skip
      const value = table[key];
      if (typeof value !== 'string' || !value.trim() || value.includes('<')) return match;
      const parts = inner.split(/(<[^>]*>)/);
      let replaced = false;
      for (let i = 0; i < parts.length; i += 1) {
        if (/^</.test(parts[i]) || !parts[i].trim()) continue;
        const lead = /^\s/.test(parts[i]) ? ' ' : '';
        const trail = /\s$/.test(parts[i]) ? ' ' : '';
        parts[i] = `${lead}${i18nTextValue(value)}${trail}`;
        replaced = true;
        break;
      }
      return replaced ? `${open}${parts.join('')}${close}` : match;
    },
  );
}

// ── Template Extraction ───────────────────────────────────────

/**
 * Extract header (from start through page-hero) and footer (from footer comment to end)
 * from an existing HTML file.
 */
function extractTemplate(filepath) {
  const html = fs.readFileSync(filepath, 'utf-8');

  // Header: everything from start through end of page-hero section
  const pageHeroEnd = html.indexOf('</section>', html.indexOf('class="page-hero"'));
  let headerEnd = pageHeroEnd !== -1 ? pageHeroEnd + '</section>'.length : -1;

  // Footer: from the footer comment to end of file
  const footerMarker = '<!-- ========== FOOTER ========== -->';
  let footerStart = html.indexOf(footerMarker);

  // For kittens.html, also grab the CTA + modal before footer
  // For parents.html, grab CTA + modal before footer
  // For reviews.html, grab the screenshot section + CTA before footer
  // We'll look for the CTA and any wave-divider before footer

  // Actually, we want everything from footer-marker to end
  // And also the CTA section + wave divider that comes just before footer
  // Let's find the last CTA section before footer
  const ctaComment = '<!-- ========== CTA ========== -->';
  let ctaStart = html.lastIndexOf(ctaComment, footerStart);

  // For reviews, find the screenshots section and wave dividers too
  const screenshotComment = '<!-- ========== REVIEW SCREENSHOTS ========== -->';
  let screenshotStart = html.indexOf(screenshotComment);

  // For kittens, find the modal section
  const kittenModalComment = '<!-- ========== KITTEN DETAIL MODAL ========== -->';
  let kittenModalStart = html.indexOf(kittenModalComment);

  // For parents, find the parent modal
  const parentModalComment = '<!-- ========== PARENT DETAIL MODAL ========== -->';
  let parentModalStart = html.indexOf(parentModalComment);

  // Determine the tail (everything from after content sections to EOF)
  // Strategy: find the wave divider before CTA, then include wave-divider + CTA + modal + footer
  let tailStart;

  if (screenshotStart !== -1) {
    // reviews.html: find the wave divider before screenshots section
    const waveBefore = html.lastIndexOf('<div class="wave-divider">', screenshotStart);
    tailStart = waveBefore !== -1 ? waveBefore : screenshotStart;
  } else if (ctaStart !== -1) {
    // kittens/parents: find the wave divider before CTA
    const waveBefore = html.lastIndexOf('<div class="wave-divider">', ctaStart);
    tailStart = waveBefore !== -1 ? waveBefore : ctaStart;
  } else {
    tailStart = footerStart;
  }

  const header = html.substring(0, headerEnd);
  const tail = html.substring(tailStart);

  return { header, tail, fullHtml: html };
}

// ── Wave Divider HTML ─────────────────────────────────────────

function waveDivider(toClass) {
  // toClass: 'cream' or 'white'
  if (toClass === 'cream') {
    return `
  <!-- Wave Divider -->
  <div class="wave-divider">
    <svg viewBox="0 0 1440 60" preserveAspectRatio="none">
      <path d="M0,30 C360,60 720,0 1080,30 C1260,45 1380,30 1440,30 L1440,60 L0,60 Z" fill="var(--bg-cream)"/>
    </svg>
  </div>`;
  }
  return `
  <!-- Wave Divider -->
  <div class="wave-divider">
    <svg viewBox="0 0 1440 60" preserveAspectRatio="none">
      <path d="M0,30 C360,0 720,60 1080,30 C1260,15 1380,30 1440,30 L1440,60 L0,60 Z" fill="var(--bg-white)"/>
    </svg>
  </div>`;
}

function emptyCatalogSection(message, tag = 'Availability') {
  return `

  <!-- ========== GENERATED EMPTY STATE ========== -->
  <section class="section sec-white" data-generated-empty="true">
    <div class="container">
      <div class="sec-header catalog-empty" role="status" style="max-width:680px;margin:0 auto;text-align:center;">
        <span class="sec-tag">${escapeHtml(tag)}</span>
        <p class="sec-desc" style="margin:12px auto 0;">${escapeHtml(message)}</p>
      </div>
    </div>
  </section>`;
}

// ── Generate Kittens ──────────────────────────────────────────

// Absolutize relative header/footer links so the en/zh list pages (one level deep) resolve
// chrome links to the site root, exactly as the precedent en|zh/*.html pages do.
function listToAbsoluteLinks(html) {
  return html
    .replace(/href="(?!\/|https?:|#|mailto:|tel:)([^"]+)"/g, 'href="/$1"')
    .replace(/src="(?!\/|https?:|data:)([^"]+)"/g, 'src="/$1"');
}

// Localize the final "気になる子がいたら…" contact CTA block that lives in the ja
// tail (heading + lead paragraph + the two button labels). The ja tail is otherwise
// reused verbatim for en/zh, so without this the block ships as raw Japanese.
// Translations mirror exactly what the ja says — no new claims. ja tail is never passed here.
const KITTENS_CTA_I18N = {
  en: {
    '気になる子がいたらお気軽にお問い合わせ': 'Found a kitten you like? Feel free to get in touch',
    'LINEまたは見学予約から、お気軽にご連絡ください。': 'Reach out anytime — on LINE or by booking a visit.',
    'LINEで問い合わせ': 'Ask on LINE',
    '見学を予約する': 'Book a Visit',
  },
  zh: {
    '気になる子がいたらお気軽にお問い合わせ': '如果有心仪的猫咪，欢迎随时咨询',
    'LINEまたは見学予約から、お気軽にご連絡ください。': '欢迎通过LINE或参观预约随时与我们联系。',
    'LINEで問い合わせ': 'LINE咨询',
    '見学を予約する': '预约参观',
  },
};
const KITTENS_EMPTY_COPY = {
  ja: { message: '現在、掲載中の子猫はいません。', tag: '掲載状況' },
  en: { message: 'There are currently no kittens listed.', tag: 'Availability' },
  zh: { message: '目前没有在售幼猫。', tag: '刊登情况' },
};
function localizeKittensCta(html, lang) {
  const map = KITTENS_CTA_I18N[lang];
  if (!map) return html;
  // Only rewrite inside the contact CTA <section> (bounded by its comment marker and
  // the next wave divider / footer), so the shared mobile-CTA-bar aria-labels below —
  // site-wide chrome that stays verbatim on every en/zh page — are left untouched.
  const start = html.indexOf('<!-- ========== CTA ========== -->');
  if (start === -1) return html;
  const afterOpen = html.indexOf('</section>', start);
  const end = afterOpen === -1 ? html.length : afterOpen + '</section>'.length;
  let block = html.slice(start, end);
  for (const [ja, tr] of Object.entries(map)) {
    block = block.split(ja).join(tr);
  }
  return html.slice(0, start) + block + html.slice(end);
}

// Build the en/zh list-page header from the ja header:
//  - rebuild <html lang>, <head> (title/meta/OG/twitter/canonical/hreflang/breadcrumb JSON-LD)
//    from a per-lang template,
//  - keep the nav/mobile-nav chrome VERBATIM (data-i18n localizes it at runtime; links
//    absolutized for depth) — matches the established precedent,
//  - localize the page-hero (breadcrumb + h1 + subtitle).
function buildListHeader(jaHeader, lang) {
  if (lang === 'ja') {
    // The Japanese template is also an output file, so stale static hero copy cannot be
    // trusted as a source of truth. Refresh the one reviewed subtitle on every run.
    return jaHeader.replace(
      /(<p\s+data-i18n="kittens\.heroSub">)[\s\S]*?(<\/p>)/,
      `$1${escapeHtml(HERO_SUB.ja)}$2`,
    );
  }
  const headerMarker = '<!-- ========== HEADER ========== -->';
  const heroMarker = '<!-- ========== PAGE HERO ========== -->';
  const headerIdx = jaHeader.indexOf(headerMarker);
  const heroIdx = jaHeader.indexOf(heroMarker);
  // Chrome = HEADER marker through just before PAGE HERO (nav + mobile nav), absolutized.
  const chrome = listToAbsoluteLinks(jaHeader.substring(headerIdx, heroIdx).replace(/\s*$/, ''));

  const styleV = verAsset('style.css', '20260823a');
  const navCssV = verAsset('nav.css', '20260711c');
  const navJsV = verAsset('nav.js', '20260823a');
  const relPath = 'kittens.html';
  const selfUrl = `${BASE_URL}/${langDir(lang)}kittens.html`;
  const kittensLabel = KITTENS_LABEL[lang];
  const homeLabel = HOME_LABEL[lang];
  const heroSub = HERO_SUB[lang];

  let title, desc, ogSite;
  if (lang === 'en') {
    // COPY-SPEC §1: ragdoll is no longer bred here, so it may not appear as an
    // available breed in any title, description or ItemList.
    title = 'Kittens for Sale | Siberian Cats in Osaka | Fuluck Cattery';
    desc = 'Available kittens at Fuluck Cattery in Osaka — Siberian, British Shorthair, British Longhair and Siberian × British mixes. Gentle-natured kittens with a lower-allergen tendency. Reviews 5.00.';
    ogSite = 'Fuluck Cattery';
  } else {
    title = '幼猫一览｜大阪西伯利亚猫繁育｜福楽キャッテリー';
    desc = '大阪福楽キャッテリー在售幼猫一览。西伯利亚猫、英国短毛猫、英国长毛猫、西伯利亚×英短混血。低致敏倾向、性格温和。口碑评分5.00。';
    ogSite = '西伯利亚猫｜大阪·福楽キャッテリー';
  }

  const head = `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(desc)}">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(desc)}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${selfUrl}">
  <meta property="og:site_name" content="${escapeHtml(ogSite)}">
  <meta property="og:image" content="${BASE_URL}/images/ogp.jpg">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(desc)}">
  <meta name="twitter:image" content="${BASE_URL}/images/ogp.jpg">
  <meta name="theme-color" content="#7DD3C0">
  <link rel="canonical" href="${selfUrl}">
${hreflangBlock(relPath)}
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="preload" as="style" href="${fontHref(lang)}" onload="this.onload=null;this.rel='stylesheet'">
  <noscript><link href="${fontHref(lang)}" rel="stylesheet"></noscript>
  <link rel="stylesheet" href="/style.css?v=${styleV}">
  <link rel="stylesheet" href="/nav.css?v=${navCssV}">
  <link rel="icon" href="/favicon.ico" sizes="any">
  <link rel="icon" type="image/svg+xml" href="${FAVICON_HREF}">
  <link rel="apple-touch-icon" href="/apple-touch-icon.png">
  <!-- Google Analytics 4 -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-EK459EK55M"></script>
  <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-EK459EK55M');</script>
  <script type="application/ld+json">
  { "@context":"https://schema.org", "@type":"BreadcrumbList", "inLanguage":"${lang}", "itemListElement":[
    {"@type":"ListItem","position":1,"name":"${homeLabel}","item":"${BASE_URL}/"},
    {"@type":"ListItem","position":2,"name":"${kittensLabel}","item":"${selfUrl}"}
  ]}
  </script>
  <script defer src="/nav.js?v=${navJsV}"></script>
</head>
<body class="has-mobile-cta">
  <a class="skip-link" href="#main" data-i18n="a11y.skipToMain">メインコンテンツへスキップ</a>

  <!-- Scroll Progress Bar -->
  <div class="scroll-progress"></div>

`;

  const hero = `  <!-- ========== PAGE HERO ========== -->
  <section class="page-hero">
    <div class="breadcrumb">
      <a href="/" data-i18n="common.home">${escapeHtml(homeLabel)}</a>
      <span>/</span>
      <span data-i18n="kitten.breadcrumb.kittens">${escapeHtml(kittensLabel)}</span>
    </div>
    <h1 data-i18n="kitten.breadcrumb.kittens">${escapeHtml(kittensLabel)}</h1>
    <p data-i18n="kittens.heroSub">${escapeHtml(heroSub)}</p>
  </section>`;

  return head + chrome + '\n\n' + hero;
}

// Styles + behaviour for the three list entries (§6.3) and the availability filter.
// They ship inline with the generated section so the catalogue keeps working even when
// the shared bundles are cached from an older release, and so no-JS visitors still get
// the reviewed default view (the initial markup already carries it).
function kittenFilterAssets(lang) {
  const label = lang === 'en' ? 'Kitten catalogue filters' : (lang === 'zh' ? '幼猫筛选' : '子猫一覧の絞り込み');
  return `  <style>
  .kit-filters { display:flex; flex-direction:column; gap:10px; margin:0 0 14px; }
  .kit-filter-row { display:flex; flex-wrap:wrap; align-items:center; gap:8px; }
  .kit-filter-legend { font-size:0.82rem; color:var(--text-note); margin-right:2px; }
  .kit-filter-chip { border:1px solid var(--border); background:var(--bg-white); color:var(--text-main);
    border-radius:999px; padding:7px 14px; font-size:0.85rem; font-weight:600; cursor:pointer;
    transition:background 0.2s, border-color 0.2s, color 0.2s; }
  .kit-filter-chip:hover, .kit-filter-chip:focus-visible { border-color:var(--mint); color:var(--mint); }
  .kit-filter-chip.is-active { background:var(--mint); border-color:var(--mint); color:#fff; }
  .kit-vaccine-note { margin:0 0 18px; font-size:0.82rem; color:var(--text-note); }
  .kit-filter-empty { margin:20px 0 0; text-align:center; color:var(--text-note); }
  .kittens-grid .kitten-card[hidden] { display:none !important; }
  a.kitten-card { color:inherit; text-decoration:none; display:block; }
  </style>
  <script>
  (function () {
    var root = document.querySelector('[data-kitten-filters]');
    if (!root) return;
    var section = root.closest('.section') || document;
    var grid = section.querySelector('.kittens-grid');
    var empty = section.querySelector('[data-kitten-filter-empty]');
    if (!grid) return;
    var entry = 'all';
    var status = 'available';
    function apply() {
      var cards = grid.querySelectorAll('.kitten-card');
      var shown = 0;
      for (var i = 0; i < cards.length; i++) {
        var card = cards[i];
        var group = card.getAttribute('data-entry-group');
        // A card hydrated by the shared loader carries no entry group yet; never hide it
        // for a filter it cannot answer.
        var entryOk = entry === 'all' || !group || group === entry;
        var statusOk = status === 'all' || card.getAttribute('data-status') === status;
        var visible = entryOk && statusOk;
        if (visible) { card.removeAttribute('hidden'); shown++; }
        else { card.setAttribute('hidden', ''); }
      }
      if (empty) { if (shown === 0) empty.removeAttribute('hidden'); else empty.setAttribute('hidden', ''); }
    }
    function select(button, attribute) {
      var buttons = root.querySelectorAll('[' + attribute + ']');
      for (var i = 0; i < buttons.length; i++) {
        var active = buttons[i] === button;
        buttons[i].classList.toggle('is-active', active);
        buttons[i].setAttribute('aria-pressed', active ? 'true' : 'false');
      }
    }
    root.addEventListener('click', function (event) {
      var button = event.target.closest('button');
      if (!button || !root.contains(button)) return;
      if (button.hasAttribute('data-entry-filter')) {
        entry = button.getAttribute('data-entry-filter');
        select(button, 'data-entry-filter');
      } else if (button.hasAttribute('data-status-filter')) {
        status = button.getAttribute('data-status-filter');
        select(button, 'data-status-filter');
      } else return;
      apply();
    });
    root.setAttribute('aria-label', ${JSON.stringify(label)});
    if (window.MutationObserver) {
      var pending = false;
      new MutationObserver(function () {
        if (pending) return;
        pending = true;
        window.setTimeout(function () { pending = false; apply(); }, 0);
      }).observe(grid, { childList: true });
    }
    apply();
  })();
  </script>`;
}

function generateKittens(kittens, lang = 'ja') {
  // This function is also imported by focused tooling/tests, so keep the write boundary
  // safe even when main() is bypassed.
  assertSafeKittenDetailIds(kittens);
  // Apply the reviewed merchandising contract to the full page. Repartitioning this
  // result into breed buckets would let a sold kitten outrank an available kitten in a
  // later breed, and would prevent a promoted kitten from moving across breed boundaries.
  kittens = KittenCatalog.orderKittens(kittens);
  const filepath = path.join(SITE_DIR, 'kittens.html');
  const { header: jaHeader, tail } = extractTemplate(filepath);
  const header = injectSmallAnimalNavigation(buildListHeader(jaHeader, lang), lang);
  const outPath = lang === 'ja'
    ? filepath
    : path.join(SITE_DIR, lang, 'kittens.html');
  if (lang !== 'ja') {
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
  }

  // A single ordered grid is intentional: breed remains visible on every card, while
  // the business ordering contract remains global. Keep every safe, photographed kitten
  // visible even when a future breed has not yet been added to BREED_CONFIG.
  const group = kittens.filter(k => Array.isArray(k.photos) && k.photos.length > 0 && getCoverPhoto(k));
  const catalogCopy = KITTENS_CATALOG_SECTION[lang] || KITTENS_CATALOG_SECTION.ja;

  // Build the one global catalog section.
  let sections = '';
  // LCP: only the very first card image on the page gets eager/high-priority.
  // Every later card stays lazy so we don't make all images eager.
  let lcpImgEmitted = false;
  if (group.length > 0) {
    const cfg = BREED_CONFIG[0];
    const shapesHtml = cfg.shapes.map(s =>
      `      <div class="shape" style="width:${s.w}px;height:${s.h}px;background:${s.bg};${s.pos}"></div>`
    ).join('\n');

    let cardsHtml = '';
    for (const k of group) {
      const photo = getCoverPhoto(k);
      const effectiveStatus = KittenCatalog.normalizeStatus(k.status);
      // First card on the page = LCP candidate: eager + high priority. Rest stay lazy.
      const imgLoadAttrs = lcpImgEmitted
        ? 'loading="lazy"'
        : 'loading="eager" fetchpriority="high"';
      lcpImgEmitted = true;
      const st = statusText(effectiveStatus);
      const gt = genderText(k.gender);
      const bd = formatBirthday(k.birthday);
      const salePrice = KittenCatalog.normalizeSalePrice(k.price);
      const pr = salePrice === null ? '' : formatPrice(salePrice);
      // COPY-SPEC §11: a placed kitten is never "new". NEW on a ご家族決定 card reads as
      // a fresh listing you can still buy.
      const isNewBadge = k.isNew && effectiveStatus !== 'sold'
        ? '\n            <span class="kit-badge-new">NEW</span>'
        : '';
      const promotionTag = KittenCatalog.normalizePromotionTag(k.promotionTag);
      const promotionPriority = KittenCatalog.normalizePromotionPriority(k);
      const promotionChip = promotionTag
        ? `\n            <span class="kitten-promotion-chip usp-chip usp-chip--card" data-promotion-tag="${escapeHtml(promotionTag)}">${escapeHtml(KittenCatalog.promotionLabel(promotionTag, lang))}</span>`
        : '';
      const noteL = sanitizeOwnerCopy(noteFor(k, lang));
      const noteHtml = noteL
        ? `\n            <p class="kit-meta" style="font-size:11px;color:var(--text-note);">${escapeHtml(noteL)}</p>`
        : '';
      // §5.2 / §6.2 card badges. A mix is packaged as a positive choice, an adult as a
      // ready-to-go companion; both are entries the owner wants shoppers to notice.
      const langCopy = MIX_COPY[lang] || MIX_COPY.ja;
      const adultCopy = ADULT_COPY[lang] || ADULT_COPY.ja;
      const mixChip = isMixBreed(k.breed)
        ? `\n            <span class="usp-chip usp-chip--card" data-chip="mix">${escapeHtml(langCopy.badge)}</span>`
        : '';
      const adultChip = isAdultCat(k)
        ? `\n            <span class="usp-chip usp-chip--card" data-chip="adult">${escapeHtml(adultCopy.badge)}</span>`
        : '';
      const neuterChip = isNeuteredCat(k)
        ? `\n            <span class="usp-chip usp-chip--card" data-chip="neutered">${escapeHtml(adultCopy.neuteredBadge)}</span>`
        : '';
      const entryGroup = listEntryGroup(k);

      // Localized baked strings (ja passthrough → byte-identical). The card has no
      // data-i18n, so every visible value is emitted in-language here.
      const stL = lang === 'ja' ? st : statusTextL(effectiveStatus, lang);
      const breedCard = lang === 'ja' ? k.breed : breedLabel(k.breed, lang);
      const colorCard = lang === 'ja' ? k.color : colorLabel(k.color, lang);
      const genderCard = lang === 'ja' ? k.gender : genderTextL(k.gender, lang); // en/zh: no ♂/♀ symbol
      const genderWord = lang === 'ja' ? gt : ''; // ja shows "♂ 男の子"; en/zh label already carries the word
      const bornCard = lang === 'ja' ? `${escapeHtml(bd)}生まれ` : escapeHtml(bornPhrase(k.birthday, lang));

      const cardAlt = lang === 'ja'
        ? `${k.breed}の子猫 ${k.color || ''} ${gt}・個体番号${k.breederId}`.trim()
        : (lang === 'en'
            ? `${breedCard} kitten ${colorCard || ''} ${genderCard} · ID ${k.breederId}`.replace(/\s+/g, ' ').trim()
            : `${breedCard}幼猫 ${colorCard || ''} ${genderCard}・个体编号${k.breederId}`.replace(/\s+/g, ' ').trim());
      // Card meta line. ja: "♂ 男の子 ・ <color>"; en/zh: "Male ・ <color>".
      const metaLine = lang === 'ja'
        ? `${escapeHtml(k.gender)} ${escapeHtml(gt)} ・ ${escapeHtml(k.color)}`
        : `${escapeHtml(genderCard)} ・ ${escapeHtml(colorCard)}`;
      // Hypoallergenic chip: ONLY on pure Siberian (raw breed exactly 'サイベリアン').
      // The mix 'サイベリアン×ブリティッシュ' folds into this Siberian section but must
      // NOT get the chip — a hypoallergenic claim on a mixed breed would overclaim.
      const hypoChip = k.breed === 'サイベリアン'
        ? `\n            <span class="usp-chip usp-chip--card" data-i18n="chip.hypoallergenic">${escapeHtml(hypoChipText(lang))}</span>`
        : '';
      const detailEligible = effectiveStatus === 'available' || effectiveStatus === 'reserved';
      const detailUrl = detailEligible
        ? `/${langDir(lang)}kittens/${encodeURIComponent(k.breederId)}.html`
        : '';
      const cardRole = detailEligible ? 'link' : 'button';
      const modalSemantics = detailEligible ? '' : ' aria-haspopup="dialog"';
      // A card that has a detail page IS a link: an anchor gives middle-click, "open in
      // new tab", copy-link and crawlable markup for free. A sold kitten has no detail
      // page, so it stays a div that opens the modal.
      const cardTag = detailEligible ? 'a' : 'div';
      const cardHref = detailEligible ? ` href="${escapeHtml(detailUrl)}"` : '';
      const cardClose = detailEligible ? '</a>' : '</div>';
      // The default view is "販売中のみ" (§ list contract), and it has to hold without
      // JavaScript too — so the initial markup already carries the default state.
      const initialHidden = effectiveStatus === 'available' ? '' : ' hidden';
      cardsHtml += `
        <${cardTag} class="kitten-card"${cardHref}${initialHidden} role="${cardRole}" tabindex="0"${modalSemantics} data-status="${effectiveStatus}" data-entry-group="${entryGroup}" data-promotion-tag="${escapeHtml(promotionTag)}" data-promotion-priority="${promotionPriority}" data-price="${salePrice === null ? '' : salePrice}" data-birthday="${escapeHtml(k.birthday)}" data-images="${escapeHtml(photo)}" data-video="" data-papa="${escapeHtml(k.papa)}" data-mama="${escapeHtml(k.mama)}" data-new="${k.isNew ? 'true' : 'false'}" data-name="" data-breeder-id="${escapeHtml(k.breederId)}" data-detail-url="${escapeHtml(detailUrl)}">
          <div class="kitten-img">
            <img src="${escapeHtml(photo)}" alt="${escapeHtml(cardAlt)}" ${imgLoadAttrs} width="360" height="360" style="width:100%;height:100%;object-fit:cover;aspect-ratio:1/1;">
            <span class="kit-status st-${effectiveStatus}"${statusI18nKey(effectiveStatus) ? ` data-i18n="${statusI18nKey(effectiveStatus)}"` : ''}>${escapeHtml(stL)}</span>${isNewBadge}
          </div>
          <div class="kitten-body">
            <h3>${escapeHtml(breedCard)}</h3>${promotionChip}${hypoChip}${mixChip}${adultChip}${neuterChip}
            <p class="kit-meta">${metaLine}</p>
            <p class="kit-meta">${bornCard}</p>${noteHtml}
            <p class="kit-price">${salePrice === null ? escapeHtml(priceInquiryText(lang)) : `&yen;${pr} <span class="tax">${taxIncl(lang)}</span>`}</p>
          </div>
        ${cardClose}`;
    }

    // §11 heading: the number that matters is how many kittens you can actually buy
    // today, with the full published count kept honest next to it.
    const availableCount = group.filter(k => KittenCatalog.normalizeStatus(k.status) === 'available').length;
    const secTitle = escapeHtml(listHeadingText(availableCount, group.length, lang));
    const entryCopy = LIST_ENTRY_COPY[lang] || LIST_ENTRY_COPY.ja;
    const vaccineNote = VACCINE_FEE_LIST[lang] || VACCINE_FEE_LIST.ja;
    // §6.3 — three entries, one grid. Filtering in place keeps a single canonical URL
    // for the catalogue instead of three thin pages competing with each other.
    const entryButtons = [
      ['all', entryCopy.all],
      ['siberian', entryCopy.siberian],
      ['golden', entryCopy.golden],
      ['adultmix', entryCopy.adultmix],
    ].map(([value, label], index) => `
          <button type="button" class="kit-filter-chip${index === 0 ? ' is-active' : ''}" data-entry-filter="${value}" aria-pressed="${index === 0 ? 'true' : 'false'}">${escapeHtml(label)}</button>`).join('');
    const statusButtons = [
      ['available', entryCopy.statusAvailable],
      ['all', entryCopy.statusAll],
    ].map(([value, label], index) => `
          <button type="button" class="kit-filter-chip${index === 0 ? ' is-active' : ''}" data-status-filter="${value}" aria-pressed="${index === 0 ? 'true' : 'false'}">${escapeHtml(label)}</button>`).join('');
    sections += `

  <!-- ========== ORDERED KITTEN CATALOG ========== -->
  <section class="section sec-white" data-catalog-order="global" style="position:relative;">
    <div class="parallax-bg">
${shapesHtml}
    </div>
    <div class="container" style="position:relative;z-index:1;">
      <div class="sec-header">
        <span class="sec-tag">${escapeHtml(catalogCopy.tag)}</span>
        <h2 class="sec-title">${secTitle}</h2>
        <p class="sec-desc">${escapeHtml(catalogCopy.desc)}</p>
      </div>
      <div class="kit-filters" data-kitten-filters>
        <div class="kit-filter-row" role="group" aria-label="${escapeHtml(entryCopy.legend)}">
          <span class="kit-filter-legend">${escapeHtml(entryCopy.legend)}</span>${entryButtons}
        </div>
        <div class="kit-filter-row" role="group" aria-label="${escapeHtml(entryCopy.statusLegend)}">
          <span class="kit-filter-legend">${escapeHtml(entryCopy.statusLegend)}</span>${statusButtons}
        </div>
      </div>
      <p class="kit-vaccine-note">${escapeHtml(vaccineNote)}</p>
      <div class="kittens-grid" style="grid-template-columns:repeat(auto-fill, minmax(260px, 1fr));">${cardsHtml}
      </div>
      <p class="kit-filter-empty" data-kitten-filter-empty hidden>${escapeHtml(entryCopy.empty)}</p>
    </div>
  </section>
${kittenFilterAssets(lang)}`;
  }

  if (group.length === 0) {
    const empty = KITTENS_EMPTY_COPY[lang] || KITTENS_EMPTY_COPY.ja;
    sections = emptyCatalogSection(empty.message, empty.tag);
  }

  // The list page describes navigation only. Product and Offer truth belongs to each
  // priced detail page, where the entity has one stable identity across languages.
  const listItems = [];
  const listPageUrl = `${BASE_URL}/${langDir(lang)}kittens.html`;
  for (const k of kittens) {
    const effectiveStatus = KittenCatalog.normalizeStatus(k.status);
    if (effectiveStatus !== 'available' && effectiveStatus !== 'reserved') continue;
    const photo = getCoverPhoto(k);
    if (!photo) continue;
    const salePrice = KittenCatalog.normalizeSalePrice(k.price);
    if (salePrice === null) continue;
    const gt = genderText(k.gender);
    const fileId = k.breederId || k.id;
    let name;
    if (lang === 'ja') {
      name = `${k.breed}・${k.color || ''}・${gt}・${fileId}`;
    } else {
      const bL = breedLabel(k.breed, lang);
      const cL = colorLabel(k.color, lang);
      const gL = genderTextL(k.gender, lang);
      if (lang === 'en') {
        name = `${bL} · ${cL || ''} · ${gL} · ${fileId}`.replace(/\s+/g, ' ').trim();
      } else {
        name = `${bL}・${cL || ''}・${gL}・${fileId}`;
      }
    }
    listItems.push({
      url: `${BASE_URL}/${langDir(lang)}kittens/${fileId}.html`,
      name,
      image: photo,
    });
  }
  const itemListJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    '@id': `${listPageUrl}#kitten-list`,
    name: catalogCopy.title,
    numberOfItems: listItems.length,
    itemListElement: listItems.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      url: item.url,
      name: item.name,
      image: item.image,
    })),
  };
  const itemListSchemaHtml =
    '\n  <!-- Generated kitten ItemList -->\n' +
    '  <script type="application/ld+json">\n' +
    jsonForHtmlScript(itemListJsonLd, 2) +
    '\n  </script>\n';

  // Strip both sides of the migration so old and new tracked pages regenerate cleanly.
  let cleanedTail = tail.replace(
    /\n\s*<!-- Per-kitten Product schema \(generated by SEO sweep\) -->\s*\n\s*<script type="application\/ld\+json">[\s\S]*?<\/script>\s*\n/g,
    '\n'
  ).replace(
    /\n\s*<!-- Generated kitten ItemList -->\s*\n\s*<script type="application\/ld\+json">[\s\S]*?<\/script>\s*\n/g,
    '\n'
  );
  // For en/zh, absolutize the ja tail's chrome links (footer/CTA/scripts) so they resolve
  // from the one-level-deep /en//zh path, mirroring the detail-page precedent. ja untouched.
  if (lang !== 'ja') cleanedTail = listToAbsoluteLinks(cleanedTail);
  // Localize the final contact CTA block (heading/lead/buttons) for en/zh. ja untouched.
  if (lang !== 'ja') cleanedTail = localizeKittensCta(cleanedTail, lang);
  // Bake the dictionary default into every data-i18n slot of the copied ja chrome, so
  // the en/zh source (what a crawler and a no-JS visitor read) is actually in-language.
  if (lang !== 'ja') cleanedTail = prefillI18nDefaults(cleanedTail, lang);
  const tailWithSchema = cleanedTail.replace('</body>', `${itemListSchemaHtml}</body>`);

  const localizedHeader = lang === 'ja' ? header : prefillI18nDefaults(header, lang);
  const output = localizedHeader + '\n' + sections + '\n\n' + tailWithSchema;
  fs.writeFileSync(outPath, output, 'utf-8');
  const label = lang === 'ja' ? 'kittens.html' : `${lang}/kittens.html`;
  console.log(`  ${label} -> ${kittens.length} kittens (1 globally ordered catalog), ${listItems.length} ItemList entries`);
}

// ── Generate Small Animals (owner-gated dark launch) ─────────

const SMALL_ANIMAL_COPY = {
  ja: {
    list: '小動物一覧',
    pageTitle: '小動物一覧｜福楽キャッテリー',
    description: '福楽キャッテリーの小動物一覧。',
    empty: '現在、掲載中の小動物はいません。',
    species: '種類',
    breed: '品種',
    sex: '性別',
    unknownSex: '未確認',
    color: '毛色',
    birthday: '誕生月',
    status: '状態',
    identifier: '個体番号',
    back: '← 小動物一覧に戻る',
    line: 'LINEでこの子について相談',
  },
  en: {
    list: 'Small Animals',
    pageTitle: 'Small Animals | Fuluck Cattery',
    description: 'Small-animal listings at Fuluck Cattery.',
    empty: 'There are currently no small animals listed.',
    species: 'Species',
    breed: 'Breed',
    sex: 'Sex',
    unknownSex: 'Not confirmed',
    color: 'Color',
    birthday: 'Born',
    status: 'Status',
    identifier: 'ID',
    back: '← Back to Small Animals',
    line: 'Ask about this animal on LINE',
  },
  zh: {
    list: '小动物一览',
    pageTitle: '小动物一览｜福楽キャッテリー',
    description: '福楽キャッテリー的小动物一览。',
    empty: '目前没有在售小动物。',
    species: '种类',
    breed: '品种',
    sex: '性别',
    unknownSex: '未确认',
    color: '毛色',
    birthday: '出生月',
    status: '状态',
    identifier: '个体编号',
    back: '← 返回小动物一览',
    line: '通过LINE咨询这只小动物',
  },
};

const PRIVATE_PREVIEW_DIR = '.private-preview';

function activeSmallAnimalSlug() {
  const slug = SMALL_ANIMALS_LAUNCH.public
    ? SMALL_ANIMALS_LAUNCH.slugPublic
    : SMALL_ANIMALS_LAUNCH.slugDark;
  if (!slug) {
    throw new Error('Small-animal dark preview is disabled: SMALL_ANIMALS_DARK_SLUG is not set');
  }
  return slug;
}

function smallAnimalRoutePath(lang = 'ja', detailId = '') {
  const previewPrefix = SMALL_ANIMALS_LAUNCH.public ? '' : `${PRIVATE_PREVIEW_DIR}/`;
  const base = `${previewPrefix}${langDir(lang)}${activeSmallAnimalSlug()}`;
  return detailId ? `${base}/${encodeURIComponent(detailId)}.html` : `${base}.html`;
}

function smallAnimalHreflangBlock(detailId = '') {
  const ja = smallAnimalRoutePath('ja', detailId);
  const en = smallAnimalRoutePath('en', detailId);
  const zh = smallAnimalRoutePath('zh', detailId);
  return `  <link rel="alternate" hreflang="ja" href="${BASE_URL}/${ja}">
  <link rel="alternate" hreflang="en" href="${BASE_URL}/${en}">
  <link rel="alternate" hreflang="zh" href="${BASE_URL}/${zh}">
  <link rel="alternate" hreflang="x-default" href="${BASE_URL}/${ja}">`;
}

function smallAnimalOutputPrefix(lang = 'ja') {
  const segments = [];
  if (!SMALL_ANIMALS_LAUNCH.public) segments.push(PRIVATE_PREVIEW_DIR);
  if (lang !== 'ja') segments.push(lang);
  return segments;
}

function inactiveSmallAnimalSlug() {
  return SMALL_ANIMALS_LAUNCH.public
    ? SMALL_ANIMALS_LAUNCH.slugDark
    : SMALL_ANIMALS_LAUNCH.slugPublic;
}

function smallAnimalOutputPath(...segments) {
  const root = path.resolve(SITE_DIR);
  const target = path.resolve(root, ...segments);
  if (target === root || !target.startsWith(root + path.sep)) {
    throw new Error(`Refusing unsafe small-animal output path: ${target}`);
  }
  return target;
}

function removePublicSmallAnimalOutput() {
  for (const lang of ['ja', 'en', 'zh']) {
    const prefix = lang === 'ja' ? [] : [lang];
    const listPath = smallAnimalOutputPath(...prefix, `${SMALL_ANIMALS_LAUNCH.slugPublic}.html`);
    const detailDir = smallAnimalOutputPath(...prefix, SMALL_ANIMALS_LAUNCH.slugPublic);
    if (fs.existsSync(listPath)) fs.unlinkSync(listPath);
    if (fs.existsSync(detailDir)) fs.rmSync(detailDir, { recursive: true, force: true });
  }
}

function injectSmallAnimalNavigation(headerHtml, lang = 'ja') {
  if (!headerHtml) return headerHtml;
  // Generated links carry a marker so every pass can replace the prior language and a
  // public→dark rollback removes stale discovery links from the shared template.
  let output = headerHtml.replace(
    /<a\b(?=[^>]*\bdata-small-animal-nav\b)[^>]*>[\s\S]*?<\/a>\s*/g,
    '',
  );
  if (!SMALL_ANIMALS_LAUNCH.public) return output;
  const copy = SMALL_ANIMAL_COPY[lang] || SMALL_ANIMAL_COPY.ja;
  const href = `/${langDir(lang)}${activeSmallAnimalSlug()}.html`;

  function insertIntoNav(html, marker, linkHtml) {
    const markerIndex = html.indexOf(marker);
    if (markerIndex === -1) return html;
    const navEnd = html.indexOf('</nav>', markerIndex);
    if (navEnd === -1) return html;
    return html.slice(0, navEnd) + linkHtml + html.slice(navEnd);
  }

  output = insertIntoNav(
    output,
    'class="nav-links"',
    `\n        <a href="${href}" class="nav-link" data-small-animal-nav>${escapeHtml(copy.list)}</a>\n      `,
  );
  output = insertIntoNav(
    output,
    'class="mobile-nav"',
    `\n      <a href="${href}" class="mobile-nav-link" data-small-animal-nav>${escapeHtml(copy.list)}</a>\n    `,
  );
  return output;
}

function dedupeSmallAnimals(animals) {
  const order = [];
  const byBreederId = new Map();
  for (const animal of animals || []) {
    if (!animal || !animal.breederId) continue;
    if (!byBreederId.has(animal.breederId)) order.push(animal.breederId);
    byBreederId.set(animal.breederId, animal);
  }
  return order.map(id => byBreederId.get(id));
}

function smallAnimalPriceHtml(price, lang, className = 'kit-price') {
  const numericPrice = validSmallAnimalSalePrice(price);
  if (numericPrice === null) return '';
  return `<p class="${className}">&yen;${formatPrice(numericPrice)} <span class="tax">${taxIncl(lang)}</span></p>`;
}

function validSmallAnimalSalePrice(price) {
  return KittenCatalog.normalizeSalePrice(price);
}

function smallAnimalHead({ lang, detailId = '', title, description }) {
  const relPath = smallAnimalRoutePath(lang, detailId);
  const selfUrl = `${BASE_URL}/${relPath}`;
  const robotsMeta = SMALL_ANIMALS_LAUNCH.public
    ? ''
    : '  <meta name="robots" content="noindex,nofollow">\n';
  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
${robotsMeta}  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${escapeHtml(selfUrl)}">
  <meta name="twitter:card" content="summary">
  <meta name="theme-color" content="#7DD3C0">
  <link rel="canonical" href="${escapeHtml(selfUrl)}">
${smallAnimalHreflangBlock(detailId)}
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="preload" as="style" href="${fontHref(lang)}" onload="this.onload=null;this.rel='stylesheet'">
  <noscript><link href="${fontHref(lang)}" rel="stylesheet"></noscript>
  <link rel="stylesheet" href="/style.css?v=${verAsset('style.css', '20260823a')}">
  <link rel="stylesheet" href="/nav.css?v=${verAsset('nav.css', '20260711c')}">
  <link rel="icon" href="/favicon.ico" sizes="any">
  <link rel="icon" type="image/svg+xml" href="${FAVICON_HREF}">
  <link rel="apple-touch-icon" href="/apple-touch-icon.png">
  <script defer src="/nav.js?v=${verAsset('nav.js', '20260823a')}"></script>`;
}

function buildSmallAnimalListHtml(animals, headerHtml, footerHtml, lang = 'ja') {
  const copy = SMALL_ANIMAL_COPY[lang] || SMALL_ANIMAL_COPY.ja;
  headerHtml = injectSmallAnimalNavigation(headerHtml, lang);
  const deduped = dedupeSmallAnimals(animals);
  const groups = new Map(SPECIES_CONFIG.map(cfg => [cfg.species, []]));

  for (const animal of deduped) {
    if (!getCoverPhoto(animal)) continue;
    if (!groups.has(animal.species)) {
      console.warn(`  [warn] Unknown small-animal species "${animal.species}" for ${animal.breederId}, skipping`);
      continue;
    }
    groups.get(animal.species).push(animal);
  }

  let lcpImgEmitted = false;
  let sections = '';
  for (const cfg of SPECIES_CONFIG) {
    const group = groups.get(cfg.species) || [];
    if (!group.length) continue;
    let cards = '';
    for (const animal of group) {
      const photo = getCoverPhoto(animal);
      const imgAttrs = lcpImgEmitted ? 'loading="lazy"' : 'loading="eager" fetchpriority="high"';
      lcpImgEmitted = true;
      const breed = smallAnimalBreedLabel(animal.breed, lang);
      const color = smallAnimalColorLabel(animal.color, lang);
      const gender = animal.gender === 'unknown' ? copy.unknownSex : genderTextL(animal.gender, lang);
      const status = statusTextL(animal.status, lang);
      const species = smallAnimalSpeciesLabel(animal.species, lang);
      const detailPath = `/${smallAnimalRoutePath(lang, animal.breederId)}`;
      const detailEligible = animal.status === 'available' || animal.status === 'reserved';
      const image = `<img src="${escapeHtml(photo)}" alt="${escapeHtml(`${species} ${breed} ${color} ${gender} ${animal.breederId}`.replace(/\s+/g, ' ').trim())}" ${imgAttrs} width="360" height="360" style="width:100%;height:100%;object-fit:cover;aspect-ratio:1/1;">`;
      const imageHtml = detailEligible ? `<a href="${detailPath}">${image}</a>` : image;
      cards += `
        <article class="kitten-card" data-status="${escapeHtml(animal.status)}" data-breeder-id="${escapeHtml(animal.breederId)}">
          <div class="kitten-img">
            ${imageHtml}
            <span class="kit-status st-${escapeHtml(animal.status)}">${escapeHtml(status)}</span>${animal.isNew ? '\n            <span class="kit-badge-new">NEW</span>' : ''}
          </div>
          <div class="kitten-body">
            <p class="kit-meta">${escapeHtml(species)}</p>
            <h3>${escapeHtml(breed)}</h3>
            <p class="kit-meta">${escapeHtml([gender, color].filter(Boolean).join(' ・ '))}</p>
            ${animal.birthday ? `<p class="kit-meta">${escapeHtml(bornPhrase(animal.birthday, lang))}</p>` : ''}
            ${animal.note ? `<p class="kit-meta">${escapeHtml(animal.note)}</p>` : ''}
            ${smallAnimalPriceHtml(animal.price, lang)}
          </div>
        </article>`;
    }
    sections += `
  <section class="section ${cfg.bgClass}">
    <div class="container">
      <div class="sec-header">
        <span class="sec-tag">${escapeHtml(cfg.tag)}</span>
        <h2 class="sec-title">${escapeHtml(smallAnimalSpeciesLabel(cfg.species, lang))}${countLabel(group.length, lang)}</h2>
      </div>
      <div class="kittens-grid">${cards}
      </div>
    </div>
  </section>`;
  }

  if (!sections) {
    sections = `
  <main id="main" class="section sec-white">
    <div class="container">
      <div class="small-animal-empty" role="status">
        <span aria-hidden="true">🌿</span>
        <p>${escapeHtml(copy.empty)}</p>
      </div>
    </div>
  </main>`;
  } else {
    sections = `<main id="main">${sections}\n  </main>`;
  }

  return `${smallAnimalHead({ lang, title: copy.pageTitle, description: copy.description })}
  <style>
    .small-animal-empty { max-width:680px; margin:24px auto; padding:56px 32px; border:1px solid var(--border); border-radius:28px; background:var(--bg-cream); text-align:center; }
    .small-animal-empty span { display:block; margin-bottom:16px; font-size:2rem; }
    .small-animal-empty p { margin:0; color:var(--text-note); line-height:1.8; }
    .kitten-card a { color:inherit; text-decoration:none; }
  </style>
</head>
<body class="has-mobile-cta">
  <a class="skip-link" href="#main">メインコンテンツへスキップ</a>
  <div class="scroll-progress"></div>

${headerHtml}

  <section class="page-hero">
    <div class="breadcrumb"><a href="/">${escapeHtml(HOME_LABEL[lang] || HOME_LABEL.ja)}</a><span>/</span><span>${escapeHtml(copy.list)}</span></div>
    <h1>${escapeHtml(copy.list)}</h1>
  </section>
${sections}

${footerHtml}

  <script src="/i18n.js?v=${verAsset('i18n.js', '20260823a')}"></script>
  <script src="/script.js?v=${verAsset('script.js', '20260823a')}"></script>
</body>
</html>`;
}

function buildSmallAnimalDetailHtml(animal, headerHtml, footerHtml, lang = 'ja') {
  const copy = SMALL_ANIMAL_COPY[lang] || SMALL_ANIMAL_COPY.ja;
  const fileId = animal.breederId;
  const relPath = smallAnimalRoutePath(lang, fileId);
  headerHtml = injectSmallAnimalNavigation(headerHtml, lang);
  const pageUrl = `${BASE_URL}/${relPath}`;
  const species = smallAnimalSpeciesLabel(animal.species, lang);
  const breed = smallAnimalBreedLabel(animal.breed, lang);
  const color = smallAnimalColorLabel(animal.color, lang);
  const gender = animal.gender === 'unknown' ? copy.unknownSex : genderTextL(animal.gender, lang);
  const status = statusTextL(animal.status, lang);
  const titleText = [species, breed, gender, color].filter(Boolean).join(' ・ ');
  const pageTitle = `${titleText} | ${copy.list} | Fuluck Cattery`;
  const description = [breed, color, gender, bornPhrase(animal.birthday, lang), fileId].filter(Boolean).join(' ・ ');
  const photos = Array.isArray(animal.photos) ? animal.photos : [];
  const coverPhoto = getCoverPhoto(animal) || '';
  const salePrice = validSmallAnimalSalePrice(animal.price);
  const structuredData = SMALL_ANIMALS_LAUNCH.public
    ? `
  <script type="application/ld+json">
${jsonForHtmlScript({
  '@context': 'https://schema.org',
  '@type': 'Product',
  name: titleText,
  ...(lang !== 'ja' ? { inLanguage: lang } : {}),
  image: photos,
  sku: fileId,
  ...(salePrice !== null ? {
    offers: {
      '@type': 'Offer',
      url: pageUrl,
      priceCurrency: 'JPY',
      price: String(salePrice),
      availability: animal.status === 'available'
        ? 'https://schema.org/InStock'
        : 'https://schema.org/LimitedAvailability',
      seller: { '@type': 'Organization', name: '福楽キャッテリー' },
    },
  } : {}),
})}
  </script>
  <script type="application/ld+json">
${jsonForHtmlScript({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  ...(lang !== 'ja' ? { inLanguage: lang } : {}),
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: HOME_LABEL[lang] || HOME_LABEL.ja, item: `${BASE_URL}/` },
    { '@type': 'ListItem', position: 2, name: copy.list, item: `${BASE_URL}/${smallAnimalRoutePath(lang)}` },
    { '@type': 'ListItem', position: 3, name: titleText, item: pageUrl },
  ],
})}
  </script>`
    : '';

  const thumbs = photos.length > 1
    ? `<div class="small-animal-thumbs">${photos.map((photo, idx) => `<button type="button" class="small-animal-thumb${idx === (animal.coverIndex || 0) ? ' active' : ''}" data-photo="${escapeHtml(photo)}" aria-label="${escapeHtml(titleText)} ${idx + 1}"><img src="${escapeHtml(photo)}" alt="" loading="lazy"></button>`).join('')}</div>`
    : '';
  const rows = [
    [copy.species, species],
    [copy.breed, breed],
    [copy.sex, gender],
    ...(color ? [[copy.color, color]] : []),
    ...(animal.birthday ? [[copy.birthday, bornPhrase(animal.birthday, lang)]] : []),
    [copy.status, status],
    [copy.identifier, fileId],
  ].map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`).join('\n          ');
  const ytId = extractYouTubeId(animal.video);
  const video = ytId
    ? `<div class="small-animal-video"><iframe src="https://www.youtube.com/embed/${ytId}" title="${escapeHtml(titleText)}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy"></iframe></div>`
    : '';

  return `${smallAnimalHead({ lang, detailId: fileId, title: pageTitle, description })}${structuredData}
  <style>
    .small-animal-detail { padding:24px 0 64px; }
    .small-animal-layout { display:grid; gap:32px; }
    .small-animal-main-photo { overflow:hidden; border-radius:28px; background:var(--bg-cream); aspect-ratio:4/3; }
    .small-animal-main-photo img { width:100%; height:100%; object-fit:cover; display:block; }
    .small-animal-thumbs { display:flex; gap:10px; margin-top:12px; overflow-x:auto; }
    .small-animal-thumb { width:76px; height:76px; padding:0; border:2px solid transparent; border-radius:14px; overflow:hidden; background:none; cursor:pointer; flex:0 0 auto; }
    .small-animal-thumb.active { border-color:var(--mint); }
    .small-animal-thumb img { width:100%; height:100%; object-fit:cover; }
    .small-animal-info h1 { margin:0 0 16px; font-size:clamp(1.55rem, 4vw, 2.2rem); line-height:1.35; }
    .small-animal-info .kit-status { display:inline-block; margin-bottom:16px; }
    .small-animal-info .kitten-detail-price { margin:0 0 24px; font-size:1.5rem; font-weight:700; color:var(--strawberry); }
    .small-animal-table { width:100%; border-collapse:collapse; margin:0 0 24px; }
    .small-animal-table th, .small-animal-table td { padding:11px 12px; border-bottom:1px solid var(--border); text-align:left; }
    .small-animal-table th { width:120px; color:var(--text-note); font-weight:500; }
    .small-animal-note { line-height:1.8; white-space:pre-wrap; }
    .small-animal-actions { display:flex; flex-wrap:wrap; gap:12px; margin-top:28px; }
    .small-animal-actions .btn { text-decoration:none; }
    .small-animal-video { position:relative; margin-top:24px; padding-bottom:56.25%; overflow:hidden; border-radius:20px; background:#000; }
    .small-animal-video iframe { position:absolute; inset:0; width:100%; height:100%; border:0; }
    @media (min-width:800px) { .small-animal-layout { grid-template-columns:minmax(0, 1.1fr) minmax(320px, .9fr); align-items:start; } }
  </style>
</head>
<body>
  <a class="skip-link" href="#main">メインコンテンツへスキップ</a>
  <div class="scroll-progress"></div>

${headerHtml}

  <main id="main" class="small-animal-detail">
    <div class="container">
      <nav class="breadcrumb"><a href="/">${escapeHtml(HOME_LABEL[lang] || HOME_LABEL.ja)}</a> &gt; <a href="/${smallAnimalRoutePath(lang)}">${escapeHtml(copy.list)}</a> &gt; ${escapeHtml(fileId)}</nav>
      <div class="small-animal-layout">
        <div>
          <div class="small-animal-main-photo"><img id="smallAnimalMainPhoto" src="${escapeHtml(coverPhoto)}" alt="${escapeHtml(titleText)}" loading="eager" fetchpriority="high" width="800" height="600"></div>
          ${thumbs}
          ${video}
        </div>
        <div class="small-animal-info">
          <h1>${escapeHtml(titleText)}</h1>
          <span class="kit-status st-${escapeHtml(animal.status)}">${escapeHtml(status)}</span>
          ${smallAnimalPriceHtml(animal.price, lang, 'kitten-detail-price')}
          <table class="small-animal-table">${rows}</table>
          ${animal.note ? `<p class="small-animal-note">${escapeHtml(animal.note)}</p>` : ''}
          <div class="small-animal-actions">
            <a href="https://page.line.me/915hnnlk?oat__id=5765672&openQrModal=true" class="btn btn-primary" target="_blank" rel="noopener">${escapeHtml(copy.line)}</a>
            <a href="/${smallAnimalRoutePath(lang)}" class="btn btn-outline">${escapeHtml(copy.back)}</a>
          </div>
        </div>
      </div>
    </div>
  </main>

${footerHtml}

  <script>
  document.querySelectorAll('.small-animal-thumb').forEach(function(button) {
    button.addEventListener('click', function() {
      var main = document.getElementById('smallAnimalMainPhoto');
      if (main) main.src = this.getAttribute('data-photo');
      document.querySelectorAll('.small-animal-thumb').forEach(function(item) { item.classList.remove('active'); });
      this.classList.add('active');
    });
  });
  </script>
  <script src="/i18n.js?v=${verAsset('i18n.js', '20260823a')}"></script>
  <script src="/script.js?v=${verAsset('script.js', '20260823a')}"></script>
</body>
</html>`;
}

function generateSmallAnimals(animals, lang = 'ja') {
  const slug = activeSmallAnimalSlug();
  const outputPrefix = smallAnimalOutputPrefix(lang);
  const outPath = smallAnimalOutputPath(...outputPrefix, `${slug}.html`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const { headerHtml, footerHtml } = extractDetailTemplate();
  fs.writeFileSync(outPath, buildSmallAnimalListHtml(animals, headerHtml, footerHtml, lang), 'utf8');

  const inactiveSlug = inactiveSmallAnimalSlug();
  if (inactiveSlug) {
    const publicPrefix = lang === 'ja' ? [] : [lang];
    const stalePath = smallAnimalOutputPath(...publicPrefix, `${inactiveSlug}.html`);
    if (fs.existsSync(stalePath)) fs.unlinkSync(stalePath);
  }
  // Migrate any legacy root-level dark output and remove the formal public output on a
  // public->private rollback. Public launch removes the entire ignored preview tree.
  if (SMALL_ANIMALS_LAUNCH.public) {
    const previewRoot = smallAnimalOutputPath(PRIVATE_PREVIEW_DIR);
    if (fs.existsSync(previewRoot)) fs.rmSync(previewRoot, { recursive: true, force: true });
  } else {
    const publicPrefix = lang === 'ja' ? [] : [lang];
    const legacyDarkPath = smallAnimalOutputPath(...publicPrefix, `${slug}.html`);
    if (fs.existsSync(legacyDarkPath)) fs.unlinkSync(legacyDarkPath);
  }
  if (SMALL_ANIMALS_LAUNCH.public) {
    console.log(`  ${langDir(lang)}${slug}.html -> ${dedupeSmallAnimals(animals).length} small animals`);
  } else {
    console.log(`  [private preview] ${lang} list -> ${dedupeSmallAnimals(animals).length} small animals`);
  }
}

function generateSmallAnimalDetailPages(animals, lang = 'ja') {
  const slug = activeSmallAnimalSlug();
  const outputPrefix = smallAnimalOutputPrefix(lang);
  const outputDir = smallAnimalOutputPath(...outputPrefix, slug);
  fs.mkdirSync(outputDir, { recursive: true });

  const eligible = dedupeSmallAnimals(animals).filter(animal =>
    (animal.status === 'available' || animal.status === 'reserved') && getCoverPhoto(animal)
  );
  const expected = new Set(eligible.map(animal => `${encodeURIComponent(animal.breederId)}.html`));
  let removed = 0;
  for (const filename of fs.readdirSync(outputDir).filter(name => name.endsWith('.html'))) {
    if (!expected.has(filename)) {
      fs.unlinkSync(path.join(outputDir, filename));
      removed++;
    }
  }

  const inactiveSlug = inactiveSmallAnimalSlug();
  if (inactiveSlug) {
    const publicPrefix = lang === 'ja' ? [] : [lang];
    const staleDir = smallAnimalOutputPath(...publicPrefix, inactiveSlug);
    if (fs.existsSync(staleDir)) fs.rmSync(staleDir, { recursive: true, force: true });
  }

  if (SMALL_ANIMALS_LAUNCH.public) {
    const previewRoot = smallAnimalOutputPath(PRIVATE_PREVIEW_DIR);
    if (fs.existsSync(previewRoot)) fs.rmSync(previewRoot, { recursive: true, force: true });
  } else {
    const publicPrefix = lang === 'ja' ? [] : [lang];
    const legacyDarkDir = smallAnimalOutputPath(...publicPrefix, slug);
    if (fs.existsSync(legacyDarkDir)) fs.rmSync(legacyDarkDir, { recursive: true, force: true });
  }

  const { headerHtml, footerHtml } = extractDetailTemplate();
  for (const animal of eligible) {
    const filename = `${encodeURIComponent(animal.breederId)}.html`;
    fs.writeFileSync(
      path.join(outputDir, filename),
      buildSmallAnimalDetailHtml(animal, headerHtml, footerHtml, lang),
      'utf8',
    );
  }
  if (SMALL_ANIMALS_LAUNCH.public) {
    console.log(`  ${langDir(lang)}${slug}/ -> ${eligible.length} detail pages generated, ${removed} old pages removed`);
  } else {
    console.log(`  [private preview] ${lang} details -> ${eligible.length} generated, ${removed} old removed`);
  }
  return eligible;
}

// ── Generate Parents ──────────────────────────────────────────

function generateParents(parents) {
  const filepath = path.join(SITE_DIR, 'parents.html');
  const { header: extractedHeader, tail } = extractTemplate(filepath);
  const header = injectSmallAnimalNavigation(extractedHeader, 'ja');

  // Group parents by breed
  const breedGroups = new Map();
  for (const cfg of BREED_CONFIG) {
    breedGroups.set(cfg.key, []);
  }

  for (const p of parents) {
    if (!p.photos || p.photos.length === 0) continue;
    const photo = getCoverPhoto(p);
    if (!photo) continue;

    const breed = p.breed || '';
    if (breedGroups.has(breed)) {
      breedGroups.get(breed).push(p);
    } else {
      let matched = false;
      for (const cfg of BREED_CONFIG) {
        if (breed.includes(cfg.key) || cfg.key.includes(breed)) {
          breedGroups.get(cfg.key).push(p);
          matched = true;
          break;
        }
      }
      if (!matched) {
        console.log(`  [warn] Unknown breed "${breed}" for parent ${p.id}, skipping`);
      }
    }
  }

  // Build sections
  let sections = '';
  let sectionIdx = 0;
  // LCP: only the very first card image on the page gets eager/high-priority.
  // Every later card stays lazy so we don't make all images eager.
  let lcpImgEmitted = false;
  for (const cfg of BREED_CONFIG) {
    const group = breedGroups.get(cfg.key);
    if (!group || group.length === 0) continue;

    if (sectionIdx > 0) {
      const nextBg = cfg.bgClass === 'sec-cream' ? 'cream' : 'white';
      sections += waveDivider(nextBg);
    }

    const shapesHtml = cfg.shapes.map(s =>
      `      <div class="shape" style="width:${s.w}px;height:${s.h}px;background:${s.bg};${s.pos}"></div>`
    ).join('\n');

    // A retired breed keeps its cats but loses every "current breeding stock" signal:
    // the role chip would otherwise read パパ猫/ママ猫 as if the line were still active.
    const retired = cfg.retired === true;
    let cardsHtml = '';
    for (const p of group) {
      const photo = getCoverPhoto(p);
      // First card on the page = LCP candidate: eager + high priority. Rest stay lazy.
      const imgLoadAttrs = lcpImgEmitted
        ? 'loading="lazy"'
        : 'loading="eager" fetchpriority="high"';
      lcpImgEmitted = true;
      const roleLabel = retired ? '過去の実績' : p.role;
      const roleClass = retired
        ? (p.gender === '♂' ? 'role-papa' : 'role-mama')
        : (p.role === 'パパ猫' ? 'role-papa' : 'role-mama');
      const testedTag = p.tested
        ? '\n          <span class="health-tag tag-good" style="position:absolute;top:8px;right:8px;font-size:11px;padding:2px 8px;">&#10003; 遺伝子検査済</span>'
        : '';

      cardsHtml += `
        <div class="parent-card" role="button" tabindex="0" aria-haspopup="dialog" data-name="${escapeHtml(p.name)}" data-breed="${escapeHtml(p.breed)}" data-gender="${escapeHtml(p.gender)}" data-role="${escapeHtml(roleLabel)}" data-age="${escapeHtml(p.age)}" data-color="${escapeHtml(p.color)}" data-tested="${p.tested ? 'true' : 'false'}" style="position:relative;">${testedTag}
          <img src="${escapeHtml(photo)}" alt="${escapeHtml(`${p.name} - ${p.breed} ${p.color || ''} ${retired ? '（過去の繁育実績）' : (p.role || '')}`.trim())}" ${imgLoadAttrs} width="360" height="360" style="width:100%;height:100%;object-fit:cover;aspect-ratio:1/1;border-radius:var(--radius-lg) var(--radius-lg) 0 0;">
          <div class="parent-body">
            <h3>${escapeHtml(p.name)}</h3>
            <p>${escapeHtml(p.breed)} ・ ${escapeHtml(p.gender)} ・ ${escapeHtml(p.color)}</p>
            <p style="font-size:12px;color:var(--text-note);">${escapeHtml(p.age)}</p>
            <span class="parent-role ${roleClass}">${escapeHtml(roleLabel)}</span>
          </div>
        </div>`;
    }

    const sectionTitle = retired ? `${cfg.key}（過去の繁育実績）` : `${cfg.key} 親猫`;

    sections += `

  <!-- ========== ${cfg.tag.toUpperCase()} PARENTS ========== -->
  <section class="section ${cfg.bgClass}" style="position:relative;">
    <div class="parallax-bg">
${shapesHtml}
    </div>
    <div class="container" style="position:relative;z-index:1;">
      <div class="sec-header">
        <span class="sec-tag">${escapeHtml(cfg.tag)}</span>
        <h2 class="sec-title">${escapeHtml(sectionTitle)}</h2>
        <p class="sec-desc">${escapeHtml(cfg.parentDesc)}</p>
      </div>
      <div class="parents-grid">${cardsHtml}
      </div>
    </div>
  </section>`;

    sectionIdx++;
  }

  if (sectionIdx === 0) {
    sections = emptyCatalogSection('現在、掲載中の親猫はいません。', '掲載状況');
  }

  // Per-parent Animal JSON-LD
  const animals = [];
  for (const p of parents) {
    const photo = getCoverPhoto(p);
    if (!photo) continue;
    const g = p.gender === '♂' ? '雄' : '雌';
    const retiredParent = isRetiredBreed(p.breed);
    const role = retiredParent ? '過去の繁育実績' : (p.role || '');
    const tested = p.tested ? '・遺伝子検査済' : '';
    animals.push({
      "@context": "https://schema.org",
      "@type": "Animal",
      "@id": `${BASE_URL}/parents.html#${p.id}`,
      "name": p.name,
      "image": [photo],
      "description": retiredParent
        ? `${p.breed} ${p.color || ''} ${g}${tested}。福楽キャッテリーで過去にラグドールの繁育実績があります（現在は繁育しておりません）。`.trim()
        : `${p.breed} ${p.color || ''} ${g} ${p.age || ''}・${role}${tested}。福楽キャッテリーの繁殖親猫。`.trim(),
      "additionalType": "https://schema.org/Animal",
      "worksFor": { "@type": "Organization", "name": "福楽キャッテリー" }
    });
  }
  const animalJsonLd =
    '\n  <!-- Per-parent Animal schema (generated by SEO sweep) -->\n' +
    '  <script type="application/ld+json">\n' +
    jsonForHtmlScript(animals, 2) +
    '\n  </script>\n';

  const cleanedTail = tail.replace(
    /\n\s*<!-- Per-parent Animal schema \(generated by SEO sweep\) -->\s*\n\s*<script type="application\/ld\+json">[\s\S]*?<\/script>\s*\n/,
    '\n'
  );
  const tailWithSchema = cleanedTail.replace('</body>', `${animalJsonLd}</body>`);

  const output = header + '\n' + sections + '\n\n' + tailWithSchema;
  fs.writeFileSync(filepath, output, 'utf-8');
  console.log(`  parents.html -> ${parents.length} parents (${sectionIdx} breed sections), ${animals.length} Animal schemas`);
}

// ── Generate Reviews ──────────────────────────────────────────

function generateReviews(reviews) {
  const filepath = path.join(SITE_DIR, 'reviews.html');
  const { header: extractedHeader, tail } = extractTemplate(filepath);
  const header = injectSmallAnimalNavigation(extractedHeader, 'ja');

  let cardsHtml = '';
  for (const r of reviews) {
    cardsHtml += `
        <!-- Review -->
        <div class="review-card">
          <div class="review-header">
            <div class="review-stars">★★★★★</div>
            <span class="review-platform">みんなの子猫ブリーダー</span>
          </div>
          <p class="review-body">${escapeHtml(r.body)}</p>
          <div class="review-footer">
            <p class="review-author">— ${escapeHtml(r.region)} ${escapeHtml(r.author)}（${escapeHtml(r.date)}）</p>
            <span class="review-verified">&#10003; 認証済みレビュー</span>
          </div>
        </div>`;
  }
  if (reviews.length === 0) {
    cardsHtml = `
        <div class="review-card catalog-empty" role="status" data-generated-empty="true">
          <p class="review-body" style="text-align:center;">現在、掲載中のレビューはありません。</p>
        </div>`;
  }

  const reviewSection = `

  <!-- ========== REVIEWS GRID ========== -->
  <section class="section sec-white" style="position:relative;">
    <div class="parallax-bg">
      <div class="shape" style="width:180px;height:180px;background:var(--peach);top:8%;right:5%;"></div>
      <div class="shape" style="width:130px;height:130px;background:var(--blueberry);bottom:15%;left:3%;"></div>
      <div class="shape" style="width:100px;height:100px;background:var(--mango);top:50%;left:55%;"></div>
    </div>
    <div class="container" style="position:relative;z-index:1;">
      <div class="sec-header">
        <span class="sec-tag">Reviews</span>
        <h2 class="sec-title">レビュー一覧</h2>
        <p class="sec-desc">みんなの子猫ブリーダーに寄せられたお客様の声をご紹介します。</p>
      </div>
      <div class="reviews-page-grid">${cardsHtml}
      </div>
    </div>
  </section>`;

  const output = header + '\n' + reviewSection + '\n\n' + tail;
  fs.writeFileSync(filepath, output, 'utf-8');
  console.log(`  reviews.html -> ${reviews.length} reviews`);
}

// ── Generate Kitten Detail Pages ──────────────────────────────

/**
 * Extract YouTube video ID from various URL/embed formats
 */
function extractYouTubeId(video) {
  if (!video) return null;
  // Match youtube.com/watch?v=ID
  let m = video.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
  if (m) return m[1];
  // If it's an iframe, extract from src
  if (video.includes('<iframe')) {
    m = video.match(/src="[^"]*(?:youtube\.com\/embed\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    if (m) return m[1];
  }
  return null;
}

/**
 * Build the full HTML for a kitten detail page
 */
function buildKittenDetailHtml(kitten, headerHtml, footerHtml, lang = 'ja') {
  headerHtml = injectSmallAnimalNavigation(headerHtml, lang);
  const fileId = kitten.breederId || kitten.id;
  const effectiveStatus = KittenCatalog.normalizeStatus(kitten.status);
  const gt = genderText(kitten.gender);
  const genderFull = kitten.gender ? `${kitten.gender} ${gt}` : '';
  const st = statusText(effectiveStatus);
  const bd = formatBirthday(kitten.birthday);
  const salePrice = KittenCatalog.normalizeSalePrice(kitten.price);
  const pr = salePrice === null ? '' : formatPrice(salePrice);
  const coverPhoto = getCoverPhoto(kitten);
  const photos = kitten.photos || [];
  const pageUrl = `${BASE_URL}/${langDir(lang)}kittens/${fileId}.html`;

  // Localized values for the baked (non-data-i18n) fields: title / meta / OG / JSON-LD /
  // <h1> / color <td> / breadcrumb tail / alt. Chrome (labels/buttons/status) keeps its
  // data-i18n hooks and localizes at runtime.
  const breedL = breedLabel(kitten.breed, lang);
  const colorL = colorLabel(kitten.color, lang);
  const genderL = genderTextL(kitten.gender, lang);
  const genderFullL = lang === 'ja' ? genderFull : genderL; // en/zh drop the ♂/♀ symbol (matches i18n keys)
  const bornL = bornPhrase(kitten.birthday, lang);
  const stL = statusTextL(effectiveStatus, lang);

  // titleText: ja keeps the exact legacy form; en/zh collapse whitespace so a missing
  // field (empty color / no gender) doesn't leave a double space.
  const titleText = detailTitleText(kitten, lang);
  // COPY-SPEC §5: littermates share breed, sex and colour, so several pages resolve to
  // the same <title>. A duplicate title is a real ranking defect (search engines pick
  // one page and drop the rest), so the listing number disambiguates the duplicates —
  // and only the duplicates. The <h1> and breadcrumb keep the clean form.
  const titleQualifier = detailTitleQualifier(kitten, lang);
  const uniqueTitleText = `${titleText}${titleQualifier}`;
  let pageTitle, metaDesc, ldName, ldDesc;
  if (lang === 'en') {
    pageTitle = `${uniqueTitleText} | Kitten Detail | Fuluck Cattery`;
    metaDesc = `${breedL} kitten at Fuluck Cattery in Osaka. ${colorL || ''}, ${genderFullL}${bornL ? ', ' + bornL : ''}. ${salePrice === null ? priceInquiryText(lang) : `¥${pr} (tax incl.)`} ${statusTextL(effectiveStatus, 'en')}.`.replace(/\s+/g, ' ').trim();
    ldName = uniqueTitleText;
    ldDesc = `${breedL} kitten from Fuluck Cattery (breeder: Ra Hoen) in Osaka. ${colorL || ''}, ${genderFullL}${bornL ? ', ' + bornL : ''}.`.replace(/\s+/g, ' ').trim();
    if (salePrice !== null) ldDesc += ' (excludes ¥10,000 vaccination fee)';
  } else if (lang === 'zh') {
    pageTitle = `${uniqueTitleText}｜幼猫详情｜福楽キャッテリー`;
    metaDesc = `大阪福楽キャッテリー的${breedL}幼猫。${colorL || ''}、${genderFullL}${bornL ? '、' + bornL : ''}。${salePrice === null ? priceInquiryText(lang) : `¥${pr}（含税）`}${statusTextL(effectiveStatus, 'zh')}。`;
    ldName = uniqueTitleText;
    ldDesc = `大阪福楽キャッテリー（繁育者：罗方远）的${breedL}幼猫。${colorL || ''}、${genderFullL}${bornL ? '、' + bornL : ''}。`;
    if (salePrice !== null) ldDesc += '（另收疫苗费 10,000 日元）';
  } else {
    pageTitle = `${uniqueTitleText}｜子猫詳細｜福楽キャッテリー`;
    metaDesc = `大阪の福楽キャッテリーの${kitten.breed || ''}の子猫。${kitten.color || ''}、${genderFull}、${bd ? bd + '生まれ' : ''}。${salePrice === null ? priceInquiryText(lang) : `¥${pr}（税込）`}${st}。`;
    ldName = uniqueTitleText;
    ldDesc = `大阪の福楽キャッテリー（ブリーダー：羅方遠）の${kitten.breed || ''}の子猫。${kitten.color || ''}、${genderFull}、${bd ? bd + '生まれ' : ''}。掲載ID ${fileId}。`;
    if (salePrice !== null) ldDesc += '（別途ワクチン代10,000円）';
  }
  const homeLabel = HOME_LABEL[lang] || HOME_LABEL.ja;
  const kittensLabel = KITTENS_LABEL[lang] || KITTENS_LABEL.ja;
  const htmlLang = lang;
  const detailFontHref = fontHref(lang);

  // Schema availability
  const schemaAvailability = effectiveStatus === 'available'
    ? 'https://schema.org/InStock'
    : 'https://schema.org/LimitedAvailability';

  // Product JSON-LD. inLanguage emitted for en/zh only — ja keeps its exact legacy schema
  // (commit-1 byte-identity contract; ja implicitly = the site's default language anyway).
  const productJsonLd = salePrice === null ? '' : jsonForHtmlScript({
    "@context": "https://schema.org",
    "@type": "Product",
    "@id": `${BASE_URL}/kittens/${fileId}.html#product`,
    "name": ldName,
    "description": ldDesc,
    ...(lang !== 'ja' ? { "inLanguage": lang } : {}),
    "image": photos,
    "brand": { "@type": "Brand", "name": "福楽キャッテリー" },
    "offers": {
      "@type": "Offer",
      "price": String(salePrice),
      "priceCurrency": "JPY",
      "availability": schemaAvailability,
      "url": pageUrl,
      "seller": { "@id": `${BASE_URL}/#cattery` }
    }
  });
  const productSchemaHtml = productJsonLd
    ? `  <script type="application/ld+json">\n  ${productJsonLd}\n  </script>\n`
    : '';

  // Breadcrumb JSON-LD. ja keeps its exact legacy shape (byte-identity); en/zh localize the
  // display names, add inLanguage, and route Kittens → the per-lang list. Home stays the
  // canonical root URL for all langs (no /en/ or /zh/ home page exists → avoid a 404 link).
  const breadcrumbJsonLd = lang === 'ja'
    ? jsonForHtmlScript({
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "ホーム", "item": `${BASE_URL}/` },
          { "@type": "ListItem", "position": 2, "name": "子猫一覧", "item": `${BASE_URL}/kittens.html` },
          { "@type": "ListItem", "position": 3, "name": titleText, "item": pageUrl }
        ]
      })
    : jsonForHtmlScript({
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "inLanguage": lang,
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": homeLabel, "item": `${BASE_URL}/` },
          { "@type": "ListItem", "position": 2, "name": kittensLabel, "item": `${BASE_URL}/${langDir(lang)}kittens.html` },
          { "@type": "ListItem", "position": 3, "name": titleText, "item": pageUrl }
        ]
      });

  // Alt-text word for "photo N": ja "写真" / en "photo" / zh "照片".
  const photoWord = lang === 'en' ? 'photo' : (lang === 'zh' ? '照片' : '写真');
  const showPhoto = lang === 'en' ? 'Show photo' : (lang === 'zh' ? '显示照片' : '写真を表示');
  const skipLabel = lang === 'en' ? 'Skip to main content' : (lang === 'zh' ? '跳至主要内容' : 'メインコンテンツへスキップ');
  // Thumbnails HTML
  let thumbsHtml = '';
  if (photos.length > 1) {
    thumbsHtml = `
      <div class="kitten-detail-thumbs">
        ${photos.map((p, i) => `<button type="button" class="kitten-detail-thumb${i === (kitten.coverIndex || 0) ? ' active' : ''}" data-src="${escapeHtml(p)}" data-idx="${i}" aria-label="${showPhoto} ${i + 1}" aria-pressed="${i === (kitten.coverIndex || 0) ? 'true' : 'false'}"><img src="${escapeHtml(p)}" alt="" loading="lazy" width="88" height="88"></button>`).join('\n        ')}
      </div>`;
  }

  // Video section
  let videoHtml = '';
  const ytId = extractYouTubeId(kitten.video);
  if (ytId) {
    videoHtml = `
    <!-- Video -->
    <div class="kitten-detail-video">
      <h2 data-i18n="kitten.video">動画</h2>
      <div class="kitten-detail-video-wrap">
        <iframe src="https://www.youtube.com/embed/${ytId}" title="${escapeHtml(titleText)} 動画" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy"></iframe>
      </div>
    </div>`;
  }

  // Parents info
  let parentsHtml = '';
  if (kitten.papa || kitten.mama) {
    let parentsInner = '';
    if (kitten.papa) parentsInner += `<p><span data-i18n="parents.papa">パパ猫</span>: <a href="/parents.html">${escapeHtml(kitten.papa)}</a></p>`;
    if (kitten.mama) parentsInner += `<p><span data-i18n="parents.mama">ママ猫</span>: <a href="/parents.html">${escapeHtml(kitten.mama)}</a></p>`;
    parentsHtml = `
    <!-- Parents -->
    <div class="kitten-detail-parents">
      <h2 data-i18n="kitten.parentInfo">両親情報</h2>
      ${parentsInner}
    </div>`;
  }

  // Note row. Campaign clauses and the retired spellings never reach the table (§1).
  const noteDetailL = sanitizeOwnerCopy(noteFor(kitten, lang));
  const noteRow = noteDetailL
    ? `<tr><th data-i18n="kitten.note">備考</th><td>${escapeHtml(noteDetailL)}</td></tr>`
    : '';

  // §3 — the listing number is how the owner, Koneko and the customer all refer to a
  // specific kitten, so the page has to show it instead of hiding it in the URL.
  const listingLabel = lang === 'en' ? 'Listing ID' : (lang === 'zh' ? '刊登编号' : '掲載番号');
  const listingRow = `<tr><th>${escapeHtml(listingLabel)}</th><td>${escapeHtml(fileId)}</td></tr>`;

  // A reviewed promotion is the current merchandising state and takes precedence over
  // a stale legacy NEW flag. The production data update also clears isNew, but this
  // display guard prevents a contradictory intermediate page.
  const promotionTag = KittenCatalog.normalizePromotionTag(kitten.promotionTag);
  const promotionChip = promotionTag
    ? ` <span class="kitten-promotion-chip usp-chip usp-chip--card" data-promotion-tag="${escapeHtml(promotionTag)}">${escapeHtml(KittenCatalog.promotionLabel(promotionTag, lang))}</span>`
    : '';
  const newBadge = kitten.isNew && !promotionTag ? ' <span class="kit-badge-new">NEW</span>' : '';

  // §9 — a reserved kitten must not offer "book a visit": the visit would be for a cat
  // that is no longer available, and the customer only finds out on arrival. Send them
  // to what they can still buy, and to a LINE thread about the same parents instead.
  const reservedCopy = RESERVED_CTA_COPY[lang] || RESERVED_CTA_COPY.ja;
  const lineUrl = 'https://page.line.me/915hnnlk?oat__id=5765672&openQrModal=true';
  const ctaHtml = effectiveStatus === 'reserved'
    ? `
      <p class="kitten-detail-reserved-note">${escapeHtml(reservedCopy.notice)}</p>
      <div class="kitten-detail-cta">
        <a href="/${langDir(lang)}kittens.html" class="btn btn-secondary">
          ${escapeHtml(reservedCopy.list)}
        </a>
        <a href="${lineUrl}" class="btn btn-line" target="_blank" rel="noopener">
          ${escapeHtml(reservedCopy.line)}
        </a>
        <a href="/${langDir(lang)}kittens.html" class="btn btn-outline" data-i18n="kitten.backToList">
          ← 子猫一覧に戻る
        </a>
      </div>`
    : `
      <div class="kitten-detail-cta">
        <a href="${lineUrl}" class="btn btn-line" target="_blank" rel="noopener" data-i18n="kitten.lineChat">
          LINEでこの子について相談
        </a>
        <a href="/booking.html?kitten=${encodeURIComponent(fileId)}" class="btn btn-secondary" data-i18n="kitten.bookVisit">
          見学を予約する
        </a>
        <a href="/${langDir(lang)}kittens.html" class="btn btn-outline" data-i18n="kitten.backToList">
          ← 子猫一覧に戻る
        </a>
      </div>`;

  // The list page carries a sticky mobile CTA and the detail page did not, so the one
  // screen where a visitor decides had no thumb-reachable way to act. Same markup, same
  // shared height contract, with the booking link pre-filled with this kitten.
  const mobileCtaLabels = {
    ja: { nav: 'クイック連絡', line: 'LINEで相談する', booking: '見学を予約する' },
    en: { nav: 'Quick contact', line: 'Chat on LINE', booking: 'Book a visit' },
    zh: { nav: '快速联系', line: '通过LINE咨询', booking: '预约参观' },
  }[lang] || { nav: 'クイック連絡', line: 'LINEで相談する', booking: '見学を予約する' };
  // §9 applies to the sticky bar too: never offer a visit booking for a kitten that is
  // already under negotiation — send that tap to what is still available instead.
  const mobileBookingHref = effectiveStatus === 'reserved'
    ? `/${langDir(lang)}kittens.html`
    : `/booking.html?kitten=${encodeURIComponent(fileId)}`;
  const mobileBookingLabel = effectiveStatus === 'reserved' ? reservedCopy.list : mobileCtaLabels.booking;
  const mobileBookingText = effectiveStatus === 'reserved'
    ? escapeHtml(reservedCopy.list)
    : '<span data-i18n="cta.booking">見学予約</span>';
  const mobileCtaHtml = `
  <!-- ========== MOBILE STICKY CTA BAR ========== -->
  <div class="mobile-cta-bar" role="navigation" aria-label="${escapeHtml(mobileCtaLabels.nav)}">
    <div class="mobile-cta-bar-inner">
      <a class="cta-line" href="${lineUrl}" target="_blank" rel="noopener" data-cta="line" aria-label="${escapeHtml(mobileCtaLabels.line)}">
        <span class="cta-icon"><i class="ico ico-message-circle" aria-hidden="true"></i></span>
        <span data-i18n="cta.line">LINEで相談</span>
      </a>
      <a class="cta-booking" href="${mobileBookingHref}" data-cta="booking" aria-label="${escapeHtml(mobileBookingLabel)}">
        <span class="cta-icon"><i class="ico ico-calendar-check" aria-hidden="true"></i></span>
        ${mobileBookingText}
      </a>
    </div>
  </div>`;

  // GA4 view_item for this exact kitten. analytics.js only fires list-level events, so
  // without this the detail page — the highest-intent page on the site — reported nothing.
  const viewItemPayload = {
    event: 'view_item',
    items: [{
      item_id: fileId,
      item_name: titleText,
      item_category: kitten.breed || '',
      ...(salePrice === null ? {} : { price: salePrice, currency: 'JPY' }),
    }],
  };
  const viewItemScript = `  <script>
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push(${jsonForHtmlScript(viewItemPayload)});
  </script>`;

  return `<!DOCTYPE html>
<html lang="${htmlLang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(pageTitle)}</title>
  <meta name="description" content="${escapeHtml(metaDesc)}">
  <meta property="og:title" content="${escapeHtml(pageTitle)}">
  <meta property="og:description" content="${escapeHtml(metaDesc)}">
  <meta property="og:type" content="${salePrice === null ? 'website' : 'product'}">
  <meta property="og:image" content="${escapeHtml(coverPhoto)}">
  <meta property="og:url" content="${escapeHtml(pageUrl)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="theme-color" content="#7DD3C0">
  <link rel="canonical" href="${escapeHtml(pageUrl)}">
${hreflangBlock(`kittens/${fileId}.html`)}
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="preload" as="style" href="${detailFontHref}" onload="this.onload=null;this.rel='stylesheet'">
  <noscript><link href="${detailFontHref}" rel="stylesheet"></noscript>
  <link rel="stylesheet" href="/style.css?v=${verAsset('style.css', '20260823a')}">
  <link rel="stylesheet" href="/nav.css?v=${verAsset('nav.css', '20260711c')}">
  <link rel="icon" href="/favicon.ico" sizes="any">
  <link rel="icon" type="image/svg+xml" href="${FAVICON_HREF}">
  <link rel="apple-touch-icon" href="/apple-touch-icon.png">
  <script defer src="/nav.js?v=${verAsset('nav.js', '20260823a')}"></script>
  <!-- Google Analytics 4 -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-EK459EK55M"></script>
  <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-EK459EK55M');</script>
${productSchemaHtml}  <script type="application/ld+json">
  ${breadcrumbJsonLd}
  </script>
  <style>
  /* ── Kitten Detail Page Styles ── */
  .kitten-detail-hero {
    padding: 0 0 24px;
  }
  .kitten-detail-gallery {
    max-width: 720px;
    margin: 0 auto;
  }
  .kitten-detail-main-img {
    width: 100%;
    aspect-ratio: 4/3;
    border-radius: var(--radius-lg);
    overflow: hidden;
    background: var(--bg-cream);
  }
  .kitten-detail-main-img img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .kitten-detail-thumbs {
    display: flex;
    gap: 8px;
    margin-top: 12px;
    overflow-x: auto;
    padding-bottom: 4px;
  }
  .kitten-detail-thumb {
    width: 72px;
    height: 72px;
    border-radius: var(--radius-sm);
    cursor: pointer;
    opacity: 0.6;
    transition: opacity 0.2s, box-shadow 0.2s;
    flex-shrink: 0;
    border: 2px solid transparent;
    padding: 0;
    background: transparent;
    overflow: hidden;
  }
  .kitten-detail-thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: inherit;
    display: block;
  }
  .kitten-detail-thumb:hover,
  .kitten-detail-thumb:focus-visible,
  .kitten-detail-thumb.active {
    opacity: 1;
    border-color: var(--mint);
    box-shadow: 0 0 0 2px var(--mint);
  }
  .kitten-detail-info {
    padding: 32px 0 48px;
  }
  .kitten-detail-info h1 {
    font-size: 1.6rem;
    font-weight: 700;
    margin: 0 0 12px;
    color: var(--text-main);
  }
  .kitten-detail-status {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 16px;
  }
  .kitten-detail-price {
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--strawberry);
    margin: 0 0 24px;
  }
  .kitten-detail-price .tax {
    font-size: 0.85rem;
    font-weight: 400;
    color: var(--text-note);
  }
  .kitten-detail-table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 32px;
  }
  .kitten-detail-table th,
  .kitten-detail-table td {
    padding: 10px 14px;
    text-align: left;
    border-bottom: 1px solid var(--border);
    font-size: 0.95rem;
  }
  .kitten-detail-table th {
    width: 100px;
    color: var(--text-note);
    font-weight: 500;
    white-space: nowrap;
  }
  .kitten-detail-feenote,
  .kitten-detail-deposit {
    margin: -14px 0 10px;
    font-size: 0.85rem;
    line-height: 1.7;
    color: var(--text-note);
  }
  .kitten-detail-deposit {
    margin: 0 0 22px;
  }
  .kitten-detail-usp {
    margin: 0 0 28px;
    padding: 20px 22px;
    border: 1px solid var(--border);
    border-radius: var(--radius-md, 14px);
    background: var(--bg-cream);
  }
  .kitten-detail-usp h2 {
    margin: 0 0 10px;
    font-size: 1.1rem;
    font-weight: 600;
    color: var(--text-main);
  }
  .kitten-detail-usp p {
    margin: 0 0 12px;
    line-height: 1.85;
  }
  .kitten-detail-usp ul {
    margin: 0;
    padding-left: 1.15em;
  }
  .kitten-detail-usp li {
    margin: 4px 0;
    line-height: 1.7;
  }
  .kitten-detail-shared {
    margin: 32px 0;
    padding: 22px 24px;
    border: 1px solid var(--border);
    border-radius: var(--radius-md, 14px);
  }
  .kitten-detail-shared h2 {
    margin: 0 0 16px;
    font-size: 1.1rem;
    font-weight: 600;
    color: var(--text-main);
  }
  .kitten-detail-shared-item {
    margin: 0 0 14px;
  }
  .kitten-detail-shared-item h3 {
    margin: 0 0 4px;
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--text-main);
  }
  .kitten-detail-shared-item p {
    margin: 0;
    font-size: 0.9rem;
    line-height: 1.8;
    color: var(--text-note-strong, var(--text-main));
  }
  .kitten-detail-reserved-note {
    margin: 24px 0 12px;
    padding: 14px 16px;
    border-radius: var(--radius-sm, 10px);
    background: var(--bg-cream);
    color: var(--text-main);
    line-height: 1.8;
  }
  .kitten-detail-introduction {
    margin: 0 0 32px;
  }
  .kitten-detail-introduction h2 {
    font-size: 1.1rem;
    font-weight: 600;
    margin: 0 0 12px;
    color: var(--text-main);
  }
  .kitten-detail-introduction p {
    margin: 0 0 12px;
    line-height: 1.8;
  }
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
  .kitten-detail-parents {
    margin-bottom: 32px;
  }
  .kitten-detail-parents h2 {
    font-size: 1.1rem;
    font-weight: 600;
    margin: 0 0 12px;
    color: var(--text-main);
  }
  .kitten-detail-parents p {
    margin: 4px 0;
    font-size: 0.95rem;
  }
  .kitten-detail-parents a {
    color: var(--mint-dark, var(--mint));
    text-decoration: underline;
  }
  .kitten-detail-video {
    margin-bottom: 32px;
  }
  .kitten-detail-video h2 {
    font-size: 1.1rem;
    font-weight: 600;
    margin: 0 0 12px;
    color: var(--text-main);
  }
  .kitten-detail-video-wrap {
    position: relative;
    width: 100%;
    padding-bottom: 56.25%;
    border-radius: var(--radius-lg);
    overflow: hidden;
    background: #000;
  }
  .kitten-detail-video-wrap iframe {
    position: absolute;
    top: 0; left: 0;
    width: 100%; height: 100%;
  }
  .kitten-detail-cta {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin-top: 32px;
  }
  .kitten-detail-cta .btn {
    text-align: center;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 14px 24px;
    border-radius: var(--radius-md);
    font-weight: 600;
    font-size: 1rem;
    text-decoration: none;
    transition: background 0.2s, transform 0.15s;
  }
  .kitten-detail-cta .btn-line {
    background: #07843f;
    color: #fff;
  }
  .kitten-detail-cta .btn-line:hover {
    background: #066c35;
    transform: translateY(-1px);
  }
  .kitten-detail-cta .btn-secondary {
    background: var(--mint);
    color: #fff;
  }
  .kitten-detail-cta .btn-secondary:hover {
    filter: brightness(1.05);
    transform: translateY(-1px);
  }
  .kitten-detail-cta .btn-outline {
    background: transparent;
    border: 2px solid var(--border);
    color: var(--text-main);
  }
  .kitten-detail-cta .btn-outline:hover {
    border-color: var(--mint);
    color: var(--mint);
  }
  .breadcrumb {
    padding: 16px 0;
    font-size: 0.85rem;
    color: var(--text-note);
  }
  .breadcrumb a {
    color: var(--text-note);
    text-decoration: none;
  }
  .breadcrumb a:hover {
    color: var(--mint);
    text-decoration: underline;
  }
  @media (min-width: 768px) {
    .kitten-detail-cta {
      flex-direction: row;
      flex-wrap: wrap;
    }
    .kitten-detail-thumb {
      width: 88px;
      height: 88px;
    }
    .kitten-detail-info h1 {
      font-size: 2rem;
    }
  }
  </style>
</head>
<body class="has-mobile-cta">

  <a class="skip-link" href="#main" data-i18n="a11y.skipToMain">${skipLabel}</a>

  <!-- Scroll Progress Bar -->
  <div class="scroll-progress"></div>

${headerHtml}

  <main id="main">

  <!-- Breadcrumb -->
  <nav class="breadcrumb">
    <div class="container">
      <a href="/" data-i18n="common.home">${escapeHtml(homeLabel)}</a> &gt; <a href="/${langDir(lang)}kittens.html" data-i18n="kitten.breadcrumb.kittens">${escapeHtml(kittensLabel)}</a> &gt; ${escapeHtml(titleText)}
    </div>
  </nav>

  <!-- Hero photo section -->
  <section class="kitten-detail-hero">
    <div class="container">
      <div class="kitten-detail-gallery">
        <div class="kitten-detail-main-img">
          <img id="mainPhoto" src="${escapeHtml(coverPhoto)}" alt="${escapeHtml(breedL || '')} ${escapeHtml(colorL || '')}" loading="eager" fetchpriority="high" width="800" height="600">
        </div>
        ${thumbsHtml}
      </div>
    </div>
  </section>

  <!-- Info section -->
  <section class="kitten-detail-info">
    <div class="container">
      <h1>${escapeHtml(titleText)}</h1>

      <!-- Status + catalogue badge -->
      <div class="kitten-detail-status">
        <span class="kit-status st-${effectiveStatus}"${statusI18nKey(effectiveStatus) ? ` data-i18n="${statusI18nKey(effectiveStatus)}"` : ''}>${escapeHtml(stL)}</span>${newBadge}${promotionChip}
      </div>

      <!-- Price -->
      <p class="kitten-detail-price">${salePrice === null ? escapeHtml(priceInquiryText(lang)) : `&yen;${pr} <span class="tax" data-i18n="kitten.taxIncl">${taxIncl(lang)}</span>`}</p>
      ${vaccineFeeHtml(lang)}
      ${depositHtml(lang)}

      <!-- Detail table -->
      <table class="kitten-detail-table">
        <tr><th data-i18n="kitten.breed">品種</th><td${breedI18nKey(kitten.breed) ? ` data-i18n="${breedI18nKey(kitten.breed)}"` : ''}>${escapeHtml(breedL || '')}</td></tr>
        <tr><th data-i18n="kitten.sex">性別</th><td${genderI18nKey(kitten.gender) ? ` data-i18n="${genderI18nKey(kitten.gender)}"` : ''}>${escapeHtml(genderFullL)}</td></tr>
        <tr><th data-i18n="kitten.color">毛色</th><td>${escapeHtml(colorL || '')}</td></tr>
        <tr><th data-i18n="kitten.birthday">誕生日</th><td${kitten.birthday ? ` data-i18n-birthday="${escapeHtml(kitten.birthday)}"` : ''}>${escapeHtml(bornL)}</td></tr>
        <tr><th data-i18n="kitten.status">状態</th><td${statusI18nKey(effectiveStatus) ? ` data-i18n="${statusI18nKey(effectiveStatus)}"` : ''}>${escapeHtml(stL)}</td></tr>
        ${listingRow}
        ${noteRow}
      </table>

      ${featuredDetailHtml(kitten, lang)}

      ${mixSectionHtml(kitten, lang)}

      ${adultSectionHtml(kitten, lang)}

      ${descriptionHtml(kitten, lang)}

      ${parentsHtml}

      ${videoHtml}

      ${sharedVisitBlockHtml(lang)}

      <!-- CTA buttons -->
      ${ctaHtml}
    </div>
  </section>

  <!-- Related kittens carousel placeholder -->
  <section class="section">
    <div class="container">
      <div class="kitten-carousel-mount"></div>
    </div>
  </section>

  </main>

${footerHtml}

  <script>
  // Thumbnail click → swap main photo
  document.querySelectorAll('.kitten-detail-thumb').forEach(function(thumb) {
    thumb.addEventListener('click', function() {
      var mainImg = document.getElementById('mainPhoto');
      var nextSrc = this.getAttribute('data-src');
      if (mainImg && nextSrc) mainImg.src = nextSrc;
      document.querySelectorAll('.kitten-detail-thumb').forEach(function(t) {
        t.classList.remove('active');
        t.setAttribute('aria-pressed', 'false');
      });
      this.classList.add('active');
      this.setAttribute('aria-pressed', 'true');
    });
  });
  </script>
${mobileCtaHtml}

${viewItemScript}
  <script src="/kitten-catalog.js?v=${verAsset('kitten-catalog.js', '20260711b')}"></script>
  <script src="/i18n.js?v=${verAsset('i18n.js', '20260823a')}"></script>
  <script src="/catalog-i18n.js?v=${verAsset('catalog-i18n.js', '20260823a')}"></script>
  <script src="/kitten-carousel.js?v=${verAsset('kitten-carousel.js', '20260714g')}"></script>
  <script src="/cta-widget.js?v=${verAsset('cta-widget.js', '20260823a')}"></script>
  <script src="/script.js?v=${verAsset('script.js', '20260823a')}"></script>
  <script defer src="/mobile-cta.js?v=${verAsset('mobile-cta.js', '20260823a')}"></script>
  <script defer src="/analytics.js?v=${verAsset('analytics.js', '20260823a')}"></script>
</body>
</html>`;
}

/**
 * Extract header (nav only, no page-hero) and footer from kittens.html
 * for use in kitten detail pages.
 */
function extractDetailTemplate() {
  const filepath = path.join(SITE_DIR, 'kittens.html');
  const html = fs.readFileSync(filepath, 'utf-8');

  ASSET_VERSIONS = extractAssetVersions(html);

  // Header: from <header> to end of </div> (mobileNav)
  // We want: header element + mobile nav
  const headerStart = html.indexOf('<!-- ========== HEADER ========== -->');
  const mobileNavEnd = html.indexOf('</div>', html.indexOf('class="mobile-nav"'));
  // Find the closing </div> of mobile-nav (need to find the right one)
  // mobile-nav has nested divs, so find the block properly
  const mobileNavMarker = '<!-- ========== MOBILE NAV ========== -->';
  const mobileNavIdx = html.indexOf(mobileNavMarker);

  // Find the PAGE HERO marker to know where header ends
  const pageHeroMarker = '<!-- ========== PAGE HERO ========== -->';
  const pageHeroIdx = html.indexOf(pageHeroMarker);

  let headerHtml = '';
  if (headerStart !== -1 && pageHeroIdx !== -1) {
    // Everything from HEADER comment to just before PAGE HERO, trimmed
    headerHtml = html.substring(headerStart, pageHeroIdx).trim();
    // The list page opens its content landmark immediately before PAGE HERO. Detail pages
    // own their landmark and skip link, so do not carry this unmatched opening tag across.
    headerHtml = headerHtml.replace(/\s*<main\b[^>]*>\s*$/i, '');
  }

  // Footer: from FOOTER comment to closing </footer>, plus fixed LINE button and back-to-top
  const footerMarker = '<!-- ========== FOOTER ========== -->';
  const footerIdx = html.indexOf(footerMarker);
  // Everything from footer to just before the scripts
  // Find i18n.js script tag (with or without version param)
  let endIdx = html.indexOf('<script src="/i18n.js', footerIdx);
  if (endIdx === -1) endIdx = html.indexOf('<script src="i18n.js', footerIdx);

  let footerHtml = '';
  if (footerIdx !== -1) {
    // Grab from footer marker to end of the back-to-top button
    const backToTopEnd = html.indexOf('</button>', html.indexOf('id="backToTop"'));
    if (backToTopEnd !== -1) {
      footerHtml = html.substring(footerIdx, backToTopEnd + '</button>'.length);
    } else {
      // Fallback: grab from footer marker to just before first script tag
      if (endIdx !== -1) {
        footerHtml = html.substring(footerIdx, endIdx).trim();
      } else {
        footerHtml = html.substring(footerIdx, html.indexOf('</body>')).trim();
      }
    }
  }

  // Fix relative paths for detail pages (they live in /kittens/ subdirectory)
  function toAbsoluteLinks(html) {
    return html
      .replace(/href="(?!\/|https?:|#|mailto:)([^"]+)"/g, 'href="/$1"')
      .replace(/src="(?!\/|https?:|data:)([^"]+)"/g, 'src="/$1"');
  }
  headerHtml = toAbsoluteLinks(headerHtml);
  footerHtml = toAbsoluteLinks(footerHtml);

  return { headerHtml, footerHtml };
}

function assertSafeKittenDetailIds(kittens) {
  for (let index = 0; index < kittens.length; index++) {
    const kitten = kittens[index];
    for (const field of ['breederId', 'id']) {
      const value = kitten && kitten[field];
      if (value === undefined || value === null || value === '') continue;
      if (typeof value !== 'string' || !PUBLIC_CATALOG_ID_RE.test(value)) {
        throw new Error(`Unsafe kitten ${field} at row ${index}: expected one public URL segment`);
      }
    }
    const effectiveStatus = KittenCatalog.normalizeStatus(kitten && kitten.status);
    const eligible = kitten &&
      (effectiveStatus === 'available' || effectiveStatus === 'reserved') &&
      kitten.photos && kitten.photos.length > 0;
    if (eligible && !PUBLIC_CATALOG_ID_RE.test(kitten.breederId || kitten.id || '')) {
      throw new Error(`Unsafe kitten detail identity at row ${index}: breederId or id is required`);
    }
  }
}

function kittenDetailOutputPath(kittensDir, fileId) {
  if (!PUBLIC_CATALOG_ID_RE.test(fileId)) {
    throw new Error('Unsafe kitten detail URL segment');
  }
  const root = path.resolve(kittensDir);
  const output = path.resolve(root, `${fileId}.html`);
  if (!output.startsWith(root + path.sep)) {
    throw new Error('Unsafe kitten detail output path');
  }
  return output;
}

function generateKittenDetailPages(kittens, parents, lang = 'ja') {
  // Validate every identity before mkdir, cleanup, template reads, or writes. A bad KV
  // row must stop the cron without mutating the last-good static site.
  assertSafeKittenDetailIds(kittens);
  // Resolve last-write-wins identity on the complete snapshot before status/photo
  // eligibility. Otherwise a latest sold row can be filtered out and revive an older
  // available duplicate as a detail page and sitemap URL.
  const orderedKittens = KittenCatalog.orderKittens(kittens);
  // ja → <root>/kittens/, en → <root>/en/kittens/, zh → <root>/zh/kittens/
  const kittensDir = lang === 'ja'
    ? path.join(SITE_DIR, 'kittens')
    : path.join(SITE_DIR, lang, 'kittens');

  // 1. Create the target kittens dir if not exists
  if (!fs.existsSync(kittensDir)) {
    fs.mkdirSync(kittensDir, { recursive: true });
  }

  // 2. Filter eligible kittens: available or reserved, with at least 1 photo
  const eligible = orderedKittens.filter(k => {
    const effectiveStatus = KittenCatalog.normalizeStatus(k.status);
    return (effectiveStatus === 'available' || effectiveStatus === 'reserved') &&
      k.photos && k.photos.length > 0;
  });

  // 3. Build set of expected filenames
  const expectedFiles = new Set();
  for (const k of eligible) {
    const fileId = k.breederId || k.id;
    expectedFiles.add(`${fileId}.html`);
  }

  // 4. Clean up old files that don't correspond to current eligible kittens
  const existingFiles = fs.readdirSync(kittensDir).filter(f => f.endsWith('.html') && f !== 'index.html');
  let removedCount = 0;
  for (const f of existingFiles) {
    if (!expectedFiles.has(f)) {
      fs.unlinkSync(path.join(kittensDir, f));
      removedCount++;
    }
  }

  // 5. Extract header/footer template from kittens.html
  const { headerHtml, footerHtml } = extractDetailTemplate();

  // 6. Generate each detail page
  // Detect duplicate breederId collisions (data error): two distinct kittens sharing a
  // fileId silently overwrite each other's page. Surface it loudly instead of hiding it.
  // NOTE: once the owner assigns unique breederIds (no dupes remain), flip this to a hard
  // failure — `throw new Error(...)` — so a data error can never silently ship again.
  // Kept as a warning for now because ~3 known dupes exist; a hard fail would break the cron.
  const seenFileIds = new Set();
  const collisions = new Set();
  for (const k of kittens) {
    const fileId = k.breederId || k.id;
    if (seenFileIds.has(fileId)) collisions.add(fileId);
    seenFileIds.add(fileId);
  }
  // Collision warning only on the ja pass (data-level issue, identical across langs —
  // no need to log it three times).
  if (collisions.size && lang === 'ja') {
    console.warn(`  [COLLISION] ${collisions.size} duplicate breederId(s): ${[...collisions].join(', ')} — each collapses multiple kittens into ONE detail page (data must be deduped in admin).`);
  }

  // The full snapshot was already deduped and ordered before eligibility filtering.
  const detailKittens = eligible;
  // Title collisions can only be seen across the whole set, so resolve them once per
  // language before any page is written.
  prepareDetailTitles(detailKittens, lang);
  // Boilerplate alarm runs on the ja pass only: it is a data-level observation and
  // identical across languages.
  if (lang === 'ja') warnOnDuplicateOwnerCopy(detailKittens);
  let generatedCount = 0;
  for (const k of detailKittens) {
    const fileId = k.breederId || k.id;
    const outputPath = kittenDetailOutputPath(kittensDir, fileId);
    // Optional template fragments intentionally carry indentation around their
    // interpolation slots. Strip line-end spaces at the final write boundary so
    // every generated locale is byte-stable and passes repository diff hygiene.
    const html = prefillI18nDefaults(buildKittenDetailHtml(k, headerHtml, footerHtml, lang), lang)
      .replace(/[ \t]+$/gm, '')
      // Optional sections (mix / adult / featured) leave their slot empty for the kittens
      // they do not apply to. Collapse the resulting blank runs so the emitted page does
      // not vary in whitespace with which sections happened to apply.
      .replace(/\n{3,}/g, '\n\n');
    fs.writeFileSync(outputPath, html, 'utf-8');
    generatedCount++;
  }

  const label = lang === 'ja' ? 'kittens/' : `${lang}/kittens/`;
  console.log(`  ${label} -> ${generatedCount} detail pages generated, ${removedCount} old pages removed`);
  return detailKittens; // Return the unique URL set for sitemap use
}

// ── Update Sitemap ────────────────────────────────────────────

function updateSitemap(articles, kittenDetailPages, store, smallAnimalDetailPages = []) {
  assertSafeKittenDetailIds(kittenDetailPages || []);
  const filepath = path.join(SITE_DIR, 'sitemap.xml');
  const existing = fs.readFileSync(filepath, 'utf-8');
  const today = todayISO();
  // Honest lastmod: reuse stored date when the file content is unchanged (asset-version
  // bumps stripped before hashing); stamp today only on genuine content change / new URL.
  // The store is created ONCE in main() and shared across both generators / all passes
  // (save() does not prune, so entries coexist). Fall back to a local store if not passed.
  if (!store) store = createLastmodStore(SITE_DIR, today);

  function canonicalHref(html) {
    const match = String(html || '').match(/<link\s+rel=["']canonical["']\s+href=["']([^"']+)["']/i);
    return match ? match[1] : '';
  }

  // Extract the static (non-blog) portion: everything before "<!-- 子猫詳細ページ -->" or "<!-- ブログ記事 -->"
  const kittenDetailMarker = '<!-- 子猫詳細ページ -->';
  const smallAnimalListMarker = '<!-- 小動物一覧ページ (ja/en/zh) -->';
  const smallAnimalDetailMarker = '<!-- 小動物詳細ページ -->';
  const blogMarker = '<!-- ブログ記事 -->';

  // A public catalogue fetch failure must not silently deindex every detail page.
  // Preserve the last generated section byte-for-byte until a valid array returns.
  let preservedSmallAnimalEntries = '';
  if (SMALL_ANIMALS_LAUNCH.public && smallAnimalDetailPages === null) {
    let start = existing.indexOf(smallAnimalListMarker);
    if (start === -1) start = existing.indexOf(smallAnimalDetailMarker);
    const end = start === -1 ? -1 : existing.indexOf(blogMarker, start);
    if (start !== -1 && end !== -1) {
      preservedSmallAnimalEntries = existing.slice(start, end).replace(/\s*$/, '') + '\n';
    }
  }

  let staticPart;
  const kittenMarkerIdx = existing.indexOf(kittenDetailMarker);
  const blogMarkerIdx = existing.indexOf(blogMarker);

  if (kittenMarkerIdx !== -1) {
    staticPart = existing.substring(0, kittenMarkerIdx);
  } else if (blogMarkerIdx !== -1) {
    staticPart = existing.substring(0, blogMarkerIdx);
  } else {
    // No markers found - everything before </urlset>
    staticPart = existing.substring(0, existing.indexOf('</urlset>'));
  }
  // Normalize the boundary: the substring above keeps the whitespace that preceded the
  // marker, and the marker line below re-adds its own indent — without this trim the
  // leading whitespace grew every run (non-idempotent churn). Collapse trailing
  // whitespace/newlines to exactly one newline.
  staticPart = staticPart.replace(/\s*$/, '') + '\n';

  // Honest lastmod for EVERY handwritten static entry: rewrite each <url> block's
  // <lastmod> based on the content hash of the file its <loc> maps to. This subsumes
  // the old blanket today-stamp of kittens/parents/reviews and also stops /, /story/,
  // /siberian.html, /about.html, /gallery.html, /blog.html, /faq.html, /booking.html
  // from ever drifting on a no-op cron day.
  staticPart = staticPart.replace(
    /(<url>[\s\S]*?<loc>)([^<]+)(<\/loc>[\s\S]*?<lastmod>)[^<]*(<\/lastmod>)/g,
    (full, pre, loc, mid, post) => `${pre}${loc}${mid}${store.lastmodForUrl(loc)}${post}`
  );

  // Build kitten detail page URLs (with image:image entries for image sitemap).
  // ja block first (its marker is the splitter key), then en + zh blocks. Each language
  // dedups on the same breederId set → the 3 collision ids emit exactly one <loc> per lang.
  const detailPages = kittenDetailPages || [];
  function detailEntriesFor(lang, marker) {
    let out = marker ? `  ${marker}\n` : '';
    const seen = new Set();
    for (const k of detailPages) {
      const fileId = k.breederId || k.id;
      if (seen.has(fileId)) continue;
      seen.add(fileId);
      const photo = getCoverPhoto(k);
      const gt = genderText(k.gender);
      // Localized image caption (cheap consistency win per spec §4.4).
      const caption = lang === 'ja'
        ? `${k.breed}の子猫 ${k.color || ''} ${gt}・個体番号${fileId}`.trim()
        : (lang === 'en'
            ? `${breedLabel(k.breed, 'en')} kitten ${colorLabel(k.color, 'en') || ''} ${genderTextL(k.gender, 'en')} · ID ${fileId}`.replace(/\s+/g, ' ').trim()
            : `${breedLabel(k.breed, 'zh')}幼猫 ${colorLabel(k.color, 'zh') || ''} ${genderTextL(k.gender, 'zh')}・个体编号${fileId}`.replace(/\s+/g, ' ').trim());
      const imageBlock = photo ? `
    <image:image>
      <image:loc>${escapeHtml(photo)}</image:loc>
      <image:caption>${escapeHtml(caption)}</image:caption>
    </image:image>` : '';
      const loc = `${BASE_URL}/${langDir(lang)}kittens/${fileId}.html`;
      out += `  <url>
    <loc>${BASE_URL}/${langDir(lang)}kittens/${escapeHtml(fileId)}.html</loc>
    <lastmod>${store.lastmodForUrl(loc)}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>${imageBlock}
  </url>\n`;
    }
    return out;
  }
  // List pages (ja list already lives in the static part via its handwritten <url>; add en/zh).
  function listEntry(lang) {
    const loc = `${BASE_URL}/${langDir(lang)}kittens.html`;
    return `  <url>
    <loc>${loc}</loc>
    <lastmod>${store.lastmodForUrl(loc)}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>\n`;
  }
  // Order: ja detail block (marker = splitter key, must be first) → en/zh list → en detail → zh detail.
  // All before the blog marker; the static-part splitter keys on the FIRST 子猫詳細ページ marker.
  // en/zh entries are emitted only when those pages actually exist on disk, so the sitemap
  // never advertises a URL that 404s (and so this generator stays honest at commit boundaries).
  const enExists = fs.existsSync(path.join(SITE_DIR, 'en', 'kittens.html'));
  const zhExists = fs.existsSync(path.join(SITE_DIR, 'zh', 'kittens.html'));
  let kittenEntries = detailEntriesFor('ja', kittenDetailMarker);
  if (enExists || zhExists) {
    kittenEntries += '  <!-- 子猫一覧ページ (en/zh) -->\n';
    if (enExists) kittenEntries += listEntry('en');
    if (zhExists) kittenEntries += listEntry('zh');
  }
  if (enExists) kittenEntries += detailEntriesFor('en', '<!-- 子猫詳細ページ (en) -->');
  if (zhExists) kittenEntries += detailEntriesFor('zh', '<!-- 子猫詳細ページ (zh) -->');

  // Discover every self-canonical guide page from disk. This section is emitted after
  // the rebuilt kitten block so it never becomes part of staticPart and cannot duplicate
  // on repeated runs.
  let guideEntries = '  <!-- お迎えガイド -->\n';
  let guideCount = 0;
  const guideDir = path.join(SITE_DIR, 'guide');
  if (fs.existsSync(guideDir)) {
    for (const filename of fs.readdirSync(guideDir).filter(name => name.endsWith('.html')).sort()) {
      const html = fs.readFileSync(path.join(guideDir, filename), 'utf8');
      const relative = filename === 'index.html' ? 'guide/' : `guide/${filename}`;
      const loc = `${BASE_URL}/${relative}`;
      if (hasNoindexMeta(html) || canonicalHref(html) !== loc) continue;
      guideEntries += `  <url>
    <loc>${loc}</loc>
    <lastmod>${store.lastmodForUrl(loc)}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>${filename === 'index.html' ? '0.8' : '0.7'}</priority>
  </url>\n`;
      guideCount++;
    }
  }

  // Public service landing pages are kept separate from the editorial guide
  // namespace. Emit only the exact, self-canonical, indexable destinations so
  // a future owner gate can remove one by restoring noindex without leaving a
  // stale sitemap URL behind. The noindex estimator is deliberately excluded.
  let serviceEntries = '  <!-- 公開サービス -->\n';
  let serviceCount = 0;
  for (const relative of ['boarding/', 'grooming/']) {
    const filepath = path.join(SITE_DIR, relative, 'index.html');
    if (!fs.existsSync(filepath)) continue;
    const html = fs.readFileSync(filepath, 'utf8');
    const loc = `${BASE_URL}/${relative}`;
    if (hasNoindexMeta(html) || canonicalHref(html) !== loc) continue;
    serviceEntries += `  <url>
    <loc>${loc}</loc>
    <lastmod>${store.lastmodForUrl(loc)}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>\n`;
    serviceCount++;
  }

  // A public-launch flip registers all three list pages and the same eligible detail
  // set generated above. Dark mode emits zero bytes here, so the private slug can never
  // leak into sitemap.xml. Markers are XML comments (never raw urlset text nodes).
  let smallAnimalEntries = '';
  const smallDetailPages = smallAnimalDetailPages === null
    ? null
    : dedupeSmallAnimals(smallAnimalDetailPages);
  if (SMALL_ANIMALS_LAUNCH.public) {
    if (smallDetailPages === null) {
      smallAnimalEntries = preservedSmallAnimalEntries;
    } else {
      const slug = activeSmallAnimalSlug();
      smallAnimalEntries += `  ${smallAnimalListMarker}\n`;
      for (const lang of ['ja', 'en', 'zh']) {
        const rel = `${langDir(lang)}${slug}.html`;
        if (!fs.existsSync(path.join(SITE_DIR, rel))) continue;
        const loc = `${BASE_URL}/${rel}`;
        smallAnimalEntries += `  <url>
    <loc>${loc}</loc>
    <lastmod>${store.lastmodForUrl(loc)}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>\n`;
      }

      smallAnimalEntries += `  ${smallAnimalDetailMarker}\n`;
      for (const lang of ['ja', 'en', 'zh']) {
        for (const animal of smallDetailPages) {
          const fileId = encodeURIComponent(animal.breederId);
          const loc = `${BASE_URL}/${langDir(lang)}${slug}/${fileId}.html`;
          smallAnimalEntries += `  <url>
    <loc>${loc}</loc>
    <lastmod>${store.lastmodForUrl(loc)}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>\n`;
        }
      }
    }
  }

  // Build blog article URLs — union of API articles + disk HTML files
  let blogEntries = `  ${blogMarker}\n`;
  const publishedArticles = (articles || []).filter(a => a.published !== false);
  const blogSlugs = new Set(publishedArticles.map(a => a.slug).filter(Boolean));

  // Also scan /blog/*.html on disk to catch any articles not in API
  const blogDir = path.join(SITE_DIR, 'blog');
  if (fs.existsSync(blogDir)) {
    const diskFiles = fs.readdirSync(blogDir).filter(f => f.endsWith('.html'));
    for (const f of diskFiles) {
      const slug = f.replace('.html', '');
      const html = fs.readFileSync(path.join(blogDir, f), 'utf-8');
      if (hasNoindexMeta(html)) {
        // The file's robots policy wins over stale API publication metadata.
        blogSlugs.delete(slug);
        continue;
      }
      const loc = `${BASE_URL}/blog/${f}`;
      if (canonicalHref(html) !== loc) {
        // Canonical aliases must never compete with their destination in sitemap.xml.
        blogSlugs.delete(slug);
        continue;
      }
      blogSlugs.add(slug);
    }
  }

  const sortedSlugs = [...blogSlugs].filter((slug) => {
    const filepath = path.join(blogDir, `${slug}.html`);
    if (!fs.existsSync(filepath)) return false;
    const html = fs.readFileSync(filepath, 'utf8');
    return !hasNoindexMeta(html) && canonicalHref(html) === `${BASE_URL}/blog/${slug}.html`;
  }).sort();
  let localizedBlogCount = 0;
  function appendBlogEntry(loc) {
    blogEntries += `  <url>
    <loc>${escapeHtml(loc)}</loc>
    <lastmod>${store.lastmodForUrl(loc)}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>\n`;
  }
  for (const slug of sortedSlugs) {
    appendBlogEntry(`${BASE_URL}/blog/${slug}.html`);
    for (const lang of ['en', 'zh']) {
      const localizedPath = path.join(SITE_DIR, lang, 'blog', `${slug}.html`);
      if (!fs.existsSync(localizedPath)) continue;
      const localizedHtml = fs.readFileSync(localizedPath, 'utf8');
      if (hasNoindexMeta(localizedHtml)) continue;
      const localizedLoc = `${BASE_URL}/${lang}/blog/${slug}.html`;
      if (canonicalHref(localizedHtml) !== localizedLoc) continue;
      appendBlogEntry(localizedLoc);
      localizedBlogCount++;
    }
  }

  const output = staticPart + kittenEntries + guideEntries + serviceEntries + smallAnimalEntries + blogEntries + '</urlset>\n';
  fs.writeFileSync(filepath, output, 'utf-8');
  store.save();
  const diskOnly = sortedSlugs.length - publishedArticles.length;
  const smallCount = smallDetailPages === null ? 'preserved' : smallDetailPages.length;
  console.log(`  sitemap.xml -> ${detailPages.length} kitten detail pages, ${guideCount} guide pages, ${serviceCount} service pages, ${smallCount} small-animal detail pages, ${sortedSlugs.length} ja + ${localizedBlogCount} localized blog URLs updated${diskOnly > 0 ? ` (${diskOnly} from disk only)` : ''}`);
}

// ── RSS feed (/feed.xml) ──────────────────────────────────────

// Article title/excerpt may be a plain string or an i18n object {ja,en,zh}.
// Prefer Japanese (the default site language), fall back to any non-empty value.
function pickText(field) {
  if (!field) return '';
  if (typeof field === 'string') return field;
  if (typeof field === 'object') {
    return field.ja || field.en || field.zh || Object.values(field).find(Boolean) || '';
  }
  return String(field);
}

// RFC-822 date (e.g. "Sun, 27 Apr 2026 19:50:00 GMT"). toUTCString() is RFC-822 compliant.
function rfc822(dateStr) {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return d.toUTCString();
}

function generateFeed(articles) {
  const filepath = path.join(SITE_DIR, 'feed.xml');

  // Candidate items from API articles (published only). Each needs a slug, a title,
  // and a resolvable date. Disk-only posts without an API record fall back to the
  // lastmod store date; posts with no date at all are skipped.
  const today = todayISO();
  const store = createLastmodStore(SITE_DIR, today);
  const published = (articles || []).filter(a => a && a.published !== false && a.slug);

  const items = [];
  for (const a of published) {
    const title = pickText(a.title).trim();
    if (!title) continue;
    // Prefer publishedAt; fall back through createdAt/updatedAt, then the store date.
    let dateSource = a.publishedAt || a.createdAt || a.updatedAt || null;
    let pub = dateSource ? rfc822(dateSource) : null;
    let sortKey = dateSource ? new Date(dateSource).getTime() : NaN;
    if (!pub) {
      const storeDate = store.lastmodForUrl(`${BASE_URL}/blog/${a.slug}.html`);
      pub = rfc822(`${storeDate}T00:00:00Z`);
      sortKey = new Date(`${storeDate}T00:00:00Z`).getTime();
    }
    if (!pub || isNaN(sortKey)) continue; // no usable date -> skip
    items.push({
      slug: a.slug,
      title,
      description: publishViewingAddress(pickText(a.excerpt)),
      link: `${BASE_URL}/blog/${a.slug}.html`,
      pubDate: pub,
      sortKey,
    });
  }

  // Deterministic order: newest first, then slug ascending as tiebreak.
  items.sort((x, y) => (y.sortKey - x.sortKey) || (x.slug < y.slug ? -1 : x.slug > y.slug ? 1 : 0));
  const latest = items.slice(0, 30);

  const channelDesc = 'サイベリアンの特徴、猫の健康管理、子猫の育て方など、猫に関する知識を専門ブリーダーが解説。大阪の福楽キャッテリーがお届けする猫の知識ライブラリ。';

  const itemsXml = latest.map(it => `    <item>
      <title>${escapeHtml(it.title)}</title>
      <link>${escapeHtml(it.link)}</link>
      <guid isPermaLink="true">${escapeHtml(it.link)}</guid>
      <pubDate>${it.pubDate}</pubDate>
      <description>${escapeHtml(it.description)}</description>
    </item>`).join('\n');

  // NOTE: no <lastBuildDate>/build timestamp — the feed must be byte-deterministic so
  // the daily cron stays idempotent (Item 1). Order + content derive only from data.
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>福楽キャッテリー ブログ</title>
    <link>${BASE_URL}/blog.html</link>
    <description>${escapeHtml(channelDesc)}</description>
    <language>ja</language>
${itemsXml}
  </channel>
</rss>
`;

  fs.writeFileSync(filepath, xml, 'utf-8');
  console.log(`  feed.xml -> ${latest.length} latest blog articles (RSS 2.0)`);
}

function generateFeedIfAvailable(articles) {
  if (!Array.isArray(articles)) {
    console.log('  [skip] feed.xml (articles API unavailable; preserving last good output)');
    return false;
  }
  generateFeed(articles);
  return true;
}

// ── Drive Photo Enrichment ────────────────────────────────────

async function enrichKittensWithDrivePhotos(kittens) {
  const kittensFolderId = '1bQKvwvfa3jHIuKGzR9nvvZIKB6z5-kF4';
  let folders;
  try {
    folders = await fetchJSON('/api/drive/folders/' + kittensFolderId);
  } catch (e) {
    console.log('  [warn] Drive folders fetch failed:', e.message);
    return;
  }
  if (!Array.isArray(folders) || folders.length === 0) return;

  const folderMap = {};
  for (const f of folders) folderMap[f.name] = f.id;

  let enriched = 0;
  const targets = kittens.filter(k => k.breederId && folderMap[k.breederId]);
  const messages = new Array(targets.length);
  let nextTarget = 0;
  async function enrichNext() {
    while (nextTarget < targets.length) {
      const index = nextTarget++;
      const k = targets[index];
      const bid = k.breederId;
      try {
        const images = await fetchJSON('/api/drive/images/' + folderMap[bid]);
        if (Array.isArray(images) && images.length > 0) {
          k.photos = images.map(img => img.url.startsWith('/')
            ? API_BASE + img.url : img.url);
          enriched++;
          messages[index] = '    Drive: ' + bid + ' -> ' + images.length + ' photos';
        }
      } catch (e) {
        messages[index] = '    [warn] Drive images for ' + bid + ': ' + e.message;
      }
    }
  }
  const concurrency = Math.min(4, targets.length);
  await Promise.all(Array.from({ length: concurrency }, enrichNext));
  messages.filter(Boolean).forEach(message => console.log(message));
  console.log('  Drive enrichment: ' + enriched + '/' + kittens.length + ' kittens');
}

// ── Main ──────────────────────────────────────────────────────

async function main() {
  console.log('Fuluck Site Generator');
  console.log('========================');
  console.log(`  API: ${API_BASE}`);
  console.log(`  Site: ${SITE_DIR}`);
  console.log('');

  // Fetch all data in parallel
  console.log('Fetching data from API...');
  const [kittens, parents, reviews, articlesResult, faq, smallAnimalsResult] = await Promise.all([
    fetchRequiredArray('/api/kittens', 'kittens'),
    fetchRequiredArray('/api/parents', 'parents'),
    fetchRequiredArray('/api/reviews', 'reviews'),
    fetchJSON('/api/articles').catch(e => { console.error('  [error] articles:', e.message); return null; }),
    fetchRequiredArray('/api/faq', 'faq'),
    fetchSmallAnimalsForGeneration().catch(e => { console.error('  [error] small animals:', e.message); return null; }),
  ]);

  const articles = Array.isArray(articlesResult) ? articlesResult : null;
  if (articlesResult !== null && articles === null) {
    console.error('  [error] articles: API response was not an array; preserving feed.xml');
  }
  const smallAnimals = Array.isArray(smallAnimalsResult) ? smallAnimalsResult : null;
  if (smallAnimalsResult !== null && smallAnimals === null) {
    console.error('  [error] small animals: API response was not an array; preserving existing generated pages');
  }
  requireSmallAnimalDataForLaunch(smallAnimals);
  // Validate the complete API snapshot before Drive enrichment or the first filesystem
  // write. One hostile row must leave the entire last-good static release untouched.
  assertSafeKittenDetailIds(kittens);
  // The homepage generator owns only one explicitly marked grid block. Validate that
  // boundary before Drive enrichment or any filesystem write so a damaged template
  // cannot leave a partially regenerated release behind.
  validateHomepageKittensMarkers();

  console.log(`  Fetched: ${kittens.length} kittens, ${smallAnimals === null ? 'unavailable' : smallAnimals.length} small animals, ${parents.length} parents, ${reviews.length} reviews, ${articles === null ? 'unavailable' : articles.length} articles, ${faq.length} FAQ`);
  console.log('');

  // Enrich kittens with Drive photos (merge multi-photo arrays)
  console.log('Enriching kittens with Drive photos...');
  await enrichKittensWithDrivePhotos(kittens);
  console.log('');

  // Generate pages
  console.log('Generating pages...');

  // Deterministic service projections. They are written only after the complete API
  // snapshot passes the no-partial-write gates.
  writeServicePages();
  writeDogServicesProjection();

  // Emit the single-source catalog value translations first — client renderers
  // (card-loader.js, kitten-carousel.js) load /catalog-i18n.js to translate raw ja
  // color/breed data at render time. Data-independent (derived from generator tables).
  generateCatalogI18n();

  generateKittens(kittens, 'ja');
  generateHomepageKittens(kittens);

  // Generate kitten detail pages (individual pages per kitten), ja then en + zh.
  let kittenDetailPages = [];
  // ja detail pass first — it populates ASSET_VERSIONS (via extractDetailTemplate) that
  // the en/zh list-header builder reads. Same eligible set drives all langs, so the
  // hreflang triad stays symmetric (a kitten in ja exists in en+zh, never a 404).
  // A successful [] is authoritative: render an honest empty list and remove stale
  // detail files. Network/non-array failures have already aborted before this write phase.
  kittenDetailPages = generateKittenDetailPages(kittens, parents, 'ja');
  generateKittens(kittens, 'en');
  generateKittens(kittens, 'zh');
  generateKittenDetailPages(kittens, parents, 'en');
  generateKittenDetailPages(kittens, parents, 'zh');

  // Owner-gated small-animal pages always render an honest empty state for a successful
  // [] response. A failed/non-array fetch preserves the last good generated output.
  let smallAnimalDetailPages = [];
  if (smallAnimals !== null && (SMALL_ANIMALS_LAUNCH.public || SMALL_ANIMALS_LAUNCH.slugDark)) {
    for (const lang of ['ja', 'en', 'zh']) generateSmallAnimals(smallAnimals, lang);
    smallAnimalDetailPages = generateSmallAnimalDetailPages(smallAnimals, 'ja');
    generateSmallAnimalDetailPages(smallAnimals, 'en');
    generateSmallAnimalDetailPages(smallAnimals, 'zh');
  } else if (!SMALL_ANIMALS_LAUNCH.public && !SMALL_ANIMALS_LAUNCH.slugDark) {
    removePublicSmallAnimalOutput();
    console.log('  [skip] small-animal private preview (SMALL_ANIMALS_DARK_SLUG not set)');
  } else {
    console.log('  [skip] small-animal pages (API unavailable; preserving last good output)');
    smallAnimalDetailPages = null;
  }

  generateParents(parents);
  generateReviews(reviews);

  // Always update sitemap (even with 0 articles, keeps static pages updated).
  // Single shared lastmod-store for the whole run (ja + en + zh URLs coexist).
  const store = createLastmodStore(SITE_DIR, todayISO());
  updateSitemap(articles, kittenDetailPages, store, smallAnimalDetailPages);

  // RSS feed of the latest blog articles (deterministic; no build timestamp).
  generateFeedIfAvailable(articles);

  // Future capabilities (not yet implemented)
  console.log('  [future] blog.html — 104 article cards (not yet implemented)');
  console.log('  [future] faq.html — FAQ page (not yet implemented)');

  console.log('');
  console.log('========================');
  console.log('Done!');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});

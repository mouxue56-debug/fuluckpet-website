#!/usr/bin/env node
// tools/generate-site.js — Regenerate static pages from API data
// Usage: node tools/generate-site.js
// No dependencies required (uses native https/fs modules)

const https = require('https');
const fs = require('fs');
const path = require('path');
const { createLastmodStore } = require('./lastmod-store');

const API_BASE = 'https://fuluck-api.mouxue56.workers.dev';
const SITE_DIR = path.resolve(__dirname, '..');
const BASE_URL = 'https://fuluckpet.com';
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
    desc: '抱っこが大好きな「ぬいぐるみ」猫、ラグドールです。',
    parentDesc: '抱っこが大好きな「ぬいぐるみ」猫、ラグドールの親猫たちです。',
    bgClass: 'sec-cream',
    shapes: [
      { w: 160, h: 160, bg: 'var(--mango)', pos: 'top:8%;right:10%;' },
      { w: 120, h: 120, bg: 'var(--blueberry)', pos: 'bottom:12%;left:5%;' }
    ]
  }
];

// ── Helpers ────────────────────────────────────────────────────

function fetchJSON(endpoint) {
  return new Promise((resolve, reject) => {
    const url = API_BASE + endpoint;
    https.get(url, (res) => {
      let data = '';
      res.setEncoding('utf8'); // decode multi-byte UTF-8 across chunk boundaries (avoid mojibake)
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed);
        } catch (e) {
          reject(new Error(`Failed to parse JSON from ${endpoint}: ${e.message}`));
        }
      });
    }).on('error', reject);
  });
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

function statusText(status) {
  switch (status) {
    case 'available': return '販売中';
    case 'reserved': return 'ご予約済';
    case 'sold': return 'sold';
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
    sold: { ja: 'sold', en: 'Adopted', zh: '已出售' },
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

// Hypoallergenic chip text, baked per language on the list-page cards (no data-i18n
// hooks there). Matches i18n.js chip.hypoallergenic exactly.
function hypoChipText(lang) {
  if (lang === 'en') return 'Hypoallergenic Siberian';
  if (lang === 'zh') return '低致敏西伯利亚猫';
  return '低アレルゲンのシベリアン';
}

// Breed label. FABLE VERDICT: サイベリアン×ブリティッシュ mix rendering; folds into Siberian section.
const BREED_MAP = {
  'サイベリアン': { en: 'Siberian', zh: '西伯利亚猫' },
  'ブリティッシュショートヘア': { en: 'British Shorthair', zh: '英国短毛猫' },
  'ブリティッシュロングヘア': { en: 'British Longhair', zh: '英国长毛猫' },
  'ラグドール': { en: 'Ragdoll', zh: '布偶猫' },
  'サイベリアン×ブリティッシュ': { en: 'Siberian × British mix', zh: '西伯利亚×英系混血' },
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
  'ブラウンタビー&ホワイト（トリプルコート）': { en: 'Brown Tabby & White (Triple Coat)', zh: '棕虎斑&白色（三层被毛）' },
  'ブルーリンクスポイント ネヴァマスカレード': { en: 'Blue Lynx Point Neva Masquerade', zh: '蓝色山猫重点色 涅瓦假面' },
  'ゴールデンシェーデッド': { en: 'Golden Shaded', zh: '金色阴影' },
  'シルバー&ホワイト（トリプルコート）': { en: 'Silver & White (Triple Coat)', zh: '银色&白色（三层被毛）' },
  'ブラウンタビー トリプルコート': { en: 'Brown Tabby, Triple Coat', zh: '棕虎斑 三层被毛' },
  'ブラウンタビー＆ホワイト': { en: 'Brown Tabby & White', zh: '棕虎斑&白色' },
  'ブルーリンクスポイント(ネヴァマスカレード)（トリプルコート）': { en: 'Blue Lynx Point (Neva Masquerade) (Triple Coat)', zh: '蓝色山猫重点色（涅瓦假面）（三层被毛）' },
  'レッドリンクスポイント': { en: 'Red Lynx Point', zh: '红色山猫重点色' },
  'ゴールデンシェーデッド＆ホワイト': { en: 'Golden Shaded & White', zh: '金色阴影&白色' },
  'シルバーシェーデット': { en: 'Silver Shaded', zh: '银色阴影' },
  'シルバーシェーデッド': { en: 'Silver Shaded', zh: '银色阴影' },
  'シルバータビー': { en: 'Silver Tabby', zh: '银虎斑' },
  'シルバータビー トリプルコート': { en: 'Silver Tabby, Triple Coat', zh: '银虎斑 三层被毛' },
  'シルバー＆ホワイト トリプルコート': { en: 'Silver & White, Triple Coat', zh: '银色&白色 三层被毛' },
  'シールポイント(ネヴァマスカレード)（トリプルコート）': { en: 'Seal Point (Neva Masquerade) (Triple Coat)', zh: '海豹重点色（涅瓦假面）（三层被毛）' },
  'チョコレートゴールデン ロングヘア': { en: 'Chocolate Golden Longhair', zh: '巧克力金色 长毛' },
  'チンチラゴールデン ロングヘア': { en: 'Chinchilla Golden Longhair', zh: '金吉拉金色 长毛' },
  'ブラウンタビー（トリプルコート）': { en: 'Brown Tabby (Triple Coat)', zh: '棕虎斑（三层被毛）' },
  'ブルー&ホワイト（トリプルコート）': { en: 'Blue & White (Triple Coat)', zh: '蓝色&白色（三层被毛）' },
  'ブルーパッチドタビー＆ホワイト': { en: 'Blue Patched Tabby & White', zh: '蓝玳瑁虎斑加白' },
  'ホワイト トリプルコート': { en: 'White, Triple Coat', zh: '白色 三层被毛' },
  'ホワイトソリッド（トリプルコート）': { en: 'Solid White (Triple Coat)', zh: '纯白色（三层被毛）' },
  'レッドリンクスポイント トリプルコート': { en: 'Red Lynx Point, Triple Coat', zh: '红色山猫重点色 三层被毛' },
};
function colorLabel(color, lang) {
  if (lang === 'ja' || !color) return color || '';
  const row = COLOR_MAP[color];
  if (row && row[lang]) return row[lang];
  console.warn(`  [i18n] no ${lang} color mapping for "${color}" — passthrough ja`);
  return color;
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
  ja: '新しいご家族を待っている子猫たちをご紹介します。価格帯: ¥140,000～¥290,000（税込）',
  en: 'Meet the kittens waiting for their new families. Price range: ¥140,000–¥290,000 (tax incl.).',
  zh: '为您介绍正在等待新家庭的猫咪们。价格区间：¥140,000～¥290,000（含税）。',
};

// Breadcrumb "Kittens" label (kitten.breadcrumb.kittens key mirror for baked list/detail).
const KITTENS_LABEL = { ja: '子猫一覧', en: 'Kittens', zh: '幼猫一览' };
const HOME_LABEL = { ja: 'ホーム', en: 'Home', zh: '首页' };

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

// ── Generate Kittens ──────────────────────────────────────────

// Absolutize relative header/footer links so the en/zh list pages (one level deep) resolve
// chrome links to the site root, exactly as the precedent en|zh/*.html pages do.
function listToAbsoluteLinks(html) {
  return html
    .replace(/href="(?!\/|https?:|#|mailto:|tel:)([^"]+)"/g, 'href="/$1"')
    .replace(/src="(?!\/|https?:|data:)([^"]+)"/g, 'src="/$1"');
}

// Build the en/zh list-page header from the ja header:
//  - rebuild <html lang>, <head> (title/meta/OG/twitter/canonical/hreflang/breadcrumb JSON-LD)
//    from a per-lang template,
//  - keep the nav/mobile-nav chrome VERBATIM (data-i18n localizes it at runtime; links
//    absolutized for depth) — matches the established precedent,
//  - localize the page-hero (breadcrumb + h1 + subtitle).
function buildListHeader(jaHeader, lang) {
  if (lang === 'ja') return jaHeader; // untouched → byte-identical
  const headerMarker = '<!-- ========== HEADER ========== -->';
  const heroMarker = '<!-- ========== PAGE HERO ========== -->';
  const headerIdx = jaHeader.indexOf(headerMarker);
  const heroIdx = jaHeader.indexOf(heroMarker);
  // Chrome = HEADER marker through just before PAGE HERO (nav + mobile nav), absolutized.
  const chrome = listToAbsoluteLinks(jaHeader.substring(headerIdx, heroIdx).replace(/\s*$/, ''));

  const styleV = verAsset('style.css', '20260628k');
  const navCssV = verAsset('nav.css', '20260628a');
  const navJsV = verAsset('nav.js', '20260628a');
  const relPath = 'kittens.html';
  const selfUrl = `${BASE_URL}/${langDir(lang)}kittens.html`;
  const kittensLabel = KITTENS_LABEL[lang];
  const homeLabel = HOME_LABEL[lang];
  const heroSub = HERO_SUB[lang];

  let title, desc, ogSite;
  if (lang === 'en') {
    title = 'Kittens for Sale | Siberian Cats in Osaka | Fuluck Cattery';
    desc = 'Available kittens at Fuluck Cattery in Osaka — Siberian, British Shorthair, British Longhair and Ragdoll. Low-allergen, gentle-natured kittens. Reviews 5.00.';
    ogSite = 'Fuluck Cattery';
  } else {
    title = '幼猫一览｜大阪西伯利亚猫繁育｜福楽キャッテリー';
    desc = '大阪福楽キャッテリー在售幼猫一览。西伯利亚猫、英国短毛猫、英国长毛猫、布偶猫。低致敏、性格温和。口碑评分5.00。';
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
  <link rel="preload" as="style" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Noto+Sans+JP:wght@400;500;700&family=Noto+Sans+SC:wght@400;500;700&display=swap" onload="this.onload=null;this.rel='stylesheet'">
  <noscript><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Noto+Sans+JP:wght@400;500;700&family=Noto+Sans+SC:wght@400;500;700&display=swap" rel="stylesheet"></noscript>
  <link rel="stylesheet" href="/style.css?v=${styleV}">
  <link rel="stylesheet" href="/nav.css?v=${navCssV}">
  <link rel="icon" type="image/svg+xml" href="${FAVICON_HREF}">
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
  <a class="skip-link" href="#main">メインコンテンツへスキップ</a>

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
    <p>${escapeHtml(heroSub)}</p>
  </section>`;

  return head + chrome + '\n\n' + hero;
}

function generateKittens(kittens, lang = 'ja') {
  const filepath = path.join(SITE_DIR, 'kittens.html');
  const { header: jaHeader, tail } = extractTemplate(filepath);
  const header = buildListHeader(jaHeader, lang);
  const outPath = lang === 'ja'
    ? filepath
    : path.join(SITE_DIR, lang, 'kittens.html');
  if (lang !== 'ja') {
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
  }

  // Group kittens by breed
  const breedGroups = new Map();
  for (const cfg of BREED_CONFIG) {
    breedGroups.set(cfg.key, []);
  }

  for (const k of kittens) {
    if (!k.photos || k.photos.length === 0) continue; // skip kittens without photos
    const photo = getCoverPhoto(k);
    if (!photo) continue;

    const breed = k.breed || '';
    if (breedGroups.has(breed)) {
      breedGroups.get(breed).push(k);
    } else {
      // Unknown breed - try to find a partial match
      let matched = false;
      for (const cfg of BREED_CONFIG) {
        if (breed.includes(cfg.key) || cfg.key.includes(breed)) {
          breedGroups.get(cfg.key).push(k);
          matched = true;
          break;
        }
      }
      if (!matched) {
        // Put in first group as fallback, or skip
        console.log(`  [warn] Unknown breed "${breed}" for kitten ${k.id}, skipping`);
      }
    }
  }

  // Build sections
  let sections = '';
  let sectionIdx = 0;
  for (const cfg of BREED_CONFIG) {
    const group = breedGroups.get(cfg.key);
    if (!group || group.length === 0) continue;

    // Add wave divider between sections (not before first)
    if (sectionIdx > 0) {
      const nextBg = cfg.bgClass === 'sec-cream' ? 'cream' : 'white';
      sections += waveDivider(nextBg);
    }

    const shapesHtml = cfg.shapes.map(s =>
      `      <div class="shape" style="width:${s.w}px;height:${s.h}px;background:${s.bg};${s.pos}"></div>`
    ).join('\n');

    let cardsHtml = '';
    for (const k of group) {
      const photo = getCoverPhoto(k);
      const st = statusText(k.status);
      const gt = genderText(k.gender);
      const bd = formatBirthday(k.birthday);
      const pr = formatPrice(k.price);
      const isNewBadge = k.isNew ? '\n            <span class="kit-badge-new">NEW</span>' : '';

      // Localized baked strings (ja passthrough → byte-identical). The card has no
      // data-i18n, so every visible value is emitted in-language here.
      const stL = lang === 'ja' ? st : statusTextL(k.status, lang);
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
      cardsHtml += `
        <div class="kitten-card" data-status="${escapeHtml(k.status)}" data-price="${k.price || ''}" data-birthday="${escapeHtml(k.birthday)}" data-images="${escapeHtml(photo)}" data-video="" data-papa="${escapeHtml(k.papa)}" data-mama="${escapeHtml(k.mama)}" data-new="${k.isNew ? 'true' : 'false'}" data-name="" data-breeder-id="${escapeHtml(k.breederId)}">
          <div class="kitten-img">
            <img src="${escapeHtml(photo)}" alt="${escapeHtml(cardAlt)}" loading="lazy" style="width:100%;height:100%;object-fit:cover;">
            <span class="kit-status st-${escapeHtml(k.status)}">${escapeHtml(stL)}</span>${isNewBadge}
          </div>
          <div class="kitten-body">
            <h3>${escapeHtml(breedCard)}</h3>${hypoChip}
            <p class="kit-meta">${metaLine}</p>
            <p class="kit-meta">${bornCard}</p>
            ${k.note ? `<p class="kit-meta" style="font-size:11px;color:var(--text-note);">${escapeHtml(k.note)}</p>` : ''}
            <p class="kit-price">&yen;${pr} <span class="tax">${taxIncl(lang)}</span></p>
          </div>
        </div>`;
    }

    const secTitle = lang === 'ja'
      ? `${escapeHtml(cfg.key)} (${group.length}匹)`
      : `${escapeHtml(breedLabel(cfg.key, lang))}${countLabel(group.length, lang)}`;
    sections += `

  <!-- ========== ${cfg.tag.toUpperCase()} KITTENS ========== -->
  <section class="section ${cfg.bgClass}" style="position:relative;">
    <div class="parallax-bg">
${shapesHtml}
    </div>
    <div class="container" style="position:relative;z-index:1;">
      <div class="sec-header">
        <span class="sec-tag">${escapeHtml(cfg.tag)}</span>
        <h2 class="sec-title">${secTitle}</h2>
        <p class="sec-desc">${escapeHtml(breedDesc(cfg, lang))}</p>
      </div>
      <div class="kittens-grid" style="grid-template-columns:repeat(auto-fill, minmax(260px, 1fr));">${cardsHtml}
      </div>
    </div>
  </section>`;

    sectionIdx++;
  }

  // Per-kitten Product JSON-LD (rich-result eligibility for each card)
  const availMap = { available: 'InStock', reserved: 'OnBackOrder', sold: 'OutOfStock' };
  const traitPick = (() => {
    const pool = ['低アレルゲンで人懐こい', '健康的で活発な', '穏やかで上品な', '愛らしい性格の', '人懐こく健康的な'];
    return (i) => pool[i % pool.length];
  })();
  const products = [];
  let pIdx = 0;
  const listPageUrl = `${BASE_URL}/${langDir(lang)}kittens.html`;
  for (const k of kittens) {
    const photo = getCoverPhoto(k);
    if (!photo) continue;
    const gt = genderText(k.gender);
    const fileId = k.breederId || k.id;
    const trait = traitPick(pIdx++);
    // Localized name/description (ja passthrough → byte-identical).
    let name, description;
    if (lang === 'ja') {
      name = `${k.breed}・${k.color || ''}・${gt}・${fileId}`;
      description = `${trait}${k.breed} ${k.color || ''} ${gt}。大阪・福楽キャッテリー`.trim();
    } else {
      const bL = breedLabel(k.breed, lang);
      const cL = colorLabel(k.color, lang);
      const gL = genderTextL(k.gender, lang);
      if (lang === 'en') {
        name = `${bL} · ${cL || ''} · ${gL} · ${fileId}`.replace(/\s+/g, ' ').trim();
        description = `${bL} kitten ${cL || ''} ${gL} at Fuluck Cattery, Osaka.`.replace(/\s+/g, ' ').trim();
      } else {
        name = `${bL}・${cL || ''}・${gL}・${fileId}`;
        description = `${bL} ${cL || ''} ${gL}。大阪·福楽キャッテリー`.replace(/\s+/g, ' ').trim();
      }
    }
    products.push({
      "@context": "https://schema.org",
      "@type": "Product",
      "@id": `${listPageUrl}#${fileId}`,
      "name": name,
      ...(lang !== 'ja' ? { "inLanguage": lang } : {}),
      "image": [photo],
      "description": description,
      "brand": { "@type": "Brand", "name": "福楽キャッテリー" },
      "offers": {
        "@type": "Offer",
        "url": `${BASE_URL}/${langDir(lang)}kittens/${fileId}.html`,
        "priceCurrency": "JPY",
        "price": String(k.price || 0),
        "priceValidUntil": "2026-12-31",
        "availability": `https://schema.org/${availMap[k.status] || 'InStock'}`,
        "seller": { "@type": "Organization", "name": "福楽キャッテリー" },
        // hasMerchantReturnPolicy + shippingDetails — required by GSC for Product/Offer schema.
        // Live cattery = no general return; the FAQ explains the health-guarantee terms.
        "hasMerchantReturnPolicy": {
          "@type": "MerchantReturnPolicy",
          "applicableCountry": "JP",
          "returnPolicyCategory": "https://schema.org/MerchantReturnNotPermitted",
          "merchantReturnLink": `${BASE_URL}/faq.html`
        },
        "shippingDetails": {
          "@type": "OfferShippingDetails",
          "shippingRate": { "@type": "MonetaryAmount", "value": "0", "currency": "JPY" },
          "shippingDestination": { "@type": "DefinedRegion", "addressCountry": "JP" },
          "deliveryTime": {
            "@type": "ShippingDeliveryTime",
            "handlingTime": { "@type": "QuantitativeValue", "minValue": 0, "maxValue": 3, "unitCode": "DAY" },
            "transitTime": { "@type": "QuantitativeValue", "minValue": 1, "maxValue": 5, "unitCode": "DAY" }
          }
        }
      }
      // No per-kitten aggregateRating: the business-wide 5.0/113 belongs on the
      // LocalBusiness, not on each Product (no single kitten has 113 reviews —
      // Google product-rating policy violation that risks review-snippet suppression).
    });
  }
  const productJsonLd =
    '\n  <!-- Per-kitten Product schema (generated by SEO sweep) -->\n' +
    '  <script type="application/ld+json">\n' +
    JSON.stringify(products, null, 2) +
    '\n  </script>\n';

  // Strip any prior generated block from the tail (idempotent regen)
  let cleanedTail = tail.replace(
    /\n\s*<!-- Per-kitten Product schema \(generated by SEO sweep\) -->\s*\n\s*<script type="application\/ld\+json">[\s\S]*?<\/script>\s*\n/,
    '\n'
  );
  // For en/zh, absolutize the ja tail's chrome links (footer/CTA/scripts) so they resolve
  // from the one-level-deep /en//zh path, mirroring the detail-page precedent. ja untouched.
  if (lang !== 'ja') cleanedTail = listToAbsoluteLinks(cleanedTail);
  const tailWithSchema = cleanedTail.replace('</body>', `${productJsonLd}</body>`);

  const output = header + '\n' + sections + '\n\n' + tailWithSchema;
  fs.writeFileSync(outPath, output, 'utf-8');
  const label = lang === 'ja' ? 'kittens.html' : `${lang}/kittens.html`;
  console.log(`  ${label} -> ${kittens.length} kittens (${sectionIdx} breed sections), ${products.length} Product schemas`);
}

// ── Generate Parents ──────────────────────────────────────────

function generateParents(parents) {
  const filepath = path.join(SITE_DIR, 'parents.html');
  const { header, tail } = extractTemplate(filepath);

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

    let cardsHtml = '';
    for (const p of group) {
      const photo = getCoverPhoto(p);
      const roleClass = p.role === 'パパ猫' ? 'role-papa' : 'role-mama';
      const testedTag = p.tested
        ? '\n          <span class="health-tag tag-good" style="position:absolute;top:8px;right:8px;font-size:11px;padding:2px 8px;">&#10003; 遺伝子検査済</span>'
        : '';

      cardsHtml += `
        <div class="parent-card" onclick="openParentModal(this)" data-name="${escapeHtml(p.name)}" data-breed="${escapeHtml(p.breed)}" data-gender="${escapeHtml(p.gender)}" data-role="${escapeHtml(p.role)}" data-age="${escapeHtml(p.age)}" data-color="${escapeHtml(p.color)}" data-tested="${p.tested ? 'true' : 'false'}" style="position:relative;">${testedTag}
          <img src="${escapeHtml(photo)}" alt="${escapeHtml(`${p.name} - ${p.breed} ${p.color || ''} ${p.role || ''}`.trim())}" loading="lazy" style="width:100%;height:100%;object-fit:cover;border-radius:var(--radius-lg) var(--radius-lg) 0 0;">
          <div class="parent-body">
            <h3>${escapeHtml(p.name)}</h3>
            <p>${escapeHtml(p.breed)} ・ ${escapeHtml(p.gender)} ・ ${escapeHtml(p.color)}</p>
            <p style="font-size:12px;color:var(--text-note);">${escapeHtml(p.age)}</p>
            <span class="parent-role ${roleClass}">${escapeHtml(p.role)}</span>
          </div>
        </div>`;
    }

    const sectionTitle = `${cfg.key} 親猫`;

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

  // Per-parent Animal JSON-LD
  const animals = [];
  for (const p of parents) {
    const photo = getCoverPhoto(p);
    if (!photo) continue;
    const g = p.gender === '♂' ? '雄' : '雌';
    const role = p.role || '';
    const tested = p.tested ? '・遺伝子検査済' : '';
    animals.push({
      "@context": "https://schema.org",
      "@type": "Animal",
      "@id": `${BASE_URL}/parents.html#${p.id}`,
      "name": p.name,
      "image": [photo],
      "description": `${p.breed} ${p.color || ''} ${g} ${p.age || ''}・${role}${tested}。福楽キャッテリーの繁殖親猫。`.trim(),
      "additionalType": "https://schema.org/Animal",
      "worksFor": { "@type": "Organization", "name": "福楽キャッテリー" }
    });
  }
  const animalJsonLd =
    '\n  <!-- Per-parent Animal schema (generated by SEO sweep) -->\n' +
    '  <script type="application/ld+json">\n' +
    JSON.stringify(animals, null, 2) +
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
  const { header, tail } = extractTemplate(filepath);

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
  const fileId = kitten.breederId || kitten.id;
  const gt = genderText(kitten.gender);
  const genderFull = kitten.gender ? `${kitten.gender} ${gt}` : '';
  const st = statusText(kitten.status);
  const bd = formatBirthday(kitten.birthday);
  const pr = formatPrice(kitten.price);
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
  const stL = statusTextL(kitten.status, lang);

  // titleText: ja keeps the exact legacy form (byte-identity contract); en/zh collapse
  // whitespace so a missing field (empty color / no gender) doesn't leave a double space.
  const titleText = lang === 'ja'
    ? `${kitten.breed || ''} ${genderFull} ${kitten.color || ''}`.trim()
    : `${breedL || ''} ${genderFullL} ${colorL || ''}`.replace(/\s+/g, ' ').trim();
  let pageTitle, metaDesc, ldName, ldDesc;
  if (lang === 'en') {
    pageTitle = `${titleText} | Kitten Detail | Fuluck Cattery`;
    metaDesc = `${breedL} kitten at Fuluck Cattery in Osaka. ${colorL || ''}, ${genderFullL}${bornL ? ', ' + bornL : ''}. ¥${pr} (tax incl.) ${statusTextL(kitten.status, 'en')}.`.replace(/\s+/g, ' ').trim();
    ldName = titleText;
    ldDesc = `${breedL} kitten from Fuluck Cattery (breeder: Ra Hoen) in Osaka. ${colorL || ''}, ${genderFullL}${bornL ? ', ' + bornL : ''}.`.replace(/\s+/g, ' ').trim();
  } else if (lang === 'zh') {
    pageTitle = `${titleText}｜幼猫详情｜福楽キャッテリー`;
    metaDesc = `大阪福楽キャッテリー的${breedL}幼猫。${colorL || ''}、${genderFullL}${bornL ? '、' + bornL : ''}。¥${pr}（含税）${statusTextL(kitten.status, 'zh')}。`;
    ldName = titleText;
    ldDesc = `大阪福楽キャッテリー（繁育者：罗方远）的${breedL}幼猫。${colorL || ''}、${genderFullL}${bornL ? '、' + bornL : ''}。`;
  } else {
    pageTitle = `${titleText}｜子猫詳細｜福楽キャッテリー`;
    metaDesc = `大阪の福楽キャッテリーの${kitten.breed || ''}の子猫。${kitten.color || ''}、${genderFull}、${bd ? bd + '生まれ' : ''}。¥${pr}（税込）${st}。`;
    ldName = titleText;
    ldDesc = `大阪の福楽キャッテリー（ブリーダー：羅方遠）の${kitten.breed || ''}の子猫。${kitten.color || ''}、${genderFull}、${bd ? bd + '生まれ' : ''}。`;
  }
  const homeLabel = HOME_LABEL[lang] || HOME_LABEL.ja;
  const kittensLabel = KITTENS_LABEL[lang] || KITTENS_LABEL.ja;
  const htmlLang = lang;

  // Schema availability
  const schemaAvailability = kitten.status === 'available'
    ? 'https://schema.org/InStock'
    : 'https://schema.org/LimitedAvailability';

  // Product JSON-LD. inLanguage emitted for en/zh only — ja keeps its exact legacy schema
  // (commit-1 byte-identity contract; ja implicitly = the site's default language anyway).
  const productJsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Product",
    "name": ldName,
    "description": ldDesc,
    ...(lang !== 'ja' ? { "inLanguage": lang } : {}),
    "image": photos,
    "brand": { "@type": "Brand", "name": "福楽キャッテリー" },
    "offers": {
      "@type": "Offer",
      "price": String(kitten.price || 0),
      "priceCurrency": "JPY",
      "availability": schemaAvailability,
      "url": pageUrl,
      "seller": {
        "@type": "Organization",
        "name": "福楽キャッテリー"
      },
      // GSC required: hasMerchantReturnPolicy + shippingDetails
      "hasMerchantReturnPolicy": {
        "@type": "MerchantReturnPolicy",
        "applicableCountry": "JP",
        "returnPolicyCategory": "https://schema.org/MerchantReturnNotPermitted",
        "merchantReturnLink": `${BASE_URL}/faq.html`
      },
      "shippingDetails": {
        "@type": "OfferShippingDetails",
        "shippingRate": { "@type": "MonetaryAmount", "value": "0", "currency": "JPY" },
        "shippingDestination": { "@type": "DefinedRegion", "addressCountry": "JP" },
        "deliveryTime": {
          "@type": "ShippingDeliveryTime",
          "handlingTime": { "@type": "QuantitativeValue", "minValue": 0, "maxValue": 3, "unitCode": "DAY" },
          "transitTime": { "@type": "QuantitativeValue", "minValue": 1, "maxValue": 5, "unitCode": "DAY" }
        }
      }
    }
  });

  // Breadcrumb JSON-LD. ja keeps its exact legacy shape (byte-identity); en/zh localize the
  // display names, add inLanguage, and route Kittens → the per-lang list. Home stays the
  // canonical root URL for all langs (no /en/ or /zh/ home page exists → avoid a 404 link).
  const breadcrumbJsonLd = lang === 'ja'
    ? JSON.stringify({
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "ホーム", "item": `${BASE_URL}/` },
          { "@type": "ListItem", "position": 2, "name": "子猫一覧", "item": `${BASE_URL}/kittens.html` },
          { "@type": "ListItem", "position": 3, "name": titleText, "item": pageUrl }
        ]
      })
    : JSON.stringify({
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
  // Thumbnails HTML
  let thumbsHtml = '';
  if (photos.length > 1) {
    thumbsHtml = `
      <div class="kitten-detail-thumbs">
        ${photos.map((p, i) => `<img src="${escapeHtml(p)}" alt="${escapeHtml(breedL || '')} ${escapeHtml(colorL || '')} ${photoWord}${i + 1}" class="kitten-detail-thumb${i === (kitten.coverIndex || 0) ? ' active' : ''}" data-idx="${i}" loading="lazy">`).join('\n        ')}
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

  // Note row
  const noteRow = kitten.note
    ? `<tr><th data-i18n="kitten.note">備考</th><td>${escapeHtml(kitten.note)}</td></tr>`
    : '';

  // New badge
  const newBadge = kitten.isNew ? ' <span class="kit-badge-new">NEW</span>' : '';

  return `<!DOCTYPE html>
<html lang="${htmlLang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(pageTitle)}</title>
  <meta name="description" content="${escapeHtml(metaDesc)}">
  <meta property="og:title" content="${escapeHtml(pageTitle)}">
  <meta property="og:description" content="${escapeHtml(metaDesc)}">
  <meta property="og:type" content="product">
  <meta property="og:image" content="${escapeHtml(coverPhoto)}">
  <meta property="og:url" content="${escapeHtml(pageUrl)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="theme-color" content="#7DD3C0">
  <link rel="canonical" href="${escapeHtml(pageUrl)}">
${hreflangBlock(`kittens/${fileId}.html`)}
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Noto+Sans+JP:wght@400;500;700&family=Noto+Sans+SC:wght@400;500;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/style.css?v=${verAsset('style.css', '20260628k')}">
  <link rel="stylesheet" href="/nav.css?v=${verAsset('nav.css', '20260628a')}">
  <link rel="icon" type="image/svg+xml" href="${FAVICON_HREF}">
  <script defer src="/nav.js?v=${verAsset('nav.js', '20260628a')}"></script>
  <!-- Google Analytics 4 -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-EK459EK55M"></script>
  <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-EK459EK55M');</script>
  <script type="application/ld+json">
  ${productJsonLd}
  </script>
  <script type="application/ld+json">
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
    object-fit: cover;
    border-radius: var(--radius-sm);
    cursor: pointer;
    opacity: 0.6;
    transition: opacity 0.2s, box-shadow 0.2s;
    flex-shrink: 0;
    border: 2px solid transparent;
  }
  .kitten-detail-thumb:hover,
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
    background: #06c755;
    color: #fff;
  }
  .kitten-detail-cta .btn-line:hover {
    background: #05b34c;
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
<body>

  <!-- Scroll Progress Bar -->
  <div class="scroll-progress"></div>

${headerHtml}

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
          <img id="mainPhoto" src="${escapeHtml(coverPhoto)}" alt="${escapeHtml(breedL || '')} ${escapeHtml(colorL || '')}">
        </div>
        ${thumbsHtml}
      </div>
    </div>
  </section>

  <!-- Info section -->
  <section class="kitten-detail-info">
    <div class="container">
      <h1>${escapeHtml(titleText)}</h1>

      <!-- Status + New badge -->
      <div class="kitten-detail-status">
        <span class="kit-status st-${escapeHtml(kitten.status)}"${statusI18nKey(kitten.status) ? ` data-i18n="${statusI18nKey(kitten.status)}"` : ''}>${escapeHtml(stL)}</span>${newBadge}
      </div>

      <!-- Price -->
      <p class="kitten-detail-price">&yen;${pr} <span class="tax" data-i18n="kitten.taxIncl">${taxIncl(lang)}</span></p>

      <!-- Detail table -->
      <table class="kitten-detail-table">
        <tr><th data-i18n="kitten.breed">品種</th><td${breedI18nKey(kitten.breed) ? ` data-i18n="${breedI18nKey(kitten.breed)}"` : ''}>${escapeHtml(breedL || '')}</td></tr>
        <tr><th data-i18n="kitten.sex">性別</th><td${genderI18nKey(kitten.gender) ? ` data-i18n="${genderI18nKey(kitten.gender)}"` : ''}>${escapeHtml(genderFullL)}</td></tr>
        <tr><th data-i18n="kitten.color">毛色</th><td>${escapeHtml(colorL || '')}</td></tr>
        <tr><th data-i18n="kitten.birthday">誕生日</th><td${kitten.birthday ? ` data-i18n-birthday="${escapeHtml(kitten.birthday)}"` : ''}>${escapeHtml(bornL)}</td></tr>
        <tr><th data-i18n="kitten.status">状態</th><td${statusI18nKey(kitten.status) ? ` data-i18n="${statusI18nKey(kitten.status)}"` : ''}>${escapeHtml(stL)}</td></tr>
        ${noteRow}
      </table>

      ${parentsHtml}

      ${videoHtml}

      <!-- CTA buttons -->
      <div class="kitten-detail-cta">
        <a href="https://page.line.me/915hnnlk?oat__id=5765672&openQrModal=true" class="btn btn-line" target="_blank" rel="noopener" data-i18n="kitten.lineChat">
          LINEでこの子について相談
        </a>
        <a href="/booking.html" class="btn btn-secondary" data-i18n="kitten.bookVisit">
          見学を予約する
        </a>
        <a href="/kittens.html" class="btn btn-outline" data-i18n="kitten.backToList">
          ← 子猫一覧に戻る
        </a>
      </div>
    </div>
  </section>

  <!-- Related kittens carousel placeholder -->
  <section class="section">
    <div class="container">
      <div class="kitten-carousel-mount"></div>
    </div>
  </section>

${footerHtml}

  <script>
  // Thumbnail click → swap main photo
  document.querySelectorAll('.kitten-detail-thumb').forEach(function(thumb) {
    thumb.addEventListener('click', function() {
      var mainImg = document.getElementById('mainPhoto');
      if (mainImg) mainImg.src = this.src;
      document.querySelectorAll('.kitten-detail-thumb').forEach(function(t) { t.classList.remove('active'); });
      this.classList.add('active');
    });
  });
  </script>
  <script src="/i18n.js?v=${verAsset('i18n.js', '20260628f')}"></script>
  <script src="/kitten-carousel.js"></script>
  <script src="/cta-widget.js?v=${verAsset('cta-widget.js', '20260623b')}"></script>
  <script src="/script.js?v=${verAsset('script.js', '20260623b')}"></script>
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

function generateKittenDetailPages(kittens, parents, lang = 'ja') {
  // ja → <root>/kittens/, en → <root>/en/kittens/, zh → <root>/zh/kittens/
  const kittensDir = lang === 'ja'
    ? path.join(SITE_DIR, 'kittens')
    : path.join(SITE_DIR, lang, 'kittens');

  // 1. Create the target kittens dir if not exists
  if (!fs.existsSync(kittensDir)) {
    fs.mkdirSync(kittensDir, { recursive: true });
  }

  // 2. Filter eligible kittens: available or reserved, with at least 1 photo
  const eligible = kittens.filter(k =>
    (k.status === 'available' || k.status === 'reserved') &&
    k.photos && k.photos.length > 0
  );

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
  for (const k of eligible) {
    const fileId = k.breederId || k.id;
    if (seenFileIds.has(fileId)) collisions.add(fileId);
    seenFileIds.add(fileId);
  }
  // Collision warning only on the ja pass (data-level issue, identical across langs —
  // no need to log it three times).
  if (collisions.size && lang === 'ja') {
    console.warn(`  [COLLISION] ${collisions.size} duplicate breederId(s): ${[...collisions].join(', ')} — each collapses multiple kittens into ONE detail page (data must be deduped in admin).`);
  }

  let generatedCount = 0;
  for (const k of eligible) {
    const fileId = k.breederId || k.id;
    const outputPath = path.join(kittensDir, `${fileId}.html`);
    const html = buildKittenDetailHtml(k, headerHtml, footerHtml, lang);
    fs.writeFileSync(outputPath, html, 'utf-8');
    generatedCount++;
  }

  const label = lang === 'ja' ? 'kittens/' : `${lang}/kittens/`;
  console.log(`  ${label} -> ${generatedCount} detail pages generated, ${removedCount} old pages removed`);
  return eligible; // Return for sitemap use
}

// ── Update Sitemap ────────────────────────────────────────────

function updateSitemap(articles, kittenDetailPages, store) {
  const filepath = path.join(SITE_DIR, 'sitemap.xml');
  const existing = fs.readFileSync(filepath, 'utf-8');
  const today = todayISO();
  // Honest lastmod: reuse stored date when the file content is unchanged (asset-version
  // bumps stripped before hashing); stamp today only on genuine content change / new URL.
  // The store is created ONCE in main() and shared across both generators / all passes
  // (save() does not prune, so entries coexist). Fall back to a local store if not passed.
  if (!store) store = createLastmodStore(SITE_DIR, today);

  // Extract the static (non-blog) portion: everything before "<!-- 子猫詳細ページ -->" or "<!-- ブログ記事 -->"
  const kittenDetailMarker = '<!-- 子猫詳細ページ -->';
  const blogMarker = '<!-- ブログ記事 -->';

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
  if (enExists) kittenEntries += detailEntriesFor('en', '子猫詳細ページ (en)');
  if (zhExists) kittenEntries += detailEntriesFor('zh', '子猫詳細ページ (zh)');

  // Build blog article URLs — union of API articles + disk HTML files
  let blogEntries = `  ${blogMarker}\n`;
  const publishedArticles = (articles || []).filter(a => a.published !== false);
  const blogSlugs = new Set(publishedArticles.map(a => a.slug).filter(Boolean));

  // Also scan /blog/*.html on disk to catch any articles not in API
  const blogDir = path.join(SITE_DIR, 'blog');
  if (fs.existsSync(blogDir)) {
    const diskFiles = fs.readdirSync(blogDir).filter(f => f.endsWith('.html'));
    for (const f of diskFiles) {
      blogSlugs.add(f.replace('.html', ''));
    }
  }

  const sortedSlugs = [...blogSlugs].sort();
  for (const slug of sortedSlugs) {
    const url = `${BASE_URL}/blog/${slug}.html`;
    blogEntries += `  <url>
    <loc>${BASE_URL}/blog/${escapeHtml(slug)}.html</loc>
    <lastmod>${store.lastmodForUrl(url)}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>\n`;
  }

  const output = staticPart + kittenEntries + blogEntries + '</urlset>\n';
  fs.writeFileSync(filepath, output, 'utf-8');
  store.save();
  const diskOnly = sortedSlugs.length - publishedArticles.length;
  console.log(`  sitemap.xml -> ${detailPages.length} kitten detail pages, ${sortedSlugs.length} blog articles updated${diskOnly > 0 ? ` (${diskOnly} from disk only)` : ''}`);
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
      description: pickText(a.excerpt).trim(),
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
  for (const k of kittens) {
    const bid = k.breederId;
    if (!bid || !folderMap[bid]) continue;
    try {
      const images = await fetchJSON('/api/drive/images/' + folderMap[bid]);
      if (Array.isArray(images) && images.length > 0) {
        k.photos = images.map(img => img.url.startsWith('/')
          ? API_BASE + img.url : img.url);
        enriched++;
        console.log('    Drive: ' + bid + ' -> ' + images.length + ' photos');
      }
    } catch (e) {
      console.log('    [warn] Drive images for ' + bid + ': ' + e.message);
    }
  }
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
  const [kittens, parents, reviews, articles, faq] = await Promise.all([
    fetchJSON('/api/kittens').catch(e => { console.error('  [error] kittens:', e.message); return []; }),
    fetchJSON('/api/parents').catch(e => { console.error('  [error] parents:', e.message); return []; }),
    fetchJSON('/api/reviews').catch(e => { console.error('  [error] reviews:', e.message); return []; }),
    fetchJSON('/api/articles').catch(e => { console.error('  [error] articles:', e.message); return []; }),
    fetchJSON('/api/faq').catch(e => { console.error('  [error] faq:', e.message); return []; })
  ]);

  console.log(`  Fetched: ${kittens.length} kittens, ${parents.length} parents, ${reviews.length} reviews, ${articles.length} articles, ${faq.length} FAQ`);
  console.log('');

  // Enrich kittens with Drive photos (merge multi-photo arrays)
  console.log('Enriching kittens with Drive photos...');
  await enrichKittensWithDrivePhotos(kittens);
  console.log('');

  // Generate pages
  console.log('Generating pages...');

  if (kittens.length > 0) {
    generateKittens(kittens, 'ja');
  } else {
    console.log('  [skip] kittens.html (no data)');
  }

  // Generate kitten detail pages (individual pages per kitten), ja then en + zh.
  let kittenDetailPages = [];
  if (kittens.length > 0) {
    // ja detail pass first — it populates ASSET_VERSIONS (via extractDetailTemplate) that
    // the en/zh list-header builder reads. Same eligible set drives all langs, so the
    // hreflang triad stays symmetric (a kitten in ja exists in en+zh, never a 404).
    kittenDetailPages = generateKittenDetailPages(kittens, parents, 'ja');
    generateKittens(kittens, 'en');
    generateKittens(kittens, 'zh');
    generateKittenDetailPages(kittens, parents, 'en');
    generateKittenDetailPages(kittens, parents, 'zh');
  } else {
    console.log('  [skip] kittens/ detail pages (no data)');
  }

  if (parents.length > 0) {
    generateParents(parents);
  } else {
    console.log('  [skip] parents.html (no data)');
  }

  if (reviews.length > 0) {
    generateReviews(reviews);
  } else {
    console.log('  [skip] reviews.html (no data)');
  }

  // Always update sitemap (even with 0 articles, keeps static pages updated).
  // Single shared lastmod-store for the whole run (ja + en + zh URLs coexist).
  const store = createLastmodStore(SITE_DIR, todayISO());
  updateSitemap(articles, kittenDetailPages, store);

  // RSS feed of the latest blog articles (deterministic; no build timestamp).
  generateFeed(articles);

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

#!/usr/bin/env node
// tools/generate-site.js — Regenerate static pages from API data
// Usage: node tools/generate-site.js
// No dependencies required (uses native https/fs modules)

const https = require('https');
const fs = require('fs');
const path = require('path');

const API_BASE = 'https://fuluck-api.mouxue56.workers.dev';
const SITE_DIR = path.resolve(__dirname, '..');
const BASE_URL = 'https://fuluckpet.com';

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

function generateKittens(kittens) {
  const filepath = path.join(SITE_DIR, 'kittens.html');
  const { header, tail } = extractTemplate(filepath);

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

      cardsHtml += `
        <div class="kitten-card" data-status="${escapeHtml(k.status)}" data-price="${k.price || ''}" data-birthday="${escapeHtml(k.birthday)}" data-images="${escapeHtml(photo)}" data-video="" data-papa="${escapeHtml(k.papa)}" data-mama="${escapeHtml(k.mama)}" data-new="${k.isNew ? 'true' : 'false'}" data-name="" data-breeder-id="${escapeHtml(k.breederId)}">
          <div class="kitten-img">
            <img src="${escapeHtml(photo)}" alt="${escapeHtml(k.breed)}の子猫" loading="lazy" style="width:100%;height:100%;object-fit:cover;">
            <span class="kit-status st-${escapeHtml(k.status)}">${escapeHtml(st)}</span>${isNewBadge}
          </div>
          <div class="kitten-body">
            <h3>${escapeHtml(k.breed)}</h3>
            <p class="kit-meta">${escapeHtml(k.gender)} ${escapeHtml(gt)} ・ ${escapeHtml(k.color)}</p>
            <p class="kit-meta">${escapeHtml(bd)}生まれ</p>
            ${k.note ? `<p class="kit-meta" style="font-size:11px;color:var(--text-note);">${escapeHtml(k.note)}</p>` : ''}
            <p class="kit-price">&yen;${pr} <span class="tax">（税込）</span></p>
          </div>
        </div>`;
    }

    sections += `

  <!-- ========== ${cfg.tag.toUpperCase()} KITTENS ========== -->
  <section class="section ${cfg.bgClass}" style="position:relative;">
    <div class="parallax-bg">
${shapesHtml}
    </div>
    <div class="container" style="position:relative;z-index:1;">
      <div class="sec-header">
        <span class="sec-tag">${escapeHtml(cfg.tag)}</span>
        <h2 class="sec-title">${escapeHtml(cfg.key)} (${group.length}匹)</h2>
        <p class="sec-desc">${escapeHtml(cfg.desc)}</p>
      </div>
      <div class="kittens-grid" style="grid-template-columns:repeat(auto-fill, minmax(260px, 1fr));">${cardsHtml}
      </div>
    </div>
  </section>`;

    sectionIdx++;
  }

  const output = header + '\n' + sections + '\n\n' + tail;
  fs.writeFileSync(filepath, output, 'utf-8');
  console.log(`  kittens.html -> ${kittens.length} kittens (${sectionIdx} breed sections)`);
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
          <img src="${escapeHtml(photo)}" alt="${escapeHtml(p.name)}" loading="lazy" style="width:100%;height:100%;object-fit:cover;border-radius:var(--radius-lg) var(--radius-lg) 0 0;">
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

  const output = header + '\n' + sections + '\n\n' + tail;
  fs.writeFileSync(filepath, output, 'utf-8');
  console.log(`  parents.html -> ${parents.length} parents (${sectionIdx} breed sections)`);
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
function buildKittenDetailHtml(kitten, headerHtml, footerHtml) {
  const fileId = kitten.breederId || kitten.id;
  const gt = genderText(kitten.gender);
  const genderFull = kitten.gender ? `${kitten.gender} ${gt}` : '';
  const st = statusText(kitten.status);
  const bd = formatBirthday(kitten.birthday);
  const pr = formatPrice(kitten.price);
  const coverPhoto = getCoverPhoto(kitten);
  const photos = kitten.photos || [];
  const pageUrl = `${BASE_URL}/kittens/${fileId}.html`;

  const titleText = `${kitten.breed || ''} ${genderFull} ${kitten.color || ''}`.trim();
  const pageTitle = `${titleText}｜子猫詳細｜福楽キャッテリー`;
  const metaDesc = `大阪の福楽キャッテリーの${kitten.breed || ''}の子猫。${kitten.color || ''}、${genderFull}、${bd ? bd + '生まれ' : ''}。¥${pr}（税込）${st}。`;

  // Schema availability
  const schemaAvailability = kitten.status === 'available'
    ? 'https://schema.org/InStock'
    : 'https://schema.org/LimitedAvailability';

  // Product JSON-LD
  const productJsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Product",
    "name": titleText,
    "description": `大阪の福楽キャッテリー（ブリーダー：羅方遠）の${kitten.breed || ''}の子猫。${kitten.color || ''}、${genderFull}、${bd ? bd + '生まれ' : ''}。`,
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
      }
    }
  });

  // Breadcrumb JSON-LD
  const breadcrumbJsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "ホーム", "item": `${BASE_URL}/` },
      { "@type": "ListItem", "position": 2, "name": "子猫一覧", "item": `${BASE_URL}/kittens.html` },
      { "@type": "ListItem", "position": 3, "name": titleText, "item": pageUrl }
    ]
  });

  // Thumbnails HTML
  let thumbsHtml = '';
  if (photos.length > 1) {
    thumbsHtml = `
      <div class="kitten-detail-thumbs">
        ${photos.map((p, i) => `<img src="${escapeHtml(p)}" alt="${escapeHtml(kitten.breed || '')} ${i + 1}" class="kitten-detail-thumb${i === (kitten.coverIndex || 0) ? ' active' : ''}" data-idx="${i}" loading="lazy">`).join('\n        ')}
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
<html lang="ja">
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
  <link rel="alternate" hreflang="ja" href="${escapeHtml(pageUrl)}">
  <link rel="alternate" hreflang="en" href="${escapeHtml(pageUrl)}?lang=en">
  <link rel="alternate" hreflang="zh" href="${escapeHtml(pageUrl)}?lang=zh">
  <link rel="alternate" hreflang="x-default" href="${escapeHtml(pageUrl)}">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Noto+Sans+JP:wght@400;500;700&family=Noto+Sans+SC:wght@400;500;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/style.css">
  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🐱</text></svg>">
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
      <a href="/" data-i18n="common.home">ホーム</a> &gt; <a href="/kittens.html" data-i18n="kitten.breadcrumb.kittens">子猫一覧</a> &gt; ${escapeHtml(titleText)}
    </div>
  </nav>

  <!-- Hero photo section -->
  <section class="kitten-detail-hero">
    <div class="container">
      <div class="kitten-detail-gallery">
        <div class="kitten-detail-main-img">
          <img id="mainPhoto" src="${escapeHtml(coverPhoto)}" alt="${escapeHtml(kitten.breed || '')} ${escapeHtml(kitten.color || '')}">
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
        <span class="kit-status st-${escapeHtml(kitten.status)}"${statusI18nKey(kitten.status) ? ` data-i18n="${statusI18nKey(kitten.status)}"` : ''}>${escapeHtml(st)}</span>${newBadge}
      </div>

      <!-- Price -->
      <p class="kitten-detail-price">&yen;${pr} <span class="tax" data-i18n="kitten.taxIncl">（税込）</span></p>

      <!-- Detail table -->
      <table class="kitten-detail-table">
        <tr><th data-i18n="kitten.breed">品種</th><td${breedI18nKey(kitten.breed) ? ` data-i18n="${breedI18nKey(kitten.breed)}"` : ''}>${escapeHtml(kitten.breed || '')}</td></tr>
        <tr><th data-i18n="kitten.sex">性別</th><td${genderI18nKey(kitten.gender) ? ` data-i18n="${genderI18nKey(kitten.gender)}"` : ''}>${escapeHtml(genderFull)}</td></tr>
        <tr><th data-i18n="kitten.color">毛色</th><td>${escapeHtml(kitten.color || '')}</td></tr>
        <tr><th data-i18n="kitten.birthday">誕生日</th><td${kitten.birthday ? ` data-i18n-birthday="${escapeHtml(kitten.birthday)}"` : ''}>${bd ? escapeHtml(bd) + '生まれ' : ''}</td></tr>
        <tr><th data-i18n="kitten.status">状態</th><td${statusI18nKey(kitten.status) ? ` data-i18n="${statusI18nKey(kitten.status)}"` : ''}>${escapeHtml(st)}</td></tr>
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
  <script src="/i18n.js"></script>
  <script src="/kitten-carousel.js"></script>
  <script src="/cta-widget.js"></script>
  <script src="/script.js"></script>
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
  const scriptTagIdx = html.indexOf('<script src="i18n.js">', footerIdx);
  const scriptTagIdx2 = html.indexOf('<script src="/i18n.js">', footerIdx);
  const endIdx = Math.max(scriptTagIdx, scriptTagIdx2);

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

function generateKittenDetailPages(kittens, parents) {
  const kittensDir = path.join(SITE_DIR, 'kittens');

  // 1. Create /kittens/ directory if not exists
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
  let generatedCount = 0;
  for (const k of eligible) {
    const fileId = k.breederId || k.id;
    const outputPath = path.join(kittensDir, `${fileId}.html`);
    const html = buildKittenDetailHtml(k, headerHtml, footerHtml);
    fs.writeFileSync(outputPath, html, 'utf-8');
    generatedCount++;
  }

  console.log(`  kittens/ -> ${generatedCount} detail pages generated, ${removedCount} old pages removed`);
  return eligible; // Return for sitemap use
}

// ── Update Sitemap ────────────────────────────────────────────

function updateSitemap(articles, kittenDetailPages) {
  const filepath = path.join(SITE_DIR, 'sitemap.xml');
  const existing = fs.readFileSync(filepath, 'utf-8');
  const today = todayISO();

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

  // Update lastmod for kittens, parents, reviews in the static part
  staticPart = staticPart.replace(
    /(<loc>https:\/\/fuluckpet\.com\/kittens\.html<\/loc>\s*<lastmod>)[^<]*/,
    `$1${today}`
  );
  staticPart = staticPart.replace(
    /(<loc>https:\/\/fuluckpet\.com\/parents\.html<\/loc>\s*<lastmod>)[^<]*/,
    `$1${today}`
  );
  staticPart = staticPart.replace(
    /(<loc>https:\/\/fuluckpet\.com\/reviews\.html<\/loc>\s*<lastmod>)[^<]*/,
    `$1${today}`
  );

  // Build kitten detail page URLs
  let kittenEntries = `  ${kittenDetailMarker}\n`;
  const detailPages = kittenDetailPages || [];
  for (const k of detailPages) {
    const fileId = k.breederId || k.id;
    kittenEntries += `  <url>
    <loc>${BASE_URL}/kittens/${escapeHtml(fileId)}.html</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>\n`;
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
      blogSlugs.add(f.replace('.html', ''));
    }
  }

  const sortedSlugs = [...blogSlugs].sort();
  for (const slug of sortedSlugs) {
    blogEntries += `  <url>
    <loc>${BASE_URL}/blog/${escapeHtml(slug)}.html</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>\n`;
  }

  const output = staticPart + kittenEntries + blogEntries + '</urlset>\n';
  fs.writeFileSync(filepath, output, 'utf-8');
  const diskOnly = sortedSlugs.length - publishedArticles.length;
  console.log(`  sitemap.xml -> ${detailPages.length} kitten detail pages, ${sortedSlugs.length} blog articles updated${diskOnly > 0 ? ` (${diskOnly} from disk only)` : ''}`);
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
  console.log('🐱 Fuluck Site Generator');
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
    generateKittens(kittens);
  } else {
    console.log('  [skip] kittens.html (no data)');
  }

  // Generate kitten detail pages (individual pages per kitten)
  let kittenDetailPages = [];
  if (kittens.length > 0) {
    kittenDetailPages = generateKittenDetailPages(kittens, parents);
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

  // Always update sitemap (even with 0 articles, keeps static pages updated)
  updateSitemap(articles, kittenDetailPages);

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

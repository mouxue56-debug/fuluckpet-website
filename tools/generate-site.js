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

// ── Update Sitemap ────────────────────────────────────────────

function updateSitemap(articles) {
  const filepath = path.join(SITE_DIR, 'sitemap.xml');
  const existing = fs.readFileSync(filepath, 'utf-8');
  const today = todayISO();

  // Extract the static (non-blog) portion: everything before "<!-- ブログ記事 -->"
  const blogMarker = '<!-- ブログ記事 -->';
  let staticPart;
  const markerIdx = existing.indexOf(blogMarker);
  if (markerIdx !== -1) {
    staticPart = existing.substring(0, markerIdx);
  } else {
    // No blog marker found - everything before </urlset>
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

  // Build blog article URLs
  let blogEntries = `  ${blogMarker}\n`;
  const publishedArticles = (articles || []).filter(a => a.published !== false);

  for (const article of publishedArticles) {
    if (!article.slug) continue;
    blogEntries += `  <url>
    <loc>${BASE_URL}/blog/${escapeHtml(article.slug)}.html</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>\n`;
  }

  const output = staticPart + blogEntries + '</urlset>\n';
  fs.writeFileSync(filepath, output, 'utf-8');
  console.log(`  sitemap.xml -> ${publishedArticles.length} blog articles updated`);
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

  // Generate pages
  console.log('Generating pages...');

  if (kittens.length > 0) {
    generateKittens(kittens);
  } else {
    console.log('  [skip] kittens.html (no data)');
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
  updateSitemap(articles);

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

#!/usr/bin/env node
/**
 * scan-blog-articles.js
 * 扫描 /blog/*.html 提取元数据，与 API 对比找出缺失文章，批量导入
 *
 * Usage:
 *   node tools/scan-blog-articles.js          # 扫描并显示差异
 *   node tools/scan-blog-articles.js --import  # 扫描 + 批量导入到 API
 */

const fs = require('fs');
const path = require('path');

const SITE_DIR = path.join(__dirname, '..');
const BLOG_DIR = path.join(SITE_DIR, 'blog');
const API_BASE = 'https://fuluck-api.mouxue56.workers.dev';
const ADMIN_PASS = 'fuluck5632';

// blog.html 中分类 ID → API category 映射
const CATEGORY_MAP = {
  '猫種知識': 'breed',
  '健康管理': 'health',
  '飲食栄養': 'nutrition',
  '日常ケア': 'grooming',
  '行動・しつけ': 'behavior',
  '子猫育て': 'kitten',
  'ブリーダー選び': 'breeder',
  'アレルギー': 'allergy',
  '猫ライフ': 'lifestyle',
  'シニア猫': 'senior'
};

// --- Step 1: Parse blog.html to get slug → category mapping ---
function parseBlogListPage() {
  const html = fs.readFileSync(path.join(SITE_DIR, 'blog.html'), 'utf-8');
  const mapping = {};

  // Find each category heading + its cards
  const catHeadingRe = /<h2 class="blog-cat-heading"[^>]*>([^<]+)<\/h2>/g;
  const cardRe = /<a href="\/blog\/([^"]+)\.html" class="blog-card">/g;

  let currentCat = null;
  let lastCatIdx = 0;

  // Collect all category headings with positions
  const headings = [];
  let m;
  while ((m = catHeadingRe.exec(html)) !== null) {
    headings.push({ name: m[1], idx: m.index });
  }

  // Collect all card hrefs with positions
  const cards = [];
  while ((m = cardRe.exec(html)) !== null) {
    cards.push({ slug: m[1], idx: m.index });
  }

  // Map each card to its nearest preceding heading
  for (const card of cards) {
    let cat = 'lifestyle'; // default
    for (let i = headings.length - 1; i >= 0; i--) {
      if (headings[i].idx < card.idx) {
        cat = CATEGORY_MAP[headings[i].name] || 'lifestyle';
        break;
      }
    }
    mapping[card.slug] = cat;
  }

  return mapping;
}

// --- Step 2: Scan each blog HTML for title + description ---
function scanBlogFiles(slugCategoryMap) {
  const files = fs.readdirSync(BLOG_DIR).filter(f => f.endsWith('.html') && f !== 'blog-i18n.js');
  const articles = [];

  for (const file of files) {
    const slug = file.replace('.html', '');
    const html = fs.readFileSync(path.join(BLOG_DIR, file), 'utf-8');

    // Extract title from <title>
    const titleMatch = html.match(/<title>([^<]+)<\/title>/);
    let title = titleMatch ? titleMatch[1] : slug;
    // Clean up: remove trailing "｜大阪・福楽キャッテリー" etc
    title = title.replace(/[|｜][^|｜]*福楽キャッテリー.*$/, '').trim();

    // Extract description
    const descMatch = html.match(/<meta name="description" content="([^"]+)"/);
    const description = descMatch ? descMatch[1] : '';

    // Category from blog.html mapping, fallback to guessing from keywords
    const category = slugCategoryMap[slug] || guessCategoryFromSlug(slug);

    articles.push({
      slug,
      title: { ja: title, en: '', zh: '' },
      excerpt: { ja: description, en: '', zh: '' },
      content: { ja: '', en: '', zh: '' },
      category,
      coverImage: '',
      tags: [],
      published: true,
      publishedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  }

  return articles;
}

function guessCategoryFromSlug(slug) {
  if (slug.includes('siberian') || slug.includes('british') || slug.includes('ragdoll') || slug.includes('breed')) return 'breed';
  if (slug.includes('senior')) return 'senior';
  if (slug.includes('kitten')) return 'kitten';
  if (slug.includes('allergy')) return 'allergy';
  if (slug.includes('food') || slug.includes('diet') || slug.includes('nutrition') || slug.includes('hydration')) return 'nutrition';
  if (slug.includes('grooming') || slug.includes('nail') || slug.includes('dental') || slug.includes('bath')) return 'grooming';
  if (slug.includes('behavior') || slug.includes('stress') || slug.includes('sleep') || slug.includes('communication')) return 'behavior';
  if (slug.includes('vaccine') || slug.includes('health') || slug.includes('disease') || slug.includes('virus') || slug.includes('parasite')) return 'health';
  if (slug.includes('breeder') || slug.includes('visit')) return 'breeder';
  return 'lifestyle';
}

// --- Step 3: Compare with API and find missing ---
async function fetchAPIArticles() {
  const resp = await fetch(`${API_BASE}/api/articles`);
  if (!resp.ok) throw new Error(`API error: ${resp.status}`);
  return resp.json();
}

async function bulkImportArticles(articles) {
  const resp = await fetch(`${API_BASE}/api/admin/articles/bulk`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ADMIN_PASS}`
    },
    body: JSON.stringify(articles)
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Bulk import failed: ${resp.status} ${text}`);
  }
  return resp.json();
}

// --- Main ---
async function main() {
  const doImport = process.argv.includes('--import');

  console.log('=== Step 1: Parsing blog.html for slug→category mapping ===');
  const slugCategoryMap = parseBlogListPage();
  console.log(`  Found ${Object.keys(slugCategoryMap).length} cards in blog.html`);

  console.log('\n=== Step 2: Scanning blog/*.html files ===');
  const diskArticles = scanBlogFiles(slugCategoryMap);
  console.log(`  Found ${diskArticles.length} HTML files on disk`);

  console.log('\n=== Step 3: Fetching API articles ===');
  const apiArticles = await fetchAPIArticles();
  console.log(`  Found ${apiArticles.length} articles in API`);

  const apiSlugs = new Set(apiArticles.map(a => a.slug));
  const missing = diskArticles.filter(a => !apiSlugs.has(a.slug));
  const diskSlugs = new Set(diskArticles.map(a => a.slug));
  const onlyInAPI = apiArticles.filter(a => !diskSlugs.has(a.slug));

  console.log(`\n=== Results ===`);
  console.log(`  On disk: ${diskArticles.length}`);
  console.log(`  In API:  ${apiArticles.length}`);
  console.log(`  Missing from API: ${missing.length}`);
  if (onlyInAPI.length) console.log(`  Only in API (no HTML): ${onlyInAPI.length} → ${onlyInAPI.map(a=>a.slug).join(', ')}`);

  if (missing.length > 0) {
    console.log(`\n  Missing articles by category:`);
    const byCat = {};
    for (const a of missing) {
      byCat[a.category] = (byCat[a.category] || 0) + 1;
    }
    for (const [cat, count] of Object.entries(byCat).sort((a,b) => b[1]-a[1])) {
      console.log(`    ${cat}: ${count}`);
    }
  }

  if (doImport && missing.length > 0) {
    console.log(`\n=== Step 4: Bulk importing ${missing.length} missing articles ===`);
    // IMPORTANT: bulk API is full replace, so we must include ALL articles (existing + missing)
    // Merge: keep existing API articles (with their translations), add missing ones
    const merged = [...apiArticles];
    let nextId = apiArticles.length + 1;
    for (const article of missing) {
      article.id = `art_${nextId++}`;
      merged.push(article);
    }
    console.log(`  Sending ${merged.length} total articles (${apiArticles.length} existing + ${missing.length} new)`);
    const result = await bulkImportArticles(merged);
    console.log(`  ✅ Bulk import complete:`, result);
  } else if (!doImport && missing.length > 0) {
    console.log(`\n  Run with --import to add missing articles to API`);
  } else {
    console.log('\n  ✅ All articles are already in API!');
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});

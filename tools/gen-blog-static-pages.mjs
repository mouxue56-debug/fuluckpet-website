#!/usr/bin/env node
// Generate static /blog/{slug}.html pages for the 10 new articles in /tmp/blog-articles-batch.json
// Reuses the layout from /blog/cat-allergy-guide.html as a template skeleton.

import fs from 'node:fs';
import path from 'node:path';

const ROOT = '/Users/lauralyu/projects/fuluckpet-website';
const BLOG_DIR = path.join(ROOT, 'blog');
const TEMPLATE_SRC = path.join(BLOG_DIR, 'cat-allergy-guide.html');
const BATCH_FILE = '/tmp/blog-articles-batch.json';
const FAVICON_HREF = "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='8' fill='%235BC4A8'/><g fill='%23ffffff'><ellipse cx='11' cy='12' rx='2.3' ry='2.7'/><ellipse cx='21' cy='12' rx='2.3' ry='2.7'/><ellipse cx='7.5' cy='17.5' rx='2.1' ry='2.4'/><ellipse cx='24.5' cy='17.5' rx='2.1' ry='2.4'/><path d='M16 16.5c3.1 0 5.6 2.2 5.6 4.9 0 2.2-1.9 3.1-5.6 3.1s-5.6-.9-5.6-3.1c0-2.7 2.5-4.9 5.6-4.9z'/></g></svg>";

const CAT_LABEL = {
  allergy: 'アレルギー',
  kitten: '子猫',
  breed: '品種紹介',
  health: '健康・医療',
  breeder: 'ブリーダー',
  nutrition: '食事・栄養',
};

function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function buildPage(art) {
  const title = art.title.ja;
  const desc = art.excerpt.ja;
  const slug = art.slug;
  const url = `https://fuluckpet.com/blog/${slug}.html`;
  const cat = art.category;
  const catLabel = CAT_LABEL[cat] || '記事';
  const cover = art.coverImage || '/images/blog-placeholder.svg';
  const tagsCsv = (art.tags || []).join(',');
  const body = art.content.ja;

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escHtml(title)}｜大阪・福楽キャッテリー</title>
  <meta name="description" content="${escHtml(desc)}">
  <meta name="keywords" content="${escHtml(tagsCsv)}">
  <meta property="og:title" content="${escHtml(title)}｜福楽キャッテリー">
  <meta property="og:description" content="${escHtml(desc)}">
  <meta property="og:type" content="article">
  <meta property="og:url" content="${url}">
  <meta property="og:image" content="https://fuluckpet.com${cover}">
  <meta property="og:site_name" content="サイベリアン｜大阪・福楽キャッテリー">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="theme-color" content="#7DD3C0">
  <link rel="canonical" href="${url}">
  <link rel="alternate" hreflang="ja" href="${url}">
  <link rel="alternate" hreflang="x-default" href="${url}">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Noto+Sans+JP:wght@400;500;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/style.css?v=20260624v2">
  <link rel="stylesheet" href="/guide/guide.css?v=20260624v2">
  <link rel="stylesheet" href="/blog.css?v=20260624v2">
  <link rel="icon" type="image/svg+xml" href="${FAVICON_HREF}">
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-EK459EK55M"></script>
  <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-EK459EK55M');</script>
  <script type="application/ld+json">
  {
    "@context":"https://schema.org",
    "@type":"BlogPosting",
    "headline":${JSON.stringify(title)},
    "description":${JSON.stringify(desc)},
    "image":${JSON.stringify(`https://fuluckpet.com${cover}`)},
    "author":{"@type":"Organization","name":"福楽キャッテリー","url":"https://fuluckpet.com"},
    "publisher":{"@type":"Organization","name":"サイベリアン｜大阪・福楽キャッテリー","logo":{"@type":"ImageObject","url":"https://fuluckpet.com/images/ogp.jpg"}},
    "datePublished":${JSON.stringify(art.publishedAt || art.createdAt)},
    "dateModified":${JSON.stringify(art.updatedAt || art.publishedAt)},
    "mainEntityOfPage":{"@type":"WebPage","@id":${JSON.stringify(url)}}
  }
  </script>
  <script type="application/ld+json">
  { "@context":"https://schema.org", "@type":"BreadcrumbList", "itemListElement":[
    {"@type":"ListItem","position":1,"name":"ホーム","item":"https://fuluckpet.com/"},
    {"@type":"ListItem","position":2,"name":"知識ライブラリ","item":"https://fuluckpet.com/blog.html"},
    {"@type":"ListItem","position":3,"name":${JSON.stringify(title)},"item":${JSON.stringify(url)}}
  ]}
  </script>
  <style>
    .blog-article { max-width:800px; margin:0 auto; padding:32px 24px 60px; }
    .blog-article h1 { font-size:1.8rem; line-height:1.4; margin-bottom:16px; color:var(--text-heading); }
    .blog-article h2 { font-size:1.35rem; margin:40px 0 16px; padding-bottom:8px; border-bottom:2px solid var(--mint); color:var(--text-heading); }
    .blog-article h3 { font-size:1.1rem; margin:28px 0 12px; color:var(--mint-dark); }
    .blog-article p { line-height:1.9; margin-bottom:16px; color:var(--text-body); }
    .blog-article ul, .blog-article ol { margin:12px 0 20px 24px; line-height:1.8; }
    .blog-article li { margin-bottom:6px; }
    .blog-back { display:inline-block; margin-bottom:20px; color:var(--mint-dark); text-decoration:none; font-size:0.9rem; }
    .blog-back:hover { text-decoration:underline; }
    .blog-meta { display:flex; gap:12px; align-items:center; margin-bottom:24px; font-size:0.85rem; color:var(--text-note); }
    .blog-meta-cat { background:var(--mint-bg); color:var(--mint-dark); padding:3px 10px; border-radius:20px; font-weight:500; }
    .blog-cta-box { background: linear-gradient(135deg, #f0faf7 0%, #fef6f0 100%); border-radius:16px; padding:32px 28px; margin:40px 0; text-align:center; border:1px solid #e8f5f0; }
    .blog-cta-icon { font-size:2.5rem; margin-bottom:12px; }
    .blog-cta-title { font-size:1.15rem; font-weight:700; margin-bottom:8px; color:var(--text-heading); }
    .blog-cta-text { font-size:0.92rem; color:var(--text-body); margin-bottom:20px; }
    .blog-cta-buttons { display:flex; gap:12px; justify-content:center; flex-wrap:wrap; }
    .blog-cta-btn { display:inline-flex; align-items:center; gap:6px; padding:12px 24px; border-radius:30px; font-weight:600; font-size:0.92rem; text-decoration:none; transition:all 0.2s; }
    .blog-cta-btn-primary { background:var(--mint); color:#fff; }
    .blog-cta-btn-primary:hover { background:var(--mint-dark); transform:translateY(-1px); }
    .blog-cta-btn-line { background:#06C755; color:#fff; }
    .blog-cta-btn-line:hover { background:#05a648; transform:translateY(-1px); }
    .blog-nav-bottom { display:flex; gap:16px; justify-content:space-between; margin:40px 0 0; padding:20px 0; border-top:1px solid #eee; flex-wrap:wrap; }
    .blog-nav-link { color:var(--mint-dark); text-decoration:none; font-size:0.92rem; }
    .blog-nav-link:hover { text-decoration:underline; }
    .blog-cover { width:100%; max-height:280px; object-fit:cover; border-radius:14px; margin-bottom:28px; }
    @media (max-width: 768px) {
      .blog-article h1 { font-size:1.4rem; }
    }
  </style>
</head>
<body>

  <div class="scroll-progress"></div>

  <header class="header" id="header">
    <div class="header-inner">
      <a href="/index.html" class="logo">
        <span class="logo-icon"><i class="ico ico-paw-print" aria-hidden="true"></i></span>
        <span class="logo-text">福楽キャッテリー</span>
      </a>
      <nav class="nav" id="nav">
        <a href="/index.html#about" class="nav-link">猫舎について</a>
        <a href="/index.html#kittens" class="nav-link">子猫一覧</a>
        <a href="/index.html#parents" class="nav-link">親猫紹介</a>
        <a href="/index.html#visit" class="nav-link">見学案内</a>
        <a href="/index.html#faq" class="nav-link">よくある質問</a>
        <a href="/guide/" class="nav-link">お迎えガイド</a>
        <a href="/blog.html" class="nav-link">知識ライブラリ</a>
        <div class="nav-dropdown">
          <button class="nav-link nav-dropdown-toggle">もっと見る <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg></button>
          <div class="nav-dropdown-menu">
            <a href="/siberian.html" class="nav-dropdown-item">サイベリアンの魅力</a>
            <a href="/about.html" class="nav-dropdown-item">受賞歴・認定</a>
            <a href="/gallery.html" class="nav-dropdown-item">卒業猫ギャラリー</a>
            <a href="/reviews.html" class="nav-dropdown-item">お客様の声</a>
          </div>
        </div>
      </nav>
      <div class="header-right">
        <button class="hamburger" id="hamburger" aria-label="メニュー">
          <span></span><span></span><span></span>
        </button>
      </div>
    </div>
  </header>

  <nav class="guide-breadcrumb" aria-label="パンくずリスト">
    <a href="/">ホーム</a> &gt; <a href="/blog.html">知識ライブラリ</a> &gt; <span>${escHtml(title)}</span>
  </nav>

  <article class="blog-article">
    <img src="${cover}" alt="${escHtml(title)}" class="blog-cover">
    <div class="blog-meta">
      <span class="blog-meta-cat">${escHtml(catLabel)}</span>
      <time datetime="${art.publishedAt}">${(art.publishedAt || '').slice(0, 10)}</time>
    </div>
    <h1>${escHtml(title)}</h1>
${body}

    <div class="blog-cta-box">
      <div class="blog-cta-icon"><i class="ico ico-cat" aria-hidden="true"></i></div>
      <h3 class="blog-cta-title">福楽キャッテリーの子猫を見てみませんか？</h3>
      <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin:0 0 16px;font-size:0.82rem;color:#5A7A7A;">
        <span style="background:#fff;border:1px solid #e8f5f0;border-radius:20px;padding:4px 14px;"><i class="ico ico-star" aria-hidden="true"></i> <strong>5.00</strong>／113件</span>
        <span style="background:#fff;border:1px solid #e8f5f0;border-radius:20px;padding:4px 14px;"><i class="ico ico-trophy" aria-hidden="true"></i> 全国1位（みんなの子猫ブリーダー）</span>
        <span style="background:#fff;border:1px solid #e8f5f0;border-radius:20px;padding:4px 14px;"><i class="ico ico-paw-print" aria-hidden="true"></i> <strong>200+</strong> 卒業猫</span>
      </div>
      <p class="blog-cta-text">健康管理と社会化トレーニングを大切に育てた子猫たちをご紹介しています。<br>お気軽にLINEでご相談ください。</p>
      <div class="blog-cta-buttons">
        <a href="/kittens.html" class="blog-cta-btn blog-cta-btn-primary"><i class="ico ico-paw-print" aria-hidden="true"></i> 子猫一覧を見る</a>
        <a href="/booking.html" class="blog-cta-btn blog-cta-btn-primary"><i class="ico ico-calendar-check" aria-hidden="true"></i> 見学を予約する</a>
        <a href="https://page.line.me/915hnnlk?oat__id=5765672&openQrModal=true" class="blog-cta-btn blog-cta-btn-line" target="_blank" rel="noopener"><i class="ico ico-message-circle" aria-hidden="true"></i> LINEで相談する</a>
      </div>
      <p style="margin:16px 0 0;font-size:0.85rem;"><a href="https://www.koneko-breeder.com/breeder_c995680.html" target="_blank" rel="noopener" style="color:#5BC4A8;font-weight:500;"><i class="ico ico-trophy" aria-hidden="true"></i> みんなの子猫ブリーダーで最新の子猫を見る</a></p>
    </div>

    <div class="blog-nav-bottom">
      <a href="/blog.html" class="blog-nav-link"><i class="ico ico-book-open" aria-hidden="true"></i> 記事一覧へ戻る</a>
      <a href="/kittens.html" class="blog-nav-link"><i class="ico ico-cat" aria-hidden="true"></i> 子猫を見る</a>
      <a href="/guide/" class="blog-nav-link"><i class="ico ico-book-open" aria-hidden="true"></i> お迎えガイド</a>
    </div>
  </article>

  <footer class="footer" id="footer">
    <div class="container">
      <div class="footer-bottom">
        <p>&copy; 2025 サイベリアン｜大阪・福楽キャッテリー（福楽株式会社）All Rights Reserved.</p>
      </div>
    </div>
  </footer>

  <a href="https://page.line.me/915hnnlk?oat__id=5765672&openQrModal=true" class="fixed-line" aria-label="LINEでお問い合わせ" target="_blank" rel="noopener">
    <span class="fixed-line-icon"><svg width="28" height="28" viewBox="0 0 24 24" fill="white"><path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755z"/></svg></span>
    <span class="fixed-line-content"><span class="fixed-line-label">見学予約・ご相談</span><span class="fixed-line-cta">LINEで相談</span></span>
  </a>

  <button class="back-to-top" id="backToTop" aria-label="ページトップへ戻る">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 15l-6-6-6 6"/></svg>
  </button>

  <script src="/i18n.js?v=20260706a"></script>
  <script src="/blog/blog-i18n.js?v=20260624v2"></script>
  <script src="/script.js?v=20260623b"></script>

</body>
</html>
`;
}

(async () => {
  if (!fs.existsSync(BATCH_FILE)) {
    console.error(`Missing ${BATCH_FILE} — run gen-blog-kimi.mjs first`);
    process.exit(1);
  }
  const articles = JSON.parse(fs.readFileSync(BATCH_FILE, 'utf-8'));
  console.log(`Generating ${articles.length} static pages...`);
  for (const a of articles) {
    const dst = path.join(BLOG_DIR, `${a.slug}.html`);
    const html = buildPage(a);
    fs.writeFileSync(dst, html, 'utf-8');
    console.log(`  ${a.slug}.html (${html.length} bytes)`);
  }
  console.log(`Done. ${articles.length} files written to ${BLOG_DIR}/`);
})();

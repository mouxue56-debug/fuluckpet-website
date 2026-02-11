#!/usr/bin/env node
/**
 * translate-blog-articles.js
 *
 * Extracts article content from /blog/*.html, generates EN/ZH translations,
 * and injects window._blogArticleI18n data into each HTML file.
 *
 * Usage:
 *   node tools/translate-blog-articles.js              # Dry run (show untranslated articles)
 *   node tools/translate-blog-articles.js --translate   # Generate translations and inject
 *   node tools/translate-blog-articles.js --check       # Check translation status
 *   node tools/translate-blog-articles.js --single <slug>  # Translate one article
 *
 * The script is idempotent: re-running skips already-translated files.
 * Translations are injected as a <script> tag before blog-i18n.js.
 *
 * IMPORTANT: This script generates translations using simple text extraction.
 * For actual translation, it creates a JSON manifest that can be fed to AI translation.
 */

const fs = require('fs');
const path = require('path');

const BLOG_DIR = path.join(__dirname, '..', 'blog');
const MANIFEST_FILE = path.join(__dirname, 'blog-translations-manifest.json');
const TRANSLATIONS_DIR = path.join(__dirname, 'blog-translations');

// Extract title and body content from blog HTML
function extractArticleContent(html) {
  // Extract title from <h1>
  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
  const title = h1Match ? h1Match[1].replace(/<[^>]+>/g, '').trim() : '';

  // Extract body content: everything between </h1> and <div class="blog-cta-box">
  // or <div class="blog-cta-inline"> or <div class="blog-related">
  const bodyStart = html.indexOf('</h1>');
  if (bodyStart < 0) return { title, body: '' };

  const afterH1 = html.substring(bodyStart + 5);

  // Find the first CTA box or related section
  const endMarkers = [
    '<div class="blog-cta-box">',
    '<div class="blog-related">',
    '<div class="blog-nav-bottom">'
  ];

  let endPos = afterH1.length;
  for (const marker of endMarkers) {
    const idx = afterH1.indexOf(marker);
    if (idx >= 0 && idx < endPos) endPos = idx;
  }

  let body = afterH1.substring(0, endPos).trim();

  // Strip CTA inline divs from body (they're boilerplate, not content)
  body = body.replace(/<div class="blog-cta-inline">[\s\S]*?<\/div>\s*/g, '');

  return { title, body };
}

// Check if article already has i18n data
function hasTranslation(html) {
  return html.includes('window._blogArticleI18n');
}

// Extract plain text from HTML for translation input
function htmlToText(html) {
  return html
    .replace(/<h2[^>]*>/g, '\n## ')
    .replace(/<h3[^>]*>/g, '\n### ')
    .replace(/<\/h[23]>/g, '\n')
    .replace(/<li[^>]*>/g, '- ')
    .replace(/<\/li>/g, '\n')
    .replace(/<p[^>]*>/g, '')
    .replace(/<\/p>/g, '\n\n')
    .replace(/<br\s*\/?>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Inject translation script into HTML file
function injectTranslation(htmlPath, enTitle, enContent, zhTitle, zhContent) {
  let html = fs.readFileSync(htmlPath, 'utf8');

  if (hasTranslation(html)) {
    // Replace existing translation
    html = html.replace(
      /<script>\s*window\._blogArticleI18n\s*=[\s\S]*?<\/script>\s*(?=<script src="\/blog\/blog-i18n\.js")/,
      ''
    );
  }

  // Escape for JS string embedding
  const escapeJS = (s) => s
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '');

  const i18nScript = `<script>
window._blogArticleI18n = {
  en: {
    title: '${escapeJS(enTitle)}',
    content: '${escapeJS(enContent)}'
  },
  zh: {
    title: '${escapeJS(zhTitle)}',
    content: '${escapeJS(zhContent)}'
  }
};
</script>
`;

  // Insert before blog-i18n.js
  html = html.replace(
    '<script src="/blog/blog-i18n.js"></script>',
    i18nScript + '  <script src="/blog/blog-i18n.js"></script>'
  );

  fs.writeFileSync(htmlPath, html, 'utf8');
}

// Main
function main() {
  const args = process.argv.slice(2);
  const mode = args[0] || '--check';

  const files = fs.readdirSync(BLOG_DIR)
    .filter(f => f.endsWith('.html') && f !== 'blog-i18n.js')
    .sort();

  console.log(`Found ${files.length} blog articles\n`);

  if (mode === '--check') {
    let translated = 0;
    let untranslated = 0;

    for (const file of files) {
      const html = fs.readFileSync(path.join(BLOG_DIR, file), 'utf8');
      if (hasTranslation(html)) {
        translated++;
      } else {
        untranslated++;
        console.log(`  ✗ ${file}`);
      }
    }

    console.log(`\n${translated} translated, ${untranslated} untranslated`);
    return;
  }

  if (mode === '--extract') {
    // Extract all article content to a manifest JSON for batch translation
    const manifest = [];

    for (const file of files) {
      const slug = file.replace('.html', '');
      const html = fs.readFileSync(path.join(BLOG_DIR, file), 'utf8');

      if (hasTranslation(html)) {
        console.log(`  ✓ ${slug} (already translated, skipping)`);
        continue;
      }

      const { title, body } = extractArticleContent(html);
      const plainText = htmlToText(body);

      manifest.push({
        slug,
        file,
        title,
        bodyHtml: body,
        bodyText: plainText
      });
    }

    fs.writeFileSync(MANIFEST_FILE, JSON.stringify(manifest, null, 2));
    console.log(`\nExtracted ${manifest.length} articles to ${MANIFEST_FILE}`);
    return;
  }

  if (mode === '--inject') {
    // Read translations from blog-translations/ directory and inject into HTML
    if (!fs.existsSync(TRANSLATIONS_DIR)) {
      console.error(`Translations directory not found: ${TRANSLATIONS_DIR}`);
      console.error('Run --extract first, translate the manifest, then place translations in this directory.');
      process.exit(1);
    }

    const translationFiles = fs.readdirSync(TRANSLATIONS_DIR)
      .filter(f => f.endsWith('.json'))
      .sort();

    let injected = 0;
    for (const tf of translationFiles) {
      const data = JSON.parse(fs.readFileSync(path.join(TRANSLATIONS_DIR, tf), 'utf8'));
      const htmlPath = path.join(BLOG_DIR, data.slug + '.html');

      if (!fs.existsSync(htmlPath)) {
        console.log(`  ✗ ${data.slug} — HTML file not found`);
        continue;
      }

      injectTranslation(
        htmlPath,
        data.en.title,
        data.en.content,
        data.zh.title,
        data.zh.content
      );

      console.log(`  ✓ ${data.slug}`);
      injected++;
    }

    console.log(`\nInjected translations into ${injected} files`);
    return;
  }

  if (mode === '--single') {
    const slug = args[1];
    if (!slug) {
      console.error('Usage: --single <slug>');
      process.exit(1);
    }
    const htmlPath = path.join(BLOG_DIR, slug + '.html');
    if (!fs.existsSync(htmlPath)) {
      console.error(`File not found: ${htmlPath}`);
      process.exit(1);
    }
    const html = fs.readFileSync(htmlPath, 'utf8');
    const { title, body } = extractArticleContent(html);
    console.log('=== TITLE ===');
    console.log(title);
    console.log('\n=== BODY TEXT ===');
    console.log(htmlToText(body));
    console.log('\n=== BODY HTML (first 500 chars) ===');
    console.log(body.substring(0, 500));
    return;
  }

  console.log('Usage:');
  console.log('  --check     Show translation status');
  console.log('  --extract   Extract articles to manifest JSON');
  console.log('  --inject    Inject translations from blog-translations/ dir');
  console.log('  --single <slug>  Show extracted content for one article');
}

main();

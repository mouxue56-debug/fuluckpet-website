'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');

function read(relative) {
  return fs.readFileSync(path.join(ROOT, relative), 'utf8');
}

function metaContent(html, name) {
  const tag = (html.match(new RegExp(`<meta\\b(?=[^>]*name=["']${name}["'])[^>]*>`, 'i')) || [])[0];
  assert.ok(tag, `missing meta name="${name}"`);
  const content = tag.match(/content=["']([^"']*)["']/i);
  assert.ok(content, `missing content for meta name="${name}"`);
  return content[1];
}

function schemas(html) {
  return [...html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
    .map((match) => JSON.parse(match[1]));
}

test('localized blog pages agree on self canonical, Open Graph URL, schema URL, and sitemap', () => {
  const sitemap = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
  const files = [];
  for (const lang of ['en', 'zh']) {
    const dir = path.join(ROOT, lang, 'blog');
    for (const filename of fs.readdirSync(dir).filter((name) => name.endsWith('.html')).sort()) {
      files.push({ lang, filename, path: path.join(dir, filename) });
    }
  }
  assert.equal(files.length, 10);

  for (const item of files) {
    const html = fs.readFileSync(item.path, 'utf8');
    const self = `https://fuluckpet.com/${item.lang}/blog/${item.filename}`;
    const quotedSelf = self.replaceAll('.', '\\.');
    assert.match(html, new RegExp(`<link rel="canonical" href="${quotedSelf}"`), `${item.lang}/${item.filename} canonical`);
    assert.match(html, new RegExp(`<meta property="og:url" content="${quotedSelf}"`), `${item.lang}/${item.filename} og:url`);
    assert.match(html, new RegExp(`"mainEntityOfPage"\\s*:\\s*\\{[^}]*"@id"\\s*:\\s*"${quotedSelf}"`), `${item.lang}/${item.filename} schema`);
    assert.match(html, new RegExp(`"position"\\s*:\\s*3[^}]*"item"\\s*:\\s*"${quotedSelf}"`), `${item.lang}/${item.filename} breadcrumb schema`);
    assert.match(sitemap, new RegExp(`<loc>${quotedSelf}<\\/loc>`), `${item.lang}/${item.filename} sitemap`);
  }
});

test('healthy-kitten localized pages keep visible and structured semantics in their own language', () => {
  const cases = [
    {
      lang: 'en',
      languageTag: 'en',
      title: 'How to Choose a Healthy Kitten: 10 Things to Check at the Cattery',
      description: 'When you welcome a new cat into the family, your deepest wish is for a healthy companion who stays by your side for years to come — here are the ten checks that make that possible.',
      home: 'Home',
      library: 'Knowledge Library',
      breadcrumbLabel: 'Breadcrumb',
      related: 'Related Articles',
      cta: 'Want to meet Fuluck Cattery kittens?',
      fixedAria: 'Contact us on LINE',
      fixedLabel: 'Visit booking and consultation',
      fixedCta: 'Chat on LINE',
      backToTop: 'Back to top',
    },
    {
      lang: 'zh',
      languageTag: 'zh',
      title: '如何挑选健康的小猫：到猫舍必看的10个检查要点',
      description: '把一只新猫迎进家门时，最大的心愿莫过于它能健康地长久陪伴在身边——而这十个检查要点，正是实现这一心愿的关键。',
      home: '首页',
      library: '知识库',
      breadcrumbLabel: '面包屑导航',
      related: '相关文章',
      cta: '想看看福乐猫舍的幼猫吗？',
      fixedAria: '通过 LINE 联系我们',
      fixedLabel: '预约参观・咨询',
      fixedCta: 'LINE 咨询',
      backToTop: '返回顶部',
    },
  ];

  for (const item of cases) {
    const html = read(`${item.lang}/blog/choose-healthy-kitten-checklist.html`);
    const blogPosting = schemas(html).find((schema) => schema['@type'] === 'BlogPosting');
    const breadcrumb = schemas(html).find((schema) => schema['@type'] === 'BreadcrumbList');
    const visibleBreadcrumb = html.match(/<nav class="guide-breadcrumb"[\s\S]*?<\/nav>/i)?.[0] || '';
    const related = html.match(/<div class="blog-related">[\s\S]*?<\/div>/i)?.[0] || '';
    const cta = html.match(/<div class="blog-cta-box">[\s\S]*?<div class="blog-nav-bottom">/i)?.[0] || '';
    const fixedLine = html.match(/<a\b[^>]*class="fixed-line"[\s\S]*?<\/a>/i)?.[0] || '';

    assert.match(html, new RegExp(`<html lang="${item.languageTag}">`), `${item.lang} html lang`);
    assert.ok(blogPosting, `${item.lang} BlogPosting`);
    assert.equal(blogPosting.inLanguage, item.languageTag, `${item.lang} BlogPosting.inLanguage`);
    assert.equal(blogPosting.headline, item.title, `${item.lang} BlogPosting.headline`);
    assert.equal(metaContent(html, 'description'), item.description, `${item.lang} meta description`);
    assert.match(html, new RegExp(`<meta property="og:description" content="${item.description}"`));
    assert.equal(blogPosting.description, item.description, `${item.lang} BlogPosting.description`);
    assert.ok(breadcrumb, `${item.lang} BreadcrumbList`);
    assert.deepEqual(
      breadcrumb.itemListElement.map((entry) => entry.name),
      [item.home, item.library, item.title],
      `${item.lang} structured breadcrumb labels`,
    );
    assert.match(visibleBreadcrumb, new RegExp(`aria-label="${item.breadcrumbLabel}"`));
    assert.match(visibleBreadcrumb, new RegExp(item.home));
    assert.match(visibleBreadcrumb, new RegExp(item.library));
    assert.match(visibleBreadcrumb, new RegExp(item.title));
    assert.match(related, new RegExp(item.related));
    assert.doesNotMatch(related, /[\u3040-\u30ff]/, `${item.lang} related links cannot contain Japanese kana`);
    assert.match(cta, new RegExp(item.cta));
    assert.doesNotMatch(cta, /[\u3040-\u30ff]/, `${item.lang} CTA cannot contain Japanese kana`);
    assert.match(fixedLine, /id="fixedLine"/);
    assert.match(fixedLine, new RegExp(`aria-label="${item.fixedAria}"`));
    assert.match(fixedLine, new RegExp(item.fixedLabel));
    assert.match(fixedLine, new RegExp(item.fixedCta));
    assert.match(html, new RegExp(`<button class="back-to-top" id="backToTop" aria-label="${item.backToTop}"`));
  }
});

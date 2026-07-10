'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const BLOG_DIR = path.join(ROOT, 'blog');
const SITE_ORIGIN = 'https://fuluckpet.com';

test('200-response blog aliases consistently defer every search signal to their canonical article', () => {
  const aliases = [];
  for (const filename of fs.readdirSync(BLOG_DIR).filter((name) => name.endsWith('.html'))) {
    const html = fs.readFileSync(path.join(BLOG_DIR, filename), 'utf8');
    const canonical = html.match(/<link rel="canonical" href="([^"]+)"/i)?.[1];
    const self = `${SITE_ORIGIN}/blog/${filename}`;
    if (canonical && canonical !== self) aliases.push({ filename, html, canonical });
  }

  assert.equal(aliases.length, 5, 'known aliases stay explicit until an owner-approved edge redirect exists');
  for (const { filename, html, canonical } of aliases) {
    assert.match(html, /<meta name="robots" content="noindex,follow">/i, `${filename} must not compete in search`);
    assert.equal(html.match(/<meta property="og:url" content="([^"]+)"/i)?.[1], canonical, `${filename} Open Graph URL`);
    const alternates = Array.from(html.matchAll(/<link rel="alternate" hreflang="[^"]+" href="([^"]+)"/gi), (match) => match[1]);
    assert.ok(alternates.length > 0, `${filename} must keep explicit hreflang metadata`);
    assert.ok(alternates.every((href) => href === canonical), `${filename} hreflang must not self-identify the alias`);
    assert.equal(html.match(/"mainEntityOfPage"\s*:\s*\{[^}]*"@id"\s*:\s*"([^"]+)"/i)?.[1], canonical, `${filename} BlogPosting identity`);
    const breadcrumbItems = Array.from(html.matchAll(/"position"\s*:\s*3[^}]*"item"\s*:\s*"([^"]+)"/gi), (match) => match[1]);
    assert.ok(breadcrumbItems.length > 0 && breadcrumbItems.every((item) => item === canonical), `${filename} breadcrumb identity`);
  }
});

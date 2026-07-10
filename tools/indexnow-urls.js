#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { hasNoindexMeta, metaAttribute } = require('./robots-meta');

const SITE_ORIGIN = 'https://fuluckpet.com';

function hasSelfCanonical(html, expectedUrl) {
  const canonicalHrefs = (String(html || '').match(/<link\b[^>]*>/gi) || [])
    .filter((tag) => {
      const rel = metaAttribute(tag, 'rel');
      return rel && rel.toLowerCase().split(/\s+/).includes('canonical');
    })
    .map((tag) => metaAttribute(tag, 'href'))
    .filter(Boolean);
  if (canonicalHrefs.length !== 1) return false;

  try {
    const expected = new URL(expectedUrl);
    const canonical = new URL(canonicalHrefs[0], `${SITE_ORIGIN}/`);
    return !canonical.username
      && !canonical.password
      && canonical.origin === expected.origin
      && canonical.pathname === expected.pathname
      && canonical.search === ''
      && canonical.hash === '';
  } catch (_) {
    return false;
  }
}

function buildIndexNowUrls(files, siteRoot = path.resolve(__dirname, '..')) {
  const root = path.resolve(siteRoot);
  const urls = [];
  const seen = new Set();

  for (const raw of files) {
    const rel = String(raw || '').trim().split(path.sep).join('/');
    if (!rel || !rel.endsWith('.html') || path.isAbsolute(rel)) continue;
    // A filesystem path and a submitted URL must identify the same resource.
    // Reject aliases that WHATWG URL parsing would decode/normalize elsewhere.
    if (rel.includes('\\') || rel.includes('%') || /[?#\0]/.test(rel)) continue;
    const segments = rel.split('/');
    if (segments.some((segment) => !segment || segment === '.' || segment === '..')) continue;
    const abs = path.resolve(root, rel);
    if (abs !== root && !abs.startsWith(root + path.sep)) continue;

    let html;
    try { html = fs.readFileSync(abs, 'utf8'); } catch (_) { continue; }
    let route = rel === 'index.html' ? '' : rel.replace(/\/index\.html$/, '/');
    const url = `${SITE_ORIGIN}/${route}`;
    if (hasNoindexMeta(html) || !hasSelfCanonical(html, url)) continue;
    if (!seen.has(url)) {
      seen.add(url);
      urls.push(url);
    }
  }
  return urls;
}

if (require.main === module) {
  const files = fs.readFileSync(0, 'utf8').split(/\r?\n/);
  const urls = buildIndexNowUrls(files);
  process.stdout.write(urls.join('\n'));
  if (urls.length) process.stdout.write('\n');
}

module.exports = { buildIndexNowUrls, hasSelfCanonical };

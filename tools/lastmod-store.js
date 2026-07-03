// tools/lastmod-store.js — shared honest-lastmod store for BOTH generators.
//
// Problem it solves: the daily cron used to stamp lastmod=today on ~every sitemap
// entry, so the freshness signal was meaningless and every cron day produced a noise
// commit. This module makes lastmod reflect ACTUAL content change.
//
// How: for each sitemap URL that maps to a file on disk, we hash the file content
// (after stripping ?v=... asset-version params so a pure cache-bust bump doesn't count
// as a content change). If the hash is unchanged from the committed store, we reuse the
// stored lastmod; if it changed or is new, we use today and update the store.
//
// The store (tools/sitemap-lastmod.json) is COMMITTED so it persists across CI runs.
// It is written sorted by key for deterministic diffs.
//
// Usage (both generators):
//   const { createLastmodStore } = require('./lastmod-store');
//   const store = createLastmodStore(SITE_DIR, todayISO());
//   const lastmod = store.lastmodForUrl('https://fuluckpet.com/kittens.html');
//   ... (repeat for every URL) ...
//   store.save();   // writes the JSON store back to disk, sorted

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const STORE_FILENAME = 'sitemap-lastmod.json';

// Strip asset-version query params (?v=20260628j) so a pure cache-bust bump is not
// mistaken for a content change. Matches the same pattern the pipeline uses elsewhere.
function stripAssetVersions(content) {
  return content.replace(/\?v=[\w.-]+/g, '');
}

function hashContent(content) {
  return crypto.createHash('sha1').update(stripAssetVersions(content), 'utf8').digest('hex');
}

// Map a sitemap <loc> URL to an on-disk file path (absolute), or null if it does not
// correspond to a static file we can hash.
//   https://fuluckpet.com/            -> index.html
//   https://fuluckpet.com/story/      -> story/index.html
//   https://fuluckpet.com/diary/      -> diary/index.html
//   https://fuluckpet.com/guide/      -> guide/index.html
//   https://fuluckpet.com/foo.html    -> foo.html
//   https://fuluckpet.com/kittens/X.html -> kittens/X.html
function urlToFile(siteDir, url) {
  let p;
  try {
    p = new URL(url).pathname;
  } catch {
    p = url.replace(/^https?:\/\/[^/]+/, '');
  }
  // Decode percent-encoding (JP slugs may be encoded in some URLs).
  try { p = decodeURIComponent(p); } catch { /* leave as-is */ }
  if (p === '' || p === '/') return path.join(siteDir, 'index.html');
  // Directory-style URL -> index.html inside it.
  if (p.endsWith('/')) return path.join(siteDir, p.replace(/^\/+/, ''), 'index.html');
  return path.join(siteDir, p.replace(/^\/+/, ''));
}

function createLastmodStore(siteDir, today) {
  const storePath = path.join(siteDir, 'tools', STORE_FILENAME);
  let store = {};
  try {
    store = JSON.parse(fs.readFileSync(storePath, 'utf8')) || {};
  } catch {
    store = {};
  }
  // Track which keys were touched this run purely for logging; we do NOT prune
  // untouched keys, because the two generators each only touch their own subset
  // of URLs and must not clobber each other's entries.

  function lastmodForUrl(url) {
    const file = urlToFile(siteDir, url);
    let content = null;
    try { content = fs.readFileSync(file, 'utf8'); } catch { content = null; }

    if (content == null) {
      // File not on disk (e.g. a URL we cannot resolve). Reuse a stored date if we
      // have one, else fall back to today. Never invent a hash.
      if (store[url] && store[url].lastmod) return store[url].lastmod;
      return today;
    }

    const hash = hashContent(content);
    const prev = store[url];
    if (prev && prev.hash === hash && prev.lastmod) {
      return prev.lastmod; // unchanged content -> keep the honest older date
    }
    // New or changed content -> stamp today and update the store.
    store[url] = { hash, lastmod: today };
    return today;
  }

  function save() {
    const sorted = {};
    for (const k of Object.keys(store).sort()) sorted[k] = store[k];
    fs.writeFileSync(storePath, JSON.stringify(sorted, null, 2) + '\n', 'utf8');
  }

  return { lastmodForUrl, save, _storePath: storePath, _urlToFile: (u) => urlToFile(siteDir, u) };
}

module.exports = { createLastmodStore, urlToFile, hashContent, stripAssetVersions, STORE_FILENAME };

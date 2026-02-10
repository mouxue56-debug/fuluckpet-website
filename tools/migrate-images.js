#!/usr/bin/env node
/**
 * Image migration: koneko-breeder.com → R2
 *
 * Usage:
 *   node tools/migrate-images.js scan          # Extract & dedupe URLs
 *   node tools/migrate-images.js download      # Download images to tools/tmp/
 *   node tools/migrate-images.js upload        # Upload to R2 via Worker API
 *   node tools/migrate-images.js replace       # Replace URLs in HTML files
 *   node tools/migrate-images.js all           # Run all steps
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'fs';
import { resolve, join, basename } from 'path';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';

const ROOT = resolve(import.meta.dirname, '..');
const TMP_DIR = join(import.meta.dirname, 'tmp');
const MAP_FILE = join(import.meta.dirname, 'url-map.json');
const WORKER_URL = 'https://fuluck-api.mouxue56.workers.dev';
const ADMIN_PASS = 'fuluck5632';

const HTML_FILES = [
  'index.html', 'kittens.html', 'parents.html', 'gallery.html',
  'admin/index.html'
].map(f => join(ROOT, f));

const URL_REGEX = /https?:\/\/(?:www\.)?koneko-breeder\.com\/[^"'\s)]+\.(?:jpg|jpeg|png|gif|webp)/gi;

// Step 1: Scan HTML files and extract unique URLs
function scan() {
  const allUrls = new Set();

  for (const file of HTML_FILES) {
    const content = readFileSync(file, 'utf-8');
    const matches = content.match(URL_REGEX) || [];
    matches.forEach(u => allUrls.add(u));
  }

  const urls = [...allUrls].sort();
  console.log(`Found ${urls.length} unique URLs across ${HTML_FILES.length} files`);

  writeFileSync(join(import.meta.dirname, 'urls.json'), JSON.stringify(urls, null, 2));
  console.log(`Saved to tools/urls.json`);
  return urls;
}

// Step 2: Download all images
async function download() {
  mkdirSync(TMP_DIR, { recursive: true });

  const urls = JSON.parse(readFileSync(join(import.meta.dirname, 'urls.json'), 'utf-8'));
  console.log(`Downloading ${urls.length} images...`);

  let success = 0, fail = 0;

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    const filename = urlToFilename(url);
    const filepath = join(TMP_DIR, filename);

    if (existsSync(filepath)) {
      console.log(`  [${i+1}/${urls.length}] SKIP ${filename} (exists)`);
      success++;
      continue;
    }

    try {
      const res = await fetch(url, {
        headers: { 'Referer': 'https://www.koneko-breeder.com/' }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      await pipeline(Readable.fromWeb(res.body), createWriteStream(filepath));
      console.log(`  [${i+1}/${urls.length}] OK ${filename}`);
      success++;
    } catch (err) {
      console.error(`  [${i+1}/${urls.length}] FAIL ${filename}: ${err.message}`);
      fail++;
    }

    // Rate limit
    if (i % 10 === 9) await sleep(500);
  }

  console.log(`Done: ${success} success, ${fail} fail`);
}

// Step 3: Upload to R2 via Worker API
async function upload() {
  const urls = JSON.parse(readFileSync(join(import.meta.dirname, 'urls.json'), 'utf-8'));
  const map = existsSync(MAP_FILE) ? JSON.parse(readFileSync(MAP_FILE, 'utf-8')) : {};

  console.log(`Uploading ${urls.length} images to R2...`);
  let success = 0, fail = 0, skip = 0;

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];

    if (map[url]) {
      console.log(`  [${i+1}/${urls.length}] SKIP ${basename(map[url])} (already uploaded)`);
      skip++;
      continue;
    }

    const filename = urlToFilename(url);
    const filepath = join(TMP_DIR, filename);

    if (!existsSync(filepath)) {
      console.error(`  [${i+1}/${urls.length}] MISSING ${filename}`);
      fail++;
      continue;
    }

    try {
      const fileData = readFileSync(filepath);
      const blob = new Blob([fileData], { type: getMimeType(filename) });

      const form = new FormData();
      form.append('file', blob, filename);

      const res = await fetch(`${WORKER_URL}/api/admin/upload`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${ADMIN_PASS}` },
        body: form,
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text}`);
      }

      const { key } = await res.json();
      // Use Worker's /r2/ endpoint for public access
      map[url] = `${WORKER_URL}/r2/${key}`;

      console.log(`  [${i+1}/${urls.length}] OK → ${key}`);
      success++;

      // Save map periodically
      if (success % 5 === 0) writeFileSync(MAP_FILE, JSON.stringify(map, null, 2));
    } catch (err) {
      console.error(`  [${i+1}/${urls.length}] FAIL ${filename}: ${err.message}`);
      fail++;
    }

    // Rate limit
    if (i % 5 === 4) await sleep(300);
  }

  writeFileSync(MAP_FILE, JSON.stringify(map, null, 2));
  console.log(`Done: ${success} uploaded, ${skip} skipped, ${fail} failed`);
  console.log(`URL map saved to tools/url-map.json`);
}

// Step 4: Replace URLs in HTML files
function replace() {
  const map = JSON.parse(readFileSync(MAP_FILE, 'utf-8'));
  const entries = Object.entries(map);

  if (entries.length === 0) {
    console.error('No URL mappings found. Run upload first.');
    return;
  }

  console.log(`Replacing ${entries.length} URLs in HTML files...`);

  for (const file of HTML_FILES) {
    let content = readFileSync(file, 'utf-8');
    let count = 0;

    for (const [oldUrl, newUrl] of entries) {
      const before = content;
      content = content.replaceAll(oldUrl, newUrl);
      if (content !== before) count++;
    }

    if (count > 0) {
      writeFileSync(file, content);
      console.log(`  ${basename(file)}: ${count} URLs replaced`);
    } else {
      console.log(`  ${basename(file)}: no changes`);
    }
  }

  console.log('Done! Verify with: grep -r "koneko-breeder.com" *.html');
}

// Helpers
function urlToFilename(url) {
  // Extract meaningful part: breeder_id + image_hash
  // e.g. https://www.koneko-breeder.com/breeder/data/c995680/child_img_1_thumb_mob_bcdb713f28a6.jpg
  // → c995680_child_img_1_thumb_mob_bcdb713f28a6.jpg
  const parts = url.split('/');
  const file = parts.pop();
  const breeder = parts.find(p => /^[cd]\d{6}$/.test(p)) || 'unknown';
  return `${breeder}_${file}`;
}

function getMimeType(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  return { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp' }[ext] || 'image/jpeg';
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Main
const cmd = process.argv[2] || 'all';

if (cmd === 'scan') {
  scan();
} else if (cmd === 'download') {
  await download();
} else if (cmd === 'upload') {
  await upload();
} else if (cmd === 'replace') {
  replace();
} else if (cmd === 'all') {
  scan();
  await download();
  await upload();
  replace();
} else {
  console.log('Usage: node tools/migrate-images.js [scan|download|upload|replace|all]');
}

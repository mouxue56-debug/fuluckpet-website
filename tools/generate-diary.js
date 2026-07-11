#!/usr/bin/env node
// tools/generate-diary.js - Regenerate kitten growth diary static pages from API data
// Usage: node tools/generate-diary.js
// Test fixture: DIARY_FIXTURE=/path/to/fixture.json node tools/generate-diary.js

const https = require('https');
const fs = require('fs');
const path = require('path');
const { createLastmodStore } = require('./lastmod-store');
const { safeJsonForHtmlScript } = require('./safe-json-for-html');

const API_BASE = 'https://fuluck-api.mouxue56.workers.dev';
const SITE_DIR = path.resolve(__dirname, '..');
const BASE_URL = 'https://fuluckpet.com';
const HTTP_TIMEOUT_MS = 15000;
const MAX_JSON_RESPONSE_BYTES = 5 * 1024 * 1024;
const FAVICON_HREF = "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='8' fill='%235BC4A8'/><g fill='%23ffffff'><ellipse cx='11' cy='12' rx='2.3' ry='2.7'/><ellipse cx='21' cy='12' rx='2.3' ry='2.7'/><ellipse cx='7.5' cy='17.5' rx='2.1' ry='2.4'/><ellipse cx='24.5' cy='17.5' rx='2.1' ry='2.4'/><path d='M16 16.5c3.1 0 5.6 2.2 5.6 4.9 0 2.2-1.9 3.1-5.6 3.1s-5.6-.9-5.6-3.1c0-2.7 2.5-4.9 5.6-4.9z'/></g></svg>";

// -- Helpers ---------------------------------------------------------------

function fetchJSON(endpoint) {
  return new Promise((resolve, reject) => {
    const url = API_BASE + endpoint;
    let request;
    let settled = false;
    let deadlineTimer;
    function clearDeadline() {
      if (deadlineTimer !== undefined) {
        clearTimeout(deadlineTimer);
        deadlineTimer = undefined;
      }
    }
    function fail(error) {
      if (settled) return;
      settled = true;
      clearDeadline();
      reject(error);
      if (request && typeof request.destroy === 'function') request.destroy();
    }
    // ClientRequest#setTimeout is a socket inactivity timeout and may not cover a
    // DNS/connect stall. Start an independent wall-clock deadline before the request.
    deadlineTimer = setTimeout(() => {
      fail(new Error(`Request timed out for ${endpoint} after ${HTTP_TIMEOUT_MS}ms`));
    }, HTTP_TIMEOUT_MS);
    try {
      request = https.get(url, (res) => {
      let data = '';
      let receivedBytes = 0;
      const declaredBytes = Number(res.headers && res.headers['content-length']);
      if (Number.isFinite(declaredBytes) && declaredBytes > MAX_JSON_RESPONSE_BYTES) {
        fail(new Error(`Response too large from ${endpoint}: exceeds ${MAX_JSON_RESPONSE_BYTES} bytes`));
        return;
      }
      res.setEncoding('utf8'); // decode multi-byte UTF-8 across chunk boundaries (avoid mojibake)
      res.on('data', (chunk) => {
        if (settled) return;
        receivedBytes += Buffer.byteLength(chunk, 'utf8');
        if (receivedBytes > MAX_JSON_RESPONSE_BYTES) {
          fail(new Error(`Response too large from ${endpoint}: exceeds ${MAX_JSON_RESPONSE_BYTES} bytes`));
          return;
        }
        data += chunk;
      });
      res.on('error', fail);
      res.on('end', () => {
        if (settled) return;
        const statusCode = Number(res.statusCode || 0);
        if (statusCode < 200 || statusCode >= 300) {
          fail(new Error(`HTTP ${statusCode || 'unknown'} from ${endpoint}${res.statusMessage ? `: ${res.statusMessage}` : ''}`));
          return;
        }
        try {
          const parsed = JSON.parse(data);
          settled = true;
          clearDeadline();
          resolve(parsed);
        } catch (e) {
          fail(new Error(`Failed to parse JSON from ${endpoint}: ${e.message}`));
        }
      });
      });
    } catch (error) {
      fail(error);
      return;
    }
    request.on('error', fail);
    if (typeof request.setTimeout === 'function') {
      request.setTimeout(HTTP_TIMEOUT_MS, () => {
        fail(new Error(`Request timed out for ${endpoint} after ${HTTP_TIMEOUT_MS}ms`));
      });
    }
  });
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function asArray(value, keys) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'object') return [];
  for (const key of keys || []) {
    if (Array.isArray(value[key])) return value[key];
  }
  return [];
}

function requireArrayPayload(value, keys, endpoint) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') {
    if (value.success === false || value.ok === false || (typeof value.error === 'string' && value.error.trim())) {
      throw new Error(`Error response from ${endpoint}: ${value.error || 'success=false'}`);
    }
    for (const key of keys || []) {
      if (Array.isArray(value[key])) return value[key];
    }
  }
  throw new Error(`Unexpected JSON shape from ${endpoint}: expected an array`);
}

function validateDiaryEntriesPayload(entries, endpoint) {
  const seen = new Set();
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error(`Invalid diary item #${i} from ${endpoint}: expected an object`);
    }
    const slug = normalizeSlug(entry.slug);
    if (!slug) {
      throw new Error(`Invalid diary item #${i} from ${endpoint}: missing slug`);
    }
    if (seen.has(slug)) {
      throw new Error(`Invalid diary data from ${endpoint}: duplicate slug ${slug}`);
    }
    seen.add(slug);
  }
  return entries;
}

function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function displayDate(value) {
  if (!value) return '';
  const text = String(value);
  const m = text.match(/\d{4}-\d{2}-\d{2}/);
  return m ? m[0] : text;
}

function sortDateValue(value) {
  if (!value) return 0;
  const text = String(value);
  const stamp = Date.parse(text.length === 10 ? `${text}T00:00:00+09:00` : text);
  return Number.isNaN(stamp) ? 0 : stamp;
}

function entryDate(entry) {
  return entry.date || entry.publishedAt || entry.createdAt || '';
}

function sortEntriesAsc(entries) {
  return [...entries].sort((a, b) => {
    const byDate = sortDateValue(entryDate(a)) - sortDateValue(entryDate(b));
    if (byDate !== 0) return byDate;
    return String(a.slug || '').localeCompare(String(b.slug || ''));
  });
}

function sortEntriesDesc(entries) {
  return sortEntriesAsc(entries).reverse();
}

function localizedField(field, lang, fallback) {
  if (field && typeof field === 'object' && !Array.isArray(field)) {
    const value = field[lang] || field.ja || fallback || '';
    return value || '';
  }
  return field || fallback || '';
}

function normalizeSlug(slug) {
  const cleaned = String(slug || '')
    .trim()
    .replace(/^\/+|\/+$/g, '')
    .replace(/\.html$/i, '');
  return cleaned.replace(/[\/\\]/g, '-').replace(/\.\./g, '-');
}

function isPublished(entry) {
  return entry && entry.published !== false;
}

function getGroupId(entry) {
  const group = entry && entry.cats && entry.cats.group;
  return String(group || entry.litter || '').trim();
}

function groupKeyForIndex(entry) {
  return getGroupId(entry) || `entry:${normalizeSlug(entry.slug)}`;
}

function pagePathForEntry(entry) {
  return `/diary/${normalizeSlug(entry.slug)}.html`;
}

function pageUrlForEntry(entry) {
  return `${BASE_URL}${pagePathForEntry(entry)}`;
}

function normalizeAssetUrl(url) {
  if (!url) return '';
  const text = String(url).trim();
  if (!text) return '';
  if (/^(https?:)?\/\//i.test(text) || text.startsWith('data:')) return text;
  if (text.startsWith('/')) return text;
  return `/${text.replace(/^\.?\//, '')}`;
}

function absoluteUrl(url) {
  const normalized = normalizeAssetUrl(url);
  if (!normalized) return '';
  if (/^https?:\/\//i.test(normalized)) return normalized;
  if (normalized.startsWith('//')) return `https:${normalized}`;
  if (normalized.startsWith('data:')) return normalized;
  return `${BASE_URL}${normalized}`;
}

function getCoverPhoto(item) {
  if (!item) return '';
  if (item.photo) return normalizeAssetUrl(item.photo);
  if (Array.isArray(item.photos) && item.photos.length > 0) {
    const idx = Number.isInteger(item.coverIndex) ? item.coverIndex : 0;
    return normalizeAssetUrl(item.photos[idx] || item.photos[0]);
  }
  if (item.coverImage) return normalizeAssetUrl(item.coverImage);
  return '';
}

function stageText(stage) {
  const raw = String(stage || '').trim();
  const lower = raw.toLowerCase();
  if (!raw) return '成長記録';
  if (/preg|妊娠/.test(lower)) return '妊娠';
  if (/birth|born|出産|誕生/.test(lower)) return '出産';
  if (/week|growth|grow|成長|週/.test(lower)) return '成長';
  if (/gradu|卒/.test(lower)) return '卒業';
  return raw;
}

function kittenStatusBadge(status, hasLiveData) {
  if (!hasLiveData) return { text: '卒業', key: 'graduated' };
  const raw = String(status || '').toLowerCase();
  if (raw === 'available' || raw === 'sale' || raw === '販売中' || raw === '在売') {
    return { text: '在売', key: 'available' };
  }
  if (raw === 'reserved' || raw === 'pending' || raw === '商談中' || raw === '予約済') {
    return { text: 'ご予約済', key: 'reserved' };
  }
  return { text: '卒業', key: 'graduated' };
}

function litterStatus(entries, kittensById) {
  const latest = sortEntriesDesc(entries)[0] || {};
  const latestStage = String(latest.stage || '').toLowerCase();
  if (/preg|妊娠/.test(latestStage)) return '妊娠中';
  if (/gradu|卒/.test(latestStage)) return '卒業';

  const kittenRefs = [];
  for (const entry of entries) {
    const kittens = entry.cats && Array.isArray(entry.cats.kittens) ? entry.cats.kittens : [];
    for (const ref of kittens) {
      const id = String(ref && ref.breederId || '').trim();
      if (id) kittenRefs.push(id);
    }
  }

  if (kittenRefs.length > 0) {
    const hasActive = kittenRefs.some((id) => {
      const live = kittensById.get(id);
      if (!live) return false;
      const status = String(live.status || '').toLowerCase();
      return status === 'available' || status === 'reserved' || status === 'pending' || status === 'sale';
    });
    return hasActive ? '育成中' : '卒業';
  }

  return '育成中';
}

function extractYouTubeIds(html) {
  const ids = new Set();
  const text = String(html || '');
  let m;

  const dataYtRe = /data-yt=(["'])([a-zA-Z0-9_-]{11})\1/g;
  while ((m = dataYtRe.exec(text)) !== null) ids.add(m[2]);

  const urlRe = /(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:[^"'\s>]*?&amp;|[^"'\s>]*?&)?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/g;
  while ((m = urlRe.exec(text)) !== null) ids.add(m[1]);

  return [...ids];
}

// Build-time transform: convert the admin editor's eager `.yt-embed` iframe block
// into the site-standard lazy-load `.yt-facade` pattern (see blog/siberian-grooming-basics.html;
// the .yt-facade click handler lives in i18n.js, which diary pages load). This keeps diary
// video embeds off the critical path — no eager YouTube iframe ships. Non-YouTube iframes and
// any content outside a `.yt-embed` wrapper are left untouched. The emitted markup carries
// data-yt="<id>", so extractYouTubeIds() still finds every id → VideoObject schema survives.
function facadeMarkup(id) {
  return '<div class="yt-video-wrap" style="max-width:560px;margin:8px auto 24px;border-radius:12px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.1)">'
    + `<div class="yt-facade" data-yt="${id}" role="button" tabindex="0" aria-label="動画を再生">`
    + `<img src="https://i.ytimg.com/vi/${id}/hqdefault.jpg" alt="" loading="lazy" width="480" height="360">`
    + '<span class="yt-play" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></span>'
    + '</div></div>';
}

function transformYouTubeEmbeds(html) {
  const text = String(html || '');
  if (text.indexOf('yt-embed') === -1) return text;
  // Match each `<div class="yt-embed" ...> … </div>` block (the editor's eager wrapper).
  // [^>]* on the opening tag tolerates the inline style attr; [\s\S]*? is non-greedy so
  // adjacent blocks don't merge. Only rewrite when the block contains a YouTube /embed/<id>
  // (or youtu.be/watch) iframe; otherwise leave the block as-is.
  const blockRe = /<div class="yt-embed"[^>]*>[\s\S]*?<\/div>/g;
  return text.replace(blockRe, (block) => {
    const idMatch = block.match(/(?:youtube(?:-nocookie)?\.com\/(?:embed\/|watch\?(?:[^"'\s>]*?&amp;|[^"'\s>]*?&)?v=|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    if (!idMatch) return block; // no YouTube id found → leave untouched
    return facadeMarkup(idMatch[1]);
  });
}

// Diary bodies are authored as rich HTML in the admin editor and arrive here from KV.
// Treat that HTML as untrusted at the final publish boundary: keep the small editorial
// vocabulary the editor needs, rebuild every allowed tag/attribute, and drop active
// elements. The sanitizer intentionally has no passthrough path for unknown markup.
const DIARY_RICH_TEXT_TAGS = new Set([
  'p', 'h2', 'h3', 'h4',
  'ul', 'ol', 'li', 'blockquote',
  'strong', 'b', 'em', 'i', 'u', 's', 'sub', 'sup',
  'br', 'hr', 'a', 'img', 'figure', 'figcaption', 'div', 'span'
]);
const DIARY_VOID_TAGS = new Set(['br', 'hr', 'img']);
const DIARY_DROP_CONTENT_TAGS = new Set([
  'script', 'style', 'template', 'iframe', 'object', 'svg', 'math',
  'noscript', 'noembed', 'xmp', 'plaintext', 'textarea', 'title',
  'form', 'video', 'audio', 'select'
]);

function decodeBasicHtmlEntities(value) {
  const named = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
    colon: ':', tab: '\t', newline: '\n'
  };
  let text = String(value == null ? '' : value);

  // Repeat so encodings such as &amp;#x6a;avascript: cannot hide a scheme.
  for (let pass = 0; pass < 4; pass++) {
    const decoded = text
      .replace(/&#x([0-9a-f]{1,7});?/gi, (match, digits) => {
        const codePoint = Number.parseInt(digits, 16);
        return codePoint > 0 && codePoint <= 0x10ffff && !(codePoint >= 0xd800 && codePoint <= 0xdfff)
          ? String.fromCodePoint(codePoint)
          : '\ufffd';
      })
      .replace(/&#([0-9]{1,7});?/g, (match, digits) => {
        const codePoint = Number.parseInt(digits, 10);
        return codePoint > 0 && codePoint <= 0x10ffff && !(codePoint >= 0xd800 && codePoint <= 0xdfff)
          ? String.fromCodePoint(codePoint)
          : '\ufffd';
      })
      .replace(/&(amp|lt|gt|quot|apos|nbsp|colon|tab|newline);?/gi, (match, name) => named[name.toLowerCase()]);
    if (decoded === text) break;
    text = decoded;
  }
  return text;
}

function escapeRichText(value) {
  // Preserve already-authored HTML entities in text nodes while escaping literal markup.
  return escapeHtml(value).replace(/&amp;(#(?:x[0-9a-f]+|[0-9]+)|[a-z][a-z0-9]+);/gi, '&$1;');
}

function safeDiaryUrl(value, kind) {
  const decoded = decodeBasicHtmlEntities(value).trim();
  if (!decoded || decoded.startsWith('\\\\')) return '';

  // HTML URL parsing ignores ASCII controls/whitespace around and inside a scheme.
  // Remove them (plus common invisible separators) before deciding the protocol.
  const protocolProbe = decoded.replace(/[\u0000-\u0020\u007f-\u009f\u00a0\u1680\u2000-\u200d\u2028\u2029\u202f\u205f\u2060\u3000\ufeff]/g, '');
  const scheme = protocolProbe.match(/^([a-z][a-z0-9+.-]*):/i);
  if (!scheme) return decoded;

  const allowed = kind === 'image'
    ? new Set(['http', 'https'])
    : new Set(['http', 'https', 'mailto', 'tel']);
  return allowed.has(scheme[1].toLowerCase()) ? decoded : '';
}

function parseDiaryAttributes(source) {
  const attrs = new Map();
  const attrRe = /([a-z_:][a-z0-9:._-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'`=<>]+)))?/gi;
  let match;
  while ((match = attrRe.exec(source)) !== null) {
    const name = match[1].toLowerCase();
    if (attrs.has(name)) continue;
    attrs.set(name, match[2] !== undefined ? match[2] : match[3] !== undefined ? match[3] : match[4] !== undefined ? match[4] : '');
  }
  return attrs;
}

function safeDiaryClass(value) {
  const classes = decodeBasicHtmlEntities(value)
    .split(/\s+/)
    .filter((name) => /^[a-z0-9_-]{1,64}$/i.test(name))
    .slice(0, 8);
  return classes.join(' ');
}

function positiveDiaryDimension(value) {
  const text = String(value || '').trim();
  if (!/^\d{1,4}$/.test(text)) return '';
  const number = Number(text);
  return number >= 1 && number <= 4096 ? String(number) : '';
}

function safeDiaryTextAttribute(value, maxLength) {
  return decodeBasicHtmlEntities(value).replace(/[\u0000-\u001f\u007f]/g, '').slice(0, maxLength);
}

function buildSafeDiaryOpeningTag(tag, attrs) {
  const output = [];
  const className = safeDiaryClass(attrs.get('class') || '');
  if (className) output.push(`class="${escapeHtml(className)}"`);

  if (tag === 'a') {
    const href = safeDiaryUrl(attrs.get('href') || '', 'link');
    if (href) output.push(`href="${escapeHtml(href)}"`);
    const title = safeDiaryTextAttribute(attrs.get('title') || '', 300);
    if (title) output.push(`title="${escapeHtml(title)}"`);
    const ariaLabel = safeDiaryTextAttribute(attrs.get('aria-label') || '', 300);
    if (ariaLabel) output.push(`aria-label="${escapeHtml(ariaLabel)}"`);
    if (href && String(attrs.get('target') || '').toLowerCase() === '_blank') {
      output.push('target="_blank"', 'rel="noopener noreferrer"');
    }
  } else if (tag === 'img') {
    const src = safeDiaryUrl(attrs.get('src') || '', 'image');
    if (!src) return '';
    // Put URL/text/dimensions in a stable order and set safe loading defaults.
    output.push(`src="${escapeHtml(src)}"`);
    const alt = safeDiaryTextAttribute(attrs.get('alt') || '', 500);
    output.push(`alt="${escapeHtml(alt)}"`);
    const title = safeDiaryTextAttribute(attrs.get('title') || '', 300);
    if (title) output.push(`title="${escapeHtml(title)}"`);
    const width = positiveDiaryDimension(attrs.get('width'));
    const height = positiveDiaryDimension(attrs.get('height'));
    if (width) output.push(`width="${width}"`);
    if (height) output.push(`height="${height}"`);
    output.push('loading="lazy"', 'decoding="async"');
  }

  return `<${tag}${output.length ? ` ${output.join(' ')}` : ''}>`;
}

function findDiaryTagEnd(html, start) {
  let quote = '';
  for (let i = start + 1; i < html.length; i++) {
    const char = html[i];
    if (quote) {
      if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === '>') return i;
  }
  return -1;
}

function sanitizeDiaryAllowlist(html) {
  const source = String(html || '');
  let output = '';
  let position = 0;
  let suppressedTag = '';

  while (position < source.length) {
    const tagStart = source.indexOf('<', position);
    if (tagStart === -1) {
      if (!suppressedTag) output += escapeRichText(source.slice(position));
      break;
    }
    if (!suppressedTag) output += escapeRichText(source.slice(position, tagStart));

    if (source.startsWith('<!--', tagStart)) {
      const commentEnd = source.indexOf('-->', tagStart + 4);
      position = commentEnd === -1 ? source.length : commentEnd + 3;
      continue;
    }

    const tagEnd = findDiaryTagEnd(source, tagStart);
    if (tagEnd === -1) {
      if (!suppressedTag) output += escapeRichText(source.slice(tagStart));
      break;
    }

    const token = source.slice(tagStart, tagEnd + 1);
    const parsed = token.match(/^<\s*(\/?)\s*([a-z][a-z0-9:-]*)\b([\s\S]*?)>$/i);
    position = tagEnd + 1;
    if (!parsed) {
      if (!suppressedTag) output += escapeRichText(token);
      continue;
    }

    const closing = parsed[1] === '/';
    const tag = parsed[2].toLowerCase();
    if (suppressedTag) {
      if (closing && tag === suppressedTag) suppressedTag = '';
      continue;
    }
    if (!closing && DIARY_DROP_CONTENT_TAGS.has(tag)) {
      suppressedTag = tag;
      continue;
    }
    if (!DIARY_RICH_TEXT_TAGS.has(tag)) continue;

    if (closing) {
      if (!DIARY_VOID_TAGS.has(tag)) output += `</${tag}>`;
      continue;
    }

    const attrSource = parsed[3].replace(/\/\s*$/, '');
    output += buildSafeDiaryOpeningTag(tag, parseDiaryAttributes(attrSource));
  }

  return output;
}

function sanitizeDiaryHtml(html) {
  const transformed = transformYouTubeEmbeds(html);
  let tokenPrefix = '\ue000FULUCK_DIARY_YOUTUBE_';
  while (transformed.includes(tokenPrefix)) tokenPrefix += '_';

  const facades = [];
  const tokenized = transformed.replace(
    /<div class="yt-video-wrap"[^>]*>\s*<div class="yt-facade"\s+data-yt="([a-zA-Z0-9_-]{11})"[\s\S]*?<\/div><\/div>/g,
    (block, id) => {
      const token = `${tokenPrefix}${facades.length}\ue001`;
      facades.push({ token, html: facadeMarkup(id) });
      return token;
    }
  );

  let sanitized = sanitizeDiaryAllowlist(tokenized);
  for (const facade of facades) sanitized = sanitized.split(facade.token).join(facade.html);
  return sanitized;
}

function jsonLdScript(data) {
  return `  <script type="application/ld+json">\n${safeJsonForHtmlScript(data, 2)}\n  </script>`;
}

// -- Template --------------------------------------------------------------

// Asset cache-version map, read from the live blog template so diary pages
// never drift from the rest of the site when style.css / i18n.js / nav.* are bumped.
let ASSET_VERSIONS = {};
function ver(file, fallback) {
  return (ASSET_VERSIONS && ASSET_VERSIONS[file]) || fallback;
}
function extractAssetVersions(html) {
  const map = {};
  const re = /\/?((?:[\w-]+\/)?[\w.-]+\.(?:css|js))\?v=([\w.-]+)/g; // optional leading slash: capture relative refs too
  let m;
  while ((m = re.exec(html))) { map[m[1]] = m[2]; }
  return map;
}

function extractBlogChrome() {
  const templatePath = path.join(SITE_DIR, 'blog', 'siberian-grooming-basics.html');
  const html = fs.readFileSync(templatePath, 'utf-8');

  ASSET_VERSIONS = extractAssetVersions(html);

  const bodyMatch = html.match(/<body([^>]*)>/);
  const bodyAttrs = bodyMatch ? bodyMatch[1].trim() : 'class="has-mobile-cta"';

  const headerStart = html.indexOf('  <div class="scroll-progress"></div>');
  const headerClose = html.indexOf('</header>', headerStart);
  const headerEnd = headerClose === -1 ? -1 : headerClose + '</header>'.length;
  const footerStart = html.indexOf('  <footer class="footer"', headerEnd);
  const scriptsStart = html.indexOf('  <script src="/i18n.js', footerStart);

  if (headerStart === -1 || headerEnd === -1 || footerStart === -1 || scriptsStart === -1) {
    throw new Error('Could not extract blog article header/footer chrome');
  }

  return {
    bodyAttrs,
    headerHtml: html.substring(headerStart, headerEnd),
    footerHtml: html.substring(footerStart, scriptsStart).trimEnd()
  };
}

function diaryStyles() {
  return `  <style>
 .blog-article { max-width:800px; margin:0 auto; padding:32px 24px 60px; }
 .blog-article h1 { font-size:1.8rem; line-height:1.4; margin-bottom:16px; color:var(--text-heading); }
 .blog-article h2 { font-size:1.35rem; margin:40px 0 16px; padding-bottom:8px; border-bottom:2px solid var(--mint); color:var(--text-heading); }
 .blog-article h3 { font-size:1.1rem; margin:28px 0 12px; color:var(--mint-dark); }
 .blog-article p { line-height:1.9; margin-bottom:16px; color:var(--text-body); }
 .blog-article ul, .blog-article ol { margin:12px 0 20px 24px; line-height:1.8; }
 .blog-article li { margin-bottom:6px; }
 .blog-back { display:inline-block; margin-bottom:20px; color:var(--mint-dark); text-decoration:none; font-size:0.9rem; }
 .blog-back:hover { text-decoration:underline; }
 .blog-meta { display:flex; gap:12px; align-items:center; margin-bottom:24px; font-size:0.85rem; color:var(--text-note); flex-wrap:wrap; }
 .blog-meta-cat { background:var(--mint-bg, var(--mint-milk)); color:var(--mint-dark); padding:3px 10px; border-radius:20px; font-weight:500; }
 .blog-cover { width:100%; max-height:360px; object-fit:cover; border-radius:14px; margin-bottom:28px; }
 .diary-excerpt { margin:-4px 0 28px; color:var(--text-note-strong, var(--text-body)); font-size:1rem; line-height:1.8; }
 .diary-content figure { margin:24px 0; }
 .diary-content figcaption { margin-top:8px; font-size:0.85rem; color:var(--text-note); text-align:center; }
 .diary-cats { margin:44px 0 16px; padding:26px; border:1px solid rgba(125,211,192,.34); border-radius:var(--radius-md); background:#fff; box-shadow:var(--shadow-soft); }
 .diary-cats h2 { margin-top:0; }
 .diary-cat-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:14px; margin-top:18px; }
 .diary-cat-card { display:grid; grid-template-columns:72px 1fr; gap:12px; align-items:center; min-height:92px; padding:12px; border:1px solid #edf5f2; border-radius:12px; background:linear-gradient(135deg,#fff 0%,#f9fffc 100%); color:inherit; text-decoration:none; }
 .diary-cat-card:hover { transform:translateY(-1px); box-shadow:var(--shadow-card); }
 .diary-cat-photo { width:72px; height:72px; border-radius:12px; overflow:hidden; background:var(--mint-milk); display:flex; align-items:center; justify-content:center; color:var(--mint-dark); }
 .diary-cat-photo img { width:100%; height:100%; object-fit:cover; }
 .diary-cat-name { display:block; font-weight:700; color:var(--text-heading); line-height:1.45; }
 .diary-cat-type { display:block; margin-top:3px; font-size:0.82rem; color:var(--text-note); }
 .diary-badge { display:inline-flex; align-items:center; gap:4px; margin-top:8px; padding:2px 9px; border-radius:999px; font-size:0.76rem; font-weight:700; }
 .diary-badge-parent { color:#4e6f8f; background:var(--blueberry-milk); }
 .diary-badge-available { color:#357c68; background:var(--mint-milk); }
 .diary-badge-reserved { color:#8a6500; background:var(--mango-milk); }
 .diary-badge-graduated { color:#7a638f; background:var(--taro-milk); }
 .diary-empty-note { color:var(--text-note); margin:8px 0 0; }
 .diary-timeline-nav { display:grid; grid-template-columns:1fr 1fr; gap:14px; margin:36px 0 10px; padding-top:24px; border-top:1px solid #edf1ef; }
 .diary-timeline-link { display:flex; flex-direction:column; gap:4px; padding:16px; border-radius:12px; border:1px solid #edf5f2; background:#fff; color:inherit; text-decoration:none; min-height:96px; }
 .diary-timeline-link:hover { border-color:var(--mint); box-shadow:var(--shadow-soft); }
 .diary-timeline-kicker { font-size:0.78rem; color:var(--mint-dark); font-weight:700; }
 .diary-timeline-title { font-weight:700; color:var(--text-heading); line-height:1.45; }
 .diary-timeline-date { font-size:0.82rem; color:var(--text-note); }
 .blog-cta-box { background:linear-gradient(135deg,#f0faf7 0%,#fef6f0 100%); border-radius:16px; padding:32px 28px; margin:40px 0; text-align:center; border:1px solid #e8f5f0; }
 .blog-cta-icon { font-size:2.5rem; margin-bottom:12px; color:var(--mint-dark); }
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
 .diary-index { max-width:1100px; margin:0 auto; padding:34px 24px 70px; }
 .diary-index-hero { margin-bottom:30px; }
 .diary-index-hero .sec-tag { color:var(--mint-dark); font-weight:700; letter-spacing:0; }
 .diary-index-hero h1 { color:var(--text-heading); font-size:2rem; line-height:1.35; margin:8px 0 12px; }
 .diary-index-hero p { color:var(--text-body); max-width:680px; }
 .diary-litter-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); gap:20px; }
 .diary-litter-card { display:flex; flex-direction:column; overflow:hidden; border:1px solid #edf5f2; border-radius:var(--radius-md); background:#fff; box-shadow:var(--shadow-soft); color:inherit; text-decoration:none; }
 .diary-litter-card:hover { transform:translateY(-2px); box-shadow:var(--shadow-card); }
 .diary-litter-cover { aspect-ratio:4/3; background:var(--mint-milk); display:flex; align-items:center; justify-content:center; color:var(--mint-dark); overflow:hidden; }
 .diary-litter-cover img { width:100%; height:100%; object-fit:cover; }
 .diary-litter-body { padding:18px; }
 .diary-litter-top { display:flex; justify-content:space-between; gap:10px; align-items:flex-start; margin-bottom:8px; }
 .diary-litter-status { flex:0 0 auto; border-radius:999px; padding:3px 10px; background:var(--mint-milk); color:var(--mint-dark); font-size:0.76rem; font-weight:700; white-space:nowrap; }
 .diary-litter-title { font-size:1.08rem; color:var(--text-heading); line-height:1.45; margin:0; }
 .diary-litter-meta { color:var(--text-note); font-size:0.86rem; margin:8px 0 0; }
 .diary-litter-excerpt { color:var(--text-body); font-size:0.9rem; line-height:1.7; margin:12px 0 0; }
 .diary-empty-index { padding:38px 28px; border:1px solid #edf5f2; border-radius:var(--radius-md); background:#fff; box-shadow:var(--shadow-soft); }
 @media (max-width: 768px) {
 .blog-article h1 { font-size:1.4rem; }
 .diary-cats { padding:20px; }
 .diary-timeline-nav { grid-template-columns:1fr; }
 .diary-index-hero h1 { font-size:1.55rem; }
 }
  </style>`;
}

function buildHead({ title, description, pageUrl, image, jsonLd, ogType = 'article' }) {
  const imageUrl = absoluteUrl(image) || `${BASE_URL}/images/ogp.jpg`;
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <meta name="keywords" content="">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:type" content="${escapeHtml(ogType)}">
  <meta property="og:url" content="${escapeHtml(pageUrl)}">
  <meta property="og:image" content="${escapeHtml(imageUrl)}">
  <meta property="og:site_name" content="サイベリアン｜大阪・福楽キャッテリー">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="theme-color" content="#7DD3C0">
  <link rel="canonical" href="${escapeHtml(pageUrl)}">
  <link rel="alternate" hreflang="ja" href="${escapeHtml(pageUrl)}">
  <link rel="alternate" hreflang="x-default" href="${escapeHtml(pageUrl)}">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="preload" as="style" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Noto+Sans+JP:wght@400;500;700&display=swap" onload="this.onload=null;this.rel='stylesheet'">
  <noscript><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Noto+Sans+JP:wght@400;500;700&display=swap" rel="stylesheet"></noscript>
  <link rel="stylesheet" href="/style.css?v=${ver('style.css', '20260711b')}">
  <link rel="stylesheet" href="/nav.css?v=${ver('nav.css', '20260628a')}">
  <link rel="stylesheet" href="/guide/guide.css?v=${ver('guide/guide.css', '20260706a')}">
  <link rel="stylesheet" href="/blog.css?v=${ver('blog.css', '20260706a')}">
  <link rel="icon" type="image/svg+xml" href="${FAVICON_HREF}">
  <script defer src="/nav.js?v=${ver('nav.js', '20260711b')}"></script>
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-EK459EK55M"></script>
  <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-EK459EK55M');</script>
${jsonLd.join('\n')}
${diaryStyles()}
</head>`;
}

// -- Cat data --------------------------------------------------------------

function buildMaps(kittens, parents) {
  const kittensById = new Map();
  const parentsById = new Map();

  for (const kitten of kittens || []) {
    const id = String(kitten.breederId || kitten.id || '').trim();
    if (id) kittensById.set(id, kitten);
  }

  for (const parent of parents || []) {
    const id = String(parent.id || '').trim();
    if (id) parentsById.set(id, parent);
  }

  return { kittensById, parentsById };
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function renderPhoto(photo, alt) {
  if (photo) {
    return `<img src="${escapeHtml(photo)}" alt="${escapeHtml(alt)}" loading="lazy">`;
  }
  return '<i class="ico ico-cat" aria-hidden="true"></i>';
}

function renderCatCards(entry, maps) {
  const parentRefs = entry.cats && Array.isArray(entry.cats.parents) ? entry.cats.parents : [];
  const kittenRefs = entry.cats && Array.isArray(entry.cats.kittens) ? entry.cats.kittens : [];
  const cards = [];

  for (const parentRef of unique(parentRefs.map((ref) => typeof ref === 'object' ? ref.id : ref))) {
    const parent = maps.parentsById.get(String(parentRef));
    if (!parent) continue;
    const photo = getCoverPhoto(parent);
    const name = parent.name || parent.id;
    cards.push(`<a class="diary-cat-card" href="/parents.html#${escapeHtml(parent.id)}">
      <span class="diary-cat-photo">${renderPhoto(photo, `${name} 親猫`)}</span>
      <span>
        <span class="diary-cat-name">${escapeHtml(name)}</span>
        <span class="diary-cat-type">${escapeHtml(parent.breed || '親猫')}</span>
        <span class="diary-badge diary-badge-parent">親猫</span>
      </span>
    </a>`);
  }

  const seenKittens = new Set();
  for (const snapshot of kittenRefs) {
    const breederId = String(snapshot && snapshot.breederId || '').trim();
    if (!breederId || seenKittens.has(breederId)) continue;
    seenKittens.add(breederId);

    const live = maps.kittensById.get(breederId);
    const source = live || snapshot || {};
    const photo = getCoverPhoto(live) || normalizeAssetUrl(snapshot.photo);
    const name = snapshot.name || live && live.name || live && live.breed || breederId;
    const badge = kittenStatusBadge(live && live.status, Boolean(live));
    const typeLine = live
      ? [live.breed, live.color, live.gender].filter(Boolean).join(' ・ ')
      : '成長記録の子猫';

    cards.push(`<a class="diary-cat-card" href="/kittens/${escapeHtml(breederId)}.html">
      <span class="diary-cat-photo">${renderPhoto(photo, `${name} 子猫`)}</span>
      <span>
        <span class="diary-cat-name">${escapeHtml(name || breederId)}</span>
        <span class="diary-cat-type">${escapeHtml(typeLine || source.breederId || breederId)}</span>
        <span class="diary-badge diary-badge-${escapeHtml(badge.key)}">${escapeHtml(badge.text)}</span>
      </span>
    </a>`);
  }

  if (cards.length === 0) {
    return `<section class="diary-cats">
      <h2>この記事に登場した猫</h2>
      <p class="diary-empty-note">この記録に紐づく猫情報はまだありません。</p>
    </section>`;
  }

  return `<section class="diary-cats">
      <h2>この記事に登場した猫</h2>
      <div class="diary-cat-grid">
${cards.join('\n')}
      </div>
    </section>`;
}

// -- Entry pages -----------------------------------------------------------

function renderTimelineNav(entry, groupedEntries) {
  const groupId = getGroupId(entry);
  if (!groupId) return '';
  const groupEntries = sortEntriesAsc(groupedEntries.get(groupId) || []);
  if (groupEntries.length <= 1) return '';

  const idx = groupEntries.findIndex((item) => normalizeSlug(item.slug) === normalizeSlug(entry.slug));
  if (idx === -1) return '';
  const prev = idx > 0 ? groupEntries[idx - 1] : null;
  const next = idx < groupEntries.length - 1 ? groupEntries[idx + 1] : null;
  if (!prev && !next) return '';

  const link = (item, kicker) => item ? `<a class="diary-timeline-link" href="${escapeHtml(pagePathForEntry(item))}">
        <span class="diary-timeline-kicker">${escapeHtml(kicker)}</span>
        <span class="diary-timeline-title">${escapeHtml(localizedField(item.title, 'ja', '成長日記'))}</span>
        <span class="diary-timeline-date">${escapeHtml(displayDate(entryDate(item)))}</span>
      </a>` : '<span></span>';

  return `<nav class="diary-timeline-nav" aria-label="同じきょうだいの成長記録">
      ${link(prev, '前の記録')}
      ${link(next, '次の記録')}
    </nav>`;
}

function diaryCtaBox() {
  return `<div class="blog-cta-box">
      <div class="blog-cta-icon"><i class="ico ico-cat" aria-hidden="true"></i></div>
      <h3 class="blog-cta-title">子猫の成長を見ながら、見学の相談もできます</h3>
      <p class="blog-cta-text">気になる子や同じきょうだいについて、LINEまたは見学予約からお気軽にご相談ください。</p>
      <div class="blog-cta-buttons">
        <a href="/kittens.html" class="blog-cta-btn blog-cta-btn-primary"><i class="ico ico-paw-print" aria-hidden="true"></i> 子猫一覧を見る</a>
        <a href="/booking.html" class="blog-cta-btn blog-cta-btn-primary"><i class="ico ico-calendar-check" aria-hidden="true"></i> 見学を予約する</a>
        <a href="https://page.line.me/915hnnlk?oat__id=5765672&openQrModal=true" class="blog-cta-btn blog-cta-btn-line" target="_blank" rel="noopener"><i class="ico ico-message-circle" aria-hidden="true"></i> LINEで相談する</a>
      </div>
    </div>`;
}

function buildEntryJsonLd(entry, title, excerpt, coverImage, bodyJa) {
  const pageUrl = pageUrlForEntry(entry);
  const published = entry.publishedAt || entry.date || todayISO();
  const article = {
    "@context": "https://schema.org",
    "@type": ["BlogPosting", "Article"],
    "headline": title,
    "description": excerpt,
    "image": absoluteUrl(coverImage) || `${BASE_URL}/images/ogp.jpg`,
    "author": { "@type": "Organization", "name": "福楽キャッテリー", "url": BASE_URL },
    "publisher": {
      "@type": "Organization",
      "name": "福楽キャッテリー",
      "logo": { "@type": "ImageObject", "url": `${BASE_URL}/images/ogp.jpg` }
    },
    "datePublished": published,
    "dateModified": entry.updatedAt || entry.modifiedAt || published,
    "inLanguage": "ja",
    "mainEntityOfPage": { "@type": "WebPage", "@id": pageUrl }
  };

  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "ホーム", "item": `${BASE_URL}/` },
      { "@type": "ListItem", "position": 2, "name": "成長日記", "item": `${BASE_URL}/diary/` },
      { "@type": "ListItem", "position": 3, "name": title, "item": pageUrl }
    ]
  };

  const videos = extractYouTubeIds(bodyJa).map((id) => ({
    "@context": "https://schema.org",
    "@type": "VideoObject",
    "name": `${title} 動画`,
    "description": excerpt || title,
    "thumbnailUrl": `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    "uploadDate": published,
    "contentUrl": `https://www.youtube.com/watch?v=${id}`,
    "embedUrl": `https://www.youtube-nocookie.com/embed/${id}`,
    "publisher": {
      "@type": "Organization",
      "name": "福楽キャッテリー",
      "logo": { "@type": "ImageObject", "url": `${BASE_URL}/images/ogp.jpg` }
    }
  }));

  return [article, breadcrumb, ...videos].map(jsonLdScript);
}

function buildDiaryEntryHtml(entry, context) {
  const { chrome, groupedEntries, maps } = context;
  const titleJa = localizedField(entry.title, 'ja', '子猫成長日記');
  const excerptJa = localizedField(entry.excerpt, 'ja', '');
  // Sanitize API-authored rich text before either HTML injection or JSON/script embedding.
  // Recognized YouTube wrappers become the trusted lazy facade inside this boundary;
  // extractYouTubeIds still reads its data-yt value for VideoObject schema below.
  const bodyJa = sanitizeDiaryHtml(localizedField(entry.body, 'ja', '<p>本文は準備中です。</p>'));
  const coverImage = normalizeAssetUrl(entry.coverImage);
  const pageUrl = pageUrlForEntry(entry);
  const pageTitle = `${titleJa}｜子猫成長日記｜福楽キャッテリー`;
  const description = excerptJa || `${titleJa}。福楽キャッテリーの子猫成長日記です。`;
  const date = entryDate(entry);
  const dateLabel = displayDate(date);
  const stage = stageText(entry.stage);

  const i18n = {
    en: {
      title: localizedField(entry.title, 'en', titleJa),
      excerpt: localizedField(entry.excerpt, 'en', excerptJa),
      content: sanitizeDiaryHtml(localizedField(entry.body, 'en', bodyJa))
    },
    zh: {
      title: localizedField(entry.title, 'zh', titleJa),
      excerpt: localizedField(entry.excerpt, 'zh', excerptJa),
      content: sanitizeDiaryHtml(localizedField(entry.body, 'zh', bodyJa))
    }
  };

  const jsonLd = buildEntryJsonLd(entry, titleJa, description, coverImage, bodyJa);
  const coverHtml = coverImage
    ? `    <img src="${escapeHtml(coverImage)}" alt="${escapeHtml(titleJa)}" class="blog-cover" width="1200" height="800" loading="eager" fetchpriority="high" decoding="async">\n`
    : '';

  return `${buildHead({ title: pageTitle, description, pageUrl, image: coverImage, jsonLd })}
<body ${chrome.bodyAttrs}>

${chrome.headerHtml}

  <nav class="guide-breadcrumb" aria-label="パンくずリスト">
    <a href="/">ホーム</a> &gt; <a href="/diary/">成長日記</a> &gt; <span>${escapeHtml(titleJa)}</span>
  </nav>

  <article class="blog-article">
${coverHtml}    <div class="blog-meta">
      <span class="blog-meta-cat">${escapeHtml(stage)}</span>
      ${dateLabel ? `<time datetime="${escapeHtml(date)}">${escapeHtml(dateLabel)}</time>` : ''}
    </div>
    <h1>${escapeHtml(titleJa)}</h1>
    ${excerptJa ? `<p class="blog-detail-excerpt diary-excerpt">${escapeHtml(excerptJa)}</p>` : '<p class="blog-detail-excerpt diary-excerpt"></p>'}
    <div class="blog-detail-content diary-content">
${bodyJa}
    </div>

    ${renderCatCards(entry, maps)}
    ${renderTimelineNav(entry, groupedEntries)}
    ${diaryCtaBox()}

    <div class="blog-nav-bottom">
      <a href="/diary/" class="blog-nav-link"><i class="ico ico-library" aria-hidden="true"></i> 成長日記一覧へ戻る</a>
      <a href="/kittens.html" class="blog-nav-link"><i class="ico ico-cat" aria-hidden="true"></i> 子猫を見る</a>
      <a href="/guide/" class="blog-nav-link"><i class="ico ico-book-open" aria-hidden="true"></i> お迎えガイド</a>
    </div>
  </article>

${chrome.footerHtml}

  <script src="/i18n.js?v=${ver('i18n.js', '20260711b')}"></script>
  <script>window._diaryArticleI18n = ${safeJsonForHtmlScript(i18n)}; window._blogArticleI18n = window._diaryArticleI18n;</script>
  <script src="/blog/blog-i18n.js?v=${ver('blog/blog-i18n.js', '20260710b')}"></script>
  <script src="/script.js?v=${ver('script.js', '20260711b')}"></script>

  <div class="mobile-cta-bar" role="navigation" aria-label="クイック連絡">
    <div class="mobile-cta-bar-inner">
      <a class="cta-line" href="https://page.line.me/915hnnlk?oat__id=5765672&openQrModal=true" target="_blank" rel="noopener" data-cta="line" aria-label="LINEで相談する">
        <span class="cta-icon"><i class="ico ico-message-circle" aria-hidden="true"></i></span>
        <span data-i18n="cta.line">LINEで相談</span>
      </a>
      <a class="cta-booking" href="/booking.html" data-cta="booking" aria-label="見学を予約する">
        <span class="cta-icon"><i class="ico ico-calendar-check" aria-hidden="true"></i></span>
        <span data-i18n="cta.booking">見学予約</span>
      </a>
    </div>
  </div>
  <script defer src="/mobile-cta.js?v=${ver('mobile-cta.js', '20260711b')}"></script>
</body>
</html>
`;
}

// -- Index -----------------------------------------------------------------

function parentsForLitter(entries, parents, parentsById) {
  const ids = [];
  for (const entry of entries) {
    const refs = entry.cats && Array.isArray(entry.cats.parents) ? entry.cats.parents : [];
    for (const ref of refs) ids.push(String(typeof ref === 'object' ? ref.id : ref || '').trim());
  }

  const resolved = unique(ids).map((id) => parentsById.get(id)).filter(Boolean);
  if (resolved.length > 0) return resolved;

  const groupId = getGroupId(entries[0]);
  if (!groupId) return [];
  return (parents || []).filter((parent) => String(parent.group || '').trim() === groupId);
}

function litterName(groupId, entries, parents, parentsById) {
  const resolvedParents = parentsForLitter(entries, parents, parentsById);
  const names = resolvedParents.map((parent) => parent.name).filter(Boolean);
  if (names.length >= 2) return `${names[0]} × ${names[1]}`;
  if (names.length === 1) return names[0];
  return groupId && !groupId.startsWith('entry:') ? groupId : localizedField(entries[0].title, 'ja', '成長日記');
}

function litterCover(entries, maps) {
  const latest = sortEntriesDesc(entries)[0] || {};
  if (latest.coverImage) return normalizeAssetUrl(latest.coverImage);

  for (const entry of sortEntriesDesc(entries)) {
    const kittenRefs = entry.cats && Array.isArray(entry.cats.kittens) ? entry.cats.kittens : [];
    for (const snapshot of kittenRefs) {
      const breederId = String(snapshot && snapshot.breederId || '').trim();
      const live = breederId ? maps.kittensById.get(breederId) : null;
      const photo = getCoverPhoto(live) || normalizeAssetUrl(snapshot && snapshot.photo);
      if (photo) return photo;
    }

    const parentRefs = entry.cats && Array.isArray(entry.cats.parents) ? entry.cats.parents : [];
    for (const parentRef of parentRefs) {
      const id = String(typeof parentRef === 'object' ? parentRef.id : parentRef || '').trim();
      const parent = maps.parentsById.get(id);
      const photo = getCoverPhoto(parent);
      if (photo) return photo;
    }
  }

  return '';
}

function buildDiaryIndexHtml(entries, context) {
  const { chrome, maps, parents } = context;
  const pageUrl = `${BASE_URL}/diary/`;
  const title = '子猫成長日記｜福楽キャッテリー';
  const description = '福楽キャッテリーで生まれた子猫たちの妊娠、出産、成長の記録をきょうだいごとにまとめています。';
  const jsonLd = [
    jsonLdScript({
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      "@id": `${BASE_URL}/diary/#collection`,
      "name": "子猫成長日記",
      "description": description,
      "url": pageUrl,
      "inLanguage": "ja",
      "isPartOf": { "@id": `${BASE_URL}/#website` },
      "about": [
        { "@id": `${BASE_URL}/#cattery` },
        { "@type": "Thing", "name": "子猫の成長記録" }
      ],
      "publisher": { "@id": `${BASE_URL}/#cattery` }
    }),
    jsonLdScript({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "ホーム", "item": `${BASE_URL}/` },
        { "@type": "ListItem", "position": 2, "name": "成長日記", "item": pageUrl }
      ]
    })
  ];

  const groups = new Map();
  for (const entry of entries) {
    const key = groupKeyForIndex(entry);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(entry);
  }

  const groupCards = [...groups.entries()]
    .map(([key, groupEntries]) => {
      const sorted = sortEntriesDesc(groupEntries);
      const latest = sorted[0];
      const target = latest || sorted[sorted.length - 1];
      const latestDate = displayDate(entryDate(latest));
      const cover = litterCover(groupEntries, maps);
      const name = litterName(key, groupEntries, parents, maps.parentsById);
      const status = litterStatus(groupEntries, maps.kittensById);
      const excerpt = localizedField(latest.excerpt, 'ja', localizedField(latest.title, 'ja', ''));
      return {
        key,
        latestDate,
        sortValue: sortDateValue(entryDate(latest)),
        html: `<a class="diary-litter-card" href="${escapeHtml(pagePathForEntry(target))}">
          <span class="diary-litter-cover">${cover ? `<img src="${escapeHtml(cover)}" alt="${escapeHtml(name)}" loading="lazy">` : '<i class="ico ico-paw-print" aria-hidden="true"></i>'}</span>
          <span class="diary-litter-body">
            <span class="diary-litter-top">
              <strong class="diary-litter-title">${escapeHtml(name)}</strong>
              <span class="diary-litter-status">${escapeHtml(status)}</span>
            </span>
            ${latestDate ? `<span class="diary-litter-meta">最新更新 ${escapeHtml(latestDate)}</span>` : ''}
            ${excerpt ? `<span class="diary-litter-excerpt">${escapeHtml(excerpt)}</span>` : ''}
          </span>
        </a>`
      };
    })
    .sort((a, b) => b.sortValue - a.sortValue);

  const listingHtml = groupCards.length > 0
    ? `<div class="diary-litter-grid">\n${groupCards.map((card) => card.html).join('\n')}\n      </div>`
    : `<div class="diary-empty-index">
        <h2 data-i18n="diary.emptyHeading">公開中の成長記録はまだありません</h2>
        <p data-i18n="diary.emptyBody">出産や成長の記録が公開されると、こちらできょうだいごとのタイムラインとして読めるようになります。</p>
        <p><a href="/kittens.html" class="blog-nav-link" data-i18n="diary.emptyButton"><i class="ico ico-cat" aria-hidden="true"></i> 現在紹介中の子猫を見る</a></p>
      </div>`;

  return `${buildHead({ title, description, pageUrl, image: '/images/ogp.jpg', jsonLd, ogType: 'website' })}
<body ${chrome.bodyAttrs}>

${chrome.headerHtml}

  <nav class="guide-breadcrumb" aria-label="パンくずリスト">
    <a href="/">ホーム</a> &gt; <span>成長日記</span>
  </nav>

  <main class="diary-index">
    <section class="diary-index-hero">
      <span class="sec-tag">Kitten Diary</span>
      <h1 data-i18n="diary.title">子猫成長日記</h1>
      <p data-i18n="diary.heroSub">妊娠から出産、週ごとの成長まで。福楽キャッテリーで生まれた子猫たちの記録を、きょうだいごとのタイムラインでまとめています。</p>
    </section>
    ${listingHtml}
  </main>

${chrome.footerHtml}

  <script src="/i18n.js?v=${ver('i18n.js', '20260711b')}"></script>
  <script src="/script.js?v=${ver('script.js', '20260711b')}"></script>

  <div class="mobile-cta-bar" role="navigation" aria-label="クイック連絡">
    <div class="mobile-cta-bar-inner">
      <a class="cta-line" href="https://page.line.me/915hnnlk?oat__id=5765672&openQrModal=true" target="_blank" rel="noopener" data-cta="line" aria-label="LINEで相談する">
        <span class="cta-icon"><i class="ico ico-message-circle" aria-hidden="true"></i></span>
        <span data-i18n="cta.line">LINEで相談</span>
      </a>
      <a class="cta-booking" href="/booking.html" data-cta="booking" aria-label="見学を予約する">
        <span class="cta-icon"><i class="ico ico-calendar-check" aria-hidden="true"></i></span>
        <span data-i18n="cta.booking">見学予約</span>
      </a>
    </div>
  </div>
  <script defer src="/mobile-cta.js?v=${ver('mobile-cta.js', '20260711b')}"></script>
</body>
</html>
`;
}

// -- Sitemap + homepage ----------------------------------------------------

function updateSitemap(entries) {
  const filepath = path.join(SITE_DIR, 'sitemap.xml');
  if (!fs.existsSync(filepath)) return;

  const marker = '<!-- 成長日記 -->';
  const endMarker = '<!-- /成長日記 -->';
  const today = todayISO();
  let xml = fs.readFileSync(filepath, 'utf-8');

  // Honest lastmod: reuse the stored date when the diary page's content is unchanged
  // (asset-version bumps stripped before hashing). Shares tools/sitemap-lastmod.json
  // with generate-site.js; generate-site runs first and this run preserves its keys.
  const store = createLastmodStore(SITE_DIR, today);

  const diaryEntries = `  ${marker}
  <url>
    <loc>${BASE_URL}/diary/</loc>
    <lastmod>${store.lastmodForUrl(`${BASE_URL}/diary/`)}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>
${sortEntriesDesc(entries).map((entry) => {
    const loc = `${BASE_URL}${pagePathForEntry(entry)}`;
    return `  <url>
    <loc>${escapeHtml(loc)}</loc>
    <lastmod>${store.lastmodForUrl(loc)}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.6</priority>
  </url>`;
  }).join('\n')}
  ${endMarker}
`;

  const markerIdx = xml.indexOf(marker);
  if (markerIdx !== -1) {
    // Replace only the diary-owned block. The diary marker lives before the kitten
    // and blog sections in the shared sitemap; the old implementation removed from
    // this marker all the way to </urlset>, silently deleting every later section.
    const blockStart = xml.lastIndexOf('\n', markerIdx) + 1;
    const explicitEndIdx = xml.indexOf(endMarker, markerIdx + marker.length);
    let blockEnd;

    if (explicitEndIdx !== -1) {
      const newlineAfterEnd = xml.indexOf('\n', explicitEndIdx + endMarker.length);
      blockEnd = newlineAfterEnd === -1 ? xml.length : newlineAfterEnd + 1;
    } else {
      // One-time migration for sitemaps emitted before the closing marker existed:
      // stop at the first section owned by generate-site.js, never at </urlset> when
      // a later owned section is present.
      const nextSectionIdx = [
        xml.indexOf('<!-- 子猫詳細ページ -->', markerIdx + marker.length),
        xml.indexOf('<!-- ブログ記事 -->', markerIdx + marker.length),
      ].filter((idx) => idx !== -1).sort((a, b) => a - b)[0];
      const closeIdx = xml.indexOf('</urlset>', markerIdx + marker.length);
      const boundaryIdx = nextSectionIdx === undefined ? closeIdx : nextSectionIdx;
      blockEnd = boundaryIdx === -1 ? xml.length : xml.lastIndexOf('\n', boundaryIdx) + 1;
    }

    xml = xml.substring(0, blockStart) + diaryEntries + xml.substring(blockEnd);
  } else {
    xml = xml.replace(/\s*<\/urlset>\s*$/, `\n${diaryEntries}</urlset>\n`);
  }
  fs.writeFileSync(filepath, xml, 'utf-8');
  store.save();
  console.log(`  sitemap.xml -> diary index + ${entries.length} diary pages updated`);
}

function ensureHomepageDiscoverability() {
  const filepath = path.join(SITE_DIR, 'index.html');
  if (!fs.existsSync(filepath)) return;

  let html = fs.readFileSync(filepath, 'utf-8');
  let changed = false;

  if (!html.includes('href="diary/" class="nav-link"')) {
    const from = '        <a href="blog.html" class="nav-link" data-i18n="nav.blog">知識ライブラリ</a>';
    const to = `${from}\n        <a href="diary/" class="nav-link">成長日記</a>`;
    if (html.includes(from)) {
      html = html.replace(from, to);
      changed = true;
    }
  }

  if (!html.includes('href="diary/" class="mobile-nav-link"')) {
    const from = '      <a href="blog.html" class="mobile-nav-link" data-i18n="nav.blog">知識ライブラリ</a>';
    const to = `${from}\n      <a href="diary/" class="mobile-nav-link">成長日記</a>`;
    if (html.includes(from)) {
      html = html.replace(from, to);
      changed = true;
    }
  }

  if (!html.includes('href="diary/">成長日記</a>')) {
    const from = '          <a href="blog.html" data-i18n="nav.blog">知識ライブラリ</a>';
    const to = `${from}\n          <a href="diary/">成長日記</a>`;
    if (html.includes(from)) {
      html = html.replace(from, to);
      changed = true;
    }
  }

  if (changed) {
    fs.writeFileSync(filepath, html, 'utf-8');
    console.log('  index.html -> 成長日記 nav/footer links added');
  } else {
    console.log('  index.html -> 成長日記 links already present');
  }
}

// -- Generator -------------------------------------------------------------

function normalizeDiaryEntries(diary) {
  const entries = [];
  for (const entry of diary || []) {
    if (!isPublished(entry)) continue;
    const slug = normalizeSlug(entry.slug);
    if (!slug) {
      console.log(`  [warn] diary entry without slug skipped: ${entry.id || '(unknown id)'}`);
      continue;
    }
    entries.push({ ...entry, slug });
  }
  return entries;
}

function groupTimelineEntries(entries) {
  const groups = new Map();
  for (const entry of entries) {
    const groupId = getGroupId(entry);
    if (!groupId) continue;
    if (!groups.has(groupId)) groups.set(groupId, []);
    groups.get(groupId).push(entry);
  }
  return groups;
}

function cleanupDiaryDir(entries) {
  const diaryDir = path.join(SITE_DIR, 'diary');
  fs.mkdirSync(diaryDir, { recursive: true });
  const keep = new Set(entries.map((entry) => `${normalizeSlug(entry.slug)}.html`));
  keep.add('index.html');

  let removed = 0;
  for (const file of fs.readdirSync(diaryDir)) {
    if (!file.endsWith('.html')) continue;
    if (keep.has(file)) continue;
    fs.unlinkSync(path.join(diaryDir, file));
    removed++;
  }
  return removed;
}

function renderDiarySite(data) {
  const diary = asArray(data.diary, ['diary', 'entries', 'items']);
  const kittens = asArray(data.kittens, ['kittens', 'items']);
  const parents = asArray(data.parents, ['parents', 'items']);
  const entries = normalizeDiaryEntries(diary);
  const chrome = extractBlogChrome();
  const maps = buildMaps(kittens, parents);
  const groupedEntries = groupTimelineEntries(entries);
  const diaryDir = path.join(SITE_DIR, 'diary');

  fs.mkdirSync(diaryDir, { recursive: true });

  const context = { chrome, maps, groupedEntries, parents };
  fs.writeFileSync(path.join(diaryDir, 'index.html'), buildDiaryIndexHtml(entries, context), 'utf-8');

  for (const entry of entries) {
    const outputPath = path.join(diaryDir, `${normalizeSlug(entry.slug)}.html`);
    fs.writeFileSync(outputPath, buildDiaryEntryHtml(entry, context), 'utf-8');
  }

  const removed = cleanupDiaryDir(entries);
  updateSitemap(entries);
  ensureHomepageDiscoverability();

  console.log(`  diary/ -> index + ${entries.length} entry pages generated${removed > 0 ? `, ${removed} stale pages removed` : ''}`);
  return { entries, kittens, parents };
}

async function loadData() {
  if (process.env.DIARY_FIXTURE) {
    const fixturePath = path.resolve(process.cwd(), process.env.DIARY_FIXTURE);
    const raw = JSON.parse(fs.readFileSync(fixturePath, 'utf-8'));
    return {
      diary: asArray(raw.diary, ['diary', 'entries', 'items']),
      kittens: asArray(raw.kittens, ['kittens', 'items']),
      parents: asArray(raw.parents, ['parents', 'items'])
    };
  }

  const [diaryResponse, kittensResponse, parentsResponse] = await Promise.all([
    fetchJSON('/api/diary'),
    fetchJSON('/api/kittens'),
    fetchJSON('/api/parents')
  ]);

  const diary = requireArrayPayload(diaryResponse, ['diary', 'entries', 'items'], '/api/diary');
  return {
    diary: validateDiaryEntriesPayload(diary, '/api/diary'),
    kittens: requireArrayPayload(kittensResponse, ['kittens', 'items'], '/api/kittens'),
    parents: requireArrayPayload(parentsResponse, ['parents', 'items'], '/api/parents')
  };
}

async function main() {
  console.log('Fuluck Diary Generator');
  console.log('======================');
  console.log(`  API: ${API_BASE}`);
  console.log(`  Site: ${SITE_DIR}`);
  if (process.env.DIARY_FIXTURE) console.log(`  Fixture: ${process.env.DIARY_FIXTURE}`);
  console.log('');

  const data = await loadData();
  console.log(`  Loaded: ${data.diary.length} diary entries, ${data.kittens.length} kittens, ${data.parents.length} parents`);
  renderDiarySite(data);

  console.log('');
  console.log('======================');
  console.log('Done!');
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}

module.exports = {
  buildDiaryEntryHtml,
  buildDiaryIndexHtml,
  extractYouTubeIds,
  fetchJSON,
  renderDiarySite,
  updateSitemap
};

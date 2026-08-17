export { parseKonekoDetailPage, parseKonekoListPage } from './koneko-standard-html.js';

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtube-nocookie.com', 'www.youtube-nocookie.com', 'youtu.be']);
const VOID_HTML_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
const HTML_TEXT_ELEMENTS = new Set(['script', 'style', 'title', 'textarea', 'xmp', 'iframe', 'noembed', 'noframes', 'noscript']);
const FOREIGN_CONTENT_ELEMENTS = new Set(['svg', 'math']);
const HTML_WHITESPACE = /[\t\n\f\r ]/;
const HTML_WHITESPACE_SPLIT = /[\t\n\f\r ]+/;

function nonBlank(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function escRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function decodeEntities(value) {
  return value
    .replace(/&nbsp;|&#160;|&#xA0;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#x([\da-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal) => String.fromCodePoint(Number(decimal)));
}

export function decodeHtmlText(html, { preserveBreaks = false } = {}) {
  let source = String(html ?? '').replace(/\r\n?/g, '\n');
  source = source.replace(/<!--[\s\S]*?-->/g, '').replace(/<script\b[\s\S]*?<\/script\s*>/gi, '').replace(/<style\b[\s\S]*?<\/style\s*>/gi, '');
  if (preserveBreaks) {
    source = source
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(?:p|div|section|article|li|tr|dt|dd|h[1-6]|header|footer|blockquote)\s*>/gi, '\n\n')
      .replace(/<(?:p|div|section|article|li|tr|dt|dd|h[1-6]|header|footer|blockquote)\b[^>]*>/gi, '\n\n');
  } else {
    source = source.replace(/<br\s*\/?>/gi, ' ');
  }
  source = decodeEntities(source.replace(/<[^>]*>/g, ''));
  if (!preserveBreaks) return source.replace(/[\t\n\r ]+/g, ' ').trim();
  return source
    .split('\n').map(line => line.replace(/[\t ]+/g, ' ').trim()).join('\n')
    .replace(/\n{3,}/g, '\n\n').trim();
}

function classOpening(html, className, tag = '[a-z][a-z0-9]*') {
  const whitespace = '[\\t\\n\\f\\r ]';
  const re = new RegExp(`<(${tag})\\b[^>]*\\bclass\\s*=\\s*["'](?:${whitespace}*|[^"']*${whitespace})${escRegExp(className)}(?=${whitespace}|["'])[^"']*["'][^>]*>`, 'ig');
  return re;
}

function balancedElementContent(html, opening) {
  const tag = opening[1];
  const token = new RegExp(`<\\/?${tag}\\b[^>]*>`, 'ig');
  token.lastIndex = opening.index + opening[0].length;
  let depth = 1;
  const cursor = token.lastIndex;
  let next;
  while ((next = token.exec(html))) {
    if (/^<\//.test(next[0])) depth -= 1;
    else if (!/\/\s*>$/.test(next[0])) depth += 1;
    if (depth === 0) return html.slice(cursor, next.index);
  }
  return null;
}

function extractElementByClass(html, className) {
  const match = classOpening(html, className).exec(html);
  if (!match) return '';
  return balancedElementContent(html, match) ?? html.slice(match.index + match[0].length);
}

function isHtmlWhitespace(value) {
  return typeof value === 'string' && value.length === 1 && HTML_WHITESPACE.test(value);
}

function htmlTagEnd(html, start) {
  let quote = '';
  for (let index = start; index < html.length; index += 1) {
    const character = html[index];
    if (quote) {
      if (character === quote) quote = '';
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === '>') {
      return index + 1;
    }
  }
  return -1;
}

function htmlTagAt(html, start) {
  if (html[start] !== '<') return null;
  let cursor = start + 1;
  const closing = html[cursor] === '/';
  if (closing) cursor += 1;
  if (!/[A-Za-z]/.test(html[cursor] || '')) return null;
  const nameStart = cursor;
  while (/[A-Za-z0-9:-]/.test(html[cursor] || '')) cursor += 1;
  if (!(isHtmlWhitespace(html[cursor]) || html[cursor] === '/' || html[cursor] === '>')) return null;
  const end = htmlTagEnd(html, start);
  if (end === -1) return { incomplete: true };
  const attributes = html.slice(cursor, end - 1);
  const tag = html.slice(nameStart, cursor).toLowerCase();
  return {
    closing,
    tag,
    attributes,
    start,
    end,
    selfClosing: !closing && (VOID_HTML_TAGS.has(tag) || /\/\s*$/.test(attributes)),
  };
}

function parseHtmlAttributes(source) {
  const values = new Map();
  const occurrences = new Map();
  let malformed = false;
  let cursor = 0;

  function record(name, value, hasValue) {
    const occurrence = { value, hasValue };
    const all = occurrences.get(name) || [];
    all.push(occurrence);
    occurrences.set(name, all);
    if (values.has(name)) malformed = true;
    else values.set(name, occurrence);
  }

  while (cursor < source.length) {
    while (isHtmlWhitespace(source[cursor])) cursor += 1;
    if (cursor === source.length) break;
    if (source[cursor] === '/') {
      if (source.slice(cursor + 1).split('').every(isHtmlWhitespace)) break;
      malformed = true;
      cursor += 1;
      continue;
    }
    if (/["'=<>`]/.test(source[cursor])) {
      malformed = true;
      cursor += 1;
      continue;
    }
    const nameStart = cursor;
    while (cursor < source.length && !isHtmlWhitespace(source[cursor]) && !/["'=<>`]/.test(source[cursor])) cursor += 1;
    const name = source.slice(nameStart, cursor).toLowerCase();
    if (!name) {
      malformed = true;
      cursor += 1;
      continue;
    }
    while (isHtmlWhitespace(source[cursor])) cursor += 1;
    let value = '';
    let hasValue = false;
    if (source[cursor] === '=') {
      hasValue = true;
      cursor += 1;
      while (isHtmlWhitespace(source[cursor])) cursor += 1;
      const quote = source[cursor];
      if (quote === '"' || quote === "'") {
        cursor += 1;
        const valueStart = cursor;
        while (cursor < source.length && source[cursor] !== quote) cursor += 1;
        value = source.slice(valueStart, cursor);
        if (cursor === source.length) malformed = true;
        else cursor += 1;
      } else {
        const valueStart = cursor;
        while (cursor < source.length && !isHtmlWhitespace(source[cursor])) {
          if (/["'<>=`]/.test(source[cursor])) {
            malformed = true;
            while (cursor < source.length && !isHtmlWhitespace(source[cursor])) cursor += 1;
            break;
          }
          cursor += 1;
        }
        if (valueStart === cursor) malformed = true;
        value = source.slice(valueStart, cursor);
      }
    }
    record(name, value, hasValue);
  }
  return { values, occurrences, malformed };
}

function htmlAttributes(source) {
  const parsed = parseHtmlAttributes(source);
  return parsed.malformed ? null : parsed.values;
}

function textElementClose(html, tag, start) {
  const closing = new RegExp(`</${escRegExp(tag)}(?=[\\t\\n\\f\\r \/>])`, 'ig');
  closing.lastIndex = start;
  let match;
  while ((match = closing.exec(html))) {
    const token = htmlTagAt(html, match.index);
    if (token?.incomplete) return null;
    if (token?.closing && token.tag === tag) return token;
  }
  return null;
}

function templateClose(html, start) {
  let cursor = start;
  let depth = 1;
  while (cursor < html.length) {
    const tokenStart = html.indexOf('<', cursor);
    if (tokenStart === -1) return null;
    if (html.startsWith('<!--', tokenStart)) {
      const commentEnd = html.indexOf('-->', tokenStart + 4);
      if (commentEnd === -1) return null;
      cursor = commentEnd + 3;
      continue;
    }
    if (html.startsWith('<!', tokenStart) || html.startsWith('<?', tokenStart)) {
      const end = htmlTagEnd(html, tokenStart);
      if (end === -1) return null;
      cursor = end;
      continue;
    }
    const token = htmlTagAt(html, tokenStart);
    if (token?.incomplete) return null;
    if (!token) {
      cursor = tokenStart + 1;
      continue;
    }
    if (token.closing) {
      if (token.tag === 'template') {
        depth -= 1;
        if (depth === 0) return token;
      }
      cursor = token.end;
      continue;
    }
    if (token.tag === 'plaintext') return null;
    if (token.tag === 'template') {
      depth += 1;
      cursor = token.end;
      continue;
    }
    if (!token.selfClosing && HTML_TEXT_ELEMENTS.has(token.tag)) {
      const close = textElementClose(html, token.tag, token.end);
      if (!close) return null;
      cursor = close.end;
      continue;
    }
    cursor = token.end;
  }
  return null;
}

function foreignElementClose(html, tag, start) {
  const stack = [tag];
  let cursor = start;
  while (cursor < html.length) {
    const tokenStart = html.indexOf('<', cursor);
    if (tokenStart === -1) return null;
    if (html.startsWith('<!--', tokenStart)) {
      const commentEnd = html.indexOf('-->', tokenStart + 4);
      if (commentEnd === -1) return null;
      cursor = commentEnd + 3;
      continue;
    }
    if (html.startsWith('<!', tokenStart) || html.startsWith('<?', tokenStart)) {
      const end = htmlTagEnd(html, tokenStart);
      if (end === -1) return null;
      cursor = end;
      continue;
    }
    const token = htmlTagAt(html, tokenStart);
    if (token?.incomplete) return null;
    if (!token) {
      cursor = tokenStart + 1;
      continue;
    }
    if (token.closing) {
      if (FOREIGN_CONTENT_ELEMENTS.has(token.tag)) {
        if (stack.at(-1) !== token.tag) return null;
        stack.pop();
        if (stack.length === 0) return token;
      }
      cursor = token.end;
      continue;
    }
    if (token.tag === 'plaintext') return null;
    if (!token.selfClosing && token.tag === 'template') {
      const close = templateClose(html, token.end);
      if (!close) return null;
      cursor = close.end;
      continue;
    }
    if (!token.selfClosing && HTML_TEXT_ELEMENTS.has(token.tag)) {
      const close = textElementClose(html, token.tag, token.end);
      if (!close) return null;
      cursor = close.end;
      continue;
    }
    if (!token.selfClosing && FOREIGN_CONTENT_ELEMENTS.has(token.tag)) stack.push(token.tag);
    cursor = token.end;
  }
  return null;
}

function walkHtml(html, { onOpen, onClose, onText } = {}) {
  const source = String(html ?? '');
  let cursor = 0;
  while (cursor < source.length) {
    const tokenStart = source.indexOf('<', cursor);
    if (tokenStart === -1) {
      onText?.(source.slice(cursor));
      return true;
    }
    onText?.(source.slice(cursor, tokenStart));
    if (source.startsWith('<!--', tokenStart)) {
      const commentEnd = source.indexOf('-->', tokenStart + 4);
      if (commentEnd === -1) return false;
      cursor = commentEnd + 3;
      continue;
    }
    if (source.startsWith('<!', tokenStart) || source.startsWith('<?', tokenStart)) {
      const end = htmlTagEnd(source, tokenStart);
      if (end === -1) return false;
      cursor = end;
      continue;
    }
    const token = htmlTagAt(source, tokenStart);
    if (token?.incomplete) return false;
    if (!token) {
      onText?.('<');
      cursor = tokenStart + 1;
      continue;
    }
    cursor = token.end;
    if (token.closing) {
      onClose?.(token);
      continue;
    }
    if (token.tag === 'plaintext') return false;
    if (FOREIGN_CONTENT_ELEMENTS.has(token.tag)) {
      if (token.selfClosing) continue;
      const close = foreignElementClose(source, token.tag, token.end);
      if (!close) return false;
      cursor = close.end;
      continue;
    }
    onOpen?.(token);
    if (token.selfClosing) continue;
    const close = token.tag === 'template'
      ? templateClose(source, token.end)
      : HTML_TEXT_ELEMENTS.has(token.tag) ? textElementClose(source, token.tag, token.end) : null;
    if ((token.tag === 'template' || HTML_TEXT_ELEMENTS.has(token.tag)) && !close) return false;
    if (close) {
      onClose?.(close);
      cursor = close.end;
    }
  }
  return true;
}

function absoluteUrl(value, pageUrl) {
  if (!nonBlank(value)) return '';
  try { return new URL(decodeEntities(value.trim()), pageUrl).href; } catch { return ''; }
}

function canonicalYoutubeId(value, pageUrl) {
  if (!nonBlank(value)) return '';
  let url;
  try {
    url = new URL(decodeEntities(value.trim()), pageUrl);
  } catch {
    return '';
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !YOUTUBE_HOSTS.has(url.hostname.toLowerCase())) return '';
  if (url.hostname.toLowerCase() === 'youtu.be') {
    const match = /^\/([A-Za-z0-9_-]{11})$/.exec(url.pathname);
    return match && url.searchParams.getAll('v').length === 0 ? match[1] : '';
  }
  if (url.pathname === '/watch') {
    const values = url.searchParams.getAll('v');
    return values.length === 1 && YOUTUBE_ID.test(values[0]) ? values[0] : '';
  }
  const match = /^\/(?:embed|shorts)\/([A-Za-z0-9_-]{11})$/.exec(url.pathname);
  return match && url.searchParams.getAll('v').length === 0 ? match[1] : '';
}

function youtubeMediaIds(html, pageUrl, { rejectInvalid = false } = {}) {
  const ids = [];
  let malformed = false;
  const complete = walkHtml(html, {
    onOpen({ tag, attributes }) {
      if (!['a', 'iframe', 'video', 'source'].includes(tag)) return;
      const values = htmlAttributes(attributes);
      if (!values) {
        malformed = true;
        return;
      }
      const attribute = tag === 'a' ? values.get('href') : values.get('src') || values.get('href');
      if (!attribute?.hasValue) return;
      const id = canonicalYoutubeId(attribute.value, pageUrl);
      if (!id && rejectInvalid) malformed = true;
      if (id) ids.push(id);
    },
  });
  return { complete, malformed, ids };
}

function productJsonLd(html) {
  const scripts = [...html.matchAll(/<script\b[^>]*\btype\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script\s*>/gi)];
  if (!scripts.length) throw new Error('Product JSON-LD is missing');
  const products = [];
  for (const match of scripts) {
    let value;
    try { value = JSON.parse(match[1].trim()); } catch { throw new Error('malformed JSON-LD'); }
    const candidates = Array.isArray(value) ? value : [value, ...(Array.isArray(value?.['@graph']) ? value['@graph'] : [])];
    for (const candidate of candidates) {
      const type = candidate && candidate['@type'];
      if (type === 'Product' || (Array.isArray(type) && type.includes('Product'))) products.push(candidate);
    }
  }
  if (!products.length) throw new Error('Product JSON-LD is missing');
  return products[0];
}

function productImages(product, pageUrl) {
  const raw = Array.isArray(product.image) ? product.image : [product.image];
  return raw.map(value => absoluteUrl(value, pageUrl)).filter(Boolean);
}

function productPrice(product) {
  const offer = Array.isArray(product.offers) ? product.offers[0] : product.offers;
  const raw = offer?.price ?? product.price;
  if (raw === undefined || raw === null || String(raw).trim() === '') throw new Error('Product price evidence is missing');
  const value = Number(String(raw ?? '').replace(/[,，\s円¥]/g, ''));
  if (!Number.isFinite(value) || value <= 0) throw new Error('Product price evidence is invalid');
  return value;
}

function normalizeDate(value) {
  const match = String(value ?? '').match(/(\d{4})\s*[年\/-]\s*(\d{1,2})\s*[月\/-]\s*(\d{1,2})/);
  if (!match) return '';
  return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
}

function normalizedLabel(value) {
  return decodeHtmlText(value, { preserveBreaks: false }).replace(/[：:：\s]/g, '');
}

function rows(html) {
  const found = [];
  for (const match of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr\s*>/gi)) {
    const cells = [...match[1].matchAll(/<(?:th|td)\b[^>]*>([\s\S]*?)<\/(?:th|td)\s*>/gi)].map(m => decodeHtmlText(m[1]));
    if (cells.length >= 2) found.push({ label: normalizedLabel(cells[0]), value: cells.slice(1).join(' ').trim() });
  }
  for (const match of html.matchAll(/<dl\b[^>]*>([\s\S]*?)<\/dl\s*>/gi)) {
    const label = match[1].match(/<dt\b[^>]*>([\s\S]*?)<\/dt\s*>/i);
    const value = match[1].match(/<dd\b[^>]*>([\s\S]*?)<\/dd\s*>/i);
    if (label && value) found.push({ label: normalizedLabel(label[1]), value: decodeHtmlText(value[1]) });
  }
  return found;
}

function fact(html, labels) {
  const wanted = labels.map(normalizedLabel);
  const row = rows(html).find(item => wanted.includes(item.label));
  return row?.value?.trim() ?? '';
}

function gender(value) {
  const text = value.trim();
  if (/男の子|male/i.test(text)) return '♂';
  if (/女の子|female/i.test(text)) return '♀';
  return text;
}

function youtubeId(html, pageUrl) {
  const evidence = youtubeMediaIds(html, pageUrl);
  return evidence.complete && !evidence.malformed ? evidence.ids[0] || '' : '';
}

function textAfterLabel(source, labels) {
  for (const label of labels) {
    const re = new RegExp(`${escRegExp(label)}(?:\\s*</?[^>]+>\\s*)*(?:[:：]\\s*)?(?:<[^>]+>\\s*)*([^<\\n]+)`, 'i');
    const match = re.exec(source);
    if (match && nonBlank(decodeHtmlText(match[1]))) return decodeHtmlText(match[1]);
  }
  return '';
}

function parents(html) {
  const region = extractElementByClass(html, 'kitten-detail-parents') || extractElementByClass(html, 'parents') || html;
  return {
    papa: textAfterLabel(region, ['パパ猫', '父猫', '父親', 'Father']),
    mama: textAfterLabel(region, ['ママ猫', '母猫', '母親', 'Mother']),
  };
}

function note(html) {
  for (const className of ['pic_detail_appeal', 'recomend_txt', 'kitten-detail-note', 'kitten-detail-short-note', 'note']) {
    const content = extractElementByClass(html, className);
    if (content) return decodeHtmlText(content);
  }
  return fact(html, ['備考', '注記', 'Note', 'Short note']);
}

function longDescription(html) {
  const content = extractElementByClass(html, 'kitten-detail-introduction');
  if (!content) return '';
  return decodeHtmlText(content.replace(/<h[1-6]\b[^>]*>[\s\S]*?<\/h[1-6]\s*>/gi, ''), { preserveBreaks: true });
}

function canonicalRelTokens(attribute) {
  return attribute?.hasValue ? attribute.value.split(HTML_WHITESPACE_SPLIT).filter(Boolean).map(token => token.toLowerCase()) : [];
}

function isExactCanonicalRel(attribute) {
  const tokens = canonicalRelTokens(attribute);
  return tokens.length === 1 && tokens[0] === 'canonical';
}

function canonicalHref(html) {
  const canonicals = [];
  let malformedLink = false;
  const complete = walkHtml(html, {
    onOpen({ tag, attributes }) {
      if (tag !== 'link') return;
      const values = htmlAttributes(attributes);
      if (!values) {
        malformedLink = true;
        return;
      }
      const rel = values.get('rel');
      if (canonicalRelTokens(rel).includes('canonical')) {
        canonicals.push({ href: values.get('href')?.hasValue ? values.get('href').value : '', exactRel: isExactCanonicalRel(rel) });
      }
    },
  });
  return complete && !malformedLink && canonicals.length === 1 && canonicals[0].exactRel ? canonicals[0].href : '';
}

function detailUrl(html, pageUrl) {
  return absoluteUrl(canonicalHref(html) || pageUrl, pageUrl);
}

function detailFields(html, product, pageUrl) {
  const imageUrls = productImages(product, pageUrl);
  const parentsValue = parents(html);
  return {
    breed: fact(html, ['品種', 'Breed']),
    color: fact(html, ['毛色', 'Color']),
    gender: gender(fact(html, ['性別', 'Sex', 'Gender'])),
    price: productPrice(product),
    birthday: normalizeDate(html.match(/data-i18n-birthday\s*=\s*["']([^"']+)["']/i)?.[1] || fact(html, ['誕生日', '生年月日', 'Birthday'])),
    photos: imageUrls,
    videoId: youtubeId(html, pageUrl),
    papa: parentsValue.papa,
    mama: parentsValue.mama,
    note: note(html),
    description: longDescription(html),
  };
}

/**
 * Parses a Fuluck generated detail page only after the crawler has proven it
 * byte-identical to the checked-out controlled file. It does not authenticate
 * arbitrary remote HTML.
 */
export function parseVerifiedFuluckDetailPage(html, { expectedBreederId, locale, pageUrl } = {}) {
  if (!nonBlank(expectedBreederId) || !nonBlank(locale) || !nonBlank(pageUrl)) throw new Error('detail options are required');
  const product = productJsonLd(html);
  const fields = detailFields(html, product, pageUrl);
  if (!fields.photos.length) throw new Error('Fuluck Product photos are missing');
  return { breederId: expectedBreederId, locale, ...fields, detailUrl: detailUrl(html, pageUrl) };
}

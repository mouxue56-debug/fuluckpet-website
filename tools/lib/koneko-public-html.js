import { createHash } from 'node:crypto';

const STATUS_TEXT = new Map([
  ['NEW', 'available'],
  ['販売中', 'available'],
  ['商談中', 'reserved'],
  ['事前成約申請', 'reserved'],
  ['成約済み', 'sold'],
  ['販売終了', 'sold'],
]);

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtube-nocookie.com', 'www.youtube-nocookie.com', 'youtu.be']);
const VOID_HTML_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
const NON_VISIBLE_TEXT_TAGS = new Set(['script', 'style', 'template']);
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

function attributeOccurrences(attributes, name) {
  const parsed = typeof attributes === 'string' ? parseHtmlAttributes(attributes) : attributes;
  return parsed?.occurrences?.get(name.toLowerCase()) || [];
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

function hasClassToken(attributes, className) {
  return attributeOccurrences(attributes, 'class').some(({ value, hasValue }) => hasValue
    && value.split(HTML_WHITESPACE_SPLIT).some(token => token.toLowerCase() === className.toLowerCase()));
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

function balancedElements(html, matches) {
  const elements = [];
  const candidates = [];
  const stack = [];
  let hiddenDepth = 0;
  let footerDepth = 0;
  let structurallyValid = true;
  const complete = walkHtml(html, {
    onOpen({ tag, attributes, start, end, selfClosing }) {
      const parsedAttributes = parseHtmlAttributes(attributes);
      const hidden = hasHiddenAttributes(parsedAttributes) || NON_VISIBLE_TEXT_TAGS.has(tag);
      const inFooter = footerDepth > 0 || tag === 'footer';
      const result = matches({ tag, attributes, parsedAttributes });
      const match = typeof result === 'boolean' ? { matches: result, malformed: false } : result;
      const candidate = match?.matches ? {
        start,
        tag,
        attributes,
        ancestorHidden: hiddenDepth > 0 || hidden,
        inFooter,
        invalid: selfClosing || match.malformed === true,
        element: null,
      } : null;
      if (candidate) candidates.push(candidate);
      if (selfClosing) return;
      stack.push({
        tag,
        start,
        attributes,
        contentStart: end,
        hidden,
        footer: tag === 'footer',
        ancestorHidden: hiddenDepth > 0 || hidden,
        candidate,
      });
      if (hidden) hiddenDepth += 1;
      if (tag === 'footer') footerDepth += 1;
    },
    onClose({ tag, start }) {
      const current = stack.at(-1);
      if (!current || current.tag !== tag) {
        structurallyValid = false;
        for (const element of stack) {
          if (element.candidate) element.candidate.invalid = true;
        }
        return;
      }
      stack.pop();
      if (current.hidden) hiddenDepth -= 1;
      if (current.footer) footerDepth -= 1;
      if (current.candidate && !current.candidate.invalid) {
        const element = {
          start: current.start,
          tag: current.tag,
          content: html.slice(current.contentStart, start),
          attributes: current.attributes,
          ancestorHidden: current.ancestorHidden,
        };
        current.candidate.element = element;
        elements.push(element);
      }
    },
  });
  if (stack.length || hiddenDepth !== 0 || footerDepth !== 0) {
    structurallyValid = false;
    for (const element of stack) if (element.candidate) element.candidate.invalid = true;
  }
  return {
    complete: complete && structurallyValid,
    elements: elements.sort((left, right) => left.start - right.start),
    candidates: candidates.sort((left, right) => left.start - right.start),
  };
}

function balancedElementsByClass(html, className) {
  return balancedElements(html, ({ parsedAttributes }) => ({
    matches: hasClassToken(parsedAttributes, className),
    malformed: parsedAttributes.malformed,
  })).elements;
}

function hasExactId(attributes, id) {
  return attributeOccurrences(attributes, 'id').some(({ value, hasValue }) => hasValue && decodeEntities(value) === id);
}

function attributeSelectorMatch(parsedAttributes, matches) {
  return { matches: matches(parsedAttributes), malformed: parsedAttributes.malformed };
}

function konekoCandidateMatcher(matches) {
  return ({ tag, parsedAttributes }) => attributeSelectorMatch(
    parsedAttributes,
    attributes => matches({ tag, attributes }),
  );
}

function hasHiddenAttributes(attributes) {
  const parsed = typeof attributes === 'string' ? parseHtmlAttributes(attributes) : attributes;
  if (attributeOccurrences(parsed, 'hidden').length > 0) return true;
  if (attributeOccurrences(parsed, 'aria-hidden').some(({ value, hasValue }) => hasValue && decodeEntities(value).trim() === 'true')) return true;
  return attributeOccurrences(parsed, 'style').some(({ value, hasValue }) => {
    if (!hasValue) return false;
    return decodeEntities(value).split(';').some((declaration) => {
      const separator = declaration.indexOf(':');
      if (separator === -1) return false;
      const property = declaration.slice(0, separator).trim().toLowerCase();
      const rawValue = declaration.slice(separator + 1).trim().replace(/\s*!important\s*$/i, '').trim().toLowerCase();
      return (property === 'display' && rawValue === 'none') || (property === 'visibility' && rawValue === 'hidden');
    });
  });
}

function visibleAnchors(html, { ancestorHidden = false } = {}) {
  const anchors = [];
  const stack = [];
  let hiddenDepth = ancestorHidden ? 1 : 0;
  let currentAnchor = null;
  walkHtml(html, {
    onOpen({ tag, attributes, selfClosing }) {
      if (selfClosing) return;
      const hidden = hasHiddenAttributes(parseHtmlAttributes(attributes)) || NON_VISIBLE_TEXT_TAGS.has(tag);
      const anchor = tag === 'a' ? { attributes, label: '' } : null;
      stack.push({ tag, hidden, anchor, previousAnchor: currentAnchor });
      if (anchor) currentAnchor = anchor;
      if (hidden) hiddenDepth += 1;
    },
    onClose({ tag }) {
      const current = stack.at(-1);
      if (current?.tag === tag) {
        if (tag === 'a' && current.anchor && hiddenDepth === 0) anchors.push(current.anchor);
        stack.pop();
        if (current.hidden) hiddenDepth -= 1;
        if (tag === 'a') currentAnchor = current.previousAnchor;
      }
    },
    onText(text) {
      if (currentAnchor && hiddenDepth === 0) currentAnchor.label += text;
    },
  });
  return anchors;
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

function scriptValue(product, key) {
  return product && product[key];
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

function longDescription(html, { koneko = false } = {}) {
  const konekoSection = koneko ? extractElementByClass(html, 'petDtlInt') : '';
  const content = (konekoSection ? extractElementByClass(konekoSection, 'gnrCnt') : '')
    || (!koneko ? extractElementByClass(html, 'kitten-detail-introduction') : '');
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

function outerListItemEnd(html, contentStart) {
  const token = /<\/?li\b[^>]*>/gi;
  token.lastIndex = contentStart;
  let depth = 1;
  let match;
  while ((match = token.exec(html))) {
    if (/^<\//.test(match[0])) depth -= 1;
    else if (!/\/\s*>$/.test(match[0])) depth += 1;
    if (depth === 0) return match.index;
  }
  return html.length;
}

function detailFields(html, product, pageUrl, { koneko = false } = {}) {
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
    description: longDescription(html, { koneko }),
  };
}

function uniqueKonekoElement(result, name, { optional = false, requireComplete = true } = {}) {
  const allCandidates = Array.isArray(result.candidates) ? result.candidates : null;
  if (allCandidates?.some(candidate => candidate.invalid || !candidate.element)) {
    throw new Error(`Koneko ${name} candidate is malformed`);
  }
  const candidates = allCandidates
    ? allCandidates.filter(candidate => !candidate.ancestorHidden && !candidate.inFooter)
    : null;
  if (requireComplete && !result.complete) throw new Error(`Koneko ${name} structure is malformed`);
  const elements = candidates ? candidates.map(candidate => candidate.element) : result.elements;
  if (elements.length === 0 && optional) return null;
  if (elements.length !== 1) throw new Error(`Koneko ${name} must be unique`);
  return elements[0];
}

function directElementsByTag(html, desiredTag) {
  const elements = [];
  const stack = [];
  let structurallyValid = true;
  const complete = walkHtml(html, {
    onOpen({ tag, attributes, start, end, selfClosing }) {
      if (selfClosing) return;
      stack.push({ tag, attributes, start, contentStart: end, direct: stack.length === 0 && tag === desiredTag });
    },
    onClose({ tag, start }) {
      const current = stack.at(-1);
      if (!current || current.tag !== tag) {
        structurallyValid = false;
        return;
      }
      stack.pop();
      if (current.direct) elements.push({
        tag: current.tag,
        attributes: current.attributes,
        start: current.start,
        content: html.slice(current.contentStart, start),
      });
    },
  });
  if (stack.length) structurallyValid = false;
  return { complete: complete && structurallyValid, elements };
}

function textFromKonekoElement(element) {
  return decodeHtmlText(element.content, { preserveBreaks: false });
}

function readKonekoTableRows(html) {
  const rows = [];
  const stack = [];
  let activeRow = null;
  let activeCell = null;
  let structurallyValid = true;
  const complete = walkHtml(html, {
    onOpen({ tag, start, end, selfClosing }) {
      if (selfClosing) {
        if (tag === 'br' && activeCell) activeCell.text += ' ';
        return;
      }
      const frame = { tag, start, end };
      if (tag === 'tr') {
        if (activeRow) structurallyValid = false;
        frame.row = { cells: [] };
        activeRow = frame.row;
      } else if (tag === 'th' || tag === 'td') {
        if (!activeRow || activeCell) structurallyValid = false;
        frame.cell = { tag, text: '' };
        activeCell = frame.cell;
        activeRow?.cells.push(frame.cell);
      }
      stack.push(frame);
    },
    onClose({ tag }) {
      const current = stack.at(-1);
      if (!current || current.tag !== tag) {
        structurallyValid = false;
        return;
      }
      stack.pop();
      if (current.cell) {
        if (activeCell !== current.cell) structurallyValid = false;
        activeCell = null;
      }
      if (current.row) {
        if (activeRow !== current.row || activeCell) structurallyValid = false;
        rows.push(current.row);
        activeRow = null;
      }
    },
    onText(text) {
      if (activeCell) activeCell.text += text;
    },
  });
  if (stack.length || activeRow || activeCell) structurallyValid = false;
  return complete && structurallyValid ? rows : null;
}

function oneKonekoTableValue(rows, field, labels, { optional = false } = {}) {
  const wanted = new Set(labels.map(normalizedLabel));
  const matches = rows.filter((row) => wanted.has(normalizedLabel(row.cells[0]?.text || '')));
  if (matches.length === 0) {
    if (optional) return '';
    throw new Error(`Koneko ${field} evidence is missing`);
  }
  if (matches.length !== 1) throw new Error(`Koneko ${field} evidence is duplicate or conflicting`);
  const [row] = matches;
  if (row.cells.length !== 2 || row.cells[0].tag !== 'th' || row.cells[1].tag !== 'td') {
    throw new Error(`Koneko ${field} row structure is malformed`);
  }
  const value = decodeHtmlText(row.cells[1].text, { preserveBreaks: false });
  if (!optional && !nonBlank(value)) throw new Error(`Koneko ${field} evidence is missing`);
  return value;
}

function konekoTableFacts(html) {
  const dataRegion = uniqueKonekoElement(balancedElements(html, konekoCandidateMatcher(({ attributes }) => hasClassToken(attributes, 'petDtlData'))), 'facts region', { requireComplete: false });
  const table = uniqueKonekoElement(balancedElements(dataRegion.content, konekoCandidateMatcher(({ tag, attributes }) => tag === 'table' && hasClassToken(attributes, 'gnrTbl'))), 'facts table');
  const tableRows = readKonekoTableRows(table.content);
  if (!tableRows) throw new Error('Koneko facts table structure is malformed');
  const breed = oneKonekoTableValue(tableRows, 'breed', ['猫種', '品種', 'Breed']);
  const color = oneKonekoTableValue(tableRows, 'color', ['毛色(毛質)', '毛色', 'Color']);
  const genderValue = gender(oneKonekoTableValue(tableRows, 'gender', ['性別', 'Sex', 'Gender']));
  const birthday = normalizeDate(oneKonekoTableValue(tableRows, 'birthday', ['誕生日', '生年月日', 'Birthday']));
  if (!nonBlank(genderValue)) throw new Error('Koneko gender evidence is missing');
  if (!nonBlank(birthday)) throw new Error('Koneko birthday evidence is missing');
  return {
    breed,
    color,
    gender: genderValue,
    birthday,
    note: oneKonekoTableValue(tableRows, 'note', ['アピールポイント', '備考', '注記', 'Note', 'Short note'], { optional: true }),
  };
}

function konekoParents(html) {
  const region = uniqueKonekoElement(balancedElements(html, konekoCandidateMatcher(({ attributes }) => hasExactId(attributes, 'parentInfo'))), 'parent region', { optional: true, requireComplete: false });
  if (!region) return { papa: '', mama: '' };
  const list = uniqueKonekoElement(balancedElements(region.content, konekoCandidateMatcher(({ tag, attributes }) => tag === 'ul' && hasClassToken(attributes, 'parentInfo_list'))), 'parent list');
  const items = directElementsByTag(list.content, 'li');
  if (!items.complete || items.elements.length !== 2) throw new Error('Koneko parent items are malformed');
  const values = new Map();
  for (const item of items.elements) {
    const header = uniqueKonekoElement(balancedElements(item.content, konekoCandidateMatcher(({ tag, attributes }) => tag === 'h3' && hasClassToken(attributes, 'parentInfo_head'))), 'parent heading');
    const sides = ['father', 'mother'].filter(side => hasClassToken(header.attributes, side));
    if (sides.length !== 1 || values.has(sides[0])) throw new Error('Koneko parent heading is conflicting');
    const name = uniqueKonekoElement(balancedElements(item.content, konekoCandidateMatcher(({ tag, attributes }) => tag === 'li' && hasClassToken(attributes, 'parentName'))), 'parent name');
    const strong = uniqueKonekoElement(directElementsByTag(name.content, 'strong'), 'parent name');
    const value = textFromKonekoElement(strong);
    if (!nonBlank(value)) throw new Error('Koneko parent name is missing');
    values.set(sides[0], value);
  }
  if (!values.has('father') || !values.has('mother')) throw new Error('Koneko parent evidence is incomplete');
  return { papa: values.get('father'), mama: values.get('mother') };
}

function konekoVideoId(html, pageUrl) {
  const region = uniqueKonekoElement(balancedElements(html, konekoCandidateMatcher(({ attributes }) => hasClassToken(attributes, 'movieGalleryCnt') && hasClassToken(attributes, 'youtube'))), 'video region', { optional: true, requireComplete: false });
  if (!region) return '';
  const evidence = youtubeMediaIds(region.content, pageUrl, { rejectInvalid: true });
  if (!evidence.complete || evidence.malformed) throw new Error('Koneko video structure is malformed');
  const uniqueIds = [...new Set(evidence.ids)];
  if (uniqueIds.length !== 1) throw new Error('Koneko video evidence is missing or conflicting');
  return uniqueIds[0];
}

function konekoDescription(html) {
  const region = uniqueKonekoElement(balancedElements(html, konekoCandidateMatcher(({ attributes }) => hasClassToken(attributes, 'petDtlInt'))), 'introduction region', { optional: true, requireComplete: false });
  if (!region) return '';
  const content = uniqueKonekoElement(balancedElements(region.content, konekoCandidateMatcher(({ tag, attributes }) => tag === 'div' && hasClassToken(attributes, 'gnrCnt'))), 'introduction content');
  return decodeHtmlText(content.content.replace(/<h[1-6]\b[^>]*>[\s\S]*?<\/h[1-6]\s*>/gi, ''), { preserveBreaks: true });
}

function konekoDetailFields(html, product, pageUrl) {
  const facts = konekoTableFacts(html);
  const parentValues = konekoParents(html);
  return {
    ...facts,
    price: productPrice(product),
    photos: productImages(product, pageUrl),
    videoId: konekoVideoId(html, pageUrl),
    ...parentValues,
    description: konekoDescription(html),
  };
}

export function parseKonekoListPage(html, { accountId, pageUrl } = {}) {
  if (!nonBlank(html) || /challenge-platform|cf-chl-|Just a moment|interstitial/i.test(html)) throw new Error('challenge or interstitial HTML');
  if (!nonBlank(accountId) || !nonBlank(pageUrl)) throw new Error('accountId and pageUrl are required');
  const cardStarts = [...html.matchAll(/<li\b[^>]*\bclass\s*=\s*["'][^"']*\bMin_d-flex\b[^"']*\bbox02Inner\b[^"']*["'][^>]*>/gi)];
  const cards = [];
  const ids = new Set();
  for (let index = 0; index < cardStarts.length; index += 1) {
    const start = cardStarts[index].index + cardStarts[index][0].length;
    const end = outerListItemEnd(html, start);
    const cardHtml = html.slice(start, end);
    const links = [...cardHtml.matchAll(/(?:href\s*=\s*["']|\b)(?:[^"'<>]*?)(?:cat)(\d{4}-\d{5})\.html/gi)].map(m => m[1]);
    const linkIds = [...new Set(links)];
    if (linkIds.length !== 1) throw new Error('card must contain exactly one breeder link');
    const imageIds = [...cardHtml.matchAll(/\bid\s*=\s*["']src_(\d{4}-\d{5})["']/gi)].map(m => m[1]);
    if (imageIds.length !== 1 || imageIds[0] !== linkIds[0]) throw new Error('card link/image IDs disagree');
    const breederId = linkIds[0];
    if (ids.has(breederId)) throw new Error(`duplicate card ID: ${breederId}`);
    ids.add(breederId);
    const stateHtml = extractElementByClass(cardHtml, 'listLmtInfStt');
    const stateText = decodeHtmlText(stateHtml);
    const directStateStatus = stateText === 'NEW' ? '' : STATUS_TEXT.get(stateText);
    if (stateText && !directStateStatus && stateText !== 'NEW') throw new Error(`unknown status markup: ${stateText}`);
    const statusNodes = [...cardHtml.matchAll(/<(?:span|p|div)\b[^>]*\bclass\s*=\s*["'](?:[^"']*\s)?(?:business|closed|sold|status)(?=\s|["'])[^"']*["'][^>]*>([\s\S]*?)<\/(?:span|p|div)\s*>/gi)];
    let status = 'available';
    if (statusNodes.length) {
      const labels = statusNodes.map(node => decodeHtmlText(node[1]));
      const statuses = labels.map(label => label === 'NEW' ? '' : STATUS_TEXT.get(label));
      const unknown = labels.find((_, index) => !statuses[index]);
      if (unknown) throw new Error(`unknown status markup: ${unknown}`);
      if (directStateStatus) statuses.push(directStateStatus);
      const distinct = [...new Set(statuses)];
      if (distinct.length !== 1) throw new Error(`conflicting status markup: ${labels.join(', ')}`);
      status = distinct[0];
    } else if (directStateStatus) {
      status = directStateStatus;
    } else {
      const liveMarker = stateHtml.match(/<span\b[^>]*\bclass\s*=\s*["'](?:[^"']*\s)?new(?=\s|["'])[^"']*["'][^>]*>([\s\S]*?)<\/span\s*>/i);
      if (!liveMarker) throw new Error('live-list marker or status is missing');
      const stateText = decodeHtmlText(liveMarker[1]);
      if (stateText !== 'NEW') throw new Error(`unknown status markup: ${stateText}`);
      status = 'available';
    }
    const href = cardHtml.match(/href\s*=\s*["']([^"']*cat\d{4}-\d{5}\.html[^"']*)["']/i)?.[1] || '';
    cards.push({ breederId, status, detailUrl: absoluteUrl(href, pageUrl) });
  }
  if (!cards.length) throw new Error('no Koneko cards found');
  const paginationElement = balancedElementsByClass(html, 'pagenation').find(element => {
    const range = element.content.match(/(\d+)\s*[～〜~-]\s*(\d+)\s*件を表示/i);
    return range && cards.length === Number(range[2]) - Number(range[1]) + 1;
  });
  const pagination = paginationElement?.content || '';
  const declaredMatch = pagination.match(/<span\b[^>]*\bclass\s*=\s*["'][^"']*\btotalNum\b[^"']*["'][^>]*>\s*(\d+)/i);
  const rangeMatch = pagination.match(/(\d+)\s*[～〜~-]\s*(\d+)\s*件を表示/i);
  if (!declaredMatch || !rangeMatch) throw new Error('pagination range receipt is missing');
  const rangeStart = Number(rangeMatch[1]);
  const rangeEnd = Number(rangeMatch[2]);
  if (cards.length !== rangeEnd - rangeStart + 1) throw new Error('range/card count mismatch');
  let nextPageUrl = '';
  for (const { attributes, label } of visibleAnchors(pagination, { ancestorHidden: paginationElement?.ancestorHidden })) {
    const rawHref = attributes.match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1];
    if (!rawHref) continue;
    const href = absoluteUrl(rawHref, pageUrl);
    if (!href) continue;
    try { if (new URL(href).origin !== new URL(pageUrl).origin) continue; } catch { continue; }
    if (/pageNum=\d+/i.test(href) && /^(?:次へ|next)$/i.test(decodeHtmlText(label))) { nextPageUrl = href; break; }
  }
  return {
    accountId,
    pageUrl,
    cards,
    declaredTotal: Number(declaredMatch[1]),
    rangeStart,
    rangeEnd,
    nextPageUrl,
    sha256: createHash('sha256').update(String(html)).digest('hex'),
  };
}

export function parseKonekoDetailPage(html, { expectedAccountId, expectedBreederId, pageUrl } = {}) {
  if (!nonBlank(expectedAccountId) || !nonBlank(expectedBreederId) || !nonBlank(pageUrl)) throw new Error('detail options are required');
  const product = productJsonLd(html);
  const breederId = String(scriptValue(product, 'sku') || '');
  if (breederId !== expectedBreederId) throw new Error(`Koneko SKU/breeder mismatch: ${breederId}`);
  const fields = konekoDetailFields(html, product, pageUrl);
  if (!fields.photos.length) throw new Error('Koneko source photos are missing');
  const accountIds = [...new Set(fields.photos.map(url => url.match(/\/breeder\/data\/([^/]+)\//i)?.[1]).filter(Boolean))];
  if (accountIds.length !== 1 || accountIds[0] !== expectedAccountId) throw new Error('Koneko account mismatch');
  return { breederId, accountId: expectedAccountId, ...fields, detailUrl: detailUrl(html, pageUrl) };
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

import { createHash } from 'node:crypto';

const STATUS_TEXT = new Map([
  ['NEW', 'available'],
  ['販売中', 'available'],
  ['商談中', 'reserved'],
  ['事前成約申請', 'reserved'],
  ['成約済み', 'sold'],
  ['販売終了', 'sold'],
]);

const YOUTUBE_ID = /(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?(?:[^\s#]*?&)?v=|embed\/|shorts\/))([A-Za-z0-9_-]{11})(?:[?&#/]|$)/i;

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
  const re = new RegExp(`<(${tag})\\b[^>]*\\bclass\\s*=\\s*["'][^"']*\\b${escRegExp(className)}\\b[^"']*["'][^>]*>`, 'ig');
  return re;
}

function extractElementByClass(html, className) {
  const match = classOpening(html, className).exec(html);
  if (!match) return '';
  const tag = match[1];
  const token = new RegExp(`<\\/?${tag}\\b[^>]*>`, 'ig');
  token.lastIndex = match.index + match[0].length;
  let depth = 1;
  let cursor = token.lastIndex;
  let next;
  while ((next = token.exec(html))) {
    if (/^<\//.test(next[0])) depth -= 1;
    else if (!/\/\s*>$/.test(next[0])) depth += 1;
    if (depth === 0) return html.slice(cursor, next.index);
  }
  return html.slice(cursor);
}

function absoluteUrl(value, pageUrl) {
  if (!nonBlank(value)) return '';
  try { return new URL(decodeEntities(value.trim()), pageUrl).href; } catch { return ''; }
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

function youtubeId(html) {
  for (const match of html.matchAll(/<(?:iframe|a|video)\b[^>]*(?:src|href)\s*=\s*["']([^"']+)["'][^>]*>/gi)) {
    const found = match[1].match(YOUTUBE_ID);
    if (found) return found[1];
  }
  const found = html.match(YOUTUBE_ID);
  return found ? found[1] : '';
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

function detailUrl(html, pageUrl) {
  const canonical = html.match(/<link\b[^>]*\brel\s*=\s*["']canonical["'][^>]*\bhref\s*=\s*["']([^"']+)["']/i)
    || html.match(/<link\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*\brel\s*=\s*["']canonical["']/i);
  return absoluteUrl(canonical?.[1] || pageUrl, pageUrl);
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
    videoId: youtubeId(html),
    papa: parentsValue.papa,
    mama: parentsValue.mama,
    note: note(html),
    description: longDescription(html, { koneko }),
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
    const statusNodes = [...cardHtml.matchAll(/<(?:span|p|div)\b[^>]*\bclass\s*=\s*["'][^"']*\b(?:business|closed|sold|status)\b[^"']*["'][^>]*>([\s\S]*?)<\/(?:span|p|div)\s*>/gi)];
    let status = 'available';
    if (statusNodes.length) {
      const labels = statusNodes.map(node => decodeHtmlText(node[1]));
      const statuses = labels.map(label => STATUS_TEXT.get(label));
      const unknown = labels.find((_, index) => !statuses[index]);
      if (unknown) throw new Error(`unknown status markup: ${unknown}`);
      const distinct = [...new Set(statuses)];
      if (distinct.length !== 1) throw new Error(`conflicting status markup: ${labels.join(', ')}`);
      status = distinct[0];
    } else {
      const stateText = decodeHtmlText(extractElementByClass(cardHtml, 'listLmtInfStt'));
      if (!stateText) throw new Error('live-list marker or status is missing');
      if (!STATUS_TEXT.has(stateText)) throw new Error(`unknown status markup: ${stateText}`);
      status = STATUS_TEXT.get(stateText);
    }
    const href = cardHtml.match(/href\s*=\s*["']([^"']*cat\d{4}-\d{5}\.html[^"']*)["']/i)?.[1] || '';
    cards.push({ breederId, status, detailUrl: absoluteUrl(href, pageUrl) });
  }
  if (!cards.length) throw new Error('no Koneko cards found');
  const paginationRegions = [...html.matchAll(/<div\b[^>]*\bclass\s*=\s*["'][^"']*\bpagenation\b[^"']*["'][^>]*>([\s\S]*?)(?=<div\b[^>]*\bclass\s*=\s*["'][^"']*\bpagenation\b|<\/body\b|$)/gi)].map(match => match[1]);
  const pagination = paginationRegions.find(region => {
    const range = region.match(/(\d+)\s*[～〜~-]\s*(\d+)\s*件を表示/i);
    return range && cards.length === Number(range[2]) - Number(range[1]) + 1;
  }) || '';
  const declaredMatch = pagination.match(/<span\b[^>]*\bclass\s*=\s*["'][^"']*\btotalNum\b[^"']*["'][^>]*>\s*(\d+)/i);
  const rangeMatch = pagination.match(/(\d+)\s*[～〜~-]\s*(\d+)\s*件を表示/i);
  if (!declaredMatch || !rangeMatch) throw new Error('pagination range receipt is missing');
  const rangeStart = Number(rangeMatch[1]);
  const rangeEnd = Number(rangeMatch[2]);
  if (cards.length !== rangeEnd - rangeStart + 1) throw new Error('range/card count mismatch');
  let nextPageUrl = '';
  for (const match of pagination.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a\s*>/gi)) {
    const href = absoluteUrl(match[1], pageUrl);
    if (!href) continue;
    try { if (new URL(href).origin !== new URL(pageUrl).origin) continue; } catch { continue; }
    if (/pageNum=\d+/i.test(href) && /次へ|next/i.test(decodeHtmlText(match[2]))) { nextPageUrl = href; break; }
    if (!nextPageUrl && /pageNum=\d+/i.test(href)) nextPageUrl = href;
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
  const fields = detailFields(html, product, pageUrl, { koneko: true });
  if (!fields.photos.length) throw new Error('Koneko source photos are missing');
  const accountIds = [...new Set(fields.photos.map(url => url.match(/\/breeder\/data\/([^/]+)\//i)?.[1]).filter(Boolean))];
  if (accountIds.length !== 1 || accountIds[0] !== expectedAccountId) throw new Error('Koneko account mismatch');
  return { breederId, accountId: expectedAccountId, ...fields, detailUrl: detailUrl(html, pageUrl) };
}

export function parseFuluckDetailPage(html, { expectedBreederId, locale, pageUrl } = {}) {
  if (!nonBlank(expectedBreederId) || !nonBlank(locale) || !nonBlank(pageUrl)) throw new Error('detail options are required');
  const product = productJsonLd(html);
  const sku = String(scriptValue(product, 'sku') || '');
  const url = detailUrl(html, pageUrl);
  if (!sku || sku !== expectedBreederId || !new RegExp(`(?:kittens|cat)\\/?${escRegExp(expectedBreederId)}(?:\\.html)?(?:$|[?#])`, 'i').test(url)) {
    throw new Error(`Fuluck SKU/breeder mismatch: ${sku || '(missing)'}`);
  }
  const fields = detailFields(html, product, pageUrl);
  if (!fields.photos.length) throw new Error('Fuluck Product photos are missing');
  return { breederId: expectedBreederId, locale, ...fields, detailUrl: url };
}

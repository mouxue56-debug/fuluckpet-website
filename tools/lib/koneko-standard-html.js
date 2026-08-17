import { createHash } from 'node:crypto';

import { parse } from 'parse5';

const HTML_NAMESPACE = 'http://www.w3.org/1999/xhtml';
const MAX_HTML_BYTES = 2 * 1024 * 1024;
const BREEDER_ID = /^\d{4}-\d{5}$/;
const HTML_WHITESPACE = /[\t\n\f\r ]+/;
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
  'youtu.be',
]);
const STATUS_TEXT = new Map([
  ['販売中', 'available'],
  ['商談中', 'reserved'],
  ['事前成約申請', 'reserved'],
  ['成約済み', 'sold'],
  ['販売終了', 'sold'],
]);
const VOID_ELEMENTS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta',
  'param', 'source', 'track', 'wbr',
]);
const TEXT_EXCLUDED_ELEMENTS = new Set(['script', 'style', 'template', 'noscript']);
const TEXT_BLOCK_ELEMENTS = new Set([
  'address', 'article', 'aside', 'blockquote', 'dd', 'div', 'dl', 'dt', 'fieldset',
  'figcaption', 'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'header', 'hr', 'li', 'main', 'nav', 'ol', 'p', 'pre', 'section', 'table', 'tr',
  'ul',
]);
const IGNORED_PARSE_ERRORS = new Set([
  'missing-doctype',
  // This is recoverable browser syntax. The parsed attribute/text value is
  // still authoritative and deliberately receives no second decode.
  'missing-semicolon-after-character-reference',
]);

function nonBlank(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function parseKonekoDocument(html) {
  if (!nonBlank(html)) throw new Error('Koneko HTML is missing');
  if (Buffer.byteLength(html, 'utf8') > MAX_HTML_BYTES) throw new Error('Koneko HTML exceeds the size limit');
  if (/challenge-platform|cf-chl-|Just a moment|interstitial/i.test(html)) {
    throw new Error('challenge or interstitial HTML');
  }

  const parseErrors = [];
  const document = parse(String(html), {
    scriptingEnabled: true,
    sourceCodeLocationInfo: true,
    onParseError(error) {
      parseErrors.push({
        code: String(error.code || ''),
        startOffset: Number(error.startOffset),
        endOffset: Number(error.endOffset),
      });
    },
  });
  const relevantErrors = parseErrors.filter(error => !IGNORED_PARSE_ERRORS.has(error.code));
  if (relevantErrors.some(error => error.code === 'eof-in-tag')) {
    throw new Error('Koneko HTML has a malformed EOF opening tag');
  }

  const nodes = [];
  const stack = [...(document.childNodes || [])].reverse();
  while (stack.length) {
    const node = stack.pop();
    nodes.push(node);
    // parse5 stores template descendants on `content`, not `childNodes`. Never
    // traverse that inert fragment.
    const children = node.tagName === 'template' ? [] : (node.childNodes || []);
    for (let index = children.length - 1; index >= 0; index -= 1) stack.push(children[index]);
  }
  return { html: String(html), document, nodes, parseErrors: relevantErrors };
}

function isHtmlElement(node, tagName) {
  return Boolean(node && node.namespaceURI === HTML_NAMESPACE && (!tagName || node.tagName === tagName));
}

function attr(node, name) {
  if (!isHtmlElement(node)) return undefined;
  return node.attrs?.find(attribute => attribute.name === name)?.value;
}

function classTokens(node) {
  const value = attr(node, 'class');
  return typeof value === 'string' ? value.split(HTML_WHITESPACE).filter(Boolean) : [];
}

function hasClass(node, className) {
  return classTokens(node).includes(className);
}

function hasEveryClass(node, classNames) {
  const tokens = new Set(classTokens(node));
  return classNames.every(className => tokens.has(className));
}

function descendants(context, root, predicate, { includeRoot = false } = {}) {
  const found = [];
  const stack = includeRoot ? [root] : [...(root?.childNodes || [])].reverse();
  while (stack.length) {
    const node = stack.pop();
    if (predicate(node)) found.push(node);
    const children = node.tagName === 'template' ? [] : (node.childNodes || []);
    for (let index = children.length - 1; index >= 0; index -= 1) stack.push(children[index]);
  }
  return found;
}

function allElements(context, predicate) {
  return context.nodes.filter(node => isHtmlElement(node) && predicate(node));
}

function elementChildren(node) {
  return (node?.childNodes || []).filter(child => isHtmlElement(child));
}

function sourceIntervalIntersects(error, start, end) {
  const errorStart = Number.isFinite(error.startOffset) ? error.startOffset : -1;
  const errorEnd = Number.isFinite(error.endOffset) ? error.endOffset : errorStart;
  return (errorStart >= start && errorStart <= end)
    || (errorEnd >= start && errorEnd <= end)
    || (errorStart <= start && errorEnd >= end);
}

function assertSourceBacked(context, node, name, { within } = {}) {
  const location = node?.sourceCodeLocation;
  const startTag = location?.startTag;
  const endTag = location?.endTag;
  if (!isHtmlElement(node) || !location || !startTag
    || !Number.isInteger(startTag.startOffset) || !Number.isInteger(startTag.endOffset)) {
    throw new Error(`Koneko ${name} is malformed: no source-backed start tag`);
  }
  if (!VOID_ELEMENTS.has(node.tagName)
    && (!endTag || !Number.isInteger(endTag.startOffset) || !Number.isInteger(endTag.endOffset))) {
    throw new Error(`Koneko ${name} is malformed: no source-backed end tag`);
  }
  const end = endTag?.endOffset ?? startTag.endOffset;
  const malformedOwnTag = context.parseErrors.some(error => (
    sourceIntervalIntersects(error, startTag.startOffset, startTag.endOffset)
      || (endTag && sourceIntervalIntersects(error, endTag.startOffset, endTag.endOffset))
  ));
  if (malformedOwnTag) {
    throw new Error(`Koneko ${name} intersects malformed HTML`);
  }
  if (within) {
    const outer = within.sourceCodeLocation;
    if (!outer?.startTag || !outer?.endTag
      || startTag.startOffset < outer.startTag.endOffset
      || end > outer.endTag.startOffset) {
      throw new Error(`Koneko ${name} is not source-nested in its evidence region`);
    }
  }
  return node;
}

function selfHidden(node) {
  if (attr(node, 'hidden') !== undefined) return true;
  if (attr(node, 'aria-hidden')?.trim() === 'true') return true;
  const style = attr(node, 'style');
  if (typeof style !== 'string') return false;
  return style.split(';').some((declaration) => {
    const match = /^\s*([a-z-]+)\s*:\s*([^;]*?)\s*(?:!\s*important\s*)?$/i.exec(declaration);
    if (!match) return false;
    const property = match[1].toLowerCase();
    const value = match[2].trim().toLowerCase();
    return (property === 'display' && value === 'none')
      || (property === 'visibility' && value === 'hidden');
  });
}

function excludedByVisibility(node) {
  for (let current = node; current; current = current.parentNode) {
    if (isHtmlElement(current, 'footer') || selfHidden(current)) return true;
  }
  return false;
}

function normalizeText(parts, preserveBreaks) {
  let value = parts.join('').replace(/\r\n?/g, '\n').replace(/\u00a0/g, ' ');
  if (!preserveBreaks) return value.replace(/[\t\n\f\r ]+/g, ' ').trim();
  value = value
    .split('\n')
    .map(line => line.replace(/[\t\f\r ]+/g, ' ').trim())
    .join('\n')
    .replace(/\n[\t ]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return value;
}

function nodeText(root, {
  preserveBreaks = false,
  visibleOnly = true,
  skipHeadings = false,
} = {}) {
  const parts = [];
  const stack = [{ node: root, closing: false, root: true }];
  while (stack.length) {
    const frame = stack.pop();
    const node = frame.node;
    if (frame.closing) {
      if (preserveBreaks && TEXT_BLOCK_ELEMENTS.has(node.tagName)) parts.push('\n\n');
      continue;
    }
    if (node?.nodeName === '#text') {
      parts.push(node.value || '');
      continue;
    }
    if (!frame.root && visibleOnly && excludedByVisibility(node)) continue;
    if (isHtmlElement(node) && (TEXT_EXCLUDED_ELEMENTS.has(node.tagName)
      || (skipHeadings && /^h[1-6]$/.test(node.tagName)))) continue;
    if (isHtmlElement(node, 'br')) {
      parts.push(preserveBreaks ? '\n' : ' ');
      continue;
    }
    const children = node?.tagName === 'template' ? [] : (node?.childNodes || []);
    if (preserveBreaks && isHtmlElement(node) && TEXT_BLOCK_ELEMENTS.has(node.tagName)) {
      stack.push({ node, closing: true });
    }
    for (let index = children.length - 1; index >= 0; index -= 1) {
      stack.push({ node: children[index], closing: false, root: false });
    }
  }
  return normalizeText(parts, preserveBreaks);
}

function sourceText(node) {
  return (node?.childNodes || []).filter(child => child.nodeName === '#text').map(child => child.value || '').join('');
}

function evidenceCandidates(context, candidates, name, { optional = false } = {}) {
  for (const node of candidates) assertSourceBacked(context, node, name);
  const visible = candidates.filter(node => !excludedByVisibility(node));
  if (visible.length === 0 && optional) return null;
  if (visible.length !== 1) throw new Error(`Koneko ${name} must be unique`);
  return visible[0];
}

function descendantEvidence(context, root, predicate, name, { optional = false } = {}) {
  const candidates = descendants(context, root, node => isHtmlElement(node) && predicate(node));
  for (const node of candidates) assertSourceBacked(context, node, name, { within: root });
  const visible = candidates.filter(node => !excludedByVisibility(node));
  if (visible.length === 0 && optional) return null;
  if (visible.length !== 1) throw new Error(`Koneko ${name} must be unique`);
  return visible[0];
}

function absoluteUrl(value, pageUrl) {
  if (!nonBlank(value)) return '';
  try { return new URL(value.trim(), pageUrl).href; } catch { return ''; }
}

function canonicalYoutubeId(value, pageUrl) {
  if (!nonBlank(value)) return '';
  let url;
  try { url = new URL(value.trim(), pageUrl); } catch { return ''; }
  const hostname = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !YOUTUBE_HOSTS.has(hostname)) return '';
  if (hostname === 'youtu.be') {
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

function productCandidates(value) {
  const roots = Array.isArray(value) ? value : [value];
  const candidates = [];
  for (const root of roots) {
    candidates.push(root);
    if (Array.isArray(root?.['@graph'])) candidates.push(...root['@graph']);
  }
  return candidates.filter((candidate) => {
    const type = candidate?.['@type'];
    return type === 'Product' || (Array.isArray(type) && type.includes('Product'));
  });
}

function productJsonLd(context) {
  const scripts = allElements(context, node => node.tagName === 'script'
    && attr(node, 'type')?.trim().toLowerCase() === 'application/ld+json');
  const products = [];
  for (const script of scripts) {
    assertSourceBacked(context, script, 'Product JSON-LD');
    let parsed;
    try { parsed = JSON.parse(sourceText(script).trim()); } catch { throw new Error('malformed JSON-LD'); }
    products.push(...productCandidates(parsed));
  }
  if (products.length === 0) throw new Error('Product JSON-LD is missing');
  if (products.length !== 1) throw new Error('Product JSON-LD must be unique');
  return products[0];
}

function productImages(product, pageUrl) {
  const raw = Array.isArray(product?.image) ? product.image : [product?.image];
  const urls = raw.map(value => typeof value === 'string' ? absoluteUrl(value, pageUrl) : '');
  if (!urls.length || urls.some(url => !url)) throw new Error('Koneko source photos are invalid');
  return urls;
}

function productPrice(product) {
  const offer = Array.isArray(product?.offers) ? product.offers[0] : product?.offers;
  const raw = offer?.price ?? product?.price;
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    throw new Error('Product price evidence is missing');
  }
  const price = Number(String(raw).replace(/[,，\s円¥]/g, ''));
  if (!Number.isFinite(price) || price <= 0) throw new Error('Product price evidence is invalid');
  return price;
}

function normalizeDate(value) {
  const match = String(value ?? '').match(/(\d{4})\s*[年\/-]\s*(\d{1,2})\s*[月\/-]\s*(\d{1,2})/);
  if (!match) return '';
  return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
}

function normalizeLabel(value) {
  return String(value ?? '').replace(/[：:\s]/g, '');
}

function normalizeGender(value) {
  const text = String(value ?? '').trim();
  if (/男の子|male/i.test(text)) return '♂';
  if (/女の子|female/i.test(text)) return '♀';
  return text;
}

function oneTableValue(context, rows, field, labels, { optional = false } = {}) {
  const wanted = new Set(labels.map(normalizeLabel));
  const matches = [];
  for (const row of rows) {
    assertSourceBacked(context, row, `${field} row`);
    const cells = elementChildren(row);
    const label = cells[0] ? normalizeLabel(nodeText(cells[0])) : '';
    if (!wanted.has(label)) continue;
    if (cells.length !== 2 || !isHtmlElement(cells[0], 'th') || !isHtmlElement(cells[1], 'td')) {
      throw new Error(`Koneko ${field} row structure is malformed`);
    }
    assertSourceBacked(context, cells[0], `${field} label`, { within: row });
    assertSourceBacked(context, cells[1], `${field} value`, { within: row });
    matches.push(nodeText(cells[1]));
  }
  if (matches.length === 0) {
    if (optional) return '';
    throw new Error(`Koneko ${field} evidence is missing`);
  }
  if (matches.length !== 1) throw new Error(`Koneko ${field} evidence is duplicate or conflicting`);
  if (!optional && !nonBlank(matches[0])) throw new Error(`Koneko ${field} evidence is missing`);
  return matches[0];
}

function konekoFacts(context) {
  const region = evidenceCandidates(
    context,
    allElements(context, node => hasClass(node, 'petDtlData')),
    'facts region',
  );
  const table = descendantEvidence(
    context,
    region,
    node => node.tagName === 'table' && hasClass(node, 'gnrTbl'),
    'facts table',
  );
  const rows = descendants(context, table, node => isHtmlElement(node, 'tr'));
  const breed = oneTableValue(context, rows, 'breed', ['猫種', '品種', 'Breed']);
  const color = oneTableValue(context, rows, 'color', ['毛色(毛質)', '毛色', 'Color']);
  const gender = normalizeGender(oneTableValue(context, rows, 'gender', ['性別', 'Sex', 'Gender']));
  const birthday = normalizeDate(oneTableValue(context, rows, 'birthday', ['誕生日', '生年月日', 'Birthday']));
  if (!nonBlank(gender)) throw new Error('Koneko gender evidence is missing');
  if (!nonBlank(birthday)) throw new Error('Koneko birthday evidence is missing');
  return {
    breed,
    color,
    gender,
    birthday,
    note: oneTableValue(context, rows, 'note', ['アピールポイント', '備考', '注記', 'Note', 'Short note'], { optional: true }),
  };
}

function directChildrenByTag(node, tagName) {
  return elementChildren(node).filter(child => isHtmlElement(child, tagName));
}

function konekoParents(context) {
  const region = evidenceCandidates(
    context,
    allElements(context, node => attr(node, 'id') === 'parentInfo'),
    'parent region',
    { optional: true },
  );
  if (!region) return { papa: '', mama: '' };
  const list = descendantEvidence(
    context,
    region,
    node => node.tagName === 'ul' && hasClass(node, 'parentInfo_list'),
    'parent list',
  );
  const items = directChildrenByTag(list, 'li');
  if (items.length !== 2) throw new Error('Koneko parent items are malformed');
  const names = new Map();
  for (const item of items) {
    assertSourceBacked(context, item, 'parent item', { within: list });
    const heading = descendantEvidence(
      context,
      item,
      node => node.tagName === 'h3' && hasClass(node, 'parentInfo_head'),
      'parent heading',
    );
    const sides = ['father', 'mother'].filter(side => hasClass(heading, side));
    if (sides.length !== 1 || names.has(sides[0])) throw new Error('Koneko parent heading is conflicting');
    const nameNode = descendantEvidence(
      context,
      item,
      node => node.tagName === 'li' && hasClass(node, 'parentName'),
      'parent name',
    );
    const strong = descendantEvidence(
      context,
      nameNode,
      node => node.tagName === 'strong',
      'parent name value',
    );
    const value = nodeText(strong);
    if (!nonBlank(value)) throw new Error('Koneko parent name is missing');
    names.set(sides[0], value);
  }
  if (!names.has('father') || !names.has('mother')) throw new Error('Koneko parent evidence is incomplete');
  return { papa: names.get('father'), mama: names.get('mother') };
}

function konekoVideoId(context, pageUrl) {
  const region = evidenceCandidates(
    context,
    allElements(context, node => hasEveryClass(node, ['movieGalleryCnt', 'youtube'])),
    'video region',
    { optional: true },
  );
  if (!region) return '';
  const media = descendants(context, region, node => isHtmlElement(node)
    && ['a', 'iframe', 'video', 'source'].includes(node.tagName));
  const ids = [];
  for (const node of media) {
    assertSourceBacked(context, node, 'video media', { within: region });
    const value = node.tagName === 'a' ? attr(node, 'href') : (attr(node, 'src') ?? attr(node, 'href'));
    if (value === undefined) continue;
    const id = canonicalYoutubeId(value, pageUrl);
    if (!id) throw new Error('Koneko video URL is invalid');
    ids.push(id);
  }
  const unique = [...new Set(ids)];
  if (unique.length !== 1) throw new Error('Koneko video evidence is missing or conflicting');
  return unique[0];
}

function konekoDescription(context) {
  const region = evidenceCandidates(
    context,
    allElements(context, node => hasClass(node, 'petDtlInt')),
    'introduction region',
    { optional: true },
  );
  if (!region) return '';
  const content = descendantEvidence(
    context,
    region,
    node => hasClass(node, 'gnrCnt'),
    'introduction content',
  );
  return nodeText(content, { preserveBreaks: true, skipHeadings: true });
}

function canonicalDetailUrl(context, pageUrl) {
  const candidates = allElements(context, (node) => {
    if (node.tagName !== 'link') return false;
    return String(attr(node, 'rel') || '').split(HTML_WHITESPACE).filter(Boolean)
      .some(token => token.toLowerCase() === 'canonical');
  });
  if (!candidates.length) return pageUrl;
  for (const node of candidates) assertSourceBacked(context, node, 'canonical link');
  if (candidates.length !== 1) throw new Error('Koneko canonical link must be unique');
  const rel = String(attr(candidates[0], 'rel') || '').split(HTML_WHITESPACE).filter(Boolean);
  if (rel.length !== 1 || rel[0].toLowerCase() !== 'canonical') throw new Error('Koneko canonical relation is invalid');
  const url = absoluteUrl(attr(candidates[0], 'href'), pageUrl);
  if (!url) throw new Error('Koneko canonical URL is invalid');
  return url;
}

function cardDetailIdentity(context, card, pageUrl) {
  const links = descendants(context, card, node => isHtmlElement(node, 'a') && attr(node, 'href') !== undefined);
  const matches = [];
  for (const link of links) {
    assertSourceBacked(context, link, 'card breeder link', { within: card });
    const url = absoluteUrl(attr(link, 'href'), pageUrl);
    if (!url) continue;
    let parsed;
    try { parsed = new URL(url); } catch { continue; }
    const match = /^\/cat(\d{4}-\d{5})\.html$/.exec(parsed.pathname);
    if (match && parsed.origin === new URL(pageUrl).origin) matches.push({ breederId: match[1], url });
  }
  const ids = [...new Set(matches.map(match => match.breederId))];
  if (ids.length !== 1) throw new Error('card must contain exactly one breeder link');
  const breederId = ids[0];
  const images = descendants(context, card, node => isHtmlElement(node) && attr(node, 'id') === `src_${breederId}`);
  for (const image of images) assertSourceBacked(context, image, 'card breeder image', { within: card });
  if (images.length !== 1) throw new Error('card link/image IDs disagree');
  return { breederId, detailUrl: matches.find(match => match.breederId === breederId).url };
}

function cardStatus(context, card) {
  const state = descendantEvidence(
    context,
    card,
    node => hasClass(node, 'listLmtInfStt'),
    'list status container',
  );
  const stateText = nodeText(state);
  const directStatus = stateText === 'NEW' ? '' : STATUS_TEXT.get(stateText);
  if (stateText && !directStatus && stateText !== 'NEW') throw new Error(`unknown status markup: ${stateText}`);

  const markedNodes = descendants(context, card, node => isHtmlElement(node)
    && ['business', 'closed', 'sold', 'status'].some(className => hasClass(node, className))
    && !excludedByVisibility(node));
  const statuses = [];
  for (const node of markedNodes) {
    assertSourceBacked(context, node, 'list status', { within: card });
    const label = nodeText(node);
    const status = STATUS_TEXT.get(label);
    if (!status) throw new Error(`unknown status markup: ${label}`);
    statuses.push(status);
  }
  if (directStatus) statuses.push(directStatus);
  if (statuses.length) {
    const unique = [...new Set(statuses)];
    if (unique.length !== 1) throw new Error('conflicting status markup');
    return unique[0];
  }

  const newMarkers = descendants(context, state, node => isHtmlElement(node)
    && hasClass(node, 'new') && !excludedByVisibility(node));
  for (const marker of newMarkers) assertSourceBacked(context, marker, 'live-list marker', { within: state });
  if (newMarkers.length !== 1 || nodeText(newMarkers[0]) !== 'NEW') {
    throw new Error('live-list marker or status is missing');
  }
  return 'available';
}

function paginationNextUrl(context, pagination, pageUrl, accountId) {
  const candidates = [];
  const anchors = descendants(context, pagination, node => isHtmlElement(node, 'a'));
  for (const anchor of anchors) {
    assertSourceBacked(context, anchor, 'pagination link', { within: pagination });
    if (excludedByVisibility(anchor)) continue;
    const label = nodeText(anchor);
    if (!/^(?:次へ|next)$/i.test(label)) continue;
    const href = absoluteUrl(attr(anchor, 'href'), pageUrl);
    if (!href) continue;
    let url;
    try { url = new URL(href); } catch { continue; }
    const breederIds = url.searchParams.getAll('breeder_id');
    const pageNums = url.searchParams.getAll('pageNum');
    const keys = [...url.searchParams.keys()];
    if (url.origin !== new URL(pageUrl).origin || url.pathname !== '/breederDetail.php'
      || breederIds.length !== 1 || breederIds[0] !== accountId
      || pageNums.length !== 1 || !/^\d+$/.test(pageNums[0])
      || keys.some(key => key !== 'breeder_id' && key !== 'pageNum')
      || (url.hash && url.hash !== '#cat_list')) continue;
    candidates.push(url.href);
  }
  const unique = [...new Set(candidates)];
  if (unique.length > 1) throw new Error('Koneko next-page URL is conflicting');
  return unique[0] || '';
}

export function parseKonekoListPage(html, { accountId, pageUrl } = {}) {
  if (!nonBlank(accountId) || !nonBlank(pageUrl)) throw new Error('accountId and pageUrl are required');
  const context = parseKonekoDocument(html);
  const rawCards = allElements(context, node => node.tagName === 'li'
    && hasEveryClass(node, ['Min_d-flex', 'box02Inner']));
  for (const card of rawCards) assertSourceBacked(context, card, 'list card');
  const cardNodes = rawCards.filter(node => !excludedByVisibility(node));
  if (!cardNodes.length) throw new Error('no Koneko cards found');
  const ids = new Set();
  const cards = cardNodes.map((card) => {
    const identity = cardDetailIdentity(context, card, pageUrl);
    if (ids.has(identity.breederId)) throw new Error(`duplicate card ID: ${identity.breederId}`);
    ids.add(identity.breederId);
    return { ...identity, status: cardStatus(context, card) };
  });

  const paginations = allElements(context, node => hasClass(node, 'pagenation'));
  for (const node of paginations) assertSourceBacked(context, node, 'pagination');
  const matching = paginations.map((node) => {
    const text = nodeText(node, { visibleOnly: false });
    const range = /(\d+)\s*[～〜~-]\s*(\d+)\s*件を表示/i.exec(text);
    return { node, range };
  }).filter(candidate => candidate.range
    && cards.length === Number(candidate.range[2]) - Number(candidate.range[1]) + 1);
  if (matching.length !== 1) throw new Error('pagination range receipt is missing or ambiguous');
  const { node: pagination, range } = matching[0];
  const totals = descendants(context, pagination, node => isHtmlElement(node) && hasClass(node, 'totalNum'));
  for (const node of totals) assertSourceBacked(context, node, 'pagination total', { within: pagination });
  if (totals.length !== 1 || !/^\d+$/.test(nodeText(totals[0], { visibleOnly: false }))) {
    throw new Error('pagination total receipt is missing or ambiguous');
  }
  const rangeStart = Number(range[1]);
  const rangeEnd = Number(range[2]);
  if (cards.length !== rangeEnd - rangeStart + 1) throw new Error('range/card count mismatch');
  return {
    accountId,
    pageUrl,
    cards,
    declaredTotal: Number(nodeText(totals[0], { visibleOnly: false })),
    rangeStart,
    rangeEnd,
    nextPageUrl: paginationNextUrl(context, pagination, pageUrl, accountId),
    sha256: createHash('sha256').update(String(html)).digest('hex'),
  };
}

export function parseKonekoDetailPage(html, {
  expectedAccountId,
  expectedBreederId,
  pageUrl,
} = {}) {
  if (!nonBlank(expectedAccountId) || !BREEDER_ID.test(expectedBreederId || '') || !nonBlank(pageUrl)) {
    throw new Error('detail options are required');
  }
  const context = parseKonekoDocument(html);
  const product = productJsonLd(context);
  const breederId = String(product?.sku || '');
  if (breederId !== expectedBreederId) throw new Error(`Koneko SKU/breeder mismatch: ${breederId}`);
  const facts = konekoFacts(context);
  const photos = productImages(product, pageUrl);
  if (!photos.length) throw new Error('Koneko source photos are missing');
  const accountIds = [...new Set(photos.map(url => /\/breeder\/data\/([^/]+)\//i.exec(url)?.[1]).filter(Boolean))];
  if (accountIds.length !== 1 || accountIds[0] !== expectedAccountId) throw new Error('Koneko account mismatch');
  const detailUrl = canonicalDetailUrl(context, pageUrl);
  let canonical;
  try { canonical = new URL(detailUrl); } catch { throw new Error('Koneko canonical URL is invalid'); }
  if (canonical.origin !== new URL(pageUrl).origin || canonical.pathname !== `/cat${expectedBreederId}.html`) {
    throw new Error('Koneko canonical identity mismatch');
  }
  return {
    breederId,
    accountId: expectedAccountId,
    ...facts,
    price: productPrice(product),
    photos,
    videoId: konekoVideoId(context, pageUrl),
    ...konekoParents(context),
    description: konekoDescription(context),
    detailUrl,
  };
}

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const ORIGIN = 'https://fuluckpet.com';
const LIST_PAGES = ['en/kittens.html', 'kittens.html', 'zh/kittens.html'];
const REQUIRED_TEXT_INPUTS = ['llms-full.txt', 'llms.txt', 'sitemap.xml'];
const SKIP_DIRECTORIES = new Set(['.git', '.superpowers', 'node_modules']);
const AVAILABILITY_ALLOWLIST = new Set([
  'https://schema.org/InStock',
  'https://schema.org/LimitedAvailability',
]);
const MERCHANT_POLICY_FIELDS = [
  'hasMerchantReturnPolicy',
  'merchantReturnPolicy',
  'priceValidUntil',
  'returnPolicy',
  'shippingDetails',
];

function addFinding(findings, code, relativePath, message) {
  findings.push({ code, path: relativePath, message });
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareFindings(left, right) {
  return compareText(left.code, right.code) ||
    compareText(left.path, right.path) ||
    compareText(left.message, right.message);
}

function normalizeRelative(relativePath) {
  return relativePath.split(path.sep).join('/');
}

function listAuditedInputs(root) {
  const relativePaths = [];

  function visit(absoluteDirectory, relativeDirectory) {
    const entries = fs.readdirSync(absoluteDirectory, { withFileTypes: true })
      .sort((left, right) => compareText(left.name, right.name));
    for (const entry of entries) {
      const relative = relativeDirectory
        ? path.join(relativeDirectory, entry.name)
        : entry.name;
      const absolute = path.join(absoluteDirectory, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRECTORIES.has(entry.name)) visit(absolute, relative);
        continue;
      }
      if (!entry.isFile()) continue;
      const normalized = normalizeRelative(relative);
      if (normalized.toLowerCase().endsWith('.html') ||
          REQUIRED_TEXT_INPUTS.includes(normalized)) {
        relativePaths.push(normalized);
      }
    }
  }

  visit(root, '');
  return relativePaths.sort(compareText);
}

function digestInputs(inputs) {
  const hash = crypto.createHash('sha256');
  for (const input of inputs) {
    const pathBytes = Buffer.from(input.path, 'utf8');
    hash.update(String(pathBytes.length));
    hash.update(':');
    hash.update(pathBytes);
    hash.update('\0');
    hash.update(String(input.bytes.length));
    hash.update(':');
    hash.update(input.bytes);
    hash.update('\0');
  }
  return hash.digest('hex');
}

function attributeValue(tag, name) {
  const htmlSpace = '[\\t\\n\\f\\r ]';
  const expression = new RegExp(
    `(?:^|${htmlSpace})${name}(?=${htmlSpace}|=|>|$)` +
      `${htmlSpace}*=${htmlSpace}*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`,
    'i',
  );
  const match = String(tag).match(expression);
  return match ? (match[1] ?? match[2] ?? match[3] ?? '') : '';
}

function htmlCommentRanges(source) {
  const ranges = [];
  let cursor = 0;
  while (cursor < source.length) {
    const start = source.indexOf('<!--', cursor);
    if (start === -1) break;
    const closing = source.indexOf('-->', start + 4);
    const end = closing === -1 ? source.length : closing + 3;
    ranges.push([start, end]);
    if (closing === -1) break;
    cursor = end;
  }
  return ranges;
}

function insideHtmlComment(index, ranges) {
  for (const [start, end] of ranges) {
    if (index < start) return false;
    if (index < end) return true;
  }
  return false;
}

function stripHtmlComments(markup) {
  return String(markup).replace(/<!--[\s\S]*?(?:-->|$)/g, '');
}

function stripInactiveMarkup(markup) {
  return stripHtmlComments(markup)
    .replace(
      /<(script|style|template|textarea|title|noscript)\b[^>]*>[\s\S]*?(?:<\/\1\s*>|$)/gi,
      '',
    );
}

function effectiveHeadMarkup(html) {
  const source = String(html);
  const opening = /<head\b[^>]*>/i.exec(source);
  const start = opening ? opening.index + opening[0].length : 0;
  const headClose = source.slice(start).search(/<\/head\s*>/i);
  const bodyOpen = source.slice(start).search(/<body\b/i);
  const endings = [headClose, bodyOpen].filter((index) => index >= 0);
  const end = endings.length > 0 ? start + Math.min(...endings) : source.length;
  return stripInactiveMarkup(source.slice(start, end));
}

function isNoindex(html) {
  const source = effectiveHeadMarkup(html);
  for (const match of source.matchAll(/<meta\b[^>]*>/gi)) {
    const name = attributeValue(match[0], 'name').toLowerCase();
    if (!['robots', 'googlebot', 'bingbot'].includes(name)) continue;
    const directives = attributeValue(match[0], 'content')
      .toLowerCase()
      .split(/[\s,]+/)
      .filter(Boolean);
    if (directives.includes('noindex') || directives.includes('none')) return true;
  }
  return false;
}

function hasSchemaType(value, expectedType) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const type = value['@type'];
  return type === expectedType || (Array.isArray(type) && type.includes(expectedType));
}

function collectSchemaNodes(value, expectedType, nodes = []) {
  if (!value || typeof value !== 'object') return nodes;
  if (Array.isArray(value)) {
    for (const child of value) collectSchemaNodes(child, expectedType, nodes);
    return nodes;
  }
  if (hasSchemaType(value, expectedType)) nodes.push(value);
  for (const child of Object.values(value)) {
    collectSchemaNodes(child, expectedType, nodes);
  }
  return nodes;
}

function flattenTopLevelArrays(value, entities) {
  if (Array.isArray(value)) {
    for (const child of value) flattenTopLevelArrays(child, entities);
  } else {
    entities.push(value);
  }
}

// This is a JSON token walk, not a script-wide regex. Each object owns its key
// count, so two separate Product objects may each publish one brand safely.
function countRawDuplicateBrandProducts(source) {
  let cursor = 0;
  let duplicateProducts = 0;

  function skipWhitespace() {
    while (/\s/.test(source[cursor] || '')) cursor += 1;
  }

  function parseStringNode() {
    const start = cursor;
    cursor += 1;
    while (cursor < source.length) {
      if (source[cursor] === '\\') {
        cursor += 2;
      } else if (source[cursor] === '"') {
        cursor += 1;
        break;
      } else {
        cursor += 1;
      }
    }
    return { kind: 'scalar', value: JSON.parse(source.slice(start, cursor)) };
  }

  function parseScalarNode() {
    const start = cursor;
    while (cursor < source.length && !/[\s,\]}]/.test(source[cursor])) cursor += 1;
    return { kind: 'scalar', value: JSON.parse(source.slice(start, cursor)) };
  }

  function typeValues(node) {
    if (!node) return [];
    if (node.kind === 'scalar' && typeof node.value === 'string') return [node.value];
    if (node.kind === 'array') {
      return node.values.flatMap((value) => typeValues(value));
    }
    return [];
  }

  function parseArrayNode() {
    cursor += 1;
    skipWhitespace();
    const values = [];
    if (source[cursor] === ']') {
      cursor += 1;
      return { kind: 'array', values };
    }
    while (cursor < source.length) {
      values.push(parseValueNode());
      skipWhitespace();
      if (source[cursor] === ']') {
        cursor += 1;
        break;
      }
      cursor += 1;
      skipWhitespace();
    }
    return { kind: 'array', values };
  }

  function parseObjectNode() {
    cursor += 1;
    skipWhitespace();
    const pairs = [];
    let brandCount = 0;
    if (source[cursor] === '}') {
      cursor += 1;
      return { kind: 'object', pairs };
    }
    while (cursor < source.length) {
      const keyNode = parseStringNode();
      const key = keyNode.value;
      skipWhitespace();
      cursor += 1;
      skipWhitespace();
      const value = parseValueNode();
      pairs.push({ key, value });
      if (key === 'brand') brandCount += 1;
      skipWhitespace();
      if (source[cursor] === '}') {
        cursor += 1;
        break;
      }
      cursor += 1;
      skipWhitespace();
    }
    const schemaTypes = pairs
      .filter((pair) => pair.key === '@type')
      .flatMap((pair) => typeValues(pair.value));
    if (schemaTypes.includes('Product') && brandCount > 1) duplicateProducts += 1;
    return { kind: 'object', pairs };
  }

  function parseValueNode() {
    skipWhitespace();
    if (source[cursor] === '{') return parseObjectNode();
    if (source[cursor] === '[') return parseArrayNode();
    if (source[cursor] === '"') return parseStringNode();
    return parseScalarNode();
  }

  parseValueNode();
  return duplicateProducts;
}

function parseJsonLdScripts(html, relativePath = '<inline>', findings = [], metadata = {}) {
  const entities = [];
  metadata.scriptCount = 0;
  metadata.rawDuplicateBrandProducts = 0;
  const source = String(html);
  const comments = htmlCommentRanges(source);
  const openingPattern = /<script\b([^>]*)>/gi;
  const closingPattern = /<\/script\s*>/gi;
  let opening;

  while ((opening = openingPattern.exec(source)) !== null) {
    if (insideHtmlComment(opening.index, comments)) continue;
    const type = attributeValue(opening[1], 'type').toLowerCase();
    const contentStart = openingPattern.lastIndex;
    closingPattern.lastIndex = contentStart;
    const closing = closingPattern.exec(source);
    if (!closing) {
      if (type === 'application/ld+json') {
        metadata.scriptCount += 1;
        addFinding(
          findings,
          'JSON_LD_INVALID',
          relativePath,
          `JSON-LD script ${metadata.scriptCount} has no closing script tag.`,
        );
      }
      break;
    }
    openingPattern.lastIndex = closingPattern.lastIndex;
    if (type !== 'application/ld+json') continue;
    metadata.scriptCount += 1;
    const rawJson = source.slice(contentStart, closing.index);
    try {
      const parsed = JSON.parse(rawJson);
      flattenTopLevelArrays(parsed, entities);
      metadata.rawDuplicateBrandProducts += countRawDuplicateBrandProducts(rawJson);
    } catch {
      addFinding(
        findings,
        'JSON_LD_INVALID',
        relativePath,
        `JSON-LD script ${metadata.scriptCount} is not valid JSON.`,
      );
    }
  }
  return entities;
}

function visibleDetailPrice(html) {
  const match = stripInactiveMarkup(html).match(
    /<p\b[^>]*\bclass\s*=\s*["'][^"']*\bkitten-detail-price\b[^"']*["'][^>]*>([\s\S]*?)<\/p>/i,
  );
  if (!match) return { landmark: false, priced: false };
  return {
    landmark: true,
    priced: /(?:&yen;|&#165;|&#x0*a5;|¥)\s*[\d][\d,]*/i.test(match[1]),
  };
}

function detailRoute(relativePath) {
  const match = relativePath.match(/^(?:(en|zh)\/)?kittens\/([^/]+)\.html$/);
  if (!match || match[2] === 'index') return null;
  return { language: match[1] || 'ja', breederId: match[2] };
}

function validateMerchantPolicies(relativePath, nodes, findings) {
  for (const node of nodes) {
    for (const field of MERCHANT_POLICY_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(node, field)) {
        addFinding(
          findings,
          'MERCHANT_POLICY_UNVERIFIED',
          relativePath,
          `${hasSchemaType(node, 'Offer') ? 'Offer' : 'Product'} must not publish unverified ${field}.`,
        );
      }
    }
  }
}

function validateParsedBrandCardinality(relativePath, products, findings) {
  for (const product of products) {
    if (Array.isArray(product.brand) && product.brand.length > 1) {
      addFinding(
        findings,
        'BRAND_DUPLICATE',
        relativePath,
        'A Product must not publish more than one brand.',
      );
    }
  }
}

function validateAvailability(relativePath, offers, findings) {
  for (const offer of offers) {
    if (!Object.prototype.hasOwnProperty.call(offer, 'availability')) continue;
    if (!AVAILABILITY_ALLOWLIST.has(offer.availability)) {
      addFinding(
        findings,
        'AVAILABILITY_INVALID',
        relativePath,
        `Offer availability is outside the site allowlist: ${String(offer.availability)}.`,
      );
    }
  }
}

function validateListPage(relativePath, nodes, findings) {
  const { itemLists, products, offers } = nodes;
  if (itemLists.length !== 1) {
    addFinding(
      findings,
      'LIST_ITEMLIST_CARDINALITY',
      relativePath,
      `Kitten list must publish exactly one ItemList; found ${itemLists.length}.`,
    );
  }
  if (products.length > 0) {
    addFinding(
      findings,
      'LIST_PRODUCT_FORBIDDEN',
      relativePath,
      `Kitten list must not publish Product schema; found ${products.length}.`,
    );
  }
  if (offers.length > 0) {
    addFinding(
      findings,
      'LIST_OFFER_FORBIDDEN',
      relativePath,
      `Kitten list must not publish Offer schema; found ${offers.length}.`,
    );
  }
}

function validKittenBrand(brand) {
  return brand && typeof brand === 'object' && !Array.isArray(brand) &&
    hasSchemaType(brand, 'Brand') &&
    typeof brand.name === 'string' && brand.name.trim().length > 0;
}

function validateDetailPage(relativePath, html, route, nodes, findings) {
  const price = visibleDetailPrice(html);
  const { products, offers } = nodes;

  if (!price.landmark) {
    addFinding(
      findings,
      'DETAIL_PRICE_LANDMARK_MISSING',
      relativePath,
      'Kitten detail is missing the generated visible price landmark.',
    );
    return;
  }
  if (!price.priced) {
    if (products.length > 0 || offers.length > 0) {
      addFinding(
        findings,
        'DETAIL_UNPRICED_SCHEMA',
        relativePath,
        `Unpriced kitten detail must publish no Product or Offer; found ${products.length} Product and ${offers.length} Offer.`,
      );
    }
    return;
  }
  if (products.length !== 1) {
    addFinding(
      findings,
      'DETAIL_PRODUCT_CARDINALITY',
      relativePath,
      `Priced kitten detail must publish exactly one Product; found ${products.length}.`,
    );
    return;
  }

  const product = products[0];
  const expectedProductId = `${ORIGIN}/kittens/${route.breederId}.html#product`;
  if (product['@id'] !== expectedProductId) {
    addFinding(
      findings,
      'DETAIL_PRODUCT_ID_INVALID',
      relativePath,
      `Product @id must be ${expectedProductId}.`,
    );
  }
  if (!(Array.isArray(product.brand) && product.brand.length > 1) &&
      !validKittenBrand(product.brand)) {
    addFinding(
      findings,
      'BRAND_INVALID',
      relativePath,
      'Kitten Product must publish one valid Brand object.',
    );
  }

  const ownedOffer = product.offers;
  const ownsOnlyOffer = ownedOffer && typeof ownedOffer === 'object' &&
    !Array.isArray(ownedOffer) && hasSchemaType(ownedOffer, 'Offer') &&
    offers.length === 1 && offers[0] === ownedOffer;
  if (!ownsOnlyOffer) {
    addFinding(
      findings,
      'DETAIL_OFFER_CARDINALITY',
      relativePath,
      `Priced kitten Product must own the only typed Offer; found ${offers.length}.`,
    );
    return;
  }

  const expectedOfferUrl = `${ORIGIN}/${relativePath}`;
  if (ownedOffer.url !== expectedOfferUrl) {
    addFinding(
      findings,
      'DETAIL_OFFER_URL_INVALID',
      relativePath,
      `Offer URL must be ${expectedOfferUrl}.`,
    );
  }
  const seller = ownedOffer.seller;
  if (!seller || typeof seller !== 'object' || Array.isArray(seller) ||
      seller['@id'] !== `${ORIGIN}/#cattery` || Object.keys(seller).length !== 1) {
    addFinding(
      findings,
      'SELLER_ENTITY_INVALID',
      relativePath,
      `Offer seller must be the exact ${ORIGIN}/#cattery reference.`,
    );
  }
  if (!Object.prototype.hasOwnProperty.call(ownedOffer, 'availability')) {
    addFinding(
      findings,
      'AVAILABILITY_INVALID',
      relativePath,
      'Priced kitten Offer must publish an allowlisted availability.',
    );
  }
}

function internalPageForUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  let pathname;
  try {
    pathname = decodeURIComponent(parsed.pathname);
  } catch {
    return null;
  }
  if (pathname === '/') return 'index.html';
  const relative = pathname.replace(/^\/+/, '');
  return relative.endsWith('/') ? `${relative}index.html` : relative;
}

function validateLlmsFile(root, relativePath, source, findings) {
  const reviewTerm = '(?:reviews?|review count|レビュー|口コミ|評価|評價|评价)';
  const exactReviewCount = new RegExp(
    `(?:\\b113\\b[^\\n]{0,40}${reviewTerm}|${reviewTerm}[^\\n]{0,40}\\b113\\b)`,
    'i',
  );
  if (exactReviewCount.test(source)) {
    addFinding(
      findings,
      'EXACT_REVIEW_COUNT',
      relativePath,
      'LLMS content must use a stable review-count floor instead of exact 113.',
    );
  }
  if (/\/kittens\/\d{4}-\d{5}\.html\b/.test(source)) {
    addFinding(
      findings,
      'LLMS_VOLATILE_ID',
      relativePath,
      'LLMS content must not pin a volatile kitten detail ID.',
    );
  }

  const candidates = source.match(
    /https:\/\/fuluckpet\.com(?:\/[A-Za-z0-9._~!$&'*+,;=:@%/?#-]*)?/g,
  ) || [];
  const seen = new Set();
  for (const candidate of candidates.sort(compareText)) {
    const url = candidate.replace(/[.,;:!?]+$/, '');
    const page = internalPageForUrl(url);
    if (!page || seen.has(page)) continue;
    seen.add(page);
    if (!fs.existsSync(path.join(root, page))) {
      addFinding(
        findings,
        'LLMS_INTERNAL_URL_MISSING',
        relativePath,
        `Concrete internal URL has no local page: ${url}.`,
      );
    }
  }
}

function gitValue(root, args, label) {
  try {
    return execFileSync('git', ['-C', root, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    throw new Error(`Unable to read ${label} from git for the audit root.`);
  }
}

function provenance(root, options) {
  return {
    sourceTimestamp: options.sourceTimestamp ??
      gitValue(root, ['show', '-s', '--format=%cI', 'HEAD'], 'sourceTimestamp'),
    baseCommit: options.baseCommit ??
      gitValue(root, ['rev-parse', 'HEAD'], 'baseCommit'),
  };
}

function checkDefinitions(errors) {
  const definitions = [
    ['AVAILABILITY_ALLOWLIST', ['AVAILABILITY_INVALID']],
    ['BRAND_CARDINALITY', ['BRAND_DUPLICATE', 'BRAND_INVALID']],
    ['INPUT_DISCOVERY', ['AUDIT_INPUT_MISSING']],
    ['JSON_LD_PARSE', ['JSON_LD_INVALID']],
    ['KITTEN_DETAIL_SCHEMA', [
      'DETAIL_LANGUAGE_CARDINALITY', 'DETAIL_OFFER_CARDINALITY',
      'DETAIL_OFFER_URL_INVALID', 'DETAIL_PRICE_LANDMARK_MISSING',
      'DETAIL_PRODUCT_CARDINALITY', 'DETAIL_PRODUCT_ID_INVALID',
      'DETAIL_UNPRICED_SCHEMA', 'SELLER_ENTITY_INVALID',
    ]],
    ['KITTEN_LIST_SCHEMA', [
      'LIST_ITEMLIST_CARDINALITY', 'LIST_OFFER_FORBIDDEN',
      'LIST_PAGE_MISSING', 'LIST_PAGE_NOT_PUBLIC', 'LIST_PRODUCT_FORBIDDEN',
    ]],
    ['LLMS_STABILITY', [
      'EXACT_REVIEW_COUNT', 'LLMS_INTERNAL_URL_MISSING', 'LLMS_VOLATILE_ID',
    ]],
    ['MERCHANT_POLICY', ['MERCHANT_POLICY_UNVERIFIED']],
    ['SEARCH_ACTION', ['SEARCH_ACTION_OBSOLETE', 'SEARCH_TERM_TEMPLATE_OBSOLETE']],
  ];
  const errorCodes = new Set(errors.map((error) => error.code));
  return definitions.map(([code, codes]) => ({
    code,
    status: codes.some((findingCode) => errorCodes.has(findingCode)) ? 'fail' : 'pass',
  }));
}

function assertReadableRoot(root) {
  try {
    const stat = fs.statSync(root);
    if (!stat.isDirectory()) throw new Error('not a directory');
    fs.accessSync(root, fs.constants.R_OK);
    fs.readdirSync(root);
  } catch {
    throw new Error('Audit root is unreadable or not a directory.');
  }
}

function auditSite(options = {}) {
  const root = path.resolve(options.root || process.cwd());
  assertReadableRoot(root);
  const source = provenance(root, options);
  const relativePaths = listAuditedInputs(root);
  const inputs = relativePaths.map((relativePath) => ({
    path: relativePath,
    bytes: fs.readFileSync(path.join(root, relativePath)),
  }));
  const inputDigest = digestInputs(inputs);
  const inputMap = new Map(inputs.map((input) => [input.path, input.bytes]));
  const errors = [];
  const warnings = [];
  const detailLanguages = new Map();
  const publicHtmlPaths = new Set();
  let htmlCount = 0;
  let publicHtmlCount = 0;
  let noindexHtmlCount = 0;
  let jsonLdScriptCount = 0;
  let itemListCount = 0;
  let productCount = 0;
  let offerCount = 0;

  for (const required of REQUIRED_TEXT_INPUTS) {
    if (!inputMap.has(required)) {
      addFinding(errors, 'AUDIT_INPUT_MISSING', required, `Required audited input is missing: ${required}.`);
    }
  }

  for (const input of inputs) {
    if (!input.path.toLowerCase().endsWith('.html')) continue;
    htmlCount += 1;
    const html = input.bytes.toString('utf8');
    if (isNoindex(html)) {
      noindexHtmlCount += 1;
      continue;
    }
    publicHtmlCount += 1;
    publicHtmlPaths.add(input.path);
    const metadata = {};
    const entities = parseJsonLdScripts(html, input.path, errors, metadata);
    jsonLdScriptCount += metadata.scriptCount;
    const itemLists = collectSchemaNodes(entities, 'ItemList');
    const products = collectSchemaNodes(entities, 'Product');
    const offers = collectSchemaNodes(entities, 'Offer');
    const searchActions = collectSchemaNodes(entities, 'SearchAction');
    const searchTermTemplateCount = (
      stripHtmlComments(html).match(/\{search_term_string\}/gi) || []
    ).length;
    itemListCount += itemLists.length;
    productCount += products.length;
    offerCount += offers.length;

    if (metadata.rawDuplicateBrandProducts > 0) {
      addFinding(
        errors,
        'BRAND_DUPLICATE',
        input.path,
        `${metadata.rawDuplicateBrandProducts} Product object(s) repeat the raw brand key.`,
      );
    }
    validateParsedBrandCardinality(input.path, products, errors);
    validateAvailability(input.path, offers, errors);
    validateMerchantPolicies(input.path, [...products, ...offers], errors);
    if (searchActions.length > 0) {
      addFinding(
        errors,
        'SEARCH_ACTION_OBSOLETE',
        input.path,
        `Public page must not publish SearchAction; found ${searchActions.length}.`,
      );
    }
    if (searchTermTemplateCount > 0) {
      addFinding(
        errors,
        'SEARCH_TERM_TEMPLATE_OBSOLETE',
        input.path,
        `Public page must not publish {search_term_string}; found ${searchTermTemplateCount}.`,
      );
    }

    const nodes = { itemLists, products, offers };
    if (LIST_PAGES.includes(input.path)) validateListPage(input.path, nodes, errors);
    const route = detailRoute(input.path);
    if (route) {
      if (!detailLanguages.has(route.breederId)) detailLanguages.set(route.breederId, new Set());
      detailLanguages.get(route.breederId).add(route.language);
      validateDetailPage(input.path, html, route, nodes, errors);
    }
  }

  for (const listPage of LIST_PAGES) {
    if (!inputMap.has(listPage)) {
      addFinding(errors, 'LIST_PAGE_MISSING', listPage, `Required localized list page is missing: ${listPage}.`);
    } else if (!publicHtmlPaths.has(listPage)) {
      addFinding(errors, 'LIST_PAGE_NOT_PUBLIC', listPage, `Required localized list page is not public: ${listPage}.`);
    }
  }
  for (const [breederId, languages] of [...detailLanguages.entries()].sort((left, right) => compareText(left[0], right[0]))) {
    if (languages.size !== 3 || !['ja', 'en', 'zh'].every((language) => languages.has(language))) {
      addFinding(
        errors,
        'DETAIL_LANGUAGE_CARDINALITY',
        `kittens/${breederId}.html`,
        `Kitten detail must have ja/en/zh siblings; found ${[...languages].sort(compareText).join(',')}.`,
      );
    }
  }

  let llmsFileCount = 0;
  for (const relativePath of ['llms-full.txt', 'llms.txt']) {
    const bytes = inputMap.get(relativePath);
    if (!bytes) continue;
    llmsFileCount += 1;
    validateLlmsFile(root, relativePath, bytes.toString('utf8'), errors);
  }

  errors.sort(compareFindings);
  warnings.sort(compareFindings);
  const summary = {
    auditedInputCount: inputs.length,
    htmlCount,
    publicHtmlCount,
    noindexHtmlCount,
    jsonLdScriptCount,
    itemListCount,
    productCount,
    offerCount,
    llmsFileCount,
    errorCount: errors.length,
    warningCount: warnings.length,
  };
  const checks = checkDefinitions(errors).sort((left, right) => compareText(left.code, right.code));

  return {
    schemaVersion: '1.0',
    sourceTimestamp: source.sourceTimestamp,
    baseCommit: source.baseCommit,
    inputDigest,
    status: errors.length === 0 ? 'pass' : 'fail',
    summary,
    errors,
    warnings,
    checks,
  };
}

function markdownFindings(title, findings) {
  const lines = [`## ${title}`, ''];
  if (findings.length === 0) return [...lines, '- None', ''];
  for (const finding of findings) {
    lines.push(`- [${finding.code}] ${finding.path}: ${finding.message}`);
  }
  lines.push('');
  return lines;
}

function renderMarkdown(result) {
  const lines = [
    '# SEO/GEO Audit',
    '',
    `- Status: ${result.status}`,
    `- Schema version: ${result.schemaVersion}`,
    `- Source timestamp: ${result.sourceTimestamp}`,
    `- Base commit: ${result.baseCommit}`,
    `- Input digest: ${result.inputDigest}`,
    `- Audited inputs: ${result.summary.auditedInputCount}`,
    `- Public HTML: ${result.summary.publicHtmlCount}`,
    `- Errors: ${result.summary.errorCount}`,
    `- Warnings: ${result.summary.warningCount}`,
    '',
    '## Checks',
    '',
    ...result.checks.map((check) => `- ${check.code}: ${check.status}`),
    '',
    ...markdownFindings('Errors', result.errors),
    ...markdownFindings('Warnings', result.warnings),
  ];
  return `${lines.join('\n').replace(/\n+$/, '')}\n`;
}

function parseCliArguments(argv) {
  const parsed = { root: process.cwd(), json: null, markdown: null };
  const seen = new Set();
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (!['--root', '--json', '--markdown'].includes(flag) || seen.has(flag)) {
      throw new Error(`Invalid CLI argument: ${flag}.`);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${flag}.`);
    seen.add(flag);
    parsed[flag.slice(2)] = value;
    index += 1;
  }
  return parsed;
}

function writeReport(target, content) {
  const absolute = path.resolve(target);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, content, 'utf8');
}

function runCli(argv = process.argv.slice(2), overrides = {}) {
  let cli;
  try {
    cli = parseCliArguments(argv);
    const root = path.resolve(cli.root);
    assertReadableRoot(root);
    const result = auditSite({ root, ...overrides });
    const json = `${JSON.stringify(result, null, 2)}\n`;
    const markdown = renderMarkdown(result);
    if (cli.json) writeReport(cli.json, json);
    if (cli.markdown) writeReport(cli.markdown, markdown);
    if (!cli.json && !cli.markdown && overrides.writeStdout !== false) {
      process.stdout.write(json);
    }
    return result.errors.length === 0 ? 0 : 1;
  } catch {
    if (overrides.writeStderr !== false) {
      process.stderr.write(
        'seo-geo-audit: invalid arguments or unable to read/write requested files.\n',
      );
    }
    return 2;
  }
}

if (require.main === module) {
  process.exitCode = runCli();
}

module.exports = {
  auditSite,
  parseJsonLdScripts,
  renderMarkdown,
  runCli,
};

import { createHash } from 'node:crypto';

export { renderAuditMarkdown } from './koneko-audit-output.js';

const ACCOUNT_ORDER = ['c995680', 'd696506'];
const ACTIVE_STATUSES = new Set(['available', 'reserved']);
const KNOWN_STATUSES = new Set(['available', 'reserved', 'sold']);
const REQUIRED_FACT_FIELDS = ['breed', 'color', 'gender', 'price', 'birthday'];
const OPTIONAL_FACT_FIELDS = ['papa', 'mama'];
const COMPARISON_FACT_FIELDS = [...REQUIRED_FACT_FIELDS, ...OPTIONAL_FACT_FIELDS];
const TEXT_FIELDS = ['note', 'description'];
const OPTIONAL_STRING_FIELDS = [...OPTIONAL_FACT_FIELDS, ...TEXT_FIELDS, 'videoId'];
const LOCALES = ['ja', 'en', 'zh'];
const BREEDER_ID = /^\d{4}-\d{5}$/;
const KONEKO_ORIGIN = 'https://www.koneko-breeder.com';
const FULUCK_ORIGIN = 'https://fuluckpet.com';
const FULUCK_API_URL = 'https://fuluck-api.mouxue56.workers.dev/api/kittens';
const CREDENTIAL_MARKER = /\b(?:authorization|bearer|api[-_ ]?key|token|password|secret|cookie)\b(?:\s*[:=]\s*|\s+)/i;

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nonBlank(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function isString(value) {
  return typeof value === 'string';
}

function sha256(value) {
  return createHash('sha256').update(String(value ?? ''), 'utf8').digest('hex');
}

function preview(value) {
  const line = String(value ?? '').replace(/\r\n?/g, '\n').split('\n')[0].trim();
  const safe = redactCredentialLike(line);
  return safe.length > 120 ? `${safe.slice(0, 117)}...` : safe;
}

function safeTextReceipt(value) {
  return { sha256: sha256(value), preview: preview(value) };
}

function canonicalEvidenceUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return '';
    url.hash = '';
    return url.href;
  } catch {
    return '';
  }
}

function safeUrl(value) {
  const canonical = canonicalEvidenceUrl(value);
  if (!canonical) return '';
  const url = new URL(canonical);
  if (url.origin === KONEKO_ORIGIN && url.pathname === '/breederDetail.php') {
    const breederId = url.searchParams.get('breeder_id');
    const pageNum = url.searchParams.get('pageNum');
    const params = new URLSearchParams();
    if (breederId) params.set('breeder_id', breederId);
    if (pageNum) params.set('pageNum', pageNum);
    return `${url.origin}${url.pathname}${params.size ? `?${params}` : ''}`;
  }
  return `${url.origin}${url.pathname}`;
}

function redactCredentialLike(value) {
  const text = String(value ?? '');
  const match = CREDENTIAL_MARKER.exec(text);
  return match ? `${text.slice(0, match.index)}[redacted]` : text;
}

function renderedPageCounts(pages) {
  const counts = Object.fromEntries(LOCALES.map(locale => [locale, 0]));
  if (!Array.isArray(pages)) return counts;
  for (const page of pages) if (LOCALES.includes(page?.locale)) counts[page.locale] += 1;
  return counts;
}

function exactFuluckPageUrl(breederId, locale) {
  return `${FULUCK_ORIGIN}${locale === 'ja' ? '' : `/${locale}`}/kittens/${breederId}.html`;
}

function receiptUrlMatchesAccount(value, accountId) {
  const canonical = canonicalEvidenceUrl(value);
  if (!canonical) return false;
  const url = new URL(canonical);
  const breederIds = url.searchParams.getAll('breeder_id');
  if (url.origin !== KONEKO_ORIGIN || url.pathname !== '/breederDetail.php' || breederIds.length !== 1 || breederIds[0] !== accountId) return false;
  return [...url.searchParams.keys()].every(key => key === 'breeder_id' || key === 'pageNum')
    && url.searchParams.getAll('pageNum').every(value => /^\d+$/.test(value));
}

function sourceDetailUrlMatches(value, breederId) {
  return canonicalEvidenceUrl(value) === `${KONEKO_ORIGIN}/cat${breederId}.html`;
}

function renderedPageUrl(page) {
  return canonicalEvidenceUrl(page?.state === 'rendered_page_missing' ? page.url : page?.detailUrl);
}

function renderedPageReceipts(pages) {
  if (!Array.isArray(pages)) return [];
  return pages.filter(isObject).map((page) => {
    const missing = page.state === 'rendered_page_missing';
    return {
      breederId: BREEDER_ID.test(page.breederId) ? page.breederId : '',
      locale: LOCALES.includes(page.locale) ? page.locale : '',
      url: safeUrl(renderedPageUrl(page)),
      ...(missing ? { state: 'rendered_page_missing' } : { sha256: validReceiptHash(page.sha256) ? page.sha256 : '' }),
    };
  }).sort((a, b) => compareStrings(a.breederId, b.breederId) || compareStrings(a.locale, b.locale));
}

function compareStrings(a, b) {
  return String(a).localeCompare(String(b), 'en');
}

function accountRank(accountId) {
  const index = ACCOUNT_ORDER.indexOf(accountId);
  return index === -1 ? ACCOUNT_ORDER.length : index;
}

function diffSort(a, b) {
  return accountRank(a.accountId) - accountRank(b.accountId)
    || compareStrings(a.breederId, b.breederId)
    || compareStrings(a.type, b.type)
    || compareStrings(a.field, b.field)
    || compareStrings(a.locale, b.locale);
}

function safeKittensSummary(kittens) {
  const statusCounts = { available: 0, reserved: 0, sold: 0 };
  const statusByBreederId = new Map();
  if (!Array.isArray(kittens)) return { uniqueIdCount: 0, statusCounts, ambiguousStatusCount: 0, activeCount: 0 };
  for (const kitten of kittens) {
    if (!isObject(kitten) || !BREEDER_ID.test(kitten.breederId)) continue;
    if (!statusByBreederId.has(kitten.breederId)) statusByBreederId.set(kitten.breederId, new Set());
    statusByBreederId.get(kitten.breederId).add(KNOWN_STATUSES.has(kitten.status) ? kitten.status : null);
  }
  let ambiguousStatusCount = 0;
  for (const statuses of statusByBreederId.values()) {
    const [status] = statuses;
    if (statuses.size !== 1 || !KNOWN_STATUSES.has(status)) {
      ambiguousStatusCount += 1;
      continue;
    }
    statusCounts[status] += 1;
  }
  return {
    uniqueIdCount: statusByBreederId.size,
    statusCounts,
    ambiguousStatusCount,
    activeCount: statusCounts.available + statusCounts.reserved,
  };
}

function safeAccountReceipt(account) {
  return {
    accountId: account.accountId,
    declaredTotal: Number.isInteger(account.declaredTotal) && account.declaredTotal >= 0 ? account.declaredTotal : '',
    receiptCount: Array.isArray(account.receipts) ? account.receipts.length : 0,
    ...safeKittensSummary(account.kittens),
    receipts: Array.isArray(account.receipts) ? account.receipts.map(receipt => ({
      url: safeUrl(receipt?.url), status: Number.isInteger(receipt?.status) ? receipt.status : '',
      contentType: allowedReceiptContentType(receipt?.contentType) ? receipt.contentType : '',
      sha256: validReceiptHash(receipt?.sha256) ? receipt.sha256 : '',
      rangeStart: receipt?.rangeStart, rangeEnd: receipt?.rangeEnd, declaredTotal: receipt?.declaredTotal,
    })) : [],
  };
}

function safeAccountReceipts(accounts) {
  const seen = new Set();
  if (!Array.isArray(accounts)) return [];
  return accounts.filter(account => {
    if (!isObject(account) || !ACCOUNT_ORDER.includes(account.accountId) || seen.has(account.accountId)) return false;
    seen.add(account.accountId);
    return true;
  }).map(safeAccountReceipt).sort((a, b) => accountRank(a.accountId) - accountRank(b.accountId));
}

function blockedResult(input, blocks) {
  const accounts = safeAccountReceipts(input?.accounts);
  return {
    timestamp: typeof input?.timestamp === 'string' ? input.timestamp : '',
    result: 'BLOCKED', exitCode: 3, accounts,
    fuluck: {
      apiRecordCount: Array.isArray(input?.fuluck?.apiRecords) ? input.fuluck.apiRecords.length : 0,
      renderedPageCounts: renderedPageCounts(input?.fuluck?.renderedPages),
      renderedPages: renderedPageReceipts(input?.fuluck?.renderedPages),
      checkedUrls: [],
    },
    diffs: [], blocks: [...new Set(blocks)].sort(compareStrings), noWritePerformed: true,
  };
}

function evidenceError(blocks, condition, message) {
  if (!condition) blocks.push(message);
}

function allowedReceiptContentType(value) {
  return typeof value === 'string' && /^text\/html(?:\s*;\s*charset\s*=\s*(?:utf-8|us-ascii))?$/i.test(value);
}

function validReceiptHash(value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}

function receiptIsComplete(receipt) {
  return isObject(receipt)
    && nonBlank(receipt.url) && Number.isInteger(receipt.status) && allowedReceiptContentType(receipt.contentType) && validReceiptHash(receipt.sha256)
    && Number.isInteger(receipt.rangeStart) && Number.isInteger(receipt.rangeEnd) && Number.isInteger(receipt.declaredTotal);
}

function validateInput(input) {
  const blocks = [];
  evidenceError(blocks, isObject(input), 'audit input is missing');
  if (!isObject(input)) return { blocks };
  evidenceError(blocks, nonBlank(input.timestamp) && Number.isFinite(Date.parse(input.timestamp)), 'audit timestamp is missing or invalid');
  evidenceError(blocks, Array.isArray(input.accounts), 'account evidence is missing');
  evidenceError(blocks, isObject(input.fuluck), 'Fuluck evidence is missing');
  if (!Array.isArray(input.accounts) || !isObject(input.fuluck)) return { blocks };

  const accounts = [...input.accounts];
  evidenceError(blocks, accounts.length === ACCOUNT_ORDER.length, 'account evidence is incomplete');
  const accountIds = accounts.map(account => account?.accountId);
  evidenceError(blocks, new Set(accountIds).size === accountIds.length && ACCOUNT_ORDER.every(id => accountIds.includes(id)), 'account IDs do not match the fixed audit set');

  const sourceById = new Map();
  const sourceDetails = new Map();
  const requiredCheckedUrls = new Set([FULUCK_API_URL]);
  for (const account of accounts) {
    if (!isObject(account) || !ACCOUNT_ORDER.includes(account.accountId)) { blocks.push('account receipt has an invalid account ID'); continue; }
    evidenceError(blocks, Number.isInteger(account.declaredTotal) && account.declaredTotal >= 0, `declared total is missing for ${account.accountId}`);
    evidenceError(blocks, Array.isArray(account.receipts) && account.receipts.length > 0, `pagination receipts are missing for ${account.accountId}`);
    evidenceError(blocks, Array.isArray(account.kittens), `source catalogue is missing for ${account.accountId}`);
    evidenceError(blocks, Array.isArray(account.activeDetails), `source active details are missing for ${account.accountId}`);
    if (!Array.isArray(account.receipts) || !Array.isArray(account.kittens) || !Array.isArray(account.activeDetails)) continue;
    let expectedStart = 1;
    for (const receipt of account.receipts) {
      evidenceError(blocks, receiptIsComplete(receipt), `pagination receipt is incomplete for ${account.accountId}`);
      if (!receiptIsComplete(receipt)) continue;
      evidenceError(blocks, receiptUrlMatchesAccount(receipt.url, account.accountId), `pagination receipt URL is invalid for ${account.accountId}`);
      if (receiptUrlMatchesAccount(receipt.url, account.accountId)) requiredCheckedUrls.add(canonicalEvidenceUrl(receipt.url));
      evidenceError(blocks, receipt.declaredTotal === account.declaredTotal && receipt.rangeStart === expectedStart && receipt.rangeEnd >= receipt.rangeStart && receipt.rangeEnd <= account.declaredTotal, `pagination receipt is inconsistent for ${account.accountId}`);
      expectedStart = receipt.rangeEnd + 1;
    }
    evidenceError(blocks, expectedStart === account.declaredTotal + 1 && account.kittens.length === account.declaredTotal, `pagination is incomplete for ${account.accountId}`);
    const detailIds = new Set();
    for (const kitten of account.kittens) {
      const valid = isObject(kitten) && BREEDER_ID.test(kitten.breederId) && KNOWN_STATUSES.has(kitten.status);
      evidenceError(blocks, valid, `source kitten evidence is invalid for ${account.accountId}`);
      if (!valid) continue;
      evidenceError(blocks, !sourceById.has(kitten.breederId), `duplicate source breeder ID: ${kitten.breederId}`);
      sourceById.set(kitten.breederId, { ...kitten, accountId: account.accountId });
    }
    for (const detail of account.activeDetails) {
      const valid = isObject(detail) && BREEDER_ID.test(detail.breederId) && detail.accountId === account.accountId;
      evidenceError(blocks, valid, `source detail evidence is invalid for ${account.accountId}`);
      if (!valid) continue;
      evidenceError(blocks, !detailIds.has(detail.breederId), `duplicate source detail ID: ${detail.breederId}`);
      detailIds.add(detail.breederId);
      sourceDetails.set(detail.breederId, detail);
      evidenceError(blocks, sourceDetailUrlMatches(detail.detailUrl, detail.breederId), `source detail URL is invalid for ${detail.breederId}`);
      if (sourceDetailUrlMatches(detail.detailUrl, detail.breederId)) requiredCheckedUrls.add(canonicalEvidenceUrl(detail.detailUrl));
      for (const field of REQUIRED_FACT_FIELDS) evidenceError(blocks, field === 'price' ? Number.isFinite(detail[field]) : nonBlank(detail[field]), `source ${field} evidence is missing for ${detail.breederId}`);
      evidenceError(blocks, Array.isArray(detail.photos) && detail.photos.length > 0 && detail.photos.every(nonBlank), `source photo evidence is missing for ${detail.breederId}`);
      for (const field of OPTIONAL_STRING_FIELDS) evidenceError(blocks, isString(detail[field]), `source ${field} evidence is not a string for ${detail.breederId}`);
    }
    for (const kitten of account.kittens.filter(item => ACTIVE_STATUSES.has(item.status))) {
      evidenceError(blocks, detailIds.has(kitten.breederId), `source active detail is missing for ${kitten.breederId}`);
    }
    for (const detailId of detailIds) evidenceError(blocks, ACTIVE_STATUSES.has(sourceById.get(detailId)?.status), `source detail is not active: ${detailId}`);
  }

  evidenceError(blocks, Array.isArray(input.fuluck.apiRecords), 'Fuluck API records are missing');
  evidenceError(blocks, Array.isArray(input.fuluck.renderedPages), 'Fuluck rendered-page evidence is missing');
  evidenceError(blocks, Array.isArray(input.fuluck.checkedUrls) && input.fuluck.checkedUrls.length > 0, 'Fuluck checked URLs are missing');
  const targetById = new Map();
  if (Array.isArray(input.fuluck.apiRecords)) {
    for (const target of input.fuluck.apiRecords) {
      const valid = isObject(target) && BREEDER_ID.test(target.breederId) && KNOWN_STATUSES.has(target.status);
      evidenceError(blocks, valid, 'Fuluck API record is invalid');
      if (!valid) continue;
      evidenceError(blocks, !targetById.has(target.breederId), `duplicate Fuluck breeder ID: ${target.breederId}`);
      targetById.set(target.breederId, target);
    }
  }
  const pagesByKey = new Map();
  if (Array.isArray(input.fuluck.renderedPages)) {
    for (const page of input.fuluck.renderedPages) {
      const valid = isObject(page) && BREEDER_ID.test(page.breederId) && LOCALES.includes(page.locale);
      evidenceError(blocks, valid, 'Fuluck rendered-page record is invalid');
      if (!valid) continue;
      const key = `${page.breederId}:${page.locale}`;
      evidenceError(blocks, !pagesByKey.has(key), `duplicate Fuluck rendered page: ${key}`);
      pagesByKey.set(key, page);
      if (page.state === 'rendered_page_missing') {
        evidenceError(blocks, renderedPageUrl(page) === exactFuluckPageUrl(page.breederId, page.locale), `missing-page receipt URL is invalid for ${key}`);
        if (renderedPageUrl(page) === exactFuluckPageUrl(page.breederId, page.locale)) requiredCheckedUrls.add(renderedPageUrl(page));
        continue;
      }
      evidenceError(blocks, renderedPageUrl(page) === exactFuluckPageUrl(page.breederId, page.locale), `Fuluck rendered-page URL is invalid for ${key}`);
      if (renderedPageUrl(page) === exactFuluckPageUrl(page.breederId, page.locale)) requiredCheckedUrls.add(renderedPageUrl(page));
      evidenceError(blocks, validReceiptHash(page.sha256), `Fuluck rendered-page hash is missing for ${key}`);
      for (const field of REQUIRED_FACT_FIELDS) evidenceError(blocks, field === 'price' ? Number.isFinite(page[field]) : nonBlank(page[field]), `Fuluck ${field} evidence is missing for ${key}`);
      evidenceError(blocks, Array.isArray(page.photos) && page.photos.length > 0 && page.photos.every(nonBlank), `Fuluck photo evidence is missing for ${key}`);
      for (const field of OPTIONAL_STRING_FIELDS) evidenceError(blocks, isString(page[field]), `Fuluck ${field} evidence is not a string for ${key}`);
    }
  }
  for (const [breederId, source] of sourceById) {
    if (!ACTIVE_STATUSES.has(source.status) || !targetById.has(breederId)) continue;
    for (const locale of LOCALES) evidenceError(blocks, pagesByKey.has(`${breederId}:${locale}`), `Fuluck rendered page evidence is missing for ${breederId}:${locale}`);
  }
  if (Array.isArray(input.fuluck.checkedUrls)) {
    const checkedUrls = input.fuluck.checkedUrls.map(canonicalEvidenceUrl);
    for (const url of checkedUrls) evidenceError(blocks, nonBlank(url), 'Fuluck checked URL is invalid');
    const checkedUrlSet = new Set(checkedUrls.filter(Boolean));
    evidenceError(blocks, checkedUrlSet.size === checkedUrls.length, 'Fuluck checked URLs contain duplicates');
    for (const url of requiredCheckedUrls) evidenceError(blocks, checkedUrlSet.has(url), `required checked URL is missing: ${safeUrl(url)}`);
    for (const url of checkedUrlSet) evidenceError(blocks, requiredCheckedUrls.has(url), `unrelated checked URL: ${safeUrl(url)}`);
  }
  return { blocks, sourceById, sourceDetails, targetById, pagesByKey };
}

export function compareKonekoToFuluck(input) {
  const evidence = validateInput(input);
  if (evidence.blocks.length) return blockedResult(input, evidence.blocks);
  const diffs = [];
  const add = value => diffs.push(value);
  for (const [breederId, source] of evidence.sourceById) {
    const target = evidence.targetById.get(breederId);
    if (ACTIVE_STATUSES.has(source.status) && !target) {
      add({ type: 'source_active_missing', accountId: source.accountId, breederId, field: 'status', source: source.status, target: null });
      continue;
    }
    if (!ACTIVE_STATUSES.has(source.status) && target && ACTIVE_STATUSES.has(target.status)) {
      add({ type: 'source_inactive_target_active', accountId: source.accountId, breederId, field: 'status', source: source.status, target: target.status });
      continue;
    }
    if (!ACTIVE_STATUSES.has(source.status) || !target) continue;
    if (!ACTIVE_STATUSES.has(target.status)) {
      add({ type: 'source_active_target_inactive', accountId: source.accountId, breederId, field: 'status', source: source.status, target: target.status });
      continue;
    }
    if (source.status !== target.status) add({ type: 'status_mismatch', accountId: source.accountId, breederId, field: 'status', source: source.status, target: target.status });
    const sourceDetail = evidence.sourceDetails.get(breederId);
    const ja = evidence.pagesByKey.get(`${breederId}:ja`);
    if (ja.state === 'rendered_page_missing') {
      add({ type: 'rendered_page_missing', accountId: source.accountId, breederId, field: 'ja', locale: 'ja', url: safeUrl(ja.url) });
      continue;
    }
    for (const field of COMPARISON_FACT_FIELDS) if (sourceDetail[field] !== ja[field]) add({ type: 'fact_mismatch', accountId: source.accountId, breederId, field, source: sourceDetail[field], target: ja[field] });
    if (JSON.stringify(sourceDetail.photos) !== JSON.stringify(ja.photos)) add({ type: 'photos_mismatch', accountId: source.accountId, breederId, field: 'photos', source: sourceDetail.photos, target: ja.photos });
    if (sourceDetail.videoId !== ja.videoId) add({ type: 'video_id_mismatch', accountId: source.accountId, breederId, field: 'videoId', source: sourceDetail.videoId, target: ja.videoId });
    for (const field of TEXT_FIELDS) {
      if (sourceDetail[field] === ja[field]) continue;
      add({ type: 'japanese_text_mismatch', accountId: source.accountId, breederId, field, source: safeTextReceipt(sourceDetail[field]), target: safeTextReceipt(ja[field]) });
      if (nonBlank(sourceDetail[field])) {
        for (const locale of ['en', 'zh']) add({ type: 'translation_review_required', accountId: source.accountId, breederId, field, locale, source: 'Japanese source text changed', target: 'review required' });
      }
    }
    for (const locale of ['en', 'zh']) {
      const translated = evidence.pagesByKey.get(`${breederId}:${locale}`);
      if (translated.state === 'rendered_page_missing') {
        add({ type: 'rendered_page_missing', accountId: source.accountId, breederId, field: locale, locale, url: safeUrl(translated.url) });
        continue;
      }
      for (const field of TEXT_FIELDS) if (nonBlank(sourceDetail[field]) && !nonBlank(translated[field])) add({ type: 'translation_missing', accountId: source.accountId, breederId, field, locale, source: 'required', target: 'missing' });
    }
  }
  const accounts = safeAccountReceipts(input.accounts);
  return {
    timestamp: input.timestamp, result: diffs.length ? 'DRIFT' : 'EXACT', exitCode: diffs.length ? 2 : 0,
    accounts,
    fuluck: {
      apiRecordCount: input.fuluck.apiRecords.length, renderedPageCounts: renderedPageCounts(input.fuluck.renderedPages),
      renderedPages: renderedPageReceipts(input.fuluck.renderedPages),
      checkedUrls: [...new Set(input.fuluck.checkedUrls.map(safeUrl))].sort(compareStrings),
    },
    diffs: diffs.sort(diffSort), blocks: [], noWritePerformed: true,
  };
}

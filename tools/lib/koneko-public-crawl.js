import { createHash } from 'node:crypto';

import {
  parseFuluckDetailPage,
  parseKonekoDetailPage,
  parseKonekoListPage,
} from './koneko-public-html.js';

const MAX_BODY_BYTES = 2 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_RETRIES = 2;
const USER_AGENT = 'FuluckKonekoReadOnlyAudit/1.0';
const KONEKO_ORIGIN = 'https://www.koneko-breeder.com';
const FULUCK_API_ORIGIN = 'https://fuluck-api.mouxue56.workers.dev';
const FULUCK_ORIGIN = 'https://fuluckpet.com';
const ALLOWED_HOSTS = new Set([
  'www.koneko-breeder.com',
  'fuluck-api.mouxue56.workers.dev',
  'fuluckpet.com',
]);
const RETRYABLE_STATUSES = new Set([429, 502, 503, 504]);
const CHALLENGE_MARKERS = /challenge-platform|cf-chl-|just a moment|interstitial/i;
const BREEDER_ID = /^\d{4}-\d{5}$/;
const FIXED_ACCOUNTS = new Set(['c995680', 'd696506']);
const FAILURE_STAGES = new Set(['koneko_list', 'koneko_detail', 'fuluck_api', 'fuluck_rendered']);
const FAILURE_REASONS = new Set([
  'challenge',
  'timeout',
  'http_status',
  'content_type',
  'response_too_large',
  'redirect_policy',
  'pagination_contract',
  'identity_contract',
  'parse_contract',
  'public_request_failed',
]);
const GENERIC_BLOCKER = 'Public catalogue evidence could not be completed.';

function exactDiagnosticUrl(stage, value, context) {
  let url;
  try { url = new URL(value); } catch { return ''; }
  if (url.protocol !== 'https:' || url.username || url.password) return '';
  const keys = [...url.searchParams.keys()];
  if (stage === 'koneko_list') {
    const breederIds = url.searchParams.getAll('breeder_id');
    const pageNums = url.searchParams.getAll('pageNum');
    if (url.origin !== KONEKO_ORIGIN || url.pathname !== '/breederDetail.php'
      || breederIds.length !== 1 || breederIds[0] !== context.accountId
      || pageNums.length > 1 || pageNums.some(page => !/^\d+$/.test(page))
      || (url.hash && url.hash !== '#cat_list')
      || keys.some(key => key !== 'breeder_id' && key !== 'pageNum')) return '';
    url.hash = '';
    return url.href;
  }
  if (url.hash) return '';
  if (stage === 'koneko_detail') {
    if (url.origin !== KONEKO_ORIGIN || url.search || url.pathname !== `/cat${context.breederId}.html`) return '';
    return url.href;
  }
  if (stage === 'fuluck_api') {
    return url.origin === FULUCK_API_ORIGIN && url.pathname === '/api/kittens' && !url.search ? url.href : '';
  }
  const prefix = context.locale === 'ja' ? '' : `/${context.locale}`;
  if (url.origin !== FULUCK_ORIGIN || url.search || url.pathname !== `${prefix}/kittens/${context.breederId}.html`) return '';
  return url.href;
}

function validatedDiagnostic(details) {
  if (!details || typeof details !== 'object' || Array.isArray(details)) return null;
  const allowedKeys = new Set(['stage', 'reason', 'accountId', 'breederId', 'locale', 'url']);
  if (Object.keys(details).some(key => !allowedKeys.has(key))) return null;
  const { stage, reason } = details;
  if (!FAILURE_STAGES.has(stage) || !FAILURE_REASONS.has(reason)) return null;
  const required = {
    koneko_list: ['accountId'],
    koneko_detail: ['accountId', 'breederId'],
    fuluck_api: [],
    fuluck_rendered: ['breederId', 'locale'],
  }[stage];
  const forbidden = {
    koneko_list: ['breederId', 'locale'],
    koneko_detail: ['locale'],
    fuluck_api: ['accountId', 'breederId', 'locale'],
    fuluck_rendered: ['accountId'],
  }[stage];
  if (required.some(key => details[key] === undefined) || forbidden.some(key => details[key] !== undefined)) return null;
  if (details.accountId !== undefined && !FIXED_ACCOUNTS.has(details.accountId)) return null;
  if (details.breederId !== undefined && (typeof details.breederId !== 'string' || !BREEDER_ID.test(details.breederId))) return null;
  if (details.locale !== undefined && !['ja', 'en', 'zh'].includes(details.locale)) return null;
  const url = exactDiagnosticUrl(stage, details.url, details);
  return url ? { ...details, url } : null;
}

export class PublicAuditFailure extends Error {
  constructor(details, { cause } = {}) {
    super('Public catalogue audit failed.', cause === undefined ? undefined : { cause });
    this.name = 'PublicAuditFailure';
    const diagnostic = validatedDiagnostic(details);
    Object.defineProperty(this, 'diagnostic', { value: diagnostic });
    if (diagnostic) Object.assign(this, diagnostic);
  }
}

export function formatPublicAuditFailure(error) {
  if (!(error instanceof PublicAuditFailure) || !error.diagnostic) return GENERIC_BLOCKER;
  const value = error.diagnostic;
  const parts = [`stage=${value.stage}`, `reason=${value.reason}`];
  if (value.accountId) parts.push(`account=${value.accountId}`);
  if (value.breederId) parts.push(`breeder=${value.breederId}`);
  if (value.locale) parts.push(`locale=${value.locale}`);
  parts.push(`url=${value.url}`);
  return `Public catalogue audit blocked: ${parts.join('; ')}`;
}

function reasonFromCause(cause, fallback) {
  if (isAbort(cause)) return 'timeout';
  const message = String(cause?.message || '');
  if (/challenge|interstitial/i.test(message)) return 'challenge';
  if (/non-2xx status/i.test(message)) return 'http_status';
  if (/content type/i.test(message)) return 'content_type';
  if (/exceeds 2 MiB/i.test(message)) return 'response_too_large';
  if (/redirect|final URL|public URL (?:is invalid|must use HTTPS|host)|rendered target URL/i.test(message)) return 'redirect_policy';
  if (/pagination|range|declared total|final count|next URL/i.test(message)) return 'pagination_contract';
  if (/duplicate|mismatch|disagree|breeder ID|exactly one breeder link/i.test(message)) return 'identity_contract';
  if (/malformed|missing|invalid|must return an array|unknown status|conflicting status|no Koneko cards|marker/i.test(message)) return 'parse_contract';
  return fallback;
}

function typedFailure(stage, context, cause, fallback) {
  return new PublicAuditFailure({ stage, reason: reasonFromCause(cause, fallback), ...context }, { cause });
}

function contractFailure(stage, context, reason, message) {
  return new PublicAuditFailure({ stage, reason, ...context }, { cause: new Error(message) });
}

function checkedUrl(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('public URL is invalid');
  }
  if (parsed.protocol !== 'https:') throw new Error('public URL must use HTTPS');
  if (!ALLOWED_HOSTS.has(parsed.hostname)) throw new Error('public URL host is not allowed');
  return parsed;
}

function contentTypeAllowed(value, acceptedTypes) {
  const normalized = String(value || '').split(';', 1)[0].trim().toLowerCase();
  return acceptedTypes.includes(normalized);
}

function isAbort(error) {
  return error?.name === 'AbortError' || error?.name === 'TimeoutError' || /\b(?:abort|timeout|timed out)\b/i.test(String(error?.message || ''));
}

async function sleep(delayMs) {
  if (delayMs > 0) await new Promise(resolve => setTimeout(resolve, delayMs));
}

async function readBoundedText(response) {
  const declaredLength = Number(response.headers?.get?.('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) throw new Error('public response body exceeds 2 MiB');

  if (!response.body?.getReader) {
    const text = await response.text();
    if (Buffer.byteLength(text, 'utf8') > MAX_BODY_BYTES) throw new Error('public response body exceeds 2 MiB');
    return text;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const chunks = [];
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new Error('public response body exceeds 2 MiB');
      }
      chunks.push(decoder.decode(value, { stream: true }));
    }
  } finally {
    reader.releaseLock?.();
  }
  chunks.push(decoder.decode());
  return chunks.join('');
}

async function fetchApprovedText(url, {
  fetchImpl = globalThis.fetch,
  acceptedContentTypes = ['text/html'],
  expectedFinalUrl,
  allowExactTarget404 = false,
} = {}) {
  const requested = checkedUrl(url);
  if (typeof fetchImpl !== 'function') throw new Error('fetch implementation is required');
  if (!Array.isArray(acceptedContentTypes) || acceptedContentTypes.length === 0) throw new Error('accepted content types are required');
  const expected = expectedFinalUrl === undefined ? null : checkedUrl(expectedFinalUrl);

  let response;
  let lastError;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      response = await fetchImpl(requested.href, {
        method: 'GET',
        redirect: 'follow',
        credentials: 'omit',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: { 'user-agent': USER_AGENT },
      });
      if (!response || typeof response.status !== 'number') throw new Error('public fetch returned an invalid response');
      if (RETRYABLE_STATUSES.has(response.status) && attempt < MAX_RETRIES) continue;
      break;
    } catch (error) {
      lastError = error;
      if (attempt < MAX_RETRIES) continue;
    }
  }
  if (!response) {
    if (isAbort(lastError)) throw new Error(`public fetch timeout/abort: ${lastError.message}`);
    throw new Error(`public fetch failed: ${lastError?.message || 'unknown error'}`);
  }

  let finalUrl;
  try {
    finalUrl = new URL(response.url || requested.href);
  } catch {
    throw new Error('redirect URL is invalid');
  }
  if (finalUrl.protocol !== 'https:' || !ALLOWED_HOSTS.has(finalUrl.hostname) || finalUrl.hostname !== requested.hostname) {
    throw new Error('redirect host is not allowed');
  }
  if (expected && finalUrl.href !== expected.href) throw new Error('public response final URL does not match the requested target');
  const isAuthoritativeTarget404 = allowExactTarget404 && response.status === 404 && expected && finalUrl.href === expected.href;
  if (!(response.status >= 200 && response.status < 300) && !isAuthoritativeTarget404) {
    throw new Error(`public fetch returned non-2xx status: ${response.status}`);
  }
  const contentType = response.headers?.get?.('content-type') || '';
  if (!contentTypeAllowed(contentType, acceptedContentTypes)) throw new Error(`public response content type is not allowed: ${contentType || '(missing)'}`);
  const text = await readBoundedText(response);
  if (CHALLENGE_MARKERS.test(text)) throw new Error('challenge or interstitial response');
  return {
    url: finalUrl.href,
    text,
    status: response.status,
    contentType,
    sha256: createHash('sha256').update(text).digest('hex'),
  };
}

/** Fetches an approved public page with an anonymous, bounded GET request. */
export async function fetchPublicText(url, {
  fetchImpl = globalThis.fetch,
  acceptedContentTypes = ['text/html'],
} = {}) {
  return fetchApprovedText(url, { fetchImpl, acceptedContentTypes });
}

function breederListUrl(accountId) {
  if (!/^[a-z]\d{6}$/i.test(accountId)) throw new Error('Koneko account ID is invalid');
  return `${KONEKO_ORIGIN}/breederDetail.php?breeder_id=${encodeURIComponent(accountId)}`;
}

function listReceipt(page, fetched) {
  return {
    url: fetched.url,
    status: fetched.status,
    contentType: fetched.contentType,
    sha256: fetched.sha256,
    rangeStart: page.rangeStart,
    rangeEnd: page.rangeEnd,
    declaredTotal: page.declaredTotal,
  };
}

export async function crawlKonekoAccount({ accountId, fetchImpl = globalThis.fetch, delayMs = 500 } = {}) {
  if (!Number.isFinite(delayMs) || delayMs < 0) throw new Error('detail delay must be a non-negative number');
  let nextUrl = breederListUrl(accountId);
  const visitedUrls = new Set();
  const breederIds = new Set();
  const kittens = [];
  const receipts = [];
  let declaredTotal;
  let expectedRangeStart = 1;
  let lastListUrl = nextUrl;

  while (nextUrl) {
    const listContext = { accountId, url: nextUrl };
    if (visitedUrls.has(nextUrl)) throw contractFailure('koneko_list', listContext, 'pagination_contract', 'repeated Koneko next URL');
    visitedUrls.add(nextUrl);
    lastListUrl = nextUrl;
    let fetched;
    try {
      fetched = await fetchPublicText(nextUrl, { fetchImpl });
    } catch (cause) {
      throw typedFailure('koneko_list', listContext, cause, 'public_request_failed');
    }
    let page;
    try {
      page = parseKonekoListPage(fetched.text, { accountId, pageUrl: fetched.url });
    } catch (cause) {
      throw typedFailure('koneko_list', listContext, cause, 'parse_contract');
    }
    if (declaredTotal === undefined) declaredTotal = page.declaredTotal;
    else if (page.declaredTotal !== declaredTotal) throw contractFailure('koneko_list', listContext, 'pagination_contract', 'Koneko declared total changed during pagination');
    if (page.rangeStart !== expectedRangeStart) throw contractFailure('koneko_list', listContext, 'pagination_contract', 'Koneko pagination range is not contiguous');
    if (page.rangeEnd > declaredTotal) throw contractFailure('koneko_list', listContext, 'pagination_contract', 'Koneko pagination range exceeds declared total');
    for (const kitten of page.cards) {
      if (breederIds.has(kitten.breederId)) throw contractFailure('koneko_list', listContext, 'identity_contract', 'duplicate Koneko breeder ID');
      breederIds.add(kitten.breederId);
      kittens.push(kitten);
    }
    receipts.push(listReceipt(page, fetched));
    expectedRangeStart = page.rangeEnd + 1;
    if (page.rangeEnd === declaredTotal) {
      if (page.nextPageUrl) throw contractFailure('koneko_list', listContext, 'pagination_contract', 'Koneko final page unexpectedly has a next URL');
      nextUrl = '';
    } else {
      if (!page.nextPageUrl) throw contractFailure('koneko_list', listContext, 'pagination_contract', 'Koneko pagination ended before declared total');
      nextUrl = page.nextPageUrl;
    }
  }

  if (declaredTotal === undefined || kittens.length !== declaredTotal || expectedRangeStart !== declaredTotal + 1) {
    throw contractFailure('koneko_list', { accountId, url: lastListUrl }, 'pagination_contract', 'Koneko final count does not equal declared total');
  }

  const activeDetails = [];
  for (const kitten of kittens) {
    if (kitten.status !== 'available' && kitten.status !== 'reserved') continue;
    await sleep(delayMs);
    const detailContext = { accountId, breederId: kitten.breederId, url: kitten.detailUrl };
    let fetched;
    try {
      fetched = await fetchPublicText(kitten.detailUrl, { fetchImpl });
    } catch (cause) {
      throw typedFailure('koneko_detail', detailContext, cause, 'public_request_failed');
    }
    try {
      activeDetails.push(parseKonekoDetailPage(fetched.text, {
        expectedAccountId: accountId,
        expectedBreederId: kitten.breederId,
        pageUrl: fetched.url,
      }));
    } catch (cause) {
      throw typedFailure('koneko_detail', detailContext, cause, 'parse_contract');
    }
  }
  return { accountId, declaredTotal, receipts, kittens, activeDetails };
}

function requiredUniqueBreederIds(records) {
  if (!Array.isArray(records)) throw new Error('Fuluck kittens API must return an array');
  const ids = new Set();
  for (const record of records) {
    const breederId = record?.breederId;
    if (typeof breederId !== 'string' || !BREEDER_ID.test(breederId)) throw new Error('Fuluck kittens API record has an invalid breeder ID');
    if (ids.has(breederId)) throw new Error(`Fuluck kittens API has duplicate breeder ID: ${breederId}`);
    ids.add(breederId);
  }
  return ids;
}

function localeUrl(breederId, locale) {
  const prefix = locale === 'ja' ? '' : `/${locale}`;
  return `${FULUCK_ORIGIN}${prefix}/kittens/${encodeURIComponent(breederId)}.html`;
}

async function fetchFuluckRenderedTarget(url, fetchImpl) {
  const target = checkedUrl(url);
  if (target.origin !== FULUCK_ORIGIN) throw new Error('Fuluck rendered target URL is invalid');
  return fetchApprovedText(target.href, {
    fetchImpl,
    expectedFinalUrl: target.href,
    allowExactTarget404: true,
  });
}

export async function readFuluckPublicTarget({ activeIds, fetchImpl = globalThis.fetch } = {}) {
  if (!Array.isArray(activeIds)) throw new Error('source active breeder IDs must be an array');
  const sourceIds = new Set();
  for (const breederId of activeIds) {
    if (typeof breederId !== 'string' || !BREEDER_ID.test(breederId)) throw new Error('source active breeder ID is invalid');
    if (sourceIds.has(breederId)) throw new Error(`duplicate source active breeder ID: ${breederId}`);
    sourceIds.add(breederId);
  }

  const apiUrl = `${FULUCK_API_ORIGIN}/api/kittens`;
  let apiResponse;
  try {
    apiResponse = await fetchPublicText(apiUrl, {
      fetchImpl,
      acceptedContentTypes: ['application/json'],
    });
  } catch (cause) {
    throw typedFailure('fuluck_api', { url: apiUrl }, cause, 'public_request_failed');
  }
  let apiRecords;
  try {
    apiRecords = JSON.parse(apiResponse.text);
  } catch (cause) {
    throw typedFailure('fuluck_api', { url: apiUrl }, cause, 'parse_contract');
  }
  let apiIds;
  try {
    apiIds = requiredUniqueBreederIds(apiRecords);
  } catch (cause) {
    throw typedFailure('fuluck_api', { url: apiUrl }, cause, 'identity_contract');
  }
  const checkedUrls = [apiResponse.url];
  const renderedPages = [];

  for (const breederId of sourceIds) {
    if (!apiIds.has(breederId)) continue;
    for (const locale of ['ja', 'en', 'zh']) {
      const url = localeUrl(breederId, locale);
      const renderContext = { breederId, locale, url };
      let fetched;
      try {
        fetched = await fetchFuluckRenderedTarget(url, fetchImpl);
      } catch (cause) {
        throw typedFailure('fuluck_rendered', renderContext, cause, 'public_request_failed');
      }
      checkedUrls.push(fetched.url);
      if (fetched.status === 404) {
        renderedPages.push({ breederId, locale, state: 'rendered_page_missing', url: fetched.url });
        continue;
      }
      try {
        renderedPages.push(parseFuluckDetailPage(fetched.text, {
          expectedBreederId: breederId,
          locale,
          pageUrl: fetched.url,
        }));
      } catch (cause) {
        throw typedFailure('fuluck_rendered', renderContext, cause, 'parse_contract');
      }
    }
  }
  return { apiRecords, renderedPages, checkedUrls };
}

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

  while (nextUrl) {
    if (visitedUrls.has(nextUrl)) throw new Error('repeated Koneko next URL');
    visitedUrls.add(nextUrl);
    const fetched = await fetchPublicText(nextUrl, { fetchImpl });
    const page = parseKonekoListPage(fetched.text, { accountId, pageUrl: fetched.url });
    if (declaredTotal === undefined) declaredTotal = page.declaredTotal;
    else if (page.declaredTotal !== declaredTotal) throw new Error('Koneko declared total changed during pagination');
    if (page.rangeStart !== expectedRangeStart) throw new Error('Koneko pagination range is not contiguous');
    if (page.rangeEnd > declaredTotal) throw new Error('Koneko pagination range exceeds declared total');
    for (const kitten of page.cards) {
      if (breederIds.has(kitten.breederId)) throw new Error(`duplicate Koneko breeder ID: ${kitten.breederId}`);
      breederIds.add(kitten.breederId);
      kittens.push(kitten);
    }
    receipts.push(listReceipt(page, fetched));
    expectedRangeStart = page.rangeEnd + 1;
    if (page.rangeEnd === declaredTotal) {
      if (page.nextPageUrl) throw new Error('Koneko final page unexpectedly has a next URL');
      nextUrl = '';
    } else {
      if (!page.nextPageUrl) throw new Error('Koneko pagination ended before declared total');
      nextUrl = page.nextPageUrl;
    }
  }

  if (declaredTotal === undefined || kittens.length !== declaredTotal || expectedRangeStart !== declaredTotal + 1) {
    throw new Error('Koneko final count does not equal declared total');
  }

  const activeDetails = [];
  for (const kitten of kittens) {
    if (kitten.status !== 'available' && kitten.status !== 'reserved') continue;
    await sleep(delayMs);
    const fetched = await fetchPublicText(kitten.detailUrl, { fetchImpl });
    activeDetails.push(parseKonekoDetailPage(fetched.text, {
      expectedAccountId: accountId,
      expectedBreederId: kitten.breederId,
      pageUrl: fetched.url,
    }));
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
  const apiResponse = await fetchPublicText(apiUrl, {
    fetchImpl,
    acceptedContentTypes: ['application/json'],
  });
  let apiRecords;
  try {
    apiRecords = JSON.parse(apiResponse.text);
  } catch {
    throw new Error('Fuluck kittens API returned malformed JSON');
  }
  const apiIds = requiredUniqueBreederIds(apiRecords);
  const checkedUrls = [apiResponse.url];
  const renderedPages = [];

  for (const breederId of sourceIds) {
    if (!apiIds.has(breederId)) continue;
    for (const locale of ['ja', 'en', 'zh']) {
      const url = localeUrl(breederId, locale);
      const fetched = await fetchFuluckRenderedTarget(url, fetchImpl);
      checkedUrls.push(fetched.url);
      if (fetched.status === 404) {
        renderedPages.push({ breederId, locale, state: 'rendered_page_missing', url: fetched.url });
        continue;
      }
      renderedPages.push(parseFuluckDetailPage(fetched.text, {
        expectedBreederId: breederId,
        locale,
        pageUrl: fetched.url,
      }));
    }
  }
  return { apiRecords, renderedPages, checkedUrls };
}

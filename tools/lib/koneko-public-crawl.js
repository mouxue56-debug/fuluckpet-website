import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  parseVerifiedFuluckDetailPage,
  parseKonekoDetailPage,
  parseKonekoListPage,
} from './koneko-public-html.js';

const MAX_BODY_BYTES = 2 * 1024 * 1024;
const MAX_CLOUDFLARE_TAIL_SCRIPT_BYTES = 4 * 1024;
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_RETRIES = 2;
const USER_AGENT = 'FuluckKonekoReadOnlyAudit/1.0';
const KONEKO_ORIGIN = 'https://www.koneko-breeder.com';
const FULUCK_API_ORIGIN = 'https://fuluck-api.mouxue56.workers.dev';
const FULUCK_ORIGIN = 'https://fuluckpet.com';
const CONTROLLED_FULUCK_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
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
  'render_contract',
  'parse_contract',
  'public_request_failed',
]);
const GENERIC_BLOCKER = 'Public catalogue evidence could not be completed.';
const FULUCK_RENDERED_PATH = /^\/(?:en\/|zh\/)?kittens\/\d{4}-\d{5}\.html$/;
const FULUCK_LOCALES = new Set(['ja', 'en', 'zh']);
const CLOUDFLARE_TAIL_SIGNATURES = Object.freeze([
  value => /challenge-platform/i.test(value),
  value => value.includes('__CF$cv$params'),
  value => /\bcreateElement\s*\(\s*(['"])iframe\1\s*\)/i.test(value),
]);
const PROVEN_CLOUDFLARE_TAIL = /<script[\t\n\f\r ]*>((?:(?!<\/?script(?=[\t\n\f\r \/>]))[\s\S])*)<\/script[\t\n\f\r ]*>([\t\n\f\r ]*<\/body[\t\n\f\r ]*>[\t\n\f\r ]*<\/html[\t\n\f\r ]*>[\t\n\f\r ]*)(?![\s\S])/i;
const HTML_RCDATA_ELEMENTS = Object.freeze(['title', 'textarea']);
const HTML_RAW_TEXT_ELEMENTS = Object.freeze([
  'script',
  'style',
  'xmp',
  'iframe',
  'noembed',
  'noframes',
  'noscript',
]);
const HTML_TEXT_ELEMENTS = Object.freeze([...HTML_RCDATA_ELEMENTS, ...HTML_RAW_TEXT_ELEMENTS]);
const HTML_TAG_START = /<(\/?)([A-Za-z][^\t\n\f\r \/>]*)(?=[\t\n\f\r \/>]|$)/y;

function hasAnyCloudflareTailSignature(value) {
  return CLOUDFLARE_TAIL_SIGNATURES.some(matches => matches(value));
}

function htmlTagEnd(text, start) {
  let quote = '';
  for (let index = start; index < text.length; index += 1) {
    const character = text[index];
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

function htmlTagAt(text, start) {
  HTML_TAG_START.lastIndex = start;
  const match = HTML_TAG_START.exec(text);
  if (!match) return null;
  const end = htmlTagEnd(text, start + match[0].length);
  if (end === -1) return { incomplete: true };
  return {
    closing: match[1] === '/',
    end,
    name: match[2].toLowerCase(),
  };
}

function htmlTextElementEnd(text, name, start) {
  const closing = new RegExp(`<\\/${name}(?=[\\t\\n\\f\\r \/>])`, 'ig');
  closing.lastIndex = start;
  const match = closing.exec(text);
  if (!match) return -1;
  return htmlTagEnd(text, closing.lastIndex);
}

function candidateStartsInHtmlData(prefix) {
  let cursor = 0;
  let templateDepth = 0;
  while (cursor < prefix.length) {
    const tokenStart = prefix.indexOf('<', cursor);
    if (tokenStart === -1) break;
    if (prefix.startsWith('<!--', tokenStart)) {
      const commentEnd = prefix.indexOf('-->', tokenStart + 4);
      if (commentEnd === -1) return false;
      cursor = commentEnd + 3;
      continue;
    }
    if (prefix.startsWith('<!', tokenStart) || prefix.startsWith('<?', tokenStart)) {
      const declarationEnd = htmlTagEnd(prefix, tokenStart + 2);
      if (declarationEnd === -1) return false;
      cursor = declarationEnd;
      continue;
    }

    const tag = htmlTagAt(prefix, tokenStart);
    if (!tag) {
      cursor = tokenStart + 1;
      continue;
    }
    if (tag.incomplete) return false;
    cursor = tag.end;

    if (tag.closing) {
      if (tag.name === 'template' && templateDepth > 0) templateDepth -= 1;
      continue;
    }
    if (tag.name === 'plaintext') return false;
    if (tag.name === 'template') {
      templateDepth += 1;
      continue;
    }
    if (HTML_TEXT_ELEMENTS.includes(tag.name)) {
      const textElementEnd = htmlTextElementEnd(prefix, tag.name, cursor);
      if (textElementEnd === -1) return false;
      cursor = textElementEnd;
    }
  }
  return templateDepth === 0;
}

function stripProvenFuluckTailInjection(text) {
  if (!hasAnyCloudflareTailSignature(text)) return text;
  const candidate = PROVEN_CLOUDFLARE_TAIL.exec(text);
  if (!candidate) throw new Error('challenge or interstitial response');

  const body = candidate[1];
  const suffix = candidate[2];
  const start = candidate.index;
  const end = start + candidate[0].length - suffix.length;
  const outside = `${text.slice(0, start)}${suffix}`;
  if (Buffer.byteLength(text.slice(start, end), 'utf8') > MAX_CLOUDFLARE_TAIL_SCRIPT_BYTES
    || !CLOUDFLARE_TAIL_SIGNATURES.every(matches => matches(body))
    || hasAnyCloudflareTailSignature(outside)
    || !candidateStartsInHtmlData(text.slice(0, start))) {
    throw new Error('challenge or interstitial response');
  }
  return outside;
}

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
  if (/controlled rendered page|render contract/i.test(message)) return 'render_contract';
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

async function readBoundedText(response, { requireRawBytes = false } = {}) {
  const declaredLength = Number(response.headers?.get?.('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) throw new Error('public response body exceeds 2 MiB');

  if (!response.body?.getReader) {
    if (typeof response.arrayBuffer !== 'function') {
      if (requireRawBytes) throw new Error('public response body is unreadable');
      const text = await response.text();
      if (Buffer.byteLength(text, 'utf8') > MAX_BODY_BYTES) throw new Error('public response body exceeds 2 MiB');
      return { text, bytes: Buffer.from(text, 'utf8') };
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > MAX_BODY_BYTES) throw new Error('public response body exceeds 2 MiB');
    return { text: new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes), bytes };
  }

  const reader = response.body.getReader();
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
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock?.();
  }
  const body = Buffer.concat(chunks, bytes);
  return { text: new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(body), bytes: body };
}

async function fetchApprovedText(url, {
  fetchImpl = globalThis.fetch,
  acceptedContentTypes = ['text/html'],
  expectedFinalUrl,
  allowExactTarget404 = false,
  stripFuluckTail = false,
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
  let { text, bytes } = await readBoundedText(response, { requireRawBytes: stripFuluckTail });
  if (stripFuluckTail && response.status >= 200 && response.status < 300) {
    text = stripProvenFuluckTailInjection(text);
    bytes = Buffer.from(text, 'utf8');
  }
  if (CHALLENGE_MARKERS.test(text)) throw new Error('challenge or interstitial response');
  const receipt = {
    url: finalUrl.href,
    text,
    status: response.status,
    contentType,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
  Object.defineProperty(receipt, 'bodyBytes', { value: bytes });
  return receipt;
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

function unavailableControlledPage() {
  return new Error('controlled rendered page is unavailable');
}

function controlledPageComponents(breederId, locale) {
  if (typeof breederId !== 'string' || !BREEDER_ID.test(breederId) || !FULUCK_LOCALES.has(locale)) return null;
  return locale === 'ja' ? ['kittens', `${breederId}.html`] : [locale, 'kittens', `${breederId}.html`];
}

/**
 * Creates the checked-out generated-page reader. The optional root exists only
 * for deterministic local tests; production calls use the module-relative root.
 */
export function createControlledFuluckPageLoader({ root = CONTROLLED_FULUCK_ROOT } = {}) {
  const checkoutRoot = typeof root === 'string' && root ? resolve(root) : '';
  return async ({ breederId, locale } = {}) => {
    const components = controlledPageComponents(breederId, locale);
    if (!checkoutRoot || !components) throw unavailableControlledPage();
    const pathname = resolve(checkoutRoot, ...components);
    const contained = relative(checkoutRoot, pathname);
    if (!contained || contained === '..' || contained.startsWith(`..${sep}`) || contained.split(sep).includes('..')) {
      throw unavailableControlledPage();
    }

    let handle;
    try {
      let current = checkoutRoot;
      const rootEntry = await lstat(current);
      if (!rootEntry.isDirectory() || rootEntry.isSymbolicLink()) throw unavailableControlledPage();
      for (let index = 0; index < components.length; index += 1) {
        current = join(current, components[index]);
        const entry = await lstat(current);
        if (entry.isSymbolicLink()) throw unavailableControlledPage();
        const final = index === components.length - 1;
        if (final ? !entry.isFile() || entry.size > MAX_BODY_BYTES : !entry.isDirectory()) throw unavailableControlledPage();
      }

      handle = await open(pathname, constants.O_RDONLY | constants.O_NOFOLLOW);
      const before = await handle.stat();
      if (!before.isFile() || before.size > MAX_BODY_BYTES) throw unavailableControlledPage();
      const bytes = Buffer.alloc(Math.min(before.size + 1, MAX_BODY_BYTES + 1));
      const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
      const after = await handle.stat();
      if (bytesRead !== before.size || after.size !== before.size || after.mtimeMs !== before.mtimeMs) throw unavailableControlledPage();
      return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes.subarray(0, bytesRead));
    } catch {
      throw unavailableControlledPage();
    } finally {
      if (handle) {
        try { await handle.close(); } catch {}
      }
    }
  };
}

const loadControlledFuluckPage = createControlledFuluckPageLoader();

export async function fetchFuluckRenderedTarget(url, fetchImpl) {
  const target = checkedUrl(url);
  if (target.origin !== FULUCK_ORIGIN || target.username || target.password || target.search || target.hash
    || !FULUCK_RENDERED_PATH.test(target.pathname)) throw new Error('Fuluck rendered target URL is invalid');
  return fetchApprovedText(target.href, {
    fetchImpl,
    expectedFinalUrl: target.href,
    allowExactTarget404: true,
    stripFuluckTail: true,
  });
}

export async function readFuluckPublicTarget({
  activeIds,
  fetchImpl = globalThis.fetch,
  controlledPageLoader = loadControlledFuluckPage,
} = {}) {
  if (!Array.isArray(activeIds)) throw new Error('source active breeder IDs must be an array');
  if (typeof controlledPageLoader !== 'function') throw new Error('controlled rendered page loader is invalid');
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
      let controlledHtml;
      try {
        controlledHtml = await controlledPageLoader({ breederId, locale });
      } catch {
        throw contractFailure('fuluck_rendered', renderContext, 'render_contract', 'controlled rendered page is unavailable');
      }
      if (typeof controlledHtml !== 'string') {
        throw contractFailure('fuluck_rendered', renderContext, 'render_contract', 'controlled rendered page is unavailable');
      }
      const remoteBytes = fetched.bodyBytes;
      const controlledBytes = Buffer.from(controlledHtml, 'utf8');
      if (!remoteBytes.equals(controlledBytes)) {
        throw contractFailure('fuluck_rendered', renderContext, 'render_contract', 'controlled rendered page does not match remote output');
      }
      const sha256 = createHash('sha256').update(controlledBytes).digest('hex');
      try {
        renderedPages.push({ ...parseVerifiedFuluckDetailPage(controlledHtml, {
          expectedBreederId: breederId,
          locale,
          pageUrl: fetched.url,
        }), sha256 });
      } catch (cause) {
        throw typedFailure('fuluck_rendered', renderContext, cause, 'parse_contract');
      }
    }
  }
  return { apiRecords, renderedPages, checkedUrls };
}

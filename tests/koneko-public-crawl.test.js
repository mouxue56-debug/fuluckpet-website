import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import {
  crawlKonekoAccount,
  fetchPublicText,
  readFuluckPublicTarget,
} from '../tools/lib/koneko-public-crawl.js';
import * as publicCrawl from '../tools/lib/koneko-public-crawl.js';

const KONEKO_ORIGIN = 'https://www.koneko-breeder.com';
const API_ORIGIN = 'https://fuluck-api.mouxue56.workers.dev';
const FULUCK_ORIGIN = 'https://fuluckpet.com';

function response({
  body = '<html><body>ok</body></html>',
  contentType = 'text/html; charset=utf-8',
  status = 200,
  url = `${KONEKO_ORIGIN}/ok`,
} = {}) {
  return new Response(body, { status, headers: { 'content-type': contentType } , url });
}

function publicResponse(options) {
  const result = response(options);
  Object.defineProperty(result, 'url', { value: options?.url ?? `${KONEKO_ORIGIN}/ok` });
  return result;
}

test('fetchPublicText returns a receipt for an allowed HTTPS HTML GET', async () => {
  const calls = [];
  const result = await fetchPublicText(`${KONEKO_ORIGIN}/breederDetail.php?breeder_id=c995680`, {
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return publicResponse({ body: '<html><body>catalogue</body></html>', url });
    },
  });

  assert.deepEqual(result, {
    url: `${KONEKO_ORIGIN}/breederDetail.php?breeder_id=c995680`,
    text: '<html><body>catalogue</body></html>',
    status: 200,
    contentType: 'text/html; charset=utf-8',
    sha256: createHash('sha256').update('<html><body>catalogue</body></html>').digest('hex'),
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.method, 'GET');
  assert.equal(calls[0].options.redirect, 'follow');
  assert.equal(calls[0].options.headers['user-agent'], 'FuluckKonekoReadOnlyAudit/1.0');
  assert.equal(calls[0].options.headers.authorization, undefined);
  assert.equal(calls[0].options.body, undefined);
  assert.equal(calls[0].options.credentials, 'omit');
});

test('fetchPublicText rejects a redirect to an unapproved host', async () => {
  await assert.rejects(
    fetchPublicText(`${KONEKO_ORIGIN}/breederDetail.php?breeder_id=c995680`, {
      fetchImpl: async () => publicResponse({ url: 'https://evil.example/redirected' }),
    }),
    /redirect host/i,
  );
});

test('fetchPublicText rejects disallowed schemes, hosts, content types, oversized bodies, challenges, aborts, and non-2xx responses', async () => {
  const url = `${KONEKO_ORIGIN}/breederDetail.php?breeder_id=c995680`;
  await assert.rejects(fetchPublicText('http://www.koneko-breeder.com/list', { fetchImpl: async () => publicResponse() }), /HTTPS/i);
  await assert.rejects(fetchPublicText('https://evil.example/list', { fetchImpl: async () => publicResponse() }), /host/i);
  await assert.rejects(fetchPublicText(url, { fetchImpl: async () => publicResponse({ contentType: 'application/json' }) }), /content type/i);
  await assert.rejects(fetchPublicText(url, { fetchImpl: async () => publicResponse({ body: 'x'.repeat((2 * 1024 * 1024) + 1) }) }), /2 MiB|body/i);
  await assert.rejects(fetchPublicText(url, { fetchImpl: async () => publicResponse({ body: '<title>Just a moment...</title>' }) }), /challenge|interstitial/i);
  await assert.rejects(fetchPublicText(url, { fetchImpl: async () => { throw new DOMException('timed out', 'TimeoutError'); } }), /timeout|abort/i);
  await assert.rejects(fetchPublicText(url, { fetchImpl: async () => publicResponse({ status: 404 }) }), /non-2xx|404/i);
});

test('fetchPublicText cannot be configured to accept non-2xx statuses', async () => {
  const url = `${KONEKO_ORIGIN}/breederDetail.php?breeder_id=c995680`;
  await assert.rejects(
    fetchPublicText(url, { fetchImpl: async () => publicResponse({ status: 404, url }), allowedStatuses: [404] }),
    /non-2xx|404/i,
  );
  await assert.rejects(
    fetchPublicText(url, { fetchImpl: async () => publicResponse({ status: 500, url }), allowedStatuses: [500] }),
    /non-2xx|500/i,
  );
  await assert.rejects(
    fetchPublicText(url, {
      fetchImpl: async () => publicResponse({ status: 404, url }),
      expectedFinalUrl: url,
      allowExactTarget404: true,
    }),
    /non-2xx|404/i,
  );
});

function listCard(id, status = '') {
  const statusMarkup = status
    ? `<div class="listLmtInfStt"><span class="business">${status}</span></div>`
    : '<div class="listLmtInfStt"><span class="new">NEW</span></div>';
  return `<li class="Min_d-flex box02Inner"><div class="listLmtInf">${statusMarkup}</div><a href="cat${id}.html"><img id="src_${id}"></a></li>`;
}

function listPage(cards, { total, start, end, next = '', links } = {}) {
  const paginationLinks = links ?? (next ? `<a href="${next}">次へ</a>` : '');
  return `<html><body><div class="pagenation"><div>全<span class="totalNum">${total}</span>件中 ${start}～${end}件を表示</div>${paginationLinks}</div><ul>${cards.join('')}</ul></body></html>`;
}

function konekoDetail(id, accountId = 'c995680') {
  return `<html><head><link rel="canonical" href="${KONEKO_ORIGIN}/cat${id}.html"><script type="application/ld+json">${JSON.stringify({ '@type': 'Product', sku: id, image: [`${KONEKO_ORIGIN}/breeder/data/${accountId}/child.jpg`], offers: { price: '230000' } })}</script></head><body><table><tr><th>品種</th><td>サイベリアン</td></tr></table><div class="petDtlInt"><div class="gnrCnt">紹介</div></div></body></html>`;
}

function crawlerFetch(pages) {
  return async url => {
    const entry = pages.get(url);
    if (!entry) throw new Error(`unexpected URL: ${url}`);
    return publicResponse({ body: entry, url });
  };
}

function assertSafeFailure(error, expected) {
  assert.equal(error.name, 'PublicAuditFailure');
  for (const [key, value] of Object.entries(expected)) assert.equal(error[key], value, key);
  assert.ok(error.cause instanceof Error);
  return true;
}

test('crawlKonekoAccount traverses contiguous stable pages and fetches only active or reserved details', async () => {
  const first = `${KONEKO_ORIGIN}/breederDetail.php?breeder_id=c995680`;
  const second = `${KONEKO_ORIGIN}/breederDetail.php?pageNum=2&breeder_id=c995680`;
  const pages = new Map([
    [first, listPage([listCard('2608-00001'), listCard('2608-00002', '商談中')], { total: 3, start: 1, end: 2, next: 'breederDetail.php?pageNum=2&breeder_id=c995680' })],
    [second, listPage([listCard('2608-00003', '販売終了')], { total: 3, start: 3, end: 3 })],
    [`${KONEKO_ORIGIN}/cat2608-00001.html`, konekoDetail('2608-00001')],
    [`${KONEKO_ORIGIN}/cat2608-00002.html`, konekoDetail('2608-00002')],
  ]);

  const result = await crawlKonekoAccount({ accountId: 'c995680', fetchImpl: crawlerFetch(pages), delayMs: 0 });

  assert.deepEqual(result.receipts.map(receipt => [receipt.rangeStart, receipt.rangeEnd]), [[1, 2], [3, 3]]);
  assert.equal(result.declaredTotal, 3);
  assert.deepEqual(result.kittens.map(kitten => kitten.breederId), ['2608-00001', '2608-00002', '2608-00003']);
  assert.deepEqual(result.activeDetails.map(kitten => kitten.breederId), ['2608-00001', '2608-00002']);
});

test('crawlKonekoAccount fails closed for repeated links, gaps, changing totals, duplicate IDs, wrong accounts, and mismatched details', async () => {
  const first = `${KONEKO_ORIGIN}/breederDetail.php?breeder_id=c995680`;
  const second = `${KONEKO_ORIGIN}/breederDetail.php?pageNum=2&breeder_id=c995680`;
  const run = pages => crawlKonekoAccount({ accountId: 'c995680', fetchImpl: crawlerFetch(new Map(pages)), delayMs: 0 });
  await assert.rejects(run([
    [first, listPage([listCard('2608-00001')], { total: 3, start: 1, end: 1, next: 'breederDetail.php?pageNum=2&breeder_id=c995680' })],
    [second, listPage([listCard('2608-00002')], { total: 3, start: 2, end: 2, next: 'breederDetail.php?pageNum=2&breeder_id=c995680' })],
  ]), error => assertSafeFailure(error, { stage: 'koneko_list', reason: 'pagination_contract' }));
  await assert.rejects(run([[first, listPage([listCard('2608-00001')], { total: 2, start: 2, end: 2 })]]), error => assertSafeFailure(error, { stage: 'koneko_list', reason: 'pagination_contract' }));
  await assert.rejects(run([[first, listPage([listCard('2608-00001')], { total: 2, start: 1, end: 1, next: 'breederDetail.php?pageNum=2&breeder_id=c995680' })], [second, listPage([listCard('2608-00002')], { total: 3, start: 2, end: 2 })]]), error => assertSafeFailure(error, { stage: 'koneko_list', reason: 'pagination_contract' }));
  await assert.rejects(run([[first, listPage([listCard('2608-00001')], { total: 2, start: 1, end: 1, next: 'breederDetail.php?pageNum=2&breeder_id=c995680' })], [second, listPage([listCard('2608-00001')], { total: 2, start: 2, end: 2 })]]), error => assertSafeFailure(error, { stage: 'koneko_list', reason: 'identity_contract' }));
  await assert.rejects(run([[first, listPage([listCard('2608-00001')], {
    total: 2,
    start: 1,
    end: 1,
    links: '<a href="breederDetail.php?pageNum=2&amp;breeder_id=c995680">2</a>',
  })]]), error => assertSafeFailure(error, { stage: 'koneko_list', reason: 'pagination_contract' }));
  await assert.rejects(run([[first, listPage([listCard('2608-00001')], { total: 1, start: 1, end: 1 })], [`${KONEKO_ORIGIN}/cat2608-00001.html`, konekoDetail('2608-00001', 'd696506')]]), error => assertSafeFailure(error, { stage: 'koneko_detail', reason: 'identity_contract' }));
  await assert.rejects(run([[first, listPage([listCard('2608-00001')], { total: 1, start: 1, end: 1 })], [`${KONEKO_ORIGIN}/cat2608-00001.html`, konekoDetail('2608-00002')]]), error => assertSafeFailure(error, { stage: 'koneko_detail', reason: 'identity_contract' }));
});

test('crawlKonekoAccount types list parser and pagination failures with fixed safe context', async () => {
  const first = `${KONEKO_ORIGIN}/breederDetail.php?breeder_id=c995680`;
  await assert.rejects(
    crawlKonekoAccount({
      accountId: 'c995680',
      fetchImpl: crawlerFetch(new Map([[first, listPage([listCard('2608-00001', '未知')], { total: 1, start: 1, end: 1 })]])),
      delayMs: 0,
    }),
    error => assertSafeFailure(error, {
      stage: 'koneko_list',
      reason: 'parse_contract',
      accountId: 'c995680',
      url: first,
    }),
  );
  await assert.rejects(
    crawlKonekoAccount({
      accountId: 'c995680',
      fetchImpl: crawlerFetch(new Map([[first, listPage([listCard('2608-00001')], { total: 2, start: 1, end: 1 })]])),
      delayMs: 0,
    }),
    error => assertSafeFailure(error, {
      stage: 'koneko_list',
      reason: 'pagination_contract',
      accountId: 'c995680',
      url: first,
    }),
  );
});

test('crawlKonekoAccount types Koneko detail identity failures with breeder context', async () => {
  const listUrl = `${KONEKO_ORIGIN}/breederDetail.php?breeder_id=c995680`;
  const detailUrl = `${KONEKO_ORIGIN}/cat2608-00001.html`;
  await assert.rejects(
    crawlKonekoAccount({
      accountId: 'c995680',
      fetchImpl: crawlerFetch(new Map([
        [listUrl, listPage([listCard('2608-00001')], { total: 1, start: 1, end: 1 })],
        [detailUrl, konekoDetail('2608-00002')],
      ])),
      delayMs: 0,
    }),
    error => assertSafeFailure(error, {
      stage: 'koneko_detail',
      reason: 'identity_contract',
      accountId: 'c995680',
      breederId: '2608-00001',
      url: detailUrl,
    }),
  );
});

function fuluckDetail(id, locale) {
  return `<html><head><link rel="canonical" href="${FULUCK_ORIGIN}/kittens/${id}.html"><script type="application/ld+json">${JSON.stringify({ '@type': 'Product', sku: id, image: [`${KONEKO_ORIGIN}/breeder/data/c995680/child.jpg`], offers: { price: '230000' } })}</script></head><body><table><tr><th>品種</th><td>${locale}</td></tr></table><section class="kitten-detail-introduction"><p>ok</p></section></body></html>`;
}

test('readFuluckPublicTarget reads the public API and exactly three locale pages for every source-active target ID', async () => {
  const api = `${API_ORIGIN}/api/kittens`;
  const ja = `${FULUCK_ORIGIN}/kittens/2608-00001.html`;
  const en = `${FULUCK_ORIGIN}/en/kittens/2608-00001.html`;
  const zh = `${FULUCK_ORIGIN}/zh/kittens/2608-00001.html`;
  const seen = [];
  const fetchImpl = async url => {
    seen.push(url);
    const bodies = new Map([[api, JSON.stringify([{ breederId: '2608-00001' }, { breederId: '2608-00002' }])], [ja, fuluckDetail('2608-00001', 'ja')], [en, fuluckDetail('2608-00001', 'en')], [zh, fuluckDetail('2608-00001', 'zh')]]);
    if (!bodies.has(url)) throw new Error(`unexpected URL: ${url}`);
    return publicResponse({ body: bodies.get(url), contentType: url === api ? 'application/json' : 'text/html', url });
  };

  const result = await readFuluckPublicTarget({ activeIds: ['2608-00001'], fetchImpl });

  assert.deepEqual(result.apiRecords, [{ breederId: '2608-00001' }, { breederId: '2608-00002' }]);
  assert.deepEqual(result.renderedPages.map(page => page.locale), ['ja', 'en', 'zh']);
  assert.deepEqual(result.checkedUrls, [api, ja, en, zh]);
  assert.deepEqual(seen, [api, ja, en, zh]);
});

test('readFuluckPublicTarget records authoritative target 404s but blocks on malformed API, timeouts, challenges, and identity conflicts', async () => {
  const api = `${API_ORIGIN}/api/kittens`;
  const ja = `${FULUCK_ORIGIN}/kittens/2608-00001.html`;
  const en = `${FULUCK_ORIGIN}/en/kittens/2608-00001.html`;
  const zh = `${FULUCK_ORIGIN}/zh/kittens/2608-00001.html`;
  const missing = await readFuluckPublicTarget({ activeIds: ['2608-00001'], fetchImpl: async url => {
    if (url === api) return publicResponse({ body: JSON.stringify([{ breederId: '2608-00001' }]), contentType: 'application/json', url });
    return publicResponse({ status: 404, url });
  } });
  assert.deepEqual(missing.renderedPages, [
    { breederId: '2608-00001', locale: 'ja', state: 'rendered_page_missing', url: ja },
    { breederId: '2608-00001', locale: 'en', state: 'rendered_page_missing', url: en },
    { breederId: '2608-00001', locale: 'zh', state: 'rendered_page_missing', url: zh },
  ]);

  await assert.rejects(readFuluckPublicTarget({ activeIds: ['2608-00001'], fetchImpl: async url => publicResponse({ body: url === api ? '{}' : fuluckDetail('2608-00001', 'ja'), contentType: url === api ? 'application/json' : 'text/html', url }) }), error => assertSafeFailure(error, { stage: 'fuluck_api', reason: 'parse_contract' }));
  await assert.rejects(readFuluckPublicTarget({ activeIds: ['2608-00001'], fetchImpl: async () => { throw new DOMException('timed out', 'TimeoutError'); } }), error => assertSafeFailure(error, { stage: 'fuluck_api', reason: 'timeout' }));
  await assert.rejects(readFuluckPublicTarget({ activeIds: ['2608-00001'], fetchImpl: async url => publicResponse({ body: url === api ? JSON.stringify([{ breederId: '2608-00001' }]) : '<title>Just a moment...</title>', contentType: url === api ? 'application/json' : 'text/html', url }) }), error => assertSafeFailure(error, { stage: 'fuluck_rendered', reason: 'challenge' }));
  await assert.rejects(readFuluckPublicTarget({ activeIds: ['2608-00001'], fetchImpl: async url => publicResponse({ body: url === api ? JSON.stringify([{ breederId: '2608-00001' }]) : fuluckDetail('2608-00002', 'ja'), contentType: url === api ? 'application/json' : 'text/html', url }) }), error => assertSafeFailure(error, { stage: 'fuluck_rendered', reason: 'identity_contract' }));
});

test('readFuluckPublicTarget blocks same-host redirected 404s instead of treating them as target-page absence', async () => {
  const api = `${API_ORIGIN}/api/kittens`;
  for (const redirectedUrl of [
    `${FULUCK_ORIGIN}/not-found.html`,
    `${FULUCK_ORIGIN}/kittens/2608-00002.html`,
  ]) {
    await assert.rejects(
      readFuluckPublicTarget({
        activeIds: ['2608-00001'],
        fetchImpl: async url => publicResponse({
          body: url === api ? JSON.stringify([{ breederId: '2608-00001' }]) : '<html><body>not found</body></html>',
          contentType: url === api ? 'application/json' : 'text/html',
          status: url === api ? 200 : 404,
          url: url === api ? url : redirectedUrl,
        }),
      }),
      error => assertSafeFailure(error, { stage: 'fuluck_rendered', reason: 'redirect_policy' }),
    );
  }
});

test('readFuluckPublicTarget types Fuluck API parse failures with only the fixed API URL', async () => {
  const api = `${API_ORIGIN}/api/kittens`;
  await assert.rejects(
    readFuluckPublicTarget({
      activeIds: [],
      fetchImpl: async url => publicResponse({ body: '{', contentType: 'application/json', url }),
    }),
    error => assertSafeFailure(error, {
      stage: 'fuluck_api',
      reason: 'parse_contract',
      url: api,
    }),
  );
});

test('readFuluckPublicTarget types one locale render challenge with breeder and locale context', async () => {
  const api = `${API_ORIGIN}/api/kittens`;
  const ja = `${FULUCK_ORIGIN}/kittens/2608-00001.html`;
  await assert.rejects(
    readFuluckPublicTarget({
      activeIds: ['2608-00001'],
      fetchImpl: async url => url === api
        ? publicResponse({ body: JSON.stringify([{ breederId: '2608-00001' }]), contentType: 'application/json', url })
        : publicResponse({ body: '<title>Just a moment...</title>', url }),
    }),
    error => assertSafeFailure(error, {
      stage: 'fuluck_rendered',
      reason: 'challenge',
      breederId: '2608-00001',
      locale: 'ja',
      url: ja,
    }),
  );
});

test('closed failure formatter emits only validated allowlisted context and never its cause', () => {
  assert.equal(typeof publicCrawl.PublicAuditFailure, 'function');
  assert.equal(typeof publicCrawl.formatPublicAuditFailure, 'function');
  const cause = new Error('Authorization: Bearer stolen\npassword=hunter2 owner@example.com https://evil.example/?token=secret');
  const safe = new publicCrawl.PublicAuditFailure({
    stage: 'koneko_detail',
    reason: 'identity_contract',
    accountId: 'c995680',
    breederId: '2608-00001',
    url: `${KONEKO_ORIGIN}/cat2608-00001.html`,
  }, { cause });

  assert.equal(safe.cause, cause);
  assert.equal(
    publicCrawl.formatPublicAuditFailure(safe),
    `Public catalogue audit blocked: stage=koneko_detail; reason=identity_contract; account=c995680; breeder=2608-00001; url=${KONEKO_ORIGIN}/cat2608-00001.html`,
  );

  for (const unsafe of [
    new Error(cause.message),
    new publicCrawl.PublicAuditFailure({
      stage: 'koneko_detail', reason: 'parse_contract', accountId: 'owner@example.com',
      breederId: '2608-00001', url: 'https://evil.example/cat2608-00001.html',
    }, { cause }),
    new publicCrawl.PublicAuditFailure({
      stage: 'unknown\nstage', reason: 'password=hunter2', url: `${KONEKO_ORIGIN}/cat2608-00001.html`,
    }, { cause }),
  ]) {
    assert.equal(publicCrawl.formatPublicAuditFailure(unsafe), 'Public catalogue evidence could not be completed.');
  }
});

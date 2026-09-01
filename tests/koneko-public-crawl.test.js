import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  crawlKonekoAccount,
  fetchPublicText,
  readFuluckPublicTarget,
} from '../tools/lib/koneko-public-crawl.js';
import * as publicCrawl from '../tools/lib/koneko-public-crawl.js';

const KONEKO_ORIGIN = 'https://www.koneko-breeder.com';
const API_ORIGIN = 'https://fuluck-api.mouxue56.workers.dev';
const FULUCK_ORIGIN = 'https://fuluckpet.com';
const PROJECT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

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

function konekoDetail(id, accountId = 'c995680', availability = 'https://schema.org/InStock') {
  return `<html><head><link rel="canonical" href="${KONEKO_ORIGIN}/cat${id}.html"><script type="application/ld+json">${JSON.stringify({ '@type': 'Product', sku: id, image: [`${KONEKO_ORIGIN}/breeder/data/${accountId}/child.jpg`], offers: { price: '230000', availability } })}</script></head><body>
    <div class="petDtlData"><table class="gnrTbl"><tr><th>猫種</th><td>サイベリアン</td></tr><tr><th>毛色(毛質)</th><td>シルバー</td></tr><tr><th>性別</th><td>♂</td></tr><tr><th>誕生日</th><td>2026/5/9</td></tr><tr><th>アピール<br>ポイント</th><td>紹介</td></tr></table></div>
    <div id="parentInfo"><ul class="parentInfo_list"><li><h3 class="parentInfo_head father">Father</h3><ul><li class="parentName"><strong>父猫</strong></li></ul></li><li><h3 class="parentInfo_head mother">Mother</h3><ul><li class="parentName"><strong>母猫</strong></li></ul></li></ul></div>
    <div class="movieGalleryCnt youtube"><iframe src="https://www.youtube.com/embed/AbCdEfGhI12"></iframe></div>
    <div class="petDtlInt"><div class="gnrCnt">紹介</div></div>
  </body></html>`;
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
    [`${KONEKO_ORIGIN}/cat2608-00002.html`, konekoDetail('2608-00002', 'c995680', 'https://schema.org/SoldOut')],
  ]);

  const result = await crawlKonekoAccount({ accountId: 'c995680', fetchImpl: crawlerFetch(pages), delayMs: 0 });

  assert.deepEqual(result.receipts.map(receipt => [receipt.rangeStart, receipt.rangeEnd]), [[1, 2], [3, 3]]);
  assert.equal(result.declaredTotal, 3);
  assert.deepEqual(result.kittens.map(kitten => kitten.breederId), ['2608-00001', '2608-00002', '2608-00003']);
  assert.deepEqual(result.activeDetails.map(kitten => kitten.breederId), ['2608-00001', '2608-00002']);
  assert.deepEqual(result.activeDetails.map(kitten => kitten.observedAvailability), ['in_stock', 'sold_out']);
});

test('crawlKonekoAccount blocks when Product availability changes after active list pagination', async () => {
  const listUrl = `${KONEKO_ORIGIN}/breederDetail.php?breeder_id=c995680`;
  const cases = [
    ['販売中', 'https://schema.org/SoldOut'],
    ['商談中', 'https://schema.org/InStock'],
  ];
  for (const [listStatus, availability] of cases) {
    const detailUrl = `${KONEKO_ORIGIN}/cat2608-00001.html`;
    await assert.rejects(
      crawlKonekoAccount({
        accountId: 'c995680',
        fetchImpl: crawlerFetch(new Map([
          [listUrl, listPage([listCard('2608-00001', listStatus)], { total: 1, start: 1, end: 1 })],
          [detailUrl, konekoDetail('2608-00001', 'c995680', availability)],
        ])),
        delayMs: 0,
      }),
      error => assertSafeFailure(error, {
        stage: 'koneko_detail',
        reason: 'status_contract',
        accountId: 'c995680',
        breederId: '2608-00001',
        url: detailUrl,
      }),
    );
  }
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

test('crawlKonekoAccount formats a page-2 #cat_list transport failure with a canonical safe URL', async () => {
  const first = `${KONEKO_ORIGIN}/breederDetail.php?breeder_id=c995680`;
  const canonicalSecond = `${KONEKO_ORIGIN}/breederDetail.php?pageNum=2&breeder_id=c995680`;
  let failure;

  try {
    await crawlKonekoAccount({
      accountId: 'c995680',
      fetchImpl: crawlerFetch(new Map([
        [first, listPage([listCard('2608-00001')], {
          total: 2,
          start: 1,
          end: 1,
          next: 'breederDetail.php?pageNum=2&breeder_id=c995680#cat_list',
        })],
      ])),
      delayMs: 0,
    });
    assert.fail('expected the page-2 transport to fail');
  } catch (error) {
    failure = error;
  }

  assertSafeFailure(failure, {
    stage: 'koneko_list',
    reason: 'public_request_failed',
    accountId: 'c995680',
    url: canonicalSecond,
  });
  assert.equal(
    publicCrawl.formatPublicAuditFailure(failure),
    `Public catalogue audit blocked: stage=koneko_list; reason=public_request_failed; account=c995680; url=${canonicalSecond}`,
  );
  assert.equal(publicCrawl.formatPublicAuditFailure(failure).includes('#'), false);
  assert.notEqual(publicCrawl.formatPublicAuditFailure(failure), 'Public catalogue evidence could not be completed.');
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
  const prefix = locale === 'ja' ? '' : `/${locale}`;
  const pageUrl = `${FULUCK_ORIGIN}${prefix}/kittens/${id}.html`;
  return `<html><head><link rel="canonical" href="${pageUrl}"><script type="application/ld+json">${JSON.stringify({ '@type': 'Product', '@id': `${FULUCK_ORIGIN}/kittens/${id}.html#product`, image: [`${KONEKO_ORIGIN}/breeder/data/c995680/child.jpg`], offers: { '@type': 'Offer', price: '230000', url: pageUrl } })}</script></head><body><table><tr><th>品種</th><td>${locale}</td></tr></table><section class="kitten-detail-introduction"><p>ok</p></section><iframe src="https://www.youtube.com/embed/AbCdEfGhI12"></iframe></body></html>`;
}

function localeFromFuluckUrl(url) {
  return url.includes('/en/') ? 'en' : url.includes('/zh/') ? 'zh' : 'ja';
}

function fixtureControlledPageLoader(overrides = {}) {
  return async ({ breederId, locale }) => overrides[`${breederId}:${locale}`] ?? fuluckDetail(breederId, locale);
}

function expectedControlledPath(root, breederId, locale) {
  return join(root, ...(locale === 'ja' ? ['kittens'] : [locale, 'kittens']), `${breederId}.html`);
}

async function temporaryControlledRoot(t) {
  const root = await mkdtemp(join(tmpdir(), 'fuluck-koneko-controlled-'));
  t.after(async () => rm(root, { recursive: true, force: true }));
  return root;
}

async function writeControlledPage(root, breederId, locale, text) {
  const pathname = expectedControlledPath(root, breederId, locale);
  await mkdir(dirname(pathname), { recursive: true });
  await writeFile(pathname, text, 'utf8');
  return pathname;
}

const CLOUDFLARE_TAIL_PARTS = Object.freeze({
  challenge: "var path='/cdn-cgi/challenge-platform/scripts/jsd/main.js';",
  params: "window.__CF$cv$params={r:'fixture'};",
  iframe: "document.createElement('iframe');",
});

function cloudflareTailScript({ omit = '', attributes = '', padding = 0 } = {}) {
  const body = Object.entries(CLOUDFLARE_TAIL_PARTS)
    .filter(([name]) => name !== omit)
    .map(([, value]) => value)
    .join('');
  return `<script${attributes}>${body}${'x'.repeat(padding)}</script>`;
}

function appendBeforeDocumentClose(html, ...scripts) {
  return html.replace('</body></html>', `${scripts.join('')}</body></html>`);
}

async function expectFuluckRenderedBlocked(body) {
  const api = `${API_ORIGIN}/api/kittens`;
  await assert.rejects(
    readFuluckPublicTarget({
      activeIds: ['2608-00001'],
      fetchImpl: async url => url === api
        ? publicResponse({ body: JSON.stringify([{ breederId: '2608-00001' }]), contentType: 'application/json', url })
        : publicResponse({ body, url }),
    }),
    error => assertSafeFailure(error, { stage: 'fuluck_rendered' }),
  );
}

test('readFuluckPublicTarget blocks a 200 page when its cleaned bytes differ from the injected controlled page', async () => {
  const api = `${API_ORIGIN}/api/kittens`;

  await assert.rejects(
    readFuluckPublicTarget({
      activeIds: ['2608-00001'],
      fetchImpl: async url => url === api
        ? publicResponse({ body: JSON.stringify([{ breederId: '2608-00001' }]), contentType: 'application/json', url })
        : publicResponse({
          body: fuluckDetail('2608-00001', url.includes('/en/') ? 'en' : url.includes('/zh/') ? 'zh' : 'ja'),
          url,
        }),
      controlledPageLoader: async ({ locale }) => {
        const remote = fuluckDetail('2608-00001', locale);
        return locale === 'ja' ? remote.replace('<td>ja</td>', '<td>controlled-ja</td>') : remote;
      },
    }),
    error => assertSafeFailure(error, {
      stage: 'fuluck_rendered',
      reason: 'render_contract',
      breederId: '2608-00001',
      locale: 'ja',
      url: `${FULUCK_ORIGIN}/kittens/2608-00001.html`,
    }),
  );
});

test('readFuluckPublicTarget uses one injected controlled string for cleaned equality, parsing, and its SHA-256 receipt', async () => {
  const api = `${API_ORIGIN}/api/kittens`;
  const controlledByLocale = new Map(['ja', 'en', 'zh'].map(locale => [locale, fuluckDetail('2608-00001', locale)]));
  let loaderCalls = 0;
  const result = await readFuluckPublicTarget({
    activeIds: ['2608-00001'],
    fetchImpl: async url => {
      if (url === api) return publicResponse({ body: JSON.stringify([{ breederId: '2608-00001' }]), contentType: 'application/json', url });
      const locale = localeFromFuluckUrl(url);
      const controlled = controlledByLocale.get(locale);
      return publicResponse({
        body: locale === 'ja' ? controlled : appendBeforeDocumentClose(controlled, cloudflareTailScript()),
        url,
      });
    },
    controlledPageLoader: async ({ breederId, locale }) => {
      loaderCalls += 1;
      assert.equal(breederId, '2608-00001');
      return controlledByLocale.get(locale);
    },
  });

  assert.equal(loaderCalls, 3);
  assert.deepEqual(result.renderedPages.map(({ locale, breed, sha256 }) => ({ locale, breed, sha256 })), [
    { locale: 'ja', breed: 'ja', sha256: createHash('sha256').update(controlledByLocale.get('ja'), 'utf8').digest('hex') },
    { locale: 'en', breed: 'en', sha256: createHash('sha256').update(controlledByLocale.get('en'), 'utf8').digest('hex') },
    { locale: 'zh', breed: 'zh', sha256: createHash('sha256').update(controlledByLocale.get('zh'), 'utf8').digest('hex') },
  ]);
});

test('readFuluckPublicTarget blocks any byte mutation of a controlled rendered page', async (t) => {
  const api = `${API_ORIGIN}/api/kittens`;
  const controlled = fuluckDetail('2608-00001', 'ja');
  const pageUrl = `${FULUCK_ORIGIN}/kittens/2608-00001.html`;
  const variants = [
    ['visible text', html => html.replace('<td>ja</td>', '<td>changed-text</td>')],
    ['photo URL', html => html.replace('/child.jpg', '/changed-photo.jpg')],
    ['video URL', html => html.replace('AbCdEfGhI12', 'ZyXwVuTsRq0')],
    ['canonical URL', html => html.replace(`<link rel="canonical" href="${pageUrl}">`, `<link rel="canonical" href="${pageUrl}?changed=1">`)],
    ['Product type', html => html.replace('"@type":"Product"', '"@type":"WebPage"')],
    ['Offer type', html => html.replace('"@type":"Offer"', '"@type":"PriceSpecification"')],
  ];

  for (const [name, mutate] of variants) {
    await t.test(name, async () => {
      const remote = mutate(controlled);
      assert.notEqual(remote, controlled);
      await assert.rejects(
        readFuluckPublicTarget({
          activeIds: ['2608-00001'],
          fetchImpl: async url => url === api
            ? publicResponse({ body: JSON.stringify([{ breederId: '2608-00001' }]), contentType: 'application/json', url })
            : publicResponse({ body: remote, url }),
          controlledPageLoader: async () => controlled,
        }),
        error => assertSafeFailure(error, {
          stage: 'fuluck_rendered',
          reason: 'render_contract',
          breederId: '2608-00001',
          locale: 'ja',
          url: pageUrl,
        }),
      );
    });
  }
});

test('readFuluckPublicTarget does not normalize a byte-distinct UTF-8 BOM before the render contract', async () => {
  const api = `${API_ORIGIN}/api/kittens`;
  const controlled = fuluckDetail('2608-00001', 'ja');
  const remoteWithBom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(controlled, 'utf8')]);

  await assert.rejects(
    readFuluckPublicTarget({
      activeIds: ['2608-00001'],
      fetchImpl: async url => url === api
        ? publicResponse({ body: JSON.stringify([{ breederId: '2608-00001' }]), contentType: 'application/json', url })
        : publicResponse({ body: remoteWithBom, url }),
      controlledPageLoader: async () => controlled,
    }),
    error => assertSafeFailure(error, {
      stage: 'fuluck_rendered',
      reason: 'render_contract',
      breederId: '2608-00001',
      locale: 'ja',
      url: `${FULUCK_ORIGIN}/kittens/2608-00001.html`,
    }),
  );
});

test('readFuluckPublicTarget blocks an injected controlled page for the wrong locale or breeder ID', async (t) => {
  const api = `${API_ORIGIN}/api/kittens`;
  const pageUrl = `${FULUCK_ORIGIN}/kittens/2608-00001.html`;
  const remote = fuluckDetail('2608-00001', 'ja');
  for (const [name, controlled] of [
    ['wrong locale', fuluckDetail('2608-00001', 'en')],
    ['wrong breeder ID', fuluckDetail('2608-00002', 'ja')],
  ]) {
    await t.test(name, async () => {
      await assert.rejects(
        readFuluckPublicTarget({
          activeIds: ['2608-00001'],
          fetchImpl: async url => url === api
            ? publicResponse({ body: JSON.stringify([{ breederId: '2608-00001' }]), contentType: 'application/json', url })
            : publicResponse({ body: remote, url }),
          controlledPageLoader: async () => controlled,
        }),
        error => assertSafeFailure(error, {
          stage: 'fuluck_rendered',
          reason: 'render_contract',
          breederId: '2608-00001',
          locale: 'ja',
          url: pageUrl,
        }),
      );
    });
  }
});

test('controlled-page loader blocks missing, nonregular, symlinked, and oversized files without leaking local details', async (t) => {
  assert.equal(typeof publicCrawl.createControlledFuluckPageLoader, 'function');
  const api = `${API_ORIGIN}/api/kittens`;
  const pageUrl = `${FULUCK_ORIGIN}/kittens/2608-00001.html`;
  const controlled = fuluckDetail('2608-00001', 'ja');
  const cases = [
    ['missing', async () => {}],
    ['nonregular directory', async ({ root, pathname }) => { await mkdir(pathname, { recursive: true }); }],
    ['symbolic link', async ({ root, pathname }) => {
      const target = join(root, 'other-page.html');
      await writeFile(target, controlled, 'utf8');
      await mkdir(dirname(pathname), { recursive: true });
      await symlink(target, pathname);
    }],
    ['over 2 MiB', async ({ root }) => {
      await writeControlledPage(root, '2608-00001', 'ja', `${controlled}${'x'.repeat((2 * 1024 * 1024) + 1)}`);
    }],
  ];

  for (const [name, prepare] of cases) {
    await t.test(name, async (child) => {
      const root = await temporaryControlledRoot(child);
      const pathname = expectedControlledPath(root, '2608-00001', 'ja');
      await prepare({ root, pathname });
      const loader = publicCrawl.createControlledFuluckPageLoader({ root });
      await assert.rejects(
        readFuluckPublicTarget({
          activeIds: ['2608-00001'],
          fetchImpl: async url => url === api
            ? publicResponse({ body: JSON.stringify([{ breederId: '2608-00001' }]), contentType: 'application/json', url })
            : publicResponse({ body: controlled, url }),
          controlledPageLoader: loader,
        }),
        error => {
          assertSafeFailure(error, {
            stage: 'fuluck_rendered', reason: 'render_contract', breederId: '2608-00001', locale: 'ja', url: pageUrl,
          });
          const formatted = publicCrawl.formatPublicAuditFailure(error);
          assert.equal(formatted.includes(root), false);
          assert.equal(formatted.includes('controlled rendered page is unavailable'), false);
          return true;
        },
      );
    });
  }
});

test('offline controlled render contract accepts all checked-out Fuluck detail pages with normal SVG', async () => {
  const ids = (await readdir(join(PROJECT, 'kittens')))
    .filter(name => /^\d{4}-\d{5}\.html$/.test(name))
    .map(name => name.slice(0, -'.html'.length))
    .sort();
  assert.ok(ids.length > 0);
  const pages = new Map();
  for (const breederId of ids) {
    for (const locale of ['ja', 'en', 'zh']) {
      const relative = locale === 'ja' ? join('kittens', `${breederId}.html`) : join(locale, 'kittens', `${breederId}.html`);
      const html = await readFile(join(PROJECT, relative), 'utf8');
      assert.match(html, /<svg\b/i, `${relative} should retain ordinary SVG`);
      pages.set(`${FULUCK_ORIGIN}${locale === 'ja' ? '' : `/${locale}`}/kittens/${breederId}.html`, html);
    }
  }
  const api = `${API_ORIGIN}/api/kittens`;
  const result = await readFuluckPublicTarget({
    activeIds: ids,
    fetchImpl: async url => url === api
      ? publicResponse({ body: JSON.stringify(ids.map(breederId => ({ breederId }))), contentType: 'application/json', url })
      : publicResponse({ body: pages.get(url), url }),
  });

  const expectedPageCount = ids.length * 3;
  assert.equal(pages.size, expectedPageCount);
  assert.equal(result.renderedPages.length, expectedPageCount);
  assert.equal(result.renderedPages.every(page => /^[a-f0-9]{64}$/.test(page.sha256)), true);
  assert.deepEqual(
    result.renderedPages.reduce((counts, page) => ({ ...counts, [page.locale]: counts[page.locale] + 1 }), { ja: 0, en: 0, zh: 0 }),
    { ja: ids.length, en: ids.length, zh: ids.length },
  );
});

test('Fuluck rendered transport strips only one proven final inline Cloudflare script before hashing', async () => {
  const url = `${FULUCK_ORIGIN}/kittens/2608-00001.html`;
  const clean = fuluckDetail('2608-00001', 'ja');
  const injected = appendBeforeDocumentClose(clean, cloudflareTailScript());

  const fetched = await publicCrawl.fetchFuluckRenderedTarget(
    url,
    async requested => publicResponse({ body: injected, url: requested }),
  );

  assert.equal(fetched.text, clean);
  assert.equal(fetched.sha256, createHash('sha256').update(clean).digest('hex'));
  assert.equal(fetched.text.includes('challenge-platform'), false);
  assert.equal(fetched.text.includes('__CF$cv$params'), false);
});

test('readFuluckPublicTarget parses all generated no-SKU locales after removing only the proven tail injection', async () => {
  const api = `${API_ORIGIN}/api/kittens`;
  const result = await readFuluckPublicTarget({
    activeIds: ['2608-00001'],
    fetchImpl: async url => {
      if (url === api) return publicResponse({
        body: JSON.stringify([{ breederId: '2608-00001' }]),
        contentType: 'application/json',
        url,
      });
      const locale = url.includes('/en/') ? 'en' : url.includes('/zh/') ? 'zh' : 'ja';
      return publicResponse({
        body: appendBeforeDocumentClose(fuluckDetail('2608-00001', locale), cloudflareTailScript()),
        url,
      });
    },
    controlledPageLoader: fixtureControlledPageLoader(),
  });

  assert.deepEqual(result.renderedPages.map(({ breederId, locale, breed, description }) => ({ breederId, locale, breed, description })), [
    { breederId: '2608-00001', locale: 'ja', breed: 'ja', description: 'ok' },
    { breederId: '2608-00001', locale: 'en', breed: 'en', description: 'ok' },
    { breederId: '2608-00001', locale: 'zh', breed: 'zh', description: 'ok' },
  ]);
});

test('Fuluck rendered sanitization blocks every unproven Cloudflare-tail variant', async (t) => {
  const clean = fuluckDetail('2608-00001', 'ja');
  const candidate = cloudflareTailScript();
  const fixtures = [
    ['challenge-only page', `<html><body>${candidate}</body></html>`],
    ['script before authoritative content', clean.replace('<table>', `${candidate}<table>`)],
    ['missing challenge-platform signature', appendBeforeDocumentClose(clean, cloudflareTailScript({ omit: 'challenge' }))],
    ['missing params signature', appendBeforeDocumentClose(clean, cloudflareTailScript({ omit: 'params' }))],
    ['missing iframe signature', appendBeforeDocumentClose(clean, cloudflareTailScript({ omit: 'iframe' }))],
    ['external script', appendBeforeDocumentClose(clean, cloudflareTailScript({ attributes: ' src="/cdn-cgi/challenge-platform/external.js"' }))],
    ['boolean src script', appendBeforeDocumentClose(clean, cloudflareTailScript({ attributes: ' src' }))],
    ['slash-delimited src script', appendBeforeDocumentClose(clean, cloudflareTailScript({ attributes: '/src="/external.js"' }))],
    ['script-x lookalike', appendBeforeDocumentClose(clean, candidate.replace('<script>', '<script-x>'))],
    ['NBSP script close', appendBeforeDocumentClose(clean, candidate.replace('</script>', '</script\u00a0>'))],
    ['NBSP body close', appendBeforeDocumentClose(clean, candidate).replace('</body>', '</body\u00a0>')],
    ['NBSP html close', appendBeforeDocumentClose(clean, candidate).replace('</html>', '</html\u00a0>')],
    ['unclosed comment pseudo-script', clean.replace('</body></html>', `<!--${candidate}</body></html>`)],
    ['unclosed script raw context', clean.replace('</body></html>', `<script>${candidate}</body></html>`)],
    ['unclosed style raw context', clean.replace('</body></html>', `<style>${candidate}</body></html>`)],
    ['unclosed template raw context', clean.replace('</body></html>', `<template>${candidate}</body></html>`)],
    ['multiple candidates', appendBeforeDocumentClose(clean, candidate, candidate)],
    ['oversized candidate', appendBeforeDocumentClose(clean, cloudflareTailScript({ padding: 16 * 1024 }))],
    ['residual challenge marker', appendBeforeDocumentClose(clean.replace('<body>', '<body><div id="challenge-platform"></div>'), candidate)],
  ];

  for (const [name, body] of fixtures) {
    await t.test(name, async () => expectFuluckRenderedBlocked(body));
  }
});

test('Fuluck rendered sanitization blocks candidates in every unclosed HTML special context', async (t) => {
  const clean = fuluckDetail('2608-00001', 'ja');
  const candidate = cloudflareTailScript();
  const fixtures = [
    ['comment', '<!--'],
    ['template', '<template>'],
    ['outer template after a nested template closes', '<template><template>inner</template>'],
    ['title RCDATA', '<title>'],
    ['textarea RCDATA', '<textarea>'],
    ['script data', '<script>'],
    ['style raw text', '<style>'],
    ['xmp raw text', '<xmp>'],
    ['iframe raw text', '<iframe>'],
    ['noembed raw text', '<noembed>'],
    ['noframes raw text', '<noframes>'],
    ['noscript conservative raw text', '<noscript>'],
    ['plaintext despite an apparent close', '<plaintext>text</plaintext>'],
  ];

  for (const [name, opening] of fixtures) {
    await t.test(name, async () => expectFuluckRenderedBlocked(
      clean.replace('</body></html>', `${opening}${candidate}</body></html>`),
    ));
  }
});

test('readFuluckPublicTarget accepts a proven tail after balanced HTML special contexts', async (t) => {
  const api = `${API_ORIGIN}/api/kittens`;
  const fixtures = [
    ['nested templates', '<template><template>inner</template></template>'],
    ['closed textarea', '<textarea>safe RCDATA</textarea>'],
    ['closed title', '<title>safe RCDATA</title>'],
  ];

  for (const [name, context] of fixtures) {
    await t.test(name, async () => {
      const result = await readFuluckPublicTarget({
        activeIds: ['2608-00001'],
        fetchImpl: async url => {
          if (url === api) return publicResponse({
            body: JSON.stringify([{ breederId: '2608-00001' }]),
            contentType: 'application/json',
            url,
          });
          const locale = url.includes('/en/') ? 'en' : url.includes('/zh/') ? 'zh' : 'ja';
          const clean = fuluckDetail('2608-00001', locale).replace('</body></html>', `${context}</body></html>`);
          return publicResponse({ body: appendBeforeDocumentClose(clean, cloudflareTailScript()), url });
        },
        controlledPageLoader: async ({ locale }) => fuluckDetail('2608-00001', locale).replace('</body></html>', `${context}</body></html>`),
      });

      assert.deepEqual(result.renderedPages.map(({ locale, breed }) => ({ locale, breed })), [
        { locale: 'ja', breed: 'ja' },
        { locale: 'en', breed: 'en' },
        { locale: 'zh', breed: 'zh' },
      ]);
    });
  }
});

test('generic Fuluck, Koneko, and API transports never strip the Cloudflare tail injection', async () => {
  const injectedHtml = appendBeforeDocumentClose(fuluckDetail('2608-00001', 'ja'), cloudflareTailScript());
  for (const [url, body, acceptedContentTypes, contentType] of [
    [`${FULUCK_ORIGIN}/kittens/2608-00001.html`, injectedHtml, ['text/html'], 'text/html'],
    [`${KONEKO_ORIGIN}/cat2608-00001.html`, injectedHtml, ['text/html'], 'text/html'],
    [`${API_ORIGIN}/api/kittens`, `${JSON.stringify([])}${cloudflareTailScript()}`, ['application/json'], 'application/json'],
  ]) {
    await assert.rejects(
      fetchPublicText(url, {
        acceptedContentTypes,
        fetchImpl: async requested => publicResponse({ body, contentType, url: requested }),
      }),
      /challenge|interstitial/i,
    );
  }
});

test('Fuluck rendered transport refuses non-detail paths before requesting them', async () => {
  for (const url of [
    `${FULUCK_ORIGIN}/`,
    `${FULUCK_ORIGIN}/kittens/2608-00001.html?preview=1`,
    `${FULUCK_ORIGIN}/fr/kittens/2608-00001.html`,
  ]) {
    let requested = false;
    await assert.rejects(
      publicCrawl.fetchFuluckRenderedTarget(url, async () => {
        requested = true;
        return publicResponse({ url });
      }),
      /rendered target URL/i,
    );
    assert.equal(requested, false);
  }
});

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

  const result = await readFuluckPublicTarget({ activeIds: ['2608-00001'], fetchImpl, controlledPageLoader: fixtureControlledPageLoader() });

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
  await assert.rejects(readFuluckPublicTarget({ activeIds: ['2608-00001'], fetchImpl: async url => publicResponse({ body: url === api ? JSON.stringify([{ breederId: '2608-00001' }]) : fuluckDetail('2608-00002', 'ja'), contentType: url === api ? 'application/json' : 'text/html', url }), controlledPageLoader: fixtureControlledPageLoader() }), error => assertSafeFailure(error, { stage: 'fuluck_rendered', reason: 'render_contract' }));
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

test('closed list failure formatter rejects unapproved fragments and query keys', () => {
  const generic = 'Public catalogue evidence could not be completed.';
  const base = `${KONEKO_ORIGIN}/breederDetail.php?pageNum=2&breeder_id=c995680`;

  for (const url of [
    `${base}#cat_list%0Ahttps://evil.example/`,
    `${base}&token=query-secret#cat_list`,
  ]) {
    const formatted = publicCrawl.formatPublicAuditFailure(new publicCrawl.PublicAuditFailure({
      stage: 'koneko_list',
      reason: 'public_request_failed',
      accountId: 'c995680',
      url,
    }));

    assert.equal(formatted, generic);
    assert.equal(formatted.includes('evil.example'), false);
    assert.equal(formatted.includes('query-secret'), false);
  }
});

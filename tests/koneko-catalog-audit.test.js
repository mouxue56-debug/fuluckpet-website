import assert from 'node:assert/strict';
import test from 'node:test';

import { compareKonekoToFuluck, renderAuditMarkdown } from '../tools/lib/koneko-catalog-audit.js';

const FACTS = {
  breed: 'サイベリアン', color: 'シルバータビー&ホワイト', gender: '♂', price: 230000,
  birthday: '2026-05-09', papa: '父猫', mama: '母猫',
};
const ACCOUNT_IDS = ['c995680', 'd696506'];
function detail(breederId, accountId, overrides = {}) {
  return {
    breederId, accountId, ...FACTS,
    photos: [`https://www.koneko-breeder.com/breeder/data/${accountId}/${breederId}-1.jpg`, `https://www.koneko-breeder.com/breeder/data/${accountId}/${breederId}-2.jpg`],
    videoId: 'AbCdEfGhI12', note: '短い紹介', description: '一段落\n\n二段落',
    detailUrl: `https://www.koneko-breeder.com/cat${breederId}.html`, ...overrides,
  };
}

function page(breederId, locale, overrides = {}) {
  const translated = locale === 'ja' ? {} : {
    note: locale === 'en' ? 'Short introduction' : '简短介绍',
    description: locale === 'en' ? 'First paragraph\n\nSecond paragraph' : '第一段\n\n第二段',
  };
  return {
    ...detail(breederId, breederId === '2608-00001' ? 'c995680' : 'd696506'),
    locale, ...translated,
    detailUrl: `https://fuluckpet.com${locale === 'ja' ? '' : `/${locale}`}/kittens/${breederId}.html`,
    sha256: 'c'.repeat(64),
    ...overrides,
  };
}

function receipt(accountId) {
  return {
    url: `https://www.koneko-breeder.com/breederDetail.php?breeder_id=${accountId}`,
    status: 200, contentType: 'text/html; charset=utf-8', sha256: accountId === 'c995680' ? 'a'.repeat(64) : 'b'.repeat(64),
    rangeStart: 1, rangeEnd: 1, declaredTotal: 1,
  };
}

function exactInput() {
  const accounts = ACCOUNT_IDS.map((accountId, index) => {
    const breederId = index === 0 ? '2608-00001' : '2608-00002';
    return {
      accountId, declaredTotal: 1, receipts: [receipt(accountId)],
      kittens: [{ breederId, status: 'available', detailUrl: `https://www.koneko-breeder.com/cat${breederId}.html` }],
      activeDetails: [detail(breederId, accountId)],
    };
  });
  const ids = accounts.map(account => account.kittens[0].breederId);
  return {
    timestamp: '2026-08-17T03:04:05.000Z',
    accounts,
    fuluck: {
      apiRecords: ids.map(breederId => ({ breederId, status: 'available' })),
      renderedPages: ids.flatMap(breederId => ['ja', 'en', 'zh'].map(locale => page(breederId, locale))),
      checkedUrls: [
        ...accounts.flatMap(account => [
          ...account.receipts.map(item => item.url),
          ...account.activeDetails.map(item => item.detailUrl),
        ]),
        'https://fuluck-api.mouxue56.workers.dev/api/kittens',
        ...ids.flatMap(breederId => ['ja', 'en', 'zh'].map(locale => `https://fuluckpet.com${locale === 'ja' ? '' : `/${locale}`}/kittens/${breederId}.html`)),
      ],
    },
  };
}

function audit(change) {
  const input = exactInput();
  change(input);
  return compareKonekoToFuluck(input);
}

function diff(result, type, breederId, field) {
  return result.diffs.find(item => item.type === type && item.breederId === breederId && (field === undefined || item.field === field));
}

test('returns EXACT with ordered fixed-account receipts when public catalogue evidence agrees', () => {
  const result = compareKonekoToFuluck(exactInput());

  assert.equal(result.result, 'EXACT');
  assert.equal(result.exitCode, 0);
  assert.deepEqual(result.diffs, []);
  assert.deepEqual(result.accounts.map((a) => a.accountId), ['c995680', 'd696506']);
});

test('requires and reports the verified controlled rendered-page SHA-256 without retaining HTML', () => {
  const missingHash = exactInput();
  delete missingHash.fuluck.renderedPages[0].sha256;
  const blocked = compareKonekoToFuluck(missingHash);
  assert.equal(blocked.result, 'BLOCKED');
  assert.match(blocked.blocks.join('\n'), /rendered-page hash/i);

  const result = compareKonekoToFuluck(exactInput());
  assert.deepEqual(result.fuluck.renderedPages.map(({ breederId, locale, url, sha256 }) => ({ breederId, locale, url, sha256 })), [
    { breederId: '2608-00001', locale: 'en', url: 'https://fuluckpet.com/en/kittens/2608-00001.html', sha256: 'c'.repeat(64) },
    { breederId: '2608-00001', locale: 'ja', url: 'https://fuluckpet.com/kittens/2608-00001.html', sha256: 'c'.repeat(64) },
    { breederId: '2608-00001', locale: 'zh', url: 'https://fuluckpet.com/zh/kittens/2608-00001.html', sha256: 'c'.repeat(64) },
    { breederId: '2608-00002', locale: 'en', url: 'https://fuluckpet.com/en/kittens/2608-00002.html', sha256: 'c'.repeat(64) },
    { breederId: '2608-00002', locale: 'ja', url: 'https://fuluckpet.com/kittens/2608-00002.html', sha256: 'c'.repeat(64) },
    { breederId: '2608-00002', locale: 'zh', url: 'https://fuluckpet.com/zh/kittens/2608-00002.html', sha256: 'c'.repeat(64) },
  ]);
  const markdown = renderAuditMarkdown(result);
  assert.match(markdown, /Verified rendered page: 2608-00001 \(ja\).*sha256:c{64}/);
  assert.doesNotMatch(markdown, /<html|kitten-detail-table/i);
});

test('reports each source/target presence and status drift class by exact breeder ID', () => {
  const sourceMissing = audit(input => {
    input.fuluck.apiRecords.shift();
    input.fuluck.renderedPages = input.fuluck.renderedPages.filter(page => page.breederId !== '2608-00001');
    input.fuluck.checkedUrls = input.fuluck.checkedUrls.filter(url => !(url.includes('fuluckpet.com') && url.includes('2608-00001')));
  });
  assert.ok(diff(sourceMissing, 'source_active_missing', '2608-00001'));

  const targetInactive = audit(input => { input.fuluck.apiRecords[0].status = 'sold'; });
  assert.ok(diff(targetInactive, 'source_active_target_inactive', '2608-00001'));

  const inactiveSource = audit(input => {
    const account = input.accounts[0];
    account.declaredTotal = 2; account.receipts[0].rangeEnd = 2; account.receipts[0].declaredTotal = 2;
    account.kittens.push({ breederId: '2608-00003', status: 'sold', detailUrl: 'https://www.koneko-breeder.com/cat2608-00003.html' });
    input.fuluck.apiRecords.push({ breederId: '2608-00003', status: 'available' });
  });
  assert.ok(diff(inactiveSource, 'source_inactive_target_active', '2608-00003'));

  const status = audit(input => { input.fuluck.apiRecords[0].status = 'reserved'; });
  assert.ok(diff(status, 'status_mismatch', '2608-00001', 'status'));
});

test('reports factual, ordered media, video, and Japanese text drift without exposing long text', () => {
  const result = audit(input => {
    input.fuluck.renderedPages.find(item => item.breederId === '2608-00001' && item.locale === 'ja').price = 220000;
    input.fuluck.renderedPages.find(item => item.breederId === '2608-00002' && item.locale === 'ja').photos.reverse();
    input.fuluck.renderedPages.find(item => item.breederId === '2608-00002' && item.locale === 'ja').videoId = 'ZyXwVuTsRq0';
    const ja = input.fuluck.renderedPages.find(item => item.breederId === '2608-00001' && item.locale === 'ja');
    ja.note = '変更された短い紹介';
    ja.description = `変更された長い紹介\n${'AUTHORIZATION: supplied-secret '.repeat(40)}`;
  });

  assert.deepEqual(diff(result, 'fact_mismatch', '2608-00001', 'price'), {
    type: 'fact_mismatch', accountId: 'c995680', breederId: '2608-00001', field: 'price', source: 230000, target: 220000,
  });
  assert.ok(diff(result, 'photos_mismatch', '2608-00002', 'photos'));
  assert.ok(diff(result, 'video_id_mismatch', '2608-00002', 'videoId'));
  const longText = diff(result, 'japanese_text_mismatch', '2608-00001', 'description');
  assert.match(longText.source.sha256, /^[a-f0-9]{64}$/);
  assert.match(longText.target.sha256, /^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(longText).includes('supplied-secret'), false);
  assert.ok(diff(result, 'translation_review_required', '2608-00001', 'note'));
  assert.deepEqual(result.diffs.filter(item => item.type === 'translation_review_required' && item.breederId === '2608-00001').map(item => item.locale), ['en', 'zh', 'en', 'zh']);
});

test('reports missing rendered pages and missing EN/ZH short and long text without claiming translation equivalence', () => {
  const missing = audit(input => {
    input.fuluck.renderedPages = input.fuluck.renderedPages.map(item => item.breederId === '2608-00001' && item.locale === 'ja'
      ? { breederId: item.breederId, locale: item.locale, state: 'rendered_page_missing', url: item.detailUrl }
      : item);
  });
  assert.ok(diff(missing, 'rendered_page_missing', '2608-00001', 'ja'));

  const translations = audit(input => {
    const en = input.fuluck.renderedPages.find(item => item.breederId === '2608-00001' && item.locale === 'en');
    const zh = input.fuluck.renderedPages.find(item => item.breederId === '2608-00001' && item.locale === 'zh');
    en.note = ''; zh.description = '  ';
  });
  assert.ok(diff(translations, 'translation_missing', '2608-00001', 'note'));
  assert.ok(diff(translations, 'translation_missing', '2608-00001', 'description'));
  assert.equal(translations.diffs.some(item => item.type.includes('equivalence')), false);
});

test('blocks on incomplete evidence instead of inferring a non-exact catalogue result', () => {
  const cases = [
    input => { input.accounts[0].receipts = []; },
    input => { input.accounts[0].receipts[0].rangeEnd = 0; },
    input => { input.fuluck.apiRecords.push({ breederId: '2608-00001', status: 'available' }); },
    input => { input.accounts[0].activeDetails = []; },
    input => { delete input.fuluck.checkedUrls; },
  ];
  for (const change of cases) {
    const result = audit(change);
    assert.equal(result.result, 'BLOCKED');
    assert.equal(result.exitCode, 3);
    assert.deepEqual(result.diffs, []);
    assert.ok(result.blocks.length > 0);
  }
});

test('blocks when checked URLs do not exactly bind account receipts, source details, API, and each rendered locale page', () => {
  const cases = [
    input => { input.accounts[0].receipts[0].url = 'https://example.test/breederDetail.php?breeder_id=c995680'; },
    input => { input.fuluck.checkedUrls = input.fuluck.checkedUrls.filter(url => url !== input.accounts[0].receipts[0].url); },
    input => { input.accounts[0].activeDetails[0].detailUrl = 'https://www.koneko-breeder.com/cat2608-00099.html'; },
    input => { input.fuluck.checkedUrls = input.fuluck.checkedUrls.filter(url => url !== input.accounts[0].activeDetails[0].detailUrl); },
    input => { input.fuluck.checkedUrls = input.fuluck.checkedUrls.filter(url => url !== 'https://fuluck-api.mouxue56.workers.dev/api/kittens'); },
    input => { input.fuluck.checkedUrls = input.fuluck.checkedUrls.filter(url => url !== 'https://fuluckpet.com/en/kittens/2608-00001.html'); },
    input => { input.fuluck.checkedUrls.push('https://fuluckpet.com/unrelated.html'); },
  ];
  for (const change of cases) {
    const result = audit(change);
    assert.equal(result.result, 'BLOCKED');
    assert.equal(result.exitCode, 3);
  }
});

test('blocks and never renders credential-like Koneko receipt content types or hashes', () => {
  const cases = [
    input => { input.accounts[0].receipts[0].contentType = 'Bearer actual-secret'; },
    input => { input.accounts[0].receipts[0].sha256 = 'token actual-secret'; },
  ];
  for (const change of cases) {
    const input = exactInput();
    change(input);
    const result = compareKonekoToFuluck(input);
    assert.equal(result.result, 'BLOCKED');
    assert.doesNotMatch(renderAuditMarkdown(result), /actual-secret|bearer|token/i);
  }

  const markdown = renderAuditMarkdown(compareKonekoToFuluck(exactInput()));
  assert.match(markdown, /text\/html; charset=utf-8/);
  assert.match(markdown, /a{64}/);
});

test('renders bounded JST receipts with all checked identifiers and no write or credential disclosure', () => {
  const input = exactInput();
  const ja = input.fuluck.renderedPages.find(item => item.breederId === '2608-00001' && item.locale === 'ja');
  ja.breed = 'Bearer actual-secret';
  ja.color = 'token actual-secret';
  ja.gender = 'PASSWORD=actual-secret';
  ja.papa = 'secret: actual-secret';
  ja.mama = 'Cookie actual-secret';
  ja.description = `Authorization actual-secret\n${'秘密の本文 '.repeat(100)}`;
  ja.note = 'API-Key actual-secret';
  const markdown = renderAuditMarkdown(compareKonekoToFuluck(input));

  assert.match(markdown, /2026-08-17 12:04:05 JST/);
  assert.match(markdown, /DRIFT/);
  for (const accountId of ACCOUNT_IDS) assert.match(markdown, new RegExp(accountId));
  assert.match(markdown, /Fuluck API records: 2/);
  assert.match(markdown, /Fuluck rendered pages: 6 \(ja: 2, en: 2, zh: 2\)/);
  assert.match(markdown, /2608-00001/);
  assert.match(markdown, /description/);
  assert.match(markdown, /https:\/\/fuluckpet\.com\/kittens\/2608-00001\.html/);
  assert.match(markdown, /NO WRITE PERFORMED/);
  assert.doesNotMatch(markdown, /秘密の本文|actual-secret|authorization|bearer|token|password|secret|cookie|api-key/i);
  assert.doesNotMatch(markdown, /一段落\n\n二段落/);
});

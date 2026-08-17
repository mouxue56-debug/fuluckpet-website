import assert from 'node:assert/strict';
import test from 'node:test';

import {
  decodeHtmlText,
  parseFuluckDetailPage,
  parseKonekoDetailPage,
  parseKonekoListPage,
} from '../tools/lib/koneko-public-html.js';

const LIST_OPTIONS = {
  accountId: 'c995680',
  pageUrl: 'https://www.koneko-breeder.com/breederDetail.php?breeder_id=c995680',
};

function listCard(id, status = '', imageId = id) {
  const statusMarkup = status
    ? `<div class="listLmtInfStt"><span class="business">${status}</span></div>`
    : '<div class="listLmtInfStt"><span class="new">NEW</span></div>';
  return `<li class="Min_d-flex box02Inner" style="position:relative;">
    <div class="Min_d-flex cat_list_contents">
      <div class="listLmtInf">${statusMarkup}</div>
      <div class="pic_image"><a href="cat${id}.html" title="サイベリアン">
        <img id="src_${imageId}" src="/breeder/data/c995680/child_img_1_thumb_mob_${id.replace('-', '')}.jpg" alt="子猫">
      </a></div>
      <p class="pic_kind_name"><a href="cat${id}.html">サイベリアン</a></p>
    </div>
  </li>`;
}

function directStateCard(id, stateHtml) {
  return listCard(id).replace(
    /<div class="listLmtInfStt">[\s\S]*?<\/div>/,
    `<div class="listLmtInfStt">${stateHtml}</div>`,
  );
}

function stateClassCard(id, className, stateHtml) {
  return listCard(id).replace(
    /<div class="listLmtInfStt">[\s\S]*?<\/div>/,
    `<div class="${className}">${stateHtml}</div>`,
  );
}

function listPage(cards, { total = 4, start = 1, end = 3, next = true } = {}) {
  return `<!doctype html><html><body>
    <div class="pagenation"><div class="disp_pagePosition">全<span class="totalNum">${total}</span>件中&nbsp;&nbsp;${start}～${end}件を表示</div>
      <ul class="list_pagenation">${next ? '<li><a href="breederDetail.php?pageNum=2&amp;breeder_id=c995680#cat_list">次へ</a></li>' : ''}</ul>
    </div>
    <ul id="cat_list">${cards.join('\n')}</ul>
  </body></html>`;
}

test('parses live, reserved, and sold list cards with the range receipt and same-host next page', () => {
  const html = listPage([
    listCard('2608-00001'),
    listCard('2608-00002', '商談中'),
    listCard('2608-00003', '販売終了'),
  ]);
  const page = parseKonekoListPage(html, LIST_OPTIONS);

  assert.deepEqual(page.cards.map(({ breederId, status }) => ({ breederId, status })), [
    { breederId: '2608-00001', status: 'available' },
    { breederId: '2608-00002', status: 'reserved' },
    { breederId: '2608-00003', status: 'sold' },
  ]);
  assert.equal(page.declaredTotal, 4);
  assert.deepEqual([page.rangeStart, page.rangeEnd], [1, 3]);
  assert.equal(
    page.nextPageUrl,
    'https://www.koneko-breeder.com/breederDetail.php?pageNum=2&breeder_id=c995680#cat_list',
  );
  assert.match(page.sha256, /^[0-9a-f]{64}$/);
});

test('maps 事前成約申請 to reserved and rejects unknown status, duplicate IDs, disagreement, and range mismatch', () => {
  assert.equal(
    parseKonekoListPage(listPage([listCard('2608-00001', '事前成約申請')], { total: 1, end: 1 }), LIST_OPTIONS)
      .cards[0].status,
    'reserved',
  );
  assert.throws(() => parseKonekoListPage(listPage([listCard('2608-00001', '掲載停止')], { total: 1, end: 1 }), LIST_OPTIONS), /unknown status/i);
  assert.throws(() => parseKonekoListPage(listPage([listCard('2608-00001'), listCard('2608-00001')]), LIST_OPTIONS), /duplicate/i);
  assert.throws(() => parseKonekoListPage(listPage([listCard('2608-00001', '', '2608-99999')], { total: 1, end: 1 }), LIST_OPTIONS), /disagree|match/i);
  assert.throws(() => parseKonekoListPage(listPage([listCard('2608-00001')], { total: 1, end: 2 }), LIST_OPTIONS), /range|card/i);
});

test('maps exact unwrapped Japanese list status containers', () => {
  const cases = [
    ['販売中', 'available'],
    ['商談中', 'reserved'],
    ['事前成約申請', 'reserved'],
    ['成約済み', 'sold'],
    ['販売終了', 'sold'],
  ];
  for (const [label, status] of cases) {
    const page = parseKonekoListPage(
      listPage([directStateCard('2608-00001', label)], { total: 1, end: 1 }),
      LIST_OPTIONS,
    );
    assert.equal(page.cards[0].status, status, label);
  }
});

test('requires an exact whitespace-delimited list status container class', () => {
  for (const className of ['listLmtInfStt-extra', 'not-listLmtInfStt']) {
    assert.throws(
      () => parseKonekoListPage(listPage([stateClassCard('2608-00001', className, '成約済み')], { total: 1, end: 1 }), LIST_OPTIONS),
      /live|marker|status/i,
      className,
    );
  }
  const page = parseKonekoListPage(
    listPage([stateClassCard('2608-00001', 'foo listLmtInfStt bar', '成約済み')], { total: 1, end: 1 }),
    LIST_OPTIONS,
  );
  assert.equal(page.cards[0].status, 'sold');
});

test('fails closed for out-of-contract, repeated, or unmarked list states', () => {
  assert.throws(() => parseKonekoListPage(listPage([listCard('2608-00001', '成約済み（引き渡し前）')], { total: 1, end: 1 }), LIST_OPTIONS), /unknown status/i);
  const repeated = listCard('2608-00001', '販売中').replace('</li>', '<span class="business">掲載停止</span></li>');
  assert.throws(() => parseKonekoListPage(listPage([repeated], { total: 1, end: 1 }), LIST_OPTIONS), /unknown status/i);
  const unmarked = listCard('2608-00001').replace(/<div class="listLmtInfStt">[\s\S]*?<\/div>/, '<div class="listLmtInfStt"></div>');
  assert.throws(() => parseKonekoListPage(listPage([unmarked], { total: 1, end: 1 }), LIST_OPTIONS), /live|marker|status/i);
  const bareNew = listCard('2608-00001').replace(/<div class="listLmtInfStt">[\s\S]*?<\/div>/, '<div class="listLmtInfStt">NEW</div>');
  assert.throws(() => parseKonekoListPage(listPage([bareNew], { total: 1, end: 1 }), LIST_OPTIONS), /live|marker|status/i);
  const unknownDirect = directStateCard('2608-00001', '掲載停止');
  assert.throws(() => parseKonekoListPage(listPage([unknownDirect], { total: 1, end: 1 }), LIST_OPTIONS), /unknown status/i);
  const conflicting = directStateCard('2608-00001', '成約済み').replace('</li>', '<span class="business">販売中</span></li>');
  assert.throws(() => parseKonekoListPage(listPage([conflicting], { total: 1, end: 1 }), LIST_OPTIONS), /conflicting status/i);
  const misleadingNew = directStateCard('2608-00001', '<span class="new status">NEW</span>');
  assert.throws(() => parseKonekoListPage(listPage([misleadingNew], { total: 1, end: 1 }), LIST_OPTIONS), /unknown status/i);
  const hyphenatedNew = listCard('2608-00001').replace('class="new"', 'class="new-status"');
  assert.throws(() => parseKonekoListPage(listPage([hyphenatedNew], { total: 1, end: 1 }), LIST_OPTIONS), /live|marker|status/i);
  const spacedNew = listCard('2608-00001').replace('class="new"', 'class="foo new bar"');
  assert.equal(parseKonekoListPage(listPage([spacedNew], { total: 1, end: 1 }), LIST_OPTIONS).cards[0].status, 'available');
});

test('ignores unrelated totalNum markup, rejects challenge pages, and rejects off-host next links', () => {
  const html = `<span class="totalNum">999</span>${listPage([listCard('2608-00001')], { total: 1, end: 1, next: false })}`
    .replace('</ul>\n    </div>', '<li><a href="https://evil.example/next">次へ</a></li></ul>\n    </div>');
  const page = parseKonekoListPage(html, LIST_OPTIONS);
  assert.equal(page.declaredTotal, 1);
  assert.equal(page.nextPageUrl, '');
  assert.throws(() => parseKonekoListPage('<html><title>Just a moment...</title><div id="challenge-platform"></div></html>', LIST_OPTIONS), /challenge|interstitial/i);
});

const KONEKO_DETAIL_OPTIONS = {
  expectedAccountId: 'c995680',
  expectedBreederId: '2608-00001',
  pageUrl: 'https://www.koneko-breeder.com/cat2608-00001.html',
};

function konekoDetail({ json = true, images = true, sku = '2608-00001', account = 'c995680', price = '230000' } = {}) {
  const product = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    sku,
    image: images ? [
      `https://www.koneko-breeder.com/breeder/data/${account}/child_img_1_hash.jpg.webp`,
      `https://www.koneko-breeder.com/breeder/data/${account}/child_img_2_hash.jpg.webp`,
    ] : [],
    offers: { '@type': 'Offer', ...(price !== undefined ? { price } : {}), priceCurrency: 'JPY' },
  };
  return `<html><head><link rel="canonical" href="${KONEKO_DETAIL_OPTIONS.pageUrl}">
    ${json ? `<script type="application/ld+json">${JSON.stringify(product)}</script>` : '<script type="application/ld+json">{bad json</script>'}
  </head><body>
    <table class="petDtlTable"><tr><th>品種</th><td>サイベリアン</td></tr><tr><th>毛色</th><td>シルバータビー&amp;ホワイト（トリプルコート）</td></tr><tr><th>性別</th><td>♂</td></tr><tr><th>誕生日</th><td>2026/5/9</td></tr></table>
    <div class="gnrCnt"><p>汎用欄の文章</p></div><div class="petDtlInt"><div class="gnrCnt"><p>一段落<br>続き</p><p>二段落<br>続き</p></div></div>
    <div class="parents"><p>父猫：父猫</p><p>母猫：母猫</p></div>
    <p class="pic_detail_appeal">短い紹介</p><iframe src="https://www.youtube.com/watch?v=AbCdEfGhI12"></iframe>
  </body></html>`;
}

test('normalizes a Koneko detail Product, facts, parents, note, introduction, and canonical video ID', () => {
  assert.deepEqual(parseKonekoDetailPage(konekoDetail(), KONEKO_DETAIL_OPTIONS), {
    breederId: '2608-00001',
    accountId: 'c995680',
    breed: 'サイベリアン',
    color: 'シルバータビー&ホワイト（トリプルコート）',
    gender: '♂',
    price: 230000,
    birthday: '2026-05-09',
    photos: [
      'https://www.koneko-breeder.com/breeder/data/c995680/child_img_1_hash.jpg.webp',
      'https://www.koneko-breeder.com/breeder/data/c995680/child_img_2_hash.jpg.webp',
    ],
    videoId: 'AbCdEfGhI12',
    papa: '父猫',
    mama: '母猫',
    note: '短い紹介',
    description: '一段落\n続き\n\n二段落\n続き',
    detailUrl: KONEKO_DETAIL_OPTIONS.pageUrl,
  });
});

test('does not treat a suffix detail-note class as the note region', () => {
  const detail = konekoDetail().replace('class="pic_detail_appeal"', 'class="pic_detail_appeal-extra"');
  assert.equal(parseKonekoDetailPage(detail, KONEKO_DETAIL_OPTIONS).note, '');
});

test('fails closed for malformed JSON-LD, zero source photos, and mismatched Koneko SKU/account', () => {
  assert.throws(() => parseKonekoDetailPage(konekoDetail({ json: false }), KONEKO_DETAIL_OPTIONS), /JSON-LD|Product|malformed/i);
  assert.throws(() => parseKonekoDetailPage(konekoDetail({ images: false }), KONEKO_DETAIL_OPTIONS), /photo/i);
  assert.throws(() => parseKonekoDetailPage(konekoDetail({ sku: '2608-00002' }), KONEKO_DETAIL_OPTIONS), /SKU|breeder/i);
  assert.throws(() => parseKonekoDetailPage(konekoDetail({ account: 'd696506' }), KONEKO_DETAIL_OPTIONS), /account/i);
});

test('fails closed when Product price evidence is missing or non-numeric', () => {
  assert.throws(() => parseKonekoDetailPage(konekoDetail({ price: null }), KONEKO_DETAIL_OPTIONS), /price/i);
  assert.throws(() => parseKonekoDetailPage(konekoDetail({ price: 'not-a-number' }), KONEKO_DETAIL_OPTIONS), /price/i);
});

function fuluckDetail(locale = 'ja', { sku = '2608-00001' } = {}) {
  const product = {
    '@context': 'https://schema.org', '@type': 'Product', ...(sku !== undefined ? { sku } : {}),
    image: ['https://www.koneko-breeder.com/breeder/data/c995680/child_img_1_hash.jpg.webp', 'https://www.koneko-breeder.com/breeder/data/c995680/child_img_2_hash.jpg.webp'],
    offers: { '@type': 'Offer', price: '230000' },
  };
  const text = locale === 'ja' ? ['サイベリアン', 'シルバータビー&ホワイト（トリプルコート）', '♂', '短い紹介', '一段落', '二段落']
    : locale === 'en' ? ['Siberian', 'Silver tabby & white', 'Male', 'Short note', 'First paragraph', 'Second paragraph']
      : ['Siberian', '银色虎斑白色', 'Male', '', '', ''];
  return `<html lang="${locale}"><head><link rel="canonical" href="https://fuluckpet.com/kittens/2608-00001.html"><script type="application/ld+json">${JSON.stringify(product)}</script></head><body>
    <table class="kitten-detail-table"><tr><th>品種</th><td>${text[0]}</td></tr><tr><th>毛色</th><td>${text[1]}</td></tr><tr><th>性別</th><td>${text[2]}</td></tr><tr><th>誕生日</th><td data-i18n-birthday="2026-05-09">Born 2026/5</td></tr><tr><th>備考</th><td>${text[3]}</td></tr></table>
    <section class="kitten-detail-introduction"><h2>Introduction</h2><p>${text[4]}</p><p>${text[5]}</p></section>
    <div class="kitten-detail-parents"><p><span>パパ猫</span>: <a>父猫</a></p><p><span>ママ猫</span>: <a>母猫</a></p></div><iframe src="https://www.youtube.com/embed/AbCdEfGhI12"></iframe>
  </body></html>`;
}

test('parses Fuluck JA, EN, and ZH pages with ordered images, identity, locale, and blank translations preserved', () => {
  const ja = parseFuluckDetailPage(fuluckDetail('ja'), { expectedBreederId: '2608-00001', locale: 'ja', pageUrl: 'https://fuluckpet.com/kittens/2608-00001.html' });
  assert.deepEqual(ja, {
    breederId: '2608-00001', locale: 'ja', breed: 'サイベリアン', color: 'シルバータビー&ホワイト（トリプルコート）', gender: '♂', price: 230000, birthday: '2026-05-09',
    photos: ['https://www.koneko-breeder.com/breeder/data/c995680/child_img_1_hash.jpg.webp', 'https://www.koneko-breeder.com/breeder/data/c995680/child_img_2_hash.jpg.webp'], videoId: 'AbCdEfGhI12', papa: '父猫', mama: '母猫', note: '短い紹介', description: '一段落\n\n二段落', detailUrl: 'https://fuluckpet.com/kittens/2608-00001.html',
  });
  assert.deepEqual(parseFuluckDetailPage(fuluckDetail('en'), { expectedBreederId: '2608-00001', locale: 'en', pageUrl: 'https://fuluckpet.com/kittens/2608-00001.html' }), {
    breederId: '2608-00001', locale: 'en', breed: 'Siberian', color: 'Silver tabby & white', gender: '♂', price: 230000, birthday: '2026-05-09',
    photos: ['https://www.koneko-breeder.com/breeder/data/c995680/child_img_1_hash.jpg.webp', 'https://www.koneko-breeder.com/breeder/data/c995680/child_img_2_hash.jpg.webp'], videoId: 'AbCdEfGhI12', papa: '父猫', mama: '母猫', note: 'Short note', description: 'First paragraph\n\nSecond paragraph', detailUrl: 'https://fuluckpet.com/kittens/2608-00001.html',
  });
  const zh = parseFuluckDetailPage(fuluckDetail('zh'), { expectedBreederId: '2608-00001', locale: 'zh', pageUrl: 'https://fuluckpet.com/kittens/2608-00001.html' });
  assert.deepEqual(zh, {
    breederId: '2608-00001', locale: 'zh', breed: 'Siberian', color: '银色虎斑白色', gender: '♂', price: 230000, birthday: '2026-05-09',
    photos: ['https://www.koneko-breeder.com/breeder/data/c995680/child_img_1_hash.jpg.webp', 'https://www.koneko-breeder.com/breeder/data/c995680/child_img_2_hash.jpg.webp'], videoId: 'AbCdEfGhI12', papa: '父猫', mama: '母猫', note: '', description: '', detailUrl: 'https://fuluckpet.com/kittens/2608-00001.html',
  });
});

test('requires an exact Fuluck Product SKU even when the canonical URL matches', () => {
  assert.throws(() => parseFuluckDetailPage(fuluckDetail('ja', { sku: '' }), { expectedBreederId: '2608-00001', locale: 'ja', pageUrl: 'https://fuluckpet.com/kittens/2608-00001.html' }), /SKU|breeder/i);
  assert.throws(() => parseFuluckDetailPage(fuluckDetail('ja', { sku: '2608-00002' }), { expectedBreederId: '2608-00001', locale: 'ja', pageUrl: 'https://fuluckpet.com/kittens/2608-00001.html' }), /SKU|breeder/i);
});

test('normalizes HTML entities and line breaks without executing markup', () => {
  assert.equal(decodeHtmlText(' A&nbsp;&amp; B<br> C <p>D</p>', { preserveBreaks: true }), 'A & B\nC\n\nD');
  assert.equal(decodeHtmlText('<script>bad()</script>A\r\n B', { preserveBreaks: false }), 'A B');
});

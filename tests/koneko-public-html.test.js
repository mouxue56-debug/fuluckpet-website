import assert from 'node:assert/strict';
import test from 'node:test';

import * as publicHtml from '../tools/lib/koneko-public-html.js';

const {
  decodeHtmlText,
  parseKonekoDetailPage,
  parseKonekoListPage,
} = publicHtml;

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

function listPage(cards, {
  total = 4,
  start = 1,
  end = 3,
  next = true,
  links,
  afterPagination = '',
  paginationSuffix = '',
  paginationWrapper = '',
  paginationWrapperAttributes = '',
} = {}) {
  const paginationLinks = links ?? (next ? '<li><a href="breederDetail.php?pageNum=2&amp;breeder_id=c995680#cat_list">次へ</a></li>' : '');
  const wrapperOpen = paginationWrapper ? `<${paginationWrapper}${paginationWrapperAttributes ? ` ${paginationWrapperAttributes}` : ''}>` : '';
  const wrapperClose = paginationWrapper ? `</${paginationWrapper}>` : '';
  return `<!doctype html><html><body>
    ${wrapperOpen}
    <div class="pagenation"><div class="disp_pagePosition">全<span class="totalNum">${total}</span>件中&nbsp;&nbsp;${start}～${end}件を表示</div>
      <ul class="list_pagenation">${paginationLinks}</ul>
      ${paginationSuffix}
    </div>
    ${afterPagination}
    ${wrapperClose}
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

test('uses only visible explicit same-host pagination next links', () => {
  const finalPage = parseKonekoListPage(
    listPage([listCard('2608-00001')], {
      total: 1,
      end: 1,
      next: false,
      links: '<li><a href="breederDetail.php?pageNum=15&amp;breeder_id=c995680">15</a></li><li><a href="breederDetail.php?pageNum=14&amp;breeder_id=c995680">前へ</a></li>',
    }),
    LIST_OPTIONS,
  );
  assert.equal(finalPage.nextPageUrl, '');

  const englishNextPage = parseKonekoListPage(
    listPage([listCard('2608-00001')], {
      total: 2,
      end: 1,
      next: false,
      links: '<li><a href="breederDetail.php?pageNum=2&amp;breeder_id=c995680"><span>Next</span></a></li>',
    }),
    LIST_OPTIONS,
  );
  assert.equal(englishNextPage.nextPageUrl, 'https://www.koneko-breeder.com/breederDetail.php?pageNum=2&breeder_id=c995680');

  const externalNextPage = parseKonekoListPage(
    listPage([listCard('2608-00001')], {
      total: 1,
      end: 1,
      next: false,
      afterPagination: '<nav><a href="breederDetail.php?pageNum=2&amp;breeder_id=c995680">Next</a></nav>',
    }),
    LIST_OPTIONS,
  );
  assert.equal(externalNextPage.nextPageUrl, '');

  for (const inertMarkup of [
    '<!-- <div> -->',
    '<script>const template = "<div>";</script>',
    '<style>.template::before { content: "<div>"; }</style>',
    '<template><div></template>',
  ]) {
    const page = parseKonekoListPage(
      listPage([listCard('2608-00001')], {
        total: 1,
        end: 1,
        next: false,
        links: inertMarkup,
        afterPagination: '<nav><a href="breederDetail.php?pageNum=2&amp;breeder_id=c995680">Next</a></nav>',
        paginationWrapper: 'div',
      }),
      LIST_OPTIONS,
    );
    assert.equal(page.nextPageUrl, '', inertMarkup);
  }

  for (const paginationWrapperAttributes of [
    'hidden',
    'aria-hidden="true"',
    'style="display:none"',
    'style="visibility:hidden"',
    'style=display:none',
    'style=visibility:hidden',
  ]) {
    assert.throws(
      () => parseKonekoListPage(
        listPage([listCard('2608-00001')], {
          total: 2,
          end: 1,
          next: false,
          links: '<li><a href="breederDetail.php?pageNum=2&amp;breeder_id=c995680">次へ</a></li>',
          paginationWrapper: 'section',
          paginationWrapperAttributes,
        }),
        LIST_OPTIONS,
      ),
      /pagination|range|receipt/i,
      paginationWrapperAttributes,
    );
  }

  for (const links of [
    '<li><a hidden href="breederDetail.php?pageNum=2&amp;breeder_id=c995680">次へ</a></li>',
    '<li><a aria-hidden="true" href="breederDetail.php?pageNum=2&amp;breeder_id=c995680">次へ</a></li>',
    '<li><a style="display:none" href="breederDetail.php?pageNum=2&amp;breeder_id=c995680">次へ</a></li>',
    '<li><a style="visibility: hidden" href="breederDetail.php?pageNum=2&amp;breeder_id=c995680">Next</a></li>',
    '<li><a style=display:none href="breederDetail.php?pageNum=2&amp;breeder_id=c995680">次へ</a></li>',
    '<li style=visibility:hidden><a href="breederDetail.php?pageNum=2&amp;breeder_id=c995680">Next</a></li>',
    '<li><a href="breederDetail.php?pageNum=2&amp;breeder_id=c995680"><span hidden>次へ</span></a></li>',
    '<li hidden><a href="breederDetail.php?pageNum=2&amp;breeder_id=c995680">次へ</a></li>',
    '<li><a href="breederDetail.php?pageNum=2&amp;breeder_id=c995680">詳しく見る</a></li>',
    '<li><a href="breederDetail.php?pageNum=2&amp;breeder_id=c995680">Next results</a></li>',
  ]) {
    const page = parseKonekoListPage(listPage([listCard('2608-00001')], { total: 1, end: 1, next: false, links }), LIST_OPTIONS);
    assert.equal(page.nextPageUrl, '', links);
  }
});

test('uses the repaired DOM boundary when phrasing markup is implicitly closed inside pagination', () => {
  for (const tag of ['span', 'em']) {
    const page = parseKonekoListPage(
      listPage([listCard('2608-00001')], {
        total: 1,
        end: 1,
        next: false,
        paginationSuffix: `<${tag}>`,
        afterPagination: `<nav><a href="breederDetail.php?pageNum=2&amp;breeder_id=c995680">Next</a></nav></${tag}>`,
        paginationWrapper: 'div',
      }),
      LIST_OPTIONS,
    );
    assert.equal(page.nextPageUrl, '', tag);
  }
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
    ['準備中', 'preparing'],
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

test('maps known live span.cls statuses only inside the unique status container', () => {
  const cases = [
    ['販売中', 'available'],
    ['商談中', 'reserved'],
    ['事前成約申請', 'reserved'],
    ['準備中', 'preparing'],
    ['成約済み', 'sold'],
    ['販売終了', 'sold'],
  ];
  for (const [label, status] of cases) {
    const page = parseKonekoListPage(
      listPage([directStateCard('2608-00001', `<span class="cls">${label}</span>`)], { total: 1, end: 1 }),
      LIST_OPTIONS,
    );
    assert.equal(page.cards[0].status, status, label);
  }

  const unknown = directStateCard('2608-00001', '<span class="cls">掲載停止</span>');
  assert.throws(
    () => parseKonekoListPage(listPage([unknown], { total: 1, end: 1 }), LIST_OPTIONS),
    /unknown status/i,
  );

  const outsideConflict = directStateCard('2608-00001', '<span class="cls">成約済み</span>')
    .replace('</li>', '<span class="cls">販売中</span></li>');
  assert.equal(
    parseKonekoListPage(listPage([outsideConflict], { total: 1, end: 1 }), LIST_OPTIONS).cards[0].status,
    'sold',
  );
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

test('treats the live empty status container as available after the NEW badge expires', () => {
  const card = listCard('2608-00001')
    .replace(/<div class="listLmtInfStt">[\s\S]*?<\/div>/, '<div class="listLmtInfStt"></div>');
  const page = parseKonekoListPage(listPage([card], { total: 1, end: 1 }), LIST_OPTIONS);
  assert.equal(page.cards[0].status, 'available');
});

test('fails closed for out-of-contract, repeated, or unmarked list states', () => {
  assert.throws(() => parseKonekoListPage(listPage([listCard('2608-00001', '成約済み（引き渡し前）')], { total: 1, end: 1 }), LIST_OPTIONS), /unknown status/i);
  const bareNew = listCard('2608-00001').replace(/<div class="listLmtInfStt">[\s\S]*?<\/div>/, '<div class="listLmtInfStt">NEW</div>');
  assert.throws(() => parseKonekoListPage(listPage([bareNew], { total: 1, end: 1 }), LIST_OPTIONS), /live|marker|status/i);
  const unknownDescendant = listCard('2608-00001').replace(/<div class="listLmtInfStt">[\s\S]*?<\/div>/, '<div class="listLmtInfStt"><span>掲載停止</span></div>');
  assert.throws(() => parseKonekoListPage(listPage([unknownDescendant], { total: 1, end: 1 }), LIST_OPTIONS), /live|marker|status/i);
  const unknownDirect = directStateCard('2608-00001', '掲載停止');
  assert.throws(() => parseKonekoListPage(listPage([unknownDirect], { total: 1, end: 1 }), LIST_OPTIONS), /unknown status/i);
  const misleadingNew = directStateCard('2608-00001', '<span class="new status">NEW</span>');
  assert.throws(() => parseKonekoListPage(listPage([misleadingNew], { total: 1, end: 1 }), LIST_OPTIONS), /unknown status/i);
  const hyphenatedNew = listCard('2608-00001').replace('class="new"', 'class="new-status"');
  assert.throws(() => parseKonekoListPage(listPage([hyphenatedNew], { total: 1, end: 1 }), LIST_OPTIONS), /live|marker|status/i);
  const spacedNew = listCard('2608-00001').replace('class="new"', 'class="foo new bar"');
  assert.equal(parseKonekoListPage(listPage([spacedNew], { total: 1, end: 1 }), LIST_OPTIONS).cards[0].status, 'available');
});

test('list status evidence is scoped only to the unique listLmtInfStt container', () => {
  const outsideUnknown = listCard('2608-00001', '販売中')
    .replace('</li>', '<span class="business">掲載停止</span></li>');
  const outsideConflict = directStateCard('2608-00001', '成約済み')
    .replace('</li>', '<span class="business">販売中</span></li>');
  const outsideNew = listCard('2608-00001')
    .replace(/<div class="listLmtInfStt">[\s\S]*?<\/div>/, '<div class="listLmtInfStt"></div>')
    .replace('</li>', '<span class="new">NEW</span></li>');

  assert.equal(
    parseKonekoListPage(listPage([outsideUnknown], { total: 1, end: 1 }), LIST_OPTIONS).cards[0].status,
    'available',
  );
  assert.equal(
    parseKonekoListPage(listPage([outsideConflict], { total: 1, end: 1 }), LIST_OPTIONS).cards[0].status,
    'sold',
  );
  assert.equal(
    parseKonekoListPage(listPage([outsideNew], { total: 1, end: 1 }), LIST_OPTIONS).cards[0].status,
    'available',
  );
});

test('ignores unrelated totalNum markup, rejects challenge pages, and rejects off-host next links', () => {
  const html = `<span class="totalNum">999</span>${listPage([listCard('2608-00001')], { total: 1, end: 1, next: false })}`
    .replace('</ul>\n    </div>', '<li><a href="https://evil.example/next">次へ</a></li></ul>\n    </div>');
  const page = parseKonekoListPage(html, LIST_OPTIONS);
  assert.equal(page.declaredTotal, 1);
  assert.equal(page.nextPageUrl, '');
  assert.throws(() => parseKonekoListPage('<html><title>Just a moment...</title><div id="challenge-platform"></div></html>', LIST_OPTIONS), /challenge|interstitial/i);
});

test('list evidence follows the HTML tree and ignores inert or foreign card lookalikes', () => {
  const fakeCard = listCard('2608-99999');
  const actualCard = listCard('2608-00001');
  const contexts = [
    `<!-- ${fakeCard} -->`,
    `<template>${fakeCard}</template>`,
    `<script>${JSON.stringify(fakeCard)}</script>`,
    `<style>${fakeCard}</style>`,
    `<textarea>${fakeCard}</textarea>`,
    `<xmp>${fakeCard}</xmp>`,
    `<iframe>${fakeCard}</iframe>`,
    `<noembed>${fakeCard}</noembed>`,
    `<noframes>${fakeCard}</noframes>`,
    `<noscript>${fakeCard}</noscript>`,
  ];

  for (const inert of contexts) {
    const page = parseKonekoListPage(
      listPage([actualCard], { total: 1, end: 1, next: false, afterPagination: inert }),
      LIST_OPTIONS,
    );
    assert.deepEqual(page.cards.map(({ breederId }) => breederId), ['2608-00001'], inert.slice(0, 24));
  }

  for (const integrationContext of [`<svg>${fakeCard}</svg>`, `<math>${fakeCard}</math>`]) {
    assert.throws(
      () => parseKonekoListPage(
        listPage([actualCard], { total: 1, end: 1, next: false, afterPagination: integrationContext }),
        LIST_OPTIONS,
      ),
      /range|card|duplicate/i,
    );
  }

  const plaintextAfterEvidence = listPage([actualCard], { total: 1, end: 1, next: false })
    .replace('</body>', `<plaintext>${fakeCard}</plaintext></body>`);
  assert.deepEqual(
    parseKonekoListPage(plaintextAfterEvidence, LIST_OPTIONS).cards.map(({ breederId }) => breederId),
    ['2608-00001'],
  );
});

test('list attributes and hidden pagination use decoded browser semantics exactly once', () => {
  const encodedCard = listCard('2608-00001')
    .replace('Min_d-flex box02Inner', 'Min_d-flex&Tab;box02Inner')
    .replace('id="src_2608-00001"', 'id="src_2608-00001"');
  const page = parseKonekoListPage(listPage([encodedCard], {
    total: 1,
    end: 1,
    next: false,
    links: '<li style="display&colon;none"><a href="breederDetail.php?pageNum=2&amp;breeder_id=c995680">次へ</a></li>',
  }), LIST_OPTIONS);
  assert.equal(page.cards[0].breederId, '2608-00001');
  assert.equal(page.nextPageUrl, '');

  const doubleEncoded = listCard('2608-00001').replace('Min_d-flex box02Inner', 'Min_d-flex&amp;Tab;box02Inner');
  assert.throws(
    () => parseKonekoListPage(listPage([doubleEncoded], { total: 1, end: 1, next: false }), LIST_OPTIONS),
    /card|Koneko/i,
  );
});

test('hidden pagination totals and range text never become catalogue receipts', () => {
  const base = listPage([listCard('2608-00001')], { total: 1, end: 1, next: false });
  const hiddenTotal = base.replace('class="totalNum"', 'class="totalNum" hidden');
  const hiddenRange = base.replace('1～1件を表示', '<span hidden>1～1件を表示</span>');
  assert.throws(() => parseKonekoListPage(hiddenTotal, LIST_OPTIONS), /pagination|total|receipt/i);
  assert.throws(() => parseKonekoListPage(hiddenRange, LIST_OPTIONS), /pagination|range|receipt/i);
});

const KONEKO_DETAIL_OPTIONS = {
  expectedAccountId: 'c995680',
  expectedBreederId: '2608-00001',
  pageUrl: 'https://www.koneko-breeder.com/cat2608-00001.html',
};

function konekoFactRows({
  breed = 'サイベリアン',
  color = 'シルバータビー&amp;ホワイト（トリプルコート）',
  gender = '♂',
  birthday = '2026/5/9',
  note = '短い紹介',
} = {}) {
  return `<tr><th>猫種</th><td>${breed}</td></tr>
    <tr><th>毛色(毛質)</th><td>${color}</td></tr>
    <tr><th>性別</th><td>${gender}</td></tr>
    <tr><th>誕生日</th><td>${birthday}</td></tr>
    <tr><th>アピール<br>ポイント</th><td>${note}</td></tr>`;
}

function konekoParentInfo({ papa = '父猫', mama = '母猫', tag = 'div' } = {}) {
  return `<${tag} id="parentInfo"><ul class="parentInfo_list">
    <li><h3 class="parentInfo_head father">Father</h3><ul class="parentInfo_detail_list"><li class="parentName"><strong>${papa}</strong></li></ul></li>
    <li><h3 class="parentInfo_head mother">Mother</h3><ul class="parentInfo_detail_list"><li class="parentName"><strong>${mama}</strong></li></ul></li>
  </ul></${tag}>`;
}

function konekoVideo(videoId = 'AbCdEfGhI12', { tag = 'div' } = {}) {
  return `<${tag} class="movieGalleryCnt youtube"><iframe src="https://www.youtube.com/embed/${videoId}"></iframe></${tag}>`;
}

function konekoDetail({
  json = true,
  images = true,
  sku = '2608-00001',
  account = 'c995680',
  price = '230000',
  availability = 'https://schema.org/InStock',
  offers,
  factsTag = 'div',
  factRows = konekoFactRows(),
  parentInfo = konekoParentInfo(),
  video = konekoVideo(),
  introduction = '<div class="petDtlInt"><div class="gnrCnt"><p>一段落<br>続き</p><p>二段落<br>続き</p></div></div>',
  outside = '',
} = {}) {
  const product = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    sku,
    image: images ? [
      `https://www.koneko-breeder.com/breeder/data/${account}/child_img_1_hash.jpg.webp`,
      `https://www.koneko-breeder.com/breeder/data/${account}/child_img_2_hash.jpg.webp`,
    ] : [],
    offers: offers ?? {
      '@type': 'Offer',
      ...(price !== undefined ? { price } : {}),
      ...(availability !== undefined ? { availability } : {}),
      priceCurrency: 'JPY',
    },
  };
  return `<html><head><link rel="canonical" href="${KONEKO_DETAIL_OPTIONS.pageUrl}">
    ${json ? `<script type="application/ld+json">${JSON.stringify(product)}</script>` : '<script type="application/ld+json">{bad json</script>'}
  </head><body>
    <table class="gnrTbl">${konekoFactRows({ breed: '外側の猫種', color: '外側の毛色', gender: '♀', birthday: '2020/1/1', note: '外側の紹介' })}</table>
    <${factsTag} class="petDtlData"><table class="gnrTbl">${factRows}</table></${factsTag}>
    ${parentInfo}
    ${video}
    ${introduction}
    ${outside}
  </body></html>`;
}

test('normalizes live-shaped Koneko Product facts, parents, note, introduction, and canonical video ID', () => {
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
    observedAvailability: 'in_stock',
    videoId: 'AbCdEfGhI12',
    papa: '父猫',
    mama: '母猫',
    note: '短い紹介',
    description: '一段落\n続き\n\n二段落\n続き',
    detailUrl: KONEKO_DETAIL_OPTIONS.pageUrl,
  });
});

test('extracts only the live itemprop description and excludes the breeder rating sibling', () => {
  const introduction = `<div class="petDtlInt"><div class="gnrCnt">
    <div class="breederRating">ブリーダー評価 5.00（113件）</div>
    <div itemprop="description"><p>子猫の紹介<br>続き</p><p>二段落</p></div>
  </div></div>`;
  assert.equal(
    parseKonekoDetailPage(konekoDetail({ introduction }), KONEKO_DETAIL_OPTIONS).description,
    '子猫の紹介\n続き\n\n二段落',
  );
});

test('does not fall back when modern description evidence is present but ambiguous', () => {
  const duplicate = `<div class="petDtlInt"><div class="gnrCnt">旧紹介
    <div itemprop="description">紹介A</div><div itemprop="description">紹介B</div>
  </div></div>`;
  const hidden = `<div class="petDtlInt"><div class="gnrCnt">旧紹介
    <div itemprop="description" hidden>隠し紹介</div>
  </div></div>`;
  assert.throws(() => parseKonekoDetailPage(konekoDetail({ introduction: duplicate }), KONEKO_DETAIL_OPTIONS), /introduction|description|unique|visible/i);
  assert.throws(() => parseKonekoDetailPage(konekoDetail({ introduction: hidden }), KONEKO_DETAIL_OPTIONS), /introduction|description|visible/i);
});

test('retains one exact visible legacy gnrCnt description only when modern evidence is absent', () => {
  const legacy = '<div class="petDtlInt"><div class="gnrCnt"><p>旧形式<br>続き</p></div></div>';
  assert.equal(parseKonekoDetailPage(konekoDetail({ introduction: legacy }), KONEKO_DETAIL_OPTIONS).description, '旧形式\n続き');
});

test('maps exact Product offer availability and blocks missing, unknown, or conflicting detail evidence', () => {
  assert.equal(
    parseKonekoDetailPage(konekoDetail(), KONEKO_DETAIL_OPTIONS).observedAvailability,
    'in_stock',
  );
  assert.equal(
    parseKonekoDetailPage(
      konekoDetail({ availability: 'https://schema.org/SoldOut' }),
      KONEKO_DETAIL_OPTIONS,
    ).observedAvailability,
    'sold_out',
  );
  assert.throws(
    () => parseKonekoDetailPage(konekoDetail({ offers: { '@type': 'Offer', price: '230000' } }), KONEKO_DETAIL_OPTIONS),
    /availability|status/i,
  );
  assert.throws(
    () => parseKonekoDetailPage(konekoDetail({ availability: 'https://schema.org/PreOrder' }), KONEKO_DETAIL_OPTIONS),
    /availability|status/i,
  );
  assert.throws(
    () => parseKonekoDetailPage(konekoDetail({ offers: [
      { '@type': 'Offer', price: '230000', availability: 'https://schema.org/InStock' },
      { '@type': 'Offer', price: '230000', availability: 'https://schema.org/SoldOut' },
    ] }), KONEKO_DETAIL_OPTIONS),
    /availability|conflict|status/i,
  );
});

test('does not treat an outside suffix detail-note class as a Koneko note region', () => {
  const detail = konekoDetail({
    factRows: konekoFactRows({ note: '' }),
    outside: '<p class="pic_detail_appeal-extra">偽の紹介</p>',
  });
  assert.equal(parseKonekoDetailPage(detail, KONEKO_DETAIL_OPTIONS).note, '');
});

test('uses only the unique live Koneko facts region and rejects missing, duplicate, or malformed required rows', () => {
  const parsed = parseKonekoDetailPage(konekoDetail({
    factRows: konekoFactRows({ breed: '内側の猫種', color: '内側の毛色', gender: '女の子', birthday: '2026/5/10' }),
  }), KONEKO_DETAIL_OPTIONS);
  assert.equal(parsed.breed, '内側の猫種');
  assert.equal(parsed.color, '内側の毛色');
  assert.equal(parsed.gender, '♀');
  assert.equal(parsed.birthday, '2026-05-10');

  const missing = konekoDetail({ factRows: konekoFactRows().replace(/<tr><th>猫種<\/th><td>[\s\S]*?<\/td><\/tr>/, '') });
  assert.throws(() => parseKonekoDetailPage(missing, KONEKO_DETAIL_OPTIONS), /breed|猫種|required/i);

  const duplicate = konekoDetail({ factRows: `${konekoFactRows()}<tr><th>猫種</th><td>別の猫種</td></tr>` });
  assert.throws(() => parseKonekoDetailPage(duplicate, KONEKO_DETAIL_OPTIONS), /breed|猫種|duplicate/i);

  const duplicateNote = konekoDetail({ factRows: `${konekoFactRows()}<tr><th>アピール<br>ポイント</th><td>別の紹介</td></tr>` });
  assert.throws(() => parseKonekoDetailPage(duplicateNote, KONEKO_DETAIL_OPTIONS), /note|アピール|duplicate/i);

  const malformed = konekoDetail({ factRows: konekoFactRows().replace('<tr><th>毛色(毛質)</th><td>', '<tr><th>毛色(毛質)</th>') });
  assert.throws(() => parseKonekoDetailPage(malformed, KONEKO_DETAIL_OPTIONS), /facts|color|毛色|structure/i);
});

test('keeps Koneko evidence scoped to balanced detail regions when unrelated outer markup is malformed', () => {
  const parsed = parseKonekoDetailPage(konekoDetail({
    outside: '<span class="unrelated">not Koneko evidence</div>',
  }), KONEKO_DETAIL_OPTIONS);
  assert.equal(parsed.breed, 'サイベリアン');
  assert.equal(parsed.papa, '父猫');
  assert.equal(parsed.videoId, 'AbCdEfGhI12');
});

test('blocks Koneko detail evidence when a visible optional candidate is opened but unclosed', () => {
  const cases = [
    ['parent', konekoDetail({ parentInfo: konekoParentInfo().replace(/<\/div>$/, '') })],
    ['video', konekoDetail({ video: konekoVideo().replace(/<\/div>$/, '') })],
    ['introduction', konekoDetail({ introduction: '<div class="petDtlInt"><div class="gnrCnt">紹介</div>' })],
  ];

  for (const [name, html] of cases) {
    assert.throws(() => parseKonekoDetailPage(html, KONEKO_DETAIL_OPTIONS), new RegExp(name, 'i'));
  }
});

test('blocks a valid Koneko parent candidate when a second exact candidate is unclosed', () => {
  const html = konekoDetail({ parentInfo: `${konekoParentInfo()}<section id="parentInfo">` });
  assert.throws(() => parseKonekoDetailPage(html, KONEKO_DETAIL_OPTIONS), /parent.*(malformed|unique)|parent region/i);
});

test('blocks a valid Koneko facts candidate when a second exact candidate is unclosed', () => {
  const html = konekoDetail({ outside: `<section class="petDtlData"><table class="gnrTbl">${konekoFactRows()}</table>` });
  assert.throws(() => parseKonekoDetailPage(html, KONEKO_DETAIL_OPTIONS), /facts.*(malformed|unique)|facts region/i);
});

test('blocks every recognizable EOF-in-opening-tag target, including after valid evidence', () => {
  const cases = [
    ['parent', konekoDetail({ parentInfo: `${konekoParentInfo()}<section id="parentInfo" data-x="` })],
    ['facts', konekoDetail({ outside: '<section class="petDtlData" data-x="' })],
    ['video', konekoDetail({ video: `${konekoVideo()}<section class="movieGalleryCnt youtube" data-x="` })],
    ['introduction', konekoDetail({ introduction: '<section class="petDtlInt"><div class="gnrCnt">紹介</div></section><section class="petDtlInt" data-x="' })],
    ['facts table', konekoDetail({ factRows: `${konekoFactRows()}</table><table class="gnrTbl" data-x="` })],
    ['parent list', konekoDetail({ parentInfo: konekoParentInfo().replace('<ul class="parentInfo_list">', '<ul class="parentInfo_list" data-x="') })],
    ['parent name', konekoDetail({ parentInfo: konekoParentInfo().replace('<li class="parentName">', '<li class="parentName" data-x="') })],
    ['introduction content', konekoDetail({ introduction: '<section class="petDtlInt"><div class="gnrCnt" data-x="' })],
  ];

  for (const [name, html] of cases) {
    assert.throws(() => parseKonekoDetailPage(html, KONEKO_DETAIL_OPTIONS), /malformed|structure|candidate|eof|parse/i, name);
  }
});

test('illegal attribute-name lookalikes never invent Koneko selectors', () => {
  const lookalikes = [
    '<aside =class=petDtlData></aside>',
    '<aside <class=petDtlData></aside>',
    '<aside `class=petDtlData></aside>',
    '<aside =id=parentInfo></aside>',
    '<aside <id=parentInfo></aside>',
    '<aside `id=parentInfo></aside>',
  ];
  for (const outside of lookalikes) {
    const parsed = parseKonekoDetailPage(konekoDetail({ outside }), KONEKO_DETAIL_OPTIONS);
    assert.equal(parsed.breed, 'サイベリアン', outside);
    assert.equal(parsed.papa, '父猫', outside);
  }

  const actualMalformedTarget = konekoDetail({
    parentInfo: konekoParentInfo({ tag: 'section' }).replace(' id="parentInfo"', ' =bad id="parentInfo"'),
  });
  assert.throws(() => parseKonekoDetailPage(actualMalformedTarget, KONEKO_DETAIL_OPTIONS), /parent|malformed|parse/i);
});

test('Koneko selector attributes use complete character references and decode once', () => {
  const parsed = parseKonekoDetailPage(konekoDetail({
    factsTag: 'section',
    parentInfo: konekoParentInfo({ tag: 'section' }).replace('parentInfo"', 'parent&#73nfo"'),
    video: konekoVideo('AbCdEfGhI12', { tag: 'section' }).replace('youtube"', 'you&#116ube"'),
    introduction: '<section class="petDtl&#73nt"><div class="gnrTbl-no gnr&#67nt"><p>参照紹介</p></div></section>',
  }), KONEKO_DETAIL_OPTIONS);
  assert.equal(parsed.papa, '父猫');
  assert.equal(parsed.videoId, 'AbCdEfGhI12');
  assert.equal(parsed.description, '参照紹介');

  const doubleEncoded = konekoDetail({
    outside: `${konekoParentInfo({ tag: 'section' }).replace('parentInfo"', 'parent&amp;#73;nfo"')}`,
  });
  assert.equal(parseKonekoDetailPage(doubleEncoded, KONEKO_DETAIL_OPTIONS).papa, '父猫');
});

test('blocks malformed Koneko optional candidates whose real selectors remain recoverable', () => {
  const cases = [
    ['parent', konekoDetail({
      parentInfo: konekoParentInfo({ tag: 'section' }).replace('id="parentInfo"', 'id="parentInfo" data-x="one" data-x="two"'),
    })],
    ['video', konekoDetail({
      video: konekoVideo('AbCdEfGhI12', { tag: 'section' }).replace('class="movieGalleryCnt youtube"', 'class="movieGalleryCnt youtube" data-x="one" data-x="two"'),
    })],
    ['introduction', konekoDetail({
      introduction: '<section class="petDtlInt" data-x="one" data-x="two"><div class="gnrCnt">紹介</div></section>',
    })],
  ];

  for (const [name, html] of cases) {
    assert.throws(() => parseKonekoDetailPage(html, KONEKO_DETAIL_OPTIONS), new RegExp(name, 'i'), name);
  }
});

test('uses the browser-kept first duplicate attribute when a later duplicate resembles a selector', () => {
  const html = konekoDetail({
    parentInfo: `${konekoParentInfo()}<section id="other" id="parentInfo"><ul class="parentInfo_list"></ul></section>`,
  });
  assert.equal(parseKonekoDetailPage(html, KONEKO_DETAIL_OPTIONS).papa, '父猫');
});

test('does not invent a Koneko video candidate from a discarded duplicate class', () => {
  const html = konekoDetail({
    video: '<section class="not-video" class="movieGalleryCnt youtube"><iframe src="https://www.youtube.com/embed/AbCdEfGhI12"></iframe></section>',
  });
  assert.equal(parseKonekoDetailPage(html, KONEKO_DETAIL_OPTIONS).videoId, '');
});

test('blocks a Koneko selector recovered after malformed opening-tag syntax', () => {
  const html = konekoDetail({
    parentInfo: konekoParentInfo({ tag: 'section' }).replace(' id="parentInfo"', ' =bad id="parentInfo"'),
  });
  assert.throws(() => parseKonekoDetailPage(html, KONEKO_DETAIL_OPTIONS), /parent.*malformed|parent region/i);
});

test('blocks a recoverable malformed Koneko selector even when it is hidden', () => {
  const html = konekoDetail({
    parentInfo: `${konekoParentInfo()}<aside hidden>${konekoParentInfo({ tag: 'section' }).replace('id="parentInfo"', 'id="parentInfo" data-x="one" data-x="two"')}</aside>`,
  });
  assert.throws(() => parseKonekoDetailPage(html, KONEKO_DETAIL_OPTIONS), /parent.*malformed|parent region/i);
});

test('blocks a malformed inner Koneko required selector instead of choosing a sibling table', () => {
  const html = konekoDetail({
    factRows: `${konekoFactRows()}</table><table class="gnrTbl" data-x="one" data-x="two">${konekoFactRows({ breed: '別の猫種' })}`,
  });
  assert.throws(() => parseKonekoDetailPage(html, KONEKO_DETAIL_OPTIONS), /facts table.*(malformed|unique)|facts table/i);
});

test('parses well-formed section Koneko evidence containers and blocks an unclosed section candidate', () => {
  const parsed = parseKonekoDetailPage(konekoDetail({
    factsTag: 'section',
    parentInfo: konekoParentInfo({ tag: 'section' }),
    video: konekoVideo('AbCdEfGhI12', { tag: 'section' }),
    introduction: '<section class="petDtlInt"><div class="gnrCnt">紹介</div></section>',
  }), KONEKO_DETAIL_OPTIONS);
  assert.equal(parsed.breed, 'サイベリアン');
  assert.equal(parsed.papa, '父猫');
  assert.equal(parsed.videoId, 'AbCdEfGhI12');
  assert.equal(parsed.description, '紹介');

  const malformed = konekoDetail({ parentInfo: konekoParentInfo({ tag: 'section' }).replace(/<\/section>$/, '') });
  assert.throws(() => parseKonekoDetailPage(malformed, KONEKO_DETAIL_OPTIONS), /parent.*malformed|parent region/i);
});

test('blocks Koneko facts when exact candidates occur only in footer or hidden content', () => {
  const cases = [
    `<footer><section class="petDtlData"><table class="gnrTbl">${konekoFactRows({ breed: 'フッター猫種' })}</table></section></footer>`,
    `<section hidden class="petDtlData"><table class="gnrTbl">${konekoFactRows({ breed: '自己隠し猫種' })}</table></section>`,
    `<aside aria-hidden="true"><section class="petDtlData"><table class="gnrTbl">${konekoFactRows({ breed: '隠し猫種' })}</table></section></aside>`,
  ];
  for (const outside of cases) {
    const html = konekoDetail({ parentInfo: '', video: '', introduction: '', outside })
      .replace('class="petDtlData"', 'class="notPetDtlData"');
    assert.throws(() => parseKonekoDetailPage(html, KONEKO_DETAIL_OPTIONS), /facts region|facts.*unique/i);
  }
});

test('treats footer and hidden optional Koneko candidates as observed absence', () => {
  const footer = `<footer>${konekoParentInfo({ papa: 'フッター父', mama: 'フッター母', tag: 'section' })}${konekoVideo('ZyXwVuTsRq0', { tag: 'section' })}<section class="petDtlInt"><div class="gnrCnt">フッター紹介</div></section></footer>`;
  const hidden = `<aside hidden>${konekoParentInfo({ papa: '隠し父', mama: '隠し母', tag: 'section' })}${konekoVideo('MnOpQrStUv3', { tag: 'section' })}<section class="petDtlInt"><div class="gnrCnt">隠し紹介</div></section></aside>`;
  const parsed = parseKonekoDetailPage(konekoDetail({ parentInfo: '', video: '', introduction: '', outside: `${footer}${hidden}` }), KONEKO_DETAIL_OPTIONS);
  assert.deepEqual({ papa: parsed.papa, mama: parsed.mama, videoId: parsed.videoId, description: parsed.description }, {
    papa: '', mama: '', videoId: '', description: '',
  });
});

test('uses visible Koneko evidence when hidden and footer lookalikes coexist', () => {
  const footer = `<footer><section class="petDtlData"><table class="gnrTbl">${konekoFactRows({ breed: 'フッター猫種' })}</table></section>${konekoParentInfo({ papa: 'フッター父', mama: 'フッター母', tag: 'section' })}${konekoVideo('ZyXwVuTsRq0', { tag: 'section' })}<section class="petDtlInt"><div class="gnrCnt">フッター紹介</div></section></footer>`;
  const hidden = `<aside style="visibility: hidden"><section class="petDtlData"><table class="gnrTbl">${konekoFactRows({ breed: '隠し猫種' })}</table></section>${konekoParentInfo({ papa: '隠し父', mama: '隠し母', tag: 'section' })}${konekoVideo('MnOpQrStUv3', { tag: 'section' })}<section class="petDtlInt"><div class="gnrCnt">隠し紹介</div></section></aside>`;
  const parsed = parseKonekoDetailPage(konekoDetail({ outside: `${footer}${hidden}` }), KONEKO_DETAIL_OPTIONS);
  assert.deepEqual({ breed: parsed.breed, papa: parsed.papa, mama: parsed.mama, videoId: parsed.videoId, description: parsed.description }, {
    breed: 'サイベリアン', papa: '父猫', mama: '母猫', videoId: 'AbCdEfGhI12', description: '一段落\n続き\n\n二段落\n続き',
  });
});

test('hidden or footer fact cells and video media never become Koneko evidence', () => {
  const hiddenRow = konekoDetail({
    factRows: konekoFactRows().replace('<tr><th>猫種</th>', '<tr hidden><th>猫種</th>'),
  });
  const hiddenLabel = konekoDetail({
    factRows: konekoFactRows().replace('<th>猫種</th>', '<th hidden>猫種</th>'),
  });
  const hiddenValue = konekoDetail({
    factRows: konekoFactRows().replace('<th>猫種</th><td>', '<th>猫種</th><td hidden>'),
  });
  for (const html of [hiddenRow, hiddenLabel, hiddenValue]) {
    assert.throws(() => parseKonekoDetailPage(html, KONEKO_DETAIL_OPTIONS), /breed|facts|missing/i);
  }

  const mediaCases = [
    '<section class="movieGalleryCnt youtube"><iframe hidden src="https://www.youtube.com/embed/AbCdEfGhI12"></iframe></section>',
    '<section class="movieGalleryCnt youtube"><footer><iframe src="https://www.youtube.com/embed/AbCdEfGhI12"></iframe></footer></section>',
  ];
  for (const video of mediaCases) {
    assert.throws(() => parseKonekoDetailPage(konekoDetail({ video }), KONEKO_DETAIL_OPTIONS), /video|missing|conflicting/i);
  }
});

test('a visible matching fact row cannot hide an extra structural cell', () => {
  const html = konekoDetail({
    factRows: konekoFactRows().replace(
      '<tr><th>アピール<br>ポイント</th><td>短い紹介</td></tr>',
      '<tr><th>アピール<br>ポイント</th><td>短い紹介</td><td hidden>余分な証拠</td></tr>',
    ),
  });
  assert.throws(() => parseKonekoDetailPage(html, KONEKO_DETAIL_OPTIONS), /note|row|structure|malformed/i);
});

test('malformed hidden inner evidence blocks before visibility exclusion', () => {
  const hiddenRow = konekoDetail({
    factRows: konekoFactRows().replace('<tr><th>猫種</th>', '<tr hidden data-x="one" data-x="two"><th>猫種</th>'),
  });
  const hiddenMedia = konekoDetail({
    video: '<section class="movieGalleryCnt youtube"><iframe hidden data-x="one" data-x="two" src="https://www.youtube.com/embed/AbCdEfGhI12"></iframe></section>',
  });
  assert.throws(() => parseKonekoDetailPage(hiddenRow, KONEKO_DETAIL_OPTIONS), /malformed|facts|breed/i);
  assert.throws(() => parseKonekoDetailPage(hiddenMedia, KONEKO_DETAIL_OPTIONS), /malformed|video/i);
});

test('rejects unquoted decoded hidden styles as the only Koneko required evidence', () => {
  const html = konekoDetail({
    parentInfo: '',
    video: '',
    introduction: '',
    outside: `<aside style=display&#58;none><section class="petDtlData"><table class="gnrTbl">${konekoFactRows({ breed: '隠し猫種' })}</table></section></aside>`,
  }).replace('class="petDtlData"', 'class="notPetDtlData"');
  assert.throws(() => parseKonekoDetailPage(html, KONEKO_DETAIL_OPTIONS), /facts region|facts.*unique/i);
});

test('uses the browser-kept first style value rather than a discarded duplicate hidden style', () => {
  const html = konekoDetail({
    outside: `<aside style="color:red" style=display:none><section class="petDtlData"><table class="gnrTbl">${konekoFactRows({ breed: '隠し猫種' })}</table></section></aside>`,
  });
  assert.throws(() => parseKonekoDetailPage(html, KONEKO_DETAIL_OPTIONS), /facts|unique|duplicate/i);
});

test('does not treat words in a title attribute as hidden Koneko evidence', () => {
  const html = konekoDetail().replace('class="petDtlData"', 'class="petDtlData" title="foo hidden bar"');
  assert.equal(parseKonekoDetailPage(html, KONEKO_DETAIL_OPTIONS).breed, 'サイベリアン');
});

test('does not treat words in a data attribute as hidden Koneko evidence', () => {
  const html = konekoDetail({
    parentInfo: konekoParentInfo().replace('id="parentInfo"', 'id="parentInfo" data-note="foo hidden bar"'),
  });
  assert.equal(parseKonekoDetailPage(html, KONEKO_DETAIL_OPTIONS).papa, '父猫');
});

test('requires exactly lower-case true for aria-hidden visibility evidence', () => {
  const html = konekoDetail().replace('class="petDtlData"', 'class="petDtlData" aria-hidden="TRUE"');
  assert.equal(parseKonekoDetailPage(html, KONEKO_DETAIL_OPTIONS).breed, 'サイベリアン');
});

test('recognizes trimmed decoded aria-hidden true as Koneko hidden evidence', () => {
  const html = konekoDetail({
    parentInfo: '',
    video: '',
    introduction: '',
    outside: `<aside aria-hidden=" &#116;rue "><section class="petDtlData"><table class="gnrTbl">${konekoFactRows({ breed: '隠し猫種' })}</table></section></aside>`,
  }).replace('class="petDtlData"', 'class="notPetDtlData"');
  assert.throws(() => parseKonekoDetailPage(html, KONEKO_DETAIL_OPTIONS), /facts region|facts.*unique/i);
});

test('recognizes named and semicolonless encoded hidden-state values', () => {
  const attributes = [
    'aria-hidden="&Tab;true&Tab;"',
    'style="display&colon;none"',
    'style="display&#58none"',
    'style="display&#x3anone"',
    'style="color:red; visibility&colon; hidden !important"',
  ];
  for (const attributesSource of attributes) {
    const html = konekoDetail({
      parentInfo: '',
      video: '',
      introduction: '',
      outside: `<aside ${attributesSource}><section class="petDtlData"><table class="gnrTbl">${konekoFactRows({ breed: '隠し猫種' })}</table></section></aside>`,
    }).replace('class="petDtlData"', 'class="notPetDtlData"');
    assert.throws(() => parseKonekoDetailPage(html, KONEKO_DETAIL_OPTIONS), /facts region|facts.*unique/i, attributesSource);
  }
});

test('Koneko targets follow HTML namespaces, template inertness, integration points, and foster parenting', () => {
  const inertLookalikes = [
    `<template><section class="petDtlData"><table class="gnrTbl">${konekoFactRows({ breed: 'テンプレート猫種' })}</table></section></template>`,
    `<svg><section class="petDtlData"><table class="gnrTbl">${konekoFactRows({ breed: 'SVG猫種' })}</table></section></svg>`,
    `<math><section class="petDtlData"><table class="gnrTbl">${konekoFactRows({ breed: 'MathML猫種' })}</table></section></math>`,
    `<![CDATA[<section class="petDtlData"><table class="gnrTbl">${konekoFactRows({ breed: 'CDATA猫種' })}</table></section>]]>`,
  ];
  for (const outside of inertLookalikes) {
    assert.equal(parseKonekoDetailPage(konekoDetail({ outside }), KONEKO_DETAIL_OPTIONS).breed, 'サイベリアン', outside.slice(0, 20));
  }

  const integrationPoint = konekoDetail({
    outside: `<svg><foreignObject><section class="petDtlData"><table class="gnrTbl">${konekoFactRows({ breed: '統合点猫種' })}</table></section></foreignObject></svg>`,
  });
  assert.throws(() => parseKonekoDetailPage(integrationPoint, KONEKO_DETAIL_OPTIONS), /facts|unique|duplicate/i);

  const fosterParented = konekoDetail().replace(
    `<div class="petDtlData"><table class="gnrTbl">${konekoFactRows()}</table></div>`,
    `<table><section class="petDtlData"><table class="gnrTbl">${konekoFactRows()}</table></section></table>`,
  );
  assert.throws(() => parseKonekoDetailPage(fosterParented, KONEKO_DETAIL_OPTIONS), /facts|table|structure/i);
});

test('target-local parse errors block target evidence but unrelated parse errors stay local', () => {
  const unrelated = konekoDetail({ outside: '<aside =class=unrelated>unrelated</aside>' });
  assert.equal(parseKonekoDetailPage(unrelated, KONEKO_DETAIL_OPTIONS).breed, 'サイベリアン');

  const target = konekoDetail().replace('class="petDtlData"', 'class="petDtlData" =bad');
  assert.throws(() => parseKonekoDetailPage(target, KONEKO_DETAIL_OPTIONS), /facts|malformed|parse/i);
});

test('validates every source-backed ancestor on each Koneko detail evidence path', async (t) => {
  const baseFacts = `<div class="petDtlData"><table class="gnrTbl">${konekoFactRows()}</table></div>`;
  const malformedFactsWrapper = konekoDetail().replace(
    baseFacts,
    `<div class="petDtlData"><section data-x="one" data-x="two"><table class="gnrTbl">${konekoFactRows()}</table></section></div>`,
  );
  const malformedFactsBody = konekoDetail().replace(
    baseFacts,
    `<div class="petDtlData"><table class="gnrTbl"><tbody data-x="one" data-x="two">${konekoFactRows()}</tbody></table></div>`,
  );
  const malformedParentListPath = konekoDetail({
    parentInfo: konekoParentInfo()
      .replace('<ul class="parentInfo_list">', '<section data-x="one" data-x="two"><ul class="parentInfo_list">')
      .replace('</ul></div>', '</ul></section></div>'),
  });
  const malformedParentNamePath = konekoDetail({
    parentInfo: konekoParentInfo().replace(
      '<ul class="parentInfo_detail_list">',
      '<ul class="parentInfo_detail_list" data-x="one" data-x="two">',
    ),
  });
  const malformedVideoPath = konekoDetail({
    video: '<section class="movieGalleryCnt youtube"><div data-x="one" data-x="two"><iframe src="https://www.youtube.com/embed/AbCdEfGhI12"></iframe></div></section>',
  });
  const malformedIntroductionPath = konekoDetail({
    introduction: '<section class="petDtlInt"><div data-x="one" data-x="two"><div class="gnrCnt">紹介</div></div></section>',
  });

  for (const [name, html] of [
    ['facts wrapper', malformedFactsWrapper],
    ['facts body', malformedFactsBody],
    ['parent list path', malformedParentListPath],
    ['parent name path', malformedParentNamePath],
    ['video path', malformedVideoPath],
    ['introduction path', malformedIntroductionPath],
  ]) {
    await t.test(name, () => {
      assert.throws(
        () => parseKonekoDetailPage(html, KONEKO_DETAIL_OPTIONS),
        /malformed|source|structure|path|parse/i,
      );
    });
  }
});

test('validates every source-backed ancestor on Koneko card, status, and pagination paths', async (t) => {
  const malformedCardLinkPath = listCard('2608-00001').replace(
    '<div class="pic_image"><a href="cat2608-00001.html"',
    '<div class="pic_image"><section data-x="one" data-x="two"><a href="cat2608-00001.html"',
  ).replace('</a></div>\n      <p class="pic_kind_name">', '</a></section></div>\n      <p class="pic_kind_name">');
  const malformedStatusPath = listCard('2608-00001').replace(
    '<div class="listLmtInf"><div class="listLmtInfStt"><span class="new">NEW</span></div></div>',
    '<div class="listLmtInf"><section data-x="one" data-x="two"><div class="listLmtInfStt"><span class="new">NEW</span></div></section></div>',
  );
  const malformedRangePath = listPage([listCard('2608-00001')], { total: 1, end: 1, next: false }).replace(
    '<div class="pagenation"><div class="disp_pagePosition">',
    '<div class="pagenation"><section data-x="one" data-x="two"><div class="disp_pagePosition">',
  ).replace('</div>\n      <ul class="list_pagenation">', '</div></section>\n      <ul class="list_pagenation">');
  const malformedNextPath = listPage([listCard('2608-00001')], { total: 2, end: 1 }).replace(
    '<ul class="list_pagenation">',
    '<ul class="list_pagenation"><section data-x="one" data-x="two">',
  ).replace('</ul>\n      ', '</section></ul>\n      ');

  for (const [name, html] of [
    ['card link path', listPage([malformedCardLinkPath], { total: 1, end: 1, next: false })],
    ['status path', listPage([malformedStatusPath], { total: 1, end: 1, next: false })],
    ['pagination range path', malformedRangePath],
    ['pagination next path', malformedNextPath],
  ]) {
    await t.test(name, () => {
      assert.throws(() => parseKonekoListPage(html, LIST_OPTIONS), /malformed|source|structure|path|parse/i);
    });
  }
});

test('an unrelated EOF-in-tag remains the sole global Koneko parse-error block', () => {
  const html = konekoDetail({ outside: '<aside class="unrelated" data-note="' });
  assert.throws(() => parseKonekoDetailPage(html, KONEKO_DETAIL_OPTIONS), /eof|malformed|opening tag/i);
});

test('only actual HTML Product JSON-LD nodes participate in Koneko identity', () => {
  const product = JSON.stringify({
    '@type': 'Product',
    sku: '2608-99999',
    image: ['https://www.koneko-breeder.com/breeder/data/c995680/fake.jpg'],
    offers: { price: 1 },
  });
  const inert = [
    `<!-- <script type="application/ld+json">${product}</script> -->`,
    `<template><script type="application/ld+json">${product}</script></template>`,
    `<svg><script type="application/ld+json">${product}</script></svg>`,
  ];
  for (const outside of inert) {
    assert.equal(parseKonekoDetailPage(konekoDetail({ outside }), KONEKO_DETAIL_OPTIONS).breederId, '2608-00001', outside.slice(0, 20));
  }

  const duplicate = konekoDetail({ outside: `<script type="application/ld+json">${product}</script>` });
  assert.throws(() => parseKonekoDetailPage(duplicate, KONEKO_DETAIL_OPTIONS), /JSON-LD|Product|duplicate|unique/i);
});

test('treats absent Koneko optional parent, video, note, and introduction regions as observed empty strings', () => {
  const parsed = parseKonekoDetailPage(konekoDetail({
    factRows: konekoFactRows({ note: '' }),
    parentInfo: '',
    video: '',
    introduction: '',
    outside: `<footer><a href="https://youtu.be/ZyXwVuTsRq0">Footer video</a></footer>
      <script>const modal = '父親猫画像をモーダル表示 / 母親猫画像をモーダル表示 / https://youtu.be/ZyXwVuTsRq0';</script>`,
  }), KONEKO_DETAIL_OPTIONS);
  assert.deepEqual({ papa: parsed.papa, mama: parsed.mama, note: parsed.note, description: parsed.description, videoId: parsed.videoId }, {
    papa: '', mama: '', note: '', description: '', videoId: '',
  });
});

test('records an observed-empty name when one required Koneko parent side has no parentName item', () => {
  const motherNameAbsent = konekoParentInfo().replace(
    '<li class="parentName"><strong>母猫</strong></li>',
    '',
  );
  const parsed = parseKonekoDetailPage(
    konekoDetail({ parentInfo: motherNameAbsent }),
    KONEKO_DETAIL_OPTIONS,
  );
  assert.deepEqual({ papa: parsed.papa, mama: parsed.mama }, { papa: '父猫', mama: '' });
});

test('fails closed when present Koneko parent, video, or description structures conflict', () => {
  const parentConflict = konekoDetail({ parentInfo: konekoParentInfo().replace('</ul></div>', '<li><h3 class="parentInfo_head father">Again</h3><ul><li class="parentName"><strong>別の父猫</strong></li></ul></li></ul></div>') });
  assert.throws(() => parseKonekoDetailPage(parentConflict, KONEKO_DETAIL_OPTIONS), /parent|father|mother/i);

  const parentMalformed = konekoDetail({ parentInfo: '<div id="parentInfo"><ul class="parentInfo_list"><li><h3 class="parentInfo_head father">Father</h3><ul><li class="parentName"><strong>父猫</strong></li></ul></li></ul></div>' });
  assert.throws(() => parseKonekoDetailPage(parentMalformed, KONEKO_DETAIL_OPTIONS), /parent|father|mother/i);

  const videoConflict = konekoDetail({ video: '<div class="movieGalleryCnt youtube"><iframe src="https://www.youtube.com/embed/AbCdEfGhI12"></iframe><a href="https://youtu.be/ZyXwVuTsRq0">Other</a></div>' });
  assert.throws(() => parseKonekoDetailPage(videoConflict, KONEKO_DETAIL_OPTIONS), /video|YouTube/i);

  const duplicateVideoRegion = konekoDetail({ video: `${konekoVideo()}${konekoVideo('ZyXwVuTsRq0')}` });
  assert.throws(() => parseKonekoDetailPage(duplicateVideoRegion, KONEKO_DETAIL_OPTIONS), /video|unique/i);

  const malformedDescription = konekoDetail({ introduction: '<div class="petDtlInt"><p>紹介だけ</p></div>' });
  assert.throws(() => parseKonekoDetailPage(malformedDescription, KONEKO_DETAIL_OPTIONS), /description|introduction/i);
});

test('accepts exactly one direct strong child as each Koneko parent name', () => {
  const nestedStrong = konekoDetail({
    parentInfo: konekoParentInfo().replace(
      '<li class="parentName"><strong>父猫</strong></li>',
      '<li class="parentName"><span><strong>父猫</strong></span></li>',
    ),
  });
  const duplicateDirectStrong = konekoDetail({
    parentInfo: konekoParentInfo().replace(
      '<li class="parentName"><strong>父猫</strong></li>',
      '<li class="parentName"><strong>父猫</strong><strong>別の父猫</strong></li>',
    ),
  });
  assert.throws(() => parseKonekoDetailPage(nestedStrong, KONEKO_DETAIL_OPTIONS), /parent name|strong|direct|unique/i);
  assert.throws(() => parseKonekoDetailPage(duplicateDirectStrong, KONEKO_DETAIL_OPTIONS), /parent name|strong|direct|unique/i);
});

test('accepts canonical HTTPS YouTube watch, embed, short, and short-link Koneko video URLs', () => {
  const cases = [
    ['https://www.youtube.com/watch?v=AbCdEfGhI12', 'AbCdEfGhI12'],
    ['https://www.youtube.com/embed/ZyXwVuTsRq0', 'ZyXwVuTsRq0'],
    ['https://m.youtube.com/shorts/MnOpQrStUv3', 'MnOpQrStUv3'],
    ['https://youtu.be/QrStUvWxYz4', 'QrStUvWxYz4'],
    ['//www.youtube-nocookie.com/embed/AbCdEfGhI12', 'AbCdEfGhI12'],
  ];
  for (const [url, videoId] of cases) {
    const parsed = parseKonekoDetailPage(konekoDetail({ video: `<section class="movieGalleryCnt youtube"><iframe src="${url}"></iframe></section>` }), KONEKO_DETAIL_OPTIONS);
    assert.equal(parsed.videoId, videoId);
  }
});

test('rejects noncanonical Koneko video URL origins, redirects, credentials, duplicate IDs, and HTTP', () => {
  const urls = [
    'https://evil.example/proxy/youtube.com/embed/AbCdEfGhI12',
    'https://www.youtube.com/redirect?next=https://youtu.be/AbCdEfGhI12',
    'https://attacker@www.youtube.com/embed/AbCdEfGhI12',
    'https://www.youtube.com/watch?v=AbCdEfGhI12&v=ZyXwVuTsRq0',
    'http://www.youtube.com/embed/AbCdEfGhI12',
  ];
  for (const url of urls) {
    const html = konekoDetail({ video: `<section class="movieGalleryCnt youtube"><iframe src="${url}"></iframe></section>` });
    assert.throws(() => parseKonekoDetailPage(html, KONEKO_DETAIL_OPTIONS), /video|YouTube/i);
  }
});

test('fails closed for malformed JSON-LD, zero source photos, and mismatched Koneko SKU/account', () => {
  assert.throws(() => parseKonekoDetailPage(konekoDetail({ json: false }), KONEKO_DETAIL_OPTIONS), /JSON-LD|Product|malformed/i);
  assert.throws(() => parseKonekoDetailPage(konekoDetail({ images: false }), KONEKO_DETAIL_OPTIONS), /photo/i);
  assert.throws(() => parseKonekoDetailPage(konekoDetail({ sku: '2608-00002' }), KONEKO_DETAIL_OPTIONS), /SKU|breeder/i);
  assert.throws(() => parseKonekoDetailPage(konekoDetail({ account: 'd696506' }), KONEKO_DETAIL_OPTIONS), /account/i);
});

test('accepts only account-scoped HTTPS Koneko Product photo URLs', async (t) => {
  const valid = 'https://www.koneko-breeder.com/breeder/data/c995680/child_img_1_hash.jpg.webp';
  const invalid = [
    ['HTTP', 'http://www.koneko-breeder.com/breeder/data/c995680/child.jpg'],
    ['foreign host', 'https://evil.example/breeder/data/c995680/child.jpg'],
    ['credentials', 'https://user:pass@www.koneko-breeder.com/breeder/data/c995680/child.jpg'],
    ['port', 'https://www.koneko-breeder.com:444/breeder/data/c995680/child.jpg'],
    ['JavaScript', 'javascript:alert(1)'],
    ['relative', '/breeder/data/c995680/child.jpg'],
    ['empty filename', 'https://www.koneko-breeder.com/breeder/data/c995680/'],
  ];
  for (const [name, url] of invalid) {
    await t.test(name, () => {
      const html = konekoDetail().replace(valid, url);
      assert.throws(() => parseKonekoDetailPage(html, KONEKO_DETAIL_OPTIONS), /photo|media|account|invalid/i);
    });
  }
});

test('blocks delimiter-heavy Koneko markup below the byte limit before DOM parsing', () => {
  const deepMarkup = `${'<div>'.repeat(25_001)}${'</div>'.repeat(25_001)}`;
  const html = konekoDetail({ outside: deepMarkup });
  assert.ok(Buffer.byteLength(html, 'utf8') < 2 * 1024 * 1024);
  assert.throws(() => parseKonekoDetailPage(html, KONEKO_DETAIL_OPTIONS), /markup|delimiter|complexity|limit/i);
});

test('fails closed when Product price evidence is missing or non-numeric', () => {
  assert.throws(() => parseKonekoDetailPage(konekoDetail({ price: null }), KONEKO_DETAIL_OPTIONS), /price/i);
  assert.throws(() => parseKonekoDetailPage(konekoDetail({ price: 'not-a-number' }), KONEKO_DETAIL_OPTIONS), /price/i);
});

const FULUCK_BREEDER_ID = '2608-00001';

function fuluckPageUrl(locale, breederId = FULUCK_BREEDER_ID) {
  const prefix = locale === 'ja' ? '' : `/${locale}`;
  return `https://fuluckpet.com${prefix}/kittens/${breederId}.html`;
}

function fuluckProduct(locale = 'ja') {
  return {
    '@context': 'https://schema.org', '@type': 'Product',
    image: ['https://www.koneko-breeder.com/breeder/data/c995680/child_img_1_hash.jpg.webp', 'https://www.koneko-breeder.com/breeder/data/c995680/child_img_2_hash.jpg.webp'],
    offers: {
    '@type': 'Offer',
    price: '230000',
      url: fuluckPageUrl(locale),
    },
  };
}

function fuluckDetail(locale = 'ja') {
  const canonical = fuluckPageUrl(locale);
  const product = fuluckProduct(locale);
  const text = locale === 'ja' ? ['サイベリアン', 'シルバータビー&ホワイト（トリプルコート）', '♂', '短い紹介', '一段落', '二段落']
    : locale === 'en' ? ['Siberian', 'Silver tabby & white', 'Male', 'Short note', 'First paragraph', 'Second paragraph']
      : ['Siberian', '银色虎斑白色', 'Male', '', '', ''];
  return `<html lang="${locale}"><head><link rel="canonical" href="${canonical}"><script type="application/ld+json">${JSON.stringify(product)}</script></head><body>
    <table class="kitten-detail-table"><tr><th>品種</th><td>${text[0]}</td></tr><tr><th>毛色</th><td>${text[1]}</td></tr><tr><th>性別</th><td>${text[2]}</td></tr><tr><th>誕生日</th><td data-i18n-birthday="2026-05-09">Born 2026/5</td></tr><tr><th>備考</th><td>${text[3]}</td></tr></table>
    <section class="kitten-detail-introduction"><h2>Introduction</h2><p>${text[4]}</p><p>${text[5]}</p></section>
    <div class="kitten-detail-parents"><p><span>パパ猫</span>: <a>父猫</a></p><p><span>ママ猫</span>: <a>母猫</a></p></div><iframe src="https://www.youtube.com/embed/AbCdEfGhI12"></iframe>
  </body></html>`;
}

test('parses verified Fuluck JA, EN, and ZH pages with ordered images and blank translations preserved', () => {
  const parseVerifiedFuluckDetailPage = publicHtml.parseVerifiedFuluckDetailPage;
  assert.equal(typeof parseVerifiedFuluckDetailPage, 'function');
  const ja = parseVerifiedFuluckDetailPage(fuluckDetail('ja'), { expectedBreederId: '2608-00001', locale: 'ja', pageUrl: fuluckPageUrl('ja') });
  assert.deepEqual(ja, {
    breederId: '2608-00001', locale: 'ja', breed: 'サイベリアン', color: 'シルバータビー&ホワイト（トリプルコート）', gender: '♂', price: 230000, birthday: '2026-05-09',
    photos: ['https://www.koneko-breeder.com/breeder/data/c995680/child_img_1_hash.jpg.webp', 'https://www.koneko-breeder.com/breeder/data/c995680/child_img_2_hash.jpg.webp'], videoId: 'AbCdEfGhI12', papa: '父猫', mama: '母猫', note: '短い紹介', description: '一段落\n\n二段落', detailUrl: 'https://fuluckpet.com/kittens/2608-00001.html',
  });
  assert.deepEqual(parseVerifiedFuluckDetailPage(fuluckDetail('en'), { expectedBreederId: '2608-00001', locale: 'en', pageUrl: fuluckPageUrl('en') }), {
    breederId: '2608-00001', locale: 'en', breed: 'Siberian', color: 'Silver tabby & white', gender: '♂', price: 230000, birthday: '2026-05-09',
    photos: ['https://www.koneko-breeder.com/breeder/data/c995680/child_img_1_hash.jpg.webp', 'https://www.koneko-breeder.com/breeder/data/c995680/child_img_2_hash.jpg.webp'], videoId: 'AbCdEfGhI12', papa: '父猫', mama: '母猫', note: 'Short note', description: 'First paragraph\n\nSecond paragraph', detailUrl: 'https://fuluckpet.com/en/kittens/2608-00001.html',
  });
  const zh = parseVerifiedFuluckDetailPage(fuluckDetail('zh'), { expectedBreederId: '2608-00001', locale: 'zh', pageUrl: fuluckPageUrl('zh') });
  assert.deepEqual(zh, {
    breederId: '2608-00001', locale: 'zh', breed: 'Siberian', color: '银色虎斑白色', gender: '♂', price: 230000, birthday: '2026-05-09',
    photos: ['https://www.koneko-breeder.com/breeder/data/c995680/child_img_1_hash.jpg.webp', 'https://www.koneko-breeder.com/breeder/data/c995680/child_img_2_hash.jpg.webp'], videoId: 'AbCdEfGhI12', papa: '父猫', mama: '母猫', note: '', description: '', detailUrl: 'https://fuluckpet.com/zh/kittens/2608-00001.html',
  });
});

test('does not derive a trusted Fuluck video ID from an invalid media origin', () => {
  const html = fuluckDetail('ja').replace('https://www.youtube.com/embed/AbCdEfGhI12', 'https://evil.example/proxy/youtube.com/embed/AbCdEfGhI12');
  const parsed = publicHtml.parseVerifiedFuluckDetailPage(html, { expectedBreederId: '2608-00001', locale: 'ja', pageUrl: fuluckPageUrl('ja') });
  assert.equal(parsed.videoId, '');
});

test('normalizes HTML entities and line breaks without executing markup', () => {
  assert.equal(decodeHtmlText(' A&nbsp;&amp; B<br> C <p>D</p>', { preserveBreaks: true }), 'A & B\nC\n\nD');
  assert.equal(decodeHtmlText('<script>bad()</script>A\r\n B', { preserveBreaks: false }), 'A B');
});

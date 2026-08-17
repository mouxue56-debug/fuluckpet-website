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
    const page = parseKonekoListPage(
      listPage([listCard('2608-00001')], {
        total: 2,
        end: 1,
        next: false,
        links: '<li><a href="breederDetail.php?pageNum=2&amp;breeder_id=c995680">次へ</a></li>',
        paginationWrapper: 'section',
        paginationWrapperAttributes,
      }),
      LIST_OPTIONS,
    );
    assert.equal(page.nextPageUrl, '', paginationWrapperAttributes);
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

test('rejects pagination candidates that cross a mismatched close before an external Next link', () => {
  for (const tag of ['span', 'em']) {
    assert.throws(
      () => parseKonekoListPage(
        listPage([listCard('2608-00001')], {
          total: 1,
          end: 1,
          next: false,
          paginationSuffix: `<${tag}>`,
          afterPagination: `<nav><a href="breederDetail.php?pageNum=2&amp;breeder_id=c995680">Next</a></nav></${tag}>`,
          paginationWrapper: 'div',
        }),
        LIST_OPTIONS,
      ),
      /pagination range receipt is missing/i,
      tag,
    );
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
    offers: { '@type': 'Offer', ...(price !== undefined ? { price } : {}), priceCurrency: 'JPY' },
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
    videoId: 'AbCdEfGhI12',
    papa: '父猫',
    mama: '母猫',
    note: '短い紹介',
    description: '一段落\n続き\n\n二段落\n続き',
    detailUrl: KONEKO_DETAIL_OPTIONS.pageUrl,
  });
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

test('blocks a valid Koneko candidate when a later recoverable selector has malformed attributes', () => {
  const html = konekoDetail({
    parentInfo: `${konekoParentInfo()}<section id="other" id="parentInfo"><ul class="parentInfo_list"></ul></section>`,
  });
  assert.throws(() => parseKonekoDetailPage(html, KONEKO_DETAIL_OPTIONS), /parent.*(malformed|unique)|parent region/i);
});

test('blocks a Koneko video candidate whose matching compound class is a later duplicate occurrence', () => {
  const html = konekoDetail({
    video: '<section class="not-video" class="movieGalleryCnt youtube"><iframe src="https://www.youtube.com/embed/AbCdEfGhI12"></iframe></section>',
  });
  assert.throws(() => parseKonekoDetailPage(html, KONEKO_DETAIL_OPTIONS), /video.*malformed|video region/i);
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

test('rejects unquoted decoded hidden styles as the only Koneko required evidence', () => {
  const html = konekoDetail({
    parentInfo: '',
    video: '',
    introduction: '',
    outside: `<aside style=display&#58;none><section class="petDtlData"><table class="gnrTbl">${konekoFactRows({ breed: '隠し猫種' })}</table></section></aside>`,
  }).replace('class="petDtlData"', 'class="notPetDtlData"');
  assert.throws(() => parseKonekoDetailPage(html, KONEKO_DETAIL_OPTIONS), /facts region|facts.*unique/i);
});

test('uses a visible Koneko facts candidate when a malformed ancestor has another hidden style', () => {
  const parsed = parseKonekoDetailPage(konekoDetail({
    outside: `<aside style="color:red" style=display:none><section class="petDtlData"><table class="gnrTbl">${konekoFactRows({ breed: '隠し猫種' })}</table></section></aside>`,
  }), KONEKO_DETAIL_OPTIONS);
  assert.equal(parsed.breed, 'サイベリアン');
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

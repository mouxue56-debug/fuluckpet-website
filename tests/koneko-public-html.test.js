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

const FULUCK_BREEDER_ID = '2608-00001';

function fuluckPageUrl(locale, breederId = FULUCK_BREEDER_ID) {
  const prefix = locale === 'ja' ? '' : `/${locale}`;
  return `https://fuluckpet.com${prefix}/kittens/${breederId}.html`;
}

function fuluckProductId(breederId = FULUCK_BREEDER_ID) {
  return `https://fuluckpet.com/kittens/${breederId}.html#product`;
}

function fuluckProduct(locale = 'ja', options = {}) {
  const breederId = options.breederId ?? FULUCK_BREEDER_ID;
  const sku = Object.hasOwn(options, 'sku') ? options.sku : breederId;
  const productId = Object.hasOwn(options, 'productId') ? options.productId : fuluckProductId(breederId);
  const offerUrl = Object.hasOwn(options, 'offerUrl') ? options.offerUrl : fuluckPageUrl(locale, breederId);
  const offers = Object.hasOwn(options, 'offers') ? options.offers : {
    '@type': 'Offer',
    price: '230000',
    ...(offerUrl !== undefined ? { url: offerUrl } : {}),
  };
  const product = {
    '@context': 'https://schema.org', '@type': 'Product',
    ...(productId !== undefined ? { '@id': productId } : {}),
    ...(sku !== undefined ? { sku } : {}),
    image: ['https://www.koneko-breeder.com/breeder/data/c995680/child_img_1_hash.jpg.webp', 'https://www.koneko-breeder.com/breeder/data/c995680/child_img_2_hash.jpg.webp'],
    offers,
  };
  return product;
}

function jsonLdScript(value, attributes = 'type="application/ld+json"') {
  return `<script ${attributes}>${JSON.stringify(value)}</script>`;
}

function foreignIdentityMarkup(tag, content) {
  const wrapper = tag === 'svg' ? 'g' : 'mrow';
  return `<${tag}><${wrapper}><${tag}>${content}</${tag}></${wrapper}></${tag}>`;
}

function fuluckDetail(locale = 'ja', options = {}) {
  const breederId = options.breederId ?? FULUCK_BREEDER_ID;
  const canonical = Object.hasOwn(options, 'canonical') ? options.canonical : fuluckPageUrl(locale, breederId);
  const product = fuluckProduct(locale, options);
  const text = locale === 'ja' ? ['サイベリアン', 'シルバータビー&ホワイト（トリプルコート）', '♂', '短い紹介', '一段落', '二段落']
    : locale === 'en' ? ['Siberian', 'Silver tabby & white', 'Male', 'Short note', 'First paragraph', 'Second paragraph']
      : ['Siberian', '银色虎斑白色', 'Male', '', '', ''];
  const canonicalMarkup = Object.hasOwn(options, 'canonicalMarkup')
    ? options.canonicalMarkup
    : canonical === undefined || canonical === null ? '' : `<link rel="canonical" href="${canonical}">`;
  const schemaMarkup = Object.hasOwn(options, 'schemaMarkup') ? options.schemaMarkup : jsonLdScript(product);
  return `<html lang="${locale}"><head>${canonicalMarkup}${schemaMarkup}</head><body>
    <table class="kitten-detail-table"><tr><th>品種</th><td>${text[0]}</td></tr><tr><th>毛色</th><td>${text[1]}</td></tr><tr><th>性別</th><td>${text[2]}</td></tr><tr><th>誕生日</th><td data-i18n-birthday="2026-05-09">Born 2026/5</td></tr><tr><th>備考</th><td>${text[3]}</td></tr></table>
    <section class="kitten-detail-introduction"><h2>Introduction</h2><p>${text[4]}</p><p>${text[5]}</p></section>
    <div class="kitten-detail-parents"><p><span>パパ猫</span>: <a>父猫</a></p><p><span>ママ猫</span>: <a>母猫</a></p></div><iframe src="https://www.youtube.com/embed/AbCdEfGhI12"></iframe>
  </body></html>`;
}

test('parses Fuluck JA, EN, and ZH pages with ordered images, identity, locale, and blank translations preserved', () => {
  const ja = parseFuluckDetailPage(fuluckDetail('ja'), { expectedBreederId: '2608-00001', locale: 'ja', pageUrl: fuluckPageUrl('ja') });
  assert.deepEqual(ja, {
    breederId: '2608-00001', locale: 'ja', breed: 'サイベリアン', color: 'シルバータビー&ホワイト（トリプルコート）', gender: '♂', price: 230000, birthday: '2026-05-09',
    photos: ['https://www.koneko-breeder.com/breeder/data/c995680/child_img_1_hash.jpg.webp', 'https://www.koneko-breeder.com/breeder/data/c995680/child_img_2_hash.jpg.webp'], videoId: 'AbCdEfGhI12', papa: '父猫', mama: '母猫', note: '短い紹介', description: '一段落\n\n二段落', detailUrl: 'https://fuluckpet.com/kittens/2608-00001.html',
  });
  assert.deepEqual(parseFuluckDetailPage(fuluckDetail('en'), { expectedBreederId: '2608-00001', locale: 'en', pageUrl: fuluckPageUrl('en') }), {
    breederId: '2608-00001', locale: 'en', breed: 'Siberian', color: 'Silver tabby & white', gender: '♂', price: 230000, birthday: '2026-05-09',
    photos: ['https://www.koneko-breeder.com/breeder/data/c995680/child_img_1_hash.jpg.webp', 'https://www.koneko-breeder.com/breeder/data/c995680/child_img_2_hash.jpg.webp'], videoId: 'AbCdEfGhI12', papa: '父猫', mama: '母猫', note: 'Short note', description: 'First paragraph\n\nSecond paragraph', detailUrl: 'https://fuluckpet.com/en/kittens/2608-00001.html',
  });
  const zh = parseFuluckDetailPage(fuluckDetail('zh'), { expectedBreederId: '2608-00001', locale: 'zh', pageUrl: fuluckPageUrl('zh') });
  assert.deepEqual(zh, {
    breederId: '2608-00001', locale: 'zh', breed: 'Siberian', color: '银色虎斑白色', gender: '♂', price: 230000, birthday: '2026-05-09',
    photos: ['https://www.koneko-breeder.com/breeder/data/c995680/child_img_1_hash.jpg.webp', 'https://www.koneko-breeder.com/breeder/data/c995680/child_img_2_hash.jpg.webp'], videoId: 'AbCdEfGhI12', papa: '父猫', mama: '母猫', note: '', description: '', detailUrl: 'https://fuluckpet.com/zh/kittens/2608-00001.html',
  });
});

test('accepts no-SKU Fuluck Products only with the exact generated JA/EN/ZH bindings', () => {
  for (const [locale, pageUrl] of [
    ['ja', 'https://fuluckpet.com/kittens/2608-00001.html'],
    ['en', 'https://fuluckpet.com/en/kittens/2608-00001.html'],
    ['zh', 'https://fuluckpet.com/zh/kittens/2608-00001.html'],
  ]) {
    const page = parseFuluckDetailPage(fuluckDetail(locale, { sku: undefined }), {
      expectedBreederId: '2608-00001', locale, pageUrl,
    });
    assert.deepEqual(
      { breederId: page.breederId, locale: page.locale, detailUrl: page.detailUrl },
      { breederId: '2608-00001', locale, detailUrl: pageUrl },
      locale,
    );
  }
});

test('rejects no-SKU Fuluck identity evidence after plaintext despite an apparent closing tag', () => {
  const pageUrl = 'https://fuluckpet.com/en/kittens/2608-00001.html';
  const options = { expectedBreederId: '2608-00001', locale: 'en', pageUrl };
  const product = fuluckProduct('en', { sku: undefined });
  const expectedLink = `<link rel="canonical" href="${pageUrl}">`;
  const plaintext = '<plaintext></plaintext>';
  const cases = [
    ['canonical link only', { canonicalMarkup: `${jsonLdScript(product)}${plaintext}${expectedLink}`, schemaMarkup: '' }],
    ['Product JSON-LD only', { canonicalMarkup: expectedLink, schemaMarkup: `${plaintext}${jsonLdScript(product)}` }],
    ['canonical link and Product JSON-LD', { canonicalMarkup: `${plaintext}${expectedLink}${jsonLdScript(product)}`, schemaMarkup: '' }],
  ];

  for (const [name, fixture] of cases) {
    assert.throws(
      () => parseFuluckDetailPage(fuluckDetail('en', { sku: undefined, ...fixture }), options),
      /SKU|breeder|identity|Product/i,
      name,
    );
  }
});

test('ignores SVG and MathML pseudo-elements while retaining outer no-SKU Fuluck identity evidence', () => {
  const pageUrl = 'https://fuluckpet.com/en/kittens/2608-00001.html';
  const options = { expectedBreederId: '2608-00001', locale: 'en', pageUrl };
  const product = fuluckProduct('en', { sku: undefined });
  const conflictingProduct = { ...product, '@id': fuluckProductId('2608-00002') };
  const expectedLink = `<link rel="canonical" href="${pageUrl}">`;

  for (const tag of ['svg', 'math']) {
    const cases = [
      ['canonical link only', { canonicalMarkup: foreignIdentityMarkup(tag, expectedLink), schemaMarkup: jsonLdScript(product) }],
      ['Product JSON-LD only', { canonicalMarkup: expectedLink, schemaMarkup: foreignIdentityMarkup(tag, jsonLdScript(product)) }],
      ['canonical link and Product JSON-LD', { canonicalMarkup: foreignIdentityMarkup(tag, `${expectedLink}${jsonLdScript(product)}`), schemaMarkup: '' }],
    ];

    for (const [name, fixture] of cases) {
      assert.throws(
        () => parseFuluckDetailPage(fuluckDetail('en', { sku: undefined, ...fixture }), options),
        /SKU|breeder|identity|Product/i,
        `${tag} ${name}`,
      );
    }

    const parsed = parseFuluckDetailPage(fuluckDetail('en', {
      sku: undefined,
      canonicalMarkup: `${expectedLink}${foreignIdentityMarkup(tag, '<link rel="canonical" href="https://fuluckpet.com/en/kittens/2608-00002.html">')}`,
      schemaMarkup: `${foreignIdentityMarkup(tag, jsonLdScript(conflictingProduct))}${jsonLdScript(product)}`,
    }), options);
    assert.equal(parsed.detailUrl, pageUrl, `${tag} outer evidence`);
  }
});

test('requires exactly one genuine canonical link for no-SKU Fuluck identity', () => {
  const pageUrl = 'https://fuluckpet.com/en/kittens/2608-00001.html';
  const options = { expectedBreederId: '2608-00001', locale: 'en', pageUrl };
  const product = fuluckProduct('en', { sku: undefined });
  const expectedLink = `<link rel="canonical" href="${pageUrl}">`;
  const cases = [
    ['data-rel and data-href lookalike', `<link data-rel="canonical" data-href="${pageUrl}">`],
    ['data-rel lookalike', `<link data-rel="canonical" href="${pageUrl}">`],
    ['data-href lookalike', `<link rel="canonical" data-href="${pageUrl}">`],
    ['link custom-element lookalike', `<link-x rel="canonical" href="${pageUrl}">`],
    ['comment lookalike', `<!-- ${expectedLink} -->`],
    ['template lookalike', `<template>${expectedLink}</template>`],
    ['script lookalike', `<script>const evidence = ${JSON.stringify(expectedLink)};</script>`],
    ['title lookalike', `<title>${expectedLink}</title>`],
    ['duplicate matching canonical links', `${expectedLink}${expectedLink}`],
    ['conflicting second canonical link', `${expectedLink}<link rel="canonical" href="https://fuluckpet.com/en/kittens/2608-00002.html">`],
    ['mixed-order conflicting canonical link', `<link href="https://fuluckpet.com/en/kittens/2608-00002.html" rel="canonical">${expectedLink}`],
    ['valid plus alternate canonical link', `${expectedLink}<link rel="alternate canonical" href="https://fuluckpet.com/en/kittens/2608-00002.html">`],
    ['valid plus repeated canonical token link', `${expectedLink}<link rel="canonical canonical" href="https://fuluckpet.com/en/kittens/2608-00002.html">`],
  ];

  for (const [name, canonicalMarkup] of cases) {
    assert.throws(
      () => parseFuluckDetailPage(fuluckDetail('en', { sku: undefined, canonicalMarkup, schemaMarkup: jsonLdScript(product) }), options),
      /SKU|breeder|identity/i,
      name,
    );
  }

  const parsed = parseFuluckDetailPage(
    fuluckDetail('en', { sku: undefined, canonicalMarkup: `<link href="${pageUrl}" rel="canonical">`, schemaMarkup: jsonLdScript(product) }),
    options,
  );
  assert.equal(parsed.detailUrl, pageUrl);
});

test('requires one actual Fuluck Product and one owned typed Offer across the JSON-LD entity graph', () => {
  const pageUrl = 'https://fuluckpet.com/en/kittens/2608-00001.html';
  const options = { expectedBreederId: '2608-00001', locale: 'en', pageUrl };
  const product = fuluckProduct('en', { sku: undefined });
  const conflictingProduct = { ...product, '@id': fuluckProductId('2608-00002') };
  const conflictingOffer = { '@type': 'Offer', price: '230000', url: 'https://fuluckpet.com/en/kittens/2608-00002.html' };
  const untypedOfferProduct = { ...product, offers: { price: '230000', url: pageUrl } };
  const duplicateOfferProduct = { ...product, additionalOffer: conflictingOffer };
  const cases = [
    ['data-type pseudo-script', jsonLdScript(product, 'data-type="application/ld+json"')],
    ['script custom-element pseudo-script', `<script-x type="application/ld+json">${JSON.stringify(product)}</script-x>`],
    ['comment pseudo-script', `<!-- ${jsonLdScript(product)} -->`],
    ['template pseudo-script', `<template>${jsonLdScript(product)}</template>`],
    ['title pseudo-script', `<title>${jsonLdScript(product)}</title>`],
    ['conflicting Product in JSON-LD array', jsonLdScript([product, conflictingProduct])],
    ['conflicting Product in @graph', jsonLdScript({ '@graph': [product, conflictingProduct] })],
    ['conflicting Product in a second script', `${jsonLdScript(product)}${jsonLdScript(conflictingProduct)}`],
    ['standalone conflicting Offer in a second script', `${jsonLdScript(product)}${jsonLdScript(conflictingOffer)}`],
    ['duplicate nested typed Offer', jsonLdScript(duplicateOfferProduct)],
    ['untyped owned Offer', jsonLdScript(untypedOfferProduct)],
  ];

  for (const [name, schemaMarkup] of cases) {
    assert.throws(
      () => parseFuluckDetailPage(fuluckDetail('en', { sku: undefined, schemaMarkup }), options),
      /SKU|breeder|identity|Product|Offer/i,
      name,
    );
  }

  for (const [name, schemaMarkup] of [
    ['single Product in an array', jsonLdScript([product])],
    ['single Product in @graph', jsonLdScript({ '@graph': [product] })],
    ['unrelated second JSON-LD script', `${jsonLdScript({ '@type': 'WebPage', name: 'Fuluck' })}${jsonLdScript(product)}`],
  ]) {
    const parsed = parseFuluckDetailPage(fuluckDetail('en', { sku: undefined, schemaMarkup }), options);
    assert.equal(parsed.breederId, '2608-00001', name);
  }
});

test('fails closed for no-SKU Fuluck identity URL confusion', () => {
  const pageUrl = 'https://fuluckpet.com/en/kittens/2608-00001.html';
  const options = { expectedBreederId: '2608-00001', locale: 'en', pageUrl };
  const cases = [
    ['missing canonical', { canonical: undefined }],
    ['wrong locale canonical', { canonical: 'https://fuluckpet.com/kittens/2608-00001.html' }],
    ['wrong breeder canonical', { canonical: 'https://fuluckpet.com/en/kittens/2608-00002.html' }],
    ['credential canonical', { canonical: 'https://user@fuluckpet.com/en/kittens/2608-00001.html' }],
    ['query canonical', { canonical: 'https://fuluckpet.com/en/kittens/2608-00001.html?source=test' }],
    ['fragment canonical', { canonical: 'https://fuluckpet.com/en/kittens/2608-00001.html#product' }],
    ['encoded canonical path', { canonical: 'https://fuluckpet.com/en/kittens/%32%36%30%38-00001.html' }],
    ['missing Product id', { productId: undefined }],
    ['wrong breeder Product id', { productId: 'https://fuluckpet.com/kittens/2608-00002.html#product' }],
    ['credential Product id', { productId: 'https://user@fuluckpet.com/kittens/2608-00001.html#product' }],
    ['query Product id', { productId: 'https://fuluckpet.com/kittens/2608-00001.html?source=test#product' }],
    ['unexpected Product fragment', { productId: 'https://fuluckpet.com/kittens/2608-00001.html#other' }],
    ['encoded Product id path', { productId: 'https://fuluckpet.com/kittens/%32%36%30%38-00001.html#product' }],
    ['missing Offer', { offers: undefined }],
    ['missing Offer URL', { offerUrl: undefined }],
    ['array Offer', { offers: [{ '@type': 'Offer', price: '230000', url: pageUrl }] }],
    ['wrong locale Offer URL', { offerUrl: 'https://fuluckpet.com/kittens/2608-00001.html' }],
    ['wrong breeder Offer URL', { offerUrl: 'https://fuluckpet.com/en/kittens/2608-00002.html' }],
    ['credential Offer URL', { offerUrl: 'https://user@fuluckpet.com/en/kittens/2608-00001.html' }],
    ['query Offer URL', { offerUrl: 'https://fuluckpet.com/en/kittens/2608-00001.html?source=test' }],
    ['fragment Offer URL', { offerUrl: 'https://fuluckpet.com/en/kittens/2608-00001.html#product' }],
    ['encoded Offer URL path', { offerUrl: 'https://fuluckpet.com/en/kittens/%32%36%30%38-00001.html' }],
    ['wrong page URL', {}, { pageUrl: 'https://fuluckpet.com/en/kittens/2608-00002.html' }],
    ['query page URL', {}, { pageUrl: 'https://fuluckpet.com/en/kittens/2608-00001.html?source=test' }],
  ];
  for (const [name, fixture, optionOverrides = {}] of cases) {
    assert.throws(
      () => parseFuluckDetailPage(fuluckDetail('en', { sku: undefined, ...fixture }), { ...options, ...optionOverrides }),
      /SKU|breeder|identity/i,
      name,
    );
  }
});

test('requires an exact present Fuluck Product SKU even when every URL binding matches', () => {
  const options = { expectedBreederId: '2608-00001', locale: 'ja', pageUrl: 'https://fuluckpet.com/kittens/2608-00001.html' };
  assert.throws(() => parseFuluckDetailPage(fuluckDetail('ja', { sku: '' }), options), /SKU|breeder/i);
  assert.throws(() => parseFuluckDetailPage(fuluckDetail('ja', { sku: '2608-00002' }), options), /SKU|breeder/i);
});

test('normalizes HTML entities and line breaks without executing markup', () => {
  assert.equal(decodeHtmlText(' A&nbsp;&amp; B<br> C <p>D</p>', { preserveBreaks: true }), 'A & B\nC\n\nD');
  assert.equal(decodeHtmlText('<script>bad()</script>A\r\n B', { preserveBreaks: false }), 'A B');
});

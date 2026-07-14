'use strict';

const fs = require('node:fs');
const { safeJsonForHtmlScript } = require('./safe-json-for-html');

const SCHEMA_START = '<!-- BEGIN GENERATED CAT CARE SCHEMA -->';
const SCHEMA_END = '<!-- END GENERATED CAT CARE SCHEMA -->';
const MENU_START = '<!-- BEGIN GENERATED CAT CARE MENU -->';
const MENU_END = '<!-- END GENERATED CAT CARE MENU -->';

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function yen(value) {
  return `¥${Number(value).toLocaleString('ja-JP')}`;
}

function plainYen(value) {
  return `${Number(value).toLocaleString('ja-JP')}円`;
}

function assertCatCatalog(cat) {
  if (!cat || !Array.isArray(cat.packages) || !Array.isArray(cat.items) || !cat.discounts) {
    throw new Error('cat care catalog is unavailable');
  }
  for (const entry of cat.packages) {
    if (!entry || typeof entry.id !== 'string' || typeof entry.label !== 'string' ||
        !Number.isSafeInteger(entry.price) || entry.price <= 0 || !Array.isArray(entry.includedItemIds)) {
      throw new Error('cat care package is invalid');
    }
  }
  for (const entry of cat.items) {
    if (!entry || typeof entry.id !== 'string' || typeof entry.label !== 'string' ||
        typeof entry.unit !== 'string' || typeof entry.quoteOnly !== 'boolean' ||
        (!entry.quoteOnly && (!Number.isSafeInteger(entry.price) || entry.price <= 0))) {
      throw new Error('cat care item is invalid');
    }
  }
  if (!(typeof cat.discounts.graduatedCat === 'number' && cat.discounts.graduatedCat > 0 && cat.discounts.graduatedCat < 1)) {
    throw new Error('cat care graduate discount is invalid');
  }
}

function schemaOffer(name, price) {
  return {
    '@type': 'Offer',
    name,
    price: String(price),
    priceCurrency: 'JPY',
  };
}

function displayItemLabel(item) {
  return item.unit && item.unit !== '1回' ? `${item.label}（${item.unit}）` : item.label;
}

function renderCatCareSchema(cat) {
  assertCatCatalog(cat);
  const offers = cat.packages.map((entry) => schemaOffer(entry.label, entry.price));
  for (const item of cat.items) {
    if (item.quoteOnly || !Number.isSafeInteger(item.price) || item.price <= 0) continue;
    offers.push(schemaOffer(displayItemLabel(item), item.price));
  }
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: '猫のシャンプー・基本ケア',
    url: 'https://fuluckpet.com/grooming/',
    provider: { '@type': 'LocalBusiness', name: '福楽ペット', legalName: '福楽株式会社' },
    offers,
  };
  return `<script type="application/ld+json">\n${safeJsonForHtmlScript(schema, 2)}\n</script>`;
}

function roundedDiscountPrice(price, rate) {
  return Math.round((price * rate) / 100) * 100;
}

function renderPackageCard(pkg, index) {
  const description = index === 0
    ? 'シャンプー・爪切り・耳掃除・肛門腺絞りを、安全に実施できる範囲で含みます。'
    : '長毛猫の被毛を、毛量と状態に合わせて丁寧にケアします。基本ケアを含みます。';
  return `<article class="service-price-card"><p class="service-price-label">${escapeHtml(pkg.label)}</p>` +
    `<p class="service-price">${yen(pkg.price)}</p><p class="service-price-note">${description}</p></article>`;
}

function renderGraduateCard(cat) {
  const rate = cat.discounts.graduatedCat;
  const discountPercent = Math.round((1 - rate) * 100);
  const examples = cat.packages.map((pkg) => `${escapeHtml(pkg.label)} ${yen(roundedDiscountPrice(pkg.price, rate))}`).join(' ／ ');
  return '<article class="service-price-card is-primary"><p class="service-price-label">福楽卒業猫</p>' +
    `<p class="service-price">${discountPercent}%OFF</p><p class="service-price-note">${examples}。` +
    'ほかの割引とは重複せず、最も割引率の高い1つを適用します。時間制の追加ケアは割引対象外です。</p></article>';
}

function renderItemRow(item) {
  const price = item.quoteOnly ? '要相談' : yen(item.price);
  const unit = item.unit || '事前相談';
  return `<tr><th scope="row">${escapeHtml(item.label)}</th><td>${price}</td><td>${escapeHtml(unit)}</td></tr>`;
}

function renderCatCareMenu(cat) {
  assertCatCatalog(cat);
  const cards = cat.packages.map(renderPackageCard).concat(renderGraduateCard(cat)).join('');
  const rows = cat.items.map(renderItemRow).join('');
  return '<section class="service-section is-white"><div class="service-wrap">' +
    '<div class="service-heading"><p class="service-eyebrow">Menu</p><h2>基本料金と、福楽卒業猫の特典。</h2>' +
    '<p>まずはシャンプーを含む基本コースをお選びください。必要な部分ケアだけのご相談も承ります。</p></div>' +
    `<div class="service-price-grid">${cards}</div>` +
    '<details class="service-care-details"><summary>部分ケアの料金を見る</summary>' +
    '<div class="service-table-wrap"><table class="service-table"><thead><tr><th scope="col">ケア内容</th>' +
    `<th scope="col">税込料金</th><th scope="col">単位</th></tr></thead><tbody>${rows}</tbody></table></div>` +
    '<p class="service-price-note">肛門腺絞りは猫の状態を確認し、安全に実施できる場合のみ対応します。毛玉が重い場合は事前見積りです。</p>' +
    '</details><p class="service-note">毛玉、皮膚、体調、強いストレスが見られる場合は、安全を優先して内容変更・中止・動物病院への相談をご案内することがあります。</p>' +
    '</div></section>';
}

function markerIndex(source, marker) {
  const first = source.indexOf(marker);
  if (first === -1 || source.indexOf(marker, first + marker.length) !== -1) {
    throw new Error(`generated cat care marker must appear exactly once: ${marker}`);
  }
  return first;
}

function markerLayout(source) {
  const schemaStart = markerIndex(source, SCHEMA_START);
  const schemaEnd = markerIndex(source, SCHEMA_END);
  const menuStart = markerIndex(source, MENU_START);
  const menuEnd = markerIndex(source, MENU_END);
  if (!(schemaStart < schemaEnd && schemaEnd < menuStart && menuStart < menuEnd)) {
    throw new Error('generated cat care markers are out of order or overlap');
  }
  return { schemaStart, schemaEnd, menuStart, menuEnd };
}

function replaceGeneratedBlock(source, start, end, content) {
  const startAt = source.indexOf(start);
  const endAt = source.indexOf(end, startAt + start.length);
  return source.slice(0, startAt + start.length) + `\n${content}\n` + source.slice(endAt);
}

function buildGroomingPage(source, cat) {
  if (typeof source !== 'string') throw new Error('grooming page source is required');
  markerLayout(source);
  const withSchema = replaceGeneratedBlock(source, SCHEMA_START, SCHEMA_END, renderCatCareSchema(cat));
  markerLayout(withSchema);
  const complete = replaceGeneratedBlock(withSchema, MENU_START, MENU_END, renderCatCareMenu(cat));
  markerLayout(complete);
  return complete;
}

function writeGroomingPage(file, cat) {
  const source = fs.readFileSync(file, 'utf8');
  const rendered = buildGroomingPage(source, cat);
  if (rendered !== source) fs.writeFileSync(file, rendered, 'utf8');
  return rendered !== source;
}

function isGroomingPageFresh(source, cat) {
  try {
    return buildGroomingPage(source, cat) === source;
  } catch (_) {
    return false;
  }
}

function sizePriceList(priceBySize) {
  return ['small', 'medium', 'large'].map((size) => plainYen(priceBySize[size])).join('／');
}

function formatCareKnowledge(config) {
  if (!config || !config.careCatalog || !config.careCatalog.cat || !config.careCatalog.dog) {
    throw new Error('care catalog config is unavailable');
  }
  const cat = config.careCatalog.cat;
  const dog = config.careCatalog.dog;
  assertCatCatalog(cat);
  const packageText = cat.packages.map((entry) => `${entry.label} ${plainYen(entry.price)}`).join('、');
  const itemText = cat.items.map((entry) => {
    const price = entry.quoteOnly ? '要相談' : plainYen(entry.price);
    return `${entry.label} ${price}${entry.unit && entry.unit !== '1回' ? `／${entry.unit}` : ''}`;
  }).join('、');
  const dogItems = dog.items.map((entry) => `${entry.label} ${sizePriceList(entry.priceBySize)}`).join('、');
  const dogBundles = dog.bundles.map((entry) => `${entry.label} ${sizePriceList(entry.priceBySize)}`).join('、');
  return '福楽ペットは第一種動物取扱業の保管220012Bに基づき、完全予約制で猫と登録対象小動物を預かる。' +
    '対象は猫、うさぎ、ハムスター、マウス、ラット、モルモット、デグー、チンチラ、フクロモモンガ、ヤマネ、ヘビ。種類と健康状態は予約前に個別確認する。' +
    `猫は1泊${plainYen(config.boardingBasePrice.cat)}。猫のシャンプー・基本ケアは${packageText}。部分ケアは${itemText}。` +
    `犬のケアは予定価格として、単項目が体型別に${dogItems}、セットが${dogBundles}で、現在受付停止。犬のお預かりも現在受付停止。` +
    '日程加算・長期料金・割引を含む概算は https://fuluckpet.com/boarding/ と https://fuluckpet.com/boarding/estimate.html 、猫の基本ケアは https://fuluckpet.com/grooming/ を確認し、正式料金はLINE相談後に確定する。';
}

module.exports = {
  SCHEMA_START,
  SCHEMA_END,
  MENU_START,
  MENU_END,
  renderCatCareSchema,
  renderCatCareMenu,
  buildGroomingPage,
  writeGroomingPage,
  isGroomingPageFresh,
  formatCareKnowledge,
};

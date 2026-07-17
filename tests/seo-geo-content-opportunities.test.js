'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const COST_ARTICLE_PATH = 'blog/siberian-cost-breakdown.html';

const accepted = {
  title: 'サイベリアンの飼育費はいくら？初期費用・月額・年間費用｜福楽キャッテリー',
  description: 'サイベリアンの生体代を除く初期準備費は約2.4万〜6.75万円、月々の飼育費は約6,000〜13,500円。フード・猫砂・保険・健診などの内訳と年間目安を表で解説します。',
  answer: '生体代を除く初期準備費は約2.4万〜6.75万円、毎月は約6,000〜13,500円、年間は約8.8万〜20.7万円',
};

function read(relative) {
  return fs.readFileSync(path.join(ROOT, relative), 'utf8');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function decodeHtml(value) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');
}

function textContent(fragment) {
  return decodeHtml(fragment.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function tagText(html, tagName) {
  const match = html.match(new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i'));
  assert.ok(match, `missing <${tagName}>`);
  return textContent(match[1]);
}

function metaContent(html, attribute, value) {
  const tags = html.match(/<meta\b[^>]*>/gi) || [];
  for (const tag of tags) {
    const attributes = Object.fromEntries(
      [...tag.matchAll(/([:\w-]+)\s*=\s*["']([^"']*)["']/g)]
        .map((match) => [match[1].toLowerCase(), decodeHtml(match[2])]),
    );
    if (attributes[attribute] === value) return attributes.content;
  }
  assert.fail(`missing meta ${attribute}="${value}"`);
}

function schemas(html) {
  return [...html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
    .map((match) => JSON.parse(match[1]));
}

function parseYenRange(value) {
  const match = textContent(value).match(/(?:約)?([\d,]+)〜([\d,]+)円/);
  assert.ok(match, `expected a numeric yen range, got: ${textContent(value)}`);
  return match.slice(1).map((number) => Number(number.replaceAll(',', '')));
}

function parseCostTables(html) {
  const articleMatch = html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i);
  assert.ok(articleMatch, 'missing cost article body');
  const tables = [...articleMatch[1].matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)];
  assert.equal(tables.length, 3, 'the cost article must retain exactly three source tables');

  return tables.map((table, tableIndex) => {
    const rows = [...table[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)]
      .map((row) => [...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((cell) => cell[1]))
      .filter((cells) => cells.length > 0);
    const totals = rows.filter((cells) => /合計/.test(textContent(cells[0])));
    assert.equal(totals.length, 1, `table ${tableIndex + 1} must contain one total row`);
    const lineItems = rows.filter((cells) => !/合計/.test(textContent(cells[0])));
    assert.ok(lineItems.length > 0, `table ${tableIndex + 1} must contain line items`);
    const calculated = lineItems
      .map((cells) => parseYenRange(cells[1]))
      .reduce((sum, range) => [sum[0] + range[0], sum[1] + range[1]], [0, 0]);
    return { calculated, visibleTotal: parseYenRange(totals[0][1]) };
  });
}

function compactYen(number) {
  assert.equal(number % 100, 0, `cannot express ${number} as the accepted compact range`);
  return `${Number((number / 10000).toFixed(2))}万`;
}

function compactRange(range) {
  return `${compactYen(range[0])}〜${compactYen(range[1])}円`;
}

function fullRange(range) {
  return `${range[0].toLocaleString('en-US')}〜${range[1].toLocaleString('en-US')}円`;
}

function firstArticleParagraph(html) {
  const articleMatch = html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i);
  assert.ok(articleMatch, 'missing article body');
  return tagText(articleMatch[1], 'p');
}

function blogCard(html, href) {
  const match = html.match(new RegExp(`<a\\b(?=[^>]*href=["']${escapeRegExp(href)}["'])[^>]*>([\\s\\S]*?)<\\/a>`, 'i'));
  assert.ok(match, `missing blog card for ${href}`);
  return match[1];
}

test('runtime navigation exposes the localized Osaka adoption route', () => {
  const navApi = require('../nav.js');
  const adoption = navApi.navGroups().find((group) => group.id === 'adoption');
  assert.ok(adoption, 'missing adoption navigation group');
  assert.deepEqual(
    adoption.items.find((item) => item.href === '/siberian-breeder-osaka.html'),
    {
      href: '/siberian-breeder-osaka.html',
      key: 'nav.osakaAdoption',
      icon: 'map-pin',
      localized: true,
      match: ['/siberian-breeder-osaka.html'],
    },
  );

  const i18n = read('i18n.js');
  const context = vm.createContext({
    document: { addEventListener() {} },
    window: {},
    console: { warn() {}, error() {}, log() {} },
  });
  vm.runInContext(`${i18n}\n;globalThis.__translations = translations;`, context, { filename: 'i18n.js' });
  for (const locale of ['ja', 'en', 'zh']) {
    assert.equal(typeof context.__translations[locale]['nav.osakaAdoption'], 'string');
    assert.ok(context.__translations[locale]['nav.osakaAdoption'].length > 0);
  }
});

test('cost table totals are calculated from line items and remain source-backed', () => {
  const tableFacts = parseCostTables(read(COST_ARTICLE_PATH));
  const expected = [[24000, 67500], [6000, 13500], [88000, 207000]];

  assert.deepEqual(tableFacts.map((table) => table.calculated), expected);
  for (const [index, table] of tableFacts.entries()) {
    assert.deepEqual(table.visibleTotal, table.calculated, `table ${index + 1} total drifted from its line items`);
  }
});

test('cost metadata, schema and first answer are derived from the three tables', () => {
  const article = read(COST_ARTICLE_PATH);
  const [initial, monthly, annual] = parseCostTables(article).map((table) => table.calculated);
  const description = metaContent(article, 'name', 'description');
  const ogDescription = metaContent(article, 'property', 'og:description');
  const blogPosting = schemas(article).find((schema) => schema['@type'] === 'BlogPosting');

  assert.equal(tagText(article, 'title'), accepted.title);
  assert.equal(tagText(article, 'h1'), accepted.title);
  assert.equal(description, accepted.description);
  assert.equal(ogDescription, accepted.description);
  assert.ok(blogPosting, 'missing BlogPosting JSON-LD');
  assert.equal(blogPosting.description, accepted.description);
  assert.match(firstArticleParagraph(article), new RegExp(escapeRegExp(accepted.answer)));

  const initialRange = compactRange(initial);
  const monthlyRange = fullRange(monthly);
  const annualRange = compactRange(annual);
  for (const summary of [description, ogDescription, blogPosting.description]) {
    assert.match(summary, new RegExp(escapeRegExp(initialRange)));
    assert.match(summary, new RegExp(escapeRegExp(monthlyRange)));
  }
  const firstAnswer = firstArticleParagraph(article);
  for (const range of [initialRange, monthlyRange, annualRange]) {
    assert.match(firstAnswer, new RegExp(escapeRegExp(range)));
  }
});

test('cost article publishes complete BlogPosting identity and current-price guidance', () => {
  const article = read(COST_ARTICLE_PATH);
  const blogPosting = schemas(article).find((schema) => schema['@type'] === 'BlogPosting');
  const ogImage = metaContent(article, 'property', 'og:image');

  assert.ok(blogPosting, 'missing BlogPosting JSON-LD');
  assert.equal(blogPosting.image, ogImage);
  assert.equal(blogPosting.inLanguage, 'ja');
  assert.doesNotMatch(article, /10万〜15万円|8,000〜15,000円|\*\*合計\*\*|\*\*月額合計\*\*|\*\*年間合計\*\*/);
  assert.doesNotMatch(article, /30,000円/);
  assert.match(article, /href=["']\/guide\/price\.html["']/);
  assert.match(article, /現在の価格をご確認/);
});

test('blog card and search record share the source-backed short title and description', () => {
  const route = '/blog/siberian-cost-breakdown.html';
  const shortTitle = accepted.title.replace(/｜福楽キャッテリー$/, '');
  const card = blogCard(read('blog.html'), route);
  const records = JSON.parse(read('blog-search-index.json')).filter((record) => record.u === route);
  const [initial, monthly] = parseCostTables(read(COST_ARTICLE_PATH)).map((table) => table.calculated);
  const cardDescription = tagText(card, 'p');

  assert.equal(tagText(card, 'h3'), shortTitle);
  assert.equal(cardDescription, accepted.description);
  assert.equal(records.length, 1, 'cost article must have one search-index record');
  assert.equal(records[0].t, shortTitle);
  assert.equal(records[0].d, accepted.description);
  for (const summary of [cardDescription, records[0].d]) {
    assert.match(summary, new RegExp(escapeRegExp(compactRange(initial))));
    assert.match(summary, new RegExp(escapeRegExp(fullRange(monthly))));
  }
});

test('related cost articles link back and English Osaka reviews use the stable threshold', () => {
  for (const relative of ['blog/siberian-price-guide.html', 'blog/cat-cost-monthly.html']) {
    assert.match(read(relative), /href=["']\/blog\/siberian-cost-breakdown\.html["']/);
  }

  const englishOsaka = read('en/siberian-breeder-osaka.html');
  assert.doesNotMatch(englishOsaka, /\b113\b/);
  assert.match(englishOsaka, /100\+ reviews/);
});

test('price guide titles and summaries stay timeless across source and derived surfaces', () => {
  const route = '/blog/siberian-price-guide.html';
  const article = read('blog/siberian-price-guide.html');
  const blogPosting = schemas(article).find((schema) => schema['@type'] === 'BlogPosting');
  const breadcrumb = schemas(article).find((schema) => schema['@type'] === 'BreadcrumbList');
  const card = blogCard(read('blog.html'), route);
  const searchRecords = JSON.parse(read('blog-search-index.json')).filter((record) => record.u === route);
  const listingContext = vm.createContext({ window: {} });
  vm.runInContext(read('blog-listing-i18n.js'), listingContext, { filename: 'blog-listing-i18n.js' });
  const listing = listingContext.window._blogListingI18n.articles['siberian-price-guide'];
  const translationPath = path.join(ROOT, 'tools/blog-translations/siberian-price-guide.json');

  const titleSurfaces = [
    tagText(article, 'title'),
    metaContent(article, 'property', 'og:title'),
    tagText(article, 'h1'),
    blogPosting.headline,
    breadcrumb.itemListElement.at(-1).name,
    tagText(card, 'h3'),
    ...searchRecords.map((record) => record.t),
    listing.en.title,
    listing.zh.title,
  ];
  for (const title of titleSurfaces) assert.doesNotMatch(title, /2025/, title);

  const cardTitle = 'サイベリアンの値段・価格ガイド';
  assert.equal(tagText(card, 'h3'), cardTitle);
  assert.equal(searchRecords.length, 1, 'price guide has one search record');
  assert.equal(searchRecords[0].t, blogPosting.headline);
  assert.equal(searchRecords[0].d, metaContent(article, 'name', 'description'));
  assert.equal(searchRecords[0].i, 'https://fuluckpet.com/images/siberian-group.webp');
  assert.match(tagText(card, 'p'), /各子猫ページで最新情報を確認/);

  const staleYearClaim = /2025年(?:最新|現在|の最新相場|日本西伯利亚猫)|(?:cost|price|prices)[^\n<]{0,50}(?:in|for) 2025/i;
  const unsupportedPriceRange = /(?:15\s*[〜～-]\s*50\s*万|150[,.]?000\s*[–—〜～-]\s*(?:¥\s*)?500[,.]?000)/i;
  for (const [surface, value] of [
    ['price article', article],
    ['blog card', textContent(card)],
    ['search record', searchRecords.map((record) => `${record.t}\n${record.d}`).join('\n')],
    ['listing i18n', JSON.stringify(listing)],
  ]) {
    assert.doesNotMatch(value, staleYearClaim, surface);
    assert.doesNotMatch(value, unsupportedPriceRange, surface);
  }

  assert.ok(fs.existsSync(translationPath), 'price-guide translation source exists');
  const translation = JSON.parse(fs.readFileSync(translationPath, 'utf8'));
  assert.equal(translation.slug, 'siberian-price-guide');
  assert.doesNotMatch(`${translation.en.title}\n${translation.en.content}\n${translation.zh.title}\n${translation.zh.content}`, staleYearClaim);
  assert.doesNotMatch(`${translation.en.content}\n${translation.zh.content}`, unsupportedPriceRange);
});

test('price guide uses a price-neutral verified photograph instead of the stale range graphic', () => {
  const article = read('blog/siberian-price-guide.html');
  const figure = article.match(/<figure\b[^>]*class=["'][^"']*blog-figure[^"']*["'][^>]*>([\s\S]*?)<\/figure>/i);
  assert.ok(figure, 'price guide figure exists');
  assert.match(figure[1], /src=["']\/images\/siberian-group\.webp["']/);
  assert.match(figure[1], /width=["']800["']/);
  assert.match(figure[1], /height=["']450["']/);
  assert.doesNotMatch(article, /siberian-price-guide_1200\.webp/);
  assert.equal(metaContent(article, 'property', 'og:image'), 'https://fuluckpet.com/images/siberian-group.webp');
});

test('Osaka support articles link readers to the primary Osaka landing page', () => {
  for (const relative of ['blog/siberian-osaka-guide.html', 'blog/kansai-breeder-guide.html']) {
    const article = read(relative).match(/<article\b[^>]*>([\s\S]*?)<\/article>/i);
    assert.ok(article, `${relative}: article body exists`);
    assert.match(article[1], /href=["']\/siberian-breeder-osaka\.html["']/, relative);
  }
});

test('changed SEO GEO articles publish an honest current dateModified', () => {
  for (const relative of [
    'blog/kansai-breeder-guide.html',
    'blog/siberian-osaka-guide.html',
    'blog/siberian-price-guide.html',
    'blog/siberian-weight-size.html',
    'blog/siberian-character.html',
    'blog/large-cat-breeds.html',
    'blog/siberian-vs-mainecoon.html',
    'blog/siberian-vs-norwegian.html',
    'blog/siberian-cat-characteristics.html',
    'en/blog/choose-healthy-kitten-checklist.html',
    'zh/blog/choose-healthy-kitten-checklist.html',
  ]) {
    const posting = schemas(read(relative)).find((entry) => entry['@type'] === 'BlogPosting');
    assert.ok(posting, `${relative}: BlogPosting exists`);
    assert.equal(posting.dateModified, '2026-07-18T00:00:00.000Z', relative);
  }
});

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const CFA_PROFILE = 'https://cfa.org/breed/siberian/';
const GUIDE = 'blog/siberian-weight-size.html';

const publicPages = [
  GUIDE,
  'blog/siberian-character.html',
  'blog/large-cat-breeds.html',
  'blog/siberian-vs-mainecoon.html',
  'blog/siberian-vs-norwegian.html',
  'siberian.html',
  'blog/siberian-cat-characteristics.html',
];

const translationFiles = [
  'tools/blog-translations/siberian-weight-size.json',
  'tools/blog-translations/siberian-character.json',
  'tools/blog-translations/large-cat-breeds.json',
  'tools/blog-translations/siberian-vs-mainecoon.json',
  'tools/blog-translations/siberian-vs-norwegian.json',
];
const translationManifest = 'tools/blog-translations-manifest.json';
const supportSources = ['llms-full.txt', 'tools/seed-kb.js'];

const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const embeddedTranslations = (relative) => {
  const match = read(relative).match(/window\._blogArticleI18n\s*=\s*([\s\S]*?);\s*<\/script>/);
  assert.ok(match, `${relative}: embedded translations exist`);
  return JSON.parse(match[1]);
};

const legacyRanges = [
  /6\s*[-–〜～]\s*10\s*(?:kg|公斤|キロ)/i,
  /4\s*[-–〜～]\s*7\s*(?:kg|公斤|キロ)/i,
];

test('Siberian public, translation, and support sources omit the legacy adult ranges', () => {
  const offenders = [];
  for (const relative of [...publicPages, ...translationFiles, translationManifest]) {
    const source = read(relative);
    for (const legacy of legacyRanges) {
      if (legacy.test(source)) offenders.push(`${relative}: ${legacy.source}`);
    }
  }
  for (const relative of supportSources) {
    const source = read(relative);
    for (const legacy of [
      ...legacyRanges,
      /5\s*[-–〜～]\s*8\s*kg/i,
      /3\.5\s*[-–〜～]\s*5\.5\s*kg/i,
    ]) {
      if (legacy.test(source)) offenders.push(`${relative}: ${legacy.source}`);
    }
  }

  assert.deepEqual(offenders, [], `legacy Siberian weight facts remain:\n${offenders.join('\n')}`);
});

test('the primary guide preserves its successful title and cites the current CFA ranges', () => {
  const guide = read(GUIDE);
  const description = 'サイベリアンの体重・サイズを月齢別に解説。オス・メスの成猫体重の目安、成長曲線、適正体重の管理方法まで。大阪の福楽キャッテリーが解説。';
  assert.match(guide, /<title>サイベリアンの体重・サイズガイド｜月齢別の成長目安｜大阪・福楽キャッテリー<\/title>/);
  assert.match(guide, /<h1>サイベリアンの体重・サイズガイド｜月齢別の成長目安<\/h1>/);
  assert.ok(guide.includes(`<meta name="description" content="${description}">`));
  assert.ok(guide.includes(`<meta property="og:description" content="${description}">`));
  const blogPosting = [...guide.matchAll(/<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .map((match) => JSON.parse(match[1]))
    .find((entry) => entry['@type'] === 'BlogPosting');
  assert.equal(blogPosting.description, description);
  assert.equal(blogPosting.dateModified, '2026-07-18T00:00:00.000Z');
  const searchRecord = JSON.parse(read('blog-search-index.json'))
    .find((entry) => entry.u === '/blog/siberian-weight-size.html');
  assert.equal(searchRecord.d, description);
  assert.match(read('blog.html'), new RegExp(description));
  assert.match(guide, new RegExp(`href=["']${CFA_PROFILE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`));
  assert.match(guide, /12\s*[-–〜～]\s*18\s*(?:lb|ポンド)/i);
  assert.match(guide, /8\s*[-–〜～]\s*12\s*(?:lb|ポンド)/i);
  assert.match(guide, /5\.4\s*[-–〜～]\s*8\.2\s*kg/i);
  assert.match(guide, /3\.6\s*[-–〜～]\s*5\.4\s*kg/i);
  assert.match(guide, /個体差/);
  assert.match(guide, /(?:ボディコンディションスコア|BCS)/);
  assert.match(guide, /獣医師/);
});

test('all translated weight articles embed exactly the reviewed translation sources', () => {
  for (const relative of translationFiles) {
    const translation = JSON.parse(read(relative));
    const embedded = embeddedTranslations(`blog/${translation.slug}.html`);
    assert.deepEqual(embedded.en, translation.en, `${relative}: EN source and embedded copy`);
    assert.deepEqual(embedded.zh, translation.zh, `${relative}: ZH source and embedded copy`);
  }
});

test('Japanese and localized weight facts stay attached to the correct breed and sex', () => {
  assert.match(read('blog/siberian-character.html'), /成猫のオスは5\.4〜8\.2kg、メスは3\.6〜5\.4kg程度/);
  assert.match(read('siberian.html'), /<span[^>]*>体重<\/span>\s*<span[^>]*>オス 約5\.4〜8\.2kg \/ メス 約3\.6〜5\.4kg<\/span>/);
  assert.match(read('blog/siberian-cat-characteristics.html'), /<li>体重：オス約5\.4〜8\.2kg、メス約3\.6〜5\.4kg<\/li>/);

  const character = JSON.parse(read('tools/blog-translations/siberian-character.json'));
  assert.match(character.en.content, /adult males typically weighing 5\.4-8\.2 kg and females 3\.6-5\.4 kg/);
  assert.match(character.zh.content, /成年公猫体重约5\.4-8\.2公斤，母猫约3\.6-5\.4公斤/);

  const characteristics = embeddedTranslations('blog/siberian-cat-characteristics.html');
  assert.match(characteristics.en.content, /<li>Weight: males about 5\.4–8\.2 kg, females about 3\.6–5\.4 kg<\/li>/);
  assert.match(characteristics.zh.content, /<li>体重：公猫约 5\.4〜8\.2kg，母猫约 3\.6〜5\.4kg<\/li>/);

  const guide = read(GUIDE);
  const adultSection = guide.match(/<h2>サイベリアンの成猫サイズ<\/h2>([\s\S]*?)<h2>月齢別の体重目安<\/h2>/);
  assert.ok(adultSection, 'Japanese adult-weight section exists');
  assert.match(adultSection[1], /<th>成猫体重の目安<\/th>/);
  assert.match(adultSection[1], /<tr><td>オス<\/td><td>約5\.4〜8\.2kg<\/td>/);
  assert.match(adultSection[1], /<tr><td>メス<\/td><td>約3\.6〜5\.4kg<\/td>/);

  const guideTranslation = JSON.parse(read('tools/blog-translations/siberian-weight-size.json'));
  assert.match(guideTranslation.en.content, /<tr><th>Sex<\/th><th>Adult Weight Range<\/th>/);
  assert.match(guideTranslation.en.content, /<tr><td>Male<\/td><td>Approx\. 5\.4–8\.2 kg<\/td>/);
  assert.match(guideTranslation.en.content, /<tr><td>Female<\/td><td>Approx\. 3\.6–5\.4 kg<\/td>/);
  assert.match(guideTranslation.zh.content, /<tr><th>性别<\/th><th>成猫体重参考范围<\/th>/);
  assert.match(guideTranslation.zh.content, /<tr><td>公猫<\/td><td>约5\.4～8\.2公斤<\/td>/);
  assert.match(guideTranslation.zh.content, /<tr><td>母猫<\/td><td>约3\.6～5\.4公斤<\/td>/);

  const maine = JSON.parse(read('tools/blog-translations/siberian-vs-mainecoon.json'));
  assert.match(maine.en.content, /<tr><td>Male Weight<\/td><td>5\.4-8\.2 kg<\/td><td>6-11 kg<\/td><\/tr>/);
  assert.match(maine.en.content, /<tr><td>Female Weight<\/td><td>3\.6-5\.4 kg<\/td><td>4-6\.5 kg<\/td><\/tr>/);
  assert.match(maine.zh.content, /<tr><td>公猫体重<\/td><td>5\.4-8\.2公斤<\/td><td>6-11公斤<\/td><\/tr>/);
  assert.match(maine.zh.content, /<tr><td>母猫体重<\/td><td>3\.6-5\.4公斤<\/td><td>4-6\.5公斤<\/td><\/tr>/);

  const norwegian = JSON.parse(read('tools/blog-translations/siberian-vs-norwegian.json'));
  assert.match(norwegian.en.content, /<tr><td>Male Weight<\/td><td>5\.4-8\.2 kg<\/td><td>5-9 kg<\/td><\/tr>/);
  assert.match(norwegian.en.content, /<tr><td>Female Weight<\/td><td>3\.6-5\.4 kg<\/td><td>3\.5-5\.5 kg<\/td><\/tr>/);
  assert.match(norwegian.zh.content, /<tr><td>公猫体重<\/td><td>5\.4-8\.2公斤<\/td><td>5-9公斤<\/td><\/tr>/);
  assert.match(norwegian.zh.content, /<tr><td>母猫体重<\/td><td>3\.6-5\.4公斤<\/td><td>3\.5-5\.5公斤<\/td><\/tr>/);

  const large = JSON.parse(read('tools/blog-translations/large-cat-breeds.json'));
  for (const contract of [
    [large.en.content, /<h3>1\. Siberian<\/h3>\s*<p>[^<]*Males weigh 5\.4-8\.2 kg/],
    [large.en.content, /<h3>2\. Maine Coon<\/h3>\s*<p>[^<]*Males weigh 6-11 kg/],
    [large.en.content, /<h3>3\. Ragdoll<\/h3>\s*<p>[^<]*Males weigh 7-9 kg/],
    [large.en.content, /<h3>4\. Norwegian Forest Cat<\/h3>\s*<p>[^<]*Males weigh 5-9 kg/],
    [large.en.content, /<h3>5\. British Shorthair<\/h3>\s*<p>[^<]*Males weigh 5-8 kg/],
    [large.zh.content, /<h3>1\. 西伯利亚猫<\/h3>\s*<p>[^<]*公猫体重5\.4-8\.2公斤/],
    [large.zh.content, /<h3>2\. 缅因猫<\/h3>\s*<p>[^<]*公猫体重6-11公斤/],
    [large.zh.content, /<h3>3\. 布偶猫<\/h3>\s*<p>[^<]*公猫体重7-9公斤/],
    [large.zh.content, /<h3>4\. 挪威森林猫<\/h3>\s*<p>[^<]*公猫体重5-9公斤/],
    [large.zh.content, /<h3>5\. 英国短毛猫<\/h3>\s*<p>[^<]*公猫体重5-8公斤/],
  ]) assert.match(contract[0], contract[1]);

  const manifest = JSON.parse(read(translationManifest)).find((entry) => entry.slug === 'siberian-weight-size');
  assert.ok(manifest, 'weight guide exists in translation manifest');
  assert.match(manifest.bodyHtml, /CFAの現行サイベリアン猫種プロファイル/);
  assert.match(manifest.bodyHtml, new RegExp(CFA_PROFILE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(manifest.bodyHtml, /ボディコンディションスコア（BCS）/);
  assert.match(manifest.bodyHtml, /獣医師に相談/);
  assert.match(manifest.bodyHtml, /<th>成猫体重の目安<\/th>/);
  assert.match(manifest.bodyHtml, /約5\.4〜8\.2kg/);
  assert.match(manifest.bodyHtml, /約3\.6〜5\.4kg/);

  for (const relative of supportSources) {
    const source = read(relative);
    assert.match(source, /オス約5\.4\s*[-–〜～]\s*8\.2kg、メス約3\.6\s*[-–〜～]\s*5\.4kg/, relative);
    assert.match(source, new RegExp(CFA_PROFILE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `${relative}: CFA URL`);
  }
});

test('comparison-breed ranges remain unchanged', () => {
  const maineCoon = read('blog/siberian-vs-mainecoon.html');
  assert.match(maineCoon, /<tr><td>オス体重<\/td><td>5\.4〜8\.2kg<\/td><td>6〜11kg<\/td><\/tr>/);
  assert.match(maineCoon, /<tr><td>メス体重<\/td><td>3\.6〜5\.4kg<\/td><td>4〜6\.5kg<\/td><\/tr>/);

  const norwegian = read('blog/siberian-vs-norwegian.html');
  assert.match(norwegian, /<tr><td>オス体重<\/td><td>5\.4〜8\.2kg<\/td><td>5〜9kg<\/td><\/tr>/);
  assert.match(norwegian, /<tr><td>メス体重<\/td><td>3\.6〜5\.4kg<\/td><td>3\.5〜5\.5kg<\/td><\/tr>/);

  const largeBreeds = read('blog/large-cat-breeds.html');
  for (const contract of [
    /<h3>1\. サイベリアン<\/h3>\s*<p>[^<]*オス5\.4〜8\.2kg/,
    /<h3>2\. メインクーン<\/h3>\s*<p>[^<]*オス6〜11kg以上/,
    /<h3>3\. ラグドール<\/h3>\s*<p>[^<]*オス7〜9kg/,
    /<h3>4\. ノルウェージャンフォレストキャット<\/h3>\s*<p>[^<]*オス5〜9kg/,
    /<h3>5\. ブリティッシュショートヘア<\/h3>\s*<p>[^<]*オス5〜8kg/,
  ]) assert.match(largeBreeds, contract);
});

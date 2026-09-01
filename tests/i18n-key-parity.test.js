'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.resolve(__dirname, '../i18n.js'), 'utf8');
const awardTimelineKeys = [
  'awards.timeline.title', 'awards.timeline.summary', 'awards.timeline.method', 'awards.timeline.category',
  'awards.timeline.scope.osaka', 'awards.timeline.scope.kansai', 'awards.timeline.scope.national',
  'awards.timeline.rank.1', 'awards.timeline.rank.2', 'awards.timeline.rank.3',
  'awards.timeline.2023.h1', 'awards.timeline.2023.h2', 'awards.timeline.2024.h1', 'awards.timeline.2024.h2',
  'awards.timeline.2025.h1', 'awards.timeline.2025.h2', 'awards.timeline.2026.h1',
];

function loadTranslations() {
  const context = vm.createContext({
    document: { addEventListener() {} },
    window: {},
    console: { warn() {}, error() {}, log() {} },
  });
  vm.runInContext(`${source}\n;globalThis.__translations = translations;`, context, {
    filename: 'i18n.js',
  });
  return JSON.parse(JSON.stringify(context.__translations));
}

test('Japanese, English, and Chinese dictionaries have exact key parity', () => {
  const translations = loadTranslations();
  const ja = Object.keys(translations.ja).sort();
  const en = Object.keys(translations.en).sort();
  const zh = Object.keys(translations.zh).sort();

  assert.deepEqual(en, ja, 'English keys drifted from the Japanese source dictionary');
  assert.deepEqual(zh, ja, 'Chinese keys drifted from the Japanese source dictionary');
  assert.ok(ja.length > 400, `unexpectedly small dictionary: ${ja.length} keys`);
});

test('award timeline translations load with copy and preserve the verified award boundary', () => {
  const translations = loadTranslations();
  for (const lang of ['ja', 'en', 'zh']) {
    for (const key of awardTimelineKeys) {
      assert.match(translations[lang][key], /\S/, `${lang}.${key} must not be blank`);
    }
  }
  assert.match(translations.ja['awards.timeline.summary'], /7期連続、公式プレート14件/);
  assert.match(translations.en['awards.timeline.summary'], /Fourteen official plates across seven consecutive half-year periods/);
  assert.match(translations.zh['awards.timeline.summary'], /连续 7 个半年度获得 14 枚官方奖牌/);
});

test('English and Chinese review-count translations never restore the stale exact 113 count', () => {
  const translations = loadTranslations();
  const reviewCountKeys = ['obi.reviews', 'voice.total', 'trust.rating'];
  for (const lang of ['en', 'zh']) {
    for (const key of reviewCountKeys) {
      assert.doesNotMatch(translations[lang][key], /113/i, `${lang}.${key}`);
    }
  }
  assert.equal(translations.en['voice.total'], '/ 100+ Reviews');
  assert.equal(translations.zh['voice.total'], '/ 100条以上评价');
});

test('home allergy FAQ does not promise an unsupported trial period', () => {
  const translations = loadTranslations();
  assert.doesNotMatch(translations.ja['faq.a1'], /トライアル/);
  assert.doesNotMatch(translations.en['faq.a1'], /trial period/i);
  assert.doesNotMatch(translations.zh['faq.a1'], /试养|試養/);
  for (const lang of ['ja', 'en', 'zh']) {
    assert.equal(
      translations[lang]['faq.a1'],
      translations[lang]['faqPage.a.faq_1'],
      `${lang} home FAQ must stay aligned with the reviewed FAQ answer`,
    );
  }
});

test('public diary and consultation labels use concise natural language', () => {
  const translations = loadTranslations();
  assert.equal(translations.ja['nav.diary'], '猫舎日記');
  assert.equal(translations.en['nav.diary'], 'Cattery Journal');
  assert.equal(translations.zh['nav.diary'], '猫舍日常');
  assert.equal(translations.ja['nav.group.adoption'], 'ご相談・予約');
  assert.equal(translations.en['nav.group.adoption'], 'Plan & Book');
  assert.equal(translations.zh['nav.group.adoption'], '咨询与预约');
});

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.resolve(__dirname, '../i18n.js'), 'utf8');

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

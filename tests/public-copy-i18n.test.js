'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function runtime() {
  const context = {document: {addEventListener() {}}, window: {}};
  vm.runInNewContext(fs.readFileSync(require.resolve('../i18n.js'), 'utf8'), context);
  return context;
}
test('display-only age localization preserves numbers and unknown owner values', () => {
  const {translateSupplementalText: translate} = runtime();
  for (const [raw, en, zh] of [['3歳', '3 years old', '3岁'], ['1歳6ヶ月', '1 year 6 months old', '1岁6个月'], ['6ヶ月', '6 months old', '6个月']]) {
    assert.equal(translate(raw, 'en'), en);
    assert.equal(translate(raw, 'zh'), zh);
    assert.equal(translate(raw, 'ja'), raw);
  }
  for (const raw of ['age pending', '不明', '<img src=x>', '¥270,000', '2608-52935']) assert.equal(translate(raw, 'en'), raw);
});
test('supplemental text can switch EN to ZH and back without losing the Japanese source', () => {
  const context = runtime();
  const text = {nodeType: 3, textContent: '  見学予約・ご相談  '};
  const el = {tagName: 'SPAN', childNodes: [text], closest: () => null};
  context.document.querySelectorAll = selector => selector === 'body *' ? [el] : [];
  context.localizeSupplementalContent('en');
  assert.equal(text.textContent.trim(), 'Visits & inquiries');
  context.localizeSupplementalContent('zh');
  assert.equal(text.textContent.trim(), '预约参观与咨询');
  context.localizeSupplementalContent('ja');
  assert.equal(text.textContent, '  見学予約・ご相談  ');
  text.textContent = 'replacement from API';
  context.localizeSupplementalContent('en');
  assert.equal(text.textContent, 'replacement from API', 'do not resurrect a stale value after a live DOM update');
});

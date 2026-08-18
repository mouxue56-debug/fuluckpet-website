'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { noteFor } = require('../tools/generate-site.js');

// 此测试守护 generate-site.js 注释记录的「去勢済み 曾漏到三语页面」回归。
const fullNotes = { note: '和文の説明', noteEn: 'English note', noteZh: '中文说明' };

const cases = [
  ['returns English note for en', fullNotes, 'en', 'English note'],
  ['returns Chinese note for zh', fullNotes, 'zh', '中文说明'],
  ['returns Japanese note for ja', fullNotes, 'ja', '和文の説明'],
  ['does not fall back to Japanese when English note is missing', { note: '和文の説明' }, 'en', ''],
  ['does not fall back to Japanese when Chinese note is missing', { note: '和文の説明' }, 'zh', ''],
  ['returns Japanese note when Japanese note exists', { note: '和文の説明' }, 'ja', '和文の説明'],
  ['does not fall back when English note is an empty string', { note: '和文', noteEn: '' }, 'en', ''],
  ['returns empty string for null kitten', null, 'en', ''],
  ['returns empty string for undefined kitten', undefined, 'ja', ''],
  ['returns empty string for non-string localized note', { noteEn: 123 }, 'en', ''],
  ['returns empty string for missing Japanese note', {}, 'ja', ''],
];

for (const [name, kitten, lang, expected] of cases) {
  test(name, () => {
    assert.equal(noteFor(kitten, lang), expected);
  });
}

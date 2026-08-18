'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.resolve(__dirname, '../catalog-i18n.js'), 'utf8');
const context = vm.createContext({ window: {} });
vm.runInContext(source, context, { filename: 'catalog-i18n.js' });
const catalog = JSON.parse(JSON.stringify(context.window.FULUCK_CATALOG_I18N));

const expected = {
  'チョコレートゴールデン': { en: 'Chocolate Golden', zh: '巧克力金渐层' },
  'シルバー': { en: 'Silver', zh: '银色' },
  'ブラウンタビー': { en: 'Brown Tabby', zh: '棕虎斑' },
  'タビー': { en: 'Tabby', zh: '虎斑' },
  'ブルー': { en: 'Blue', zh: '蓝色' },
  'シルバータビー＆ホワイト': { en: 'Silver Tabby & White', zh: '银虎斑加白' },
  'シルバー＆ホワイト': { en: 'Silver & White', zh: '银色加白' },
  'シールリンクスポイント': { en: 'Seal Lynx Point', zh: '海豹山猫重点色' },
  'ブルーリンクスポイント': { en: 'Blue Lynx Point', zh: '蓝色山猫重点色' },
  'ブルーリンクスポイント(ネヴァマスカレード)': { en: 'Blue Lynx Point (Neva Masquerade)', zh: '蓝色山猫重点色（涅瓦假面）' },
  'クリームリンクスポイント': { en: 'Cream Lynx Point', zh: '奶油山猫重点色' },
  'ゴールデンポイント': { en: 'Golden Point', zh: '金渐层重点色' },
  'シールポイントバイカラー': { en: 'Seal Point Bicolor', zh: '海豹双色' },
  'ダイリュートキャリコ': { en: 'Dilute Calico', zh: '淡三花' },
};

test('parent color labels are present in generated catalogue i18n', () => {
  for (const [raw, labels] of Object.entries(expected)) {
    assert.equal(catalog.colors.en[raw], labels.en, `${raw}: English`);
    assert.equal(catalog.colors.zh[raw], labels.zh, `${raw}: Chinese`);
  }
});

test('authorized parent color labels keep exact approved spellings', () => {
  assert.equal(catalog.colors.en['ダイリュートキャリコ'], 'Dilute Calico');
  assert.equal(catalog.colors.zh['ダイリュートキャリコ'], '淡三花');
  assert.equal(catalog.colors.zh['ゴールデンポイント'], '金渐层重点色');
  assert.equal(catalog.colors.zh['シールポイントバイカラー'], '海豹双色');
});

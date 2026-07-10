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

test('current live color variants have English and Chinese catalogue labels', () => {
  const expected = {
    'ブルーパッチドタビー&ホワイト': ['Blue Patched Tabby & White', '蓝玳瑁虎斑加白'],
    'ブルーパッチドタビー&ホワイト（トリプルコート）': ['Blue Patched Tabby & White (Triple Coat)', '蓝玳瑁虎斑加白（三层被毛）'],
    'レッドリンクスポイント（トリプルコート）': ['Red Lynx Point (Triple Coat)', '红色山猫重点色（三层被毛）'],
  };
  for (const [raw, [en, zh]] of Object.entries(expected)) {
    assert.equal(catalog.colors.en[raw], en, `${raw}: English`);
    assert.equal(catalog.colors.zh[raw], zh, `${raw}: Chinese`);
  }
});

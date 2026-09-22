'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

function clickAnchor({ skip = false, href = '#main', targetExists = true } = {}) {
  const listeners = new Map();
  const anchor = {
    classList: { contains: name => skip && name === 'skip-link' },
    getAttribute: () => href,
    addEventListener: (event, fn) => listeners.set(event, fn),
  };
  let prevented = false;
  let scrolls = 0;
  const source = fs.readFileSync(path.join(__dirname, '../script.js'), 'utf8');
  const block = source.split('// ===== Smooth Scroll =====')[1].split('// ===== Active Nav Link on Scroll =====')[0];
  const document = {
    querySelectorAll: () => [anchor],
    querySelector: () => targetExists ? { scrollIntoView() { scrolls++; } } : null,
  };
  vm.runInNewContext(block, { document });
  const listener = listeners.get('click');
  if (listener) listener.call(anchor, { preventDefault() { prevented = true; } });
  return { prevented, scrolls };
}

test('skip link preserves native fragment navigation and keyboard starting point', () => {
  assert.deepEqual(clickAnchor({skip:true}), {prevented:false,scrolls:0});
});
test('ordinary section anchors retain smooth scrolling', () => {
  assert.deepEqual(clickAnchor({href:'#about'}), {prevented:true,scrolls:1});
});
test('empty and missing fragment targets retain native behavior', () => {
  assert.deepEqual(clickAnchor({href:'#'}), {prevented:false,scrolls:0});
  assert.deepEqual(clickAnchor({targetExists:false}), {prevented:false,scrolls:0});
});

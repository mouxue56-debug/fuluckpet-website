'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parse } = require('parse5');
const { init } = require('../gallery-filters.js');
const html = fs.readFileSync(path.join(__dirname, '..', 'gallery.html'), 'utf8');
const attr = (node, key) => (node.attrs || []).find(a => a.name === key)?.value;
const nodes = node => [node, ...(node.childNodes || []).flatMap(nodes)];
const tree = nodes(parse(html));

function element(attributes = {}) {
  const listeners = {};
  const values = { ...attributes };
  const classes = new Set((attributes.class || '').split(/\s+/));
  return {
    hidden: false, textContent: '', listeners,
    getAttribute(key) { return values[key] ?? null; },
    setAttribute(key, value) { values[key] = value; },
    addEventListener(type, handler) { (listeners[type] ||= []).push(handler); },
    click() { for (const handler of listeners.click || []) handler({ currentTarget: this, target: {} }); },
    classList: { toggle(key, state) { state ? classes.add(key) : classes.delete(key); }, contains(key) { return classes.has(key); } },
  };
}
function harness() {
  const cardNodes = tree.filter(node => (attr(node, 'class') || '').split(/\s+/).includes('gallery-item'));
  const items = cardNodes.map(node => element({ 'data-breed': attr(node, 'data-breed') }));
  const buttons = ['all', 'siberian', 'british', 'ragdoll'].map(breed => element({ 'data-gallery-filter': breed }));
  const status = element();
  const outsideButton = element({ class: 'filter-btn active', 'aria-pressed': 'true' });
  const bar = element();
  bar.querySelectorAll = selector => selector === '[data-gallery-filter]' ? buttons : [];
  const grid = { querySelectorAll: selector => selector === '.gallery-item' ? items : [] };
  const win = element();
  const doc = {
    documentElement: { lang: 'ja' },
    getElementById: id => ({ galleryFilters: bar, galleryGrid: grid, galleryFilterStatus: status })[id],
    querySelectorAll() { throw new Error('Filtering must remain scoped to its own gallery'); },
  };
  init(doc, win);
  return { items, buttons, status, win, doc, outsideButton };
}

test('gallery filters count actual cards, expose selection and restore every image', () => {
  const h = harness();
  const total = h.items.length;
  assert.ok(total > 0);
  assert.equal(h.status.textContent, `${total} / ${total} 枚の写真を表示`);
  for (const button of h.buttons) {
    button.click();
    const breed = button.getAttribute('data-gallery-filter');
    const visible = h.items.filter(item => breed === 'all' || item.getAttribute('data-breed') === breed);
    assert.deepEqual(h.items.filter(item => !item.hidden), visible);
    assert.equal(h.status.textContent, `${visible.length} / ${total} 枚の写真を表示`);
    for (const candidate of h.buttons) {
      assert.equal(candidate.getAttribute('aria-pressed'), String(candidate === button));
      assert.equal(candidate.classList.contains('active'), candidate === button);
    }
  }
  h.buttons[0].click();
  assert.ok(h.items.every(item => !item.hidden));
  assert.equal(h.outsideButton.getAttribute('aria-pressed'), 'true');
  assert.ok(h.outsideButton.classList.contains('active'));
});

test('language switches translate current result count without resetting selected breed', () => {
  const h = harness();
  h.buttons[2].click();
  const count = h.items.filter(item => !item.hidden).length;
  for (const [lang, expected] of [
    ['en', `${count} of ${h.items.length} photos shown`],
    ['zh-CN', `显示 ${count} / ${h.items.length} 张照片`],
    ['ja', `${count} / ${h.items.length} 枚の写真を表示`],
  ]) {
    h.doc.documentElement.lang = lang;
    h.win.listeners.langChanged.forEach(handler => handler({ detail: { lang } }));
    assert.equal(h.status.textContent, expected);
    assert.equal(h.items.filter(item => !item.hidden).length, count);
    assert.equal(h.buttons[2].getAttribute('aria-pressed'), 'true');
  }
});

test('filter controls preserve native keyboard activation and have an accessible live result', () => {
  const controls = tree.filter(node => attr(node, 'data-gallery-filter'));
  assert.equal(controls.length, 4);
  for (const button of controls) {
    assert.equal(button.tagName, 'button');
    assert.equal(attr(button, 'type'), 'button');
    assert.equal(attr(button, 'aria-controls'), 'galleryGrid');
    assert.ok(['true', 'false'].includes(attr(button, 'aria-pressed')));
    assert.equal(attr(button, 'onclick'), undefined);
  }
  const status = tree.find(node => attr(node, 'id') === 'galleryFilterStatus');
  assert.equal(attr(status, 'role'), 'status');
  assert.equal(attr(status, 'aria-live'), 'polite');
  assert.equal(attr(status, 'aria-atomic'), 'true');
  assert.doesNotMatch(html, /function filterGallery|event\.target\.classList/);
  const h = harness();
  assert.ok(h.buttons.every(button => !button.listeners.keydown), 'native buttons handle Enter and Space without duplicate custom handlers');
});

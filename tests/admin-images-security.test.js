'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const SOURCE = fs.readFileSync(path.join(__dirname, '..', 'admin/js/admin-images.js'), 'utf8');

class Element {
  constructor(tagName, id = '') {
    this.tagName = tagName.toUpperCase();
    this.id = id;
    this.value = '';
    this.children = [];
    this.style = {};
    this.listeners = {};
    this._innerHTML = '';
    this._textContent = '';
  }
  appendChild(child) { this.children.push(child); return child; }
  addEventListener(type, handler) { this.listeners[type] = handler; }
  closest() { return this.group || null; }
  querySelector() { return null; }
  remove() {}
  set textContent(value) { this._textContent = String(value); this._innerHTML = ''; this.children = []; }
  get textContent() { return this._textContent; }
  set innerHTML(value) { this._innerHTML = String(value); }
  get innerHTML() { return this._innerHTML; }
}

function harness(value) {
  const input = new Element('input', 'img-hero-main');
  const group = new Element('div');
  input.group = group;
  input.value = value;
  const elements = new Map([[input.id, input]]);
  const document = {
    getElementById(id) { return elements.get(id) || null; },
    createElement(tag) { return new Element(tag); },
    querySelectorAll() { return []; },
    addEventListener() {},
  };
  const context = vm.createContext({
    document,
    localStorage: { getItem() { return null; }, setItem() {} },
    console,
    FileReader: function FileReader() {},
    window: {},
  });
  vm.runInContext(SOURCE, context, { filename: 'admin-images.js' });
  context.updatePreviewFor(input.id);
  return { context, group, preview: group.children[0] };
}

test('image manager renders a valid HTTPS preview without HTML interpolation', () => {
  const { preview } = harness('https://cdn.example.test/cat.jpg');
  assert.ok(preview);
  assert.equal(preview.innerHTML, '');
  const image = preview.children.find((child) => child.tagName === 'IMG');
  assert.ok(image);
  assert.equal(image.src, 'https://cdn.example.test/cat.jpg');
  assert.equal(typeof image.listeners.error, 'function');
});

test('image manager rejects attribute injection and executable image schemes', () => {
  for (const value of [
    'https://cdn.example.test/x.jpg" onerror="globalThis.__pwned=true',
    'javascript:globalThis.__pwned=true',
    'data:image/svg+xml,<svg onload="globalThis.__pwned=true"/>',
  ]) {
    const { context, preview } = harness(value);
    assert.equal(context.__pwned, undefined);
    assert.equal(preview.innerHTML, '');
    assert.equal(preview.children.some((child) => child.tagName === 'IMG'), false);
  }
});

test('image manager still supports raster data URLs used by local upload previews', () => {
  const { preview } = harness('data:image/png;base64,iVBORw0KGgo=');
  const image = preview.children.find((child) => child.tagName === 'IMG');
  assert.ok(image);
  assert.match(image.src, /^data:image\/png;base64,/);
});

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const SOURCE = fs.readFileSync(path.join(ROOT, 'admin/js/admin-diary-editor.js'), 'utf8');

class FakeClassList {
  constructor() { this.values = new Set(); }
  add(value) { this.values.add(value); }
  remove(value) { this.values.delete(value); }
  toggle(value, force) {
    if (force === true) this.values.add(value);
    else if (force === false) this.values.delete(value);
    else if (this.values.has(value)) this.values.delete(value);
    else this.values.add(value);
  }
}

class FakeElement {
  constructor(tagName = 'div') {
    this.tagName = tagName.toUpperCase();
    this.classList = new FakeClassList();
    this.dataset = {};
    this.listeners = {};
    this.options = [];
    this.style = {};
    this.value = '';
    this.checked = false;
    this.textContent = '';
    this._innerHTML = '';
  }

  addEventListener(type, listener) {
    (this.listeners[type] ||= []).push(listener);
  }

  appendChild(child) {
    if (this.tagName === 'SELECT' && child.tagName === 'OPTION') this.options.push(child);
    return child;
  }

  focus() {}
  contains() { return false; }
  querySelectorAll() { return []; }
  setAttribute(name, value) { this[name] = String(value); }
  getAttribute(name) { return this[name] ?? null; }

  set innerHTML(value) {
    this._innerHTML = String(value);
    if (this.tagName === 'SELECT') {
      this.options = [...this._innerHTML.matchAll(/<option value="([^"]*)"/g)].map((match) => {
        const option = new FakeElement('option');
        option.value = match[1];
        return option;
      });
    }
  }

  get innerHTML() { return this._innerHTML; }
}

function makePage() {
  const elements = new Map();
  const ids = new Set(['litterSelect']);
  function element(id) {
    if (!elements.has(id)) elements.set(id, new FakeElement(ids.has(id) ? 'select' : 'div'));
    return elements.get(id);
  }

  const documentListeners = {};
  const document = {
    addEventListener(type, listener) { (documentListeners[type] ||= []).push(listener); },
    createElement(tagName) { return new FakeElement(tagName); },
    getElementById: element,
    querySelectorAll() { return []; },
    execCommand() {},
  };
  const storage = new Map([
    ['fuluck-admin-auth', '1'],
    ['fuluck-admin-pwd', 'test-only-password'],
  ]);
  const sessionStorage = {
    getItem(key) { return storage.get(key) ?? null; },
    setItem(key, value) { storage.set(key, String(value)); },
    removeItem(key) { storage.delete(key); },
  };
  const localStorage = {
    getItem() { return null; },
    setItem() {},
  };
  const requests = [];
  const FuluckAPI = {
    get(route) {
      requests.push(route);
      if (route === '/api/admin/kittens') {
        return Promise.resolve([
          { breederId: 'kitten-a', breed: 'サイベリアン', group: 'litter-a', status: 'available' },
          { breederId: 'kitten-b', breed: 'サイベリアン', group: 'litter-b', status: 'available' },
        ]);
      }
      if (route === '/api/kittens') {
        return Promise.resolve([
          { breederId: 'kitten-a', breed: 'サイベリアン', status: 'available' },
          { breederId: 'kitten-b', breed: 'サイベリアン', status: 'available' },
        ]);
      }
      if (route === '/api/parents') return Promise.resolve([]);
      if (route === '/api/admin/diary') return Promise.resolve([]);
      throw new Error(`Unexpected GET ${route}`);
    },
  };

  const window = {
    addEventListener() {},
    document,
    FuluckAPI,
    localStorage,
    location: { search: '', reload() {} },
    sessionStorage,
  };
  window.window = window;

  const context = vm.createContext({
    Array,
    confirm() { return true; },
    document,
    fetch() { throw new Error('Unexpected raw fetch'); },
    FuluckAPI,
    localStorage,
    location: window.location,
    Map,
    Promise,
    sessionStorage,
    Set,
    setTimeout,
    URLSearchParams,
    window,
  });

  return { context, documentListeners, element, requests };
}

test('authenticated diary kitten data preserves group selection from the Admin collection', async () => {
  const page = makePage();
  vm.runInContext(SOURCE, page.context, { filename: 'admin-diary-editor.js' });
  page.documentListeners.DOMContentLoaded[0]();
  await new Promise(setImmediate);
  await new Promise(setImmediate);

  assert.ok(page.requests.includes('/api/admin/kittens'));
  assert.equal(page.requests.includes('/api/kittens'), false);
  assert.match(page.element('litterSelect').innerHTML, /value="litter-a"/);

  page.element('litterSelect').value = 'litter-a';
  page.element('btnSelectLitterCats').listeners.click[0]({ preventDefault() {} });

  const pickerHtml = page.element('kittenPickerList').innerHTML;
  assert.match(pickerHtml, /data-cat-id="kitten-a" checked/);
  assert.doesNotMatch(pickerHtml, /data-cat-id="kitten-b" checked/);
});

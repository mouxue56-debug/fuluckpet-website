'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const CATALOG_SOURCE = fs.readFileSync(path.join(ROOT, 'kitten-catalog.js'), 'utf8');
const CARD_SOURCE = fs.readFileSync(path.join(ROOT, 'card-loader.js'), 'utf8');

function flushAsyncWork() {
  return new Promise((resolve) => setImmediate(resolve)).then(
    () => new Promise((resolve) => setImmediate(resolve))
  );
}

function installCatalog(context) {
  vm.runInContext(CATALOG_SOURCE, context, { filename: 'kitten-catalog.js' });
  context.window.FuluckKittenCatalog = context.FuluckKittenCatalog;
}

class RenderedCard {
  constructor(attributeSource) {
    this.attributes = Object.create(null);
    this.dataset = Object.create(null);

    for (const match of attributeSource.matchAll(/\s([a-zA-Z0-9:-]+)="([^"]*)"/g)) {
      const name = match[1];
      const value = match[2];
      this.attributes[name] = value;
      if (name.startsWith('data-')) {
        const key = name.slice(5).replace(/-([a-z])/g, (_whole, letter) => letter.toUpperCase());
        this.dataset[key] = value;
      }
    }
  }

  getAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this.attributes, name) ? this.attributes[name] : null;
  }
}

class KittensGrid {
  constructor() {
    this.children = [];
    this._innerHTML = '';
  }

  set innerHTML(value) {
    this._innerHTML = String(value || '');
    this.children = [...this._innerHTML.matchAll(/<div class="kitten-card"([^>]*)>/g)].map(
      (match) => new RenderedCard(match[1])
    );
  }

  get innerHTML() {
    return this._innerHTML;
  }

  querySelectorAll(selector) {
    return selector === '.kitten-card' ? this.children.slice() : [];
  }
}

class KittensSection {
  constructor(grid) {
    this.hidden = false;
    this.grid = grid;
    this.tag = { textContent: '' };
    this.title = { textContent: '' };
  }

  querySelector(selector) {
    if (selector === '.kittens-grid') return this.grid;
    if (selector === '.sec-tag') return this.tag;
    if (selector === '.sec-title') return this.title;
    return null;
  }
}

function kittensPage(kittens) {
  const listeners = Object.create(null);
  const grid = new KittensGrid();
  const section = new KittensSection(grid);
  const document = {
    title: '子猫一覧',
    documentElement: { lang: 'ja' },
    getElementById() {
      return null;
    },
    querySelector(selector) {
      if (selector === '.page-hero') return {};
      return null;
    },
    querySelectorAll(selector) {
      if (selector === '.section') return [section];
      if (selector === '.kittens-grid') return [grid];
      return [];
    },
  };
  const window = {
    FULUCK_API_BASE: 'https://api.example.test',
    location: { pathname: '/kittens.html', href: '' },
    addEventListener(type, listener) {
      if (!listeners[type]) listeners[type] = [];
      listeners[type].push(listener);
    },
    dispatchEvent(event) {
      for (const listener of listeners[event.type] || []) listener(event);
    },
    rebindCards() {},
  };
  const context = vm.createContext({
    window,
    document,
    localStorage: { getItem() { return 'ja'; } },
    fetch(url) {
      assert.equal(String(url), 'https://api.example.test/api/kittens');
      return Promise.resolve({ ok: true, json: async () => kittens });
    },
    Event: function Event(type) { this.type = type; },
    URL,
    console: { log() {}, warn() {} },
  });

  installCatalog(context);
  vm.runInContext(CARD_SOURCE, context, { filename: 'card-loader.js' });
  return { grid };
}

test('kittens page detail links require the same raw photos gate as generated pages', async () => {
  const page = kittensPage([
    {
      breederId: 'available-no-photo',
      breed: 'サイベリアン',
      status: 'available',
      photos: [],
    },
    {
      breederId: 'available-with-photo',
      breed: 'サイベリアン',
      status: 'available',
      photos: ['https://cdn.example.test/child_img_1_x.jpg.webp'],
    },
    {
      breederId: 'reserved-no-photo',
      breed: 'サイベリアン',
      status: 'reserved',
      photos: [],
    },
  ]);
  await flushAsyncWork();

  const cards = page.grid.querySelectorAll('.kitten-card');
  assert.equal(cards.length, 3);
  const cardByBreederId = (id) => cards.find((card) => card.getAttribute('data-breeder-id') === id);

  const noPhotoAvailable = cardByBreederId('available-no-photo');
  assert.equal(noPhotoAvailable.getAttribute('role'), 'button');
  assert.equal(noPhotoAvailable.getAttribute('aria-haspopup'), 'dialog');
  assert.equal(noPhotoAvailable.getAttribute('data-detail-url'), '');

  const withPhotoAvailable = cardByBreederId('available-with-photo');
  assert.equal(withPhotoAvailable.getAttribute('role'), 'link');
  assert.equal(withPhotoAvailable.getAttribute('aria-haspopup'), null);
  assert.equal(withPhotoAvailable.getAttribute('data-detail-url'), '/kittens/available-with-photo.html');

  const noPhotoReserved = cardByBreederId('reserved-no-photo');
  assert.equal(noPhotoReserved.getAttribute('role'), 'button');
  assert.equal(noPhotoReserved.getAttribute('aria-haspopup'), 'dialog');
  assert.equal(noPhotoReserved.getAttribute('data-detail-url'), '');
});

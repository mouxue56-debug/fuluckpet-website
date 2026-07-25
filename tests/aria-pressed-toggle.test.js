'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const SCRIPT_SOURCE = fs.readFileSync(path.join(ROOT, 'script.js'), 'utf8');

function readSource(file) {
  return fs.readFileSync(path.join(ROOT, file), 'utf8');
}

function between(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `source includes ${startMarker}`);
  const end = source.indexOf(endMarker, start);
  assert.notEqual(end, -1, `source includes ${endMarker}`);
  return source.slice(start, end);
}

function buttonOpenTags(source, className) {
  const escaped = className.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`<button\\b(?=[^>]*\\bclass="[^"]*\\b${escaped}\\b[^"]*")[^>]*>`, 'g');
  return [...source.matchAll(pattern)].map((match) => match[0]);
}

function attrValue(tag, name) {
  const match = tag.match(new RegExp(`\\b${name}="([^"]*)"`));
  return match ? match[1] : null;
}

function hasClass(tag, className) {
  return attrValue(tag, 'class').split(/\s+/).includes(className);
}

function assertPressedGroup(label, tags, expectedCount) {
  assert.equal(tags.length, expectedCount, `${label} has the expected button count`);

  const pressed = tags.map((tag) => attrValue(tag, 'aria-pressed'));
  const activeIndexes = tags
    .map((tag, index) => hasClass(tag, 'active') ? index : -1)
    .filter((index) => index !== -1);
  const pressedTrueIndexes = pressed
    .map((value, index) => value === 'true' ? index : -1)
    .filter((index) => index !== -1);

  assert.deepEqual(activeIndexes, pressedTrueIndexes, `${label} active and aria-pressed=true are the same button`);
  assert.equal(pressedTrueIndexes.length, 1, `${label} has exactly one aria-pressed=true button`);
  pressed.forEach((value, index) => {
    assert.equal(value, activeIndexes.includes(index) ? 'true' : 'false', `${label} button ${index} has matching aria-pressed`);
  });
}

function kittenControlsSource() {
  const startMarker = '  // ===== Update visible kitten count =====';
  const endMarker = '  // ===== Modal a11y helpers';
  const start = SCRIPT_SOURCE.indexOf(startMarker);
  const end = SCRIPT_SOURCE.indexOf(endMarker, start);
  assert.notEqual(start, -1, 'main script keeps the kitten controls section');
  assert.notEqual(end, -1, 'main script keeps the kitten controls boundary');
  return `(function () {\n${SCRIPT_SOURCE.slice(start, end)}\n})();`;
}

class ControlButton {
  constructor(className, dataset) {
    this.className = className;
    this.dataset = { ...dataset };
    this.attributes = Object.create(null);
    this.listeners = Object.create(null);
  }

  get classList() {
    const button = this;
    return {
      add(name) {
        const classes = new Set(button.className.split(/\s+/).filter(Boolean));
        classes.add(name);
        button.className = [...classes].join(' ');
      },
      remove(name) {
        button.className = button.className.split(/\s+/).filter((item) => item && item !== name).join(' ');
      },
      contains(name) {
        return button.className.split(/\s+/).includes(name);
      },
    };
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  getAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this.attributes, name) ? this.attributes[name] : null;
  }

  addEventListener(type, listener) {
    if (!this.listeners[type]) this.listeners[type] = [];
    this.listeners[type].push(listener);
  }

  click() {
    for (const listener of this.listeners.click || []) listener({ currentTarget: this });
  }
}

class KittenCard {
  constructor(status) {
    this.className = 'kitten-card';
    this.dataset = {
      status,
      promotionPriority: '0',
      price: '0',
      birthday: '2026-01-01',
      breederId: status,
    };
    this.style = {};
  }

  get classList() {
    const card = this;
    return {
      add(name) {
        const classes = new Set(card.className.split(/\s+/).filter(Boolean));
        classes.add(name);
        card.className = [...classes].join(' ');
      },
      remove(name) {
        card.className = card.className.split(/\s+/).filter((item) => item && item !== name).join(' ');
      },
      contains(name) {
        return card.className.split(/\s+/).includes(name);
      },
    };
  }
}

function scriptControlsHarness() {
  const filterButtons = ['all', 'available', 'reserved', 'sold'].map((filter, index) => {
    const button = new ControlButton(index === 0 ? 'filter-btn active' : 'filter-btn', { filter });
    button.setAttribute('aria-pressed', index === 0 ? 'true' : 'false');
    return button;
  });
  const sortButtons = ['default', 'price-asc', 'price-desc', 'newest'].map((sort, index) => {
    const button = new ControlButton(index === 0 ? 'sort-btn active' : 'sort-btn', { sort });
    button.setAttribute('aria-pressed', index === 0 ? 'true' : 'false');
    return button;
  });
  const cards = [new KittenCard('available'), new KittenCard('sold')];
  const grid = {
    querySelectorAll(selector) {
      return selector === '.kitten-card' ? cards : [];
    },
    appendChild(card) {
      return card;
    },
  };
  const visibleCount = { textContent: '0' };
  const document = {
    getElementById(id) {
      if (id === 'kittensGrid') return grid;
      if (id === 'visibleCount') return visibleCount;
      return null;
    },
    querySelectorAll(selector) {
      if (selector === '.filter-btn') return filterButtons;
      if (selector === '.sort-btn') return sortButtons;
      if (selector === '.kitten-card') return cards;
      if (selector === '.kitten-card:not(.hidden)') return cards.filter((card) => !card.classList.contains('hidden'));
      return [];
    },
  };
  const context = vm.createContext({
    window: {
      FuluckKittenCatalog: null,
      addEventListener() {},
    },
    document,
    setTimeout(callback) { callback(); return 1; },
    Number,
    Array,
  });
  vm.runInContext(kittenControlsSource(), context, { filename: 'script.js#kitten-controls' });
  return { filterButtons, sortButtons };
}

test('static filter, sort, and FAQ toggle buttons expose the same active state through aria-pressed', () => {
  const index = readSource('index.html');
  const gallery = readSource('gallery.html');
  const faq = readSource('faq.html');

  assertPressedGroup(
    'index filter buttons',
    buttonOpenTags(between(index, '<div class="filter-bar">', '<div class="kittens-toolbar">'), 'filter-btn'),
    4,
  );
  assertPressedGroup(
    'index sort buttons',
    buttonOpenTags(between(index, '<div class="sort-controls">', '<span class="kittens-count">'), 'sort-btn'),
    4,
  );
  assertPressedGroup(
    'gallery filter buttons',
    buttonOpenTags(between(gallery, '<!-- 卒業猫フィルター -->', '<div class="gallery-page-grid"'), 'filter-btn'),
    4,
  );
  assertPressedGroup(
    'FAQ filter buttons',
    buttonOpenTags(between(faq, '<div class="faq-filters" id="faqFilters">', '<div class="faq-page-list"'), 'faq-filter-btn'),
    5,
  );
});

test('script.js filter and sort handlers keep aria-pressed synchronized after clicks', () => {
  const { filterButtons, sortButtons } = scriptControlsHarness();

  filterButtons[1].click();
  filterButtons.forEach((button, index) => {
    const selected = index === 1;
    assert.equal(button.classList.contains('active'), selected, `filter button ${index} active state`);
    assert.equal(button.getAttribute('aria-pressed'), selected ? 'true' : 'false', `filter button ${index} aria-pressed`);
  });

  sortButtons[2].click();
  sortButtons.forEach((button, index) => {
    const selected = index === 2;
    assert.equal(button.classList.contains('active'), selected, `sort button ${index} active state`);
    assert.equal(button.getAttribute('aria-pressed'), selected ? 'true' : 'false', `sort button ${index} aria-pressed`);
  });
});

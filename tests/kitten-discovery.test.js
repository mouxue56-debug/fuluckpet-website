'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const discovery = require('../kitten-discovery');
const today = new Date(2026, 9, 4);
const kitten = { id: '2608-12345', entry: 'siberian', status: 'available', price: '250000', sex: 'female', birthday: '2026-04-04' };

test('additional filters combine with breed/status and treat unknown facts conservatively', () => {
  const state = discovery.normalize({ entry: 'siberian', budget: '250000', sex: 'female', age: '6to11' });
  assert.equal(discovery.matches(kitten, state, today), true);
  for (const change of [{ price: '' }, { price: '¥250000' }, { price: '250001' }, { sex: '' }, { birthday: '2026-04' }, { birthday: '2026-02-30' }, { status: 'sold' }, { entry: 'golden' }]) {
    assert.equal(discovery.matches({ ...kitten, ...change }, state, today), false, JSON.stringify(change));
  }
  assert.equal(discovery.matches({ ...kitten, birthday: '', price: '', sex: '' }, discovery.normalize(), today), true);
  assert.equal(discovery.matches({ ...kitten, status: 'sold' }, discovery.normalize({ status: 'all' }), today), true);
});

test('month-age boundaries do not round up or fabricate missing dates', () => {
  assert.equal(discovery.ageMonths('2026-04-05', today), 5);
  assert.equal(discovery.ageMonths('2026-04-04', today), 6);
  assert.equal(discovery.ageMonths('2025-10-04', today), 12);
  for (const invalid of ['', '2026-04', '2026-02-30', '2026-10-05', 'invalid']) assert.equal(discovery.ageMonths(invalid, today), null);
  assert.equal(discovery.matches(kitten, discovery.normalize({ age: 'under6' }), today), false);
  assert.equal(discovery.matches({ ...kitten, birthday: '2025-10-04' }, discovery.normalize({ age: '12plus' }), today), true);
});

test('sex reads explicit translated card labels, never coat/name guesses', () => {
  for (const label of ['♂ 男の子 ・ ホワイト', 'Male ・ Solid White', ' 男孩 ・ 白色']) assert.equal(discovery.sexOf(label), 'male');
  for (const label of ['♀ 女の子 ・ ホワイト', 'Female ・ Solid White', '女孩 ・ 白色']) assert.equal(discovery.sexOf(label), 'female');
  for (const label of ['Unknown', 'Boyish kitten', 'Calico', '', 'Female looking']) assert.equal(discovery.sexOf(label), '');
});

test('returning to the list restores only validated filters and public IDs', () => {
  let value;
  const storage = { setItem: (_, text) => { value = text; }, getItem: () => value };
  const selected = discovery.normalize({ budget: '200000', age: '12plus', sex: 'male', entry: 'adultmix', status: 'all', favoritesOnly: true, favorites: ['2608-12345'], compare: ['2608-12345', '2608-12346'], owner: 'must not persist' });
  discovery.write(storage, selected);
  assert.deepEqual(discovery.read(storage), selected);
  assert.equal(value.includes('owner'), false);
  assert.equal(discovery.matches({ ...kitten, id: 'another-id' }, discovery.normalize({ favoritesOnly: true, favorites: selected.favorites }), today), false);
  assert.deepEqual(discovery.read({ getItem: () => '{bad json' }), discovery.normalize());
  assert.doesNotThrow(() => discovery.write({ setItem: () => { throw new Error('blocked'); } }, selected));
  assert.deepEqual(discovery.read({ getItem: () => { throw new Error('blocked'); } }), discovery.normalize());
});

test('comparison selection is unique, removable, and limited to three public IDs', () => {
  let selected = [];
  for (const id of ['1', '2', '3', '4']) selected = discovery.toggleCompare(selected, id);
  assert.deepEqual(selected, ['1', '2', '3']);
  assert.deepEqual(discovery.toggleCompare(selected, '2'), ['1', '3']);
  assert.deepEqual(discovery.normalize({ compare: ['1', '1', '../bad', '2', '3', '4'], favorites: ['safe', '<script>'] }).compare, ['1', '2', '3']);
});

test('all catalog routes and generator retain no-JS cards and load the enhancement once', () => {
  for (const path of ['kittens.html', 'en/kittens.html', 'zh/kittens.html']) {
    const html = fs.readFileSync(path, 'utf8');
    assert.match(html, /class="has-mobile-cta catalog-page"/);
    assert.equal((html.match(/src="\/kitten-discovery\.js\?/g) || []).length, 1);
    assert.match(html, /<a class="kitten-card" href="\/(?:en\/|zh\/)?kittens\//);
    assert.match(html, /kittenFiltersApplied/);
  }
  const generator = fs.readFileSync('tools/generate-site.js', 'utf8');
  assert.match(generator, /kitten-discovery\.css\?v=/);
  assert.match(generator, /kittenFiltersApplied/);
});

// Small DOM harness exercises the actual init/event handlers without network or a browser dependency.
function runtimePage(lang = 'en') {
  let doc;
  function matches(node, selector) {
    if (selector[0] === '.') return node.className.split(/\s+/).includes(selector.slice(1));
    if (selector[0] === '[') return [...selector.matchAll(/\[([^=\]]+)(?:="([^"]*)")?\]/g)].every(([, key, value]) => node.getAttribute(key) !== null && (value === undefined || node.getAttribute(key) === value));
    return node.tagName === selector.toUpperCase();
  }
  class Element {
    constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this.parentElement = null; this.className = ''; this.dataset = {}; this.attrs = {}; this.handlers = {}; this.open = false; this.hidden = false; this._text = ''; this.classList = { contains: name => this.className.split(/\s+/).includes(name) }; }
    get isConnected() { return this === doc.body || !!(this.parentElement && this.parentElement.isConnected); }
    set textContent(text) { this._text = String(text); this.children = []; }
    get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
    appendChild(child) { child.remove(); this.children.push(child); child.parentElement = this; return child; }
    insertBefore(child, before) { child.remove(); this.children.splice(this.children.indexOf(before), 0, child); child.parentElement = this; }
    after(child) { const parent = this.parentElement; child.remove(); parent.children.splice(parent.children.indexOf(this) + 1, 0, child); child.parentElement = parent; }
    remove() { if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(child => child !== this); this.parentElement = null; }
    replaceChildren(...children) { for (const child of [...this.children]) child.remove(); this._text = ''; for (const child of children) this.appendChild(child); }
    setAttribute(key, value) { this.attrs[key] = String(value); if (key.startsWith('data-')) this.dataset[key.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = String(value); }
    getAttribute(key) { return this.attrs[key] ?? null; }
    removeAttribute(key) { delete this.attrs[key]; }
    addEventListener(type, handler) { (this.handlers[type] ||= []).push(handler); }
    fire(type) { for (const handler of this.handlers[type] || []) handler({ target: this }); }
    click() { if (!this.disabled) { doc.activeElement = this; this.fire('click'); } }
    focus() { doc.activeElement = this; }
    showModal() { this.open = true; }
    close() { this.open = false; this.fire('close'); }
    querySelectorAll(selector) { return this.children.flatMap(child => (matches(child, selector) ? [child] : []).concat(child.querySelectorAll(selector))); }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    closest(selector) { return matches(this, selector) ? this : this.parentElement && this.parentElement.closest(selector); }
    cloneNode() { const clone = new Element(this.tagName); clone.attrs = { ...this.attrs }; clone.className = this.className; return clone; }
  }
  doc = { body: new Element('body'), documentElement: { lang }, activeElement: null, createElement: tag => new Element(tag), createTextNode: text => { const node = new Element('text'); node.textContent = text; return node; }, querySelector: selector => doc.body.querySelector(selector) };
  const section = doc.body.appendChild(new Element('section')); section.className = 'section';
  const filters = section.appendChild(new Element('div')); filters.setAttribute('data-kitten-filters', '');
  for (const [kind, value] of [['entry', 'all'], ['status', 'available']]) { const button = filters.appendChild(new Element('button')); button.setAttribute('data-' + kind + '-filter', value); button.setAttribute('aria-pressed', 'true'); }
  const grid = section.appendChild(new Element('div')); grid.className = 'kittens-grid';
  function card(id, price = '250000') {
    const node = new Element('a'); node.className = 'kitten-card'; node.dataset = { breederId: id, entryGroup: 'siberian', status: 'available', price, birthday: '2026-04-04' }; node.setAttribute('href', '/en/kittens/' + id + '.html');
    for (const [tag, className, text] of [['h3', '', 'Siberian'], ['p', 'kit-meta', 'Female ・ White'], ['p', 'kit-meta', 'Born 2026/4'], ['p', 'kit-price', '¥' + price], ['p', 'kit-status', 'Available']]) { const child = node.appendChild(new Element(tag)); child.className = className; child.textContent = text; }
    const image = node.appendChild(new Element('img')); for (const [key, value] of Object.entries({ src: '/cat.webp', srcset: '/cat.webp 360w', alt: 'Siberian kitten', width: '360', height: '360', style: 'width:100%;height:100%;object-fit:cover;', fetchpriority: 'high' })) image.setAttribute(key, value);
    return node;
  }
  grid.appendChild(card('one')); grid.appendChild(card('two'));
  const events = {};
  const win = { document: doc, localStorage: { getItem: () => JSON.stringify({ compare: ['one', 'two'] }), setItem() {} }, addEventListener: (type, handler) => { (events[type] ||= []).push(handler); } };
  return { doc, grid, win, card, dispatch: type => { for (const handler of events[type] || []) handler(); } };
}

test('runtime comparison images keep source identity but do not inherit full-height card styles', () => {
  const page = runtimePage(); discovery.init(page.win);
  page.doc.querySelector('.kit-discovery-bar').querySelector('button').click();
  const dialog = page.doc.querySelector('dialog'); assert.equal(dialog.open, true);
  const image = dialog.querySelector('img');
  for (const key of ['style', 'width', 'height', 'fetchpriority']) assert.equal(image.getAttribute(key), null);
  assert.equal(image.getAttribute('src'), '/cat.webp'); assert.equal(image.getAttribute('srcset'), '/cat.webp 360w'); assert.equal(image.getAttribute('alt'), 'Siberian kitten');
});

test('cardsLoaded closes stale comparison, restores focus, announces refresh and reopens current facts', () => {
  for (const lang of ['ja', 'en', 'zh']) {
    const page = runtimePage(lang); discovery.init(page.win);
    const open = page.doc.querySelector('.kit-discovery-bar').querySelector('button'); open.click();
    const dialog = page.doc.querySelector('dialog'); assert.equal(dialog.open, true); assert.match(dialog.textContent, /¥250000/);
    page.grid.replaceChildren(page.card('one', '180000'), page.card('two', '200000'));
    page.dispatch('cardsLoaded');
    assert.equal(dialog.open, false); assert.equal(page.doc.activeElement, open);
    assert.match(page.doc.querySelector('.kit-discovery-bar').textContent, /掲載情報を更新|Listings were updated|猫咪资料已刷新/);
    open.click(); assert.equal(dialog.open, true); assert.match(dialog.textContent, /¥180000/); assert.doesNotMatch(dialog.textContent, /¥250000/);
    page.grid.replaceChildren(page.card('one')); page.dispatch('cardsLoaded');
    assert.equal(dialog.open, false); assert.equal(open.disabled, true);
    discovery.init(page.win); assert.equal(page.doc.body.querySelectorAll('dialog').length, 1);
  }
});

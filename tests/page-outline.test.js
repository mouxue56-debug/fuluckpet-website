'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {parse} = require('parse5');

function harness(route = '/boarding/', count = 3) {
  let document;
  class Element {
    constructor(tag, text = '') { this.tagName = tag.toUpperCase(); this.children = []; this.attrs = {}; this.listeners = {}; this.text = text; this.open = false; }
    get id() { return this.attrs.id || ''; }
    set id(value) { this.attrs.id = value; }
    get className() { return this.attrs.class || ''; }
    set className(value) { this.attrs.class = value; }
    get textContent() { return this.text + this.children.map(item => item.textContent).join(''); }
    set textContent(value) { this.text = value; this.children = []; }
    get nextSibling() { return this.parentNode?.children[this.parentNode.children.indexOf(this) + 1] || null; }
    appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
    insertBefore(child, next) { child.parentNode = this; const index = this.children.indexOf(next); this.children.splice(index < 0 ? this.children.length : index, 0, child); }
    setAttribute(name, value) { this.attrs[name] = String(value); }
    getAttribute(name) { return this.attrs[name] ?? null; }
    hasAttribute(name) { return name in this.attrs; }
    matches(selector) { return selector.split(',').some(part => { part = part.trim(); if (part[0] === '.') return this.className.split(' ').includes(part.slice(1)); if (part[0] === '[') return this.hasAttribute(part.slice(1, -1)); return this.tagName.toLowerCase() === part; }); }
    querySelectorAll(selector) { return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]); }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    closest(selector) { return this.matches(selector) ? this : this.parentNode?.closest(selector) || null; }
    contains(child) { return child === this || this.children.some(item => item.contains(child)); }
    addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
    click(extra = {}) { const event = {button:0, prevented:false, preventDefault() { this.prevented = true; }, stopImmediatePropagation() { this.stopped = true; }, ...extra}; for (const fn of this.listeners.click || []) { fn(event); if (event.stopped) break; } return event; }
    focus(options) { document.activeElement = this; this.focusOptions = options; }
    scrollIntoView(options) { this.scrollOptions = options; }
  }
  const root = new Element('html');
  root.lang = 'ja';
  const main = root.appendChild(new Element('main'));
  const hero = main.appendChild(new Element('section'));
  hero.className = 'service-hero';
  const headings = Array.from({length:count}, (_, index) => {
    const section = main.appendChild(new Element('section'));
    return section.appendChild(new Element('h2', '見出し ' + (index + 1)));
  });
  headings[0].id = 'existing-price';
  const cta = main.appendChild(new Element('section'));
  cta.className = 'service-final-cta';
  cta.appendChild(new Element('h2', 'Contact'));
  const faq = main.appendChild(new Element('section')).appendChild(new Element('details'));
  faq.appendChild(new Element('h2', 'Nested question'));
  root.appendChild(new Element('footer')).appendChild(new Element('h2', 'Footer'));
  const observers = [];
  const events = {};
  const history = [];
  const location = {pathname:route, hash:''};
  let reduceMotion = false;
  document = {
    documentElement:root,
    createElement:tag => new Element(tag),
    querySelector:selector => root.querySelector(selector),
    querySelectorAll:selector => root.querySelectorAll(selector),
    getElementById:id => (function find(element) { if (element.id === id) return element; for (const child of element.children) { const found = find(child); if (found) return found; } return null; })(root),
  };
  const context = {
    module:{exports:{}}, document, location,
    requestAnimationFrame:fn => fn(),
    window:{
      addEventListener(type, fn) { (events[type] ||= []).push(fn); },
      history:{pushState(state, title, url) { history.push(url); location.hash = url; }},
      matchMedia() { return {matches:reduceMotion}; },
    },
    MutationObserver:class { constructor(fn) { observers.push(fn); } observe() {} },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../page-experience.js'), 'utf8'), context);
  function loadMarkup(html) {
    function convert(node) {
      if (node.nodeName === '#comment') return null;
      const element = new Element(node.tagName || '#text', node.value || '');
      for (const attr of node.attrs || []) element.setAttribute(attr.name, attr.value);
      for (const child of node.childNodes || []) { const converted = convert(child); if (converted) element.appendChild(converted); }
      return element;
    }
    const parsed = parse(html).childNodes.find(node => node.tagName === 'html');
    const converted = convert(parsed);
    root.children = converted.children;
    root.attrs = converted.attrs;
    root.lang = root.getAttribute('lang') || 'ja';
    root.children.forEach(child => { child.parentNode = root; });
  }
  return {api:context.module.exports, document, location:context.location, history, loadMarkup, setReducedMotion:value => { reduceMotion = value; }, main, hero, headings, observers, fire:type => (events[type] || []).forEach(fn => fn())};
}

test('outline keeps original targets, excludes CTA and nested FAQ, and is inserted once after the hero', () => {
  const h = harness();
  h.api.init();
  h.api.init();
  const outlines = h.main.querySelectorAll('.experience-page-outline');
  assert.equal(outlines.length, 1);
  const outline = outlines[0];
  assert.equal(h.main.children[1], outline);
  assert.equal(outline.querySelector('summary').textContent, 'このページの内容');
  const links = outline.querySelectorAll('a');
  assert.equal(links.length, 3);
  assert.equal(links[0].getAttribute('href'), '#existing-price');
  for (const link of links) assert.ok(h.document.getElementById(decodeURIComponent(link.getAttribute('href').slice(1))));
  outline.open = true;
  const event = links[1].click();
  assert.equal(outline.open, false);
  assert.equal(event.prevented, true);
  assert.equal(event.stopped, true, 'legacy hash listeners cannot override the outline navigation');
  assert.equal(h.history.length, 1);
  assert.equal(h.location.hash, links[1].getAttribute('href'));
  assert.equal(h.headings[1].scrollOptions.block, 'start');
  assert.equal(h.headings[1].scrollOptions.behavior, 'smooth');
  assert.equal(h.document.activeElement, h.headings[1]);
  assert.equal(h.headings[1].getAttribute('tabindex'), '-1');
  assert.equal(h.headings[1].focusOptions.preventScroll, true);
  outline.open = true;
  links[2].click({metaKey:true});
  assert.equal(outline.open, true, 'modified clicks keep their native behavior');
  assert.equal(h.history.length, 1);
});

test('language events and later heading translations refresh labels without duplicating or changing fragment IDs', () => {
  const h = harness('/en/grooming/');
  h.api.init();
  const outline = h.main.querySelector('.experience-page-outline');
  const before = outline.querySelectorAll('a').map(link => link.getAttribute('href'));
  h.document.documentElement.lang = 'en';
  h.fire('langChanged');
  assert.equal(outline.querySelector('summary').textContent, 'On this page');
  h.headings[1].textContent = 'Care prices';
  h.observers[0]([{target:h.headings[1]}]);
  assert.equal(outline.querySelectorAll('a')[1].textContent, 'Care prices');
  assert.deepEqual(outline.querySelectorAll('a').map(link => link.getAttribute('href')), before);
  h.document.documentElement.lang = 'zh';
  h.fire('langChanged');
  assert.equal(outline.querySelector('nav').getAttribute('aria-label'), '本页导航');
});

test('outline is limited to approved routes and requires at least three meaningful headings', () => {
  for (const route of ['/booking.html', '/blog.html', '/guide/', '/en/about.html', '/other/boarding/']) {
    const h = harness(route); h.api.init(); assert.equal(h.main.querySelector('.experience-page-outline'), null, route);
  }
  const short = harness('/boarding/', 2); short.api.init();
  assert.equal(short.main.querySelector('.experience-page-outline'), null);
  for (const route of ['/about.html', '/siberian.html', '/zh/boarding/', '/en/grooming/index.html', '/zh/siberian-breeder-osaka.html']) {
    const h = harness(route); h.api.init(); assert.ok(h.main.querySelector('.experience-page-outline'), route);
  }
});

test('generated fragment IDs avoid existing document collisions', () => {
  const h = harness();
  h.hero.id = 'experience-section-2';
  h.api.init();
  assert.equal(h.hero.id, 'experience-section-2');
  assert.equal(h.headings[1].id, 'experience-section-2-2');
});

test('a saved generated fragment is restored after the target ID is created', () => {
  const h = harness();
  h.location.hash = '#experience-section-2';
  h.api.init();
  assert.equal(h.headings[1].scrollOptions.block, 'start');
});

test('plain outline navigation respects reduced motion and avoids duplicate history entries for the same target', () => {
  const h = harness();
  h.setReducedMotion(true);
  h.api.init();
  const link = h.main.querySelector('.experience-page-outline').querySelector('a');
  let legacyCalled = false;
  link.addEventListener('click', () => { legacyCalled = true; });
  link.click();
  link.click();
  assert.equal(h.headings[0].scrollOptions.behavior, 'auto');
  assert.deepEqual(h.history, ['#existing-price']);
  assert.equal(legacyCalled, false);
});

test('every shipped outline entrypoint has a real main, direct hero, and working links to at least three headings', () => {
  const entries = ['about.html', 'siberian.html', 'siberian-breeder-osaka.html',
    'en/siberian-breeder-osaka.html', 'zh/siberian-breeder-osaka.html',
    'boarding/index.html', 'en/boarding/index.html', 'zh/boarding/index.html',
    'grooming/index.html', 'en/grooming/index.html', 'zh/grooming/index.html'];
  for (const entry of entries) {
    const route = '/' + entry.replace(/\/index\.html$/, '/');
    const h = harness(route);
    h.loadMarkup(fs.readFileSync(path.join(__dirname, '..', entry), 'utf8'));
    const main = h.document.querySelector('main');
    assert.ok(main, entry + ': semantic main is required for skip navigation and outline');
    assert.equal(h.document.getElementById('main'), main, entry + ': #main skip target');
    const hero = main.querySelector('.service-hero, .page-hero');
    assert.ok(hero, entry + ': hero is required');
    assert.equal(hero.parentNode, main, entry + ': hero must be a direct main child');
    assert.ok(h.document.querySelectorAll('script').some(script => /(?:^|\/)page-experience\.js(?:\?|$)/.test(script.getAttribute('src') || '')), entry + ': enhancement script loads');
    assert.ok(h.document.querySelectorAll('link').some(link => /(?:^|\/)page-experience\.css(?:\?|$)/.test(link.getAttribute('href') || '')), entry + ': outline styling loads');
    h.api.init();
    const outline = main.querySelector('.experience-page-outline');
    assert.ok(outline, entry + ': production initializer creates the outline from actual markup');
    assert.equal(hero.nextSibling, outline, entry + ': placed after hero');
    const links = outline.querySelectorAll('a');
    assert.ok(links.length >= 3, entry + ': at least three eligible headings');
    for (const link of links) {
      const target = h.document.getElementById(decodeURIComponent(link.getAttribute('href').slice(1)));
      assert.ok(target && main.contains(target), entry + ': fragment resolves inside main');
      assert.equal(target.tagName, 'H2', entry + ': link targets a real section heading');
      assert.equal(link.textContent, target.textContent.trim(), entry + ': displayed heading text retained');
    }
  }
});


test('modified outline clicks remain native even when legacy smooth scrolling is installed', () => {
  const h = harness(); h.api.init();
  const outline = h.main.querySelector('.experience-page-outline');
  const link = outline.querySelector('a');
  let legacyCalls = 0;
  link.addEventListener('click', event => { legacyCalls++; event.preventDefault(); });
  outline.open = true;
  for (const modifier of [{metaKey:true},{ctrlKey:true},{shiftKey:true},{altKey:true},{button:1}]) {
    const event = link.click(modifier);
    assert.equal(event.prevented, false);
    assert.equal(outline.open, true);
  }
  assert.equal(legacyCalls, 0);
  assert.equal(h.history.length, 0);
});

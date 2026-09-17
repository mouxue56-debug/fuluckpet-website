'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

// Exercise the real event handlers; browser evidence separately covers CSS visibility
// and native keyboard focus. No navigation requests or customer data are used.
function runtime() {
  const timers = [];
  const document = element();
  document.activeElement = null;
  const nav = element();
  const group = element();
  const toggle = element();
  const panel = element();
  const link = element();
  group.querySelector = selector => selector === '.nav-group-toggle' ? toggle : panel;
  group.contains = target => [group, toggle, panel, link].includes(target);
  panel.querySelector = () => link;
  nav.querySelectorAll = selector => selector === '.nav-group' || group.classList.contains('is-open') ? [group] : [];
  nav.contains = group.contains;
  for (const target of [toggle, link]) {
    target.focus = () => { document.activeElement = target; group.dispatch('focusin', { target }); };
  }
  const source = fs.readFileSync(path.join(__dirname, '..', 'nav.js'), 'utf8');
  const anchor = "\n  if (typeof module !== 'undefined' && module.exports) {";
  assert.ok(source.includes(anchor));
  const context = vm.createContext({ window: { setTimeout(fn) { timers.push(fn); } }, console });
  vm.runInContext(source.replace(anchor, '\n  globalThis.bindDesktop = bindDesktop;' + anchor), context);
  context.document = document;
  context.bindDesktop(nav);
  return { document, nav, group, toggle, panel, link, flush() { while (timers.length) timers.shift()(); } };
}

function element() {
  const values = new Set();
  const attrs = new Map();
  const listeners = new Map();
  return {
    classList: {
      contains(name) { return values.has(name); },
      toggle(name, open) { if (open) values.add(name); else values.delete(name); },
    },
    setAttribute(name, value) { attrs.set(name, value); },
    getAttribute(name) { return attrs.get(name); },
    addEventListener(name, callback) {
      if (!listeners.has(name)) listeners.set(name, []);
      listeners.get(name).push(callback);
    },
    dispatch(name, detail = {}) {
      const event = { preventDefault() {}, ...detail };
      for (const callback of listeners.get(name) || []) callback(event);
    },
  };
}

function openByKeyboard(h) {
  h.toggle.focus();
  h.toggle.dispatch('keydown', { key: 'ArrowDown' });
}

test('focusing a desktop disclosure does not consume the first activation', () => {
  const h = runtime();
  h.toggle.focus();
  h.toggle.dispatch('click'); // Native Enter, Space and touch all activate a button.
  assert.equal(h.toggle.getAttribute('aria-expanded'), 'true');
  assert.equal(h.group.classList.contains('is-open'), true);
  h.toggle.dispatch('click');
  assert.equal(h.toggle.getAttribute('aria-expanded'), 'false');
});

test('ArrowDown opens the disclosure and focuses its first destination', () => {
  const h = runtime();
  openByKeyboard(h);
  assert.equal(h.toggle.getAttribute('aria-expanded'), 'true');
  assert.equal(h.document.activeElement, h.link);
});

test('Escape from a destination returns focus and leaves the disclosure closed', () => {
  const h = runtime();
  openByKeyboard(h);
  h.panel.dispatch('keydown', { key: 'Escape' });
  h.document.dispatch('keydown', { key: 'Escape' });
  assert.equal(h.document.activeElement, h.toggle);
  assert.equal(h.toggle.getAttribute('aria-expanded'), 'false');
  assert.equal(h.group.classList.contains('is-open'), false);
});

test('moving the pointer away preserves a menu containing keyboard focus', () => {
  const h = runtime();
  openByKeyboard(h);
  h.group.dispatch('pointerenter', { pointerType: 'mouse' });
  h.group.dispatch('mouseenter');
  h.group.dispatch('pointerleave', { pointerType: 'mouse' });
  h.group.dispatch('mouseleave');
  assert.equal(h.toggle.getAttribute('aria-expanded'), 'true');
  assert.equal(h.document.activeElement, h.link);
});

test('hover opens a menu and leaving it without keyboard focus closes it', () => {
  const h = runtime();
  h.group.dispatch('pointerenter', { pointerType: 'mouse' });
  h.group.dispatch('mouseenter');
  assert.equal(h.toggle.getAttribute('aria-expanded'), 'true');
  h.group.dispatch('pointerleave', { pointerType: 'mouse' });
  h.group.dispatch('mouseleave');
  assert.equal(h.toggle.getAttribute('aria-expanded'), 'false');
});

test('Tab leaving the group closes it after focus settles', () => {
  const h = runtime();
  openByKeyboard(h);
  h.group.dispatch('focusout');
  h.document.activeElement = element();
  h.flush();
  assert.equal(h.toggle.getAttribute('aria-expanded'), 'false');
});

test('touch contact does not hover-open before the activation click', () => {
  const h = runtime();
  h.group.dispatch('pointerenter', { pointerType: 'touch' });
  h.toggle.focus();
  assert.equal(h.group.classList.contains('is-open'), false);
  h.toggle.dispatch('click');
  assert.equal(h.toggle.getAttribute('aria-expanded'), 'true');
});

test('closed mobile drawer becomes inert before focus returns to its trigger', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'nav.js'), 'utf8');
  const body = source.slice(source.indexOf('  function syncMobileOpenState('), source.indexOf('  function setMobileOpen('));
  const drawer = element();
  drawer.removeAttribute = name => drawer.setAttribute(name, null);
  const steps = [];
  const context = vm.createContext({
    document: { body: { classList: { toggle() {} }, style: {} }, activeElement: {} },
    setMobileBackgroundInert(_drawer, open) { steps.push(['background', open]); },
    focusFirstMobileControl() { assert.equal(drawer.getAttribute('inert'), null); steps.push(['focus', 'drawer']); },
    restoreMobileFocus() { assert.notEqual(drawer.getAttribute('inert'), null); steps.push(['focus', 'trigger']); },
  });
  vm.runInContext(body, context);
  context.syncMobileOpenState(drawer);
  assert.notEqual(drawer.getAttribute('inert'), null);
  drawer.classList.toggle('active', true);
  context.syncMobileOpenState(drawer);
  drawer.classList.toggle('active', false);
  context.syncMobileOpenState(drawer);
  assert.deepEqual(steps, [['background', true], ['focus', 'drawer'], ['background', false], ['focus', 'trigger']]);
});

test('in-place language switching updates menu destinations and overrides a stale lang query', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'nav.js'), 'utf8');
  const anchor = "\n  if (typeof module !== 'undefined' && module.exports) {";
  const context = vm.createContext({ window: { location: { pathname: '/blog.html', search: '?lang=en' } }, URLSearchParams });
  vm.runInContext(source.replace(anchor, '\n  globalThis.syncLanguage = syncLangButtons; globalThis.readLanguage = currentLang;' + anchor), context);
  const link = element();
  link.querySelector = () => ({ getAttribute() { return 'nav.kittens'; } });
  link.setAttribute('href', '/en/kittens.html');
  context.document = {
    body: { getAttribute() { return null; } },
    documentElement: { getAttribute() { return 'ja'; } },
    querySelectorAll(selector) { return selector === '.lang-btn' ? [] : [link]; },
  };
  assert.equal(context.readLanguage(), 'en');
  for (const lang of ['zh', 'ja', 'en']) {
    context.syncLanguage(lang);
    assert.equal(link.getAttribute('href'), lang === 'ja' ? '/kittens.html' : '/' + lang + '/kittens.html');
    assert.equal(context.readLanguage(), lang);
  }
});

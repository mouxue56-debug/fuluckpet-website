'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const HTML = fs.readFileSync(path.join(ROOT, 'admin/index.html'), 'utf8');
const CORE = fs.readFileSync(path.join(ROOT, 'admin/js/admin-core.js'), 'utf8');
const CALENDAR = fs.readFileSync(path.join(ROOT, 'admin/js/admin-calendar.js'), 'utf8');

const MODAL_IDS = [
  'kittenFormModal',
  'smallAnimalFormModal',
  'parentFormModal',
  'reviewFormModal',
  'photoModal',
  'faqFormModal',
  'articleFormModal',
];

test('all twelve SPA navigation controls use native button semantics', () => {
  const buttons = [...HTML.matchAll(/<button\b[^>]*class="nav-item(?: active)?"[^>]*data-page="([^"]+)"[^>]*>/g)];
  assert.equal(buttons.length, 12);
  assert.ok(buttons.every((match) => /\btype="button"/.test(match[0])));
  assert.doesNotMatch(HTML, /<div\b[^>]*class="nav-item(?: active)?"[^>]*data-page=/);
  assert.match(buttons[0][0], /\baria-current="page"/);
  assert.match(HTML, /\.nav-item:focus-visible\s*\{/);
});

test('all seven admin form modals expose labelled dialog semantics', () => {
  for (const id of MODAL_IDS) {
    const match = HTML.match(new RegExp('<div\\b[^>]*class="modal-overlay"[^>]*id="' + id + '"[^>]*>'));
    assert.ok(match, id + ' overlay must exist');
    assert.match(match[0], /\brole="dialog"/);
    assert.match(match[0], /\baria-modal="true"/);
    assert.match(match[0], /\baria-labelledby="[^"]+"/);
    assert.match(match[0], /\baria-hidden="true"/);
  }
});

function classList(initial) {
  const values = new Set(String(initial || '').split(/\s+/).filter(Boolean));
  return {
    add(...names) { names.forEach((name) => values.add(name)); },
    remove(...names) { names.forEach((name) => values.delete(name)); },
    contains(name) { return values.has(name); },
  };
}

function modalNode(document, id, focusables = []) {
  const attributes = new Map([['aria-hidden', 'true']]);
  const node = {
    id,
    hidden: false,
    disabled: false,
    isConnected: true,
    classList: classList('modal-overlay'),
    setAttribute(name, value) { attributes.set(name, String(value)); },
    getAttribute(name) { return attributes.has(name) ? attributes.get(name) : null; },
    hasAttribute(name) { return attributes.has(name); },
    querySelector(selector) {
      if (selector === '[autofocus]') return focusables.find((item) => item.autofocus) || null;
      return null;
    },
    querySelectorAll() { return focusables; },
    contains(candidate) { return candidate === node || focusables.includes(candidate); },
    focus() { document.activeElement = node; },
  };
  return node;
}

function focusable(document, id, rectCount = 1) {
  const attributes = new Map();
  return {
    id,
    hidden: false,
    disabled: false,
    isConnected: true,
    autofocus: false,
    setAttribute(name, value) { attributes.set(name, String(value)); },
    getAttribute(name) { return attributes.has(name) ? attributes.get(name) : null; },
    getClientRects() { return Array.from({ length: rectCount }, () => ({})); },
    focus() { document.activeElement = this; },
  };
}

function modalHarness() {
  const listeners = Object.create(null);
  const elements = new Map();
  const document = {
    activeElement: null,
    body: {},
    getElementById(id) { return elements.get(id) || null; },
    querySelectorAll(selector) {
      if (selector === '.modal-overlay.active') {
        return [...elements.values()].filter((node) => node.classList && node.classList.contains('active'));
      }
      return [];
    },
    addEventListener(type, listener) { (listeners[type] ||= []).push(listener); },
  };

  const marker = '// Modal & Toast';
  const start = CORE.indexOf(marker);
  const end = CORE.indexOf('function showToast', start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const source = CORE.slice(start + marker.length, end);
  const context = vm.createContext({ document, console });
  vm.runInContext(source, context, { filename: 'admin-core-modal-a11y.js' });

  return {
    context,
    document,
    elements,
    keydown(event) {
      (listeners.keydown || []).forEach((listener) => listener(event));
    },
  };
}

test('modal opening focuses inside and closing restores the trigger', () => {
  const h = modalHarness();
  const trigger = focusable(h.document, 'trigger');
  const close = focusable(h.document, 'close');
  const save = focusable(h.document, 'save');
  const modal = modalNode(h.document, 'exampleModal', [close, save]);
  h.elements.set(modal.id, modal);
  h.document.activeElement = trigger;

  h.context.openModal(modal.id);

  assert.equal(modal.classList.contains('active'), true);
  assert.equal(modal.getAttribute('aria-hidden'), 'false');
  assert.equal(h.document.activeElement, close);

  h.context.closeModal(modal.id);

  assert.equal(modal.classList.contains('active'), false);
  assert.equal(modal.getAttribute('aria-hidden'), 'true');
  assert.equal(h.document.activeElement, trigger);
});

test('modal focus order excludes controls hidden by CSS', () => {
  const h = modalHarness();
  const trigger = focusable(h.document, 'trigger');
  const cssHidden = focusable(h.document, 'css-hidden', 0);
  const visible = focusable(h.document, 'visible');
  const modal = modalNode(h.document, 'exampleModal', [cssHidden, visible]);
  h.elements.set(modal.id, modal);
  h.document.activeElement = trigger;

  h.context.openModal(modal.id);

  assert.equal(h.document.activeElement, visible);
});

test('active modal traps Tab in both directions and Escape closes it', () => {
  const h = modalHarness();
  const trigger = focusable(h.document, 'trigger');
  const first = focusable(h.document, 'first');
  const last = focusable(h.document, 'last');
  const modal = modalNode(h.document, 'exampleModal', [first, last]);
  h.elements.set(modal.id, modal);
  h.document.activeElement = trigger;
  h.context.openModal(modal.id);

  let prevented = 0;
  h.document.activeElement = last;
  h.keydown({ key: 'Tab', shiftKey: false, preventDefault() { prevented++; } });
  assert.equal(h.document.activeElement, first);

  h.document.activeElement = first;
  h.keydown({ key: 'Tab', shiftKey: true, preventDefault() { prevented++; } });
  assert.equal(h.document.activeElement, last);
  assert.equal(prevented, 2);

  h.keydown({ key: 'Escape', preventDefault() { prevented++; } });
  assert.equal(modal.classList.contains('active'), false);
  assert.equal(h.document.activeElement, trigger);
  assert.equal(prevented, 3);
});

function calendarNode(id, document) {
  const listeners = Object.create(null);
  const attrs = new Map();
  const node = {
    id,
    value: '',
    textContent: '',
    style: {},
    dataset: {},
    checked: true,
    className: '',
    classList: classList(),
    children: [],
    setAttribute(name, value) { attrs.set(name, String(value)); },
    getAttribute(name) { return attrs.has(name) ? attrs.get(name) : null; },
    addEventListener(type, listener) { (listeners[type] ||= []).push(listener); },
    querySelectorAll(selector) {
      if (selector === '.cal-cell') return node.children;
      return [];
    },
    reset() {},
    focus() { document.activeElement = node; },
    dispatch(type, event) {
      (listeners[type] || []).forEach((listener) => listener(Object.assign({ currentTarget: node, target: node }, event)));
    },
  };
  Object.defineProperty(node, 'innerHTML', {
    get() { return node._innerHTML || ''; },
    set(value) {
      node._innerHTML = String(value);
      if (id !== 'calGrid') return;
      node.children = [];
      const tagPattern = /<(?:div|button)\b([^>]*\bdata-date="([^"]+)"[^>]*)>/g;
      let match;
      while ((match = tagPattern.exec(node._innerHTML))) {
        const cell = calendarNode('cell-' + match[2], document);
        cell.dataset.date = match[2];
        const role = match[1].match(/\brole="([^"]+)"/);
        const tabindex = match[1].match(/\btabindex="([^"]+)"/);
        if (role) cell.setAttribute('role', role[1]);
        if (tabindex) cell.setAttribute('tabindex', tabindex[1]);
        node.children.push(cell);
      }
    },
  });
  return node;
}

function calendarHarness() {
  const elements = new Map();
  const docListeners = Object.create(null);
  const document = {
    activeElement: null,
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, calendarNode(id, document));
      return elements.get(id);
    },
    querySelectorAll() { return []; },
    addEventListener(type, listener) { (docListeners[type] ||= []).push(listener); },
    execCommand() { return true; },
  };
  const injection = [
    'window.__calendarA11yTest = {',
    '  setView: function(year, month) { viewYear = year; viewMonth = month; },',
    '  renderGrid: renderGrid',
    '};',
    '',
    "  document.addEventListener('DOMContentLoaded'",
  ].join('\n');
  const source = CALENDAR.replace("document.addEventListener('DOMContentLoaded'", injection);
  const context = vm.createContext({
    console,
    document,
    localStorage: { getItem() { return null; }, setItem() {} },
    sessionStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    location: { reload() {} },
    navigator: {},
    confirm() { return true; },
    fetch() { return Promise.resolve({ json: () => Promise.resolve({ success: false }) }); },
    setTimeout,
    clearTimeout,
  });
  context.window = context;
  vm.runInContext(source, context, { filename: 'admin-calendar.js' });
  return { context, document, elements };
}

test('calendar date cells are focusable buttons for Enter and Space', () => {
  const h = calendarHarness();
  h.context.__calendarA11yTest.setView(2026, 6);
  h.context.__calendarA11yTest.renderGrid();

  const cells = h.elements.get('calGrid').children;
  assert.equal(cells.length, 42);
  assert.ok(cells.every((cell) => cell.getAttribute('role') === 'button'));
  assert.ok(cells.every((cell) => cell.getAttribute('tabindex') === '0'));

  let enterPrevented = false;
  cells[0].dispatch('keydown', { key: 'Enter', preventDefault() { enterPrevented = true; } });
  assert.equal(enterPrevented, true);
  assert.equal(h.elements.get('dayPanelOverlay').classList.contains('active'), true);
  assert.equal(h.elements.get('evtStart').value, cells[0].dataset.date);

  h.context.__calendarA11yTest.renderGrid();
  const refreshedCells = h.elements.get('calGrid').children;
  let spacePrevented = false;
  refreshedCells[1].dispatch('keydown', { key: ' ', preventDefault() { spacePrevented = true; } });
  assert.equal(spacePrevented, true);
  assert.equal(h.elements.get('evtStart').value, refreshedCells[1].dataset.date);
});

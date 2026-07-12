'use strict';

const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');

function trackedFiles(glob) {
  return childProcess.execFileSync('git', ['ls-files', glob], {
    cwd: ROOT,
    encoding: 'utf8',
  }).trim().split('\n').filter(Boolean);
}

function cssDeclarations(css, selector) {
  const declarations = [];
  for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = match[1].replace(/\/\*[\s\S]*?\*\//g, '').split(',').map((part) => part.trim());
    if (selectors.includes(selector)) {
      declarations.push(match[2]);
    }
  }
  return declarations.join('\n');
}

function relativeLuminance(hex) {
  const channels = hex.match(/[0-9a-f]{2}/gi).map((value) => Number.parseInt(value, 16) / 255);
  return channels
    .map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
    .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
}

function contrastRatio(foreground, background) {
  const lighter = Math.max(relativeLuminance(foreground), relativeLuminance(background));
  const darker = Math.min(relativeLuminance(foreground), relativeLuminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

function cssHexVariables(css) {
  const variables = new Map();
  for (const match of css.matchAll(/--([a-z0-9-]+)\s*:\s*(#[0-9a-f]{6})\s*;/gi)) {
    variables.set(match[1], match[2]);
  }
  return variables;
}

function inlineStyleProperty(tag, property) {
  const style = tag.match(/\bstyle=["']([^"']*)["']/i);
  assert.ok(style, 'CTA exposes an inline style declaration');
  const value = style[1].match(new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`, 'i'));
  assert.ok(value, `CTA inline style defines ${property}`);
  return value[1].trim();
}

function resolveCssHex(value, variables) {
  if (/^#[0-9a-f]{6}$/i.test(value)) return value;
  const variable = value.match(/^var\(--([a-z0-9-]+)\)$/i);
  assert.ok(variable, `expected a hex color or one CSS variable, received ${value}`);
  const resolved = variables.get(variable[1]);
  assert.ok(resolved, `CSS variable --${variable[1]} resolves to a hex color`);
  return resolved;
}

function createElement(attributes = {}, text = '') {
  const attrs = { ...attributes };
  const listeners = new Map();
  return {
    childNodes: [],
    classList: { toggle() {} },
    innerHTML: text,
    textContent: text,
    getAttribute(name) { return Object.hasOwn(attrs, name) ? attrs[name] : null; },
    setAttribute(name, value) { attrs[name] = String(value); },
    querySelector() { return null; },
    addEventListener(type, listener) { listeners.set(type, listener); },
    click() {
      const listener = listeners.get('click');
      if (listener) listener.call(this);
    },
  };
}

function runI18nWithBookingCta() {
  const source = read('i18n.js');
  const bookingLabel = createElement({ 'data-i18n': 'cta.booking' }, '見学予約');
  const bookingCta = createElement({
    'data-cta': 'booking',
    'aria-label': '見学を予約する',
  });
  Object.defineProperties(bookingCta, {
    textContent: {
      get() { return bookingLabel.textContent; },
      set(value) { bookingLabel.textContent = value; },
    },
    innerText: { get() { return bookingLabel.textContent; } },
  });

  const languageButtons = ['en', 'zh'].map((lang) => createElement({ 'data-lang': lang }));
  const documentListeners = new Map();
  const document = {
    documentElement: { lang: 'ja' },
    querySelectorAll(selector) {
      if (selector === '[data-i18n]') return [bookingLabel];
      if (selector === '.lang-btn') return languageButtons;
      if (selector === '[data-cta]') return [bookingCta];
      return [];
    },
    addEventListener(type, listener) {
      if (!documentListeners.has(type)) documentListeners.set(type, []);
      documentListeners.get(type).push(listener);
    },
    createTextNode(text) { return { nodeType: 3, textContent: text }; },
  };
  const storage = new Map();
  const window = {
    location: { pathname: '/', search: '', href: '' },
    dispatchEvent() {},
  };
  vm.runInNewContext(source, {
    console,
    CustomEvent: function CustomEvent(type, init) { this.type = type; this.detail = init && init.detail; },
    document,
    localStorage: {
      getItem(key) { return storage.has(key) ? storage.get(key) : null; },
      setItem(key, value) { storage.set(key, String(value)); },
    },
    URLSearchParams,
    window,
  }, { filename: 'i18n.js' });

  const ready = documentListeners.get('DOMContentLoaded') || [];
  assert.equal(ready.length, 1, 'i18n registers one DOMContentLoaded initializer');
  ready[0]();

  return { bookingCta, bookingLabel, languageButtons };
}

test('diary landing and generator preserve a working skip target', () => {
  for (const relative of ['diary/index.html', 'tools/generate-diary.js']) {
    const source = read(relative);
    assert.match(source, /<a\b(?=[^>]*class=["']skip-link["'])(?=[^>]*href=["']#main["'])[^>]*>/, `${relative}: skip link targets #main`);
    assert.match(source, /<main\b(?=[^>]*id=["']main["'])[^>]*>/, `${relative}: main landmark exposes id=main`);
  }
});

test('booking CTA accessible name follows its visible label in Japanese, English, and Chinese', () => {
  const { bookingCta, bookingLabel, languageButtons } = runI18nWithBookingCta();

  assert.equal(bookingCta.getAttribute('aria-label'), bookingLabel.textContent.trim(), 'default Japanese initialization removes the stale longer label');
  const japanese = bookingLabel.textContent;

  languageButtons[0].click();
  assert.notEqual(bookingLabel.textContent, japanese, 'English translation is applied');
  assert.equal(bookingCta.getAttribute('aria-label'), bookingLabel.textContent.trim(), 'English accessible name follows visible text');
  const english = bookingLabel.textContent;

  languageButtons[1].click();
  assert.notEqual(bookingLabel.textContent, japanese, 'Chinese translation is applied');
  assert.notEqual(bookingLabel.textContent, english, 'Chinese label differs from English');
  assert.equal(bookingCta.getAttribute('aria-label'), bookingLabel.textContent.trim(), 'Chinese accessible name follows visible text');
});

test('white-text LINE controls share the accessible dark green token', () => {
  const style = read('style.css');
  const chat = read('assets/chat/widget.css');
  const token = style.match(/--line-green\s*:\s*(#[0-9a-f]{6})\s*;/i);

  assert.ok(token, 'LINE color token exists');
  assert.equal(token[1].toUpperCase(), '#07843F');
  assert.ok(contrastRatio(token[1], '#FFFFFF') >= 4.5, 'white text meets WCAG AA contrast on the LINE token');
  for (const selector of ['.btn-line', '.mobile-cta-bar a.cta-line', '.fixed-line', '.cta-widget-line']) {
    assert.match(cssDeclarations(style, selector), /background(?:-color)?\s*:\s*var\(--line-green\)/, `${selector} uses the shared LINE token`);
  }
  assert.match(cssDeclarations(chat, '.fuluck-chat-faq-line'), /background(?:-color)?\s*:\s*#07843F/i, 'chat LINE CTA uses the same accessible green');
  for (const relative of [
    'style.css',
    'assets/chat/widget.css',
    'script.js',
    'kitten-carousel.js',
    'tools/generate-site.js',
    'tools/generate-diary.js',
    'tools/gen-blog-edu-pages.mjs',
    'tools/gen-blog-static-pages.mjs',
  ]) {
    assert.doesNotMatch(read(relative), /#(?:06c755|05a648|05b34c)\b/i, `${relative}: generated LINE controls cannot restore a low-contrast green`);
  }
  for (const relative of trackedFiles('*.html').filter((file) => !file.startsWith('admin/'))) {
    const withoutBrandSvg = read(relative).replace(/<svg\b[^>]*\bfill=["']#06c755["'][^>]*>/gi, '<svg>');
    assert.doesNotMatch(withoutBrandSvg, /#(?:06c755|05a648|05b34c)\b/i, `${relative}: white-text LINE controls use the accessible green`);
  }
  assert.match(read('index.html'), /<svg\b[^>]*\bfill=["']#06C755["']/i, 'the LINE brand SVG keeps its official icon color');
});

test('homepage guide entrance keeps its mint fill with dark text', () => {
  const html = read('index.html');
  const style = read('style.css');
  const tag = html.match(/<a\b(?=[^>]*data-i18n=["']guide\.entrance\.btn["'])[^>]*>/);

  assert.ok(tag, 'guide entrance CTA exists');
  assert.match(tag[0], /background\s*:\s*var\(--mint\)/);
  const variables = cssHexVariables(style);
  const background = resolveCssHex(inlineStyleProperty(tag[0], 'background'), variables);
  const foreground = resolveCssHex(inlineStyleProperty(tag[0], 'color'), variables);
  const ratio = contrastRatio(foreground, background);
  assert.ok(ratio >= 4.5, `guide CTA contrast is ${ratio.toFixed(2)}:1 (${foreground} on ${background})`);
});

test('mobile estimator title breaks only at the natural phrase boundary', () => {
  const html = read('boarding/estimate.html');
  const style = read('services.css');

  assert.match(html, /<h1>お預かり料金<wbr\s*\/?>(?:\s*)シミュレーター<\/h1>/);
  assert.match(style, /@media\s*\(max-width:\s*600px\)\s*\{[\s\S]*?\.estimate-intro h1\s*\{[^}]*word-break\s*:\s*keep-all\s*;/, 'mobile title honors only the explicit break opportunity');
});

test('every deployed Admin HTML page opts out of indexing and link following', () => {
  const missing = [];

  for (const relative of trackedFiles('admin/*.html')) {
    const html = read(relative);
    const head = html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i);
    assert.ok(head, `${relative}: head exists`);

    const robotsTag = [...head[1].matchAll(/<meta\b[^>]*>/gi)]
      .find((match) => /\bname=["']robots["']/i.test(match[0]));
    const content = robotsTag && robotsTag[0].match(/\bcontent=["']([^"']*)["']/i);
    const directives = new Set((content ? content[1] : '').toLowerCase().split(',').map((value) => value.trim()).filter(Boolean));
    if (!directives.has('noindex') || !directives.has('nofollow')) missing.push(relative);
  }

  assert.deepEqual(missing, [], 'every tracked Admin HTML head declares both noindex and nofollow');
});

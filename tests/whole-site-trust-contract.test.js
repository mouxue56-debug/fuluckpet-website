'use strict';

const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

const PRICE_COPY = {
  ja: '料金は子猫ごとに異なります。各子猫ページの最新情報をご確認いただくか、LINEでお問い合わせください。',
  en: 'Prices vary by kitten. Please check the latest details on each kitten page or contact us on LINE.',
  zh: '价格因猫咪而异。请查看每只猫咪页面的最新信息，或通过 LINE 咨询。',
};

const VISIT_COPY = {
  ja: '見学は完全予約制です。ご希望の日時は予約ページまたはLINEからお知らせください。平日・土日いずれも対応可能です。見学時間は約30分〜1時間を目安にしてください。',
  en: 'Visits are by appointment only. Please share your preferred date and time through the booking page or LINE. Weekdays and weekends are available. Please allow about 30 minutes to 1 hour for your visit.',
  zh: '参观采用完全预约制。请通过预约页面或 LINE 告知希望的日期和时间。平日和周末均可，每次参观请预留约 30 分钟至 1 小时。',
};

test('public FAQ copy names real channels and contains no invented form or hardcoded range', () => {
  for (const file of ['faq.html', 'index.html', 'i18n.js']) {
    const source = read(file);
    assert.doesNotMatch(source, /お問い合わせフォーム|contact form|联系表单/i, file);
    assert.doesNotMatch(source, /14万円|16万円|29万円|140,000|160,000|290,000/, file);
  }

  const faq = read('faq.html');
  const i18n = read('i18n.js');
  for (const text of Object.values(PRICE_COPY)) assert.ok(faq.includes(text) || i18n.includes(text), text);
  assert.ok(faq.includes(PRICE_COPY.ja), 'static FAQ and FAQ JSON-LD use the reviewed Japanese price copy');
  assert.match(faq, /href=["']\/booking\.html["']/);
  assert.match(faq, /href=["']https:\/\/page\.line\.me\/915hnnlk/);
});

test('visit guidance uses one reviewed duration and real booking channels on static fallbacks', () => {
  const faq = read('faq.html');
  const home = read('index.html');
  const i18n = read('i18n.js');
  const trust = read('faq-trust-copy.js');

  assert.ok(faq.includes(VISIT_COPY.ja), 'FAQ HTML and JSON-LD use the reviewed visit guidance');
  assert.ok(home.includes(VISIT_COPY.ja), 'homepage static fallback uses the reviewed visit guidance');
  for (const copy of Object.values(VISIT_COPY)) {
    assert.ok(i18n.includes(copy), `i18n includes: ${copy}`);
    assert.ok(trust.includes(copy), `trust override includes: ${copy}`);
  }
  const homeFaq = home.slice(home.indexOf('<!-- ========== FAQ ========== -->'), home.indexOf('<!-- ========== FAQ ========== -->') + 9000);
  assert.match(homeFaq, /href=["']\/booking\.html["']/);
  assert.match(homeFaq, /href=["']https:\/\/page\.line\.me\/915hnnlk/);
  assert.doesNotMatch(`${faq}\n${trust}`, /見学時間は約1〜2時間|allow about 1–2 hours|预留约 1〜2 小时/);
});

test('runtime navigation exposes distinct truthful destinations without owner-gated boarding', () => {
  const nav = require('../nav.js');
  const items = nav.navGroups().flatMap((group) => group.items);
  assert.equal(items.find((item) => item.key === 'nav.about').href, '/#about');
  assert.equal(items.find((item) => item.key === 'nav.aboutPage').href, '/about.html');
  assert.equal(items.find((item) => item.key === 'nav.diary').featured, undefined);
  assert.equal(items.some((item) => item.key === 'nav.boarding'), false);
});

test('FAQ trust override ignores prototype-named or unknown API ids', () => {
  const trust = require('../faq-trust-copy.js');
  const source = { id: '__proto__', question: { ja: '原文' }, answer: { ja: '回答' } };
  assert.deepEqual(trust.applyTrustOverrides([source]), [source]);
  assert.deepEqual(trust.linksFor('__proto__', 'ja'), []);
  assert.deepEqual(trust.linksFor('unknown', 'ja'), []);
});

test('owner-gated boarding has no public inbound links', () => {
  const files = childProcess.execFileSync('git', ['ls-files', '*.html'], { cwd: ROOT, encoding: 'utf8' })
    .trim()
    .split('\n')
    .filter(Boolean);
  for (const file of files) {
    assert.doesNotMatch(read(file), /href\s*=\s*["']\/boarding\//i, file);
  }
});

test('boarding direct URLs are neutral trilingual noindex gates', () => {
  const required = [
    'お預かりサービスは現在準備中です。',
    'Our boarding service is currently in preparation.',
    '寄养服务目前正在准备中。',
  ];
  for (const file of ['boarding/index.html', 'boarding/estimate.html']) {
    const source = read(file);
    const visible = (source.match(/<body\b[\s\S]*<\/body>/i) || [''])[0];
    assert.match(source, /<meta\s+name=["']robots["']\s+content=["'][^"']*noindex/i, file);
    assert.match(source, /<link\s+rel=["']icon["']/i, `${file}: explicit icon prevents a console-visible favicon 404`);
    required.forEach((copy) => assert.ok(source.includes(copy), `${file}: ${copy}`));
    assert.doesNotMatch(visible, /[\u00a5円]\s*[0-9]|\b(?:estimate|calculator)\b|料金シミュレーター/i, file);
    assert.doesNotMatch(source, /<form\b|<input\b|<select\b|\/booking\.html|page\.line\.me|boarding-(?:config|calc|estimate)\.js/i, file);
    assert.doesNotMatch(source, /登録番号\s*[:：]?\s*(?:<|$)|["']@type["']\s*:\s*["'](?:Service|Offer)["']/i, file);
  }
});

class FakeElement {
  constructor(tagName) {
    this.tagName = String(tagName).toUpperCase();
    this.children = [];
    this.parentElement = null;
    this.dataset = {};
    this.attributes = {};
    this.className = '';
    this.id = '';
    this._text = '';
    this._listeners = Object.create(null);
    const self = this;
    this.classList = {
      contains(name) { return self.className.split(/\s+/).includes(name); },
      add(...names) { self.className = [...new Set(self.className.split(/\s+/).filter(Boolean).concat(names))].join(' '); },
      remove(...names) { self.className = self.className.split(/\s+/).filter((name) => name && !names.includes(name)).join(' '); },
    };
  }
  set textContent(value) { this._text = String(value == null ? '' : value); this.children = []; }
  get textContent() { return this._text + this.children.map((child) => child.textContent).join(''); }
  appendChild(child) {
    if (child.tagName === '#FRAGMENT') {
      child.children.slice().forEach((nested) => this.appendChild(nested));
      return child;
    }
    child.parentElement = this;
    this.children.push(child);
    return child;
  }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] || null; }
  addEventListener(type, listener) { this._listeners[type] = listener; }
  querySelectorAll(selector) {
    const className = selector.startsWith('.') ? selector.slice(1) : null;
    const matches = [];
    (function visit(node) {
      node.children.forEach((child) => {
        if (className && child.classList.contains(className)) matches.push(child);
        visit(child);
      });
    }(this));
    return matches;
  }
}

function runLoader(file, surface) {
  const home = new FakeElement('div');
  const list = new FakeElement('div');
  const filters = new FakeElement('div');
  const events = {};
  const storage = new Map([['fuluckpet-lang', 'ja']]);
  const document = {
    querySelector(selector) { return surface === 'home' && selector === '.faq-list' ? home : null; },
    getElementById(id) {
      if (surface !== 'page') return null;
      return id === 'faqList' ? list : id === 'faqFilters' ? filters : null;
    },
    createElement(tag) { return new FakeElement(tag); },
    createDocumentFragment() { return new FakeElement('#fragment'); },
    createTextNode(value) { const node = new FakeElement('#text'); node.textContent = value; return node; },
  };
  const window = { addEventListener(type, listener) { events[type] = listener; } };
  const context = vm.createContext({
    document,
    window,
    localStorage: { getItem(key) { return storage.get(key) || null; } },
    fetch() {
      return Promise.resolve({ json() {
        return Promise.resolve([
          { id: 'faq_2', category: 'general', question: { ja: 'OLD VISIT' }, answer: { ja: 'お問い合わせフォーム' } },
          { id: 'faq_4', category: 'purchase', question: { ja: 'OLD PRICE' }, answer: { ja: '16万円〜29万円' } },
        ]);
      } });
    },
  });
  vm.runInContext(read('faq-trust-copy.js'), context, { filename: 'faq-trust-copy.js' });
  vm.runInContext(read(file), context, { filename: file });
  return { root: surface === 'home' ? home : list, events, storage };
}

for (const [file, surface] of [['faq-loader.js', 'home'], ['faq-page-loader.js', 'page']]) {
  test(`${file} overrides stale successful API trust facts in JA EN ZH`, async () => {
    const result = runLoader(file, surface);
    await new Promise(setImmediate);
    for (const lang of ['ja', 'en', 'zh']) {
      result.storage.set('fuluckpet-lang', lang);
      if (lang !== 'ja') result.events.langChanged();
      assert.match(result.root.textContent, new RegExp(PRICE_COPY[lang].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
      assert.match(result.root.textContent, new RegExp(VISIT_COPY[lang].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
      assert.doesNotMatch(result.root.textContent, /お問い合わせフォーム|16万円|29万円|OLD (?:VISIT|PRICE)/i);
    }
  });
}

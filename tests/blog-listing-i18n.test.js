'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function textNode(value) {
  return { nodeType: 3, textContent: String(value) };
}

function el(tag, attrs, children) {
  const node = {
    nodeType: 1,
    tagName: String(tag).toUpperCase(),
    attrs: Object.assign({}, attrs || {}),
    childNodes: [],
    parentNode: null,
    style: {},
    matches(selector) {
      if (selector === 'svg, .ico') {
        return this.tagName === 'I' && classList(this).includes('ico');
      }
      if (selector.startsWith('#')) return this.attrs.id === selector.slice(1);
      if (selector.startsWith('.')) return classList(this).includes(selector.slice(1));
      if (selector.includes('[')) {
        const match = selector.match(/^([a-z0-9-]*)\[([^=]+)="([^"]+)"\]$/i);
        if (!match) return false;
        if (match[1] && this.tagName !== match[1].toUpperCase()) return false;
        return this.getAttribute(match[2]) === match[3];
      }
      return this.tagName === selector.toUpperCase();
    },
    get id() { return this.attrs.id || ''; },
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(this.attrs, name) ? String(this.attrs[name]) : null;
    },
    setAttribute(name, value) { this.attrs[name] = String(value); },
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; },
    querySelectorAll(selector) { return collect(this, selector); },
    closest(selector) {
      let current = this;
      while (current && current.nodeType === 1) {
        if (current.matches(selector)) return current;
        current = current.parentNode;
      }
      return null;
    },
    appendChild(child) {
      child.parentNode = this;
      this.childNodes.push(child);
      return child;
    },
    get textContent() {
      return this.childNodes.map(child => child.textContent || '').join('');
    },
    set textContent(value) {
      this.childNodes = [textNode(value)];
    },
    get innerHTML() {
      return this.childNodes.map(child => {
        if (child.nodeType === 3) return child.textContent;
        const attrs = Object.keys(child.attrs || {}).map(key => ` ${key}="${child.attrs[key]}"`).join('');
        return `<${String(child.tagName).toLowerCase()}${attrs}>${child.innerHTML}</${String(child.tagName).toLowerCase()}>`;
      }).join('');
    },
    set innerHTML(value) {
      const ico = String(value).match(/<i class="([^"]+)"[^>]*><\/i>\s*([\s\S]*)/);
      if (ico) {
        const icon = el('i', { class: ico[1] });
        this.childNodes = [icon, textNode(ico[2])];
        icon.parentNode = this;
        return;
      }
      this.childNodes = [textNode(String(value).replace(/<[^>]+>/g, ''))];
    },
  };
  (children || []).forEach(child => node.appendChild(child));
  return node;
}

function classList(node) {
  return String((node.attrs && node.attrs.class) || '').split(/\s+/).filter(Boolean);
}

function collect(root, selector) {
  const parts = selector.split(',').map(part => part.trim());
  const found = [];
  function walk(node, chain) {
    if (node.nodeType !== 1) return;
    node.childNodes.forEach(child => {
      if (child.nodeType !== 1) return;
      if (child.matches(chain[0])) {
        if (chain.length === 1) found.push(child);
        else walk(child, chain.slice(1));
      }
      walk(child, chain);
    });
  }
  parts.forEach(part => walk(root, part.split(/\s+/)));
  return unique(found);
}

function unique(nodes) {
  return nodes.filter((node, index) => nodes.indexOf(node) === index);
}

function card(href, cat, title, desc) {
  return el('a', { href, class: 'blog-card' }, [
    el('span', { class: 'blog-card-cat' }, [textNode(cat)]),
    el('h3', { class: 'blog-card-title' }, [textNode(title)]),
    el('p', { class: 'blog-card-desc' }, [textNode(desc)]),
  ]);
}

function buildDom(options = {}) {
  const heroH1 = el('h1', {}, [el('i', { class: 'ico ico-cat' }), textNode(' 猫の知識ライブラリ')]);
  const heroP = el('p', {}, [textNode('日本語サブタイトル')]);
  const tags = [
    el('a', { href: '#breed', class: 'blog-cat-tag' }, [textNode('猫種知識（19）')]),
    el('a', { href: '#lifestyle', class: 'blog-cat-tag' }, [textNode('猫ライフ（31）')]),
  ];
  const heading = el('h2', { class: 'blog-cat-heading', id: 'breed' }, [textNode('猫種知識')]);
  const staticCards = [
    card('/blog/siberian-character.html', '猫種知識', 'サイベリアンの性格と特徴', '性格の説明'),
    card('/blog/siberian-color-types.html', '猫種知識', 'サイベリアンの毛色の種類一覧', '毛色の説明'),
    card('/blog/siberian-weight-size.html', '猫種知識', 'サイベリアンの体重・サイズガイド', '体重の説明'),
    card('/blog/siberian-kitten-feeding-guide.html', '飲食栄養', 'サイベリアン子猫の食事ガイド', '食事の説明'),
    card('/blog/cat-insurance-guide.html', '猫ライフ', 'ペット保険の選び方ガイド', '保険の説明'),
  ];
  const searchCards = [
    card('/blog/cat-cost-monthly.html', '猫ライフ', '猫の飼育費用', '月額'),
    card('/blog/cat-insurance-guide.html', '猫ライフ', 'ペット保険の選び方ガイド', '保険'),
    card('/blog/siberian-cost-breakdown.html', '猫ライフ', 'サイベリアンの飼育費はいくら？', '費用'),
  ];
  const results = el('div', { id: 'blogSearchResults' }, searchCards);
  const ctaHeading = el('h2', {}, [textNode('福楽キャッテリーの子猫を見てみませんか？')]);
  const ctaDesc = el('p', {}, [textNode('健康管理と社会化トレーニングを大切に育てた子猫たちをご紹介しています。')]);
  const kittens = el('a', { href: options.kittensHref || '/kittens.html' }, [
    el('i', { class: 'ico ico-paw-print' }),
    textNode(' 子猫一覧を見る'),
  ]);
  const line = el('a', { href: 'https://page.line.me/915hnnlk' }, [
    el('i', { class: 'ico ico-message-circle' }),
    textNode(' LINEで相談する'),
  ]);
  const cta = el('div', { class: 'blog-bottom-cta' }, [ctaHeading, ctaDesc, kittens, line]);
  const community = el('p', {}, [
    el('a', { href: '/community/' }, [textNode('ご家族・クリエイターの投稿について')]),
    el('a', { href: '/en/community/', lang: 'en', hreflang: 'en' }, [textNode('Share a story')]),
    el('a', { href: '/zh/community/', lang: 'zh', hreflang: 'zh' }, [textNode('分享成长故事')]),
  ]);
  const canonical = el('link', { rel: 'canonical', href: 'https://fuluckpet.com/blog.html' });
  const tree = el('body', {}, [
    el('section', { class: 'blog-hero' }, [heroH1, heroP]),
    community,
    results,
    el('div', { class: 'blog-cat-nav' }, tags),
    heading,
    el('div', { class: 'blog-grid' }, staticCards),
    cta,
  ]);
  const head = el('head', {}, [canonical]);
  const documentElement = { lang: 'ja', getAttribute(name) { return name === 'lang' ? this.lang : null; } };
  function all(selector) {
    if (selector === '.blog-hero h1') return [heroH1];
    if (selector === '.blog-hero p') return [heroP];
    if (selector === '.blog-cat-tag') return tags;
    if (selector === '.blog-cat-heading') return [heading];
    if (selector === '.blog-card') return staticCards.concat(searchCards);
    if (selector === '.blog-bottom-cta h2') return [ctaHeading];
    if (selector === '.blog-bottom-cta p') return [ctaDesc];
    if (selector === '.blog-bottom-cta a') return [kittens, line];
    return collect(tree, selector);
  }
  const document = {
    documentElement,
    readyState: 'complete',
    querySelector(selector) { return all(selector)[0] || tree.querySelector(selector); },
    querySelectorAll(selector) { return all(selector); },
    addEventListener() {},
  };
  return { tree, document, documentElement, staticCards, searchCards, ctaHeading, ctaDesc, kittens, line, community, canonical };
}

function loadApply(document, window) {
  const listing = {};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'blog-listing-i18n.js'), 'utf8'), { window: listing });
  window._blogListingI18n = listing._blogListingI18n;
  const listeners = {};
  window.addEventListener = function(type, fn) { listeners[type] = fn; };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'blog-listing-i18n-apply.js'), 'utf8'), {
    window, document, URL, URLSearchParams, WeakMap, localStorage: window.localStorage,
  });
  return {
    change(lang) {
      document.documentElement.lang = lang;
      listeners.langChanged({ detail: { lang } });
    },
    data: listing._blogListingI18n,
  };
}

test('static card translation skips search results so JA restore cannot retitle the wrong slugs', () => {
  const dom = buildDom();
  const apply = loadApply(dom.document, {
    location: { search: '' },
    localStorage: { getItem() { return 'en'; }, setItem() {} },
  });
  apply.change('en');
  assert.match(dom.staticCards[0].textContent, /Siberian Cat Personality/);
  assert.equal(dom.staticCards[3].getAttribute('href'), '/en/blog/siberian-kitten-feeding-guide.html');
  assert.equal(dom.staticCards[4].getAttribute('href'), '/blog/cat-insurance-guide.html?lang=en');
  assert.equal(dom.searchCards[0].querySelector('.blog-card-title').textContent, '猫の飼育費用');
  assert.equal(dom.searchCards[0].getAttribute('href'), '/blog/cat-cost-monthly.html');
  apply.change('ja');
  assert.equal(dom.staticCards[0].querySelector('.blog-card-title').textContent, 'サイベリアンの性格と特徴');
  assert.equal(dom.staticCards[0].getAttribute('href'), '/blog/siberian-character.html');
  assert.equal(dom.searchCards[0].querySelector('.blog-card-title').textContent, '猫の飼育費用');
  assert.equal(dom.searchCards[1].querySelector('.blog-card-title').textContent, 'ペット保険の選び方ガイド');
  assert.equal(dom.searchCards[2].querySelector('.blog-card-title').textContent, 'サイベリアンの飼育費はいくら？');
  assert.equal(dom.searchCards[0].getAttribute('href'), '/blog/cat-cost-monthly.html');
  assert.equal(dom.searchCards[1].getAttribute('href'), '/blog/cat-insurance-guide.html');
  assert.equal(dom.searchCards[2].getAttribute('href'), '/blog/siberian-cost-breakdown.html');
});

test('language cycling keeps each static card on its own slug and restores the Japanese CTA', () => {
  const dom = buildDom();
  const apply = loadApply(dom.document, {
    location: { search: '' },
    localStorage: { getItem() { return null; }, setItem() {} },
  });
  apply.change('en');
  assert.equal(dom.ctaHeading.textContent, apply.data.cta.en.heading);
  assert.equal(dom.ctaDesc.textContent, apply.data.cta.en.desc);
  assert.match(dom.kittens.textContent, /View Kittens/);
  assert.equal(dom.kittens.getAttribute('href'), '/en/kittens.html');
  assert.equal(dom.line.getAttribute('href'), 'https://page.line.me/915hnnlk');
  apply.change('zh');
  assert.equal(dom.staticCards[3].getAttribute('href'), '/zh/blog/siberian-kitten-feeding-guide.html');
  assert.equal(dom.staticCards[4].getAttribute('href'), '/blog/cat-insurance-guide.html?lang=zh');
  assert.equal(dom.ctaHeading.textContent, apply.data.cta.zh.heading);
  apply.change('en');
  assert.equal(dom.staticCards[0].getAttribute('href'), '/blog/siberian-character.html?lang=en');
  apply.change('ja');
  assert.equal(dom.ctaHeading.textContent, '福楽キャッテリーの子猫を見てみませんか？');
  assert.equal(dom.ctaDesc.textContent, '健康管理と社会化トレーニングを大切に育てた子猫たちをご紹介しています。');
  assert.match(dom.kittens.textContent, /子猫一覧を見る/);
  assert.equal(dom.kittens.getAttribute('href'), '/kittens.html');
  assert.equal(dom.staticCards[3].getAttribute('href'), '/blog/siberian-kitten-feeding-guide.html');
  assert.equal(dom.staticCards[4].getAttribute('href'), '/blog/cat-insurance-guide.html');
  const communityHrefs = collect(dom.community, 'a').map(link => link.getAttribute('href'));
  assert.deepEqual(communityHrefs, ['/community/', '/en/community/', '/zh/community/']);
  assert.equal(dom.canonical.getAttribute('href'), 'https://fuluckpet.com/blog.html');
});

test('explicit lang query is used when document language is still Japanese and storage is unavailable', () => {
  const dom = buildDom();
  const apply = loadApply(dom.document, {
    location: { search: '?lang=en&utm_source=ad' },
    localStorage: { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } },
  });
  assert.match(dom.staticCards[0].textContent, /Siberian Cat Personality/);
  assert.equal(dom.staticCards[3].getAttribute('href'), '/en/blog/siberian-kitten-feeding-guide.html');
  apply.change('ja');
  assert.equal(dom.staticCards[0].querySelector('.blog-card-title').textContent, 'サイベリアンの性格と特徴');
});

test('English init then JA restores the kittens CTA to /kittens.html without a nav marker', () => {
  const dom = buildDom();
  const apply = loadApply(dom.document, {
    location: { search: '' },
    localStorage: {
      getItem() { return 'en'; },
      setItem() { throw new Error('blocked'); },
    },
  });
  assert.equal(dom.kittens.getAttribute('href'), '/en/kittens.html');
  assert.equal(dom.kittens.getAttribute('data-nav-localized-href'), null);
  apply.change('ja');
  assert.equal(dom.kittens.getAttribute('href'), '/kittens.html');
  assert.match(dom.kittens.textContent, /子猫一覧を見る/);
});

test('listing card category aliases and 記事 stay off business buckets', () => {
  const extra = [
    card('/blog/siberian-kitten-feeding-guide.html', '食事・栄養', 'サイベリアン子猫の食事ガイド', '食事の説明'),
    card('/blog/common-cat-diseases.html', '健康・医療', '猫がかかりやすい病気と予防法', '病気'),
    card('/blog/siberian-coat-color-guide.html', '品種紹介', 'サイベリアンの毛色完全図鑑', '毛色'),
    card('/blog/bringing-kitten-home.html', '子猫', '子猫のお迎え準備チェックリスト', '準備'),
    card('/blog/cattery-daily-routine.html', 'ブリーダー', '福楽キャッテリーの一日', '一日'),
    card('/blog/cat-dreams-sleep-cycle.html', '行動訓練', '猫は夢を見る？', '睡眠'),
    card('/blog/cat-enrichment-ideas.html', '記事', '猫の退屈解消', '遊び'),
  ];
  const expectedEn = ['Nutrition', 'Health', 'Breeds', 'Kitten Care', 'Choosing a Breeder', 'Behavior & Training', 'Article'];
  const expectedZh = ['饮食营养', '健康管理', '品种知识', '幼猫养育', '繁殖者选择', '行为训练', '文章'];
  const origJa = extra.map(node => node.querySelector('.blog-card-cat').textContent);
  const dom = buildDom();
  extra.forEach(node => dom.staticCards.push(node));
  const apply = loadApply(dom.document, {
    location: { search: '' },
    localStorage: { getItem() { return null; }, setItem() {} },
  });
  apply.change('en');
  extra.forEach((node, i) => {
    assert.equal(node.querySelector('.blog-card-cat').textContent, expectedEn[i], 'en ' + origJa[i]);
  });
  apply.change('zh');
  extra.forEach((node, i) => {
    assert.equal(node.querySelector('.blog-card-cat').textContent, expectedZh[i], 'zh ' + origJa[i]);
  });
  apply.change('ja');
  extra.forEach((node, i) => {
    assert.equal(node.querySelector('.blog-card-cat').textContent, origJa[i], 'ja ' + origJa[i]);
  });
});

test('JA restore uses the Japanese kittens root even if href was already /en/kittens.html', () => {
  const dom = buildDom({ kittensHref: '/en/kittens.html' });
  const apply = loadApply(dom.document, {
    location: { search: '' },
    localStorage: {
      getItem() { return 'en'; },
      setItem() { throw new Error('blocked'); },
    },
  });
  assert.equal(dom.kittens.getAttribute('href'), '/en/kittens.html');
  apply.change('ja');
  assert.equal(dom.kittens.getAttribute('href'), '/kittens.html');
});

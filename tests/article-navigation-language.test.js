'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'nav.js'), 'utf8');
const start = source.indexOf('  function langSwitchMarkup(');
const end = source.indexOf('\n  function icon(', start);

function render(marker, extraClass) {
  const document = {
    documentElement: {
      getAttribute(name) {
        return name === 'data-article-language' ? marker : null;
      },
    },
  };
  return vm.runInNewContext(
    source.slice(start, end) + '\nlangSwitchMarkup(' + JSON.stringify(extraClass) + ')',
    { document }
  );
}

function walk(node, visit) {
  visit(node);
  for (const child of node.childNodes || []) walk(child, visit);
}

function attrs(node) {
  return Object.fromEntries((node.attrs || []).map(({ name, value }) => [name, value]));
}

function hasClass(node, name) {
  return (attrs(node).class || '').split(/\s+/).includes(name);
}

function textContent(node) {
  let text = '';
  walk(node, current => {
    if (current.nodeName === '#text') text += current.value;
  });
  return text.replace(/\s+/g, ' ').trim();
}

test('Japanese-only articles label enhanced navigation controls without changing ordinary pages', () => {
  for (const mode of ['nav-lang', 'mobile-lang']) {
    const html = render('ja', mode);
    assert.match(html, /ナビのみ \/ Nav only \/ 仅导航/);
    assert.match(html, /aria-label="English navigation only; this article remains in Japanese"/);
    assert.match(html, /aria-label="仅切换中文导航；本文仍为日文"/);
    assert.match(html, /aria-label="ナビゲーションを日本語に切替。記事本文は日本語です"/);
    assert.equal((html.match(/<button/g) || []).length, 3);
    assert.doesNotMatch(html, /disabled|aria-describedby/);
  }

  const ordinary = render(null, 'nav-lang');
  assert.equal(
    ordinary,
    '<div class="lang-switch nav-lang" role="group" aria-label="言語切替 / Language"><button class="lang-btn" aria-pressed="false" data-lang="ja" type="button">JP</button><button class="lang-btn" aria-pressed="false" data-lang="en" type="button">EN</button><button class="lang-btn" aria-pressed="false" data-lang="zh" type="button">中</button></div>'
  );
});

test('Japanese-only articles keep navigation-only context in both static controls when nav enhancement fails', async () => {
  const { parse } = await import('parse5');

  for (const relativePath of [
    'blog/kitten-day1-guide.html',
    'blog/cats-lily-safety-home.html',
  ]) {
    const document = parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
    const nodes = [];
    walk(document, node => nodes.push(node));
    const html = nodes.find(node => node.tagName === 'html');
    const article = nodes.find(node => node.tagName === 'article');
    const groups = nodes.filter(node => node.tagName === 'div' && hasClass(node, 'article-nav-language'));

    assert.equal(attrs(html)['data-article-language'], 'ja', relativePath);
    assert.equal(attrs(article).lang, 'ja', relativePath);
    assert.equal(groups.length, 2, relativePath + ' must keep desktop and mobile static fallbacks');

    for (const group of groups) {
      const descendants = [];
      walk(group, node => descendants.push(node));
      const buttons = descendants.filter(node => node.tagName === 'button');
      assert.match(textContent(group), /Nav only/);
      assert.match(textContent(group), /仅导航/);
      assert.equal(buttons.length, 3);
      assert.match(attrs(buttons[1])['aria-label'], /article remains in Japanese/);
      assert.match(attrs(buttons[2])['aria-label'], /本文仍为日文/);
    }
  }

  const ordinary = parse(fs.readFileSync(path.join(root, 'en/blog/breeder-visit-flow-osaka.html'), 'utf8'));
  const ordinaryNodes = [];
  walk(ordinary, node => ordinaryNodes.push(node));
  assert.equal(
    ordinaryNodes.filter(node => node.tagName === 'div' && hasClass(node, 'article-nav-language')).length,
    0
  );
});

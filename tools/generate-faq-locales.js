#!/usr/bin/env node
'use strict';
// Snapshot the already-approved FAQ translations; never fetch or rewrite animal facts.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { parse, parseFragment, serialize } = require('parse5');
const { createLastmodStore } = require('./lastmod-store.js');
const BASE = 'https://fuluckpet.com';
const LANGS = ['ja', 'en', 'zh'];
const attr = (node, key) => (node.attrs || []).find(a => a.name === key)?.value;
function set(node, key, value) {
  const entry = (node.attrs || []).find(a => a.name === key);
  if (entry) entry.value = value;
  else (node.attrs ||= []).push({ name: key, value });
}
function nodes(root) { const out = []; function walk(n) { out.push(n); (n.childNodes || []).forEach(walk); } walk(root); return out; }
function content(node) { return node.value || (node.childNodes || []).map(content).join(''); }
function children(node, values) { node.childNodes = values; values.forEach(child => { child.parentNode = node; }); }
function text(node, value) { children(node, [{ nodeName: '#text', value }]); }
function url(lang) { return BASE + (lang === 'ja' ? '' : '/' + lang) + '/faq.html'; }
function loadCopy(root) {
  const context = { document: { addEventListener() {} }, window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'i18n.js'), 'utf8') + '\n;globalThis.copy = {translations, htmlKeys, translateSupplementalText};', context);
  vm.runInNewContext(fs.readFileSync(path.join(root, 'faq-trust-copy.js'), 'utf8'), context);
  return { ...context.copy, trust: context.window.FaqTrustCopy };
}
function translatedFaq(copy, id, kind, lang) {
  const reviewed = copy.trust.copy[id] || copy.trust.additions.find(item => item.id === id);
  const value = reviewed ? reviewed[kind][lang] : copy.translations[lang]['faqPage.' + (kind === 'question' ? 'q' : 'a') + '.' + id];
  if (typeof value !== 'string' || !value) throw new Error('Missing FAQ translation: ' + id + ' ' + kind + ' ' + lang);
  return value;
}
function buildFaqLocales(root) {
  const copy = loadCopy(root), outputs = new Map();
  let source = fs.readFileSync(path.join(root, 'faq.html'), 'utf8');
  source = source.replace(/^[ \t]*<link\b[^>]*\bhreflang=["'][^"']+["'][^>]*>[ \t]*\r?\n/gm, '');
  const alternates = [...LANGS, 'x-default'].map(lang => '  <link rel="alternate" hreflang="' + lang + '" href="' + url(lang === 'x-default' ? 'ja' : lang) + '">').join('\n');
  source = source.replace(/(<link\b[^>]*rel="canonical"[^>]*>)/, '$1\n' + alternates);
  outputs.set('faq.html', source);
  for (const lang of ['en', 'zh']) {
    const doc = parse(source), dictionary = copy.translations[lang];
    const title = dictionary['faq.pageTitle'] + (lang === 'en' ? ' | Fuluck Cattery, Osaka' : '｜大阪福乐猫舍');
    const description = dictionary['faq.pageSubtitle'];
    const categories = lang === 'en' ? { all: 'All', general: 'General', purchase: 'Purchase', care: 'Care', health: 'Health' } : { all: '全部', general: '一般', purchase: '购买', care: '护理', health: '健康' };
    for (const node of nodes(doc)) {
      if (node.tagName === 'html') set(node, 'lang', lang);
      if (node.tagName === 'body') set(node, 'data-nav-language', lang);
      if (['script', 'style'].includes(node.tagName)) continue;
      const extraNavKey = { '/siberian-allergy.html': 'nav.allergy', '/siberian-breeder-osaka.html': 'nav.osakaAdoption', '/waitlist.html': 'nav.waitlist' }[attr(node, 'href')];
      const key = attr(node, 'data-i18n') || extraNavKey;
      const faqKey = /^faqPage\.([qa])\.(faq_\d+)$/.exec(key || '');
      const value = faqKey ? translatedFaq(copy, faqKey[2], faqKey[1] === 'q' ? 'question' : 'answer', lang) : dictionary[key];
      if (value !== undefined) {
        if (copy.htmlKeys.has(key)) children(node, parseFragment(value).childNodes);
        else {
          const icons = (node.childNodes || []).filter(n => n.tagName === 'svg' || (attr(n, 'class') || '').split(' ').includes('ico'));
          children(node, [...icons, { nodeName: '#text', value: (icons.length ? ' ' : '') + value }]);
        }
      }
      const visual = attr(node, 'data-experience-' + lang);
      if (visual !== undefined) {
        if (node.tagName === 'input') set(node, 'placeholder', visual);
        else if (node.tagName === 'img') set(node, 'alt', visual);
        else text(node, visual);
      }
      const ariaKey = attr(node, 'data-i18n-aria');
      if (dictionary[ariaKey]) set(node, 'aria-label', dictionary[ariaKey]);
      else if (attr(node, 'aria-label')) set(node, 'aria-label', copy.translateSupplementalText(attr(node, 'aria-label'), lang));
      const category = attr(node, 'data-cat') || (attr(node, 'class') || '').match(/\bcat-(general|purchase|care|health)\b/)?.[1];
      if (categories[category]) {
        for (const child of node.childNodes || []) if (child.nodeName === '#text' && child.value.trim()) child.value = ' ' + categories[category];
      }
      const targetLang = attr(node, 'data-lang');
      if (targetLang) {
        set(node, 'aria-pressed', String(targetLang === lang));
        set(node, 'class', (attr(node, 'class') || '').replace(/\s*\bactive\b/g, '') + (targetLang === lang ? ' active' : ''));
      }
      for (const child of node.childNodes || []) {
        if (child.nodeName !== '#text' || !child.value.trim() || value !== undefined || visual !== undefined || categories[category]) continue;
        const raw = child.value.trim(); child.value = child.value.replace(raw, copy.translateSupplementalText(raw, lang));
      }
      if (node.tagName === 'a') {
        const href = attr(node, 'href') || '';
        if (/^\/(?:guide\/|kittens\.html|faq\.html|boarding\/|grooming\/)/.test(href)) set(node, 'href', '/' + lang + href);
        else if (/^\/(?:index|booking|about|parents|reviews|gallery|blog|waitlist|siberian|siberian-allergy|siberian-breeder-osaka)\.html(?:#.*)?$/.test(href)) {
          const [pathname, hash] = href.split('#'); set(node, 'href', pathname + '?lang=' + lang + (hash ? '#' + hash : ''));
        }
      }
    }
    const all = nodes(doc);
    const faqItems = all.filter(n => attr(n, 'data-faq-id')).map(n => {
      const id = attr(n, 'data-faq-id');
      return { '@type': 'Question', name: translatedFaq(copy, id, 'question', lang), acceptedAnswer: { '@type': 'Answer', text: translatedFaq(copy, id, 'answer', lang) } };
    });
    for (const node of all) {
      // Resources in the root page must also work from /en/ and /zh/.
      for (const key of ['src', 'href']) {
        const value = attr(node, key);
        if (value && !/^(?:[a-z]+:|\/|#)/i.test(value)) set(node, key, '/' + value);
      }
      if (node.tagName === 'title') text(node, title);
      if (attr(node, 'rel') === 'canonical') set(node, 'href', url(lang));
      const metaKey = attr(node, 'name') || attr(node, 'property');
      if (['description', 'og:description', 'twitter:description'].includes(metaKey)) set(node, 'content', description);
      if (['og:title', 'twitter:title'].includes(metaKey)) set(node, 'content', title);
      if (metaKey === 'og:url') set(node, 'content', url(lang));
      if (metaKey === 'keywords') set(node, 'content', lang === 'en' ? 'FAQ,Siberian,kitten,Osaka,Fuluck Cattery,adoption' : '常见问题,西伯利亚猫,幼猫,大阪,福乐猫舍,接猫');
      if (node.tagName !== 'script' || attr(node, 'type') !== 'application/ld+json') continue;
      const schema = JSON.parse(content(node));
      function localizeIds(value) {
        for (const [key, child] of Object.entries(value)) {
          if (typeof child === 'string' && child.startsWith(url('ja'))) value[key] = child.replace(url('ja'), url(lang));
          else if (child && typeof child === 'object') localizeIds(child);
        }
      }
      localizeIds(schema);
      if (schema['@type'] === 'FAQPage') { schema.inLanguage = lang; schema.mainEntity = faqItems; }
      if (schema['@type'] === 'BreadcrumbList') schema.itemListElement.forEach((item, i) => { item.name = i === 0 ? (lang === 'en' ? 'Home' : '首页') : dictionary['faq.pageTitle']; });
      if (schema['@type'] === 'WebPage') {
        schema.inLanguage = lang; schema.name = title; schema.description = description;
        for (const item of schema.about || []) if (item['@type'] === 'Thing') item.name = dictionary['faq.pageTitle'];
      }
      text(node, JSON.stringify(schema, null, 2).replace(/</g, '\\u003c'));
    }
    outputs.set(lang + '/faq.html', '<!DOCTYPE html>\n' + serialize(doc).replace(/^<!DOCTYPE html>\s*/i, '') + '\n');
  }
  return outputs;
}
function updateFaqSitemap(root) {
  const sitemapPath = path.join(root, 'sitemap.xml');
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const store = createLastmodStore(root, today);
  let xml = fs.readFileSync(sitemapPath, 'utf8');
  // Only these two entries are owned here. Keep all other sections and dates intact.
  xml = xml.replace(/\s*<url>\s*<loc>https:\/\/fuluckpet\.com\/(?:en|zh)\/faq\.html<\/loc>[\s\S]*?<\/url>/g, '');
  xml = xml.replace(/^[ \t]*<!-- FAQ \(en\/zh\) -->\r?\n/gm, '');
  const entries = ['en', 'zh'].map(lang => `  <url>\n    <loc>${url(lang)}</loc>\n    <lastmod>${store.lastmodForUrl(url(lang))}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.7</priority>\n  </url>`).join('\n');
  const block = '  <!-- FAQ (en/zh) -->\n' + entries + '\n';
  if (/^[ \t]*<!-- ブログ記事 -->/m.test(xml)) xml = xml.replace(/^[ \t]*(?=<!-- ブログ記事 -->)/m, block + '  ');
  else xml = xml.replace(/<\/urlset>/, block + '</urlset>');
  fs.writeFileSync(sitemapPath, xml);
  store.save();
}
function generateFaqLocales(root = path.resolve(__dirname, '..'), { sitemap = true } = {}) {
  const outputs = buildFaqLocales(root);
  for (const [relative, html] of outputs) {
    const filename = path.join(root, relative); fs.mkdirSync(path.dirname(filename), { recursive: true });
    if (!fs.existsSync(filename) || fs.readFileSync(filename, 'utf8') !== html) fs.writeFileSync(filename, html);
  }
  if (sitemap) updateFaqSitemap(root);
  return outputs;
}
module.exports = { buildFaqLocales, generateFaqLocales, loadCopy, translatedFaq };
if (require.main === module) console.log('Updated ' + generateFaqLocales().size + ' FAQ pages.');

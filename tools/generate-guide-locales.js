#!/usr/bin/env node
'use strict';
// Data-independent: no API requests and no kitten catalogue regeneration.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { parse, parseFragment, serialize } = require('parse5');
const BASE = 'https://fuluckpet.com';
const LANGS = ['ja', 'en', 'zh'];
const attr = (node, key) => (node.attrs || []).find(a => a.name === key)?.value;
function set(node, key, value) {
  const existing = (node.attrs || []).find(a => a.name === key);
  if (existing) existing.value = value;
  else (node.attrs ||= []).push({ name: key, value });
}
function all(root) {
  const result = [];
  function walk(node) { result.push(node); (node.childNodes || []).forEach(walk); }
  walk(root); return result;
}
function content(node) { return node.value || (node.childNodes || []).map(content).join(''); }
function replaceChildren(node, children) {
  node.childNodes = children;
  children.forEach(child => { child.parentNode = node; });
}
function text(node, value) { replaceChildren(node, [{ nodeName: '#text', value, parentNode: node }]); }
function localizedPath(relative, lang) { return (lang === 'ja' ? '' : '/' + lang) + relative; }
function alternateMarkup(relative) {
  return [...LANGS, 'x-default'].map(lang => '  <link rel="alternate" hreflang="' + lang + '" href="' + BASE + localizedPath(relative, lang === 'x-default' ? 'ja' : lang) + '">').join('\n');
}
function withAlternates(source, relative) {
  const without = source.replace(/^[ \t]*<link\b[^>]*\bhreflang=["'][^"']+["'][^>]*>[ \t]*\r?\n/gm, '');
  return without.replace(/(<link\b[^>]*rel="canonical"[^>]*>)/, '$1\n' + alternateMarkup(relative));
}
function loadCopy(root) {
  const context = { document: { addEventListener() {} }, window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'i18n.js'), 'utf8') + '\n;globalThis.copy = {translations, htmlKeys, translateSupplementalText};', context);
  vm.runInNewContext(fs.readFileSync(path.join(root, 'guide/i18n-guide-body.js'), 'utf8'), context);
  return { ...context.copy, bodies: context.guideBodyTranslations };
}
function localize(source, relative, lang, copy) {
  const doc = parse(source), dictionary = copy.translations[lang];
  for (const node of all(doc)) {
    const bodyKey = attr(node, 'data-i18n-html');
    if (!bodyKey) continue;
    const body = copy.bodies[lang]?.[bodyKey];
    if (!body) throw new Error('Missing guide body: ' + lang + ' ' + bodyKey);
    replaceChildren(node, parseFragment(body).childNodes);
  }
  for (const node of all(doc)) {
    if (node.tagName === 'html') set(node, 'lang', lang);
    const key = attr(node, 'data-i18n');
    const value = dictionary[key];
    if (value !== undefined) {
      if (copy.htmlKeys.has(key)) replaceChildren(node, parseFragment(value).childNodes);
      else {
        const icons = (node.childNodes || []).filter(n => n.tagName === 'svg' || (attr(n, 'class') || '').split(' ').includes('ico'));
        text(node, value);
        if (icons.length) replaceChildren(node, [...icons, { nodeName: '#text', value: ' ' + value }]);
      }
    }
    const visual = attr(node, 'data-guide-' + lang) ?? attr(node, 'data-experience-' + lang);
    if (visual !== undefined) {
      if (attr(node, 'data-guide-target') === 'aria-label') set(node, 'aria-label', visual);
      else if (node.tagName === 'img') set(node, 'alt', visual);
      else text(node, visual);
    }
    const href = attr(node, 'href');
    if (node.tagName === 'a' && href) {
      if (/^\/guide\//.test(href) || href === '/kittens.html') set(node, 'href', '/' + lang + href);
      // Preserve language on shared pages which translate in place.
      else if (href !== '/about.html#registration' && /^\/(?:index|booking|about|parents|reviews|gallery|faq|blog)\.html(?:#.*)?$/.test(href)) {
        const [pathname, hash] = href.split('#');
        set(node, 'href', pathname + '?lang=' + lang + (hash ? '#' + hash : ''));
      }
    }
    if (attr(node, 'aria-label')) set(node, 'aria-label', copy.translateSupplementalText(attr(node, 'aria-label'), lang));
    if (!['script', 'style'].includes(node.tagName)) {
      for (const child of node.childNodes || []) {
        if (child.nodeName !== '#text' || !child.value.trim()) continue;
        const raw = child.value.trim();
        child.value = child.value.replace(raw, copy.translateSupplementalText(raw, lang));
      }
    }
  }
  const nodes = all(doc);
  const title = content(nodes.find(n => n.tagName === 'h1'));
  const slug = relative.endsWith('/') ? 'hub' : path.basename(relative, '.html');
  const lead = nodes.find(n => (attr(n, 'class') || '').split(' ').includes('guide-lead') || attr(n, 'data-i18n') === 'guide.hub.desc');
  const description = lead ? content(lead).replace(/\s+/g, ' ').trim() : '';
  if (!title || !description) throw new Error('Missing guide metadata: ' + relative + ' ' + lang);
  const self = BASE + localizedPath(relative, lang);
  for (const node of nodes) {
    if (node.tagName === 'title') text(node, title + ' | Fuluck Cattery');
    if (attr(node, 'rel') === 'canonical') set(node, 'href', self);
    const metaKey = attr(node, 'name') || attr(node, 'property');
    if (['description', 'og:description', 'twitter:description'].includes(metaKey)) set(node, 'content', description);
    if (['og:title', 'twitter:title'].includes(metaKey)) set(node, 'content', title + ' | Fuluck Cattery');
    if (metaKey === 'og:url') set(node, 'content', self);
    if (metaKey === 'keywords') set(node, 'content', lang === 'en' ? 'Siberian,kitten,Osaka,Fuluck Cattery,adoption guide' : '西伯利亚猫,幼猫,大阪,福楽猫舍,接猫指南');
    if (node.tagName !== 'script' || attr(node, 'type') !== 'application/ld+json') continue;
    const schema = JSON.parse(content(node));
    function localizeUrls(value) {
      if (!value || typeof value !== 'object') return;
      for (const [key, child] of Object.entries(value)) {
        if (typeof child === 'string' && child.startsWith(BASE + '/guide/')) value[key] = child.replace(BASE, BASE + '/' + lang);
        else if (child && typeof child === 'object') localizeUrls(child);
      }
    }
    localizeUrls(schema);
    if (schema['@type'] === 'BreadcrumbList') {
      schema.itemListElement.forEach((item, i) => { item.name = i === 0 ? (lang === 'en' ? 'Home' : '首页') : i === 1 ? dictionary['guide.hub.title'] : title; });
    }
    if (['Article', 'CollectionPage'].includes(schema['@type'])) {
      schema.inLanguage = lang;
      schema.description = description;
      if (schema['@type'] === 'Article') schema.headline = title;
      else {
        schema.name = title;
        for (const item of schema.mainEntity?.itemListElement || []) {
          const rawSlug = path.basename(item.url || '', '.html');
          const itemSlug = { 'home-safety': 'safety', 'multi-cat': 'multi', 'weight-log': 'weight' }[rawSlug] || rawSlug;
          item.name = dictionary['guide.hub.' + itemSlug + '.title'] || dictionary['guide.' + itemSlug + '.title'] || item.name;
        }
      }
    }
    text(node, JSON.stringify(schema).replace(/</g, '\\u003c'));
  }
  return '<!DOCTYPE html>\n' + serialize(doc).replace(/^<!DOCTYPE html>\s*/i, '') + '\n';
}
function buildGuideLocales(root) {
  const outputs = new Map(), copy = loadCopy(root);
  for (const filename of fs.readdirSync(path.join(root, 'guide')).filter(f => f.endsWith('.html')).sort()) {
    const relative = '/guide/' + (filename === 'index.html' ? '' : filename);
    const source = withAlternates(fs.readFileSync(path.join(root, 'guide', filename), 'utf8'), relative);
    outputs.set('guide/' + filename, source);
    for (const lang of ['en', 'zh']) outputs.set(lang + '/guide/' + filename, localize(source, relative, lang, copy));
  }
  // Existing localized pages must link to the newly available Guide siblings.
  // Only navigation hrefs are touched; catalogue values and article text are preserved.
  for (const lang of ['en', 'zh']) {
    function visit(directory) {
      if (!fs.existsSync(directory)) return;
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const filename = path.join(directory, entry.name);
        if (entry.isDirectory()) { if (filename !== path.join(root, lang, 'guide')) visit(filename); }
        else if (entry.name.endsWith('.html')) {
          const original = fs.readFileSync(filename, 'utf8');
          const updated = original.replace(/href="(\/guide\/[^"?#]*)([?#][^"]*)?"/g, (match, target, suffix = '') => {
            const source = path.join(root, target.endsWith('/') ? target + 'index.html' : target);
            return (target.endsWith('/') || target.endsWith('.html')) && fs.existsSync(source) ? 'href="/' + lang + target + suffix + '"' : match;
          });
          if (updated !== original) outputs.set(path.relative(root, filename), updated);
        }
      }
    }
    visit(path.join(root, lang));
  }
  return outputs;
}
function generateGuideLocales(root = path.resolve(__dirname, '..'), { sitemap = true } = {}) {
  const outputs = buildGuideLocales(root);
  for (const [relative, html] of outputs) {
    const filename = path.join(root, relative);
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    if (!fs.existsSync(filename) || fs.readFileSync(filename, 'utf8') !== html) fs.writeFileSync(filename, html);
  }
  if (sitemap) {
    const sitemapPath = path.join(root, 'sitemap.xml');
    let xml = fs.readFileSync(sitemapPath, 'utf8').replace(/\s*<url>\s*<loc>https:\/\/fuluckpet\.com\/(?:en|zh)\/guide\/[^<]*<\/loc>[\s\S]*?<\/url>/g, '');
    const entries = [...outputs.keys()].filter(p => /^(en|zh)\/guide\//.test(p)).map(p => '  <url><loc>' + BASE + '/' + p.replace(/index\.html$/, '') + '</loc><changefreq>monthly</changefreq><priority>0.6</priority></url>').join('\n');
    xml = xml.replace(/\s*<\/urlset>\s*$/, '\n' + entries + '\n</urlset>\n');
    fs.writeFileSync(sitemapPath, xml);
  }
  return outputs.size;
}
module.exports = { buildGuideLocales, generateGuideLocales };
if (require.main === module) console.log('Updated ' + generateGuideLocales() + ' files: Guide locales and any shared Guide links.');

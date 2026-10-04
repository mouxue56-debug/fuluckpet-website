'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { parse } = require('parse5');
const { buildFaqLocales, generateFaqLocales, loadCopy, translatedFaq } = require('../tools/generate-faq-locales.js');
const ROOT = path.resolve(__dirname, '..');
const attr = (n, key) => (n.attrs || []).find(a => a.name === key)?.value;
function nodes(doc) { const result = []; function walk(n) { result.push(n); (n.childNodes || []).forEach(walk); } walk(doc); return result; }
function text(n) { return n.value || (n.childNodes || []).map(text).join(''); }

test('static FAQ translations retain all 27 approved answers and matching structured data', () => {
  const copy = loadCopy(ROOT), outputs = buildFaqLocales(ROOT);
  for (const lang of ['en', 'zh']) {
    const all = nodes(parse(outputs.get(lang + '/faq.html')));
    const questions = all.filter(n => /^faqPage\.q\./.test(attr(n, 'data-i18n') || ''));
    const answers = all.filter(n => /^faqPage\.a\./.test(attr(n, 'data-i18n') || ''));
    assert.equal(questions.length, 27);
    assert.equal(answers.length, 27);
    const schemas = all.filter(n => n.tagName === 'script' && attr(n, 'type') === 'application/ld+json').map(n => JSON.parse(text(n)));
    const faq = schemas.find(s => s['@type'] === 'FAQPage');
    assert.equal(faq.inLanguage, lang);
    assert.equal(faq.mainEntity.length, 27);
    questions.forEach((node, i) => {
      const id = attr(node, 'data-i18n').split('.').pop();
      const expectedQuestion = translatedFaq(copy, id, 'question', lang);
      const expectedAnswer = translatedFaq(copy, id, 'answer', lang);
      assert.equal(text(node), expectedQuestion, id + ' question');
      assert.equal(text(answers[i]), expectedAnswer, id + ' answer must remain verbatim');
      assert.equal(faq.mainEntity[i].name, expectedQuestion);
      assert.equal(faq.mainEntity[i].acceptedAnswer.text, expectedAnswer);
    });
  }
});

test('FAQ locale metadata is reciprocal and resources work under translated paths', () => {
  for (const [relative, html] of buildFaqLocales(ROOT)) {
    const lang = relative.includes('/') ? relative.slice(0, 2) : 'ja';
    const all = nodes(parse(html));
    assert.equal(attr(all.find(n => n.tagName === 'html'), 'lang'), lang);
    const canonical = 'https://fuluckpet.com/' + relative;
    assert.equal(attr(all.find(n => attr(n, 'rel') === 'canonical'), 'href'), canonical);
    for (const target of ['ja', 'en', 'zh', 'x-default']) {
      const expected = 'https://fuluckpet.com/' + (['en', 'zh'].includes(target) ? target + '/' : '') + 'faq.html';
      assert.equal(attr(all.find(n => attr(n, 'hreflang') === target), 'href'), expected);
    }
    if (lang === 'ja') continue;
    assert.equal(attr(all.find(n => n.tagName === 'body'), 'data-nav-language'), lang);
    assert.equal(attr(all.find(n => attr(n, 'id') === 'faqSearch'), 'placeholder'), lang === 'en' ? 'Try: visit, fee, what to bring' : '例如：预约、费用、准备物品');
    for (const n of all.filter(n => ['script', 'link', 'img'].includes(n.tagName))) {
      const resource = attr(n, 'src') || attr(n, 'href');
      if (!resource || /^(?:[a-z]+:|#)/i.test(resource)) continue;
      assert.ok(resource.startsWith('/'), resource + ' must be root-relative');
      assert.ok(fs.existsSync(path.join(ROOT, resource.split('?')[0])), resource + ' must exist');
    }
    const guide = all.find(n => n.tagName === 'a' && attr(n, 'data-i18n') === 'nav.guide');
    assert.equal(attr(guide, 'href'), '/' + lang + '/guide/');
  }
});

test('FAQ generation is deterministic, data-independent and checked-in locales are fresh', () => {
  const source = fs.readFileSync(path.join(ROOT, 'faq.html'), 'utf8');
  const first = buildFaqLocales(ROOT), second = buildFaqLocales(ROOT);
  assert.deepEqual([...first], [...second]);
  assert.equal(fs.readFileSync(path.join(ROOT, 'faq.html'), 'utf8'), source);
  for (const [relative, html] of first) assert.equal(fs.readFileSync(path.join(ROOT, relative), 'utf8'), html, relative + ' is stale');
});

test('standalone FAQ generation only adds FAQ sitemap entries and preserves other stored dates', t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'fuluck-faq-locales-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  fs.mkdirSync(path.join(temp, 'tools'));
  for (const name of ['faq.html', 'i18n.js', 'faq-trust-copy.js']) fs.copyFileSync(path.join(ROOT, name), path.join(temp, name));
  const untouched = '  <url><loc>https://fuluckpet.com/kittens/kept.html</loc><lastmod>2026-01-02</lastmod></url>\n';
  const stored = { hash: 'existing-hash', lastmod: '2026-01-02' };
  fs.writeFileSync(path.join(temp, 'tools/sitemap-lastmod.json'), JSON.stringify({ 'https://fuluckpet.com/kittens/kept.html': stored }));
  fs.writeFileSync(path.join(temp, 'sitemap.xml'), '<urlset>\n  <!-- 子猫詳細ページ -->\n' + untouched + '  <!-- ブログ記事 -->\n</urlset>\n');
  generateFaqLocales(temp);
  const first = fs.readFileSync(path.join(temp, 'sitemap.xml'), 'utf8');
  generateFaqLocales(temp);
  assert.equal(fs.readFileSync(path.join(temp, 'sitemap.xml'), 'utf8'), first);
  assert.ok(first.includes(untouched));
  for (const lang of ['en', 'zh']) assert.equal(first.split('<loc>https://fuluckpet.com/' + lang + '/faq.html</loc>').length - 1, 1);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(temp, 'tools/sitemap-lastmod.json'), 'utf8'))['https://fuluckpet.com/kittens/kept.html'], stored);
});

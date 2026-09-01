import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parse } from 'parse5';

const aboutSource = readFileSync(new URL('../about.html', import.meta.url), 'utf8');
const i18nSource = readFileSync(new URL('../i18n.js', import.meta.url), 'utf8');
const cssSource = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
const about = parse(aboutSource);
const ids = ['21451','22853','24331','25811','26387','26084','27240','27837','27519','28727','29332','29003','30144','30753'];
const periods = ['2023-h1','2023-h2','2024-h1','2024-h2','2025-h1','2025-h2','2026-h1'];
const exactEmbedFacts = [
  ['21451','2023年上半期'], ['22853','2023年下半期'], ['24331','2024年上半期'],
  ['25811','2024年下半期'], ['26387','2024年下半期'], ['26084','2024年下半期'],
  ['27240','2025年上半期'], ['27837','2025年上半期'], ['27519','2025年上半期'],
  ['28727','2025年下半期'], ['29332','2025年下半期'], ['29003','2025年下半期'],
  ['30144','2026年上半期'], ['30753','2026年上半期'],
];
const requiredKeys = [
  'awards.timeline.title','awards.timeline.summary','awards.timeline.method','awards.timeline.category',
  'awards.timeline.scope.osaka','awards.timeline.scope.kansai','awards.timeline.scope.national',
  'awards.timeline.rank.1','awards.timeline.rank.2','awards.timeline.rank.3',
  'awards.timeline.2023.h1','awards.timeline.2023.h2','awards.timeline.2024.h1','awards.timeline.2024.h2',
  'awards.timeline.2025.h1','awards.timeline.2025.h2','awards.timeline.2026.h1'
];

function walk(node, visit) {
  visit(node);
  for (const child of node.childNodes || []) walk(child, visit);
}

function attr(node, name) {
  return (node.attrs || []).find(item => item.name === name)?.value;
}

test('publishes every verified Koneko plate once in chronological period groups', () => {
  const images = [];
  const periodNodes = [];
  walk(about, node => {
    if (node.tagName === 'img' && /\/certificate\/(\d+)-L\.png$/.test(attr(node, 'src') || '')) images.push(node);
    if ((attr(node, 'data-award-period') || '').length) periodNodes.push(attr(node, 'data-award-period'));
  });
  assert.deepEqual(images.map(node => /\/(\d+)-L\.png$/.exec(attr(node, 'src'))[1]), ids);
  assert.deepEqual(periodNodes, periods);
  assert.equal(new Set(images.map(node => attr(node, 'src'))).size, 14);
});

test('official embeds keep the platform link, dimensions, border, and supplied Japanese alt contract', () => {
  const images = [];
  walk(about, node => {
    if (node.tagName === 'img' && /\/certificate\/\d+-L\.png$/.test(attr(node, 'src') || '')) images.push(node);
  });
  for (const image of images) {
    assert.equal(attr(image.parentNode, 'href'), 'https://www.koneko-breeder.com/');
    assert.equal(attr(image, 'border'), '0');
    assert.equal(attr(image, 'style'), 'width:162px; height:256px;');
    assert.match(attr(image, 'alt'), /^みんなの子猫ブリーダー サイベリアン部門 20(23|24|25|26)年(上|下)半期$/);
    assert.equal(attr(image, 'target'), undefined);
    assert.equal(attr(image, 'loading'), undefined);
  }
});

test('keeps every platform-supplied link tag byte-for-byte unchanged', () => {
  for (const [id, period] of exactEmbedFacts) {
    const exact = `<a href="https://www.koneko-breeder.com/"><img src="https://www.koneko-breeder.com/breeder/images/certificate/${id}-L.png" border="0" alt="みんなの子猫ブリーダー サイベリアン部門 ${period}" style="width:162px; height:256px;"></a>`;
    assert.equal(aboutSource.split(exact).length - 1, 1, id);
  }
});

test('the page exposes semantic year, period, and award-card structure', () => {
  const tags = [];
  walk(about, node => {
    if (node.tagName) tags.push({ tag: node.tagName, id: attr(node, 'id'), className: attr(node, 'class') || '' });
  });
  assert.ok(tags.some(node => node.tag === 'section' && node.id === 'awards-timeline'));
  assert.ok(tags.some(node => node.tag === 'ol' && node.className.split(/\s+/).includes('awards-timeline')));
  assert.equal(tags.filter(node => node.tag === 'article' && node.className.split(/\s+/).includes('award-evidence-card')).length, 14);
});

test('timeline copy exists in all three locale dictionaries', () => {
  for (const key of requiredKeys) {
    assert.equal((i18nSource.match(new RegExp(`['"]${key.replaceAll('.', '\\.')}['"]\\s*:`, 'g')) || []).length, 3, key);
  }
});

test('timeline has desktop and mobile trunk layouts without required motion', () => {
  assert.match(cssSource, /\.awards-timeline\s*\{[\s\S]*position:\s*relative/);
  assert.match(cssSource, /\.awards-timeline::before/);
  assert.match(cssSource, /@media\s*\(max-width:\s*767px\)[\s\S]*\.awards-timeline::before/);
  assert.match(cssSource, /prefers-reduced-motion/);
});

test('legacy settings code cannot replace official award plates', () => {
  assert.doesNotMatch(aboutSource, /querySelectorAll\(['"]\.award-badge-img img/);
  assert.doesNotMatch(aboutSource, /images\[['"]award-[123]['"]\]/);
});

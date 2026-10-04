'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const GENERATOR = path.join(ROOT, 'tools/generate-site.js');

test('regenerating parent breed sections preserves their mobile layout hook', async (t) => {
  const { parse } = await import('parse5');
  const siteDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fuluck-parents-mobile-'));
  t.after(() => fs.rmSync(siteDir, { recursive: true, force: true }));
  fs.copyFileSync(path.join(ROOT, 'parents.html'), path.join(siteDir, 'parents.html'));

  let source = fs.readFileSync(GENERATOR, 'utf8').replace(
    "const SITE_DIR = path.resolve(__dirname, '..');",
    `const SITE_DIR = ${JSON.stringify(siteDir)};`,
  );
  const mainCall = source.lastIndexOf('\nmain().catch(');
  assert.notEqual(mainCall, -1, 'generator main-call boundary must exist');
  source = source.slice(0, mainCall) + '\nmodule.exports = { generateParents };\n';
  const loaded = new Module(GENERATOR, module);
  loaded.filename = GENERATOR;
  loaded.paths = Module._nodeModulePaths(path.dirname(GENERATOR));
  loaded._compile(source, GENERATOR);

  const parents = [
    { id: 'test-siberian', name: 'Test Siberian', breed: 'サイベリアン', gender: '♂', role: 'パパ猫', photos: ['https://example.test/siberian.jpg'] },
    { id: 'test-british', name: 'Test British', breed: 'ブリティッシュロングヘア', gender: '♀', role: 'ママ猫', photos: ['https://example.test/british.jpg'] },
  ];
  function descendants(node) {
    return [node, ...(node.childNodes || []).flatMap(descendants)];
  }
  function hasClass(node, name) {
    return node.attrs?.some(attr => attr.name === 'class' && attr.value.split(/\s+/).includes(name));
  }
  for (let generation = 1; generation <= 2; generation += 1) {
    loaded.exports.generateParents(parents);
    const document = parse(fs.readFileSync(path.join(siteDir, 'parents.html'), 'utf8'));
    const sections = descendants(document).filter(node => node.tagName === 'section'
      && descendants(node).some(child => hasClass(child, 'parents-grid')));
    assert.equal(sections.length, 2, 'both synthetic breeds must render');
    for (const section of sections) {
      assert.ok(section.attrs.some(attr => attr.name === 'data-parent-section'),
        `generation ${generation} must keep the mobile layout hook on parent sections`);
    }
    const firstSection = sections[0];
    const siblings = firstSection.parentNode.childNodes.filter(node => node.tagName);
    assert.ok(hasClass(siblings[siblings.indexOf(firstSection) - 1], 'page-hero'),
      'the first breed section must remain adjacent to the hero for the compact mobile selector');
  }
});

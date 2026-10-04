import test from 'node:test';
import assert from 'node:assert/strict';
import { ambientPage, contentAnchors } from '../ambient-pages.mjs';
import { media } from '../ambient-media.mjs';
import { readFileSync } from 'node:fs';
import { parse } from 'parse5';

test('each approved service opens with its own scene', () => {
  const expected = {
    '/gallery.html': 'family', '/boarding/': 'boarding', '/grooming/': 'grooming',
    '/booking.html': 'welcome', '/waitlist.html': 'welcome',
    '/guide/': 'welcome', '/blog.html': 'family',
  };
  for (const [path, first] of Object.entries(expected)) {
    const page = ambientPage(path);
    assert.equal(page.clips[0], first, path);
    assert.equal(page.clips.length, 3, path);
    assert.equal(new Set(page.clips).size, 3, path);
    for (const clip of page.clips) assert.ok(media[clip]?.video && media[clip]?.poster, clip);
  }
});

test('localized guide and waitlist share the same scenes and directory aliases work', () => {
  for (const prefix of ['', '/en', '/zh']) {
    assert.deepEqual(ambientPage(prefix + '/guide/index.html'), ambientPage('/guide/'));
    assert.deepEqual(ambientPage(prefix + '/waitlist.html'), ambientPage('/waitlist.html'));
  }
  assert.deepEqual(ambientPage('/boarding/index.html'), ambientPage('/boarding/'));
  assert.deepEqual(ambientPage('/grooming/index.html'), ambientPage('/grooming/'));
});

test('existing homepage, about and kittens keep their approved sequence', () => {
  assert.deepEqual(ambientPage('/').clips, ['A', 'B', 'C']);
  assert.deepEqual(ambientPage('/index.html'), ambientPage('/'));
  assert.deepEqual(ambientPage('/about.html').clips, ['C', 'A', 'B']);
  assert.deepEqual(ambientPage('/zh/kittens.html').clips, ['A', 'B', 'C']);
});

test('unconfigured pages cannot silently receive a homepage background', () => {
  for (const path of ['/admin/bookings.html', '/boarding/estimate.html', '/faq.html', '/guide/prepare.html', '/blog/cat-carrier-guide.html']) {
    assert.equal(ambientPage(path), null, path);
  }
});

test('content anchors follow actual visible content rather than desktop distances', () => {
  assert.deepEqual(contentAnchors([400, 1400, 2400, 3400, 4400, 5400], 1000), [2000, 4000]);
  assert.deepEqual(contentAnchors([400, 800, 1200, 1600, 2000, 2400], 500), [1000, 1800]);
  assert.deepEqual(contentAnchors([400, 800], 500), []);
});

test('every added entry point supplies a content landmark for motion and reading surfaces', () => {
  function findMain(node) {
    if (node.tagName === 'main' || node.attrs?.some(a => a.name === 'role' && a.value === 'main')) return node;
    return node.childNodes?.map(findMain).find(Boolean);
  }
  for (const file of ['gallery.html', 'boarding/index.html', 'grooming/index.html', 'booking.html',
    'waitlist.html', 'en/waitlist.html', 'zh/waitlist.html',
    'guide/index.html', 'en/guide/index.html', 'zh/guide/index.html', 'blog.html']) {
    const document = parse(readFileSync(new URL('../' + file, import.meta.url), 'utf8'));
    assert.ok(findMain(document), file + ' must provide a main content landmark');
  }
});

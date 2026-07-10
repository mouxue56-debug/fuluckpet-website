'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const nav = require('../nav.js');

test('dark launch config leaves runtime navigation and sibling routing unchanged', () => {
  nav.resetSmallAnimalLaunchForTest();
  nav.applySmallAnimalLaunch({ public: false, slugPublic: 'small-animals' });

  assert.equal(nav.navGroups()[0].items.some((item) => item.key === 'nav.smallAnimals'), false);
  assert.equal(nav.hasStaticSibling('/small-animals.html'), false);
  assert.equal(nav.hasStaticSibling('/small-animals/RB-001.html'), false);
});

test('public launch config adds one runtime nav item and trilingual sibling routing', () => {
  nav.resetSmallAnimalLaunchForTest();
  nav.applySmallAnimalLaunch({ public: true, slugPublic: 'small-animals' });
  nav.applySmallAnimalLaunch({ public: true, slugPublic: 'small-animals' });

  const items = nav.navGroups()[0].items.filter((item) => item.key === 'nav.smallAnimals');
  assert.equal(items.length, 1, 'config reapplication must be idempotent');
  assert.equal(items[0].href, '/small-animals.html');
  assert.equal(nav.localizedItemHref(items[0], 'en'), '/en/small-animals.html');
  assert.equal(nav.localizedItemHref(items[0], 'zh'), '/zh/small-animals.html');
  assert.equal(nav.hasStaticSibling('/small-animals.html'), true);
  assert.equal(nav.hasStaticSibling('/small-animals/RB-001.html'), true);
});

test('runtime launch config rejects unsafe public slugs', () => {
  nav.resetSmallAnimalLaunchForTest();
  nav.applySmallAnimalLaunch({ public: true, slugPublic: '../secret' });
  assert.equal(nav.navGroups()[0].items.some((item) => item.key === 'nav.smallAnimals'), false);
});

test('launch config URL rolls once per minute to bypass stale edge assets', () => {
  assert.equal(nav.smallAnimalLaunchConfigUrl(120000), '/small-animals-launch.json?v=2');
  assert.equal(nav.smallAnimalLaunchConfigUrl(179999), '/small-animals-launch.json?v=2');
  assert.equal(nav.smallAnimalLaunchConfigUrl(180000), '/small-animals-launch.json?v=3');
});

test('runtime launch config fetch has a deadline so navigation enhancement cannot hang', async (t) => {
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });
  global.fetch = function (_url, options) {
    return new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    });
  };
  await assert.rejects(nav.loadSmallAnimalLaunch(1), /aborted|timeout/i);
});

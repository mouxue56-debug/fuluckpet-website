'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const nav = require('../nav.js');

test('dark launch config leaves runtime navigation and sibling routing unchanged', () => {
  nav.resetSmallAnimalLaunchForTest();
  nav.applySmallAnimalLaunch({ public: false, slugPublic: 'small-animals' });

  const pets = nav.navGroups().find((group) => group.id === 'pets');
  assert.ok(pets, 'future-safe pets group exists');
  assert.equal(pets.items.some((item) => item.key === 'nav.smallAnimals'), false);
  assert.equal(nav.hasStaticSibling('/small-animals.html'), false);
  assert.equal(nav.hasStaticSibling('/small-animals/RB-001.html'), false);
});

test('public launch config adds one runtime nav item and trilingual sibling routing', () => {
  nav.resetSmallAnimalLaunchForTest();
  nav.applySmallAnimalLaunch({ public: true, slugPublic: 'small-animals' });
  nav.applySmallAnimalLaunch({ public: true, slugPublic: 'small-animals' });

  const items = nav.navGroups().find((group) => group.id === 'pets').items.filter((item) => item.key === 'nav.smallAnimals');
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
  assert.equal(nav.navGroups().find((group) => group.id === 'pets').items.some((item) => item.key === 'nav.smallAnimals'), false);
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

test('language filtering removes empty service groups instead of rendering dead menus', () => {
  assert.deepEqual(nav.visibleNavGroups('ja').map((group) => group.id), ['pets', 'services', 'adoption', 'breed', 'cattery']);
  assert.deepEqual(nav.visibleNavGroups('en').map((group) => group.id), ['pets', 'services', 'adoption', 'breed', 'cattery']);
  assert.deepEqual(nav.visibleNavGroups('zh').map((group) => group.id), ['pets', 'services', 'adoption', 'breed', 'cattery']);
});

test('consultation menu stays concise and avoids overlapping adoption destinations', () => {
  const adoption = nav.navGroups().find((group) => group.id === 'adoption');
  assert.deepEqual(adoption.items.map((item) => item.key), [
    'nav.booking',
    'nav.waitlist',
    'nav.guide',
    'nav.faq',
  ]);
});

test('mobile navigation keeps modal focus inside, inerts the page and restores the trigger', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const source = fs.readFileSync(path.join(__dirname, '..', 'nav.js'), 'utf8');
  assert.match(source, /e\.key === 'Tab'/);
  assert.match(source, /setMobileBackgroundInert/);
  assert.match(source, /restoreMobileFocus/);
  assert.match(source, /claimMobileTrigger/);
  assert.match(source, /__fuluckNavOwnsMobile/);
  assert.match(source, /requestAnimationFrame\(focusWhenVisible\)/);
  assert.match(source, /getComputedStyle\(mobileNav\)\.visibility === 'visible'/);
  assert.match(source, /setAttribute\('inert'/);
  assert.match(source, /nav-mobile-close/);
  assert.match(source, /closest\('\.nav-mobile-close'\)/);
  assert.match(source, /メニューを閉じる \/ Close navigation/);
  assert.doesNotMatch(source, /controls\.unshift\(hamburger\)/);

  const legacySource = fs.readFileSync(path.join(__dirname, '..', 'script.js'), 'utf8');
  assert.match(legacySource, /!window\.__fuluckNavOwnsMobile/);

  const css = fs.readFileSync(path.join(__dirname, '..', 'nav.css'), 'utf8');
  assert.match(css, /visibility\s+0s\s+linear\s+\.28s/);
  assert.match(css, /\.mobile-nav\.active\s*\{[^}]*transition-delay:\s*0s/s);
  assert.match(css, /\.nav-mobile-close\s*\{/);
  assert.match(css, /body\.mobile-nav-open\s+\.hamburger/);

  const serviceCss = fs.readFileSync(path.join(__dirname, '..', 'services.css'), 'utf8');
  assert.doesNotMatch(serviceCss, /service-ja-only[^\n]*nav-mobile-top[\s\S]{0,80}display:\s*none/);
});

test('primary navigation enhances immediately before optional small-animal config returns', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const source = fs.readFileSync(path.join(__dirname, '..', 'nav.js'), 'utf8');
  const init = source.slice(source.indexOf('function initNav()'), source.indexOf("if (typeof module !== 'undefined'"));
  const enhanceIndex = init.indexOf('enhanceNav();');
  const loadIndex = init.indexOf('loadSmallAnimalLaunch()');
  assert.notEqual(enhanceIndex, -1);
  assert.notEqual(loadIndex, -1);
  assert.ok(enhanceIndex < loadIndex);
});

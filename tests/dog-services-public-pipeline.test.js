'use strict';

const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const PROJECTION_PATH = path.join(ROOT, 'dog-services-projection.js');
const UI_PATH = path.join(ROOT, 'dog-services-public-ui.js');
const CONFIG_PATH = path.join(ROOT, 'boarding-public-config.js');
const GENERATED_PATH = path.join(ROOT, 'dog-services-launch.json');

function requirePipeline() {
  assert.equal(fs.existsSync(PROJECTION_PATH), true, 'dog-services-projection.js must exist');
  assert.equal(fs.existsSync(UI_PATH), true, 'dog-services-public-ui.js must exist');
  return {
    projection: require(PROJECTION_PATH),
    ui: require(UI_PATH),
  };
}

function publicConfig() {
  const source = require(CONFIG_PATH);
  return {
    CONFIG: {
      ...source.CONFIG,
      dogServices: { ...source.CONFIG.dogServices, public: true },
    },
    HOLIDAYS_2026: source.HOLIDAYS_2026.slice(),
    SPECIAL_DATE_RANGES: source.SPECIAL_DATE_RANGES.map((range) => ({ ...range })),
  };
}

test('projection is fail-closed and emits the exact minimal JSON while disabled', () => {
  const { projection } = requirePipeline();
  const config = require(CONFIG_PATH);
  const value = projection.buildDogServicesProjection(config);

  assert.deepEqual(value, { public: false });
  assert.equal(projection.serializeDogServicesProjection(config), '{"public":false}\n');
  assert.deepEqual(JSON.parse(fs.readFileSync(GENERATED_PATH, 'utf8')), { public: false });
});

test('enabled projection copies only approved dog prices, date rules and safe display data', () => {
  const { projection } = requirePipeline();
  const config = publicConfig();
  config.CONFIG.dogServices.secret = 'must-not-leak';
  config.CONFIG.dogServices.boardingBasePrice.injected = 1;
  config.SPECIAL_DATE_RANGES[0] = { ...config.SPECIAL_DATE_RANGES[0], label: '<script>', secret: true };

  const value = projection.buildDogServicesProjection(config);
  assert.equal(projection.validateDogServicesProjection(value), true);
  assert.deepEqual(value.sizes, {
    small: { label: '小型犬', boardingPerNight: 7400, basicCare: 4500 },
    medium: { label: '中型犬', boardingPerNight: 8200, basicCare: 7500 },
    large: { label: '大型犬', boardingPerNight: 8900, basicCare: 9000 },
  });
  assert.deepEqual(value.basicCareIncluded, ['爪切り', '耳掃除', '肛門腺']);
  assert.deepEqual(Object.keys(value).sort(), [
    'basicCareIncluded', 'calendar', 'currency', 'dateSurcharge', 'longStayDiscount', 'memberDiscountRate',
    'public', 'roundUnit', 'sizes', 'taxIncluded', 'version',
  ]);
  assert.doesNotMatch(JSON.stringify(value), /secret|script|injected|シャンプー|トリミング/);
});

test('strict validator rejects extra keys, wrong prices and caller-forged partial projections', () => {
  const { projection } = requirePipeline();
  const valid = projection.buildDogServicesProjection(publicConfig());
  assert.equal(projection.validateDogServicesProjection(valid), true);
  assert.equal(projection.validateDogServicesProjection({ public: true }), false);
  assert.equal(projection.validateDogServicesProjection({ public: false, sizes: valid.sizes }), false);
  assert.equal(projection.validateDogServicesProjection({ ...valid, extra: true }), false);
  assert.equal(projection.validateDogServicesProjection({
    ...valid,
    sizes: { ...valid.sizes, small: { ...valid.sizes.small, boardingPerNight: 1 } },
  }), false);
});

test('shared UI emits no dog offer when false and complete offers, CTA and schema when true', () => {
  const { projection, ui } = requirePipeline();
  const disabled = projection.buildDogServicesProjection(require(CONFIG_PATH));
  const enabled = projection.buildDogServicesProjection(publicConfig());

  for (const surface of ['boarding', 'care', 'estimate']) {
    assert.equal(ui.renderSurface(surface, disabled), '', `${surface} false state`);
  }

  const boarding = ui.renderSurface('boarding', enabled);
  for (const copy of ['小型犬', '¥7,400', '中型犬', '¥8,200', '大型犬', '¥8,900', 'LINEで予約相談']) {
    assert.match(boarding, new RegExp(copy));
  }
  const care = ui.renderSurface('care', enabled);
  for (const copy of ['犬の基本ケア', '爪切り', '耳掃除', '肛門腺', '¥4,500', '¥7,500', '¥9,000']) {
    assert.match(care, new RegExp(copy));
  }
  assert.doesNotMatch(care, /シャンプー|トリミング/);

  const schemas = ui.buildSchemaObjects(enabled);
  assert.equal(schemas.length, 2);
  assert.deepEqual(schemas.map((schema) => schema.offers.map((offer) => Number(offer.price))), [
    [7400, 8200, 8900],
    [4500, 7500, 9000],
  ]);
});

test('UI loader uses a minute-bucketed URL and fails closed on invalid data or timeout', async () => {
  const { projection, ui } = requirePipeline();
  const enabled = projection.buildDogServicesProjection(publicConfig());
  assert.equal(ui.projectionUrl(120000), '/dog-services-launch.json?v=2');
  assert.equal(ui.projectionUrl(179999), '/dog-services-launch.json?v=2');
  assert.equal(ui.projectionUrl(180000), '/dog-services-launch.json?v=3');

  assert.deepEqual(await ui.loadProjection({
    fetch: async () => ({ ok: true, json: async () => ({ public: true }) }),
    timeoutMs: 50,
  }), { public: false });
  assert.deepEqual(await ui.loadProjection({
    fetch: async () => ({ ok: true, json: async () => enabled }),
    timeoutMs: 50,
  }), enabled);
  assert.deepEqual(await ui.loadProjection({
    fetch: () => new Promise(() => {}),
    timeoutMs: 1,
  }), { public: false });
});

test('dog estimates require a validated public projection and use projected prices', () => {
  const { projection, ui } = requirePipeline();
  const disabled = projection.buildDogServicesProjection(require(CONFIG_PATH));
  const enabled = projection.buildDogServicesProjection(publicConfig());

  assert.deepEqual(ui.calculateEstimate(disabled, {
    size: 'small', checkInDate: '2026-06-01', checkOutDate: '2026-06-02', basicCare: true,
  }), { available: false, error: 'unavailable' });
  assert.deepEqual(ui.calculateEstimate({ ...enabled, extra: true }, {
    size: 'small', checkInDate: '2026-06-01', checkOutDate: '2026-06-02', basicCare: true,
  }), { available: false, error: 'unavailable' });

  const estimate = ui.calculateEstimate(enabled, {
    size: 'small', checkInDate: '2026-06-01', checkOutDate: '2026-06-02', basicCare: true,
  });
  assert.deepEqual({ boarding: estimate.boardingTotal, care: estimate.basicCareTotal, total: estimate.total }, {
    boarding: 7400, care: 4500, total: 11900,
  });
});

test('nav and all three public pages consume the same generated projection', () => {
  const nav = require('../nav.js');
  const { projection } = requirePipeline();
  const enabled = projection.buildDogServicesProjection(publicConfig());

  nav.resetDogServicesLaunchForTest();
  assert.deepEqual(nav.navGroups().find((group) => group.id === 'services').items.map((item) => item.key), [
    'nav.boarding', 'nav.grooming', 'nav.shop',
  ]);
  nav.applyDogServicesLaunch(enabled);
  const items = nav.navGroups().find((group) => group.id === 'services').items;
  assert.deepEqual(items.map((item) => item.key), [
    'nav.boarding', 'nav.grooming', 'nav.dogServices', 'nav.shop',
  ]);
  assert.equal(items[2].href, '/boarding/#dog-services');
  assert.equal(nav.dogServicesProjectionUrl(180000), '/dog-services-launch.json?v=3');

  for (const relative of ['boarding/index.html', 'grooming/index.html', 'boarding/estimate.html']) {
    const html = fs.readFileSync(path.join(ROOT, relative), 'utf8');
    assert.match(html, /data-dog-services-surface=/, relative);
    assert.match(html, /\/dog-services-projection\.js\?v=/, relative);
    assert.match(html, /\/dog-services-public-ui\.js\?v=/, relative);
  }
});

test('standard generator and verify-generated own projection freshness', () => {
  const generator = fs.readFileSync(path.join(ROOT, 'tools/generate-site.js'), 'utf8');
  const verifier = fs.readFileSync(path.join(ROOT, 'tools/verify-generated.js'), 'utf8');
  assert.match(generator, /writeDogServicesProjection/);
  assert.match(verifier, /dog-services-launch\.json/);
  assert.match(verifier, /serializeDogServicesProjection/);
});

test('verify-generated rejects a stale dog projection artifact', (t) => {
  const site = fs.mkdtempSync(path.join(os.tmpdir(), 'fuluck-dog-projection-'));
  t.after(() => fs.rmSync(site, { recursive: true, force: true }));
  fs.mkdirSync(path.join(site, 'tools'));
  for (const relative of [
    'boarding-public-config.js',
    'dog-services-projection.js',
    'tools/robots-meta.js',
    'tools/verify-generated.js',
  ]) {
    fs.copyFileSync(path.join(ROOT, relative), path.join(site, relative));
  }
  fs.writeFileSync(path.join(site, 'dog-services-launch.json'), '{"public":true}\n');
  fs.writeFileSync(path.join(site, 'kittens.html'), [
    '<link href="/style.css?v=test">',
    '<link href="/nav.css?v=test">',
    '<script src="/i18n.js?v=test"></script>',
    '<script src="/nav.js?v=test"></script>',
  ].join('\n'));
  fs.writeFileSync(path.join(site, 'sitemap.xml'), [
    '<urlset>',
    '<!-- 成長日記 -->', '<!-- /成長日記 -->',
    '<!-- 子猫詳細ページ -->', '<!-- ブログ記事 -->',
    '<url><loc>https://fuluckpet.com/kittens.html</loc></url>',
    '</urlset>',
  ].join('\n'));

  const result = childProcess.spawnSync(process.execPath, [path.join(site, 'tools/verify-generated.js')], {
    cwd: site,
    encoding: 'utf8',
  });
  assert.equal(result.status, 1);
  assert.match(`${result.stdout}\n${result.stderr}`, /\[dog-services\].*stale/);
});

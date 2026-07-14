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
const PREPARING_PATH = path.join(ROOT, 'dog-services-preparing.json');

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
    HOLIDAYS: source.HOLIDAYS.slice(),
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
  if (config.CONFIG.careCatalog.dog) {
    const dogCatalog = config.CONFIG.careCatalog.dog;
    config.CONFIG.careCatalog = {
      ...config.CONFIG.careCatalog,
      dog: {
        ...dogCatalog,
        items: dogCatalog.items.map((item, index) => index === 0 ? {
          ...item,
          secret: 'must-not-leak',
          priceBySize: { ...item.priceBySize, injected: 1 },
        } : item),
      },
    };
  }

  const value = projection.buildDogServicesProjection(config);
  assert.equal(projection.validateDogServicesProjection(value), true);
  assert.equal(value.version, 2);
  assert.deepEqual(value.sizes, {
    small: { label: '小型犬', boardingPerNight: 7400 },
    medium: { label: '中型犬', boardingPerNight: 8200 },
    large: { label: '大型犬', boardingPerNight: 8900 },
  });
  assert.deepEqual(value.care, {
    items: [
      { id: 'nail', label: '爪切り', priceBySize: { small: 660, medium: 880, large: 1100 } },
      { id: 'ear', label: '耳掃除', priceBySize: { small: 660, medium: 880, large: 1100 } },
      { id: 'anal', label: '肛門腺', priceBySize: { small: 660, medium: 880, large: 1100 } },
    ],
    bundles: [
      {
        id: 'basic3',
        label: '基本ケア3点セット',
        includedItemIds: ['nail', 'ear', 'anal'],
        priceBySize: { small: 1650, medium: 2200, large: 2750 },
      },
    ],
  });
  assert.deepEqual(value.calendar.holidays, require(CONFIG_PATH).HOLIDAYS);
  assert.ok(value.calendar.holidays.includes('2027-11-23'));
  assert.deepEqual(Object.keys(value).sort(), [
    'calendar', 'care', 'currency', 'dateSurcharge', 'longStayDiscount', 'memberDiscountRate',
    'public', 'roundUnit', 'sizes', 'taxIncluded', 'version',
  ]);
  assert.doesNotMatch(JSON.stringify(value), /secret|script|injected|シャンプー|トリミング/);
});

test('preparing projection exposes approved display data while preserving the closed launch gate', () => {
  const { projection } = requirePipeline();
  const config = require(CONFIG_PATH);
  const value = projection.buildDogServicesPreparingProjection(config);

  assert.equal(projection.validateDogServicesPreparingProjection(value), true);
  assert.equal(value.public, false);
  assert.equal(value.preparing, true);
  assert.equal(value.accepting, false);
  assert.equal(value.locationNotice, '大阪・針中野での受付開始を予定しています。開始時期は決まり次第お知らせします。');
  assert.equal(value.version, 2);
  assert.deepEqual(value.sizes.small, { label: '小型犬', boardingPerNight: 7400 });
  assert.deepEqual(value.care.items[0], {
    id: 'nail',
    label: '爪切り',
    priceBySize: { small: 660, medium: 880, large: 1100 },
  });
  assert.deepEqual(value.care.bundles[0].priceBySize, { small: 1650, medium: 2200, large: 2750 });
  assert.deepEqual(JSON.parse(fs.readFileSync(PREPARING_PATH, 'utf8')), value);
  assert.equal(projection.serializeDogServicesProjection(config), '{"public":false}\n');
});

test('strict validator rejects extra keys, wrong prices and caller-forged partial projections', () => {
  const { projection } = requirePipeline();
  const valid = projection.buildDogServicesProjection(publicConfig());
  assert.equal(projection.validateDogServicesProjection(valid), true);
  assert.equal(valid.version, 2);
  assert.equal(projection.validateDogServicesProjection({ public: true }), false);
  assert.equal(projection.validateDogServicesProjection({ public: false, sizes: valid.sizes }), false);
  assert.equal(projection.validateDogServicesProjection({ ...valid, extra: true }), false);
  assert.equal(projection.validateDogServicesProjection({
    ...valid,
    sizes: { ...valid.sizes, small: { ...valid.sizes.small, boardingPerNight: 660 } },
  }), false);
  for (const carePrice of [1, 660, 880, Number.MAX_SAFE_INTEGER]) {
    assert.equal(projection.validateDogServicesProjection({
      ...valid,
      care: {
        ...valid.care,
        items: valid.care.items.map((item, index) => index === 0 ? {
          ...item,
          priceBySize: { ...item.priceBySize, small: carePrice },
        } : item),
      },
    }), true, `care price ${carePrice}`);
  }
  assert.equal(projection.validateDogServicesProjection({
    ...valid,
    care: {
      ...valid.care,
      items: valid.care.items.map((item, index) => index === 0 ? { ...item, extra: true } : item),
    },
  }), false);
  assert.equal(projection.validateDogServicesProjection({
    ...valid,
    care: {
      ...valid.care,
      items: valid.care.items.map((item, index) => index === 0 ? {
        ...item,
        priceBySize: { small: item.priceBySize.small, medium: item.priceBySize.medium },
      } : item),
    },
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
  for (const copy of [
    '犬の基本ケア', '爪切り', '耳掃除', '肛門腺', '基本ケア3点セット',
    '¥660', '¥880', '¥1,100', '¥1,650', '¥2,200', '¥2,750',
  ]) {
    assert.match(care, new RegExp(copy));
  }
  assert.doesNotMatch(care, /トリミング|カット|シャンプーコース|剪毛|専門美容/);

  const schemas = ui.buildSchemaObjects(enabled);
  assert.equal(schemas.length, 2);
  assert.deepEqual(schemas.map((schema) => schema.offers.map((offer) => Number(offer.price))), [
    [7400, 8200, 8900],
    [660, 880, 1100, 660, 880, 1100, 660, 880, 1100, 1650, 2200, 2750],
  ]);
});

test('preparing UI shows stopped dog prices and calculator without booking CTA or schema', () => {
  const { projection, ui } = requirePipeline();
  const preparing = projection.buildDogServicesPreparingProjection(require(CONFIG_PATH));
  for (const surface of ['boarding', 'care', 'estimate', 'estimate-care']) {
    assert.notEqual(ui.renderSurface(surface, preparing), '', surface);
  }
  const boarding = ui.renderSurface('boarding', preparing);
  assert.match(boarding, /現在受付停止/);
  assert.match(boarding, /大阪・針中野/);
  assert.match(boarding, /¥7,400/);
  assert.match(boarding, /料金を計算/);
  assert.doesNotMatch(boarding, /LINE|予約相談|申し込/);

  const care = ui.renderSurface('care', preparing);
  assert.equal((care.match(/<section\b/g) || []).length, 1);
  assert.equal((care.match(/<details\b/g) || []).length, 1);
  assert.equal((care.match(/<table\b/g) || []).length, 1);
  const detailsTag = care.match(/<details\b[^>]*>/);
  assert.ok(detailsTag);
  assert.doesNotMatch(detailsTag[0], /\bopen\b/);
  for (const copy of ['予定価格', '現在受付停止', '大阪・針中野', '爪切り', '耳掃除', '肛門腺', '基本ケア3点セット']) {
    assert.match(care, new RegExp(copy));
  }
  assert.doesNotMatch(care, /<a\b|<button\b/);
  assert.doesNotMatch(care, /LINE|トリミング|カット|シャンプーコース|剪毛|専門美容/);

  const estimateCare = ui.renderSurface('estimate-care', preparing);
  assert.match(estimateCare, /id="dogCareField"[^>]*\bhidden\b/);
  assert.equal((estimateCare.match(/type="radio"/g) || []).length, 5);
  assert.equal((estimateCare.match(/name="dogCareOffer"/g) || []).length, 5);
  assert.match(estimateCare, /予定価格/);
  assert.match(estimateCare, /現在受付停止/);

  assert.deepEqual(ui.buildSchemaObjects(preparing), []);

  const estimate = ui.calculateEstimate(preparing, {
    size: 'small', checkInDate: '2026-06-01', checkOutDate: '2026-06-02', basicCare: true,
  });
  assert.deepEqual({ available: estimate.available, accepting: estimate.accepting, total: estimate.total }, {
    available: true, accepting: false, total: 9050,
  });
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
    boarding: 7400, care: 1650, total: 9050,
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
    'nav.boarding', 'nav.grooming', 'nav.shop',
  ]);
  assert.equal(nav.dogServicesProjectionUrl(180000), '/dog-services-launch.json?v=3');
  const i18n = fs.readFileSync(path.join(ROOT, 'i18n.js'), 'utf8');
  assert.match(i18n, /'nav\.boarding': '猫・犬のお預かり/);
  assert.match(i18n, /'nav\.grooming': '猫・犬のケア/);
  assert.doesNotMatch(i18n, /'nav\.dogServices'/);

  for (const relative of ['boarding/index.html', 'grooming/index.html', 'boarding/estimate.html']) {
    const html = fs.readFileSync(path.join(ROOT, relative), 'utf8');
    assert.match(html, /data-dog-services-surface=/, relative);
    assert.match(html, /\/dog-services-projection\.js\?v=/, relative);
    assert.match(html, /\/dog-services-public-ui\.js\?v=/, relative);
  }
});

test('dog estimator keeps stopped calculations separate from reservation actions', () => {
  const html = fs.readFileSync(path.join(ROOT, 'boarding/estimate.html'), 'utf8');
  const source = fs.readFileSync(path.join(ROOT, 'boarding/boarding-public-estimate.js'), 'utf8');
  assert.match(html, /id="dogStopNote"[^>]*hidden/);
  assert.match(html, /現在受付停止/);
  assert.match(html, /受付中のサービスのみLINE相談後に確定/);
  assert.match(source, /lineButton\.hidden\s*=\s*isDog/);
  assert.match(source, /dogStopNote\.hidden\s*=\s*!isDog/);
  assert.match(source, /dateNote\.textContent\s*=\s*isDog\s*\?/);
  assert.match(source, /犬は現在受付停止です。受付開始後に対象日程を更新します。/);
  assert.match(source, /isDog\s*\?\s*'※犬は現在受付停止です。概算のみ確認できます。'/);
  assert.match(source, /コピーできませんでした。画面の内容をご確認ください。/);
  assert.match(source, /validateDogServicesPreparingProjection/);
});

test('standard generator and verify-generated own projection freshness', () => {
  const generator = fs.readFileSync(path.join(ROOT, 'tools/generate-site.js'), 'utf8');
  const verifier = fs.readFileSync(path.join(ROOT, 'tools/verify-generated.js'), 'utf8');
  assert.match(generator, /writeDogServicesProjection/);
  assert.match(verifier, /dog-services-launch\.json/);
  assert.match(verifier, /serializeDogServicesProjection/);
  assert.match(generator, /dog-services-preparing\.json/);
  assert.match(verifier, /serializeDogServicesPreparingProjection/);
});

test('verify-generated rejects a stale dog projection artifact', (t) => {
  const site = fs.mkdtempSync(path.join(os.tmpdir(), 'fuluck-dog-projection-'));
  t.after(() => fs.rmSync(site, { recursive: true, force: true }));
  fs.mkdirSync(path.join(site, 'tools'));
  for (const relative of [
    'boarding-public-config.js',
    'dog-services-projection.js',
    'grooming/index.html',
    'tools/care-catalog-static.js',
    'tools/robots-meta.js',
    'tools/safe-json-for-html.js',
    'tools/verify-generated.js',
  ]) {
    fs.mkdirSync(path.dirname(path.join(site, relative)), { recursive: true });
    fs.copyFileSync(path.join(ROOT, relative), path.join(site, relative));
  }
  fs.writeFileSync(path.join(site, 'dog-services-launch.json'), '{"public":true}\n');
  fs.writeFileSync(path.join(site, 'dog-services-preparing.json'), '{}\n');
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

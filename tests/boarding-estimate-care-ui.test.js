'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');

function tagWithId(html, tagName, id) {
  const match = html.match(new RegExp(`<${tagName}\\b[^>]*\\bid=["']${id}["'][^>]*>`, 'i'));
  assert.ok(match, `${tagName}#${id} is required`);
  return match[0];
}

class EstimateEvent {
  constructor(type) {
    this.type = type;
    this.defaultPrevented = false;
  }

  preventDefault() { this.defaultPrevented = true; }
}

class EstimateElement {
  constructor(tagName, id = '') {
    this.tagName = String(tagName).toUpperCase();
    this.id = id;
    this.children = [];
    this.parentNode = null;
    this.attributes = Object.create(null);
    this.listeners = Object.create(null);
    this.style = {};
    this._textContent = '';
    this.value = '';
    this.type = '';
    this.name = '';
    this.checked = false;
    this.disabled = false;
    this.hidden = false;
  }

  appendChild(child) {
    const firstChild = this.children.length === 0;
    child.parentNode = this;
    this.children.push(child);
    if (this.tagName === 'SELECT' && child.tagName === 'OPTION' && firstChild) this.value = child.value;
    return child;
  }

  removeChild(child) {
    const index = this.children.indexOf(child);
    if (index !== -1) this.children.splice(index, 1);
    child.parentNode = null;
    return child;
  }

  set textContent(value) {
    this._textContent = String(value == null ? '' : value);
    this.children = [];
    if (this.tagName === 'SELECT') this.value = '';
  }

  get textContent() {
    return this._textContent + this.children.map((child) => child.textContent).join('');
  }

  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return Object.hasOwn(this.attributes, name) ? this.attributes[name] : null; }
  removeAttribute(name) { delete this.attributes[name]; }

  addEventListener(type, listener) {
    (this.listeners[type] ||= []).push(listener);
  }

  dispatchEvent(event) {
    if (!event || !event.type) throw new TypeError('event type is required');
    event.target = this;
    event.currentTarget = this;
    for (const listener of this.listeners[event.type] || []) listener.call(this, event);
    return !event.defaultPrevented;
  }

  select() {}
}

function createEstimateRuntime() {
  const elements = new Map();
  const add = (id, tagName = 'div', text = '') => {
    const element = new EstimateElement(tagName, id);
    element.textContent = text;
    elements.set(id, element);
    return element;
  };
  add('checkIn', 'input').value = '2026-09-01';
  add('checkOut', 'input').value = '2026-09-02';
  add('discountCard', 'section');
  add('graduatedWrap', 'label');
  add('isGraduatedCat', 'input').type = 'checkbox';
  add('catCareField', 'div');
  add('catCarePackage', 'select');
  add('catCareItems', 'ul');
  add('dogCareField', 'div');
  add('transportDistance', 'select');
  add('transportTrip', 'select');
  add('resultEmpty', 'p');
  add('resultBody', 'div');
  add('resultLines', 'ul');
  add('totalRow', 'div');
  add('totalLabel', 'span');
  add('totalValue', 'strong');
  add('reviewNote', 'p');
  add('dogStopNote', 'p');
  add('dateNote', 'p');
  add('dateError', 'p');
  add('resultActions', 'div');
  add('lineButton', 'a', 'LINEで相談する');
  add('copyButton', 'button', '内容をコピー');
  add('copyMessage', 'span');

  const petInputs = ['cat', 'rabbit_cage', 'hamster_cage', 'dog_small'].map((value) => {
    const input = new EstimateElement('input', `pet-${value}`);
    input.type = 'radio';
    input.name = 'petType';
    input.value = value;
    input.checked = value === 'cat';
    return input;
  });
  const dogCareInputs = [''].map((value) => {
    const input = new EstimateElement('input', 'dog-care-none');
    input.type = 'radio';
    input.name = 'dogCareOffer';
    input.value = value;
    input.checked = true;
    return input;
  });
  const byValueSelector = /^input\[name="petType"\]\[value="([^"]+)"\]$/;
  const body = new EstimateElement('body');
  const document = {
    body,
    createElement(tagName) { return new EstimateElement(tagName); },
    getElementById(id) { return elements.get(id) || null; },
    querySelectorAll(selector) {
      if (selector === 'input[name="petType"]') return petInputs;
      if (selector === 'input[name="dogCareOffer"]') return dogCareInputs;
      return [];
    },
    querySelector(selector) {
      if (selector === 'input[name="petType"]:checked') return petInputs.find((input) => input.checked) || null;
      if (selector === 'input[name="dogCareOffer"]:checked') return dogCareInputs.find((input) => input.checked) || null;
      const match = byValueSelector.exec(selector);
      return match ? petInputs.find((input) => input.value === match[1]) || null : null;
    },
    execCommand() { return true; },
  };
  let copiedText = '';
  const root = {
    document,
    navigator: {
      clipboard: {
        writeText(value) {
          copiedText = value;
          return Promise.resolve();
        },
      },
    },
    BoardingCalc: require('../boarding-public-calc.js'),
    BOARDING_CONFIG: require('../boarding-public-config.js'),
    DogServicesProjection: require('../dog-services-projection.js'),
    URLSearchParams,
    location: { search: '' },
  };
  const api = require('../boarding/boarding-public-estimate.js');
  const runtime = api.init(root);

  return {
    elements,
    petInputs,
    runtime,
    copiedText: () => copiedText,
    change(element) { element.dispatchEvent(new EstimateEvent('change')); },
    click(element) { element.dispatchEvent(new EstimateEvent('click')); },
    selectPet(value) {
      for (const input of petInputs) input.checked = input.value === value;
      const selected = petInputs.find((input) => input.checked);
      selected.dispatchEvent(new EstimateEvent('change'));
    },
  };
}

test('estimate dates expose the extended supported range and accessible errors', () => {
  const html = read('boarding/estimate.html');
  const checkIn = tagWithId(html, 'input', 'checkIn');
  const checkOut = tagWithId(html, 'input', 'checkOut');
  const dateError = tagWithId(html, 'p', 'dateError');

  assert.match(checkIn, /\bmax=["']2027-12-31["']/);
  assert.match(checkOut, /\bmax=["']2028-01-01["']/);
  for (const input of [checkIn, checkOut]) {
    assert.match(input, /\baria-describedby=["'][^"']*\bdateNote\b[^"']*\bdateError\b[^"']*["']/);
  }
  assert.match(dateError, /\brole=["']status["']/);
  assert.match(html, /2028年1月2日以降/);
});

test('estimate replaces the static cat menu with catalog-backed cat and dog fields', () => {
  const html = read('boarding/estimate.html');

  assert.match(html, /\bid=["']catCareField["']/);
  assert.match(html, /\bid=["']catCarePackage["']/);
  assert.match(html, /\bid=["']catCareItems["']/);
  assert.doesNotMatch(html, /\bid=["']catCare["']/);
  assert.match(html, /data-dog-services-surface=["']estimate-care["']/);
  assert.doesNotMatch(html, /isMember|会員/);
  assert.match(html, /福楽卒業猫（お預かり・猫のケア 30%OFF／併用不可）/);
});

test('estimate exposes transport distance and trip selectors with a fail-closed initial state', () => {
  const html = read('boarding/estimate.html');
  const distance = tagWithId(html, 'select', 'transportDistance');
  const trip = tagWithId(html, 'select', 'transportTrip');

  assert.match(html, /4\. 送迎を利用しますか？/);
  assert.match(distance, /\baria-describedby=["']transportHelp["']/);
  assert.match(trip, /\bdisabled\b/);
  assert.match(trip, /\baria-describedby=["']transportHelp["']/);
  assert.match(html, /id=["']transportHelp["']/);
  assert.match(html, /送迎料金は割引対象外/);
});

test('species state exposes cat controls only for cats and dog controls only for dogs', () => {
  const api = require('../boarding/boarding-public-estimate.js');

  assert.deepEqual(api.stateFor('cat'), { catCareHidden: false, dogCareHidden: true });
  assert.deepEqual(api.stateFor('dog_small'), { catCareHidden: true, dogCareHidden: false });
  assert.deepEqual(api.stateFor('rabbit_cage'), { catCareHidden: true, dogCareHidden: true });
});

test('selecting a cat package clears an included single before disabling it', () => {
  const api = require('../boarding/boarding-public-estimate.js');
  const catalog = {
    packages: [{ id: 'short', includedItemIds: ['nail'] }],
    items: [
      { id: 'nail', maxQuantity: 1 },
      { id: 'matting15', maxQuantity: 8 },
    ],
  };
  const events = [];
  const nail = { type: 'checkbox' };
  Object.defineProperties(nail, {
    checked: { configurable: true, set(value) { events.push(`checked:${value}`); } },
    disabled: { configurable: true, set(value) { events.push(`disabled:${value}`); } },
  });
  const matting = { type: 'select-one', value: '2', disabled: true };

  api.applyCatPackageSelection('short', catalog, { nail, matting15: matting });

  assert.deepEqual(events, ['checked:false', 'disabled:true']);
  assert.equal(matting.value, '2');
  assert.equal(matting.disabled, false);
});

test('stopped dog output never exposes LINE while its completed quote remains copyable', () => {
  const api = require('../boarding/boarding-public-estimate.js');

  for (const mode of ['empty', 'error', 'result', 'date-limit']) {
    assert.equal(api.actionStateFor('dog_small', mode).lineHidden, true, mode);
  }
  assert.deepEqual(api.actionStateFor('dog_small', 'result'), {
    lineHidden: true,
    lineDisabled: true,
    copyHidden: false,
  });
  assert.deepEqual(api.actionStateFor('cat', 'date-limit'), {
    lineHidden: false,
    lineDisabled: false,
    copyHidden: true,
  });
  assert.deepEqual(api.actionStateFor('rabbit_cage', 'date-limit'), {
    lineHidden: false,
    lineDisabled: false,
    copyHidden: true,
  });
});

test('dog estimate result and copied quote label planned prices only while stopped', () => {
  const api = require('../boarding/boarding-public-estimate.js');
  const html = read('boarding/estimate.html');
  const source = read('boarding/boarding-public-estimate.js');
  const stopped = api.priceSemanticsFor('dog_small', false);

  assert.deepEqual(stopped, {
    planned: true,
    boardingLabel: '犬のお預かり（予定価格）',
    totalLabel: '概算合計（税込予定価格）',
  });
  const stoppedQuote = api.buildQuoteText({
    type: 'dog_small',
    dogAccepting: false,
    animalLabel: '小型犬',
    checkIn: '2026-08-01',
    checkOut: '2026-08-02',
    nights: 1,
    lines: [{ label: stopped.boardingLabel, detail: '¥5,000 × 1泊', value: '¥5,000' }],
    total: 5000,
  });
  for (const copy of [
    '【犬のお預かり 予定価格概算】',
    '犬のお預かり（予定価格）',
    '予定価格合計（税込）：¥5,000',
    '犬は現在受付停止です。表示額は税込予定価格です。',
  ]) assert.match(stoppedQuote, new RegExp(copy.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

  const accepting = api.priceSemanticsFor('dog_small', true);
  assert.deepEqual(accepting, {
    planned: false,
    boardingLabel: '犬のお預かり',
    totalLabel: '概算合計（税込）',
  });
  const acceptedQuote = api.buildQuoteText({
    type: 'dog_small', dogAccepting: true, animalLabel: '小型犬',
    checkIn: '2026-08-01', checkOut: '2026-08-02', nights: 1,
    lines: [{ label: accepting.boardingLabel, detail: '¥5,000 × 1泊', value: '¥5,000' }],
    total: 5000,
  });
  assert.doesNotMatch(acceptedQuote, /予定価格|受付停止/);
  assert.match(acceptedQuote, /概算合計（税込）：¥5,000/);
  assert.equal(api.priceSemanticsFor('cat', false).planned, false);

  assert.match(html, /id="totalLabel">概算合計（税込）<\/span>/);
  assert.match(html, /id="dogStopNote"[^>]*hidden[^>]*>[\s\S]*税込予定価格/);
  assert.match(source, /dogPricing\.boardingLabel/);
  assert.match(source, /elements\.totalLabel\.textContent\s*=\s*pricing\.totalLabel/);
  assert.match(source, /quoteText\s*=\s*buildQuoteText\(/);
});

test('selected dog care uses planned wording only in stopped screen results and copied quotes', () => {
  const api = require('../boarding/boarding-public-estimate.js');
  assert.equal(typeof api.dogCareLineFor, 'function');
  assert.equal(typeof api.dogReviewMessageFor, 'function');

  const stoppedLine = api.dogCareLineFor('爪切り', 660, true);
  assert.deepEqual(stoppedLine, { label: '犬のケア：爪切り', detail: '予定価格', value: '+¥660' });
  const stoppedQuote = api.buildQuoteText({
    type: 'dog_small', dogAccepting: false, animalLabel: '小型犬',
    checkIn: '2026-08-01', checkOut: '2026-08-02', nights: 1,
    lines: [stoppedLine], total: 660,
  });
  assert.match(stoppedQuote, /犬のケア：爪切り（予定価格）/);
  assert.match(stoppedQuote, /税込予定価格/);
  assert.doesNotMatch(api.dogReviewMessageFor(true, true), /正式料金/);

  const acceptingLine = api.dogCareLineFor('爪切り', 660, false);
  assert.deepEqual(acceptingLine, { label: '犬のケア：爪切り', detail: '', value: '+¥660' });
  const acceptingQuote = api.buildQuoteText({
    type: 'dog_small', dogAccepting: true, animalLabel: '小型犬',
    checkIn: '2026-08-01', checkOut: '2026-08-02', nights: 1,
    lines: [acceptingLine], total: 660,
  });
  assert.doesNotMatch(acceptingQuote, /予定価格|受付停止/);
  assert.match(api.dogReviewMessageFor(true, false), /正式料金/);
  assert.equal(api.dogReviewMessageFor(false, true), '');
});

test('transport presentation adds priced transport only after the discounted service subtotal', () => {
  const api = require('../boarding/boarding-public-estimate.js');
  const serviceLines = [{ label: 'お預かり割引', detail: '30%OFF', value: '-¥1,200' }];
  const result = api.applyTransportEstimate(serviceLines, 2800, [], {
    status: 'priced', tierId: 'within3', tripType: 'oneWay', label: '3km以内',
    subtotal: 1650, needsQuote: false, discountEligible: false,
  });

  assert.deepEqual(result, {
    lines: [
      serviceLines[0],
      { label: '送迎', detail: '3km以内・片道1回', value: '+¥1,650' },
    ],
    total: 4450,
    reviewMessages: [],
    unavailableMessage: '',
  });
});

test('transport quote copy names the chosen distance and trip without a zero-yen display', () => {
  const api = require('../boarding/boarding-public-estimate.js');
  const result = api.applyTransportEstimate([], 4000, [], {
    status: 'quote', tierId: 'over10to20', tripType: 'roundTrip', label: '10kmを超え20km以内',
    subtotal: 0, needsQuote: true, discountEligible: false,
  });
  const quote = api.buildQuoteText({
    type: 'cat', dogAccepting: false, animalLabel: '猫',
    checkIn: '2026-08-20', checkOut: '2026-08-21', nights: 1,
    lines: result.lines, total: result.total,
  });

  assert.equal(result.total, 4000);
  assert.match(result.reviewMessages[0], /LINE/);
  assert.match(quote, /送迎（10kmを超え20km以内・お迎え＋お送り） LINE見積り/);
  assert.doesNotMatch(quote, /送迎[^\n]*¥0/);
});

test('stopped dog transport quote stays copy-only without any LINE invitation', () => {
  const api = require('../boarding/boarding-public-estimate.js');
  const result = api.applyTransportEstimate([], 5000, [], {
    status: 'quote', tierId: 'over10to20', tripType: 'roundTrip', label: '10kmを超え20km以内',
    subtotal: 0, needsQuote: true, discountEligible: false,
  }, true);
  const quote = api.buildQuoteText({
    type: 'dog_small', dogAccepting: false, animalLabel: '小型犬',
    checkIn: '2026-08-20', checkOut: '2026-08-21', nights: 1,
    lines: result.lines, total: result.total,
  });

  assert.deepEqual(result.lines, [{
    label: '送迎', detail: '10kmを超え20km以内・お迎え＋お送り', value: '受付開始後にご案内',
  }]);
  assert.match(result.reviewMessages.join(' '), /受付開始後にご案内/);
  assert.doesNotMatch(result.reviewMessages.join(' '), /LINE/);
  assert.match(quote, /受付開始後にご案内/);
  assert.doesNotMatch(quote, /LINE|LINE見積り/);
});

test('unavailable transport blocks the service estimate with the required no-service message', () => {
  const api = require('../boarding/boarding-public-estimate.js');
  const result = api.applyTransportEstimate([], 4000, [], {
    status: 'unavailable', tierId: 'over20', tripType: 'oneWay', label: '20km超',
    subtotal: 0, needsQuote: false, error: 'transport_unavailable',
  });

  assert.equal(result.unavailableMessage, '20kmを超える住所への送迎は承っていません。');
  assert.deepEqual(result.lines, []);
});

test('production init builds canonical transport controls and change events render priced, quote, and unavailable states', () => {
  const harness = createEstimateRuntime();
  const config = require('../boarding-public-config.js').CONFIG;
  const distance = harness.elements.get('transportDistance');
  const trip = harness.elements.get('transportTrip');

  assert.deepEqual(
    distance.children.map((option) => [option.value, option.textContent]),
    [['', '送迎を利用しない'], ...config.petTransport.tiers.map((tier) => [tier.id, tier.label])],
  );
  assert.equal(trip.disabled, true);

  distance.value = 'within3';
  harness.change(distance);
  assert.equal(trip.disabled, false);
  assert.match(harness.elements.get('resultLines').textContent, /送迎3km以内・片道1回\+¥1,650/);
  assert.equal(harness.elements.get('totalValue').textContent, '¥5,650');

  trip.value = 'roundTrip';
  harness.change(trip);
  assert.match(harness.elements.get('resultLines').textContent, /お迎え＋お送り\+¥3,300/);
  assert.equal(harness.elements.get('totalValue').textContent, '¥7,300');

  distance.value = 'over10to20';
  harness.change(distance);
  assert.match(harness.elements.get('resultLines').textContent, /LINE見積り/);
  assert.match(harness.elements.get('reviewNote').textContent, /LINEで正式料金/);
  assert.equal(harness.elements.get('totalValue').textContent, '¥4,000');
  assert.equal(harness.elements.get('lineButton').hidden, false);
  assert.equal(harness.elements.get('copyButton').hidden, false);
  assert.equal(harness.elements.get('resultActions').hidden, false);

  distance.value = 'over20';
  harness.change(distance);
  assert.equal(harness.elements.get('resultEmpty').textContent, '20kmを超える住所への送迎は承っていません。');
  assert.equal(harness.elements.get('resultBody').hidden, true);
  assert.doesNotMatch(harness.elements.get('resultEmpty').textContent, /¥0/);
});

test('production change listeners keep stopped-dog transport quote and copied text free of LINE actions', async () => {
  const harness = createEstimateRuntime();
  const projection = require('../dog-services-preparing.json');
  assert.equal(harness.runtime.enableDogServices(projection), true);

  harness.selectPet('dog_small');
  const distance = harness.elements.get('transportDistance');
  distance.value = 'over10to20';
  harness.change(distance);

  const visibleResult = harness.elements.get('resultLines').textContent + harness.elements.get('reviewNote').textContent;
  assert.match(visibleResult, /受付開始後にご案内/);
  assert.doesNotMatch(visibleResult, /LINE/);
  assert.equal(harness.elements.get('lineButton').hidden, true);
  assert.equal(harness.elements.get('copyButton').hidden, false);
  assert.equal(harness.elements.get('resultActions').hidden, false);

  harness.click(harness.elements.get('copyButton'));
  await Promise.resolve();
  assert.match(harness.copiedText(), /犬のお預かり 予定価格概算/);
  assert.match(harness.copiedText(), /受付開始後にご案内/);
  assert.doesNotMatch(harness.copiedText(), /LINE/);
});

test('estimator consumes the canonical care catalogs without legacy aliases', () => {
  const source = read('boarding/boarding-public-estimate.js');
  const config = require('../boarding-public-config.js');

  assert.match(source, /Config\.careCatalog\.cat/);
  assert.match(source, /document\.createElement\(/);
  assert.match(source, /\.textContent\s*=/);
  assert.doesNotMatch(source, /\.innerHTML\s*=/);
  assert.match(source, /Calc\.calculateCatCare\(/);
  assert.match(source, /input\[name=["']dogCareOffer["']\]:checked/);
  assert.match(source, /Calc\.calculateDogCare\(/);
  for (const copy of ['7泊以上 5%OFF', '14泊以上 10%OFF', '21泊以上 15%OFF', '30泊以上 20%OFF']) {
    assert.match(source, new RegExp(copy));
  }
  assert.match(source, /福楽卒業猫 30%OFF（他の割引と併用不可）/);
  assert.doesNotMatch(source, /isMember|会員|surchargeLabels|addSurchargeLines/);
  assert.match(source, /毛玉・ブラッシング[^\n]{0,100}割引対象外/);
  assert.doesNotMatch(source, /dogBasicCare|calculateDogBasicCare|catGroomingDiscount|calculateCatGrooming/);
  assert.equal(Object.hasOwn(config.CONFIG, 'catGroomingDiscount'), false);
});

test('estimate CSS keeps compact semantic care controls touch-safe and narrow-screen friendly', () => {
  const css = read('services.css');

  assert.match(css, /\.estimate-care-field\s+fieldset/);
  assert.match(css, /\.estimate-care-list/);
  assert.match(css, /\.estimate-care-control[^}]*min-height:\s*44px/s);
  assert.match(css, /@media\s*\(max-width:\s*600px\)[\s\S]*?\.estimate-care-list[\s\S]*?grid-template-columns:\s*1fr/);
});

test('transport selectors keep disabled and narrow-screen help states readable', () => {
  const css = read('services.css');

  assert.match(css, /\.estimate-field\s+select:disabled[^}]*cursor:\s*not-allowed/s);
  assert.match(css, /\.estimate-transport-help/);
  assert.match(css, /@media\s*\(max-width:\s*600px\)[\s\S]*?\.estimate-transport-help/);
});

'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const inquiry = require('../inquiry-context.js');
const source = fs.readFileSync(require.resolve('../analytics.js'), 'utf8');

test('all three kitten drafts retain only the validated ID, canonical localized URL and translated template', () => {
  for (const [lang, intro] of [['ja', 'こちらの子猫'], ['en', 'I would like'], ['zh', '您好']]) {
    const url = new URL(inquiry.draft('2608-52935', lang));
    assert.equal(url.origin + url.pathname, 'https://line.me/R/oaMessage/%40915hnnlk/');
    const text = decodeURIComponent(url.search.slice(1));
    assert.ok(text.startsWith(intro));
    assert.ok(text.endsWith(`https://fuluckpet.com/${lang === 'ja' ? '' : lang + '/'}kittens/2608-52935.html`));
    assert.ok(text.includes('2608-52935'));
    assert.deepEqual(inquiry.context(`/${lang === 'ja' ? '' : lang + '/'}kittens/2608-52935.html`, lang), { id: '2608-52935', lang });
  }
  assert.equal(inquiry.draft('2608-52935&message=private', 'zh'), '');
  assert.equal(inquiry.context('/boarding/', 'zh'), null);
  assert.equal(inquiry.context('/kittens.html', 'ja'), null);
});

test('only this official LINE chat is contextualized; calls, services and lookalike hosts remain generic', () => {
  for (const href of ['https://page.line.me/915hnnlk?openQrModal=true', inquiry.draft('2608-52935', 'en')]) assert.equal(inquiry.isChatLink(href), true);
  for (const href of ['https://page.line.me/915hnnlk?call=1', 'https://page.line.me/another', 'https://page.line.me.evil.test/915hnnlk', 'http://page.line.me/915hnnlk', 'https://user@page.line.me/915hnnlk']) assert.equal(inquiry.isChatLink(href), false);
});

test('real draft initializer updates late links and language changes while preserving call links', () => {
  const links = [];
  const addLink = href => {
    const link = { href, getAttribute() { return this.href; }, setAttribute(_name, value) { this.href = value; } };
    links.push(link); return link;
  };
  const chat = addLink('https://page.line.me/915hnnlk?openQrModal=true');
  const call = addLink('https://page.line.me/915hnnlk?call=1');
  const listeners = {};
  let mutation;
  const document = { readyState: 'complete', documentElement: { lang: 'ja' }, body: {}, querySelectorAll() { return links; } };
  const window = { document, location: { pathname: '/kittens/2608-52935.html' }, addEventListener(type, fn) { listeners[type] = fn; }, MutationObserver: class { constructor(fn) { mutation = fn; } observe() {} } };
  vm.runInNewContext(fs.readFileSync(require.resolve('../inquiry-context.js'), 'utf8'), { window, URL });
  assert.equal(chat.href, inquiry.draft('2608-52935', 'ja'));
  document.documentElement.lang = 'en'; listeners.langChanged();
  assert.equal(chat.href, inquiry.draft('2608-52935', 'en'));
  const late = addLink('https://page.line.me/915hnnlk'); mutation();
  assert.equal(late.href, inquiry.draft('2608-52935', 'en'));
  assert.equal(call.href, 'https://page.line.me/915hnnlk?call=1');
});

function analyticsHarness({ pathname = '/zh/kittens/2608-52935.html', search = '', ga = true, form = false } = {}) {
  const events = [], listeners = {}, formListeners = {};
  const document = {
    readyState: 'complete', referrer: '', documentElement: { lang: 'zh-CN' },
    querySelectorAll() { return []; },
    querySelector(selector) { return form && selector === '#bookingForm' ? { addEventListener(type, fn) { formListeners[type] = fn; } } : null; },
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); }
  };
  const window = { location: { pathname, search, host: 'fuluckpet.com' }, dataLayer: [] };
  if (ga) window.gtag = (...args) => events.push(args);
  vm.runInNewContext(source, { document, window, URL, URLSearchParams, sessionStorage: { getItem() { return null; }, setItem() {} }, setTimeout });
  function click(href, location = 'content') {
    const link = { id: '', getAttribute(name) { return name === 'href' ? href : null; }, closest(selector) { return location === 'mobile' && selector === '.mobile-cta-bar' ? {} : null; } };
    for (const listener of listeners.click || []) listener({ target: { closest(selector) { return selector === 'a' ? link : null; } } });
  }
  return { events, window, click, formListeners };
}

test('detail view and contextual mobile LINE click use one GA transport with no draft or PII', () => {
  const h = analyticsHarness({ search: '?email=secret@example.test&name=Private' });
  assert.equal(h.events.filter(e => e[1] === 'view_item').length, 1);
  h.click(inquiry.draft('2608-52935', 'zh'), 'mobile');
  assert.equal(h.events.filter(e => e[1] === 'line_click').length, 1);
  assert.equal(h.window.dataLayer.length, 0, 'must not also push a second custom event object');
  const click = h.events.find(e => e[1] === 'line_click')[2];
  assert.equal(click.link_location, 'mobile_bar');
  assert.equal(click.kitten_id, '2608-52935');
  assert.equal(click.language, 'zh');
  assert.equal(click.page_path, '/zh/kittens/2608-52935.html');
  assert.doesNotMatch(JSON.stringify(h.events), /secret|Private|您好|oaMessage|cta_href/);
  h.click('https://page.line.me.evil.test/915hnnlk');
  assert.equal(h.events.filter(e => e[1] === 'line_click').length, 1);
  h.click('https://page.line.me/915hnnlk?call=1');
  assert.equal(h.events.filter(e => e[1] === 'line_call_click').length, 1);
});

test('booking interaction starts once, errors are coarse, and only confirmed success is a lead', () => {
  const h = analyticsHarness({ pathname: '/booking.html', search: '?kitten=2608-52935&email=private', form: true });
  h.formListeners.input(); h.formListeners.change();
  h.window.FuluckAnalytics.booking('error', 'validation');
  h.window.FuluckAnalytics.booking('submit');
  h.window.FuluckAnalytics.booking('error', 'secret@example.test');
  assert.equal(h.events.filter(e => e[1] === 'booking_form_start').length, 1);
  assert.equal(h.events.filter(e => e[1] === 'generate_lead').length, 0);
  assert.equal(h.events.findLast(e => e[1] === 'booking_form_error')[2].error_type, 'request');
  h.window.FuluckAnalytics.booking('success'); h.window.FuluckAnalytics.booking('success');
  assert.equal(h.events.filter(e => e[1] === 'generate_lead').length, 1);
  assert.doesNotMatch(JSON.stringify(h.events), /private|secret@example/);
});

test('generic page inquiry stays generic and booking destination ID is safely attributed', () => {
  const h = analyticsHarness({ pathname: '/', ga: false });
  h.click('https://page.line.me/915hnnlk');
  h.click('/booking.html?kitten=2608-52935');
  assert.equal(h.window.dataLayer.length, 2);
  assert.equal(h.window.dataLayer[0].event, 'line_click');
  assert.equal(h.window.dataLayer[0].kitten_id, undefined);
  assert.equal(h.window.dataLayer[1].kitten_id, '2608-52935');
  h.click('https://evil.test/booking.html?kitten=2608-52935');
  assert.equal(h.window.dataLayer.length, 2);
});

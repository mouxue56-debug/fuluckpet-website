/**
 * analytics.js — GA4 ecommerce event helpers for fuluckpet.com
 * GA4 is loaded in each HTML head. Each interaction uses one transport only.
 *
 * Events emitted:
 *   - view_item_list   : kittens.html / parents.html landing
 *   - select_item      : .kitten-card click (delegated)
 *   - view_item        : actual kitten detail view
 *   - hero_cta_click   : homepage hero intent (not a kitten view)
 *   - generate_lead    : server-confirmed successful booking only
 */
(function () {
  'use strict';

  if (typeof window === 'undefined') return;
  window.dataLayer = window.dataLayer || [];

  function context() {
    var pathname = window.location.pathname || '/';
    var detail = pathname.match(/^\/(?:en\/|zh\/)?kittens\/(\d{4}-\d{5})\.html$/);
    var lang = ((document.documentElement || {}).lang || 'ja').slice(0, 2);
    var result = { page_path: pathname, language: /^(ja|en|zh)$/.test(lang) ? lang : 'ja' };
    var id = detail ? detail[1] : new URLSearchParams(window.location.search || '').get('kitten');
    if (/^\d{4}-\d{5}$/.test(id || '')) result.kitten_id = id;
    return result;
  }

  function dl(payload) {
    try {
      var rest = context();
      for (var k in payload) if (k !== 'event' && Object.prototype.hasOwnProperty.call(payload, k)) rest[k] = payload[k];
      if (typeof window.gtag === 'function') window.gtag('event', payload.event, rest);
      else window.dataLayer.push(Object.assign({ event: payload.event }, rest));
    } catch (e) { /* analytics must never interrupt browsing or booking */ }
  }

  var bookingStarted = false;
  var bookingSaved = false;
  function booking(status, reason) {
    if (status === 'start') {
      if (bookingStarted) return;
      bookingStarted = true;
      dl({ event: 'booking_form_start', form_id: 'bookingForm' });
    } else if (status === 'error') {
      dl({ event: 'booking_form_error', form_id: 'bookingForm', error_type: reason === 'validation' ? 'validation' : reason === 'timeout' ? 'timeout' : 'request' });
    } else if (status === 'submit') {
      dl({ event: 'booking_form_submit', form_id: 'bookingForm' });
    } else if (status === 'success' && !bookingSaved) {
      bookingSaved = true;
      dl({ event: 'generate_lead', form_id: 'bookingForm', currency: 'JPY', value: 0 });
    }
  }
  window.FuluckAnalytics = { booking: booking };

  // Attribution capture (booking.html source tracking, Fable site-upgrade 2026-08-23):
  // on first landing this session, snapshot utm_source/utm_medium/utm_campaign/
  // utm_content, the referrer, and this page's own pathname into sessionStorage.
  // Runs once per session (first page wins) so booking.html can read it later —
  // at form-submit time, long after this has already run — to build a short
  // "source" string for the booking payload without re-deriving it from scratch.
  var ATTR_KEY = 'fuluck_attr_v1';
  function captureAttribution() {
    try {
      if (sessionStorage.getItem(ATTR_KEY)) return;
      var qs = new URLSearchParams(window.location.search || '');
      var ref = document.referrer || '';
      var refHost = '', refPath = '', refIsSite = false;
      if (ref) {
        try {
          var refUrl = new URL(ref);
          refHost = refUrl.host;
          refIsSite = (refHost === window.location.host);
          refPath = refIsSite ? refUrl.pathname : '';
        } catch (e) { /* malformed referrer — leave blank */ }
      }
      var attr = {
        utm_source: qs.get('utm_source') || '',
        utm_medium: qs.get('utm_medium') || '',
        utm_campaign: qs.get('utm_campaign') || '',
        utm_content: qs.get('utm_content') || '',
        ref_host: refHost,
        ref_path: refPath,
        ref_is_site: refIsSite,
        landing_path: window.location.pathname || ''
      };
      sessionStorage.setItem(ATTR_KEY, JSON.stringify(attr));
    } catch (e) { /* sessionStorage unavailable (private mode etc.) — skip silently */ }
  }

  function path() {
    var p = (window.location.pathname || '').toLowerCase();
    if (p === '/' || p === '' || p.endsWith('/index.html')) return 'index';
    var match = p.match(/([a-z0-9_-]+)\.html$/);
    return match ? match[1] : 'unknown';
  }

  // -------- view_item_list (kittens / parents) --------
  function kittenCategory(card) {
    var breed = card.getAttribute('data-breed');
    return breed && breed.trim() ? breed.trim() : 'Unknown';
  }

  function buildKittenItems() {
    var cards = document.querySelectorAll('.kitten-card');
    var items = [];
    cards.forEach(function (card, idx) {
      var price = parseInt(card.getAttribute('data-price') || '0', 10) || 0;
      var bid = card.getAttribute('data-breeder-id') || ('kitten-' + idx);
      var name = card.getAttribute('data-name') || (card.querySelector('.kit-name, .kitten-name') || {}).textContent || ('子猫 ' + bid);
      items.push({
        item_id: bid,
        item_name: (name || '').trim() || ('子猫 ' + bid),
        price: price,
        item_category: kittenCategory(card),
        item_list_name: '子猫一覧',
        index: idx + 1
      });
    });
    return items;
  }

  function buildParentItems() {
    var cards = document.querySelectorAll('.parent-card, [data-parent-id]');
    var items = [];
    cards.forEach(function (card, idx) {
      var pid = card.getAttribute('data-parent-id') || card.getAttribute('data-id') || ('parent-' + idx);
      var name = (card.querySelector('.parent-name, .parent-card-name') || {}).textContent || pid;
      items.push({
        item_id: pid,
        item_name: (name || '').trim(),
        item_category: 'Parent',
        item_list_name: '親猫紹介',
        index: idx + 1
      });
    });
    return items;
  }

  function fireListView() {
    var page = path();
    if (page === 'kittens') {
      // Cards are sometimes hydrated by card-loader.js — wait briefly for them.
      var attempts = 0;
      function tryFire() {
        var items = buildKittenItems();
        if (items.length === 0 && attempts < 8) {
          attempts++;
          setTimeout(tryFire, 400);
          return;
        }
        dl({
          event: 'view_item_list',
          item_list_name: '子猫一覧',
          items: items
        });
      }
      tryFire();
    } else if (page === 'parents') {
      var attempts2 = 0;
      function tryFire2() {
        var items = buildParentItems();
        if (items.length === 0 && attempts2 < 8) {
          attempts2++;
          setTimeout(tryFire2, 400);
          return;
        }
        dl({
          event: 'view_item_list',
          item_list_name: '親猫紹介',
          items: items
        });
      }
      tryFire2();
    }
  }

  // -------- select_item (kitten card click) --------
  function bindCardClicks() {
    document.addEventListener('click', function (e) {
      trackInquiryClick(e);
      var card = e.target.closest('.kitten-card');
      if (!card) return;
      var price = parseInt(card.getAttribute('data-price') || '0', 10) || 0;
      var bid = card.getAttribute('data-breeder-id') || '';
      var name = card.getAttribute('data-name') || (card.querySelector('.kit-name, .kitten-name') || {}).textContent || bid || 'kitten';
      dl({
        event: 'select_item',
        item_list_name: '子猫一覧',
        items: [{
          item_id: bid,
          item_name: (name || '').toString().trim(),
          price: price,
          item_category: kittenCategory(card)
        }]
      });
    }, { passive: true });
  }

  // -------- hero_cta_click (distinct from an actual kitten view) --------
  function bindHeroCtas() {
    if (path() !== 'index') return;
    var hero = document.querySelector('.hero, #hero');
    if (!hero) return;
    hero.addEventListener('click', function (e) {
      var a = e.target.closest('a.btn');
      if (!a) return;
      var href = a.getAttribute('href') || '';
      dl({
        event: 'hero_cta_click',
        link_location: 'hero',
        destination: /kittens\.html/.test(href) ? 'kittens' : /booking\.html/.test(href) ? 'booking' : 'other'
      });
    }, { passive: true });
  }

  function trackInquiryClick(e) {
    var a = e.target && e.target.closest ? e.target.closest('a') : null;
    if (!a) return;
    var url;
    try { url = new URL(a.getAttribute('href') || '', 'https://fuluckpet.com' + (window.location.pathname || '/')); }
    catch (_) { return; }
    var event;
    var officialLine = url.protocol === 'https:' && ((url.hostname === 'page.line.me' && /^\/@?915hnnlk\/?$/.test(url.pathname)) ||
      (url.hostname === 'line.me' && /^\/R\/oaMessage\/(?:%40|@)915hnnlk\/?$/i.test(url.pathname)));
    if (officialLine) event = url.searchParams.has('call') ? 'line_call_click' : 'line_click';
    else if (url.origin === 'https://fuluckpet.com' && /^\/(?:en\/|zh\/)?booking\.html$/.test(url.pathname)) event = 'booking_click';
    if (!event) return;
    var location = a.closest('.mobile-cta-bar') ? 'mobile_bar' : a.closest('footer, #footer') ? 'footer' :
      a.closest('.hero, #hero') ? 'hero' : a.closest('header, .nav-panel, #navPanel') ? 'navigation' :
      a.id === 'fixedLine' ? 'floating' : 'content';
    var data = { event: event, link_location: location };
    var id = url.searchParams.get('kitten');
    if (/^\d{4}-\d{5}$/.test(id || '')) data.kitten_id = id;
    // Never send the draft, full target URL, arbitrary labels or form fields.
    dl(data);
  }

  function fireDetailView() {
    var id = (window.location.pathname || '').match(/^\/(?:en\/|zh\/)?kittens\/(\d{4}-\d{5})\.html$/);
    if (id) dl({ event: 'view_item', items: [{ item_id: id[1] }] });
  }

  function bindBookingStart() {
    var form = document.querySelector('#bookingForm');
    if (!form) return;
    form.addEventListener('input', function () { booking('start'); });
    form.addEventListener('change', function () { booking('start'); });
  }

  function init() {
    captureAttribution();
    fireListView();
    fireDetailView();
    bindBookingStart();
    bindCardClicks();
    bindHeroCtas();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

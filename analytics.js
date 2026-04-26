/**
 * analytics.js — GA4 ecommerce event helpers for fuluckpet.com
 * Uses GTM-style dataLayer pushes. GA4 (G-EK459EK55M) is loaded in each HTML head.
 *
 * Events emitted:
 *   - view_item_list   : kittens.html / parents.html landing
 *   - select_item      : .kitten-card click (delegated)
 *   - view_item        : hero CTA click intent on index.html
 *   - generate_lead    : booking form submit (booking.html)
 */
(function () {
  'use strict';

  if (typeof window === 'undefined') return;
  window.dataLayer = window.dataLayer || [];

  function dl(payload) {
    try { window.dataLayer.push(payload); } catch (e) { /* swallow */ }
  }

  function path() {
    var p = (window.location.pathname || '').toLowerCase();
    if (p === '/' || p === '' || p.endsWith('/index.html')) return 'index';
    var match = p.match(/([a-z0-9_-]+)\.html$/);
    return match ? match[1] : 'unknown';
  }

  // -------- view_item_list (kittens / parents) --------
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
        item_category: 'Siberian',
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
          item_category: 'Siberian'
        }]
      });
    }, { passive: true });
  }

  // -------- view_item (hero CTA intent on index) --------
  function bindHeroCtas() {
    if (path() !== 'index') return;
    var hero = document.querySelector('.hero, #hero');
    if (!hero) return;
    hero.addEventListener('click', function (e) {
      var a = e.target.closest('a.btn');
      if (!a) return;
      var label = (a.textContent || '').trim();
      var href = a.getAttribute('href') || '';
      dl({
        event: 'view_item',
        item_list_name: 'hero_cta',
        cta_label: label,
        cta_href: href
      });
    }, { passive: true });
  }

  // -------- generate_lead (booking form submit) --------
  function bindBookingLead() {
    if (path() !== 'booking') return;
    var form = document.getElementById('bookingForm') || document.querySelector('form#booking') || document.querySelector('form[data-booking]');
    if (!form) {
      // Fallback: any form on the booking page
      form = document.querySelector('form');
    }
    if (!form) return;

    var fired = false;
    form.addEventListener('submit', function () {
      if (fired) return;
      fired = true;
      var method = (document.querySelector('input[name="method"]:checked, [data-booking-method]:checked') || {}).value || '';
      dl({
        event: 'generate_lead',
        currency: 'JPY',
        value: 0,
        method: method,
        form_id: form.id || ''
      });
    });
  }

  function init() {
    fireListView();
    bindCardClicks();
    bindHeroCtas();
    bindBookingLead();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

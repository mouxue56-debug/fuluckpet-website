/**
 * mobile-cta.js — Sticky bottom CTA bar (mobile only).
 * Slides out of view when the page footer is visible (handing off to footer CTA).
 * Vanilla, no deps. Loaded with `defer`.
 */
(function () {
  'use strict';

  if (typeof document === 'undefined') return;

  function init() {
    var body = document.body;
    var bar = document.querySelector('.mobile-cta-bar');
    var footer = document.getElementById('footer');
    if (!bar) return;

    // Hide bar when footer enters the viewport (so it doesn't overlap the footer CTA / law notice).
    if (footer && 'IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            body.classList.add('cta-hidden');
          } else {
            body.classList.remove('cta-hidden');
          }
        });
      }, { rootMargin: '0px 0px -40px 0px', threshold: 0.01 });
      io.observe(footer);
    }

    // GA4 click signals (defensive — analytics.js may load after).
    bar.addEventListener('click', function (e) {
      var a = e.target.closest('a');
      if (!a) return;
      var label = a.getAttribute('data-cta') || a.textContent.trim();
      if (window.dataLayer) {
        window.dataLayer.push({
          event: 'mobile_cta_click',
          cta_label: label,
          cta_href: a.getAttribute('href') || ''
        });
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
